/**
 * TEST SUITE: src/mutate/scoring/serveSideCalculator.ts
 * Target: Comprehensive branch coverage for inferServeSide
 *
 * Branches to cover:
 * 1. setType === 'timed' → returns undefined
 * 2. isAggregateFormat path → inferAggregateSide
 *    - completed sets with tiebreak scores
 *    - completed sets without tiebreak scores (game scores)
 *    - current in-progress set with gameScores
 *    - current in-progress set without gameScores (timed fallback)
 *    - even aggregate → 'deuce', odd → 'ad'
 *    - no currentSet (all sets completed)
 * 3. setType === 'tiebreakOnly' → inferTiebreakSide
 *    - no currentSet → 'deuce'
 *    - empty gameScores → 'deuce'
 *    - even total → 'deuce', odd total → 'ad'
 * 4. setType === 'matchTiebreak' → inferTiebreakSide
 * 5. Standard set → inferStandardSide
 *    - no currentSet → 'deuce'
 *    - empty gameScores → 'deuce'
 *    - even total in game → 'deuce', odd → 'ad'
 * 6. getActiveSet: empty sets, last set completed (winningSide defined), last set in progress
 */

import type { MatchUp, FormatStructure, SetScore } from '@Types/scoring/types';
import { inferServeSide } from '@Mutate/scoring/serveSideCalculator';
import { describe, test, expect } from 'vitest';

// ============================================================================
// Helper to build minimal MatchUp objects
// ============================================================================

function makeMatchUp(sets: SetScore[]): MatchUp {
  return {
    matchUpId: 'test-1',
    matchUpFormat: 'SET3-S:6/TB7',
    matchUpStatus: 'IN_PROGRESS',
    matchUpType: 'SINGLES',
    sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
    score: { sets },
  };
}

function makeSet(overrides: Partial<SetScore> & { setNumber: number }): SetScore {
  return { ...overrides };
}

// ============================================================================
// 1. Timed sets → undefined
// ============================================================================
describe('inferServeSide - timed sets', () => {
  test('returns undefined for timed setType', () => {
    const matchUp = makeMatchUp([]);
    const formatStructure: FormatStructure = {};
    const result = inferServeSide(matchUp, formatStructure, 'timed');
    expect(result).toBeUndefined();
  });
});

