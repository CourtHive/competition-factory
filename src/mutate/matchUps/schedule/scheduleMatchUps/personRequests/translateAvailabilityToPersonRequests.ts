import { IF_NEEDED, UNAVAILABLE } from '@Constants/availabilityConstants';
import { DO_NOT_SCHEDULE } from '@Constants/requestConstants';
import { AvailabilityPayload, AvailabilityTimeAway, DayState } from '@Types/declarationTypes';

// A whole-day DO_NOT_SCHEDULE spans the full clock. `checkRequestConflicts`
// treats a matchUp as conflicting when its scheduleTime is strictly between
// startTime and endTime, so this window blocks every realistic start time.
const FULL_DAY_START = '00:00';
const FULL_DAY_END = '23:59';

type PersonRequestEntry = {
  requestType: string;
  startTime: string;
  endTime: string;
  date: string;
};

type TranslateAvailabilityArgs = {
  availability: AvailabilityPayload;
  dates: string[]; // tournament scheduled dates ('YYYY-MM-DD') to window the translation to
};

type TranslateAvailabilityResult = {
  requests: PersonRequestEntry[]; // UNAVAILABLE days → whole-day DO_NOT_SCHEDULE personRequests
  ifNeededDates: string[]; // IF_NEEDED days → advisory only (no scheduler enforcement in v1)
};

function isWithinTimeAway(date: string, timeAway?: AvailabilityTimeAway[]): boolean {
  if (!timeAway?.length) return false;
  return timeAway.some(({ from, to }) => Boolean(from) && Boolean(to) && from <= date && date <= to);
}

// timeAway ranges are a hard override forcing UNAVAILABLE; otherwise the
// explicit per-day state applies (absent = NOT_SET → undefined).
function resolveDayState(date: string, availability: AvailabilityPayload): DayState | undefined {
  if (isWithinTimeAway(date, availability.timeAway)) return UNAVAILABLE;
  return availability.days?.[date];
}

/**
 * Pure translation of a person's declared availability into the scheduler's
 * negative vocabulary, windowed to a tournament's scheduled `dates`.
 *
 * - UNAVAILABLE (or any day inside a `timeAway` range) → whole-day
 *   DO_NOT_SCHEDULE personRequest for that date.
 * - IF_NEEDED → carried as advisory metadata only (`ifNeededDates`); no request.
 * - AVAILABLE / NOT_SET → no constraint.
 *
 * No engine, no persistence — the caller applies the requests via
 * `executionQueue([{ method: 'addPersonRequests', params: { personId, requests } }])`.
 */
export function translateAvailabilityToPersonRequests(params: TranslateAvailabilityArgs): TranslateAvailabilityResult {
  const { availability, dates } = params;
  const requests: PersonRequestEntry[] = [];
  const ifNeededDates: string[] = [];

  if (!availability || !Array.isArray(dates)) return { requests, ifNeededDates };

  const orderedDates = [...new Set(dates)].sort((a, b) => a.localeCompare(b, 'en'));

  for (const date of orderedDates) {
    const state = resolveDayState(date, availability);
    if (state === UNAVAILABLE) {
      requests.push({ date, startTime: FULL_DAY_START, endTime: FULL_DAY_END, requestType: DO_NOT_SCHEDULE });
    } else if (state === IF_NEEDED) {
      ifNeededDates.push(date);
    }
  }

  return { requests, ifNeededDates };
}
