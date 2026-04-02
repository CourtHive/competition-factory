/**
 * Regression tests for addPoint.ts + ScoringEngine completion logic refactoring.
 *
 * Tests scoring through both the pure addPoint function and
 * the ScoringEngine to verify extraction doesn't break behavior.
 */
import { addPoint, deriveServerBase, formatGameScore } from '@Mutate/scoring/addPoint';
import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { expect, it } from 'vitest';

import type { MatchUp } from '@Types/scoring/types';

function createMatchUp(format: string): MatchUp {
  return {
    matchUpId: 'test-match',
    matchUpFormat: format,
    matchUpStatus: 'TO_BE_PLAYED',
    score: { sets: [] },
    sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
  } as MatchUp;
}

// ─── addPoint: Standard tennis scoring ────────────────────────────────────
it('addPoint: standard set scoring completes game at 4-0', () => {
  const format = 'SET3-S:6/TB7';
  let matchUp = createMatchUp(format);

  // 4 points to side 0 wins the game
  for (let i = 0; i < 4; i++) {
    matchUp = addPoint(matchUp, { winner: 0 as 0 | 1 });
  }

  const currentSet = matchUp.score.sets[0];
  expect(currentSet.side1Score).toEqual(1);
  expect(currentSet.side2Score).toEqual(0);
});

it('addPoint: deuce requires 2-point margin', () => {
  const format = 'SET3-S:6/TB7';
  let matchUp = createMatchUp(format);

  // Get to deuce (3-3 in points)
  for (let i = 0; i < 3; i++) {
    matchUp = addPoint(matchUp, { winner: 0 as 0 | 1 });
    matchUp = addPoint(matchUp, { winner: 1 as 0 | 1 });
  }

  // 4-3: advantage side 0
  matchUp = addPoint(matchUp, { winner: 0 as 0 | 1 });
  let currentSet = matchUp.score.sets[0];
  expect(currentSet.side1Score).toEqual(0); // game not won yet

  // 4-4: back to deuce
  matchUp = addPoint(matchUp, { winner: 1 as 0 | 1 });
  currentSet = matchUp.score.sets[0];
  expect(currentSet.side1Score).toEqual(0);

  // 5-4, 6-4: side 0 wins game
  matchUp = addPoint(matchUp, { winner: 0 as 0 | 1 });
  matchUp = addPoint(matchUp, { winner: 0 as 0 | 1 });
  currentSet = matchUp.score.sets[0];
  expect(currentSet.side1Score).toEqual(1);
});

it('addPoint: complete a full set 6-0', () => {
  const format = 'SET3-S:6/TB7';
  let matchUp = createMatchUp(format);

  // Win 6 games for side 0 (4 points each)
  for (let g = 0; g < 6; g++) {
    for (let p = 0; p < 4; p++) {
      matchUp = addPoint(matchUp, { winner: 0 as 0 | 1 });
    }
  }

  const firstSet = matchUp.score.sets[0];
  expect(firstSet.side1Score).toEqual(6);
  expect(firstSet.side2Score).toEqual(0);
  expect(firstSet.winningSide).toEqual(1);
});

it('addPoint: tiebreak at 6-6', () => {
  const format = 'SET3-S:6/TB7';
  let matchUp = createMatchUp(format);

  // Get to 6-6 by alternating games
  for (let g = 0; g < 12; g++) {
    const winner = (g % 2) as 0 | 1;
    for (let p = 0; p < 4; p++) {
      matchUp = addPoint(matchUp, { winner });
    }
  }

  const currentSet = matchUp.score.sets[0];
  expect(currentSet.side1Score).toEqual(6);
  expect(currentSet.side2Score).toEqual(6);

  // Win tiebreak 7-0 for side 0
  for (let p = 0; p < 7; p++) {
    matchUp = addPoint(matchUp, { winner: 0 as 0 | 1 });
  }

  expect(matchUp.score.sets[0].winningSide).toEqual(1);
  expect(matchUp.score.sets[0].side1Score).toEqual(7);
  expect(matchUp.score.sets[0].side2Score).toEqual(6);
});

// ─── addPoint: Match completion ───────────────────────────────────────────
it('addPoint: match completes when setsToWin reached', () => {
  const format = 'SET3-S:6/TB7';
  let matchUp = createMatchUp(format);

  // Win 2 sets for side 0 (6-0 6-0)
  for (let s = 0; s < 2; s++) {
    for (let g = 0; g < 6; g++) {
      for (let p = 0; p < 4; p++) {
        matchUp = addPoint(matchUp, { winner: 0 as 0 | 1 });
      }
    }
  }

  expect(matchUp.matchUpStatus).toEqual('COMPLETED');
  expect(matchUp.winningSide).toEqual(1);
});

