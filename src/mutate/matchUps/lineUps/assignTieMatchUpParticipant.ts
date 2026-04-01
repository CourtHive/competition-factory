import { getTieMatchUpContext } from '@Query/hierarchical/tieFormats/getTieMatchUpContext';
import { removeCollectionAssignments } from '@Mutate/events/removeCollectionAssignments';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { getPairedParticipant } from '@Query/participant/getPairedParticipant';
import { deleteParticipants } from '@Mutate/participants/deleteParticipants';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { modifyParticipant } from '@Mutate/participants/modifyParticipant';
import { updateTeamLineUp } from '@Mutate/drawDefinitions/updateTeamLineUp';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { getParticipants } from '@Query/participants/getParticipants';
import { addParticipant } from '@Mutate/participants/addParticipant';
import { getTeamLineUp } from '@Query/drawDefinition/getTeamLineUp';
import { decorateResult } from '@Functions/global/decorateResult';
import { ensureSideLineUps } from './ensureSideLineUps';
import { overlap } from '@Tools/arrays';

// constants and types
import POLICY_MATCHUP_ACTIONS_DEFAULT from '@Fixtures/policies/POLICY_MATCHUP_ACTIONS_DEFAULT';
import { LineUp, PolicyDefinitions, ResultType } from '@Types/factoryTypes';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { POLICY_TYPE_MATCHUP_ACTIONS } from '@Constants/policyConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { COMPETITOR } from '@Constants/participantRoles';
import { SUCCESS } from '@Constants/resultConstants';
import {
  INVALID_PARTICIPANT,
  INVALID_PARTICIPANT_TYPE,
  INVALID_SIDE_NUMBER,
  MISSING_COLLECTION_DEFINITION,
  MISSING_PARTICIPANT_ID,
  MISSING_TIE_FORMAT,
  PARTICIPANT_NOT_FOUND,
  TEAM_NOT_FOUND,
} from '@Constants/errorConditionConstants';
import { isGendered } from '@Validators/isGendered';
import { coercedGender } from '@Helpers/coercedGender';

type AssignMatchUpSideParticipantIdArgs = {
  policyDefinitions?: PolicyDefinitions;
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  teamParticipantId?: string;
  enforceGender?: boolean;
  participantId: string;
  tieMatchUpId: string;
  sideNumber?: number;
  event: Event;
};

