import { setSubscriptions } from '@Global/state/globalState';
import { addDays, extractDate } from '@Tools/dateTime';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { MODIFY_DRAW_DEFINITION, MODIFY_MATCHUP } from '@Constants/topicConstants';
import { MON } from '@Constants/weekdayConstants';
import {
  INVALID_DATE,
  INVALID_VALUES,
  MATCHUPS_COMPLETED_OUTSIDE_DATES,
  MATCHUPS_SCHEDULED_OUTSIDE_DATES,
} from '@Constants/errorConditionConstants';

it('will remove court.dateAvailabiilty items that fall outside of tournament dates', () => {
  const venueId = 'venueId';
  const venue = {
    venueName: 'City Courts',
    venueAbbreviation: 'CC',
    venueId,
    courts: [
      {
        courtName: 'Court 1',
        dateAvailability: [
          {
            startTime: '18:00',
            endTime: '22:00',
          },
          {
            date: '2022-09-24T00:00:00.000Z',
            startTime: '08:00',
            endTime: '18:00',
          },
          {
            date: '2022-09-25T00:00:00.000Z',
            startTime: '08:00',
            endTime: '18:00',
          },
          {
            date: '2022-09-26T00:00:00.000Z',
            startTime: '18:00',
            endTime: '22:00',
          },
          {
            date: '2022-09-27T00:00:00.000Z',
            startTime: '18:00',
            endTime: '22:00',
          },
          {
            date: '2022-09-28T00:00:00.000Z',
            startTime: '18:00',
            endTime: '22:00',
          },
        ],
        onlineResources: [],
      },
    ],
  };
  const startDate = '2022-09-24T00:00:00.000Z';
  const endDate = '2022-09-28T00:00:00.000Z';

  const drawSize = 2;
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize }],
    startDate,
    endDate,
  });

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);
  result = tournamentEngine.addVenue({ venue });
  expect(result.success).toEqual(true);

  result = tournamentEngine.findVenue({ venueId });
  expect(result.venue.courts[0].dateAvailability.length).toEqual(6);

  result = tournamentEngine.setTournamentDates({ startDate: '2022-09-26' });
  expect(result.datesRemoved).toEqual(['2022-09-24', '2022-09-25']);
  expect(result.success).toEqual(true);

  result = tournamentEngine.findVenue({ venueId });
  expect(result.venue.courts[0].dateAvailability.length).toEqual(4);

  result = tournamentEngine.setTournamentDates({ endDate: '2022-09-27' });
  expect(result.datesRemoved).toEqual(['2022-09-28']);
  expect(result.success).toEqual(true);

  result = tournamentEngine.findVenue({ venueId });
  expect(result.venue.courts[0].dateAvailability.length).toEqual(3);
});

