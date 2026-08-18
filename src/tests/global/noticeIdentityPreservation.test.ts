import { setSubscriptions, addNotice, getNotices, deleteNotices } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants and types
import { MODIFY_DRAW_DEFINITION } from '@Constants/topicConstants';

/**
 * Keyed notices de-duplicate: a later notice with the same topic+key REPLACES the earlier one, so a
 * subscriber sees only the last writer. That coalescing is intentional — one notice per entity per
 * mutation — but replacing wholesale meant a later, LESS-identified notice destroyed identity the
 * system already knew.
 *
 * Measured before this fix: generating one draw fires ~12 MODIFY_DRAW_DEFINITION emissions for the
 * same drawId; eight consecutive ones carried eventId + tournamentId and the FINAL one carried
 * neither — so the only unroutable emission in the batch was the one delivered.
 */
describe('keyed notice de-dup preserves identity', () => {
  it('a later notice missing identity inherits it from the one it supersedes', () => {
    setSubscriptions({ subscriptions: { [MODIFY_DRAW_DEFINITION]: () => {} } });
    deleteNotices();

    addNotice({
      topic: MODIFY_DRAW_DEFINITION,
      payload: { tournamentId: 't1', eventId: 'e1', drawDefinition: { drawId: 'd1', v: 1 } },
      key: 'd1',
    });
    // the shape that used to win: same entity, no identity at all
    addNotice({
      topic: MODIFY_DRAW_DEFINITION,
      payload: { drawDefinition: { drawId: 'd1', v: 2 } },
      key: 'd1',
    });

    const notices = getNotices({ topic: MODIFY_DRAW_DEFINITION });
    expect(notices.length).toEqual(1); // coalescing still happens
    expect(notices[0].drawDefinition.v).toEqual(2); // last writer still wins for the ENTITY
    expect(notices[0].eventId).toEqual('e1'); // ...but identity survives
    expect(notices[0].tournamentId).toEqual('t1');

    deleteNotices();
    setSubscriptions({ subscriptions: {} });
  });

  it('a later notice NEVER has its own identity overwritten', () => {
    // Guards the direction of the merge: fill only what is undefined.
    setSubscriptions({ subscriptions: { [MODIFY_DRAW_DEFINITION]: () => {} } });
    deleteNotices();

    addNotice({ topic: MODIFY_DRAW_DEFINITION, payload: { eventId: 'OLD', drawDefinition: {} }, key: 'd1' });
    addNotice({ topic: MODIFY_DRAW_DEFINITION, payload: { eventId: 'NEW', drawDefinition: {} }, key: 'd1' });

    expect(getNotices({ topic: MODIFY_DRAW_DEFINITION })[0].eventId).toEqual('NEW');

    deleteNotices();
    setSubscriptions({ subscriptions: {} });
  });

  it('different keys do not bleed identity into each other', () => {
    setSubscriptions({ subscriptions: { [MODIFY_DRAW_DEFINITION]: () => {} } });
    deleteNotices();

    addNotice({ topic: MODIFY_DRAW_DEFINITION, payload: { eventId: 'e1', drawDefinition: {} }, key: 'd1' });
    addNotice({ topic: MODIFY_DRAW_DEFINITION, payload: { drawDefinition: {} }, key: 'd2' });

    const notices = getNotices({ topic: MODIFY_DRAW_DEFINITION });
    expect(notices.length).toEqual(2);
    expect(notices.find((n: any) => n.eventId === 'e1')).toBeDefined();
    // d2 never had an eventId and must not acquire d1's
    expect(notices.filter((n: any) => n.eventId === 'e1').length).toEqual(1);

    deleteNotices();
    setSubscriptions({ subscriptions: {} });
  });

  it('END TO END: generating a draw delivers a MODIFY_DRAW_DEFINITION that carries its eventId', () => {
    // The bug in situ. Before this fix the delivered notice had neither eventId nor tournamentId,
    // even though eight earlier emissions for the same drawId carried both.
    const notices: any[] = [];
    setSubscriptions({ subscriptions: { [MODIFY_DRAW_DEFINITION]: (n: any[]) => notices.push(...n) } });

    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: 'SINGLE_ELIMINATION' }],
      participantsProfile: { nonRandom: 1 },
      setState: true,
    });

    expect(notices.length).toBeGreaterThan(0);
    expect(notices.filter((n: any) => !n.eventId)).toEqual([]);
    expect(notices[0].eventId).toEqual(eventId);

    setSubscriptions({ subscriptions: {} });
  });

  it('the identity field list matches NoticeIdentity — no drift', async () => {
    // Same guard style as the TopicPayloadMap key check: a field added to the interface but not to
    // the runtime list would silently stop being preserved.
    const fs = await import('fs');
    const path = await import('path');

    const types = fs.readFileSync(path.resolve(__dirname, '../../forge/topicTypes.ts'), 'utf8');
    const body = types.slice(types.indexOf('export interface NoticeIdentity'));
    const declared = [...body.slice(0, body.indexOf('\n}')).matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);

    const src = fs.readFileSync(path.resolve(__dirname, '../../global/state/syncGlobalState.ts'), 'utf8');
    const listBody = src.slice(src.indexOf('const NOTICE_IDENTITY_FIELDS'));
    const runtime = [...listBody.slice(0, listBody.indexOf(']')).matchAll(/'(\w+)'/g)].map((m) => m[1]);

    expect(declared.length).toBeGreaterThan(3);
    expect(runtime.sort()).toEqual(declared.sort());
  });
});
