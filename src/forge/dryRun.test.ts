import { beforeEach, describe, expect, it } from 'vitest';

import tournamentEngine from '../tests/engines/syncEngine';
import { mocksEngine } from '../assemblies/engines/mock';
import { dryRun } from './dryRun';
import { explain } from './explain';

describe('dryRun', () => {
  beforeEach(() => {
    // Generate a small tournament and load it into engine state. Each test
    // re-seeds so they're independent.
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: 'SINGLES' }],
    });
    tournamentEngine.setState(tournamentRecord);
  });

  it('returns wouldSucceed=true for a no-op directive list', () => {
    const result = dryRun(tournamentEngine, []);
    expect(result.wouldSucceed).toBe(true);
    expect(result.patch).toEqual([]);
    expect(result.willEmitNotices).toEqual([]);
    expect(result.results).toEqual([]);
  });

  it('returns INVALID_VALUES error when directives is not an array', () => {
    const result = dryRun(tournamentEngine, 'nope' as any);
    expect(result.wouldSucceed).toBe(false);
    expect(result.error?.code).toBeDefined();
  });

  it('does NOT persist state — running the same dryRun twice yields the same patch', () => {
    const eventResult = tournamentEngine.getEvents();
    const eventId = eventResult.events[0].eventId;

    const directives = [{ method: 'modifyEvent', params: { eventId, eventUpdates: { eventName: 'Brand New Name' } } }];
    const first = dryRun(tournamentEngine, directives);
    const second = dryRun(tournamentEngine, directives);

    expect(first.wouldSucceed).toBe(true);
    expect(first.patch.length).toBeGreaterThan(0);
    expect(second.patch).toEqual(first.patch);

    // And the real state's eventName should be unchanged.
    const afterRefetch = tournamentEngine.getEvents();
    expect(afterRefetch.events[0].eventName).not.toBe('Brand New Name');
  });

  it('rolledBack is always true', () => {
    const result = dryRun(tournamentEngine, []);
    expect(result.rolledBack).toBe(true);
  });

  it('captures emitted notices into willEmitNotices', () => {
    const eventResult = tournamentEngine.getEvents();
    const eventId = eventResult.events[0].eventId;

    const result = dryRun(tournamentEngine, [
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
    const eventResult = tournamentEngine.getEvents();
    const eventId = eventResult.events[0].eventId;

    const result = dryRun(tournamentEngine, [
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
    const result = dryRun(tournamentEngine, [
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
    const result = dryRun(tournamentEngine, [{ method: 'noSuchMethod' as any, params: {} }]);
    expect(result.wouldSucceed).toBe(false);
    expect(result.error?.message).toMatch(/noSuchMethod/);
  });
});

describe('explain', () => {
  beforeEach(() => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: 'SINGLES' }],
    });
    tournamentEngine.setState(tournamentRecord);
  });

  it('returns wouldSucceed=true for a valid mutation', () => {
    const eventResult = tournamentEngine.getEvents();
    const eventId = eventResult.events[0].eventId;

    const result = explain(tournamentEngine, 'modifyEvent', { eventId, eventUpdates: { eventName: 'New Name' } });
    expect(result.wouldSucceed).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(Array.isArray(result.willEmitTopics)).toBe(true);
    expect(Array.isArray(result.touchesPaths)).toBe(true);
    expect(result.touchesPaths.length).toBeGreaterThan(0);
  });

  it('returns wouldSucceed=false + reason for an invalid mutation', () => {
    const result = explain(tournamentEngine, 'modifyEvent', { eventId: 'nope', eventUpdates: { eventName: 'X' } });
    expect(result.wouldSucceed).toBe(false);
    expect(result.reason?.code).toBeDefined();
  });

  it('does not persist state — call twice, second yields same touchesPaths', () => {
    const eventResult = tournamentEngine.getEvents();
    const eventId = eventResult.events[0].eventId;

    const first = explain(tournamentEngine, 'modifyEvent', { eventId, eventUpdates: { eventName: 'A' } });
    const second = explain(tournamentEngine, 'modifyEvent', { eventId, eventUpdates: { eventName: 'A' } });
    expect(second.touchesPaths).toEqual(first.touchesPaths);
  });

  it('exposes the full dryRun result under `detail`', () => {
    const eventResult = tournamentEngine.getEvents();
    const eventId = eventResult.events[0].eventId;

    const result = explain(tournamentEngine, 'modifyEvent', { eventId, eventUpdates: { eventName: 'X' } });
    expect(result.detail).toBeDefined();
    expect(result.detail.patch).toEqual(
      result.touchesPaths.map((p) => result.detail.patch.find((op) => op.path === p)!),
    );
  });
});
