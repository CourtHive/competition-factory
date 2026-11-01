import { runCase, type CorpusResult } from './standingsFixtures';
import { validateTallyPolicy } from '@Validators/validateTallyPolicy';
import { describe, expect, it } from 'vitest';

// constants
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 * S7 of the standings engine (Mentat `planning/STANDINGS_ENGINE_SPEC.md` § 3, A7; § 5.2, external values). Worked by
 * hand from the results below.
 */

/**
 * Five players, all 6-0 6-0. A, B, C each win 2 of 4: among them A beat B and C, B beat C. E 3 wins, D 1.
 */
const FIVE: CorpusResult[] = [
  { sides: ['A', 'B'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['A', 'C'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['A', 'D'], score: '0-6 0-6', winningSide: 2 },
  { sides: ['A', 'E'], score: '0-6 0-6', winningSide: 2 },
  { sides: ['B', 'C'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['B', 'D'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['B', 'E'], score: '0-6 0-6', winningSide: 2 },
  { sides: ['C', 'D'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['C', 'E'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['D', 'E'], score: '0-6 0-6', winningSide: 2 },
];

/** A, B, C beat each other in a cycle with identical scores; D loses every match */
const CYCLE: CorpusResult[] = [
  { sides: ['A', 'B'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['B', 'C'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['C', 'A'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['A', 'D'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['B', 'D'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['C', 'D'], score: '6-0 6-0', winningSide: 1 },
];

const orders = (
  results: CorpusResult[],
  tallyPolicy: Record<string, unknown>,
  externalValues?: Record<string, Record<string, number>>,
) => {
  let result: any = runCase({
    policyDefinitions: { [POLICY_TYPE_ROUND_ROBIN_TALLY]: tallyPolicy },
    orderField: 'groupOrder',
    description: '',
    clauses: [],
    rows: {},
    id: '',
    externalValues,
    results,
  });
  expect(result.error).toBeUndefined();
  return Object.fromEntries(Object.entries<any>(result.participantResults).map(([id, r]) => [id, r.groupOrder]));
};

describe('SWEEP head-to-head (A7)', () => {
  const sweep = { headToHead: { disabled: true }, tallyDirectives: [{ attribute: 'headToHead', mode: 'SWEEP' }] };

  it('the one who beat every other tied participant is placed first; the rest start again (B beat C)', () => {
    expect(orders(FIVE, sweep)).toEqual({ E: 1, A: 2, B: 3, C: 4, D: 5 });
  });

  it('without a sweep the three share the place', () => {
    expect(orders(FIVE, { headToHead: { disabled: true }, tallyDirectives: [] })).toEqual({
      E: 1,
      A: 2,
      B: 2,
      C: 2,
      D: 5,
    });
  });

  it('a circle has no sweep, so nothing splits', () => {
    expect(orders(CYCLE, sweep)).toEqual({ A: 1, B: 1, C: 1, D: 4 });
  });
});

describe('external values', () => {
  // a curling Draw Shot Challenge: the cumulative distance of stones to the button, lower is better
  const dsc = {
    headToHead: { disabled: true },
    tallyDirectives: [{ attribute: 'external', externalKey: 'dsc', reversed: true }],
  };

  it('a Draw Shot Challenge breaks a head-to-head circle: B (22.1), C (31.0), A (40.2)', () => {
    expect(orders(CYCLE, dsc, { dsc: { A: 40.2, B: 22.1, C: 31.0, D: 55 } })).toEqual({ B: 1, C: 2, A: 3, D: 4 });
  });

  it('without the values nothing is known, so nothing splits', () => {
    expect(orders(CYCLE, dsc)).toEqual({ A: 1, B: 1, C: 1, D: 4 });
  });
});

describe('S7 directives are validated where the policy is saved', () => {
  it.each([
    [{ tallyDirectives: [{ attribute: 'headToHead', mode: 'FIRST_VICTORY' }] }],
    [{ tallyDirectives: [{ attribute: 'external' }] }],
  ])('refuses %j', (tallyPolicy) => {
    let result: any = validateTallyPolicy({ tallyPolicy });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('accepts a sweep and a keyed external value', () => {
    let result: any = validateTallyPolicy({
      tallyPolicy: {
        tallyDirectives: [
          { attribute: 'headToHead', mode: 'SWEEP' },
          { attribute: 'external', externalKey: 'dsc', reversed: true },
        ],
      },
    });
    expect(result.error).toBeUndefined();
  });
});