it('blocks tournament date changes when matchUps are scheduled outside the new dates', () => {
  const eventId = 'eventId';
  const venueId = 'venueId';
  const drawId = 'drawId';

  const drawProfiles = [{ idPrefix: 'm', drawId, eventId, drawSize: 64 }];
  const startDate = extractDate(new Date().toISOString());
  const endDate = addDays(startDate, 2);
  const startTime = '08:00';
  const endTime = '21:00';

  const venueProfiles = [
    {
      courtNames: ['One', 'Two', 'Three'],
      courtIds: ['c1', 'c2', 'c3'],
      venueAbbreviation: 'VNU',
      venueName: 'Venue',
      courtsCount: 4,
      startTime,
      endTime,
      venueId,
    },
  ];

  const schedulingProfile = [
    {
      venues: [{ venueId, rounds: [{ drawId, roundNumber: 1 }] }],
      scheduleDate: startDate,
    },
    {
      venues: [{ venueId, rounds: [{ drawId, roundNumber: 2 }] }],
      scheduleDate: addDays(startDate, 1),
    },
    {
      venues: [
        {
          venueId,
          rounds: [
            { drawId, roundNumber: 3 },
            { drawId, roundNumber: 4 },
          ],
        },
      ],
      scheduleDate: addDays(startDate, 2),
    },
  ];
  const { schedulerResult } = mocksEngine.generateTournamentRecord({
    autoSchedule: true,
    schedulingProfile,
    setState: true,
    venueProfiles,
    drawProfiles,
    startDate,
    endDate,
  });

  expect(Object.values(schedulerResult.matchUpScheduleTimes).length).toEqual(60);

  const matchUpModifyNotices: any[] = [];
  const drawModifyNotices: any[] = [];

  const subscriptions = {
    [MODIFY_MATCHUP]: (payload) => {
      if (Array.isArray(payload)) {
        payload.forEach(({ matchUp }) => {
          matchUpModifyNotices.push(matchUp);
        });
      }
    },
    [MODIFY_DRAW_DEFINITION]: (payload) => {
      if (Array.isArray(payload)) {
        payload.forEach(({ drawDefinition }) => {
          drawModifyNotices.push(drawDefinition);
        });
      }
    },
  };

  setSubscriptions({ subscriptions });
  expect(matchUpModifyNotices.length).toEqual(0);

  // day0 has 32 matchUps (round 1), day1 has 16 (round 2), day2 has 12 (rounds 3 & 4) => 60 total
  const day0 = startDate;
  const day1 = addDays(startDate, 1);
  const day2 = addDays(startDate, 2);

  // narrowing endDate to exclude day2 matchUps is BLOCKED (not silently unscheduled)
  let result = tournamentEngine.setTournamentDates({ endDate: day1 });
  expect(result.error.code).toEqual(MATCHUPS_SCHEDULED_OUTSIDE_DATES.code);
  expect(result.outOfRangeDates).toEqual([day2]);
  expect(result.outOfRangeMatchUpIds.length).toEqual(12);

  // narrowing startDate past day0 matchUps is BLOCKED
  result = tournamentEngine.setTournamentDates({ startDate: day1 });
  expect(result.error.code).toEqual(MATCHUPS_SCHEDULED_OUTSIDE_DATES.code);
  expect(result.outOfRangeDates).toEqual([day0]);
  expect(result.outOfRangeMatchUpIds.length).toEqual(32);

  // rejected changes mutate nothing and emit no MODIFY notices
  expect(matchUpModifyNotices.length).toEqual(0);
  expect(drawModifyNotices.length).toEqual(0);
  result = tournamentEngine.getTournamentInfo();
  expect(result.tournamentInfo.startDate).toEqual(day0);
  expect(result.tournamentInfo.endDate).toEqual(day2);

  // matchUps remain scheduled — no silent data loss
  const stillScheduled = tournamentEngine.allTournamentMatchUps().matchUps.filter((m) => m.schedule?.scheduledDate);
  expect(stillScheduled.length).toEqual(60);

  // widening the range is allowed — nothing falls outside the new range
  result = tournamentEngine.setTournamentDates({ endDate: addDays(startDate, 5) });
  expect(result.success).toEqual(true);
  expect(result.datesAdded.length).toEqual(3);
  expect(tournamentEngine.getTournamentInfo().tournamentInfo.endDate).toEqual(addDays(startDate, 5));
});

it('force: true unschedules matchUps outside the new dates instead of blocking', () => {
  const drawId = 'drawId';
  const eventId = 'eventId';
  const startDate = '2026-06-01';
  const endDate = addDays(startDate, 2);

  const venueProfiles = [
    {
      courtNames: ['One', 'Two', 'Three'],
      courtIds: ['c1', 'c2', 'c3'],
      venueAbbreviation: 'VNU',
      venueName: 'Venue',
      courtsCount: 4,
      startTime: '08:00',
      endTime: '21:00',
      venueId: 'venueId',
    },
  ];
  const schedulingProfile = [
    { venues: [{ venueId: 'venueId', rounds: [{ drawId, roundNumber: 1 }] }], scheduleDate: startDate },
    { venues: [{ venueId: 'venueId', rounds: [{ drawId, roundNumber: 2 }] }], scheduleDate: addDays(startDate, 1) },
  ];
  mocksEngine.generateTournamentRecord({
    autoSchedule: true,
    schedulingProfile,
    setState: true,
    venueProfiles,
    drawProfiles: [{ idPrefix: 'm', drawId, eventId, drawSize: 32 }],
    startDate,
    endDate,
  });

  const day1 = addDays(startDate, 1);

  // without force => blocked
  let result = tournamentEngine.setTournamentDates({ startDate: day1 });
  expect(result.error.code).toEqual(MATCHUPS_SCHEDULED_OUTSIDE_DATES.code);

  const day0Count = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.filter((m) => m.schedule?.scheduledDate === startDate).length;
  expect(day0Count).toBeGreaterThan(0);

  // with force => date change proceeds and the day0 matchUps are unscheduled
  result = tournamentEngine.setTournamentDates({ startDate: day1, force: true });
  expect(result.success).toEqual(true);
  expect(result.unscheduledMatchUpIds.length).toEqual(day0Count);
  expect(tournamentEngine.getTournamentInfo().tournamentInfo.startDate).toEqual(day1);

  const stillOnDay0 = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.filter((m) => m.schedule?.scheduledDate === startDate);
  expect(stillOnDay0.length).toEqual(0);
});

