import { completeDrawMatchUps } from '@Assemblies/generators/mocks/completeDrawMatchUps';
import { setGlobalLog, setMethods, setStateProvider } from '@Global/state/globalState';
import { deleteDrawDefinitions } from '@Mutate/events/deleteDrawDefinitions';
import { factoryVersion as version } from '@Functions/global/factoryVersion';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { getParticipants } from '@Query/participants/getParticipants';
import asyncGlobalState from '../../../examples/asyncEngine/asyncGlobalState';
import * as eventGovernor from '@Assemblies/governors/eventGovernor';
import * as query from '@Assemblies/governors/queryGovernor';
import { getMethods } from '@Global/state/syncGlobalState';
import asyncEngine from '@Assemblies/engines/async';
import mocksEngine from '@Assemblies/engines/mock';
import syncEngine from '@Assemblies/engines/sync';
import askEngine from '@Assemblies/engines/ask';
import { expect, test } from 'vitest';

import { MUTATE } from '@Constants/methodConstants';
import {
  INVALID_VALUES,
  METHOD_NOT_FOUND,
  MISSING_ASYNC_STATE_PROVIDER,
  SCORES_PRESENT,
} from '@Constants/errorConditionConstants';

test('sync syncEngine can set state and execute methods', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
  });
  const tournamentId = tournamentRecord.tournamentId;

  // syncEngine can set state
  const stateResult = syncEngine.setState(tournamentRecord);
  expect(stateResult.success).toEqual(true);

  // syncEngine can get state, confirming set state was successful
  let state = syncEngine.getState();
  expect(state.tournamentId === tournamentId).toEqual(true);
  expect(state.tournamentRecords[tournamentId].tournamentId === tournamentId).toEqual(true);

  // syncEngine can execute a method which is passed as a parameter
  let executionResult = syncEngine.execute({
    completeDrawMatchUps,
    params: { drawId },
  });
  expect(executionResult.success).toEqual(true);
  expect(executionResult.completedCount).toEqual(7);

  // syncEngine can get state, confirming method execution was successful
  state = syncEngine.getState();
  const competitionParticipants = query.getCompetitionParticipants(state).participants;
  expect(competitionParticipants?.length).toEqual(8);

  const matchUps = query.allCompetitionMatchUps(state).matchUps;
  expect(matchUps?.length).toEqual(7);

  const allCompleted = matchUps?.every(checkScoreHasValue);
  expect(allCompleted).toEqual(true);

  // syncEngine will throw error if method is not found
  executionResult = syncEngine.executionQueue([
    {
      method: 'deleteDrawDefinitions',
      params: { drawIds: [drawId] },
    },
  ]);

  expect(executionResult.error).toEqual(METHOD_NOT_FOUND);

  // methods can be set in global state
  setMethods({ deleteDrawDefinitions });
  const methodResult = getMethods();
  expect(typeof methodResult['deleteDrawDefinitions']).toEqual('function');

  // syncEngine can execute a method which is set in global state
  executionResult = syncEngine.executionQueue([
    {
      method: 'deleteDrawDefinitions',
      params: { drawIds: [drawId] },
    },
  ]);

  expect(executionResult.error).toEqual(SCORES_PRESENT);

  // syncEngine can execute a method which is set in global state
  executionResult = syncEngine.executionQueue([
    {
      params: { drawIds: [drawId], force: true },
      method: 'deleteDrawDefinitions',
    },
  ]);

  expect(executionResult.success).toEqual(true);
});

test('syncEngine can import and execute methods', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
  });

  syncEngine.setState(tournamentRecord);

  // askEngine can import methods
  const importResult = syncEngine.importMethods(eventGovernor, [MUTATE]);
  expect(importResult.success).toEqual(true);
  expect(typeof importResult.deleteDrawDefinitions).toEqual('function');

  // syncEngine can execute imported methods
  const executionResult = syncEngine.deleteDrawDefinitions({
    drawIds: [drawId],
  });
  expect(executionResult.success).toEqual(true);
});

test('askEngine can import and execute methods', () => {
  const globalLog = (log) => {
    expect(log.log.method).toEqual('getParticipants');
    expect(log.engine).toEqual('ask');
  };
  setGlobalLog(globalLog);

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
  });

  askEngine.setState(tournamentRecord);

  let executionResult = askEngine.execute({ getParticipants });
  expect(executionResult.participants.length).toEqual(8);

  // askEngine can import methods
  const importResult = askEngine.importMethods({ getParticipants });
  expect(importResult.success).toEqual(true);
  expect(typeof importResult.getParticipants).toEqual('function');

  // askEngine can execute imported methods
  executionResult = askEngine.getParticipants();
  expect(executionResult.participants.length).toEqual(8);
});

test.each([askEngine, syncEngine])('execution path coverage', async (engine) => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
  });

  await engine.setState(tournamentRecord);

  // askEngine can import methods
  const importResult = await engine.importMethods({ getParticipants });
  expect(importResult.success).toEqual(true);

  // askEngine can execute imported methods
  let executionResult = await engine.execute({ method: 'getParticipants' });
  expect(executionResult.participants.length).toEqual(8);

  executionResult = await engine.execute({});
  expect(executionResult.error).toEqual(METHOD_NOT_FOUND);

  executionResult = await engine.execute({ f1: () => {}, f2: () => {} });
  expect(executionResult.error).toEqual(INVALID_VALUES);

  executionResult = await engine.execute({ method: 'unknownMethod' });
  expect(executionResult.error).toEqual(METHOD_NOT_FOUND);

  executionResult = await engine.execute({
    method: 'version',
  });
  expect(executionResult).toEqual(version());
});

test('execution path coverage', async () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
  });

  let engineAsync = asyncEngine();
  expect(engineAsync.error).toEqual(MISSING_ASYNC_STATE_PROVIDER);
  setStateProvider(asyncGlobalState);
  engineAsync = asyncEngine();
  expect(engineAsync.version()).toEqual(version());

  const stateResult = await engineAsync.setState(tournamentRecord);
  expect(stateResult.success).toEqual(true);

  let executionResult = await engineAsync.execute({});
  expect(executionResult.error).toEqual(METHOD_NOT_FOUND);

  executionResult = await engineAsync.execute({ f1: () => {}, f2: () => {} });
  expect(executionResult.error).toEqual(INVALID_VALUES);

  executionResult = await engineAsync.execute({ method: 'unknownMethod' });
  expect(executionResult.error).toEqual(METHOD_NOT_FOUND);

  /**
  // NOTE: Does not work with vitest at present
  executionResult = await engineAsync.execute({
    method: 'version',
  });
  expect(executionResult).toEqual(version());

  // askEngine can import methods
  const importResult = await engineAsync.importMethods({ getParticipants });
  expect(importResult.success).toEqual(true);

  // askEngine can execute imported methods
  executionResult = await engineAsync.execute({
    method: 'getParticipants',
  });
  expect(executionResult.participants.length).toEqual(8);
  */
});
