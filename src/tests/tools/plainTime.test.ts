import { plainTime, timeStringMinutes, extractTime, convertTime } from '@Tools/plainTime';
import { dateTime } from '@Tools/dateTime';
import { expect, it, test } from 'vitest';

// A plainTime is a wall clock with no day and no zone.

test('extractTime reads the clock from an instant and from a bare time', () => {
  expect(extractTime('2026-09-09T14:00')).toEqual('14:00');
  expect(extractTime('14:00')).toEqual('14:00');
  expect(extractTime('14:00:30')).toEqual('14:00');
});

test('extractTime is undefined when there is no clock to read', () => {
  expect(extractTime('2026-09-09')).toBeUndefined();
  expect(extractTime('not-a-time')).toBeUndefined();
});

test('timeStringMinutes and dayMinutesToTimeString round-trip', () => {
  expect(timeStringMinutes('00:00')).toEqual(0);
  expect(timeStringMinutes('14:30')).toEqual(870);
  expect(plainTime.dayMinutesToTimeString(870)).toEqual('14:30');
  expect(plainTime.dayMinutesToTimeString(timeStringMinutes('09:05'))).toEqual('09:05');
});

test('dayMinutesToTimeString wraps past midnight rather than overflowing', () => {
  expect(plainTime.dayMinutesToTimeString(1500)).toEqual('01:00');
});

test('convertTime crosses between 24-hour and 12-hour display', () => {
  expect(convertTime('14:00', true)).toEqual('14:00');
  expect(convertTime('14:00')).toEqual('2:00 PM');
  expect(convertTime('2:00 PM', true)).toEqual('14:00');
  expect(convertTime('12:00 AM', true)).toEqual('00:00');
  expect(convertTime('12:00 PM', true)).toEqual('12:00');
});

test('convertTime is undefined for an absent value', () => {
  expect(convertTime(undefined)).toBeUndefined();
  expect(convertTime('')).toBeUndefined();
});

it('rejects clock values that no wall clock can show', () => {
  expect(plainTime.isTimeString('23:59')).toEqual(true);
  expect(plainTime.isTimeString('24:00')).toEqual(false);
  expect(plainTime.isTimeString('noon')).toEqual(false);
});

test('timeSort orders wall clocks ascending', () => {
  const times = ['14:00', '09:30', '23:15', '09:05'];
  expect([...times].sort(plainTime.timeSort)).toEqual(['09:05', '09:30', '14:00', '23:15']);
});

test('the plainTime bundle carries no calendar-day or zone member', () => {
  const keys = Object.keys(plainTime);
  expect(keys.length).toBeGreaterThan(0);
  expect(keys.filter((key) => /zone|utc|offset|date/i.test(key))).toEqual([]);
});

test('the legacy dateTime surface delegates to plainTime rather than duplicating it', () => {
  expect(dateTime.extractTime).toBe(extractTime);
  expect(dateTime.convertTime).toBe(convertTime);
  expect(dateTime.timeStringMinutes).toBe(timeStringMinutes);
  expect(dateTime.isTimeString).toBe(plainTime.isTimeString);
});