export function assignTieMatchUpParticipantId(
  params: AssignMatchUpSideParticipantIdArgs,
): ResultType & { deletedParticipantId?: string; modifiedLineUp?: LineUp } {
  const matchUpContext = getTieMatchUpContext(params);
  if (matchUpContext.error) return matchUpContext;
  const stack = 'assignTieMatchUpParticipantId';

  let teamParticipantId = params.teamParticipantId;
  const { tournamentRecord, drawDefinition, participantId, event } = params;

  if (!participantId) {
    return decorateResult({ result: { error: MISSING_PARTICIPANT_ID }, stack });
  }

  const validSideNumbers = new Set([1, 2]);
  if (params.sideNumber && !validSideNumbers.has(params.sideNumber)) {
    return decorateResult({ result: { error: INVALID_SIDE_NUMBER }, stack });
  }

  const {
    inContextDualMatchUp,
    inContextTieMatchUp,
    relevantAssignments,
    collectionPosition,
    teamParticipants,
    collectionId,
    matchUpType,
    dualMatchUp,
    tieFormat,
  } = matchUpContext;

  const alreadyAssigned = checkAlreadyAssigned(inContextTieMatchUp, participantId);
  if (alreadyAssigned) return decorateResult({ result: { ...SUCCESS }, stack });

  teamParticipantId = resolveTeamParticipantId({
    teamParticipantId,
    inContextDualMatchUp,
    sideNumber: params.sideNumber,
  });

  const participantToAssign = getParticipants({
    participantFilters: { participantIds: [participantId] },
    tournamentRecord,
  })?.participants?.[0];

  if (!participantToAssign) {
    return decorateResult({ result: { error: PARTICIPANT_NOT_FOUND }, stack });
  }

  const genderError = checkGenderEnforcement({
    policyDefinitions: params.policyDefinitions,
    inContextTieMatchUp,
    participantToAssign,
    tournamentRecord,
    drawDefinition,
    enforceGender: params.enforceGender,
    event,
  });
  if (genderError) return genderError;

  const { individualParticipantIds, participantType } = participantToAssign;

  if (isMatchUpEventType(SINGLES)(matchUpType) && participantType !== INDIVIDUAL) {
    return { error: INVALID_PARTICIPANT_TYPE };
  }

  const relevantParticipantIds = participantType === INDIVIDUAL ? [participantId] : individualParticipantIds;

  const participantTeam =
    (teamParticipantId && teamParticipants?.find(({ participantId }) => participantId === teamParticipantId)) ||
    teamParticipants?.find(({ individualParticipantIds }) => overlap(relevantParticipantIds, individualParticipantIds));

  if (!participantTeam) return { error: TEAM_NOT_FOUND };

  if (!teamParticipantId) teamParticipantId = participantTeam.participantId;
  if (!teamParticipantId) return { error: PARTICIPANT_NOT_FOUND };

  const sideNumber = resolveSideNumber({
    inContextTieMatchUp,
    teamParticipantId,
    relevantAssignments,
    participantTeam,
    dualMatchUp,
    sideNumber: params.sideNumber,
  });

  if (!tieFormat) {
    return { error: MISSING_TIE_FORMAT };
  }

  const collectionDefinition = tieFormat.collectionDefinitions?.find(
    (collectionDefinition) => collectionDefinition.collectionId === collectionId,
  );

  if (!collectionDefinition) return { error: MISSING_COLLECTION_DEFINITION };

  ensureSideLineUps({
    tournamentId: tournamentRecord.tournamentId,
    eventId: event.eventId,
    inContextDualMatchUp,
    drawDefinition,
    dualMatchUp,
  });

  const dualMatchUpSide = dualMatchUp?.sides?.find((side) => side.sideNumber === sideNumber);

  const tieMatchUpSide = inContextTieMatchUp?.sides?.find((side) => side.sideNumber === sideNumber);

  const lineUp =
    dualMatchUpSide?.lineUp ??
    getTeamLineUp({
      participantId: teamParticipantId,
      drawDefinition,
    })?.lineUp;

  const targetAssignments = lineUp?.filter((participantAssignment) =>
    participantAssignment.collectionAssignments?.find(
      (assignment) =>
        assignment.collectionPosition === collectionPosition &&
        assignment.collectionId === collectionId &&
        !assignment.previousParticipantId,
    ),
  );
  const assignedParticipantIds = targetAssignments?.map((assignment) => assignment?.participantId);

  const participantIds =
    (assignedParticipantIds?.length > 1 && assignedParticipantIds) ||
    (participantType === PAIR ? participantToAssign.individualParticipantIds : [participantId]);

  const removeResult = removeCollectionAssignments({
    collectionPosition,
    teamParticipantId,
    dualMatchUpSide,
    drawDefinition,
    participantIds,
    collectionId,
  });
  if (removeResult.error) return decorateResult({ result: removeResult, stack });

  const { modifiedLineUp } = removeResult;

  let deletedParticipantId;

  if (matchUpType === DOUBLES) {
    const doublesResult = handleDoublesAssignment({
      collectionPosition,
      teamParticipantId,
      tournamentRecord,
      dualMatchUpSide,
      participantType,
      drawDefinition,
      tieMatchUpSide,
      modifiedLineUp,
      participantIds,
      participantId,
      dualMatchUp,
      collectionId,
      tieFormat,
      stack,
    });
    if (doublesResult.error) return doublesResult;
    deletedParticipantId = doublesResult.deletedParticipantId;
  } else {
    const result = updateLineUp({
      collectionPosition,
      teamParticipantId,
      drawDefinition,
      modifiedLineUp,
      participantId,
      collectionId,
      tieFormat,
    });
    if (result?.error) return result;
  }

  if (dualMatchUpSide) dualMatchUpSide.lineUp = modifiedLineUp;
  if (dualMatchUp)
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      matchUp: dualMatchUp,
      context: stack,
      drawDefinition,
    });

  if (deletedParticipantId) {
    const { error } = deleteParticipants({
      participantIds: [deletedParticipantId],
      tournamentRecord,
    });
    if (error) console.log('cleanup');
  }

  return { ...SUCCESS, modifiedLineUp };
}

function checkAlreadyAssigned(inContextTieMatchUp, participantId) {
  const allTieIndividualParticipantIds = inContextTieMatchUp?.sides?.flatMap(
    (side: any) => side.participant?.individualParticipantIds || side.participant?.participantId || [],
  );
  return allTieIndividualParticipantIds?.includes(participantId);
}

function resolveTeamParticipantId({ teamParticipantId, inContextDualMatchUp, sideNumber }) {
  if (teamParticipantId) return teamParticipantId;
  if (!sideNumber) return undefined;
  return inContextDualMatchUp?.sides?.find((side) => side.sideNumber === sideNumber)?.participantId;
}

function checkGenderEnforcement({
  policyDefinitions,
  inContextTieMatchUp,
  participantToAssign,
  tournamentRecord,
  drawDefinition,
  enforceGender,
  event,
}) {
  const { appliedPolicies } = getAppliedPolicies({
    tournamentRecord,
    drawDefinition,
    event,
  });

  const matchUpActionsPolicy =
    policyDefinitions?.[POLICY_TYPE_MATCHUP_ACTIONS] ??
    appliedPolicies?.[POLICY_TYPE_MATCHUP_ACTIONS] ??
    POLICY_MATCHUP_ACTIONS_DEFAULT[POLICY_TYPE_MATCHUP_ACTIONS];

  const genderEnforced = (enforceGender ?? matchUpActionsPolicy?.participants?.enforceGender) !== false;

  if (
    genderEnforced &&
    isGendered(inContextTieMatchUp?.gender) &&
    coercedGender(inContextTieMatchUp?.gender) !== coercedGender(participantToAssign.person?.sex)
  ) {
    return { error: INVALID_PARTICIPANT, info: 'Gender mismatch' };
  }

  return undefined;
}

