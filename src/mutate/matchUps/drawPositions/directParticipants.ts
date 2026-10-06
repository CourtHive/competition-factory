import { attemptToModifyScore } from '@Mutate/drawDefinitions/matchUpGovernor/attemptToModifyScore';
import { assignDrawPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { updateTieMatchUpScore } from '@Mutate/matchUps/score/updateTieMatchUpScore';
import { getSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { isDirectingMatchUpStatus } from '@Query/matchUp/checkStatusType';
import { decorateResult } from '@Functions/global/decorateResult';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { directWinner } from './directWinner';
import { directLoser } from './directLoser';
import { isExit } from '@Validators/isExit';

// constants and types
import { MISSING_DRAW_POSITIONS } from '@Constants/errorConditionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

export function directParticipants(params): ResultType {
  const stack = 'directParticipants';
  const result = attemptToModifyScore(params);

  if (result.error) return decorateResult({ result, stack });
  const matchUpStatusIsValid = isDirectingMatchUpStatus({
    matchUpStatus: params.matchUpStatus,
  });

  const {
    dualWinningSideChange,
    inContextDrawMatchUps,
    projectedWinningSide,
    propagateExitStatus,
    matchUpStatusCodes,
    tournamentRecord,
    drawDefinition,
    matchUpStatus,
    dualMatchUp,
    matchUpsMap,
    winningSide,
    targetData,
    matchUpId,
    structure,
    matchUp,
    event,
  } = params;

  const isCollectionMatchUp = Boolean(matchUp.collectionId);
  const isAdHocMatchUp = isAdHoc({ structure });
  let drawPositions = matchUp.drawPositions;

  let annotate;
  if (isCollectionMatchUp) {
    const { matchUpTieId, matchUpsMap } = params;
    const tieMatchUpResult = updateTieMatchUpScore({
      appliedPolicies: params.appliedPolicies,
      matchUpId: matchUpTieId,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      event,
    });
    // the dual's write can fail; the line's result is then that failure, not success
    if (tieMatchUpResult?.error) return decorateResult({ result: tieMatchUpResult, stack });
    annotate = tieMatchUpResult && { tieMatchUpResult };
    const matchUpTie = inContextDrawMatchUps.find(({ matchUpId }) => matchUpId === matchUpTieId);
    drawPositions = matchUpTie?.drawPositions;
    if (!dualWinningSideChange) {
      return decorateResult({ result: { ...SUCCESS, ...annotate }, stack });
    }
  }

  if (isAdHocMatchUp) {
    return decorateResult({ result: { ...SUCCESS, ...annotate }, stack });
  }

  if (!drawPositions) {
    return decorateResult({ result: { error: MISSING_DRAW_POSITIONS }, stack });
  }

  // A RUBBER'S EXIT IS NOT THE TEAM'S. When a line decides its dual, it is the DUAL whose participants
  // are directed, and a dual decided on its rubbers is COMPLETED (`updateTieMatchUpScore`). Directing it
  // with the line's own status carried a single rubber's WALKOVER onto the losing team's next matchUp
  // as a pending exit, which then awarded that matchUp to whoever arrived (TEAM double elimination:
  // a Backdraw semi-final winner walked over into the grand final).
  const directingStatus = isCollectionMatchUp ? COMPLETED : matchUpStatus;

  return processDrawPositionDirecting({
    propagateRetirementAsExit: params.propagateRetirementAsExit,
    matchUpStatusIsValid: isCollectionMatchUp || matchUpStatusIsValid,
    matchUpStatusCodes: isCollectionMatchUp ? [] : matchUpStatusCodes,
    inContextDrawMatchUps,
    projectedWinningSide,
    propagateExitStatus,
    tournamentRecord,
    drawDefinition,
    drawPositions,
    matchUpStatus: directingStatus,
    dualMatchUp,
    matchUpsMap,
    winningSide,
    targetData,
    matchUpId,
    structure,
    annotate,
    matchUp,
    stack,
    event,
  });
}

function processDrawPositionDirecting({
  propagateRetirementAsExit,
  matchUpStatusIsValid,
  inContextDrawMatchUps,
  projectedWinningSide,
  propagateExitStatus,
  matchUpStatusCodes,
  tournamentRecord,
  drawDefinition,
  drawPositions,
  matchUpStatus,
  dualMatchUp,
  matchUpsMap,
  winningSide,
  targetData,
  matchUpId,
  structure,
  annotate,
  matchUp,
  stack,
  event,
}): ResultType {
  // Bound by side, never by index: with one position present the array is compacted (`getSideDrawPosition`).
  const winningSideNumber = projectedWinningSide || winningSide;
  // the hydrated source (the dual, for a line) where positionTargets found one; its `sides` bind the positions
  const positioned = { ...matchUp, ...targetData.matchUp, drawPositions };
  const sidePosition = (sideNumber: number) =>
    getSideDrawPosition({ drawDefinition, structureId: structure?.structureId, matchUp: positioned, sideNumber });
  const winningDrawPosition = sidePosition(winningSideNumber);
  const loserDrawPosition = sidePosition(3 - winningSideNumber);
  const context = {};

  const {
    targetLinks: { loserTargetLink, winnerTargetLink, byeTargetLink },
    targetMatchUps: {
      winnerMatchUpDrawPositionIndex, // only present when positionTargets found without winnerMatchUpId
      loserMatchUpDrawPositionIndex, // only present when positionTargets found without loserMatchUpId
      winnerMatchUp,
      loserMatchUp,
      byeMatchUp,
    },
  } = targetData;

  // In lucky draws, pre-feed rounds (odd matchUp count) defer advancement
  // to luckyDrawAdvancement for manual loser selection. Normal power-of-2 rounds
  // advance winners immediately as each matchUp completes, same as a regular draw.
  const isLuckyDraw = isLuckyBasedDraw(drawDefinition?.drawType);
  const isPreFeedRound = checkIsPreFeedRound(isLuckyDraw, matchUp, structure);
  const shouldAdvance = !isLuckyDraw || !isPreFeedRound;
  const sourceStatus = (matchUpStatusIsValid && matchUpStatus) || COMPLETED;

  // A propagated exit (WALKOVER/DEFAULT) can carry a winningSide whose side is
  // still an empty feed slot — the eventual opponent has not fallen through yet.
  // There is no participant to advance, and the index-based winningDrawPosition
  // would resolve to the LOSER's position. Suppress winner advancement until the
  // real opponent arrives (advanceWinner auto-resolves and advances them then).
  const inContextMatchUp = inContextDrawMatchUps?.find((m) => m.matchUpId === matchUpId);
  const winningSideParticipantId = inContextMatchUp?.sides?.find(
    (side) => side.sideNumber === (projectedWinningSide || winningSide),
  )?.participantId;
  const winnerSlotEmpty = isExit(matchUpStatus) && !winningSideParticipantId;

  if (winnerMatchUp && shouldAdvance && !winnerSlotEmpty) {
    const result = directWinner({
      sourceMatchUpStatus: sourceStatus,
      winnerMatchUpDrawPositionIndex,
      sourceMatchUpId: matchUpId,
      inContextDrawMatchUps,
      projectedWinningSide,
      winningDrawPosition,
      tournamentRecord,
      winnerTargetLink,
      drawDefinition,
      winnerMatchUp,
      dualMatchUp,
      matchUpsMap,
      event,
    });
    if (result.error) return decorateResult({ result, stack });
  }

  if (loserMatchUp && shouldAdvance) {
    const result = directLoser({
      sourceMatchUpStatus: sourceStatus,
      sourceMatchUpStatusCodes: matchUpStatusCodes ?? [],
      propagateRetirementAsExit,
      sourceWinningSide: winningSide,
      loserMatchUpDrawPositionIndex,
      sourceMatchUpId: matchUpId,
      inContextDrawMatchUps,
      projectedWinningSide,
      propagateExitStatus,
      loserDrawPosition,
      tournamentRecord,
      loserTargetLink,
      drawDefinition,
      loserMatchUp,
      winningSide,
      matchUpsMap,
      dualMatchUp,
      event,
    });
    if (result.context?.progressExitStatus) {
      Object.assign(context, result.context, {
        sourceMatchUpStatusCodes: matchUpStatusCodes ?? [],
        sourceMatchUpStatus: sourceStatus,
        // WHICH SIDE OF THE SOURCE EXITED, so `progressExitStatus` can read the source's REASON CODE at
        // that side rather than at index 0. Already computed above for `directLoser`; it simply was not
        // in the context, and its absence is why a reason recorded against side 2 was dropped.
        sourceWinningSide: winningSide,
        sourceMatchUpId: matchUpId,
        loserMatchUp,
        matchUpsMap,
      });
    }
    if (result.error) return decorateResult({ result, stack });
  }

  if (byeMatchUp) {
    const targetMatchUpDrawPositions = byeMatchUp.drawPositions ?? [];
    const backdrawPosition = Math.min(...targetMatchUpDrawPositions.filter(Boolean));
    const targetStructureId = byeTargetLink.target.structureId;
    const result = assignDrawPositionBye({
      drawPosition: backdrawPosition,
      structureId: targetStructureId,
      tournamentRecord,
      drawDefinition,
      event,
    });
    if (result.error) return decorateResult({ result, stack });
  }
  return decorateResult({ result: { ...SUCCESS, ...annotate }, stack, context });
}

function checkIsPreFeedRound(isLuckyDraw, matchUp, structure): boolean {
  if (!isLuckyDraw || !matchUp.roundNumber || !structure?.matchUps) return false;
  const roundMatchUpCount = structure.matchUps.filter((m) => m.roundNumber === matchUp.roundNumber).length;
  return roundMatchUpCount % 2 !== 0;
}