// ============================================================================
// 2. Aggregate format
// ============================================================================
describe('inferServeSide - aggregate format', () => {
  const aggregateFormat: FormatStructure = { aggregate: true };

  test('returns deuce when aggregate total is 0 (no sets)', () => {
    const matchUp = makeMatchUp([]);
    const result = inferServeSide(matchUp, aggregateFormat, 'standard');
    // No sets → aggregateTotal = 0 → even → deuce
    expect(result).toBe('deuce');
  });

  test('returns deuce when completed set game scores sum to even', () => {
    // Completed set: 6-4 = 10 (even)
    const matchUp = makeMatchUp([makeSet({ setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 })]);
    const result = inferServeSide(matchUp, aggregateFormat, 'standard');
    expect(result).toBe('deuce');
  });

  test('returns ad when completed set game scores sum to odd', () => {
    // Completed set: 6-3 = 9 (odd)
    const matchUp = makeMatchUp([makeSet({ setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 })]);
    const result = inferServeSide(matchUp, aggregateFormat, 'standard');
    expect(result).toBe('ad');
  });

  test('uses tiebreak scores when available on completed sets', () => {
    // Completed set with tiebreak: side1TiebreakScore=7, side2TiebreakScore=5 → 12 (even)
    const matchUp = makeMatchUp([
      makeSet({
        setNumber: 1,
        side1Score: 7,
        side2Score: 6,
        side1TiebreakScore: 7,
        side2TiebreakScore: 5,
        winningSide: 1,
      }),
    ]);
    const result = inferServeSide(matchUp, aggregateFormat, 'standard');
    // Uses tiebreak scores: 7+5=12 → even → deuce
    expect(result).toBe('deuce');
  });

  test('uses tiebreak scores summing to odd → ad', () => {
    // Tiebreak: 7+4=11 (odd)
    const matchUp = makeMatchUp([
      makeSet({
        setNumber: 1,
        side1Score: 7,
        side2Score: 6,
        side1TiebreakScore: 7,
        side2TiebreakScore: 4,
        winningSide: 1,
      }),
    ]);
    const result = inferServeSide(matchUp, aggregateFormat, 'standard');
    expect(result).toBe('ad');
  });

  test('adds current in-progress set gameScores to aggregate total', () => {
    // Completed set: 6-4=10, In-progress set with game scores at index 0: [2] and [1] → 3
    // Total: 10+3=13 (odd) → ad
    const matchUp = makeMatchUp([
      makeSet({ setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 }),
      makeSet({ setNumber: 2, side1GameScores: [2], side2GameScores: [1] }),
    ]);
    const result = inferServeSide(matchUp, aggregateFormat, 'standard');
    expect(result).toBe('ad');
  });

  test('uses set scores when current set has no gameScores (timed fallback)', () => {
    // Completed set: 6-4=10, In-progress set with side1Score=3, side2Score=2, no gameScores
    // Total: 10+3+2=15 (odd) → ad
    const matchUp = makeMatchUp([
      makeSet({ setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 }),
      makeSet({ setNumber: 2, side1Score: 3, side2Score: 2 }),
    ]);
    const result = inferServeSide(matchUp, aggregateFormat, 'standard');
    expect(result).toBe('ad');
  });

  test('uses set scores for even total when no gameScores → deuce', () => {
    // In-progress set: side1Score=2, side2Score=2, no gameScores → 4 (even) → deuce
    const matchUp = makeMatchUp([makeSet({ setNumber: 1, side1Score: 2, side2Score: 2 })]);
    const result = inferServeSide(matchUp, aggregateFormat, 'standard');
    expect(result).toBe('deuce');
  });

  test('handles multiple completed sets', () => {
    // Set1: 6+4=10, Set2: 3+6=9 → total=19 (odd) → ad
    const matchUp = makeMatchUp([
      makeSet({ setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 }),
      makeSet({ setNumber: 2, side1Score: 3, side2Score: 6, winningSide: 2 }),
    ]);
    const result = inferServeSide(matchUp, aggregateFormat, 'standard');
    expect(result).toBe('ad');
  });

  test('handles completed sets with undefined scores (defaults to 0)', () => {
    // Completed set with no scores set → 0+0=0 (even)
    const matchUp = makeMatchUp([makeSet({ setNumber: 1, winningSide: 1 })]);
    const result = inferServeSide(matchUp, aggregateFormat, 'standard');
    expect(result).toBe('deuce');
  });

  test('handles in-progress set where side2GameScores is longer than side1GameScores', () => {
    // side1GameScores=[1], side2GameScores=[2, 0] → gameIdx = max(1,2)-1 = 1
    // gs1[1]=undefined→0, gs2[1]=0 → total=0 from current game
    // But also need completed sets for total
    const matchUp = makeMatchUp([makeSet({ setNumber: 1, side1GameScores: [1], side2GameScores: [2, 0] })]);
    const result = inferServeSide(matchUp, aggregateFormat, 'standard');
    expect(result).toBe('deuce');
  });

  test('handles in-progress set with empty gameScores arrays', () => {
    // empty arrays: gs1=[], gs2=[] → length 0 → falls to set score fallback
    const matchUp = makeMatchUp([
      makeSet({ setNumber: 1, side1GameScores: [], side2GameScores: [], side1Score: 1, side2Score: 0 }),
    ]);
    const result = inferServeSide(matchUp, aggregateFormat, 'standard');
    expect(result).toBe('ad');
  });

  test('in-progress set with gameScores where one side has more entries', () => {
    // side1GameScores=[3, 1], side2GameScores=[2] → gameIdx=max(2,1)-1=1
    // gs1[1]=1, gs2[1]=undefined→0 → 1 (odd) from current, no completed sets → 'ad'
    const matchUp = makeMatchUp([makeSet({ setNumber: 1, side1GameScores: [3, 1], side2GameScores: [2] })]);
    const result = inferServeSide(matchUp, aggregateFormat, 'standard');
    expect(result).toBe('ad');
  });
});

// ============================================================================
// 3. Tiebreak-only sets
// ============================================================================
describe('inferServeSide - tiebreakOnly', () => {
  const format: FormatStructure = {};

  test('returns deuce when no currentSet (no sets at all)', () => {
    const matchUp = makeMatchUp([]);
    const result = inferServeSide(matchUp, format, 'tiebreakOnly');
    expect(result).toBe('deuce');
  });

  test('returns deuce when currentSet exists but no gameScores', () => {
    const matchUp = makeMatchUp([makeSet({ setNumber: 1 })]);
    const result = inferServeSide(matchUp, format, 'tiebreakOnly');
    expect(result).toBe('deuce');
  });

  test('returns deuce when total tiebreak points is even', () => {
    // gs1[0]=3, gs2[0]=5 → 8 (even)
    const matchUp = makeMatchUp([makeSet({ setNumber: 1, side1GameScores: [3], side2GameScores: [5] })]);
    const result = inferServeSide(matchUp, format, 'tiebreakOnly');
    expect(result).toBe('deuce');
  });

  test('returns ad when total tiebreak points is odd', () => {
    // gs1[0]=3, gs2[0]=4 → 7 (odd)
    const matchUp = makeMatchUp([makeSet({ setNumber: 1, side1GameScores: [3], side2GameScores: [4] })]);
    const result = inferServeSide(matchUp, format, 'tiebreakOnly');
    expect(result).toBe('ad');
  });

  test('returns deuce when gameScores are both 0', () => {
    const matchUp = makeMatchUp([makeSet({ setNumber: 1, side1GameScores: [0], side2GameScores: [0] })]);
    const result = inferServeSide(matchUp, format, 'tiebreakOnly');
    expect(result).toBe('deuce');
  });

  test('returns deuce when last set is completed (no currentSet)', () => {
    const matchUp = makeMatchUp([makeSet({ setNumber: 1, winningSide: 1 })]);
    const result = inferServeSide(matchUp, format, 'tiebreakOnly');
    // getActiveSet returns undefined (last set has winningSide) → 'deuce'
    expect(result).toBe('deuce');
  });

  test('handles missing side2GameScores (defaults to empty)', () => {
    // side1GameScores=[5], side2GameScores undefined → gs2=[], gs2[0]=undefined→0
    // total=5+0=5 (odd) → ad
    const matchUp = makeMatchUp([makeSet({ setNumber: 1, side1GameScores: [5] })]);
    const result = inferServeSide(matchUp, format, 'tiebreakOnly');
    expect(result).toBe('ad');
  });
});

