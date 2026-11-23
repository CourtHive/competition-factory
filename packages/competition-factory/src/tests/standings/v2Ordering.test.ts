import { buildMatchUps, runCase, separatorsOf, type CorpusCase, type CorpusResult } from './standingsFixtures';
import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import { validateTallyPolicy } from '@Validators/validateTallyPolicy';
import { describe, expect, it } from 'vitest';

// constants
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 * The v2 ordering features of S3b (Mentat `planning/STANDINGS_ENGINE_SPEC.md` § 5.4): split modes, size and `when`
 * gates, terminal steps. Every expected order is worked by hand from the results below.
 */

const policy = (tallyPolicy: Record<string, unknown>) => ({ [POLICY_TYPE_ROUND_ROBIN_TALLY]: tallyPolicy });

/**
 * Five players. E 3 wins, A B C 2 each, D 1. Among the tied three: A beat B, C beat A and B.
 *   A: beat B 2-0, D 2-0; lost C 1-2, E 0-2   → sets 5-4 (.556)
 *   B: beat D 2-0, E 2-0; lost A 0-2, C 1-2   → sets 5-4 (.556)
 *   C: beat A 2-1, B 2-1; lost D 0-2, E 0-2   → sets 4-6 (.4)
 * With the only directive setsPct, the tied three split {A, B} | {C}; the pair is where the split modes differ.
 */
