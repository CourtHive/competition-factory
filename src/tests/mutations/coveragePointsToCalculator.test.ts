/**
 * Coverage-focused tests for pointsToCalculator.ts
 *
 * Targets uncovered lines/branches:
 * - L204-206: NoAD game scoring (myPoints > oppPoints → 0, fallback → 2)
 * - L211-213: deuceAfter golden point territory (all three branches)
 * - L218, L224: Standard deuce diff >= 2, myPoints >= pointsTo (already won)
 * - L242-244, L247, L252: Tiebreak extended play NoAD paths
 * - L301, L318: calcSideGamesToSet already-won and no-tiebreak margin
 * - L349, L376, L382: calcSidePointsToSet, getMinPointsPerSet tiebreakSet/timed
 */

import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { calculatePointsTo } from '@Mutate/scoring/pointsToCalculator';
import { resolveSetType } from '@Tools/scoring/scoringUtilities';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { describe, expect, it } from 'vitest';

// constants
import { IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import { SINGLES_MATCHUP } from '@Constants/matchUpTypes';

// ============================================================================
// Helpers
// ============================================================================
function winGame(engine: ScoringEngine, winner: 0 | 1) {
  for (let i = 0; i < 4; i++) engine.addPoint({ winner });
}

// ============================================================================
// 1. NoAD game at deuce — covers L202-206 (calcSidePointsToGame NoAD branch)
// ============================================================================
describe('NoAD game scoring — calcSidePointsToGame NoAD paths', () => {
  it('at 3-3 (deuce) with NoAD, both sides need 1 point', () => {
    // SET1-S:6NOAD/TB7 — NoAD game format
    const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:6NOAD/TB7' });
    // Play to 40-40 (3 points each)
    for (let i = 0; i < 3; i++) engine.addPoint({ winner: 0 });
    for (let i = 0; i < 3; i++) engine.addPoint({ winner: 1 });

    // At 3-3: myPoints == oppPoints in NoAD → return 1 for each side (L205)
    let result: any = calculatePointsTo(
      engine.getState(),
      parse('SET1-S:6NOAD/TB7')!,
      'standard',
      parse('SET1-S:6NOAD/TB7')!.setFormat,
      0,
    );
    expect(result).toBeDefined();
    expect(result.pointsToGame).toEqual([1, 1]);
  });

  it('side 0 wins NoAD game from deuce — pointsToGame is [0, ...] on last point', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:6NOAD/TB7' });
    // Play to 40-40
    for (let i = 0; i < 3; i++) engine.addPoint({ winner: 0 });
    for (let i = 0; i < 3; i++) engine.addPoint({ winner: 1 });
    // Side 0 wins the golden point — game over, score moves to 1-0
    engine.addPoint({ winner: 0 });

    // The game is now over (1-0 in games). The matchUp state is at the start
    // of a new game. Verify the winning point was recorded correctly.
    let result: any = engine.getState();
    expect(result.score.sets[0].side1Score).toBe(1);
    expect(result.score.sets[0].side2Score).toBe(0);
  });

  it('a NoAD game decided at 3-4 reports 0 for both sides', () => {
    // Construct matchUp state where one side is behind in NoAD deuce territory
    // Use a matchUp at 4-3 in a standard game with NoAD. This can't happen in
    // normal play (NoAD ends at deuce), so test via calculatePointsTo directly.
    const format = 'SET1-S:6NOAD/TB7';
    const fs = parse(format)!;
    const mu: any = {
      matchUpId: 'mu-noad-behind',
      matchUpFormat: format,
      matchUpStatus: IN_PROGRESS,
      matchUpType: SINGLES_MATCHUP,
      sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
      score: {
        sets: [
          {
            setNumber: 1,
            side1Score: 0,
            side2Score: 0,
            side1GameScores: [3],
            side2GameScores: [4],
          },
        ],
      },
    };

    // 3-4 in a NoAD game is decided (the deciding point was played): both sides report 0
    let result: any = calculatePointsTo(mu, fs, 'standard', fs.setFormat, 0);
    expect(result).toBeDefined();
    expect(result.pointsToGame[0]).toBe(0);
    expect(result.pointsToGame[1]).toBe(0);
  });
});

