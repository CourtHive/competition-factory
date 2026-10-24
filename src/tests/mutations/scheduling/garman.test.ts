import garman from '@Assemblies/generators/scheduling/garman/garman';
import { expect, it } from 'vitest';

const date = new Date().toISOString().split('T')[0];

it('generates dummy courts', () => {
  let courts = garman.courtGenerator({
    startTime: '8:00',
    endTime: '20:30',
    count: 10,
    date,
  });
  expect(courts.length).toEqual(10);
  expect(courts[9].dateAvailability[0].startTime).toEqual('8:00');
  expect(courts[9].dateAvailability[0].endTime).toEqual('20:30');
  courts = garman.courtGenerator({
    startTime: '7:00',
    endTime: '18:00',
    count: 12,
    date,
  });
  expect(courts[11].dateAvailability[0].startTime).toEqual('7:00');
  expect(courts[11].dateAvailability[0].endTime).toEqual('18:00');
});

it('replcates revised garman spreadsheet funcationality', () => {
  let courts = garman.courtGenerator({
    date,
    count: 10,
    startTime: '8:00',
    endTime: '20:30',
  });
  let { timingProfile } = garman.getScheduleTimes({
    averageMatchUpMinutes: 90,
    startTime: '8:00',
    endTime: '19:00',
    periodLength: 30,
    courts,
    date,
  });
  expect(timingProfile.length).toEqual(23);
  // Brian Garman, "The Revised Garman System" (2009), 10 Courts, Table 3 "1 hr 30 min", the Total column from 8:00 AM
  // (period 0) to 7:00 PM (period 22): the published table rounds to the nearest match (CA 2026-10-24)
  // prettier-ignore
  expect(timingProfile.map(({ totalMatchUps }) => totalMatchUps)).toEqual([
    10, 10, 13, 17, 20, 23, 27, 30, 33, 37, 40, 43, 47, 50, 53, 57, 60, 63, 67, 70, 73, 77, 80,
  ]);
  expect(timingProfile[21].add).toEqual(4);
  expect(timingProfile[22].add).toEqual(3);
  expect(timingProfile[22].totalMatchUps).toEqual(80);

  courts = garman.courtGenerator({
    startTime: '8:00',
    endTime: '20:30',
    count: 12,
    date,
  });
  ({ timingProfile } = garman.getScheduleTimes({
    averageMatchUpMinutes: 80,
    startTime: '8:00',
    endTime: '19:00',
    periodLength: 30,
    courts,
    date,
  }));
  // 12 × 30 / 80 = 4.5 matches a period: 102 by period 21, 106.5 by period 22, which rounds half up to 107
  expect(timingProfile[21].add).toEqual(4);
  expect(timingProfile[22].add).toEqual(5);
  expect(timingProfile[22].totalMatchUps).toEqual(107);

  courts = garman.courtGenerator({
    startTime: '8:00',
    endTime: '20:30',
    count: 3,
    date,
  });
  ({ timingProfile } = garman.getScheduleTimes({
    averageMatchUpMinutes: 75,
    startTime: '8:00',
    endTime: '19:00',
    periodLength: 30,
    courts,
    date,
  }));
  // 3 × 30 / 75 = 1.2 matches a period: 25.8 by period 20 rounds to 26, 27 by period 21, 28.2 by period 22
  expect(timingProfile[21].add).toEqual(1);
  expect(timingProfile[22].add).toEqual(1);
  expect(timingProfile[22].totalMatchUps).toEqual(28);
  // prettier-ignore
  expect(timingProfile.map((p) => p.periodStart)).toEqual([
    '08:00', '08:30', '09:00', '09:30',
    '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30',
    '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30', '17:00', '17:30',
    '18:00', '18:30', '19:00',
  ]);

  ({ timingProfile } = garman.getScheduleTimes({
    averageMatchUpMinutes: 75,
    startTime: '8:00',
    endTime: '19:00',
    periodLength: 10,
    courts,
    date,
  }));
  // prettier-ignore
  expect(timingProfile.map((p) => p.periodStart)).toEqual([
    '08:00', '08:10', '08:20', '08:30', '08:40', '08:50', '09:00',
    '09:10', '09:20', '09:30', '09:40', '09:50', '10:00', '10:10',
    '10:20', '10:30', '10:40', '10:50', '11:00', '11:10', '11:20',
    '11:30', '11:40', '11:50', '12:00', '12:10', '12:20', '12:30',
    '12:40', '12:50', '13:00', '13:10', '13:20', '13:30', '13:40',
    '13:50', '14:00', '14:10', '14:20', '14:30', '14:40', '14:50',
    '15:00', '15:10', '15:20', '15:30', '15:40', '15:50', '16:00',
    '16:10', '16:20', '16:30', '16:40', '16:50', '17:00', '17:10',
    '17:20', '17:30', '17:40', '17:50', '18:00', '18:10', '18:20',
    '18:30', '18:40', '18:50', '19:00',
  ]);
});

