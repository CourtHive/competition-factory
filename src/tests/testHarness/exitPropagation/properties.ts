import { emptyProjectionAuditCounts, type ProjectionAudit, type ProjectionAuditCounts } from './projectionAudit';
import { carriedExitStatus } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { BYE } from '@Constants/matchUpStatusConstants';
import { isDoubleExit } from '@Validators/isExit';
import {
  clearOutcome,
  getDrawDefinition,
  getDrawMatchUps,
  hash,
  observeMutation,
  stableHash,
  checkErrorAtomicity,
  decidedMatchUpIds,
  projectionChanges,
  projectRoundTrip,
  ROUND_TRIP_FIELDS,
  type MutationObserver,
  type Observation,
  type PropertyFailure,
} from './transitions';

/**
 * Relational properties — statements about a mutation and its inverse, which no single-state
 * scanner can express.
 *
 * Each is formulated so a legitimate REFUSAL is not a violation. The engine is entitled to
 * decline a clear (PROPAGATED_EXITS_DOWNSTREAM, CANNOT_CHANGE_WINNING_SIDE); what it is not
 * entitled to do is accept one and leave residue behind. Conflating those two would make the
 * properties fire on correct behaviour, and a harness that cries wolf gets muted.
 *
 * A refusal excuses the requested TRANSITION, never a write. Every call a property makes (the forward apply, the
 * second apply, the clear) runs `checkErrorAtomicity`, so a refusal or a throw that wrote is reported from here.
 * Census replay only ran that check on the schedule's own steps, and these returned `[]` on any error: an
 * observation `{ error, mutated: true }` passed all three (assessment 2026-10-17, finding 2).
 */

/**
 * What a property actually EXECUTED, as opposed to what it was asked to check.
 *
 * A property that returns `[]` may have checked its claim, or may have stopped at a refused or no-op forward call
 * and checked nothing. Census replay ran the three on one shared draw, so monotonicity's apply left idempotence and
 * do/undo seeing `mutated: false` and returning: there were no clear operations in census replay at all (assessment
 * 2026-10-17, finding 1). A caller passes an accumulator to tell the two apart.
 */
export type RelationalCoverage = {
  projectionAudit: ProjectionAuditCounts;
  /** forward applies attempted, and those that wrote */
  forward: number;
  forwardMutated: number;
  /** forward applies refused or thrown */
  forwardRefused: number;
  /** second applies (idempotence) and clears (do/undo) that ran */
  secondApply: number;
  clear: number;
  /** clears refused: a legitimate refusal, but the round trip did not complete */
  clearRefused: number;
  /**
   * CODES_CONSISTENT, as a ledger, not a failure: scheduled draws whose stored `matchUpStatusCodes` disagree with what
   * provenance derives, and the matchUps that do. The round trip leaves the legacy array out (census F1, 2026-10-17:
   * `projectRoundTrip`), so this is where a code-output defect stays visible.
   */
  codesInconsistentDraws: number;
  codesInconsistentMatchUps: number;
};

export const emptyCoverage = (): RelationalCoverage => ({
  projectionAudit: emptyProjectionAuditCounts(),
  forward: 0,
  forwardMutated: 0,
  forwardRefused: 0,
  secondApply: 0,
  clear: 0,
  clearRefused: 0,
  codesInconsistentDraws: 0,
  codesInconsistentMatchUps: 0,
});

type RelationalParams = {
  observer?: MutationObserver;
  allowChangePropagation?: boolean;
  projectionAudit?: ProjectionAudit;
  coverage?: RelationalCoverage;
  propagateExitStatus?: boolean;
  matchUpId: string;
  drawId: string;
  outcome: any;
};

function countForward(coverage: RelationalCoverage | undefined, applied: Observation) {
  if (!coverage) return;
  coverage.forward += 1;
  if (applied.mutated) coverage.forwardMutated += 1;
  if (applied.error || applied.thrown !== undefined) coverage.forwardRefused += 1;
}