function resolveSideNumber({
  inContextTieMatchUp,
  teamParticipantId,
  relevantAssignments,
  participantTeam,
  dualMatchUp,
  sideNumber: paramSideNumber,
}) {
  const teamAssignment = relevantAssignments?.find(
    (assignment) => assignment.participantId === participantTeam?.participantId,
  );
  const teamDrawPosition = teamAssignment?.drawPosition;
  const dualTeamSideNumber = dualMatchUp?.sides?.find(
    (side: any) => side.participantId === teamParticipantId,
  )?.sideNumber;
  const teamSideNumber = inContextTieMatchUp?.sides?.find(
    (side: any) => teamDrawPosition && side.drawPosition === teamDrawPosition,
  )?.sideNumber;
  return dualTeamSideNumber ?? teamSideNumber ?? paramSideNumber;
}

function handleDoublesAssignment({
  collectionPosition,
  teamParticipantId,
  tournamentRecord,
  dualMatchUpSide,
  participantType,
  drawDefinition,
  tieMatchUpSide,
  modifiedLineUp,
  participantIds,
  participantId,
  dualMatchUp,
  collectionId,
  tieFormat,
  stack,
}) {
  let deletedParticipantId;

  if (participantType !== PAIR) {
    let result: any = updateLineUp({
      collectionPosition,
      teamParticipantId,
      drawDefinition,
      modifiedLineUp,
      participantId,
      collectionId,
      tieFormat,
    });
    if (result?.error) return decorateResult({ result, stack });

    result = addParticipantId2Pair({
      side: tieMatchUpSide,
      tournamentRecord,
      participantId,
    });
    if (result.error) return result;
    deletedParticipantId = result.deletedParticipantId;

    if (dualMatchUpSide) dualMatchUpSide.lineUp = modifiedLineUp;
    if (dualMatchUp) {
      modifyMatchUpNotice({
        tournamentId: tournamentRecord?.tournamentId,
        matchUp: dualMatchUp,
        context: stack,
        drawDefinition,
      });
    }
  } else {
    for (const id of participantIds) {
      updateLineUp({
        collectionPosition,
        teamParticipantId,
        drawDefinition,
        modifiedLineUp,
        participantId: id,
        collectionId,
        tieFormat,
      });
    }
  }

  return { ...SUCCESS, deletedParticipantId };
}

function addParticipantId2Pair({ side, tournamentRecord, participantId }) {
  let deletedParticipantId;

  if (!side.participant) {
    const newPairParticipant = {
      individualParticipantIds: [participantId],
      participantRole: COMPETITOR,
      participantType: PAIR,
    };
    const result = addParticipant({
      participant: newPairParticipant,
      pairOverride: true,
      tournamentRecord,
    });
    if (result.error) return result;
  } else {
    const individualParticipantIds = side.participant.individualParticipantIds || [];

    const sideParticipantsCount = individualParticipantIds.filter(Boolean).length;

    if (sideParticipantsCount === 1) {
      const { participant } = getPairedParticipant({
        participantIds: individualParticipantIds,
        tournamentRecord,
      });

      individualParticipantIds.push(participantId);

      const { participant: existingParticipant } = getPairedParticipant({
        participantIds: individualParticipantIds,
        tournamentRecord,
      });

      if (!existingParticipant && participant) {
        participant.individualParticipantIds = individualParticipantIds;
        const result = modifyParticipant({
          pairOverride: true,
          tournamentRecord,
          participant,
        });
        if (result.error) return result;
      } else {
        deletedParticipantId = participant?.participantId;
      }
    }
  }

  return { ...SUCCESS, deletedParticipantId };
}

function updateLineUp({
  collectionPosition,
  teamParticipantId,
  drawDefinition,
  modifiedLineUp,
  participantId,
  collectionId,
  tieFormat,
}) {
  const templateTeamLineUp = getTeamLineUp({
    participantId: teamParticipantId,
    drawDefinition,
  })?.lineUp;

  const participantCompetitiorProfile = (modifiedLineUp || templateTeamLineUp)?.find(
    (teamCompetitor) => teamCompetitor?.participantId === participantId,
  );

  const newAssignment = { collectionId, collectionPosition };

  if (participantCompetitiorProfile) {
    participantCompetitiorProfile.collectionAssignments.push(newAssignment);
  } else {
    const teamCompetitor = {
      collectionAssignments: [newAssignment],
      participantId,
    };

    modifiedLineUp.push(teamCompetitor);
  }

  return updateTeamLineUp({
    participantId: teamParticipantId,
    lineUp: modifiedLineUp,
    drawDefinition,
    tieFormat,
  });
}
