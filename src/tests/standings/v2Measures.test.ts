import { runCase, type CorpusCase, type CorpusResult } from './standingsFixtures';
import { validateTallyPolicy } from '@Validators/validateTallyPolicy';
import { describe, expect, it } from 'vitest';

// constants
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * The measures and conventions of S3c (Mentat `planning/STANDINGS_ENGINE_SPEC.md` § 5.2, § 5.10): precision EXACT,
 * differences and ratios, a ratio's zero rule, the expected denominator. Expected values are worked by hand.
 */

const policy = (tallyPolicy: Record<string, unknown>) => ({ [POLICY_TYPE_ROUND_ROBIN_TALLY]: tallyPolicy });

const run = (results: CorpusResult[], tallyPolicy: Record<string, unknown>, extra: Partial<CorpusCase> = {}) => {
  let result: any = runCase({
    policyDefinitions: policy(tallyPolicy),
    orderField: 'groupOrder',
    description: '',
    clauses: [],
    rows: {},
    id: '',
    results,
    ...extra,
  });
  expect(result.error).toBeUndefined();
  return result;
};
const orders = (result: any, field = 'groupOrder') =>
  Object.fromEntries(Object.entries<any>(result.participantResults).map(([id, r]) => [id, r[field]]));

/** games A 42-30, B 53-52, C 47-40, D 23-43; sets A 5-3, B 5-4, C 5-4 */
const THREE_WAY: CorpusResult[] = [
  { sides: ['A', 'B'], score: '6-4 4-6 6-4', winningSide: 1 },
  { sides: ['A', 'C'], score: '4-6 6-4 4-6', winningSide: 2 },
  { sides: ['A', 'D'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['B', 'C'], score: '7-6(5) 6-7(5) 7-6(5)', winningSide: 1 },
  { sides: ['B', 'D'], score: '7-5 5-7 7-5', winningSide: 1 },
  { sides: ['C', 'D'], score: '6-0 0-6 6-0', winningSide: 1 },
];

/** A 3 wins, sets 6-0; B 2 wins, 4-2; C 1 win, 2-4; D none, 0-6 */
const SPREAD: CorpusResult[] = [
  { sides: ['A', 'B'], score: '6-1 6-1', winningSide: 1 },
  { sides: ['A', 'C'], score: '6-1 6-1', winningSide: 1 },
  { sides: ['A', 'D'], score: '6-1 6-1', winningSide: 1 },
  { sides: ['B', 'C'], score: '6-1 6-1', winningSide: 1 },
  { sides: ['B', 'D'], score: '6-1 6-1', winningSide: 1 },
  { sides: ['C', 'D'], score: '6-1 6-1', winningSide: 1 },
];

describe('precision', () => {
  it('EXACT compares and stores percentages unrounded', () => {
    const result = run(THREE_WAY, { precision: 'EXACT' });
    expect(result.participantResults.B.setsPct).toEqual(5 / 9);
    expect(result.participantResults.A.setsPct).toEqual(5 / 8);
    expect(orders(result)).toEqual({ A: 1, B: 2, C: 3, D: 4 });
  });
});

describe('differences and ratios', () => {
  it('a difference may be the primary measure: gamesDiff A +12, C +7, B +1, D -20', () => {
    const result = run(THREE_WAY, { groupOrderKey: 'gamesDiff' });
    expect(result.participantResults.D.gamesDiff).toEqual(-20);
    expect(orders(result)).toEqual({ A: 1, C: 2, B: 3, D: 4 });
  });

  it('a ratio ranks a participant who lost nothing first, and is never stored', () => {
    const result = run(SPREAD, { groupOrderKey: 'setsRatio' });
    expect(orders(result)).toEqual({ A: 1, B: 2, C: 3, D: 4 });
    // computed only for the ordering: the stored tally stays finite and serialisable
    expect(result.participantResults.A.setsRatio).toBeUndefined();
    expect(JSON.stringify(result.participantResults)).not.toContain('null');
  });

  describe('zeroDivision, when a tied participant lost nothing', () => {
    // A beat C 2-0 (sets 2-0, ratio unbounded); B beat C 2-1 (ratio 2); A v B unplayed: A and B 1 win each
    const results: CorpusResult[] = [
      { sides: ['A', 'C'], score: '6-1 6-1', winningSide: 1 },
      { sides: ['B', 'C'], score: '6-1 1-6 6-1', winningSide: 1 },
      { sides: ['A', 'B'] },
    ];
    const ordered = (zeroDivision?: string) =>
      orders(
        run(
          results,
          { headToHead: { disabled: true }, tallyDirectives: [{ attribute: 'setsRatio', zeroDivision }] },
          { orderField: 'provisionalOrder' },
        ),
        'provisionalOrder',
      );

    it('MAX (default): A first', () => expect(ordered()).toEqual({ A: 1, B: 2, C: 3 }));
    it('ZERO: A reads as 0, so B first', () => expect(ordered('ZERO')).toEqual({ B: 1, A: 2, C: 3 }));
    it('SKIP: the directive is passed over and the pair shares the place', () =>
      expect(ordered('SKIP')).toEqual({ A: 1, B: 1, C: 3 }));
  });
});

describe('denominator', () => {
  // A beat B by walkover and C 6-1 6-1: 2 sets won, none lost
  const results: CorpusResult[] = [
    { sides: ['A', 'B'], matchUpStatus: WALKOVER, winningSide: 1 },
    { sides: ['A', 'C'], score: '6-1 6-1', winningSide: 1 },
    { sides: ['B', 'C'], score: '6-1 6-1', winningSide: 1 },
  ];

  it('PLAYED (default): sets played, 2 of 2', () => {
    expect(run(results, {}).participantResults.A.setsPct).toEqual(1);
  });

  it('EXPECTED: the engine supplies the expected meetings (2 each, 2 sets to win), 2 of 4, with no caller help', () => {
    expect(run(results, { denominator: 'EXPECTED' }).participantResults.A.setsPct).toEqual(0.5);
  });
});

describe('the S3c fields are validated where the policy is saved', () => {
  it.each([
    [{ precision: 'LOOSE' }],
    [{ denominator: 'GUESSED' }],
    [{ tallyDirectives: [{ attribute: 'setsRatio', zeroDivision: 'INFINITY' }] }],
    [{ groupOrderKey: 'setsRation' }],
  ])('refuses %j', (tallyPolicy) => {
    let result: any = validateTallyPolicy({ tallyPolicy });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('accepts precision EXACT, the expected denominator, and a ratio primary measure', () => {
    let result: any = validateTallyPolicy({
      tallyPolicy: { precision: 'EXACT', denominator: 'EXPECTED', groupOrderKey: 'setsRatio' },
    });
    expect(result.error).toBeUndefined();
  });
});
