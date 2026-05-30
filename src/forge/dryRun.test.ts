import { beforeEach, describe, expect, it } from 'vitest';

import tournamentEngine from '../tests/engines/syncEngine';
import { mocksEngine } from '../assemblies/engines/mock';
import { explain } from './explain';
import { dryRun } from './dryRun';

describe('dryRun', () => {
  beforeEach(() => {
    // Generate a small tournament and load it into engine state. Each test
    // re-seeds so they're independent.
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: 'SINGLES' }],
      setState: true,
    });
  });

  it('returns wouldSucceed=true for a no-op directive list', () => {
    let result: any = dryRun(tournamentEngine, []);
    expect(result.wouldSucceed).toBe(true);
    expect(result.patch).toEqual([]);
    expect(result.willEmitNotices).toEqual([]);
    expect(result.results).toEqual([]);
  });

  it('returns INVALID_VALUES error when directives is not an array', () => {
    let result: any = dryRun(tournamentEngine, 'nope' as any);
    expect(result.wouldSucceed).toBe(false);
    expect(result.error?.code).toBeDefined();
  });

  it('does NOT persist state — running the same dryRun twice yields the same patch', () => {
    const eventResult: any = tournamentEngine.getEvents();
    const eventId = eventResult.events[0].eventId;

    const directives = [{ method: 'modifyEvent', params: { eventId, eventUpdates: { eventName: 'Brand New Name' } } }];
    const first: any = dryRun(tournamentEngine, directives);
    const second: any = dryRun(tournamentEngine, directives);

    expect(first.wouldSucceed).toBe(true);
    expect(first.patch.length).toBeGreaterThan(0);
    expect(second.patch).toEqual(first.patch);

    // And the real state's eventName should be unchanged.
    const afterRefetch = tournamentEngine.getEvents();
    expect(afterRefetch.events[0].eventName).not.toBe('Brand New Name');
  });

  it('rolledBack is always true', () => {
    let result: any = dryRun(tournamentEngine, []);
    expect(result.rolledBack).toBe(true);
  });

  it('captures emitted notices into willEmitNotices', () => {
    const eventResult: any = tournamentEngine.getEvents();
    const eventId = eventResult.events[0].eventId;

    let result: any = dryRun(tournamentEngine, [
      { method: 'modifyEvent', params: { eventId, eventUpdates: { eventName: 'Test Name' } } },
    ]);

    expect(result.wouldSucceed).toBe(true);
    // We don't assert specific topics — the set depends on factory wiring —
    // but the mechanism should produce a serializable shape.
    expect(Array.isArray(result.willEmitNotices)).toBe(true);
    for (const notice of result.willEmitNotices) {
      expect(typeof notice.topic).toBe('string');
      expect(Array.isArray(notice.payloads)).toBe(true);
    }
  });

  it('emits an RFC 6902-shaped patch for actual changes', () => {
    const eventResult: any = tournamentEngine.getEvents();
    const eventId = eventResult.events[0].eventId;

    let result: any = dryRun(tournamentEngine, [
      { method: 'modifyEvent', params: { eventId, eventUpdates: { eventName: 'New Name' } } },
    ]);

    expect(result.patch.length).toBeGreaterThan(0);
    for (const op of result.patch) {
      expect(['add', 'remove', 'replace']).toContain(op.op);
      expect(typeof op.path).toBe('string');
      expect(op.path.startsWith('/')).toBe(true);
    }
  });

  it('returns wouldSucceed=false + reason when a directive errors', () => {
    let result: any = dryRun(tournamentEngine, [
      { method: 'modifyEvent', params: { eventId: 'does-not-exist', eventUpdates: { eventName: 'X' } } },
    ]);
    expect(result.wouldSucceed).toBe(false);
    expect(result.error?.code).toBeDefined();
    // Patch may be empty (no state change before the error) or non-empty
    // (some earlier directive succeeded). Either way, the post-state is
    // restored and `rolledBack` is true.
    expect(result.rolledBack).toBe(true);
  });

  it('returns method-not-found error for an unknown directive', () => {
    let result: any = dryRun(tournamentEngine, [{ method: 'noSuchMethod' as any, params: {} }]);
    expect(result.wouldSucceed).toBe(false);
    expect(result.error?.message).toMatch(/noSuchMethod/);
  });

  it('rejects a non-object directive', () => {
    let result: any = dryRun(tournamentEngine, ['not-a-directive' as any]);
    expect(result.wouldSucceed).toBe(false);
    expect(result.error?.message).toMatch(/directive must be an object/);
  });

  it('rejects a directive whose params is not an object', () => {
    let result: any = dryRun(tournamentEngine, [{ method: 'modifyEvent', params: 'oops' as any }]);
    expect(result.wouldSucceed).toBe(false);
    expect(result.error?.message).toMatch(/params must be an object/);
  });

  it('threads a piped key from the previous result into the next directive', () => {
    // generateDrawDefinition followed by addDrawDefinition with pipe:{drawDefinition:true}.
    // The pipe path inside dryRun copies prev.drawDefinition into the next directive's params.
    const eventResult: any = tournamentEngine.getEvents();
    const eventId = eventResult.events[0].eventId;

    let result: any = dryRun(tournamentEngine, [
      { method: 'generateDrawDefinition', params: { eventId, drawSize: 8 } },
      { method: 'addDrawDefinition', params: { eventId }, pipe: { drawDefinition: true } },
    ]);

    expect(result.wouldSucceed).toBe(true);
    // The pipe should have merged drawDefinition from the first result into the second.
    expect(result.results[1].methodName).toBe('addDrawDefinition');
  });
});

describe('explain', () => {
  beforeEach(() => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: 'SINGLES' }],
      setState: true,
    });
  });

  it('returns wouldSucceed=true for a valid mutation', () => {
    const eventResult: any = tournamentEngine.getEvents();
    const eventId = eventResult.events[0].eventId;

    let result: any = explain(tournamentEngine, 'modifyEvent', { eventId, eventUpdates: { eventName: 'New Name' } });
    expect(result.wouldSucceed).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(Array.isArray(result.willEmitTopics)).toBe(true);
    expect(Array.isArray(result.touchesPaths)).toBe(true);
    expect(result.touchesPaths.length).toBeGreaterThan(0);
  });

  it('returns wouldSucceed=false + reason for an invalid mutation', () => {
    let result: any = explain(tournamentEngine, 'modifyEvent', { eventId: 'nope', eventUpdates: { eventName: 'X' } });
    expect(result.wouldSucceed).toBe(false);
    expect(result.reason?.code).toBeDefined();
  });

  it('does not persist state — call twice, second yields same touchesPaths', () => {
    const eventResult: any = tournamentEngine.getEvents();
    const eventId = eventResult.events[0].eventId;

    const first: any = explain(tournamentEngine, 'modifyEvent', { eventId, eventUpdates: { eventName: 'A' } });
    const second: any = explain(tournamentEngine, 'modifyEvent', { eventId, eventUpdates: { eventName: 'A' } });
    expect(second.touchesPaths).toEqual(first.touchesPaths);
  });

  it('exposes the full dryRun result under `detail`', () => {
    const eventResult: any = tournamentEngine.getEvents();
    const eventId = eventResult.events[0].eventId;

    let result: any = explain(tournamentEngine, 'modifyEvent', { eventId, eventUpdates: { eventName: 'X' } });
    expect(result.detail).toBeDefined();
    expect(result.detail.patch).toEqual(
      result.touchesPaths.map((p) => result.detail.patch.find((op) => op.path === p)!),
    );
  });
});
