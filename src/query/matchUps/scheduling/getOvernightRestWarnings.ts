import { getIndividualParticipantIds } from '@Query/matchUp/getIndividualParticipantIds';
import { findMatchUpFormatTiming } from '@Acquire/findMatchUpFormatTiming';
import { getSchedulingMatchUps } from './getSchedulingMatchUps';
import { timingCategoryType } from '@Query/event/timingCategoryType';
import { extractDate, extractTime } from '@Tools/dateTime';
import { addDaysToDate } from '@Tools/civilDateTime';
import { findEvent } from '@Acquire/findEvent';

// types
import type { TournamentRecords } from '@Types/factoryTypes';
import type { HydratedMatchUp } from '@Types/hydrated';

/** a participant whose first matchUp of a date leaves less rest than the policy's overnight rule asks (§ 9.8) */
export type OvernightRestWarning = {
  /** absent when the player is not yet known: the one who advances from `previousMatchUpId`, still to be decided */
  participantId?: string;
  /** the participant's first matchUp of the date, and when it starts */
  matchUpId: string;
  scheduleTime: string;
  /** the participant's last matchUp of the day before, and when it ended: its recorded endTime, else its start plus
   * its average minutes */
  previousMatchUpId: string;
  previousEndTime: string;
  restMinutes: number;
  requiredMinutes: number;
};

type Schedule = { scheduledDate?: string; scheduledTime?: string };

type GetOvernightRestWarningsArgs = {
  tournamentRecords: TournamentRecords;
  scheduleDates: string[];
  /** schedules not yet written (a dry run's placements), read over the records' own */
  scheduleOverrides?: { [matchUpId: string]: Schedule };
};

/**
 * Overnight rest is WARNED, not held (CA 2026-10-25): a guideline a player may waive (USTA Friend at Court: juniors
 * "should" have 12 hours from the completion of their last match to their first of the next day). For each date, each
 * participant placed in a matchUp of the date whose last matchUp of the day before ended less than its overnight minutes
 * earlier is reported. A matchUp of the day before that is not yet decided warns for the matchUp its winner (or loser)
 * goes to, if that is on the date: whoever advances. The overnight minutes are those of the earlier matchUp's category
 * (`timingCategoryType`: a stated type, else JUNIOR detected from an under-age code); none, no warning. Every scheduler
 * returns these.
 */
export function getOvernightRestWarnings({
  tournamentRecords,
  scheduleDates,
  scheduleOverrides = {},
}: GetOvernightRestWarningsArgs): { [scheduleDate: string]: OvernightRestWarning[] } {
  const matchUps = getSchedulingMatchUps({ tournamentRecords, nextMatchUps: false });
  const scheduleOf = (matchUp: HydratedMatchUp): Schedule => ({
    ...matchUp.schedule,
    ...scheduleOverrides[matchUp.matchUpId],
  });
  const timing = timingOf(tournamentRecords);

  const warnings: { [scheduleDate: string]: OvernightRestWarning[] } = {};
  for (const scheduleDate of scheduleDates) {
    const day = extractDate(scheduleDate);
    const dayBefore = day && addDaysToDate(day, -1);
    if (!day || !dayBefore) continue;

    const { lastEnds, undecided, firstStarts, starts } = restOfTheNight({
      matchUps,
      scheduleOf,
      timing,
      day,
      dayBefore,
    });
    const warn = (last: LastEnd, first: FirstStart, participantId?: string) => {
      const restMinutes = first.start - last.end;
      if (restMinutes >= last.required) return;
      warnings[day] ??= [];
      warnings[day].push({
        previousEndTime: clock(last.end),
        previousMatchUpId: last.matchUp.matchUpId,
        requiredMinutes: last.required,
        matchUpId: first.matchUp.matchUpId,
        scheduleTime: first.time,
        participantId,
        restMinutes,
      });
    };
    for (const [participantId, first] of Object.entries(firstStarts)) {
      const last = lastEnds[participantId];
      if (last) warn(last, first, participantId);
    }
    for (const last of undecided) {
      for (const nextMatchUpId of [last.matchUp.winnerMatchUpId, last.matchUp.loserMatchUpId]) {
        const next = nextMatchUpId ? starts[nextMatchUpId] : undefined;
        if (next) warn(last, next);
      }
    }
  }
  return warnings;
}

type LastEnd = { matchUp: HydratedMatchUp; end: number; required: number };
type FirstStart = { matchUp: HydratedMatchUp; start: number; time: string };

