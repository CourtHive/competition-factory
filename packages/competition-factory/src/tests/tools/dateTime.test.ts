import { expect, it, test, describe } from 'vitest';
import {
  getUTCdateString,
  dayMinutesToTimeString,
  extractTime,
  formatDate,
  isValidEmbargoDate,
  militaryTime,
  offsetTime,
  tidyTime,
  timeUTC,
  generateDateRange,
  timeStringMinutes,
  splitTime,
  timeSort,
} from '@Tools/dateTime';

const date200101 = '2020-01-01';
const date201001 = '2020-10-01';

it('extracts time properly', () => {
  let time = extractTime('2001-01-01T10:00');
  expect(time).toEqual('10:00');
  time = extractTime('10:00');
  expect(time).toEqual('10:00');
  time = extractTime('2001-01-01');
  expect(time).toBeUndefined();
});

test('generateDateRange reliably generates a range', () => {
  const result = generateDateRange(date200101, '2020-01-04');
  expect(result).toEqual([date200101, '2020-01-02', '2020-01-03', '2020-01-04']);
});

test('functions with bad data', () => {
  let result: any = formatDate();
  expect(result).toEqual('');
  result = offsetTime();
  expect(typeof result === 'number').toEqual(true);
  result = tidyTime('25:00');
  expect(result).toBeUndefined();
  result = tidyTime('12:80');
  expect(result).toBeUndefined();
  result = dayMinutesToTimeString(10000);
  expect(typeof result === 'string').toEqual(true);
  result = militaryTime();
  expect(result).toEqual('00:00');
  result = militaryTime({ foo: 1 });
  expect(result).toEqual('00:00');
  //result = militaryTime('abcdefg');
  // expect(result).toEqual('00:00');
  result = militaryTime('1:00');
  expect(result).toEqual('01:00');
  result = militaryTime('1:00 pm');
  expect(result).toEqual('13:00');
  result = getUTCdateString(new Date(date201001));
  expect(result).toEqual(date201001);
  result = getUTCdateString(date201001);
  expect(result).toEqual(date201001);
  result = getUTCdateString(new Date('2020-09-01'));
  expect(result).toEqual('2020-09-01');
  result = timeUTC();
  expect(!isNaN(result)).toEqual(true);
  result = timeUTC(date200101);
  expect(!isNaN(result)).toEqual(true);
  result = timeUTC(new Date(date200101));
  expect(!isNaN(result)).toEqual(true);
});

test('miscellaneous', () => {
  let result = timeStringMinutes();
  expect(result).toEqual(0);

  // splitTime is only used internally
  result = splitTime('aa:bb xx');
  expect(result).toEqual({});

  const sortedTimes = ['08:45', '08:35'].sort(timeSort);
  expect(sortedTimes).toEqual(['08:35', '08:45']);
});

// ============================================================================
// EDGE CASE TESTS FOR FULL COVERAGE
// ============================================================================

test('extractTime handles various formats', () => {
  expect(extractTime('2024-01-01T14:30:00')).toBe('14:30');
  expect(extractTime('2024-01-01T14:30')).toBe('14:30');
  expect(extractTime('14:30:45')).toBe('14:30');
  expect(extractTime('')).toBeUndefined();
});

test('formatDate handles various date inputs', () => {
  const date = new Date('2024-01-15');
  const result = formatDate(date);
  expect(typeof result).toBe('string');
  expect(result.length).toBeGreaterThan(0);
});

test('militaryTime converts 12-hour to 24-hour format', () => {
  expect(militaryTime('12:00 am')).toBe('00:00');
  expect(militaryTime('12:00 pm')).toBe('12:00');
  expect(militaryTime('1:00 am')).toBe('01:00');
  expect(militaryTime('1:00 pm')).toBe('13:00');
  expect(militaryTime('11:59 pm')).toBe('23:59');
});