/**
 * DO_UNDO_IDENTITY — applying an outcome and then clearing it must restore the prior draw.
 *
 * This is the residue detector. A cascade that writes N matchUps forward and unwinds N-1 of them
 * leaves a draw that looks fine to every state-level check and produces "impossible" states hours
 * later in a real tournament. It is also the general form of the partial-mutation class: a write
 * that errors halfway cannot be undone, so the round trip diverges.
 */
/** the `sideExitProvenance` slot of a `projectRoundTrip` matchUp row */
const PROVENANCE = 6;

/**
 * What a round trip must restore: {@link projectRoundTrip} (the projection without the legacy codes array), less the
 * ARRIVAL entries.
 *
 * An arrival entry records a winner's origin and no exit (`{ previousMatchUpStatus, sourceMatchUpId }`); the docs
 * call it a fact a matchUp "may record". Forward play writes it only in some entry orders. It is written by whichever
 * of two events comes second, and some orderings have no writer at all, so a draw reached two ways can differ by an
 * arrival entry and nothing else (A1 triage cases 28, 30 and 31). No decision reads one: measured over 76 + 67
 * single-step continuations and 69 full playouts of those cases with the entry present and absent, no decision
 * differed. Requiring it here reported forward play's own order dependence as an undo residue.
 *
 * An opposed debate (2026-10-17) agreed to keep it out of the round trip until one settle step derives it, and to
 * police the entries that ARE present with {@link checkArrivalsTrue} instead. Exit-bearing entries and BYE claims
 * stay projected in full.
 *
 * A BYE ORIGIN IS TREATED THE SAME WAY (F5, opposed debate 2026-10-18). The `{ BYE, BYE }` pair a produced exit writes
 * opposite itself is written in some entry orders and not others (14-order splits of 1/14 and 11/14). Across 7,358
 * single-step continuations and 99 playouts with and without a true pair, no engine decision and no rendering
 * differed; only a FALSE pair did harm (a WO on an empty seat through `sidesCarryingExit`). So absence is unknown, and
 * falsehood is policed: one that names a BYE matchUp that has delivered nothing, or stands opposite no exit, fails.
 * Promote it back into the round trip once a settle step derives it.
 */
function projectForRoundTrip(drawDefinition: any): any[] {
  // an exit-bearing entry is kept whole; of an arrival only its BYE claims, if any
  const roundTripEntry = (entry: any) => {
    // a BYE origin (`{ BYE, BYE }`) is arrival-class too: "may record", policed by checkArrivalsTrue (F5)
    if (entry?.matchUpStatus && !isByeOrigin(entry)) return entry;
    return entry?.byeClaims?.length ? { byeClaims: entry.byeClaims } : undefined;
  };
  return projectRoundTrip(drawDefinition).map((structure: any) => ({
    ...structure,
    matchUps: structure.matchUps.map((row: any[]) => {
      const provenance = row[PROVENANCE];
      if (!provenance) return row;
      const kept = Object.fromEntries(
        Object.entries(provenance)
          .map(([side, entry]) => [side, roundTripEntry(entry)])
          .filter(([, entry]) => entry),
      );
      const next = [...row];
      next[PROVENANCE] = Object.keys(kept).length ? kept : null;
      return next;
    }),
  }));
}

/**
 * ARRIVAL_TRUE — an arrival entry that is present tells the truth.
 *
 * The companion of {@link projectForRoundTrip}: absence of an arrival entry is allowed (the docs: "treat a missing side
 * as unknown"), falsehood is not. An entry with no `matchUpStatus` and a `sourceMatchUpId` must name a matchUp that
 * exists, is decided, sends its winner here, and whose status is the `previousMatchUpStatus` recorded (a same-winner
 * re-score rewrites it: `refreshArrivalsFrom`); a participant on that side must be the source's winner.
 */
