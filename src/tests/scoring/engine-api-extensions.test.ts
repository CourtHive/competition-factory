import { ScoringEngine } from '@Assemblies/governors/scoreGovernor';
import { describe, it, expect } from 'vitest';

// Helper: play N points where side 0 wins all (quick game win in tennis)
function winGame(engine: ScoringEngine, server: 0 | 1 = 0): void {
  for (let i = 0; i < 4; i++) {
    engine.addPoint({ winner: server });
  }
}

// Helper: play a full set (6-0 loveset for side 0)
function winSet(engine: ScoringEngine): void {
  for (let g = 0; g < 6; g++) {
    winGame(engine, 0);
  }
}

// ============================================================================
// Format Introspection
// ============================================================================

describe('Format Introspection', () => {
  describe('isNoAd()', () => {
    it('returns false for standard AD format', () => {
      const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
      expect(engine.isNoAd()).toBe(false);
    });

    it('returns true for NoAD format', () => {
      const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6NOAD/TB7' });
      expect(engine.isNoAd()).toBe(true);
    });
  });

  describe('getSetsToWin()', () => {
    it('returns 2 for best-of-3', () => {
      const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
      expect(engine.getSetsToWin()).toBe(2);
    });

    it('returns 3 for best-of-5', () => {
      const engine = new ScoringEngine({ matchUpFormat: 'SET5-S:6/TB7' });
      expect(engine.getSetsToWin()).toBe(3);
    });

    it('returns 1 for single set', () => {
      const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:6/TB7' });
      expect(engine.getSetsToWin()).toBe(1);
    });
  });

  describe('getTiebreakAt()', () => {
    it('returns 6 for standard tennis', () => {
      const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
      expect(engine.getTiebreakAt()).toBe(6);
    });

    it('returns null for tiebreak-only format (pickleball)', () => {
      const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:TB11' });
      expect(engine.getTiebreakAt()).toBeNull();
    });

    it('returns 4 for SET3-S:4NOAD/TB7@3', () => {
      const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:4NOAD/TB7@3' });
      expect(engine.getTiebreakAt()).toBe(3);
    });
  });

  describe('hasFinalSetTiebreak()', () => {
    it('returns true when final set has tiebreak', () => {
      const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
      expect(engine.hasFinalSetTiebreak()).toBe(true);
    });

    it('returns false for advantage final set', () => {
      const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7-F:6' });
      expect(engine.hasFinalSetTiebreak()).toBe(false);
    });

    it('returns true for match tiebreak final set', () => {
      const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7-F:TB10' });
      expect(engine.hasFinalSetTiebreak()).toBe(true);
    });
  });

  describe('getFormatStructure()', () => {
    it('returns parsed structure for valid format', () => {
      const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
      const fs = engine.getFormatStructure();
      expect(fs).toBeDefined();
      expect(fs!.bestOf).toBe(3);
      expect(fs!.setFormat?.setTo).toBe(6);
      expect(fs!.setFormat?.tiebreakFormat?.tiebreakTo).toBe(7);
    });

    it('returns undefined for invalid format', () => {
      const engine = new ScoringEngine({ matchUpFormat: 'INVALID' });
      const fs = engine.getFormatStructure();
      expect(fs).toBeUndefined();
    });
  });
});

// ============================================================================
// getScore() pointDisplay
// ============================================================================

