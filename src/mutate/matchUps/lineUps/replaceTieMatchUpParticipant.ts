import { getCollectionPositionAssignments } from '@Query/hierarchical/tieFormats/getCollectionPositionAssignments';
import { getTieMatchUpContext } from '@Query/hierarchical/tieFormats/getTieMatchUpContext';
import { getPairedParticipant } from '@Query/participant/getPairedParticipant';
import { deleteParticipants } from '@Mutate/participants/deleteParticipants';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { updateTeamLineUp } from '@Mutate/drawDefinitions/updateTeamLineUp';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { getParticipants } from '@Query/participants/getParticipants';
import { addParticipant } from '@Mutate/participants/addParticipant';
import { decorateResult } from '@Functions/global/decorateResult';
import { ensureSideLineUps } from './ensureSideLineUps';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { unique } from '@Tools/arrays';

// constants and types
import POLICY_MATCHUP_ACTIONS_DEFAULT from '@Fixtures/policies/POLICY_MATCHUP_ACTIONS_DEFAULT';
import { LineUp, PolicyDefinitions, ResultType } from '@Types/factoryTypes';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { POLICY_TYPE_MATCHUP_ACTIONS } from '@Constants/policyConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { PAIR } from '@Constants/participantConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { DOUBLES } from '@Constants/matchUpTypes';
import {
  EXISTING_PARTICIPANT,
  INVALID_PARTICIPANT,
  INVALID_PARTICIPANT_TYPE,
  MISSING_PARTICIPANT_ID,
  NOT_FOUND,
  PARTICIPANT_NOT_FOUND,
} from '@Constants/errorConditionConstants';
import { isGendered } from '@Validators/isGendered';
import { coercedGender } from '@Helpers/coercedGender';

type ReplaceTieMatchUpParticipantIdArgs = {
  policyDefinitions?: PolicyDefinitions;
  existingParticipantId: string;
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  newParticipantId: string;
  enforceGender?: boolean;
  substitution?: boolean;
  tieMatchUpId: string;
  event: Event;
};

