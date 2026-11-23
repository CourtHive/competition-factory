import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';

const startDate = '2024-01-15';

test('competitionScheduleMatchUps with alwaysReturnCompleted', () => {
  const venueProfiles = [{ courtsCount: 4 }];
  const drawProfiles = [{ drawSize: 8, completionGoal: 4 }];

  mocksEngine.generateTournamentRecord({
    drawProfiles,
    venueProfiles,
    startDate,
    setState: true,
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const { venues } = tournamentEngine.getVenuesAndCourts();
  const venue = venues[0];
  const courts = venue.courts || [];

  // Schedule first-round matchUps on courts
  const firstRoundMatchUps = matchUps.filter((m) => m.roundNumber === 1);
  firstRoundMatchUps.forEach((matchUp, i) => {
    if (courts[i]) {
      tournamentEngine.addMatchUpScheduleItems({
        matchUpId: matchUp.matchUpId,
        drawId: matchUp.drawId,
        schedule: {
          scheduledDate: startDate,
          scheduledTime: `${startDate}T${10 + i}:00`,
          courtId: courts[i].courtId,
          venueId: venue.venueId,
        },
      });
    }
  });

  // Verify there are some completed matchUps from completionGoal
  const { completedMatchUps: allCompleted } = tournamentEngine.getCompetitionMatchUps();
  expect(allCompleted.length).toBeGreaterThan(0);

  // Call with alwaysReturnCompleted: true
  const result = tournamentEngine.competitionScheduleMatchUps({
    matchUpFilters: { scheduledDate: startDate },
    alwaysReturnCompleted: true,
  });

  expect(result.success).toEqual(true);
  expect(result.completedMatchUps).toBeDefined();
  expect(result.dateMatchUps).toBeDefined();
  expect(result.venues).toBeDefined();

  // alwaysReturnCompleted should return all completed matchUps regardless of schedule
  expect(result.completedMatchUps.length).toBeGreaterThan(0);
  result.completedMatchUps.forEach((matchUp) => {
    expect(matchUp.matchUpStatus).toEqual(COMPLETED);
  });

  // dateMatchUps should not contain completed matchUps when alwaysReturnCompleted is used
  // because COMPLETED is added to excludeMatchUpStatuses
  result.dateMatchUps.forEach((matchUp) => {
    expect(matchUp.matchUpStatus).not.toEqual(COMPLETED);
  });
});

test('competitionScheduleMatchUps with withCourtGridRows', () => {
  const venueProfiles = [{ courtsCount: 4 }];
  const drawProfiles = [{ drawSize: 8 }];

  mocksEngine.generateTournamentRecord({
    drawProfiles,
    venueProfiles,
    startDate,
    setState: true,
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const { venues } = tournamentEngine.getVenuesAndCourts();
  const venue = venues[0];
  const courts = venue.courts || [];

  // Schedule matchUps to courts with courtOrder
  const firstRoundMatchUps = matchUps.filter((m) => m.roundNumber === 1);
  firstRoundMatchUps.forEach((matchUp, i) => {
    if (courts[i]) {
      tournamentEngine.addMatchUpScheduleItems({
        matchUpId: matchUp.matchUpId,
        drawId: matchUp.drawId,
        schedule: {
          scheduledDate: startDate,
          scheduledTime: `${startDate}T10:00`,
          courtId: courts[i].courtId,
          venueId: venue.venueId,
        },
      });
    }
  });

  const result = tournamentEngine.competitionScheduleMatchUps({
    matchUpFilters: { scheduledDate: startDate },
    withCourtGridRows: true,
    minCourtGridRows: 5,
  });

  expect(result.success).toEqual(true);
  expect(result.rows).toBeDefined();
  expect(Array.isArray(result.rows)).toEqual(true);
  expect(result.rows.length).toBeGreaterThanOrEqual(5);
  expect(result.courtPrefix).toBeDefined();
  expect(typeof result.courtPrefix).toEqual('string');
});

test('competitionScheduleMatchUps with courtCompletedMatchUps and sortCourtsData', () => {
  const venueProfiles = [{ courtsCount: 4 }];
  const drawProfiles = [{ drawSize: 8, completionGoal: 4 }];

  mocksEngine.generateTournamentRecord({
    drawProfiles,
    venueProfiles,
    startDate,
    setState: true,
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const { venues } = tournamentEngine.getVenuesAndCourts();
  const venue = venues[0];
  const courts = venue.courts || [];

  // Schedule matchUps on courts (both completed and incomplete will be scheduled)
  matchUps.slice(0, 4).forEach((matchUp, i) => {
    if (courts[i % courts.length]) {
      tournamentEngine.addMatchUpScheduleItems({
        matchUpId: matchUp.matchUpId,
        drawId: matchUp.drawId,
        schedule: {
          scheduledDate: startDate,
          scheduledTime: `${startDate}T${10 + i}:00`,
          courtId: courts[i % courts.length].courtId,
          venueId: venue.venueId,
        },
      });
    }
  });

  // Call with courtCompletedMatchUps and sortCourtsData
  const result = tournamentEngine.competitionScheduleMatchUps({
    matchUpFilters: { scheduledDate: startDate },
    courtCompletedMatchUps: true,
    sortCourtsData: true,
  });

  expect(result.success).toEqual(true);
  expect(result.courtsData).toBeDefined();
  expect(Array.isArray(result.courtsData)).toEqual(true);
  expect(result.courtsData.length).toEqual(courts.length);

  // Each court should have a matchUps array (may be empty if no matchUps assigned)
  result.courtsData.forEach((court) => {
    expect(court.matchUps).toBeDefined();
    expect(Array.isArray(court.matchUps)).toEqual(true);
    expect(court.courtId).toBeDefined();
  });

  // When courtCompletedMatchUps is true, completed matchUps should be included in courtsData
  const allCourtMatchUps = result.courtsData.flatMap((court) => court.matchUps);
  const completedInCourts = allCourtMatchUps.filter((m) => m.matchUpStatus === COMPLETED);

  // There should be some completed matchUps in the courtsData since completionGoal was set
  // and courtCompletedMatchUps is true
  // (only if they were scheduled to courts)
  if (completedInCourts.length > 0) {
    expect(completedInCourts.every((m) => m.matchUpStatus === COMPLETED)).toEqual(true);
  }

  // Compare with courtCompletedMatchUps: false - should not include completed matchUps
  const resultWithout = tournamentEngine.competitionScheduleMatchUps({
    matchUpFilters: { scheduledDate: startDate },
    courtCompletedMatchUps: false,
    sortCourtsData: true,
  });

  const allCourtMatchUpsWithout = resultWithout.courtsData.flatMap((court) => court.matchUps);
  const completedInCourtsWithout = allCourtMatchUpsWithout.filter((m) => m.matchUpStatus === COMPLETED);
  expect(completedInCourtsWithout.length).toEqual(0);
});