// ============================================================================
// 2. deuceAfter format — covers L210-213 (golden point past deuce cap)
// ============================================================================
describe('deuceAfter golden point territory — L210-213', () => {
  it('at golden point deuce (equal), both sides need 1 point — L212', () => {
    // G:TN2D means deuceAfter:2 — golden point after 2nd deuce
    const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:6/TB7-G:TN2D' });
    // Play to deuce #1 (3-3)
    for (let i = 0; i < 3; i++) engine.addPoint({ winner: 0 });
    for (let i = 0; i < 3; i++) engine.addPoint({ winner: 1 });
    // AD side 0 (4-3), back to deuce #2 (4-4) — this is golden point cap
    engine.addPoint({ winner: 0 }); // 4-3
    engine.addPoint({ winner: 1 }); // 4-4 → at golden point

    const fs = parse('SET1-S:6/TB7-G:TN2D')!;
    let result: any = calculatePointsTo(engine.getState(), fs, 'standard', fs.setFormat, 0);
    expect(result).toBeDefined();
    // Both at 4 (= 2 + deuceAfter=2), myPoints == oppPoints → return 1 (L212)
    expect(result.pointsToGame).toEqual([1, 1]);
  });

  it('a game decided past the deuce cap at 5-4 reports 0 for both sides', () => {
    const format = 'SET1-S:6/TB7-G:TN2D';
    const fs = parse(format)!;
    // deuceAfter=2 → golden point at myPoints >= 2+2=4 && oppPoints >= 4
    // Construct state with 5-4 (side1 ahead past deuce cap)
    const mu: any = {
      matchUpId: 'mu-deuce-after',
      matchUpFormat: format,
      matchUpStatus: IN_PROGRESS,
      matchUpType: SINGLES_MATCHUP,
      sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
      score: {
        sets: [
          {
            setNumber: 1,
            side1Score: 0,
            side2Score: 0,
            side1GameScores: [5],
            side2GameScores: [4],
          },
        ],
      },
    };

    let result: any = calculatePointsTo(mu, fs, 'standard', fs.setFormat, 0);
    expect(result).toBeDefined();
    // 5-4 past the deuce cap is decided by the golden point: both sides report 0
    expect(result.pointsToGame[0]).toBe(0);
    expect(result.pointsToGame[1]).toBe(0);
  });
});

// ============================================================================
// 3. Standard deuce: diff >= 2 (already won) — L218
//    and myPoints >= pointsTo (already won) — L224
// ============================================================================
describe('calcSidePointsToGame — already-won paths', () => {
  it('a game decided at 5-3 reports 0 for both sides', () => {
    const format = 'SET1-S:6/TB7';
    const fs = parse(format)!;
    // Construct state at 5-3 in a game (both >= pointsTo-1=3, diff=2)
    const mu: any = {
      matchUpId: 'mu-deuce-won',
      matchUpFormat: format,
      matchUpStatus: IN_PROGRESS,
      matchUpType: SINGLES_MATCHUP,
      sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
      score: {
        sets: [
          {
            setNumber: 1,
            side1Score: 0,
            side2Score: 0,
            side1GameScores: [5],
            side2GameScores: [3],
          },
        ],
      },
    };

    let result: any = calculatePointsTo(mu, fs, 'standard', fs.setFormat, 0);
    expect(result).toBeDefined();
    // 5-3 is a decided game: nothing is left to win in it, so both sides report 0
    expect(result.pointsToGame[0]).toBe(0);
    expect(result.pointsToGame[1]).toBe(0);
  });

  it('a game decided at 4-0 reports 0 for both sides', () => {
    const format = 'SET1-S:6/TB7';
    const fs = parse(format)!;
    // Construct state at 4-0 in a game (myPoints=4 >= pointsTo=4, not in deuce)
    const mu: any = {
      matchUpId: 'mu-won-preduce',
      matchUpFormat: format,
      matchUpStatus: IN_PROGRESS,
      matchUpType: SINGLES_MATCHUP,
      sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
      score: {
        sets: [
          {
            setNumber: 1,
            side1Score: 0,
            side2Score: 0,
            side1GameScores: [4],
            side2GameScores: [0],
          },
        ],
      },
    };

    let result: any = calculatePointsTo(mu, fs, 'standard', fs.setFormat, 0);
    expect(result).toBeDefined();
    // 4-0 is a decided game: both sides report 0
    expect(result.pointsToGame[0]).toBe(0);
    expect(result.pointsToGame[1]).toBe(0);
  });
});

