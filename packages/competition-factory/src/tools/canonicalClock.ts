/**
 * The clock's canonical forms (scheduling-pipeline.md § 3.8, § 9.9): what a scheduling time or date IS, decided once.
 *
 * A **time** is `HH:MM` on the venue's wall clock, hours 00–23 and minutes 00–59. These convert to it unambiguously
 * and are accepted: `H:MM`, `HH:MM:SS` (seconds dropped), a 12-hour `h:mm AM`/`h:mm PM`, and an ISO date-time, zoned
 * or not, whose wall-clock part is taken. Anything else is not a time: `23:60`, `24:00`, `-1:00`, a bare `08:00Z`,
 * `13:30 PM`, a value with leading or trailing text (` 8:00`), and a date-time whose date is not a date.
 *
 * A **date** is `YYYY-MM-DD` on the calendar, a real day: `2026-02-30` is not a date. The date part of an ISO date-time
 * is accepted.
 *
 * No dependencies: the read helpers (`plainTime`, `plainDate`) and every write validate through these two.
 */

const CLOCK = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?$/;
const MERIDIEM = /^(\d{1,2}):(\d{2}) ?([AaPp][Mm])$/;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{1,2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?)(?:Z|[+-]\d{2}(?::?\d{2})?)?$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (value: number) => String(value).padStart(2, '0');

/** A time as canonical `HH:MM`, or undefined when it is not a time. */
export function canonicalTime(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;

  // a date-time is a time only when its date is a calendar day as well
  const dateTime = DATE_TIME.exec(value);
  if (dateTime) return canonicalDate(dateTime[1]) ? canonicalTime(dateTime[2]) : undefined;

  const meridiem = MERIDIEM.exec(value);
  if (meridiem) {
    const hours = Number(meridiem[1]);
    const minutes = Number(meridiem[2]);
    if (hours < 1 || hours > 12 || minutes > 59) return undefined;
    const afternoon = meridiem[3].toUpperCase() === 'PM';
    return `${pad((hours % 12) + (afternoon ? 12 : 0))}:${pad(minutes)}`;
  }

  const clock = CLOCK.exec(value);
  if (!clock) return undefined;
  const hours = Number(clock[1]);
  const minutes = Number(clock[2]);
  const seconds = clock[3] === undefined ? 0 : Number(clock[3]);
  if (hours > 23 || minutes > 59 || seconds > 59) return undefined;
  return `${pad(hours)}:${pad(minutes)}`;
}

/** A date as canonical `YYYY-MM-DD`, a real calendar day, or undefined when it is not a date. */
export function canonicalDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const dateTime = DATE_TIME.exec(value);
  if (dateTime && !canonicalTime(value)) return undefined;
  const date = DATE.exec(dateTime ? dateTime[1] : value);
  if (!date) return undefined;
  const year = Number(date[1]);
  const month = Number(date[2]);
  const day = Number(date[3]);
  if (month < 1 || month > 12 || day < 1) return undefined;
  // the last day of the month: day 0 of the next month, in UTC so no zone moves it
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return undefined;
  return `${date[1]}-${date[2]}-${date[3]}`;
}

/** Clearing a scheduled value: an absent value, `null` or the empty string, as clients send to clear. */
export function isClearingValue(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}
