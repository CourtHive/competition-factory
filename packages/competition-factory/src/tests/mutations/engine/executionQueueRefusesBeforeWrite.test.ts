import mocksEngine from '@Assemblies/engines/mock';
import asyncEngine from '@Engines/asyncEngine';
import syncEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { INVALID_VALUES, METHOD_NOT_FOUND, MISSING_EVENT } from '@Constants/errorConditionConstants';

/**
 * TRACKER-009 — a queue with rollbackOnError must never keep an earlier directive's write when a
 * later directive is malformed. The sync and async engines refuse the whole queue before the first
 * directive runs; this pins that for both, so the declaration-engine fix and the tournament engines
 * cannot drift apart again.
 */

const ORIGINAL = 'Original Name';
const rename = { method: 'setTournamentName', params: { tournamentName: 'Renamed' } };

const malformedLater: [string, any][] = [
  ['a null directive', null],
  ['a numeric directive', 0],
  ['a string directive', 'x'],
  ['non-object params', { method: 'getEvent', params: 'x' }],
  ['a non-object pipe', { method: 'getEvent', pipe: 'x' }],
];

const engines: [string, any][] = [
  ['sync', syncEngine],
  ['async', asyncEngine],
];

async function seed(engine: any) {
  mocksEngine.generateTournamentRecord({ tournamentName: ORIGINAL, setState: true });
  const { tournamentRecord } = syncEngine.getTournament();
  await engine.setState(tournamentRecord);
}

async function tournamentName(engine: any) {
  const { tournamentRecord } = await engine.getTournament();
  return tournamentRecord.tournamentName;
}

for (const [engineName, engine] of engines) {
  it.each(malformedLater)(`${engineName}: refuses %s after a write, before any directive runs`, async (_, later) => {
    await seed(engine);
    for (const rollbackOnError of [true, false]) {
      let result: any = await engine.executionQueue([rename, later], rollbackOnError);
      expect(result.error).toEqual(INVALID_VALUES);
      expect(await tournamentName(engine)).toEqual(ORIGINAL);
    }
  });

  it(`${engineName}: refuses a pipe on the first directive`, async () => {
    await seed(engine);
    let result: any = await engine.executionQueue([{ ...rename, pipe: { tournamentId: true } }], true);
    expect(result.error).toEqual(INVALID_VALUES);
    expect(await tournamentName(engine)).toEqual(ORIGINAL);
  });

  it(`${engineName}: refuses an unknown later method before the first write`, async () => {
    await seed(engine);
    let result: any = await engine.executionQueue([rename, { method: 'noSuchMethod' }], true);
    expect(result.error).toEqual(METHOD_NOT_FOUND);
    expect(await tournamentName(engine)).toEqual(ORIGINAL);
  });

  it(`${engineName}: rolls back the earlier write when a later directive errors`, async () => {
    await seed(engine);
    let result: any = await engine.executionQueue([rename, { method: 'getEvent' }], true);
    expect(result.error).toEqual(MISSING_EVENT);
    expect(result.rolledBack).toEqual(true);
    expect(await tournamentName(engine)).toEqual(ORIGINAL);

    result = await engine.executionQueue([rename, { method: 'getEvent' }], false);
    expect(result.error).toEqual(MISSING_EVENT);
    expect(result.rolledBack).toEqual(false);
    expect(await tournamentName(engine)).toEqual('Renamed');
  });
}