describe('getScore() pointDisplay', () => {
  it('returns 0-0 display at start of game', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 }); // 15-0
    const score = engine.getScore();
    expect(score.pointDisplay).toEqual(['15', '0']);
  });

  it('returns correct display at 30-15', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 }); // 15-0
    engine.addPoint({ winner: 0 }); // 30-0
    engine.addPoint({ winner: 1 }); // 30-15
    const score = engine.getScore();
    expect(score.pointDisplay).toEqual(['30', '15']);
  });

  it('returns 40-40 at deuce', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    // Get to deuce: 3 points each
    engine.addPoint({ winner: 0 }); // 15-0
    engine.addPoint({ winner: 0 }); // 30-0
    engine.addPoint({ winner: 0 }); // 40-0
    engine.addPoint({ winner: 1 }); // 40-15
    engine.addPoint({ winner: 1 }); // 40-30
    engine.addPoint({ winner: 1 }); // 40-40 (deuce)
    const score = engine.getScore();
    expect(score.pointDisplay).toEqual(['40', '40']);
  });

  it('returns A-40 at advantage', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    // Get to deuce then advantage side 1
    engine.addPoint({ winner: 0 }); // 15-0
    engine.addPoint({ winner: 0 }); // 30-0
    engine.addPoint({ winner: 0 }); // 40-0
    engine.addPoint({ winner: 1 }); // 40-15
    engine.addPoint({ winner: 1 }); // 40-30
    engine.addPoint({ winner: 1 }); // 40-40 (deuce)
    engine.addPoint({ winner: 0 }); // A-40
    const score = engine.getScore();
    expect(score.pointDisplay).toEqual(['A', '40']);
  });

  it('returns 40-A at advantage for side 2', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    // Get to deuce then advantage side 2
    engine.addPoint({ winner: 0 }); // 15-0
    engine.addPoint({ winner: 0 }); // 30-0
    engine.addPoint({ winner: 0 }); // 40-0
    engine.addPoint({ winner: 1 }); // 40-15
    engine.addPoint({ winner: 1 }); // 40-30
    engine.addPoint({ winner: 1 }); // 40-40 (deuce)
    engine.addPoint({ winner: 1 }); // 40-A
    const score = engine.getScore();
    expect(score.pointDisplay).toEqual(['40', 'A']);
  });

  it('returns numeric display in tiebreak', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    // Get to 6-6 tiebreak
    for (let g = 0; g < 6; g++) {
      winGame(engine, 0); // side 0 wins service game
      winGame(engine, 1); // side 1 wins service game
    }
    // Now in tiebreak at 6-6
    engine.addPoint({ winner: 0 }); // 1-0 in tiebreak
    const score = engine.getScore();
    expect(score.pointDisplay).toEqual(['1', '0']);
  });

  it('returns undefined for completed match', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    winSet(engine); // 6-0 first set
    winSet(engine); // 6-0 second set, match complete
    const score = engine.getScore();
    expect(score.pointDisplay).toBeUndefined();
  });

  it('returns undefined before any points', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    const score = engine.getScore();
    expect(score.pointDisplay).toBeUndefined();
  });
});

// ============================================================================
// getScore() situation
// ============================================================================

