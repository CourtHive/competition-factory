import {
  reconcileFedLoserEligibility,
  fedLoserPlacementRefusal,
} from '@Mutate/matchUps/drawPositions/reconcileFedLoserEligibility';
import { normalizeDrawPositions } from '@Mutate/matchUps/drawPositions/normalizeDrawPositions';
import { getDownstreamStructureIds } from '@Query/matchUps/getDownstreamStructureIds';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { modifyMatchUpScore } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { pushGlobalLog } from '@Functions/global/globalLog';

/**
 * Swap the winner and loser of an already-decided matchUp, carrying the change downstream.
 *
 * ## THE CONTRACT. Exactly two things change, and it is critical not to conflate them
 *
 * | where | what changes | what NEVER changes |
 * |---|---|---|
 * | the SOURCE structure | the matchUp `drawPositions` of LATER ROUNDS — a different drawPosition now advances | **`positionAssignments` — never, not one** |
 * | the TARGET structures it feeds | `positionAssignments` — the occupant's IDENTITY | the drawPositions themselves |
 *
 * **A participant's binding to a drawPosition in the structure they PLAYED IN is exactly what a
 * winner change does not touch.** They keep their place in that draw; what changes is which of them
 * progresses out of it. Measured on COMPASS 16 flipping `East|1|4`: source `positionAssignments`
 * changed on **0** of 16 positions, while exactly one matchUp's `drawPositions` changed,
 * `East|2|2: [5,7] -> [5,8]`. Pinned by `swapWinnerLoserContract.test.ts`, which fails if either half
 * is violated.
 *
 * The two are easy to conflate because both are "drawPositions" in loose speech, and conflating them
 * has already cost a defect: rewriting the advancement record with a positional `map` broke the
 * ascending-order invariant that BINDS drawPositions to sides, turning [4,5] into [7,5]
 * (`DRAW_POSITIONS_NOT_SORTED`, 25 findings, fixed in #4881(factory)). Hence the sort below.
 *
 * ## NOTHING IS PLACED AND NOTHING IS REMOVED
 *
 * A swap is a RELABEL. The position and its binding already exist, so there is no placement decision
 * to make — `directLoser` and the rest of the placement machinery answer "where does this participant
 * go", which is not a question a swap asks, and their guards (`DRAW_POSITION_ACTIVE`,
 * `EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT`) are not constraints on it. Equally, no participant
 * is removed: every removal primitive in the engine destroys the downstream RESULT
 * (`removeSubsequentRoundsParticipant` is explicit — *"Removal, not substitution"*), and a swap
 * preserves results by definition.
 *
 * Exactly one thing can contradict a relabel, and it is link-defined: `FIRST_MATCHUP` makes entry
 * conditional on the ARRIVING participant, so a flip can change who is ELIGIBLE rather than merely
 * who lost. That is a property of the link, not of the swap, and is reconciled after the result is
 * applied — see `reconcileFedLoserEligibility`.
 *
 * ## Who reaches this
 *
 * `resolveAndApplyOutcome` checks `allowChangePropagation` BEFORE the `activeDownstream` dispatch, so
 * none of the refusals guarding an ordinary re-score apply. Two callers arrive: a consumer sending
 * the flag, and the propagation cascade, which reaches it because `progressExitStatus` hardcodes
 * `allowChangePropagation: true` on its internal call. **"Flag-OFF" and "this branch is unreachable"
 * are therefore NOT the same claim** — a change here is a change to the cascade either way.
 */