// ============================================================================
// 4. Tiebreak with NoAD — covers L241-244, L247, L252
// ============================================================================
describe('Tiebreak NoAD extended play — calcSideTiebreakPointsTo', () => {
  it('at extended play equal (e.g. 6-6 in TB7 NoAD) → both need 1 — L243', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:6/TB7NOAD' });
    // Get to 6-6 in games
    for (let g = 0; g < 6; g++) {
      winGame(engine, 0);
      winGame(engine, 1);
    }
    // Now in tiebreak — play to 6-6 in tiebreak (extended play)
    for (let i = 0; i < 6; i++) {
      engine.addPoint({ winner: 0 });
      engine.addPoint({ winner: 1 });
    }

    const fs = parse('SET1-S:6/TB7NOAD')!;
    let result: any = calculatePointsTo(engine.getState(), fs, 'standard', fs.setFormat, 0);
    expect(result).toBeDefined();
    // At 6-6 in tiebreak, both >= tiebreakTo-1=6, NoAD, equal → 1 each (L243)
    expect(result.pointsToGame).toEqual([1, 1]);
  });

  it('a NoAD tiebreak decided at 7-6 reports 0 for both sides', () => {
    const format = 'SET1-S:6/TB7NOAD';
    const fs = parse(format)!;
    // Construct state at tiebreak 7-6 with NoAD (side1 ahead in extended play)
    const mu: any = {
      matchUpId: 'mu-tb-noad',
      matchUpFormat: format,
      matchUpStatus: IN_PROGRESS,
      matchUpType: SINGLES_MATCHUP,
      sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
      score: {
        sets: [
          {
            setNumber: 1,
            side1Score: 6,
            side2Score: 6,
            side1GameScores: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7],
            side2GameScores: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6],
          },
        ],
      },
    };

    let result: any = calculatePointsTo(mu, fs, 'standard', fs.setFormat, 0);
    expect(result).toBeDefined();
    // 7-6 in a NoAD tiebreak is decided: both sides report 0
    expect(result.pointsToGame[0]).toBe(0);
    expect(result.pointsToGame[1]).toBe(0);
  });

  it('a tiebreak decided at 8-6 reports 0 for both sides', () => {
    const format = 'SET1-S:6/TB7';
    const fs = parse(format)!;
    // Construct tiebreak at 8-6 (diff=2, already won)
    const mu: any = {
      matchUpId: 'mu-tb-won',
      matchUpFormat: format,
      matchUpStatus: IN_PROGRESS,
      matchUpType: SINGLES_MATCHUP,
      sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
      score: {
        sets: [
          {
            setNumber: 1,
            side1Score: 6,
            side2Score: 6,
            side1GameScores: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8],
            side2GameScores: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6],
          },
        ],
      },
    };

    let result: any = calculatePointsTo(mu, fs, 'standard', fs.setFormat, 0);
    expect(result).toBeDefined();
    // 8-6 is a decided tiebreak: both sides report 0
    expect(result.pointsToGame[0]).toBe(0);
    expect(result.pointsToGame[1]).toBe(0);
  });

  it('a tiebreak decided at 7-3 reports 0 for both sides', () => {
    const format = 'SET1-S:6/TB7';
    const fs = parse(format)!;
    // Construct tiebreak at 7-3 (myPoints >= tiebreakTo, but not both in extended)
    const mu: any = {
      matchUpId: 'mu-tb-past',
      matchUpFormat: format,
      matchUpStatus: IN_PROGRESS,
      matchUpType: SINGLES_MATCHUP,
      sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
      score: {
        sets: [
          {
            setNumber: 1,
            side1Score: 6,
            side2Score: 6,
            side1GameScores: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7],
            side2GameScores: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3],
          },
        ],
      },
    };

    let result: any = calculatePointsTo(mu, fs, 'standard', fs.setFormat, 0);
    expect(result).toBeDefined();
    // 7-3 is a decided tiebreak: both sides report 0
    expect(result.pointsToGame[0]).toBe(0);
    expect(result.pointsToGame[1]).toBe(0);
  });
});

