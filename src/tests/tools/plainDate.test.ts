import { plainDate, generateDateRange, extractDate, addDays, sameDay } from '@Tools/plainDate';
import { dateTime } from '@Tools/dateTime';
import { expect, it, test } from 'vitest';

// A plainDate is a calendar day with no clock and no zone. These assert the
// properties that make it *plain* — not merely that the helpers still work.

test('extractDate discards both the clock and the zone designator', () => {
  // Same calendar day however the instant is expressed.
  expect(extractDate('2026-09-09')).toEqual('2026-09-09');
  expect(extractDate('2026-09-09T14:00')).toEqual('2026-09-09');
  expect(extractDate('2026-09-09T14:00:00Z')).toEqual('2026-09-09');
  expect(extractDate('2026-09-09T14:00:00+05:30')).toEqual('2026-09-09');
});

test('extractDate returns an empty string rather than throwing on non-dates', () => {
  expect(extractDate('not-a-date')).toEqual('');
  expect(extractDate('')).toEqual('');
});

test('generateDateRange is inclusive of both endpoints', () => {
  const result = generateDateRange('2026-09-09', '2026-09-12');
  expect(result).toEqual(['2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12']);
});

test('generateDateRange returns an empty range when the order is reversed', () => {
  expect(generateDateRange('2026-09-12', '2026-09-09')).toEqual([]);
});

test('addDays crosses a month boundary and a leap day', () => {
  expect(addDays('2026-09-28', 5)).toEqual('2026-10-03');
  expect(addDays('2024-02-28', 1)).toEqual('2024-02-29');
  expect(addDays('2026-02-28', 1)).toEqual('2026-03-01');
});

test('addDays defaults to a week', () => {
  expect(addDays('2026-09-09')).toEqual('2026-09-16');
  expect(plainDate.addWeek('2026-09-09')).toEqual('2026-09-16');
});

test('sameDay compares the calendar day, not the clock', () => {
  expect(sameDay('2026-09-09T01:00', '2026-09-09T23:00')).toEqual(true);
  expect(sameDay('2026-09-09', '2026-09-10')).toEqual(false);
});

test('dateStringDaysChange steps a calendar day in both directions', () => {
  expect(plainDate.dateStringDaysChange('2026-09-09T00:00:00Z', 1)).toEqual('2026-09-10');
  expect(plainDate.dateStringDaysChange('2026-09-09T00:00:00Z', -1)).toEqual('2026-09-08');
});

it('validates ISO date strings without accepting arbitrary text', () => {
  expect(plainDate.isISODateString('2026-09-09')).toEqual(true);
  expect(plainDate.isISODateString('2026-09-09T14:00:00Z')).toEqual(true);
  expect(plainDate.isISODateString('tomorrow')).toEqual(false);
  expect(plainDate.isISODateString(20260909)).toEqual(false);
});

test('the plainDate bundle carries no zone-resolving member', () => {
  // The intent boundary is the point of the module: anything that needs an
  // offset belongs in timeZone/zonedTime, not here.
  const keys = Object.keys(plainDate);
  expect(keys.length).toBeGreaterThan(0);
  expect(keys.filter((key) => /zone|utc|offset|instant/i.test(key))).toEqual([]);
});

test('the legacy dateTime surface delegates to plainDate rather than duplicating it', () => {
  // Identity, not equality — a second implementation would drift silently.
  expect(dateTime.extractDate).toBe(extractDate);
  expect(dateTime.addDays).toBe(plainDate.addDays);
  expect(dateTime.sameDay).toBe(plainDate.sameDay);
  expect(dateTime.formatDate).toBe(plainDate.formatDate);
});
