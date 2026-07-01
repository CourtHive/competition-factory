import { attemptToSetMatchUpStatusBYE } from '@Mutate/matchUps/matchUpStatus/attemptToSetMatchUpStatusBYE';
import { isDirectingMatchUpStatus, isNonDirectingMatchUpStatus } from '@Query/matchUp/checkStatusType';
import { removeDirectedParticipants } from '@Mutate/matchUps/drawPositions/removeDirectedParticipants';
import { doubleExitAdvancement } from '@Mutate/drawDefinitions/positionGovernor/doubleExitAdvancement';
import { updateTieMatchUpScore } from '@Mutate/matchUps/score/updateTieMatchUpScore';
import { modifyMatchUpScore } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { decorateResult } from '@Functions/global/decorateResult';
import { pushGlobalLog } from '@Functions/global/globalLog';

// constants
import { INVALID_MATCHUP_STATUS, UNRECOGNIZED_MATCHUP_STATUS } from '@Constants/errorConditionConstants';
import {
  BYE,
  CANCELLED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

export function attemptToSetMatchUpStatus(params) {
  const { tournamentRecord, drawDefinition, matchUpStatus, structure, matchUp } = params;

  const teamRoundRobinContext = !!(
    matchUp.tieMatchUps &&
    !matchUp.roundPosition &&
    params.inContextDrawMatchUps.find((icdm) => icdm.matchUpId === matchUp.matchUpId).containerStructureId
  );

  const stack = 'attemptToSetMatchUpStatus';

  const isBYE = matchUpStatus === BYE;
  const existingWinningSide = matchUp.winningSide;
  const isDoubleExit = [DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(matchUpStatus);

  const directing = isDirectingMatchUpStatus({ matchUpStatus });
  const nonDirecting = isNonDirectingMatchUpStatus({ matchUpStatus });
  const unrecognized = !directing && !nonDirecting;

  // if matchUpTieId present a TEAM matchUp is being modified...
  const onlyModifyScore = params.matchUpTieId || (existingWinningSide && directing && !isDoubleExit);

  const changeCompletedToDoubleExit = existingWinningSide && isDoubleExit;

  pushGlobalLog({
    method: stack,
    newline: true,
    color: 'brightyellow',
    keyColors: { matchUpStatus: 'brightcyan', matchUpId: 'brightmagenta' },
    matchUpId: matchUp.matchUpId,
    matchUpStatus,
    existingStatus: matchUp.matchUpStatus,
    existingWinningSide,
    isDoubleExit,
    isBYE,
    directing,
    nonDirecting,
    unrecognized,
    onlyModifyScore,
    changeCompletedToDoubleExit,
    propagateExitStatus: params.propagateExitStatus,
    teamRoundRobinContext,
  });

  const clearScore = () =>
    modifyMatchUpScore({
      ...params,
      removeScore: [CANCELLED, WALKOVER].includes(matchUpStatus),
      matchUpStatus: matchUpStatus || TO_BE_PLAYED,
    });

  const route =
    (unrecognized && 'unrecognized') ||
    (onlyModifyScore && 'onlyModifyScore') ||
    (changeCompletedToDoubleExit && 'changeCompletedToDoubleExit') ||
    (existingWinningSide && 'existingWinningSide_removeDirected') ||
    (nonDirecting && 'nonDirecting_clearScore') ||
    (isBYE && 'isBYE') ||
    (!directing && 'notDirecting_error') ||
    (isDoubleExit && 'isDoubleExit_modifyAndAdvance') ||
    (teamRoundRobinContext && 'teamRoundRobinContext') ||
    (params.propagateExitStatus && 'propagateExitStatus') ||
    'fallthrough_error';

  pushGlobalLog({
    method: stack,
    color: 'brightgreen',
    keyColors: { route: 'brightcyan' },
    route,
    matchUpId: matchUp.matchUpId,
  });

  return (
    (unrecognized && { error: UNRECOGNIZED_MATCHUP_STATUS }) ||
    (onlyModifyScore && scoreModification(params)) ||
    (changeCompletedToDoubleExit && removeWinningSideAndSetDoubleExit(params)) ||
    (existingWinningSide && removeDirectedParticipants(params)) ||
    (nonDirecting && clearScore()) ||
    (isBYE &&
      attemptToSetMatchUpStatusBYE({
        tournamentRecord,
        drawDefinition,
        structure,
        matchUp,
      })) ||
    (!directing && { error: UNRECOGNIZED_MATCHUP_STATUS }) ||
    (isDoubleExit && modifyScoreAndAdvanceDoubleExit(params)) ||
    (teamRoundRobinContext && scoreModification(params)) ||
    (params.propagateExitStatus && scoreModification(params)) ||
    decorateResult({
      result: { error: INVALID_MATCHUP_STATUS, info: 'matchUpStatus: ' + matchUpStatus },
      stack,
    })
  );
}

function removeWinningSideAndSetDoubleExit(params) {
  const result = removeDirectedParticipants(params);
  if (result.error) return result;
  return doubleExitAdvancement(params);
}

function modifyScoreAndAdvanceDoubleExit(params) {
  const result = scoreModification({ ...params, removeScore: true });
  if (result.error) return result;
  return doubleExitAdvancement(params);
}

function scoreModification(params) {
  const stack = 'scoreModification';

  const removeDirected = params.isCollectionMatchUp && params.dualMatchUp?.winningSide && !params.projectedWinningSide;

  if (removeDirected) {
    const result = removeDirectedParticipants(params);
    if (result.error) return decorateResult({ result, stack });
  }
  const isCollectionMatchUp = Boolean(params.matchUp.collectionId);
  const result = modifyMatchUpScore({ ...params, context: stack });

  // recalculate dualMatchUp score if isCollectionMatchUp
  if (isCollectionMatchUp) {
    const { matchUpTieId, drawDefinition, matchUpsMap } = params;
    const tieMatchUpResult = updateTieMatchUpScore({
      tournamentRecord: params.tournamentRecord,
      appliedPolicies: params.appliedPolicies,
      matchUpId: matchUpTieId,
      event: params.event,
      drawDefinition,
      matchUpsMap,
    });
    if (tieMatchUpResult.error) {
      return decorateResult({ result: tieMatchUpResult, stack });
    }
    Object.assign(result, { tieMatchUpResult });
  }

  return decorateResult({ result, stack });
}
