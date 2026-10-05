import { clearOutcome, getDrawDefinition, getDrawMatchUps } from './transitions';
import { projectFields, FIELD_NAMES } from './fieldProjections';

import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { DEAD_RUBBER } from '@Constants/matchUpStatusConstants';

/**
 * The two routes by which a decided matchUp's winner can be changed, and a structural comparison
 * of what each leaves behind.
 *
 *   ROUTE A  `allowChangePropagation: true` — `resolveAndApplyOutcome` short-circuits to
 *            `swapWinnerLoser`, which hand-edits `drawPositions` and `positionAssignments`.
 *   ROUTE B  the director's workflow — clear everything entered after the target, apply the change
 *            WITHOUT the flag (so `removeDirectedParticipants` -> `directParticipants` ->
 *            `directLoser` runs), then re-enter exactly what was cleared.
 *
 * Both end holding the same set of (coordinate -> outcome) facts, so any structural difference is
 * a progression the hand-rolled route re-derived differently. **Route B is the reference**: it is
 * what every consumer that does not send the flag already gets today.
 *
 * ## Route B is a REFERENCE, not a ground truth — do not read agreement as correctness
 *
 * Route B is what the engine does today along the director's path. That makes it the right thing to
 * measure a second implementation AGAINST; it does not make it right. Measured on
 * DOUBLE_ELIMINATION, Route B's own resulting draws are flagged by `getDrawInconsistencies` eight
 * times, before and after a change, unchanged — so on that draw type a route can converge on Route B
 * and inherit defects in doing so.
 *
 * Read a divergence count as "how far this implementation is from the established path", and check
 * the integrity scan on BOTH arms before reading convergence as improvement. A change that lowers
 * divergence while raising Route A's flagged count has moved toward a reference that was itself
 * wrong there. (Measured by the parallel `swapWinnerLoser` workstream, 2026-09-14.)
 *
 * Note also that "Route B" and "the flag-OFF path" are not synonyms: `progressExitStatus.ts`
 * hardcodes `allowChangePropagation: true` on the cascade's internal `setMatchUpState` call, so the
 * swap branch is reachable even when no consumer sends the flag.
 *
 * ## Why a comparison rather than a scanner
 *
 * `getDrawInconsistencies` rates some of these divergences CLEAN — a BYE recorded as having won
 * 6-1 6-1 is invisible to it — so no single-state oracle can see them all. Comparing two draws
 * catches what a scanner structurally cannot.
 *
 * ## Normalisation, and the trap it exists for
 *
 * `matchUpId` and `structureId` are fresh UUIDs on every generation, so NOTHING may be keyed on
 * them: hashing a raw draw reports every comparison as differing, which is UUID churn rather than
 * signal. Coordinates (`structureName|roundNumber|roundPosition`) survive regeneration;
 * `participantId` is stable within one generated tournament and is therefore the value compared.
 */

export type Coord = { structureName: string; roundNumber: number; roundPosition: number };

export const coordKey = (coord: Coord): string => `${coord.structureName}|${coord.roundNumber}|${coord.roundPosition}`;

const isCoord = (matchUp: any, coord: Coord): boolean =>
  matchUp.structureName === coord.structureName &&
  matchUp.roundNumber === coord.roundNumber &&
  matchUp.roundPosition === coord.roundPosition;

/**
 * Structural projection of a draw, keyed by coordinates that survive regeneration.
 *
 * Projects BOTH halves of what `swapWinnerLoser` hand-edits: the matchUps (who plays whom, and what
 * the result was) and the `positionAssignments` (who holds which back-draw place). Gap 1 surfaces
 * in the assignments; Gap 3 surfaces only in the matchUps, so a projection covering one of the two
 * would silently under-report.
 *
 * And, since G14 (2026-10-05), every field `fieldProjections` covers — entries, seedAssignments,
 * extensions and lineUp — under `F:<field>:<key>`, so a route that leaves an entry, a seed or an
 * extension behind diverges like any other.
 */
