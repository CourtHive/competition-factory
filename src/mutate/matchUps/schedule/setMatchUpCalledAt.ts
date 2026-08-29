import { getTournamentTimeZone } from '@Query/tournaments/getTournamentTimeZone';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { decorateResult } from '@Functions/global/decorateResult';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { extractDate } from '@Tools/dateTime';
import { zonedParts } from '@Tools/zonedTime';

// constants and types
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  INVALID_DATE,
  INVALID_VALUES,
  MATCHUP_NOT_FOUND,
  MISSING_DRAW_DEFINITION,
  MISSING_MATCHUP_ID,
} from '@Constants/errorConditionConstants';

/** UTC+14 (Kiritimati) is the furthest-ahead zone in use — no local day can open earlier than this. */
const MAX_ZONE_OFFSET_AHEAD_MS = 14 * 60 * 60 * 1000;

type SetMatchUpCalledAtArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  disableNotice?: boolean;
  // ISO timestamp string when the matchUp is placed on the TMX active strip;
  // null or undefined clears the previous value (explicit removal).
  calledAt?: string | null;
  matchUpId: string;
  event?: Event;
};

/**
 * Whether a `calledAt` instant falls before the tournament's opening day.
 *
 * Calling a match to court is a physical act at the venue, so it cannot happen
 * before the venue opens. `addMatchUpScheduledDate` already refuses a
 * `scheduledDate` outside the tournament's range; a `calledAt` that predates the
 * start is the same class of impossibility and was previously accepted without
 * complaint.
 *
 * ── Why this needs a zone ──
 *
 * `startDate` is a bare venue-local calendar day; `calledAt` is a UTC instant.
 * Comparing them without a zone compares two different things. In Sydney
 * (UTC+10) a 09:00 call on opening day is 23:00 UTC on the PREVIOUS day, so a
 * naive UTC-day comparison would reject a perfectly legitimate call — the
 * failure mode is the exact opposite of the one being fixed, and worse, because
 * it blocks the running desk. So the venue's zone resolves the instant to its
 * real local day.
 *
 * ── When no zone can be resolved ──
 *
 * Many tournaments carry neither a `localTimeZone` nor a venue address, and
 * there is then no exact answer to "which local day was that?" — only a bound.
 * The furthest-ahead zone on earth is UTC+14, so local midnight opening the
 * tournament can be no earlier than `startDate 00:00 UTC − 14h`. An instant
 * before THAT is before the start in every zone that exists; an instant after it
 * is opening day somewhere, and refusing it would risk blocking a real running
 * desk — the worse of the two failures by far, since it stops play rather than
 * admitting a bad row.
 *
 * That bound is the most this can soundly say without a zone, and it is
 * deliberately weaker than the zoned check: an evening-before call in New York
 * is caught only when the tournament names its zone. Setting `localTimeZone` is
 * what upgrades this guard from "impossible anywhere" to "impossible here", and
 * it is the same setting the rest of the venue time frame already depends on.
 *
 * `endDate` is deliberately NOT guarded. A match called near midnight on the
 * final day legitimately runs past it, and the last day's play routinely spills
 * over; there is no equivalent impossibility on that side.
 */
function calledBeforeTournamentStart({
  tournamentRecord,
  calledAt,
}: {
  tournamentRecord?: Tournament;
  calledAt: string;
}): boolean {
  const startDate = extractDate(tournamentRecord?.startDate);
  if (!startDate) return false;

  const ms = Date.parse(calledAt);
  if (Number.isNaN(ms)) return false; // rejected separately; never silently skipped

  const { timeZone } = getTournamentTimeZone({ tournamentRecord });
  if (timeZone) return zonedParts({ ms, timeZone }).date < startDate;

  return ms < Date.parse(`${startDate}T00:00:00.000Z`) - MAX_ZONE_OFFSET_AHEAD_MS;
}

/**
 * Set or clear `matchUp.schedule.calledAt` — the ISO-string timestamp captured
 * at the moment a tournament director deliberately drag-drops a matchUp onto
 * the TMX "active strip" / NOW row, signalling that the matchUp is imminent
 * ("calling the match to court").
 *
 * Semantics:
 *  - Pass an ISO string to set the timestamp.
 *  - Pass `null` or `undefined` to clear (explicit removal).
 *  - Subsequent set calls overwrite the prior value.
 *  - Persists past START_TIME as a historical record — NOT auto-cleared on
 *    lifecycle transition. Clear only via explicit removal.
 *  - Distinct from `scheduledTime` (plan), `courtId` (place), and the
 *    `START_TIME` timeItem (actually started). May coexist with all of them.
 *  - This is a CODES 5.0.0 NEW first-class attribute — no legacy timeItem
 *    mirror, no LEGACY/DUAL/NATIVE branching. The attribute is always
 *    written to `matchUp.schedule.calledAt`.
 *  - A call to court cannot predate the tournament's first day. See
 *    `calledBeforeTournamentStart`.
 */
export function setMatchUpCalledAt(params: SetMatchUpCalledAtArgs) {
  const stack = 'setMatchUpCalledAt';
  const { tournamentRecord, drawDefinition, disableNotice, calledAt, matchUpId, event } = params;

  if (!drawDefinition) return decorateResult({ result: { error: MISSING_DRAW_DEFINITION }, stack });
  if (!matchUpId) return decorateResult({ result: { error: MISSING_MATCHUP_ID }, stack });
  if (calledAt !== undefined && calledAt !== null && typeof calledAt !== 'string') {
    return decorateResult({ result: { error: INVALID_VALUES }, stack, info: 'calledAt must be an ISO string' });
  }

  if (typeof calledAt === 'string') {
    // An unparseable stamp is rejected rather than stored: it cannot be checked
    // against the tournament's start, so accepting one would leave a hole in the
    // guard below that any bad caller could walk through.
    if (Number.isNaN(Date.parse(calledAt))) {
      return decorateResult({
        result: { error: INVALID_DATE },
        stack,
        info: 'calledAt must be a parseable ISO string',
      });
    }
    if (calledBeforeTournamentStart({ tournamentRecord, calledAt })) {
      return decorateResult({
        result: { error: INVALID_DATE },
        info: 'calledAt cannot precede tournament startDate',
        context: { calledAt, startDate: tournamentRecord?.startDate },
        stack,
      });
    }
  }

  const { matchUp } = findDrawMatchUp({ drawDefinition, event, matchUpId });
  if (!matchUp) return decorateResult({ result: { error: MATCHUP_NOT_FOUND }, stack });

  if (calledAt === undefined || calledAt === null) {
    if (matchUp.schedule) delete matchUp.schedule.calledAt;
  } else {
    if (!matchUp.schedule) matchUp.schedule = {};
    matchUp.schedule.calledAt = calledAt;
  }

  if (!disableNotice) {
    modifyMatchUpNotice({
      drawDefinition,
      tournamentId: tournamentRecord?.tournamentId,
      context: stack,
      matchUp,
      event,
    });
  }

  return { ...SUCCESS };
}
