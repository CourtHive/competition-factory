import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

describe('setTournamentDates activeDates with scheduled matchUps', () => {
  it('prevents removing an activeDate that has scheduled matchUps', () => {
    const startDate = '2024-06-01';
    const endDate = '2024-06-05';

    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      venueProfiles: [{ courtsCount: 2 }],
      setState: true,
      startDate,
      endDate,
    });

    // Set initial activeDates covering all tournament dates
    let result: any = tournamentEngine.setTournamentDates({
      activeDates: ['2024-06-01', '2024-06-02', '2024-06-03', '2024-06-04', '2024-06-05'],
    });
    expect(result.success).toBe(true);

    // Get courts for scheduling
    const { courts } = tournamentEngine.getCourts();
    const courtId = courts[0].courtId;

    // Schedule a matchUp on 2024-06-03
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const targetMatchUp = matchUps.find((m) => m.roundNumber === 1);

    result = tournamentEngine.addMatchUpScheduleItems({
      matchUpId: targetMatchUp.matchUpId,
      drawId,
      schedule: {
        scheduledDate: '2024-06-03',
        scheduledTime: '10:00',
        courtId,
      },
    });
    expect(result.success).toBe(true);

    // Now try to remove 2024-06-03 from activeDates — should fail
    result = tournamentEngine.setTournamentDates({
      activeDates: ['2024-06-01', '2024-06-02', '2024-06-04', '2024-06-05'],
    });
    expect(result.error).toBeDefined();
    expect(result.error.message).toContain('2024-06-03');
    expect(result.info).toContain('1 matchUp(s) scheduled');

    // Verify activeDates were NOT changed (still includes 2024-06-03)
    const { tournamentInfo } = tournamentEngine.getTournamentInfo();
    expect(tournamentInfo.activeDates).toContain('2024-06-03');
  });

  it('allows removing an activeDate with no scheduled matchUps', () => {
    const startDate = '2024-06-01';
    const endDate = '2024-06-05';

    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      venueProfiles: [{ courtsCount: 2 }],
      setState: true,
      startDate,
      endDate,
    });

    // Set initial activeDates
    let result: any = tournamentEngine.setTournamentDates({
      activeDates: ['2024-06-01', '2024-06-02', '2024-06-03'],
    });
    expect(result.success).toBe(true);

    // Remove 2024-06-03 (no matchUps scheduled there) — should succeed
    result = tournamentEngine.setTournamentDates({
      activeDates: ['2024-06-01', '2024-06-02'],
    });
    expect(result.success).toBe(true);
  });

  it('reports multiple conflicting dates when several removed dates have scheduling', () => {
    const startDate = '2024-06-01';
    const endDate = '2024-06-05';

    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      venueProfiles: [{ courtsCount: 4 }],
      setState: true,
      startDate,
      endDate,
    });

    let result: any = tournamentEngine.setTournamentDates({
      activeDates: ['2024-06-01', '2024-06-02', '2024-06-03', '2024-06-04', '2024-06-05'],
    });
    expect(result.success).toBe(true);

    const { courts } = tournamentEngine.getCourts();
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const r1MatchUps = matchUps.filter((m) => m.roundNumber === 1);

    // Schedule 2 matchUps on 2024-06-02 and 2 on 2024-06-04
    for (let i = 0; i < Math.min(2, r1MatchUps.length); i++) {
      result = tournamentEngine.addMatchUpScheduleItems({
        matchUpId: r1MatchUps[i].matchUpId,
        drawId,
        schedule: {
          scheduledDate: '2024-06-02',
          courtId: courts[i].courtId,
          scheduledTime: '10:00',
        },
      });
      expect(result.success).toBe(true);
    }
    for (let i = 2; i < Math.min(4, r1MatchUps.length); i++) {
      result = tournamentEngine.addMatchUpScheduleItems({
        matchUpId: r1MatchUps[i].matchUpId,
        drawId,
        schedule: {
          scheduledDate: '2024-06-04',
          courtId: courts[i - 2].courtId,
          scheduledTime: '10:00',
        },
      });
      expect(result.success).toBe(true);
    }

    // Try to remove both 2024-06-02 and 2024-06-04 — should fail with both dates
    result = tournamentEngine.setTournamentDates({
      activeDates: ['2024-06-01', '2024-06-03', '2024-06-05'],
    });
    expect(result.error).toBeDefined();
    expect(result.error.message).toContain('2024-06-02');
    expect(result.error.message).toContain('2024-06-04');
    expect(result.info).toContain('4 matchUp(s) scheduled');
  });
});
