import { generateOutcomeFromScoreString } from '@Generators/simulation/generateOutcomeFromScoreString';
import { analyzeScore } from '@Query/matchUp/analyzeScore';
import { expect, it } from 'vitest';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';

it('calculates winningSide for single timed set', () => {
  const matchUpFormat = 'SET1A-S:T20';

  // Side 1 wins 50-45
  const result = generateOutcomeFromScoreString({
    scoreString: '50-45',
    matchUpFormat,
  });

  expect(result.outcome.winningSide).toEqual(1);
  expect(result.outcome.score.sets[0].winningSide).toEqual(1);
});

it('calculates winningSide for aggregate scoring (SET2XA-S:T10)', () => {
  const matchUpFormat = 'SET2XA-S:T10';

  // Clear aggregate winner: 60 vs 50 total
  let result = generateOutcomeFromScoreString({
    scoreString: '30-25 30-25',
    matchUpFormat,
  });

  expect(result.outcome.winningSide).toEqual(1);
  expect(result.outcome.score.sets[0].side1Score).toEqual(30);
  expect(result.outcome.score.sets[0].side2Score).toEqual(25);

  // Side 2 aggregate winner: 40 vs 55 total
  result = generateOutcomeFromScoreString({
    scoreString: '20-25 20-30',
    matchUpFormat,
  });

  expect(result.outcome.winningSide).toEqual(2);
});

it('calculates winningSide for aggregate with split sets', () => {
  const matchUpFormat = 'SET2XA-S:T10';

  // Side 1 wins one set big, loses other small
  // Aggregate: 50+10 = 60 vs 10+30 = 40
  const result = generateOutcomeFromScoreString({
    scoreString: '50-10 10-30',
    matchUpFormat,
  });

  expect(result.outcome.winningSide).toEqual(1);
  expect(result.outcome.score.sets[0].winningSide).toEqual(1);
  expect(result.outcome.score.sets[1].winningSide).toEqual(2);

  // Verify aggregate calculation would be correct
  const analyzed = analyzeScore({
    score: result.outcome.score,
    matchUpFormat,
    matchUpStatus: COMPLETED,
    winningSide: 1,
  });
  expect(analyzed.valid).toEqual(true);
});

it('calculates winningSide for aggregate with exactly 3 sets', () => {
  const matchUpFormat = 'SET3XA-S:T10';

  // Aggregate: 30+20+35 = 85 vs 25+25+30 = 80
  const result = generateOutcomeFromScoreString({
    scoreString: '30-25 20-25 35-30',
    matchUpFormat,
  });

  expect(result.outcome.winningSide).toEqual(1);

  // Verify each individual set has winningSide
  expect(result.outcome.score.sets[0].winningSide).toEqual(1);
  expect(result.outcome.score.sets[1].winningSide).toEqual(2);
  expect(result.outcome.score.sets[2].winningSide).toEqual(1);
});

it('calculates winningSide for points-based scoring (T10P)', () => {
  const matchUpFormat = 'SET3X-S:T10P';

  // Points-based: winner is highest score in each set
  const result = generateOutcomeFromScoreString({
    scoreString: '30-25 25-30 35-32',
    matchUpFormat,
  });

  expect(result.outcome.winningSide).toEqual(1);
  expect(result.outcome.score.sets[0].winningSide).toEqual(1);
  expect(result.outcome.score.sets[1].winningSide).toEqual(2);
  expect(result.outcome.score.sets[2].winningSide).toEqual(1);
});

it('calculates winningSide for games-based timed sets (default)', () => {
  const matchUpFormat = 'SET3X-S:T10';

  // Games-based: standard set winning rules
  const result = generateOutcomeFromScoreString({
    scoreString: '15-10 10-15 12-10',
    matchUpFormat,
  });

  expect(result.outcome.winningSide).toEqual(1);
  expect(result.outcome.score.sets[0].winningSide).toEqual(1);
  expect(result.outcome.score.sets[1].winningSide).toEqual(2);
  expect(result.outcome.score.sets[2].winningSide).toEqual(1);
});

it('calculates winningSide for best-of with aggregate', () => {
  const matchUpFormat = 'SET3A-S:T10';

  // Best of 3 with aggregate scoring
  const result = generateOutcomeFromScoreString({
    scoreString: '30-25 25-30 35-30',
    matchUpFormat,
  });

  expect(result.outcome.winningSide).toEqual(1);
  // Side 1 wins 2 out of 3 sets
});

it('handles tied individual sets in aggregate scoring', () => {
  const matchUpFormat = 'SET2XA-S:T10';

  // Individual sets tied, but aggregate determines winner
  // 30+35 = 65 vs 30+30 = 60
  const result = generateOutcomeFromScoreString({
    scoreString: '30-30 35-30',
    matchUpFormat,
  });

  // For aggregate, winningSide determined by total scores
  expect(result.outcome.winningSide).toEqual(1);

  // Individual sets can have ties for aggregate
  expect(result.outcome.score.sets[0].side1Score).toEqual(30);
  expect(result.outcome.score.sets[0].side2Score).toEqual(30);
});

it('calculates winningSide for mixed format (regular + timed final)', () => {
  const matchUpFormat = 'SET3-S:6/TB7-F:T20';

  // Regular sets 1-1, then timed final set
  const result = generateOutcomeFromScoreString({
    scoreString: '6-4 4-6 50-45',
    matchUpFormat,
  });

  expect(result.outcome.winningSide).toEqual(1);
  expect(result.outcome.score.sets[0].winningSide).toEqual(1);
  expect(result.outcome.score.sets[1].winningSide).toEqual(2);
  expect(result.outcome.score.sets[2].winningSide).toEqual(1);
});

it('validates aggregate winningSide calculation is correct', () => {
  const matchUpFormat = 'SET3XA-S:T10';

  // Generate outcome
  const result = generateOutcomeFromScoreString({
    scoreString: '100-1 0-30 0-30', // Total: 100 vs 61
    matchUpFormat,
  });

  // Should calculate winningSide as 1 (100 > 61 aggregate)
  expect(result.outcome.winningSide).toEqual(1);

  // Validate it's correct per our analyzeScore logic
  const analyzed = analyzeScore({
    score: result.outcome.score,
    matchUpFormat,
    matchUpStatus: COMPLETED,
    winningSide: result.outcome.winningSide,
  });

  expect(analyzed.valid).toEqual(true);
});

it('calculates winningSide correctly when side 2 wins aggregate', () => {
  const matchUpFormat = 'SET3XA-S:T10';

  // Aggregate: 10+10+10 = 30 vs 15+15+15 = 45
  const result = generateOutcomeFromScoreString({
    scoreString: '10-15 10-15 10-15',
    matchUpFormat,
  });

  expect(result.outcome.winningSide).toEqual(2);
  expect(result.outcome.score.sets[0].winningSide).toEqual(2);
  expect(result.outcome.score.sets[1].winningSide).toEqual(2);
  expect(result.outcome.score.sets[2].winningSide).toEqual(2);
});

it('handles close aggregate scores correctly', () => {
  const matchUpFormat = 'SET2XA-S:T10';

  // Very close aggregate: 60 vs 59
  const result = generateOutcomeFromScoreString({
    scoreString: '30-29 30-30',
    matchUpFormat,
  });

  expect(result.outcome.winningSide).toEqual(1);

  // Reverse: 59 vs 60
  const result2 = generateOutcomeFromScoreString({
    scoreString: '29-30 30-30',
    matchUpFormat,
  });

  expect(result2.outcome.winningSide).toEqual(2);
});
