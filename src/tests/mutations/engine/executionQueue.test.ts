import mocksEngine from '@Assemblies/engines/mock';
import asyncEngine from '@Engines/asyncEngine';
import syncEngine from '@Engines/syncEngine';
import { it, expect } from 'vitest';

// constants
import { METHOD_NOT_FOUND, MISSING_EVENT, MISSING_PARTICIPANT_ID } from '@Constants/errorConditionConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { DOUBLES } from '@Constants/eventConstants';

it.each([syncEngine, asyncEngine])('supports rollbackOnError', async (tournamentEngine) => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  await tournamentEngine.setState(tournamentRecord);
  let result = await tournamentEngine.executionQueue([{ method: 'getEvent' }]);
  expect(result.error).toEqual(MISSING_EVENT);
  expect(result.rolledBack).toEqual(false);
  result = await tournamentEngine.executionQueue([{ method: 'getEvent' }], true);
  expect(result.error).toEqual(MISSING_EVENT);
  expect(result.rolledBack).toEqual(true);
});

it.each([syncEngine, asyncEngine])('supports rollbackOnError', async (competitionEngine) => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  await competitionEngine.setState(tournamentRecord);
  let result = await competitionEngine.executionQueue([{ method: 'toggleParticipantCheckInState' }]);
  expect([MISSING_PARTICIPANT_ID].includes(result.error)).toEqual(true);
  expect(result.rolledBack).toEqual(false);
  result = await competitionEngine.executionQueue([{ method: 'toggleParticipantCheckInState' }], true);
  expect([MISSING_PARTICIPANT_ID].includes(result.error)).toEqual(true);
  expect(result.rolledBack).toEqual(true);
});

it.each([syncEngine, asyncEngine])('tournamentEngine can execute methods in a queue', async (tournamentEngine) => {
  let result = await tournamentEngine.newTournamentRecord();
  expect(result.success).toEqual(true);

  result = await tournamentEngine.executionQueue([{ method: 'getTournamentInfo' }]);
  expect(result.results.length).toEqual(1);
  expect(result.results[0].tournamentInfo.tournamentId).not.toBeUndefined();

  result = await tournamentEngine.executionQueue([{ method: 'nonExistingMethod' }, { method: 'getTournamentInfo' }]);
  expect(result.error).toEqual(METHOD_NOT_FOUND);
});

it.each([syncEngine, asyncEngine])('competitionEngine can execute methods in a queue', async (competitionEngine) => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  let result = competitionEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  result = await competitionEngine.executionQueue([{ method: 'getCompetitionDateRange' }]);
  expect(result.results.length).toEqual(1);
  expect(result.results[0].startDate).not.toBeUndefined();
  expect(result.results[0].endDate).not.toBeUndefined();

  result = await competitionEngine.executionQueue([
    { method: 'nonExistingMethod' },
    { method: 'getCompetitionDateRange' },
  ]);
  expect(result.error).toEqual(METHOD_NOT_FOUND);
});

it.each([syncEngine, asyncEngine])('tournamentEngine processes executionQueue params', async (tournamentEngine) => {
  const drawProfiles = [{ drawSize: 32, eventType: DOUBLES }];
  const { tournamentRecord } = await mocksEngine.generateTournamentRecord({
    drawProfiles,
  });
  await tournamentEngine.setState(tournamentRecord);
  const result = await tournamentEngine.executionQueue([
    {
      method: 'getParticipants',
      params: { participantFilters: { participantTypes: [PAIR] } },
    },
    {
      method: 'getParticipants',
      params: { participantFilters: { participantTypes: [INDIVIDUAL] } },
    },
  ]);
  expect(result.results[0].participants.length).toEqual(32);
  expect(result.results[1].participants.length).toEqual(64);
});

it.each([syncEngine, asyncEngine])('competitionEngine processes executionQueue params', async (competitionEngine) => {
  const drawProfiles = [{ drawSize: 32, eventType: DOUBLES }];
  const { tournamentRecord } = await mocksEngine.generateTournamentRecord({
    drawProfiles,
  });
  await competitionEngine.setState(tournamentRecord);
  const result = await competitionEngine.executionQueue([
    {
      method: 'getCompetitionParticipants',
      params: { participantFilters: { participantTypes: [PAIR] } },
    },
    {
      method: 'getCompetitionParticipants',
      params: { participantFilters: { participantTypes: [INDIVIDUAL] } },
    },
  ]);
  expect(result.results[0].participants.length).toEqual(32);
  expect(result.results[1].participants.length).toEqual(64);
});
