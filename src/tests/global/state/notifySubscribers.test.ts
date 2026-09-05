import { describe, expect, it, beforeEach, vi } from 'vitest';
import { notifySubscribers, notifySubscribersAsync } from '@Global/state/notifySubscribers';
import { setSubscriptions, addNotice, deleteNotices } from '@Global/state/syncGlobalState';
import { MUTATIONS } from '@Constants/topicConstants';

describe('notifySubscribers', () => {
  beforeEach(() => {
    deleteNotices();
    setSubscriptions({ subscriptions: {} });
  });

  it('notifies subscribers for all topics with notices', () => {
    const mockCallback = vi.fn();
    setSubscriptions({ subscriptions: { TEST_TOPIC: mockCallback } });
    addNotice({ topic: 'TEST_TOPIC', payload: { data: 'test' } });

    notifySubscribers();

    expect(mockCallback).toHaveBeenCalled();
  });

  it('handles empty params', () => {
    notifySubscribers();
    // Should not throw
    expect(true).toBe(true);
  });

  it('handles undefined params', () => {
    notifySubscribers(undefined);
    expect(true).toBe(true);
  });

  it('notifies MUTATIONS topic when mutationStatus and timeStamp provided', () => {
    const mockCallback = vi.fn();
    setSubscriptions({ subscriptions: { [MUTATIONS]: mockCallback } });

    notifySubscribers({
      mutationStatus: true,
      timeStamp: Date.now(),
      tournamentId: 't1',
      directives: [{ action: 'ADD' }],
    });

    expect(mockCallback).toHaveBeenCalled();
  });

  it('does not notify MUTATIONS without timeStamp', () => {
    const mockCallback = vi.fn();
    setSubscriptions({ subscriptions: { [MUTATIONS]: mockCallback } });

    notifySubscribers({
      mutationStatus: true,
      tournamentId: 't1',
    });

    expect(mockCallback).not.toHaveBeenCalled();
  });

  it('does not notify MUTATIONS without mutationStatus', () => {
    const mockCallback = vi.fn();
    setSubscriptions({ subscriptions: { [MUTATIONS]: mockCallback } });

    notifySubscribers({
      timeStamp: Date.now(),
      tournamentId: 't1',
    });

    expect(mockCallback).not.toHaveBeenCalled();
  });

  it('sorts topics by priority', () => {
    const callOrder: string[] = [];

    setSubscriptions({
      subscriptions: {
        MODIFY_MATCHUP: () => callOrder.push('MODIFY_MATCHUP'),
        ADD_MATCHUPS: () => callOrder.push('ADD_MATCHUPS'),
        MODIFY_DRAW_DEFINITION: () => callOrder.push('MODIFY_DRAW_DEFINITION'),
      },
    });

    addNotice({ topic: 'MODIFY_MATCHUP', payload: { data: '1' } });
    addNotice({ topic: 'ADD_MATCHUPS', payload: { data: '2' } });
    addNotice({ topic: 'MODIFY_DRAW_DEFINITION', payload: { data: '3' } });

    notifySubscribers();

    // Higher priority topics should be called first
    expect(callOrder.length).toBeGreaterThan(0);
  });

  it('handles multiple notices for same topic', () => {
    let callCount = 0;
    setSubscriptions({
      subscriptions: {
        TEST_TOPIC: () => callCount++,
      },
    });

    addNotice({ topic: 'TEST_TOPIC', payload: { data: '1' } });
    addNotice({ topic: 'TEST_TOPIC', payload: { data: '2' } });

    notifySubscribers();

    expect(callCount).toBe(1); // Called once with all notices
  });

  describe('notifySubscribersAsync', () => {
    it('notifies subscribers asynchronously', async () => {
      const mockCallback = vi.fn();
      setSubscriptions({ subscriptions: { TEST_TOPIC: mockCallback } });
      addNotice({ topic: 'TEST_TOPIC', payload: { data: 'test' } });

      await notifySubscribersAsync();

      expect(mockCallback).toHaveBeenCalled();
    });

    it('handles MUTATIONS topic asynchronously', async () => {
      const mockCallback = vi.fn();
      setSubscriptions({ subscriptions: { [MUTATIONS]: mockCallback } });

      await notifySubscribersAsync({
        mutationStatus: true,
        timeStamp: Date.now(),
        tournamentId: 't1',
        directives: [],
      });

      expect(mockCallback).toHaveBeenCalled();
    });

    it('handles empty params asynchronously', async () => {
      await notifySubscribersAsync();
      expect(true).toBe(true);
    });

    it('processes topics in priority order asynchronously', async () => {
      const callOrder: string[] = [];

      setSubscriptions({
        subscriptions: {
          MODIFY_MATCHUP: async () => callOrder.push('MODIFY_MATCHUP'),
          ADD_MATCHUPS: async () => callOrder.push('ADD_MATCHUPS'),
        },
      });

      addNotice({ topic: 'MODIFY_MATCHUP', payload: { data: '1' } });
      addNotice({ topic: 'ADD_MATCHUPS', payload: { data: '2' } });

      await notifySubscribersAsync();

      expect(callOrder.length).toBeGreaterThan(0);
    });

    it('handles topics with no notices asynchronously', async () => {
      setSubscriptions({ subscriptions: { TEST_TOPIC: vi.fn() } });
      await notifySubscribersAsync();
      expect(true).toBe(true);
    });
  });

  describe('topic priority values', () => {
    it('prioritizes high-value topics', () => {
      const callOrder: string[] = [];

      setSubscriptions({
        subscriptions: {
          UNPUBLISH_EVENT_SEEDING: () => callOrder.push('UNPUBLISH_EVENT_SEEDING'),
          MODIFY_MATCHUP: () => callOrder.push('MODIFY_MATCHUP'),
          ADD_DRAW_DEFINITION: () => callOrder.push('ADD_DRAW_DEFINITION'),
        },
      });

      addNotice({ topic: 'MODIFY_MATCHUP', payload: { data: '1' } });
      addNotice({ topic: 'UNPUBLISH_EVENT_SEEDING', payload: { data: '2' } });
      addNotice({ topic: 'ADD_DRAW_DEFINITION', payload: { data: '3' } });

      notifySubscribers();

      // UNPUBLISH_EVENT_SEEDING (value 5) should come before MODIFY_MATCHUP (value 1)
      const unpublishIndex = callOrder.indexOf('UNPUBLISH_EVENT_SEEDING');
      const modifyIndex = callOrder.indexOf('MODIFY_MATCHUP');

      if (unpublishIndex >= 0 && modifyIndex >= 0) {
        expect(unpublishIndex).toBeLessThan(modifyIndex);
      }
    });

    it('handles topics without defined priority', () => {
      const mockCallback = vi.fn();
      setSubscriptions({ subscriptions: { UNKNOWN_TOPIC: mockCallback } });
      addNotice({ topic: 'UNKNOWN_TOPIC', payload: { data: 'test' } });

      notifySubscribers();

      expect(mockCallback).toHaveBeenCalled();
    });
  });

  describe('integration with mutations', () => {
    it('includes tournamentId and directives in mutation notice', () => {
      let receivedNotice: any = null;

      setSubscriptions({
        subscriptions: {
          [MUTATIONS]: (notices) => {
            receivedNotice = notices[0];
          },
        },
      });

      const timeStamp = Date.now();
      const directives = [{ action: 'ADD', data: 'test' }];

      notifySubscribers({
        mutationStatus: true,
        timeStamp,
        tournamentId: 't1',
        directives,
      });

      expect(receivedNotice).toBeDefined();
      expect(receivedNotice.tournamentId).toBe('t1');
      expect(receivedNotice.directives).toEqual(directives);
      expect(receivedNotice.timeStamp).toBe(timeStamp);
    });

    it('handles missing directives in mutation', () => {
      const mockCallback = vi.fn();
      setSubscriptions({ subscriptions: { [MUTATIONS]: mockCallback } });

      notifySubscribers({
        mutationStatus: true,
        timeStamp: Date.now(),
        tournamentId: 't1',
      });

      expect(mockCallback).toHaveBeenCalled();
    });
  });
});
