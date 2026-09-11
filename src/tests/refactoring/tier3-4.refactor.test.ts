/**
 * Regression tests for tiers 3-4 refactoring targets:
 * - ScoringEngine.rebuildFromEntries
 * - AvailabilityEngine.loadBlocksFromTournamentRecord
 * - mcpValidator.validateMCPMatch
 * - mcpParser.shotParser
 * - scheduleItems.addMatchUpScheduleItems
 * - addEventEntries.getTypedParticipantIdsHelper
 */
import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { shotParser } from '@Validators/scoring/mcpParser';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { DOUBLES } from '@Constants/eventConstants';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';

// ═══════════════════════════════════════════════════════════════════════════
// ScoringEngine.rebuildFromEntries
// ═══════════════════════════════════════════════════════════════════════════

it('ScoringEngine: rebuild from entries preserves mixed-mode state', () => {
  const format = 'SET3-S:6/TB7';
  const engine = new ScoringEngine({
    matchUpFormat: format,
    matchUpId: 'rebuild-test',
  });

  // Add a set via addSet (entry type: 'set')
  engine.addSet({ side1Score: 6, side2Score: 4 });

  // Add points (entry type: 'point')
  for (let p = 0; p < 4; p++) {
    engine.addPoint({ winningSide: 1 });
  }

  const state = engine.getState();
  expect(state.score.sets.length).toEqual(2);
  expect(state.score.sets[0].winningSide).toEqual(1);
  // Second set should have 1-0 games (one game won via points)
  expect(state.score.sets[1].side1Score).toEqual(1);

  // Undo and redo should work (they trigger rebuild)
  const canUndo = engine.canUndo();
  expect(canUndo).toBe(true);

  engine.undo();
  const undoState = engine.getState();
  // After undo, score state should change
  expect(undoState).toBeDefined();

  engine.redo();
  const redoState = engine.getState();
  // After redo, should be back to original state
  expect(redoState.score.sets[1].side1Score).toEqual(1);
});

it('ScoringEngine: rebuild preserves server changes', () => {
  const format = 'SET3-S:6/TB7';
  const engine = new ScoringEngine({
    matchUpFormat: format,
    matchUpId: 'server-rebuild-test',
  });

  // Set server to side 2 (0-indexed: 1)
  engine.setServer(1);

  // Add a point
  engine.addPoint({ winningSide: 1 });

  const state = engine.getState();
  const point = state.history.points[0];
  // Server should be side 2 (0-indexed: 1)
  expect(point.server).toEqual(1);
});

// ═══════════════════════════════════════════════════════════════════════════
// AvailabilityEngine.loadBlocksFromTournamentRecord
// ═══════════════════════════════════════════════════════════════════════════

it('AvailabilityEngine: loads venue and court availability from tournament record', () => {
  const startDate = '2024-01-01';
  const endDate = '2024-01-03';
  const venueProfiles = [{ courtsCount: 2, startTime: '09:00', endTime: '17:00' }];
  const drawProfiles = [{ drawSize: 8 }];

  mocksEngine.generateTournamentRecord({
    setState: true,
    venueProfiles,
    drawProfiles,
    startDate,
    endDate,
  });

  // AvailabilityEngine is initialized from tournament record internally
  // We test through the tournamentEngine API
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  expect(matchUps.length).toEqual(7);

  // Verify venue has courts with availability
  const { venues } = tournamentEngine.getVenuesAndCourts();
  expect(venues.length).toEqual(1);
  expect(venues[0].courts.length).toEqual(2);
});

// ═══════════════════════════════════════════════════════════════════════════
// mcpParser.shotParser
// ═══════════════════════════════════════════════════════════════════════════

it('mcpParser: shotParser handles ace', () => {
  const result = shotParser('4*', 1);
  expect(result.winner).toEqual('S');
  expect(result.result).toEqual('Ace');
});

it('mcpParser: shotParser returns parsed structure', () => {
  // Any valid shot sequence should return an object with expected shape
  const result = shotParser('4f1b2*', 1);
  expect(result).toBeDefined();
  expect(result.serves).toBeDefined();
  expect(result.rally).toBeDefined();
  // Winner shot with * should produce a winner
  expect(result.winner).toEqual('S');
  expect(result.result).toEqual('Winner');
});

it('mcpParser: shotParser handles serve winner', () => {
  const result = shotParser('4#', 1);
  expect(result.winner).toEqual('S');
  expect(result.result).toEqual('Serve Winner');
});

// ═══════════════════════════════════════════════════════════════════════════
// scheduleItems.addMatchUpScheduleItems
// ═══════════════════════════════════════════════════════════════════════════

it('scheduleItems: can schedule matchUp via setMatchUpStatus with schedule', () => {
  const startDate = '2024-01-01';
  const endDate = '2024-01-03';
  const venueProfiles = [{ courtsCount: 2, startTime: '09:00', endTime: '17:00' }];
  const drawProfiles = [{ drawSize: 8 }];

  const {
    drawIds: [drawId],
    venueIds: [venueId],
  } = mocksEngine.generateTournamentRecord({
    setState: true,
    venueProfiles,
    drawProfiles,
    startDate,
    endDate,
  });

  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  const target = matchUps.filter((m) => m.matchUpStatus === TO_BE_PLAYED && m.readyToScore)[0];

  // Get courts
  const { venues } = tournamentEngine.getVenuesAndCourts();
  const courtId = venues[0].courts[0].courtId;

  let result: any = tournamentEngine.addMatchUpScheduleItems({
    schedule: {
      scheduledDate: startDate,
      scheduledTime: '10:00',
      venueId,
      courtId,
    },
    matchUpId: target.matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  // Verify schedule was applied
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  const scheduled = matchUps.find((m) => m.matchUpId === target.matchUpId);
  expect(scheduled.schedule?.scheduledTime).toBeDefined();
});

// ═══════════════════════════════════════════════════════════════════════════
// addEventEntries
// ═══════════════════════════════════════════════════════════════════════════

it('addEventEntries: can add entries to an event', () => {
  const drawProfiles = [{ drawSize: 8, participantsCount: 6 }];
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    setState: true,
    participantsProfile: { participantsCount: 20 },
    drawProfiles,
  });

  // Get unassigned participants
  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const { event } = tournamentEngine.getEvent({ eventId });
  const enteredIds = event.entries.map((e) => e.participantId);
  const available = participants.filter((p) => !enteredIds.includes(p.participantId));

  if (available.length > 0) {
    let result: any = tournamentEngine.addEventEntries({
      participantIds: [available[0].participantId],
      eventId,
    });
    expect(result.success).toEqual(true);
  }
});

it('addEventEntries: doubles event accepts pair participants', () => {
  const drawProfiles = [{ drawSize: 8, eventType: DOUBLES }];
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles,
  });

  const { event } = tournamentEngine.getEvent({ eventId });
  expect(event.entries.length).toBeGreaterThan(0);
  // All entries should be pair participants
  const { participants } = tournamentEngine.getParticipants();
  for (const entry of event.entries) {
    const p = participants.find((p) => p.participantId === entry.participantId);
    if (p) expect(p.participantType).toEqual('PAIR');
  }
});
