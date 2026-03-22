/**
 * Test: Server tracking across mixed scoring modes (addGame, addSet, addPoint)
 *
 * Verifies that the server alternates correctly when mixing game-level,
 * set-level, and point-level score submissions — the scenario that occurs
 * when a tracker joins a match in progress and enters catch-up scores
 * before tracking point-by-point.
 */

import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { describe, test, expect } from 'vitest';

/** Win a game by playing 4 points (assumes no-deuce scenario) */
function winGameByPoints(engine: ScoringEngine, winner: 0 | 1) {
  for (let i = 0; i < 4; i++) {
    engine.addPoint({ winner });
  }
}

describe('Server tracking: mixed addGame + addPoint', () => {
  test('server alternates correctly after addGame', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Game 0: side 0 serves (derived), won by side 0
    engine.addGame({ winner: 0 });
    // Game 1: side 1 should serve
    expect(engine.getNextServer()).toBe(1);

    // Game 1: won by side 1 via addGame
    engine.addGame({ winner: 1 });
    // Game 2: side 0 should serve
    expect(engine.getNextServer()).toBe(0);
  });

  test('server alternates correctly when addGame followed by addPoint', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Add 2 games via addGame: game 0 (server 0), game 1 (server 1)
    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 1 });

    // Game 2: side 0 should serve
    expect(engine.getNextServer()).toBe(0);

    // Play game 2 point-by-point — all points should show server = 0
    engine.addPoint({ winner: 0 });
    let result: any = engine.getState().history?.points.at(-1);
    expect(result.server).toBe(0);

    engine.addPoint({ winner: 0 });
    result = engine.getState().history?.points.at(-1);
    expect(result.server).toBe(0);
  });

  test('server alternates after odd number of addGame calls', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // 3 games via addGame (server: 0, 1, 0)
    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 1 });
    engine.addGame({ winner: 0 });

    // Game 3: side 1 should serve
    expect(engine.getNextServer()).toBe(1);

    // First point of game 3 should have server = 1
    engine.addPoint({ winner: 0 });
    let result: any = engine.getState().history?.points.at(-1);
    expect(result.server).toBe(1);
  });

  test('2 addGame then track multiple games point-by-point: server correct on every point', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Scenario: tracker enters first 2 games via addGame (1-1), then tracks point-by-point
    engine.addGame({ winner: 0 }); // game 0: server 0
    engine.addGame({ winner: 1 }); // game 1: server 1

    // Game 2: server should be 0 (2 games played, even)
    expect(engine.getNextServer()).toBe(0);

    // Play game 2 point-by-point (all 4 points server = 0)
    for (let i = 0; i < 4; i++) {
      engine.addPoint({ winner: 0 });
      let result: any = engine.getState().history?.points.at(-1);
      expect(result.server).toBe(0);
    }
    // Score should be 2-1
    expect(engine.getScore().games).toEqual([2, 1]);

    // Game 3: server should be 1 (3 games played, odd)
    expect(engine.getNextServer()).toBe(1);

    // Play game 3 point-by-point (all 4 points server = 1)
    for (let i = 0; i < 4; i++) {
      engine.addPoint({ winner: 1 });
      let result: any = engine.getState().history?.points.at(-1);
      expect(result.server).toBe(1);
    }
    // Score should be 2-2
    expect(engine.getScore().games).toEqual([2, 2]);

    // Game 4: server should be 0 again
    expect(engine.getNextServer()).toBe(0);

    engine.addPoint({ winner: 0 });
    let result: any = engine.getState().history?.points.at(-1);
    expect(result.server).toBe(0);
  });

  test('1 addGame then track: server correct through deuce game', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Enter game 0 via addGame
    engine.addGame({ winner: 0 }); // game 0: server 0

    // Game 1: server should be 1
    expect(engine.getNextServer()).toBe(1);

    // Play a deuce game — server stays 1 throughout
    // 0-15, 15-15, 30-15, 30-30, 40-30, 40-40 (deuce), AD-40, game
    const points: (0 | 1)[] = [1, 0, 0, 1, 0, 1, 0, 0];
    for (const winner of points) {
      engine.addPoint({ winner });
      let result: any = engine.getState().history?.points.at(-1);
      expect(result.server).toBe(1);
    }

    // Game 2: server should be 0
    expect(engine.getNextServer()).toBe(0);
  });

  test('2 addGame (same winner) then track: server independent of who won', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Both games won by same player — server still alternates by game count
    engine.addGame({ winner: 0 }); // game 0: server 0
    engine.addGame({ winner: 0 }); // game 1: server 1

    // Score: 2-0. Game 2: server should be 0
    expect(engine.getNextServer()).toBe(0);

    engine.addPoint({ winner: 1 });
    let result: any = engine.getState().history?.points.at(-1);
    expect(result.server).toBe(0);
  });
});

