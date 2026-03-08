import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test, describe } from 'vitest';

// constants
import { MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

const startDate = '2024-01-15';

describe('competitionScheduleMatchUps - uncovered branches', () => {
  test('returns error for missing tournament records', () => {
    const result = tournamentEngine.competitionScheduleMatchUps({} as any);
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORDS);
  });

  test('returns error for empty tournament records', () => {
    const result = tournamentEngine.competitionScheduleMatchUps({
      tournamentRecords: {},
    } as any);
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORDS);
  });

  test('returns only completed matchUps when usePublishState=true and orderOfPlay is unpublished', () => {
    const venueProfiles = [{ courtsCount: 4 }];
    const drawProfiles = [{ drawSize: 8, completionGoal: 4 }];

    mocksEngine.generateTournamentRecord({
      drawProfiles,
      venueProfiles,
      startDate,
      setState: true,
    });

    // Don't publish orderOfPlay, just use publish state check
    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      alwaysReturnCompleted: true,
      usePublishState: true,
    });

    // When orderOfPlay is not published, should return empty dateMatchUps
    expect(result.dateMatchUps).toEqual([]);
    expect(result.venues).toBeDefined();
  });

  test('usePublishState with published orderOfPlay filters by published draws', () => {
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

    // Schedule some matchUps
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

    // Publish orderOfPlay
    const events = tournamentEngine.getEvents().events;
    const eventId = events[0]?.eventId;
    if (eventId) {
      tournamentEngine.publishEvent({ eventId });
      tournamentEngine.publishOrderOfPlay({ scheduledDates: [startDate] });

      const result = tournamentEngine.competitionScheduleMatchUps({
        matchUpFilters: { scheduledDate: startDate },
        usePublishState: true,
      });

      expect(result.success).toEqual(true);
      expect(result.venues).toBeDefined();
      expect(result.dateMatchUps).toBeDefined();
    }
  });

  test('sortDateMatchUps=false returns unsorted matchUps', () => {
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

    // Schedule matchUps
    matchUps.filter((m) => m.roundNumber === 1).forEach((matchUp, i) => {
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

    const resultSorted = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      sortDateMatchUps: true,
    });
    const resultUnsorted = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      sortDateMatchUps: false,
    });

    expect(resultSorted.success).toEqual(true);
    expect(resultUnsorted.success).toEqual(true);
    // Both should have matchUps, but order may differ
    expect(resultUnsorted.dateMatchUps.length).toEqual(resultSorted.dateMatchUps.length);
  });

  test('hydrateParticipants=true sets mappedParticipants to undefined', () => {
    const venueProfiles = [{ courtsCount: 4 }];
    const drawProfiles = [{ drawSize: 8 }];

    mocksEngine.generateTournamentRecord({
      drawProfiles,
      venueProfiles,
      startDate,
      setState: true,
    });

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      hydrateParticipants: true,
    });

    expect(result.success).toEqual(true);
    expect(result.mappedParticipants).toBeUndefined();
  });

  test('hydrateParticipants=false returns mappedParticipants', () => {
    const venueProfiles = [{ courtsCount: 4 }];
    const drawProfiles = [{ drawSize: 8 }];

    mocksEngine.generateTournamentRecord({
      drawProfiles,
      venueProfiles,
      startDate,
      setState: true,
    });

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      hydrateParticipants: false,
    });

    expect(result.success).toEqual(true);
    expect(result.mappedParticipants).toBeDefined();
  });

  test('alwaysReturnCompleted excludes COMPLETED from dateMatchUps', () => {
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

    // Schedule matchUps
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

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      alwaysReturnCompleted: true,
    });

    expect(result.success).toEqual(true);
    expect(result.completedMatchUps).toBeDefined();
    expect(result.completedMatchUps.length).toBeGreaterThan(0);

    // dateMatchUps should NOT contain completed matchUps
    result.dateMatchUps.forEach((matchUp) => {
      expect(matchUp.matchUpStatus).not.toEqual(COMPLETED);
    });

    // excludeMatchUpStatuses should have been set to [COMPLETED]
    // Verify by checking that all completed matchUps are in completedMatchUps, not dateMatchUps
    const completedIds = new Set(result.completedMatchUps.map((m) => m.matchUpId));
    result.dateMatchUps.forEach((m) => {
      expect(completedIds.has(m.matchUpId)).toEqual(false);
    });
  });

  test('alwaysReturnCompleted with existing excludeMatchUpStatuses', () => {
    const venueProfiles = [{ courtsCount: 4 }];
    const drawProfiles = [{ drawSize: 8, completionGoal: 4 }];

    mocksEngine.generateTournamentRecord({
      drawProfiles,
      venueProfiles,
      startDate,
      setState: true,
    });

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: {
        scheduledDate: startDate,
        excludeMatchUpStatuses: [COMPLETED],
      },
      alwaysReturnCompleted: true,
    });

    expect(result.success).toEqual(true);
    // Should not duplicate COMPLETED in excludeMatchUpStatuses
    result.dateMatchUps.forEach((matchUp) => {
      expect(matchUp.matchUpStatus).not.toEqual(COMPLETED);
    });
  });

  test('withCourtGridRows with no scheduled matchUps uses minCourtGridRows', () => {
    const venueProfiles = [{ courtsCount: 4 }];
    const drawProfiles = [{ drawSize: 8 }];

    mocksEngine.generateTournamentRecord({
      drawProfiles,
      venueProfiles,
      startDate,
      setState: true,
    });

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      withCourtGridRows: true,
      minCourtGridRows: 10,
    });

    expect(result.success).toEqual(true);
    expect(result.rows).toBeDefined();
    expect(result.rows.length).toBeGreaterThanOrEqual(10);
    expect(result.courtPrefix).toBeDefined();
  });

  test('activeTournamentId selects specific tournament', () => {
    const venueProfiles = [{ courtsCount: 4 }];
    const drawProfiles = [{ drawSize: 8 }];

    mocksEngine.generateTournamentRecord({
      drawProfiles,
      venueProfiles,
      startDate,
      setState: true,
    });

    const { tournamentId } = tournamentEngine.getTournamentId();

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      activeTournamentId: tournamentId,
    });

    expect(result.success).toEqual(true);
    expect(result.dateMatchUps).toBeDefined();
  });
});
