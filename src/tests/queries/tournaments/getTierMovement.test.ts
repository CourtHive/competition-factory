import { getTierMovement } from '@Query/tournaments/getTierMovement';
import { expect, it, describe } from 'vitest';

// constants and types
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { TierMovementEnum } from '@Types/tournamentTypes';

const ALTA = 'ALTA';

const tier = (value: string, numericRank?: number) => ({ system: ALTA, value, numericRank });

// a federation's tier vocabulary is ordered by policy, not by the string itself:
// "A1" is not obviously above "AA" to anyone but the federation
const policyDefinitions: any = {
  [POLICY_TYPE_RANKING_POINTS]: {
    tierToLevel: { [ALTA]: { AAA: 1, AA: 2, A1: 3, A2: 4, B: 5 } },
  },
};

describe('getTierMovement', () => {
  it('reports promotion when the later tier is more prestigious', () => {
    const result: any = getTierMovement({ fromTier: tier('A1'), toTier: tier('AA'), policyDefinitions });
    expect(result.movement).toEqual(TierMovementEnum.PROMOTED);
    expect(result.fromLevel).toEqual(3);
    expect(result.toLevel).toEqual(2);
  });

  it('reports relegation when the later tier is less prestigious', () => {
    const result: any = getTierMovement({ fromTier: tier('AA'), toTier: tier('B'), policyDefinitions });
    expect(result.movement).toEqual(TierMovementEnum.RELEGATED);
  });

  it('reports HELD when the tier is unchanged', () => {
    const result: any = getTierMovement({ fromTier: tier('A1'), toTier: tier('A1'), policyDefinitions });
    expect(result.movement).toEqual(TierMovementEnum.HELD);
  });

  it('reports HELD when two different values resolve to the same level', () => {
    const equivalent: any = {
      [POLICY_TYPE_RANKING_POINTS]: { tierToLevel: { [ALTA]: { A1: 3, 'A1-South': 3 } } },
    };
    const result: any = getTierMovement({
      policyDefinitions: equivalent,
      fromTier: tier('A1'),
      toTier: tier('A1-South'),
    });
    expect(result.movement).toEqual(TierMovementEnum.HELD);
  });

  it('falls back to numericRank when the policy declares no mapping', () => {
    const result: any = getTierMovement({ fromTier: tier('Silver', 3), toTier: tier('Gold', 2) });
    expect(result.movement).toEqual(TierMovementEnum.PROMOTED);
    expect(result.toLevel).toEqual(2);
  });

  // the point of the vocabulary: it declines to invent a direction it cannot evidence
  it('reports REALIGNED when no level can be resolved for either tier', () => {
    const result: any = getTierMovement({ fromTier: tier('Mystery'), toTier: tier('Enigma') });
    expect(result.movement).toEqual(TierMovementEnum.REALIGNED);
    expect(result.fromLevel).toBeUndefined();
  });

  it('reports REALIGNED across different tier systems even when levels would compare', () => {
    const result: any = getTierMovement({
      fromTier: { system: 'PPA', value: 'Gold', numericRank: 2 },
      toTier: { system: 'USTA', value: 'Level 1', numericRank: 1 },
    });
    expect(result.movement).toEqual(TierMovementEnum.REALIGNED);
  });

  it('reports WITHDREW and ENTERED at the edges of a competitor lifecycle', () => {
    expect(getTierMovement({ fromTier: tier('A1'), toTier: undefined }).movement).toEqual(TierMovementEnum.WITHDREW);
    expect(getTierMovement({ fromTier: undefined, toTier: tier('A1') }).movement).toEqual(TierMovementEnum.ENTERED);
  });

  it('reports REALIGNED when neither season carries a tier', () => {
    expect(getTierMovement({}).movement).toEqual(TierMovementEnum.REALIGNED);
  });

  it('is reachable from the engine surface', async () => {
    const { default: tournamentEngine } = await import('@Engines/syncEngine');
    const result: any = tournamentEngine.getTierMovement({
      fromTier: tier('A1'),
      toTier: tier('AA'),
      policyDefinitions,
    });
    expect(result.movement).toEqual(TierMovementEnum.PROMOTED);
  });
});