// ============================================================================
// 4. Match tiebreak
// ============================================================================
describe('inferServeSide - matchTiebreak', () => {
  const format: FormatStructure = {};

  test('returns deuce at start of match tiebreak', () => {
    const matchUp = makeMatchUp([]);
    const result = inferServeSide(matchUp, format, 'matchTiebreak');
    expect(result).toBe('deuce');
  });

  test('returns ad when total points is odd', () => {
    const matchUp = makeMatchUp([makeSet({ setNumber: 1, side1GameScores: [4], side2GameScores: [2] })]);
    const result = inferServeSide(matchUp, format, 'matchTiebreak');
    // 4+2=6 (even) → deuce
    expect(result).toBe('deuce');
  });

  test('returns ad for odd total in match tiebreak', () => {
    const matchUp = makeMatchUp([makeSet({ setNumber: 1, side1GameScores: [4], side2GameScores: [3] })]);
    const result = inferServeSide(matchUp, format, 'matchTiebreak');
    // 4+3=7 (odd) → ad
    expect(result).toBe('ad');
  });
});

// ============================================================================
// 5. Standard set (regular game or tiebreak within standard set)
// ============================================================================
describe('inferServeSide - standard set', () => {
  const format: FormatStructure = {};

  test('returns deuce at start of match (no sets)', () => {
    const matchUp = makeMatchUp([]);
    const result = inferServeSide(matchUp, format, 'standard');
    expect(result).toBe('deuce');
  });

  test('returns deuce at start of new set (last set completed)', () => {
    const matchUp = makeMatchUp([makeSet({ setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 })]);
    const result = inferServeSide(matchUp, format, 'standard');
    // getActiveSet → undefined (last set has winningSide) → 'deuce'
    expect(result).toBe('deuce');
  });

  test('returns deuce when in-progress set has no gameScores', () => {
    const matchUp = makeMatchUp([makeSet({ setNumber: 1 })]);
    const result = inferServeSide(matchUp, format, 'standard');
    expect(result).toBe('deuce');
  });

  test('returns deuce when total points in current game is even', () => {
    // Game at index 0: 2+2=4 (even)
    const matchUp = makeMatchUp([makeSet({ setNumber: 1, side1GameScores: [2], side2GameScores: [2] })]);
    const result = inferServeSide(matchUp, format, 'standard');
    expect(result).toBe('deuce');
  });

  test('returns ad when total points in current game is odd', () => {
    // Game at index 0: 2+1=3 (odd)
    const matchUp = makeMatchUp([makeSet({ setNumber: 1, side1GameScores: [2], side2GameScores: [1] })]);
    const result = inferServeSide(matchUp, format, 'standard');
    expect(result).toBe('ad');
  });

  test('uses the latest game index (max of both sides lengths)', () => {
    // side1 has 3 games, side2 has 2 → gameIdx = max(3,2)-1 = 2
    // gs1[2]=1, gs2[2]=undefined→0 → 1 (odd) → ad
    const matchUp = makeMatchUp([makeSet({ setNumber: 1, side1GameScores: [4, 4, 1], side2GameScores: [4, 4] })]);
    const result = inferServeSide(matchUp, format, 'standard');
    expect(result).toBe('ad');
  });

  test('handles empty gameScores arrays explicitly', () => {
    const matchUp = makeMatchUp([makeSet({ setNumber: 1, side1GameScores: [], side2GameScores: [] })]);
    const result = inferServeSide(matchUp, format, 'standard');
    expect(result).toBe('deuce');
  });

  test('returns deuce when current game points sum to 0', () => {
    const matchUp = makeMatchUp([makeSet({ setNumber: 1, side1GameScores: [0], side2GameScores: [0] })]);
    const result = inferServeSide(matchUp, format, 'standard');
    expect(result).toBe('deuce');
  });
});

