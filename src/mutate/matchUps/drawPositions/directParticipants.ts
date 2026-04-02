import { attemptToModifyScore } from '@Mutate/drawDefinitions/matchUpGovernor/attemptToModifyScore';
import { assignDrawPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { updateTieMatchUpScore } from '@Mutate/matchUps/score/updateTieMatchUpScore';
import { isDirectingMatchUpStatus } from '@Query/matchUp/checkStatusType';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { decorateResult } from '@Functions/global/decorateResult';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { directWinner } from './directWinner';
import { directLoser } from './directLoser';

// constants
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

  return processDrawPositionDirecting({
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
  });
}

function processDrawPositionDirecting({
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
  const winningIndex = projectedWinningSide ? projectedWinningSide - 1 : winningSide - 1;
  const losingIndex = 1 - winningIndex;

    const winningDrawPosition = drawPositions[winningIndex];
    const loserDrawPosition = drawPositions[losingIndex];
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

    if (winnerMatchUp && shouldAdvance) {
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
        sourceMatchUpStatusCodes: matchUpStatusCodes || [],
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
          sourceMatchUpStatus: sourceStatus,
          sourceMatchUpStatusCodes: matchUpStatusCodes || [],
          loserMatchUp,
          matchUpsMap,
        });
      }
      if (result.error) return decorateResult({ result, stack });
    }

    if (byeMatchUp) {
      const targetMatchUpDrawPositions = byeMatchUp.drawPositions || [];
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
  const roundMatchUpCount = structure.matchUps.filter(
    (m) => m.roundNumber === matchUp.roundNumber,
  ).length;
  return roundMatchUpCount % 2 !== 0;
}
