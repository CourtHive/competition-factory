import { validDateAvailability } from '@Validators/validateDateAvailability';
import { Availability } from '@Types/tournamentTypes';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, test } from 'vitest';

// constants
import {
  COURT_NOT_FOUND,
  INVALID_BOOKINGS,
  INVALID_DATE,
  INVALID_DATE_AVAILABILITY,
  INVALID_TIME,
  MISSING_COURT_ID,
} from '@Constants/errorConditionConstants';

const invalidTime = 'Invalid Time';
const d210102 = '2021-01-02';
const d220202 = '2022-02-02';

test('will not allow saving of Invalid Date in dateAvailability', () => {
  let dateAvailability: Availability[] = [{ date: d210102, startTime: '09:00', endTime: '16:00' }];
  let result = validDateAvailability({ dateAvailability });
  expect(result.valid).toEqual(true);

  result = validDateAvailability({ dateAvailability: 'not an array' });
  expect(result.error).toEqual(INVALID_DATE_AVAILABILITY);

  result = validDateAvailability({ dateAvailability: ['not an object'] });
  expect(result.error).toEqual(INVALID_DATE_AVAILABILITY);

  dateAvailability = [{ date: invalidTime, startTime: '09:00', endTime: '16:00' }];
  result = validDateAvailability({ dateAvailability });
  expect(result.error).toEqual(INVALID_DATE);

  dateAvailability = [{ date: d210102, startTime: invalidTime, endTime: '16:00' }];
  result = validDateAvailability({ dateAvailability });
  expect(result.error).toEqual(INVALID_TIME);

  dateAvailability = [{ date: d210102, startTime: '09:00', endTime: invalidTime }];
  result = validDateAvailability({ dateAvailability });
  expect(result.error).toEqual(INVALID_TIME);

  dateAvailability = [{ date: d210102, startTime: '09:00', endTime: '09:00' }];
  result = validDateAvailability({ dateAvailability });
  expect(result.error).toEqual(INVALID_TIME);

  dateAvailability = [{ date: d210102, startTime: '10:00', endTime: '09:00' }];
  result = validDateAvailability({ dateAvailability });
  expect(result.error).toEqual(INVALID_TIME);

  dateAvailability = [
    {
      bookings: [{ startTime: '09:00', endTime: '10:00' }],
      startTime: '08:00',
      endTime: '19:00',
      date: d210102,
    },
  ];
  result = validDateAvailability({ dateAvailability });
  expect(result.valid).toEqual(true);

  dateAvailability = [
    {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      bookings: 'not an array',
      startTime: '08:00',
      endTime: '19:00',
      date: d210102,
    },
  ];
  result = validDateAvailability({ dateAvailability });
  expect(result.error).toEqual(INVALID_BOOKINGS);

  dateAvailability = [
    {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      bookings: ['not an object'],
      startTime: '08:00',
      endTime: '19:00',
      date: d210102,
    },
  ];
  result = validDateAvailability({ dateAvailability });
  expect(result.error).toEqual(INVALID_BOOKINGS);

  dateAvailability = [
    {
      bookings: [{ startTime: invalidTime, endTime: '10:00' }],
      startTime: '08:00',
      endTime: '19:00',
      date: d210102,
    },
  ];
  result = validDateAvailability({ dateAvailability });
  expect(result.error).toEqual(INVALID_TIME);

  dateAvailability = [
    {
      bookings: [{ startTime: '09:00', endTime: invalidTime }],
      startTime: '08:00',
      endTime: '19:00',
      date: d210102,
    },
  ];
  result = validDateAvailability({ dateAvailability });
  expect(result.error).toEqual(INVALID_TIME);

  dateAvailability = [
    {
      bookings: [{ startTime: '09:00', endTime: '09:00' }],
      startTime: '08:00',
      endTime: '19:00',
      date: d210102,
    },
  ];
  result = validDateAvailability({ dateAvailability });
  expect(result.error).toEqual(INVALID_TIME);

  dateAvailability = [
    {
      bookings: [{ startTime: '10:00', endTime: '09:00' }],
      startTime: '08:00',
      endTime: '19:00',
      date: d210102,
    },
  ];
  result = validDateAvailability({ dateAvailability });
  expect(result.error).toEqual(INVALID_TIME);
});

