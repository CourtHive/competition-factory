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
    const strategies = generateFlightingStrategies(pool([3, 4, 5, 6, 7, 8, 9, 10]));
    const k4 = strategies.find((s) => s.type === 'EQUAL_COUNT' && s.variant === 'k=4');
    expect(k4).toBeDefined();
    expect(k4?.flights).toHaveLength(4);
    const topRatings = k4?.flights[0].ratings ?? [];
    const bottomRatings = k4?.flights.at(-1)?.ratings ?? [];
    expect(Math.min(...topRatings)).toBeGreaterThan(Math.max(...bottomRatings));
  });

  it('EQUAL_COUNT with k=2 always emits when N >= 4', () => {
    const strategies = generateFlightingStrategies(pool([3, 4, 5, 6]));
    expect(strategies.some((s) => s.type === 'EQUAL_COUNT' && s.variant === 'k=2')).toBe(true);
  });

  it('EQUAL_BAND groups by rating band; each flight has at least 2 members', () => {
    const ratings = [3, 3.1, 3.4, 4.0, 4.2, 4.6, 5.0, 5.3];
    const strategies = generateFlightingStrategies(pool(ratings));
    const bandStrategies = strategies.filter((s) => s.type === 'EQUAL_BAND');
    expect(bandStrategies.length).toBeGreaterThan(0);
    for (const strategy of bandStrategies) {
      for (const flight of strategy.flights) {
        expect(flight.participantIds.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('NATURAL_CLUSTER cuts at large gaps when present', () => {
    const ratings = [3.0, 3.05, 3.1, 3.15, 5.0, 5.05, 5.1, 5.15];
    const strategies = generateFlightingStrategies(pool(ratings));
    const cluster = strategies.find((s) => s.type === 'NATURAL_CLUSTER');
    expect(cluster).toBeDefined();
    expect((cluster?.flights ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