export function projectByCoordinate(drawId: string): Record<string, any> {
  const projection: Record<string, any> = {};

  for (const matchUp of getDrawMatchUps(drawId)) {
    const participantIds = (matchUp.sides ?? [])
      .slice()
      .sort((a: any, b: any) => (a.sideNumber ?? 0) - (b.sideNumber ?? 0))
      .map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : null));
    projection[`M:${coordKey(matchUp)}`] = {
      matchUpStatus: matchUp.matchUpStatus ?? null,
      winningSide: matchUp.winningSide ?? null,
      score: matchUp.score?.scoreStringSide1 || null,
      participantIds,
    };
  }

  const walk = (structures: any[]) => {
    for (const structure of structures ?? []) {
      for (const assignment of structure.positionAssignments ?? []) {
        projection[`A:${structure.structureName}|${assignment.drawPosition}`] = {
          participantId: assignment.participantId ?? null,
          bye: !!assignment.bye,
        };
      }
      if (structure.structures?.length) walk(structure.structures);
    }
  };
  walk(getDrawDefinition(drawId)?.structures ?? []);

  const fields = projectFields(drawId);
  for (const field of FIELD_NAMES)
    for (const [key, value] of Object.entries(fields[field])) projection[`F:${field}:${key}`] = value;

  return projection;
}

export function diffProjections(routeA: Record<string, any>, routeB: Record<string, any>): string[] {
  const keys = new Set([...Object.keys(routeA), ...Object.keys(routeB)]);
  const differences: string[] = [];
  for (const key of keys) {
    const a = JSON.stringify(routeA[key] ?? null);
    const b = JSON.stringify(routeB[key] ?? null);
    if (a !== b) differences.push(`${key} A=${a} B=${b}`);
  }
  return differences.sort((x, y) => x.localeCompare(y));
}

/**
 * Regenerate from the same seed — the only way to reset, since ids are never reusable.
 *
 * `participantsCount` is deliberately a parameter rather than defaulting to `drawSize`. A FULL
 * draw contains no BYEs, and without BYEs neither Gap 2 (a `FIRST_MATCHUP` link withholding a
 * placement, so `directLoser` puts a BYE there instead) nor Gap 3 (an assignment BYEd without
 * reconciling the matchUps standing on it) can arise at all. An instrument run only at
 * `participantsCount === drawSize` therefore reports ZERO for both and reads as though they were
 * fixed. Run a reduced count alongside the full one, or the "what is left" number is fiction.
 */
export function generateDraw(
  drawType: string,
  drawId: string,
  drawSize: number,
  seed: number,
  participantsCount: number = drawSize,
): void {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount, drawSize, drawType, drawId }],
    nonRandom: seed,
    setState: true,
  });
}

export const applyOutcome = (matchUpId: string, drawId: string, outcome: any, allowChangePropagation?: boolean): any =>
  tournamentEngine.setMatchUpStatus({
    ...(allowChangePropagation ? { allowChangePropagation: true } : {}),
    matchUpId,
    drawId,
    outcome,
  });

export const findByCoord = (drawId: string, coord: Coord): any =>
  getDrawMatchUps(drawId).find((matchUp: any) => isCoord(matchUp, coord));

/**
 * Play the draw to completion, returning the order results were entered in.
 *
 * Deterministic: candidates are taken in (roundNumber, roundPosition, structureName) order and
 * side 1 always wins. Nothing is ordered by a generated id — doing so silently randomises the
 * schedule and invalidates every comparison built on it.
 */
export function playForward(drawId: string): Coord[] {
  const order: Coord[] = [];
  let guard = 0;

  while (guard++ < 500) {
    const playable = getDrawMatchUps(drawId)
      .filter(
        (matchUp: any) =>
          !matchUp.winningSide &&
          // a decider that is not needed holds two participants and is not waiting to be played
          matchUp.matchUpStatus !== DEAD_RUBBER &&
          (matchUp.sides ?? []).filter((side: any) => side?.participantId).length === 2 &&
          matchUp.roundPosition,
      )
      .sort(
        (a: any, b: any) =>
          (a.roundNumber ?? 0) - (b.roundNumber ?? 0) ||
          (a.roundPosition ?? 0) - (b.roundPosition ?? 0) ||
          String(a.structureName).localeCompare(String(b.structureName)),
      );
    if (!playable.length) break;

    const target = playable[0];
    if (applyOutcome(target.matchUpId, drawId, { winningSide: 1 })?.error) break;
    order.push({
      structureName: String(target.structureName),
      roundNumber: target.roundNumber,
      roundPosition: target.roundPosition,
    });
  }
  return order;
}