it('can add events, venues, and modify court availbility', () => {
  const startDate = '2023-01-01';
  const endDate = '2023-01-06';

  const dateAvailability = [
    {
      startTime: '07:00',
      endTime: '19:00',
      date: startDate,
      bookings: [
        { startTime: '07:00', endTime: '08:30', bookingType: 'PRACTICE' },
        { startTime: '08:30', endTime: '09:00', bookingType: 'MAINTENANCE' },
        { startTime: '13:30', endTime: '14:00', bookingType: 'MAINTENANCE' },
      ],
    },
  ];

  const venueId = 'v1';
  const venueProfiles = [
    {
      venueName: 'venue 1',
      dateAvailability,
      courtsCount: 3,
      venueId,
    },
  ];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    // policyDefinitions: { ...POLICY_SCHEDULING_DEFAULT },
    drawProfiles: [{ drawSize: 8 }],
    venueProfiles,
    startDate,
    endDate,
  });

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  let { courts } = tournamentEngine.getCourts();
  expect(courts.length).toEqual(3);
  const courtId = courts[0].courtId;

  result = tournamentEngine.modifyCourtAvailability({
    dateAvailability: [
      { date: d220202, startTime: '10:00', endTime: '20:00' },
      { date: d220202, startTime: '08:00', endTime: '09:00' },
    ],
    courtId,
  });
  expect(result.success).toEqual(true);
  expect(result.totalMergeCount).toEqual(0);

  result = tournamentEngine.modifyCourtAvailability({
    dateAvailability: [
      { date: d220202, startTime: '08:30', endTime: '20:00' },
      { date: d220202, startTime: '08:00', endTime: '09:00' },
    ],
    courtId,
  });
  expect(result.success).toEqual(true);
  expect(result.totalMergeCount).toEqual(1);

  courts = tournamentEngine.getCourts().courts;
  const court = courts.find((court) => court.courtId === courtId);

  // overlapping dateAvailability has been merged
  expect(court.dateAvailability).toEqual([{ date: d220202, startTime: '08:00', endTime: '20:00' }]);

  const { rounds } = tournamentEngine.getRounds();
  const matchUps = rounds.flatMap((round) => round.matchUps);
  expect(matchUps.length).toEqual(7);

  const schedulingProfile = [{ scheduleDate: startDate, venues: [{ venueId, rounds }] }];

  result = tournamentEngine.setSchedulingProfile({ schedulingProfile });
  expect(result.success).toEqual(true);

  result = tournamentEngine.scheduleProfileRounds({
    periodLength: 30,
  });
  expect(Object.keys(result.matchUpScheduleTimes).length).toEqual(matchUps.length);

  expect(Object.values(result.matchUpScheduleTimes)).toEqual([
    '09:00', // QF
    '09:00', // QF
    '10:30', // QF
    '11:00', // QF
    '12:00', // SF
    '14:00', // SF
    '15:30', // F
  ]);

  result = tournamentEngine.scheduleProfileRounds({
    clearScheduleDates: true,
    periodLength: 15,
  });
  expect(Object.values(result.matchUpScheduleTimes)).toEqual([
    '09:00',
    '09:00',
    '10:00',
    '10:45',
    '11:30',
    '14:00',
    '15:45',
  ]);

  result = tournamentEngine.scheduleProfileRounds({
    clearScheduleDates: true,
    periodLength: 10,
  });
  expect(Object.values(result.matchUpScheduleTimes)).toEqual([
    '09:00',
    '09:00',
    '10:00',
    '10:40',
    '11:30',
    '14:00',
    '15:40',
  ]);

  result = tournamentEngine.scheduleProfileRounds({
    clearScheduleDates: true,
    periodLength: 5,
  });
  expect(Object.values(result.matchUpScheduleTimes)).toEqual([
    '09:00',
    '09:00',
    '09:50',
    '10:35',
    '11:20',
    '14:00',
    '15:30',
  ]);
});

