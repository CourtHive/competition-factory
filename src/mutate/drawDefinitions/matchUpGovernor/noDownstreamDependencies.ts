import { decorateResult } from '@Functions/global/decorateResult';
import { removeDirectedParticipants } from '@Mutate/matchUps/drawPositions/removeDirectedParticipants';
import { modifyMatchUpScore } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { updateTieMatchUpScore } from '@Mutate/matchUps/score/updateTieMatchUpScore';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { lastSetFormatIsTimed } from '@Query/matchUp/lastSetFormatisTimed';
import { attemptToModifyScore } from './attemptToModifyScore';
import { attemptToSetMatchUpStatus } from './attemptToSetMatchUpStatus';
import { attemptToSetWinningSide } from './attemptToSetWinningSide';
import { checkConnectedStructures } from './checkConnectedStructures';
import { removeDoubleExit } from './removeDoubleExit';
import { removeQualifier } from './removeQualifier';
import { isExit } from '@Validators/isExit';

// constants
import {
  ABANDONED,
  CANCELLED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  INCOMPLETE,
  TO_BE_PLAYED,
} from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function noDownstreamDependencies(params) {
  const { matchUp, matchUpStatus, score, winningSide } = params;
  const stack = 'noDownStreamDependencies';

  const doubleExitCleanup =
    [DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(matchUp?.matchUpStatus) &&
    ![DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(matchUpStatus);
  if (doubleExitCleanup) {
    const result = removeDoubleExit(params);
    if (result.error) return decorateResult({ result, stack });
  }

  const doubleWalkover = matchUpStatus === DOUBLE_WALKOVER;
  const scoreWithNoWinningSide =
    checkScoreHasValue({ score }) &&
    !doubleWalkover &&
    ((params.isCollectionMatchUp && !params.projectedWinningSide) || !winningSide);

  const timedTieMatchUp = params?.inContextMatchUp?.collectionId && lastSetFormatIsTimed(params.inContextMatchUp);

  const removeScore =
    params.removeScore || (!timedTieMatchUp && ![INCOMPLETE, ABANDONED].includes(matchUpStatus || INCOMPLETE));

  const removeWinningSide =
    (params.isCollectionMatchUp && params.dualMatchUp.winningSide && !params.projectedWinningSide) ||
    (matchUp.winningSide && !winningSide && !checkScoreHasValue({ score }));

  const removeDirected = (removeScore) => {
    let connectedStructures;
    const { structure, drawDefinition, dualMatchUp, disableAutoCalc } = params;

    // disableAutoCalc means the score is being set manually
    if (dualMatchUp?._disableAutoCalc && disableAutoCalc !== false) {
      return attemptToModifyScore({ ...params, removeWinningSide });
    }

    const { connectedStructureIds } = checkConnectedStructures({
      drawDefinition,
      structure,
      matchUp,
    }); // only relevant to WIN_RATIO progression

    if (connectedStructureIds.length) {
      connectedStructures = true;
    }

    Object.assign(params, { removeScore });
    const result = removeDirectedParticipants(params);
    if (result.error) return result;

    if (params.removingQualifier && params.appliedPolicies?.[POLICY_TYPE_PROGRESSION]?.autoRemoveQualifiers) {
      const result = removeQualifier(params);
      return { ...SUCCESS, connectedStructures, ...result };
    }

    return { ...SUCCESS, connectedStructures };
  };

  if (removeWinningSide && winningSide && params.isCollectionMatchUp) {
    // this is only possible if a TEAM dualMatchUp has an SINGLES/DOUBLES matchUp winningSide change
    return scoreModification(params);
  }

  // if matchUpStatus is being changed for a DUAL MATCH and the new status is CANCELLED or ABANDONED
  // then winningSide of the dualMatchUp should be changed. This boolean triggers that logic in attemptToSetWinningSide
  const triggerDualWinningSide = [CANCELLED, ABANDONED].includes(matchUpStatus) && params.dualWinningSideChange;

  // if a matchUpStatus is provided and it is not TO_BE_PLAYED then an attempt to set matchUpStatus is valid
  const statusNotToBePlayed = matchUpStatus && matchUpStatus !== TO_BE_PLAYED;

  const propagateExitStatus = params.propagateExitStatus && isExit(matchUpStatus);

  const result = ((winningSide || triggerDualWinningSide || propagateExitStatus) && attemptToSetWinningSide(params)) ||
    (scoreWithNoWinningSide && removeDirected(removeScore)) ||
    (statusNotToBePlayed && attemptToSetMatchUpStatus(params)) ||
    (removeWinningSide && removeDirected(removeScore)) ||
    (matchUp && scoreModification({ ...params, removeScore: true })) || {
      ...SUCCESS, // unknown condition
    };

  return decorateResult({ result, stack });
}

function scoreModification(params) {
  const stack = 'ndd:scoreModification';
  const remove =
    params.isCollectionMatchUp &&
    params.dualMatchUp?.winningSide &&
    !params.projectedWinningSide &&
    !params.autoCalcDisabled; // if autoCalcDisabled then score has previously been set manually

  if (remove) {
    const result = removeDirectedParticipants(params);
    if (result.error) return result;
  }

  const result = modifyMatchUpScore({ ...params, context: stack });

  // recalculate dualMatchUp score if isCollectionMatchUp
  if (params.isCollectionMatchUp) {
    const { matchUpTieId, drawDefinition, event, matchUpsMap } = params;
    const { removeWinningSide } = updateTieMatchUpScore({
      tournamentRecord: params.tournamentRecord,
      appliedPolicies: params.appliedPolicies,
      matchUpId: matchUpTieId,
      drawDefinition,
      matchUpsMap,
      event,
    });

    if (removeWinningSide) console.log('REMOVE WINNING SIDE');
  }

  return decorateResult({ result, stack });
}
