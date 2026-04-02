import {
  enrichPoint,
  deriveWinnerFromCode,
  parsePointInput,
  categorizePoint,
  getPointType,
} from '@Query/scoring/statistics/pointParser';
import { buildCounters, getCountersSummary, filterCountersBySet } from '@Query/scoring/statistics/counters';
import { calculateStats } from '@Query/scoring/statistics/calculator';
import { calculateMatchStatistics, enrichPointHistory, getQuickStats } from '@Query/scoring/statistics/standalone';
import { toStatObjects } from '@Query/scoring/statistics/toStatObjects';
import { PointWithMetadata } from '@Query/scoring/statistics/types';
import { describe, expect, it } from 'vitest';

// ─── Test Fixtures ────────────────────────────────────────────────────

/** Create a point with standard fields */
function makePoint(overrides: Partial<PointWithMetadata> = {}): PointWithMetadata {
  return {
    winner: 0,
    server: 0,
    index: 0,
    set: 0,
    game: 0,
    serve: 1,
    ...overrides,
  };
}

/** Generate a realistic set of tennis points for testing */
function generateMatchPoints(): PointWithMetadata[] {
  const points: PointWithMetadata[] = [];
  let idx = 0;

  // Game 1: Player 0 holds serve (4 aces)
  for (let p = 0; p < 4; p++) {
    points.push(makePoint({ winner: 0, server: 0, index: idx++, set: 0, game: 0, result: 'Ace', serve: 1, code: 'A' }));
  }
  // Game 2: Player 1 holds serve (4 serve winners)
  for (let p = 0; p < 4; p++) {
    points.push(
      makePoint({ winner: 1, server: 1, index: idx++, set: 0, game: 1, result: 'Serve Winner', serve: 1, code: 'S' }),
    );
  }
  // Game 3: Player 0 holds serve (2 winners, 1 unforced error by opponent, 1 ace)
  points.push(makePoint({ winner: 0, server: 0, index: idx++, set: 0, game: 2, result: 'Winner', serve: 1 }));
  points.push(makePoint({ winner: 0, server: 0, index: idx++, set: 0, game: 2, result: 'Winner', serve: 1 }));
  points.push(
    makePoint({ winner: 0, server: 0, index: idx++, set: 0, game: 2, result: 'Unforced Error', serve: 2 }),
  );
  points.push(makePoint({ winner: 0, server: 0, index: idx++, set: 0, game: 2, result: 'Ace', serve: 1, code: 'A' }));

  // Game 4: Player 1 broken (1 double fault, 2 forced errors, 1 return winner)
  points.push(
    makePoint({
      winner: 0,
      server: 1,
      index: idx++,
      set: 0,
      game: 3,
      result: 'Double Fault',
      serve: 1,
      code: 'D',
      breakpoint: true,
    }),
  );
  points.push(
    makePoint({
      winner: 0,
      server: 1,
      index: idx++,
      set: 0,
      game: 3,
      result: 'Forced Error',
      serve: 1,
      breakpoint: true,
    }),
  );
  points.push(
    makePoint({
      winner: 0,
      server: 1,
      index: idx++,
      set: 0,
      game: 3,
      result: 'Return Winner',
      serve: 2,
      code: 'R',
    }),
  );
  points.push(
    makePoint({ winner: 0, server: 1, index: idx, set: 0, game: 3, result: 'Forced Error', serve: 1 }),
  );

  return points;
}

// ═══════════════════════════════════════════════════════════════════════
// pointParser
// ═══════════════════════════════════════════════════════════════════════