it('returns MISSING_COURT_ID when courtId is missing', () => {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 1 }],
    setState: true,
  });

  const result = tournamentEngine.modifyCourtAvailability({
    dateAvailability: [{ date: d210102, startTime: '09:00', endTime: '17:00' }],
  });
  expect(result.error).toEqual(MISSING_COURT_ID);
});

it('returns error for invalid dateAvailability', () => {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 1 }],
    setState: true,
  });
  const { courts } = tournamentEngine.getCourts();
  const courtId = courts[0].courtId;

  const result = tournamentEngine.modifyCourtAvailability({
    dateAvailability: [{ date: 'bad-date', startTime: '09:00', endTime: '17:00' }],
    courtId,
  });
  expect(result.error).toEqual(INVALID_DATE);
});

it('returns COURT_NOT_FOUND for non-existent courtId', () => {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 1 }],
    setState: true,
  });

  const result = tournamentEngine.modifyCourtAvailability({
    dateAvailability: [{ date: d210102, startTime: '09:00', endTime: '17:00' }],
    courtId: 'non-existent-court-id',
  });
  expect(result.error).toEqual(COURT_NOT_FOUND);
});

it('supports disableNotice to suppress MODIFY_VENUE notice', () => {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 1 }],
    setState: true,
  });
  const { courts } = tournamentEngine.getCourts();
  const courtId = courts[0].courtId;

  const result = tournamentEngine.modifyCourtAvailability({
    dateAvailability: [{ date: d210102, startTime: '09:00', endTime: '17:00' }],
    disableNotice: true,
    courtId,
  });
  expect(result.success).toEqual(true);
});

it('merges overlapping availability with bookings', () => {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 1 }],
    setState: true,
  });
  const { courts } = tournamentEngine.getCourts();
  const courtId = courts[0].courtId;

  // Two overlapping entries on the same date, both with bookings
  const result = tournamentEngine.modifyCourtAvailability({
    dateAvailability: [
      {
        date: d210102,
        startTime: '08:00',
        endTime: '12:00',
        bookings: [{ startTime: '08:00', endTime: '09:00', bookingType: 'PRACTICE' }],
      },
      {
        date: d210102,
        startTime: '10:00',
        endTime: '17:00',
        bookings: [{ startTime: '14:00', endTime: '15:00', bookingType: 'MAINTENANCE' }],
      },
    ],
    courtId,
  });
  expect(result.success).toEqual(true);
  expect(result.totalMergeCount).toEqual(1);

  const updatedCourts = tournamentEngine.getCourts().courts;
  const court = updatedCourts.find((c) => c.courtId === courtId);
  // Should be merged into one availability block
  expect(court.dateAvailability.length).toEqual(1);
  expect(court.dateAvailability[0].startTime).toEqual('08:00');
  expect(court.dateAvailability[0].endTime).toEqual('17:00');
  // Bookings should be combined
  expect(court.dateAvailability[0].bookings).toBeDefined();
});

it('merges overlapping availability where only the second entry has bookings', () => {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 1 }],
    setState: true,
  });
  const { courts } = tournamentEngine.getCourts();
  const courtId = courts[0].courtId;

  // First entry has no bookings, second entry has bookings — tests the else branch (lastBookings is falsy)
  const result = tournamentEngine.modifyCourtAvailability({
    dateAvailability: [
      {
        date: d210102,
        startTime: '08:00',
        endTime: '12:00',
      },
      {
        date: d210102,
        startTime: '10:00',
        endTime: '17:00',
        bookings: [{ startTime: '14:00', endTime: '15:00', bookingType: 'MAINTENANCE' }],
      },
    ],
    courtId,
  });
  expect(result.success).toEqual(true);
  expect(result.totalMergeCount).toEqual(1);

  const updatedCourts = tournamentEngine.getCourts().courts;
  const court = updatedCourts.find((c) => c.courtId === courtId);
  expect(court.dateAvailability.length).toEqual(1);
  expect(court.dateAvailability[0].startTime).toEqual('08:00');
  expect(court.dateAvailability[0].endTime).toEqual('17:00');
  expect(court.dateAvailability[0].bookings).toBeDefined();
});

