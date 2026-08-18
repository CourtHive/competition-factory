import { describe, expect, it } from 'vitest';
import { getScoreboard } from '@Query/scoring/getScoreboard';
import { MatchUp, SetScore } from '@Types/scoring/types';

function tennisScore(p1: number, p2: number): string {
  // Build enough game scores to place our target at the last index
  const p1Scores = [p1];
  const p2Scores = [p2];
  const m = makeMatchUp({
    sets: [inProgressSet(0, 0, { p1: p1Scores, p2: p2Scores })],
    matchUpStatus: 'IN_PROGRESS',
    matchUpFormat: 'SET3-S:6/TB7',
  });
  const result = getScoreboard(m);
  // Extract the parenthesized score
  const match = /\((.+)\)/.exec(result);
  return match?.[1] ?? result;
}

/** Helper to build a minimal MatchUp for testing */
function makeMatchUp(
  overrides: {
    sets?: SetScore[];
    matchUpStatus?: string;
    matchUpFormat?: string;
  } = {},
): MatchUp {
  return {
    matchUpId: 'test-1',
    matchUpFormat: overrides.matchUpFormat ?? 'SET3-S:6/TB7',
    matchUpStatus: (overrides.matchUpStatus ?? 'IN_PROGRESS') as any,
    matchUpType: 'SINGLES',
    sides: [],
    score: { sets: overrides.sets ?? [] },
  } as MatchUp;
}

/** Helper to build a completed set */
function completedSet(s1: number, s2: number, opts?: { tb1?: number; tb2?: number }): SetScore {
  const set: SetScore = {
    setNumber: 1,
    side1Score: s1,
    side2Score: s2,
    winningSide: s1 > s2 ? 1 : 2,
  };
  if (opts?.tb1 !== undefined || opts?.tb2 !== undefined) {
    set.side1TiebreakScore = opts?.tb1 ?? 0;
    set.side2TiebreakScore = opts?.tb2 ?? 0;
  }
  return set;
}

/** Helper to build an in-progress set with game scores */
function inProgressSet(s1: number, s2: number, gameScores?: { p1: number[]; p2: number[] }): SetScore {
  return {
    setNumber: 1,
    side1Score: s1,
    side2Score: s2,
    side1GameScores: gameScores?.p1,
    side2GameScores: gameScores?.p2,
  };
}

