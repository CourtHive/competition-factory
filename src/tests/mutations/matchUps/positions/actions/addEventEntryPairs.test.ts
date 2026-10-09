import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { chunkArray, unique } from '@Tools/arrays';
import { expect, test } from 'vitest';

// constants
import { ALTERNATE, UNGROUPED } from '@Constants/entryStatusConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { DOUBLES_EVENT } from '@Constants/eventConstants';
import { ANY } from '@Constants/genderConstants';

test('ungendered participants are acceptable when event.gender is ANY', () => {
  const participantsCount = 8;
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount, participantType: INDIVIDUAL, sex: ANY },
    eventProfiles: [{ eventType: DOUBLES_EVENT, gender: ANY, eventId: 'eventId' }],
    setState: true,
  });

  const participants = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  }).participants;
  expect(participants.length).toEqual(participantsCount);

  // a profile sex of ANY generates persons with no sex: ANY is an event gender, not a person sex
  const genders = unique(participants.map((participant) => participant.person.sex));
  expect(genders).toEqual([undefined]);

  let { event } = tournamentEngine.getEvent({ eventId: 'eventId' });
  expect(event.gender).toEqual(ANY);

  const result = tournamentEngine.addEventEntries({
    participantIds: participants.map((participant) => participant.participantId),
    entryStatus: UNGROUPED,
    eventId: 'eventId',
  });
  expect(result.success).toEqual(true);

  const participantPairs = chunkArray(
    participants.map((participant) => [participant.participantId]),
    2,
  );

  const addResult = tournamentEngine.addEventEntryPairs({
    participantIdPairs: participantPairs,
    entryStatus: ALTERNATE,
    eventId: event.eventId,
  });
  expect(addResult.success).toEqual(true);
  expect(addResult.addedEntriesCount).toEqual(participantsCount / 2);
  expect(addResult.removedEntriesCount).toEqual(participantsCount);

  event = tournamentEngine.getEvent({ eventId: 'eventId' }).event;
  expect(event.entries.length).toEqual(participantsCount / 2);
});
