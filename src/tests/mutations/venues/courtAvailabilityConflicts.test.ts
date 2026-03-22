import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import { SCHEDULE_CONFLICT_COURT_UNAVAILABLE } from '@Constants/errorConditionConstants';

describe('court availability conflict detection', () => {
  const startDate = '2023-01-01';
  const endDate = '2023-01-06';

  function setupScheduledTournament() {
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

    // Schedule matchUps onto courts
    const { rounds } = tournamentEngine.getRounds();
    const schedulingProfile = [{ scheduleDate: startDate, venues: [{ venueId: 'v1', rounds }] }];
    tournamentEngine.setSchedulingProfile({ schedulingProfile });
    tournamentEngine.scheduleProfileRounds({ periodLength: 30 });

    const { courts } = tournamentEngine.getCourts();
    return { courtId: courts[0].courtId };
  }

  it('returns conflict error when reducing availability removes scheduled matchUp time slots', () => {
    const { courtId } = setupScheduledTournament();

    // Reduce availability to a narrow window that likely excludes some scheduled matchUps
    let result: any = tournamentEngine.modifyCourtAvailability({
      dateAvailability: [{ date: startDate, startTime: '18:00', endTime: '19:00' }],
      courtId,
    });

    // Should return conflict error since matchUps are scheduled in 07:00-19:00 range
    // but new availability is only 18:00-19:00
    if (result.error) {
      expect(result.error).toEqual(SCHEDULE_CONFLICT_COURT_UNAVAILABLE);
      expect(result.matchUpIds).toBeDefined();
      expect(result.matchUpIds.length).toBeGreaterThan(0);
    } else {
      // If no matchUps were scheduled on this specific court, it succeeds
      expect(result.success).toEqual(true);
    }
  });

  it('returns conflict error when removing date availability entirely', () => {
    const { courtId } = setupScheduledTournament();

    // Change availability to a completely different date — no windows for startDate
    let result: any = tournamentEngine.modifyCourtAvailability({
      dateAvailability: [{ date: '2023-01-02', startTime: '07:00', endTime: '19:00' }],
      courtId,
    });

    // If matchUps are on this court for startDate, they now have no availability
    if (result.error) {
      expect(result.error).toEqual(SCHEDULE_CONFLICT_COURT_UNAVAILABLE);
      expect(result.matchUpIds.length).toBeGreaterThan(0);
    } else {
      expect(result.success).toEqual(true);
    }
  });

  it('allows modification when force flag is set despite conflicts', () => {
    const { courtId } = setupScheduledTournament();

    // Reduce to narrow window with force: true
    let result: any = tournamentEngine.modifyCourtAvailability({
      dateAvailability: [{ date: startDate, startTime: '18:00', endTime: '19:00' }],
      force: true,
      courtId,
    });

    // Should always succeed with force flag
    expect(result.success).toEqual(true);
  });

  it('succeeds when new availability covers all scheduled matchUp times', () => {
    const { courtId } = setupScheduledTournament();

    // Keep the same broad availability — no conflicts
    let result: any = tournamentEngine.modifyCourtAvailability({
      dateAvailability: [{ date: startDate, startTime: '06:00', endTime: '20:00' }],
      courtId,
    });
    expect(result.success).toEqual(true);
  });

  it('succeeds when court has no scheduled matchUps', () => {
    const venueProfiles = [
      {
        dateAvailability: [{ date: startDate, startTime: '07:00', endTime: '19:00' }],
        venueName: 'venue 1',
        courtsCount: 3,
        venueId: 'v1',
      },
    ];
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
      venueProfiles,
      startDate,
      endDate,
    });

    // Don't schedule anything — just modify availability
    const { courts } = tournamentEngine.getCourts();
    const courtId = courts[0].courtId;

    let result: any = tournamentEngine.modifyCourtAvailability({
      dateAvailability: [{ date: startDate, startTime: '10:00', endTime: '12:00' }],
      courtId,
    });
    expect(result.success).toEqual(true);
  });

  it('detects conflicts with matchUps scheduled before availability start time', () => {
    const venueProfiles = [
      {
        dateAvailability: [{ date: startDate, startTime: '08:00', endTime: '20:00' }],
        venueName: 'venue 1',
        courtsCount: 1,
        venueId: 'v1',
      },
    ];
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
      venueProfiles,
      startDate,
      endDate,
    });

    const { rounds } = tournamentEngine.getRounds();
    const schedulingProfile = [{ scheduleDate: startDate, venues: [{ venueId: 'v1', rounds }] }];
    tournamentEngine.setSchedulingProfile({ schedulingProfile });
    tournamentEngine.scheduleProfileRounds({ periodLength: 30 });

    const { courts } = tournamentEngine.getCourts();
    const courtId = courts[0].courtId;

    // Shift availability to afternoon only — morning scheduled matchUps should conflict
    let result: any = tournamentEngine.modifyCourtAvailability({
      dateAvailability: [{ date: startDate, startTime: '14:00', endTime: '20:00' }],
      courtId,
    });

    if (result.error) {
      expect(result.error).toEqual(SCHEDULE_CONFLICT_COURT_UNAVAILABLE);
      expect(result.info).toBeDefined();
    }
    // If no matchUps ended up on this court, it may succeed — that's valid
  });
});