export function replaceTieMatchUpParticipantId(params: ReplaceTieMatchUpParticipantIdArgs): ResultType & {
  participantRemoved?: string;
  participantAdded?: string;
  modifiedLineUp?: LineUp;
} {
  const matchUpContext = getTieMatchUpContext(params);
  if (matchUpContext.error) return matchUpContext;
  const stack = 'replaceTieMatchUpParticipantid';

  const { existingParticipantId, tournamentRecord, newParticipantId, drawDefinition, substitution, event } = params;

  if (!existingParticipantId || !newParticipantId)
    return decorateResult({ result: { error: MISSING_PARTICIPANT_ID }, stack });

  if (existingParticipantId === newParticipantId) return { ...SUCCESS };

  const {
    inContextDualMatchUp,
    inContextTieMatchUp,
    collectionPosition,
    collectionId,
    dualMatchUp,
    tieMatchUp,
    tieFormat,
  } = matchUpContext;

  const matchUpType = inContextTieMatchUp?.matchUpType;

  const side: any = inContextTieMatchUp?.sides?.find(
    (side: any) =>
      side.participant?.participantId === existingParticipantId ||
      side.participant?.individualParticipantIds?.includes(existingParticipantId),
  );
  if (!side) return { error: PARTICIPANT_NOT_FOUND };

  const validationError = validateParticipantsAndGender({
    existingParticipantId,
    inContextTieMatchUp,
    newParticipantId,
    tournamentRecord,
    drawDefinition,
    params,
    event,
    stack,
  });
  if (validationError) return validationError;

  const { appliedPolicies } = getAppliedPolicies({
    tournamentRecord,
    drawDefinition,
    event,
  });

  const matchUpActionsPolicy =
    params.policyDefinitions?.[POLICY_TYPE_MATCHUP_ACTIONS] ??
    appliedPolicies?.[POLICY_TYPE_MATCHUP_ACTIONS] ??
    POLICY_MATCHUP_ACTIONS_DEFAULT[POLICY_TYPE_MATCHUP_ACTIONS];

  const substitutionProcessCodes = matchUpActionsPolicy?.processCodes?.substitution;

  ensureSideLineUps({
    tournamentId: tournamentRecord.tournamentId,
    eventId: event.eventId,
    inContextDualMatchUp,
    drawDefinition,
    dualMatchUp,
  });

  const dualMatchUpSide = dualMatchUp?.sides?.find(({ sideNumber }) => sideNumber === side.sideNumber);

  if (!dualMatchUpSide) {
    return decorateResult({
      result: {
        sideNumber: side.sideNumber,
        existingParticipantId,
        error: NOT_FOUND,
      },
      stack,
    });
  }

  const allTieIndividualParticipantIds = inContextTieMatchUp?.sides?.flatMap(
    (side: any) => side.participant?.individualParticipantIds || side.participant?.participantId || [],
  );

  if (allTieIndividualParticipantIds?.includes(newParticipantId)) {
    return decorateResult({ result: { error: EXISTING_PARTICIPANT }, stack });
  }

  const teamParticipantId = inContextDualMatchUp?.sides?.find(
    ({ sideNumber }) => sideNumber === side.sideNumber,
  )?.participantId;

  const teamLineUp = dualMatchUpSide.lineUp;

  const modifiedLineUp = buildModifiedLineUp({
    existingParticipantId,
    collectionPosition,
    newParticipantId,
    substitution,
    collectionId,
    teamLineUp,
  });

  const isDoubles = matchUpType === DOUBLES;

  const { assignedParticipantIds: existingIndividualParticipantIds } = getCollectionPositionAssignments({
    lineUp: teamLineUp,
    collectionPosition,
    collectionId,
  });

  const { assignedParticipantIds: individualParticipantIds } = getCollectionPositionAssignments({
    lineUp: modifiedLineUp,
    collectionPosition,
    collectionId,
  });

  dualMatchUpSide.lineUp = modifiedLineUp;

  if (teamParticipantId && tieFormat) {
    const result = updateTeamLineUp({
      participantId: teamParticipantId,
      lineUp: modifiedLineUp,
      drawDefinition,
      tieFormat,
    });
    if (result.error) return decorateResult({ result, stack });
  } else {
    console.log('team participantId not found');
  }

  const { participantAdded, participantRemoved }: any = isDoubles
    ? manageDoublesPairParticipants({
        existingIndividualParticipantIds,
        individualParticipantIds,
        tournamentRecord,
        stack,
      })
    : { participantAdded: undefined, participantRemoved: undefined };

  handleProcessCodes({
    substitutionProcessCodes,
    tournamentRecord,
    drawDefinition,
    substitution,
    tieMatchUp,
    stack,
    side,
  });

  if (dualMatchUp) {
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      matchUp: dualMatchUp,
      context: stack,
      drawDefinition,
    });
  }

  return { ...SUCCESS, modifiedLineUp, participantRemoved, participantAdded };
}

function validateParticipantsAndGender({
  existingParticipantId,
  inContextTieMatchUp,
  newParticipantId,
  tournamentRecord,
  drawDefinition,
  params,
  event,
  stack,
}) {
  const targetParticipants =
    getParticipants({
      tournamentRecord,
      participantFilters: {
        participantIds: [existingParticipantId, newParticipantId],
      },
    })?.participants ?? [];

  if (targetParticipants.length !== 2) return decorateResult({ result: { error: MISSING_PARTICIPANT_ID }, stack });
  if (targetParticipants[0].participantType !== targetParticipants[1].participantType)
    return decorateResult({
      result: { error: INVALID_PARTICIPANT_TYPE },
      stack,
    });

  const { appliedPolicies } = getAppliedPolicies({
    tournamentRecord,
    drawDefinition,
    event,
  });

  const matchUpActionsPolicy =
    params.policyDefinitions?.[POLICY_TYPE_MATCHUP_ACTIONS] ??
    appliedPolicies?.[POLICY_TYPE_MATCHUP_ACTIONS] ??
    POLICY_MATCHUP_ACTIONS_DEFAULT[POLICY_TYPE_MATCHUP_ACTIONS];

  const newParticipant = targetParticipants.find(({ participantId }) => participantId === newParticipantId);

  const genderEnforced = (params.enforceGender ?? matchUpActionsPolicy?.participants?.enforceGender) !== false;
  if (
    genderEnforced &&
    isGendered(inContextTieMatchUp?.gender) &&
    coercedGender(inContextTieMatchUp?.gender) !== coercedGender(newParticipant?.person?.sex)
  ) {
    return { error: INVALID_PARTICIPANT, info: 'Gender mismatch' };
  }

  return undefined;
}