const FIVE: CorpusResult[] = [
  { sides: ['A', 'B'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['A', 'C'], score: '6-0 0-6 0-6', winningSide: 2 },
  { sides: ['A', 'D'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['A', 'E'], score: '0-6 0-6', winningSide: 2 },
  { sides: ['B', 'C'], score: '6-0 0-6 0-6', winningSide: 2 },
  { sides: ['B', 'D'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['B', 'E'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['C', 'D'], score: '0-6 0-6', winningSide: 2 },
  { sides: ['C', 'E'], score: '0-6 0-6', winningSide: 2 },
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

/**
 * Six players; A, B, C, D have 3 wins, E 2, F 1. Among A-D: A beat C, D; B beat A, C; C beat D; D beat B.
 *   A: sets 8-4 (.667)   B: 6-7 (.462)   C: 7-7 (.5)   D: 7-4 (.636)
 */
const SIX: CorpusResult[] = [
  { sides: ['A', 'B'], score: '6-0 0-6 0-6', winningSide: 2 },
  { sides: ['A', 'C'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['A', 'D'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['A', 'E'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['A', 'F'], score: '6-0 0-6 0-6', winningSide: 2 },
  { sides: ['B', 'C'], score: '6-0 0-6 6-0', winningSide: 1 },
  { sides: ['B', 'D'], score: '0-6 0-6', winningSide: 2 },
  { sides: ['B', 'E'], score: '0-6 0-6', winningSide: 2 },
  { sides: ['B', 'F'], score: '6-0 0-6 6-0', winningSide: 1 },
  { sides: ['C', 'D'], score: '6-0 0-6 6-0', winningSide: 1 },
  { sides: ['C', 'E'], score: '6-0 0-6 6-0', winningSide: 1 },
  { sides: ['C', 'F'], score: '6-0 0-6 6-0', winningSide: 1 },
  { sides: ['D', 'E'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['D', 'F'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['E', 'F'], score: '6-0 6-0', winningSide: 1 },
];

/**
 * The corpus's three-way split: A sets .625; B and C .556 each, games B .505, C .540; B beat C.
 */
const THREE_WAY: CorpusResult[] = [
  { sides: ['A', 'B'], score: '6-4 4-6 6-4', winningSide: 1 },
  { sides: ['A', 'C'], score: '4-6 6-4 4-6', winningSide: 2 },
  { sides: ['A', 'D'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['B', 'C'], score: '7-6(5) 6-7(5) 7-6(5)', winningSide: 1 },
  { sides: ['B', 'D'], score: '7-5 5-7 7-5', winningSide: 1 },
  { sides: ['C', 'D'], score: '6-0 0-6 6-0', winningSide: 1 },
];

const orderOf = (corpusCase: Omit<CorpusCase, 'rows'>) => {
  let result: any = runCase({ ...corpusCase, rows: {} } as CorpusCase);
  expect(result.error).toBeUndefined();
  const field = corpusCase.orderField;
  return {
    result,
    order: Object.fromEntries(Object.entries<any>(result.participantResults).map(([id, r]) => [id, r[field]])),
  };
};

describe('split modes', () => {
  const setsOnly = { tallyDirectives: [{ attribute: 'setsPct' }] };

  it('RESTART (default): the pair goes back to head-to-head, A beat B', () => {
    const { order, result } = orderOf({
      id: 'restart',
      clauses: [],
      description: '',
      results: FIVE,
      orderField: 'groupOrder',
      policyDefinitions: policy(setsOnly),
    });
    expect(order).toEqual({ E: 1, A: 2, B: 3, C: 4, D: 5 });
    expect(separatorsOf(result.report)).toEqual(['matchUpsWon', 'setsPct', 'head2Head']);
  });

  it('CONTINUE: the pair resumes after setsPct, finds no directive left, and shares the place', () => {
    const { order } = orderOf({
      id: 'continue',
      clauses: [],
      description: '',
      results: FIVE,
      orderField: 'groupOrder',
      policyDefinitions: policy({ ...setsOnly, onSplit: 'CONTINUE' }),
    });
    expect(order).toEqual({ E: 1, A: 2, B: 2, C: 4, D: 5 });
  });

  it('EXTRACT_ONE: A leads the top part and is resolved; B and C start again, and C beat B', () => {
    const { order } = orderOf({
      id: 'extract',
      clauses: [],
      description: '',
      results: FIVE,
      orderField: 'groupOrder',
      policyDefinitions: policy({ ...setsOnly, onSplit: 'EXTRACT_ONE' }),
    });
    expect(order).toEqual({ E: 1, A: 2, C: 3, B: 4, D: 5 });
  });

  it('CONTINUE re-applies a mini-league to the residue it leaves before moving on', () => {
    // SIX: A, B, C, D level on wins; their mini-league splits {A, B} (2-1 each) | {C, D} (1-2 each). Re-applied to
    // each pair it reads their meeting: B beat A, C beat D. setsPct, the next directive, would say the opposite
    // (A .667 over B .462; D .636 over C .5), so the order shows the re-application happened.
    const { order } = orderOf({
      id: 'continue-mini-league',
      clauses: [],
      description: '',
      results: SIX,
      orderField: 'groupOrder',
      policyDefinitions: policy({
        headToHead: { disabled: true },
        tallyDirectives: [{ attribute: 'matchUpsPct', idsFilter: true }, { attribute: 'setsPct' }],
        onSplit: 'CONTINUE',
      }),
    });
    expect(order).toEqual({ B: 1, A: 2, C: 3, D: 4, E: 5, F: 6 });
  });
});

describe('gates', () => {
  it('minParticipants passes a directive over for a smaller set (and reports it, as maxParticipants does)', () => {
    // head-to-head off: setsPct splits A | {B, C}; gamesPct would put C over B (.540 to .505), but it applies only to
    // three or more, so the pair shares second place
    const run = (gamesPct: object) =>
      orderOf({
        id: 'min',
        clauses: [],
        description: '',
        results: THREE_WAY,
        orderField: 'groupOrder',
        policyDefinitions: policy({
          headToHead: { disabled: true },
          tallyDirectives: [{ attribute: 'setsPct' }, { attribute: 'gamesPct', ...gamesPct }],
        }),
      });
    expect(run({}).order).toEqual({ A: 1, C: 2, B: 3, D: 4 });
    const { order, result } = run({ minParticipants: 3 });
    expect(order).toEqual({ A: 1, B: 2, C: 2, D: 4 });
    expect(result.report.some((entry) => entry?.excludedDirectives)).toBe(true);
  });

  it('a FINAL-only directive is skipped while the group is provisional', () => {
    // C v D unplayed. A and D have 2 wins; games A 26, D 24
    const results: CorpusResult[] = [
      { sides: ['A', 'B'], score: '6-1 6-1', winningSide: 1 },
      { sides: ['A', 'C'], score: '6-1 6-1', winningSide: 1 },
      { sides: ['B', 'C'], score: '6-1 6-1', winningSide: 1 },
      { sides: ['B', 'D'], score: '1-6 1-6', winningSide: 2 },
      { sides: ['A', 'D'], score: '1-6 1-6', winningSide: 2 },
      { sides: ['C', 'D'] },
    ];
    const gamesWon = (when?: object) =>
      orderOf({
        id: 'phase',
        clauses: [],
        description: '',
        results,
        orderField: 'provisionalOrder',
        policyDefinitions: policy({
          headToHead: { disabled: true },
          tallyDirectives: [{ attribute: 'gamesWon', ...(when && { when }) }],
        }),
      }).order;
    expect(gamesWon()).toEqual({ A: 1, D: 2, B: 3, C: 4 });
    expect(gamesWon({ phase: 'FINAL' })).toEqual({ A: 1, D: 1, B: 3, C: 4 });
  });
});

describe('terminal steps', () => {
  const subOrderMap = { C: 1, A: 2, B: 3 };

  it('ADJUDICATE (default) lets an organiser order a set no directive splits', () => {
    const { order } = orderOf({
      id: 'adjudicate',
      clauses: [],
      description: '',
      results: CYCLE,
      subOrderMap,
      orderField: 'groupOrder',
      policyDefinitions: policy({}),
    });
    expect(order).toEqual({ C: 1, A: 2, B: 3, D: 4 });
  });

  it('SHARE keeps the place shared whatever the sub-order says', () => {
    const { order, result } = orderOf({
      id: 'share',
      clauses: [],
      description: '',
      results: CYCLE,
      subOrderMap,
      orderField: 'groupOrder',
      policyDefinitions: policy({ terminal: 'SHARE' }),
    });
    expect(order).toEqual({ A: 1, B: 1, C: 1, D: 4 });
    expect(result.participantResults.A.ties).toEqual(3);
  });

  it('LOT draws an order from the seed, the same every time', () => {
    const matchUps = buildMatchUps({ results: CYCLE });
    const lot = () =>
      tallyParticipantResults({ matchUps: structuredClone(matchUps), policyDefinitions: policy({ terminal: 'LOT' }) });
    let first: any = lot();
    let second: any = lot();
    const order = (result: any) => ['A', 'B', 'C'].map((id) => result.participantResults[id].groupOrder);
    expect([...order(first)].sort()).toEqual([1, 2, 3]);
    expect(order(second)).toEqual(order(first));
    expect(first.participantResults.D.groupOrder).toEqual(4);
    const drawn = first.report.find((entry) => entry?.attribute === 'lot');
    expect(drawn.seed).toEqual(matchUps[0].structureId);
  });
});

describe('the v2 fields are validated where the policy is saved', () => {
  it.each([
    [{ onSplit: 'SOMETIMES' }],
    [{ terminal: 'COIN' }],
    [{ tallyDirectives: [{ attribute: 'setsPct', minParticipants: 0 }] }],
    [{ tallyDirectives: [{ attribute: 'setsPct', when: { phase: 'LATER' } }] }],
    [{ tallyDirectives: [{ attribute: 'setsPct', when: { purposes: 'MOVEMENT' } }] }],
  ])('refuses %j', (tallyPolicy) => {
    let result: any = validateTallyPolicy({ tallyPolicy });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('accepts a full v2 policy', () => {
    let result: any = validateTallyPolicy({
      tallyPolicy: {
        onSplit: 'EXTRACT_ONE',
        terminal: 'LOT',
        tallyDirectives: [
          { attribute: 'gamesPct', minParticipants: 3, when: { purposes: ['MOVEMENT'], phase: 'FINAL' } },
        ],
      },
    });
    expect(result.error).toBeUndefined();
  });
});
