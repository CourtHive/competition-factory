import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

/**
 * The Route A vs Route B differential — the oracle for the `swapWinnerLoser` workstream.
 *
 * Changing the winner of an already-decided matchUp has two implementations:
 *
 *   ROUTE A  `allowChangePropagation: true` — `resolveAndApplyOutcome` short-circuits to
 *            `swapWinnerLoser` BEFORE the `activeDownstream` dispatch, so no refusal applies.
 *   ROUTE B  the director's legitimate sequence — clear every downstream result, apply the change
 *            with no flag (which now passes, downstream being inert), then re-enter what was
 *            cleared. This runs `removeDirectedParticipants` -> `directParticipants` ->
 *            `directLoser`/`directWinner`, i.e. the normal machinery.
 *
 * Both routes are asked to reach the SAME state, so any disagreement is a defect in one of them.
 *
 * Ids cannot be compared: `matchUpId` is a fresh UUID per generated tournament. Comparison is by
 * `structureName|roundNumber|roundPosition`, and `participantId` is stable WITHIN one generated
 * tournament — so each flip generates its two arms from the same seed and compares them to each
 * other, never across seeds.
 */

export type Coordinate = string;

export type Step = {
  coordinate: Coordinate;
  outcome: any;
};

export const coordinates = (item: any): Coordinate => `${item.structureName}|${item.roundNumber}|${item.roundPosition}`;

/** TO_BE_PLAYED with no winningSide and no score — what a director enters to clear a result. */
export const CLEAR_OUTCOME = {
  score: { scoreStringSide1: '', scoreStringSide2: '' },
  matchUpStatus: TO_BE_PLAYED,
  winningSide: undefined,
};

export type ScenarioProfile = {
  participantsCount?: number;
  drawType: string;
  drawSize: number;
  seed: number;
};

/** Generate one draw and return its drawId. `setState: true` REPLACES the tournament record. */
export function buildDraw(profile: ScenarioProfile, drawId: string): string {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        ...(profile.participantsCount ? { participantsCount: profile.participantsCount } : {}),
        drawType: profile.drawType,
        drawSize: profile.drawSize,
        drawId,
      },
    ],
    nonRandom: profile.seed,
    setState: true,
  });
  setSubscriptions({});
  return drawId;
}

function matchUpAt(drawId: string, coordinate: Coordinate): any {
  const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId })?.matchUps ?? [];
  return matchUps.find((matchUp: any) => coordinates(matchUp) === coordinate);
}

/**
 * Apply one outcome. Returns `{ applied, code }` — `applied` is false when the coordinate matched
 * no matchUp, which would otherwise make every downstream assertion vacuous (a step whose
 * coordinates match nothing is silently skipped).
 */
export function apply(
  drawId: string,
  step: Step,
  allowChangePropagation?: boolean,
): { applied: boolean; code?: string } {
  const target = matchUpAt(drawId, step.coordinate);
  if (!target) return { applied: false };
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: target.matchUpId,
    outcome: step.outcome,
    drawId,
    ...(allowChangePropagation ? { allowChangePropagation: true } : {}),
  });
  return { applied: true, code: result?.error?.code };
}

/**
 * Play every matchUp of the draw in dependency order, side 1 winning each time, and return the
 * ordered schedule that produced it. Round order is the dependency order: a matchUp cannot be
 * played before the round that feeds it.
 *
 * Re-reads the matchUp list after every step rather than planning up front, because feeding
 * structures only acquire their participants as earlier rounds decide.
 */