// ============================================================================
// Empty / basic scores
// ============================================================================
describe('getScoreboard', () => {
  it('returns 0-0 when no sets', () => {
    expect(getScoreboard(makeMatchUp({ sets: [] }))).toBe('0-0');
  });

  it('returns basic set score for a completed set', () => {
    const m = makeMatchUp({
      sets: [completedSet(6, 4)],
      matchUpStatus: 'COMPLETED',
    });
    expect(getScoreboard(m)).toBe('6-4');
  });

  it('returns multiple set scores joined by comma', () => {
    const m = makeMatchUp({
      sets: [completedSet(6, 4), completedSet(3, 6), completedSet(7, 5)],
      matchUpStatus: 'COMPLETED',
    });
    expect(getScoreboard(m)).toBe('6-4, 3-6, 7-5');
  });

  // ============================================================================
  // Tiebreak display
  // ============================================================================
  describe('tiebreak display', () => {
    it('shows tiebreak score in parentheses for loser (side1 wins)', () => {
      const m = makeMatchUp({
        sets: [completedSet(7, 6, { tb1: 7, tb2: 5 })],
        matchUpStatus: 'COMPLETED',
      });
      expect(getScoreboard(m)).toBe('7-6(5)');
    });

    it('shows tiebreak score in parentheses for loser (side2 wins)', () => {
      const m = makeMatchUp({
        sets: [completedSet(6, 7, { tb1: 3, tb2: 7 })],
        matchUpStatus: 'COMPLETED',
      });
      expect(getScoreboard(m)).toBe('6(3)-7');
    });

    it('handles side1TiebreakScore defined but side2TiebreakScore undefined', () => {
      const set: SetScore = {
        setNumber: 1,
        side1Score: 7,
        side2Score: 6,
        side1TiebreakScore: 7,
        winningSide: 1,
      };
      const m = makeMatchUp({ sets: [set], matchUpStatus: 'COMPLETED' });
      // side2TiebreakScore defaults to 0
      expect(getScoreboard(m)).toBe('7-6(0)');
    });

    it('handles side2TiebreakScore defined but side1TiebreakScore undefined', () => {
      const set: SetScore = {
        setNumber: 1,
        side1Score: 6,
        side2Score: 7,
        side2TiebreakScore: 7,
        winningSide: 2,
      };
      const m = makeMatchUp({ sets: [set], matchUpStatus: 'COMPLETED' });
      expect(getScoreboard(m)).toBe('6(0)-7');
    });
  });

  // ============================================================================
  // Perspective (swap sides)
  // ============================================================================
  describe('perspective', () => {
    it('swaps set scores when perspective is 1', () => {
      const m = makeMatchUp({
        sets: [completedSet(6, 4)],
        matchUpStatus: 'COMPLETED',
      });
      expect(getScoreboard(m, { perspective: 1 })).toBe('4-6');
    });

    it('swaps tiebreak scores when perspective is 1', () => {
      const m = makeMatchUp({
        sets: [completedSet(7, 6, { tb1: 7, tb2: 5 })],
        matchUpStatus: 'COMPLETED',
      });
      // Perspective 1: s1=6, s2=7; tb1=5, tb2=7; s2 > s1 → show tb1(loser) → '6(5)-7'
      expect(getScoreboard(m, { perspective: 1 })).toBe('6(5)-7');
    });

    it('swaps game scores when perspective is 1', () => {
      const m = makeMatchUp({
        sets: [inProgressSet(3, 2, { p1: [0, 0, 0, 2], p2: [0, 0, 0, 1] })],
        matchUpStatus: 'IN_PROGRESS',
      });
      // Without perspective: "3-2 (30-15)"
      const withoutPerspective = getScoreboard(m);
      expect(withoutPerspective).toContain('3-2');

      // With perspective 1: set scores swap to "2-3", game scores swap
      const withPerspective = getScoreboard(m, { perspective: 1 });
      expect(withPerspective).toContain('2-3');
      expect(withPerspective).toContain('15-30');
    });
  });

  // ============================================================================
  // In-progress game scores
  // ============================================================================
  describe('in-progress game scores', () => {
    it('shows tennis score during game', () => {
      const m = makeMatchUp({
        sets: [inProgressSet(2, 1, { p1: [0, 0, 2], p2: [0, 0, 1] })],
        matchUpStatus: 'IN_PROGRESS',
      });
      expect(getScoreboard(m)).toBe('2-1 (30-15)');
    });

    it('returns just set string when game score is 0-0', () => {
      const m = makeMatchUp({
        sets: [inProgressSet(3, 2, { p1: [0, 0, 0, 0, 0, 0], p2: [0, 0, 0, 0, 0, 0] })],
        matchUpStatus: 'IN_PROGRESS',
      });
      expect(getScoreboard(m)).toBe('3-2');
    });

    it('returns set string when no game scores at all', () => {
      const m = makeMatchUp({
        sets: [inProgressSet(3, 2)],
        matchUpStatus: 'IN_PROGRESS',
      });
      // No gameScores → gameIndex = -1, condition fails
      expect(getScoreboard(m)).toBe('3-2');
    });

    it('returns set string when gameScores is empty array', () => {
      const m = makeMatchUp({
        sets: [inProgressSet(3, 2, { p1: [], p2: [] })],
        matchUpStatus: 'IN_PROGRESS',
      });
      // gameIndex = -1, condition fails
      expect(getScoreboard(m)).toBe('3-2');
    });

    it('does not show game score when match is COMPLETED', () => {
      const set: SetScore = {
        setNumber: 1,
        side1Score: 6,
        side2Score: 4,
        winningSide: 1,
        side1GameScores: [4, 4, 4, 4, 4, 4],
        side2GameScores: [2, 2, 4, 4, 2, 2],
      };
      const m = makeMatchUp({ sets: [set], matchUpStatus: 'COMPLETED' });
      expect(getScoreboard(m)).toBe('6-4');
    });

    it('does not show game score when current set has a winningSide', () => {
      const set = completedSet(6, 4);
      set.side1GameScores = [4, 4, 4, 4, 4, 4];
      set.side2GameScores = [2, 2, 4, 4, 2, 2];
      const m = makeMatchUp({ sets: [set], matchUpStatus: 'IN_PROGRESS' });
      // winningSide is set, so condition fails
      expect(getScoreboard(m)).toBe('6-4');
    });

    it('shows with prefix from prior sets', () => {
      const m = makeMatchUp({
        sets: [completedSet(6, 4), inProgressSet(2, 3, { p1: [0, 0, 0, 0, 1], p2: [0, 0, 0, 0, 2] })],
        matchUpStatus: 'IN_PROGRESS',
      });
      expect(getScoreboard(m)).toBe('6-4, 2-3 (15-30)');
    });

    it('handles missing side2GameScores', () => {
      const set: SetScore = {
        setNumber: 1,
        side1Score: 2,
        side2Score: 1,
        side1GameScores: [0, 0, 3],
      };
      const m = makeMatchUp({ sets: [set], matchUpStatus: 'IN_PROGRESS' });
      // side2GameScores is undefined → defaults to [], p2 = 0
      expect(getScoreboard(m)).toContain('2-1');
      expect(getScoreboard(m)).toContain('40-0');
    });
  });

  // ============================================================================
  // Tiebreak / consecutive game score display
  // ============================================================================
  describe('tiebreak and consecutive in-progress display', () => {
    it('shows numeric score during tiebreak', () => {
      const m = makeMatchUp({
        sets: [
          inProgressSet(6, 6, {
            p1: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5],
            p2: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3],
          }),
        ],
        matchUpStatus: 'IN_PROGRESS',
        matchUpFormat: 'SET3-S:6/TB7',
      });
      // At 6-6 with tiebreakAt=6, isTiebreak=true → numeric
      expect(getScoreboard(m)).toBe('6-6 (5-3)');
    });

    it('shows numeric score for CONSECUTIVE game format', () => {
      const m = makeMatchUp({
        sets: [inProgressSet(2, 1, { p1: [0, 0, 2], p2: [0, 0, 1] })],
        matchUpStatus: 'IN_PROGRESS',
        matchUpFormat: 'SET5-S:5-G:3C',
      });
      // isConsecutive=true → numeric
      expect(getScoreboard(m)).toBe('2-1 (2-1)');
    });

    it('shows tennis score for standard game (not tiebreak)', () => {
      const m = makeMatchUp({
        sets: [inProgressSet(3, 2, { p1: [0, 0, 0, 0, 2], p2: [0, 0, 0, 0, 1] })],
        matchUpStatus: 'IN_PROGRESS',
        matchUpFormat: 'SET3-S:6/TB7',
      });
      // At 3-2, not tiebreak → tennis score
      expect(getScoreboard(m)).toBe('3-2 (30-15)');
    });

    it('handles missing matchUpFormat (defaults setTo=6)', () => {
      const m = makeMatchUp({
        sets: [inProgressSet(3, 2, { p1: [0, 0, 0, 0, 1], p2: [0, 0, 0, 0, 0] })],
        matchUpStatus: 'IN_PROGRESS',
      });
      // Delete matchUpFormat to test the undefined path
      (m as any).matchUpFormat = undefined;
      expect(getScoreboard(m)).toContain('3-2');
      expect(getScoreboard(m)).toContain('15-0');
    });

    it('handles tiebreakAt as non-number (string modifier)', () => {
      // When tiebreakAt is not a number, falls back to setTo
      const m = makeMatchUp({
        sets: [
          inProgressSet(6, 6, {
            p1: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4],
            p2: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3],
          }),
        ],
        matchUpStatus: 'IN_PROGRESS',
        matchUpFormat: 'SET3-S:6/TB7',
      });
      // tiebreakAt is 6 (number) → isTiebreak when both at 6
      expect(getScoreboard(m)).toBe('6-6 (4-3)');
    });
  });

  // ============================================================================
  // formatTennisScore (tested via getScoreboard)
  // ============================================================================
  describe('formatTennisScore', () => {
    /** Helper to get the tennis score portion from scoreboard */

    it('formats 0-0 as 0-0', () => {
      // 0-0 returns early without parentheses
      const m = makeMatchUp({
        sets: [inProgressSet(0, 0, { p1: [0], p2: [0] })],
        matchUpStatus: 'IN_PROGRESS',
      });
      expect(getScoreboard(m)).toBe('0-0');
    });

    it('formats standard scores', () => {
      expect(tennisScore(1, 0)).toBe('15-0');
      expect(tennisScore(0, 1)).toBe('0-15');
      expect(tennisScore(2, 1)).toBe('30-15');
      expect(tennisScore(3, 2)).toBe('40-30');
      expect(tennisScore(2, 3)).toBe('30-40');
    });

    it('formats 40-40 (deuce)', () => {
      expect(tennisScore(3, 3)).toBe('40-40');
    });

    it('formats advantage (deuce at 4-4+)', () => {
      expect(tennisScore(4, 4)).toBe('40-40');
      expect(tennisScore(5, 4)).toBe('A-40');
      expect(tennisScore(4, 5)).toBe('40-A');
    });

    it('formats game won from deuce', () => {
      expect(tennisScore(6, 4)).toBe('G-40');
      expect(tennisScore(4, 6)).toBe('40-G');
    });

    it('formats game won with clear lead (p1 >= 4, p2 < 3)', () => {
      expect(tennisScore(4, 1)).toBe('G-40');
      expect(tennisScore(4, 2)).toBe('G-40');
    });

    it('formats game won with clear lead (p2 >= 4, p1 < 3)', () => {
      expect(tennisScore(1, 4)).toBe('40-G');
      expect(tennisScore(2, 4)).toBe('40-G');
    });

    it('formats p1 at 40+ vs p2 < 3 without game win', () => {
      // p1 = 4, p2 = 2 → diff = 2 → 'G-40' (covered above)
      // p1 = 4, p2 = 0 → diff = 4 → 'G-40'
      expect(tennisScore(4, 0)).toBe('G-40');
    });

    it('formats p2 at 40+ vs p1 < 3 without game win', () => {
      expect(tennisScore(0, 4)).toBe('40-G');
    });
  });
});
