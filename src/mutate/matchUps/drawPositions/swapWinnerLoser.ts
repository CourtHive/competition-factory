import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getDrawPositionWinCount } from '@Query/matchUp/getDrawPositionWinCount';
import { assignDrawPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { modifyMatchUpScore } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { pushGlobalLog } from '@Functions/global/globalLog';

// constants
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';

/**
 * Swap the winner and loser of an already-decided matchUp, carrying the change downstream.
 *
 * ## THIS IS NO LONGER THE CONSUMER PATH — it is reached ONLY by the propagation cascade
 *
 * It used to serve both callers of the `allowChangePropagation` branch in `resolveAndApplyOutcome`.
 * A consumer correction now goes to `correctDecidedOutcome`, which performs the director's own
 * sequence — clear the downstream results, apply the change through the ordinary dispatch, re-enter
 * what was cleared — instead of hand-editing `drawPositions` and `positionAssignments`. Measured
 * head-to-head on 189 flips, this function disagreed with that sequence on 36 and
 * `getDrawInconsistencies` flagged it on 34; the replacement closes all 36.
 *
 * What still arrives here is `progressExitStatus`, which hardcodes `allowChangePropagation: true`
 * (and `propagatingExit: true`) on its internal call — to get PAST the refusal, not to request a
 * clear-and-replay. Asking a cascade that is already re-deriving progression to clear and replay a
 * subtree from inside its own traversal is re-entrant, and it is measurably wrong: census seed
 * 9100247 (COMPASS 16/14) passes here and fails under `correctDecidedOutcome`,
 * `noDownstreamDependencies`, AND the ordinary dispatch alike. So the cascade keeps exactly the
 * behaviour it has always had.
 *
 * **This split is a stopping point, not an end state.** Retiring this function needs someone to
 * establish what the cascade depends on in it — see the "what SWL-A did NOT fix" section of
 * Mentat/planning/SWAP_WINNER_LOSER_TWO_ROUTES.md. Until then the three structural gaps documented
 * there are still live ON THIS PATH, so do not treat a fix landed in `correctDecidedOutcome` as
 * covering the cascade.
 */
export function swapWinnerLoser(params) {
  const { tournamentRecord, inContextMatchUp, structure, drawDefinition, event } = params;
  const matchUpRoundNumber = inContextMatchUp.roundNumber;

  const existingWinnerSide = inContextMatchUp.sides.find((side) => side.sideNumber === inContextMatchUp.winningSide);
  const existingLoserSide = inContextMatchUp.sides.find((side) => side.sideNumber !== inContextMatchUp.winningSide);

  const { drawPosition: existingWinnerDrawPosition, participantId: existingWinnerParticipantId } = existingWinnerSide;
  const { drawPosition: existingLoserDrawPosition, participantId: existingLoserParticipantId } = existingLoserSide;

  const stack = 'swapWinnerLoser';

  const { matchUps } = getAllStructureMatchUps(params);
  const existingWinnerSubsequentMatchUps = matchUps.filter(
    ({ drawPositions, roundNumber }) =>
      drawPositions?.includes(existingWinnerDrawPosition) && roundNumber > matchUpRoundNumber,
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
    matchUp.drawPositions = (
      matchUp.drawPositions?.map((drawPosition) =>
        drawPosition === existingWinnerDrawPosition ? existingLoserDrawPosition : drawPosition,
      ) ?? []
    ).sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : 0));
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      eventId: params.event?.eventId,
      context: stack,
      drawDefinition,
      matchUp,
      event,
    });
  });

  const { stage: currentStage, stageSequence: currentStageSequence } = structure;
  const subsequentStructureIds = drawDefinition.structures
    .filter(({ stage, stageSequence }) => stage === currentStage && stageSequence > currentStageSequence)
    .map(({ structureId }) => structureId);

  const {
    targetLinks: { loserTargetLink, winnerTargetLink },
  } = params.targetData;
  const targetStructureIds = [loserTargetLink?.target.structureId, winnerTargetLink?.target?.structureId].filter(
    Boolean,
  );

  // find target structures that are not part of current stage...
  // ... as well as any subsequent structures
  drawDefinition.structures
    .filter(({ stage, structureId }) => {
      return stage !== currentStage && targetStructureIds.includes(structureId);
    })
    .forEach(({ stage: targetStage, stageSequence: targetStageSequence, structureId }) => {
      if (!subsequentStructureIds.includes(structureId)) subsequentStructureIds.push(structureId);

      drawDefinition.structures
        .filter(({ stage, stageSequence }) => stage === targetStage && stageSequence > targetStageSequence)
        .forEach(({ structureId }) => {
          if (!subsequentStructureIds.includes(structureId)) subsequentStructureIds.push(structureId);
        });
    });

  const subsequentStructures = drawDefinition.structures.filter(({ structureId }) =>
    subsequentStructureIds.includes(structureId),
  );

  /**
   * A FIRST_MATCH consolation is not a mirror of the main draw, so the feed does not simply swap.
   *
   * `directLoser` admits a loser to a `FIRST_MATCHUP` target only with zero prior scored wins
   * (`validForConsolation`), and places a BYE at the backdraw position otherwise. Swapping the
   * assignment blindly ignored that rule: flipping a result whose new loser had ALREADY won a match
   * wrote them into the consolation anyway — measured on seed 9000349, where Sheldon Shelley
   * (1 scored win in Main R1) replaced Leeloo Goldstein (a round-1 BYE, so the flipped matchUp was
   * genuinely her first). `getDrawInconsistencies` cannot see it: it reports eligible-but-ABSENT
   * only, and has no ineligible-but-PRESENT counterpart.
   *
   * Counted over PRIOR rounds only. This runs BEFORE `modifyMatchUpScore` applies the new
   * winningSide, so the matchUp being swapped still records the incoming loser as its winner;
   * including it would count the very win that is being taken away. Prior rounds are also exactly
   * what the rule means by "had already won a match".
   */
  const { loserTargetLink: feedLink } = params.targetData.targetLinks;
  const firstMatchUpTargetStructureId =
    feedLink?.linkCondition === FIRST_MATCHUP ? feedLink?.target?.structureId : undefined;
  // `inContext: true` is required, exactly as `directLoser` sources the same count: without it the
  // sides carry no `drawPosition`, `getDrawPositionWinCount` matches no side and returns 0, and
  // every participant looks like a first-match loser.
  const { matchUps: inContextStructureMatchUps } = getAllStructureMatchUps({
    afterRecoveryTimes: false,
    inContext: true,
    drawDefinition,
    structure,
    event,
  });
  const priorRoundMatchUps = (inContextStructureMatchUps ?? []).filter(
    ({ roundNumber }) => (roundNumber ?? 0) < matchUpRoundNumber,
  );
  const incomingLoserHasPriorWin =
    getDrawPositionWinCount({
      sourceMatchUps: priorRoundMatchUps,
      drawPosition: existingWinnerDrawPosition,
    }) > 0;

  // for each subsequent structure swap drawPosition assignments (where applicable)
  subsequentStructures.forEach((structure) => {
    const { positionAssignments } = getPositionAssignments({ structure });
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

    if (existingWinnerAssignment) existingWinnerAssignment.participantId = existingLoserParticipantId;

    // The incoming loser is not a first-match loser: the slot they would have taken becomes a BYE,
    // which is what `directLoser` does for the same participant on the same link.
    if (
      existingLoserAssignment &&
      structure.structureId === firstMatchUpTargetStructureId &&
      incomingLoserHasPriorWin
    ) {
      delete existingLoserAssignment.participantId;
      assignDrawPositionBye({
        drawPosition: existingLoserAssignment.drawPosition,
        structureId: structure.structureId,
        byeFromPropagation: true,
        tournamentRecord,
        drawDefinition,
        event,
      });
      return;
    }

    if (existingLoserAssignment) existingLoserAssignment.participantId = existingWinnerParticipantId;
  });

  // apply new winningSide and any score updates
  return modifyMatchUpScore({ ...params, context: stack });
}
