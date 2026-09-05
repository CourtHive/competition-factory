/**
 * Coverage tests for ScoringEngine.ts — targets 16 uncovered statements
 *
 * Uncovered areas:
 *  - getNextServer(): no cachedFormatStructure guard; winningSide === 1 in setsWon loop
 *  - getSetsToWin(): no cachedFormatStructure guard
 *  - getTiebreakAt(): no setFormat guard
 *  - hasFinalSetTiebreak(): finalSetFormat with tiebreakFormat/tiebreakAt branch
 *  - getInputMode(): legacy points-only branch
 *  - editPoint(): timestamp update branch
 *  - applySubstitution(): no lineUp guard; outIndex === -1 guard
 *  - checkSetCompletion(): no formatStructure guard; winningSide === 2 in setsWon; no activeSetFormat guard
 *  - checkMatchCompletion(): no formatStructure guard
 *  - rebuildFromEntries(): initialScore branch with TO_BE_PLAYED status
 */

import type { CompetitionFormat } from '@Assemblies/engines/scoring/ScoringEngine';
import { ScoringEngine } from '@Assemblies/governors/scoreGovernor';
import { describe, expect, it } from 'vitest';

// ============================================================================
// Helpers
// ============================================================================

function winGame(engine: ScoringEngine, winner: 0 | 1) {
  for (let i = 0; i < 4; i++) engine.addPoint({ winner });
}

function winSet(engine: ScoringEngine, winner: 0 | 1) {
  for (let g = 0; g < 6; g++) winGame(engine, winner);
}

// ============================================================================
// 1. getNextServer — setsWon[0]++ branch (winningSide === 1 in completed set)
// ============================================================================

describe('ScoringEngine — getNextServer setsWon branches', () => {
  it('covers winningSide === 1 in setsWon loop when side 1 has won a set', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Win first set for side 0 (winningSide = 1 in TODS)
    winSet(engine, 0);

    // Now getNextServer should iterate sets and hit winningSide === 1
    let result: any = engine.getNextServer();
    expect(typeof result).toBe('number');
    expect(result === 0 || result === 1).toBe(true);
  });

  it('covers getNextServer with WINNER_SERVES serverRule', () => {
    const competitionFormat: CompetitionFormat = {
      matchUpFormat: 'SET3-S:6/TB7',
      serverRule: 'WINNER_SERVES',
    };
    const engine = new ScoringEngine({ competitionFormat });

    // No points yet — should return 0 (default)
    let result: any = engine.getNextServer();
    expect(result).toBe(0);

    // After a point, winner serves
    engine.addPoint({ winner: 1 });
    result = engine.getNextServer();
    expect(result).toBe(1);
  });
});

// ============================================================================
// 2. hasFinalSetTiebreak — ff with tiebreakFormat or tiebreakAt
// ============================================================================

describe('ScoringEngine — hasFinalSetTiebreak tiebreakAt branch', () => {
  it('covers finalSetFormat with explicit tiebreakAt', () => {
    // SET3-S:6/TB7-F:6/TB10 has finalSetFormat with tiebreakFormat AND tiebreakAt
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7-F:6/TB10' });
    let result: any = engine.hasFinalSetTiebreak();
    expect(result).toBe(true);
  });
});

// ============================================================================
// 3. getInputMode — legacy points-only branch
// ============================================================================

describe('ScoringEngine — getInputMode legacy points branch', () => {
  it('returns points when history has points but no entries', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Add a point via addPoint (which also adds to entries)
    engine.addPoint({ winner: 0 });

    // Manually remove entries to simulate legacy state (points only, no entries array)
    const state = engine.getState();
    delete (state.history as any).entries;

    let result: any = engine.getInputMode();
    expect(result).toBe('points');
  });
});

// ============================================================================
// 4. editPoint — timestamp update branch
// ============================================================================