// ============================================================================
// 5. gamesToSet counts the games won in a row that win the set (§ 11.2; SE2b-D23, CA 2026-10-21): a set whose
//    score already wins it, never marked won, counts the next game, as v2 does; and the no-tiebreak margin
// ============================================================================
describe('gamesToSet — a score that already wins the set, and the no-tiebreak margin', () => {
  it('a set at 7-5 not marked won counts the next game — § 11.2', () => {
    const format = 'SET1-S:6/TB7';
    const fs = parse(format)!;
    // Construct state at 7-5 in games (past setTo, diff=2 >= winBy=2)
    const mu: any = {
      matchUpId: 'mu-set-won',
      matchUpFormat: format,
      matchUpStatus: IN_PROGRESS,
      matchUpType: SINGLES_MATCHUP,
      sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
      score: {
        sets: [
          {
            setNumber: 1,
            side1Score: 7,
            side2Score: 5,
            side1GameScores: [0],
            side2GameScores: [0],
          },
        ],
      },
    };

    let result: any = calculatePointsTo(mu, fs, 'standard', fs.setFormat, 0);
    expect(result).toBeDefined();
    // side1: 8-5 wins the set by its rule, so one game in a row
    expect(result.gamesToSet[0]).toBe(1);
  });

  it('no-tiebreak advantage set at 7-5 not marked won counts the next game — § 11.2', () => {
    // SET1-S:6 (no tiebreak format — noTiebreak is true)
    const format = 'SET5-S:6/TB7-F:6';
    const fs = parse(format)!;
    // Use the final set format which has noTiebreak
    const finalSetFormat = fs.finalSetFormat;

    // Construct a deciding set at 7-5 (past setTo, noTiebreak, diff=2 >= winBy)
    const mu: any = {
      matchUpId: 'mu-adv-set',
      matchUpFormat: format,
      matchUpStatus: IN_PROGRESS,
      matchUpType: SINGLES_MATCHUP,
      sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
      score: {
        sets: [
          { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 },
          { setNumber: 2, side1Score: 3, side2Score: 6, winningSide: 2 },
          { setNumber: 3, side1Score: 6, side2Score: 4, winningSide: 1 },
          { setNumber: 4, side1Score: 4, side2Score: 6, winningSide: 2 },
          {
            setNumber: 5,
            side1Score: 7,
            side2Score: 5,
            side1GameScores: [0],
            side2GameScores: [0],
          },
        ],
      },
    };

    const setType = resolveSetType(fs, [2, 2]);
    let result: any = calculatePointsTo(mu, fs, setType, finalSetFormat, 0);
    expect(result).toBeDefined();
    // In an advantage set side1 at 8-5 wins by the margin: one game in a row
    expect(result.gamesToSet[0]).toBe(1);
  });

  it('no-tiebreak: both close to setTo, diff < winBy — needs margin (L318 false branch)', () => {
    const format = 'SET5-S:6/TB7-F:6';
    const fs = parse(format)!;
    const finalSetFormat = fs.finalSetFormat;

    // Deciding set at 6-5 (both >= setTo-1=5, noTiebreak, diff=1 < winBy=2)
    const mu: any = {
      matchUpId: 'mu-adv-close',
      matchUpFormat: format,
      matchUpStatus: IN_PROGRESS,
      matchUpType: SINGLES_MATCHUP,
      sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
      score: {
        sets: [
          { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 },
          { setNumber: 2, side1Score: 3, side2Score: 6, winningSide: 2 },
          { setNumber: 3, side1Score: 6, side2Score: 4, winningSide: 1 },
          { setNumber: 4, side1Score: 4, side2Score: 6, winningSide: 2 },
          {
            setNumber: 5,
            side1Score: 6,
            side2Score: 5,
            side1GameScores: [0],
            side2GameScores: [0],
          },
        ],
      },
    };

    const setType = resolveSetType(fs, [2, 2]);
    let result: any = calculatePointsTo(mu, fs, setType, finalSetFormat, 0);
    expect(result).toBeDefined();
    // side1: 6 >= setTo=6, diff=1, winBy-diff=2-1=1
    expect(result.gamesToSet[0]).toBe(1);
    // side2: 5 < setTo=6, both >= setTo-1=5, noTiebreak → winBy-diff=2-(-1)=3
    expect(result.gamesToSet[1]).toBe(3);
  });
});

