import { noDownstreamDependencies } from '@Mutate/drawDefinitions/matchUpGovernor/noDownstreamDependencies';
import { generateTieMatchUpScore } from '@Assemblies/generators/tieMatchUpScore/generateTieMatchUpScore';
import { isDirectingMatchUpStatus, isNonDirectingMatchUpStatus } from '@Query/matchUp/checkStatusType';
import { addMatchUpScheduleItems } from '@Mutate/matchUps/schedule/scheduleItems/scheduleItems';
import { hasPropagatedExitDownstream } from '@Query/drawDefinition/hasPropagatedExitDownstream';
import { getProjectedDualWinningSide } from '@Query/matchUp/getProjectedDualWinningSide';
import { updateTieMatchUpScore } from '@Mutate/matchUps/score/updateTieMatchUpScore';

import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { swapWinnerLoser } from '@Mutate/matchUps/drawPositions/swapWinnerLoser';
import { modifyMatchUpScore } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { ensureSideLineUps } from '@Mutate/matchUps/lineUps/ensureSideLineUps';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { isActiveDownstream } from '@Query/drawDefinition/isActiveDownstream';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { removeExtension } from '@Mutate/extensions/removeExtension';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { addExtension } from '@Mutate/extensions/addExtension';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { validateScore } from '@Validators/validateScore';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { findStructure } from '@Acquire/findStructure';
import { isObject } from '@Tools/objects';

