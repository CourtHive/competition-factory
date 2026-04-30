import mocksEngine from '@Assemblies/engines/mock';
import competitionEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { COMPASS, FEED_IN_CHAMPIONSHIP, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { COURT_ORDER } from '@Constants/timeItemConstants';

it('can bulkSchedule matchUps using matchUpDetails', () => {
  const venueId = 'cc-venue-id';
  const venueProfiles = [
    {
      venueName: 'Club Courts',
      venueAbbreviation: 'CC',
      idPrefix: 'cc-court',
      startTime: '08:00',
      endTime: '20:00',
      courtsCount: 6,
      venueId,
    },
  ];

  const startDate = '2023-06-06';
  const endDate = '2023-06-08';
  const scheduledDate = startDate;

  const tournamentRecord1 = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, drawType: COMPASS }],
    venueProfiles,
    startDate,
    endDate,
  }).tournamentRecord;
  const tournamentRecord2 = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, drawType: FEED_IN_CHAMPIONSHIP }],
    venueProfiles,
    startDate,
    endDate,
  }).tournamentRecord;

  let result = competitionEngine.setState([tournamentRecord1, tournamentRecord2]);

  expect(result.success).toEqual(true);

  const matchUps = competitionEngine.allCompetitionMatchUps().matchUps;
  const scheduleTimes = ['08:00', '09:00', '10:00', '11:00', '12:00'];

  const matchUpDetails = matchUps.map(({ tournamentId, drawId, matchUpId }, i) => ({
    schedule: {
      scheduledTime: scheduleTimes[i % 4],
      courtOrder: (i % 4) + 1,
      scheduledDate,
      venueId,
    },
    tournamentId,
    matchUpId,
    drawId,
  }));

  result = competitionEngine.bulkScheduleMatchUps({ matchUpDetails });
  expect(result.success).toEqual(true);
  expect(result.scheduled).toEqual(matchUps.length);
});

it('clears SCHEDULE.COURT.ORDER when bulkScheduleMatchUps receives courtOrder: "" with removePriorValues', () => {
  // Regression: empty-string sentinel for courtOrder must remove the COURT_ORDER
  // timeItem the same way other dimensions (scheduledDate, scheduledTime, courtId,
  // venueId) do. Previously a stale `isConvertableInteger` gate at the dispatch site
  // silently skipped the removal, leaving orphaned COURT.ORDER timeItems that blocked
  // re-scheduling via scheduleProfileGrid (which treats any courtOrder as "placed").
  const venueId = 'cc-venue-id';
  const venueProfiles = [
    {
      venueName: 'Club Courts',
      venueAbbreviation: 'CC',
      idPrefix: 'cc-court',
      startTime: '08:00',
      endTime: '20:00',
      courtsCount: 4,
      venueId,
    },
  ];

  const startDate = '2023-06-06';
  const scheduledDate = startDate;

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }],
    venueProfiles,
    startDate,
    endDate: '2023-06-08',
  });

  competitionEngine.setState([tournamentRecord]);

  const { matchUps } = competitionEngine.allCompetitionMatchUps();
  const firstRound = matchUps.filter((m) => m.roundNumber === 1);

  // Place each first-round matchUp with a courtOrder.
  const placeResult = competitionEngine.bulkScheduleMatchUps({
    matchUpIds: firstRound.map((m) => m.matchUpId),
    schedule: { scheduledDate, scheduledTime: '08:00', courtOrder: 1 },
  });
  expect(placeResult.success).toEqual(true);

  const placed = competitionEngine
    .allCompetitionMatchUps()
    .matchUps.filter((m) => firstRound.some((f) => f.matchUpId === m.matchUpId));
  for (const m of placed) {
    expect(m.schedule?.courtOrder).toEqual(1);
  }

  // Now clear with the empty-string sentinel — the shape Schedule2 sends.
  const clearResult = competitionEngine.bulkScheduleMatchUps({
    matchUpIds: firstRound.map((m) => m.matchUpId),
    schedule: { scheduledDate: '', scheduledTime: '', courtOrder: '', courtId: '', venueId: '' },
    removePriorValues: true,
  });
  expect(clearResult.success).toEqual(true);

  const cleared = competitionEngine
    .allCompetitionMatchUps()
    .matchUps.filter((m) => firstRound.some((f) => f.matchUpId === m.matchUpId));
  for (const m of cleared) {
    expect(m.schedule?.courtOrder).toBeUndefined();
    // belt-and-braces: the underlying timeItem should also be gone, since
    // scheduleProfileGrid filters on the raw timeItem-derived schedule.courtOrder.
    const orderItems = (m.timeItems ?? []).filter((t: any) => t.itemType === COURT_ORDER);
    expect(orderItems).toEqual([]);
  }
});
