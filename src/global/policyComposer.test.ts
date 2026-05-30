/**
 * Unit tests for `policyComposer` — fluent merger over `policyRegistry`.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { policyRegistry } from './policyRegistry';
import { policyComposer } from './policyComposer';

const POLICY_TYPE_SEEDING = 'seeding';
const POLICY_TYPE_SCORING = 'scoring';

const stockUstaSeeding = {
  validSeedPositions: { ignore: true },
  duplicateSeedNumbers: true,
  drawSizeProgression: true,
  seedingProfile: {
    drawTypes: {
      ROUND_ROBIN_WITH_PLAYOFF: { positioning: 'WATERFALL' },
      ROUND_ROBIN: { positioning: 'WATERFALL' },
    },
    positioning: 'SEPARATE',
  },
  policyName: 'USTA SEEDING',
  seedsCountThresholds: [
    { drawSize: 4, minimumParticipantCount: 3, seedsCount: 2 },
    { drawSize: 16, minimumParticipantCount: 12, seedsCount: 4 },
    { drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 },
  ],
};

describe('policyComposer — construction + build', () => {
  it('returns an empty wrapped object when nothing has been added', () => {
    const result: any = policyComposer(POLICY_TYPE_SEEDING).build();
    expect(result).toEqual({ [POLICY_TYPE_SEEDING]: {} });
  });

  it('returns a raw {} when no policyType was supplied', () => {
    const result: any = policyComposer().build();
    expect(result).toEqual({});
  });
});

describe('policyComposer.extend', () => {
  it('accepts the WRAPPED form and unwraps it', () => {
    const result: any = policyComposer(POLICY_TYPE_SEEDING)
      .extend({ [POLICY_TYPE_SEEDING]: stockUstaSeeding })
      .build();
    expect(result[POLICY_TYPE_SEEDING]).toEqual(stockUstaSeeding);
  });

  it('accepts the RAW inner form too', () => {
    const result: any = policyComposer(POLICY_TYPE_SEEDING).extend(stockUstaSeeding).build();
    expect(result[POLICY_TYPE_SEEDING]).toEqual(stockUstaSeeding);
  });

  it('does NOT mutate the inputs', () => {
    const before = JSON.parse(JSON.stringify(stockUstaSeeding));
    policyComposer(POLICY_TYPE_SEEDING).extend(stockUstaSeeding).set('policyName', 'MUTATED').build();
    expect(stockUstaSeeding).toEqual(before);
  });

  it('deep-merges two extend() calls — later wins on conflict', () => {
    const result: any = policyComposer(POLICY_TYPE_SEEDING)
      .extend({
        policyName: 'A',
        seedingProfile: { positioning: 'SEPARATE', drawTypes: { RR: { positioning: 'WATERFALL' } } },
      })
      .extend({ policyName: 'B', seedingProfile: { drawTypes: { SE: { positioning: 'CLUSTER' } } } })
      .build();
    expect(result[POLICY_TYPE_SEEDING].policyName).toBe('B');
    expect(result[POLICY_TYPE_SEEDING].seedingProfile.positioning).toBe('SEPARATE'); // unchanged from first
    expect(result[POLICY_TYPE_SEEDING].seedingProfile.drawTypes.RR).toEqual({ positioning: 'WATERFALL' });
    expect(result[POLICY_TYPE_SEEDING].seedingProfile.drawTypes.SE).toEqual({ positioning: 'CLUSTER' });
  });

  it('replaces arrays (does not concat)', () => {
    const result: any = policyComposer(POLICY_TYPE_SEEDING)
      .extend({ seedsCountThresholds: [{ drawSize: 4 }, { drawSize: 8 }] })
      .extend({ seedsCountThresholds: [{ drawSize: 32 }] })
      .build();
    expect(result[POLICY_TYPE_SEEDING].seedsCountThresholds).toEqual([{ drawSize: 32 }]);
  });
});

describe('policyComposer.set', () => {
  it('sets a top-level scalar', () => {
    const result: any = policyComposer(POLICY_TYPE_SEEDING)
      .extend(stockUstaSeeding)
      .set('policyName', 'CTS SEEDING')
      .build();
    expect(result[POLICY_TYPE_SEEDING].policyName).toBe('CTS SEEDING');
  });

  it('sets a deep dot-path without losing siblings', () => {
    const result: any = policyComposer(POLICY_TYPE_SEEDING)
      .extend(stockUstaSeeding)
      .set('seedingProfile.positioning', 'CLUSTER')
      .build();
    expect(result[POLICY_TYPE_SEEDING].seedingProfile.positioning).toBe('CLUSTER');
    expect(result[POLICY_TYPE_SEEDING].seedingProfile.drawTypes).toEqual(stockUstaSeeding.seedingProfile.drawTypes);
  });

  it('creates intermediate objects when the path does not exist yet', () => {
    const result: any = policyComposer(POLICY_TYPE_SEEDING).set('a.b.c.d', 42).build();
    expect(result[POLICY_TYPE_SEEDING]).toEqual({ a: { b: { c: { d: 42 } } } });
  });

  it('uses arrays for numeric next-segments when creating intermediates', () => {
    const result: any = policyComposer(POLICY_TYPE_SEEDING).set('thresholds.0.drawSize', 4).build();
    expect(result[POLICY_TYPE_SEEDING].thresholds).toEqual([{ drawSize: 4 }]);
  });

  it('returns a NEW composer (immutability)', () => {
    const base = policyComposer(POLICY_TYPE_SEEDING).extend(stockUstaSeeding);
    const branchA = base.set('policyName', 'A');
    const branchB = base.set('policyName', 'B');
    expect((branchA.build() as any)[POLICY_TYPE_SEEDING].policyName).toBe('A');
    expect((branchB.build() as any)[POLICY_TYPE_SEEDING].policyName).toBe('B');
    expect((base.build() as any)[POLICY_TYPE_SEEDING].policyName).toBe('USTA SEEDING');
  });
});

describe('policyComposer.merge', () => {
  it('deep-merges a fragment at a path', () => {
    const result: any = policyComposer(POLICY_TYPE_SEEDING)
      .extend(stockUstaSeeding)
      .merge('seedingProfile.drawTypes', { SINGLE_ELIMINATION: { positioning: 'CLUSTER' } })
      .build();
    const drawTypes = result[POLICY_TYPE_SEEDING].seedingProfile.drawTypes;
    expect(drawTypes.ROUND_ROBIN).toEqual({ positioning: 'WATERFALL' });
    expect(drawTypes.SINGLE_ELIMINATION).toEqual({ positioning: 'CLUSTER' });
  });

  it('treats missing target as a plain set', () => {
    const result: any = policyComposer(POLICY_TYPE_SEEDING).merge('newSection.subsection', { added: true }).build();
    expect(result[POLICY_TYPE_SEEDING].newSection.subsection).toEqual({ added: true });
  });
});

describe('policyComposer.unset', () => {
  it('removes a top-level key', () => {
    const result: any = policyComposer(POLICY_TYPE_SEEDING).extend(stockUstaSeeding).unset('policyName').build();
    expect(result[POLICY_TYPE_SEEDING].policyName).toBeUndefined();
    expect(result[POLICY_TYPE_SEEDING].seedingProfile).toBeDefined();
  });

  it('removes a deep key without disturbing siblings', () => {
    const result: any = policyComposer(POLICY_TYPE_SEEDING)
      .extend(stockUstaSeeding)
      .unset('seedingProfile.positioning')
      .build();
    expect(result[POLICY_TYPE_SEEDING].seedingProfile.positioning).toBeUndefined();
    expect(result[POLICY_TYPE_SEEDING].seedingProfile.drawTypes).toBeDefined();
  });

  it('splices an array element', () => {
    const result: any = policyComposer(POLICY_TYPE_SEEDING)
      .extend(stockUstaSeeding)
      .unset('seedsCountThresholds.1')
      .build();
    const remaining = result[POLICY_TYPE_SEEDING].seedsCountThresholds;
    expect(remaining).toHaveLength(2);
    expect(remaining[0].drawSize).toBe(4);
    expect(remaining[1].drawSize).toBe(32);
  });

  it('is a no-op when the path does not exist', () => {
    const result: any = policyComposer(POLICY_TYPE_SEEDING)
      .extend(stockUstaSeeding)
      .unset('seedingProfile.nonexistent.deep')
      .build();
    expect(result[POLICY_TYPE_SEEDING].seedingProfile.positioning).toBe('SEPARATE');
  });

  // Walks through an array index to reach a sub-key, exercises the array
  // intermediate branch in unsetRecursive (sibling array entries preserved).
  it('removes a key inside an array element without splicing the element', () => {
    const result: any = policyComposer(POLICY_TYPE_SEEDING)
      .extend(stockUstaSeeding)
      .unset('seedsCountThresholds.1.minimumParticipantCount')
      .build();
    const thresholds = result[POLICY_TYPE_SEEDING].seedsCountThresholds;
    expect(thresholds).toHaveLength(3);
    expect(thresholds[1].drawSize).toBe(16);
    expect(thresholds[1].seedsCount).toBe(4);
    expect(thresholds[1].minimumParticipantCount).toBeUndefined();
    expect(thresholds[0].minimumParticipantCount).toBe(3);
    expect(thresholds[2].minimumParticipantCount).toBe(24);
  });
});

describe('policyComposer.get', () => {
  it('reads from the current accumulator', () => {
    const composer = policyComposer(POLICY_TYPE_SEEDING).extend(stockUstaSeeding);
    expect(composer.get('policyName')).toBe('USTA SEEDING');
    expect(composer.get('seedingProfile.positioning')).toBe('SEPARATE');
    expect(composer.get('seedsCountThresholds.1.drawSize')).toBe(16);
  });

  it('returns undefined for missing paths', () => {
    expect(policyComposer(POLICY_TYPE_SEEDING).get('does.not.exist')).toBeUndefined();
  });
});

describe('policyComposer.from (registry integration)', () => {
  afterEach(() => policyRegistry.clear());

  it('loads from the registry by name', () => {
    policyRegistry.register({ policyType: POLICY_TYPE_SEEDING, name: 'USTA_DEFAULT', definition: stockUstaSeeding });
    const result: any = policyComposer(POLICY_TYPE_SEEDING)
      .from({ name: 'USTA_DEFAULT' })
      .set('policyName', 'CTS SEEDING')
      .build();
    expect(result[POLICY_TYPE_SEEDING].policyName).toBe('CTS SEEDING');
    expect(result[POLICY_TYPE_SEEDING].seedingProfile).toEqual(stockUstaSeeding.seedingProfile);
  });

  it('honors version when supplied', () => {
    policyRegistry.register({
      policyType: POLICY_TYPE_SEEDING,
      name: 'X',
      version: '2025',
      definition: { policyName: 'v2025' },
    });
    policyRegistry.register({
      policyType: POLICY_TYPE_SEEDING,
      name: 'X',
      version: '2026',
      definition: { policyName: 'v2026' },
    });
    const v2025: any = policyComposer(POLICY_TYPE_SEEDING).from({ name: 'X', version: '2025' }).build();
    expect(v2025[POLICY_TYPE_SEEDING].policyName).toBe('v2025');
  });

  it('throws on a missing entry', () => {
    expect(() => policyComposer(POLICY_TYPE_SEEDING).from({ name: 'MISSING' })).toThrow(/MISSING/);
  });

  // Distinct error path: the not-found message embeds `version` when supplied.
  it('throws on a missing entry and surfaces the version in the message', () => {
    expect(() => policyComposer(POLICY_TYPE_SEEDING).from({ name: 'MISSING', version: '2099' })).toThrow(
      /version 2099/,
    );
  });

  it('throws when called on an untyped composer', () => {
    expect(() => policyComposer().from({ name: 'X' })).toThrow(/policyType/);
  });
});

describe('policyComposer.register (registry integration)', () => {
  afterEach(() => policyRegistry.clear());

  it('builds AND registers the result, returning the wrapped value', () => {
    const wrapped: any = policyComposer(POLICY_TYPE_SEEDING)
      .extend(stockUstaSeeding)
      .set('policyName', 'CTS SEEDING')
      .register({ name: 'CTS_DEFAULT' });

    expect(wrapped[POLICY_TYPE_SEEDING].policyName).toBe('CTS SEEDING');

    const looked: any = policyRegistry.lookup({ policyType: POLICY_TYPE_SEEDING, name: 'CTS_DEFAULT' });
    expect(looked.policyName).toBe('CTS SEEDING');
    expect(looked.seedingProfile.positioning).toBe('SEPARATE');
  });

  it('throws when called on an untyped composer', () => {
    expect(() => policyComposer().register({ name: 'X' })).toThrow(/policyType/);
  });
});

describe('policyComposer — federation override worked example', () => {
  // This is the test that proves the pitch: "USTA seeding but with CLUSTER
  // positioning and a custom drawSize=128 threshold tweak" — expressed as
  // three composer lines instead of two ~25-line hand-edited objects.
  it('expresses CTS seeding as a delta over USTA SEEDING', () => {
    const ctsSeeding: any = policyComposer(POLICY_TYPE_SEEDING)
      .extend(stockUstaSeeding)
      .set('policyName', 'CTS SEEDING')
      .set('seedingProfile.positioning', 'CLUSTER')
      .build();

    // What changed
    expect(ctsSeeding[POLICY_TYPE_SEEDING].policyName).toBe('CTS SEEDING');
    expect(ctsSeeding[POLICY_TYPE_SEEDING].seedingProfile.positioning).toBe('CLUSTER');

    // What did NOT change — drawTypes overrides are preserved
    expect(ctsSeeding[POLICY_TYPE_SEEDING].seedingProfile.drawTypes.ROUND_ROBIN).toEqual({ positioning: 'WATERFALL' });
    expect(ctsSeeding[POLICY_TYPE_SEEDING].seedingProfile.drawTypes.ROUND_ROBIN_WITH_PLAYOFF).toEqual({
      positioning: 'WATERFALL',
    });
    expect(ctsSeeding[POLICY_TYPE_SEEDING].seedsCountThresholds).toEqual(stockUstaSeeding.seedsCountThresholds);
    expect(ctsSeeding[POLICY_TYPE_SEEDING].validSeedPositions).toEqual({ ignore: true });
    expect(ctsSeeding[POLICY_TYPE_SEEDING].duplicateSeedNumbers).toBe(true);
    expect(ctsSeeding[POLICY_TYPE_SEEDING].drawSizeProgression).toBe(true);

    // The base USTA policy did NOT mutate
    expect(stockUstaSeeding.policyName).toBe('USTA SEEDING');
    expect(stockUstaSeeding.seedingProfile.positioning).toBe('SEPARATE');
  });
});

describe('policyComposer — composing without a policyType wrapper', () => {
  it('returns the raw inner object on build()', () => {
    const fragment: any = policyComposer()
      .extend({ a: 1, b: { c: 2 } })
      .set('b.c', 3)
      .build();
    expect(fragment).toEqual({ a: 1, b: { c: 3 } });
  });

  it('works with separate composers and feeds the unwrapped fragment into another composer', () => {
    const fragment = policyComposer().set('drawTypes.ROUND_ROBIN.positioning', 'WATERFALL').build();
    const result: any = policyComposer(POLICY_TYPE_SCORING).merge('seedingProfile', fragment).build();
    expect(result[POLICY_TYPE_SCORING].seedingProfile.drawTypes.ROUND_ROBIN.positioning).toBe('WATERFALL');
  });

  // An untyped composer treats every extend() input as raw — even objects
  // shaped like wrapped policies — because there's no policyType to detect.
  it('does NOT auto-unwrap policy-type-shaped inputs when untyped', () => {
    const fragment: any = policyComposer()
      .extend({ [POLICY_TYPE_SEEDING]: { policyName: 'A' } })
      .build();
    expect(fragment).toEqual({ [POLICY_TYPE_SEEDING]: { policyName: 'A' } });
  });

  it('reads back values via get() on an untyped composer', () => {
    const composer = policyComposer().extend({ nested: { value: 42 } });
    expect(composer.get('nested.value')).toBe(42);
    expect(composer.get('nested.missing')).toBeUndefined();
  });
});

// Empty-path inputs aren't a documented use case but the guard branches in
// splitPath / setAtPath / unsetAtPath need exercising; the no-op behavior
// here is the right contract (returns the existing state unchanged).
describe('policyComposer — empty-path edge cases', () => {
  it('treats set(empty, …) as a no-op', () => {
    const result: any = policyComposer(POLICY_TYPE_SEEDING).extend({ a: 1 }).set('', 999).build();
    expect(result[POLICY_TYPE_SEEDING]).toEqual({ a: 1 });
  });

  it('treats unset(empty) as a no-op', () => {
    const result: any = policyComposer(POLICY_TYPE_SEEDING).extend({ a: 1 }).unset('').build();
    expect(result[POLICY_TYPE_SEEDING]).toEqual({ a: 1 });
  });

  it('treats get(empty) as a read of the whole accumulator', () => {
    const composer = policyComposer(POLICY_TYPE_SEEDING).extend({ a: 1, b: 2 });
    expect(composer.get('')).toEqual({ a: 1, b: 2 });
  });
});
