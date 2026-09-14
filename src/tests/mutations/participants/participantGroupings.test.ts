import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { GROUP, INDIVIDUAL } from '@Constants/participantConstants';
import { COMPETITOR, OTHER } from '@Constants/participantRoles';
import { MODIFY_PARTICIPANTS } from '@Constants/topicConstants';
import { TEAM } from '@Constants/eventConstants';
import {
  INVALID_PARTICIPANT_IDS,
  INVALID_PARTICIPANT_TYPE,
  INVALID_VALUES,
  MISSING_VALUE,
  PARTICIPANT_NOT_FOUND,
} from '@Constants/errorConditionConstants';

let participantModifyEventsCounter = 0;
setSubscriptions({
  subscriptions: {
    [MODIFY_PARTICIPANTS]: (participants) => {
      participantModifyEventsCounter += participants?.length || 0;
    },
  },
});

it('can add a GROUP participant and add individualParticipantIds', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  tournamentEngine.setState(tournamentRecord);

  const tournamentParticipants = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  }).participants;

  // test adding invalid individualParticipantIds, in this case entire participants
  let participantIds = tournamentParticipants.slice(0, 3);
  let result = tournamentEngine.addParticipant({
    participant: {
      participantType: GROUP,
      participantRole: OTHER,
      individualParticipantIds: participantIds,
    },
  });
  expect(result.error).toEqual(INVALID_VALUES);

  // test adding non-existent individualParticipantIds
  result = tournamentEngine.addParticipant({
    participant: {
      participantType: GROUP,
      participantRole: OTHER,
      individualParticipantIds: ['abc', '123'],
    },
  });
  expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);

  // first three individual participants belong to groupParticipant
  participantIds = tournamentParticipants.slice(0, 3).map((participant) => participant.participantId);

  result = tournamentEngine.addParticipant({
    returnParticipant: true,
    participant: {
      participantType: GROUP,
      participantRole: OTHER,
      individualParticipantIds: participantIds,
    },
  });
  expect(result.success).toEqual(true);

  const groupingParticipant = result.participant;
  const { participantId: groupingParticipantId } = groupingParticipant;

  result = tournamentEngine.addIndividualParticipantIds();
  expect(result.error).toEqual(MISSING_VALUE);
  result = tournamentEngine.addIndividualParticipantIds({
    groupingParticipantId,
  });
  expect(result.error).toEqual(MISSING_VALUE);

  let individualParticipantIds = tournamentParticipants.slice(0, 4);
  result = tournamentEngine.addIndividualParticipantIds({
    groupingParticipantId,
    individualParticipantIds,
  });
  expect(result.error).not.toBeUndefined();
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);

  individualParticipantIds = tournamentParticipants.slice(0, 4).map((participant) => participant.participantId);

  // attempt to add to non-existent group participant
  result = tournamentEngine.addIndividualParticipantIds({
    groupingParticipantId: 'abc',
    individualParticipantIds,
  });
  expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);

  // attempt to add to to non-grouping participantType
  result = tournamentEngine.addIndividualParticipantIds({
    groupingParticipantId: individualParticipantIds[0],
    individualParticipantIds,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_TYPE);

  result = tournamentEngine.addIndividualParticipantIds({
    groupingParticipantId,
    individualParticipantIds,
  });
  expect(result.added).toEqual(1);
  expect(result.groupingParticipant.individualParticipantIds.length).toEqual(4);

  result = tournamentEngine.addIndividualParticipantIds({
    groupingParticipantId,
    individualParticipantIds,
    removeFromOtherTeams: true,
  });
  expect(result.added).toEqual(0);
  expect(result.groupingParticipant.individualParticipantIds.length).toEqual(4);
});

