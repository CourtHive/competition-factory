import { getMatchUpFormatTiming } from '@Query/extensions/matchUpFormatTiming/getMatchUpFormatTiming';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { extractDate, extractTime, timeStringMinutes } from '@Tools/dateTime';
import { getDailyLimit } from '@Query/extensions/getMatchUpDailyLimits';

// constants
import { BYE, DOUBLE_DEFAULT, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';

/**
 * Golden corpus § 5 (`Mentat/planning/SCHEDULING_PIPELINE_VNEXT.md`): what a scheduling STEP must never do, checked
 * against the record before and after it.
 *
 * These are relational properties, not single-state invariants, and deliberately so. A stored record may legitimately
 * hold a timed BYE (`byeSchedulingPreservation` keeps an operator's placement when a seat becomes a BYE) or two
 * matchUps an operator placed inside one participant's recovery. Neither is the scheduler's doing, and a single-state
 * check would fail every scenario that starts from such a record. What a scheduler must not do is CREATE either: so
 * every rule below is asked of the matchUps the step PLACED (a date and time it set or moved), read against the whole
 * record after the step.
 *
 * Clean room: the rules are stated here from the plan, not by calling the scheduler's own checks
 * (`checkRecoveryTime`, `checkDailyLimits`, `checkDependendantTiming`, `getMatchUpDependencies`). A detector that runs
 * the subject's logic agrees with it by construction. Two INPUTS are read through the engine's published queries,
 * because they are rules of their own the spec states separately: a matchUp's minutes (`getMatchUpFormatTiming`) and
 * the daily limits in force (`getDailyLimit`). The dependency graph comes from hydrated `winnerMatchUpId` /
 * `loserMatchUpId`, which the hydration writes and the scheduler's dependency query does not read.
 *
 * Participants are CERTAIN only (in the matchUp's sides). Potential participants are a scheduling heuristic the spec
 * pins with authored scenarios; an invariant over them would encode one reading of a rule still being settled.
 */

export const SCHEDULE_NO_BYE_PLACED = 'SCHEDULE_NO_BYE_PLACED';
export const SCHEDULE_SOURCES_FIRST = 'SCHEDULE_SOURCES_FIRST';
export const SCHEDULE_RECOVERY_RESPECTED = 'SCHEDULE_RECOVERY_RESPECTED';
export const SCHEDULE_DAILY_LIMITS_RESPECTED = 'SCHEDULE_DAILY_LIMITS_RESPECTED';

export const SCHEDULING_STEP_PROPERTIES = [
  SCHEDULE_NO_BYE_PLACED,
  SCHEDULE_SOURCES_FIRST,
  SCHEDULE_RECOVERY_RESPECTED,
  SCHEDULE_DAILY_LIMITS_RESPECTED,
] as const;

export type SchedulingViolation = {
  property: (typeof SCHEDULING_STEP_PROPERTIES)[number];
  matchUpId: string;
  detail: string;
};

type Timed = {
  matchUpId: string;
  drawId: string;
  matchUpType?: string;
  matchUpStatus?: string;
  date: string;
  start: number; // minutes from midnight
  averageMinutes: number;
  recoveryMinutes: number;
  typeChangeRecoveryMinutes: number;
  individualIds: string[];
};

const NOT_PLAYED = new Set([BYE, DOUBLE_WALKOVER, DOUBLE_DEFAULT]);

/** every matchUp of a record, hydrated, keyed by id */
function hydrated(tournamentRecord: any): Map<string, any> {
  const matchUps = allTournamentMatchUps({ tournamentRecord, inContext: true }).matchUps ?? [];
  return new Map(matchUps.map((matchUp: any) => [matchUp.matchUpId, matchUp]));
}

/** a matchUp's day when it is placed on it: timed, or on the day's court grid (a court order, no time) */
const placedDate = (matchUp: any) => {
  const { scheduledDate, scheduledTime, courtOrder } = matchUp?.schedule ?? {};
  const date = extractDate(scheduledDate) || extractDate(scheduledTime);
  return date && (scheduledTime || courtOrder !== undefined) ? date : undefined;
};
const placementKey = (matchUp: any) =>
  placedDate(matchUp) && [placedDate(matchUp), matchUp.schedule?.scheduledTime, matchUp.schedule?.courtOrder].join('|');

/** the day bookings of a record's placed matchUps, timed or not: what a daily limit counts */
function datedMatchUps(
  matchUps: Map<string, any>,
): Map<string, Pick<Timed, 'date' | 'individualIds' | 'matchUpType' | 'matchUpStatus' | 'matchUpId'>> {
  const dated = new Map();
  for (const matchUp of matchUps.values()) {
    const date = placedDate(matchUp);
    if (!date) continue;
    dated.set(matchUp.matchUpId, {
      individualIds: individualIds(matchUp),
      matchUpStatus: matchUp.matchUpStatus,
      matchUpType: matchUp.matchUpType,
      matchUpId: matchUp.matchUpId,
      date,
    });
  }
  return dated;
}

const slot = (matchUp: any) => {
  const { scheduledDate, scheduledTime } = matchUp?.schedule ?? {};
  const date = extractDate(scheduledDate) || extractDate(scheduledTime);
  const time = scheduledTime ? extractTime(scheduledTime) : undefined;
  return date && time ? `${date} ${time}` : undefined;
};

function individualIds(matchUp: any): string[] {
  const ids: string[] = [];
  for (const side of matchUp.sides ?? []) {
    const participant = side?.participant;
    if (!side?.participantId || side.bye) continue;
    if (participant?.individualParticipantIds?.length) ids.push(...participant.individualParticipantIds);
    else ids.push(side.participantId);
  }
  return ids;
}

/**
 * Minutes a call states for itself. `scheduleMatchUps` takes `averageMatchUpMinutes` (default 90) and `recoveryMinutes`
 * (default 0, or per matchUp from `recoveryMinutesMap`) and does not read the tournament's timing at all, so its
 * placements are judged by the minutes it was given. Whether an unstated recovery should be 0 or the tournament's is a
 * question for the spec, not for this check.
 */
export type CallTiming = {
  recoveryMinutesMap?: Record<string, number>;
  averageMatchUpMinutes?: number;
  recoveryMinutes?: number;
};

/** the timed matchUps of a record, with their minutes */
function timedMatchUps(tournamentRecord: any, matchUps: Map<string, any>, timing?: CallTiming): Map<string, Timed> {
  const events = new Map((tournamentRecord.events ?? []).map((event: any) => [event.eventId, event]));
  const timed = new Map<string, Timed>();
  for (const matchUp of matchUps.values()) {
    const at = slot(matchUp);
    if (!at) continue;
    const [date, time] = at.split(' ');
    const minutes: any = timing
      ? {
          recoveryMinutes: timing.recoveryMinutesMap?.[matchUp.matchUpId] || timing.recoveryMinutes || 0,
          averageMinutes: timing.averageMatchUpMinutes ?? 90,
        }
      : getMatchUpFormatTiming({
          matchUpFormat: matchUp.matchUpFormat,
          event: events.get(matchUp.eventId) as any,
          eventType: matchUp.matchUpType,
          tournamentRecord,
        });
    const recoveryMinutes = minutes.recoveryMinutes ?? 0;
    timed.set(matchUp.matchUpId, {
      typeChangeRecoveryMinutes: minutes.typeChangeRecoveryMinutes ?? recoveryMinutes,
      averageMinutes: minutes.averageMinutes ?? 0,
      individualIds: individualIds(matchUp),
      matchUpStatus: matchUp.matchUpStatus,
      matchUpType: matchUp.matchUpType,
      start: timeStringMinutes(time),
      matchUpId: matchUp.matchUpId,
      drawId: matchUp.drawId,
      recoveryMinutes,
      date,
    });
  }
  return timed;
}

/** the minute a matchUp's participants are free again, for a following matchUp of `nextType` */
const freeAt = (booking: Timed, nextType?: string) =>
  booking.start +
  booking.averageMinutes +
  (nextType && booking.matchUpType && nextType !== booking.matchUpType
    ? booking.typeChangeRecoveryMinutes
    : booking.recoveryMinutes);

/** every matchUp upstream of `matchUpId`, through any number of rounds and links */
function upstream(matchUpId: string, matchUps: Map<string, any>, sourcesOf: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const queue = [...(sourcesOf.get(matchUpId) ?? [])];
  while (queue.length) {
    const id = queue.shift() as string;
    if (seen.has(id) || !matchUps.has(id)) continue;
    seen.add(id);
    queue.push(...(sourcesOf.get(id) ?? []));
  }
  return seen;
}

function sourcesMap(matchUps: Map<string, any>) {
  const sourcesOf = new Map<string, string[]>();
  for (const matchUp of matchUps.values())
    for (const targetId of [matchUp.winnerMatchUpId, matchUp.loserMatchUpId].filter(Boolean)) {
      if (!sourcesOf.has(targetId)) sourcesOf.set(targetId, []);
      sourcesOf.get(targetId)?.push(matchUp.matchUpId);
    }
  return sourcesOf;
}

type Counts = { [SINGLES]: number; [DOUBLES]: number; total: number };
type DayBooking = Pick<Timed, 'date' | 'individualIds' | 'matchUpType' | 'matchUpStatus'>;

function dayCounts(timed: Map<string, DayBooking>, participantId: string, date: string): Counts {
  const counts: Counts = { [SINGLES]: 0, [DOUBLES]: 0, total: 0 };
  for (const booking of timed.values()) {
    if (booking.date !== date || NOT_PLAYED.has(booking.matchUpStatus as string)) continue;
    if (!booking.individualIds.includes(participantId)) continue;
    if (booking.matchUpType === SINGLES || booking.matchUpType === DOUBLES) counts[booking.matchUpType] += 1;
    counts.total += 1;
  }
  return counts;
}

function overLimit(counts: Counts, limits: any): string | undefined {
  for (const key of [SINGLES, DOUBLES, 'total'] as const) {
    // a limit of 0 is no limit, as the scheduler reads it
    const limit = limits?.[key];
    if (typeof limit === 'number' && limit > 0 && counts[key] > limit) return `${key} ${counts[key]} > ${limit}`;
  }
  return undefined;
}

/**
 * The matchUps a step placed: timed after it, and not at the same date and time before it. A matchUp the step only
 * cleared is not a placement; nothing below is asked of it.
 */
export function placedMatchUpIds(before: any, after: any): string[] {
  const prior = hydrated(before);
  return [...hydrated(after).values()]
    .filter((matchUp) => slot(matchUp) && slot(matchUp) !== slot(prior.get(matchUp.matchUpId)))
    .map((matchUp) => matchUp.matchUpId);
}

type StepContext = {
  datedBefore: Map<string, DayBooking>;
  dated: Map<string, DayBooking>;
  timedBefore: Map<string, Timed>;
  sourcesOf: Map<string, string[]>;
  timed: Map<string, Timed>;
  matchUps: Map<string, any>;
  limitsFor: (participantId: string) => any;
  placed: Set<string>;
};

/**
 * a matchUp starts no earlier than every scheduled matchUp upstream of it is over, recovery included; a later date is
 * always after. Asked both ways: a placed source before an already-timed dependent is the same fault.
 */
function sourcesFirst(booking: Timed, { timed, matchUps, sourcesOf, placed }: StepContext): SchedulingViolation[] {
  const { matchUpId } = booking;
  const violations: SchedulingViolation[] = [];
  for (const sourceId of upstream(matchUpId, matchUps, sourcesOf)) {
    const source = timed.get(sourceId);
    if (!source) continue;
    const early = source.date > booking.date || (source.date === booking.date && booking.start < freeAt(source));
    if (early)
      violations.push({
        property: SCHEDULE_SOURCES_FIRST,
        matchUpId,
        detail: `starts ${booking.date} ${booking.start}m before source ${sourceId} (${source.date}) is free at ${freeAt(source)}m`,
      });
  }
  for (const [dependentId, dependent] of timed) {
    if (placed.has(dependentId) || !upstream(dependentId, matchUps, sourcesOf).has(matchUpId)) continue;
    const early =
      booking.date > dependent.date || (booking.date === dependent.date && dependent.start < freeAt(booking));
    if (early)
      violations.push({
        property: SCHEDULE_SOURCES_FIRST,
        matchUpId,
        detail: `placed after its already-timed dependent ${dependentId} (${dependent.date} ${dependent.start}m)`,
      });
  }
  return violations;
}

/**
 * on one date, the later of two matchUps a participant is certain to play starts once the earlier one's minutes and
 * recovery are over (the type-change recovery when the matchUpTypes differ); each pair is reported once
 */
function recoveryRespected(
  booking: Timed,
  participantId: string,
  timed: Map<string, Timed>,
  reportedPairs: Set<string>,
): SchedulingViolation[] {
  const violations: SchedulingViolation[] = [];
  for (const other of timed.values()) {
    if (other.matchUpId === booking.matchUpId || other.date !== booking.date) continue;
    if (NOT_PLAYED.has(other.matchUpStatus as string) || !other.individualIds.includes(participantId)) continue;
    const pair = [booking.matchUpId, other.matchUpId].sort((a, b) => a.localeCompare(b)).join('|') + participantId;
    const [first, second] = other.start <= booking.start ? [other, booking] : [booking, other];
    if (reportedPairs.has(pair) || second.start >= freeAt(first, second.matchUpType)) continue;
    reportedPairs.add(pair);
    violations.push({
      property: SCHEDULE_RECOVERY_RESPECTED,
      matchUpId: booking.matchUpId,
      detail: `${participantId}: ${second.matchUpId} at ${second.start}m before ${first.matchUpId} frees at ${freeAt(first, second.matchUpType)}m`,
    });
  }
  return violations;
}

/**
 * a placement never takes a participant over a limit; one already over before the step (an operator's doing) is not
 * the step's fault unless the step added to it. A day's load counts every matchUp placed on it, timed or on its court
 * grid (CA 2026-10-23: the grid applies the limits the timed pipeline does)
 */
function dailyLimitsRespected(
  booking: { matchUpId: string; date: string },
  participantId: string,
  context: StepContext,
): SchedulingViolation[] {
  const limits = context.limitsFor(participantId);
  const exceeded = overLimit(dayCounts(context.dated, participantId, booking.date), limits);
  const wasExceeded = overLimit(dayCounts(context.datedBefore, participantId, booking.date), limits);
  if (!exceeded || exceeded === wasExceeded) return [];
  return [
    {
      property: SCHEDULE_DAILY_LIMITS_RESPECTED,
      matchUpId: booking.matchUpId,
      detail: `${participantId} on ${booking.date}: ${exceeded}`,
    },
  ];
}

/**
 * `dailyLimitsWaived`: the call opted out of daily limits (a grid call given `matchUpDailyLimits: {}`), so its
 * placements are not asked SCHEDULE_DAILY_LIMITS_RESPECTED
 */
export function checkSchedulingStep({
  dailyLimitsWaived,
  timing,
  before,
  after,
}: {
  dailyLimitsWaived?: boolean;
  timing?: CallTiming;
  before: any;
  after: any;
}): SchedulingViolation[] {
  const prior = hydrated(before);
  const matchUps = hydrated(after);
  // placed on a day by the step, timed or on the court grid
  const datedPlaced = [...matchUps.values()]
    .filter((matchUp) => placedDate(matchUp) && placementKey(matchUp) !== placementKey(prior.get(matchUp.matchUpId)))
    .map(({ matchUpId }) => matchUpId);
  const placed = placedMatchUpIds(before, after);
  if (!placed.length && !datedPlaced.length) return [];

  const { matchUpDailyLimits, participantDailyLimits } = getDailyLimit({ tournamentRecord: after });
  const context: StepContext = {
    datedBefore: datedMatchUps(prior),
    dated: datedMatchUps(matchUps),
    timedBefore: timedMatchUps(before, prior, timing),
    timed: timedMatchUps(after, matchUps, timing),
    sourcesOf: sourcesMap(matchUps),
    // the tournament's limits with the participant's own override on top, key by key
    limitsFor: (participantId) => ({ ...matchUpDailyLimits, ...participantDailyLimits?.[participantId] }),
    placed: new Set(placed),
    matchUps,
  };

  const violations: SchedulingViolation[] = [];
  const reportedPairs = new Set<string>();
  for (const matchUpId of placed) {
    const booking = context.timed.get(matchUpId) as Timed;
    if (booking.matchUpStatus === BYE)
      violations.push({ property: SCHEDULE_NO_BYE_PLACED, matchUpId, detail: `BYE placed at ${booking.date}` });
    violations.push(...sourcesFirst(booking, context));
    if (NOT_PLAYED.has(booking.matchUpStatus as string)) continue;
    for (const participantId of booking.individualIds)
      violations.push(...recoveryRespected(booking, participantId, context.timed, reportedPairs));
  }
  if (dailyLimitsWaived) return violations;
  for (const matchUpId of datedPlaced) {
    const booking = context.dated.get(matchUpId) as DayBooking & { matchUpId: string };
    if (NOT_PLAYED.has(booking.matchUpStatus as string)) continue;
    for (const participantId of booking.individualIds)
      violations.push(...dailyLimitsRespected(booking, participantId, context));
  }
  return violations;
}