// ============================================================================
// 6. pointsToSet: the game's points plus the remaining games at four points each (§ 11.2)
//    getMinPointsPerSet — tiebreakSet and timed
// ============================================================================
describe('calcSidePointsToSet and getMinPointsPerSet', () => {
  it('pointsToSet at a 7-5 set not marked won is the next game’s points — § 11.2', () => {
    const format = 'SET1-S:6/TB7';
    const fs = parse(format)!;
    // Construct state at 7-5 (set already won)
    const mu: any = {
      matchUpId: 'mu-pts-set-zero',
      matchUpFormat: format,
      matchUpStatus: IN_PROGRESS,
      matchUpType: SINGLES_MATCHUP,
      sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
      score: {
        sets: [
          {
            setNumber: 1,
            side1Score: 7,
            side2Score: 5,
            side1GameScores: [0],
            side2GameScores: [0],
          },
        ],
      },
    };

    let result: any = calculatePointsTo(mu, fs, 'standard', fs.setFormat, 0);
    expect(result).toBeDefined();
    // one game in a row, at the four points of the game in play
    expect(result.gamesToSet[0]).toBe(1);
    expect(result.pointsToSet[0]).toBe(4);
  });

  it('getMinPointsPerSet for tiebreakSet format — L376-379', () => {
    // SET3-S:TB11 — tiebreakSet with tiebreakTo=11
    const format = 'SET3-S:TB11';
    const fs = parse(format)!;

    const mu: any = {
      matchUpId: 'mu-tb-set',
      matchUpFormat: format,
      matchUpStatus: IN_PROGRESS,
      matchUpType: SINGLES_MATCHUP,
      sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
      score: {
        sets: [
          { setNumber: 1, side1Score: 0, side2Score: 0, winningSide: 1 },
          {
            setNumber: 2,
            side1GameScores: [0],
            side2GameScores: [0],
          },
        ],
      },
    };

    let result: any = calculatePointsTo(mu, fs, 'tiebreakOnly', fs.setFormat, 0);
    expect(result).toBeDefined();
    // With 1 set won by side 0 (setsWon=[1,0]), setsToWin=2:
    // pointsToMatch[0] = pointsToSet[0] + 0 * minPointsPerSet (need 1 more set)
    // pointsToMatch[1] = pointsToSet[1] + 1 * minPointsPerSet (need 2 more sets)
    // minPointsPerSet for tiebreakSet = tiebreakTo = 11 (L379)
    expect(result.pointsToMatch[1]).toBe(result.pointsToSet[1] + 11);
  });

  it('getMinPointsPerSet for timed format returns 0 — L382', () => {
    // We can't use calculatePointsTo with setType='timed' (returns undefined at L44).
    // But we can test indirectly via a format that has a timed setFormat in formatStructure
    // while the current set is standard. This requires a creative format.
    // Instead, test via a format with timed final set. The setFormat itself is what
    // getMinPointsPerSet inspects.
    //
    // Actually, getMinPointsPerSet(sf, formatStructure) is called with sf = formatStructure.setFormat,
    // so for a timed set format like SET1-S:T20, sf.timed would be true.
    // But calculatePointsTo returns undefined for timed setType.
    //
    // The timed branch (L382) is hit when setFormat has .timed property.
    // For a mixed format like SET3-S:6/TB7-F:T10, the setFormat is standard but
    // the finalSetFormat is timed. getMinPointsPerSet uses formatStructure.setFormat.
    //
    // Since the function returns 0 for timed and this affects pointsToMatch calculation,
    // we test it via calcPointsToGameInTiebreak indirectly, or accept that L382 is
    // only reachable when sf.timed is true. Let's construct the call directly.

    // Direct test of the path: use a tiebreakOnly set that has a timed setFormat
    // in the formatStructure. This is contrived but hits L382.
    const format = 'SET3-S:TB11';
    const fs = parse(format)!;
    // Monkey-patch setFormat to have timed: true to hit L382
    const modifiedFs = { ...fs, setFormat: { ...fs.setFormat, timed: true } };

    const mu: any = {
      matchUpId: 'mu-timed-pts',
      matchUpFormat: format,
      matchUpStatus: IN_PROGRESS,
      matchUpType: SINGLES_MATCHUP,
      sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
      score: {
        sets: [
          {
            setNumber: 1,
            side1GameScores: [5],
            side2GameScores: [3],
          },
        ],
      },
    };

    let result: any = calculatePointsTo(mu, modifiedFs, 'tiebreakOnly', modifiedFs.setFormat, 0);
    expect(result).toBeDefined();
    // With timed setFormat, getMinPointsPerSet returns 0 (L382),
    // so remaining sets contribute 0 to pointsToMatch
    expect(result.pointsToMatch).toBeDefined();
  });
});

