import { maxCountablesOf } from '@Assemblies/generators/scales/generateDynamicRatings';
import { expect, it } from 'vitest';

// The most sets a matchUp in a format can count: kMultiplier weights a result by maxCountables / counted.
it.each([
  { matchUpFormat: undefined, expected: 1 },
  { matchUpFormat: 'SET3-S:6/TB7', expected: 3 },
  { matchUpFormat: 'SET5-S:6/TB7', expected: 5 },
  // exactly-N formats play all N: bestOf is undefined for them, which read as 1
  { matchUpFormat: 'SET3XA-S:T10', expected: 3 },
  { matchUpFormat: 'SET4X-S:T20P-F:T10', expected: 4 },
  // an aggregate format's decider is one more set, N + 1, played on a level total
  { matchUpFormat: 'SET3XA-S:T10-F:TB1', expected: 4 },
])('maxCountablesOf($matchUpFormat) is $expected', ({ matchUpFormat, expected }) => {
  expect(maxCountablesOf(matchUpFormat)).toEqual(expected);
});

it('counts games when asked: sets × setTo', () => {
  expect(maxCountablesOf('SET3-S:6/TB7', true)).toEqual(18);
});
