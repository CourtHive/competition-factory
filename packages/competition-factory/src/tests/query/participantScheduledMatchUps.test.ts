import { participantScheduledMatchUps } from '@Query/matchUps/participantScheduledMatchUps';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { INVALID_VALUES, MISSING_MATCHUPS } from '@Constants/errorConditionConstants';

test('returns error for invalid matchUps', () => {
  const result = participantScheduledMatchUps({ matchUps: 'invalid' as any });
  expect(result.error).toEqual(MISSING_MATCHUPS);
});

test('returns error for invalid scheduleAttributes', () => {
  const result = participantScheduledMatchUps({
    matchUps: [],
    scheduleAttributes: 'invalid' as any,
  });
  expect(result.error).toEqual(INVALID_VALUES);
});

test('returns success with empty scheduledMatchUps when no matchUps have schedules', () => {
  const result: any = participantScheduledMatchUps({ matchUps: [] });
  expect(result.success).toEqual(true);
  expect(result.scheduledMatchUps).toBeDefined();
  expect(Object.keys(result.scheduledMatchUps).length).toEqual(0);
});

test('groups and sorts matchUps by scheduled date and time', () => {
  const startDate = '2024-01-15';
  const endDate = '2024-01-20';

  const {
    drawIds: [drawId],
    venueIds: [venueId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    venueProfiles: [{ courtsCount: 4 }],
    startDate,
    endDate,
  });

  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const firstRoundMatchUps = matchUps.filter((m) => m.roundNumber === 1);

  const { venues } = tournamentEngine.getVenuesAndCourts();
  const venue = venues[0];
  const courts = venue.courts || [];

  // Schedule 4 matchUps on the same date with different times (not in order)
  const times = ['14:00', '09:00', '11:00', '10:00'];

  firstRoundMatchUps.forEach((matchUp, i) => {
    if (i < times.length && courts[i]) {
      tournamentEngine.addMatchUpScheduleItems({
        matchUpId: matchUp.matchUpId,
        drawId,
        schedule: {
          scheduledDate: startDate,
          scheduledTime: `${startDate}T${times[i]}`,
          courtId: courts[i].courtId,
          venueId,
        },
      });
    }
  });

  // Get matchUps with schedule info (inContext required for schedule population)
  const { matchUps: allMatchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
  const withSchedule = allMatchUps.filter((m) => m.schedule?.scheduledDate && m.schedule?.scheduledTime);

  expect(withSchedule.length).toEqual(4);

  const result: any = participantScheduledMatchUps({ matchUps: withSchedule });
  expect(result.success).toEqual(true);
  expect(result.scheduledMatchUps).toBeDefined();

  // Should have entries grouped by date
  const dates = Object.keys(result.scheduledMatchUps);
  expect(dates.length).toEqual(1);
  expect(dates[0]).toEqual(startDate);

  // MatchUps within each date should be sorted by time ascending
  const dateMatchUps = result.scheduledMatchUps[startDate];
  expect(dateMatchUps.length).toEqual(4);

  for (let i = 1; i < dateMatchUps.length; i++) {
    const prevTime = dateMatchUps[i - 1].schedule?.scheduledTime;
    const currTime = dateMatchUps[i].schedule?.scheduledTime;
    expect(prevTime <= currTime).toBe(true);
  }
});

test('groups matchUps across multiple dates', () => {
  const startDate = '2024-02-01';
  const endDate = '2024-02-10';

  const {
    drawIds: [drawId],
    venueIds: [venueId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    venueProfiles: [{ courtsCount: 4 }],
    startDate,
    endDate,
  });

  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const firstRoundMatchUps = matchUps.filter((m) => m.roundNumber === 1);

  const { venues } = tournamentEngine.getVenuesAndCourts();
  const venue = venues[0];
  const courts = venue.courts || [];

  const date1 = '2024-02-01';
  const date2 = '2024-02-02';

  // Schedule 2 matchUps on date1 and 2 matchUps on date2
  const schedules = [
    { date: date1, time: '10:00' },
    { date: date1, time: '08:00' },
    { date: date2, time: '15:00' },
    { date: date2, time: '12:00' },
  ];

  firstRoundMatchUps.forEach((matchUp, i) => {
    if (i < schedules.length && courts[i % courts.length]) {
      tournamentEngine.addMatchUpScheduleItems({
        matchUpId: matchUp.matchUpId,
        drawId,
        schedule: {
          scheduledDate: schedules[i].date,
          scheduledTime: `${schedules[i].date}T${schedules[i].time}`,
          courtId: courts[i % courts.length].courtId,
          venueId,
        },
      });
    }
  });

  const { matchUps: allMatchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
  const withSchedule = allMatchUps.filter((m) => m.schedule?.scheduledDate && m.schedule?.scheduledTime);

  const result: any = participantScheduledMatchUps({ matchUps: withSchedule });
  expect(result.success).toEqual(true);

  const dates = Object.keys(result.scheduledMatchUps);
  expect(dates.length).toEqual(2);
  expect(dates).toContain(date1);
  expect(dates).toContain(date2);

  // Verify sorting within date1: 08:00 should come before 10:00
  const date1MatchUps = result.scheduledMatchUps[date1];
  expect(date1MatchUps.length).toEqual(2);
  for (let i = 1; i < date1MatchUps.length; i++) {
    const prevTime = date1MatchUps[i - 1].schedule?.scheduledTime;
    const currTime = date1MatchUps[i].schedule?.scheduledTime;
    expect(prevTime <= currTime).toBe(true);
  }

  // Verify sorting within date2: 12:00 should come before 15:00
  const date2MatchUps = result.scheduledMatchUps[date2];
  expect(date2MatchUps.length).toEqual(2);
  for (let i = 1; i < date2MatchUps.length; i++) {
    const prevTime = date2MatchUps[i - 1].schedule?.scheduledTime;
    const currTime = date2MatchUps[i].schedule?.scheduledTime;
    expect(prevTime <= currTime).toBe(true);
  }
});

test('filters out matchUps without required schedule attributes', () => {
  const result: any = participantScheduledMatchUps({
    matchUps: [
      {
        matchUpId: 'test-1',
        schedule: { scheduledDate: '2024-01-15' },
      } as any,
      {
        matchUpId: 'test-2',
        schedule: {},
      } as any,
    ],
  });

  expect(result.success).toEqual(true);
  // matchUps without both scheduledDate and scheduledTime should be filtered out
  expect(Object.keys(result.scheduledMatchUps).length).toEqual(0);
});

test('works with custom scheduleAttributes', () => {
  const result: any = participantScheduledMatchUps({
    matchUps: [
      {
        matchUpId: 'test-1',
        schedule: {
          scheduledDate: '2024-01-15',
          scheduledTime: '2024-01-15T10:00',
        },
      } as any,
    ],
    scheduleAttributes: ['scheduledDate'],
  });

  expect(result.success).toEqual(true);
  // With only scheduledDate as attribute, the matchUp should pass hasSchedule
  // and extractDate + extractTime should still work from the schedule object
  const dates = Object.keys(result.scheduledMatchUps);
  expect(dates.length).toEqual(1);
});