export function swapWinnerLoser(params) {
  const { tournamentRecord, inContextMatchUp, structure, drawDefinition, matchUp, event } = params;
  const matchUpRoundNumber = inContextMatchUp.roundNumber;

  const existingWinnerSide = inContextMatchUp.sides.find((side) => side.sideNumber === inContextMatchUp.winningSide);
  const existingLoserSide = inContextMatchUp.sides.find((side) => side.sideNumber !== inContextMatchUp.winningSide);

  const { drawPosition: existingWinnerDrawPosition, participantId: existingWinnerParticipantId } = existingWinnerSide;
  const { drawPosition: existingLoserDrawPosition, participantId: existingLoserParticipantId } = existingLoserSide;

  const stack = 'swapWinnerLoser';

  /**
   * Asked BEFORE anything is written, and it is the only thing that can refuse a swap.
   *
   * A relabel is always possible — the positions and their bindings already exist. A PLACEMENT is
   * not: the one case where a flip has to create an assignment rather than exchange two is a
   * `FIRST_MATCHUP` link that withheld the previous loser, and the BYE standing in for them may
   * already have played on. The engine refuses to clear an active drawPosition, so that placement
   * cannot be made — and discovering it afterwards means returning an error over a draw this
   * function has already rewritten.
   *
   * Refusing here leaves the draw untouched, which is what a refusal is supposed to mean.
   */
  const placementRefusal = fedLoserPlacementRefusal({
    loserTargetLink: params.targetData?.targetLinks?.loserTargetLink,
    loserMatchUp: params.targetData?.targetMatchUps?.loserMatchUp,
    prospectiveLoserDrawPosition: existingWinnerDrawPosition,
    departingLoserDrawPosition: existingLoserDrawPosition,
    flippedRoundNumber: matchUpRoundNumber,
    drawDefinition,
    structure,
    event,
  });
  if (placementRefusal?.error) return placementRefusal;

  const { matchUps } = getAllStructureMatchUps(params);
  /**
   * The later-round matchUps holding EITHER participant's position — not only the old winner's.
   *
   * Inside a structure only the winner's position can appear after the flipped round: the loser went
   * out. DOUBLE_ELIMINATION breaks that, because its structures form a cycle — Main feeds the
   * Backdraw, and `Backdraw r4 --WINNER--> Main r4` feeds back. The old loser can come BACK into
   * Main as the Backdraw champion, holding their own Main position in the Main final. The flip makes
   * the old winner the one in the Backdraw, so that re-entry is theirs now, and the Main final must
   * hold THEIR position.
   *
   * Replacing only winner -> loser left the re-entry naming the old loser (census seed 9100555, flag
   * ON: Main final `[1,3]` should have become `[1,4]`), and where the Main final held BOTH — one by
   * advancement, one by re-entry — it produced `[3,3]`. The substitution is therefore an EXCHANGE,
   * done in one pass so that neither half reads the other's output. Outside a cycle the loser's
   * position never appears here and the exchange is exactly the old replacement.
   */
  const existingWinnerSubsequentMatchUps = matchUps.filter(
    ({ drawPositions, roundNumber }) =>
      roundNumber > matchUpRoundNumber &&
      (drawPositions?.includes(existingWinnerDrawPosition) ||
        (existingLoserDrawPosition && drawPositions?.includes(existingLoserDrawPosition))),
  );

  pushGlobalLog({ method: 'swapWinnerLoser', existingWinnerSubsequentMatchUps });

  /**
   * Replace the advancing drawPosition in every subsequent matchUp — AND RE-SORT.
   *
   * A positional `map` SUBSTITUTES in place and therefore cannot preserve ascending order: this line
   * rewrote a round-3 matchUp holding [4, 5] to [7, 5] (census seed 9000012, DOUBLE_ELIMINATION
   * 8/7), reported as DRAW_POSITIONS_NOT_SORTED — 25 findings across two 600-seed windows, all from
   * here. The ascending order is the side/position binding, and readers resolve the WRONG
   * participant without it.
   *
   * The rule, the three reader idioms that depend on it, and the survey of every other writer are
   * stated once in `getOrderedDrawPositions`. Do not remove the sort below.
   */
  existingWinnerSubsequentMatchUps.forEach((matchUp) => {
    // The substitution can put a HOLE in: the flipped loser has no drawPosition when their side was
    // an empty fed slot, so `[4, 7]` becomes `[undefined, 7]` — correct, and positional. What it
    // must not leave is an array of nothing but holes; `[7]` becoming `[undefined]` carries no
    // information. Measured on census seed 9100016 (FEED_IN_CHAMPIONSHIP_TO_SF, flag ON), which is
    // the only all-holes writer the two REMOVAL sites do not account for.
    matchUp.drawPositions = normalizeDrawPositions(
      (
        matchUp.drawPositions?.map((drawPosition) => {
          if (drawPosition === existingWinnerDrawPosition) return existingLoserDrawPosition;
          if (existingLoserDrawPosition && drawPosition === existingLoserDrawPosition)
            return existingWinnerDrawPosition;
          return drawPosition;
        }) ?? []
      ).sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : 0)),
    );
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      eventId: params.event?.eventId,
      context: stack,
      drawDefinition,
      matchUp,
      event,
    });
  });

  /**
   * The structures this result actually feeds, found by WALKING the links rather than inferring
   * them from stage/`stageSequence`.
   *
   * The inference this replaces was wrong in both directions. It UNDER-reached, because a structure
   * fed by a different ROUND of the same source sits at the same `stageSequence` and was never
   * visited — COMPASS `East` feeds `West` (r1), `North` (r2) and `Northeast` (r3), all at sequence
   * 2, and only the flipped round's own target was corrected. Widening it to "every structure this
   * structure feeds" then made it OVER-reach: DOUBLE_ELIMINATION's `Backdraw` is fed by `Main`
   * rounds 1-3, so flipping the FINAL reached back into a structure the flip does not touch, which
   * needed two further bounds to suppress.
   *
   * A walk needs neither bound. It only goes forward, so an earlier round's target is unreachable
   * rather than excluded; and it reaches what this matchUp feeds at any round distance. The source
   * structure is excluded because a chain re-enters it immediately — the winner target is the next
   * round — and in DOUBLE_ELIMINATION it re-enters after a detour (`Backdraw r4 --WINNER--> Main
   * r4`); the two participants keep their assignments THERE, since a drawPosition's binding to a
   * participant in the structure they played in is exactly what does not change.
   */
  const { structureIds: subsequentStructureIds } = getDownstreamStructureIds({
    inContextDrawMatchUps: params.inContextDrawMatchUps ?? [],
    excludeStructureId: structure.structureId,
    matchUpId: inContextMatchUp.matchUpId,
    drawDefinition,
  });

  const subsequentStructures = drawDefinition.structures.filter(({ structureId }) =>
    subsequentStructureIds.includes(structureId),
  );

  /**
   * A pure RELABEL. Nothing is placed and nothing is removed.
   *
   * The two participants keep their drawPositions in the structure they played in — a
   * drawPosition's binding to a participant THERE is exactly what a flip does not change — and in
   * every structure downstream the occupant's identity changes. There is no placement decision to
   * make, because the position and its binding already exist; `directLoser` and the rest of the
   * placement machinery decide WHERE a participant goes, which is not a question a swap asks.
   *
   * The one thing that can contradict a relabel is link-defined and is reconciled after the result
   * is applied — see `reconcileFedLoserEligibility`.
   */
  subsequentStructures.forEach((subsequentStructure) => {
    const { positionAssignments } = getPositionAssignments({ structure: subsequentStructure });
    // Both lookups are guarded on the id being present. When a side holds no participant — which
    // is the normal state after a double exit — the id is undefined, and an unguarded
    // `participantId === undefined` matches the first UNOCCUPIED assignment instead of matching
    // nothing. Measured: a COMPASS back-draw BYE placed by a double-walkover cascade was selected
    // that way and had a participant written onto it, leaving an assignment that was both
    // `bye: true` and assigned — a combination the two flags are meant to exclude.
    const existingWinnerAssignment = existingWinnerParticipantId
      ? positionAssignments?.find(({ participantId }) => participantId === existingWinnerParticipantId)
      : undefined;
    const existingLoserAssignment = existingLoserParticipantId
      ? positionAssignments?.find(({ participantId }) => participantId === existingLoserParticipantId)
      : undefined;

    // A relabel EXCHANGES two identities, so it needs two. When one side holds no participant —
    // the normal state after a double exit — there is nothing to exchange, and writing the missing
    // id would empty an occupied slot rather than swap it. The FINDs were already guarded on the id
    // being present; the WRITES were not, so a missing loser id was written into the winner's
    // assignment, leaving an exit matchUp with a winningSide and nobody on the losing side
    // (EXIT_WITHOUT_LOSER, census seed 9100424).
    // Each write is guarded on the id it WRITES, not merely on the id it looked up. Skipping the
    // whole structure when either is missing is too blunt — it drops a valid half-relabel and leaves
    // a loser absent from a structure that should hold them (DROPPED_PROGRESSION, census seed
    // 9100075).
    if (existingWinnerAssignment && existingLoserParticipantId) {
      existingWinnerAssignment.participantId = existingLoserParticipantId;
    }
    if (existingLoserAssignment && existingWinnerParticipantId) {
      existingLoserAssignment.participantId = existingWinnerParticipantId;
    }
  });

  // apply new winningSide and any score updates
  const scoreResult: any = modifyMatchUpScore({ ...params, context: stack });
  if (scoreResult?.error) return scoreResult;

  /**
   * Reconciled AFTER the result is applied, deliberately.
   *
   * The check is "is the participant now occupying the fed position eligible to be there?", which
   * is a question about STATE. Asking it before the new `winningSide` was written forced the old
   * in-swap version to count wins over PRIOR ROUNDS ONLY, so as not to count the very win being
   * taken away; once the result is applied, the shared predicate over the whole structure is simply
   * correct.
   */
  const reconciliation: any = reconcileFedLoserEligibility({
    loserMatchUpDrawPositionIndex: params.targetData?.targetMatchUps?.loserMatchUpDrawPositionIndex,
    loserTargetLink: params.targetData?.targetLinks?.loserTargetLink,
    loserMatchUp: params.targetData?.targetMatchUps?.loserMatchUp,
    propagateRetirementAsExit: params.propagateRetirementAsExit,
    sourceMatchUpStatusCodes: matchUp?.matchUpStatusCodes ?? [],
    loserDrawPosition: existingWinnerDrawPosition,
    sourceMatchUpStatus: matchUp?.matchUpStatus,
    inContextDrawMatchUps: params.inContextDrawMatchUps,
    propagateExitStatus: params.propagateExitStatus,
    sourceMatchUpId: inContextMatchUp.matchUpId,
    winningSide: params.winningSide,
    matchUpsMap: params.matchUpsMap,
    tournamentRecord,
    drawDefinition,
    structure,
    event,
  });
  if (reconciliation?.error) return reconciliation;

  // A placement can land an exit on the target matchUp, and the exit then has to continue. The
  // context is what `setMatchUpStatus` drives its propagation loop from, so it is carried out of
  // here exactly as `attemptToSetWinningSide` carries it out of `directParticipants` — a swap that
  // placed a participant must progress that participant's exit for the same reason an ordinary
  // direction does.
  if (reconciliation?.context?.progressExitStatus) {
    return {
      ...scoreResult,
      context: {
        ...reconciliation.context,
        sourceMatchUpStatusCodes: matchUp?.matchUpStatusCodes ?? [],
        sourceMatchUpStatus: matchUp?.matchUpStatus,
        sourceMatchUpId: inContextMatchUp.matchUpId,
        loserMatchUp: params.targetData?.targetMatchUps?.loserMatchUp,
        matchUpsMap: params.matchUpsMap,
      },
    };
  }

  return scoreResult;
}
