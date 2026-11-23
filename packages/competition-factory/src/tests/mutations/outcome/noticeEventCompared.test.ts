import { deleteNotices, getNotices, setSubscriptions } from '@Global/state/globalState';
import { compareNotices, plannedNotices } from '@Mutate/matchUps/outcome/shadow';
import { applyOwnedPlan } from '@Mutate/matchUps/outcome/apply';
import { describe, expect, it } from 'vitest';

// constants
import { MODIFY_MATCHUP, MODIFY_POSITION_ASSIGNMENTS, UPDATE_INCONTEXT_MATCHUP } from '@Constants/topicConstants';

/**
 * THE DIFFERENTIAL COMPARES WHETHER A NOTICE NAMES ITS EVENT (outcome v2 executor plan, S7). It compared notices by
 * topic and key alone, and passed while a dual's `modifyMatchUp` notices differed in `eventId` (S7 item 13): only
 * the OWNED tests' exact comparison caught it. A `modifyMatchUp` or `modifyPositionAssignments` whose payload names no
 * event is now marked, on v1's side from the payload and on v2's from the ops (`eventlessNotices`, the rules
 * `applyOwnedPlan` writes with).
 */
describe('the event a notice names is compared', () => {
  const topics = [MODIFY_MATCHUP, MODIFY_POSITION_ASSIGNMENTS, UPDATE_INCONTEXT_MATCHUP];
  const stamp = (id: string) => ({ op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id });
  const lineUp = (announcesEvent?: false) => ({
    op: 'setSideLineUp' as const,
    matchUpId: 'dual',
    sideNumber: 1,
    lineUp: [],
    announcedAs: 'updateSidLineUp' as const,
    ...(announcesEvent === false ? { announcesEvent } : {}),
  });
  const v1Notice = (eventId?: string) => [
    { topic: UPDATE_INCONTEXT_MATCHUP, key: 'm' },
    { topic: MODIFY_MATCHUP, key: 'dual', payload: { eventId } },
  ];

  it('a line-up written with no event: v1 naming none is equal, v1 naming the event diverges', () => {
    const planned = plannedNotices({ ops: [lineUp(false), stamp('dual')], matchUpId: 'm' });
    expect(compareNotices({ planned, added: v1Notice(), topics }).equal).toEqual(true);
    const named = compareNotices({ planned, added: v1Notice('e'), topics });
    expect(named.equal).toEqual(false);
  });

  it('a line-up written with its event: v1 naming none diverges', () => {
    const planned = plannedNotices({ ops: [lineUp(), stamp('dual')], matchUpId: 'm' });
    expect(compareNotices({ planned, added: v1Notice('e'), topics }).equal).toEqual(true);
    expect(compareNotices({ planned, added: v1Notice(), topics }).equal).toEqual(false);
  });

  it("the call's own in-context notice is compared by topic and key alone", () => {
    const planned = plannedNotices({
      ops: [{ op: 'setMatchUpResult', matchUpId: 'm', matchUpStatus: 'TO_BE_PLAYED' }],
      matchUpId: 'm',
    });
    const added = [{ topic: UPDATE_INCONTEXT_MATCHUP, key: 'm', payload: {} }];
    expect(compareNotices({ planned, added, topics }).equal).toEqual(true);
    expect(compareNotices({ planned, added: [], topics }).equal).toEqual(false);
  });

  it('a satisfied result with an empty plan announces nothing', () => {
    const planned = plannedNotices({ ops: [], matchUpId: 'm' });
    expect(compareNotices({ planned, added: [], topics }).equal).toEqual(true);
    expect(compareNotices({ planned, added: [{ topic: UPDATE_INCONTEXT_MATCHUP, key: 'm' }], topics }).equal).toEqual(
      false,
    );
  });

  // v1's buffer keeps the last write's context and an earlier write's event (`preserveNoticeIdentity`, S6 tail)
  const bye = { op: 'setMatchUpBye' as const, matchUpId: 'c' };
  const advance = {
    op: 'setMatchUpDrawPositions' as const,
    matchUpId: 'c',
    drawPositions: [7],
    advancesThroughBye: true as const,
  };
  const byeNotice = (eventId?: string) => [
    { topic: UPDATE_INCONTEXT_MATCHUP, key: 'm' },
    { topic: MODIFY_MATCHUP, key: 'c', payload: { eventId } },
  ];

  it("a BYE, then an advance through it naming no event: the BYE's event is kept", () => {
    const planned = plannedNotices({ ops: [bye, stamp('c'), advance, stamp('c')], matchUpId: 'm' });
    expect(compareNotices({ planned, added: byeNotice('e'), topics }).equal).toEqual(true);
    expect(compareNotices({ planned, added: byeNotice(), topics }).equal).toEqual(false);
  });

  it("a BYE, then a second BYE naming no event (an unfillable seat's): the first BYE's event is kept", () => {
    const unfillable = { op: 'setMatchUpBye' as const, matchUpId: 'c', announcesEvent: false as const };
    const planned = plannedNotices({ ops: [bye, stamp('c'), unfillable, stamp('c')], matchUpId: 'm' });
    expect(compareNotices({ planned, added: byeNotice('e'), topics }).equal).toEqual(true);
    expect(compareNotices({ planned, added: byeNotice(), topics }).equal).toEqual(false);
  });

  const score = (flags: { announcesContext?: false; restoresNoticeIdentity?: true } = {}) => ({
    op: 'setMatchUpResult' as const,
    matchUpId: 'c',
    matchUpStatus: 'WALKOVER' as const,
    ...flags,
  });
  const scoreNotice = (eventId?: string) => [...byeNotice(eventId), { topic: UPDATE_INCONTEXT_MATCHUP, key: 'c' }];

  it('a restoring score after a quiet score names its event and still defers its in-context notice', () => {
    const planned = plannedNotices({
      ops: [score({ announcesContext: false }), stamp('c'), score({ restoresNoticeIdentity: true }), stamp('c')],
      matchUpId: 'm',
    });
    expect(compareNotices({ planned, added: scoreNotice('e'), topics }).equal).toEqual(true);
    expect(compareNotices({ planned, added: scoreNotice(), topics }).equal).toEqual(false);
  });

  it('a later quiet score supersedes a restoring score and names no event', () => {
    const planned = plannedNotices({
      ops: [score({ restoresNoticeIdentity: true }), stamp('c'), score({ announcesContext: false }), stamp('c')],
      matchUpId: 'm',
    });
    expect(compareNotices({ planned, added: scoreNotice(), topics }).equal).toEqual(true);
    expect(compareNotices({ planned, added: scoreNotice('e'), topics }).equal).toEqual(false);
  });

  it('an unmarked score after a quiet score keeps the existing eventless boundary', () => {
    const planned = plannedNotices({
      ops: [score({ announcesContext: false }), stamp('c'), score(), stamp('c')],
      matchUpId: 'm',
    });
    expect(compareNotices({ planned, added: scoreNotice(), topics }).equal).toEqual(true);
    expect(compareNotices({ planned, added: scoreNotice('e'), topics }).equal).toEqual(false);
  });

  it('an advance through a BYE alone names no event', () => {
    const planned = plannedNotices({ ops: [advance, stamp('c')], matchUpId: 'm' });
    expect(compareNotices({ planned, added: byeNotice(), topics }).equal).toEqual(true);
  });
});

