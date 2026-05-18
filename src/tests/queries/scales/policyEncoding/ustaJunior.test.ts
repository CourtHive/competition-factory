import { POLICY_RANKING_POINTS_USTA_JUNIOR_2026 } from '@Fixtures/policies/POLICY_RANKING_POINTS_USTA_JUNIOR_2026';
import { POLICY_RANKING_POINTS_USTA_JUNIOR_2025 } from '@Fixtures/policies/POLICY_RANKING_POINTS_USTA_JUNIOR_2025';
import { POLICY_RANKING_POINTS_USTA_JUNIOR } from '@Fixtures/policies/POLICY_RANKING_POINTS_USTA_JUNIOR';
import { validateRankingPolicy } from './validatePolicy';
import { describe, expect, it } from 'vitest';

describe('USTA Junior 2025 policy encoding', () => {
  const { policy, valid, errorsText } = validateRankingPolicy(POLICY_RANKING_POINTS_USTA_JUNIOR_2025);

  it('validates against rankingPolicy.schema.json', () => {
    if (!valid) console.error(errorsText);
    expect(valid).toEqual(true);
  });

  it('has 2025 metadata and bounded validDateRange', () => {
    expect(policy.policyName).toEqual('USTA Junior 2025');
    expect(policy.validDateRange).toEqual({ startDate: '2025-01-01', endDate: '2025-12-31' });
    expect(policy.pointPoolModel).toEqual('per-category');
  });

  it('encodes six categoryAggregation rules: 3 downward 20% + 3 upward play-up', () => {
    const rules = policy.aggregationRules.categoryAggregation;
    expect(rules).toHaveLength(6);

    const downward = rules.filter((r: any) => r.multiplier === 0.2);
    expect(downward).toHaveLength(3);
    expect(downward.map((r: any) => r.source.ageCategoryCodes[0]).sort()).toEqual(['12U', '14U', '16U']);

    const playUp = rules.filter((r: any) => r.multiplier === 1.0 && r.requireParticipationInTarget === true);
    expect(playUp).toHaveLength(3);
    expect(playUp.map((r: any) => r.target.ageCategoryCodes[0]).sort()).toEqual(['12U', '14U', '16U']);
  });
});

describe('USTA Junior 2026 policy encoding', () => {
  const { policy, valid, errorsText } = validateRankingPolicy(POLICY_RANKING_POINTS_USTA_JUNIOR_2026);

  it('validates against rankingPolicy.schema.json', () => {
    if (!valid) console.error(errorsText);
    expect(valid).toEqual(true);
  });

  it('has open-ended validDateRange starting 2026-01-01', () => {
    expect(policy.policyName).toEqual('USTA Junior 2026');
    expect(policy.validDateRange).toEqual({ startDate: '2026-01-01' });
    expect(policy.pointPoolModel).toEqual('per-category');
  });

  it('encodes the same six categoryAggregation rules as 2025', () => {
    const rules = policy.aggregationRules.categoryAggregation;
    expect(rules).toHaveLength(6);
  });
});

describe('USTA Junior legacy re-export', () => {
  it('re-exports the 2026 policy under the legacy name', () => {
    expect(POLICY_RANKING_POINTS_USTA_JUNIOR).toBe(POLICY_RANKING_POINTS_USTA_JUNIOR_2026);
  });
});