describe('Server tracking: cross-set alternation via addSet', () => {
  test('server correct at start of set 2 after even-game set (6-4)', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Set 1: 6-4 = 10 games (even). Server pattern: 0,1,0,1,0,1,0,1,0,1
    // Last game served by side 1. Next game should be side 0.
    engine.addSet({ side1Score: 6, side2Score: 4 });

    expect(engine.getNextServer()).toBe(0);
  });

  test('server correct at start of set 2 after odd-game set (6-3)', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Set 1: 6-3 = 9 games (odd). Server pattern: 0,1,0,1,0,1,0,1,0
    // Last game served by side 0. Next game should be side 1.
    engine.addSet({ side1Score: 6, side2Score: 3 });

    expect(engine.getNextServer()).toBe(1);
  });

  test('server correct at start of set 2 after tiebreak set (7-6)', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Set 1: 7-6 = 13 games (odd, tiebreak counts as a game).
    // After tiebreak, next game should be side 1.
    engine.addSet({ side1Score: 7, side2Score: 6, side1TiebreakScore: 7, side2TiebreakScore: 5 });

    expect(engine.getNextServer()).toBe(1);
  });

  test('server correct at start of set 3 after two sets with odd games', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Set 1: 6-3 = 9 games, Set 2: 3-6 = 9 games
    engine.addSet({ side1Score: 6, side2Score: 3 });
    engine.addSet({ side1Score: 3, side2Score: 6 });

    // Total previous games = 18 (even). Server should be 0.
    expect(engine.getNextServer()).toBe(0);
  });

  test('server correct at start of set 3 after mixed game counts', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Set 1: 6-4 = 10, Set 2: 4-6 = 10
    engine.addSet({ side1Score: 6, side2Score: 4 });
    engine.addSet({ side1Score: 4, side2Score: 6 });

    // Total previous games = 20 (even). Server should be 0.
    expect(engine.getNextServer()).toBe(0);
  });

  test('server correct at start of set 3 after odd total games', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Set 1: 6-3 = 9, Set 2: 2-6 = 8
    engine.addSet({ side1Score: 6, side2Score: 3 });
    engine.addSet({ side1Score: 2, side2Score: 6 });

    // Total previous games = 17 (odd). Server should be 1.
    expect(engine.getNextServer()).toBe(1);
  });
});

describe('Server tracking: addSet then addPoint', () => {
  test('points in set 2 have correct server after odd-game set 1', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Set 1: 6-3 = 9 games (odd)
    engine.addSet({ side1Score: 6, side2Score: 3 });

    // First point of set 2 game 0 — server should be 1
    engine.addPoint({ winner: 0 });
    let result: any = engine.getState().history?.points.at(-1);
    expect(result.server).toBe(1);
  });

  test('points in set 2 have correct server after even-game set 1', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Set 1: 6-4 = 10 games (even)
    engine.addSet({ side1Score: 6, side2Score: 4 });

    // First point of set 2 game 0 — server should be 0
    engine.addPoint({ winner: 0 });
    let result: any = engine.getState().history?.points.at(-1);
    expect(result.server).toBe(0);
  });

  test('server alternates across multiple games in set 2 after addSet', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Set 1: 6-3 = 9 games (odd) → set 2 starts with server 1
    engine.addSet({ side1Score: 6, side2Score: 3 });

    // Game 0 of set 2: server 1
    winGameByPoints(engine, 0);
    let result: any = engine.getState().history?.points[0];
    expect(result.server).toBe(1);

    // Game 1 of set 2: server 0
    engine.addPoint({ winner: 0 });
    result = engine.getState().history?.points.at(-1);
    expect(result.server).toBe(0);
  });
});

