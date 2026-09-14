import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { generateRange } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants and fixtures
import { INDIVIDUAL, PAIR, TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { DOUBLES_EVENT, TEAM_EVENT } from '@Constants/eventConstants';
import names from '@Fixtures/data/names.json';

const personData = generateRange(0, 20).map((i) => ({
  lastName: names.lastNames[i],
  firstName: names.firstMale[i],
}));

const formatsScenarios = [
  {
    formats: {
      PAIR: { personFormat: 'F.Last', doublesJoiner: '|' },
      INDIVIDUAL: { personFormat: 'f. last' },
    },
    expectation: {
      pairParticipantName: 'A.Abbey|A.Ahern',
      participantName: 'a. abbey',
    },
  },
  {
    formats: {
      PAIR: { personFormat: 'LAST', doublesJointer: '/' },
      INDIVIDUAL: { personFormat: 'LAST, First' },
    },
    expectation: {
      pairParticipantName: 'ABBEY/AHERN',
      participantName: 'ABBEY, Alan',
    },
  },
  {
    formats: {
      PAIR: { personFormat: 'LastFirst', doublesJointer: '/' },
      INDIVIDUAL: { personFormat: 'LASTFirst' },
    },
    expectation: {
      pairParticipantName: 'AbbeyAlan/AhernAldous',
      participantName: 'ABBEYAlan',
    },
  },
];

it.each(formatsScenarios)('can regenerate participantNames', ({ formats, expectation }) => {
  tournamentEngine.devContext(true);
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { personData, shuffle: false },
    drawProfiles: [
      { drawSize: 8, eventType: DOUBLES_EVENT },
      { drawSize: 2, eventType: TEAM_EVENT },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const pFilter = (participants, type) => participants.filter(({ participantType }) => participantType === type);

  const participants = tournamentEngine.getParticipants({
    withIndividualParticipants: true,
  }).participants;

  const teamParticipants = pFilter(participants, TEAM_PARTICIPANT);
  const individualParticpants = pFilter(participants, INDIVIDUAL);
  const pairParticipants = pFilter(participants, PAIR);

  const result = tournamentEngine.regenerateParticipantNames({ formats });
  expect(result.success).toEqual(true);

  const updatedParicipants = tournamentEngine.getParticipants({
    withIndividualParticipants: true,
  }).participants;

  const updateTeamParticipants = pFilter(updatedParicipants, TEAM_PARTICIPANT);
  const updateIndividualParticpants = pFilter(updatedParicipants, INDIVIDUAL);
  const updatedPairParticipants = pFilter(updatedParicipants, PAIR);

  // Team participantNames should never be updated
  teamParticipants.forEach((team, i) =>
    expect(team.participantName).toEqual(updateTeamParticipants[i].participantName),
  );

  expect(individualParticpants[0].participantName).not.toEqual(updateIndividualParticpants[0].participantName);
  expect(pairParticipants[0].participantName).not.toEqual(updatedPairParticipants[0].participantName);

  expect(updateIndividualParticpants[0].participantName).toEqual(expectation.participantName);
  expect(updatedPairParticipants[0].participantName).toEqual(expectation.pairParticipantName);
});