function buildModifiedLineUp({
  existingParticipantId,
  collectionPosition,
  newParticipantId,
  substitution,
  collectionId,
  teamLineUp,
}) {
  const newParticipantIdInLineUp = teamLineUp?.find(({ participantId }) => newParticipantId === participantId);

  const substitutionOrder = teamLineUp?.reduce(
    (order, teamCompetitor: any) =>
      teamCompetitor.substitutionOrder > order ? teamCompetitor.substitutionOrder : order,
    0,
  );

  const modifiedLineUp =
    teamLineUp?.map((teamCompetitor) => {
      const modifiedCompetitor = makeDeepCopy(teamCompetitor, false, true);

      if (![existingParticipantId, newParticipantId].includes(modifiedCompetitor.participantId)) {
        return modifiedCompetitor;
      }

      if (!substitution && [existingParticipantId, newParticipantId].includes(modifiedCompetitor.participantId)) {
        modifiedCompetitor.collectionAssignments = modifiedCompetitor.collectionAssignments?.filter(
          (assignment) =>
            !(assignment.collectionPosition === collectionPosition && assignment.collectionId === collectionId),
        );
      }

      if (substitution && existingParticipantId === modifiedCompetitor.participantId) {
        modifiedCompetitor.collectionAssignments = modifiedCompetitor.collectionAssignments.map((assignment) => {
          if (
            assignment.collectionPosition === collectionPosition &&
            assignment.collectionId === collectionId &&
            assignment.substitutionOrder === undefined
          ) {
            return { ...assignment, substitutionOrder };
          }
          return assignment;
        });
      }

      if (modifiedCompetitor.participantId === newParticipantId) {
        if (!modifiedCompetitor.collectionAssignments) modifiedCompetitor.collectionAssignments = [];
        const assignment: any = { collectionId, collectionPosition };
        if (substitution) {
          assignment.previousParticipantId = existingParticipantId;
          assignment.substitutionOrder = (substitutionOrder ?? 0) + 1;
        }
        modifiedCompetitor.collectionAssignments.push(assignment);
      }

      return modifiedCompetitor;
    }) ?? [];

  if (!newParticipantIdInLineUp) {
    const collectionAssignment: any = { collectionId, collectionPosition };
    if (substitution) {
      collectionAssignment.substitutionOrder = (substitutionOrder ?? 0) + 1;
      collectionAssignment.previousParticipantId = existingParticipantId;
    }
    const assignment = {
      collectionAssignments: [collectionAssignment],
      participantId: newParticipantId,
    };
    modifiedLineUp.push(assignment);
  }

  return modifiedLineUp;
}

function manageDoublesPairParticipants({
  existingIndividualParticipantIds,
  individualParticipantIds,
  tournamentRecord,
  stack,
}) {
  let participantAdded;
  let participantRemoved;

  let result: any = getPairedParticipant({
    participantIds: individualParticipantIds,
    tournamentRecord,
  });

  if (!result.participant) {
    const participant = {
      participantRole: COMPETITOR,
      individualParticipantIds,
      participantType: PAIR,
    };
    const addResult = addParticipant({
      returnParticipant: true,
      pairOverride: true,
      tournamentRecord,
      participant,
    });
    if (addResult.error) return decorateResult({ result: addResult, stack });
    participantAdded = addResult.participant?.participantId;
  }

  result = getPairedParticipant({
    participantIds: existingIndividualParticipantIds,
    tournamentRecord,
  });
  const existingPairParticipantId = result.participant?.participantId;
  if (existingPairParticipantId) {
    const deleteResult = deleteParticipants({
      participantIds: [existingPairParticipantId],
      tournamentRecord,
    });
    if (deleteResult.success) participantRemoved = existingPairParticipantId;
  }

  return { participantAdded, participantRemoved };
}

function handleProcessCodes({
  substitutionProcessCodes,
  tournamentRecord,
  drawDefinition,
  substitution,
  tieMatchUp,
  stack,
  side,
}) {
  if (substitution || side.substitutions?.length === 1) {
    if (substitution) {
      if (substitutionProcessCodes && tieMatchUp) {
        tieMatchUp.processCodes = unique([...(tieMatchUp?.processCodes ?? []), ...substitutionProcessCodes]);
      }
    } else {
      for (const substitutionProcessCode of substitutionProcessCodes || []) {
        const codeIndex = tieMatchUp?.processCodes?.lastIndexOf(substitutionProcessCode);
        if (codeIndex !== undefined) {
          tieMatchUp?.processCodes?.splice(codeIndex, 1);
        }
      }
    }

    if (tieMatchUp) {
      modifyMatchUpNotice({
        tournamentId: tournamentRecord?.tournamentId,
        matchUp: tieMatchUp,
        context: stack,
        drawDefinition,
      });
    }
  }
}
