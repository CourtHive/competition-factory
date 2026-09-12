/**
 * Per-matchUp scheduling timing, resolved once and reused across a whole
 * readiness or rest analysis.
 *
 * `getMatchUpFormatTiming` is what the auto-scheduler itself resolves against,
 * including its scheduling-policy fallback, so an unpoliced tournament still
 * gets per-format averages rather than a flat 90/0. Reaching it directly — once
 * per distinct format rather than once per matchUp — is the whole reason this
 * module exists: a tournament has a handful of distinct
 * `matchUpFormat|matchUpType|eventId` combinations and hundreds of matchUps.
 *
 * ── Why the category is passed explicitly, alongside the event ──
 *
 * Recovery is category-dependent: `POLICY_SCHEDULING_DEFAULT` gives ADULT and
 * WHEELCHAIR doubles 30 minutes but JUNIOR doubles 60. Passing only
 * `{ matchUpFormat, eventType }` silently resolves junior doubles to the adult
 * figure.
 *
 * Passing the `event` alone does not fix it either. `getScheduleTiming`
 * resolves `categoryType` off `event.category` correctly, and
 * `getMatchUpFormatTiming` then rebuilds its `timingDetails` as
 * `{ ...scheduleTiming, …, categoryType, … }` where `categoryType` is the
 * *parameter* — `undefined` when the caller supplied only an event. The
 * explicit key clobbers the resolved one, so the event's category is discarded.
 *
 * So the category is resolved here and passed explicitly. The event goes too,
 * because it is the only route to event-level scheduling policies and the
 * event's `SCHEDULE_TIMING` extension — and so this call site keeps working
 * unchanged if that clobber is ever repaired.
 *
 * This module was ported from TMX (`scheduleTimingResolver.ts`) along with the
 * two analyses it serves; the measurement above was taken there against a
 * JUNIOR DOUBLES `SET3-S:6/TB7` event: `{ event }` → 30, `{ categoryType }` →
 * 60, bare → 30.
 */
import { getMatchUpFormatTiming } from '@Query/extensions/matchUpFormatTiming/getMatchUpFormatTiming';

// constants and types
import { HydratedMatchUp } from '@Types/hydrated';
import { Tournament } from '@Types/tournamentTypes';
import { Event } from '@Types/tournamentTypes';

export type SchedulingTiming = {
  averageMinutes: number;
  recoveryMinutes: number;
  /** Recovery owed when a participant changes matchUpType (singles ↔ doubles). */
  typeChangeRecoveryMinutes: number;
};

/**
 * Used when a matchUp carries no format at all. Keeps the arithmetic running
 * rather than dropping findings: a 90-minute average with no recovery reports
 * overlaps while declining to invent a recovery requirement nobody configured.
 */
export const FALLBACK_TIMING: SchedulingTiming = {
  averageMinutes: 90,
  recoveryMinutes: 0,
  typeChangeRecoveryMinutes: 0,
};

/** The category identifiers the scheduling policy matches on, read the way `getScheduleTiming` reads them. */
function categoryOf(event?: Event): { categoryName?: string; categoryType?: string } {
  const category: any = event?.category;
  return {
    categoryName: category?.categoryName ?? category?.ageCategoryCode,
    categoryType: category?.categoryType ?? category?.subType,
  };
}

/**
 * A timing lookup valid for one analysis pass.
 *
 * Memoised per `matchUpFormat|matchUpType|eventId`. The cache is per-call rather
 * than module-level on purpose: a scheduling policy can be attached or modified
 * between calls, and a stale average is a wrong answer that looks like a right
 * one.
 */
export function makeTimingResolver(tournamentRecord: Tournament): (matchUp: HydratedMatchUp) => SchedulingTiming {
  const cache = new Map<string, SchedulingTiming>();
  const events = new Map((tournamentRecord?.events ?? []).map((event) => [event.eventId, event]));

  return (matchUp: HydratedMatchUp) => {
    const matchUpFormat = matchUp.matchUpFormat ?? '';
    const eventId = matchUp.eventId ?? '';
    const key = `${matchUpFormat}|${matchUp.matchUpType ?? ''}|${eventId}`;
    const cached = cache.get(key);
    if (cached) return cached;

    let timing = FALLBACK_TIMING;
    if (matchUpFormat) {
      const event = events.get(eventId);
      const result: any = getMatchUpFormatTiming({
        eventType: matchUp.matchUpType as any,
        ...categoryOf(event),
        tournamentRecord,
        matchUpFormat,
        event,
      });
      if (!result?.error) {
        timing = {
          averageMinutes: result?.averageMinutes ?? FALLBACK_TIMING.averageMinutes,
          recoveryMinutes: result?.recoveryMinutes ?? FALLBACK_TIMING.recoveryMinutes,
          typeChangeRecoveryMinutes: result?.typeChangeRecoveryMinutes ?? 0,
        };
      }
    }
    cache.set(key, timing);
    return timing;
  };
}
