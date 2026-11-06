import { isKnownWrite } from '@Tests/testHarness/queryPurity/knownWriters';
import { mustNotWrite } from '@Tests/testHarness/queryPurity/methodKinds';
import { QueryPurityCheck } from '@Tests/testHarness/queryPurity/checker';
import { addNotice, setInvokeObserver } from '@Global/state/globalState';
import { withDraftWrites } from '@Global/state/withDraftWrites';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { MODIFY_DRAW_DEFINITION } from '@Constants/topicConstants';

// The suite-wide check (testHarness/queryPurity.ts) must FIRE on a query that writes, or its silence means nothing.
// Each case plants a write in a method the engine dispatches under a query's name, and runs it under a check of its
// own: the suite's check is taken off the observer slot first, so the planted write does not fail this test.

function plantedCall(methodName: string, method: (params: any) => any) {
  mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], setState: true });
  tournamentEngine.getEvents(); // an inherited stamp from the generation is the next call's, not the planted one's
  setInvokeObserver();
  const check = new QueryPurityCheck();
  check.install();
  tournamentEngine.execute({ [methodName]: method });
  setInvokeObserver();
  return check.take();
}

it('classifies queries and generators as must-not-write, and mutations as may-write', () => {
  expect(mustNotWrite('getScenarioScheduleView')).toEqual(true);
  expect(mustNotWrite('generateDrawDefinition')).toEqual(true);
  expect(mustNotWrite('addEvent')).toEqual(false);
  // the deprecated query alias of a writer is a mutation (tournamentGovernor/query.ts)
  expect(mustNotWrite('cleanExpiredMutationLocks')).toEqual(false);
  expect(mustNotWrite('notAnEngineMethod')).toEqual(false);
});

it('fires on a query that writes the record', () => {
  const offenses = plantedCall('getParticipants', ({ tournamentRecord }) => {
    tournamentRecord.tournamentName = 'planted';
    return { success: true };
  });
  expect(offenses).toEqual([{ methodName: 'getParticipants', write: 'record', path: expect.any(String), options: {} }]);
  expect(offenses[0].path).toMatch(/tournamentName$/);
});

it('fires on a query that hands the provider a notice, though the record is unchanged', () => {
  const offenses = plantedCall('getParticipants', ({ tournamentRecord }) => {
    addNotice({ topic: MODIFY_DRAW_DEFINITION, payload: { tournamentId: tournamentRecord.tournamentId } });
    return { success: true };
  });
  expect(offenses.map(({ write }) => write)).toContain(`notice:${MODIFY_DRAW_DEFINITION}`);
});

it('is quiet on a query that withdraws what it announced (a draft written under withDraftWrites)', () => {
  const offenses = plantedCall('getParticipants', ({ tournamentRecord }) =>
    withDraftWrites(() => {
      addNotice({ topic: MODIFY_DRAW_DEFINITION, payload: { tournamentId: tournamentRecord.tournamentId } });
      return { success: true };
    }),
  );
  expect(offenses).toEqual([]);
});

it('fires on a generator that writes', () => {
  const offenses = plantedCall('generateDrawDefinition', ({ tournamentRecord }) => {
    tournamentRecord.tournamentName = 'planted';
    return { success: true };
  });
  expect(offenses.map(({ methodName, write }) => [methodName, write])).toEqual([['generateDrawDefinition', 'record']]);
});

it('is quiet on a mutation making the same write, and on a query that only reads', () => {
  expect(
    plantedCall('setTournamentName', ({ tournamentRecord }) => {
      tournamentRecord.tournamentName = 'written';
      return { success: true };
    }),
  ).toEqual([]);
  expect(
    plantedCall('getParticipants', ({ tournamentRecord }) => ({
      success: true,
      n: tournamentRecord.participants.length,
    })),
  ).toEqual([]);
});

it('allows a known writer only inside its gate', () => {
  // opt-in: only when the caller asked to attach
  expect(isKnownWrite('generateLineUps', { attach: true })).toEqual(true);
  expect(isKnownWrite('generateLineUps', {})).toEqual(false);
  // opt-out: attaches by default, so only `addEvents: false` makes a write an offense
  expect(isKnownWrite('generateEventsFromTieFormat', {})).toEqual(true);
  expect(isKnownWrite('generateEventsFromTieFormat', { addEvents: false })).toEqual(false);
  // with `addEvents: false` nothing is attached, so any write is an offense (its draft entries announce nothing)
  expect(isKnownWrite('generateEventsFromTieFormat', { addEvents: false, addEntriesFromTeams: true })).toEqual(false);
  // ungated, and unlisted
  expect(isKnownWrite('generateTournamentRecord', {})).toEqual(true);
  // a generator whose draft writes are discarded is not listed at all
  expect(isKnownWrite('generateDrawDefinition', {})).toEqual(false);
  expect(isKnownWrite('getParticipants', {})).toEqual(false);
});
