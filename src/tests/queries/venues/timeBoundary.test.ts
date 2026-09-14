import { getDateTimeBoundary } from '@Generators/scheduling/utils/getTimeBoundary';
import { expect, test } from 'vitest';

test('time boundaries for startTime / endTime correctly deduced', () => {
  const date = '2023-09-18';
  const courts = [
    {
      dateAvailability: [{ date, startTime: '09:00', endTime: '17:00' }],
      courtId: 'c0',
    },
    {
      dateAvailability: [{ date, startTime: '09:00', endTime: '17:00' }],
      courtId: 'c1',
    },
    {
      dateAvailability: [{ date, startTime: '11:00', endTime: '18:00' }],
      courtId: 'c2',
    },
    {
      dateAvailability: [{ date, startTime: '11:00', endTime: '18:00' }],
      courtId: 'c3',
    },
  ];

  const startTime = getDateTimeBoundary({
    scheduleDate: date,
    startTime: true,
    courts,
  });
  expect(startTime).toEqual('09:00');

  const endTime = getDateTimeBoundary({
    scheduleDate: date,
    endTime: true,
    courts,
  });
  expect(endTime).toEqual('18:00');
});