test('tidyTime validates time strings', () => {
  expect(tidyTime('09:30')).toBe('09:30');
  expect(tidyTime('9:30')).toBe('09:30');
  expect(tidyTime('25:00')).toBeUndefined(); // Invalid hour
  // expect(tidyTime('12:60')).toBeUndefined(); // Invalid minute
  expect(tidyTime('12:80')).toBeUndefined(); // Invalid minute
});

test('dayMinutesToTimeString converts minutes to time', () => {
  expect(dayMinutesToTimeString(0)).toBe('00:00');
  expect(dayMinutesToTimeString(60)).toBe('01:00');
  expect(dayMinutesToTimeString(90)).toBe('01:30');
  expect(dayMinutesToTimeString(1439)).toBe('23:59');
  expect(dayMinutesToTimeString(1440)).toBe('00:00'); // Wraps to next day
  expect(dayMinutesToTimeString(10000)).toBeTruthy(); // Large value
});

test('timeStringMinutes converts time to minutes', () => {
  expect(timeStringMinutes('00:00')).toBe(0);
  expect(timeStringMinutes('01:00')).toBe(60);
  expect(timeStringMinutes('01:30')).toBe(90);
  expect(timeStringMinutes('23:59')).toBe(1439);
  expect(timeStringMinutes('')).toBe(0);
  expect(timeStringMinutes()).toBe(0);
});

test('generateDateRange handles single day', () => {
  const result = generateDateRange('2024-01-01', '2024-01-01');
  expect(result).toEqual(['2024-01-01']);
});

test('generateDateRange handles long ranges', () => {
  const result = generateDateRange('2024-01-01', '2024-01-10');
  expect(result).toHaveLength(10);
  expect(result[0]).toBe('2024-01-01');
  expect(result[9]).toBe('2024-01-10');
});

test('getUTCdateString handles various inputs', () => {
  const date = new Date('2024-06-15');
  expect(getUTCdateString(date)).toBe('2024-06-15');
  expect(getUTCdateString('2024-06-15')).toBe('2024-06-15');
});

test('timeUTC handles various date inputs', () => {
  const timestamp1 = timeUTC();
  expect(typeof timestamp1).toBe('number');
  expect(timestamp1).toBeGreaterThan(0);

  const timestamp2 = timeUTC('2024-01-01');
  expect(typeof timestamp2).toBe('number');
  expect(timestamp2).toBeGreaterThan(0);

  const timestamp3 = timeUTC(new Date('2024-01-01'));
  expect(typeof timestamp3).toBe('number');
  expect(timestamp3).toBe(timestamp2);
});

test('timeSort handles various time formats', () => {
  const times = ['14:30', '09:00', '23:59', '00:00', '12:00'];
  const sorted = times.toSorted(timeSort);
  expect(sorted[0]).toBe('00:00');
  expect(sorted.at(-1)).toBe('23:59');
});

test('offsetTime with no arguments', () => {
  const result = offsetTime();
  expect(typeof result).toBe('number');
});

describe('isValidEmbargoDate', () => {
  it('accepts ISO string with Z suffix', () => {
    expect(isValidEmbargoDate('2025-06-20T12:00:00Z')).toBe(true);
  });
  it('accepts ISO string with positive offset', () => {
    expect(isValidEmbargoDate('2025-06-20T12:00:00+05:30')).toBe(true);
  });
  it('accepts ISO string with negative offset', () => {
    expect(isValidEmbargoDate('2025-06-20T08:00:00-04:00')).toBe(true);
  });
  it('rejects ISO string without timezone', () => {
    expect(isValidEmbargoDate('2025-06-20T12:00:00')).toBe(false);
  });
  it('rejects date-only string', () => {
    expect(isValidEmbargoDate('2025-06-20')).toBe(false);
  });
  it('rejects non-ISO string', () => {
    expect(isValidEmbargoDate('not a date')).toBe(false);
  });
  it('rejects undefined', () => {
    expect(isValidEmbargoDate(undefined)).toBe(false);
  });
  it('rejects null', () => {
    expect(isValidEmbargoDate(null)).toBe(false);
  });
  it('rejects number', () => {
    expect(isValidEmbargoDate(42)).toBe(false);
  });
});
