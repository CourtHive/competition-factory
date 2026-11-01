import { runCase, type CorpusResult } from './standingsFixtures';
import { validateTallyPolicy } from '@Validators/validateTallyPolicy';
import { describe, expect, it } from 'vitest';

// constants
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 * Graph measures (Mentat `planning/STANDINGS_ENGINE_SPEC.md` § 5.2, S4a): read from the whole table, each opponent
 * scored by the policy's primary measure. Worked by hand on two Swiss-style rounds:
 *
 *   R1: A beat B, C beat D        R2: A beat C, D beat B        wins: A 2, C 1, D 1, B 0
 *
 *   C and D are level. Opponents' scores: C met D (1) and A (2); D met C (1) and B (0).
 *   Buchholz C 3, D 1. Cut1 (drop the lowest) C 2, D 1. Median (drop highest and lowest) 0 and 0.
 *   Sonneborn-Berger (scores of those beaten) C 1 (D), D 0 (B).
 */
const SWISS: CorpusResult[] = [
  { sides: ['A', 'B'], score: '6-1 6-1', winningSide: 1 },
  { sides: ['C', 'D'], score: '6-1 6-1', winningSide: 1 },
  { sides: ['A', 'C'], score: '6-1 6-1', winningSide: 1 },
  { sides: ['D', 'B'], score: '6-1 6-1', winningSide: 1 },
];

const order = (attribute: string) => {
  let result: any = runCase({
    policyDefinitions: {
      [POLICY_TYPE_ROUND_ROBIN_TALLY]: { headToHead: { disabled: true }, tallyDirectives: [{ attribute }] },
    },
    orderField: 'groupOrder',
    results: SWISS,
    description: '',
    clauses: [],
    rows: {},
    id: '',
  });
  expect(result.error).toBeUndefined();
  return Object.fromEntries(Object.entries<any>(result.participantResults).map(([id, r]) => [id, r.groupOrder]));
};

describe('graph measures', () => {
  it('buchholz: C (3) ahead of D (1)', () => expect(order('buchholz')).toEqual({ A: 1, C: 2, D: 3, B: 4 }));
  it('buchholzCut1: C (2) ahead of D (1)', () => expect(order('buchholzCut1')).toEqual({ A: 1, C: 2, D: 3, B: 4 }));
  it('buchholzMedian: two opponents each, both dropped: level, sharing second', () =>
    expect(order('buchholzMedian')).toEqual({ A: 1, C: 2, D: 2, B: 4 }));
  it('sonnebornBerger: C (beat D, 1) ahead of D (beat B, 0)', () =>
    expect(order('sonnebornBerger')).toEqual({ A: 1, C: 2, D: 3, B: 4 }));

  it('a drawn meeting records who it was drawn with, and nothing is written for a participant who never drew', () => {
    let result: any = runCase({
      results: [
        { sides: ['A', 'B'], sets: [[16, 16]] },
        { sides: ['A', 'C'], sets: [[17, 15]], winningSide: 1 },
      ],
      format: 'SET1-S:P32',
      orderField: 'groupOrder',
      description: '',
      clauses: [],
      rows: {},
      id: '',
    });
    expect(result.participantResults.A.drawnWith).toEqual(['B']);
    expect(result.participantResults.B.drawnWith).toEqual(['A']);
    expect(result.participantResults.C.drawnWith).toBeUndefined();
  });
});

describe('graph measures are validated where the policy is saved', () => {
  it.each([
    // the primary measure scores the opponents, so a graph measure cannot be it
    [{ groupOrderKey: 'buchholz' }],
    // a graph measure reads the whole table
    [{ tallyDirectives: [{ attribute: 'sonnebornBerger', idsFilter: true }] }],
    // computed only when ordering, never stored
    [{ crossGroup: [{ attribute: 'buchholz' }] }],
  ])('refuses %j', (tallyPolicy) => {
    let result: any = validateTallyPolicy({ tallyPolicy });
    expect(result.error).toEqual(INVALID_VALUES);
  });
});
