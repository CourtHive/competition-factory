import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { TEAM_DOUBLES_3_AGGREGATION } from '@Constants/tieFormatConstants';
import { ALTERNATE } from '@Constants/entryStatusConstants';
import { FEMALE, MALE } from '@Constants/genderConstants';
import { TEAM } from '@Constants/eventConstants';

const oneElevenOhOne = '1111-01-01';
const two2222 = '2222-02-02';

it('can generate team events using participantsProfile.teamKey and personData', () => {
  // prettier-ignore
  const personData = [
    { firstName: 'Male', lastName: 'One Team 1', sex: MALE, birthDate: oneElevenOhOne },
    { firstName: 'Male', lastName: 'Two Team 1', sex: MALE, birthDate: oneElevenOhOne },
    { firstName: 'Male', lastName: 'Three Team 1', sex: MALE, birthDate: oneElevenOhOne },
    { firstName: 'Female', lastName: 'One Team 1', sex: FEMALE, birthDate: oneElevenOhOne },
    { firstName: 'Female', lastName: 'Two Team 1', sex: FEMALE, birthDate: oneElevenOhOne },
    { firstName: 'Female', lastName: 'Three Team 1', sex: FEMALE, birthDate: oneElevenOhOne },
    { firstName: 'Male', lastName: 'One Team 2', sex: MALE, birthDate: two2222 },
    { firstName: 'Male', lastName: 'Two Team 2', sex: MALE, birthDate: two2222 },
    { firstName: 'Male', lastName: 'Three Team 2', sex: MALE, birthDate: two2222 },
    { firstName: 'Female', lastName: 'One Team 2', sex: FEMALE, birthDate: two2222 },
    { firstName: 'Female', lastName: 'Two Team 2', sex: FEMALE, birthDate: two2222 },
    { firstName: 'Female', lastName: 'Three Team 2', sex: FEMALE, birthDate: two2222 },
  ];

  const mockProfile = {
    drawProfiles: [
      {
        tieFormatName: TEAM_DOUBLES_3_AGGREGATION,
        considerEventEntries: false,
        tournamentAlternates: 2,
        eventType: TEAM,
        drawSize: 2,
      },
    ],
    participantsProfile: {
      teamKey: {
        teamNames: [`Queen's Club`, 'United'],
        personAttribute: 'birthDate',
      },
      personData,
    },
  };

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord(mockProfile);

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });

  expect(event.entries.length).toEqual(4);
  expect(drawDefinition.entries.length).toEqual(2);
  expect(event.entries.filter((entry) => entry.entryStatus === ALTERNATE).length).toEqual(2);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM] },
  });

  const names = participants.map((participant) => participant.participantName);
  expect(names.length).toEqual(4);
  expect(names.sort()).toEqual([`Queen's Club`, 'Team 1', 'Team 2', 'United']);

  const { tournamentPersons } = tournamentEngine.getTournamentPersons();
  tournamentPersons.forEach((person) => expect([oneElevenOhOne, two2222].includes(person.birthDate)).toEqual(true));
});
