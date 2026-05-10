import { generateFlightingStrategies } from '@Query/formatWizard/flightingStrategies';
import { expect, it, describe } from 'vitest';

// constants and types
import { WizardParticipant } from '@Types/formatWizardTypes';

function pool(ratings: number[]): WizardParticipant[] {
  return ratings.map((rating, i) => ({ participantId: `p${i}`, rating }));
}

describe('generateFlightingStrategies', () => {
  it('returns no strategies for fewer than 2 participants', () => {
    expect(generateFlightingStrategies(pool([]))).toEqual([]);
    expect(generateFlightingStrategies(pool([4]))).toEqual([]);
  });

  it('always emits a STAGGERED_SINGLE strategy with all participants in one flight', () => {
    const strategies = generateFlightingStrategies(pool([3, 4, 5, 6, 7, 8]));
    const staggered = strategies.find((s) => s.type === 'STAGGERED_SINGLE');
    expect(staggered).toBeDefined();
    expect(staggered?.flights).toHaveLength(1);
    expect(staggered?.flights[0].participantIds).toHaveLength(6);
  });

  it('EQUAL_COUNT splits into k contiguous tiers, top tier highest-rated', () => {
    // 16 participants → max 2 flights, so use k=2 instead of k=4
    const strategies = generateFlightingStrategies(pool([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]));
    const k2 = strategies.find((s) => s.type === 'EQUAL_COUNT' && s.variant === 'k=2');
    expect(k2).toBeDefined();
    expect(k2?.flights).toHaveLength(2);
    const topRatings = k2?.flights[0].ratings ?? [];
    const bottomRatings = k2?.flights.at(-1)?.ratings ?? [];
    expect(Math.min(...topRatings)).toBeGreaterThan(Math.max(...bottomRatings));
  });

  it('EQUAL_COUNT with k=2 emits for an 8-player pool only via STAGGERED_SINGLE', () => {
    // pool ≤8 caps maxFlights at 1, so k=2 is suppressed
    const strategies = generateFlightingStrategies(pool([3, 4, 5, 6, 7, 8, 9, 10]));
    expect(strategies.some((s) => s.type === 'EQUAL_COUNT' && s.variant === 'k=2')).toBe(false);
    expect(strategies.some((s) => s.type === 'STAGGERED_SINGLE')).toBe(true);
  });

  it('caps flight count by pool size — 32 players yields no strategy with > 4 flights', () => {
    const ratings: number[] = [];
    for (let i = 0; i < 32; i++) ratings.push(3 + i * 0.2);
    const strategies = generateFlightingStrategies(pool(ratings));
    for (const strategy of strategies) {
      if (strategy.type === 'STAGGERED_SINGLE') continue;
      expect(strategy.flights.length).toBeLessThanOrEqual(4);
    }
  });

  it('rejects flights smaller than the per-flight minimum (4)', () => {
    const ratings: number[] = [];
    for (let i = 0; i < 32; i++) ratings.push(3 + i * 0.2);
    const strategies = generateFlightingStrategies(pool(ratings));
    for (const strategy of strategies) {
      for (const flight of strategy.flights) {
        // STAGGERED_SINGLE returns the whole pool — always >= 4
        expect(flight.participantIds.length).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('EQUAL_BAND groups by rating band; each flight has at least the per-flight minimum', () => {
    // 16 evenly distributed players, width=1 → 2 bands of ~8 each.
    const ratings: number[] = [];
    for (let i = 0; i < 16; i++) ratings.push(3 + i * 0.15);
    const strategies = generateFlightingStrategies(pool(ratings));
    const bandStrategies = strategies.filter((s) => s.type === 'EQUAL_BAND');
    expect(bandStrategies.length).toBeGreaterThan(0);
    for (const strategy of bandStrategies) {
      for (const flight of strategy.flights) {
        expect(flight.participantIds.length).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('NATURAL_CLUSTER cuts at large gaps when present', () => {
    // 16-player pool with a large mid-pool gap; 8 low + 8 high.
    const ratings = [3, 3.05, 3.1, 3.15, 3.2, 3.25, 3.3, 3.35, 5, 5.05, 5.1, 5.15, 5.2, 5.25, 5.3, 5.35];
    const strategies = generateFlightingStrategies(pool(ratings));
    const cluster = strategies.find((s) => s.type === 'NATURAL_CLUSTER');
    expect(cluster).toBeDefined();
    expect((cluster?.flights ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
