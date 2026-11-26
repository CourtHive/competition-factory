import { assertRefusalsUnchanged } from '@Tests/testHarness/corpus/refusalInvariant';
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import { setOutcomePipeline, setStateProvider } from '@Global/state/globalState';
import syncGlobalState from '@Global/state/syncGlobalState';
import { afterEach, describe, expect, it } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import asyncEngine from '@Engines/asyncEngine';
import { bulkItem } from '@Mutate/bulkItem';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * The refusal invariant's bulk-item boundary (src/mutate/bulkItem.ts). A refused bulk call may keep what its
 * successful items wrote, and the engine's stamp once one has committed. A refused item must write nothing, and nothing
 * may be written outside an item. Each case below plants exactly one of those writes and expects the detector to name it,
 * or plants none and expects silence.
 */
type Item = { write?: string; refuse?: boolean; refusedWrite?: string };
type BulkArgs = { tournamentRecord: any; items: Item[]; strayBefore?: string; strayAfter?: string };

function bulkWrite({ tournamentRecord, items, strayBefore, strayAfter }: BulkArgs) {
  if (strayBefore) tournamentRecord.tournamentName = strayBefore;
  let error;
  for (const item of items) {
    const result: any = bulkItem(() => {
      if (item.refusedWrite) tournamentRecord.formalName = item.refusedWrite;
      if (item.refuse) return { error: INVALID_VALUES };
      if (item.write) tournamentRecord.promotionalName = item.write;
      return { ...SUCCESS };
    });
    error ??= result.error;
  }
  if (strayAfter) tournamentRecord.tournamentName = strayAfter;
  return error ? { error } : { ...SUCCESS };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// the same items, yielding between them so concurrent requests interleave
async function bulkWriteAsync({ tournamentRecord, items }: BulkArgs) {
  let error;
  for (const item of items) {
    await tick();
    const result: any = bulkItem(() => {
      if (item.refusedWrite) tournamentRecord.formalName = item.refusedWrite;
      if (item.refuse) return { error: INVALID_VALUES };
      if (item.write) tournamentRecord.promotionalName = item.write;
      return { ...SUCCESS };
    });
    error ??= result.error;
  }
  return error ? { error } : { ...SUCCESS };
}

const methods = { bulkWrite, bulkWriteAsync };

const detected = () => {
  try {
    assertRefusalsUnchanged();
    return false;
  } catch (error: any) {
    expect(error.message).toMatch(/^ERROR_IMPLIES_NO_MUTATION/);
    return true;
  }
};

const cases: [string, Omit<BulkArgs, 'tournamentRecord'>, boolean][] = [
  ['a committed prefix and a clean refused item', { items: [{ write: 'kept' }, { refuse: true }] }, false],
  ['only refused items, writing nothing', { items: [{ refuse: true }, { refuse: true }] }, false],
  ['a refused item that writes', { items: [{ write: 'kept' }, { refuse: true, refusedWrite: 'leaked' }] }, true],
  ['a write before the first item', { items: [{ write: 'kept' }, { refuse: true }], strayBefore: 'stray' }, true],
  ['a write after the last item', { items: [{ write: 'kept' }, { refuse: true }], strayAfter: 'stray' }, true],
  ['a stray write when no item committed', { items: [{ refuse: true }], strayAfter: 'stray' }, true],
];

afterEach(() => setOutcomePipeline());

describe('bulk item boundary', () => {
  for (const mode of ['v1', 'v2', 'differential'] as const) {
    for (const [name, args, violation] of cases) {
      it(`${mode}: ${name} is ${violation ? '' : 'not '}a violation, direct call`, () => {
        setOutcomePipeline(mode);
        mocksEngine.generateTournamentRecord({ setState: true });
        tournamentEngine.importMethods(methods);
        const result = tournamentEngine.bulkWrite(structuredClone(args));
        expect(result.error).toEqual(INVALID_VALUES);
        expect(detected()).toEqual(violation);
      });

      it(`${mode}: ${name} is ${violation ? '' : 'not '}a violation, single-directive queue`, () => {
        setOutcomePipeline(mode);
        mocksEngine.generateTournamentRecord({ setState: true });
        tournamentEngine.importMethods(methods);
        const result = tournamentEngine.executionQueue([{ method: 'bulkWrite', params: structuredClone(args) }]);
        expect(result.error).toEqual(INVALID_VALUES);
        expect(detected()).toEqual(violation);
      });

      it(`${mode}: ${name} is ${violation ? '' : 'not '}a violation, after a successful directive`, () => {
        setOutcomePipeline(mode);
        mocksEngine.generateTournamentRecord({ setState: true });
        tournamentEngine.importMethods(methods);
        const result = tournamentEngine.executionQueue([
          { method: 'setTournamentName', params: { tournamentName: 'first' } },
          { method: 'bulkWrite', params: structuredClone(args) },
        ]);
        expect(result.error).toEqual(INVALID_VALUES);
        expect(detected()).toEqual(violation);
      });
    }
  }

  it('a rollback queue is not traced', () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    tournamentEngine.importMethods(methods);
    const args = { items: [{ write: 'kept' }, { refuse: true, refusedWrite: 'leaked' }] };
    const result = tournamentEngine.executionQueue([{ method: 'bulkWrite', params: args }], true);
    expect(result.error).toEqual(INVALID_VALUES);
    expect(detected()).toEqual(false);
  });

  it('async requests keep their own item boundaries', async () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    const request = (args: Omit<BulkArgs, 'tournamentRecord'>) =>
      asyncGlobalState.runWithInstanceState(async () => {
        asyncEngine.importMethods(methods);
        await asyncEngine.setState(structuredClone(tournamentRecord));
        return asyncEngine.bulkWriteAsync(args);
      });
    setStateProvider(asyncGlobalState);
    try {
      const results = await Promise.all([
        request({ items: [{ write: 'kept' }, { refuse: true }, { write: 'again' }] }),
        request({ items: [{ refuse: true }, { write: 'kept' }, { refuse: true }] }),
      ]);
      expect(results.map((result: any) => result.error)).toEqual([INVALID_VALUES, INVALID_VALUES]);
      expect(detected()).toEqual(false);
      const leaked: any = await request({ items: [{ write: 'kept' }, { refuse: true, refusedWrite: 'leaked' }] });
      expect(leaked.error).toEqual(INVALID_VALUES);
      expect(detected()).toEqual(true);
    } finally {
      setStateProvider(syncGlobalState);
    }
  });
});
