import { validateMatchUpScore } from '@Validators/validateMatchUpScore';
import { isMatchUpStatus } from '@Validators/isMatchUpStatus';
import { analyzeScore } from '@Query/matchUp/analyzeScore';
import { validateScore } from '@Validators/validateScore';
import { describe, expect, it } from 'vitest';

// constants
import { COMPLETED, RETIRED, validMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { INVALID_MATCHUP_STATUS } from '@Constants/errorConditionConstants';

/**
 * A validator refuses a matchUpStatus the engine does not know (CA, 2026-10-03).
 *
 * The validators took the status as `string` and compared it against constants, so an unknown status was
 * never an error, only a comparison that never matched: `'COMPLETD'` read as an open match, and a score
 * that cannot be a completed one was accepted as valid. The outcome pipeline and `setMatchUpState` already
 * refused an unknown status; the validators answered "valid" to the same input.
 */
const FORMAT = 'SET3-S:6/TB7';
const UNKNOWN = ['COMPLETD', 'completed', 'FINISHED', ''];
const sets = [
  { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 },
  { setNumber: 2, side1Score: 6, side2Score: 4, winningSide: 1 },
];

describe('isMatchUpStatus', () => {
  it('knows every valid matchUpStatus and nothing else', () => {
    // CONTROL: the list is not empty, so "every" is not vacuous
    expect(validMatchUpStatuses.length).toBeGreaterThan(10);
    for (const status of validMatchUpStatuses) expect(isMatchUpStatus(status)).toBe(true);
    for (const status of [...UNKNOWN, undefined, null, 1]) expect(isMatchUpStatus(status)).toBe(false);
  });
});

describe('validateScore', () => {
  it('refuses an unknown matchUpStatus, with or without sets', () => {
    for (const matchUpStatus of UNKNOWN) {
      let result: any = validateScore({ score: { sets }, matchUpFormat: FORMAT, matchUpStatus, winningSide: 1 });
      expect(result.error).toEqual(INVALID_MATCHUP_STATUS);
      result = validateScore({ score: { sets: [] }, matchUpStatus });
      expect(result.error).toEqual(INVALID_MATCHUP_STATUS);
    }
  });

  it('accepts the same score under a known status, and under none', () => {
    let result: any = validateScore({
      score: { sets },
      matchUpFormat: FORMAT,
      matchUpStatus: COMPLETED,
      winningSide: 1,
    });
    expect(result.valid).toBe(true);
    result = validateScore({ score: { sets }, matchUpFormat: FORMAT, winningSide: 1 });
    expect(result.valid).toBe(true);
    result = validateScore({ score: { sets: [] }, matchUpStatus: RETIRED });
    expect(result.valid).toBe(true);
  });
});

describe('validateMatchUpScore', () => {
  it('refuses an unknown matchUpStatus, with or without sets', () => {
    for (const matchUpStatus of UNKNOWN) {
      let result: any = validateMatchUpScore(sets, FORMAT, matchUpStatus);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('matchUpStatus');
      result = validateMatchUpScore([], FORMAT, matchUpStatus);
      expect(result.isValid).toBe(false);
    }
  });

  it('accepts the same sets under every known status, and under none', () => {
    expect(validateMatchUpScore(sets, FORMAT).isValid).toBe(true);
    for (const status of validMatchUpStatuses) expect(validateMatchUpScore([], FORMAT, status).isValid).toBe(true);
    expect(validateMatchUpScore(sets, FORMAT, COMPLETED).isValid).toBe(true);
  });
});

describe('analyzeScore', () => {
  it('calls a score invalid under an unknown matchUpStatus, and valid under a known one', () => {
    for (const matchUpStatus of UNKNOWN) {
      const result = analyzeScore({ score: { sets }, matchUpFormat: FORMAT, matchUpStatus, winningSide: 1 });
      expect(result.valid).toBe(false);
    }
    // CONTROL: the identical call with a known status is valid, so the refusal is the status alone
    const result = analyzeScore({ score: { sets }, matchUpFormat: FORMAT, matchUpStatus: COMPLETED, winningSide: 1 });
    expect(result.valid).toBe(true);
  });
});