describe('getScore() situation', () => {
  it('returns undefined before match starts', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    const score = engine.getScore();
    expect(score.situation).toBeUndefined();
  });

  it('returns all false at start of match', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 }); // 15-0
    const sit = engine.getScore().situation;
    expect(sit).toBeDefined();
    expect(sit!.isBreakPoint).toBe(false);
    expect(sit!.isGamePoint).toBe(false);
    expect(sit!.isSetPoint).toBe(false);
    expect(sit!.isMatchPoint).toBe(false);
    expect(sit!.isGoldenPoint).toBe(false);
    expect(sit!.isTiebreak).toBe(false);
    expect(sit!.server).toBeDefined();
  });

  it('detects game point when server is at 40-0', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 }); // 15-0
    engine.addPoint({ winner: 0 }); // 30-0
    engine.addPoint({ winner: 0 }); // 40-0
    const sit = engine.getScore().situation!;
    // Server (side 0, since totalGames=0 → 0%2=0) is at 40-0, needs 1 point
    expect(sit.isGamePoint).toBe(true);
    expect(sit.isBreakPoint).toBe(false);
  });

  it('detects break point when receiver is at 0-40', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 1 }); // 0-15
    engine.addPoint({ winner: 1 }); // 0-30
    engine.addPoint({ winner: 1 }); // 0-40
    const sit = engine.getScore().situation!;
    // Server is side 0 (0 total games), receiver (side 1) needs 1 point to win game
    expect(sit.isBreakPoint).toBe(true);
  });

  it('detects golden point in NoAD at deuce', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6NOAD/TB7' });
    // Get to 40-40 (golden point in NoAD)
    engine.addPoint({ winner: 0 }); // 15-0
    engine.addPoint({ winner: 0 }); // 30-0
    engine.addPoint({ winner: 0 }); // 40-0
    engine.addPoint({ winner: 1 }); // 40-15
    engine.addPoint({ winner: 1 }); // 40-30
    engine.addPoint({ winner: 1 }); // 40-40 (golden point)
    const sit = engine.getScore().situation!;
    expect(sit.isGoldenPoint).toBe(true);
    expect(sit.isGamePoint).toBe(true);
    expect(sit.isBreakPoint).toBe(true);
  });

  it('SET3-S:6/TB7-G:TN3D — third deuce is golden point', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7-G:TN3D' });

    // Get to deuce #1 (40-40, internal points 3-3)
    engine.addPoint({ winner: 0 }); // 15-0
    engine.addPoint({ winner: 0 }); // 30-0
    engine.addPoint({ winner: 0 }); // 40-0
    engine.addPoint({ winner: 1 }); // 40-15
    engine.addPoint({ winner: 1 }); // 40-30
    engine.addPoint({ winner: 1 }); // 40-40 — deuce #1

    // At deuce #1 it should NOT be golden point
    let sit = engine.getScore().situation!;
    expect(sit.isGoldenPoint).toBe(false);

    // Advantage side 0, then back to deuce #2 (internal 4-4)
    engine.addPoint({ winner: 0 }); // A-40
    engine.addPoint({ winner: 1 }); // 40-40 — deuce #2

    sit = engine.getScore().situation!;
    expect(sit.isGoldenPoint).toBe(false);

    // Advantage side 1, then back to deuce #3 (internal 5-5)
    engine.addPoint({ winner: 1 }); // 40-A
    engine.addPoint({ winner: 0 }); // 40-40 — deuce #3

    // At deuce #3 it IS golden point (deuceAfter: 3)
    sit = engine.getScore().situation!;
    expect(sit.isGoldenPoint).toBe(true);
    expect(sit.isGamePoint).toBe(true);

    // The next point should win the game
    const scoreBefore = engine.getScore();
    const gamesBefore = scoreBefore.games;
    expect(gamesBefore).toEqual([0, 0]);

    engine.addPoint({ winner: 0 }); // side 0 wins at 6-5

    const scoreAfter = engine.getScore();
    expect(scoreAfter.games).toEqual([1, 0]); // Game was won
  });

  it('SET3-S:6/TB7-G:TN3D — advantage still works before deuce cap', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7-G:TN3D' });

    // Get to deuce #1
    for (let i = 0; i < 3; i++) engine.addPoint({ winner: 0 });
    for (let i = 0; i < 3; i++) engine.addPoint({ winner: 1 });

    // Side 0 gets advantage and wins — normal advantage rules apply before deuce cap
    engine.addPoint({ winner: 0 }); // A-40
    engine.addPoint({ winner: 0 }); // Game — side 0 wins with 2-point lead (5-3)

    const score = engine.getScore();
    expect(score.games).toEqual([1, 0]);
  });

  it('SET3-S:6/TB7-G:TN1D — deuceAfter:1 is equivalent to NoAD', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7-G:TN1D' });

    // Get to deuce #1 (40-40)
    for (let i = 0; i < 3; i++) engine.addPoint({ winner: 0 });
    for (let i = 0; i < 3; i++) engine.addPoint({ winner: 1 });

    // At 40-40 with deuceAfter:1, it's already golden point
    const sit = engine.getScore().situation!;
    expect(sit.isGoldenPoint).toBe(true);

    // Next point wins
    engine.addPoint({ winner: 1 });
    expect(engine.getScore().games).toEqual([0, 1]);
  });

  it('detects set point when leading 5-0 at 40-0', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    // Win 5 games for side 0
    for (let g = 0; g < 5; g++) {
      winGame(engine, 0);
      // After each game won by side 0, side 1 loses service games...
      // Actually the server alternates, so let's just do it cleanly
    }
    // We're at 5-0 now, in the 6th game
    // Win 3 points to get to 40-0
    engine.addPoint({ winner: 0 }); // 15-0
    engine.addPoint({ winner: 0 }); // 30-0
    engine.addPoint({ winner: 0 }); // 40-0
    const sit = engine.getScore().situation!;
    expect(sit.isSetPoint).toBe(true);
  });

  it('detects match point on first set of SET1', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:6/TB7' });
    // Win 5 games
    for (let g = 0; g < 5; g++) {
      winGame(engine, 0);
    }
    // At 40-0 in 6th game
    engine.addPoint({ winner: 0 }); // 15-0
    engine.addPoint({ winner: 0 }); // 30-0
    engine.addPoint({ winner: 0 }); // 40-0
    const sit = engine.getScore().situation!;
    expect(sit.isMatchPoint).toBe(true);
    expect(sit.isSetPoint).toBe(true);
  });

  it('detects tiebreak state', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    // Get to 6-6 tiebreak
    for (let g = 0; g < 6; g++) {
      winGame(engine, 0);
      winGame(engine, 1);
    }
    // Now in tiebreak
    engine.addPoint({ winner: 0 }); // 1-0 in tiebreak
    const sit = engine.getScore().situation!;
    expect(sit.isTiebreak).toBe(true);
  });

  it('returns undefined for completed match', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    winSet(engine);
    winSet(engine);
    const score = engine.getScore();
    expect(score.situation).toBeUndefined();
  });
});

