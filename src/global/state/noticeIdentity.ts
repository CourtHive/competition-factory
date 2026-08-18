import { NoticeIdentity } from '../../forge/topicTypes';

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