export function playFully(drawId: string, maxSteps = 400): Step[] {
  const schedule: Step[] = [];
  for (let guard = 0; guard < maxSteps; guard++) {
    const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId })?.matchUps ?? [];
    const next = matchUps
      .filter(
        (matchUp: any) =>
          !matchUp.winningSide &&
          matchUp.roundPosition &&
          !matchUp.matchUpStatus?.includes('BYE') &&
          (matchUp.sides ?? []).every((side: any) => side.participantId || side.bye) &&
          (matchUp.sides ?? []).some((side: any) => side.participantId),
      )
      .toSorted((a: any, b: any) => (a.roundNumber ?? 0) - (b.roundNumber ?? 0));
    const target = next[0];
    if (!target) break;
    const step: Step = { coordinate: coordinates(target), outcome: { winningSide: 1 } };
    const { applied, code } = apply(drawId, step);
    if (!applied || code) break;
    schedule.push(step);
  }
  return schedule;
}

/** Every decided, flippable matchUp in the played draw, as coordinates. */
export function flippableCoordinates(drawId: string): Coordinate[] {
  const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId })?.matchUps ?? [];
  return matchUps
    .filter((matchUp: any) => matchUp.winningSide && matchUp.roundPosition)
    .map(coordinates)
    .toSorted((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

/**
 * A structural fingerprint of the whole draw — every matchUp and every positionAssignment, keyed by
 * coordinates rather than ids.
 *
 * `matchUpId` and `drawId` are excluded (fresh UUIDs), and so is
 * `sideExitProvenance.sourceMatchUpId`, which is a raw UUID and made a negative control diverge on
 * 18 of 20 seeds when left in.
 */
export function fingerprint(drawId: string): Record<string, string> {
  const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId })?.matchUps ?? [];
  const snapshot: Record<string, string> = {};

  for (const matchUp of matchUps as any[]) {
    const sides = (matchUp.sides ?? [])
      .map(
        (side: any) =>
          `#${side.sideNumber}{${side.bye ? 'BYE' : (side.participantId ?? '-')}@${side.drawPosition ?? '-'}}`,
      )
      .join(' ');
    // `sideExitProvenance` is `Record<sideNumber, entry>`, NOT an array. `sourceMatchUpId` is a raw
    // UUID and is deliberately excluded — left in, it made a negative control diverge on 18 of 20
    // seeds on nothing but id churn.
    const provenance = Object.entries(matchUp.sideExitProvenance ?? {})
      .toSorted(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
      .map(
        ([sideNumber, entry]: [string, any]) =>
          `${sideNumber}:${entry?.matchUpStatus ?? '-'}<${entry?.previousMatchUpStatus ?? '-'}`,
      )
      .join(',');
    snapshot[`M ${coordinates(matchUp)}`] = [
      `status=${matchUp.matchUpStatus ?? '-'}`,
      `ws=${matchUp.winningSide ?? '-'}`,
      `score=${matchUp.score?.scoreStringSide1 ?? ''}`,
      `dp=${(matchUp.drawPositions ?? []).join('/')}`,
      `sides=${sides}`,
      `prov=${provenance}`,
    ].join(' ');
  }

  const drawDefinition: any = tournamentEngine.getEvent({ drawId })?.drawDefinition;
  for (const structure of drawDefinition?.structures ?? []) {
    for (const assignment of structure.positionAssignments ?? []) {
      snapshot[`A ${structure.structureName}|${assignment.drawPosition}`] = [
        `participant=${assignment.participantId ?? '-'}`,
        `bye=${assignment.bye ? 'Y' : 'N'}`,
        `qualifier=${assignment.qualifier ? 'Y' : 'N'}`,
      ].join(' ');
    }
  }

  return snapshot;
}

export function diffFingerprints(
  a: Record<string, string>,
  b: Record<string, string>,
): { key: string; routeA: string; routeB: string }[] {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].toSorted((x, y) => x.localeCompare(y, 'en'));
  return keys
    .filter((key) => a[key] !== b[key])
    .map((key) => ({ key, routeA: a[key] ?? '(absent)', routeB: b[key] ?? '(absent)' }));
}