// ============================================================================
// getNextServer()
// ============================================================================

describe('getNextServer()', () => {
  it('returns 0 at start of match', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    expect(engine.getNextServer()).toBe(0);
  });

  it('alternates server after game', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    // Side 0 serves first game
    expect(engine.getNextServer()).toBe(0);
    // Win a game (4 points)
    winGame(engine, 0);
    // Side 1 should now serve
    expect(engine.getNextServer()).toBe(1);
  });

  it('uses WINNER_SERVES rule', () => {
    const engine = new ScoringEngine({
      matchUpFormat: 'SET3-S:TB11',
      competitionFormat: {
        matchUpFormat: 'SET3-S:TB11',
        serverRule: 'WINNER_SERVES',
      },
    });
    // No points yet — defaults to 0
    expect(engine.getNextServer()).toBe(0);
    // Side 1 wins a point
    engine.addPoint({ winner: 1 });
    // Side 1 should now serve
    expect(engine.getNextServer()).toBe(1);
    // Side 0 wins the next
    engine.addPoint({ winner: 0 });
    // Side 0 should now serve
    expect(engine.getNextServer()).toBe(0);
  });

  it('handles tiebreak server rotation', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    // Get to 6-6 tiebreak
    for (let g = 0; g < 6; g++) {
      winGame(engine, 0);
      winGame(engine, 1);
    }
    // In tiebreak: server alternates every 2 points
    // Total games = 12, so tiebreak initial server = 12 % 2 = 0
    const firstServer = engine.getNextServer();
    expect(firstServer).toBe(0);

    // After 1 point, still same server (alternates every 2)
    engine.addPoint({ winner: 0 }); // 1-0
    expect(engine.getNextServer()).toBe(0);

    // After 2 points, server switches
    engine.addPoint({ winner: 0 }); // 2-0
    expect(engine.getNextServer()).toBe(1);
  });

  describe('initial server = 1', () => {
    it('returns 1 after first point with server=1', () => {
      const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
      // Side 1 serves first point
      engine.addPoint({ winner: 1, server: 1 });
      // Still in the first game, side 1 should still be serving
      expect(engine.getNextServer()).toBe(1);
    });

    it('alternates server correctly when side 1 serves first', () => {
      const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
      // Side 1 serves first game (wins 4-0)
      engine.addPoint({ winner: 1, server: 1 });
      engine.addPoint({ winner: 1, server: 1 });
      engine.addPoint({ winner: 1, server: 1 });
      engine.addPoint({ winner: 1, server: 1 });
      // Game complete: side 0 should serve the second game
      expect(engine.getNextServer()).toBe(0);
    });

    it('returns to side 1 for third game when side 1 served first', () => {
      const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
      // Side 1 serves first game
      for (let i = 0; i < 4; i++) engine.addPoint({ winner: 1, server: 1 });
      expect(engine.getNextServer()).toBe(0);
      // Side 0 serves second game
      for (let i = 0; i < 4; i++) engine.addPoint({ winner: 0, server: 0 });
      // Third game: side 1 should serve again
      expect(engine.getNextServer()).toBe(1);
    });

    it('auto-derives server correctly after explicit first point', () => {
      const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
      // Only first point has explicit server=1; subsequent points omit server
      engine.addPoint({ winner: 1, server: 1 });
      engine.addPoint({ winner: 1 }); // should auto-derive server=1
      engine.addPoint({ winner: 1 });
      engine.addPoint({ winner: 1 });
      // After first game won by side 1, server should be side 0
      expect(engine.getNextServer()).toBe(0);

      // Play second game without explicit server
      engine.addPoint({ winner: 0 });
      engine.addPoint({ winner: 0 });
      engine.addPoint({ winner: 0 });
      engine.addPoint({ winner: 0 });
      // After second game, server returns to side 1
      expect(engine.getNextServer()).toBe(1);
    });

    it('handles tiebreak with initial server = 1', () => {
      const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
      // Side 1 serves first game
      for (let i = 0; i < 4; i++) engine.addPoint({ winner: 1, server: 1 });

      // Alternate games to reach 6-6 (side 1 wins odd games, side 0 wins even)
      // After first game (1-0 for side 1), play 10 more games to reach 6-5
      // then one more to reach 6-6
      for (let g = 1; g < 12; g++) {
        // Even game index: side 0 serves (wins)
        // Odd game index: side 1 serves (wins)
        const winner = g % 2 === 0 ? 1 : 0;
        for (let i = 0; i < 4; i++) engine.addPoint({ winner });
      }

      // Now at 6-6 tiebreak
      // With initial server = 1: total 12 games played, initial server was 1
      // Tiebreak starter should be side 1 (12 games, initial=1 → 1)
      const tbServer = engine.getNextServer();
      expect(tbServer).toBe(1);

      // After 1 point, still same server
      engine.addPoint({ winner: 0 });
      expect(engine.getNextServer()).toBe(1);

      // After 2 points, switch
      engine.addPoint({ winner: 0 });
      expect(engine.getNextServer()).toBe(0);
    });

    it('handles second set server after initial server = 1', () => {
      const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
      // Side 1 serves first, wins set 6-0
      for (let g = 0; g < 6; g++) {
        for (let i = 0; i < 4; i++) {
          if (g === 0) {
            engine.addPoint({ winner: 1, server: 1 });
          } else {
            engine.addPoint({ winner: 1 });
          }
        }
      }

      // After 6 games (set complete), 2nd set first game server:
      // Alternation pattern: 1,0,1,0,1,0 → 7th game continues with side 1
      // (new set resets game count to 0, 0 % 2 = 0, flipped for initial=1 → 1)
      expect(engine.getNextServer()).toBe(1);
    });
  });
});

