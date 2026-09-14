/**
 * Tests for CONSECUTIVE game format (-G:3C) scoring
 *
 * A game is won by scoring `count` points IN A ROW.
 * When the opponent scores, the winning streak resets.
 */

import { createMatchUp, addPoint, getScore, getScoreboard } from '@Assemblies/governors/scoreGovernor';
import { describe, test, expect } from 'vitest';

// Helper: add N points for a side
function addPoints(matchUp: ReturnType<typeof createMatchUp>, winner: 0 | 1, count: number) {
  for (let i = 0; i < count; i++) {
    matchUp = addPoint(matchUp, { winner });
  }
  return matchUp;
}

describe('Consecutive game format (-G:3C)', () => {
  describe('TYPTI format (SET5-S:5-G:3C)', () => {
    const format = 'SET5-S:5-G:3C';

    test('3 consecutive points wins a game', () => {
      let matchUp = createMatchUp({ matchUpFormat: format });

      // Side 0 scores 3 in a row → wins game
      matchUp = addPoints(matchUp, 0, 3);

      const score = getScore(matchUp);
      expect(score.games).toEqual([1, 0]);
      expect(score.points).toEqual([0, 0]); // New game started
    });

    test('first point starts streak at 1', () => {
      let matchUp = createMatchUp({ matchUpFormat: format });

      matchUp = addPoint(matchUp, { winner: 0 });
      const score = getScore(matchUp);
      expect(score.points).toEqual([1, 0]);
      expect(score.games).toEqual([0, 0]); // Not enough for game
    });

    test('streak resets when opponent scores', () => {
      let matchUp = createMatchUp({ matchUpFormat: format });

      // Side 0 scores 2, then side 1 scores → resets streak
      matchUp = addPoints(matchUp, 0, 2);
      matchUp = addPoint(matchUp, { winner: 1 });

      const score = getScore(matchUp);
      expect(score.games).toEqual([0, 0]); // No game won
      expect(score.points).toEqual([2, 1]); // Cumulative scores still tracked
    });

    test('alternating winners never complete a game', () => {
      let matchUp = createMatchUp({ matchUpFormat: format });

      // Alternate winners 10 times — streak never reaches 3
      for (let i = 0; i < 10; i++) {
        matchUp = addPoint(matchUp, { winner: (i % 2) as 0 | 1 });
      }

      const score = getScore(matchUp);
      expect(score.games).toEqual([0, 0]);
    });

    test('streak survives consecutive same-side points', () => {
      let matchUp = createMatchUp({ matchUpFormat: format });

      // Side 1 scores 1, side 0 scores 3 in a row → game for 0
      matchUp = addPoint(matchUp, { winner: 1 });
      matchUp = addPoints(matchUp, 0, 3);

      const score = getScore(matchUp);
      expect(score.games).toEqual([1, 0]);
    });

    test('complete set: side 0 wins 5 games', () => {
      let matchUp = createMatchUp({ matchUpFormat: format });

      // Win 5 games with 3 consecutive each
      for (let g = 0; g < 5; g++) {
        matchUp = addPoints(matchUp, 0, 3);
      }

      expect(matchUp.score.sets[0].winningSide).toBe(1); // winningSide is 1-indexed
      expect(matchUp.score.sets[0].side1Score).toBe(5);
      expect(matchUp.score.sets[0].side2Score).toBe(0);
    });

    test('complete match: side 0 wins 3 sets (best of 5)', () => {
      let matchUp = createMatchUp({ matchUpFormat: format });

      // Win 3 sets (15 games × 3 points = 45 points)
      for (let s = 0; s < 3; s++) {
        for (let g = 0; g < 5; g++) {
          matchUp = addPoints(matchUp, 0, 3);
        }
      }

      expect(matchUp.matchUpStatus).toBe('COMPLETED');
      expect(matchUp.winningSide).toBe(1); // 1-indexed
    });

    test('game score display is numeric', () => {
      let matchUp = createMatchUp({ matchUpFormat: format });

      matchUp = addPoints(matchUp, 0, 2);

      // Check point.score on the last point
      const lastPoint = matchUp.history!.points.at(-1)!;
      expect((lastPoint as any).score).toBe('2-0');
    });

    test('scoreboard shows numeric game score', () => {
      let matchUp = createMatchUp({ matchUpFormat: format });

      matchUp = addPoints(matchUp, 0, 2);

      const scoreboard = getScoreboard(matchUp);
      expect(scoreboard).toContain('2-0');
    });
  });

  describe('Touch Rugby format (SET3-S:4-G:2C)', () => {
    const format = 'SET3-S:4-G:2C';

    test('2 consecutive points wins a game', () => {
      let matchUp = createMatchUp({ matchUpFormat: format });

      matchUp = addPoints(matchUp, 1, 2);

      const score = getScore(matchUp);
      expect(score.games).toEqual([0, 1]);
    });

    test('streak resets with 1 consecutive point', () => {
      let matchUp = createMatchUp({ matchUpFormat: format });

      matchUp = addPoint(matchUp, { winner: 0 });
      matchUp = addPoint(matchUp, { winner: 1 }); // resets side 0 streak

      const score = getScore(matchUp);
      expect(score.games).toEqual([0, 0]);
    });

    test('complete set at 4 games', () => {
      let matchUp = createMatchUp({ matchUpFormat: format });

      // Side 0 wins 4 games (2 consecutive each)
      for (let g = 0; g < 4; g++) {
        matchUp = addPoints(matchUp, 0, 2);
      }

      expect(matchUp.score.sets[0].winningSide).toBe(1);
      expect(matchUp.score.sets[0].side1Score).toBe(4);
    });
  });

  describe('Mixed format with tiebreak (SET3-S:4/TB5-G:3C)', () => {
    const format = 'SET3-S:4/TB5-G:3C';

    test('regular games use consecutive scoring', () => {
      let matchUp = createMatchUp({ matchUpFormat: format });

      // 3 consecutive → wins a game
      matchUp = addPoints(matchUp, 0, 3);

      const score = getScore(matchUp);
      expect(score.games).toEqual([1, 0]);
    });

    test('tiebreak uses standard tiebreak scoring (not consecutive)', () => {
      let matchUp = createMatchUp({ matchUpFormat: format });

      // Alternate games to reach 4-4 (tiebreak threshold)
      for (let g = 0; g < 4; g++) {
        matchUp = addPoints(matchUp, 0, 3); // side 0 wins a game
        matchUp = addPoints(matchUp, 1, 3); // side 1 wins a game
      }

      const score = getScore(matchUp);
      expect(score.games).toEqual([4, 4]); // At tiebreak

      // In tiebreak, standard tiebreak rules: play to 5, win by 2
      // Score 4 points for side 0 — not enough (need 5)
      matchUp = addPoints(matchUp, 0, 4);
      const midScore = getScore(matchUp);
      expect(midScore.games).toEqual([4, 4]); // Still in tiebreak

      // Score the 5th point → wins tiebreak 5-0
      matchUp = addPoint(matchUp, { winner: 0 });

      expect(matchUp.score.sets[0].winningSide).toBe(1); // Side 0 wins set
      expect(matchUp.score.sets[0].side1Score).toBe(5);
    });
  });

  describe('Padel TYPTI format (SET5-S:5-G:4C)', () => {
    const format = 'SET5-S:5-G:4C';

    test('4 consecutive points wins a game', () => {
      let matchUp = createMatchUp({ matchUpFormat: format });

      matchUp = addPoints(matchUp, 0, 4);

      const score = getScore(matchUp);
      expect(score.games).toEqual([1, 0]);
    });

    test('3 consecutive points does not win a game', () => {
      let matchUp = createMatchUp({ matchUpFormat: format });

      matchUp = addPoints(matchUp, 0, 3);

      const score = getScore(matchUp);
      expect(score.games).toEqual([0, 0]);
    });
  });

  describe('streak state management', () => {
    test('streak resets after game completion', () => {
      let matchUp = createMatchUp({ matchUpFormat: 'SET5-S:5-G:3C' });

      // Win first game with 3 consecutive
      matchUp = addPoints(matchUp, 0, 3);
      expect(getScore(matchUp).games).toEqual([1, 0]);

      // Streak should be reset — need 3 new consecutive for next game
      matchUp = addPoints(matchUp, 0, 2);
      expect(getScore(matchUp).games).toEqual([1, 0]); // Only 2, not enough

      matchUp = addPoint(matchUp, { winner: 0 });
      expect(getScore(matchUp).games).toEqual([2, 0]); // 3 consecutive → second game
    });

    test('streak resets across game boundary (opponent can win next game)', () => {
      let matchUp = createMatchUp({ matchUpFormat: 'SET5-S:5-G:3C' });

      // Side 0 wins a game
      matchUp = addPoints(matchUp, 0, 3);

      // Side 1 wins next game
      matchUp = addPoints(matchUp, 1, 3);

      const score = getScore(matchUp);
      expect(score.games).toEqual([1, 1]);
    });

    test('game scores track cumulative points (for stats/display)', () => {
      let matchUp = createMatchUp({ matchUpFormat: 'SET5-S:5-G:3C' });

      // Score some points: 0, 1, 0, 0, 0 → side 0 wins with streak of 3
      matchUp = addPoint(matchUp, { winner: 0 });
      matchUp = addPoint(matchUp, { winner: 1 });
      matchUp = addPoints(matchUp, 0, 3);

      // Cumulative scores should be 4-1 in the completed game
      const set = matchUp.score.sets[0];
      expect(set.side1GameScores![0]).toBe(4);
      expect(set.side2GameScores![0]).toBe(1);
    });
  });
});