export type FlipResult = {
  coordinate: Coordinate;
  routeACode?: string;
  routeBCode?: string;
  /** Route B could not be constructed — the clear/re-enter sequence did not complete. */
  routeBIncomplete?: boolean;
  differences: { key: string; routeA: string; routeB: string }[];
  /**
   * Every difference is confined to `sideExitProvenance`, with both routes agreeing on every
   * participant, status, score and drawPosition.
   *
   * These are ROUTE B RESIDUE, not Route A defects: clearing a COMPLETED result and re-entering it
   * leaves `{matchUpStatus: COMPLETED, previousMatchUpStatus: COMPLETED}` behind on BYE matchUps in
   * the consolation — a provenance record of a non-exit, which the field does not mean. Route A
   * never clears anything, so it never acquires it. Counted separately so the oracle measures the
   * hand-rolled path rather than an artifact of how the director's sequence is simulated.
   */
  provenanceOnly: boolean;
  routeAInconsistencies: number;
  routeBInconsistencies: number;
};

function inconsistencyCount(drawId: string): number {
  return (tournamentEngine.getDrawInconsistencies({ drawId })?.inconsistencies ?? []).length;
}

/**
 * Flip one matchUp two ways and compare.
 *
 * Route B's "clear the downstream result" is scoped as the SUFFIX of the schedule after the flipped
 * step. That is a superset of the true downstream set — clearing and re-entering a matchUp that
 * does not depend on the flip restores it identically — and it needs no guess about which matchUps
 * the flip can reach.
 */
export function flipBothWays(profile: ScenarioProfile, schedule: Step[], coordinate: Coordinate): FlipResult {
  const flipIndex = schedule.findIndex((step) => step.coordinate === coordinate);

  // ---- Route A -------------------------------------------------------------------------------
  const aId = 'route-a';
  buildDraw(profile, aId);
  for (const step of schedule) apply(aId, step);
  const beforeFlip = matchUpAtWinningSide(aId, coordinate);
  const flipped: Step = { coordinate, outcome: { winningSide: beforeFlip === 1 ? 2 : 1 } };
  const routeA = apply(aId, flipped, true);
  const aPrint = fingerprint(aId);
  const aInconsistencies = inconsistencyCount(aId);

  // ---- Route B -------------------------------------------------------------------------------
  const bId = 'route-b';
  buildDraw(profile, bId);
  for (const step of schedule) apply(bId, step);

  const suffix = flipIndex >= 0 ? schedule.slice(flipIndex + 1) : [];
  // clear in reverse dependency order — a result cannot be cleared while its own downstream stands
  let routeBIncomplete = false;
  for (const step of [...suffix].reverse()) {
    const { applied } = apply(bId, { coordinate: step.coordinate, outcome: CLEAR_OUTCOME });
    if (!applied) routeBIncomplete = true;
  }
  const routeB = apply(bId, flipped);
  // re-enter what was cleared, in the original order
  for (const step of suffix) apply(bId, step);
  const bPrint = fingerprint(bId);
  const bInconsistencies = inconsistencyCount(bId);

  const differences = diffFingerprints(aPrint, bPrint);

  return {
    coordinate,
    routeACode: routeA.code,
    routeBCode: routeB.code,
    ...(routeBIncomplete ? { routeBIncomplete } : {}),
    differences,
    provenanceOnly: differences.length > 0 && differences.every(isProvenanceOnly),
    routeAInconsistencies: aInconsistencies,
    routeBInconsistencies: bInconsistencies,
  };
}

function matchUpAtWinningSide(drawId: string, coordinate: Coordinate): number | undefined {
  return matchUpAt(drawId, coordinate)?.winningSide;
}

/** The two fingerprints differ only in the `prov=` segment — everything else is byte-identical. */
function isProvenanceOnly(difference: { routeA: string; routeB: string }): boolean {
  const withoutProvenance = (value: string) => value.replace(/ prov=\S*$/, '');
  return withoutProvenance(difference.routeA) === withoutProvenance(difference.routeB);
}
