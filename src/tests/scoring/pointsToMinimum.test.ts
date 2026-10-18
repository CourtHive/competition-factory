/**
 * pointsToGame is the MINIMUM number of points a side needs to win the current game, winning every point from here
 * (pointsToCalculator.ts header). A trailing side must first take away the opponent's lead, so the minimum is
 *
 *     max(target, opponentPoints + margin) - myPoints
 *
 * The oracle below is written from that rule alone, not from the engine's game-won predicates, and is compared
 * with calculatePointsTo over every undecided point score of each game family, then projected through the public
 * ScoringEngine episodes. Found by the 2026-10-17 test-infrastructure survey: 5-6 in a tiebreak to 7 reported 2
 * (the minimum is 3), and an existing exact assertion encoded the wrong value.
 */
import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { calculatePointsTo } from '@Mutate/scoring/pointsToCalculator';
import { resolveSetType } from '@Tools/scoring/scoringUtilities';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { describe, expect, it } from 'vitest';

// constants
import { IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import { SINGLES_MATCHUP } from '@Constants/matchUpTypes';

type Rule = {
  target: number;
  decided: (a: number, b: number) => boolean;
  minimum: (me: number, opp: number) => number;
};

// win by `margin` once someone has reached `target`
function plainRule(target: number, margin: number): Rule {
  const decided = (a: number, b: number) => Math.max(a, b) >= target && Math.abs(a - b) >= margin;
  return { target, decided, minimum: (me, opp) => Math.max(target, opp + margin) - me };
}

// tennis game with a golden point once both sides reach 2 + deuceAfter (deuce number deuceAfter)
function deuceAfterRule(deuceAfter: number): Rule {
  const golden = 2 + deuceAfter;
  const decided = (a: number, b: number) => {
    if (a >= golden && b >= golden) return a !== b;
    return Math.max(a, b) >= 4 && Math.abs(a - b) >= 2;
  };
  // catching up to an opponent already at the golden threshold makes the next point decide it
  const minimum = (me: number, opp: number) => (opp >= golden ? opp + 1 - me : Math.max(4, opp + 2) - me);
  return { target: 4, decided, minimum };
}

// every point score play can reach without the game having ended, walking from 0-0
function reachableUndecided(rule: Rule, span: number): [number, number][] {
  const seen = new Set<string>(['0-0']);
  const queue: [number, number][] = [[0, 0]];
  const states: [number, number][] = [];
  while (queue.length) {
    const [a, b] = queue.shift()!;
    states.push([a, b]);
    for (const [x, y] of [
      [a + 1, b],
      [a, b + 1],
    ]) {
      const key = `${x}-${y}`;
      if (x > span || y > span || seen.has(key) || rule.decided(x, y)) continue;
      seen.add(key);
      queue.push([x, y]);
    }
  }
  return states;
}

function gameState(matchUpFormat: string, games: [number, number], points: [number, number]) {
  const prior = games[0] + games[1];
  return {
    matchUpId: 'points-to-minimum',
    matchUpFormat,
    matchUpStatus: IN_PROGRESS,
    matchUpType: SINGLES_MATCHUP,
    sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
    score: {
      sets: [
        {
          setNumber: 1,
          side1Score: games[0],
          side2Score: games[1],
          side1GameScores: [...new Array(prior).fill(0), points[0]],
          side2GameScores: [...new Array(prior).fill(0), points[1]],
        },
      ],
    },
  } as any;
}

function pointsToGame(matchUpFormat: string, games: [number, number], points: [number, number]) {
  const formatStructure = parse(matchUpFormat)!;
  const setType = resolveSetType(formatStructure, [0, 0], 1);
  const result = calculatePointsTo(
    gameState(matchUpFormat, games, points),
    formatStructure,
    setType,
    formatStructure.setFormat,
    0,
  );
  return result?.pointsToGame;
}

const families: { name: string; matchUpFormat: string; games: [number, number]; rule: Rule }[] = [
  { name: 'standard game', matchUpFormat: 'SET3-S:6/TB7', games: [0, 0], rule: plainRule(4, 2) },
  { name: 'NoAD game', matchUpFormat: 'SET3-S:6NOAD/TB7', games: [0, 0], rule: plainRule(4, 1) },
  {
    name: 'golden point after the third deuce',
    matchUpFormat: 'SET3-S:6/TB7-G:TN3D',
    games: [0, 0],
    rule: deuceAfterRule(3),
  },
  { name: 'set tiebreak to 7', matchUpFormat: 'SET3-S:6/TB7', games: [6, 6], rule: plainRule(7, 2) },
  { name: 'NoAD set tiebreak to 7', matchUpFormat: 'SET3-S:6/TB7NOAD', games: [6, 6], rule: plainRule(7, 1) },
  { name: 'tiebreak-only set to 7', matchUpFormat: 'SET1-S:TB7', games: [0, 0], rule: plainRule(7, 2) },
  { name: 'tiebreak-only set to 11', matchUpFormat: 'SET3-S:TB11', games: [0, 0], rule: plainRule(11, 2) },
];

describe('pointsToGame is the minimum points to win the game', () => {
  it.each(families)('$name: every undecided point score matches the rule', ({ matchUpFormat, games, rule }) => {
    const mismatches: string[] = [];
    const states = reachableUndecided(rule, rule.target + 6);
    for (const [a, b] of states) {
      const expected = [rule.minimum(a, b), rule.minimum(b, a)];
      const actual = pointsToGame(matchUpFormat, games, [a, b]);
      if (actual?.[0] !== expected[0] || actual?.[1] !== expected[1]) {
        mismatches.push(`${a}-${b}: expected ${expected} got ${actual}`);
      }
    }
    expect(states.length).toBeGreaterThan(10); // the grid is not vacuous (a NoAD game has 16)
    expect(mismatches).toEqual([]);
  });

  it('witnesses: the trailing side must take away the lead first', () => {
    expect(pointsToGame('SET1-S:6/TB7', [6, 6], [5, 6])).toEqual([3, 1]); // 6-6, 7-6, 8-6
    expect(pointsToGame('SET1-S:6/TB7', [6, 6], [4, 6])).toEqual([4, 1]); // 5-6, 6-6, 7-6, 8-6
    expect(pointsToGame('SET3-S:6/TB7', [0, 0], [1, 3])).toEqual([4, 1]); // 15-40: 30-40, deuce, ad, game
    expect(pointsToGame('SET3-S:6/TB7', [0, 0], [2, 3])).toEqual([3, 1]); // 30-40: deuce, ad, game
    expect(pointsToGame('SET3-S:6/TB7', [0, 0], [3, 4])).toEqual([3, 1]); // ad out: deuce, ad, game
    expect(pointsToGame('SET3-S:6/TB7', [0, 0], [4, 3])).toEqual([1, 3]); // ad in, seen from the receiver
  });

  it('controls: leading, level and NoAD values are unchanged', () => {
    expect(pointsToGame('SET3-S:6/TB7', [0, 0], [0, 0])).toEqual([4, 4]);
    expect(pointsToGame('SET3-S:6/TB7', [0, 0], [3, 3])).toEqual([2, 2]); // deuce
    expect(pointsToGame('SET3-S:6NOAD/TB7', [0, 0], [3, 3])).toEqual([1, 1]); // deciding point
    expect(pointsToGame('SET3-S:6NOAD/TB7', [0, 0], [1, 3])).toEqual([3, 1]); // NoAD 15-40: 30-40, 40-40, game
    expect(pointsToGame('SET1-S:6/TB7', [6, 6], [6, 6])).toEqual([2, 2]);
  });

  it('a decided game reports 0 for both sides', () => {
    expect(pointsToGame('SET3-S:6/TB7', [0, 0], [4, 1])).toEqual([0, 0]);
    expect(pointsToGame('SET1-S:6/TB7', [6, 6], [8, 6])).toEqual([0, 0]);
  });
});

describe('the public scorer projects the minimum onto each point', () => {
  it('5-6 in a tiebreak-only set to 7: the next point records [3, 1]', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:TB7' });
    for (let i = 0; i < 5; i++) {
      engine.addPoint({ winner: 0 });
      engine.addPoint({ winner: 1 });
    }
    engine.addPoint({ winner: 1 }); // 5-6
    engine.addPoint({ winner: 0 }); // the point played at 5-6
    const episode = engine.getEpisodes().at(-1);
    expect(episode?.needed.pointsToGame).toEqual([3, 1]);
  });

  it('15-40: the next point records [4, 1] and is a break point for the receiver', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });
    engine.addPoint({ winner: 1 });
    engine.addPoint({ winner: 1 }); // 15-40, side 0 serving
    engine.addPoint({ winner: 0 });
    const point = engine.getState().history?.points?.at(-1);
    expect(point?.pointsToGame).toEqual([4, 1]);
    expect(point?.isBreakpoint).toBe(true);
  });
});
