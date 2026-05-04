import { suggestFormatPlans } from '@Query/formatWizard/suggestFormatPlans';
import { expect, it, describe } from 'vitest';

// constants and types
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { WizardConstraints, WizardParticipant } from '@Types/formatWizardTypes';

function pool(ratings: number[]): WizardParticipant[] {
  return ratings.map((rating, i) => ({ participantId: `p${i}`, rating }));
}

const baseConstraints: WizardConstraints = {
  courts: 4,
  days: 2,
  hoursPerDay: 8,
  minMatchesFloor: 3,
  consolationAppetite: 'LIGHT',
};

describe('suggestFormatPlans — input validation', () => {
  it('errors when participants are fewer than 2', () => {
    const result = suggestFormatPlans({ participants: pool([4]), constraints: baseConstraints });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('errors when constraints lack courts/days', () => {
    const result = suggestFormatPlans({
      participants: pool([4, 5]),
      constraints: { courts: 0, days: 0 } as WizardConstraints,
    });
    expect(result.error).toBeUndefined();
  });

  it('errors when constraints object is missing required numeric fields', () => {
    const result = suggestFormatPlans({
      participants: pool([4, 5]),
      // @ts-expect-error — intentionally missing required fields
      constraints: {},
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });
});

describe('suggestFormatPlans — output shape', () => {
  it('returns plans, distribution, and a populated rank field', () => {
    const result = suggestFormatPlans({
      participants: pool([3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5]),
      constraints: baseConstraints,
    });
    expect(result.error).toBeUndefined();
    expect(result.plans.length).toBeGreaterThan(0);
    expect(result.distribution.count).toEqual(12);
    expect(result.plans[0].rank).toEqual(1);
    expect(result.plans.at(-1)?.rank).toEqual(result.plans.length);
  });

  it('plans are sorted by descending score', () => {
    const result = suggestFormatPlans({
      participants: pool([4, 4.2, 4.5, 4.7, 5, 5.3, 5.5, 5.8]),
      constraints: baseConstraints,
    });
    for (let i = 1; i < result.plans.length; i++) {
      expect(result.plans[i].score).toBeLessThanOrEqual(result.plans[i - 1].score);
    }
  });

  it('aggregate competitive + decisive + routine sum to ~1', () => {
    const result = suggestFormatPlans({
      participants: pool([4, 4.2, 4.5, 4.7, 5, 5.3, 5.5, 5.8]),
      constraints: baseConstraints,
    });
    for (const plan of result.plans) {
      const { competitive, decisive, routine } = plan.aggregate;
      expect(competitive + decisive + routine).toBeCloseTo(1, 3);
    }
  });
});

describe('suggestFormatPlans — signal sensitivity', () => {
  it('a tight rating pool produces higher top-plan competitive % than a wide pool', () => {
    const tight = suggestFormatPlans({
      participants: pool([4, 4.05, 4.1, 4.15, 4.2, 4.25, 4.3, 4.35]),
      constraints: baseConstraints,
    });
    const wide = suggestFormatPlans({
      participants: pool([3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5]),
      constraints: baseConstraints,
    });
    expect(tight.plans[0].aggregate.competitive).toBeGreaterThan(wide.plans[0].aggregate.competitive);
  });

  it('plans flag BELOW_FLOOR when effective min < minMatchesFloor', () => {
    const result = suggestFormatPlans({
      participants: pool([4, 4.5, 5, 5.5]),
      constraints: { ...baseConstraints, minMatchesFloor: 5 },
    });
    expect(result.plans.some((p) => p.warnings.includes('BELOW_FLOOR'))).toBe(true);
  });

  it('plans flag OVER_CAPACITY when court-hours required exceed available', () => {
    const result = suggestFormatPlans({
      participants: pool([3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5]),
      constraints: { ...baseConstraints, courts: 1, days: 1, hoursPerDay: 4 },
    });
    expect(result.plans.some((p) => p.warnings.includes('OVER_CAPACITY'))).toBe(true);
  });
});

describe('suggestFormatPlans — governance', () => {
  it('respects allowedDrawTypes — only whitelisted kinds appear in plans', () => {
    const result = suggestFormatPlans({
      participants: pool([4, 4.2, 4.5, 4.7, 5, 5.3, 5.5, 5.8]),
      constraints: baseConstraints,
      governance: { allowedDrawTypes: ['ROUND_ROBIN'] },
    });
    for (const plan of result.plans) {
      for (const fs of plan.flightStructures) {
        expect(fs.structure.kind).toEqual('ROUND_ROBIN');
      }
    }
  });
});
