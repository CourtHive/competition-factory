import { canonicalDate } from '@Tools/canonicalClock';

// constants and types
import { MISSING_EVENT, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { Event, Tournament, WeekdayUnion } from '@Types/tournamentTypes';
import { ResultType, TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * Whether an event plays on a calendar day: the single answer every scheduling path asks.
 *
 * For a day `D` (YYYY-MM-DD) and an event `E` in tournament `T`, `D` is a playing day when
 *
 *  1. `D` lies in `T.startDate..T.endDate`                                          → `OUTSIDE_TOURNAMENT_DATES`
 *  2. `D` lies in `E.startDate..E.endDate`, a missing bound falling back to `T`'s   → `OUTSIDE_EVENT_DATES`
 *  3. `D` is in `T.activeDates` when that is non-empty                              → `TOURNAMENT_INACTIVE_DATE`
 *     otherwise `D`'s weekday is in `T.weekdays` when that is non-empty             → `TOURNAMENT_WEEKDAY`
 *  4. `D` is in `E.activeDates` when that is non-empty                              → `EVENT_INACTIVE_DATE`
 *     otherwise `D`'s weekday is in `E.weekdays` when that is non-empty             → `EVENT_WEEKDAY`
 *
 * so the playing days are tournament range ∩ event range ∩ (tournament activeDates, else tournament weekdays) ∩
 * (event activeDates, else event weekdays). The reason reported is the first rule that fails, in that order.
 *
 * - An empty array means UNSET, never "no days": clients clear by sending `[]`.
 * - `activeDates` win over `weekdays` at both levels when both are set.
 * - The weekday is that of the calendar day, read in UTC (`getUTCDay` of `new Date('YYYY-MM-DD')`), so no time zone
 *   moves it.
 * - An event range that does not intersect the tournament range (a stale range, left behind when the tournament
 *   moved) is IGNORED: rule 2 then falls back to the tournament range, and `getEventInconsistencies` reports the
 *   event. Treating it as "plays nowhere" would silently stop all scheduling for the event.
 * - A day that is not a calendar day fails closed: `INVALID_DATE`.
 * - With no event, only the tournament rules apply.
 *
 * Pure: it reads only the records it is given.
 */

export type EventDateReason =
  | 'INVALID_DATE'
  | 'OUTSIDE_TOURNAMENT_DATES'
  | 'OUTSIDE_EVENT_DATES'
  | 'TOURNAMENT_INACTIVE_DATE'
  | 'TOURNAMENT_WEEKDAY'
  | 'EVENT_INACTIVE_DATE'
  | 'EVENT_WEEKDAY';

export type EventDateVerdict = { plays: true } | { plays: false; reason: EventDateReason };

const WEEKDAYS: WeekdayUnion[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const PLAYS: EventDateVerdict = { plays: true };
const DAY_MS = 24 * 60 * 60 * 1000;
// generateDateRange's cap: a tournament range longer than this is not enumerated past it
const MAX_DAYS = 300;

type DateRule = {
  tournamentStart?: string;
  tournamentEnd?: string;
  eventStart?: string;
  eventEnd?: string;
  tournamentActiveDates?: Set<string>;
  tournamentWeekdays?: Set<string>;
  eventActiveDates?: Set<string>;
  eventWeekdays?: Set<string>;
  // event-level constraints narrow the days (an event range inside the tournament's, event activeDates or weekdays)
  eventConstrained: boolean;
};

/** The weekday code of a canonical `YYYY-MM-DD` day, read in UTC. */
export function weekdayOf(date: string): WeekdayUnion {
  return WEEKDAYS[new Date(date).getUTCDay()];
}

function toDay(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10);
  return canonicalDate(value);
}

function dateSet(values: unknown): Set<string> | undefined {
  if (!Array.isArray(values)) return undefined;
  const days = values.map(toDay).filter((day): day is string => !!day);
  return days.length ? new Set(days) : undefined;
}

function weekdaySet(values: unknown): Set<string> | undefined {
  if (!Array.isArray(values)) return undefined;
  const codes = values.filter(
    (value): value is string => typeof value === 'string' && (WEEKDAYS as string[]).includes(value),
  );
  return codes.length ? new Set(codes) : undefined;
}

/**
 * Whether an event's own range is stale: it lies wholly outside the tournament's range, or its bounds are inverted.
 * Such a range is ignored by the predicate and reported as an inconsistency.
 */
export function eventRangeIsDisjoint({ tournamentRecord, event }: { tournamentRecord?: Tournament; event?: Event }) {
  const tournamentStart = toDay(tournamentRecord?.startDate);
  const tournamentEnd = toDay(tournamentRecord?.endDate);
  const eventStart = toDay(event?.startDate) ?? tournamentStart;
  const eventEnd = toDay(event?.endDate) ?? tournamentEnd;
  if (eventStart && eventEnd && eventStart > eventEnd) return true;
  if (tournamentEnd && eventStart && eventStart > tournamentEnd) return true;
  return !!(tournamentStart && eventEnd && eventEnd < tournamentStart);
}

function buildRule({ tournamentRecord, event }: { tournamentRecord?: Tournament; event?: Event }): DateRule {
  const tournamentStart = toDay(tournamentRecord?.startDate);
  const tournamentEnd = toDay(tournamentRecord?.endDate);
  const tournamentActiveDates = dateSet(tournamentRecord?.activeDates);
  const tournamentWeekdays = tournamentActiveDates ? undefined : weekdaySet(tournamentRecord?.weekdays);

  if (!event)
    return { tournamentStart, tournamentEnd, tournamentActiveDates, tournamentWeekdays, eventConstrained: false };

  const disjoint = eventRangeIsDisjoint({ tournamentRecord, event });
  const eventStart = disjoint ? tournamentStart : (toDay(event.startDate) ?? tournamentStart);
  const eventEnd = disjoint ? tournamentEnd : (toDay(event.endDate) ?? tournamentEnd);
  const eventActiveDates = dateSet(event.activeDates);
  const eventWeekdays = eventActiveDates ? undefined : weekdaySet(event.weekdays);

  const narrowsStart = !!eventStart && (!tournamentStart || eventStart > tournamentStart);
  const narrowsEnd = !!eventEnd && (!tournamentEnd || eventEnd < tournamentEnd);
  const eventConstrained = narrowsStart || narrowsEnd || !!eventActiveDates || !!eventWeekdays;

  return {
    tournamentActiveDates,
    tournamentWeekdays,
    eventConstrained,
    eventActiveDates,
    tournamentStart,
    eventWeekdays,
    tournamentEnd,
    eventStart,
    eventEnd,
  };
}

function judge(rule: DateRule, date: unknown): EventDateVerdict {
  const day = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? canonicalDate(date) : undefined;
  if (!day) return { plays: false, reason: 'INVALID_DATE' };

  if ((rule.tournamentStart && day < rule.tournamentStart) || (rule.tournamentEnd && day > rule.tournamentEnd))
    return { plays: false, reason: 'OUTSIDE_TOURNAMENT_DATES' };
  if ((rule.eventStart && day < rule.eventStart) || (rule.eventEnd && day > rule.eventEnd))
    return { plays: false, reason: 'OUTSIDE_EVENT_DATES' };

  if (rule.tournamentActiveDates && !rule.tournamentActiveDates.has(day))
    return { plays: false, reason: 'TOURNAMENT_INACTIVE_DATE' };
  if (rule.tournamentWeekdays && !rule.tournamentWeekdays.has(weekdayOf(day)))
    return { plays: false, reason: 'TOURNAMENT_WEEKDAY' };

  if (rule.eventActiveDates && !rule.eventActiveDates.has(day)) return { plays: false, reason: 'EVENT_INACTIVE_DATE' };
  if (rule.eventWeekdays && !rule.eventWeekdays.has(weekdayOf(day))) return { plays: false, reason: 'EVENT_WEEKDAY' };

  return PLAYS;
}

type EventPlaysOnDateArgs = {
  tournamentRecord: Tournament;
  event?: Event;
  date: string;
};

/** The single answer to "may this event play on this day". `date` must be a `YYYY-MM-DD` day. */
export function eventPlaysOnDate({ tournamentRecord, event, date }: EventPlaysOnDateArgs): EventDateVerdict {
  return judge(buildRule({ tournamentRecord, event }), date);
}

type ResolverArgs = { tournamentId: string; eventId?: string; date: string };

/**
 * A resolver for hot paths that ask per matchUp: the rule of each event is built once and reused. An unknown
 * tournamentId resolves with no tournament rules; an unknown eventId resolves with the tournament rules only.
 */
export function eventDateResolver(tournamentRecords: TournamentRecords): (params: ResolverArgs) => EventDateVerdict {
  const rules = new Map<string, DateRule>();
  return ({ tournamentId, eventId, date }: ResolverArgs) => {
    const key = `${tournamentId}|${eventId ?? ''}`;
    let rule = rules.get(key);
    if (!rule) {
      const tournamentRecord = tournamentRecords?.[tournamentId];
      const event = eventId ? tournamentRecord?.events?.find((candidate) => candidate.eventId === eventId) : undefined;
      rule = buildRule({ tournamentRecord, event });
      rules.set(key, rule);
    }
    return judge(rule, date);
  };
}

function enumerateDays(start: string, end: string): string[] {
  const days: string[] = [];
  let time = Date.parse(start);
  const last = Date.parse(end);
  while (time <= last && days.length < MAX_DAYS) {
    days.push(new Date(time).toISOString().slice(0, 10));
    time += DAY_MS;
  }
  return days;
}

/**
 * An event's playing days, enumerated over the tournament range (the event range when the tournament has no dates).
 * `constrained` is true when the event's own dates, active dates or weekdays narrow the days the tournament plays;
 * false when the event plays every day the tournament does.
 */
export function getEventPlayingDates(params: {
  tournamentRecord: Tournament;
  event: Event;
}): ResultType & { playingDates?: string[]; constrained?: boolean } {
  const { tournamentRecord, event } = params ?? {};
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!event) return { error: MISSING_EVENT };

  const rule = buildRule({ tournamentRecord, event });
  const start = rule.tournamentStart ?? rule.eventStart;
  const end = rule.tournamentEnd ?? rule.eventEnd;
  const days = start && end ? enumerateDays(start, end) : [];
  const playingDates = days.filter((day) => judge(rule, day).plays);

  return { ...SUCCESS, playingDates, constrained: rule.eventConstrained };
}
