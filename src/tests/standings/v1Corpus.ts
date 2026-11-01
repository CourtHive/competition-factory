import { POLICY_ROUND_ROBIN_TALLY_DEFAULT } from '@Fixtures/policies/POLICY_ROUND_ROBIN_TALLY_DEFAULT';
import { POLICY_ROUND_ROBIN_TALLY_TOC } from '@Fixtures/policies/POLICY_ROUND_ROBIN_TALLY_TOC';
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import { WALKOVER } from '@Constants/matchUpStatusConstants';
import type { CorpusCase } from './standingsFixtures';

/**
 * The v1 characterisation corpus: Mentat `planning/STANDINGS_ENGINE_SPEC.md` § 1. Every expected row is worked by
 * hand from the clause it pins (the working is in the description), never copied from a run. A `K` clause pins a
 * quirk exactly as v1 behaves; whether v2 keeps it is a ruling recorded in the spec (§ 5.8, § 5.10).
 */

const DEFAULT = POLICY_ROUND_ROBIN_TALLY_DEFAULT;
const policy = (overrides: Record<string, unknown>) => ({
  [POLICY_TYPE_ROUND_ROBIN_TALLY]: { ...DEFAULT[POLICY_TYPE_ROUND_ROBIN_TALLY], ...overrides },
});

const COMBINED_POINTS = 'SET1-S:P32';

/**
 * Three-way tie on wins, split 1 + 2 by setsPct; the pair's games favour C but B won their meeting.
 *   A beat B 2-1, A beat D 2-0, C beat A 2-1   → A sets 5-3 (.625), games 42-30
 *   B beat C 2-1, B beat D 2-1, lost A 1-2     → B sets 5-4 (.556), games 53-52 (.505)
 *   C beat A 2-1, C beat D 2-1, lost B 1-2     → C sets 5-4 (.556), games 47-40 (.540)
 */
