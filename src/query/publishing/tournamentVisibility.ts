import { getTournamentPublishStatus } from '@Query/tournaments/getTournamentPublishStatus';
import { isTournamentPublished } from '@Query/publishing/isTournamentPublished';
import { isISODateString } from '@Tools/dateTime';

/**
 * WHEN a published tournament becomes publicly visible — the read-time half of the publish model.
 *
 * `isTournamentPublished` answers INTENT: someone published something. This answers VISIBILITY: may a
 * listing show it *now*. The two differ for exactly one reason, an embargoed information publish, and
 * they differ deliberately — the stored state records what the director asked for, and the clock is
 * applied where the reading happens, so no scheduled job has to flip a flag at midnight.
 *
 * ## Why this returns an INSTANT rather than exposing the embargo
 *
 * The obvious shape — give readers the embargo and let them write `embargo IS NULL OR embargo <= now()`
 * — is wrong, and wrong in the direction that hides real tournaments. A tournament with a PUBLISHED DRAW
 * and an embargoed information page is public *because of the draw*; that predicate excludes it. From
 * the publish flag and the embargo alone a reader cannot tell whether information was the ONLY reason
 * the tournament was public, and the reader is the wrong place to re-derive the roll-up anyway — that is
 * how three different definitions of "published" came to exist (P23).
 *
 * So the question is answered once, here, and the answer is a single nullable instant:
 *
 * | record state | `visibleFrom` |
 * |---|---|
 * | not published at all | `null` — nothing to embargo; `published` already says no |
 * | a draw, the order of play, or the participant list is published | `null` — already announced |
 * | information published with no embargo | `null` — visible now |
 * | information published, embargo in the future, and information is the ONLY reason | the embargo |
 *
 * A reader then needs one clause: `published AND (visibleFrom IS NULL OR visibleFrom <= now)`.
 *
 * ## Why an embargo does NOT suppress the other components
 *
 * Draw, order-of-play and stage embargoes are recorded in `publishState.embargoes` and are intent-only
 * at the tournament level: a tournament whose order of play is published-but-embargoed still lists. That
 * predates this file and is unchanged. Information is the exception because a listing BEFORE the embargo
 * lifts *is* the announcement the embargo was meant to withhold.
 */

interface VisibilityArgs {
  tournamentRecord: any;
  /** The instant to judge against. Defaults to now; pass it to make a test independent of the clock. */
  asOf?: Date | string;
}

function asTime(asOf?: Date | string): number {
  if (asOf instanceof Date) return asOf.getTime();
  if (typeof asOf === 'string' && isISODateString(asOf)) return new Date(asOf).getTime();
  return Date.now();
}

/** A future, well-formed ISO embargo instant; anything else is no embargo at all. */
function futureEmbargo(embargo: any, at: number): string | undefined {
  if (typeof embargo !== 'string' || !isISODateString(embargo)) return undefined;
  return new Date(embargo).getTime() > at ? embargo : undefined;
}

/**
 * Is the tournament published for a reason OTHER than its information page?
 *
 * Derived by asking the roll-up what it says with `info` removed, rather than by restating the roll-up's
 * conditions — restating it is the mistake P23 documents.
 */
function publishedWithoutInfo(tournamentRecord: any): boolean {
  const status: any = getTournamentPublishStatus({ tournamentRecord });
  if (!status?.info?.published) return isTournamentPublished(tournamentRecord);

  // A shallow copy with `info` dropped: enough for the roll-up, and it never touches the caller's record.
  const withoutInfo = {
    ...tournamentRecord,
    timeItems: (tournamentRecord?.timeItems ?? []).map((timeItem: any) => {
      const itemValue = timeItem?.itemValue;
      if (!itemValue || typeof itemValue !== 'object') return timeItem;
      const stripped: any = {};
      for (const [statusKey, statusValue] of Object.entries(itemValue)) {
        if (statusValue && typeof statusValue === 'object' && 'info' in (statusValue as any)) {
          const { info: _info, ...rest } = statusValue as any;
          stripped[statusKey] = rest;
        } else {
          stripped[statusKey] = statusValue;
        }
      }
      return { ...timeItem, itemValue: stripped };
    }),
  };
  return isTournamentPublished(withoutInfo);
}

/**
 * The instant from which a published tournament may be listed, or `null` when that is "now".
 *
 * `null` for an unpublished tournament too: `published` already withholds it, and returning an instant
 * there would invite a reader to treat "not published" as "published later".
 */
export function getTournamentVisibleFrom({ tournamentRecord, asOf }: VisibilityArgs): string | null {
  if (!tournamentRecord || !isTournamentPublished(tournamentRecord)) return null;

  const status: any = getTournamentPublishStatus({ tournamentRecord });
  const embargo = futureEmbargo(status?.info?.embargo, asTime(asOf));
  if (!embargo) return null;

  // Information is embargoed — but only its own visibility is at stake if something else is published.
  return publishedWithoutInfo(tournamentRecord) ? null : embargo;
}

/** May a public listing show this tournament at `asOf`? Intent AND the clock. */
export function isTournamentVisible({ tournamentRecord, asOf }: VisibilityArgs): boolean {
  if (!isTournamentPublished(tournamentRecord)) return false;
  const visibleFrom = getTournamentVisibleFrom({ tournamentRecord, asOf });
  if (!visibleFrom) return true;
  return new Date(visibleFrom).getTime() <= asTime(asOf);
}