it('correctly determines courts available at periodStart', () => {
  const courts = [
    {
      dateAvailability: [{ date, startTime: '9:00', endTime: '17:00' }],
      courtId: 'c0',
    },
    {
      dateAvailability: [{ date, startTime: '9:00', endTime: '17:00' }],
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

  let availability = garman.getCourtsAvailableAtPeriodStart({
    averageMatchUpMinutes: 90,
    periodStart: '8:00',
    courts,
    date,
  });
  expect(availability.availableToScheduleCount).toEqual(0);
  availability = garman.getCourtsAvailableAtPeriodStart({
    courts,
    date,
    periodStart: '9:00',
    averageMatchUpMinutes: 90,
  });
  expect(availability.availableToScheduleCount).toEqual(2);
  availability = garman.getCourtsAvailableAtPeriodStart({
    courts,
    date,
    periodStart: '11:00',
    averageMatchUpMinutes: 90,
  });
  expect(availability.availableToScheduleCount).toEqual(4);
  availability = garman.getCourtsAvailableAtPeriodStart({
    courts,
    date,
    periodStart: '15:30',
    averageMatchUpMinutes: 90,
  });
  expect(availability.availableToScheduleCount).toEqual(4);
  availability = garman.getCourtsAvailableAtPeriodStart({
    courts,
    date,
    periodStart: '15:31',
    averageMatchUpMinutes: 90,
  });
  expect(availability.availableToScheduleCount).toEqual(2);
  availability = garman.getCourtsAvailableAtPeriodStart({
    courts,
    date,
    periodStart: '16:30',
    averageMatchUpMinutes: 90,
  });
  expect(availability.availableToScheduleCount).toEqual(2);
  availability = garman.getCourtsAvailableAtPeriodStart({
    courts,
    date,
    periodStart: '16:31',
    averageMatchUpMinutes: 90,
  });
  expect(availability.availableToScheduleCount).toEqual(0);
});

it('generates expected output for two locations with differing court availability', () => {
  const courts = [
    { dateAvailability: [{ date, startTime: '9:00', endTime: '17:00' }] },
    { dateAvailability: [{ date, startTime: '9:00', endTime: '17:00' }] },
    { dateAvailability: [{ date, startTime: '11:00', endTime: '18:00' }] },
    { dateAvailability: [{ date, startTime: '11:00', endTime: '18:00' }] },
  ];

  const { timingProfile } = garman.getScheduleTimes({
    startTime: '8:00',
    endTime: '18:00',
    date,
    periodLength: 30,
    averageMatchUpMinutes: 90,
    courts,
  });
  expect(timingProfile[14].add).toEqual(0);
  expect(timingProfile[14].periodStart).toEqual('16:00');
  expect(timingProfile[14].totalMatchUps).toEqual(18);
  expect(timingProfile[15].add).toEqual(1);
  expect(timingProfile[16].add).toEqual(0);
  expect(timingProfile[17].totalMatchUps).toEqual(19);
  expect(timingProfile[17].add).toEqual(0);
  expect(timingProfile[18].add).toEqual(0);
});

it('can generate timeSlots from dateAvailability', () => {
  const courtDate = {
    date: '2020-01-01',
    startTime: '9:00',
    endTime: '17:00',
    bookings: [
      { startTime: '8:00', endTime: '9:10', bookingType: 'practice' },
      { startTime: '9:10', endTime: '12:00', bookingType: 'matchUp' },
      { startTime: '12:00', endTime: '13:30', bookingType: 'maintenance' },
      { startTime: '14:00', endTime: '19:10' },
    ],
  };

  const timeSlots = garman.generateTimeSlots({
    includeBookingTypes: ['matchUp'],
    courtDate,
  }).timeSlots;
  expect(timeSlots?.length).toEqual(2);
  expect(timeSlots?.[0]).toEqual({ startTime: '09:10', endTime: '12:00' });
  expect(timeSlots?.[1]).toEqual({ startTime: '13:30', endTime: '14:00' });
});
