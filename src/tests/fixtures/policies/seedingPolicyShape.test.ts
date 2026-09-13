import { POLICY_SEEDING_DEFAULT } from '@Fixtures/policies/POLICY_SEEDING_DEFAULT';
import { POLICY_SEEDING_BYES } from '@Fixtures/policies/POLICY_SEEDING_BYES';
import { POLICY_SEEDING_ITF } from '@Fixtures/policies/POLICY_SEEDING_ITF';
import { POLICY_TYPE_SEEDING } from '@Constants/policyConstants';
import { describe, expect, it } from 'vitest';

/**
 * `SeedingPolicy` describes a shape the factory READS but never declared — `PolicyDefinitions`
 * types every policy as `{ [key: string]: any }`, so `seedingProfile.drawTypes` was consumed by
 * `validateAndDeriveDrawValues` with nothing asserting its shape. Consumers that needed it wrote
 * their own mirror, and a mirror drifts.
 *
 * THE COMPILE-TIME HALF IS NOT HERE. `tsconfig.json` excludes `src/**\/*.test.ts`, so `tsc --noEmit`
 * never type-checks this file and a `satisfies` assertion written here would be decorative — it
 * would compile clean with `positioning: 999`. The three fixtures therefore carry
 * `satisfies { [POLICY_TYPE_SEEDING]: SeedingPolicy }` on their own declarations, where
 * `verify:types` does check them; a bad positioning value and a misspelled policy field were both
 * confirmed to fail there.
 *
 * What this file adds is the RUNTIME half: that the values the readers branch on are the values
 * actually shipped.
 */
describe('the shipped seeding policies carry the values their readers branch on', () => {
  it('POLICY_SEEDING_DEFAULT resolves round robins to WATERFALL via a per-drawType override', () => {
    const profile = POLICY_SEEDING_DEFAULT[POLICY_TYPE_SEEDING].seedingProfile;
    // validateAndDeriveDrawValues consults drawTypes[drawType] BEFORE the outer profile.
    expect(profile.drawTypes.ROUND_ROBIN).toEqual({ positioning: 'WATERFALL' });
    expect(profile.drawTypes.ROUND_ROBIN_WITH_PLAYOFF).toEqual({ positioning: 'WATERFALL' });
    expect(profile.positioning).toBe('SEPARATE');
  });

  it('POLICY_SEEDING_ITF is CLUSTER with no overrides', () => {
    const policy = POLICY_SEEDING_ITF[POLICY_TYPE_SEEDING];
    expect(policy.seedingProfile).toEqual({ positioning: 'CLUSTER' });
  });

  it('POLICY_SEEDING_BYES sets the flag getSeedOrderedByePositions reads', () => {
    expect(POLICY_SEEDING_BYES[POLICY_TYPE_SEEDING].containerByesIgnoreSeeding).toBe(true);
  });

  it('every shipped positioning is a SeedingProfileEnum member', () => {
    const members = ['ADJACENT', 'CLUSTER', 'SEPARATE', 'WATERFALL'];
    const shipped = [
      POLICY_SEEDING_DEFAULT[POLICY_TYPE_SEEDING].seedingProfile.positioning,
      POLICY_SEEDING_ITF[POLICY_TYPE_SEEDING].seedingProfile.positioning,
      POLICY_SEEDING_BYES[POLICY_TYPE_SEEDING].seedingProfile.positioning,
      ...Object.values(POLICY_SEEDING_DEFAULT[POLICY_TYPE_SEEDING].seedingProfile.drawTypes).map(
        (o: any) => o.positioning,
      ),
    ];
    expect(shipped.length).toBe(5); // the sweep looked at something
    for (const value of shipped) expect(members).toContain(value);
  });
});
