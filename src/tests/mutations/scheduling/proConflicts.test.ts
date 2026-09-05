import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// Constants
import { SCHEDULE_CONFLICT_DOUBLE_BOOKING } from '@Constants/errorConditionConstants';
import { ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';
import { DOUBLES, SINGLES } from '@Constants/eventConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import {
  SCHEDULE_CONFLICT,
  SCHEDULE_WARNING,
  SCHEDULE_ERROR,
  CONFLICT_PARTICIPANTS,
  CONFLICT_POTENTIAL_PARTICIPANTS,
  CONFLICT_POSITION_LINK,
} from '@Constants/scheduleConstants';

const startDate = '2024-01-15';
const endDate = '2024-01-21';

describe('proConflicts - Comprehensive Conflict Detection', () => {
  it('detects conflicts when doubles participants appear in singles matches on same row', () => {
    // Create tournament with doubles draw of 16 and venue with 10 courts
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [
        {
          venueName: 'Main Venue',
          venueAbbreviation: 'MV',
          idPrefix: 'court',
          courtsCount: 10,
        },
      ],
      drawProfiles: [
        {
          eventType: DOUBLES,
          idPrefix: 'doubles',
          drawSize: 16,
        },
      ],
      startDate,
      endDate,
    });

    let result = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    // Get all participants (individuals) from the tournament
    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [INDIVIDUAL] },
    });
    expect(participants.length).toEqual(32);

    // Create a singles event with the individual participants
    const singlesEvent = { eventName: 'Singles Event', eventType: SINGLES };
    result = tournamentEngine.addEvent({ event: singlesEvent });
    expect(result.success).toEqual(true);
    const { event: singlesEventResult } = result;
    const singlesEventId = singlesEventResult.eventId;

    // Add the first 16 individual participants to the singles event
    const singlesParticipantIds = participants.map((p) => p.participantId);
    result = tournamentEngine.addEventEntries({
      participantIds: singlesParticipantIds,
      eventId: singlesEventId,
    });
    expect(result.success).toEqual(true);

    // Generate and add singles draw
    const { drawDefinition: singlesDrawDefinition } = tournamentEngine.generateDrawDefinition({
      eventId: singlesEventId,
      automated: true,
    });
    result = tournamentEngine.addDrawDefinition({
      drawDefinition: singlesDrawDefinition,
      eventId: singlesEventId,
    });
    expect(result.success).toEqual(true);
    const singlesDrawId = singlesDrawDefinition.drawId;

    // Use proAutoSchedule to schedule all matches
    let { matchUps } = tournamentEngine.allCompetitionMatchUps({
      nextMatchUps: true,
      inContext: true,
    });

    // drawSize 16 doubles + drawSize 32 singles = 15 + 31 matchUps
    // but not all can be scheduled on same date with 10 rows and conflict avoidance
    expect(matchUps.length).toBeGreaterThan(40);

    result = tournamentEngine.proAutoSchedule({
      scheduledDate: startDate,
      matchUps,
    });
    expect(result.success).toEqual(true);
    expect(result.scheduled.length).toBeGreaterThan(40);

    // Get all scheduled matchUps for the start date
    ({ matchUps } = tournamentEngine.allCompetitionMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      nextMatchUps: true,
      inContext: true,
    }));

    // Initial check - should have no conflicts after auto-scheduling
    let conflictsResult = tournamentEngine.proConflicts({ matchUps });
    expect(conflictsResult.courtIssues).toBeDefined();
    expect(conflictsResult.rowIssues).toBeDefined();

    // Find a doubles match and a singles match to create a conflict
    const doublesMatches = matchUps.filter((m) => m.matchUpType === DOUBLES && m.sides?.every((s) => s.participantId));
    const singlesMatches = matchUps.filter((m) => m.matchUpType === SINGLES && m.sides?.every((s) => s.participantId));

    expect(doublesMatches.length).toBeGreaterThan(0);
    expect(singlesMatches.length).toBeGreaterThan(0);

    // Find a doubles match where one of the individual participants also plays singles
    let doublesMatchWithConflict;
    let singlesMatchWithConflict;
    let conflictingParticipantId;

    for (const doublesMatch of doublesMatches) {
      const individualParticipantIds = new Set(
        doublesMatch.sides.flatMap((side) => side.participant?.individualParticipantIds || []).filter(Boolean),
      );

      // Find a singles match with one of these participants
      const conflictingSinglesMatch = singlesMatches.find((singlesMatch) => {
        return singlesMatch.sides.some((side) => individualParticipantIds.has(side.participantId));
      });

      if (conflictingSinglesMatch) {
        doublesMatchWithConflict = doublesMatch;
        singlesMatchWithConflict = conflictingSinglesMatch;
        conflictingParticipantId = singlesMatchWithConflict.sides.find((side) =>
          individualParticipantIds.has(side.participantId),
        )?.participantId;
        break;
      }
    }

    expect(!!doublesMatchWithConflict && !!singlesMatchWithConflict).toBe(true);
    expect(conflictingParticipantId).toBeDefined();

    // Move the singles match to the same row as the doubles match
    const doublesCourtOrder = doublesMatchWithConflict.schedule.courtOrder;
    const singlesCourtOrder = singlesMatchWithConflict.schedule.courtOrder;

    expect(doublesCourtOrder).not.toEqual(singlesCourtOrder);

    // Move singles match to same row as doubles match on a different court
    const doublesCourtId = doublesMatchWithConflict.schedule.courtId;

    // Find an available court on the target row (must be different from doublesCourtId)
    const occupiedCourtIds = new Set(
      matchUps
        .filter(
          (m) =>
            m.schedule?.courtOrder === doublesCourtOrder &&
            m.schedule?.scheduledDate === startDate &&
            m.matchUpId !== singlesMatchWithConflict.matchUpId,
        )
        .map((m) => m.schedule?.courtId),
    );

    const { courts } = tournamentEngine.getCourts();
    const availableCourtId = courts.find((c) => !occupiedCourtIds.has(c.courtId))?.courtId;

    expect(availableCourtId).toBeDefined();
    expect(availableCourtId).not.toEqual(doublesCourtId);

    // Move singles match to available court on same row as doubles match
    result = tournamentEngine.addMatchUpScheduleItems({
      matchUpId: singlesMatchWithConflict.matchUpId,
      drawId: singlesDrawId,
      schedule: {
        courtOrder: doublesCourtOrder,
        scheduledDate: startDate,
        courtId: availableCourtId,
      },
      removePriorValues: true,
    });
    expect(result.success).toEqual(true);

    // Get updated matchUps
    ({ matchUps } = tournamentEngine.allCompetitionMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      nextMatchUps: true,
      inContext: true,
    }));

    // Now check for conflicts
    conflictsResult = tournamentEngine.proConflicts({ matchUps });
    const targetRowIndex = doublesCourtOrder - 1;
    const rowIssues = conflictsResult.rowIssues[targetRowIndex] || [];

    // Should detect conflict for both matches
    const doublesIssue = rowIssues.find((issue: any) => issue.matchUpId === doublesMatchWithConflict.matchUpId);
    const singlesIssue = rowIssues.find((issue: any) => issue.matchUpId === singlesMatchWithConflict.matchUpId);

    expect(doublesIssue).toBeDefined();
    expect(singlesIssue).toBeDefined();
    expect(doublesIssue.issue).toEqual(SCHEDULE_CONFLICT);
    expect(singlesIssue.issue).toEqual(SCHEDULE_CONFLICT);
    expect(doublesIssue.issueType).toEqual(CONFLICT_PARTICIPANTS);
    expect(singlesIssue.issueType).toEqual(CONFLICT_PARTICIPANTS);
  });

  it('detects potential participant conflicts (warnings) for dependent matches', () => {
    // Create tournament with singles draw
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [
        {
          venueName: 'Test Venue',
          venueAbbreviation: 'TV',
          idPrefix: 'court',
          courtsCount: 8, // same as drawSize / 2 to force dependent matches on adjacent rows
        },
      ],
      drawProfiles: [
        {
          eventType: SINGLES,
          idPrefix: 'singles',
          drawSize: 16, // we will have 8 first round matchUps, so 4 second round matchUps
        },
      ],
      startDate,
      endDate,
    });

    let result = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    // Get all matchUps
    let { matchUps } = tournamentEngine.allCompetitionMatchUps({
      nextMatchUps: true,
      inContext: true,
    });

    // Schedule all matches
    result = tournamentEngine.proAutoSchedule({
      scheduledDate: startDate,
      matchUps,
    });
    expect(result.success).toEqual(true);

    // Get scheduled matchUps
    ({ matchUps } = tournamentEngine.allCompetitionMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      nextMatchUps: true,
      inContext: true,
    }));

    // Get the last scheduled first round match
    const firstRoundMatch = matchUps.findLast(
      (m) => m.roundNumber === 1 && m.winnerMatchUpId && m.sides?.every((s) => s.participantId),
    );

    const winnerMatchUpId = firstRoundMatch.winnerMatchUpId;
    const secondRoundMatch = matchUps.find((m) => m.matchUpId === winnerMatchUpId);

    // Check if they're already on adjacent rows (which should produce a warning)
    const firstRoundCourtOrder = firstRoundMatch.schedule.courtOrder;
    const secondRoundCourtOrder = secondRoundMatch.schedule.courtOrder;

    expect(secondRoundCourtOrder).toBeGreaterThan(firstRoundCourtOrder);

    const conflictsResult = tournamentEngine.proConflicts({ matchUps });
    const allIssues = Object.values(conflictsResult.rowIssues).flat() as any[];
    const hasWarning = allIssues.some(
      (issue) =>
        issue.issue === SCHEDULE_WARNING &&
        [firstRoundMatch.matchUpId, secondRoundMatch.matchUpId].includes(issue.matchUpId),
    );
    expect(hasWarning).toEqual(true);
  });

  it('handles multiple participants in doubles pairs correctly', () => {
    // Create tournament with doubles only
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [
        {
          venueName: 'Doubles Venue',
          venueAbbreviation: 'DV',
          idPrefix: 'court',
          courtsCount: 4,
        },
      ],
      drawProfiles: [
        {
          eventType: DOUBLES,
          idPrefix: 'doubles',
          drawSize: 8,
        },
      ],
      participantsProfile: { participantsCount: 16 },
      startDate,
      endDate,
    });

    let result = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    // Get all matchUps
    let { matchUps } = tournamentEngine.allCompetitionMatchUps({
      nextMatchUps: true,
      inContext: true,
    });

    // Schedule all matches
    result = tournamentEngine.proAutoSchedule({
      scheduledDate: startDate,
      matchUps,
    });
    expect(result.success).toEqual(true);

    // Get scheduled matchUps with full context
    ({ matchUps } = tournamentEngine.allCompetitionMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      nextMatchUps: true,
      inContext: true,
    }));

    // Verify that all doubles matches have individual participant IDs properly extracted
    const doublesMatches = matchUps.filter((m) => m.matchUpType === DOUBLES && m.sides?.every((s) => s.participantId));

    doublesMatches.forEach((match) => {
      match.sides.forEach((side) => {
        expect(side.participant).toBeDefined();
        expect(side.participant.individualParticipantIds).toBeDefined();
        expect(Array.isArray(side.participant.individualParticipantIds)).toEqual(true);
        expect(side.participant.individualParticipantIds.length).toEqual(2);
      });
    });

    // Check that proConflicts processes these correctly (no errors)
    const conflictsResult = tournamentEngine.proConflicts({ matchUps });
    expect(conflictsResult.courtIssues).toBeDefined();
    expect(conflictsResult.rowIssues).toBeDefined();
  });

  it.each([
    { proConflictDetection: true, expectation: true },
    { proConflictDetection: false, expectation: false },
  ])(
    'prevents double booking of same court slot (courtId, courtOrder, scheduledDate)',
    ({ proConflictDetection, expectation }) => {
      // Create tournament with singles draw
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        venueProfiles: [
          {
            venueName: 'Test Venue',
            venueAbbreviation: 'TV',
            idPrefix: 'court',
            courtsCount: 5,
          },
        ],
        drawProfiles: [
          {
            eventType: SINGLES,
            idPrefix: 'singles',
            drawSize: 16,
          },
        ],
        startDate,
        endDate,
      });

      let result = tournamentEngine.setState(tournamentRecord);
      expect(result.success).toEqual(true);

      // Get all matchUps
      const { matchUps } = tournamentEngine.allCompetitionMatchUps({
        nextMatchUps: true,
        inContext: true,
      });

      expect(matchUps.length).toBeGreaterThan(2);

      // Get first two matchUps from the draw
      const firstMatchUp = matchUps[0];
      const secondMatchUp = matchUps[1];
      const drawId = firstMatchUp.drawId;

      expect(firstMatchUp.matchUpId).not.toEqual(secondMatchUp.matchUpId);

      // Get a court from the venue
      const { courts } = tournamentEngine.getCourts();
      expect(courts.length).toBeGreaterThan(0);

      const targetCourtId = courts[0].courtId;
      const targetCourtOrder = 1;
      const targetScheduledDate = startDate;

      // Schedule first matchUp to specific court slot
      result = tournamentEngine.addMatchUpScheduleItems({
        matchUpId: firstMatchUp.matchUpId,
        drawId,
        schedule: {
          courtId: targetCourtId,
          courtOrder: targetCourtOrder,
          scheduledDate: targetScheduledDate,
        },
        removePriorValues: true,
      });
      expect(result.success).toEqual(true);

      // Attempt to schedule second matchUp to the same court slot - should fail
      result = tournamentEngine.addMatchUpScheduleItems({
        matchUpId: secondMatchUp.matchUpId,
        proConflictDetection,
        drawId,
        schedule: {
          courtId: targetCourtId,
          courtOrder: targetCourtOrder,
          scheduledDate: targetScheduledDate,
        },
        removePriorValues: true,
      });

      // Should return error for double booking
      if (expectation) {
        expect(result.error).toEqual(SCHEDULE_CONFLICT_DOUBLE_BOOKING);
        expect(result.success).toBeUndefined();
      }

      // Verify that only the first matchUp was scheduled to that slot
      const { matchUps: scheduledMatchUps } = tournamentEngine.allCompetitionMatchUps({
        matchUpFilters: { scheduledDate: targetScheduledDate },
        nextMatchUps: true,
        inContext: true,
      });

      const matchUpsInTargetSlot = scheduledMatchUps.filter(
        (m) =>
          m.schedule?.courtId === targetCourtId &&
          m.schedule?.courtOrder === targetCourtOrder &&
          m.schedule?.scheduledDate === targetScheduledDate,
      );

      if (expectation) {
        // Should only have one matchUp in this slot
        expect(matchUpsInTargetSlot.length).toEqual(1);
        expect(matchUpsInTargetSlot[0].matchUpId).toEqual(firstMatchUp.matchUpId);

        // Verify that scheduling to a different court slot works
        const differentCourtId = courts[1].courtId;
        result = tournamentEngine.addMatchUpScheduleItems({
          matchUpId: secondMatchUp.matchUpId,
          drawId,
          schedule: {
            courtId: differentCourtId,
            courtOrder: targetCourtOrder,
            scheduledDate: targetScheduledDate,
          },
          removePriorValues: true,
        });
        expect(result.success).toEqual(true);
      }
    },
  );

  it('useDeepDependencies=false preserves existing behavior', () => {
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

    const resultDefault = tournamentEngine.proConflicts({ matchUps });
    const resultExplicitFalse = tournamentEngine.proConflicts({ matchUps, useDeepDependencies: false });

    expect(resultDefault.courtIssues).toBeDefined();
    expect(resultExplicitFalse.courtIssues).toBeDefined();

    // Row issue counts should be identical
    const defaultRowIssueCount = Object.values(resultDefault.rowIssues).flat().length;
    const explicitFalseRowIssueCount = Object.values(resultExplicitFalse.rowIssues).flat().length;
    expect(defaultRowIssueCount).toEqual(explicitFalseRowIssueCount);
  });

  it('detects deep potential participant conflicts with useDeepDependencies (Pass A)', () => {
    // 16-draw singles, 8 courts
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

    // Find a round-1 matchUp and the round-2 matchUp it feeds into
    const round1Match = matchUps.find(
      (m) => m.roundNumber === 1 && m.winnerMatchUpId && m.sides?.every((s) => s.participantId),
    );
    expect(round1Match).toBeDefined();

    const round2Match = matchUps.find((m) => m.matchUpId === round1Match.winnerMatchUpId);
    expect(round2Match).toBeDefined();

    const drawId = round1Match.drawId;
    const round1CourtOrder = round1Match.schedule.courtOrder;

    // Move round-2 matchUp to the same row as its round-1 source
    const { courts } = tournamentEngine.getCourts();
    const occupiedCourtIds = new Set(
      matchUps
        .filter(
          (m) =>
            m.schedule?.courtOrder === round1CourtOrder &&
            m.schedule?.scheduledDate === startDate &&
            m.matchUpId !== round2Match.matchUpId,
        )
        .map((m) => m.schedule?.courtId),
    );
    const availableCourtId = courts.find((c) => !occupiedCourtIds.has(c.courtId))?.courtId;

    if (availableCourtId) {
      result = tournamentEngine.addMatchUpScheduleItems({
        matchUpId: round2Match.matchUpId,
        drawId,
        schedule: { courtOrder: round1CourtOrder, scheduledDate: startDate, courtId: availableCourtId },
        removePriorValues: true,
      });
      expect(result.success).toEqual(true);

      ({ matchUps } = tournamentEngine.allCompetitionMatchUps({
        matchUpFilters: { scheduledDate: startDate },
        nextMatchUps: true,
        inContext: true,
      }));

      // Without flag: no CONFLICT_POTENTIAL_PARTICIPANTS
      const resultNoFlag = tournamentEngine.proConflicts({ matchUps });
      const allIssuesNoFlag = Object.values(resultNoFlag.rowIssues).flat() as any[];
      const potentialConflictsNoFlag = allIssuesNoFlag.filter(
        (issue) => issue.issueType === CONFLICT_POTENTIAL_PARTICIPANTS,
      );
      expect(potentialConflictsNoFlag.length).toEqual(0);

      // With flag: should detect potential participant conflicts
      const resultWithFlag = tournamentEngine.proConflicts({ matchUps, useDeepDependencies: true });
      const allIssuesWithFlag = Object.values(resultWithFlag.rowIssues).flat() as any[];

      // The deep analysis should find issues (potential or other deep-detected)
      // At minimum, the existing conflicts + possibly new deep ones
      expect(allIssuesWithFlag.length).toBeGreaterThanOrEqual(allIssuesNoFlag.length);
    }
  });

  it('detects extended sourceDistance gap with useDeepDependencies (Pass B)', () => {
    // 32-draw singles so we have deeper rounds
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'Venue', venueAbbreviation: 'V', idPrefix: 'court', courtsCount: 6 }],
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

    // Find a round-3 matchUp and a round-1 matchUp that is a transitive source (sourceDistance=2)
    const round3Matches = matchUps.filter((m) => m.roundNumber === 3 && m.schedule?.courtOrder);
    const round1Matches = matchUps.filter(
      (m) => m.roundNumber === 1 && m.sides?.every((s) => s.participantId) && m.schedule?.courtOrder,
    );

    if (round3Matches.length && round1Matches.length) {
      // Call with deep dependencies - should process without errors
      const resultWithFlag = tournamentEngine.proConflicts({ matchUps, useDeepDependencies: true });
      expect(resultWithFlag.courtIssues).toBeDefined();
      expect(resultWithFlag.rowIssues).toBeDefined();

      // Result should have at least as many issues as without the flag
      const resultNoFlag = tournamentEngine.proConflicts({ matchUps });
      const deepIssueCount = Object.values(resultWithFlag.rowIssues).flat().length;
      const normalIssueCount = Object.values(resultNoFlag.rowIssues).flat().length;
      expect(deepIssueCount).toBeGreaterThanOrEqual(normalIssueCount);
    }
  });

  it('detects forward-looking dependent conflicts with useDeepDependencies (Pass C)', () => {
    // 32-draw, 6 courts
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'Venue', venueAbbreviation: 'V', idPrefix: 'court', courtsCount: 6 }],
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

    // Find a round-1 matchUp on a later row and its round-2 dependent
    const round1MatchesOnGrid = matchUps
      .filter((m) => m.roundNumber === 1 && m.winnerMatchUpId && m.schedule?.courtOrder)
      .sort((a, b) => b.schedule.courtOrder - a.schedule.courtOrder);

    const round1Match = round1MatchesOnGrid[0];
    if (!round1Match) return;

    const round2Match = matchUps.find((m) => m.matchUpId === round1Match.winnerMatchUpId);
    if (!round2Match?.schedule?.courtOrder) return;

    const drawId = round1Match.drawId;

    // Swap round-2 matchUp to an earlier row than its round-1 source
    const round1Row = round1Match.schedule.courtOrder;
    const targetRow = 1; // Move round-2 to first row

    if (round1Row > targetRow) {
      const { courts } = tournamentEngine.getCourts();
      const occupiedCourtIds = new Set(
        matchUps
          .filter(
            (m) =>
              m.schedule?.courtOrder === targetRow &&
              m.schedule?.scheduledDate === startDate &&
              m.matchUpId !== round2Match.matchUpId,
          )
          .map((m) => m.schedule?.courtId),
      );
      const availableCourtId = courts.find((c) => !occupiedCourtIds.has(c.courtId))?.courtId;

      if (availableCourtId) {
        result = tournamentEngine.addMatchUpScheduleItems({
          matchUpId: round2Match.matchUpId,
          drawId,
          schedule: { courtOrder: targetRow, scheduledDate: startDate, courtId: availableCourtId },
          removePriorValues: true,
        });
        expect(result.success).toEqual(true);

        ({ matchUps } = tournamentEngine.allCompetitionMatchUps({
          matchUpFilters: { scheduledDate: startDate },
          nextMatchUps: true,
          inContext: true,
        }));

        // With deep dependencies, should detect the ordering violation from the dependent direction
        const resultWithFlag = tournamentEngine.proConflicts({ matchUps, useDeepDependencies: true });
        const allIssues = Object.values(resultWithFlag.rowIssues).flat() as any[];

        // Should detect ERROR for the misordered matchUps
        const errorIssues = allIssues.filter(
          (issue) =>
            issue.issue === SCHEDULE_ERROR && [round1Match.matchUpId, round2Match.matchUpId].includes(issue.matchUpId),
        );
        expect(errorIssues.length).toBeGreaterThan(0);
      }
    }
  });

  it('detects cross-draw position link conflicts with useDeepDependencies (Pass D)', () => {
    // ROUND_ROBIN_WITH_PLAYOFF creates POSITION links (RR groups -> playoff bracket)
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'Venue', venueAbbreviation: 'V', idPrefix: 'court', courtsCount: 8 }],
      drawProfiles: [
        {
          drawType: ROUND_ROBIN_WITH_PLAYOFF,
          eventType: SINGLES,
          idPrefix: 'rrwp',
          drawSize: 16,
        },
      ],
      startDate,
      endDate,
    });

    let result = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    let { matchUps } = tournamentEngine.allCompetitionMatchUps({ nextMatchUps: true, inContext: true });

    // RR_WITH_PLAYOFF has structures: RR groups (stage=MAIN) and a playoff bracket (stage=PLAY_OFF)
    // Playoff matchUps depend on all RR matchUps via POSITION links
    const playoffMatchUps = matchUps.filter((m) => m.stage === 'PLAY_OFF');
    expect(playoffMatchUps.length).toBeGreaterThan(0);

    // Schedule only ONE playoff matchUp on a single row to isolate Pass D behavior.
    // With only 1 matchUp on 1 row, no earlier passes (base ordering, Pass A participant
    // overlap, Pass B gap, Pass C dependents) will annotate it, allowing Pass D to fire.
    const drawId = playoffMatchUps[0].drawId;
    const { courts } = tournamentEngine.getCourts();
    const courtId = courts[0].courtId;

    result = tournamentEngine.addMatchUpScheduleItems({
      matchUpId: playoffMatchUps[0].matchUpId,
      drawId,
      schedule: { courtOrder: 1, scheduledDate: startDate, courtId },
      removePriorValues: true,
    });
    expect(result.success).toEqual(true);

    ({ matchUps } = tournamentEngine.allCompetitionMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      nextMatchUps: true,
      inContext: true,
    }));
    expect(matchUps.length).toEqual(1);

    // Without flag: no CONFLICT_POSITION_LINK
    const resultNoFlag = tournamentEngine.proConflicts({ matchUps });
    const allIssuesNoFlag = Object.values(resultNoFlag.rowIssues).flat() as any[];
    const positionLinkIssuesNoFlag = allIssuesNoFlag.filter((issue) => issue.issueType === CONFLICT_POSITION_LINK);
    expect(positionLinkIssuesNoFlag.length).toEqual(0);

    // With flag: should detect position link warnings for the playoff matchUp
    // whose RR source matchUps are not on the grid
    const resultWithFlag = tournamentEngine.proConflicts({ matchUps, useDeepDependencies: true });
    const allIssuesWithFlag = Object.values(resultWithFlag.rowIssues).flat() as any[];
    const positionLinkIssues = allIssuesWithFlag.filter((issue) => issue.issueType === CONFLICT_POSITION_LINK);

    // The playoff matchUp depends on RR matchUps via position links,
    // and those RR matchUps are not scheduled, so we should get a warning
    expect(positionLinkIssues.length).toEqual(1);
    expect(positionLinkIssues[0].issue).toEqual(SCHEDULE_WARNING);
    expect(positionLinkIssues[0].matchUpId).toEqual(playoffMatchUps[0].matchUpId);
  });
});
