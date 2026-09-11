import { modifyDrawEntriesNotice, modifyEventEntriesNotice } from '@Mutate/notifications/entriesNotifications';
import { deleteNotices, getNotices, setSubscriptions } from '@Global/state/globalState';
import { MODIFY_DRAW_ENTRIES, MODIFY_EVENT_ENTRIES } from '@Constants/topicConstants';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const reset = () => {
  setSubscriptions({ subscriptions: {} });
  deleteNotices();
};

describe('entriesNotifications', () => {
  beforeEach(reset);
  afterEach(reset);

  it('modifyEventEntriesNotice dispatches MODIFY_EVENT_ENTRIES with eventId + entries', () => {
    setSubscriptions({ subscriptions: { [MODIFY_EVENT_ENTRIES]: () => {} } });
    deleteNotices();
    const event = { eventId: 'e1', entries: [{ participantId: 'p1' }] } as any;
    modifyEventEntriesNotice({ event, tournamentId: 't1' });
    const delivered = getNotices({ topic: MODIFY_EVENT_ENTRIES });
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ tournamentId: 't1', eventId: 'e1' });
  });

  it('modifyEventEntriesNotice is a no-op (success) without an eventId', () => {
    const result: any = modifyEventEntriesNotice({ event: {} as any });
    expect(result.success).toEqual(true);
  });

  it('modifyDrawEntriesNotice dispatches MODIFY_DRAW_ENTRIES with drawId + eventId', () => {
    setSubscriptions({ subscriptions: { [MODIFY_DRAW_ENTRIES]: () => {} } });
    deleteNotices();
    const drawDefinition = { drawId: 'd1', entries: [{ participantId: 'p1' }] } as any;
    modifyDrawEntriesNotice({ drawDefinition, tournamentId: 't1', eventId: 'e1' });
    const delivered = getNotices({ topic: MODIFY_DRAW_ENTRIES });
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ drawId: 'd1', eventId: 'e1' });
  });

  it('modifyDrawEntriesNotice is a no-op (success) without a drawId', () => {
    const result: any = modifyDrawEntriesNotice({ drawDefinition: {} as any });
    expect(result.success).toEqual(true);
  });
});
