import tournamentEngine from '@Engines/syncEngine';
import { extractDate } from '@Tools/dateTime';
import { mocksEngine } from '../../..';
import { expect, test } from 'vitest';

// constants and fixtures
import POLICY_SCHEDULING_NO_DAILY_LIMITS from '@Fixtures/policies/POLICY_SCHEDULING_NO_DAILY_LIMITS';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

test('court with no dateAvailability inherits venue defaults', () => {
  const venueId = 'venueId';
  const startDate = extractDate(new Date().toISOString());

  const venueProfiles = [
    {
      defaultStartTime: '09:00',
      defaultEndTime: '17:00',
      venueAbbreviation: 'VNU',
      courtsCount: 2,
      startTime: '08:00',
      endTime: '20:00',
      venueId,
    },
  ];
  const drawProfiles = [{ idPrefix: 'm', drawId: 'drawId', drawSize: 4 }];

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    venueProfiles,
    drawProfiles,
    startDate,
  });

  tournamentEngine.setState(tournamentRecord);

  const { courts } = tournamentEngine.getVenuesAndCourts();
  // Courts have their own dateAvailability from addCourts, so venue defaults constrain them
  for (const court of courts) {
    for (const avail of court.dateAvailability) {
      // Start time should be no earlier than venue default
      expect(avail.startTime >= '09:00').toBe(true);
      // End time should be no later than venue default
      expect(avail.endTime <= '17:00').toBe(true);
    }
  }
});

test('venue constrains wider court window via intersection', () => {
  const startDate = '2024-01-15';
  const endDate = '2024-01-15';

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2 }],
    startDate,
    endDate,
  });

  tournamentEngine.setState(tournamentRecord);

  const venue = {
    venueId: 'v1',
    venueName: 'Test Venue',
    defaultStartTime: '09:00',
    defaultEndTime: '17:00',
    courts: [
      {
        courtId: 'c1',
        courtName: 'Court 1',
        dateAvailability: [
          { startTime: '07:00', endTime: '19:00' },
          { date: startDate, startTime: '07:00', endTime: '19:00' },
        ],
      },
    ],
  };

  let result = tournamentEngine.addVenue({ venue });
  expect(result.success).toEqual(true);

  const { courts } = tournamentEngine.getVenuesAndCourts();
  const court = courts.find((c) => c.courtId === 'c1');
  expect(court).toBeDefined();

  for (const avail of court.dateAvailability) {
    expect(avail.startTime).toEqual('09:00');
    expect(avail.endTime).toEqual('17:00');
  }
});

test('narrower court window is preserved when venue is wider', () => {
  const startDate = '2024-01-15';
  const endDate = '2024-01-15';

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2 }],
    startDate,
    endDate,
  });

  tournamentEngine.setState(tournamentRecord);

  const venue = {
    venueId: 'v1',
    venueName: 'Test Venue',
    defaultStartTime: '07:00',
    defaultEndTime: '21:00',
    courts: [
      {
        courtId: 'c1',
        courtName: 'Court 1',
        dateAvailability: [
          { startTime: '10:00', endTime: '15:00' },
          { date: startDate, startTime: '10:00', endTime: '15:00' },
        ],
      },
    ],
  };

  let result = tournamentEngine.addVenue({ venue });
  expect(result.success).toEqual(true);

  const { courts } = tournamentEngine.getVenuesAndCourts();
  const court = courts.find((c) => c.courtId === 'c1');

  for (const avail of court.dateAvailability) {
    expect(avail.startTime).toEqual('10:00');
    expect(avail.endTime).toEqual('15:00');
  }
});