it('hard-blocks a date change when a COMPLETED matchUp was played outside the new range (even with force)', () => {
  // Regression: a completed matchUp scheduled outside the new range is detected by
  // findMatchUpsScheduledOutsideDates but was skipped by clearScheduledMatchUps (which
  // ignores completedMatchUpStatuses), so force: true returned a misleading
  // SCHEDULE_NOT_CLEARED. A match played on a date forces that date into the tournament
  // range, so this must be an explicit, non-forceable block.
  const drawId = 'drawId';
  const startDate = '2026-06-22';
  const endDate = addDays(startDate, 6);
  const venueProfiles = [
    { courtsCount: 4, startTime: '08:00', endTime: '21:00', venueName: 'Venue', venueId: 'venueId' },
  ];
  mocksEngine.generateTournamentRecord({
    setState: true,
    venueProfiles,
    drawProfiles: [{ drawId, drawSize: 32 }],
    startDate,
    endDate,
  });

  const courts = tournamentEngine.getVenuesAndCourts().courts;
  const target = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.find((m) => m.roundNumber === 1 && m.sides?.every((s) => s.participant));

  tournamentEngine.addMatchUpScheduleItems({
    drawId,
    matchUpId: target.matchUpId,
    schedule: { scheduledDate: startDate, scheduledTime: '10:00', venueId: 'venueId', courtId: courts[2].courtId },
  });
  const completed = tournamentEngine.setMatchUpStatus({
    drawId,
    matchUpId: target.matchUpId,
    matchUpStatus: 'COMPLETED',
    outcome: { winningSide: 1, scoreString: '6-3 6-2' },
  });
  expect(completed.success).toEqual(true);

  const nextDay = addDays(startDate, 1);

  // force: true must NOT return SCHEDULE_NOT_CLEARED — it returns the explicit completed block
  const result = tournamentEngine.setTournamentDates({ startDate: nextDay, force: true });
  expect(result.success).toBeUndefined();
  expect(result.error.code).toEqual(MATCHUPS_COMPLETED_OUTSIDE_DATES.code);
  expect(result.completedOutOfRangeDates).toEqual([startDate]);
  expect(result.completedOutOfRangeMatchUpIds).toEqual([target.matchUpId]);

  // the date change was rejected and the completed matchUp keeps its schedule + result
  expect(tournamentEngine.getTournamentInfo().tournamentInfo.startDate).toEqual(startDate);
  const after = tournamentEngine.allTournamentMatchUps().matchUps.find((m) => m.matchUpId === target.matchUpId);
  expect(after.schedule?.scheduledDate).toEqual(startDate);
  expect(after.winningSide).toEqual(1);
});

it('can set activeDates for a tournament', () => {
  const startDate = '2024-05-01';
  const endDate = addDays(startDate, 6);
  mocksEngine.generateTournamentRecord({ startDate, endDate, setState: true });

  // first date is before startDate
  let activeDates = [addDays(startDate, -1), addDays(startDate, 2), addDays(startDate, 4)];
  let result = tournamentEngine.setTournamentDates({ activeDates });
  expect(result.error).toEqual(INVALID_DATE);

  // last date is after endDate
  activeDates = [startDate, addDays(startDate, 2), addDays(startDate, 7)];
  result = tournamentEngine.setTournamentDates({ activeDates });
  expect(result.error).toEqual(INVALID_DATE);

  activeDates = [startDate, addDays(startDate, 2), addDays(startDate, 4)];
  result = tournamentEngine.setTournamentDates({ activeDates });
  expect(result.success).toEqual(true);
});

it('can set weekdays for a tournament', () => {
  mocksEngine.generateTournamentRecord({ setState: true });
  let result = tournamentEngine.setTournamentDates({ weekdays: true });
  expect(result.error).toEqual(INVALID_VALUES);
  result = tournamentEngine.setTournamentDates({ weekdays: ['Invalid'] });
  expect(result.error).toEqual(INVALID_VALUES);
  result = tournamentEngine.setTournamentDates({ weekdays: [MON, MON] }); // duplicate values
  expect(result.error).toEqual(INVALID_VALUES);
  result = tournamentEngine.setTournamentDates({ weekdays: [MON] });
  expect(result.success).toEqual(true);
});
