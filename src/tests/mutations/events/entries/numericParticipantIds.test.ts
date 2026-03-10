import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { ALTERNATE } from '@Constants/entryStatusConstants';
import { DOUBLES_EVENT } from '@Constants/eventConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { MALE } from '@Constants/genderConstants';

// Regression: numeric participantIds caused pair individualParticipants to resolve as undefined
// because getParticipants uses a Map keyed by strings (from Object.keys), but Map.get()
// with a numeric key doesn't match the string key (strict equality).
test('addEventEntryPairs resolves individualParticipants with numeric participantIds', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 0 },
  });

  tournamentEngine.setState(tournamentRecord);

  // add individual participants with numeric participantIds
  const participants = [
    {
      participantId: 100001,
      participantType: INDIVIDUAL,
      participantRole: COMPETITOR,
      participantName: 'SMITH, John',
      person: { standardFamilyName: 'Smith', standardGivenName: 'John', sex: MALE },
    },
    {
      participantId: 100002,
      participantType: INDIVIDUAL,
      participantRole: COMPETITOR,
      participantName: 'JONES, Bob',
      person: { standardFamilyName: 'Jones', standardGivenName: 'Bob', sex: MALE },
    },
    {
      participantId: 100003,
      participantType: INDIVIDUAL,
      participantRole: COMPETITOR,
      participantName: 'DOE, James',
      person: { standardFamilyName: 'Doe', standardGivenName: 'James', sex: MALE },
    },
    {
      participantId: 100004,
      participantType: INDIVIDUAL,
      participantRole: COMPETITOR,
      participantName: 'BROWN, Tom',
      person: { standardFamilyName: 'Brown', standardGivenName: 'Tom', sex: MALE },
    },
  ];

  let result = tournamentEngine.addParticipants({ participants });
  expect(result.success).toEqual(true);

  // add a doubles event
  const event = { eventType: DOUBLES_EVENT, eventName: 'Doubles', gender: MALE };
  result = tournamentEngine.addEvent({ event });
  expect(result.success).toEqual(true);
  const { eventId } = result.event;

  // add entry pairs using numeric participantIds
  result = tournamentEngine.addEventEntryPairs({
    participantIdPairs: [
      [100001, 100002],
      [100003, 100004],
    ],
    entryStatus: ALTERNATE,
    eventId,
  });
  expect(result.success).toEqual(true);
  expect(result.addedEntriesCount).toEqual(2);

  // verify pair participants were created with correct individualParticipantIds
  const { participants: allParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
    withIndividualParticipants: true,
  });
  expect(allParticipants.length).toEqual(2);

  for (const pair of allParticipants) {
    expect(pair.individualParticipantIds).toHaveLength(2);
    expect(pair.individualParticipants).toHaveLength(2);

    // each individualParticipant must be defined and have a participantName
    for (const individual of pair.individualParticipants) {
      expect(individual).toBeDefined();
      expect(individual.participantName).toBeDefined();
      expect(individual.participantType).toEqual(INDIVIDUAL);
    }
  }
});
