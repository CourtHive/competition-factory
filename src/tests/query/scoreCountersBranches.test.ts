import { countSets, countGames, countPoints } from '@Query/matchUps/roundRobinTally/scoreCounters';
import { expect, test } from 'vitest';

// constants
import { DEFAULTED, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';

test('countSets with DEFAULTED and setsCreditForDefaults', () => {
  const result = countSets({
    winningSide: 1,
    matchUpStatus: DEFAULTED,
    tallyPolicy: { setsCreditForDefaults: true },
    matchUpFormat: 'SET3-S:6/TB7',
    score: { sets: [] },
  });
  expect(result[0]).toBe(2); // setsToWin for best of 3
  expect(result[1]).toBe(0);
});

test('countSets with WALKOVER and setsCreditForWalkovers', () => {
  const result = countSets({
    winningSide: 2,
    matchUpStatus: WALKOVER,
    tallyPolicy: { setsCreditForWalkovers: true },
    matchUpFormat: 'SET3-S:6/TB7',
    score: { sets: [] },
  });
  expect(result[0]).toBe(0);
  expect(result[1]).toBe(2);
});

test('countSets with RETIRED and loser having setsToWin', () => {
  // Loser (side 2) has 2 sets, which equals setsToWin for best of 3
  const result = countSets({
    winningSide: 1,
    matchUpStatus: RETIRED,
    tallyPolicy: {},
    matchUpFormat: 'SET3-S:6/TB7',
    score: {
      sets: [
        { setNumber: 1, winningSide: 2 },
        { setNumber: 2, winningSide: 1 },
        { setNumber: 3, winningSide: 2 },
      ],
    },
  });
  // Loser had setsToWin (2), so should subtract 1
  expect(result[1]).toBe(1);
});

test('countSets with RETIRED and setsCreditForRetirements', () => {
  const result = countSets({
    winningSide: 1,
    matchUpStatus: RETIRED,
    tallyPolicy: { setsCreditForRetirements: true },
    matchUpFormat: 'SET3-S:6/TB7',
    score: {
      sets: [
        { setNumber: 1, winningSide: 1 },
        { setNumber: 2, winningSide: 2 },
      ],
    },
  });
  // Winner should get setsToWin credit
  expect(result[0]).toBe(2);
});

test('countSets without sets defaults to [0,0]', () => {
  const result = countSets({
    winningSide: 1,
    score: {},
  });
  expect(result).toEqual([0, 0]);
});

test('countGames with DEFAULTED and gamesCreditForDefaults', () => {
  const result = countGames({
    winningSide: 1,
    matchUpStatus: DEFAULTED,
    tallyPolicy: { gamesCreditForDefaults: true },
    matchUpFormat: 'SET3-S:6/TB7',
    score: { sets: [] },
  });
  expect(result[0]).toBeGreaterThan(0); // minimumGameWins
  expect(result[1]).toBe(0);
});

test('countGames with WALKOVER and gamesCreditForWalkovers', () => {
  const result = countGames({
    winningSide: 2,
    matchUpStatus: WALKOVER,
    tallyPolicy: { gamesCreditForWalkovers: true },
    matchUpFormat: 'SET3-S:6/TB7',
    score: { sets: [] },
  });
  expect(result[0]).toBe(0);
  expect(result[1]).toBeGreaterThan(0);
});

test('countGames with tiebreakSet and gamesCreditForTiebreakSets', () => {
  // Use a tiebreak set format
  const result = countGames({
    winningSide: 1,
    matchUpFormat: 'SET3-S:6/TB7-F:TB10',
    tallyPolicy: { gamesCreditForTiebreakSets: true },
    score: {
      sets: [
        { setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 },
        { setNumber: 2, side1Score: 4, side2Score: 6, winningSide: 2 },
        { setNumber: 3, winningSide: 1, side1TiebreakScore: 10, side2TiebreakScore: 5 },
      ],
    },
  });
  expect(result[0]).toBeGreaterThanOrEqual(10);
});

test('countGames with tiebreakSet gamesCreditForTiebreakSets: false', () => {
  const result = countGames({
    winningSide: 1,
    matchUpFormat: 'SET3-S:6/TB7-F:TB10',
    tallyPolicy: { gamesCreditForTiebreakSets: false },
    score: {
      sets: [
        { setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 },
        { setNumber: 2, side1Score: 4, side2Score: 6, winningSide: 2 },
        { setNumber: 3, winningSide: 1, side1TiebreakScore: 10, side2TiebreakScore: 5 },
      ],
    },
  });
  expect(result).toBeDefined();
});

test('countGames RETIRED with complement logic', () => {
  // Retired in third set: winner has 1 set, loser has 1 set, incomplete third set
  const result = countGames({
    winningSide: 1,
    matchUpStatus: RETIRED,
    tallyPolicy: {},
    matchUpFormat: 'SET3-S:6/TB7',
    score: {
      sets: [
        { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 },
        { setNumber: 2, side1Score: 3, side2Score: 6, winningSide: 2 },
        { setNumber: 3, side1Score: 3, side2Score: 1 },
      ],
    },
  });
  expect(result[0]).toBeGreaterThan(0);
  expect(result[1]).toBeGreaterThan(0);
});

test('countGames RETIRED with gamesCreditForRetirements', () => {
  const result = countGames({
    winningSide: 1,
    matchUpStatus: RETIRED,
    tallyPolicy: { gamesCreditForRetirements: true },
    matchUpFormat: 'SET3-S:6/TB7',
    score: {
      sets: [{ setNumber: 1, side1Score: 2, side2Score: 1 }],
    },
  });
  // Winner should get gamesForSet credit since only 1 set played vs setsToWin of 2
  expect(result[0]).toBeGreaterThan(2);
});

test('countGames with no score returns [0,0]', () => {
  const result = countGames({
    winningSide: 1,
    score: undefined as any,
  });
  expect(result).toEqual([0, 0]);
});

test('countGames RETIRED with tiebreakAt boundary values', () => {
  // Test complement at tiebreakAt boundary
  const result = countGames({
    winningSide: 1,
    matchUpStatus: RETIRED,
    tallyPolicy: {},
    matchUpFormat: 'SET3-S:6/TB7',
    score: {
      sets: [
        { setNumber: 1, side1Score: 3, side2Score: 6, winningSide: 2 },
        { setNumber: 2, side1Score: 6, side2Score: 3, winningSide: 1 },
        { setNumber: 3, side1Score: 5, side2Score: 6 },
      ],
    },
  });
  expect(result).toBeDefined();
});

test('countGames with finalSetFormat', () => {
  // A format with a different final set format
  const result = countGames({
    winningSide: 1,
    matchUpFormat: 'SET3-S:6/TB7-F:TB10',
    score: {
      sets: [
        { setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 },
        { setNumber: 2, side1Score: 4, side2Score: 6, winningSide: 2 },
        { setNumber: 3, winningSide: 1, side1TiebreakScore: 10, side2TiebreakScore: 8 },
      ],
    },
  });
  expect(result[0]).toBeGreaterThanOrEqual(10);
});

test('countPoints with points-based format (timed)', () => {
  // Points-based timed format: SET1-S:T10P
  const result = countPoints({
    matchUpFormat: 'SET1-S:T10P',
    score: {
      sets: [{ setNumber: 1, side1Score: 21, side2Score: 15 }],
    },
  });
  expect(result.pointsTally[0]).toBe(21);
  expect(result.pointsTally[1]).toBe(15);
});

test('countPoints with tiebreak scores in games-based format', () => {
  const result = countPoints({
    matchUpFormat: 'SET3-S:6/TB7',
    score: {
      sets: [
        { setNumber: 1, side1Score: 7, side2Score: 6, side1TiebreakScore: 7, side2TiebreakScore: 3, winningSide: 1 },
        { setNumber: 2, side1Score: 6, side2Score: 7, side1TiebreakScore: 5, side2TiebreakScore: 7, winningSide: 2 },
      ],
    },
  });
  expect(result.pointsTally[0]).toBe(12); // 7 + 5
  expect(result.pointsTally[1]).toBe(10); // 3 + 7
  expect(result.tiebreaksTally[0]).toBe(1);
  expect(result.tiebreaksTally[1]).toBe(1);
});

test('countPoints with no matchUpFormat', () => {
  const result = countPoints({
    score: {
      sets: [{ setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 }],
    },
  });
  expect(result.pointsTally).toBeDefined();
  expect(result.tiebreaksTally).toBeDefined();
});

test('countGames RETIRED where loser leads the final set', () => {
  // Loser (side 2) leads in the last set
  const result = countGames({
    winningSide: 1,
    matchUpStatus: RETIRED,
    tallyPolicy: {},
    matchUpFormat: 'SET3-S:6/TB7',
    score: {
      sets: [
        { setNumber: 1, side1Score: 6, side2Score: 1, winningSide: 1 },
        { setNumber: 2, side1Score: 1, side2Score: 6, winningSide: 2 },
        { setNumber: 3, side1Score: 2, side2Score: 4 },
      ],
    },
  });
  expect(result).toBeDefined();
  expect(result[0]).toBeGreaterThan(0);
});

test('countSets winningSide 2 with DEFAULTED', () => {
  const result = countSets({
    winningSide: 2,
    matchUpStatus: DEFAULTED,
    tallyPolicy: { setsCreditForDefaults: true },
    matchUpFormat: 'SET1-S:6/TB7',
    score: { sets: [] },
  });
  expect(result[0]).toBe(0);
  expect(result[1]).toBe(1); // setsToWin for best of 1
});

test('countGames RETIRED side 2 wins', () => {
  const result = countGames({
    winningSide: 2,
    matchUpStatus: RETIRED,
    tallyPolicy: { gamesCreditForRetirements: true },
    matchUpFormat: 'SET3-S:6/TB7',
    score: {
      sets: [{ setNumber: 1, side1Score: 4, side2Score: 2 }],
    },
  });
  expect(result).toBeDefined();
});