/** each participant's last matchUp of the day before (its end) and first of the date (its start); the undecided matchUps
 * of the day before; and every matchUp of the date by its id */
type RestOfTheNightArgs = {
  timing: (matchUp: HydratedMatchUp) => { averageMinutes?: number; overnightMinutes?: number };
  scheduleOf: (matchUp: HydratedMatchUp) => Schedule;
  matchUps: HydratedMatchUp[];
  dayBefore: string;
  day: string;
};
function restOfTheNight({ matchUps, scheduleOf, timing, day, dayBefore }: RestOfTheNightArgs) {
  const lastEnds: { [participantId: string]: LastEnd } = {};
  const firstStarts: { [participantId: string]: FirstStart } = {};
  const starts: { [matchUpId: string]: FirstStart } = {};
  const undecided: LastEnd[] = [];
  for (const matchUp of matchUps) {
    const { scheduledDate, scheduledTime } = scheduleOf(matchUp);
    const time = extractTime(scheduledTime);
    const date = extractDate(scheduledDate ?? scheduledTime);
    if (!time || (date !== day && date !== dayBefore)) continue;
    const { individualParticipantIds = [] } = getIndividualParticipantIds(matchUp);
    if (date === dayBefore) {
      const { averageMinutes = 0, overnightMinutes = 0 } = timing(matchUp);
      if (!overnightMinutes) continue;
      const last = { matchUp, end: endMinutes(matchUp, time, averageMinutes), required: overnightMinutes };
      if (!matchUp.winningSide) undecided.push(last);
      for (const participantId of individualParticipantIds) {
        if (!lastEnds[participantId] || last.end > lastEnds[participantId].end) lastEnds[participantId] = last;
      }
    } else {
      const first = { matchUp, start: toMinutes(time) + 1440, time };
      starts[matchUp.matchUpId] = first;
      for (const participantId of individualParticipantIds) {
        if (!firstStarts[participantId] || first.start < firstStarts[participantId].start)
          firstStarts[participantId] = first;
      }
    }
  }
  return { lastEnds, undecided, firstStarts, starts };
}

/** the warnings a scheduler reports for the dates it placed: each date, and the date after it (§ 9.8) */
export function overnightRestWarningsFor({ scheduleDates, ...args }: GetOvernightRestWarningsArgs): {
  [scheduleDate: string]: OvernightRestWarning[];
} {
  const dates = scheduleDates.flatMap((date) => [extractDate(date), addDaysToDate(extractDate(date), 1)]);
  return getOvernightRestWarnings({ ...args, scheduleDates: [...new Set(dates.filter(Boolean) as string[])] });
}

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const clock = (minutes: number) => {
  const withinDay = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(withinDay / 60)).padStart(2, '0')}:${String(withinDay % 60).padStart(2, '0')}`;
};

/** when a matchUp of the day before ended, in minutes from that day's midnight: its recorded endTime (actual
 * completion; an endTime before its start finished after midnight), else its start plus its average minutes */
function endMinutes(matchUp: HydratedMatchUp, time: string, averageMinutes: number): number {
  const start = toMinutes(time);
  const recorded = extractTime(matchUp.schedule?.endTime);
  if (!recorded) return start + averageMinutes;
  const end = toMinutes(recorded);
  return end < start ? end + 1440 : end;
}

/** a matchUp's average and overnight minutes from its format and its event's category, memoised per event and format */
function timingOf(tournamentRecords: TournamentRecords) {
  const memo = new Map<string, { averageMinutes?: number; overnightMinutes?: number }>();
  return (matchUp: HydratedMatchUp) => {
    const { tournamentId, eventId, matchUpFormat } = matchUp;
    const key = `${tournamentId}|${eventId}|${matchUpFormat}`;
    if (memo.has(key)) return memo.get(key) ?? {};
    let result: { averageMinutes?: number; overnightMinutes?: number } = {};
    const tournamentRecord = tournamentId ? tournamentRecords[tournamentId] : undefined;
    if (tournamentRecord && matchUpFormat) {
      const { event } = findEvent({ tournamentRecord, eventId });
      const category = event?.category;
      const timing = findMatchUpFormatTiming({
        categoryName: category?.categoryName ?? category?.ageCategoryCode,
        categoryType: timingCategoryType(category),
        eventType: event?.eventType,
        tournamentRecords,
        matchUpFormat,
        tournamentId,
        eventId,
      });
      if (!('error' in timing))
        result = { averageMinutes: timing.averageMinutes, overnightMinutes: timing.overnightMinutes };
    }
    memo.set(key, result);
    return result;
  };
}