// constants and types
import { DrawDefinition, Event, MatchUpStatusUnion, Tournament } from '@Types/tournamentTypes';
import { POLICY_TYPE_PROGRESSION, POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { DISABLE_AUTO_CALC } from '@Constants/extensionConstants';
import { QUALIFYING } from '@Constants/drawDefinitionConstants';
import { PolicyDefinitions } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { TEAM } from '@Constants/matchUpTypes';
import {
  CANNOT_CHANGE_WINNING_SIDE,
  INCOMPATIBLE_MATCHUP_STATUS,
  INVALID_MATCHUP_STATUS,
  INVALID_VALUES,
  MATCHUP_NOT_FOUND,
  MISSING_DRAW_DEFINITION,
  NO_VALID_ACTIONS,
  PROPAGATED_EXITS_DOWNSTREAM,
} from '@Constants/errorConditionConstants';
import {
  ABANDONED,
  AWAITING_RESULT,
  BYE,
  CANCELLED,
  COMPLETED,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  INCOMPLETE,
  particicipantsRequiredMatchUpStatuses,
  TO_BE_PLAYED,
  validMatchUpStatuses,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

// NOTE: Internal method for setting matchUpStatus or score and winningSide, not to be confused with setMatchUpStatus

type SetMatchUpStateArgs = {
  tournamentRecords?: { [key: string]: Tournament };
  policyDefinitions?: PolicyDefinitions;
  appliedPolicies?: PolicyDefinitions;
  matchUpStatus?: MatchUpStatusUnion;
  allowChangePropagation?: boolean;
  disableScoreValidation?: boolean;
  projectedWinningSide?: number;
  propagateExitStatus?: boolean;
  matchUpStatusCodes?: string[];
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  autoCalcDisabled?: boolean;
  disableAutoCalc?: boolean;
  enableAutoCalc?: boolean;
  matchUpFormat?: string;
  matchUpTieId?: string;
  tieMatchUpId?: string;
  removeScore?: boolean;
  winningSide?: number;
  matchUpId: string;
  schedule?: any;
  notes?: string;
  outcome?: any;
  event?: Event;
  score?: any;
};

export function setMatchUpState(params: SetMatchUpStateArgs): any {
  const stack = 'setMatchUpStatus';

  // always clear score if DOUBLE_WALKOVER or WALKOVER
  if (params.matchUpStatus && [WALKOVER, DOUBLE_WALKOVER].includes(params.matchUpStatus)) params.score = undefined;

  // matchUpStatus in params is the new status
  // winningSide in params is new winningSide

  const {
    allowChangePropagation,
    disableScoreValidation,
    propagateExitStatus,
    tournamentRecords,
    tournamentRecord,
    disableAutoCalc,
    enableAutoCalc,
    drawDefinition,
    matchUpStatus,
    winningSide,
    matchUpId,
    event,
    score,
  } = params;

  // Check for missing parameters ---------------------------------------------
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  // Check matchUpStatus, matchUpStatus/winningSide validity ------------------
  if (matchUpStatus && [CANCELLED, INCOMPLETE, ABANDONED, TO_BE_PLAYED].includes(matchUpStatus) && winningSide)
    return { error: INVALID_VALUES, winningSide, matchUpStatus };

  if (![undefined, ...validMatchUpStatuses].includes(matchUpStatus)) {
    return decorateResult({
      result: { error: INVALID_MATCHUP_STATUS },
      info: 'matchUpStatus does not exist',
      stack: 'setMatchUpStatus',
    });
  }

  // Get map of all drawMatchUps and inContextDrawMatchUps ---------------------
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  const { matchUps: inContextDrawMatchUps } = getAllDrawMatchUps({
    nextMatchUps: true,
    tournamentRecord,
    inContext: true,
    drawDefinition,
    matchUpsMap,
    event,
  });

  // Find target matchUp ------------------------------------------------------
  const matchUp = matchUpsMap.drawMatchUps.find((matchUp) => matchUp.matchUpId === matchUpId);

  const inContextMatchUp = inContextDrawMatchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);

  if (!matchUp || !inContextDrawMatchUps) return { error: MATCHUP_NOT_FOUND };

  if ((matchUp.winningSide || winningSide) && matchUpStatus === BYE) {
    return {
      context: 'Cannot have Bye with winningSide',
      error: INCOMPATIBLE_MATCHUP_STATUS,
      matchUpStatus,
    };
  }

  const structureId = inContextMatchUp?.structureId;
  const { structure } = findStructure({ drawDefinition, structureId });
  const isTeam = isMatchUpEventType(TEAM)(matchUp.matchUpType);

  // Check validity of matchUpStatus considering assigned drawPositions -------
  const assignedDrawPositions = inContextMatchUp?.drawPositions?.filter(Boolean);

  const matchUpTieId = inContextMatchUp?.matchUpTieId;

  // Get winner/loser position targets ----------------------------------------
  const targetData = positionTargets({
    matchUpId: matchUpTieId || matchUpId, // get targets for TEAM matchUp if tieMatchUp
    inContextDrawMatchUps,
    drawDefinition,
  });

  Object.assign(params, {
    inContextDrawMatchUps,
    inContextMatchUp,
    matchUpTieId,
    matchUpsMap,
    targetData,
    structure,
    matchUp,
  });

  //we want to figure out if the command is for clearing the score as this
  //can have downstream effects.
  const isClearScore =
    matchUpStatus === TO_BE_PLAYED && score?.scoreStringSide1 === '' && score?.scoreStringSide2 === '' && !winningSide;

  const propagatedExitDownStream = hasPropagatedExitDownstream(params);

  //if we try to clear a score but there are downstream propagated statuses
  //we error
  if (propagatedExitDownStream && isClearScore) {
    return { error: PROPAGATED_EXITS_DOWNSTREAM };
  }
  // with propagating winningSide changes, activeDownstream does not apply to collection matchUps
  const activeDownstream = isActiveDownstream(params);

  let dualWinningSideChange;
  if (isTeam) {
    if (disableAutoCalc) {
      addExtension({
        extension: { name: DISABLE_AUTO_CALC, value: true },
        element: matchUp,
      });
    } else if (enableAutoCalc) {
      const existingDualMatchUpWinningSide = matchUp.winningSide;

      const {
        winningSide: projectedWinningSide,
        scoreStringSide1,
        scoreStringSide2,
        set,
      } = generateTieMatchUpScore({
        drawDefinition,
        matchUpsMap,
        structure,
        matchUp,
        event,
      });

      const score = {
        scoreStringSide1,
        scoreStringSide2,
        sets: set ? [set] : [],
      };

      dualWinningSideChange = projectedWinningSide !== existingDualMatchUpWinningSide;

      // if activeDownStream and dualWinningSideChange then disallow removal of autoCalc
      if (activeDownstream && dualWinningSideChange) {
        return decorateResult({
          stack: 'winningSideWithDownstreamDependencies',
          result: { error: CANNOT_CHANGE_WINNING_SIDE },
          context: { winningSide, matchUp },
        });
      }

      removeExtension({ name: DISABLE_AUTO_CALC, element: matchUp });

      // setting these parameters will enable noDownStreamDependencies to attemptToSetWinningSide
      Object.assign(params, {
        winningSide: projectedWinningSide,
        dualWinningSideChange,
        projectedWinningSide,
        score,
      });
    }

    ensureSideLineUps({
      tournamentId: tournamentRecord?.tournamentId,
      inContextDualMatchUp: inContextMatchUp,
      eventId: event?.eventId,
      dualMatchUp: matchUp,
      drawDefinition,
    });
  }

  if (
    isTeam &&
    matchUpStatus &&
    [
      AWAITING_RESULT,
      // for the following statuses should all tieMatchUp results be removed?
      // CANCELLED,
      // DOUBLE_WALKOVER,
      // WALKOVER,
    ].includes(matchUpStatus)
  ) {
    return {
      info: 'Not supported for matchUpType: TEAM',
      error: INVALID_VALUES,
    };
  }

  if (score && !isTeam && !disableScoreValidation) {
    const matchUpFormat =
      matchUp.matchUpFormat ?? structure?.matchUpFormat ?? drawDefinition?.matchUpFormat ?? event?.matchUpFormat;

    const result = validateScore({
      existingMatchUpStatus: matchUp.matchUpStatus,
      matchUpFormat,
      matchUpStatus,
      winningSide,
      score,
    });
    if (result.error) return result;
  }

  const appliedPolicies =
    getAppliedPolicies({
      policyTypes: [POLICY_TYPE_PROGRESSION, POLICY_TYPE_SCORING],
      tournamentRecord,
      drawDefinition,
      event,
    })?.appliedPolicies ?? {};

  if (isObject(params.policyDefinitions)) Object.assign(appliedPolicies, params.policyDefinitions);

  const participantCheck = checkParticipants({
    assignedDrawPositions,
    propagateExitStatus,
    inContextMatchUp,
    appliedPolicies,
    drawDefinition,
    matchUpStatus,
    structure,
    matchUp,
  });
  if (participantCheck?.error) return participantCheck;

  const qualifyingMatch = inContextMatchUp?.stage === QUALIFYING && inContextMatchUp.finishingRound === 1;
  const qualifierAdvancing = qualifyingMatch && winningSide;
  const removingQualifier =
    qualifyingMatch && // oop
    matchUp.winningSide &&
    !winningSide && // function calls last
    (!params.matchUpStatus ||
      (params.matchUpStatus &&
        isNonDirectingMatchUpStatus({
          matchUpStatus: params.matchUpStatus,
        }))) &&
    (!params.outcome || !checkScoreHasValue({ outcome: params.outcome }));
  const qualifierChanging =
    qualifierAdvancing && // oop
    winningSide !== matchUp.winningSide &&
    matchUp.winningSide;

  Object.assign(params, {
    qualifierAdvancing,
    qualifierChanging,
    removingQualifier,
    appliedPolicies,
  });

  if (matchUpTieId) {
    const { matchUp: dualMatchUp } = findDrawMatchUp({
      matchUpId: matchUpTieId,
      inContext: true,
      drawDefinition,
      matchUpsMap,
      event,
    });
    if (dualMatchUp) {
      const tieFormat = resolveTieFormat({
        matchUp: dualMatchUp,
        drawDefinition,
        structure,
        event,
      })?.tieFormat;

      const { projectedWinningSide } = getProjectedDualWinningSide({
        drawDefinition,
        matchUpStatus,
        dualMatchUp,
        matchUpsMap,
        winningSide,
        tieFormat,
        structure,
        matchUp,
        event,
        score,
      });

      const existingDualMatchUpWinningSide = dualMatchUp.winningSide;
      dualWinningSideChange = projectedWinningSide !== existingDualMatchUpWinningSide;
      const autoCalcDisabled = dualMatchUp._disableAutoCalc;

      Object.assign(params, {
        isCollectionMatchUp: true,
        dualWinningSideChange,
        projectedWinningSide,
        autoCalcDisabled,
        matchUpTieId,
        dualMatchUp,
        tieFormat,
      });
    }
  }

  const directingMatchUpStatus = isDirectingMatchUpStatus({ matchUpStatus });

  if (!matchUpTieId) {
    if (
      activeDownstream &&
      !winningSide &&
      ((matchUpStatus && isNonDirectingMatchUpStatus({ matchUpStatus })) ||
        (matchUpStatus && [DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(matchUpStatus)))
    ) {
      return {
        error: INCOMPATIBLE_MATCHUP_STATUS,
        activeDownstream,
        winningSide,
      };
    }

    if (winningSide && winningSide === matchUp.winningSide && matchUpStatus && !directingMatchUpStatus) {
      return {
        context: 'winningSide must include directing matchUpStatus',
        error: INCOMPATIBLE_MATCHUP_STATUS,
        directingMatchUpStatus,
        matchUpStatus,
      };
    }
  }

  // Add scheduling information to matchUp ------------------------------------
  const { schedule } = params;
  if (schedule) {
    const result = addMatchUpScheduleItems({
      disableNotice: true,
      tournamentRecords,
      tournamentRecord,
      drawDefinition,
      matchUpId,
      schedule,
    });
    if (result.error) {
      return result;
    }
  }

  const validWinningSideSwap =
    !isTeam && !dualWinningSideChange && winningSide && matchUp.winningSide && matchUp.winningSide !== winningSide;

  if (
    allowChangePropagation &&
    validWinningSideSwap &&
    matchUp.roundPosition // not round robin if matchUp.roundPosition
  ) {
    return swapWinnerLoser(params);
  }

  const matchUpWinner = (winningSide && !matchUpTieId) || params.projectedWinningSide;

  pushGlobalLog({
    activeDownstream,
    matchUpWinner,
    method: stack,
    winningSide,
  });

  // when autoCalcDisabled for TEAM matchUps then noDownstreamDependencies can change collectionMatchUp status
  // const result = ((!activeDownstream || params.autoCalcDisabled) && noDownstreamDependencies(params)) ||
  const result = (!activeDownstream && noDownstreamDependencies(params)) ||
    (matchUpWinner && winningSideWithDownstreamDependencies(params)) ||
    ((directingMatchUpStatus || params.autoCalcDisabled) && applyMatchUpValues(params)) || {
      error: NO_VALID_ACTIONS,
    };

  return decorateResult({ result, stack });
}

function winningSideWithDownstreamDependencies(params) {
  const { matchUp, winningSide, matchUpTieId, dualWinningSideChange } = params;
  if (winningSide === matchUp.winningSide || (matchUpTieId && !dualWinningSideChange)) {
    return applyMatchUpValues(params);
  } else {
    return decorateResult({
      stack: 'winningSideWithDownstreamDependencies',
      result: { error: CANNOT_CHANGE_WINNING_SIDE },
      context: { winningSide, matchUp },
    });
  }
}

function applyMatchUpValues(params) {
  const { tournamentRecord, matchUp, event } = params;
  const removeWinningSide =
    params.isCollectionMatchUp &&
    matchUp.winningSide &&
    !params.winningSide &&
    !checkScoreHasValue({ score: params.score });
  const newMatchUpStatus = params.isCollectionMatchUp
    ? params.matchUpStatus || (removeWinningSide && TO_BE_PLAYED) || (params.winningSide && COMPLETED) || INCOMPLETE
    : params.matchUpStatus || COMPLETED;
  const removeScore =
    params.removeScore ||
    ([CANCELLED, WALKOVER].includes(newMatchUpStatus) && ![INCOMPLETE, ABANDONED].includes(newMatchUpStatus));

  const result = modifyMatchUpScore({
    ...params,
    matchUpStatus: newMatchUpStatus,
    removeWinningSide,
    context: 'sms',
    removeScore,
  });
  if (result.error) return result;

  // recalculate dualMatchUp score if isCollectionMatchUp
  if (params.isCollectionMatchUp) {
    const { matchUpTieId, drawDefinition, matchUpsMap } = params;
    const tieMatchUpResult = updateTieMatchUpScore({
      appliedPolicies: params.appliedPolicies,
      matchUpId: matchUpTieId,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      event,
    });

    if (tieMatchUpResult.error) return tieMatchUpResult;
    Object.assign(result, { tieMatchUpResult });
  }

  return result;
}

function checkParticipants({
  assignedDrawPositions,
  propagateExitStatus,
  inContextMatchUp,
  appliedPolicies,
  drawDefinition,
  matchUpStatus,
  structure,
  matchUp,
}) {
  if (appliedPolicies?.[POLICY_TYPE_SCORING]?.requireParticipantsForScoring === false) return { ...SUCCESS };

  const participantsCount = inContextMatchUp?.sides?.map((side) => side.participantId).filter(Boolean).length;

  const positionAssignments = matchUp?.sides
    ? []
    : getPositionAssignments({
        structureId: structure?.structureId,
        drawDefinition,
      }).positionAssignments;

  const requiredParticipants =
    (participantsCount && participantsCount === 2) ||
    // matchUp may be doubles or singles but if it is a tieMatchUp in a TEAM event and is adHoc and has a single participant
    (matchUp.collectionId && isAdHoc({ structure }) && participantsCount && participantsCount >= 1) ||
    (assignedDrawPositions?.length === 2 &&
      positionAssignments
        ?.filter((assignment) => assignedDrawPositions.includes(assignment.drawPosition))
        .every((assignment) => assignment.participantId));
  if (
    matchUpStatus &&
    //we want to allow wo, default and double walkover inn the consolation draw
    //to have only one particpiant when they are caused by an exit propagation
    [WALKOVER, DEFAULTED, DOUBLE_WALKOVER].includes(matchUpStatus) &&
    participantsCount === 1 &&
    propagateExitStatus
  ) {
    return { ...SUCCESS };
  }
  if (matchUpStatus && particicipantsRequiredMatchUpStatuses.includes(matchUpStatus) && !requiredParticipants) {
    return decorateResult({
      info: 'matchUpStatus requires assigned participants',
      context: { matchUpStatus, requiredParticipants },
      result: { error: INVALID_MATCHUP_STATUS },
    });
  }

  return { ...SUCCESS };
}
