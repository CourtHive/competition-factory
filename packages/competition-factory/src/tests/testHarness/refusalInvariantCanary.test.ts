import { assertRefusalsUnchanged } from '@Tests/testHarness/corpus/refusalInvariant';
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import syncGlobalState from '@Global/state/syncGlobalState';
import { setStateProvider } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import asyncEngine from '@Engines/asyncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * CANARY for the refusal invariant (src/tests/testHarness/corpus/refusalInvariant.ts). Every entry point it watches is
 * fed a deliberate late refusal (a write, then a refusal), and each must be reported. Under the PR tier's shared
 * project a worker keeps its modules across files, and a setup-file module mock does not apply to a module an earlier
 * file loaded (it did not for bulkItem, 2026-11-26); this file fails if any watched entry point is unobserved there.
 */
const methods = {
  lateRefusal: ({ tournamentRecord }) => {
    tournamentRecord.tournamentName = 'written before the refusal';
    return { error: INVALID_VALUES };
  },
  succeed: () => ({ ...SUCCESS }),
};

const reported = () => {
  try {
    assertRefusalsUnchanged();
    return false;
  } catch (error: any) {
    return /^ERROR_IMPLIES_NO_MUTATION/.test(error.message);
  }
};

describe('refusal invariant canary', () => {
  it('engineInvoke: a direct call', () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    tournamentEngine.importMethods(methods);
    expect(tournamentEngine.lateRefusal().error).toEqual(INVALID_VALUES);
    expect(reported()).toBe(true);
  });

  it('executionQueue: one directive', () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    tournamentEngine.importMethods(methods);
    expect(tournamentEngine.executionQueue([{ method: 'lateRefusal' }]).error).toEqual(INVALID_VALUES);
    expect(reported()).toBe(true);
  });

  it('executeFunction: the refusing directive after a successful one', () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    tournamentEngine.importMethods(methods);
    const result = tournamentEngine.executionQueue([{ method: 'succeed' }, { method: 'lateRefusal' }]);
    expect(result.error).toEqual(INVALID_VALUES);
    expect(reported()).toBe(true);
  });

  const asyncCase = (name: string, call: () => Promise<any>) =>
    it(name, async () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord();
      setStateProvider(asyncGlobalState);
      try {
        const result: any = await asyncGlobalState.runWithInstanceState(async () => {
          asyncEngine.importMethods(methods);
          await asyncEngine.setState(structuredClone(tournamentRecord));
          return call();
        });
        expect(result.error?.code ?? result.error).toEqual(INVALID_VALUES.code);
        expect(reported()).toBe(true);
      } finally {
        setStateProvider(syncGlobalState);
      }
    });
  asyncCase('asyncEngineInvoke: a direct call', () => asyncEngine.lateRefusal());
  asyncCase('asyncExecutionQueue: one directive', () => asyncEngine.executionQueue([{ method: 'lateRefusal' }]));
  asyncCase('asyncExecutionQueue: the refusing directive after a successful one', () =>
    asyncEngine.executionQueue([{ method: 'succeed' }, { method: 'lateRefusal' }]),
  );
});