// ============================================================================
// getStatistics()
// ============================================================================

describe('getStatistics()', () => {
  it('returns empty stats when no points played', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    const stats = engine.getStatistics();
    expect(stats).toBeDefined();
    expect(stats.calculated).toBeDefined();
    expect(stats.counters).toBeDefined();
  });

  it('counts aces correctly', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0, result: 'Ace' });
    engine.addPoint({ winner: 0, result: 'Ace' });
    engine.addPoint({ winner: 1, result: 'Ace' });
    engine.addPoint({ winner: 0 }); // not an ace

    const stats = engine.getStatistics();
    // Check counters for aces
    const t0Aces = stats.counters.teams[0]?.aces?.length || 0;
    const t1Aces = stats.counters.teams[1]?.aces?.length || 0;
    expect(t0Aces).toBe(2);
    expect(t1Aces).toBe(1);
  });

  it('counts double faults correctly', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 1, result: 'Double Fault' });
    engine.addPoint({ winner: 0, result: 'Double Fault' });
    engine.addPoint({ winner: 0, result: 'Double Fault' });

    const stats = engine.getStatistics();
    const t0DFs = stats.counters.teams[0]?.doubleFaults?.length || 0;
    const t1DFs = stats.counters.teams[1]?.doubleFaults?.length || 0;
    // Double faults: server loses the point, so the DF belongs to the server
    // Server at point 0 is side 0 (totalGames=0), so DF counted for server
    expect(t0DFs + t1DFs).toBeGreaterThan(0);
  });

  it('returns calculated stats array', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0, result: 'Ace' });
    engine.addPoint({ winner: 1, result: 'Winner' });
    engine.addPoint({ winner: 0, result: 'Unforced Error' });

    const stats = engine.getStatistics();
    expect(Array.isArray(stats.calculated)).toBe(true);
  });
});

