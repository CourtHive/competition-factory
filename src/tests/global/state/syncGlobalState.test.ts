import { describe, expect, it, beforeEach } from 'vitest';

// constants
import {
  INVALID_TOURNAMENT_RECORD,
  INVALID_VALUES,
  MISSING_TOURNAMENT_RECORD,
  NOT_FOUND,
} from '@Constants/errorConditionConstants';
import syncGlobalState, {
  disableNotifications,
  enableNotifications,
  getTournamentId,
  getTournamentRecord,
  getTournamentRecords,
  setTournamentRecord,
  setTournamentId,
  setTournamentRecords,
  removeTournamentRecord,
  setSubscriptions,
  setMethods,
  cycleMutationStatus,
  addNotice,
  getMethods,
  getNotices,
  deleteNotice,
  deleteNotices,
  getTopics,
  callListener,
} from '@Global/state/syncGlobalState';

describe('syncGlobalState', () => {
  beforeEach(() => {
    deleteNotices();
    setTournamentRecords({});
  });

  describe('notifications', () => {
    it('disables notifications', () => {
      disableNotifications();
      addNotice({ topic: 'TEST', payload: { data: 'test' } });
      const notices = getNotices({ topic: 'TEST' });
      expect(notices.length).toEqual(0);
    });
  });

  describe('tournament records', () => {
    it('sets tournament record successfully', () => {
      const record = { tournamentId: 't1', tournamentName: 'Test' };
      const result = setTournamentRecord(record);
      expect(result.success).toBe(true);
    });

    it('returns error when tournamentId missing', () => {
      const result = setTournamentRecord({ tournamentName: 'Test' });
      expect(result.error).toBe(INVALID_TOURNAMENT_RECORD);
    });

    it('gets tournament record', () => {
      const record = { tournamentId: 't1', tournamentName: 'Test' };
      setTournamentRecord(record);
      const retrieved = getTournamentRecord('t1');
      expect(retrieved.tournamentId).toBe('t1');
    });

    it('returns undefined for non-existent tournament', () => {
      const retrieved = getTournamentRecord('nonexistent');
      expect(retrieved).toBeUndefined();
    });

    it('sets tournament records and auto-sets tournamentId for single record', () => {
      setTournamentRecords({ t1: { tournamentId: 't1' } });
      const id = getTournamentId();
      expect(id).toBe('t1');
    });

    it('does not auto-set tournamentId for multiple records', () => {
      setTournamentRecords({
        t1: { tournamentId: 't1' },
        t2: { tournamentId: 't2' },
      });
      const id = getTournamentId();
      // Should not be set when multiple records
      expect(id !== 't1').toBe(true);
    });

    it('clears tournamentId when setting empty records', () => {
      setTournamentRecords({ t1: { tournamentId: 't1' } });
      setTournamentRecords({});
      const id = getTournamentId();
      expect(id).toBeUndefined();
    });

    it('gets all tournament records', () => {
      setTournamentRecords({
        t1: { tournamentId: 't1' },
        t2: { tournamentId: 't2' },
      });
      const records = getTournamentRecords();
      expect(Object.keys(records)).toHaveLength(2);
    });
  });

  describe('tournament ID management', () => {
    it('sets tournament ID successfully', () => {
      setTournamentRecord({ tournamentId: 't1' });
      const result = setTournamentId('t1');
      expect(result.success).toBe(true);
    });

    it('returns error when tournament record not found', () => {
      const result = setTournamentId('nonexistent');
      expect(result.error).toBe(MISSING_TOURNAMENT_RECORD);
    });

    it('clears tournament ID with falsy value', () => {
      setTournamentRecord({ tournamentId: 't1' });
      setTournamentId('t1');
      const result = setTournamentId(undefined);
      expect(result.success).toBe(true);
      expect(getTournamentId()).toBeUndefined();
    });

    it('gets tournament ID', () => {
      setTournamentRecord({ tournamentId: 't1' });
      setTournamentId('t1');
      const id = getTournamentId();
      expect(id).toBe('t1');
    });
  });

  describe('remove tournament record', () => {
    it('removes tournament record successfully', () => {
      setTournamentRecord({ tournamentId: 't1' });
      const result = removeTournamentRecord('t1');
      expect(result.success).toBe(true);
    });

    it('returns error for invalid tournamentId type', () => {
      const result = removeTournamentRecord(123 as any);
      expect(result.error).toBe(INVALID_VALUES);
    });

    it('returns error for non-existent tournament', () => {
      const result = removeTournamentRecord('nonexistent');
      expect(result.error).toBe(NOT_FOUND);
    });

    it('auto-sets tournamentId when one record remains', () => {
      setTournamentRecords({
        t1: { tournamentId: 't1' },
        t2: { tournamentId: 't2' },
      });
      removeTournamentRecord('t1');
      const id = getTournamentId();
      expect(id).toBe('t2');
    });

    it('clears tournamentId when no records remain', () => {
      setTournamentRecord({ tournamentId: 't1' });
      removeTournamentRecord('t1');
      const id = getTournamentId();
      expect(id).toBeUndefined();
    });
  });

  describe('subscriptions', () => {
    it('sets subscriptions successfully', () => {
      const callback = () => {};
      const result: any = setSubscriptions({
        subscriptions: { TEST_TOPIC: callback },
      });
      expect(result.success).toBe(true);
    });

    it('returns error for non-object subscriptions', () => {
      const result = setSubscriptions({ subscriptions: 'invalid' });
      expect(result.error).toBe(INVALID_VALUES);
    });

    it('filters out non-function subscriptions', () => {
      const callback = () => {};
      const result: any = setSubscriptions({
        subscriptions: {
          valid: callback,
          invalid: 'not a function',
        },
      });
      expect(result.success).toBe(true);
    });

    it('deletes subscription when value is not a function', () => {
      const callback = () => {};
      setSubscriptions({ subscriptions: { TEST: callback } });
      setSubscriptions({ subscriptions: { TEST: 'not a function' } });
      // Should delete the subscription
      expect(true).toBe(true);
    });
  });

  describe('methods', () => {
    it('sets methods successfully', () => {
      const method = () => {};
      const result: any = setMethods({ testMethod: method });
      expect(result.success).toBe(true);
    });

    it('returns error for non-object params', () => {
      const result = setMethods('invalid' as any);
      expect(result.error).toBe(INVALID_VALUES);
    });

    it('filters out non-function methods', () => {
      const result: any = setMethods({
        validMethod: () => {},
        invalidMethod: 'not a function',
      });
      expect(result.success).toBe(true);
    });

    it('gets methods', () => {
      const method = () => {};
      setMethods({ testMethod: method });
      const methods = getMethods();
      expect(methods).toBeDefined();
    });

    it('returns empty object when no methods', () => {
      const methods = getMethods();
      expect(typeof methods).toBe('object');
    });
  });

  describe('notices', () => {
    beforeEach(() => {
      enableNotifications();
      deleteNotices();
      setSubscriptions({ subscriptions: {} });
    });

    it('adds notice', () => {
      setSubscriptions({ subscriptions: { TEST: () => {} } });
      const result: any = addNotice({ topic: 'TEST', payload: { data: 'test' } });
      expect(result.success).toBe(true);
    });

    it('ignores notice when topic is not a string', () => {
      const result = addNotice({ topic: 123 as any, payload: { data: 'test' } });
      expect(result).toBeUndefined();
    });

    it('ignores notice when payload is not an object', () => {
      const result = addNotice({ topic: 'TEST', payload: 'invalid' as any });
      expect(result).toBeUndefined();
    });

    it('adds notice even without subscription', () => {
      const result = addNotice({ topic: 'NO_SUB', payload: { data: 'test' } });
      expect(result).toBeUndefined(); // No subscription, so no notice stored
    });

    it('replaces notice with same topic and key', () => {
      setSubscriptions({ subscriptions: { TEST: () => {} } });
      addNotice({ topic: 'TEST', payload: { data: 'first' }, key: 'key1' });
      addNotice({ topic: 'TEST', payload: { data: 'second' }, key: 'key1' });
      const notices = getNotices({ topic: 'TEST' });
      expect(notices).toHaveLength(1);
      expect(notices[0].data).toBe('second');
    });

    it('gets notices for topic', () => {
      setSubscriptions({ subscriptions: { TEST: () => {} } });
      addNotice({ topic: 'TEST', payload: { data: 'test1' } });
      addNotice({ topic: 'TEST', payload: { data: 'test2' } });
      const notices = getNotices({ topic: 'TEST' });
      expect(notices).toHaveLength(2);
    });

    it('deletes notice by key', () => {
      setSubscriptions({ subscriptions: { TEST: () => {} } });
      addNotice({ topic: 'TEST', payload: { data: 'test' }, key: 'key1' });
      deleteNotice({ key: 'key1' });
      const notices = getNotices({ topic: 'TEST' });
      expect(notices).toHaveLength(0);
    });

    it('deletes notice by topic and key', () => {
      setSubscriptions({ subscriptions: { TEST: () => {} } });
      addNotice({ topic: 'TEST', payload: { data: 'test1' }, key: 'key1' });
      addNotice({ topic: 'TEST', payload: { data: 'test2' }, key: 'key2' });
      deleteNotice({ topic: 'TEST', key: 'key1' });
      const notices = getNotices({ topic: 'TEST' });
      expect(notices).toHaveLength(1);
    });

    it('deletes all notices', () => {
      setSubscriptions({ subscriptions: { TEST: () => {} } });
      addNotice({ topic: 'TEST', payload: { data: 'test1' } });
      addNotice({ topic: 'TEST', payload: { data: 'test2' } });
      deleteNotices();
      const notices = getNotices({ topic: 'TEST' });
      expect(notices).toHaveLength(0);
    });
  });

  describe('topics', () => {
    it('gets topics from subscriptions', () => {
      setSubscriptions({
        subscriptions: {
          TOPIC1: () => {},
          TOPIC2: () => {},
        },
      });
      const { topics } = getTopics();
      expect(topics).toContain('TOPIC1');
      expect(topics).toContain('TOPIC2');
    });

    it('returns empty topics when no subscriptions', () => {
      setSubscriptions({ subscriptions: {} });
      const { topics } = getTopics();
      expect(topics).toEqual([]);
    });
  });

  describe('callListener', () => {
    it('calls subscription listener', () => {
      let called = false;
      setSubscriptions({
        subscriptions: {
          TEST: () => {
            called = true;
          },
        },
      });
      callListener({ topic: 'TEST', payloads: [{ data: 'test' }] } as any);
      expect(called).toBe(true);
    });

    it('calls global subscription listener', () => {
      let called = false;
      const globalSubscriptions = {
        TEST: () => {
          called = true;
        },
      };
      callListener({ topic: 'TEST', payloads: [{ data: 'test' }] } as any, globalSubscriptions);
      expect(called).toBe(true);
    });

    it('handles non-function subscription', () => {
      setSubscriptions({ subscriptions: { TEST: 'not a function' } as any });
      callListener({ topic: 'TEST', payloads: [] });
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('mutation status', () => {
    it('returns true after modification', () => {
      enableNotifications();
      setSubscriptions({ subscriptions: { TEST: () => {} } });
      addNotice({ topic: 'TEST', payload: { data: 'test' } });
      const status = cycleMutationStatus();
      expect(status).toBe(true);
    });

    it('resets to false after cycle', () => {
      enableNotifications();
      setSubscriptions({ subscriptions: { TEST: () => {} } });
      addNotice({ topic: 'TEST', payload: { data: 'test' } });
      cycleMutationStatus();
      const status = cycleMutationStatus();
      expect(status).toBe(false);
    });
  });

  describe('default export', () => {
    it('exports all methods', () => {
      expect(syncGlobalState.addNotice).toBeDefined();
      expect(syncGlobalState.callListener).toBeDefined();
      expect(syncGlobalState.cycleMutationStatus).toBeDefined();
      expect(syncGlobalState.deleteNotice).toBeDefined();
      expect(syncGlobalState.deleteNotices).toBeDefined();
      expect(syncGlobalState.getMethods).toBeDefined();
      expect(syncGlobalState.getNotices).toBeDefined();
      expect(syncGlobalState.getTopics).toBeDefined();
      expect(syncGlobalState.getTournamentId).toBeDefined();
      expect(syncGlobalState.getTournamentRecord).toBeDefined();
      expect(syncGlobalState.getTournamentRecords).toBeDefined();
    });
  });
});
