import { describe, expect, test } from 'vitest';

import { MOCKS_SCENARIOS } from '../testHarness/corpus/mocksScenarios';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { differences } from './recordDifferences';

/**
 * A generated scenario's method list replays to the same record (CA 2026-10-29). `generateTournamentRecord` with
 * `recordMethods` returns the engine calls a client would make to build what it built; replayed through a fresh
 * engine they must produce the same record, apart from the times each write stamps. A write scenario generation
 * makes WITHOUT logging it shows up here as the first difference.
 */

function replay(methods) {
  const [header, ...rest] = methods;
  expect(header.method).toEqual('newTournamentRecord');
  tournamentEngine.reset();
  let result: any = tournamentEngine.newTournamentRecord(header.params);
  expect(result.success).toEqual(true);
  result = rest.length ? tournamentEngine.executionQueue(rest) : { success: true };
  expect(result.error ?? result.success).toEqual(true);
  return tournamentEngine.getTournament().tournamentRecord;
}

describe('a generated scenario replays from its method list', () => {
  test.each(MOCKS_SCENARIOS)('%s', (_, profile) => {
    const generated: any = mocksEngine.generateTournamentRecord({ ...profile, nonRandom: 1, recordMethods: true });
    expect(generated.success).toEqual(true);
    expect(generated.methods.length).toBeGreaterThan(0);

    const replayed = replay(generated.methods);
    expect(differences(generated.tournamentRecord, replayed)).toEqual([]);
  });

  test('a generation that does not ask returns no list', () => {
    const generated: any = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
    expect(generated.methods).toBeUndefined();
  });
});
