import { engineBoundaryObservers } from '@Assemblies/engines/parts/boundaryObservers';
import { useQuietCaughtErrors } from '@Tests/testHarness/engineCatch';
import { afterEach, describe, expect, it } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import asyncEngine from '@Engines/asyncEngine';

/**
 * The async entry points are thin wrappers that hand a call to an installed observer (the refusal invariant) when there
 * is one. They stay async calls either way: a throwing method settles as it did (its caught-error result, or a rejection
 * under devContext), a refusal resolves to the refusal, and an observer that throws reaches the caller as a rejection, never a synchronous throw.
 * The built packages were also compared with plain dev on these cases, including the microtask each settles on.
 */
const methods = {
  refuse: () => ({ error: { code: 'ERR_REFUSED', message: 'refused' } }),
  throwSync: () => {
    throw new Error('sync body');
  },
  throwAsync: async () => {
    await null;
    throw new Error('async body');
  },
};

const installed = { ...engineBoundaryObservers };
afterEach(() => Object.assign(engineBoundaryObservers, installed));

const entries = {
  asyncEngineInvoke: (method: string) => asyncEngine.execute({ method }),
  asyncExecutionQueue: (method: string) => asyncEngine.executionQueue([{ method }]),
};

describe('async boundary observers', () => {
  useQuietCaughtErrors();
  for (const observer of ['installed', 'absent'] as const) {
    for (const [entry, call] of Object.entries(entries)) {
      it(`${entry}, observer ${observer}: throwing bodies and refusals stay asynchronous results`, async () => {
        if (observer === 'absent')
          Object.assign(engineBoundaryObservers, { asyncInvoke: undefined, asyncQueue: undefined });
        const { tournamentRecord } = mocksEngine.generateTournamentRecord();
        await asyncEngine.setState(tournamentRecord);
        asyncEngine.importMethods(methods);
        for (const [method, error] of [
          ['refuse', 'ERR_REFUSED'],
          ['throwSync', 'sync body'],
          ['throwAsync', 'async body'],
        ]) {
          let promise: any;
          expect(() => (promise = call(method))).not.toThrow();
          expect(promise).toBeInstanceOf(Promise);
          // a thrown method is caught to its result, or rethrown under devContext (as here): either way, later
          const settled = await promise.then(
            (result: any) => result.error?.code ?? result.error,
            (thrown: Error) => thrown.message,
          );
          expect(settled).toEqual(error);
        }
      });
    }
  }

  it('an observer that throws is a rejection, not a synchronous throw', async () => {
    const boom = () => {
      throw new Error('observer');
    };
    Object.assign(engineBoundaryObservers, { asyncInvoke: boom, asyncQueue: boom });
    for (const call of Object.values(entries)) {
      let promise: any;
      expect(() => (promise = call('refuse'))).not.toThrow();
      await expect(promise).rejects.toThrow('observer');
    }
  });
});
