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

  it('FULL includes all consolation kinds including COMPASS / ADAPTIVE / FEED_IN', () => {
    const recs = getStructureRecommendations({ flightSize: 8, consolationAppetite: 'FULL' });
    const kinds = new Set(recs.map((r) => r.kind));
    expect(kinds.has('FIRST_ROUND_LOSER_CONSOLATION')).toBe(true);
    expect(kinds.has('COMPASS')).toBe(true);
    expect(kinds.has('ADAPTIVE')).toBe(true);
    expect(kinds.has('FEED_IN')).toBe(true);
  });
});

describe('getStructureRecommendations — FEED_IN family', () => {
  it('only emits FEED_IN when singleFlight is true', () => {
    const single = getStructureRecommendations({ flightSize: 16, consolationAppetite: 'NONE', singleFlight: true });
    const multi = getStructureRecommendations({ flightSize: 16, consolationAppetite: 'NONE', singleFlight: false });
    expect(single.some((r) => r.kind === 'FEED_IN')).toBe(true);
    expect(multi.some((r) => r.kind === 'FEED_IN')).toBe(false);
  });

  it('emits the bare FEED_IN variant plus FIC family at flightSize 16', () => {
    const recs = getStructureRecommendations({ flightSize: 16, consolationAppetite: 'NONE', singleFlight: true });
    const variants = recs.filter((r) => r.kind === 'FEED_IN').map((r) => r.variantId);
    expect(variants.some((v) => v?.startsWith('FEED_IN_'))).toBe(true);
    expect(variants).toContain('FIC_R16');
    expect(variants).toContain('FIC');
    expect(variants).toContain('MFIC');
    expect(variants).toContain('FIC_QF');
    expect(variants).toContain('FIC_SF');
  });

  it('FEED_IN minMatchesPerPlayer is integer', () => {
    const recs = getStructureRecommendations({ flightSize: 16, consolationAppetite: 'NONE', singleFlight: true });
    for (const rec of recs.filter((r) => r.kind === 'FEED_IN')) {
      expect(Number.isInteger(rec.minMatchesPerPlayer)).toBe(true);
    }
  });
});

describe('getStructureRecommendations — voluntaryConsolation', () => {
  it('emits a VC twin per recommendation when voluntaryConsolation is true', () => {
    const bare = getStructureRecommendations({ flightSize: 8, consolationAppetite: 'LIGHT', singleFlight: true });
    const withVc = getStructureRecommendations({
      flightSize: 8,
      consolationAppetite: 'LIGHT',
      singleFlight: true,
      voluntaryConsolation: true,
    });
    expect(withVc.length).toEqual(bare.length * 2);
    expect(withVc.filter((r) => r.voluntaryConsolation).length).toEqual(bare.length);
    expect(withVc.filter((r) => !r.voluntaryConsolation).length).toEqual(bare.length);
  });

  it('VC twin does not change minMatchesPerPlayer (VC is opt-in)', () => {
    const recs = getStructureRecommendations({
      flightSize: 8,
      consolationAppetite: 'LIGHT',
      singleFlight: true,
      voluntaryConsolation: true,
    });
    const se = recs.find((r) => r.kind === 'SINGLE_ELIMINATION' && !r.voluntaryConsolation);
    const seVc = recs.find((r) => r.kind === 'SINGLE_ELIMINATION' && r.voluntaryConsolation);
    expect(se?.minMatchesPerPlayer).toEqual(seVc?.minMatchesPerPlayer);
    expect(seVc?.totalMatches ?? 0).toBeGreaterThan(se?.totalMatches ?? 0);
  });

  it('VC twin variantId carries _VC suffix', () => {
    const recs = getStructureRecommendations({
      flightSize: 8,
      consolationAppetite: 'NONE',
      singleFlight: true,
      voluntaryConsolation: true,
    });
    const twins = recs.filter((r) => r.voluntaryConsolation);
    for (const twin of twins) {
      expect(twin.variantId?.endsWith('VC')).toBe(true);
    }
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

describe('getStructureRecommendations — minMatchesPerPlayer is integer', () => {
  it('every recommendation exposes an integer structural floor', () => {
    const recs = getStructureRecommendations({ flightSize: 16, consolationAppetite: 'FULL' });
    for (const rec of recs) {
      expect(Number.isInteger(rec.minMatchesPerPlayer)).toBe(true);
    }
  });

  it('FMLC structural floor is 2 (consolation guarantees a second match)', () => {
    const recs = getStructureRecommendations({ flightSize: 16, consolationAppetite: 'LIGHT' });
    const fmlc = recs.find((r) => r.kind === 'FIRST_MATCH_LOSER_CONSOLATION');
    expect(fmlc?.minMatchesPerPlayer).toEqual(2);
  });

  it('round-robin has zero withdrawal risk', () => {
    const recs = getStructureRecommendations({ flightSize: 6, consolationAppetite: 'NONE' });
    const rr = recs.find((r) => r.kind === 'ROUND_ROBIN' && !r.variantId);
    expect(rr?.withdrawalRiskFactor).toEqual(0);
  });
});
