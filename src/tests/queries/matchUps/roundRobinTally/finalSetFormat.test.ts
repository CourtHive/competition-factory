import { countGames, countPoints } from '@Query/matchUps/roundRobinTally/scoreCounters';
import { describe, expect, it } from 'vitest';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';

/**
 * The final-set format (`-F:`) governs the final set only: set N + 1 of an exactly-N aggregate (its decider),
 * set N of a best-of-N. The tally used to read every set past the sets needed to win as the final set, so an
 * exactly-N format (no bestOf, so one set to win) read sets 2..N as its decider and dropped their games.
 */
const set = (setNumber: number, side1Score: number, side2Score: number, winningSide?: number) => ({
  setNumber,
  side1Score,
  side2Score,
  winningSide,
});

describe('the final set is the final set', () => {
  it('INTENNSE SET3XA-S:T10-F:TB1: every regulation set counts, the decider is one game', () => {
    const sets = [
      set(1, 10, 8, 1),
      set(2, 7, 10, 2),
      set(3, 9, 9),
      { setNumber: 4, side1TiebreakScore: 1, side2TiebreakScore: 0, winningSide: 1 },
    ];
    const matchUp = { matchUpFormat: 'SET3XA-S:T10-F:TB1', matchUpStatus: COMPLETED, winningSide: 1 } as const;
    expect(countGames({ ...matchUp, score: { sets } })).toEqual([27, 27]);
  });

  it('a points-based exactly-N aggregate counts every regulation set as points', () => {
    const sets = [
      set(1, 12, 10, 1),
      set(2, 8, 11, 2),
      set(3, 10, 9, 1),
      set(4, 9, 10, 2),
      { setNumber: 5, side1TiebreakScore: 0, side2TiebreakScore: 1, winningSide: 2 },
    ];
    const { pointsTally } = countPoints({ matchUpFormat: 'SET4XA-S:T12P-F:TB1', score: { sets } });
    expect(pointsTally).toEqual([39, 41]);
  });

  it('best of five with a tiebreak final set: set four is a set, set five the tiebreak', () => {
    const sets = [
      set(1, 6, 4, 1),
      set(2, 4, 6, 2),
      set(3, 6, 3, 1),
      set(4, 3, 6, 2),
      { setNumber: 5, side1TiebreakScore: 10, side2TiebreakScore: 8, winningSide: 1 },
    ];
    const matchUp = { matchUpFormat: 'SET5-S:6/TB7-F:TB10', matchUpStatus: COMPLETED, winningSide: 1 } as const;
    expect(countGames({ ...matchUp, score: { sets } })).toEqual([20, 19]);
  });
});
