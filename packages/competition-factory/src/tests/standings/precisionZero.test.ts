import { MAX_PRECISION, validateTallyPolicy } from '@Validators/validateTallyPolicy';
import { runCase, type CorpusResult } from './standingsFixtures';
import { describe, expect, it } from 'vitest';

// constants and types
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 * STANDINGS-104: precision 0 is a rule (whole numbers), not the default 3. A and B both win twice; A's sets ratio is
 * 5/3 = 1.667 and B's is 4/2 = 2.000, so they split at 1 or 3 places and EXACTLY, and tie at 0 places (both round to 2).
 */
const RESULTS: CorpusResult[] = [
  { sides: ['A', 'B'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['A', 'C'], score: '6-0 0-6 6-0', winningSide: 1 },
  { sides: ['A', 'D'], score: '0-6 6-0 0-6', winningSide: 2 },
  { sides: ['B', 'C'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['B', 'D'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['C', 'D'], score: '6-0 6-0', winningSide: 1 },
];

function tally(precision?: number | 'EXACT') {
  const tallyPolicy: any = {
    headToHead: { disabled: true },
    tallyDirectives: [{ attribute: 'setsRatio' }],
    ...(precision !== undefined && { precision }),
  };
  const result: any = runCase({
    policyDefinitions: { [POLICY_TYPE_ROUND_ROBIN_TALLY]: tallyPolicy },
    orderField: 'groupOrder',
    description: '',
    clauses: [],
    rows: {},
    id: 'precision',
    results: RESULTS,
  } as any);
  return result;
}

const orderOf = (result: any) =>
  Object.fromEntries(Object.entries<any>(result.participantResults).map(([id, row]) => [id, row.groupOrder]));

describe('precision 0 (STANDINGS-104)', () => {
  it('ties a sets ratio of 1.667 with 2.000 at 0 decimal places', () => {
    let result: any = validateTallyPolicy({ tallyPolicy: { precision: 0 } as any });
    expect(result.valid).toEqual(true);
    result = tally(0);
    expect(orderOf(result)).toEqual({ A: 1, B: 1, C: 3, D: 4 });
  });

  it.each([1, 3, 'EXACT', undefined] as const)('splits the same pair at precision %s', (precision) => {
    const result: any = tally(precision);
    expect(orderOf(result)).toEqual({ A: 2, B: 1, C: 3, D: 4 });
  });

  it('stores v1 percentages as whole numbers at precision 0', () => {
    // A won 5 of 8 sets: 0.625 at the default, 1 at 0 places
    let result: any = tally(0);
    expect(result.participantResults.A.setsPct).toEqual(1);
    result = tally(undefined);
    expect(result.participantResults.A.setsPct).toEqual(0.625);
  });

  it('refuses a precision beyond the bound, which would make every rounded value NaN', () => {
    expect(validateTallyPolicy({ tallyPolicy: { precision: MAX_PRECISION } as any }).valid).toEqual(true);
    for (const precision of [MAX_PRECISION + 1, 400]) {
      const result: any = validateTallyPolicy({ tallyPolicy: { precision } as any });
      expect(result.error).toEqual(INVALID_VALUES);
      expect(result.info).toMatch(/precision/);
    }
  });
});