// ============================================================================
// getEpisodes()
// ============================================================================

describe('getEpisodes()', () => {
  it('returns empty array when no points played', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    expect(engine.getEpisodes()).toEqual([]);
  });

  it('returns one episode per point', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });
    engine.addPoint({ winner: 0 });

    const episodes = engine.getEpisodes();
    expect(episodes).toHaveLength(3);
  });

  it('episode has correct structure', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    const ep = engine.getEpisodes()[0];

    expect(ep.action).toBe('addPoint');
    expect(ep.point).toBeDefined();
    expect(ep.point.index).toBe(0);
    expect(ep.point.winner).toBe(0);
    expect(ep.game).toBeDefined();
    expect(ep.set).toBeDefined();
    expect(ep.needed).toBeDefined();
    expect(ep.complete).toBe(false);
  });

  it('detects game completion in episodes', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    winGame(engine, 0); // 4 points, game won
    engine.addPoint({ winner: 1 }); // Start of next game

    const episodes = engine.getEpisodes();
    // The 4th point (index 3) should have game.complete = true
    expect(episodes[3].game.complete).toBe(true);
    // The 5th point (index 4) is in a new game
    expect(episodes[4].game.index).not.toBe(episodes[3].game.index);
  });

  it('detects set completion in episodes', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    winSet(engine); // 6-0 set
    engine.addPoint({ winner: 0 }); // start of set 2

    const episodes = engine.getEpisodes();
    // Find the last point in set 0
    const lastSetPoint = episodes.findLast((e) => e.set.index === 0)!;
    expect(lastSetPoint.set.complete).toBe(true);
  });

  it('detects match completion', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    winSet(engine);
    winSet(engine); // Match complete
    expect(engine.isComplete()).toBe(true);

    const episodes = engine.getEpisodes();
    const lastEp = episodes.at(-1)!;
    expect(lastEp.complete).toBe(true);
  });

  it('includes needed decorations from point history', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 }); // 15-0

    const ep = engine.getEpisodes()[0];
    expect(ep.needed.pointsToGame).toBeDefined();
    expect(ep.needed.pointsToSet).toBeDefined();
    expect(ep.needed.pointsToMatch).toBeDefined();
  });
});

// ============================================================================
// Integration: Multiple features together
// ============================================================================

describe('ScoringEngine API Integration', () => {
  it('all new methods work on a standard tennis match', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Check format introspection
    expect(engine.isNoAd()).toBe(false);
    expect(engine.getSetsToWin()).toBe(2);
    expect(engine.getTiebreakAt()).toBe(6);
    expect(engine.hasFinalSetTiebreak()).toBe(true);
    expect(engine.getFormatStructure()).toBeDefined();

    // Play some points
    engine.addPoint({ winner: 0, result: 'Ace' });
    engine.addPoint({ winner: 0, result: 'Winner' });

    // Check score includes new fields
    const score = engine.getScore();
    expect(score.pointDisplay).toBeDefined();
    expect(score.situation).toBeDefined();
    expect(score.situation!.server).toBeDefined();

    // Check statistics
    const stats = engine.getStatistics();
    expect(stats.counters).toBeDefined();

    // Check episodes
    const episodes = engine.getEpisodes();
    expect(episodes).toHaveLength(2);

    // Check next server
    const nextServer = engine.getNextServer();
    expect([0, 1]).toContain(nextServer);
  });

  it('works with pickleball tiebreak-only format', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:TB11' });

    expect(engine.isNoAd()).toBe(false);
    expect(engine.getSetsToWin()).toBe(2);
    expect(engine.getTiebreakAt()).toBeNull();

    engine.addPoint({ winner: 0 });
    const score = engine.getScore();
    expect(score.pointDisplay).toBeDefined();
    expect(score.situation).toBeDefined();
    expect(score.situation!.isTiebreak).toBe(true);
  });

  it('format introspection survives setState', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });

    const state = engine.getState();
    const engine2 = new ScoringEngine({ matchUpFormat: 'SET5-S:6/TB7' });
    engine2.setState(state);

    // After setState, format introspection should reflect the loaded state's format
    expect(engine2.getSetsToWin()).toBe(2); // SET3 format from loaded state
  });
});

// ============================================================================
// Event Handlers
// ============================================================================

