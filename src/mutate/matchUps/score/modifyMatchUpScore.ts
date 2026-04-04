import { updateAssignmentParticipantResults } from '@Mutate/drawDefinitions/matchUpGovernor/updateAssignmentParticipantResults';
import { modifyMatchUpNotice, updateInContextMatchUp } from '@Mutate/notifications/drawNotifications';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { addNotes } from '@Mutate/base/addRemoveNotes';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { isLucky } from '@Query/drawDefinition/isLucky';
import { getTopics } from '@Global/state/globalState';
import { unique } from '@Tools/arrays';

// types, constants and fixtures
import { DrawDefinition, Event, MatchUp, MatchUpStatusUnion, Tournament } from '@Types/tournamentTypes';
import { MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';
import { UPDATE_INCONTEXT_MATCHUP } from '@Constants/topicConstants';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { CONTAINER } from '@Constants/drawDefinitionConstants';
import { PolicyDefinitions } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { TEAM } from '@Constants/matchUpTypes';
import {
  AWAITING_RESULT,
  completedMatchUpStatuses,
  DOUBLE_WALKOVER,
  SUSPENDED,
  DEFAULTED,
  WALKOVER,
  IN_PROGRESS,
  INCOMPLETE,
} from '@Constants/matchUpStatusConstants';

/**
 *
 * Single place where matchUp.score can be modified.
 *
 * Mutates passed matchUp object.
 * Moving forward this will be used for integrity checks and any middleware that needs to execute
 *
 */

type ModifyMatchUpScoreArgs = {
  matchUpStatus?: MatchUpStatusUnion;
  appliedPolicies?: PolicyDefinitions;
  tournamentRecord?: Tournament;
  matchUpStatusCodes?: string[];
  drawDefinition?: DrawDefinition;
  removeWinningSide?: boolean;
  matchUpFormat?: string;
  removeScore?: boolean;
  winningSide?: number;
  matchUpId: string;
  matchUp: MatchUp; // matchUp without context
  notes?: string;
  context?: any;
  event?: Event;
  score?: any;
};

export function modifyMatchUpScore(params: ModifyMatchUpScoreArgs) {
  const stack = 'modifyMatchUpScore';
  let matchUpFormat = params.matchUpFormat;
  let matchUp = params.matchUp; // matchUp without context
  let structure;

  const {
    matchUpStatusCodes,
    tournamentRecord,
    drawDefinition,
    matchUpStatus,
    removeScore,
    winningSide,
    matchUpId,
    event,
    notes,
    score,
  } = params;

  const appliedPolicies = resolveAppliedPolicies({
    appliedPolicies: params.appliedPolicies,
    tournamentRecord,
    drawDefinition,
    structure,
    event,
  });

  const isDualMatchUp = matchUp.matchUpType === TEAM;

  const resolvedTarget = resolveDualMatchUpTarget({
    isDualMatchUp,
    drawDefinition,
    matchUpId,
    matchUp,
    event,
  });
  if (resolvedTarget?.error) return resolvedTarget;
  if (resolvedTarget) {
    ({ matchUp, structure } = resolvedTarget);
  }

  const wasDefaulted = matchUpStatus && matchUp?.matchUpStatus === DEFAULTED && matchUpStatus !== DEFAULTED;

  applyScoreAndStatus({
    matchUpStatusCodes,
    removeWinningSide: params.removeWinningSide,
    matchUpStatus,
    matchUpFormat,
    removeScore,
    winningSide,
    matchUp,
    score,
  });

  if (!structure && drawDefinition) {
    ({ structure } = findDrawMatchUp({
      drawDefinition,
      matchUpId,
      event,
    }));
  }

  applyInProgressStatus({ matchUpStatus, matchUp });

  let defaultedProcessCodes;
  if ((wasDefaulted && matchUp?.processCodes?.length) || matchUpStatus === DEFAULTED) {
    defaultedProcessCodes = appliedPolicies?.[POLICY_TYPE_SCORING]?.processCodes?.incompleteAssignmentsOnDefault;
  }

  const tallyResult: any = updateTallyIfNeeded({
    isDualMatchUp,
    tournamentRecord,
    drawDefinition,
    matchUpFormat,
    matchUpId,
    structure,
    matchUp,
    event,
  });
  if (tallyResult?.error) return decorateResult({ result: tallyResult, stack });

  if (notes) {
    const result = addNotes({ element: matchUp, notes });
    if (result.error) return decorateResult({ result, stack });
  }

  const tournamentId = tournamentRecord?.tournamentId;
  const inContextMatchUp = getInContextMatchUp({
    defaultedProcessCodes,
    tournamentRecord,
    drawDefinition,
    matchUpId,
  });

  if (inContextMatchUp) {
    const sendInContext = getTopics().topics.includes(UPDATE_INCONTEXT_MATCHUP);
    if (sendInContext) {
      updateInContextMatchUp({ tournamentId, inContextMatchUp });
    }
  }

  applyDefaultedProcessCodes({
    defaultedProcessCodes,
    inContextMatchUp,
    matchUpStatus,
    matchUp,
  });

  modifyMatchUpNotice({
    eventId: event?.eventId,
    context: stack,
    drawDefinition,
    tournamentId,
    matchUp,
  });

  return { ...SUCCESS };
}

function resolveAppliedPolicies({ appliedPolicies, tournamentRecord, drawDefinition, structure, event }) {
  const hasPolicies = appliedPolicies && Object.keys(appliedPolicies).length;
  if (hasPolicies) return appliedPolicies;

  return getAppliedPolicies({
    policyTypes: [POLICY_TYPE_SCORING],
    tournamentRecord,
    drawDefinition,
    structure,
    event,
  })?.appliedPolicies;
}

function resolveDualMatchUpTarget({ isDualMatchUp, drawDefinition, matchUpId, matchUp, event }) {
  if (isDualMatchUp && drawDefinition) {
    if (matchUpId && matchUp.matchUpId !== matchUpId) {
      const findResult = findDrawMatchUp({
        drawDefinition,
        matchUpId,
        event,
      });
      if (!findResult.matchUp) return { error: MATCHUP_NOT_FOUND };
      return { matchUp: findResult.matchUp, structure: findResult.structure };
    }
    return undefined;
  }

  if (matchUp.matchUpId !== matchUpId) {
    console.log('!!!!!');
  }
  return undefined;
}

function applyScoreAndStatus({
  matchUpStatusCodes,
  removeWinningSide,
  matchUpStatus,
  matchUpFormat,
  removeScore,
  winningSide,
  matchUp,
  score,
}) {
  const walkoverStatuses = new Set([WALKOVER, DOUBLE_WALKOVER]);
  if ((matchUpStatus && walkoverStatuses.has(matchUpStatus)) || removeScore) {
    Object.assign(matchUp, { ...toBePlayed });
  } else if (score) {
    matchUp.score = score;
  }

  if (matchUpStatus) matchUp.matchUpStatus = matchUpStatus;
  if (matchUpFormat) matchUp.matchUpFormat = matchUpFormat;
  if (matchUpStatusCodes) matchUp.matchUpStatusCodes = matchUpStatusCodes;
  if (winningSide) matchUp.winningSide = winningSide;
  if (removeWinningSide) matchUp.winningSide = undefined;
}

function applyInProgressStatus({ matchUpStatus, matchUp }) {
  const nonProgressStatuses = new Set([AWAITING_RESULT, SUSPENDED, INCOMPLETE]);
  if (
    matchUpStatus &&
    !matchUp.winningSide &&
    checkScoreHasValue(matchUp) &&
    !completedMatchUpStatuses.includes(matchUpStatus) &&
    !nonProgressStatuses.has(matchUpStatus)
  ) {
    matchUp.matchUpStatus = IN_PROGRESS;
  }
}

function updateTallyIfNeeded({
  isDualMatchUp,
  tournamentRecord,
  drawDefinition,
  matchUpFormat,
  matchUpId,
  structure,
  matchUp,
  event,
}) {
  if (matchUp.collectionId) return undefined;

  const isRoundRobin = structure?.structureType === CONTAINER;
  const isAdHocStructure = isAdHoc({ structure });

  if (!isLucky({ drawDefinition, structure }) && !isAdHocStructure && !isRoundRobin) return undefined;

  const resolvedFormat = isDualMatchUp
    ? 'SET1-S:T100'
    : (matchUpFormat ??
      matchUp.matchUpFormat ??
      structure?.matchUpFormat ??
      drawDefinition?.matchUpFormat ??
      event?.matchUpFormat);

  const matchUpFilters = isDualMatchUp ? { matchUpTypes: [TEAM] } : undefined;
  const tallyStructure = isRoundRobin
    ? structure.structures.find((itemStructure) => {
        return itemStructure?.matchUps.find((m) => m.matchUpId === matchUpId);
      }) || structure
    : structure;

  const { matchUps } = getAllStructureMatchUps({
    structure: tallyStructure,
    afterRecoveryTimes: false,
    tournamentRecord,
    inContext: true,
    matchUpFilters,
    drawDefinition,
    event,
  });

  if (isAdHocStructure) {
    tallyStructure.positionAssignments = unique(
      matchUps.flatMap((m) => (m.sides ?? []).map((side) => side.participantId)).filter(Boolean),
    ).map((participantId) => ({ participantId }));
  }

  const result = updateAssignmentParticipantResults({
    positionAssignments: tallyStructure.positionAssignments,
    matchUpFormat: resolvedFormat,
    tournamentRecord,
    drawDefinition,
    matchUps,
    event,
  });

  if (result.error) return result;
  return { matchUpFormat: resolvedFormat };
}

function getInContextMatchUp({ defaultedProcessCodes, tournamentRecord, drawDefinition, matchUpId }) {
  const sendInContext = getTopics().topics.includes(UPDATE_INCONTEXT_MATCHUP);
  if (!sendInContext && !defaultedProcessCodes) return undefined;

  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  if (!matchUpsMap) return undefined;

  return getAllDrawMatchUps({
    matchUpFilters: { matchUpIds: [matchUpId] },
    nextMatchUps: true,
    tournamentRecord,
    inContext: true,
    drawDefinition,
    matchUpsMap,
  }).matchUps?.[0];
}

function applyDefaultedProcessCodes({ defaultedProcessCodes, inContextMatchUp, matchUpStatus, matchUp }) {
  if (!Array.isArray(defaultedProcessCodes) || !inContextMatchUp) return;
  if (inContextMatchUp.sides?.every(({ participantId }) => participantId)) return;

  if (matchUpStatus === DEFAULTED) {
    matchUp.processCodes = unique([...(matchUp.processCodes ?? []), ...defaultedProcessCodes]);
  } else {
    for (const processCode of defaultedProcessCodes ?? []) {
      const codeIndex = processCode && matchUp?.processCodes?.lastIndexOf(processCode);
      matchUp?.processCodes?.splice(codeIndex, 1);
    }
  }
}
