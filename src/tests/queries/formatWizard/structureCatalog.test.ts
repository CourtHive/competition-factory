import { getStructureRecommendations } from '@Query/formatWizard/structureCatalog';
import { expect, it, describe } from 'vitest';

describe('getStructureRecommendations — appetite filtering', () => {
  it('NONE excludes consolation-bearing structures', () => {
    const recs = getStructureRecommendations({ flightSize: 8, consolationAppetite: 'NONE' });
    const kinds = new Set(recs.map((r) => r.kind));
    expect(kinds.has('SINGLE_ELIMINATION')).toBe(true);
    expect(kinds.has('FIRST_MATCH_LOSER_CONSOLATION')).toBe(false);
    expect(kinds.has('FIRST_ROUND_LOSER_CONSOLATION')).toBe(false);
    expect(kinds.has('COMPASS')).toBe(false);
  });

  it('LIGHT adds FMLC, RR_WITH_PLAYOFF, DE but not full cascading', () => {
    const recs = getStructureRecommendations({ flightSize: 8, consolationAppetite: 'LIGHT' });
    const kinds = new Set(recs.map((r) => r.kind));
    expect(kinds.has('FIRST_MATCH_LOSER_CONSOLATION')).toBe(true);
    expect(kinds.has('DOUBLE_ELIMINATION')).toBe(true);
    expect(kinds.has('FIRST_ROUND_LOSER_CONSOLATION')).toBe(false);
    expect(kinds.has('COMPASS')).toBe(false);
  });

  it('FULL includes all consolation kinds including COMPASS / ADAPTIVE / FRLC', () => {
    const recs = getStructureRecommendations({ flightSize: 8, consolationAppetite: 'FULL' });
    const kinds = new Set(recs.map((r) => r.kind));
    expect(kinds.has('FIRST_ROUND_LOSER_CONSOLATION')).toBe(true);
    expect(kinds.has('COMPASS')).toBe(true);
    expect(kinds.has('ADAPTIVE')).toBe(true);
    expect(kinds.has('STAGGERED_FRENCH')).toBe(true);
  });
});

describe('getStructureRecommendations — sizing', () => {
  it('Compass appears at sizes 7-8 and 13-16, not at size 4', () => {
    expect(
      getStructureRecommendations({ flightSize: 4, consolationAppetite: 'FULL' }).some((r) => r.kind === 'COMPASS'),
    ).toBe(false);
    expect(
      getStructureRecommendations({ flightSize: 8, consolationAppetite: 'FULL' }).some((r) => r.kind === 'COMPASS'),
    ).toBe(true);
    expect(
      getStructureRecommendations({ flightSize: 16, consolationAppetite: 'FULL' }).some((r) => r.kind === 'COMPASS'),
    ).toBe(true);
  });

  it('Lucky Draw skipped for power-of-two sizes', () => {
    const pow2 = getStructureRecommendations({ flightSize: 8, consolationAppetite: 'NONE' });
    expect(pow2.some((r) => r.kind === 'LUCKY_DRAW')).toBe(false);
    const nonPow2 = getStructureRecommendations({ flightSize: 7, consolationAppetite: 'NONE' });
    expect(nonPow2.some((r) => r.kind === 'LUCKY_DRAW')).toBe(true);
  });

  it('Round-robin emits a single-group variant when flight size is small', () => {
    const recs = getStructureRecommendations({ flightSize: 6, consolationAppetite: 'NONE' });
    const rr = recs.find((r) => r.kind === 'ROUND_ROBIN' && !r.variantId);
    expect(rr).toBeDefined();
    expect(rr?.minMatchesPerPlayer).toEqual(5);
    expect(rr?.totalMatches).toEqual(15);
  });

  it('Round-robin with playoff emits when flight divides into multiple groups', () => {
    const recs = getStructureRecommendations({ flightSize: 16, consolationAppetite: 'LIGHT' });
    expect(recs.some((r) => r.kind === 'ROUND_ROBIN_WITH_PLAYOFF')).toBe(true);
  });
});

describe('getStructureRecommendations — governance gating', () => {
  it('allowedDrawTypes whitelist filters out non-allowed kinds', () => {
    const recs = getStructureRecommendations({
      flightSize: 8,
      consolationAppetite: 'FULL',
      allowedDrawTypes: ['SINGLE_ELIMINATION', 'ROUND_ROBIN'],
    });
    const kinds = new Set(recs.map((r) => r.kind));
    expect(kinds.has('SINGLE_ELIMINATION')).toBe(true);
    expect(kinds.has('ROUND_ROBIN')).toBe(true);
    expect(kinds.has('COMPASS')).toBe(false);
    expect(kinds.has('FIRST_MATCH_LOSER_CONSOLATION')).toBe(false);
  });

  it('empty allowedDrawTypes whitelist behaves like no whitelist', () => {
    const withEmpty = getStructureRecommendations({
      flightSize: 8,
      consolationAppetite: 'NONE',
      allowedDrawTypes: [],
    });
    const withoutEmpty = getStructureRecommendations({ flightSize: 8, consolationAppetite: 'NONE' });
    expect(withEmpty).toEqual(withoutEmpty);
  });
});

describe('getStructureRecommendations — withdrawal-risk discount', () => {
  it('withdrawal-discounted effective floor is at or below the structural floor', () => {
    const recs = getStructureRecommendations({ flightSize: 16, consolationAppetite: 'FULL' });
    for (const rec of recs) {
      expect(rec.effectiveMinMatchesPerPlayer).toBeLessThanOrEqual(rec.minMatchesPerPlayer);
    }
  });

  it('round-robin has zero withdrawal risk', () => {
    const recs = getStructureRecommendations({ flightSize: 6, consolationAppetite: 'NONE' });
    const rr = recs.find((r) => r.kind === 'ROUND_ROBIN' && !r.variantId);
    expect(rr?.withdrawalRiskFactor).toEqual(0);
    expect(rr?.effectiveMinMatchesPerPlayer).toEqual(rr?.minMatchesPerPlayer);
  });
});
