import { getParticipantId } from '@Functions/global/extractors';
import tournamentEngine from '@Engines/syncEngine';
import { mocksEngine } from '../../..';
import { expect, test } from 'vitest';

// constants
import { DIRECT_ACCEPTANCE, UNGROUPED } from '@Constants/entryStatusConstants';
import { INVALID_PARTICIPANT_IDS } from '@Constants/errorConditionConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { TEAM } from '@Constants/eventConstants';

test('adding individualParticipantIds to TEAM participants removes them from team event entries', () => {
  const eventProfiles = [
    {
      eventType: TEAM,
      drawProfiles: [{ drawSize: 2 }, { drawSize: 2 }],
    },
  ];
  const {
    eventIds: [eventId],
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 10 },
    eventProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  const { participants: individualParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });

  const { participants: teamParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM] },
  });

  const individualParticipantIdsInTeams = teamParticipants
    .map(({ individualParticipantIds }) => individualParticipantIds)
    .flat();

  const individualsParticipantsNotInTeams = individualParticipants.filter(
    ({ participantId }) => !individualParticipantIdsInTeams.includes(participantId),
  );

  let { event } = tournamentEngine.getEvent({ eventId });

  const participantIds = individualsParticipantsNotInTeams.map(getParticipantId);

  let result = tournamentEngine.addEventEntries({
    entryStatus: UNGROUPED,
    participantIds,
    drawId,
    event,
  });
  expect(result.success).toEqual(true);

  ({ event } = tournamentEngine.getEvent({ eventId }));

  const ungroupedEntries = event.entries.filter(({ entryStatus }) => entryStatus === UNGROUPED);
  expect(ungroupedEntries.length).toEqual(participantIds.length);

  const teamEntries = event.entries.filter(({ entryStatus }) => entryStatus === DIRECT_ACCEPTANCE);

  result = tournamentEngine.addIndividualParticipantIds({
    groupingParticipantId: teamEntries[0].participantId,
    individualParticipantIds: participantIds,
  });
  expect(result.success).toEqual(true);
  expect(result.added).toEqual(participantIds.length);

  ({ event } = tournamentEngine.getEvent({ eventId }));
  expect(event.entries.length).toEqual(2);
});

test('will remove UNGROUPED individual participants when their team is added to event entries', () => {
  const participantsCount = 8;
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantType: TEAM, participantsCount },
  });

  tournamentEngine.setState(tournamentRecord);

  let result = tournamentEngine.addEvent({
    event: { eventType: TEAM },
  });

  const { event: eventResult } = result;
  const { eventId } = eventResult;
  expect(result.success).toEqual(true);

  const { participants: individualParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const individualParticipantIds = individualParticipants.map((p) => p.participantId);

  result = tournamentEngine.addEventEntries({
    participantIds: individualParticipantIds,
    eventId,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);

  result = tournamentEngine.addEventEntries({
    participantIds: individualParticipantIds,
    entryStatus: UNGROUPED,
    eventId,
  });
  expect(result.success).toEqual(true);
  let { event } = tournamentEngine.getEvent({ eventId });
  expect(event.entries.filter((entry) => entry.entryStatus === UNGROUPED).length).toEqual(64);
  expect(event.entries.filter((entry) => entry.entryStatus === DIRECT_ACCEPTANCE).length).toEqual(0);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM] },
  });
  const participantIds = participants.map((p) => p.participantId);
  expect(participants.length).toEqual(participantsCount);

  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  event = tournamentEngine.getEvent({ eventId }).event;
  expect(event.entries.filter((entry) => entry.entryStatus === UNGROUPED).length).toEqual(0);
  expect(event.entries.filter((entry) => entry.entryStatus === DIRECT_ACCEPTANCE).length).toEqual(8);
});