describe('pointParser', () => {
  describe('enrichPoint', () => {
    const context = { server: 0 as 0 | 1, index: 5, set: 1, game: 3 };

    it('adds context fields to point', () => {
      const result = enrichPoint({ winner: 0 }, context);
      expect(result.server).toBe(0);
      expect(result.index).toBe(5);
      expect(result.set).toBe(1);
      expect(result.game).toBe(3);
    });

    it('derives winner from code when winner is missing', () => {
      const result = enrichPoint({ code: 'A' }, context);
      expect(result.winner).toBe(0); // Ace: server wins
    });

    it('does not override existing winner', () => {
      const result = enrichPoint({ code: 'A', winner: 1 }, context);
      expect(result.winner).toBe(1);
    });

    it('derives result from code when result is missing', () => {
      const result = enrichPoint({ code: 'D' }, context);
      expect(result.result).toBe('Double Fault');
    });

    it('does not override existing result', () => {
      const result = enrichPoint({ code: 'A', result: 'Custom' }, context);
      expect(result.result).toBe('Custom');
    });

    it('sets serve=2 when first_serve is present', () => {
      const result = enrichPoint({ first_serve: { error: 'fault', serves: [] } }, context);
      expect(result.serve).toBe(2);
    });

    it('defaults serve=1 when no serve info present', () => {
      const result = enrichPoint({}, context);
      expect(result.serve).toBe(1);
    });

    it('preserves existing serve value', () => {
      const result = enrichPoint({ serve: 2 }, context);
      expect(result.serve).toBe(2);
    });
  });

  describe('deriveWinnerFromCode', () => {
    it('returns server for ace (A)', () => {
      expect(deriveWinnerFromCode('A', 0)).toBe(0);
      expect(deriveWinnerFromCode('A', 1)).toBe(1);
    });

    it('returns server for serve winner (S)', () => {
      expect(deriveWinnerFromCode('S', 0)).toBe(0);
    });

    it('returns receiver for double fault (D)', () => {
      expect(deriveWinnerFromCode('D', 0)).toBe(1);
      expect(deriveWinnerFromCode('D', 1)).toBe(0);
    });

    it('returns receiver for return winner (R)', () => {
      expect(deriveWinnerFromCode('R', 0)).toBe(1);
    });

    it('returns receiver for unforced error (E)', () => {
      expect(deriveWinnerFromCode('E', 0)).toBe(1);
    });

    it('returns receiver for forced error (F)', () => {
      expect(deriveWinnerFromCode('F', 1)).toBe(0);
    });

    it('defaults to server for unknown codes', () => {
      expect(deriveWinnerFromCode('X', 0)).toBe(0);
      expect(deriveWinnerFromCode('Z', 1)).toBe(1);
    });
  });

  describe('parsePointInput', () => {
    it('converts number to { winner: n }', () => {
      expect(parsePointInput(0)).toEqual({ winner: 0 });
      expect(parsePointInput(1)).toEqual({ winner: 1 });
    });

    it('converts string to { code: s }', () => {
      expect(parsePointInput('A')).toEqual({ code: 'A' });
      expect(parsePointInput('D')).toEqual({ code: 'D' });
    });

    it('passes objects through as-is', () => {
      const obj = { winner: 0, result: 'Ace' };
      expect(parsePointInput(obj)).toBe(obj);
    });

    it('throws for invalid input types', () => {
      expect(() => parsePointInput(undefined)).toThrow('Invalid point input');
      expect(() => parsePointInput(true)).toThrow('Invalid point input');
    });
  });

  describe('categorizePoint', () => {
    it('categorizes ace as winner aces + winners', () => {
      const { winner } = categorizePoint(makePoint({ result: 'Ace', server: 0, winner: 0 }));
      expect(winner).toContain('aces');
      expect(winner).toContain('winners');
      expect(winner).toContain('pointsWon');
    });

    it('categorizes winner shot', () => {
      const { winner } = categorizePoint(makePoint({ result: 'Winner', server: 0, winner: 0 }));
      expect(winner).toContain('winners');
      expect(winner).not.toContain('aces');
    });

    it('categorizes double fault as loser attribute', () => {
      const { loser } = categorizePoint(makePoint({ result: 'Double Fault', server: 0, winner: 1 }));
      expect(loser).toContain('doubleFaults');
    });

    it('categorizes unforced error as loser attribute', () => {
      const { loser } = categorizePoint(makePoint({ result: 'Unforced Error', server: 0, winner: 1 }));
      expect(loser).toContain('unforcedErrors');
    });

    it('categorizes forced error as loser attribute', () => {
      const { loser } = categorizePoint(makePoint({ result: 'Forced Error', server: 0, winner: 1 }));
      expect(loser).toContain('forcedErrors');
    });

    it('tracks serve wins with 1st/2nd serve distinction', () => {
      const { winner: w1 } = categorizePoint(makePoint({ server: 0, winner: 0, serve: 1 }));
      expect(w1).toContain('servesWon');
      expect(w1).toContain('serves1stWon');

      const { winner: w2 } = categorizePoint(makePoint({ server: 0, winner: 0, serve: 2 }));
      expect(w2).toContain('servesWon');
      expect(w2).toContain('serves2ndWon');
    });

    it('tracks return wins with 1st/2nd serve distinction', () => {
      const { winner: w1 } = categorizePoint(makePoint({ server: 0, winner: 1, serve: 1 }));
      expect(w1).toContain('returns');
      expect(w1).toContain('received1stWon');

      const { winner: w2 } = categorizePoint(makePoint({ server: 0, winner: 1, serve: 2 }));
      expect(w2).toContain('returns');
      expect(w2).toContain('received2ndWon');
    });

    it('handles point with no result', () => {
      const { winner, loser } = categorizePoint(makePoint({ result: undefined }));
      expect(winner).toContain('pointsWon');
      expect(loser).toHaveLength(0);
    });

    it('server wins without specific serve number', () => {
      const { winner } = categorizePoint(makePoint({ server: 0, winner: 0, serve: undefined }));
      expect(winner).toContain('servesWon');
      expect(winner).not.toContain('serves1stWon');
      expect(winner).not.toContain('serves2ndWon');
    });

    it('receiver wins without specific serve number', () => {
      const { winner } = categorizePoint(makePoint({ server: 0, winner: 1, serve: undefined }));
      expect(winner).toContain('returns');
      expect(winner).not.toContain('received1stWon');
      expect(winner).not.toContain('received2ndWon');
    });
  });

  describe('getPointType', () => {
    it('returns serve when server wins', () => {
      expect(getPointType(makePoint({ winner: 0, server: 0 }))).toBe('serve');
    });

    it('returns return when receiver wins', () => {
      expect(getPointType(makePoint({ winner: 1, server: 0 }))).toBe('return');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// counters
// ═══════════════════════════════════════════════════════════════════════

describe('counters', () => {
  describe('buildCounters', () => {
    it('initializes empty counters for two teams', () => {
      const counters = buildCounters([]);
      expect(counters.teams[0]).toBeDefined();
      expect(counters.teams[1]).toBeDefined();
      expect(counters.players[0]).toBeDefined();
      expect(counters.players[1]).toBeDefined();
    });

    it('counts points won per team', () => {
      const points = [makePoint({ winner: 0 }), makePoint({ winner: 0 }), makePoint({ winner: 1 })];
      const counters = buildCounters(points);
      expect(counters.teams[0].pointsWon.length).toBe(2);
      expect(counters.teams[1].pointsWon.length).toBe(1);
    });

    it('filters by set when setFilter is specified', () => {
      const points = [makePoint({ winner: 0, set: 0 }), makePoint({ winner: 0, set: 1 }), makePoint({ winner: 1, set: 0 })];
      const counters = buildCounters(points, { setFilter: 0 });
      expect(counters.teams[0].pointsWon.length).toBe(1);
      expect(counters.teams[1].pointsWon.length).toBe(1);
    });

    it('skips points without winner', () => {
      const points = [makePoint({ winner: undefined }), makePoint({ winner: 0 })];
      const counters = buildCounters(points);
      expect(counters.teams[0].pointsWon.length).toBe(1);
    });

    it('tracks serve stats for the server', () => {
      const points = [
        makePoint({ winner: 0, server: 0, serve: 1 }),
        makePoint({ winner: 1, server: 0, serve: 2 }),
      ];
      const counters = buildCounters(points);
      expect(counters.teams[0].pointsServed.length).toBe(2);
      expect(counters.teams[0].serves1stIn.length).toBe(1);
      expect(counters.teams[0].serves2ndIn.length).toBe(1);
    });

    it('tracks hand breakdown when present', () => {
      const points = [makePoint({ winner: 0, hand: 'Forehand' })];
      const counters = buildCounters(points);
      expect(counters.teams[0]['Forehand'].length).toBe(1);
    });

    it('handles points without hand field', () => {
      const points = [makePoint({ winner: 0 })];
      const counters = buildCounters(points);
      expect(counters.teams[0]['Forehand']).toBeUndefined();
    });

    it('tracks game completions across game boundaries', () => {
      const points = [
        makePoint({ winner: 0, game: 0, index: 0 }),
        makePoint({ winner: 0, game: 0, index: 1 }),
        makePoint({ winner: 0, game: 0, index: 2 }),
        makePoint({ winner: 0, game: 0, index: 3 }), // last point of game 0
        makePoint({ winner: 1, game: 1, index: 4 }), // first point of game 1 → game 0 complete
        makePoint({ winner: 1, game: 1, index: 5 }),
        makePoint({ winner: 1, game: 1, index: 6 }),
        makePoint({ winner: 1, game: 1, index: 7 }), // last point of game 1
        makePoint({ winner: 0, game: 2, index: 8 }), // first point of game 2 → game 1 complete
      ];
      const counters = buildCounters(points);
      expect(counters.teams[0].gamesWon.length).toBe(1); // game 0
      expect(counters.teams[1].gamesWon.length).toBe(1); // game 1
    });

    it('tracks breakpoints faced and saved', () => {
      const points = [
        makePoint({ winner: 0, server: 0, breakpoint: true }), // server saves
        makePoint({ winner: 1, server: 0, breakpoint: true }), // server broken
      ];
      const counters = buildCounters(points);
      expect(counters.teams[0].breakpointsFaced.length).toBe(2);
      expect(counters.teams[0].breakpointsSaved.length).toBe(1);
    });

    it('attributes loser categories to the losing side', () => {
      const points = [
        makePoint({ winner: 0, server: 0, result: 'Double Fault' }), // server wins but DF attribution goes to loser
      ];
      const counters = buildCounters(points);
      // Double fault attributed to the loser (team 1)
      expect(counters.teams[1].doubleFaults.length).toBe(1);
    });

    it('handles isGameComplete when points lack game field', () => {
      // Points without game field - isGameComplete returns false via the final return
      const points = [
        { winner: 0, server: 0, index: 0, set: 0, serve: 1 } as PointWithMetadata,
        { winner: 0, server: 0, index: 1, set: 0, serve: 1 } as PointWithMetadata,
      ];
      const counters = buildCounters(points);
      // No game completions detected since game is undefined
      expect(counters.teams[0].gamesWon).toBeUndefined();
    });

    it('handles isGameComplete when only current point has game', () => {
      // currentPoint has game, lastPoint does not
      const points = [
        { winner: 0, server: 0, index: 0, set: 0, serve: 1 } as PointWithMetadata,
        { winner: 0, server: 0, index: 1, set: 0, serve: 1, game: 1 } as PointWithMetadata,
      ];
      const counters = buildCounters(points);
      expect(counters.teams[0].gamesWon).toBeUndefined();
    });

    it('skips serve tracking when server is undefined', () => {
      const points = [makePoint({ winner: 0, server: undefined })];
      const counters = buildCounters(points);
      expect(counters.teams[0].pointsServed).toBeUndefined();
    });

    it('handles serve that is neither 1 nor 2', () => {
      const points = [makePoint({ winner: 0, server: 0, serve: undefined })];
      const counters = buildCounters(points);
      expect(counters.teams[0].pointsServed.length).toBe(1);
      expect(counters.teams[0].serves1stIn).toBeUndefined();
      expect(counters.teams[0].serves2ndIn).toBeUndefined();
    });

    it('reuses existing array for multiple 2nd serve points', () => {
      const points = [
        makePoint({ winner: 0, server: 0, serve: 2 }),
        makePoint({ winner: 1, server: 0, serve: 2 }),
      ];
      const counters = buildCounters(points);
      expect(counters.teams[0].serves2ndIn.length).toBe(2);
    });

    it('reuses existing array for multiple hand breakdown points', () => {
      const points = [
        makePoint({ winner: 0, hand: 'Forehand' }),
        makePoint({ winner: 0, hand: 'Forehand' }),
      ];
      const counters = buildCounters(points);
      expect(counters.teams[0]['Forehand'].length).toBe(2);
    });

    it('reuses existing array for multiple breakpoint saves', () => {
      const points = [
        makePoint({ winner: 0, server: 0, breakpoint: true }),
        makePoint({ winner: 0, server: 0, breakpoint: true }),
      ];
      const counters = buildCounters(points);
      expect(counters.teams[0].breakpointsSaved.length).toBe(2);
    });
  });

  describe('getCountersSummary', () => {
    it('counts total points and per-team breakdown', () => {
      const points = [makePoint({ winner: 0 }), makePoint({ winner: 0 }), makePoint({ winner: 1 })];
      const counters = buildCounters(points);
      const summary = getCountersSummary(counters);
      expect(summary.totalPoints).toBe(3);
      expect(summary.byTeam[0]).toBe(2);
      expect(summary.byTeam[1]).toBe(1);
    });

    it('aggregates categories across teams', () => {
      const points = [
        makePoint({ winner: 0, result: 'Ace' }),
        makePoint({ winner: 1, result: 'Ace' }),
      ];
      const counters = buildCounters(points);
      const summary = getCountersSummary(counters);
      expect(summary.byCategory['aces']).toBe(2);
    });

    it('handles empty counters', () => {
      const counters = buildCounters([]);
      const summary = getCountersSummary(counters);
      expect(summary.totalPoints).toBe(0);
      expect(summary.byTeam).toEqual([0, 0]);
    });
  });

  describe('filterCountersBySet', () => {
    it('filters counters to specific set', () => {
      const points = [
        makePoint({ winner: 0, set: 0 }),
        makePoint({ winner: 0, set: 1 }),
        makePoint({ winner: 1, set: 0 }),
      ];
      const counters = buildCounters(points);
      const filtered = filterCountersBySet(counters, 0);

      expect(filtered.teams[0].pointsWon.length).toBe(1);
      expect(filtered.teams[1].pointsWon.length).toBe(1);
    });

    it('returns empty categories when no points in set', () => {
      const points = [makePoint({ winner: 0, set: 0 })];
      const counters = buildCounters(points);
      const filtered = filterCountersBySet(counters, 5);
      expect(Object.keys(filtered.teams[0]).length).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// calculator
// ═══════════════════════════════════════════════════════════════════════

describe('calculator', () => {
  describe('calculateStats', () => {
    it('returns empty array for null/undefined counters', () => {
      expect(calculateStats(null as any)).toEqual([]);
      expect(calculateStats(undefined as any)).toEqual([]);
      expect(calculateStats({} as any)).toEqual([]);
    });

    it('calculates number stats (aces, winners, etc.)', () => {
      const points = generateMatchPoints();
      const counters = buildCounters(points);
      const stats = calculateStats(counters);

      const acesStat = stats.find((s) => s.category === 'Aces');
      expect(acesStat).toBeDefined();
      expect(acesStat!.teams[0].value).toBe(5); // 4 in game 1 + 1 in game 3
    });

    it('calculates percentage stats (first serve %, etc.)', () => {
      const points = generateMatchPoints();
      const counters = buildCounters(points);
      const stats = calculateStats(counters);

      const firstServe = stats.find((s) => s.category === 'First Serve %');
      expect(firstServe).toBeDefined();
      expect(firstServe!.teams[0].display).toContain('%');
    });

    it('calculates maxConsecutive stats (max pts in a row)', () => {
      const points = [
        makePoint({ winner: 0, index: 0, set: 0, game: 0 }),
        makePoint({ winner: 0, index: 1, set: 0, game: 0 }),
        makePoint({ winner: 0, index: 2, set: 0, game: 0 }),
        makePoint({ winner: 1, index: 3, set: 0, game: 0 }),
        makePoint({ winner: 0, index: 4, set: 0, game: 0 }),
      ];
      const counters = buildCounters(points);
      const stats = calculateStats(counters);

      const maxPts = stats.find((s) => s.category === 'Max Pts/Row');
      expect(maxPts).toBeDefined();
      expect(maxPts!.teams[0].value).toBe(3);
    });

    it('calculates difference stats (breakpoints converted)', () => {
      const points = [
        makePoint({ winner: 1, server: 0, breakpoint: true }), // team 0 broken
        makePoint({ winner: 0, server: 0, breakpoint: true }), // team 0 saves
        makePoint({ winner: 1, server: 0, breakpoint: true }), // team 0 broken
      ];
      const counters = buildCounters(points);
      const stats = calculateStats(counters);

      const bpConverted = stats.find((s) => s.category === 'Breakpoints Converted');
      expect(bpConverted).toBeDefined();
    });

    it('calculates aggressive margin', () => {
      const points = [
        makePoint({ winner: 0, result: 'Ace' }),
        makePoint({ winner: 0, result: 'Winner' }),
        makePoint({ winner: 1, result: 'Unforced Error' }), // UE attributed to loser (team 0)
      ];
      const counters = buildCounters(points);
      const stats = calculateStats(counters);

      const margin = stats.find((s) => s.category === 'Aggressive Margin');
      expect(margin).toBeDefined();
    });

    it('excludes stats where both teams have 0', () => {
      const counters = buildCounters([makePoint({ winner: 0 })]);
      const stats = calculateStats(counters);
      const gamesWon = stats.find((s) => s.category === 'Games Won');
      expect(gamesWon).toBeUndefined(); // no games completed
    });

    it('handles maxConsecutive with empty episodes', () => {
      const counters = buildCounters([]);
      const stats = calculateStats(counters);
      const maxGames = stats.find((s) => s.category === 'Max Games/Row');
      expect(maxGames).toBeUndefined(); // both teams 0, excluded
    });

    it('handles percentage with zero denominator', () => {
      // Player 0 serves but player 1 never serves
      const points = [makePoint({ winner: 0, server: 0, serve: 1 })];
      const counters = buildCounters(points);
      const stats = calculateStats(counters);

      const firstServe = stats.find((s) => s.category === 'First Serve %');
      expect(firstServe).toBeDefined();
      // Team 1 never served so denominator is 0
      expect(firstServe!.teams[1].value).toBe(0);
    });

    it('handles difference with zero denominator', () => {
      // No breakpoints at all
      const points = [makePoint({ winner: 0 })];
      const counters = buildCounters(points);
      const stats = calculateStats(counters);

      const bp = stats.find((s) => s.category === 'Breakpoints Converted');
      expect(bp).toBeUndefined(); // both teams 0, excluded
    });

    it('handles maxConsecutive streak tracking correctly', () => {
      // Points with non-consecutive indices
      const points = [
        makePoint({ winner: 0, index: 0 }),
        makePoint({ winner: 0, index: 1 }),
        makePoint({ winner: 1, index: 2 }),
        makePoint({ winner: 0, index: 3 }),
        makePoint({ winner: 0, index: 4 }),
        makePoint({ winner: 0, index: 5 }),
        makePoint({ winner: 0, index: 6 }),
      ];
      const counters = buildCounters(points);
      const stats = calculateStats(counters);

      const maxPts = stats.find((s) => s.category === 'Max Pts/Row');
      expect(maxPts!.teams[0].value).toBe(4); // indices 3,4,5,6
    });

    it('handles maxConsecutive for games with game attribute', () => {
      const points: PointWithMetadata[] = [];
      let idx = 0;

      // Team 0 wins games 0,1,2 then team 1 wins game 3, team 0 wins game 4
      for (let g = 0; g < 3; g++) {
        for (let p = 0; p < 4; p++) {
          points.push(makePoint({ winner: 0, index: idx++, game: g, server: 0 }));
        }
        if (g < 2) points.push(makePoint({ winner: 0, index: idx++, game: g + 1, server: 0 })); // game boundary marker
      }
      // Game 3 by team 1
      points.push(makePoint({ winner: 0, index: idx++, game: 3, server: 1 })); // boundary
      for (let p = 0; p < 4; p++) {
        points.push(makePoint({ winner: 1, index: idx++, game: 3, server: 1 }));
      }
      points.push(makePoint({ winner: 1, index: idx, game: 4, server: 0 })); // boundary

      const counters = buildCounters(points);
      const stats = calculateStats(counters);

      const maxGames = stats.find((s) => s.category === 'Max Games/Row');
      expect(maxGames).toBeDefined();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// standalone
// ═══════════════════════════════════════════════════════════════════════

describe('standalone', () => {
  describe('calculateMatchStatistics', () => {
    it('returns counters, calculated, and summary', () => {
      const points = generateMatchPoints();
      const matchUp = {} as any;
      const stats = calculateMatchStatistics(matchUp, points);

      expect(stats.counters).toBeDefined();
      expect(stats.calculated).toBeDefined();
      expect(stats.summary).toBeDefined();
    });

    it('handles null/undefined points', () => {
      const stats = calculateMatchStatistics({} as any, null as any);
      expect(stats.counters).toBeDefined();
      expect(stats.calculated).toEqual([]);
    });

    it('applies setFilter option', () => {
      const points = [
        makePoint({ winner: 0, set: 0 }),
        makePoint({ winner: 0, set: 1 }),
      ];
      const stats = calculateMatchStatistics({} as any, points, { setFilter: 0 });
      expect(stats.summary!.totalPoints).toBe(1);
    });
  });

  describe('enrichPointHistory', () => {
    it('returns empty array for null input', () => {
      expect(enrichPointHistory(null as any)).toEqual([]);
    });

    it('enriches raw points with context', () => {
      const raw = [{ code: 'A' }, { code: 'D' }, { code: 'S' }];
      const enriched = enrichPointHistory(raw);
      expect(enriched.length).toBe(3);
      expect(enriched[0].server).toBe(0);
      expect(enriched[0].index).toBe(0);
      expect(enriched[0].set).toBe(0);
      expect(enriched[0].game).toBe(0);
    });

    it('context tracks game/set from initial state', () => {
      // enrichPoint overrides set/game with context values, so raw set/game
      // are replaced. The transitions track based on enriched values.
      const raw = [
        { code: 'A' },
        { code: 'D' },
        { code: 'S' },
      ];
      const enriched = enrichPointHistory(raw);
      // All points share the same initial context
      expect(enriched[0].game).toBe(0);
      expect(enriched[0].set).toBe(0);
      expect(enriched[1].game).toBe(0);
      expect(enriched[2].game).toBe(0);
    });

    it('server stays consistent across points without game changes', () => {
      const raw = [{ code: 'A' }, { code: 'D' }, { code: 'S' }, { code: 'R' }];
      const enriched = enrichPointHistory(raw);
      // Without game transitions, server stays the same
      enriched.forEach((p) => expect(p.server).toBe(0));
    });
  });

  describe('getQuickStats', () => {
    it('returns quick summary with tuples', () => {
      const points = generateMatchPoints();
      const quick = getQuickStats(points);

      expect(quick.aces).toHaveLength(2);
      expect(quick.doubleFaults).toHaveLength(2);
      expect(quick.winners).toHaveLength(2);
      expect(quick.unforcedErrors).toHaveLength(2);
      expect(quick.totalPoints).toHaveLength(2);
    });

    it('returns zeros for empty points', () => {
      const quick = getQuickStats([]);
      expect(quick.aces).toEqual([0, 0]);
      expect(quick.totalPoints).toEqual([0, 0]);
    });

    it('handles null points', () => {
      const quick = getQuickStats(null as any);
      expect(quick.aces).toEqual([0, 0]);
    });

    it('applies setFilter option', () => {
      const points = [
        makePoint({ winner: 0, set: 0, result: 'Ace' }),
        makePoint({ winner: 0, set: 1, result: 'Ace' }),
      ];
      const quick = getQuickStats(points, { setFilter: 0 });
      expect(quick.aces[0]).toBe(1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// toStatObjects
// ═══════════════════════════════════════════════════════════════════════

describe('toStatObjects', () => {
  it('returns empty array for null/undefined stats', () => {
    expect(toStatObjects(null as any)).toEqual([]);
    expect(toStatObjects(undefined as any)).toEqual([]);
    expect(toStatObjects({} as any)).toEqual([]);
  });

  it('returns empty array when counters.teams is missing', () => {
    expect(toStatObjects({ counters: {} } as any)).toEqual([]);
  });

  it('produces stat objects from match data', () => {
    const points = generateMatchPoints();
    const stats = calculateMatchStatistics({} as any, points);
    const objects = toStatObjects(stats);

    expect(objects.length).toBeGreaterThan(0);
    const names = objects.map((o) => o.name);
    expect(names).toContain('Aces');
    expect(names).toContain('Double Faults');
    expect(names).toContain('Total Points Won');
    expect(names).toContain('Winners');
    expect(names).toContain('Unforced Errors');
    expect(names).toContain('Forced Errors');
  });

  it('includes serve breakdown when 1st/2nd serve data differs', () => {
    const points = [
      makePoint({ winner: 0, server: 0, serve: 1, result: 'Ace' }),
      makePoint({ winner: 0, server: 0, serve: 2, result: 'Winner' }),
      makePoint({ winner: 1, server: 1, serve: 1, result: 'Serve Winner' }),
      makePoint({ winner: 0, server: 1, serve: 2, result: 'Return Winner' }),
    ];
    const stats = calculateMatchStatistics({} as any, points);
    const objects = toStatObjects(stats);
    const names = objects.map((o) => o.name);

    expect(names).toContain('1st Serve In');
    expect(names).toContain('1st Serve Points Won');
    expect(names).toContain('2nd Serve Points Won');
  });

  it('excludes serve breakdown when only 1st serves present', () => {
    const points = [
      makePoint({ winner: 0, server: 0, serve: 1 }),
      makePoint({ winner: 1, server: 1, serve: 1 }),
    ];
    const stats = calculateMatchStatistics({} as any, points);
    const objects = toStatObjects(stats);
    const names = objects.map((o) => o.name);

    expect(names).not.toContain('1st Serve In');
  });

  it('includes break points stats', () => {
    const points = [
      makePoint({ winner: 1, server: 0, breakpoint: true }),
      makePoint({ winner: 0, server: 0, breakpoint: true }),
    ];
    const stats = calculateMatchStatistics({} as any, points);
    const objects = toStatObjects(stats);
    const names = objects.map((o) => o.name);

    expect(names).toContain('Break Points Won');
    expect(names).toContain('Break Points Saved');
  });

  it('includes games won and consecutive stats', () => {
    const points = generateMatchPoints();
    const stats = calculateMatchStatistics({} as any, points);
    const objects = toStatObjects(stats);
    const names = objects.map((o) => o.name);

    expect(names).toContain('Games Won');
    expect(names).toContain('Most Consecutive Points Won');
    expect(names).toContain('Most Consecutive Games Won');
  });

  it('stat objects have correct structure', () => {
    const points = generateMatchPoints();
    const stats = calculateMatchStatistics({} as any, points);
    const objects = toStatObjects(stats);

    objects.forEach((obj) => {
      expect(obj.name).toBeDefined();
      expect(obj.numerator).toHaveLength(2);
      if (obj.pct) {
        expect(obj.pct).toHaveLength(2);
      }
      if (obj.denominator) {
        expect(obj.denominator).toHaveLength(2);
      }
    });
  });

  it('includes receiving points won and service points won', () => {
    const points = generateMatchPoints();
    const stats = calculateMatchStatistics({} as any, points);
    const objects = toStatObjects(stats);
    const names = objects.map((o) => o.name);

    expect(names).toContain('Receiving Points Won');
    expect(names).toContain('Service Points Won');
  });
});