test('venue date-specific override takes precedence over venue defaults', () => {
  const startDate = '2024-01-15';
  const endDate = '2024-01-16';

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2 }],
    startDate,
    endDate,
  });

  tournamentEngine.setState(tournamentRecord);

  const venue = {
    venueId: 'v1',
    venueName: 'Test Venue',
    defaultStartTime: '08:00',
    defaultEndTime: '20:00',
    dateAvailability: [{ date: '2024-01-15', startTime: '10:00', endTime: '14:00' }],
    courts: [
      {
        courtId: 'c1',
        courtName: 'Court 1',
        dateAvailability: [
          { date: '2024-01-15', startTime: '07:00', endTime: '19:00' },
          { date: '2024-01-16', startTime: '07:00', endTime: '19:00' },
        ],
      },
    ],
  };

  let result = tournamentEngine.addVenue({ venue });
  expect(result.success).toEqual(true);

  const { courts } = tournamentEngine.getVenuesAndCourts();
  const court = courts.find((c) => c.courtId === 'c1');

  // Jan 15: venue date-specific (10:00-14:00) constrains court (07:00-19:00)
  const jan15 = court.dateAvailability.find((a) => a.date === '2024-01-15');
  expect(jan15.startTime).toEqual('10:00');
  expect(jan15.endTime).toEqual('14:00');

  // Jan 16: venue defaults (08:00-20:00) constrains court (07:00-19:00)
  const jan16 = court.dateAvailability.find((a) => a.date === '2024-01-16');
  expect(jan16.startTime).toEqual('08:00');
  expect(jan16.endTime).toEqual('19:00');
});

test('venue bookings merge with court bookings', () => {
  const startDate = '2024-01-15';

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2 }],
    startDate,
    endDate: startDate,
  });

  tournamentEngine.setState(tournamentRecord);

  const venueBooking = { startTime: '12:00', endTime: '13:00', bookingType: 'MAINTENANCE' };
  const courtBooking = { startTime: '15:00', endTime: '16:00', bookingType: 'PRACTICE' };

  const venue = {
    venueId: 'v1',
    venueName: 'Test Venue',
    dateAvailability: [{ date: startDate, startTime: '08:00', endTime: '18:00', bookings: [venueBooking] }],
    courts: [
      {
        courtId: 'c1',
        courtName: 'Court 1',
        dateAvailability: [{ date: startDate, startTime: '08:00', endTime: '18:00', bookings: [courtBooking] }],
      },
    ],
  };

  let result = tournamentEngine.addVenue({ venue });
  expect(result.success).toEqual(true);

  const { courts } = tournamentEngine.getVenuesAndCourts();
  const court = courts.find((c) => c.courtId === 'c1');
  const avail = court.dateAvailability.find((a) => a.date === startDate);

  expect(avail.bookings).toHaveLength(2);
  expect(avail.bookings).toContainEqual(courtBooking);
  expect(avail.bookings).toContainEqual(venueBooking);
});

test('backward compatibility: no venue defaults means no change', () => {
  const venueId = 'venueId';
  const startDate = extractDate(new Date().toISOString());
  const drawProfiles = [{ idPrefix: 'm', drawId: 'drawId', drawSize: 4 }];
  const venueProfiles = [
    {
      venueAbbreviation: 'VNU',
      courtsCount: 2,
      startTime: '08:00',
      endTime: '20:00',
      venueId,
    },
  ];

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    venueProfiles,
    drawProfiles,
    startDate,
  });

  tournamentEngine.setState(tournamentRecord);

  const { courts } = tournamentEngine.getVenuesAndCourts();
  // Courts should have the times from court-level dateAvailability, not modified
  for (const court of courts) {
    const defaultAvail = court.dateAvailability.find((a) => !a.date);
    if (defaultAvail) {
      expect(defaultAvail.startTime).toEqual('08:00');
      expect(defaultAvail.endTime).toEqual('20:00');
    }
  }
});

