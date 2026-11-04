import { generateOutcome } from '@Generators/simulation/generateOutcome';
import { overtimeScoreVerdict } from '@Validators/overtimeScore';
import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import { createSeededRandom } from '@Tools/prng';
import { describe, expect, it } from 'vitest';

// constants
import { COMPLETED, DEFAULTED } from '@Constants/matchUpStatusConstants';

/**
 * Mock outcomes play overtime (overtime activation S3). They jumped from regulation straight to the decider,
 * leaving sparse set numbers (`[1, 2, 5]`), no phase, no `score.overtime`, and never a sudden-death or
 * overtime-decided result. Each outcome is now one the static verdict accepts, with every set numbered in order
 * and stamped with its phase, as a score written through the dialog is.
 *
 * A level finish is never generated, as for every other aggregate format (generatedOutcomesAreLegal, D1).
 */

const SEEDS = 200;
const COMPLETED_ONLY = {};

const F1 = 'HAL2XA-S:T45P-O:2X/T15P-F:TB1'; // two halves, an exact two-period block, then a decider
const F2 = 'QTR4XA-S:T12P-O:U/T5P'; // unlimited periods, compared at each period end
const F3 = 'PER3XA-S:T20P-O:USD/T20P'; // unlimited sudden-death periods
const F4 = 'PER3XA-S:T20P-O:1SD/T5P-F:TB1'; // one sudden-death period, then a decider
const F5 = 'HAL2XA-S:T40P-O:1/T10P'; // one period; may finish level, never generated level
const F6 = 'HAL2XA-S:T45P-O:2/T15P-F:T10P'; // two periods compared at each end, then a timed decider

function outcomesOf(
  matchUpFormat: string,
  winningSide?: number,
  matchUpStatusProfile: any = COMPLETED_ONLY,
  defaultWithScorePercent?: number,
) {
  return Array.from({ length: SEEDS }, (_, seed) => {
    const result: any = generateOutcome({
      defaultWithScorePercent,
      matchUpFormat,
      matchUpStatusProfile,
      winningSide,
      random: createSeededRandom(seed + 1),
    });
    expect(result.error, `${matchUpFormat} seed ${seed + 1}`).toBeUndefined();
    return result.outcome;
  });
}

const verdictOf = (outcome: any, matchUpFormat: string) =>
  overtimeScoreVerdict({
    matchUpStatus: outcome.matchUpStatus,
    winningSide: outcome.winningSide,
    sets: outcome.score.sets,
    matchUpFormat,
  });

describe.each([
  { f: F1, phases: ['REGULATION', 'OVERTIME', 'DECIDER'] },
  { f: F2, phases: ['REGULATION', 'OVERTIME'] },
  { f: F3, phases: ['REGULATION', 'OVERTIME'] },
  { f: F4, phases: ['REGULATION', 'OVERTIME', 'DECIDER'] },
  { f: F5, phases: ['REGULATION', 'OVERTIME'] },
  { f: F6, phases: ['REGULATION', 'OVERTIME', 'DECIDER'] },
])('$f', ({ f, phases }) => {
  const outcomes = outcomesOf(f);

  it('every outcome is complete, decisive and accepted by the overtime verdict and analyzeMatchUp', () => {
    expect(outcomes).toHaveLength(SEEDS);
    for (const outcome of outcomes) {
      expect(outcome.matchUpStatus).toEqual(COMPLETED);
      expect([1, 2]).toContain(outcome.winningSide);
      expect(verdictOf(outcome, f), JSON.stringify(outcome.score.sets)).toMatchObject({ valid: true });
      const matchUp = { score: outcome.score, winningSide: outcome.winningSide, matchUpFormat: f };
      expect(analyzeMatchUp({ matchUp, matchUpFormat: f }).validMatchUpOutcome).toBe(true);
    }
  });

  it('numbers every set in order and scores in whole numbers', () => {
    for (const { score } of outcomes) {
      expect(score.sets.map((set) => set.setNumber)).toEqual(score.sets.map((_, i) => i + 1));
      for (const set of score.sets)
        for (const value of [set.side1Score, set.side2Score, set.side1TiebreakScore, set.side2TiebreakScore])
          if (value !== undefined) expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('stamps each set with its phase, and the result with where it was decided', () => {
    for (const { score } of outcomes) {
      for (const set of score.sets) expect(set.phase).toBeDefined();
      expect(score.overtime?.decidedIn).toEqual(score.sets.at(-1).phase);
      expect(score.overtime?.scoreString).toBeDefined();
    }
  });

  it(`decides in each of ${phases.join(', ')}`, () => {
    const decidedIn = new Set(outcomes.map(({ score }) => score.overtime.decidedIn));
    expect([...decidedIn].sort()).toEqual([...phases].sort());
  });

  it('respects a requested winner', () => {
    for (const winningSide of [1, 2]) {
      for (const outcome of outcomesOf(f, winningSide)) {
        expect(outcome.winningSide).toEqual(winningSide);
        expect(verdictOf(outcome, f)).toMatchObject({ valid: true });
      }
    }
  });
});

it('a sudden-death period ends on its first score', () => {
  for (const f of [F3, F4]) {
    for (const { score } of outcomesOf(f)) {
      for (const set of score.sets.filter((set) => set.phase === 'OVERTIME')) {
        expect(set.side1Score + set.side2Score).toBeLessThanOrEqual(1);
      }
    }
  }
});

it('an unfinished overtime outcome stops in regulation with no winner of its last set', () => {
  // a default with a score is the scored exit: a retirement is generated without one
  for (const outcome of outcomesOf(F1, undefined, { [DEFAULTED]: 100 }, 100)) {
    expect(outcome.matchUpStatus).toEqual(DEFAULTED);
    expect([1, 2]).toContain(outcome.winningSide);
    expect(outcome.score.sets.at(-1).winningSide).toBeUndefined();
    expect(outcome.score.sets.every((set) => set.phase === 'REGULATION')).toBe(true);
  }
});

it('a format the scoring engine does not score is refused', () => {
  // a tiebreak in a timed overtime segment needs a ruling the engine has not had
  const result: any = generateOutcome({ matchUpFormat: 'HAL2XA-S:T45P-O:1/T10P/TB7' });
  expect(result.error).toBeDefined();
});
