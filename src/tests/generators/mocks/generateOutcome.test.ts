import mocksEngine from '@Assemblies/engines/mock';
import { generateRange } from '@Tools/arrays';
import { it, test, expect } from 'vitest';

// constants
import { INVALID_MATCHUP_FORMAT, INVALID_VALUES } from '@Constants/errorConditionConstants';
import {
  COMPLETED,
  DEFAULTED,
  DOUBLE_WALKOVER,
  INCOMPLETE,
  RETIRED,
  SUSPENDED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

const SET1T20 = 'SET1-S:T20';
const iterations = 1;

it.each(generateRange(0, iterations))('can generate score strings for matchUpFormats', () => {
  let result = mocksEngine.generateOutcome({ matchUpFormat: '' });
  expect(result.error).toEqual(INVALID_MATCHUP_FORMAT);
  result = mocksEngine.generateOutcome({ matchUpStatusProfile: '' });
  expect(result.error).toEqual(INVALID_VALUES);
  result = mocksEngine.generateOutcome({ matchUpStatusProfile: {} });
  expect([1, 2].includes(result.outcome.winningSide)).toBeTruthy();
  expect(result.outcome.matchUpStatus).toEqual(COMPLETED);

  let { outcome } = mocksEngine.generateOutcome({
    matchUpStatusProfile: { [RETIRED]: 100 },
  });
  expect(outcome.matchUpStatus).toEqual(RETIRED);
  expect([1, 2].includes(outcome.winningSide)).toEqual(true);
  expect(outcome.score.sets).toEqual([]);
  expect(outcome.score.scoreStringSide1).toEqual('');
  expect(outcome.score.side2ScoreString).toEqual('');

  ({ outcome } = mocksEngine.generateOutcome({
    matchUpStatusProfile: { [DEFAULTED]: 100 },
  }));
  expect(outcome.matchUpStatus).toEqual(DEFAULTED);
  expect([1, 2].includes(outcome.winningSide)).toEqual(true);
  const defaultedSet = outcome.score.sets.pop();
  if (defaultedSet) {
    expect(defaultedSet.winningSide).toBeUndefined();
  }
  ({ outcome } = mocksEngine.generateOutcome({
    matchUpStatusProfile: { [DEFAULTED]: 100 },
    defaultWithScorePercent: 100,
  }));
  expect(outcome.matchUpStatus).toEqual(DEFAULTED);
  expect([1, 2].includes(outcome.winningSide)).toEqual(true);
  expect(outcome.score.sets.length).toBeGreaterThan(0);

  ({ outcome } = mocksEngine.generateOutcome({
    matchUpStatusProfile: { [WALKOVER]: 100 },
  }));
  expect(outcome.matchUpStatus).toEqual(WALKOVER);
  expect(outcome.score.sets).toEqual([]);
  expect(outcome.score.scoreStringSide1).toEqual('');
  expect(outcome.score.side2ScoreString).toEqual('');
  expect([1, 2].includes(outcome.winningSide)).toEqual(true);

  ({ outcome } = mocksEngine.generateOutcome({
    matchUpStatusProfile: { [DOUBLE_WALKOVER]: 100 },
  }));
  expect(outcome.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(outcome.score.sets).toEqual([]);
  expect(outcome.score.scoreStringSide1).toEqual('');
  expect(outcome.score.side2ScoreString).toEqual('');
  expect(outcome.winningSide).toBeUndefined();

  // specifying a winningSide does not produce a winningSide for DOUBLE_WALKOVER
  ({ outcome } = mocksEngine.generateOutcome({
    matchUpStatusProfile: { [DOUBLE_WALKOVER]: 100 },
    winningSide: 1,
  }));
  expect(outcome.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(outcome.winningSide).toBeUndefined();

  ({ outcome } = mocksEngine.generateOutcome({
    matchUpStatusProfile: { [SUSPENDED]: 100 },
    winningSide: 1,
  }));
  expect(outcome.matchUpStatus).toEqual(SUSPENDED);
  expect(outcome.winningSide).toBeUndefined();

  ({ outcome } = mocksEngine.generateOutcome({
    matchUpStatusProfile: { [INCOMPLETE]: 100 },
    winningSide: 1,
  }));
  expect(outcome.matchUpStatus).toEqual(INCOMPLETE);
  expect(outcome.winningSide).toBeUndefined();
});

// used to validate sideWeight to limit generation of 3 sets
test.each(generateRange(0, iterations))('iteration counts', () => {
  // winningSides is used to verify even distribution
  const winningSides = { 1: 0, 2: 0 };

  let firstIteration3Sets = 0;
  generateRange(0, 100).forEach(() => {
    const { outcome } = mocksEngine.generateOutcome({ sideWeight: 1 });
    winningSides[outcome.winningSide] += 1;
    if (outcome.score.sets.length === 3) firstIteration3Sets += 1;
  });

  let secondIteration3Sets = 0;
  generateRange(0, 100).forEach(() => {
    const { outcome } = mocksEngine.generateOutcome({ sideWeight: 100 });
    winningSides[outcome.winningSide] += 1;
    if (outcome.score.sets.length === 3) secondIteration3Sets += 1;
  });

  expect(firstIteration3Sets).toBeGreaterThan(secondIteration3Sets);
});

test.each(generateRange(0, iterations))('supports timed matchUpFormats', () => {
  let result = mocksEngine.generateOutcome({
    matchUpFormat: SET1T20,
    matchUpStatusProfile: {}, // ensures that there are no DOUBLE_WALKOVERS
  });
  expect(result.outcome.winningSide).not.toBeUndefined();

  // supports short form matchUpFormat for timed sets
  result = mocksEngine.generateOutcome({
    matchUpFormat: 'T20',
    matchUpStatusProfile: {}, // ensures that there are no DOUBLE_WALKOVERS
  });
  expect(result.outcome.winningSide).not.toBeUndefined();

  result = mocksEngine.generateOutcome({
    matchUpFormat: 'SET3-S:T20',
    matchUpStatusProfile: {}, // ensures that there are no DOUBLE_WALKOVERS
  });
  expect(result.outcome.winningSide).not.toBeUndefined();
  expect([2, 3].includes(result.outcome.score.sets.length)).toEqual(true);

  result = mocksEngine.generateOutcome({
    matchUpFormat: 'SET3-S:T20',
    matchUpStatusProfile: { [RETIRED]: 100 },
  });
  expect(result.outcome.winningSide).not.toBeUndefined();
  expect(result.outcome.matchUpStatus).toEqual(RETIRED);
});

test.each(generateRange(0, iterations))('supports specifying winningSide', () => {
  let result;
  generateRange(0, 10).forEach(() => {
    result = mocksEngine.generateOutcome({
      matchUpFormat: SET1T20,
      matchUpStatusProfile: {}, // ensures that there are no DOUBLE_WALKOVERS
      winningSide: 1,
    });
    expect(result.outcome.winningSide).toEqual(1);
    result = mocksEngine.generateOutcome({
      matchUpFormat: SET1T20,
      matchUpStatusProfile: {}, // ensures that there are no DOUBLE_WALKOVERS
      winningSide: 2,
    });
    expect(result.outcome.winningSide).toEqual(2);

    result = mocksEngine.generateOutcome({
      matchUpStatusProfile: {}, // ensures that there are no DOUBLE_WALKOVERS
      winningSide: 1,
    });
    expect(result.outcome.winningSide).toEqual(1);

    result = mocksEngine.generateOutcome({
      matchUpStatusProfile: {}, // ensures that there are no DOUBLE_WALKOVERS
      winningSide: 2,
    });
    expect(result.outcome.winningSide).toEqual(2);

    result = mocksEngine.generateOutcome({
      matchUpStatusProfile: { [WALKOVER]: 100 },
      winningSide: 1,
    });
    expect(result.outcome.winningSide).toEqual(1);

    result = mocksEngine.generateOutcome({
      matchUpStatusProfile: { [RETIRED]: 100 },
      winningSide: 1,
    });
    expect(result.outcome.winningSide).toEqual(1);
  });
});

test.each(generateRange(0, iterations))('supports aggregate timed formats', () => {
  // SET2XA-S:T10: 2 sets exactly, aggregate scoring, 10-minute timed
  generateRange(0, 20).forEach(() => {
    const { outcome } = mocksEngine.generateOutcome({
      matchUpFormat: 'SET2XA-S:T10',
      matchUpStatusProfile: {},
    });
    expect(outcome.winningSide).toBeDefined();
    expect(outcome.score.sets.length).toBe(2); // exactly 2 sets always played

    for (const set of outcome.score.sets) {
      expect(set.side1Score).toBeGreaterThanOrEqual(0);
      expect(set.side2Score).toBeGreaterThanOrEqual(0);
    }

    // Aggregate winner should match winningSide
    const side1Total = outcome.score.sets.reduce((s, set) => s + set.side1Score, 0);
    const side2Total = outcome.score.sets.reduce((s, set) => s + set.side2Score, 0);
    if (outcome.winningSide === 1) {
      expect(side1Total).toBeGreaterThan(side2Total);
    } else {
      expect(side2Total).toBeGreaterThan(side1Total);
    }
  });

  // SET1A-S:T10: 1 set, aggregate scoring, 10-minute timed
  generateRange(0, 20).forEach(() => {
    const { outcome } = mocksEngine.generateOutcome({
      matchUpFormat: 'SET1A-S:T10',
      matchUpStatusProfile: {},
    });
    expect(outcome.winningSide).toBeDefined();
    expect(outcome.score.sets.length).toBe(1);
    expect(outcome.score.sets[0].side1Score).toBeGreaterThanOrEqual(0);
    expect(outcome.score.sets[0].side2Score).toBeGreaterThanOrEqual(0);
  });

  // winningSide override works with aggregate formats
  generateRange(0, 10).forEach(() => {
    const { outcome } = mocksEngine.generateOutcome({
      matchUpFormat: 'SET2XA-S:T10',
      matchUpStatusProfile: {},
      winningSide: 1,
    });
    expect(outcome.winningSide).toBe(1);
    const s1 = outcome.score.sets.reduce((s, set) => s + set.side1Score, 0);
    const s2 = outcome.score.sets.reduce((s, set) => s + set.side2Score, 0);
    expect(s1).toBeGreaterThan(s2);
  });

  generateRange(0, 10).forEach(() => {
    const { outcome } = mocksEngine.generateOutcome({
      matchUpFormat: 'SET2XA-S:T10',
      matchUpStatusProfile: {},
      winningSide: 2,
    });
    expect(outcome.winningSide).toBe(2);
    const s1 = outcome.score.sets.reduce((s, set) => s + set.side1Score, 0);
    const s2 = outcome.score.sets.reduce((s, set) => s + set.side2Score, 0);
    expect(s2).toBeGreaterThan(s1);
  });
});

test.each(generateRange(0, iterations))('other matchUpFormats', () => {
  let result = mocksEngine.generateOutcome({
    matchUpFormat: 'SET3-S:4/TB7',
    matchUpStatusProfile: {}, // ensures a COMPLETED outcome
  });
  const { side1Score, side2Score } = result.outcome.score.sets[0];
  expect(Math.max(side1Score, side2Score) <= 5).toBeTruthy();

  result = mocksEngine.generateOutcome({
    matchUpFormat: 'SET3-S:TB7',
    matchUpStatusProfile: {},
    winningSide: 2,
  });
  expect(result.outcome.winningSide).toEqual(2);
  expect(result.outcome.matchUpStatus).toEqual(COMPLETED);
});
