import { NoticeIdentity } from '@Types/topicTypes';
import type { Notice } from './globalState';
import { SUCCESS } from '@Constants/resultConstants';

/** Provider-owned notice state; also usable as an isolated differential snapshot. */
export type NoticeState = {
  disableNotifications: boolean;
  subscriptions: Record<string, unknown>;
  notices: Notice[];
  modified: boolean;
  modifiedTournamentIds?: Set<string>;
  modifiedTopics?: Set<string>;
};

/** The buffer's insertion and identity rules, shared by the live provider and private replay. */
export function appendNotice(state: NoticeState, { topic, payload, key }: Notice, isGlobalSubscription?: boolean) {
  if (typeof topic !== 'string' || typeof payload !== 'object') return;
  if (!state.disableNotifications && noticeModifies(topic)) {
    state.modified = true;
    state.modifiedTournamentIds ??= new Set();
    state.modifiedTournamentIds.add(modifiedTournamentId(payload));
    state.modifiedTopics ??= new Set();
    state.modifiedTopics.add(topic || UNANNOUNCED_WRITE);
  }
  if (state.disableNotifications || (!state.subscriptions[topic] && !isGlobalSubscription)) return;
  let outgoing = payload;
  if (key) {
    const retained: Notice[] = [];
    for (const notice of state.notices) {
      if (notice.topic === topic && notice.key === key) outgoing = preserveNoticeIdentity(outgoing, notice.payload);
      else retained.push(notice);
    }
    state.notices = retained;
  }
  state.notices.push({ topic, payload: outgoing, key });
  return { ...SUCCESS };
}

// constants
import {
  ADD_MATCHUPS,
  AUDIT,
  DATA_ISSUE,
  DELETED_MATCHUP_IDS,
  MODIFY_DRAW_DEFINITION,
  MODIFY_DRAW_ENTRIES,
  MODIFY_MATCHUP,
  MODIFY_POSITION_ASSIGNMENTS,
  MODIFY_SEED_ASSIGNMENTS,
  UPDATE_INCONTEXT_MATCHUP,
} from '@Constants/topicConstants';

/**
 * Identity fields carried on a notice ENVELOPE — the SINGLE definition.
 *
 * Any provider implementing the notice buffer (factory's `syncGlobalState`, and
 * competition-factory-server's `asyncGlobalState`, which reimplements it for per-request async
 * isolation) must share this, or the two drift and only one of them preserves identity.
 *
 * Keyed to `NoticeIdentity` so a field added to the type without being added here is a compile error
 * rather than a silent omission.
 */
export const NOTICE_IDENTITY_FIELDS: (keyof NoticeIdentity)[] = [
  'tournamentId',
  'eventId',
  'drawId',
  'structureId',
  'originOrganisationId',
  'originTournamentId',
  'originEventId',
  'originDrawId',
];

/**
 * Carry identity forward when a keyed notice supersedes an earlier one.
 *
 * Keyed notices coalesce — a later notice with the same topic+key replaces the earlier one, so a
 * subscriber sees one notice per entity per mutation. That is intentional. Replacing WHOLESALE was
 * not: a later emission often knows LESS.
 *
 * Measured on one generated draw: 12 `MODIFY_DRAW_DEFINITION` emissions for the same drawId, of which
 * eight consecutive ones carried `eventId` AND `tournamentId` while the final one carried NEITHER —
 * so the delivered notice was the only unroutable emission in the batch. Identity the system fully
 * knew was destroyed by the transport, not by any caller omitting it.
 *
 * SOUND because for a given topic+key identity is INVARIANT: a matchUp does not change which
 * structure, draw or event it belongs to, and a draw does not migrate between events. Filling a field
 * the newer payload left `undefined` can only restore the value it would have carried — it cannot
 * override a differing one, because a differing one cannot exist for that key.
 *
 * Returns the payload UNCHANGED (same reference) when nothing needs restoring, so callers that reuse
 * a payload object are unaffected.
 */
export function preserveNoticeIdentity(payload: any, superseded: any): any {
  if (!superseded || typeof payload !== 'object' || payload === null || Array.isArray(payload)) return payload;

  let restored: any;
  for (const field of NOTICE_IDENTITY_FIELDS) {
    if (payload[field] === undefined && superseded[field] !== undefined) {
      restored ??= { ...payload };
      restored[field] = superseded[field];
    }
  }
  return restored ?? payload;
}

/**
 * The record a write modified, for its factory stamp — the SINGLE definition, shared by every provider as
 * `preserveNoticeIdentity` is.
 *
 * A record is stamped only when a call modified it: a notice marks modified the tournament its payload names, or, naming
 * none, every loaded record (the fail-safe: a write is never left unstamped). A notice that reports rather than writes
 * (a data issue, an audit trail) marks nothing; every write that raises one also raises its own notice.
 */
export const UNNAMED_TOURNAMENT = '*';
const REPORTING_TOPICS = new Set([DATA_ISSUE, AUDIT]);

export function noticeModifies(topic: string): boolean {
  return !REPORTING_TOPICS.has(topic);
}

export function modifiedTournamentId(payload?: { tournamentId?: unknown }): string {
  const tournamentId = payload?.tournamentId;
  return typeof tournamentId === 'string' && tournamentId ? tournamentId : UNNAMED_TOURNAMENT;
}

/** The topic recorded for a write marked modified without a notice: nothing says what it changed. */
export const UNANNOUNCED_WRITE = '*';

// the topics of a change confined to a drawDefinition: its matchUps, positions, seeds and entries
const DRAW_TOPICS = new Set([
  ADD_MATCHUPS,
  DELETED_MATCHUP_IDS,
  MODIFY_DRAW_DEFINITION,
  MODIFY_DRAW_ENTRIES,
  MODIFY_MATCHUP,
  MODIFY_POSITION_ASSIGNMENTS,
  MODIFY_SEED_ASSIGNMENTS,
  UPDATE_INCONTEXT_MATCHUP,
]);

/**
 * Whether a call's modifying topics changed anything outside its draws. Unknown topics (`undefined`, from a provider
 * that does not record them) and an unannounced write count as outside: nothing says they were confined to a draw.
 */
export function modifiedOutsideDraws(topics?: Set<string>): boolean {
  if (!topics) return true;
  return [...topics].some((topic) => !DRAW_TOPICS.has(topic));
}