// ─── addPoint: Tiebreak-only sets (pickleball-style) ──────────────────────
it('addPoint: tiebreak-only set completes at tiebreakTo', () => {
  const format = 'SET3-S:TB11'; // Best of 3, tiebreak-only to 11
  let matchUp = createMatchUp(format);

  // Win 11 points for side 0
  for (let p = 0; p < 11; p++) {
    matchUp = addPoint(matchUp, { winner: 0 as 0 | 1 });
  }

  expect(matchUp.score.sets[0].winningSide).toEqual(1);
});

// ─── addPoint: Match tiebreak ─────────────────────────────────────────────
it('addPoint: match tiebreak as final set', () => {
  const format = 'SET3-S:6/TB7-F:TB10'; // Best of 3, final set is match tiebreak to 10
  let matchUp = createMatchUp(format);

  // Side 0 wins set 1: 6-0
  for (let g = 0; g < 6; g++) {
    for (let p = 0; p < 4; p++) {
      matchUp = addPoint(matchUp, { winner: 0 as 0 | 1 });
    }
  }

  // Side 1 wins set 2: 6-0
  for (let g = 0; g < 6; g++) {
    for (let p = 0; p < 4; p++) {
      matchUp = addPoint(matchUp, { winner: 1 as 0 | 1 });
    }
  }

  expect(matchUp.score.sets.length).toEqual(2);

  // Match tiebreak: side 0 wins 10-0
  for (let p = 0; p < 10; p++) {
    matchUp = addPoint(matchUp, { winner: 0 as 0 | 1 });
  }

  expect(matchUp.matchUpStatus).toEqual('COMPLETED');
  expect(matchUp.winningSide).toEqual(1);
});

// ─── deriveServer: basic alternation ──────────────────────────────────────
it('deriveServer: alternates server each game', () => {
  const format = 'SET3-S:6/TB7';
  let matchUp = createMatchUp(format);

  // First game: side 0 serves
  const formatStructure = parse(format)!;

  const server0 = deriveServerBase(matchUp, formatStructure, 'standard');
  expect(server0).toEqual(0);

  // After one game, side 1 serves
  for (let p = 0; p < 4; p++) {
    matchUp = addPoint(matchUp, { winner: 0 as 0 | 1 });
  }
  const server1 = deriveServerBase(matchUp, formatStructure, 'standard');
  expect(server1).toEqual(1);
});

// ─── formatGameScore: tennis score formatting ─────────────────────────────
it('formatGameScore: standard tennis scores', () => {
  expect(formatGameScore(0, 0, false)).toEqual('0-0');
  expect(formatGameScore(1, 0, false)).toEqual('15-0');
  expect(formatGameScore(2, 1, false)).toEqual('30-15');
  expect(formatGameScore(3, 2, false)).toEqual('40-30');
  expect(formatGameScore(3, 3, false)).toEqual('40-40');
  expect(formatGameScore(4, 3, false)).toEqual('A-40');
  expect(formatGameScore(3, 4, false)).toEqual('40-A');
});

it('formatGameScore: tiebreak scores are numeric', () => {
  expect(formatGameScore(5, 3, true)).toEqual('5-3');
  expect(formatGameScore(6, 6, true)).toEqual('6-6');
});

// ─── ScoringEngine: completion consistency ────────────────────────────────
it('ScoringEngine: set/match completion matches addPoint behavior', () => {
  const format = 'SET3-S:6/TB7';
  const engine = new ScoringEngine({
    matchUpFormat: format,
    matchUpId: 'engine-test',
  });

  // Play a complete match 6-0 6-0
  for (let s = 0; s < 2; s++) {
    for (let g = 0; g < 6; g++) {
      for (let p = 0; p < 4; p++) {
        engine.addPoint({ winningSide: 1 });
      }
    }
  }

  const state = engine.getState();
  expect(state.matchUpStatus).toEqual('COMPLETED');
  expect(state.winningSide).toEqual(1);
  expect(state.score.sets.length).toEqual(2);
  expect(state.score.sets[0].winningSide).toEqual(1);
  expect(state.score.sets[1].winningSide).toEqual(1);
});

it('ScoringEngine: addSet + checkSetCompletion consistency', () => {
  const format = 'SET3-S:6/TB7';
  const engine = new ScoringEngine({
    matchUpFormat: format,
    matchUpId: 'engine-addset-test',
  });

  // Add a complete set via addSet
  engine.addSet({ side1Score: 6, side2Score: 4 });
  let state = engine.getState();
  expect(state.score.sets.length).toEqual(1);
  expect(state.score.sets[0].winningSide).toEqual(1);

  // Add second set via addSet
  engine.addSet({ side1Score: 6, side2Score: 3 });
  state = engine.getState();
  expect(state.matchUpStatus).toEqual('COMPLETED');
  expect(state.winningSide).toEqual(1);
});
