import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe, beforeEach } from 'vitest';

const SCHEDULED_DATE = '2024-01-01';

/**
 * Regression coverage for the schedule-grid row floor in
 * competitionScheduleMatchUps (withCourtGridRows).
 *
 * The floor must reserve a row only for matchUps that are dated but NOT yet
 * assigned to a court (they need a landing row to be dropped onto). MatchUps
 * already assigned to a court occupy a cell at their courtOrder and must NOT
 * inflate the grid — otherwise a day full of court-assigned pending matchUps
 * balloons the grid with empty trailing rows.
 */
describe('court grid row floor', () => {
  beforeEach(() => {
    tournamentEngine.reset();
  });

  function setup() {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
      venueProfiles: [{ courtsCount: 4 }],
      startDate: SCHEDULED_DATE,
      endDate: '2024-01-07',
      setState: true,
    });
    const { courts } = tournamentEngine.getVenuesAndCourts();
    const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } });
    return { courts, matchUps };
  }

  it('does not inflate rows by the count of court-assigned matchUps', () => {
    const { courts, matchUps } = setup();
    const venueId = courts[0].venueId;

    // Place 6 matchUps across 3 courts at court orders 1 and 2 (max order = 2).
    const placements = [
      { court: courts[0], courtOrder: 1 },
      { court: courts[0], courtOrder: 2 },
      { court: courts[1], courtOrder: 1 },
      { court: courts[1], courtOrder: 2 },
      { court: courts[2], courtOrder: 1 },
      { court: courts[2], courtOrder: 2 },
    ];
    placements.forEach(({ court, courtOrder }, i) => {
      const result = tournamentEngine.addMatchUpScheduleItems({
        matchUpId: matchUps[i].matchUpId,
        drawId: matchUps[i].drawId,
        schedule: { scheduledDate: SCHEDULED_DATE, courtOrder, venueId, courtId: court.courtId },
      });
      expect(result.success).toEqual(true);
    });

    const { rows, dateMatchUps } = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: SCHEDULED_DATE },
      withCourtGridRows: true,
      minCourtGridRows: 4,
    });

    // All 6 placed matchUps are incomplete + dated, so the legacy floor would
    // have produced 6 rows. The corrected floor ignores court-assigned matchUps:
    // rows = max(minCourtGridRows=4, unplaced=0, maxCourtOrder=2) = 4.
    expect(dateMatchUps.length).toEqual(6);
    expect(rows.length).toEqual(4);
    expect(rows.length).toBeLessThan(dateMatchUps.length);
  });

  it('still expands rows to fit dated-but-unplaced matchUps', () => {
    const { matchUps } = setup();

    // Schedule 5 matchUps to the date with NO court assignment.
    const unplacedCount = 5;
    for (let i = 0; i < unplacedCount; i++) {
      const result = tournamentEngine.addMatchUpScheduleItems({
        matchUpId: matchUps[i].matchUpId,
        drawId: matchUps[i].drawId,
        schedule: { scheduledDate: SCHEDULED_DATE },
      });
      expect(result.success).toEqual(true);
    }

    const { rows } = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: SCHEDULED_DATE },
      withCourtGridRows: true,
      minCourtGridRows: 2,
    });

    // Unplaced matchUps each need a landing row: max(min=2, unplaced=5) = 5.
    expect(rows.length).toEqual(unplacedCount);
  });
});