it('does not merge non-overlapping availability and preserves bookings on each', () => {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 1 }],
    setState: true,
  });
  const { courts } = tournamentEngine.getCourts();
  const courtId = courts[0].courtId;

  // Two non-overlapping entries with bookings on the first — tests the gap branch with lastBookings
  const result = tournamentEngine.modifyCourtAvailability({
    dateAvailability: [
      {
        date: d210102,
        startTime: '08:00',
        endTime: '10:00',
        bookings: [{ startTime: '08:00', endTime: '09:00', bookingType: 'PRACTICE' }],
      },
      {
        date: d210102,
        startTime: '12:00',
        endTime: '17:00',
      },
    ],
    courtId,
  });
  expect(result.success).toEqual(true);
  expect(result.totalMergeCount).toEqual(0);

  const updatedCourts = tournamentEngine.getCourts().courts;
  const court = updatedCourts.find((c) => c.courtId === courtId);
  expect(court.dateAvailability.length).toEqual(2);
  expect(court.dateAvailability[0].bookings.length).toEqual(1);
});

it('handles merging when overlapping entries have no bookings', () => {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 1 }],
    setState: true,
  });
  const { courts } = tournamentEngine.getCourts();
  const courtId = courts[0].courtId;

  // Two overlapping entries, neither with bookings — tests the !bookings path in merge
  const result = tournamentEngine.modifyCourtAvailability({
    dateAvailability: [
      { date: d210102, startTime: '08:00', endTime: '12:00' },
      { date: d210102, startTime: '10:00', endTime: '17:00' },
    ],
    courtId,
  });
  expect(result.success).toEqual(true);
  expect(result.totalMergeCount).toEqual(1);

  const updatedCourts = tournamentEngine.getCourts().courts;
  const court = updatedCourts.find((c) => c.courtId === courtId);
  expect(court.dateAvailability.length).toEqual(1);
  expect(court.dateAvailability[0].startTime).toEqual('08:00');
  expect(court.dateAvailability[0].endTime).toEqual('17:00');
  expect(court.dateAvailability[0].bookings).toBeUndefined();
});

it('handles force flag with scheduled court matchUps', () => {
  const startDate = '2023-01-01';
  const endDate = '2023-01-06';

  const venueProfiles = [
    {
      dateAvailability: [{ date: startDate, startTime: '07:00', endTime: '19:00' }],
      venueName: 'venue 1',
      courtsCount: 3,
      venueId: 'v1',
    },
  ];
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
    venueProfiles,
    startDate,
    endDate,
  });

  // Schedule some matchUps
  const { rounds } = tournamentEngine.getRounds();
  const schedulingProfile = [{ scheduleDate: startDate, venues: [{ venueId: 'v1', rounds }] }];
  tournamentEngine.setSchedulingProfile({ schedulingProfile });
  tournamentEngine.scheduleProfileRounds({ periodLength: 30 });

  const { courts } = tournamentEngine.getCourts();
  const courtId = courts[0].courtId;

  // Now modify the court availability with force flag — should succeed even with scheduled matchUps
  const result = tournamentEngine.modifyCourtAvailability({
    dateAvailability: [{ date: startDate, startTime: '10:00', endTime: '15:00' }],
    force: true,
    courtId,
  });
  expect(result.success).toEqual(true);

  const updatedCourts = tournamentEngine.getCourts().courts;
  const court = updatedCourts.find((c) => c.courtId === courtId);
  expect(court.dateAvailability).toEqual([{ date: startDate, startTime: '10:00', endTime: '15:00' }]);
});
