import { modifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';
import { deleteNotices, getNotices, setSubscriptions } from '@Global/state/globalState';
import { MODIFY_PARTICIPANTS } from '@Constants/topicConstants';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const reset = () => {
  setSubscriptions({ subscriptions: {} });
  deleteNotices();
};
const subscribe = () => {
  setSubscriptions({ subscriptions: { [MODIFY_PARTICIPANTS]: () => {} } });
  deleteNotices();
};

describe('modifyParticipantsNotice (tournament-keyed union dedup)', () => {
  beforeEach(reset);
  afterEach(reset);

  it('dispatches MODIFY_PARTICIPANTS keyed by tournamentId', () => {
    subscribe();
    modifyParticipantsNotice({ tournamentId: 't1', participants: [{ participantId: 'p1' } as any] });
    const delivered = getNotices({ topic: MODIFY_PARTICIPANTS });
    expect(delivered).toHaveLength(1);
    expect(delivered[0].participants.map((p: any) => p.participantId)).toEqual(['p1']);
  });

  it('unions participants across cycle calls for one tournament — one notice, deduped by participantId, latest wins', () => {
    subscribe();
    modifyParticipantsNotice({ tournamentId: 't1', participants: [{ participantId: 'p1', v: 1 } as any] });
    modifyParticipantsNotice({
      tournamentId: 't1',
      participants: [{ participantId: 'p2' } as any, { participantId: 'p1', v: 2 } as any],
    });
    const delivered = getNotices({ topic: MODIFY_PARTICIPANTS });
    expect(delivered).toHaveLength(1); // collapsed by key=tournamentId
    const parts = delivered[0].participants;
    expect(parts.map((p: any) => p.participantId).toSorted((a: string, b: string) => a.localeCompare(b))).toEqual([
      'p1',
      'p2',
    ]);
    expect(parts.find((p: any) => p.participantId === 'p1').v).toEqual(2); // latest wins
  });

  it('keeps separate notices per tournament', () => {
    subscribe();
    modifyParticipantsNotice({ tournamentId: 't1', participants: [{ participantId: 'p1' } as any] });
    modifyParticipantsNotice({ tournamentId: 't2', participants: [{ participantId: 'p2' } as any] });
    expect(getNotices({ topic: MODIFY_PARTICIPANTS })).toHaveLength(2);
  });

  it('is a no-op (success) with empty participants', () => {
    const result: any = modifyParticipantsNotice({ tournamentId: 't1', participants: [] });
    expect(result.success).toEqual(true);
  });
});