export function checkArrivalsTrue(drawId: string): PropertyFailure[] {
  const matchUps = getDrawMatchUps(drawId);
  const byId = new Map(matchUps.map((matchUp: any) => [matchUp.matchUpId, matchUp]));
  const failures: PropertyFailure[] = [];
  for (const matchUp of matchUps) {
    for (const [side, entry] of Object.entries(matchUp.sideExitProvenance ?? {}) as [string, any][]) {
      if (isByeOrigin(entry)) {
        const failure = byeOriginFalse(matchUp, Number(side), entry, byId);
        if (failure) failures.push({ property: 'ARRIVAL_TRUE', matchUpId: matchUp.matchUpId, detail: failure });
        continue;
      }
      if (!entry?.sourceMatchUpId || entry.matchUpStatus) continue;
      const source: any = byId.get(entry.sourceMatchUpId);
      const occupant = matchUp.sides?.find((s: any) => s?.sideNumber === Number(side))?.participantId;
      const winner = source?.sides?.find((s: any) => s?.sideNumber === source?.winningSide)?.participantId;
      const reason =
        (!source && 'names no matchUp in the draw') ||
        (!source.winningSide && `names ${source.matchUpStatus} ${coordinate(source)}, which is undecided`) ||
        (source.winnerMatchUpId !== matchUp.matchUpId && `names ${coordinate(source)}, whose winner goes elsewhere`) ||
        (entry.previousMatchUpStatus !== source.matchUpStatus &&
          `says ${entry.previousMatchUpStatus} where ${coordinate(source)} is ${source.matchUpStatus}`) ||
        (occupant && winner && occupant !== winner && `side ${side} holds someone other than its winner`);
      if (reason)
        failures.push({
          property: 'ARRIVAL_TRUE',
          matchUpId: matchUp.matchUpId,
          detail: `${coordinate(matchUp)} side ${side}: an arrival entry ${reason}`,
        });
    }
  }
  return failures;
}

/** a BYE's own origin, `{ matchUpStatus: BYE, previousMatchUpStatus: BYE }`: the pair a produced exit writes opposite itself */
const isByeOrigin = (entry: any) => entry?.matchUpStatus === BYE && entry?.previousMatchUpStatus === BYE;

/**
 * A BYE origin that is present tells the truth (census F5, 2026-10-18): it names a BYE matchUp in the draw whose winner comes
 * here, the side's position (if it holds one) is that matchUp's, and the exit it was written opposite still stands.
 */
function byeOriginFalse(matchUp: any, side: number, entry: any, byId: Map<string, any>): string | undefined {
  const source: any = entry.sourceMatchUpId && byId.get(entry.sourceMatchUpId);
  const held = matchUp.sides?.find((s: any) => s?.sideNumber === side);
  const opposite = matchUp.sideExitProvenance?.[3 - side];
  const reason =
    (!source && 'names no matchUp in the draw') ||
    (source.winnerMatchUpId !== matchUp.matchUpId && `names ${coordinate(source)}, whose winner goes elsewhere`) ||
    (source.matchUpStatus !== BYE && `names ${coordinate(source)}, which is ${source.matchUpStatus}`) ||
    // a BYE matchUp with a seat nobody holds has delivered nothing (`deliveredStatus`, F3)
    ([1, 2].some((n) => {
      const seat = source.sides?.find((s: any) => s?.sideNumber === n);
      return !seat?.participantId && !seat?.bye;
    }) &&
      `names ${coordinate(source)}, which has delivered nothing`) ||
    (held?.drawPosition &&
      !(source.drawPositions ?? []).includes(held.drawPosition) &&
      `side ${side} holds dp${held.drawPosition}, which ${coordinate(source)} did not send`) ||
    (!carriedExitStatus(opposite) && 'stands opposite no exit');
  return reason ? `${coordinate(matchUp)} side ${side}: a BYE origin ${reason}` : undefined;
}

const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