test('scheduling integration: auto-schedule respects venue constraints', () => {
  const drawId = 'drawId';
  const venueId = 'venueId';
  const startDate = extractDate(new Date().toISOString());

  const venueProfiles = [
    {
      defaultStartTime: '10:00',
      defaultEndTime: '14:00',
      venueAbbreviation: 'VNU',
      courtsCount: 4,
      startTime: '08:00',
      endTime: '20:00',
      venueId,
    },
  ];
  const drawProfiles = [{ idPrefix: 'm', drawId, drawSize: 16 }];
  const schedulingProfile = [
    {
      scheduleDate: startDate,
      venues: [
        {
          venueId,
          rounds: [
            { drawId, winnerFinishingPositionRange: '1-8' },
            { drawId, winnerFinishingPositionRange: '1-4' },
            { drawId, winnerFinishingPositionRange: '1-2' },
            { drawId, winnerFinishingPositionRange: '1-1' },
          ],
        },
      ],
    },
  ];

  const { tournamentRecord, schedulerResult } = mocksEngine.generateTournamentRecord({
    policyDefinitions: POLICY_SCHEDULING_NO_DAILY_LIMITS,
    autoSchedule: true,
    schedulingProfile,
    venueProfiles,
    drawProfiles,
    startDate,
  });

  tournamentEngine.setState(tournamentRecord);

  // All scheduled matchUps should be within venue constraints (10:00-14:00)
  const scheduleTimes = Object.values(schedulerResult.matchUpScheduleTimes) as string[];
  for (const time of scheduleTimes) {
    expect(time >= '10:00').toBe(true);
    expect(time < '14:00').toBe(true);
  }
});

test('mixed courts: some with own availability, some inheriting', () => {
  const startDate = '2024-01-15';

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2 }],
    startDate,
    endDate: startDate,
  });

  tournamentEngine.setState(tournamentRecord);

  const venue = {
    venueId: 'v1',
    venueName: 'Test Venue',
    defaultStartTime: '09:00',
    defaultEndTime: '17:00',
    courts: [
      {
        courtId: 'c1',
        courtName: 'Court 1',
        dateAvailability: [{ date: startDate, startTime: '07:00', endTime: '19:00' }],
      },
      {
        courtId: 'c2',
        courtName: 'Court 2',
        dateAvailability: [],
      },
    ],
  };

  let result = tournamentEngine.addVenue({ venue });
  expect(result.success).toEqual(true);

  const { courts } = tournamentEngine.getVenuesAndCourts();
  const court1 = courts.find((c) => c.courtId === 'c1');
  const court2 = courts.find((c) => c.courtId === 'c2');

  // Court 1: intersected with venue defaults
  const c1Avail = court1.dateAvailability.find((a) => a.date === startDate);
  expect(c1Avail.startTime).toEqual('09:00');
  expect(c1Avail.endTime).toEqual('17:00');

  // Court 2: inherited venue defaults
  expect(court2.dateAvailability).toHaveLength(1);
  expect(court2.dateAvailability[0].startTime).toEqual('09:00');
  expect(court2.dateAvailability[0].endTime).toEqual('17:00');
});

test('modifyVenue can set/update venue scheduling attributes', () => {
  const startDate = '2024-01-15';

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2 }],
    startDate,
    endDate: startDate,
  });

  tournamentEngine.setState(tournamentRecord);

  const venue = { venueId: 'v1', venueName: 'Test Venue' };
  let result = tournamentEngine.addVenue({ venue });
  expect(result.success).toEqual(true);

  // Set defaults via modifyVenue
  result = tournamentEngine.modifyVenue({
    venueId: 'v1',
    modifications: {
      defaultStartTime: '09:00',
      defaultEndTime: '17:00',
    },
  });
  expect(result.success).toEqual(true);

  let { venue: modifiedVenue } = tournamentEngine.findVenue({ venueId: 'v1' });
  expect(modifiedVenue.defaultStartTime).toEqual('09:00');
  expect(modifiedVenue.defaultEndTime).toEqual('17:00');

  // Set dateAvailability via modifyVenue
  result = tournamentEngine.modifyVenue({
    venueId: 'v1',
    modifications: {
      dateAvailability: [{ date: startDate, startTime: '10:00', endTime: '14:00' }],
    },
  });
  expect(result.success).toEqual(true);

  ({ venue: modifiedVenue } = tournamentEngine.findVenue({ venueId: 'v1' }));
  expect(modifiedVenue.dateAvailability).toHaveLength(1);
  expect(modifiedVenue.dateAvailability[0].date).toEqual(startDate);
});