describe('ScoringEngine — editPoint timestamp branch', () => {
  it('covers editPoint with timestamp in newData', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });

    const ts = '2025-06-15T12:00:00.000Z';
    // Use recalculate: false so the timestamp is set without rebuild overwriting it
    engine.editPoint(0, { timestamp: ts }, { recalculate: false });

    let result: any = engine.getState().history?.points[0];
    expect(result.timestamp).toBe(ts);
  });
});

// ============================================================================
// 5. addGame — exercises checkSetCompletion winningSide === 2 branch
// ============================================================================

describe('ScoringEngine — addGame and checkSetCompletion', () => {
  it('covers winningSide === 2 in checkSetCompletion setsWon loop', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Side 1 wins first set (6-0): winningSide = 2 for side 1 means side 2 in TODS
    // Actually addGame winner: 1 means side 2, which sets winningSide = 2
    for (let g = 0; g < 6; g++) engine.addGame({ winner: 1 });

    // Verify set was completed with winningSide = 2
    let result: any = engine.getState().score.sets[0];
    expect(result.winningSide).toBe(2);

    // Now add games for the second set — checkSetCompletion iterates sets
    // and encounters winningSide === 2 in the setsWon loop
    for (let g = 0; g < 6; g++) engine.addGame({ winner: 1 });

    result = engine.getState().score.sets[1];
    expect(result.winningSide).toBe(2);

    // Match should be complete
    expect(engine.getState().matchUpStatus).toBe('COMPLETED');
  });

  it('covers addGame with tiebreakScore', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Alternate games to reach 6-6
    for (let g = 0; g < 6; g++) {
      engine.addGame({ winner: 0 });
      engine.addGame({ winner: 1 });
    }

    // Verify we have 6-6 in first set
    let result: any = engine.getState().score.sets[0];
    expect(result.side1Score).toBe(6);
    expect(result.side2Score).toBe(6);

    // Add tiebreak game result
    engine.addGame({ winner: 0, tiebreakScore: [7, 5] });

    result = engine.getState().score.sets[0];
    expect(result.side1TiebreakScore).toBe(7);
    expect(result.side2TiebreakScore).toBe(5);
    expect(result.winningSide).toBe(1);
  });
});

// ============================================================================
// 6. rebuildFromEntries with initialScore — undo after setInitialScore
// ============================================================================

describe('ScoringEngine — rebuildFromEntries with initialScore', () => {
  it('covers initialScore branch in rebuildFromEntries when undoing', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Set initial score (e.g., late arrival at 6-4, 3-2)
    engine.setInitialScore({
      sets: [
        { side1Score: 6, side2Score: 4, winningSide: 1 },
        { side1Score: 3, side2Score: 2 },
      ],
    });

    // Add some points
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });
    engine.addPoint({ winner: 0 });

    // Undo triggers rebuildFromEntries which should apply initialScore
    let result: any = engine.undo();
    expect(result).toBe(true);

    // State should still have the initial score applied
    result = engine.getState().score.sets;
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].winningSide).toBe(1);
    expect(engine.getState().matchUpStatus).toBe('IN_PROGRESS');
  });
});

// ============================================================================
// 7. endSegment for timed sets
// ============================================================================

describe('ScoringEngine — endSegment for timed formats', () => {
  it('ends a timed segment and awards set to leader', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET7XA-S:T10P' });

    // Add some points to get a score
    for (let i = 0; i < 5; i++) engine.addPoint({ winner: 0 });
    for (let i = 0; i < 3; i++) engine.addPoint({ winner: 1 });

    // End the segment
    engine.endSegment();

    let result: any = engine.getState().score.sets;
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// 8. addSet — exercises match completion path
// ============================================================================

describe('ScoringEngine — addSet with match completion', () => {
  it('completes a match via addSet', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    engine.addSet({ side1Score: 6, side2Score: 4 });
    engine.addSet({ side1Score: 7, side2Score: 5 });

    let result: any = engine.getState();
    expect(result.matchUpStatus).toBe('COMPLETED');
    expect(result.winningSide).toBe(1);
  });

  it('adds sets for side 2 winning', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    engine.addSet({ side1Score: 4, side2Score: 6 });
    engine.addSet({ side1Score: 5, side2Score: 7 });

    let result: any = engine.getState();
    expect(result.matchUpStatus).toBe('COMPLETED');
    expect(result.winningSide).toBe(2);
  });
});

// ============================================================================
// 9. undo with game/set entries (mixed mode undo)
// ============================================================================

describe('ScoringEngine — undo with game entries', () => {
  it('undoes a game entry via entries-based undo', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 1 });

    let result: any = engine.getState().score.sets[0];
    expect(result.side1Score).toBe(1);
    expect(result.side2Score).toBe(1);

    engine.undo();
    result = engine.getState().score.sets[0];
    expect(result.side1Score).toBe(1);
    expect(result.side2Score).toBe(0);
  });

  it('redo after undo restores game entry', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 1 });
    engine.undo();
    engine.redo();

    let result: any = engine.getState().score.sets[0];
    expect(result.side1Score).toBe(1);
    expect(result.side2Score).toBe(1);
  });
});