it('can add a GROUP participant and remove individualParticipantIds', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  tournamentEngine.setState(tournamentRecord);

  const tournamentParticipants = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  }).participants;

  // first four individual participants belong to groupParticipant
  const individualParticipantIds = tournamentParticipants.slice(0, 4).map((participant) => participant.participantId);

  let result = tournamentEngine.addParticipant({
    returnParticipant: true,
    participant: {
      participantType: GROUP,
      participantRole: OTHER,
      individualParticipantIds,
    },
  });
  expect(result.success).toEqual(true);

  const groupingParticipant = result.participant;
  const { participantId: groupingParticipantId } = groupingParticipant;

  result = tournamentEngine.removeIndividualParticipantIds({
    groupingParticipantId,
  });
  expect(result.error).toEqual(MISSING_VALUE);

  // attempting to remove a non-existent individualParticipantId is SUCCESS
  result = tournamentEngine.removeIndividualParticipantIds({
    individualParticipantIds: ['abc'],
    groupingParticipantId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.removeIndividualParticipantIds({
    groupingParticipantId: individualParticipantIds[0],
    individualParticipantIds,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_TYPE);

  result = tournamentEngine.removeIndividualParticipantIds({
    individualParticipantIds: individualParticipantIds.slice(2),
    groupingParticipantId,
  });
  expect(result.success).toEqual(true);
  expect(result.removed.length).toEqual(2);

  result = tournamentEngine.removeIndividualParticipantIds({
    individualParticipantIds: ['bogusId'],
    groupingParticipantId,
  });
  expect(result.success).toEqual(true);
  expect(result.removed.length).toEqual(0);

  result = tournamentEngine.removeIndividualParticipantIds({
    individualParticipantIds: individualParticipantIds.slice(2),
  });
  expect(result.error).toEqual(MISSING_VALUE);
  result = tournamentEngine.removeIndividualParticipantIds({
    individualParticipantIds: individualParticipantIds.slice(2),
    groupingParticipantId: 'bogusId',
  });
  expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);
});

it('can modify individualParticipantIds of a grouping participant', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();

  tournamentEngine.setState(tournamentRecord);
  const tournamentParticipants = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  }).participants;

  // first four individual participants belong to groupParticipant
  const individualParticipantIds = tournamentParticipants.slice(0, 4).map((participant) => participant.participantId);

  let result = tournamentEngine.addParticipant({
    returnParticipant: true,
    participant: {
      participantType: GROUP,
      participantRole: OTHER,
      individualParticipantIds,
    },
  });
  expect(result.success).toEqual(true);

  const groupingParticipant = result.participant;
  const { participantId: groupingParticipantId } = groupingParticipant;

  let { participant } = tournamentEngine.findParticipant({
    participantId: groupingParticipantId,
  });
  expect(individualParticipantIds).toEqual(participant.individualParticipantIds);

  const newIndividualParticipantIds = tournamentParticipants
    .slice(2, 6)
    .map((participant) => participant.participantId);

  result = tournamentEngine.modifyIndividualParticipantIds({
    groupingParticipantId,
  });
  expect(result.error).toEqual(MISSING_VALUE);

  result = tournamentEngine.modifyIndividualParticipantIds({
    individualParticipantIds: newIndividualParticipantIds,
    groupingParticipantId: 'bogusId',
  });
  expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);

  result = tournamentEngine.modifyIndividualParticipantIds({
    individualParticipantIds: newIndividualParticipantIds,
    groupingParticipantId,
  });
  expect(result.added).toEqual(2);
  expect(result.removed.length).toEqual(2);
  expect(result.success).toEqual(true);
  expect(participantModifyEventsCounter).toBeGreaterThan(0);

  ({ participant } = tournamentEngine.findParticipant({
    participantId: groupingParticipantId,
  }));

  expect(newIndividualParticipantIds).toEqual(participant.individualParticipantIds);
});

it('can remove individualParticipantIds from a grouping participant', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  tournamentEngine.setState(tournamentRecord);

  const tournamentParticipants = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  }).participants;

  // first four individual participants belong to groupParticipant
  const individualParticipantIds = tournamentParticipants.map((participant) => participant.participantId);

  let result = tournamentEngine.addParticipant({
    returnParticipant: true,
    participant: {
      participantType: GROUP,
      participantRole: COMPETITOR,
      individualParticipantIds,
    },
  });
  expect(result.success).toEqual(true);

  const groupingParticipant = result.participant;
  const { participantId: groupingParticipantId } = groupingParticipant;

  const { participant } = tournamentEngine.findParticipant({
    participantId: groupingParticipantId,
  });
  expect(individualParticipantIds).toEqual(participant.individualParticipantIds);

  result = tournamentEngine.removeParticipantIdsFromAllTeams({
    individualParticipantIds,
    groupingType: [GROUP],
  });
  expect(result.success).toEqual(true);
});

it('will add individualParticipants to events as UNGROUPED when removed from TEAMs', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM }],
  });

  tournamentEngine.setState(tournamentRecord);

  const teamParticipant = tournamentRecord.participants.find((participant) => participant.participantType === TEAM);

  const individualParticipantIdToRemove = teamParticipant.individualParticipantIds[0];

  const result = tournamentEngine.removeIndividualParticipantIds({
    individualParticipantIds: [individualParticipantIdToRemove],
    groupingParticipantId: teamParticipant.participantId,
    addIndividualParticipantsToEvents: true,
  });
  expect(result.success).toEqual(true);

  const { event } = tournamentEngine.getEvent({ eventId });
  expect(event.entries.length).toEqual(5);
});