type ResultByPerson = { winnerId?: string; loserId?: string; winningSide?: number };

function resultByPerson(drawId: string, coordinate: Coord): ResultByPerson {
  const matchUp = findByCoord(drawId, coordinate);
  const idOn = (sideNumber?: number) =>
    (matchUp?.sides ?? []).find((side: any) => side?.sideNumber === sideNumber)?.participantId;
  const winningSide = matchUp?.winningSide;
  return { winnerId: idOn(winningSide), loserId: winningSide ? idOn(3 - winningSide) : undefined, winningSide };
}

/**
 * Which side wins when a later result is RE-ENTERED after the flip.
 *
 * **The re-entry replays a PERSON, not a side number.** It entered `winningSide: 1` for every later
 * matchUp, which is what `playForward` entered the first time — but a flip changes who advances, the
 * successor carries a different drawPosition, and `drawPositions` are stored ascending, so the
 * successor can land on the OTHER side of the matchUp they advance into. "Side 1 wins" then names the
 * person who originally LOST.
 *
 * Measured 2026-09-29, the five divergences the differential had reported since 2026-09-17, all of
 * them this and nothing else:
 *
 * ```text
 * CURTIS_CONSOLATION/16, flip `Consolation 1|2|3`, downstream `Consolation 1|3|2`
 *   before        dp=[3,4]  ws=1   dp3 beat dp4
 *   Route A       dp=[4,9]  ws=2   dp9, who succeeds dp3, inherits the win       <- the swap contract
 *   Route B       dp=[4,9]  ws=1   dp4, who LOST the match, is entered as winner <- this harness
 * ```
 *
 * Two control flips in the same structure (`|2|2`, `|2|4`) leave the successor on the same side, and
 * there the routes already agreed.
 *
 * ## The rule is the SWAP ITSELF, applied to every later result
 *
 * A winner change is a RELABEL (`swapWinnerLoserContract`): the two participants of the flipped
 * matchUp exchange everything that followed from it. So whoever originally won a later matchUp is
 * replaced, as its winner, by their counterpart under that exchange — and everybody else is their
 * own counterpart.
 *
 * "The original winner still wins if they are still here" was this function's first form and it is
 * WRONG wherever the two flipped participants meet each other downstream. DOUBLE_ELIMINATION is
 * where that happens — the Main final, the Backdraw final and the Decider can all be the same pair.
 *
 * Only when neither the winner's counterpart nor the loser's is present is there nobody to follow,
 * and the original side number is all that is left to go on.
 */
function replayedWinningSide(
  matchUp: any,
  original: ResultByPerson | undefined,
  exchanged: [string | undefined, string | undefined],
): number {
  const counterpart = (participantId?: string) => {
    if (participantId && participantId === exchanged[0]) return exchanged[1];
    if (participantId && participantId === exchanged[1]) return exchanged[0];
    return participantId;
  };
  const sideOf = (participantId?: string) =>
    participantId
      ? (matchUp.sides ?? []).find((side: any) => side?.participantId === participantId)?.sideNumber
      : undefined;

  const winnerSide = sideOf(counterpart(original?.winnerId));
  if (winnerSide) return winnerSide;
  const loserSide = sideOf(counterpart(original?.loserId));
  if (loserSide) return 3 - loserSide;
  return original?.winningSide ?? 1;
}

export type FlipComparison = {
  /** null when the flip is not comparable — see `skipped` for which side declined it. */
  differences: string[] | null;
  skipped?: string;
};

