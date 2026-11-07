import tournamentEngine from '@Engines/syncEngine';
import * as governors from '@Assemblies/governors';
import { describe, expect, it } from 'vitest';

/**
 * The score validators refuse input they cannot read instead of reporting it valid. `validateMatchUpScore` is written
 * `(sets, matchUpFormat, matchUpStatus)`; given anything but an array as `sets` it went on to validate nothing and
 * returned `isValid: true`. Through an engine, which calls every method with one params object, that made it pass a
 * 7-2 set however it was called (published 7.32.0). A refusal names the positional form.
 */

const { validateMatchUpScore, validateSetScore } = governors.scoreGovernor;
const fmt = 'SET3-S:6/TB7';
const impossible = [{ setNumber: 1, side1Score: 7, side2Score: 2 }];
const valid = [
  { setNumber: 1, side1Score: 6, side2Score: 3 },
  { setNumber: 2, side1Score: 6, side2Score: 4 },
];

describe('the validators refuse input they cannot read', () => {
  it.each([
    ['a params object as sets', () => validateMatchUpScore({ sets: impossible, matchUpFormat: fmt } as any)],
    ['a format that is not a string', () => validateMatchUpScore(impossible, { code: fmt } as any)],
    ['a set that is not an object', () => validateSetScore(impossible as any, fmt)],
    ['a missing set', () => validateSetScore(undefined, fmt)],
    ['a set format that is not a string', () => validateSetScore(impossible[0], 7 as any)],
  ])('%s', (_label, call) => {
    const result = call();
    expect(result.isValid).toEqual(false);
    expect(result.error).toBeTruthy();
  });

  it('names the positional form in the refusal', () => {
    expect(validateMatchUpScore({ sets: impossible } as any).error).toContain(
      'validateMatchUpScore(sets, matchUpFormat',
    );
    expect(validateSetScore(undefined, fmt).error).toContain('validateSetScore(set, matchUpFormat');
  });

  it('still reads incomplete input as not yet wrong', () => {
    expect(validateMatchUpScore([], fmt)).toEqual({ isValid: true });
    expect(validateMatchUpScore(undefined as any, fmt)).toEqual({ isValid: true });
    expect(validateSetScore(impossible[0], undefined)).toEqual({ isValid: true });
  });

  it('still validates what it can read', () => {
    expect(validateMatchUpScore(impossible, fmt).isValid).toEqual(false);
    expect(validateMatchUpScore(valid, fmt)).toEqual({ isValid: true });
  });
});

describe('through an engine, an impossible score is no longer reported valid', () => {
  // the engine hands the validator one params object; it is refused, not passed
  it.each([
    ['positionally', () => (tournamentEngine.validateMatchUpScore as any)(impossible, fmt)],
    [
      'with a params object',
      () => tournamentEngine.validateMatchUpScore({ sets: impossible, matchUpFormat: fmt } as any),
    ],
  ])('%s', (_label, call) => {
    expect(call().isValid).toEqual(false);
  });
});
