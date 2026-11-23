import { keyValueMatchUpScore, keyValueScore } from '@Helpers/keyValueScore/keyValueScore';
import { enterValues } from './primitives';
import { expect, it } from 'vitest';

// Exactly three timed periods decided by aggregate points; a period may end level, even 0-0.
const AGGREGATE3x10 = 'SET3XA-S:T10';

const period = (side1: number, side2: number) => [
  { value: side1 },
  { value: '-' },
  { value: side2 },
  { value: 'space' },
];

it('closes a level period and names the aggregate winner once all three are in', () => {
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat: AGGREGATE3x10 };
  const values = [...period(3, 2), ...period(1, 1), ...period(0, 0)];

  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp?.scoreString.trim()).toEqual('3-2 1-1 0-0');
  expect(matchUp?.sets.length).toEqual(3);
  expect(matchUp?.winningSide).toEqual(1); // 4-3 on aggregate, though side 1 won only one period
});

it('a level aggregate names no winner and opens no fourth period: the decider is entered in the dialog', () => {
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat: AGGREGATE3x10 };
  const values = [...period(2, 2), ...period(1, 0), ...period(0, 1)];

  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp?.scoreString.trim()).toEqual('2-2 1-0 0-1');
  expect(matchUp?.sets.length).toEqual(3);
  expect(matchUp?.winningSide).toBeUndefined();
});

it('names no winner from a lead before every period is in', () => {
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat: AGGREGATE3x10 };
  const values = [...period(5, 0), ...period(1, 0)];

  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp?.winningSide).toBeUndefined();
});

it('refuses an overtime format: overtime is entered in the dialog only (CA 2026-11-04)', () => {
  const matchUpFormat = 'HAL2XA-S:T45P-O:2X/T15P-F:TB1';
  const result = keyValueScore({ value: 1, sets: [], scoreString: '', matchUpFormat });
  expect(result.updated).toEqual(false);
  expect(keyValueMatchUpScore({ value: 1, matchUp: { sets: [], matchUpFormat }, matchUpFormat }).updated).toEqual(
    false,
  );
});