test('addVenue validation rejects invalid dateAvailability', () => {
  const startDate = '2024-01-15';

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2 }],
    startDate,
    endDate: startDate,
  });

  tournamentEngine.setState(tournamentRecord);

  // Invalid: missing endTime
  const venue = {
    venueId: 'v1',
    venueName: 'Test Venue',
    dateAvailability: [{ startTime: '09:00' }],
  };

  const result = tournamentEngine.addVenue({ venue });
  expect(result.error).toBeDefined();
});

test('addVenue validation rejects invalid defaultStartTime/defaultEndTime', () => {
  const startDate = '2024-01-15';

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2 }],
    startDate,
    endDate: startDate,
  });

  tournamentEngine.setState(tournamentRecord);

  // Invalid: endTime before startTime
  let result = tournamentEngine.addVenue({
    venue: {
      venueId: 'v1',
      venueName: 'Test Venue',
      defaultStartTime: '17:00',
      defaultEndTime: '09:00',
    },
  });
  expect(result.error).toEqual(INVALID_VALUES);

  // Invalid: only one provided
  result = tournamentEngine.addVenue({
    venue: {
      venueId: 'v2',
      venueName: 'Test Venue 2',
      defaultStartTime: '09:00',
    },
  });
  expect(result.error).toEqual(INVALID_VALUES);
});

test('venue closure: narrow venue window limits all courts for a date', () => {
  const startDate = '2024-01-15';

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2 }],
    startDate,
    endDate: startDate,
  });

  tournamentEngine.setState(tournamentRecord);

  // Venue has a narrow window for the date (simulating partial closure)
  const venue = {
    venueId: 'v1',
    venueName: 'Test Venue',
    dateAvailability: [{ date: startDate, startTime: '11:00', endTime: '13:00' }],
    courts: [
      {
        courtId: 'c1',
        courtName: 'Court 1',
        dateAvailability: [{ date: startDate, startTime: '08:00', endTime: '20:00' }],
      },
      {
        courtId: 'c2',
        courtName: 'Court 2',
        dateAvailability: [{ date: startDate, startTime: '06:00', endTime: '22:00' }],
      },
    ],
  };

  let result = tournamentEngine.addVenue({ venue });
  expect(result.success).toEqual(true);

  const { courts } = tournamentEngine.getVenuesAndCourts();

  for (const court of courts) {
    if (court.venueId === 'v1') {
      const avail = court.dateAvailability.find((a) => a.date === startDate);
      expect(avail.startTime).toEqual('11:00');
      expect(avail.endTime).toEqual('13:00');
    }
  }
});

test('venue-level maintenance booking blocks court scheduling', () => {
  const startDate = '2024-01-15';

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2 }],
    startDate,
    endDate: startDate,
  });

  tournamentEngine.setState(tournamentRecord);

  const maintenanceBooking = { startTime: '12:00', endTime: '14:00', bookingType: 'MAINTENANCE' };

  const venue = {
    venueId: 'v1',
    venueName: 'Test Venue',
    dateAvailability: [{ date: startDate, startTime: '08:00', endTime: '20:00', bookings: [maintenanceBooking] }],
    courts: [
      {
        courtId: 'c1',
        courtName: 'Court 1',
        dateAvailability: [{ date: startDate, startTime: '08:00', endTime: '20:00' }],
      },
    ],
  };

  let result = tournamentEngine.addVenue({ venue });
  expect(result.success).toEqual(true);

  const { courts } = tournamentEngine.getVenuesAndCourts();
  const court = courts.find((c) => c.courtId === 'c1');
  const avail = court.dateAvailability.find((a) => a.date === startDate);

  // The venue maintenance booking should appear in the court's bookings
  expect(avail.bookings).toHaveLength(1);
  expect(avail.bookings[0]).toEqual(maintenanceBooking);
});
