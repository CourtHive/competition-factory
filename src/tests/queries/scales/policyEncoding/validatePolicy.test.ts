/**
 * Tests for the validatePolicy helper itself.
 *
 * The helper is exercised indirectly by every federation-policy spec in this
 * folder, but the failure branch (errorsText generation) and the date-time
 * format callback's object-vs-string fork need direct coverage.
 */
import { describe, expect, it } from 'vitest';

import { POLICY_RANKING_POINTS_CTS } from '@Tests/fixtures/policies/POLICY_RANKING_POINTS_CTS';
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { dateTimeFormat, validateRankingPolicy } from './validatePolicy';

describe('validateRankingPolicy', () => {
  it('returns valid=true and an empty errorsText for a known-valid federation policy', () => {
    const result = validateRankingPolicy(POLICY_RANKING_POINTS_CTS);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeFalsy();
    expect(result.errorsText).toBe('');
  });

  it('returns valid=false and a populated errorsText for a malformed policy', () => {
    // Garbage shape that no JSON-schema for ranking policies could accept —
    // forces the ajv.errorsText branch.
    const result = validateRankingPolicy({
      [POLICY_TYPE_RANKING_POINTS]: { policyName: 123, rankingPoints: 'not-an-object' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toBeTruthy();
    expect(typeof result.errorsText).toBe('string');
    expect(result.errorsText.length).toBeGreaterThan(0);
  });

  it('returns the inner policy on the result for assertion convenience', () => {
    const inner = { policyName: 'X', rankingPoints: { awardProfiles: [] } };
    const result = validateRankingPolicy({ [POLICY_TYPE_RANKING_POINTS]: inner });
    expect(result.policy).toBe(inner);
  });
});

describe('dateTimeFormat (Ajv format callback)', () => {
  it('accepts an ISO 8601 string', () => {
    expect(dateTimeFormat('2026-01-15T12:00:00Z')).toBe(true);
  });

  it('accepts a Date instance by stringifying via .toISOString()', () => {
    expect(dateTimeFormat(new Date('2026-01-15T12:00:00Z'))).toBe(true);
  });

  it('rejects a string that does not parse as a date', () => {
    expect(dateTimeFormat('not a date')).toBe(false);
  });
});