describe('Server tracking: addSet then addGame then addPoint', () => {
  test('server correct after addSet + addGame + addPoint (odd prior games)', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Set 1: 6-3 = 9 games (odd). Set 2 starts with server 1.
    engine.addSet({ side1Score: 6, side2Score: 3 });

    // Game 0 of set 2: server 1 (9 total games, odd)
    engine.addGame({ winner: 0 });
    // Game 1 of set 2: server 0 (10 total games, even)
    expect(engine.getNextServer()).toBe(0);

    engine.addGame({ winner: 1 });
    // Game 2 of set 2: server 1 (11 total games, odd)
    expect(engine.getNextServer()).toBe(1);

    // Point-by-point for game 2: server should be 1
    engine.addPoint({ winner: 0 });
    let result: any = engine.getState().history?.points.at(-1);
    expect(result.server).toBe(1);
  });

  test('server correct through full mixed scenario', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Set 1: entered as complete set (6-3 = 9 games, odd)
    engine.addSet({ side1Score: 6, side2Score: 3 });

    // Set 2: first 2 games entered via addGame
    // Game 0 (set 2): server 1
    engine.addGame({ winner: 0 });
    // Game 1 (set 2): server 0
    engine.addGame({ winner: 1 });

    // Game 2 (set 2): server 1, play point-by-point
    expect(engine.getNextServer()).toBe(1);
    winGameByPoints(engine, 0);

    // Game 3 (set 2): server 0
    expect(engine.getNextServer()).toBe(0);
    winGameByPoints(engine, 1);

    // Game 4 (set 2): server 1
    expect(engine.getNextServer()).toBe(1);
  });
});

describe('Server tracking: point-by-point across sets', () => {
  test('server correct across set boundary (6-0 = even games)', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Play set 1: 6-0 via point-by-point (6 games = even)
    for (let g = 0; g < 6; g++) {
      winGameByPoints(engine, 0);
    }

    const state = engine.getState();
    expect(state.score.sets[0].winningSide).toBe(1);
    expect(state.score.sets[0].side1Score).toBe(6);

    // Set 2 game 0: server should be 0 (6 games total, even)
    expect(engine.getNextServer()).toBe(0);

    // Verify with actual point
    engine.addPoint({ winner: 0 });
    let result: any = engine.getState().history?.points.at(-1);
    expect(result.server).toBe(0);
  });

  test('server correct across set boundary via addSet (odd games)', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Set 1: 6-3 = 9 games via addSet
    engine.addSet({ side1Score: 6, side2Score: 3 });

    // Set 2 game 0: server should be 1 (9 games total, odd)
    expect(engine.getNextServer()).toBe(1);
  });
});

describe('Server tracking: initial server = 1', () => {
  test('server alternates correctly when first point explicitly sets server=1 (no prior sets)', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Game 0: explicitly server = 1
    engine.addPoint({ winner: 0, server: 1 });
    let result: any = engine.getState().history?.points.at(-1);
    expect(result.server).toBe(1);

    // Remaining points of game 0: server should stay 1
    for (let i = 0; i < 3; i++) {
      engine.addPoint({ winner: 0 });
    }
    result = engine.getState().history?.points.at(-1);
    expect(result.server).toBe(1);

    // Game 1: server should be 0 (alternated)
    engine.addPoint({ winner: 0 });
    result = engine.getState().history?.points.at(-1);
    expect(result.server).toBe(0);
  });

  test('cross-set server correct when initial server is side 1 (no prior sets)', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Game 0: explicitly server = 1
    // Play full set 1 as 6-0 (6 games, even)
    // Games served by: 1, 0, 1, 0, 1, 0
    engine.addPoint({ winner: 0, server: 1 });
    for (let i = 0; i < 3; i++) engine.addPoint({ winner: 0 });
    // Games 1-5
    for (let g = 1; g < 6; g++) {
      winGameByPoints(engine, 0);
    }

    // Set 2 game 0: with side 1 starting the match and 6 games played (even),
    // server should be 1 again
    expect(engine.getNextServer()).toBe(1);
  });

  test('cross-set server correct when explicit server matches base derivation', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Set 1: 6-3 = 9 games (odd). Base derivation for game 0 of set 2 = 1.
    engine.addSet({ side1Score: 6, side2Score: 3 });

    // First point with explicit server = 1 (matches base, no flip needed)
    engine.addPoint({ winner: 0, server: 1 });
    let result: any = engine.getState().history?.points.at(-1);
    expect(result.server).toBe(1);

    // Rest of game 0
    for (let i = 0; i < 3; i++) {
      engine.addPoint({ winner: 0 });
    }
    result = engine.getState().history?.points.at(-1);
    expect(result.server).toBe(1);

    // Game 1: server should alternate to 0
    engine.addPoint({ winner: 0 });
    result = engine.getState().history?.points.at(-1);
    expect(result.server).toBe(0);
  });

  test('cross-set server correct when explicit server disagrees with base derivation', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Set 1: 6-3 = 9 games (odd). Base derivation for game 0 of set 2 = 1.
    engine.addSet({ side1Score: 6, side2Score: 3 });

    // First point with explicit server = 0 (disagrees with base → flip)
    engine.addPoint({ winner: 0, server: 0 });
    let result: any = engine.getState().history?.points.at(-1);
    expect(result.server).toBe(0);

    // Rest of game 0: server should stay 0
    for (let i = 0; i < 3; i++) {
      engine.addPoint({ winner: 0 });
    }
    result = engine.getState().history?.points.at(-1);
    expect(result.server).toBe(0);

    // Game 1: server should alternate to 1
    engine.addPoint({ winner: 0 });
    result = engine.getState().history?.points.at(-1);
    expect(result.server).toBe(1);
  });
});