export function checkDoUndoIdentity(params: RelationalParams): PropertyFailure[] {
  const {
    propagateExitStatus,
    matchUpId,
    drawId,
    outcome,
    coverage,
    projectionAudit,
    observer,
    allowChangePropagation,
  } = params;
  const beforeProjection = projectForRoundTrip(getDrawDefinition(drawId));
  const before = stableHash(beforeProjection);

  const applied = observeMutation({
    propagateExitStatus,
    projectionAudit,
    observer,
    allowChangePropagation,
    matchUpId,
    drawId,
    outcome,
  });
  countForward(coverage, applied);
  // a refused forward call leaves nothing to undo, but it must not have written
  if (applied.error || applied.thrown !== undefined) return checkErrorAtomicity(applied, matchUpId);
  if (!applied.mutated) return [];

  const cleared = observeMutation({
    propagateExitStatus,
    projectionAudit,
    observer,
    allowChangePropagation,
    matchUpId,
    drawId,
    outcome: clearOutcome,
  });
  if (coverage) coverage.clear += 1;
  // a refused clear is legitimate: the engine may decline to unwind a propagated exit. A refused clear that WROTE
  // is not.
  if (cleared.error || cleared.thrown !== undefined) {
    if (coverage) coverage.clearRefused += 1;
    return checkErrorAtomicity(cleared, matchUpId);
  }

  const afterProjection = projectForRoundTrip(getDrawDefinition(drawId));
  const after = stableHash(afterProjection);
  // what the round trip may leave out it must not leave false: a released position's arrival entry naming an
  // origin the clear made undecided is a residue (A1 triage case 25)
  if (after === before) return checkArrivalsTrue(drawId);

  const coordinates = new Map(
    getDrawMatchUps(drawId).map((matchUp: any) => [
      matchUp.matchUpId,
      `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`,
    ]),
  );
  return [
    {
      property: 'DO_UNDO_IDENTITY',
      matchUpId,
      detail: `clear succeeded but the draw did not return to its prior state\n  ${firstDifference(before, after)}`,
      changes: projectionChanges(beforeProjection, afterProjection, coordinates, ROUND_TRIP_FIELDS),
    },
  ];
}

/**
 * IDEMPOTENT_REAPPLY — applying the identical outcome twice must not write twice.
 *
 * A non-idempotent mutation means a client that retries on failure corrupts progressively, which
 * is exactly what the DOUBLE_ELIMINATION defect does today.
 */
export function checkIdempotence(params: RelationalParams): PropertyFailure[] {
  const {
    propagateExitStatus,
    matchUpId,
    drawId,
    outcome,
    coverage,
    projectionAudit,
    observer,
    allowChangePropagation,
  } = params;
  const first = observeMutation({
    propagateExitStatus,
    projectionAudit,
    observer,
    allowChangePropagation,
    matchUpId,
    drawId,
    outcome,
  });
  countForward(coverage, first);
  if (first.error || first.thrown !== undefined) return checkErrorAtomicity(first, matchUpId);
  if (!first.mutated) return [];

  const second = observeMutation({
    propagateExitStatus,
    projectionAudit,
    observer,
    allowChangePropagation,
    matchUpId,
    drawId,
    outcome,
    priorHash: first.after,
  });
  if (coverage) coverage.secondApply += 1;
  // a second apply may be refused (nothing to do), but it must not throw
  if (second.error || second.thrown !== undefined) return checkErrorAtomicity(second, matchUpId);
  if (!second.mutated) return [];

  return [
    {
      property: 'IDEMPOTENT_REAPPLY',
      matchUpId,
      detail: `re-applying ${JSON.stringify(outcome)} mutated the draw a second time${
        second.error ? ` and returned ${JSON.stringify(second.error)}` : ''
      }`,
    },
  ];
}

/**
 * A PROVISIONAL decision — one that exists only because of what happened upstream.
 *
 * CA, 2026-09-21: *propagated, holding nobody, awarded to nobody.* It holds a propagation record and nothing of its
 * own. Its entire claim to being "decided" is that an exit was carried into it.
 *
 * "Awarded to nobody" is read as written, not as "no `winningSide`" (CA, 2026-10-12). A produced walkover is awarded
 * to the side without the exit even while that side is still EMPTY (exit-propagation RULE 2), so it carries a
 * `winningSide` and nobody to receive it; relayed past a BYE, the SAME waiting walkover is written pending, with no
 * `winningSide`. Both mean "a produced exit waiting for an arrival", and both are provisional. An award to a side
 * that holds a participant is a resolved result a TD can see, and is not.
 */