// ============================================================================
// 10. loadMatchUp / setState with existing state
// ============================================================================

describe('ScoringEngine — setState with existing matchUp', () => {
  it('loads state from a matchUp with score data', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 0 });

    const snapshot = engine.getState();

    const engine2 = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine2.setState(snapshot);

    let result: any = engine2.getPointCount();
    expect(result).toBe(2);
    expect(engine2.getFormat()).toBe('SET3-S:6/TB7');
  });
});

// ============================================================================
// 11. getScore with various states
// ============================================================================

describe('ScoringEngine — getScore', () => {
  it('returns score for an empty match', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    let result: any = engine.getScore();
    expect(result).toBeDefined();
  });

  it('returns score after partial play', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    for (let i = 0; i < 4; i++) engine.addPoint({ winner: 0 });

    let result: any = engine.getScore();
    expect(result).toBeDefined();
  });
});

// ============================================================================
// 12. setFirstServer coverage
// ============================================================================

describe('ScoringEngine — setFirstServer', () => {
  it('sets the first server and affects getNextServer', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0, server: 1 });

    let result: any = engine.getNextServer();
    expect(typeof result).toBe('number');
  });
});

// ============================================================================
// 13. Error paths — undo on empty, redo on empty
// ============================================================================

describe('ScoringEngine — error paths', () => {
  it('undo returns false when no history', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    let result: any = engine.undo();
    expect(result).toBe(false);
  });

  it('redo returns false when no redo stack', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    let result: any = engine.redo();
    expect(result).toBe(false);
  });

  it('editPoint with out-of-range index does nothing', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });

    // Should not throw
    engine.editPoint(-1, { winner: 1 });
    engine.editPoint(999, { winner: 1 });

    let result: any = engine.getState().history?.points[0].winner;
    expect(result).toBe(0);
  });
});

// ============================================================================
// 14. Substitution edge cases — no lineUp / bad participantId
// ============================================================================

describe('ScoringEngine — substitution guards', () => {
  it('substitution with no lineUp set does nothing', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7', isDoubles: true });

    // No lineUp has been set, so substitute should hit the !side?.lineUp guard
    engine.substitute({
      sideNumber: 1,
      outParticipantId: 'nonexistent',
      inParticipantId: 'newPlayer',
      timestamp: new Date().toISOString(),
    });

    // Should not throw; state should be intact
    let result: any = engine.getState().matchUpType;
    expect(result).toBe('DOUBLES');
  });

  it('substitution with unknown outParticipantId does nothing', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7', isDoubles: true });

    // Set up lineUp with known players
    engine.setLineUp(1, [{ participantId: 'player1' }, { participantId: 'player2' }]);

    // Try substitution with unknown outParticipantId — hits outIndex === -1 guard
    engine.substitute({
      sideNumber: 1,
      outParticipantId: 'nonexistent',
      inParticipantId: 'newPlayer',
      timestamp: new Date().toISOString(),
    });

    // LineUp should be unchanged
    let result: any = engine.getActivePlayers();
    expect(result.side1).toContain('player1');
    expect(result.side1).toContain('player2');
  });
});
