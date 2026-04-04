import { getAccessorValue } from '@Tools/getAccessorValue';
import { addNotice } from '@Global/state/globalState';
import { addExtension } from '../extensions/addExtension';
import { findExtension } from '@Acquire/findExtension';
import { UUID } from '@Tools/UUID';

// constants and types
import { MISSING_TOURNAMENT_RECORD, NO_PARTICIPANTS_GENERATED } from '@Constants/errorConditionConstants';
import { GROUPING_ATTRIBUTE } from '@Constants/extensionConstants';
import { INDIVIDUAL, TEAM } from '@Constants/participantConstants';
import { ADD_PARTICIPANTS } from '@Constants/topicConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';

/**
 *
 * @param {object} tournamentRecord - passed in automatically by tournamentEngine
 * @param {string} participantAttribute - optional - participant attribute to be used to group individual participants
 * @param {string} personAttribute - optional - person attribute to be used to group individual participants
 * @param {string} accessor - optional - dot delimited string targeting nested value
 * @param {string[]} uuids - optional - array of unique identifiers for genrated team participants
 * @returns { success: true } or { error }
 */

type GenerateTeamsArgs = {
  participantAttribute?: string;
  tournamentRecord: Tournament;
  addParticipants?: boolean;
  personAttribute?: string;
  teamNames?: string[];
  accessor?: string;
  uuids?: string[];
};
export function createTeamsFromParticipantAttributes({
  addParticipants = true, // optional boolean to disable add
  participantAttribute,
  tournamentRecord,
  personAttribute,
  teamNames,
  accessor,
  uuids,
}: GenerateTeamsArgs) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const teams = {};
  const individualParticipants = (tournamentRecord.participants ?? []).filter(
    ({ participantType, participantRole }) => participantType === INDIVIDUAL && participantRole === COMPETITOR,
  );

  let teamIndex = 0;

  for (const individualParticipant of individualParticipants) {
    const accessorValue =
      accessor &&
      getAccessorValue({
        element: individualParticipant,
        accessor,
      })?.value;

    const attributeValue =
      accessorValue ||
      (personAttribute && individualParticipant.person?.[personAttribute]) ||
      (participantAttribute && individualParticipant[participantAttribute]);

    if (attributeValue) {
      if (!Object.keys(teams).includes(attributeValue)) {
        teams[attributeValue] = {
          participantName: teamNames?.[teamIndex] ?? attributeValue,
          participantId: uuids?.pop() ?? UUID(),
          individualParticipantIds: [],
          participantRole: COMPETITOR,
          participantType: TEAM,
        };

        const extension = {
          value: personAttribute ?? participantAttribute,
          name: GROUPING_ATTRIBUTE,
        };
        addExtension({ element: teams[attributeValue], extension });

        teamIndex += 1;
      }

      teams[attributeValue].individualParticipantIds.push(individualParticipant.participantId);
    }
  }

  const groupingAttributes = Object.keys(teams);

  const overlappingTeamParticipantIds = (tournamentRecord.participants ?? [])
    .map((participant) => {
      if (participant.participantType !== TEAM) return undefined;
      if (participant.participantRole !== COMPETITOR) return undefined;

      const { extension } = findExtension({
        name: GROUPING_ATTRIBUTE,
        element: participant,
      });
      const groupingAttribute = extension?.value;

      if (groupingAttributes.includes(groupingAttribute)) {
        return participant.participantId;
      }
      return undefined;
    })
    .filter(Boolean);

  let participantsAdded = 0;
  const newParticipants: any[] = [];
  Object.keys(teams).forEach((attributeValue) => {
    const participant = teams[attributeValue];
    const { participantId } = participant;
    if (!overlappingTeamParticipantIds.includes(participantId)) {
      tournamentRecord.participants ??= [];
      if (addParticipants) tournamentRecord.participants.push(participant);
      newParticipants.push(participant);
      participantsAdded++;
    }
  });

  if (addParticipants && participantsAdded) {
    addNotice({
      payload: {
        tournamentId: tournamentRecord.tournamentId,
        participants: newParticipants,
      },
      topic: ADD_PARTICIPANTS,
    });
    return { ...SUCCESS, participantsAdded };
  } else if (newParticipants.length) {
    return { ...SUCCESS, newParticipants };
  } else {
    return { error: NO_PARTICIPANTS_GENERATED };
  }
}
