import { addDays, generateDateRange } from '@Tools/dateTime';
import { chunkArray, intersection } from '@Tools/arrays';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { xa } from '@Tools/extractAttributes';
import { expect, it } from 'vitest';

/// Constants
import { BYE } from '@Constants/matchUpStatusConstants';

it('supports pro-scheduling', () => {
  const startDate = '2023-11-28';
  const endDate = addDays(startDate, 3);

  const {
    venueIds: [venueId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, participantsCount: 28 }],
    venueProfiles: [{ courtsCount: 6 }],
    startDate,
    endDate,
  });

  tournamentEngine.setState(tournamentRecord);

  expect(tournamentRecord.venues[0].courts[0].dateAvailability[0].startTime).toEqual('07:00');

  const tournamentDateRange = generateDateRange(startDate, endDate);
  const { rounds } = tournamentEngine.getRounds();
  const roundChunks = chunkArray(rounds, 2);

  expect(rounds[0].unscheduledCount).toEqual(12);
  expect(rounds[0].matchUps.length).toEqual(16);
  expect(rounds[0].byeCount).toEqual(4);

  const byeMatchUps = rounds[0].matchUps.filter(({ matchUpStatus }) => matchUpStatus === BYE);
  const matchUpContextIds = byeMatchUps.map(({ tournamentId, drawId, matchUpId }) => ({
    tournamentId,
    matchUpId,
    drawId,
  }));
  const byeMatchUpIds = byeMatchUps.map(xa('matchUpId'));

  const schedule = {
    scheduledDate: startDate,
    scheduledTime: '08:00',
    venueId,
  };
  let result = tournamentEngine.bulkScheduleMatchUps({
    matchUpContextIds,
    schedule,
  });
  expect(result.success).toEqual(true);
  expect(result.scheduled).toEqual(0);

  result = tournamentEngine.bulkScheduleMatchUps({
    scheduleByeMatchUps: true,
    matchUpContextIds,
    schedule,
  });
  expect(result.success).toEqual(true);
  expect(result.scheduled).toEqual(4);

  const schedulingProfile = roundChunks.slice(0, 1).map((chunk, i) => ({
    scheduleDate: tournamentDateRange[i],
    venues: [{ venueId, rounds: chunk }],
  }));
  expect(schedulingProfile[0].venues[0].rounds.length).toEqual(2);

  result = tournamentEngine.setSchedulingProfile({ schedulingProfile });
  expect(result.success).toEqual(true);

  result = tournamentEngine.scheduleProfileRounds({ pro: true });
  expect(result.success).toEqual(true);

  const overlap = intersection(result.scheduledMatchUpIds[startDate], byeMatchUpIds).length;
  expect(overlap).toEqual(0);

  const byeMatchUpSchedules = tournamentEngine
    .allTournamentMatchUps({ matchUpFilters: { matchUpIds: byeMatchUpIds } })
    .matchUps.map(xa('schedule'));

  // byes are ignored by pro-scheduling: none carry a real scheduledTime/venue/court in either
  // writeMode (LEGACY hydrates an empty `{ milliseconds: 0, time: '00:00:00' }`, NATIVE leaves `{}`)
  expect(byeMatchUpSchedules.length).toEqual(4);
  byeMatchUpSchedules.forEach((schedule) => {
    expect(schedule?.scheduledTime).toBeUndefined();
    expect(schedule?.venueId).toBeUndefined();
    expect(schedule?.courtId).toBeUndefined();
  });
});
