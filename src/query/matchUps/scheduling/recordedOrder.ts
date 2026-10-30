import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { scheduledMatchUpDate } from '@Query/matchUp/scheduledMatchUpDate';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { dateStringDaysChange, extractDate, extractTime } from '@Tools/dateTime';
import { validTimeString } from '@Validators/regex';

// constants and types
import { END_DATE, END_TIME, START_TIME } from '@Constants/timeItemConstants';
import { ANACHRONISM } from '@Constants/errorConditionConstants';
import { BYE } from '@Constants/matchUpStatusConstants';
import { DrawDefinition, MatchUp } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

/**
 * The recorded times of linked matchUps may not conflict (CA 2026-10-30). Where a matchUp depends on another (the same
 * links as the order rule: winner, loser, feed, qualifying to main, group to playoff), the source must have ENDED by
 * the time the dependent STARTED, and must have started first. An end that falls after the dependent's SCHEDULED time
 * is fine: only recorded start and end times are compared here, never a scheduled time.
 *
 * - A recorded time is read on the matchUp's scheduled date; an END_DATE (a match that ran past midnight) moves its end
 *   to that date. A matchUp with no scheduled date has no instants and proves nothing.
 * - A source may end the very minute its dependent starts.
 * - A BYE was never played and carries no recorded times.
 *
 * Asked of a START_TIME or END_TIME write, against the times the write would leave.
 */

type Recorded = {
  scheduledDate?: string;
  startTime?: string;
  endTime?: string;
  /** the calendar day of the end: the scheduled date, or the next for a match that ran past midnight */
  endDate?: string;
  start?: number;
  end?: number;
};
type RecordedOverride = { startTime?: string; endTime?: string; endDate?: string };

const lastValue = (matchUp: MatchUp, itemType: string): string | undefined =>
  matchUp.timeItems?.findLast((timeItem) => timeItem?.itemType === itemType)?.itemValue;

/** an `HH:MM` wall-clock value on a date, as an instant; a full date-time value carries its own date */
function instant(value: string | undefined, date: string): number | undefined {
  if (!value) return undefined;
  const time = validTimeString.test(value) ? value : extractTime(value);
  const ms = new Date(`${extractDate(value) || date}T${time}`).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

// as addMatchUpEndTime rolls an end that sorts before its start onto the next day, within this span
const MAX_CROSS_MIDNIGHT_SPAN_MS = 12 * 60 * 60 * 1000;

/** the day an end given without one falls on: the scheduled date, or the next when it ran past midnight */
function endDayOf({ endTime, start, scheduledDate }: { endTime: string; start?: number; scheduledDate: string }) {
  const sameDay = instant(endTime, scheduledDate);
  if (start === undefined || sameDay === undefined || sameDay > start) return scheduledDate;
  const nextDay = dateStringDaysChange(scheduledDate, 1);
  const rolled = nextDay ? instant(endTime, nextDay) : undefined;
  return rolled !== undefined && rolled > start && rolled - start <= MAX_CROSS_MIDNIGHT_SPAN_MS
    ? (nextDay ?? scheduledDate)
    : scheduledDate;
}

export function recordedTimes(matchUp: MatchUp, override: RecordedOverride = {}): Recorded {
  const scheduledDate = extractDate(scheduledMatchUpDate({ matchUp }).scheduledDate);
  if (!scheduledDate || matchUp.matchUpStatus === BYE) return {};
  const startTime = override.startTime ?? lastValue(matchUp, START_TIME);
  const endTime = override.endTime ?? lastValue(matchUp, END_TIME);
  const start = instant(startTime, scheduledDate);
  const statedEndDay = override.endTime ? override.endDate : lastValue(matchUp, END_DATE);
  const endDay =
    extractDate(statedEndDay) ||
    (override.endTime ? endDayOf({ endTime: override.endTime, start, scheduledDate }) : scheduledDate);
  return {
    end: instant(endTime, endDay),
    start,
    ...(endTime ? { endDate: endDay } : {}),
    scheduledDate,
    startTime,
    endTime,
  };
}

const before = (a?: number, b?: number) => a !== undefined && b !== undefined && a >= b;

/** the source's recorded times conflict with its dependent's */
export function recordedConflict(source: Recorded, dependent: Recorded): boolean {
  const endsAfterStart = source.end !== undefined && dependent.start !== undefined && source.end > dependent.start;
  return (
    endsAfterStart ||
    before(source.start, dependent.start) ||
    before(source.end, dependent.end) ||
    before(source.start, dependent.end)
  );
}

type RecordedOrderArgs = {
  drawDefinition: DrawDefinition;
  override: RecordedOverride;
  matchUpId: string;
};

export function recordedOrderRefusal({
  drawDefinition,
  matchUpId,
  override,
}: RecordedOrderArgs): ResultType | undefined {
  const matchUps: MatchUp[] = allDrawMatchUps({ drawDefinition, inContext: false }).matchUps ?? [];
  const byId = new Map(matchUps.map((matchUp) => [matchUp.matchUpId, matchUp]));
  const target = byId.get(matchUpId);
  if (!target) return undefined;

  // writing back what is stored is never refused, though an older engine may have stored a conflict
  const unchangedStart = override.startTime === undefined || override.startTime === lastValue(target, START_TIME);
  const unchangedEnd =
    override.endTime === undefined ||
    (override.endTime === lastValue(target, END_TIME) && override.endDate === lastValue(target, END_DATE));
  if (unchangedStart && unchangedEnd) return undefined;

  const targetTimes = recordedTimes(target, override);
  if (targetTimes.start === undefined && targetTimes.end === undefined) return undefined;

  const neighbours = (relation: 'source' | 'dependent', ids: string[] = []) =>
    ids.flatMap((id) => {
      const matchUp = byId.get(id);
      const times = matchUp && recordedTimes(matchUp);
      if (!times || (times.start === undefined && times.end === undefined)) return [];
      const conflict =
        relation === 'source' ? recordedConflict(times, targetTimes) : recordedConflict(targetTimes, times);
      if (!conflict) return [];
      const { startTime, endTime, scheduledDate } = times;
      return [{ matchUpId: id, relation, roundNumber: matchUp.roundNumber, scheduledDate, startTime, endTime }];
    });

  const { matchUpDependencies } = getMatchUpDependencies({ drawDefinition });
  const dependencies = matchUpDependencies?.[matchUpId] ?? {};
  const blockingMatchUps = [
    ...neighbours('source', dependencies.matchUpIds),
    ...neighbours('dependent', dependencies.dependentMatchUpIds),
  ];
  if (!blockingMatchUps.length) return undefined;

  return decorateResult({
    result: { error: ANACHRONISM },
    info: 'a recorded start or end time conflicts with a matchUp it depends on, or one that depends on it',
    stack: 'recordedOrderRefusal',
    context: { matchUpId, startTime: targetTimes.startTime, endTime: targetTimes.endTime, blockingMatchUps },
  });
}