// ============================================================================
// 6. getActiveSet edge cases
// ============================================================================
describe('inferServeSide - getActiveSet edge cases', () => {
  const format: FormatStructure = {};

  test('empty sets array → no active set → deuce for standard', () => {
    const matchUp = makeMatchUp([]);
    expect(inferServeSide(matchUp, format, 'standard')).toBe('deuce');
  });

  test('last set has winningSide → no active set → deuce', () => {
    const matchUp = makeMatchUp([makeSet({ setNumber: 1, winningSide: 2 })]);
    expect(inferServeSide(matchUp, format, 'standard')).toBe('deuce');
  });

  test('last set has no winningSide → active set used', () => {
    const matchUp = makeMatchUp([
      makeSet({ setNumber: 1, winningSide: 1 }),
      makeSet({ setNumber: 2, side1GameScores: [1], side2GameScores: [0] }),
    ]);
    // gameIdx=0, total=1 (odd) → ad
    expect(inferServeSide(matchUp, format, 'standard')).toBe('ad');
  });

  test('multiple completed sets then in-progress set', () => {
    const matchUp = makeMatchUp([
      makeSet({ setNumber: 1, winningSide: 1 }),
      makeSet({ setNumber: 2, winningSide: 2 }),
      makeSet({ setNumber: 3, side1GameScores: [2], side2GameScores: [2] }),
    ]);
    // Active set is set 3. Game total = 4 (even) → deuce
    expect(inferServeSide(matchUp, format, 'standard')).toBe('deuce');
  });
});

// ============================================================================
// 7. Integration-style: aggregate with mixed completed + in-progress
// ============================================================================
describe('inferServeSide - aggregate complex scenarios', () => {
  const aggregateFormat: FormatStructure = { aggregate: true };

  test('multiple completed sets (one with tiebreak, one without) + in-progress', () => {
    // Set1 (tiebreak): 7+5=12
    // Set2 (game scores): 6+3=9
    // Set3 (in-progress, gameScores): gs1[0]=1, gs2[0]=2 → 3
    // Total: 12+9+3=24 (even) → deuce
    const matchUp = makeMatchUp([
      makeSet({
        setNumber: 1,
        side1Score: 7,
        side2Score: 6,
        side1TiebreakScore: 7,
        side2TiebreakScore: 5,
        winningSide: 1,
      }),
      makeSet({ setNumber: 2, side1Score: 6, side2Score: 3, winningSide: 1 }),
      makeSet({ setNumber: 3, side1GameScores: [1], side2GameScores: [2] }),
    ]);
    const result = inferServeSide(matchUp, aggregateFormat, 'standard');
    expect(result).toBe('deuce');
  });

  test('all sets completed (no in-progress) → no currentSet contribution', () => {
    // Set1: 6+4=10, Set2: 7+5=12 → total=22 (even) → deuce
    const matchUp = makeMatchUp([
      makeSet({ setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 }),
      makeSet({ setNumber: 2, side1Score: 7, side2Score: 5, winningSide: 1 }),
    ]);
    const result = inferServeSide(matchUp, aggregateFormat, 'standard');
    expect(result).toBe('deuce');
  });

  test('completed set with side1TiebreakScore=0 still uses tiebreak path', () => {
    // side1TiebreakScore is 0 (not undefined) → tiebreak path taken
    // 0+7=7 (odd) → ad
    const matchUp = makeMatchUp([
      makeSet({
        setNumber: 1,
        side1Score: 6,
        side2Score: 7,
        side1TiebreakScore: 0,
        side2TiebreakScore: 7,
        winningSide: 2,
      }),
    ]);
    const result = inferServeSide(matchUp, aggregateFormat, 'standard');
    expect(result).toBe('ad');
  });

  test('in-progress set with only side1GameScores (side2 undefined)', () => {
    // side1GameScores=[3], side2GameScores undefined → gs2=[]
    // gameIdx = max(1,0)-1 = 0, gs1[0]=3, gs2[0]=undefined→0 → 3 (odd) → ad
    const matchUp = makeMatchUp([makeSet({ setNumber: 1, side1GameScores: [3] })]);
    const result = inferServeSide(matchUp, aggregateFormat, 'standard');
    expect(result).toBe('ad');
  });

  test('in-progress set with undefined side1Score and side2Score (no gameScores)', () => {
    // No gameScores → falls to set score: undefined→0 + undefined→0 = 0 (even) → deuce
    const matchUp = makeMatchUp([makeSet({ setNumber: 1 })]);
    const result = inferServeSide(matchUp, aggregateFormat, 'standard');
    expect(result).toBe('deuce');
  });
});