// The real writers restored by C13: assignDrawPositionBye and advanceWinner follow the unwind's quiet removals.
describe('C13 actual writer identity follows operation order', () => {
  const clear = { op: 'clearMatchUpBye' as const, matchUpId: 'c', drawPosition: 1 };
  const bye = { op: 'setMatchUpBye' as const, matchUpId: 'c' };
  const release = {
    op: 'setMatchUpDrawPositions' as const,
    matchUpId: 'c',
    drawPositions: [],
    releasedDrawPosition: 2,
    announcesContext: false as const,
  };
  const advance = {
    op: 'setMatchUpDrawPositions' as const,
    matchUpId: 'c',
    drawPositions: [2],
    advancesThroughBye: true as const,
  };
  function notice(ops: Parameters<typeof applyOwnedPlan>[0]['ops']) {
    const matchUp = { matchUpId: 'c', drawPositions: [1, 2], matchUpStatus: 'BYE', roundNumber: 1, roundPosition: 1 };
    const drawDefinition = {
      drawId: 'd',
      structures: [
        {
          structureId: 's',
          stage: 'MAIN',
          structureType: 'ITEM',
          positionAssignments: [
            { drawPosition: 1, bye: true, byeFromPropagation: true },
            { drawPosition: 2, participantId: 'p' },
          ],
          matchUps: [matchUp],
        },
      ],
    };
    const event = { eventId: 'e', drawDefinitions: [drawDefinition] };
    const tournamentRecord = { tournamentId: 't', events: [event] };
    deleteNotices();
    setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: () => {} } });
    try {
      const result = applyOwnedPlan({
        shape: 'direction',
        ops,
        args: { drawDefinition, tournamentRecord, event, matchUpsMap: { drawMatchUps: [matchUp] } } as any,
      });
      expect(result.success).toEqual(true);
      const written = getNotices({ topic: MODIFY_MATCHUP });
      expect(written).toHaveLength(1);
      return written[0];
    } finally {
      deleteNotices();
      setSubscriptions({ subscriptions: {} });
    }
  }
  it('a restored BYE supersedes the withdrawal name and restores event and tournament', () => {
    expect(notice([clear, bye])).toMatchObject({ context: 'setMatchUpStatusBye', eventId: 'e', tournamentId: 't' });
  });
  it('a later withdrawal retains its position name and omits event and tournament', () => {
    const actual = notice([bye, clear]);
    expect(actual.context).toEqual('removeDrawPosition-1');
    expect(actual.eventId).toBeUndefined();
    expect(actual.tournamentId).toBeUndefined();
  });
  it('a restored advancement names the tournament after a quiet release, without inventing an event', () => {
    const actual = notice([release, advance]);
    expect(actual.context).toEqual('advanceWinner');
    expect(actual.tournamentId).toEqual('t');
    expect(actual.eventId).toBeUndefined();
  });
  it('a later quiet release still omits the tournament after an advancement', () => {
    const actual = notice([advance, release]);
    expect(actual.tournamentId).toBeUndefined();
    expect(actual.eventId).toBeUndefined();
  });
});
