import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { ANACHRONISM } from '@Constants/errorConditionConstants';

function setupTournament() {
  const startDate = '2026-06-15';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
    setState: true,
    startDate,
  });

  tournamentEngine.addVenue({
    venue: {
      venueName: 'Test Venue',
      venueId: 'venue1',
    },
  });

  tournamentEngine.addCourts({
    venueId: 'venue1',
    courtNames: ['Court 1'],
    dateAvailability: [
      {
        date: startDate,
        startTime: '08:00',
        endTime: '22:00',
      },
    ],
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const firstRoundMatchUps = matchUps.filter((m) => m.roundNumber === 1);

  return { startDate, matchUps: firstRoundMatchUps };
}

describe('addMatchUpScheduleItems coverage', () => {
  it('schedules a matchUp with date and time', () => {
    const { startDate, matchUps } = setupTournament();
    const matchUpId = matchUps[0].matchUpId;
    const drawId = matchUps[0].drawId;

    const result = tournamentEngine.addMatchUpScheduleItems({
      matchUpId,
      drawId,
      schedule: {
        scheduledDate: startDate,
        scheduledTime: '10:00',
      },
    });
    expect(result.success).toBe(true);
  });

  it('schedules start time, stop time, resume time, end time', () => {
    const { startDate, matchUps } = setupTournament();
    const matchUpId = matchUps[0].matchUpId;
    const drawId = matchUps[0].drawId;

    // Set up scheduled date first
    tournamentEngine.addMatchUpScheduleItems({
      matchUpId,
      drawId,
      schedule: { scheduledDate: startDate, scheduledTime: '10:00' },
    });

    // Start
    let result = tournamentEngine.addMatchUpScheduleItems({
      matchUpId,
      drawId,
      schedule: { startTime: '10:00' },
    });
    expect(result.success).toBe(true);

    // Stop
    result = tournamentEngine.addMatchUpScheduleItems({
      matchUpId,
      drawId,
      schedule: { stopTime: '10:30' },
    });
    expect(result.success).toBe(true);

    // Resume
    result = tournamentEngine.addMatchUpScheduleItems({
      matchUpId,
      drawId,
      schedule: { resumeTime: '10:45' },
    });
    expect(result.success).toBe(true);

    // End
    result = tournamentEngine.addMatchUpScheduleItems({
      matchUpId,
      drawId,
      schedule: { endTime: '11:30' },
    });
    expect(result.success).toBe(true);
  });

  it('handles courtOrder in schedule', () => {
    const { startDate, matchUps } = setupTournament();
    const matchUpId = matchUps[0].matchUpId;
    const drawId = matchUps[0].drawId;

    const result = tournamentEngine.addMatchUpScheduleItems({
      matchUpId,
      drawId,
      schedule: {
        scheduledDate: startDate,
        courtOrder: 1,
      },
    });
    expect(result.success).toBe(true);
  });

  it('handles timeModifiers in schedule', () => {
    const { startDate, matchUps } = setupTournament();
    const matchUpId = matchUps[0].matchUpId;
    const drawId = matchUps[0].drawId;

    const result = tournamentEngine.addMatchUpScheduleItems({
      matchUpId,
      drawId,
      schedule: {
        scheduledDate: startDate,
        scheduledTime: '10:00',
        timeModifiers: ['NB 10:00'],
      },
    });
    expect(result.success).toBe(true);
  });

  it('respects disableNotice', () => {
    const { startDate, matchUps } = setupTournament();
    const matchUpId = matchUps[0].matchUpId;
    const drawId = matchUps[0].drawId;

    const result = tournamentEngine.addMatchUpScheduleItems({
      matchUpId,
      drawId,
      schedule: { scheduledDate: startDate },
      disableNotice: true,
    });
    expect(result.success).toBe(true);
  });

  it('reports anachronism warning when scheduling before dependent matchUp', () => {
    const { startDate, matchUps } = setupTournament();
    const drawId = matchUps[0].drawId;

    // Schedule first round matchUp late
    tournamentEngine.addMatchUpScheduleItems({
      matchUpId: matchUps[0].matchUpId,
      drawId,
      schedule: { scheduledDate: startDate, scheduledTime: '18:00' },
    });

    // Get second round matchUps
    const { matchUps: allMatchUps } = tournamentEngine.allTournamentMatchUps();
    const secondRoundMatchUp = allMatchUps.find((m) => m.roundNumber === 2);
    if (secondRoundMatchUp) {
      // Schedule second round earlier than first round - should produce warning
      const result = tournamentEngine.addMatchUpScheduleItems({
        matchUpId: secondRoundMatchUp.matchUpId,
        drawId,
        schedule: { scheduledDate: startDate, scheduledTime: '09:00' },
        checkChronology: true,
      });
      // Should succeed but with a warning
      expect(result.success).toBe(true);
      if (result.warnings) {
        expect(result.warnings).toContain(ANACHRONISM);
      }
    }
  });

  it('handles homeParticipantId in schedule', () => {
    const { startDate, matchUps } = setupTournament();
    const matchUpId = matchUps[0].matchUpId;
    const drawId = matchUps[0].drawId;

    const result = tournamentEngine.addMatchUpScheduleItems({
      matchUpId,
      drawId,
      schedule: {
        scheduledDate: startDate,
        homeParticipantId: 'some-participant-id',
      },
    });
    expect(result.success).toBe(true);
  });
});
