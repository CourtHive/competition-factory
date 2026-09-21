import { clearOutcome, getDrawDefinition, getDrawMatchUps, hash, observeMutation, stableHash } from './transitions';
import { decidedMatchUpIds, projectDraw } from './transitions';
import type { PropertyFailure } from './transitions';

/**
 * Relational properties — statements about a mutation and its inverse, which no single-state
 * scanner can express.
 *
 * Each is formulated so a legitimate REFUSAL is not a violation. The engine is entitled to
 * decline a clear (PROPAGATED_EXITS_DOWNSTREAM, CANNOT_CHANGE_WINNING_SIDE); what it is not
 * entitled to do is accept one and leave residue behind. Conflating those two would make the
 * properties fire on correct behaviour, and a harness that cries wolf gets muted.
 */

/**
 * DO_UNDO_IDENTITY — applying an outcome and then clearing it must restore the prior draw.
 *
 * This is the residue detector. A cascade that writes N matchUps forward and unwinds N-1 of them
 * leaves a draw that looks fine to every state-level check and produces "impossible" states hours
 * later in a real tournament. It is also the general form of the partial-mutation class: a write
 * that errors halfway cannot be undone, so the round trip diverges.
 */
export function checkDoUndoIdentity({ propagateExitStatus, matchUpId, drawId, outcome }): PropertyFailure[] {
  const before = stableHash(projectDraw(getDrawDefinition(drawId)));

  const applied = observeMutation({ propagateExitStatus, matchUpId, drawId, outcome });
  // the forward mutation being refused is not this property's business — checkErrorAtomicity
  // already covers refusals, and there is nothing to undo.
  if (applied.error || applied.thrown || !applied.mutated) return [];

  const cleared = observeMutation({ propagateExitStatus, matchUpId, drawId, outcome: clearOutcome });
  if (cleared.thrown) {
    return [{ property: 'DO_UNDO_IDENTITY', matchUpId, detail: `clear threw: ${cleared.thrown}` }];
  }
  // a refused clear is legitimate: the engine may decline to unwind a propagated exit.
  if (cleared.error) return [];

  const after = stableHash(projectDraw(getDrawDefinition(drawId)));
  if (after === before) return [];

  return [
    {
      property: 'DO_UNDO_IDENTITY',
      matchUpId,
      detail: `clear succeeded but the draw did not return to its prior state\n  ${firstDifference(before, after)}`,
    },
  ];
}

/**
 * IDEMPOTENT_REAPPLY — applying the identical outcome twice must not write twice.
 *
 * A non-idempotent mutation means a client that retries on failure corrupts progressively, which
 * is exactly what the DOUBLE_ELIMINATION defect does today.
 */
export function checkIdempotence({ propagateExitStatus, matchUpId, drawId, outcome }): PropertyFailure[] {
  const first = observeMutation({ propagateExitStatus, matchUpId, drawId, outcome });
  if (first.error || first.thrown || !first.mutated) return [];

  const second = observeMutation({ propagateExitStatus, matchUpId, drawId, outcome, priorHash: first.after });
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
 * It holds a propagation record and nothing of its own: **no participant on any side, and no
 * `winningSide`**. Its entire claim to being "decided" is that an exit was carried into it.
 *
 * The moment either of those is false it stops being provisional. A propagated exit whose opponent
 * has arrived carries a `winningSide` awarded to a real participant — that is a resolved result, not
 * a placeholder, and un-deciding it destroys something a TD can see.
 */
function isProvisionalDecision(matchUp: any): boolean {
  if (!matchUp) return false;
  const propagated = !!matchUp.sideExitProvenance || !!matchUp.matchUpStatusCodes?.length;
  const holdsParticipant = (matchUp.sides ?? []).some((side: any) => side?.participantId);
  return propagated && !matchUp.winningSide && !holdsParticipant;
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
 * 1. **provisional** — {@link isProvisionalDecision}: propagated, holding nobody, awarded to nobody.
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
export function checkMonotonicity({ propagateExitStatus, matchUpId, drawId, outcome }): PropertyFailure[] {
  const beforeMatchUps = getDrawMatchUps(drawId);
  const before = decidedMatchUpIds(beforeMatchUps);
  const applied = observeMutation({ propagateExitStatus, matchUpId, drawId, outcome });
  if (applied.error || applied.thrown) return [];

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

  const real = undecided.filter(
    (id) => !(isProvisionalDecision(priorState.get(id)) && nobodyArrived(laterState.get(id))),
  );
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
