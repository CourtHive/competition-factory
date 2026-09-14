import { visualizeScheduledMatchUps } from '@Tests/testHarness/testUtilities/visualizeScheduledMatchUps';
import { extractDate, timeStringMinutes } from '@Tools/dateTime';
import { mocksEngine, competitionEngine } from '../../..';
import { hasSchedule } from '@Query/matchUp/hasSchedule';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, test } from 'vitest';

// Fixtures
import POLICY_SCHEDULING_NO_DAILY_LIMITS from '@Fixtures/policies/POLICY_SCHEDULING_NO_DAILY_LIMITS';

const showGlobalLog = false;

it('can create virtual courts with overlapping bookings', () => {
  const drawId = 'drawId';
  const venueId = 'venueId';
  const startTime = '08:00';
  const endTime = '20:00';
  const startDate = extractDate(new Date().toISOString());
  const drawProfiles = [{ idPrefix: 'm', drawId, drawSize: 32 }];
  const venueProfiles = [{ venueId, venueAbbreviation: 'VNU', courtsCount: 8, startTime, endTime }];
  const schedulingProfile = [
    {
      scheduleDate: startDate,
      venues: [
        {
          venueId,
          rounds: [
            { drawId, winnerFinishingPositionRange: '1-16' },
            { drawId, winnerFinishingPositionRange: '1-8' },
            { drawId, winnerFinishingPositionRange: '1-4' },
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
  competitionEngine.setState(tournamentRecord);

  const { matchUps } = competitionEngine.allCompetitionMatchUps();
  const scheduledMatchUps = matchUps.filter(hasSchedule);

  visualizeScheduledMatchUps({ scheduledMatchUps, showGlobalLog });

  const { bookings, dateScheduledMatchUps, relevantMatchUps } = competitionEngine.generateBookings({
    scheduleDate: startDate,
    venueIds: [venueId],
    matchUps,
  });

  const scheduledMatchUpsCount = schedulerResult.scheduledMatchUpIds[startDate].length;
  expect(dateScheduledMatchUps.length).toEqual(scheduledMatchUpsCount);
  expect(relevantMatchUps.length).toEqual(scheduledMatchUpsCount);
  expect(bookings.length).toEqual(scheduledMatchUpsCount);

  const { courts } = competitionEngine.getVenuesAndCourts({
    venueIds: [venueId],
  });

  const { virtualCourts } = competitionEngine.generateVirtualCourts({
    scheduleDate: startDate,
    periodLengh: 30,
    bookings,
    courts,
  });

  const hasOverlap = findOverlappingBooking(virtualCourts);
  expect(hasOverlap).toEqual(true);
});

test('already scheduled round matchUps', () => {
  const drawProfiles = [{ drawSize: 4 }];
  const venueProfiles = [
    { venueId: 'v1', courtsCount: 2 },
    { venueId: 'v2', courtsCount: 2 },
  ];
  const startDate = extractDate(new Date().toISOString());
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    venueProfiles,
    drawProfiles,
    startDate,
  });
  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const targetMatchUp = matchUps.find(({ roundNumber, roundPosition }) => roundNumber === 1 && roundPosition === 1);
  const { tournamentId, matchUpId, drawId, eventId, structureId } = targetMatchUp;

  let result = competitionEngine.addMatchUpScheduleItems({
    schedule: {
      scheduledDate: startDate,
      scheduledTime: '10:15',
      venueId: 'v2',
    },
    tournamentId,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = competitionEngine.addSchedulingProfileRound({
    round: { tournamentId, eventId, drawId, structureId, roundNumber: 1 },
    scheduleDate: startDate,
    venueId: 'v1',
  });
  expect(result.success).toEqual(true);

  result = competitionEngine.scheduleProfileRounds({
    scheduleDates: [startDate],
  });
  expect(result.success).toEqual(true);

  const { dateMatchUps: scheduledMatchUps } = competitionEngine.competitionScheduleMatchUps();
  visualizeScheduledMatchUps({
    showGlobalLog: false,
    scheduledMatchUps,
  });

  const venueIdsWithScheduledMatchUps = scheduledMatchUps.map(({ schedule }) => schedule?.venueId).filter(Boolean);
  expect(venueIdsWithScheduledMatchUps.length).toEqual(2);
});

function findOverlappingBooking(virtualCourts) {
  for (const virtualCourt of virtualCourts) {
    const bookings = virtualCourt.dateAvailability[0].bookings;
    for (const booking of bookings) {
      const startMinutes = timeStringMinutes(booking.startTime);
      const endMinutes = timeStringMinutes(booking.endTime);
      const overlap = bookings.some(({ startTime }) => {
        const bookingStartMinutes = timeStringMinutes(startTime);
        return bookingStartMinutes > startMinutes && bookingStartMinutes < endMinutes;
      });
      if (overlap) return true;
    }
  }
  return false;
}
