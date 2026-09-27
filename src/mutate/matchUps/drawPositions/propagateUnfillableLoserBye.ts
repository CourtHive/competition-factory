import {
  carriedExitStatus,
  getSideExitProvenance,
  recordByeClaim,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { assignDrawPositionBye } from './assignDrawPositionBye';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { isExit } from '@Validators/isExit';

// constants and types
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { MatchUpsMap, ResultType } from '@Types/factoryTypes';

/**
 * P39 — THE LOSER OF A PRODUCED EXIT IS NOBODY, SO THE FIRST-ROUND SEAT IT FEEDS IS A BYE.
 *
 * A produced exit has just resolved: one side holds a participant and won, the other carries the exit.
 * That provenance is the engine's own record that **nobody will ever arrive** on the losing side — so
 * this matchUp will never produce a loser, and the seat its loser link feeds can never be filled.
 *
 * Measured on CA's COMPASS 16/14, one `DOUBLE_WALKOVER` at `East|1|2`, played out: `West|2|1` ends
 * `WALKOVER ws=2` with `drawPositions [2, 3]` where **dp2 is EMPTY** — not a BYE and not a participant,
 * because the double walkover meant nobody was ever placed there — and its loser target
 * `Southwest|1|1` dp1 received nothing, stranding a real participant opposite it forever.
 *
 * ## Why the two existing paths miss it
 *
 *  - `propagateConsolationBye` is gated on `linkCondition === FIRST_MATCHUP`. Per CA 2026-09-26 that
 *    constant names a link TRAVERSAL — a participant crosses only if their first matchUp in the source
 *    structure did not happen — and that traversal never occurs in COMPASS. Nothing is missing from the
 *    draw definition; the gate asks an unrelated question.
 *  - the BYE cascade in `advanceDrawPosition` handles this exact shape when the losing drawPosition IS
 *    a BYE (`North|1|1` gets `byeFromPropagation: true` that way in the same draw). Measured: that
 *    function is never called for `West|2|1` — all ten of its calls in that draw advance a BYE.
 *
 * ## DEAD versus PENDING, which is the entire difficulty
 *
 * "One side empty" also describes a matchUp still waiting for an ordinary arrival, and treating those
 * as dead is what makes the `doubleExitPropagateBye` policy unshippable (**P30**, measured twice at
 * 34 -> 48 failing census seeds). The discriminator here is the side's own **provenance**, never its
 * emptiness and never its status: `carriedExitStatus` is written only when an exit was carried INTO
 * that side, i.e. when its feeder resolved and delivered nothing. A side still awaiting an arrival has
 * no provenance at all.
 *
 * Deliberately NOT read from `drawPositions` by index — `draw-positions.md` rule 2 and punch-list
 * **P24** and **P37**: those idioms answer confidently with the wrong side when a position is absent.
 * Provenance is keyed by `sideNumber`.
 *
 * ## IT MUST BE CALLED FROM EVERY PATH THAT RESOLVES A PRODUCED EXIT
 *
 * This lives in its own module for that reason, and the reason is measured rather than anticipated.
 * Hooked on the arrival path alone, `sideBlindExitCarry`'s order-independence test went red — entering
 * the exit LAST resolves it through `carryExitOnward`'s settled-opponent branch instead, so the BYE
 * landed in one entry order and not the other, and `correctionDivergence` reported the same asymmetry
 * between its direct and corrected paths. A propagation that depends on which order a director typed
 * two results in is worse than none.
 *
 * Call sites, and both are required:
 *
 *  - `drawPositionPlacement.applyPositionToMatchUp` — a participant arrives and resolves the exit
 *  - `doubleExitAdvancement.carryExitOnward` — the exit arrives and the opponent is already in place
 *
 * ## Narrow on purpose
 *
 * Round 1 of a CONNECTED structure only, which is the shape CA named — *"feeding a first round
 * drawPosition in a connected structure"* — and the same shape the working BYE cascade handles. A fed
 * position in a later round goes through `assignFedDrawPositionBye` and is left alone; widening to it
 * is a separate measurement, not a free generalisation.
 *
 * ## THERE IS NO WITHDRAWAL, and that is measured rather than assumed
 *
 * `propagateConsolationBye`'s docblock records the defect that follows a reservation nobody revisits —
 * *"Correct when placed — and never revisited."* So a withdrawal was written, and then found to be
 * unreachable. Measured on CA's COMPASS 16/14 by playing N steps and then attempting to clear the
 * originating `DOUBLE_WALKOVER`:
 *
 *   steps  1..8    BYE not yet placed    clear PERMITTED
 *   steps  10      BYE not yet placed    clear REFUSED  ERR_INCOMPATIBLE_MATCHUP_STATUS
 *   steps  12+     BYE placed            clear REFUSED
 *
 * **The refusal arrives BEFORE the placement.** By the time this seat is resolved to a BYE, the exit
 * that caused it can no longer be corrected, so there is no state in which a stale reservation exists —
 * the same conclusion `propagateConsolationBye` reaches for itself: *"Once a consolation result exists
 * the correction is REFUSED outright ... so there is no stale reservation left to withdraw."*
 *
 * A withdrawal function was therefore DELETED rather than shipped, because dead code that looks
 * load-bearing is worse than none. `consolationByeWithdrawalUnreachable` in
 * `unfillableLoserTargetBye.test.ts` pins the ordering, so if that refusal ever loosens the test fires
 * and tells the next reader that a withdrawal has become necessary.
 *
 * The claim IS still recorded: `removeDoubleExit`'s `byeClaimSurvives` consults the ledger whenever it
 * visits a loser target, so the record makes this cascade's work visible to machinery that already
 * exists, whether or not anything withdraws it today.
 */
export function propagateUnfillableLoserBye({
  tournamentRecord,
  drawDefinition,
  matchUpsMap,
  matchUpId,
  event,
}: {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  matchUpId?: string;
  event?: Event;
}): ResultType | undefined {
  if (!matchUpId || !drawDefinition || !matchUpsMap) return undefined;

  /**
   * THE CHEAP GUARDS FIRST, on the stored matchUp, because this runs on the arrival path — which is
   * every drawPosition placement in every draw. Nothing below derives the draw until the shape is
   * known to be a resolved produced exit with exactly one exited side.
   */
  const matchUp: any = matchUpsMap.drawMatchUps?.find((candidate: any) => candidate.matchUpId === matchUpId);
  if (!matchUp?.winningSide || !isExit(matchUp.matchUpStatus)) return undefined;

  const provenance = getSideExitProvenance({ matchUp }) ?? {};
  const exitingSides = ([1, 2] as const).filter((sideNumber) => carriedExitStatus(provenance[sideNumber]));

  /**
   * EXACTLY ONE side may carry an exit. Two is a convergence — nobody wins it and `progressExitStatus`
   * RULE 4 owns that state — and zero means a referee recorded this exit directly, where the loser is
   * a real person who did not appear and the loser link should carry them.
   */
  if (exitingSides.length !== 1) return undefined;
  // and the exited side must be the side that LOST, or this matchUp's loser is a real participant
  if (matchUp.winningSide === exitingSides[0]) return undefined;

  const inContextDrawMatchUps = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap })?.matchUps ?? [];
  const inContextMatchUp: any = inContextDrawMatchUps.find((candidate: any) => candidate.matchUpId === matchUpId);
  const {
    targetMatchUps: { loserMatchUp, loserTargetDrawPosition },
  } = positionTargets({ inContextDrawMatchUps, drawDefinition, matchUpId });

  if (!loserMatchUp || !loserTargetDrawPosition) return undefined;
  // round 1 of a CONNECTED structure — the shape named above
  if (loserMatchUp.roundNumber !== 1) return undefined;
  if (loserMatchUp.structureId === inContextMatchUp?.structureId) return undefined;

  // the target seat must still be empty; anything already there is not this cascade's to overwrite
  const { positionAssignments } = getPositionAssignments({ drawDefinition, structureId: loserMatchUp.structureId });
  const targetAssignment = positionAssignments?.find(
    (assignment: any) => assignment.drawPosition === loserTargetDrawPosition,
  );
  if (targetAssignment?.participantId || targetAssignment?.bye) return undefined;

  const result = assignDrawPositionBye({
    structureId: loserMatchUp.structureId,
    drawPosition: loserTargetDrawPosition,
    byeFromPropagation: true,
    tournamentRecord,
    drawDefinition,
    matchUpsMap,
    event,
  });
  if (result?.error) return result;

  /**
   * The claim is recorded on the TARGET, keyed by the side the BYE occupies, so `removeDoubleExit`'s
   * `byeClaimSurvives` can decide whether the BYE still has a reason to exist when an exit is undone.
   *
   * The side is read off the target's own derived sides rather than by indexing its `drawPositions` —
   * the same P24 hazard this function avoids everywhere else.
   */
  const refreshed = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap })?.matchUps ?? [];
  const inContextTarget: any = refreshed.find((candidate: any) => candidate.matchUpId === loserMatchUp.matchUpId);
  const claimSideNumber = (inContextTarget?.sides ?? []).find(
    (side: any) => side?.drawPosition === loserTargetDrawPosition,
  )?.sideNumber;

  if (claimSideNumber === 1 || claimSideNumber === 2) {
    const rawLoserMatchUp: any = matchUpsMap.drawMatchUps?.find(
      (candidate: any) => candidate.matchUpId === loserMatchUp.matchUpId,
    );
    recordByeClaim({ claimantMatchUpId: matchUpId, sideNumber: claimSideNumber, matchUp: rawLoserMatchUp });
  }

  return undefined;
}
