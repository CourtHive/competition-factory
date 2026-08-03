import { addNotice, deleteNotice, deleteNotices, getNotices, setSubscriptions } from '@Global/state/globalState';
import { deleteDrawNotice } from '@Mutate/notifications/drawNotifications';
import { ADD_DRAW_DEFINITION, DELETED_DRAW_IDS, DELETED_MATCHUP_IDS } from '@Constants/topicConstants';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Regression coverage for Workstream 0 — notice DELIVERY bugs. The pre-existing
// `deleteDrawNotice succeeds` test only asserted `result.success`, so it never
// exercised delivery — which is exactly why 0a survived. These assert what a
// subscriber actually receives.

const reset = () => {
  setSubscriptions({ subscriptions: {} });
  deleteNotices();
};

describe('notice delivery bugs (Workstream 0)', () => {
  beforeEach(reset);
  afterEach(reset);

  it('0a: deleteDrawNotice delivers DELETED_DRAW_IDS (was purged by its own key)', () => {
    setSubscriptions({ subscriptions: { [DELETED_DRAW_IDS]: () => {}, [DELETED_MATCHUP_IDS]: () => {} } });
    deleteNotices();

    deleteDrawNotice({ drawId: 'd1', tournamentId: 't1' });

    const delivered = getNotices({ topic: DELETED_DRAW_IDS });
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ drawId: 'd1', tournamentId: 't1' });
  });

  it('0a: deleteDrawNotice still purges a prior keyed draw notice for the same drawId', () => {
    setSubscriptions({ subscriptions: { [ADD_DRAW_DEFINITION]: () => {}, [DELETED_DRAW_IDS]: () => {} } });
    deleteNotices();

    // a stale ADD/MODIFY draw notice keyed by drawId should be dropped on delete
    addNotice({ topic: ADD_DRAW_DEFINITION, payload: { drawId: 'd1' }, key: 'd1' });
    deleteDrawNotice({ drawId: 'd1', tournamentId: 't1' });

    expect(getNotices({ topic: ADD_DRAW_DEFINITION })).toHaveLength(0); // stale add purged
    expect(getNotices({ topic: DELETED_DRAW_IDS })).toHaveLength(1); // delete still delivered
  });

  it('0b: topic-scoped deleteNotice removes only that topic (was deleting others)', () => {
    setSubscriptions({ subscriptions: { topicA: () => {}, topicB: () => {} } });
    deleteNotices();

    addNotice({ topic: 'topicA', payload: {}, key: 'k1' });
    addNotice({ topic: 'topicB', payload: {}, key: 'k2' });

    deleteNotice({ topic: 'topicA', key: 'k1' });

    expect(getNotices({ topic: 'topicA' })).toHaveLength(0); // A/k1 removed
    expect(getNotices({ topic: 'topicB' })).toHaveLength(1); // B/k2 UNTOUCHED (pre-fix: wiped)
  });

  it('0b: keyless deleteNotice still purges the key across all topics (unchanged)', () => {
    setSubscriptions({ subscriptions: { topicA: () => {}, topicB: () => {} } });
    deleteNotices();

    addNotice({ topic: 'topicA', payload: {}, key: 'shared' });
    addNotice({ topic: 'topicB', payload: {}, key: 'shared' });

    deleteNotice({ key: 'shared' }); // no topic → purge by key across all topics

    expect(getNotices({ topic: 'topicA' })).toHaveLength(0);
    expect(getNotices({ topic: 'topicB' })).toHaveLength(0);
  });
});
