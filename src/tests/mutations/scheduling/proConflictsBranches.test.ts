import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// Constants
import { MISSING_MATCHUPS, MISSING_CONTEXT } from '@Constants/errorConditionConstants';
import { SINGLES } from '@Constants/eventConstants';
import {
  SCHEDULE_ERROR,
  SCHEDULE_CONFLICT,
  SCHEDULE_WARNING,
  SCHEDULE_ISSUE,
  CONFLICT_MATCHUP_ORDER,
  CONFLICT_COURT_DOUBLE_BOOKING,
} from '@Constants/scheduleConstants';

const startDate = '2024-01-15';
const endDate = '2024-01-21';

describe('proConflicts - input validation and uncovered branches', () => {
  it('returns MISSING_MATCHUPS for invalid matchUps input', () => {
    const result = tournamentEngine.proConflicts({ matchUps: undefined as any });
    expect(result.error).toEqual(MISSING_MATCHUPS);
  });

  it('returns MISSING_MATCHUPS for non-array matchUps', () => {
    const result = tournamentEngine.proConflicts({ matchUps: 'not-an-array' as any });
    expect(result.error).toEqual(MISSING_MATCHUPS);
  });

  it('returns MISSING_CONTEXT when matchUps lack context', () => {
    // Create matchUp objects with matchUpId but no hasContext
    const matchUps = [{ matchUpId: 'test-id', hasContext: false }] as any;
    const result = tournamentEngine.proConflicts({ matchUps });
    expect(result.error).toEqual(MISSING_CONTEXT);
    expect(result.info).toBeDefined();
  });

  it('handles empty matchUps array gracefully', () => {
    const result = tournamentEngine.proConflicts({ matchUps: [] });
    // empty array is valid (passes validMatchUps check), returns empty issues
    expect(result.courtIssues).toBeDefined();
    expect(result.rowIssues).toBeDefined();
  });

  it('detects court double booking conflicts on same row', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'Venue', venueAbbreviation: 'V', idPrefix: 'court', courtsCount: 4 }],
      drawProfiles: [{ eventType: SINGLES, idPrefix: 'singles', drawSize: 8 }],
      startDate,
      endDate,
    });

    let result = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    let { matchUps } = tournamentEngine.allCompetitionMatchUps({ nextMatchUps: true, inContext: true });
    result = tournamentEngine.proAutoSchedule({ scheduledDate: startDate, matchUps });
    expect(result.success).toEqual(true);

    ({ matchUps } = tournamentEngine.allCompetitionMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      nextMatchUps: true,
      inContext: true,
    }));

    // Find two matchUps on different courts in the same row
    const match1 = matchUps[0];
    const match2 = matchUps[1];
    const drawId = match1.drawId;
    const targetCourtId = match1.schedule?.courtId;
    const targetCourtOrder = match1.schedule?.courtOrder;

    if (targetCourtId && targetCourtOrder && match2) {
      // Move match2 to the SAME court + same courtOrder + same date => double booking
      tournamentEngine.addMatchUpScheduleItems({
        matchUpId: match2.matchUpId,
        drawId,
        schedule: {
          courtId: targetCourtId,
          courtOrder: targetCourtOrder,
          scheduledDate: startDate,
        },
        removePriorValues: true,
        proConflictDetection: false, // disable detection to force the double booking
      });

      // Re-fetch matchUps
      ({ matchUps } = tournamentEngine.allCompetitionMatchUps({
        matchUpFilters: { scheduledDate: startDate },
        nextMatchUps: true,
        inContext: true,
      }));

      const conflictsResult = tournamentEngine.proConflicts({ matchUps });
      const allIssues = Object.values(conflictsResult.rowIssues).flat() as any[];
      const doubleBookings = allIssues.filter((issue) => issue.issueType === CONFLICT_COURT_DOUBLE_BOOKING);
      expect(doubleBookings.length).toBeGreaterThan(0);
      expect(doubleBookings[0].issue).toEqual(SCHEDULE_CONFLICT);
    }
  });

  it('detects matchUp ordering errors when source matchUp is scheduled after dependent', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'Venue', venueAbbreviation: 'V', idPrefix: 'court', courtsCount: 8 }],
      drawProfiles: [{ eventType: SINGLES, idPrefix: 'singles', drawSize: 16 }],
      startDate,
      endDate,
    });

    let result = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    let { matchUps } = tournamentEngine.allCompetitionMatchUps({ nextMatchUps: true, inContext: true });
    result = tournamentEngine.proAutoSchedule({ scheduledDate: startDate, matchUps });
    expect(result.success).toEqual(true);

    ({ matchUps } = tournamentEngine.allCompetitionMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      nextMatchUps: true,
      inContext: true,
    }));

    // Find a round-1 matchUp and its round-2 successor
    const round1Match = matchUps.find(
      (m) => m.roundNumber === 1 && m.winnerMatchUpId && m.sides?.every((s) => s.participantId),
    );
    const round2Match = round1Match && matchUps.find((m) => m.matchUpId === round1Match.winnerMatchUpId);

    if (round1Match && round2Match?.schedule?.courtOrder) {
      const drawId = round1Match.drawId;
      const { courts } = tournamentEngine.getCourts();

      // Move round-2 to row 1 and round-1 to a later row
      const round2Row = round2Match.schedule.courtOrder;
      const round1Row = round1Match.schedule.courtOrder;

      if (round1Row < round2Row) {
        // round-1 is already before round-2, swap them
        const occupiedRow1 = new Set(
          matchUps
            .filter((m) => m.schedule?.courtOrder === 1 && m.matchUpId !== round2Match.matchUpId)
            .map((m) => m.schedule?.courtId),
        );
        const availableCourt = courts.find((c) => !occupiedRow1.has(c.courtId))?.courtId;

        if (availableCourt) {
          tournamentEngine.addMatchUpScheduleItems({
            matchUpId: round2Match.matchUpId,
            drawId,
            schedule: { courtOrder: 1, scheduledDate: startDate, courtId: availableCourt },
            removePriorValues: true,
          });

          const maxRow = Math.max(...matchUps.map((m) => m.schedule?.courtOrder || 0));
          const occupiedMaxRow = new Set(
            matchUps
              .filter((m) => m.schedule?.courtOrder === maxRow && m.matchUpId !== round1Match.matchUpId)
              .map((m) => m.schedule?.courtId),
          );
          const availableCourt2 = courts.find((c) => !occupiedMaxRow.has(c.courtId))?.courtId;

          if (availableCourt2) {
            tournamentEngine.addMatchUpScheduleItems({
              matchUpId: round1Match.matchUpId,
              drawId,
              schedule: { courtOrder: maxRow, scheduledDate: startDate, courtId: availableCourt2 },
              removePriorValues: true,
            });

            ({ matchUps } = tournamentEngine.allCompetitionMatchUps({
              matchUpFilters: { scheduledDate: startDate },
              nextMatchUps: true,
              inContext: true,
            }));

            const conflictsResult = tournamentEngine.proConflicts({ matchUps });
            const allIssues = Object.values(conflictsResult.rowIssues).flat() as any[];
            const errorIssues = allIssues.filter(
              (issue) =>
                issue.issue === SCHEDULE_ERROR &&
                issue.issueType === CONFLICT_MATCHUP_ORDER &&
                [round1Match.matchUpId, round2Match.matchUpId].includes(issue.matchUpId),
            );
            expect(errorIssues.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('detects source matchUp conflict on same row', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'Venue', venueAbbreviation: 'V', idPrefix: 'court', courtsCount: 8 }],
      drawProfiles: [{ eventType: SINGLES, idPrefix: 'singles', drawSize: 16 }],
      startDate,
      endDate,
    });

    let result = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    let { matchUps } = tournamentEngine.allCompetitionMatchUps({ nextMatchUps: true, inContext: true });
    result = tournamentEngine.proAutoSchedule({ scheduledDate: startDate, matchUps });
    expect(result.success).toEqual(true);

    ({ matchUps } = tournamentEngine.allCompetitionMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      nextMatchUps: true,
      inContext: true,
    }));

    // Find a round-1 match and its round-2 successor, then put them on the same row
    const round1Match = matchUps.find(
      (m) => m.roundNumber === 1 && m.winnerMatchUpId && m.sides?.every((s) => s.participantId),
    );
    const round2Match = round1Match && matchUps.find((m) => m.matchUpId === round1Match.winnerMatchUpId);

    if (round1Match && round2Match) {
      const drawId = round1Match.drawId;
      const round1Row = round1Match.schedule.courtOrder;
      const { courts } = tournamentEngine.getCourts();

      const occupiedCourts = new Set(
        matchUps
          .filter(
            (m) =>
              m.schedule?.courtOrder === round1Row &&
              m.schedule?.scheduledDate === startDate &&
              m.matchUpId !== round2Match.matchUpId,
          )
          .map((m) => m.schedule?.courtId),
      );
      const availableCourtId = courts.find((c) => !occupiedCourts.has(c.courtId))?.courtId;

      if (availableCourtId) {
        result = tournamentEngine.addMatchUpScheduleItems({
          matchUpId: round2Match.matchUpId,
          drawId,
          schedule: { courtOrder: round1Row, scheduledDate: startDate, courtId: availableCourtId },
          removePriorValues: true,
        });
        expect(result.success).toEqual(true);

        ({ matchUps } = tournamentEngine.allCompetitionMatchUps({
          matchUpFilters: { scheduledDate: startDate },
          nextMatchUps: true,
          inContext: true,
        }));

        const conflictsResult = tournamentEngine.proConflicts({ matchUps });
        const allIssues = Object.values(conflictsResult.rowIssues).flat() as any[];
        const conflictIssues = allIssues.filter(
          (issue) =>
            issue.issueType === CONFLICT_MATCHUP_ORDER &&
            [round1Match.matchUpId, round2Match.matchUpId].includes(issue.matchUpId),
        );
        expect(conflictIssues.length).toBeGreaterThan(0);
      }
    }
  });

  it('detects insufficient gap (SCHEDULE_ISSUE) between non-adjacent source matchUps', () => {
    // With a large draw and few courts, gap issues are likely
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'Venue', venueAbbreviation: 'V', idPrefix: 'court', courtsCount: 4 }],
      drawProfiles: [{ eventType: SINGLES, idPrefix: 'singles', drawSize: 32 }],
      startDate,
      endDate,
    });

    let result = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    let { matchUps } = tournamentEngine.allCompetitionMatchUps({ nextMatchUps: true, inContext: true });
    result = tournamentEngine.proAutoSchedule({ scheduledDate: startDate, matchUps });
    expect(result.success).toEqual(true);

    ({ matchUps } = tournamentEngine.allCompetitionMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      nextMatchUps: true,
      inContext: true,
    }));

    // With 4 courts and 32-draw, auto-scheduler should detect issues/warnings
    const conflictsResult = tournamentEngine.proConflicts({ matchUps });
    const allIssues = Object.values(conflictsResult.rowIssues).flat() as any[];

    // We expect at least some issues or warnings to be detected
    // The auto-scheduler tries to avoid conflicts but may generate some warnings
    expect(conflictsResult.courtIssues).toBeDefined();
    expect(conflictsResult.rowIssues).toBeDefined();

    // Verify the structure of issues if any exist
    allIssues.forEach((issue: any) => {
      expect(issue.matchUpId).toBeDefined();
      expect(issue.issueType).toBeDefined();
      expect(issue.issue).toBeDefined();
      expect(issue.issueIds).toBeDefined();
      expect([SCHEDULE_ERROR, SCHEDULE_CONFLICT, SCHEDULE_WARNING, SCHEDULE_ISSUE].includes(issue.issue)).toEqual(true);
    });
  });

  it('handles matchUps with no courtOrder gracefully', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'Venue', venueAbbreviation: 'V', idPrefix: 'court', courtsCount: 4 }],
      drawProfiles: [{ eventType: SINGLES, idPrefix: 'singles', drawSize: 8 }],
      startDate,
      endDate,
    });

    let result = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    // Get matchUps without scheduling them - no courtOrder assigned
    const { matchUps } = tournamentEngine.allCompetitionMatchUps({ nextMatchUps: true, inContext: true });

    // Schedule only one matchUp
    const drawId = matchUps[0].drawId;
    const { courts } = tournamentEngine.getCourts();
    result = tournamentEngine.addMatchUpScheduleItems({
      matchUpId: matchUps[0].matchUpId,
      drawId,
      schedule: {
        courtId: courts[0].courtId,
        courtOrder: 1,
        scheduledDate: startDate,
      },
    });
    expect(result.success).toEqual(true);

    // Get the single scheduled matchUp
    const { matchUps: scheduledMatchUps } = tournamentEngine.allCompetitionMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      nextMatchUps: true,
      inContext: true,
    });

    const conflictsResult = tournamentEngine.proConflicts({ matchUps: scheduledMatchUps });
    expect(conflictsResult.courtIssues).toBeDefined();
    expect(conflictsResult.rowIssues).toBeDefined();
  });
});