const THREE_WAY_SPLIT = [
  { sides: ['A', 'B'], score: '6-4 4-6 6-4', winningSide: 1 },
  { sides: ['A', 'C'], score: '4-6 6-4 4-6', winningSide: 2 },
  { sides: ['A', 'D'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['B', 'C'], score: '7-6(5) 6-7(5) 7-6(5)', winningSide: 1 },
  { sides: ['B', 'D'], score: '7-5 5-7 7-5', winningSide: 1 },
  { sides: ['C', 'D'], score: '6-0 0-6 6-0', winningSide: 1 },
] as CorpusCase['results'];

/** A, B, C beat each other in a cycle with identical scores; D loses every match 0-6 0-6 */
const CYCLE = [
  { sides: ['A', 'B'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['B', 'C'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['C', 'A'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['A', 'D'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['B', 'D'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['C', 'D'], score: '6-0 6-0', winningSide: 1 },
] as CorpusCase['results'];

/**
 * A double round robin (three players, two meetings each). A and B split their meetings 1-1 and both beat C twice,
 * so both have 3 wins; B's games are far better (A 42-48, B 48-14) and their sets are level (6-2 each).
 */
const TWO_TIEBREAK_SETS = '7-6(5) 7-6(5)';
const SPLIT_MEETINGS = [
  { sides: ['A', 'B'], score: TWO_TIEBREAK_SETS, winningSide: 1 },
  { sides: ['A', 'C'], score: TWO_TIEBREAK_SETS, winningSide: 1 },
  { sides: ['B', 'C'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['A', 'B'], score: '0-6 0-6', winningSide: 2 },
  { sides: ['A', 'C'], score: TWO_TIEBREAK_SETS, winningSide: 1 },
  { sides: ['B', 'C'], score: '6-0 6-0', winningSide: 1 },
] as CorpusCase['results'];

export const V1_CORPUS: CorpusCase[] = [
  {
    id: 'spread',
    clauses: ['V1-11', 'V1-16'],
    description: 'A 3 wins, B 2, C 1, D 0: the primary key alone resolves every place',
    policyDefinitions: DEFAULT,
    results: [
      { sides: ['A', 'B'], score: '6-1 6-1', winningSide: 1 },
      { sides: ['A', 'C'], score: '6-1 6-1', winningSide: 1 },
      { sides: ['A', 'D'], score: '6-1 6-1', winningSide: 1 },
      { sides: ['B', 'C'], score: '6-1 6-1', winningSide: 1 },
      { sides: ['B', 'D'], score: '6-1 6-1', winningSide: 1 },
      { sides: ['C', 'D'], score: '6-1 6-1', winningSide: 1 },
    ],
    orderField: 'groupOrder',
    rows: { A: { order: 1 }, B: { order: 2 }, C: { order: 3 }, D: { order: 4 } },
    separators: ['matchUpsWon'],
    totals: { A: { matchUpsWon: 3, setsWon: 6, gamesWon: 36, gamesLost: 6 } },
  },
  {
    id: 'two-way-head-to-head',
    clauses: ['V1-12'],
    description: 'A, B on 2 wins (B beat A), C, D on 1 (D beat C): each pair is settled by head-to-head first',
    policyDefinitions: DEFAULT,
    results: [
      { sides: ['A', 'B'], score: '1-6 1-6', winningSide: 2 },
      { sides: ['A', 'C'], score: '6-1 6-1', winningSide: 1 },
      { sides: ['A', 'D'], score: '6-1 6-1', winningSide: 1 },
      { sides: ['B', 'C'], score: '1-6 1-6', winningSide: 2 },
      { sides: ['B', 'D'], score: '6-1 6-1', winningSide: 1 },
      { sides: ['C', 'D'], score: '1-6 1-6', winningSide: 2 },
    ],
    orderField: 'groupOrder',
    rows: { B: { order: 1 }, A: { order: 2 }, D: { order: 3 }, C: { order: 4 } },
    separators: ['matchUpsWon', 'head2Head', 'head2Head'],
  },
  {
    id: 'three-way-restart',
    clauses: ['V1-12', 'V1-13', 'V1-14'],
    description:
      'setsPct splits A (.625) from B, C (.556 each); under RESTART the pair goes back to head-to-head (B beat C), ' +
      'although gamesPct, the next directive, favours C (.540 to .505). CONTINUE would put C second.',
    policyDefinitions: DEFAULT,
    results: THREE_WAY_SPLIT,
    orderField: 'groupOrder',
    rows: { A: { order: 1 }, B: { order: 2 }, C: { order: 3 }, D: { order: 4 } },
    separators: ['matchUpsWon', 'setsPct', 'head2Head'],
    totals: {
      A: { setsWon: 5, setsLost: 3 },
      B: { setsWon: 5, setsLost: 4, gamesWon: 53, gamesLost: 52 },
      C: { setsWon: 5, setsLost: 4, gamesWon: 47, gamesLost: 40 },
    },
  },
  {
    id: 'three-way-head-to-head-disabled',
    clauses: ['V1-12', 'V1-14'],
    description:
      'The same results with headToHead disabled: the B, C pair restarts through the directives instead, and ' +
      'gamesPct (C .540, B .505) puts C second. The contrast with three-way-restart is what pins RESTART.',
    policyDefinitions: policy({ headToHead: { disabled: true } }),
    results: THREE_WAY_SPLIT,
    orderField: 'groupOrder',
    rows: { A: { order: 1 }, C: { order: 2 }, B: { order: 3 }, D: { order: 4 } },
    separators: ['matchUpsWon', 'setsPct', 'gamesPct'],
  },
  {
    id: 'mini-league-among-tied',
    clauses: ['V1-13'],
    description:
      'Five players, all scores 6-0 6-0. A, B, C each win 2 of 4 (A beat B and C; B beat C), so every overall ' +
      'measure is level (.5); matchUpsPct among only the tied (idsFilter) gives A 1.0, B .5, C 0. E 3 wins, D 1.',
    policyDefinitions: DEFAULT,
    results: [
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
    ],
    orderField: 'groupOrder',
    rows: { E: { order: 1 }, A: { order: 2 }, B: { order: 3 }, C: { order: 4 }, D: { order: 5 } },
    separators: ['matchUpsWon', 'matchUpsPct'],
  },
  {
    id: 'reversed-directive',
    clauses: ['V1-13'],
    description:
      'A cycle with different margins and head-to-head disabled; the only directive is gamesLost reversed: ' +
      'A lost 20 games, B 16, C 18 → B, C, A',
    policyDefinitions: policy({
      headToHead: { disabled: true },
      tallyDirectives: [{ attribute: 'gamesLost', reversed: true, idsFilter: false }],
    }),
    results: [
      { sides: ['A', 'B'], score: '6-4 6-4', winningSide: 1 },
      { sides: ['B', 'C'], score: '6-2 6-2', winningSide: 1 },
      { sides: ['C', 'A'], score: '6-3 6-3', winningSide: 1 },
      { sides: ['A', 'D'], score: '6-0 6-0', winningSide: 1 },
      { sides: ['B', 'D'], score: '6-0 6-0', winningSide: 1 },
      { sides: ['C', 'D'], score: '6-0 6-0', winningSide: 1 },
    ],
    orderField: 'groupOrder',
    rows: { B: { order: 1 }, C: { order: 2 }, A: { order: 3 }, D: { order: 4 } },
    separators: ['matchUpsWon', 'gamesLost'],
    totals: { A: { gamesLost: 20 }, B: { gamesLost: 16 }, C: { gamesLost: 18 } },
  },
  {
    id: 'zero-denominators',
    clauses: ['K5'],
    description:
      'A walkover is the only result: no sets, games or points were played, so every percentage has a zero ' +
      'denominator. All four v1 fallbacks give 0 here (matchUpsPct has a denominator: 1 and 0)',
    policyDefinitions: DEFAULT,
    results: [{ sides: ['A', 'B'], matchUpStatus: WALKOVER, winningSide: 1 }],
    orderField: 'groupOrder',
    rows: { A: { order: 1 }, B: { order: 2 } },
    totals: {
      A: { matchUpsPct: 1, setsPct: 0, gamesPct: 0, pointsPct: 0, tieMatchUpsPct: 0 },
      B: { matchUpsPct: 0, setsPct: 0, gamesPct: 0, pointsPct: 0, tieMatchUpsPct: 0 },
    },
  },
  {
    id: 'expected-sets-denominator',
    clauses: ['V1-8', 'K9'],
    description:
      'A beat B by walkover and C 6-1 6-1: 2 sets won, none lost. Without perPlayer setsPct is 2/2 = 1; with ' +
      'perPlayer 2 the denominator is the minimum expected 2 × 2 = 4 → .5. No engine call site passes perPlayer.',
    policyDefinitions: DEFAULT,
    perPlayer: 2,
    results: [
      { sides: ['A', 'B'], matchUpStatus: WALKOVER, winningSide: 1 },
      { sides: ['A', 'C'], score: '6-1 6-1', winningSide: 1 },
      { sides: ['B', 'C'], score: '6-1 6-1', winningSide: 1 },
    ],
    orderField: 'groupOrder',
    rows: { A: { order: 1 }, B: { order: 2 }, C: { order: 3 } },
    totals: { A: { setsWon: 2, setsLost: 0, setsPct: 0.5 } },
  },
  {
    id: 'toc-preset',
    clauses: ['V1-11', 'V1-12'],
    description:
      'POLICY_ROUND_ROBIN_TALLY_TOC (key matchUpsPct; head-to-head only for two) on a cycle with different ' +
      'margins: games A 30-20 (.6), B 32-16 (.667), C 28-18 (.609) → B, C, A',
    policyDefinitions: POLICY_ROUND_ROBIN_TALLY_TOC,
    results: [
      { sides: ['A', 'B'], score: '6-4 6-4', winningSide: 1 },
      { sides: ['B', 'C'], score: '6-2 6-2', winningSide: 1 },
      { sides: ['C', 'A'], score: '6-3 6-3', winningSide: 1 },
      { sides: ['A', 'D'], score: '6-0 6-0', winningSide: 1 },
      { sides: ['B', 'D'], score: '6-0 6-0', winningSide: 1 },
      { sides: ['C', 'D'], score: '6-0 6-0', winningSide: 1 },
    ],
    orderField: 'groupOrder',
    rows: { B: { order: 1 }, C: { order: 2 }, A: { order: 3 }, D: { order: 4 } },
    separators: ['matchUpsPct', 'gamesPct'],
  },
  {
    id: 'precision-rounds-before-grouping',
    clauses: ['V1-9'],
    description:
      'The same results at precision 1: setsPct rounds A .625, B and C .556 all to 0.6, so setsPct no longer splits; ' +
      'gamesPct does (A .583 → 0.6, B .505 → 0.5, C .540 → 0.5) and the B, C pair restarts to head-to-head',
    policyDefinitions: policy({ precision: 1 }),
    results: THREE_WAY_SPLIT,
    orderField: 'groupOrder',
    rows: { A: { order: 1 }, B: { order: 2 }, C: { order: 3 }, D: { order: 4 } },
    separators: ['matchUpsWon', 'gamesPct', 'head2Head'],
    totals: { A: { setsPct: 0.6, gamesPct: 0.6 }, B: { setsPct: 0.6, gamesPct: 0.5 }, C: { gamesPct: 0.5 } },
  },
  {
    id: 'unresolved-cycle',
    clauses: ['V1-15', 'V1-16'],
    description: 'A, B, C cycle with identical scores: no directive splits them, so they share place 1; D is 4th',
    policyDefinitions: DEFAULT,
    results: CYCLE,
    orderField: 'groupOrder',
    rows: { A: { order: 1, ties: 3 }, B: { order: 1, ties: 3 }, C: { order: 1, ties: 3 }, D: { order: 4 } },
    separators: ['matchUpsWon'],
  },
  {
    id: 'organiser-sub-order',
    clauses: ['V1-17'],
    description: 'The same cycle with an organiser sub-order C, A, B: groupOrder = position + subOrder - 1',
    policyDefinitions: DEFAULT,
    subOrderMap: { C: 1, A: 2, B: 3 },
    results: CYCLE,
    orderField: 'groupOrder',
    rows: {
      C: { order: 1, ties: 3, rankOrder: 1 },
      A: { order: 2, ties: 3, rankOrder: 1 },
      B: { order: 3, ties: 3, rankOrder: 1 },
      D: { order: 4 },
    },
  },
  {
    id: 'provisional',
    clauses: ['V1-18'],
    description: 'C v D unplayed: the group is incomplete, so v1 writes provisionalOrder (A 2 wins, B 1, C 1, D 0)',
    policyDefinitions: DEFAULT,
    results: [
      { sides: ['A', 'B'], score: '6-1 6-1', winningSide: 1 },
      { sides: ['A', 'C'], score: '6-1 6-1', winningSide: 1 },
      { sides: ['B', 'C'], score: '6-1 6-1', winningSide: 1 },
      { sides: ['B', 'D'], score: '1-6 1-6', winningSide: 2 },
      { sides: ['A', 'D'], score: '1-6 1-6', winningSide: 2 },
      { sides: ['C', 'D'] },
    ],
    orderField: 'provisionalOrder',
    // D 2 wins and beat A → D first by head-to-head; B 1 win; C 0
    rows: { D: { order: 1 }, A: { order: 2 }, B: { order: 3 }, C: { order: 4 } },
  },
  {
    id: 'unknown-primary-key',
    clauses: ['K3'],
    description: 'groupOrderKey "notAMeasure" is outside the whitelist and silently becomes matchUpsWon',
    policyDefinitions: policy({ groupOrderKey: 'notAMeasure' }),
    results: [
      { sides: ['A', 'B'], score: '6-1 6-1', winningSide: 1 },
      { sides: ['A', 'C'], score: '6-1 6-1', winningSide: 1 },
      { sides: ['B', 'C'], score: '6-1 6-1', winningSide: 1 },
    ],
    orderField: 'groupOrder',
    rows: { A: { order: 1 }, B: { order: 2 }, C: { order: 3 } },
    separators: ['matchUpsWon'],
  },
  {
    id: 'key-without-inputs',
    clauses: ['K4'],
    description:
      'groupOrderKey standingsPoints without outcomePoints is refused, but at CALCULATION (validateDrawTallyOptions ' +
      'inside getParticipantResults), so a saved policy only fails when a score arrives. v2 moves this to save.',
    policyDefinitions: policy({ groupOrderKey: 'standingsPoints' }),
    results: [
      { sides: ['A', 'B'], score: '6-1 6-1', winningSide: 1 },
      { sides: ['A', 'C'], score: '6-1 6-1', winningSide: 1 },
      { sides: ['B', 'C'], score: '6-1 6-1', winningSide: 1 },
    ],
    orderField: 'groupOrder',
    error: 'ERR_INVALID_VALUES',
    rows: {},
  },
  {
    id: 'standings-points-and-draw-credit',
    clauses: ['V1-5', 'V1-7', 'V1-10'],
    description:
      'Combined-point format with outcomePoints 3/1/0: A drew B 16-16 and beat C → 4 points, matchUpsPct ' +
      '(1 + 0.5) / 2 = .75; C beat B → 3; B → 1',
    format: COMBINED_POINTS,
    policyDefinitions: policy({ groupOrderKey: 'standingsPoints', outcomePoints: { win: 3, draw: 1, loss: 0 } }),
    results: [
      { sides: ['A', 'B'], sets: [[16, 16]] },
      { sides: ['A', 'C'], sets: [[17, 15]], winningSide: 1 },
      { sides: ['B', 'C'], sets: [[15, 17]], winningSide: 2 },
    ],
    orderField: 'groupOrder',
    rows: { A: { order: 1 }, C: { order: 2 }, B: { order: 3 } },
    totals: {
      A: { standingsPoints: 4, matchUpsDrawn: 1, matchUpsPct: 0.75 },
      B: { standingsPoints: 1, matchUpsDrawn: 1 },
      C: { standingsPoints: 3 },
    },
  },
  {
    id: 'walkover-no-disqualification',
    clauses: ['V1-5', 'K8'],
    description:
      'D concedes a walkover to A but beats B and C: D has 2 wins, B 1, C 0. disqualifyWalkovers (true in the ' +
      'default policy) is read by no code, so D is not pushed to the bottom; A 3 wins, D 2, B 1, C 0',
    policyDefinitions: DEFAULT,
    results: [
      { sides: ['A', 'B'], score: '6-1 6-1', winningSide: 1 },
      { sides: ['A', 'C'], score: '6-1 6-1', winningSide: 1 },
      { sides: ['A', 'D'], matchUpStatus: WALKOVER, winningSide: 1 },
      { sides: ['B', 'C'], score: '6-1 6-1', winningSide: 1 },
      { sides: ['B', 'D'], score: '1-6 1-6', winningSide: 2 },
      { sides: ['C', 'D'], score: '1-6 1-6', winningSide: 2 },
    ],
    orderField: 'groupOrder',
    rows: { A: { order: 1 }, D: { order: 2 }, B: { order: 3 }, C: { order: 4 } },
    totals: { D: { walkovers: 1, allDefaults: 1, matchUpsWon: 2 }, A: { setsWon: 4 } },
  },
  {
    id: 'split-meetings-first-victory-wins',
    clauses: ['K1', 'K2'],
    description:
      'Double round robin, A and B 1-1 in meetings and level on wins and sets; B is far ahead on games. The two-way ' +
      'shortcut finds A listed first with a victory over B and puts A first (K1). Each player has 4 results, not ' +
      'participantsCount - 1 = 2, so the completed group only ever gets provisionalOrder (K2).',
    policyDefinitions: DEFAULT,
    results: SPLIT_MEETINGS,
    orderField: 'provisionalOrder',
    rows: { A: { order: 1 }, B: { order: 2 }, C: { order: 3 } },
    totals: { A: { setsWon: 6, setsLost: 2, gamesWon: 42, gamesLost: 48 }, B: { setsWon: 6, setsLost: 2 } },
  },
  {
    id: 'split-meetings-order-dependent',
    clauses: ['K1'],
    description: 'The same results with B v A listed first: now B is found first and B is placed first',
    policyDefinitions: DEFAULT,
    // B's win over A (SPLIT_MEETINGS[3]) moved to the front with B as side 1; nothing else changes
    results: [{ sides: ['B', 'A'], score: '6-0 6-0', winningSide: 1 }, ...SPLIT_MEETINGS.toSpliced(3, 1)],
    orderField: 'provisionalOrder',
    rows: { B: { order: 1 }, A: { order: 2 }, C: { order: 3 } },
  },
];
