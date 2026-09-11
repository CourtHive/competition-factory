import { afterEach, describe, expect, it, vi } from 'vitest';

import { addNotice, deleteNotices, setSubscriptions } from '@Global/state/globalState';
import { notifySubscribers } from '@Global/state/notifySubscribers';
import tournamentEngine from '@Engines/syncEngine';

const TEST_TOPIC = 'addMatchUps';
const OTHER_TOPIC = 'modifyMatchUp';

function emit(topic: string, payload: any) {
  addNotice({ topic, payload });
  notifySubscribers();
  deleteNotices();
}

afterEach(() => {
  // Drain bus listeners and any buffered notices so state doesn't leak.
  tournamentEngine.off(TEST_TOPIC);
  tournamentEngine.off(OTHER_TOPIC);
  deleteNotices();
});

describe('engine.on — typed event bus', () => {
  it('exposes on/once/off/waitFor on the engine', () => {
    expect(typeof tournamentEngine.on).toEqual('function');
    expect(typeof tournamentEngine.once).toEqual('function');
    expect(typeof tournamentEngine.off).toEqual('function');
    expect(typeof tournamentEngine.waitFor).toEqual('function');
  });

  it('on(topic, handler) fires per-notice (not per-batch)', () => {
    const handler = vi.fn();
    tournamentEngine.on(TEST_TOPIC, handler);

    addNotice({ topic: TEST_TOPIC, payload: { tournamentId: 't1', eventId: 'e1', matchUps: [] as any[] } });
    addNotice({ topic: TEST_TOPIC, payload: { tournamentId: 't1', eventId: 'e2', matchUps: [] as any[] } });
    notifySubscribers();
    deleteNotices();

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0][0]).toEqual({ tournamentId: 't1', eventId: 'e1', matchUps: [] });
    expect(handler.mock.calls[1][0]).toEqual({ tournamentId: 't1', eventId: 'e2', matchUps: [] });
  });

  it('supports multiple subscribers per topic; all fire once per notice', () => {
    const a = vi.fn();
    const b = vi.fn();
    tournamentEngine.on(TEST_TOPIC, a);
    tournamentEngine.on(TEST_TOPIC, b);

    emit(TEST_TOPIC, { tournamentId: 't', eventId: 'e', matchUps: [] });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('returned unsubscribe removes only that handler', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = tournamentEngine.on(TEST_TOPIC, a);
    tournamentEngine.on(TEST_TOPIC, b);
    offA();

    emit(TEST_TOPIC, { tournamentId: 't', eventId: 'e', matchUps: [] });

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe is idempotent', () => {
    const handler = vi.fn();
    const off = tournamentEngine.on(TEST_TOPIC, handler);
    off();
    off(); // second call is a no-op, not a crash
    emit(TEST_TOPIC, { tournamentId: 't', eventId: 'e', matchUps: [] });
    expect(handler).not.toHaveBeenCalled();
  });

  it('off(topic, handler) removes a specific listener', () => {
    const a = vi.fn();
    const b = vi.fn();
    tournamentEngine.on(TEST_TOPIC, a);
    tournamentEngine.on(TEST_TOPIC, b);
    tournamentEngine.off(TEST_TOPIC, a);

    emit(TEST_TOPIC, { tournamentId: 't', eventId: 'e', matchUps: [] });

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('off(topic) clears all listeners for that topic', () => {
    const a = vi.fn();
    const b = vi.fn();
    tournamentEngine.on(TEST_TOPIC, a);
    tournamentEngine.on(TEST_TOPIC, b);
    tournamentEngine.off(TEST_TOPIC);

    emit(TEST_TOPIC, { tournamentId: 't', eventId: 'e', matchUps: [] });

    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('handler error in one listener does not stop other listeners', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    tournamentEngine.on(TEST_TOPIC, bad);
    tournamentEngine.on(TEST_TOPIC, good);

    emit(TEST_TOPIC, { tournamentId: 't', eventId: 'e', matchUps: [] });

    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('listeners do not fire for unrelated topics', () => {
    const handler = vi.fn();
    tournamentEngine.on(TEST_TOPIC, handler);

    emit(OTHER_TOPIC, { tournamentId: 't', matchUp: { matchUpId: 'm' } as any });

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('engine.once — single-fire subscription', () => {
  it('fires exactly once and auto-unsubscribes', () => {
    const handler = vi.fn();
    tournamentEngine.once(TEST_TOPIC, handler);

    emit(TEST_TOPIC, { tournamentId: 't', eventId: 'e', matchUps: [] });
    emit(TEST_TOPIC, { tournamentId: 't', eventId: 'e2', matchUps: [] });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toEqual({ tournamentId: 't', eventId: 'e', matchUps: [] });
  });

  it('returned unsubscribe lets caller cancel before the first fire', () => {
    const handler = vi.fn();
    const off = tournamentEngine.once(TEST_TOPIC, handler);
    off();

    emit(TEST_TOPIC, { tournamentId: 't', eventId: 'e', matchUps: [] });

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('engine.waitFor — promise-based subscription', () => {
  it('resolves with the first payload (no predicate)', async () => {
    const promise = tournamentEngine.waitFor(TEST_TOPIC);
    emit(TEST_TOPIC, { tournamentId: 't', eventId: 'first', matchUps: [] });
    emit(TEST_TOPIC, { tournamentId: 't', eventId: 'second', matchUps: [] });

    const payload = await promise;
    expect(payload.eventId).toEqual('first');
  });

  it('resolves with the first payload that matches the predicate', async () => {
    const promise = tournamentEngine.waitFor(TEST_TOPIC, (p) => p.eventId === 'wanted');

    emit(TEST_TOPIC, { tournamentId: 't', eventId: 'ignored1', matchUps: [] });
    emit(TEST_TOPIC, { tournamentId: 't', eventId: 'ignored2', matchUps: [] });
    emit(TEST_TOPIC, { tournamentId: 't', eventId: 'wanted', matchUps: [] });
    emit(TEST_TOPIC, { tournamentId: 't', eventId: 'too-late', matchUps: [] });

    const payload = await promise;
    expect(payload.eventId).toEqual('wanted');
  });
});

describe('legacy interop', () => {
  it('plain setSubscriptions still works for topics with no bus listener', () => {
    const legacy = vi.fn();
    setSubscriptions({ subscriptions: { [TEST_TOPIC]: legacy } });

    emit(TEST_TOPIC, { tournamentId: 't', eventId: 'e', matchUps: [] });
    expect(legacy).toHaveBeenCalledTimes(1);
    // legacy receives an ARRAY of payloads (one entry per notice in the batch).
    expect(legacy.mock.calls[0][0]).toEqual([{ tournamentId: 't', eventId: 'e', matchUps: [] }]);

    // teardown
    setSubscriptions({ subscriptions: { [TEST_TOPIC]: null } });
  });

  it('engine.on replaces a pre-existing legacy callback (documented precedence)', () => {
    const legacy = vi.fn();
    const bus = vi.fn();
    setSubscriptions({ subscriptions: { [TEST_TOPIC]: legacy } });
    tournamentEngine.on(TEST_TOPIC, bus);

    emit(TEST_TOPIC, { tournamentId: 't', eventId: 'e', matchUps: [] });

    expect(legacy).not.toHaveBeenCalled();
    expect(bus).toHaveBeenCalledTimes(1);
  });
});
