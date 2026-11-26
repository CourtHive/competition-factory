import { assertRefusalsUnchanged } from '@Tests/testHarness/corpus/refusalInvariant';
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import syncGlobalState from '@Global/state/syncGlobalState';
import { setBuiltinPreviewMethods } from '@Forge/previewBindings';
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
// the same late refusal as one of the factory's own methods: with rollbackOnError it takes no snapshot
// (engines/parts/rollbackSnapshot.ts), so nothing restores its write and the invariant must see it
const atomic = { atomicLateRefusal: methods.lateRefusal.bind(null) };
setBuiltinPreviewMethods(atomic);

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

  it('engineInvoke and executionQueue: one directive with rollback that takes no snapshot', () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    tournamentEngine.importMethods(atomic);
    expect(tournamentEngine.atomicLateRefusal({ rollbackOnError: true }).rolledBack).toEqual(true);
    expect(reported()).toBe(true);
    mocksEngine.generateTournamentRecord({ setState: true });
    expect(tournamentEngine.executionQueue([{ method: 'atomicLateRefusal' }], true).rolledBack).toEqual(true);
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
  asyncCase('asyncEngineInvoke: one directive with rollback that takes no snapshot', () => {
    asyncEngine.importMethods(atomic);
    return asyncEngine.atomicLateRefusal({ rollbackOnError: true });
  });
  asyncCase('asyncExecutionQueue: one directive with rollback that takes no snapshot', () => {
    asyncEngine.importMethods(atomic);
    return asyncEngine.executionQueue([{ method: 'atomicLateRefusal' }], true);
  });
  asyncCase('asyncExecutionQueue: the refusing directive after a successful one', () =>
    asyncEngine.executionQueue([{ method: 'succeed' }, { method: 'lateRefusal' }]),
  );
});