export function isProvisionalDecision(matchUp: any): boolean {
  if (!matchUp) return false;
  const sides = matchUp.sides ?? [];
  const propagated = !!matchUp.sideExitProvenance || !!matchUp.matchUpStatusCodes?.length;
  const holdsParticipant = sides.some((side: any) => side?.participantId);
  const awardedToSomebody =
    !!matchUp.winningSide && !!sides.find((side: any) => side?.sideNumber === matchUp.winningSide)?.participantId;
  return propagated && !awardedToSomebody && !holdsParticipant;
}

/**
 * MONOTONIC_DECISION — scoring a fresh matchUp must not un-decide a REAL one.
 *
 * Advancing a participant may legitimately CHANGE a downstream status (a propagated exit
 * resolving onto whoever falls through), so the property is about the decided SET shrinking, not
 * about statuses being immutable.
 *
 * ## A provisional decision may vanish — CA, 2026-09-21
 *
 * *"It is entirely acceptable to see a propagated default vanish if it is provisional and it is
 * valid to change the source matchUp outcome."*
 *
 * Both halves of that are load-bearing, and both are enforced:
 *
 * 1. **provisional** — {@link isProvisionalDecision}: propagated, holding nobody, awarded to nobody. "Awarded to
 *    nobody" includes an award to a side that holds nobody (CA, 2026-10-12): RULE 2's produced walkover awarded to an
 *    empty seat is the same waiting exit as one written pending, so both may vanish.
 * 2. **valid to change the source** — a source change that is NOT valid is now refused outright by
 *    `isActiveDownstream` -> `CANNOT_CHANGE_OUTCOME`, and this function returns early on
 *    `applied.error`. So an invalid change never reaches the comparison at all.
 *
 * Measured on COMPASS 8/7 `nonRandom: 20220267`: a Double Default at `East R1P2` decides
 * `West R2P1` — status `DEFAULTED`, **zero participants, no winningSide, empty score**, terminal
 * (no `winnerMatchUpId`), in a structure holding no real result anywhere. A Double Walkover at
 * `East R1P3` then reverts it. Nothing observable was lost, and the property reported a defect.
 *
 * **Its effect is MODEST — about 10-15%, not most.** `MONOTONIC_DECISION` is the biggest single
 * category (382 of the 833 findings the 2026-09-21 matched-window comparison reported for `dev`),
 * and when this landed I wrote that the reclassification was therefore "large". Measured, it is
 * not: 7 -> 6 on a 600-seed slice, and 265 -> 242 across 22,417 seeds of the post-fix census. The
 * property was counting SOME placeholders, not mostly placeholders.
 *
 * The residue was the point, and it has since been identified and fixed. What survived the
 * reclassification was a decision that was REAL — a matchUp holding a participant or a winner —
 * being un-decided, and that was Signal 1: a pending propagated exit erased when a drawPosition
 * arrived, because `drawPositionPlacement` recognised a carried exit by a `winningSide` that
 * Migration §20 had just stopped writing. Fixed 2026-09-21; see Migration §23 and
 * `arrivalResolvesPendingExit.test.ts`.
 *
 * A census run from before that fix will still show the class. Counts taken across it are not
 * comparable with counts taken after, which is the same caveat the 6.38.0 baseline carries.
 */
