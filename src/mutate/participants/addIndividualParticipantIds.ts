import { decorateResult } from '@Functions/global/decorateResult';
import { updateTeamEventEntries } from './updateTeamEventEntries';
import { addNotice, getTopics } from '@Global/state/globalState';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { removeParticipantIdsFromAllTeams } from './removeIndividualParticipantIds';
import { GROUP, INDIVIDUAL, TEAM } from '@Constants/participantConstants';
import { Participant, Tournament } from '@Types/tournamentTypes';
import { MODIFY_PARTICIPANTS } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import {
  INVALID_PARTICIPANT_IDS,
  INVALID_PARTICIPANT_TYPE,
  MISSING_TOURNAMENT_RECORD,
  MISSING_VALUE,
  PARTICIPANT_NOT_FOUND,
} from '@Constants/errorConditionConstants';

type AddIndividualParticipantIdsType = {
  individualParticipantIds: string[]; // individual participantIds to be added to grouping participant
  removeFromOtherTeams?: boolean; // optional -whether or not to remove from other teams
  groupingParticipantId: string; // grouping participant to which participantIds are to be added
  tournamentRecord: Tournament; // passed in automatically by tournamentEngine
};
export function addIndividualParticipantIds({
  individualParticipantIds,
  groupingParticipantId,
  removeFromOtherTeams,
  tournamentRecord,
}: AddIndividualParticipantIdsType): ResultType & {
  groupingParticipant?: Participant;
  added?: number;
} {
  const stack = 'addIndividualParticipantIds';
  if (!tournamentRecord)
    return decorateResult({
      result: { error: MISSING_TOURNAMENT_RECORD },
      stack,
    });
  if (!groupingParticipantId || !individualParticipantIds)
    return decorateResult({ result: { error: MISSING_VALUE }, stack });

  const tournamentParticipants = tournamentRecord.participants ?? [];
  const groupingParticipant = tournamentParticipants.find(
    (participant) => participant.participantId === groupingParticipantId,
  );
  if (!groupingParticipant) return decorateResult({ result: { error: PARTICIPANT_NOT_FOUND }, stack });

  if (groupingParticipant?.participantType && ![TEAM, GROUP].includes(groupingParticipant.participantType)) {
    return decorateResult({
      context: { participantType: groupingParticipant.participantType },
      result: { error: INVALID_PARTICIPANT_TYPE },
      stack,
    });
  }

  // integrity chck to ensure only individuals can be added to groupings
  const invalidParticipantIds = individualParticipantIds.filter((participantId) => {
    const participant = tournamentParticipants.find(
      (tournamentParticipant) => tournamentParticipant.participantId === participantId,
    );
    return participant?.participantType !== INDIVIDUAL;
  });

  if (invalidParticipantIds.length)
    return decorateResult({
      result: { error: INVALID_PARTICIPANT_IDS, invalidParticipantIds },
      stack,
    });

  groupingParticipant.individualParticipantIds ??= [];
  const existingIndividualParticipantIds = groupingParticipant.individualParticipantIds;

  const participantIdsToAdd = individualParticipantIds.filter((participantId) => {
    const participantIsMember = existingIndividualParticipantIds.includes(participantId);
    return !participantIsMember;
  });

  if (participantIdsToAdd.length) {
    if (removeFromOtherTeams) {
      removeParticipantIdsFromAllTeams({
        individualParticipantIds: participantIdsToAdd,
        tournamentRecord,
      });
    }
    groupingParticipant.individualParticipantIds = groupingParticipant.individualParticipantIds.concat(
      ...participantIdsToAdd,
    );
  }

  const { topics } = getTopics();
  if (topics.includes(MODIFY_PARTICIPANTS)) {
    const updatedParticipant = tournamentParticipants.find(
      ({ participantId }) => participantId === groupingParticipantId,
    );

    addNotice({
      topic: MODIFY_PARTICIPANTS,
      payload: { participants: [updatedParticipant] },
    });
  }

  updateTeamEventEntries({
    individualParticipantIds,
    groupingParticipantId,
    tournamentRecord,
  });

  return {
    groupingParticipant: makeDeepCopy(groupingParticipant, false, true),
    added: participantIdsToAdd.length,
    ...SUCCESS,
  };
}
