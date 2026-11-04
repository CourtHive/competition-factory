import { validateMatchUpScore } from '@Validators/validateMatchUpScore';
import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';

/**
 * An exactly-N aggregate's decider (`-F:`, set N + 1) is played only when the N sets end level in total
 * (INTENNSE `SET3XA-S:T10-F:TB1`). The engine compared only the winner with the aggregate leader, so a decider
 * after a 29-24 regulation was accepted whenever the leader was named; the score dialog's validator accepted
 * it whatever the winner.
 */
const FORMAT = 'SET3XA-S:T10-F:TB1';
const regulation = (third: [number, number]) => [
  { setNumber: 1, side1Score: 10, side2Score: 8, winningSide: 1 },
  { setNumber: 2, side1Score: 8, side2Score: 10, winningSide: 2 },
  { setNumber: 3, side1Score: third[0], side2Score: third[1], winningSide: third[0] > third[1] ? 1 : undefined },
];
const decider = (winningSide: 1 | 2) => ({
  setNumber: 4,
  side1TiebreakScore: winningSide === 1 ? 1 : 0,
  side2TiebreakScore: winningSide === 2 ? 1 : 0,
  winningSide,
});
const LEVEL = [...regulation([9, 9]), decider(2)];
const UNLEVEL = [...regulation([11, 9]), decider(2)];

function setOutcome(sets: any[], winningSide: number) {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4, matchUpFormat: FORMAT }], setState: true });
  const { matchUpId } = tournamentEngine.allDrawMatchUps({ drawId }).matchUps.find((m) => m.roundNumber === 1);
  return tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: COMPLETED, winningSide, score: { sets } },
    matchUpId,
    drawId,
  });
}

describe('a decider is played on a level aggregate only', () => {
  it('the engine records a decider on a level aggregate', () => {
    expect(setOutcome(LEVEL, 2).success).toBe(true);
  });

  it.each([1, 2])('the engine refuses a decider after an unlevel aggregate, named winner %s', (winningSide) => {
    expect(setOutcome(UNLEVEL, winningSide).success).toBeUndefined();
  });

  it('analyzeMatchUp agrees', () => {
    const valid = (sets: any[], winningSide: number) =>
      analyzeMatchUp({ matchUp: { score: { sets }, winningSide, matchUpFormat: FORMAT }, matchUpFormat: FORMAT })
        .validMatchUpOutcome;
    expect(valid(LEVEL, 2)).toBe(true);
    expect(valid(UNLEVEL, 1)).toBe(false);
  });

  it('the score dialog validator agrees', () => {
    expect(validateMatchUpScore(LEVEL, FORMAT, COMPLETED).isValid).toBe(true);
    const result = validateMatchUpScore(UNLEVEL, FORMAT, COMPLETED);
    expect(result).toMatchObject({ isValid: false, error: expect.stringMatching(/level/) });
  });
});
