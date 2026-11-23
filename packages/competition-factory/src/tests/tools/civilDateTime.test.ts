import { addDaysToDate, addMinutesToDateTime, dateOfDayNumber, dayNumber } from '@Tools/civilDateTime';
import { expect, it } from 'vitest';

// the arithmetic's cases are the kernel's (cases/time.json, kernel.civil.addMinutes@1); these are its edges

it('counts days from 1970-01-01, signed', () => {
  expect(dayNumber('1970-01-01')).toEqual(0);
  expect(dayNumber('1969-12-31')).toEqual(-1);
  expect(dayNumber('2026-02-30')).toBeUndefined();
  expect(dateOfDayNumber(0)).toEqual('1970-01-01');
  expect(dateOfDayNumber(-1)).toEqual('1969-12-31');
});

it('moves a date by days, and refuses what is not a date', () => {
  expect(addDaysToDate('2028-02-28', 1)).toEqual('2028-02-29');
  expect(addDaysToDate('2026-03-01', -1)).toEqual('2026-02-28');
  expect(addDaysToDate('2026-02-30', 1)).toBeUndefined();
});

it('adds only whole minutes', () => {
  expect(addMinutesToDateTime({ date: '2026-03-02', time: '09:00', minutes: 1.5 })).toBeUndefined();
});
