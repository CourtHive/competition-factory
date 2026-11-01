import { compareNotices, plannedNotices } from '@Mutate/matchUps/outcome/shadow';
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
    const planned = plannedNotices({ ops: [], matchUpId: 'm' });
    const added = [{ topic: UPDATE_INCONTEXT_MATCHUP, key: 'm', payload: {} }];
    expect(compareNotices({ planned, added, topics }).equal).toEqual(true);
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

  it('an advance through a BYE alone names no event', () => {
    const planned = plannedNotices({ ops: [advance, stamp('c')], matchUpId: 'm' });
    expect(compareNotices({ planned, added: byeNotice(), topics }).equal).toEqual(true);
  });
});