/**
 * Run one flip both ways from a fully played draw and return the structural differences.
 *
 * `playOrder` must come from `playForward` on a draw generated with the same arguments; the target
 * is named by its index in that order so that "everything entered after it" is well defined.
 */
export function compareRoutes({
  participantsCount,
  playOrder,
  drawType,
  drawSize,
  drawId,
  index,
  plant,
  seed,
}: {
  participantsCount?: number;
  /** FALSIFICATION ONLY: a write applied to one route just before it is projected */
  plant?: { route: 'A' | 'B'; apply: (drawId: string) => void };
  playOrder: Coord[];
  drawType: string;
  drawSize: number;
  drawId: string;
  index: number;
  seed: number;
}): FlipComparison {
  const coord = playOrder[index];
  const reset = () => {
    generateDraw(drawType, drawId, drawSize, seed, participantsCount ?? drawSize);
    playForward(drawId);
  };

  // ---- ROUTE A: flip in place, with the flag ----
  reset();
  const targetA = findByCoord(drawId, coord);
  if (!targetA?.winningSide) return { differences: null, skipped: 'A:no-winningSide' };
  const flipped = targetA.winningSide === 1 ? 2 : 1;
  if (applyOutcome(targetA.matchUpId, drawId, { winningSide: flipped }, true)?.error)
    return { differences: null, skipped: 'A:refused' };
  if (plant?.route === 'A') plant.apply(drawId);
  const projectionA = projectByCoordinate(drawId);

  // ---- ROUTE B: clear everything entered after the target, flip, re-enter ----
  reset();
  const later = playOrder.slice(index + 1);
  // WHO won and lost each later matchUp, captured before anything is cleared — the re-entry below
  // replays PEOPLE, and a side number stops naming the same person once the flip has re-sorted them.
  const originalResults = new Map(
    later.map((coordinate) => [coordKey(coordinate), resultByPerson(drawId, coordinate)]),
  );
  const flippedResult = resultByPerson(drawId, coord);
  const flipped0: any = findByCoord(drawId, coord);
  const deciderId =
    flipped0?.winnerMatchUpId && flipped0.winnerMatchUpId === flipped0.loserMatchUpId
      ? flipped0.winnerMatchUpId
      : undefined;
  const exchanged: [string | undefined, string | undefined] = [flippedResult.winnerId, flippedResult.loserId];
  // Cleared in REVERSE entry order: clearing a result the engine still considers to have an active
  // downstream is refused, so the unwind has to come back out the way it went in.
  for (const coordinate of later.slice().reverse()) {
    const matchUp = findByCoord(drawId, coordinate);
    if (!matchUp) continue;
    if (applyOutcome(matchUp.matchUpId, drawId, clearOutcome)?.error)
      return { differences: null, skipped: 'B:clear-refused' };
  }

  const targetB = findByCoord(drawId, coord);
  if (!targetB) return { differences: null, skipped: 'B:target-gone' };
  if (applyOutcome(targetB.matchUpId, drawId, { winningSide: flipped })?.error)
    return { differences: null, skipped: 'B:refused' };

  for (const coordinate of later) {
    const matchUp = findByCoord(drawId, coordinate);
    // A coordinate that no longer names a playable matchUp is legitimately unplayable after the
    // flip — the flip changed who progresses there. Skipping it is correct, not a shortfall.
    if (!matchUp) continue;
    // A DECIDER'S RESULT DOES NOT SURVIVE ITS FINAL BEING CHANGED — CA, 2026-09-29: *"it should be
    // destroyed."* Re-entering it here would replay a match the ruling says was never owed, and
    // report the engine's obedience as a divergence. Whether it is now to be played or a dead rubber
    // is `reconcileDecider`'s to say, on both routes.
    if (matchUp.matchUpId === deciderId) continue;
    const winningSide = replayedWinningSide(matchUp, originalResults.get(coordKey(coordinate)), exchanged);
    applyOutcome(matchUp.matchUpId, drawId, { winningSide });
  }

  if (plant?.route === 'B') plant.apply(drawId);
  return { differences: diffProjections(projectionA, projectByCoordinate(drawId)) };
}
