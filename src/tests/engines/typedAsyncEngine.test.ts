import { asyncEngine, competitionEngineAsync, tournamentEngineAsync } from '../../index';
import { setStateProvider } from '@Global/state/globalState';
import legacyConstructor from '@Assemblies/engines/async';
import assembled from '@Engines/asyncEngine';
import * as governors from '@Assemblies/governors';
import { afterEach, describe, expect, it } from 'vitest';
import syncGlobalState from '@Global/state/syncGlobalState';
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';

afterEach(() => setStateProvider(syncGlobalState));

describe('typed public async engines', () => {
  it('publishes the existing function and singleton identities without runtime wrappers', () => {
    expect(asyncEngine).toBe(legacyConstructor);
    expect(tournamentEngineAsync).toBe(assembled);
    expect(competitionEngineAsync).toBe(tournamentEngineAsync);
  });

  it('retains synchronous setup and readback, with asynchronous governor queries and mutations', async () => {
    setStateProvider(asyncGlobalState);
    await asyncGlobalState.runWithInstanceState(async () => {
      const engine = asyncEngine();
      if (!('importMethods' in engine)) throw new Error('Expected an initialized engine');
      expect(engine.importMethods(governors, true, 1).success).toBe(true);
      expect(engine.setState({ tournamentId: 'typed-async', tournamentName: 'Typed' })).toBe(engine);
      expect(engine.getState()).not.toBeInstanceOf(Promise);
      expect(engine.getTournament().tournamentRecord?.tournamentName).toBe('Typed');
      expect(typeof engine.version()).toBe('string');
      const pending = engine.addEvent({ event: { eventName: 'Singles' } });
      expect(pending).toBeInstanceOf(Promise);
      expect((await pending).event?.eventName).toBe('Singles');
      const events = engine.getEvents();
      expect(events).toBeInstanceOf(Promise);
      expect((await events).events?.[0]?.eventName).toBe('Singles');
      const queued = engine.executionQueue([]);
      expect(queued).toBeInstanceOf(Promise);
      expect((await queued).success).toBe(true);
    });
  });

  it('preserves the constructor refusal instead of pretending an engine was created', () => {
    setStateProvider(syncGlobalState);
    const result = asyncEngine();
    expect('importMethods' in result).toBe(false);
    expect(result.error).toBeDefined();
  });
});