describe('setServer(): mid-match server correction', () => {
  test('setServer at start of match sets initial server', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Default: side 0 serves first
    expect(engine.getNextServer()).toBe(0);

    // Override: side 1 serves first
    engine.setServer(1);
    expect(engine.getNextServer()).toBe(1);

    // Play game 0 point-by-point — all server = 1
    for (let i = 0; i < 4; i++) {
      engine.addPoint({ winner: 0 });
      let result: any = engine.getState().history?.points.at(-1);
      expect(result.server).toBe(1);
    }

    // Game 1: server alternates to 0
    expect(engine.getNextServer()).toBe(0);
  });

  test('setServer corrects wrong server at start of set 2', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Set 1: 6-3 = 9 games (odd). Derived server for set 2 = 1.
    engine.addSet({ side1Score: 6, side2Score: 3 });
    expect(engine.getNextServer()).toBe(1);

    // But the players started with the wrong server! Correct it to 0.
    engine.setServer(0);
    expect(engine.getNextServer()).toBe(0);

    // Play game 0 of set 2 — all points server = 0
    for (let i = 0; i < 4; i++) {
      engine.addPoint({ winner: 0 });
      let result: any = engine.getState().history?.points.at(-1);
      expect(result.server).toBe(0);
    }

    // Game 1: server alternates to 1
    expect(engine.getNextServer()).toBe(1);
    engine.addPoint({ winner: 0 });
    let result: any = engine.getState().history?.points.at(-1);
    expect(result.server).toBe(1);
  });

  test('setServer mid-set corrects server going forward', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Play 2 games, then realize server was wrong
    engine.addGame({ winner: 0 }); // game 0: server 0
    engine.addGame({ winner: 1 }); // game 1: server 1

    // Game 2 would normally be server 0, but correct it to 1
    expect(engine.getNextServer()).toBe(0);
    engine.setServer(1);
    expect(engine.getNextServer()).toBe(1);

    // Play game 2 point-by-point — server = 1
    for (let i = 0; i < 4; i++) {
      engine.addPoint({ winner: 0 });
      let result: any = engine.getState().history?.points.at(-1);
      expect(result.server).toBe(1);
    }

    // Game 3: server alternates to 0
    expect(engine.getNextServer()).toBe(0);
  });

  test('setServer survives undo/redo', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Set server to 1
    engine.setServer(1);
    expect(engine.getNextServer()).toBe(1);

    // Play a point
    engine.addPoint({ winner: 0 });
    let result: any = engine.getState().history?.points.at(-1);
    expect(result.server).toBe(1);

    // Undo the point — setServer should still be in effect
    engine.undo();
    expect(engine.getNextServer()).toBe(1);

    // Undo the setServer — should revert to default (side 0)
    engine.undo();
    expect(engine.getNextServer()).toBe(0);

    // Redo the setServer — should restore side 1
    engine.redo();
    expect(engine.getNextServer()).toBe(1);
  });

  test('setServer can be called multiple times (last wins)', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    engine.setServer(1);
    expect(engine.getNextServer()).toBe(1);

    engine.setServer(0);
    expect(engine.getNextServer()).toBe(0);

    engine.setServer(1);
    expect(engine.getNextServer()).toBe(1);
  });

  test('setServer overrides first-point inference', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // First point explicitly sets server = 1 (would normally set the flip)
    engine.addPoint({ winner: 0, server: 1 });

    // Now override via setServer to say side 0 should serve game 0
    // (i.e., the first point's server was "wrong")
    engine.setServer(0);

    // Still in game 0 (only 1 point played), server should now be 0
    engine.addPoint({ winner: 0 });
    let result: any = engine.getState().history?.points.at(-1);
    expect(result.server).toBe(0);
  });

  test('setServer does not retroactively change points recorded before it', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Play set 1 point-by-point: 6-0 (server starts as 0)
    // Servers: game 0=0, game 1=1, game 2=0, game 3=1, game 4=0, game 5=1
    for (let g = 0; g < 6; g++) {
      winGameByPoints(engine, 0);
    }

    // Verify set 1 points have correct servers
    const set1Points = engine.getState().history?.points || [];
    expect(set1Points.length).toBe(24); // 6 games * 4 points
    // Game 0 points should have server 0
    expect(set1Points[0].server).toBe(0);
    expect(set1Points[3].server).toBe(0);
    // Game 1 points should have server 1
    expect(set1Points[4].server).toBe(1);
    expect(set1Points[7].server).toBe(1);

    // Now at start of set 2, correct the server (set 1 had 6 games = even,
    // so base says server 0; override to 1)
    engine.setServer(1);
    expect(engine.getNextServer()).toBe(1);

    // Play some points in set 2
    winGameByPoints(engine, 0);

    // Verify set 1 points are UNCHANGED (not retroactively flipped)
    const allPoints = engine.getState().history?.points || [];
    expect(allPoints[0].server).toBe(0); // game 0 set 1
    expect(allPoints[4].server).toBe(1); // game 1 set 1

    // Verify set 2 points have the corrected server
    expect(allPoints[24].server).toBe(1); // game 0 set 2
    expect(allPoints[27].server).toBe(1); // still game 0 set 2
  });

  test('undo past setServer restores first-point inference', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Play a point with explicit server = 1 (sets first-point inference)
    engine.addPoint({ winner: 0, server: 1 });
    expect(engine.getNextServer()).toBe(1); // still game 0

    // Complete game 0
    for (let i = 0; i < 3; i++) engine.addPoint({ winner: 0 });

    // Game 1: first-point inference gives server 0
    expect(engine.getNextServer()).toBe(0);

    // Override to server 1
    engine.setServer(1);
    expect(engine.getNextServer()).toBe(1);

    // Undo the setServer — should restore first-point inference (server 0)
    engine.undo();
    expect(engine.getNextServer()).toBe(0);
  });

  test('setServer after completed sets: undo/redo rebuilds correctly', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Set 1: 6-3 = 9 games (odd). Side 2 won.
    engine.addSet({ side1Score: 3, side2Score: 6, winningSide: 2 });

    // Set 2: 6-4 = 10 games (even). Side 1 won.
    engine.addSet({ side1Score: 6, side2Score: 4, winningSide: 1 });

    // Total prior games = 19 (odd). Set 3 game 0: base server = 1.
    expect(engine.getNextServer()).toBe(1);

    // Override to server 0
    engine.setServer(0);
    expect(engine.getNextServer()).toBe(0);

    // Play a point
    engine.addPoint({ winner: 0 });
    let result: any = engine.getState().history?.points.at(-1);
    expect(result.server).toBe(0);

    // Undo point + setServer — back to derived server 1
    engine.undo(); // undo point
    engine.undo(); // undo setServer
    expect(engine.getNextServer()).toBe(1);

    // Redo setServer — back to overridden 0
    engine.redo();
    expect(engine.getNextServer()).toBe(0);
  });

  test('setServer with no format structure is a no-op', () => {
    // Construct engine then clear cached format to test early return
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    (engine as any).cachedFormatStructure = undefined;

    engine.setServer(1);
    // Should not throw, and state should be unchanged
    expect(engine.getState().serverFlip).toBeUndefined();
  });
});
