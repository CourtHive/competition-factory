import { validateTallyPolicy } from '@Validators/validateTallyPolicy';
import { runCase, type CorpusResult } from './standingsFixtures';
import { describe, expect, it } from 'vitest';

// constants
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 * commonOpponents (Mentat `planning/STANDINGS_PHASE_2_PLAN.md` § 1.2): NFL Tie-Breaking Procedures, "won-lost-tied
 * percentage in common games", a tie worth half a win, with a minimum of four common games for a wild card. Worked by
 * hand on an unbalanced schedule, where not everyone meets everyone (a season's shape):
 *
 *   A beat C, D; lost E, F        → 2 wins      opponents C D E F
 *   B beat D, G; lost C, E        → 2 wins      opponents C D E G
 *   E beat A, B, C                → 3 wins      opponents A B C
 *   C beat B; lost A, E           → 1 win       opponents A B E
 *   F beat A                      → 1 win       opponents A
 *   D lost A, B; G lost B         → 0 wins
 *
 *   A and B never met, so head-to-head leaves them level. Common opponents C D E:
 *     A 2-1 (.667), B 1-2 (.333)                 → A ahead
 *   C and F: common opponent A. C lost to A (0), F beat A (1)     → F ahead
 *   D and G: common opponent B. Both lost to B (0 and 0)           → level, sharing sixth
 */
const SCHEDULE: CorpusResult[] = [
  { sides: ['A', 'C'], score: '6-1 6-1', winningSide: 1 },
  { sides: ['A', 'D'], score: '6-1 6-1', winningSide: 1 },
  { sides: ['A', 'E'], score: '1-6 1-6', winningSide: 2 },
  { sides: ['A', 'F'], score: '1-6 1-6', winningSide: 2 },
  { sides: ['B', 'D'], score: '6-1 6-1', winningSide: 1 },
  { sides: ['B', 'G'], score: '6-1 6-1', winningSide: 1 },
  { sides: ['B', 'C'], score: '1-6 1-6', winningSide: 2 },
  { sides: ['B', 'E'], score: '1-6 1-6', winningSide: 2 },
  { sides: ['E', 'C'], score: '6-1 6-1', winningSide: 1 },
];

/**
 * A draw, in a combined-point format (SET1-S:P32, where 16-16 is a drawn result):
 *
 *   A beat D, drew C              → 1 win       opponents C D
 *   B beat D, lost C              → 1 win       opponents C D
 *   C drew A, beat B, beat H      → 2 wins
 *   D lost A, B; H lost C         → 0 wins
 *
 *   A and B never met. Common opponents C and D:
 *     A (1 + 0.5) / 2 = .75, B 1 / 2 = .5        → A ahead
 *     with drawCredit 0: A 1 / 2 = .5, B .5       → level
 *   D and H have no common opponent              → level
 */
const DRAWN: CorpusResult[] = [
  { sides: ['A', 'D'], sets: [[17, 15]], winningSide: 1 },
  { sides: ['A', 'C'], sets: [[16, 16]] },
  { sides: ['B', 'D'], sets: [[17, 15]], winningSide: 1 },
  { sides: ['B', 'C'], sets: [[15, 17]], winningSide: 2 },
  { sides: ['C', 'H'], sets: [[17, 15]], winningSide: 1 },
];

const order = (results: CorpusResult[], tallyPolicy: Record<string, unknown>, format?: string) => {
  let result: any = runCase({
    policyDefinitions: { [POLICY_TYPE_ROUND_ROBIN_TALLY]: tallyPolicy },
    orderField: 'groupOrder',
    description: '',
    clauses: [],
    rows: {},
    id: '',
    results,
    format,
  });
  expect(result.error).toBeUndefined();
  const orders = Object.fromEntries(
    Object.entries<any>(result.participantResults).map(([id, r]) => [id, r.groupOrder]),
  );
  return { orders, report: result.report, participantResults: result.participantResults };
};

describe('commonOpponents', () => {
  it('separates a pair head-to-head cannot, and each tied set has its own common opponents', () => {
    const { orders } = order(SCHEDULE, { tallyDirectives: [{ attribute: 'commonOpponents' }] });
    expect(orders).toEqual({ E: 1, A: 2, B: 3, F: 4, C: 5, D: 6, G: 6 });
  });

  it('a set below minSample is not split, and the skip is reported', () => {
    // A and B have 3 meetings with common opponents, C and F 1, D and G 1: four is more than any set has
    const { orders, report } = order(SCHEDULE, { tallyDirectives: [{ attribute: 'commonOpponents', minSample: 4 }] });
    expect(orders).toEqual({ E: 1, A: 2, B: 2, F: 4, C: 4, D: 6, G: 6 });
    const skipped = report.filter((entry: any) => entry?.skipped === 'minSample');
    expect(skipped.map((entry: any) => [...entry.participantIds].sort((a, b) => a.localeCompare(b)))).toEqual(
      expect.arrayContaining([
        ['A', 'B'],
        ['C', 'F'],
        ['D', 'G'],
      ]),
    );
  });

  it('minSample at exactly the meetings a set has still splits it', () => {
    const { orders } = order(SCHEDULE, { tallyDirectives: [{ attribute: 'commonOpponents', minSample: 3 }] });
    // A and B have 3 each and split; C/F and D/G have 1 each and stay level
    expect(orders).toEqual({ E: 1, A: 2, B: 3, F: 4, C: 4, D: 6, G: 6 });
  });

  it('a draw is worth drawCredit (half a win by default)', () => {
    const tallyDirectives = [{ attribute: 'commonOpponents' }];
    expect(order(DRAWN, { tallyDirectives }, 'SET1-S:P32').orders).toEqual({ C: 1, A: 2, B: 3, D: 4, H: 4 });
    expect(order(DRAWN, { tallyDirectives, drawCredit: 0 }, 'SET1-S:P32').orders).toEqual({
      C: 1,
      A: 2,
      B: 2,
      D: 4,
      H: 4,
    });
  });

  it('is computed only when ordering: the stored results never carry it', () => {
    const { participantResults } = order(SCHEDULE, { tallyDirectives: [{ attribute: 'commonOpponents' }] });
    for (const results of Object.values<any>(participantResults)) expect(results.commonOpponents).toBeUndefined();
  });
});

describe('commonOpponents is validated where the policy is saved', () => {
  it.each([
    // it reads meetings against opponents outside the tied set
    [{ tallyDirectives: [{ attribute: 'commonOpponents', idsFilter: true }] }],
    // its value depends on who is tied, so it can be neither the primary measure nor a cross-group value
    [{ groupOrderKey: 'commonOpponents' }],
    [{ crossGroup: [{ attribute: 'commonOpponents' }] }],
    // minSample is a count of meetings
    [{ tallyDirectives: [{ attribute: 'commonOpponents', minSample: 0 }] }],
    [{ tallyDirectives: [{ attribute: 'commonOpponents', minSample: 2.5 }] }],
    // nothing else reads minSample, so it would be ignored
    [{ tallyDirectives: [{ attribute: 'gamesPct', minSample: 4 }] }],
  ])('refuses %j', (tallyPolicy) => {
    let result: any = validateTallyPolicy({ tallyPolicy });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('accepts a common-games directive with a minimum', () => {
    let result: any = validateTallyPolicy({
      tallyPolicy: { tallyDirectives: [{ attribute: 'commonOpponents', minSample: 4 }] },
    });
    expect(result.valid).toEqual(true);
  });
});
