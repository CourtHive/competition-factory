import { afterEach, describe, expect, it } from 'vitest';

import { policyRegistry } from '@Global/policyRegistry';

// constants and types
import { POLICY_TYPE_RANKING_POINTS, POLICY_TYPE_SCORING } from '@Constants/policyConstants';

const sampleDefinition = { awardProfiles: [{ profileName: 'sample' }] };
const otherDefinition = { awardProfiles: [{ profileName: 'other' }] };

describe('policyRegistry', () => {
  afterEach(() => policyRegistry.clear());

  it('returns undefined for unknown lookups', () => {
    expect(policyRegistry.lookup({ policyType: POLICY_TYPE_RANKING_POINTS, name: 'MISSING' })).toBeUndefined();
  });

  it('roundtrips register and lookup', () => {
    policyRegistry.register({
      policyType: POLICY_TYPE_RANKING_POINTS,
      definition: sampleDefinition,
      name: 'SAMPLE',
    });
    const looked = policyRegistry.lookup({ policyType: POLICY_TYPE_RANKING_POINTS, name: 'SAMPLE' });
    expect(looked).toEqual(sampleDefinition);
  });

  it('isolates entries across policyTypes', () => {
    policyRegistry.register({ policyType: POLICY_TYPE_RANKING_POINTS, definition: sampleDefinition, name: 'X' });
    policyRegistry.register({ policyType: POLICY_TYPE_SCORING, definition: otherDefinition, name: 'X' });
    expect(policyRegistry.lookup({ policyType: POLICY_TYPE_RANKING_POINTS, name: 'X' })).toEqual(sampleDefinition);
    expect(policyRegistry.lookup({ policyType: POLICY_TYPE_SCORING, name: 'X' })).toEqual(otherDefinition);
  });

  it('replaces same-version entries on re-register', () => {
    policyRegistry.register({ policyType: POLICY_TYPE_RANKING_POINTS, definition: sampleDefinition, name: 'R' });
    policyRegistry.register({ policyType: POLICY_TYPE_RANKING_POINTS, definition: otherDefinition, name: 'R' });
    expect(policyRegistry.lookup({ policyType: POLICY_TYPE_RANKING_POINTS, name: 'R' })).toEqual(otherDefinition);
    expect(policyRegistry.list({ policyType: POLICY_TYPE_RANKING_POINTS })).toHaveLength(1);
  });

  it('stores multiple versions independently and returns latest by default', () => {
    const v1 = { awardProfiles: [{ profileName: 'v1' }] };
    const v2 = { awardProfiles: [{ profileName: 'v2' }] };
    policyRegistry.register({ policyType: POLICY_TYPE_RANKING_POINTS, definition: v1, name: 'V', version: '1.0.0' });
    policyRegistry.register({ policyType: POLICY_TYPE_RANKING_POINTS, definition: v2, name: 'V', version: '2.0.0' });

    expect(policyRegistry.lookup({ policyType: POLICY_TYPE_RANKING_POINTS, name: 'V' })).toEqual(v2);
    expect(policyRegistry.lookup({ policyType: POLICY_TYPE_RANKING_POINTS, name: 'V', version: '1.0.0' })).toEqual(v1);
    expect(policyRegistry.lookup({ policyType: POLICY_TYPE_RANKING_POINTS, name: 'V', version: '2.0.0' })).toEqual(v2);
    expect(
      policyRegistry.lookup({ policyType: POLICY_TYPE_RANKING_POINTS, name: 'V', version: '9.9.9' }),
    ).toBeUndefined();
  });

  it('list returns all entries when called without filter', () => {
    policyRegistry.register({ policyType: POLICY_TYPE_RANKING_POINTS, definition: sampleDefinition, name: 'A' });
    policyRegistry.register({ policyType: POLICY_TYPE_RANKING_POINTS, definition: otherDefinition, name: 'B' });
    policyRegistry.register({ policyType: POLICY_TYPE_SCORING, definition: sampleDefinition, name: 'C' });

    expect(policyRegistry.list()).toHaveLength(3);
    expect(policyRegistry.list({ policyType: POLICY_TYPE_RANKING_POINTS })).toHaveLength(2);
    expect(policyRegistry.list({ policyType: POLICY_TYPE_SCORING })).toHaveLength(1);
  });

  it('clear() with no args wipes everything', () => {
    policyRegistry.register({ policyType: POLICY_TYPE_RANKING_POINTS, definition: sampleDefinition, name: 'A' });
    policyRegistry.register({ policyType: POLICY_TYPE_SCORING, definition: sampleDefinition, name: 'B' });
    policyRegistry.clear();
    expect(policyRegistry.list()).toHaveLength(0);
  });

  it('clear({ policyType }) removes only that type', () => {
    policyRegistry.register({ policyType: POLICY_TYPE_RANKING_POINTS, definition: sampleDefinition, name: 'A' });
    policyRegistry.register({ policyType: POLICY_TYPE_SCORING, definition: sampleDefinition, name: 'B' });
    policyRegistry.clear({ policyType: POLICY_TYPE_RANKING_POINTS });
    expect(policyRegistry.list({ policyType: POLICY_TYPE_RANKING_POINTS })).toHaveLength(0);
    expect(policyRegistry.list({ policyType: POLICY_TYPE_SCORING })).toHaveLength(1);
  });

  it('clear({ policyType, name }) removes a single entry across versions', () => {
    policyRegistry.register({
      policyType: POLICY_TYPE_RANKING_POINTS,
      definition: sampleDefinition,
      name: 'A',
      version: '1',
    });
    policyRegistry.register({
      policyType: POLICY_TYPE_RANKING_POINTS,
      definition: otherDefinition,
      name: 'A',
      version: '2',
    });
    policyRegistry.register({ policyType: POLICY_TYPE_RANKING_POINTS, definition: sampleDefinition, name: 'B' });

    policyRegistry.clear({ policyType: POLICY_TYPE_RANKING_POINTS, name: 'A' });
    expect(policyRegistry.lookup({ policyType: POLICY_TYPE_RANKING_POINTS, name: 'A' })).toBeUndefined();
    expect(policyRegistry.lookup({ policyType: POLICY_TYPE_RANKING_POINTS, name: 'A', version: '1' })).toBeUndefined();
    expect(policyRegistry.lookup({ policyType: POLICY_TYPE_RANKING_POINTS, name: 'B' })).toEqual(sampleDefinition);
  });

  it('clear({ name }) removes the entry under every policyType', () => {
    policyRegistry.register({ policyType: POLICY_TYPE_RANKING_POINTS, definition: sampleDefinition, name: 'SHARED' });
    policyRegistry.register({ policyType: POLICY_TYPE_SCORING, definition: otherDefinition, name: 'SHARED' });
    policyRegistry.clear({ name: 'SHARED' });
    expect(policyRegistry.list()).toHaveLength(0);
  });
});