export function checkMonotonicity(params: RelationalParams): PropertyFailure[] {
  const {
    propagateExitStatus,
    matchUpId,
    drawId,
    outcome,
    coverage,
    projectionAudit,
    observer,
    allowChangePropagation,
  } = params;
  const beforeMatchUps = getDrawMatchUps(drawId);
  const before = decidedMatchUpIds(beforeMatchUps);
  const applied = observeMutation({
    propagateExitStatus,
    projectionAudit,
    observer,
    allowChangePropagation,
    matchUpId,
    drawId,
    outcome,
  });
  countForward(coverage, applied);
  if (applied.error || applied.thrown !== undefined) return checkErrorAtomicity(applied, matchUpId);

  const after = decidedMatchUpIds(applied.matchUps);
  const undecided = [...before].filter((id) => !after.has(id));
  if (!undecided.length) return [];

  /**
   * Provisional in BOTH states, or it is a defect.
   *
   * BEFORE alone is not enough, and getting this wrong would have silenced a class we already fixed.
   * `byeAdvancesIntoPendingDoubleExit.test.ts` pins census 9000223: a pending consolation WALKOVER —
   * provenance, no winningSide, nobody there, so provisional by the BEFORE test — was cleared to
   * `TO_BE_PLAYED` when a participant ARRIVED through a BYE, instead of resolving onto them.
   *
   * That is not the case CA ruled on. CA's licence is for *"a propagated default [vanishing] if it
   * is provisional **and it is valid to change the source matchUp outcome**"* — a SOURCE CHANGE
   * withdrawing something nobody can see. An ARRIVAL is the opposite: somebody has turned up, the
   * placeholder's opponent now exists, and clearing it destroys the exit that was waiting for them.
   *
   * The two are told apart by the AFTER state. A source change leaves the matchUp holding nobody —
   * still a placeholder, free to go. An arrival leaves a participant sitting in a matchUp that reads
   * `TO_BE_PLAYED`, which is the defect.
   *
   * The AFTER test is deliberately NARROWER than {@link isProvisionalDecision} — it asks only
   * whether anyone arrived, not whether provenance survived. A clean unwind withdraws the record
   * along with the status, so requiring provenance afterwards would report every correct unwind.
   */
  const priorState = new Map(beforeMatchUps.map((matchUp: any) => [matchUp.matchUpId, matchUp]));
  const laterState = new Map(applied.matchUps.map((matchUp: any) => [matchUp.matchUpId, matchUp]));
  const nobodyArrived = (matchUp: any) =>
    !matchUp?.winningSide && !(matchUp?.sides ?? []).some((side: any) => side?.participantId);

  /**
   * ...or its producer stopped producing it. A pending exit a DOUBLE exit produced is withdrawn when that source is
   * re-scored as anything else, and the same re-score can send its new winner on into the seat: that is the source
   * change CA's licence covers, not an arrival clearing an exit still owed. Census w1 policy-off 9000249 (OLYMPIC 32):
   * `West|1|3`'s convergence produced a WALKOVER, pending, into `West|2|2`; re-scoring `East|1|6` as a played win
   * dissolved the convergence, its loser won `West|1|3` on the carried walkover and came through to `West|2|2`, which
   * read TO_BE_PLAYED against the pending `West|1|4` — the draw the same results entered directly reach. Where the
   * producer still stands (census 9000223), the arrival takes the exit, and clearing it is still reported.
   */
  const producerDissolved = (matchUp: any) => {
    const produced = Object.values(matchUp?.sideExitProvenance ?? {}).filter(
      (entry: any) => entry?.sourceMatchUpId && isDoubleExit(entry.previousMatchUpStatus),
    );
    return (
      produced.length > 0 &&
      produced.every((entry: any) => !isDoubleExit(laterState.get(entry.sourceMatchUpId)?.matchUpStatus))
    );
  };

  const real = undecided.filter((id) => {
    const prior = priorState.get(id);
    return !(isProvisionalDecision(prior) && (nobodyArrived(laterState.get(id)) || producerDissolved(prior)));
  });
  if (!real.length) return [];

  const provisional = undecided.length - real.length;
  return [
    {
      property: 'MONOTONIC_DECISION',
      matchUpId,
      detail:
        `scoring this matchUp un-decided ${real.length}: ${real.map((id) => id.slice(0, 8)).join(', ')}` +
        (provisional ? ` (${provisional} further provisional, allowed)` : ''),
    },
  ];
}

/** Locate the first divergence between two serializations, for a readable failure message. */
function firstDifference(before: string, after: string): string {
  let index = 0;
  while (index < before.length && index < after.length && before[index] === after[index]) index++;
  const window = 90;
  const start = Math.max(0, index - window / 2);
  return `at offset ${index}\n  before: …${before.slice(start, start + window)}…\n  after:  …${after.slice(start, start + window)}…`;
}

export { hash };
