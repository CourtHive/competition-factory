import { setStateMethods, setStateProvider } from '@Global/state/globalState';
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import syncGlobalState from '@Global/state/syncGlobalState';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asyncEngine } from '@Assemblies/engines/async';
import { mocksEngine } from '@Assemblies/engines/mock';
import { eventGovernor } from '@Assemblies/governors';

// constants
import { METHOD_NOT_FOUND } from '@Constants/errorConditionConstants';

/**
 * An engine whose governors were imported before the async provider was installed (as `tournamentEngineAsync`'s are,
 * when its module is evaluated) resolves its queue directives from its own imports. The async provider keeps its
 * method registry per request state, so before this fix every queue in a fresh request was refused with
 * METHOD_NOT_FOUND while direct calls worked.
 */
describe('executionQueue resolves the engine’s own imported methods under the async provider', () => {
  const engine = asyncEngine(true);
  // imported under the default provider: the method goes to that provider's registry, and to the engine
  engine.importMethods({ addEvent: eventGovernor.addEvent });

  beforeAll(() => setStateProvider(asyncGlobalState));
  afterAll(() => setStateProvider(syncGlobalState));

  const inFreshRequest = <T>(fn: () => Promise<T>) => asyncGlobalState.runWithInstanceState(fn);
  const record = () => mocksEngine.generateTournamentRecord({}).tournamentRecord;

  it('runs a queue of an imported method in a fresh request state', async () => {
    const result: any = await inFreshRequest(async () => {
      await engine.setState(record());
      return engine.executionQueue([{ method: 'addEvent', params: { event: { eventName: 'Queued' } } }], true);
    });
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.results[0].event.eventName).toBe('Queued');
  });

  it('previews the same queue with dryRun', async () => {
    const preview: any = await inFreshRequest(async () => {
      await engine.setState(record());
      return engine.dryRun([{ method: 'addEvent', params: { event: { eventName: 'Previewed' } } }]);
    });
    expect(preview.wouldSucceed).toBe(true);
  });

  it('still refuses a method the engine never imported, and an engine built-in', async () => {
    const results: any[] = await inFreshRequest(async () => {
      await engine.setState(record());
      return [
        await engine.executionQueue([{ method: 'notAMethod' }], true),
        await engine.executionQueue([{ method: 'setState' }], true),
      ];
    });
    expect(results[0].error).toEqual(METHOD_NOT_FOUND);
    expect(results[1].error).toEqual(METHOD_NOT_FOUND);
  });

  it('keeps a method registered on the provider ahead of the engine’s own', async () => {
    const result: any = await inFreshRequest(async () => {
      setStateMethods({ addEvent: () => ({ success: true, registered: true }) }, false, 1, false);
      await engine.setState(record());
      return engine.executionQueue([{ method: 'addEvent', params: {} }], true);
    });
    expect(result.results[0].registered).toBe(true);
  });
});