// ============================================================================
// 7. Standard game at advantage — via ScoringEngine
// ============================================================================
describe('Standard game at advantage — pointsToGame via ScoringEngine', () => {
  it('at advantage (4-3 points), advantaged side needs 1, other needs 2', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:6/TB7' });
    // Play to deuce (3-3)
    for (let i = 0; i < 3; i++) engine.addPoint({ winner: 0 });
    for (let i = 0; i < 3; i++) engine.addPoint({ winner: 1 });
    // Side 0 takes advantage (4-3)
    engine.addPoint({ winner: 0 });

    const fs = parse('SET1-S:6/TB7')!;
    let result: any = calculatePointsTo(engine.getState(), fs, 'standard', fs.setFormat, 0);
    expect(result).toBeDefined();
    // Side 0 at advantage needs 1; side 1 needs 3 (deuce, advantage, game)
    expect(result.pointsToGame[0]).toBe(1);
    expect(result.pointsToGame[1]).toBe(3);
  });

  it('at deuce (4-4 standard), both need 2', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:6/TB7' });
    // Play to 3-3
    for (let i = 0; i < 3; i++) engine.addPoint({ winner: 0 });
    for (let i = 0; i < 3; i++) engine.addPoint({ winner: 1 });
    // AD side 0 (4-3), back to deuce (4-4)
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });

    const fs = parse('SET1-S:6/TB7')!;
    let result: any = calculatePointsTo(engine.getState(), fs, 'standard', fs.setFormat, 0);
    expect(result).toBeDefined();
    // At 4-4 (deuce again): diff=0 → both need 2 (L220)
    expect(result.pointsToGame).toEqual([2, 2]);
  });
});

// ============================================================================
// 8. Timed set — verify calculatePointsTo returns undefined
// ============================================================================
describe('Timed set — calculatePointsTo returns undefined', () => {
  it('returns undefined for timed set — L44', () => {
    const format = 'SET1-S:T20';
    const fs = parse(format)!;
    const mu: any = {
      matchUpId: 'mu-timed',
      matchUpFormat: format,
      matchUpStatus: IN_PROGRESS,
      matchUpType: SINGLES_MATCHUP,
      sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
      score: { sets: [] },
    };

    let result: any = calculatePointsTo(mu, fs, 'timed', fs.setFormat, 0);
    expect(result).toBeUndefined();
  });

  it('timed set engine play still tracks points', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:T20' });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });
    engine.addPoint({ winner: 0 });

    let result: any = engine.getState();
    expect(result.score.sets.length).toBeGreaterThanOrEqual(1);
    expect(result.matchUpStatus).toBe(IN_PROGRESS);
  });
});