describe('Event Handlers', () => {
  describe('onPoint', () => {
    it('fires after each addPoint', () => {
      const calls: any[] = [];
      const engine = new ScoringEngine({
        matchUpFormat: 'SET3-S:6/TB7',
        eventHandlers: {
          onPoint: (ctx) => calls.push(ctx),
        },
      });

      engine.addPoint({ winner: 0 });
      engine.addPoint({ winner: 1 });

      expect(calls).toHaveLength(2);
      expect(calls[0].state).toBeDefined();
      expect(calls[0].score).toBeDefined();
    });
  });

  describe('onUndo', () => {
    it('fires after undo', () => {
      const calls: any[] = [];
      const engine = new ScoringEngine({
        matchUpFormat: 'SET3-S:6/TB7',
        eventHandlers: {
          onUndo: (ctx) => calls.push(ctx),
        },
      });

      engine.addPoint({ winner: 0 });
      engine.undo();

      expect(calls).toHaveLength(1);
      expect(calls[0].state).toBeDefined();
      expect(calls[0].score).toBeDefined();
    });

    it('does not fire when nothing to undo', () => {
      const calls: any[] = [];
      const engine = new ScoringEngine({
        matchUpFormat: 'SET3-S:6/TB7',
        eventHandlers: {
          onUndo: (ctx) => calls.push(ctx),
        },
      });

      engine.undo(); // nothing to undo
      expect(calls).toHaveLength(0);
    });
  });

  describe('onRedo', () => {
    it('fires after redo', () => {
      const calls: any[] = [];
      const engine = new ScoringEngine({
        matchUpFormat: 'SET3-S:6/TB7',
        eventHandlers: {
          onRedo: (ctx) => calls.push(ctx),
        },
      });

      engine.addPoint({ winner: 0 });
      engine.undo();
      engine.redo();

      expect(calls).toHaveLength(1);
    });

    it('does not fire when nothing to redo', () => {
      const calls: any[] = [];
      const engine = new ScoringEngine({
        matchUpFormat: 'SET3-S:6/TB7',
        eventHandlers: {
          onRedo: (ctx) => calls.push(ctx),
        },
      });

      engine.redo(); // nothing to redo
      expect(calls).toHaveLength(0);
    });
  });

  describe('onReset', () => {
    it('fires after reset', () => {
      const calls: any[] = [];
      const engine = new ScoringEngine({
        matchUpFormat: 'SET3-S:6/TB7',
        eventHandlers: {
          onReset: (ctx) => calls.push(ctx),
        },
      });

      engine.addPoint({ winner: 0 });
      engine.reset();

      expect(calls).toHaveLength(1);
      // After reset, state should be clean
      expect(calls[0].state.matchUpStatus).toBe('TO_BE_PLAYED');
    });
  });

  describe('onGameComplete', () => {
    it('fires when a game is completed', () => {
      const calls: any[] = [];
      const engine = new ScoringEngine({
        matchUpFormat: 'SET3-S:6/TB7',
        eventHandlers: {
          onGameComplete: (ctx) => calls.push(ctx),
        },
      });

      // Win one game (4 points in standard tennis)
      winGame(engine, 0);

      expect(calls).toHaveLength(1);
      expect(calls[0].gameWinner).toBe(0);
    });

    it('does not fire for mid-game points', () => {
      const calls: any[] = [];
      const engine = new ScoringEngine({
        matchUpFormat: 'SET3-S:6/TB7',
        eventHandlers: {
          onGameComplete: (ctx) => calls.push(ctx),
        },
      });

      engine.addPoint({ winner: 0 }); // 15-0
      engine.addPoint({ winner: 0 }); // 30-0
      engine.addPoint({ winner: 0 }); // 40-0

      expect(calls).toHaveLength(0);
    });
  });

  describe('onSetComplete', () => {
    it('fires when a set is completed', () => {
      const calls: any[] = [];
      const engine = new ScoringEngine({
        matchUpFormat: 'SET3-S:6/TB7',
        eventHandlers: {
          onSetComplete: (ctx) => calls.push(ctx),
        },
      });

      winSet(engine); // 6-0 set

      expect(calls).toHaveLength(1);
      expect(calls[0].setWinner).toBe(0);
    });
  });

  describe('onMatchComplete', () => {
    it('fires when match is completed', () => {
      const calls: any[] = [];
      const engine = new ScoringEngine({
        matchUpFormat: 'SET3-S:6/TB7',
        eventHandlers: {
          onMatchComplete: (ctx) => calls.push(ctx),
        },
      });

      winSet(engine); // 6-0 first set
      winSet(engine); // 6-0 second set — match complete

      expect(calls).toHaveLength(1);
      expect(calls[0].matchWinner).toBe(0);
    });

    it('does not fire after first set in best-of-3', () => {
      const calls: any[] = [];
      const engine = new ScoringEngine({
        matchUpFormat: 'SET3-S:6/TB7',
        eventHandlers: {
          onMatchComplete: (ctx) => calls.push(ctx),
        },
      });

      winSet(engine); // 6-0 first set only

      expect(calls).toHaveLength(0);
    });
  });

  describe('setEventHandlers()', () => {
    it('allows changing handlers at runtime', () => {
      const calls1: any[] = [];
      const calls2: any[] = [];
      const engine = new ScoringEngine({
        matchUpFormat: 'SET3-S:6/TB7',
        eventHandlers: {
          onPoint: (ctx) => calls1.push(ctx),
        },
      });

      engine.addPoint({ winner: 0 });
      expect(calls1).toHaveLength(1);
      expect(calls2).toHaveLength(0);

      // Replace handlers
      engine.setEventHandlers({
        onPoint: (ctx) => calls2.push(ctx),
      });

      engine.addPoint({ winner: 1 });
      expect(calls1).toHaveLength(1); // no new calls
      expect(calls2).toHaveLength(1); // new handler called
    });

    it('allows clearing handlers', () => {
      const calls: any[] = [];
      const engine = new ScoringEngine({
        matchUpFormat: 'SET3-S:6/TB7',
        eventHandlers: {
          onPoint: (ctx) => calls.push(ctx),
        },
      });

      engine.addPoint({ winner: 0 });
      expect(calls).toHaveLength(1);

      engine.setEventHandlers(undefined);

      engine.addPoint({ winner: 1 });
      expect(calls).toHaveLength(1); // no new calls
    });

    it('getEventHandlers() returns current handlers', () => {
      const handlers = { onPoint: () => {} };
      const engine = new ScoringEngine({
        matchUpFormat: 'SET3-S:6/TB7',
        eventHandlers: handlers,
      });

      expect(engine.getEventHandlers()).toBe(handlers);

      engine.setEventHandlers(undefined);
      expect(engine.getEventHandlers()).toBeUndefined();
    });
  });

  describe('multiple handlers fire in correct order', () => {
    it('fires onPoint before onGameComplete', () => {
      const order: string[] = [];
      const engine = new ScoringEngine({
        matchUpFormat: 'SET3-S:6/TB7',
        eventHandlers: {
          onPoint: () => order.push('point'),
          onGameComplete: () => order.push('game'),
          onSetComplete: () => order.push('set'),
          onMatchComplete: () => order.push('match'),
        },
      });

      // Win a game — should fire onPoint then onGameComplete
      winGame(engine, 0);

      // onPoint fires for every point, onGameComplete on the last
      expect(order.filter((e) => e === 'point')).toHaveLength(4);
      expect(order.filter((e) => e === 'game')).toHaveLength(1);
      // The last two events should be point then game
      expect(order.at(-2)).toBe('point');
      expect(order.at(-1)).toBe('game');
    });

    it('fires all completion events on match-ending point', () => {
      const events: string[] = [];
      const engine = new ScoringEngine({
        matchUpFormat: 'SET1-S:6/TB7',
        eventHandlers: {
          onPoint: () => events.push('point'),
          onGameComplete: () => events.push('game'),
          onSetComplete: () => events.push('set'),
          onMatchComplete: () => events.push('match'),
        },
      });

      // Win 5 games (SET1 format — one set to win)
      for (let g = 0; g < 5; g++) winGame(engine, 0);
      events.length = 0; // clear

      // Win final game — triggers game, set, and match completion
      winGame(engine, 0);

      expect(events).toContain('point');
      expect(events).toContain('game');
      expect(events).toContain('set');
      expect(events).toContain('match');
    });
  });
});
