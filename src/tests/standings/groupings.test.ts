import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import type { GroupingInputs } from '@Query/standings/orderParticipants';
import { buildMatchUps, type CorpusResult } from './standingsFixtures';
import { validateTallyPolicy } from '@Validators/validateTallyPolicy';
import { describe, expect, it } from 'vitest';

// constants
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 * Groupings (Mentat `planning/STANDINGS_PHASE_2_PLAN.md` § 1.3, as corrected 2026-11-04): divisions and conferences
 * supplied by the caller, with each participant's place in its own group's table. Every expected order is worked by
 * hand from the rule it cites (research report § 4.1 NFL, § 4.2 NBA, § 16 A5).
 */

/**
 * A, B and C win once each, and never meet; X, Y and Z lose once each.
 *   A beat X 6-0 6-0 (games +12), C beat Y 6-2 6-2 (+8), B beat Z 6-4 6-4 (+4)
 * A and B are in the East, C in the West.
 */
const WILD_CARD: CorpusResult[] = [
  { sides: ['A', 'X'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['C', 'Y'], score: '6-2 6-2', winningSide: 1 },
  { sides: ['B', 'Z'], score: '6-4 6-4', winningSide: 1 },
];
const DIVISIONS = { division: { A: 'EAST', B: 'EAST', C: 'WEST' } };

/**
 * Division records. East: A, B, D; West: W, Y, Z.
 *   A beat D, lost Y      B beat Y, lost D      D beat B, beat Z, lost A      Y beat A, beat W, lost B
 *   wins: D 2, Y 2, A 1, B 1, W 0, Z 0
 */
const DIVISION_RECORDS: CorpusResult[] = [
  { sides: ['A', 'D'], score: '6-3 6-3', winningSide: 1 },
  { sides: ['A', 'Y'], score: '3-6 3-6', winningSide: 2 },
  { sides: ['B', 'Y'], score: '6-3 6-3', winningSide: 1 },
  { sides: ['B', 'D'], score: '3-6 3-6', winningSide: 2 },
  { sides: ['D', 'Z'], score: '6-3 6-3', winningSide: 1 },
  { sides: ['Y', 'W'], score: '6-3 6-3', winningSide: 1 },
];
const EAST_WEST = { division: { A: 'EAST', B: 'EAST', D: 'EAST', W: 'WEST', Y: 'WEST', Z: 'WEST' } };

const tally = (results: CorpusResult[], tallyPolicy: Record<string, unknown>, inputs: GroupingInputs = {}) => {
  let result: any = tallyParticipantResults({
    policyDefinitions: { [POLICY_TYPE_ROUND_ROBIN_TALLY]: tallyPolicy },
    matchUps: buildMatchUps({ results }),
    ...inputs,
  });
  expect(result.error).toBeUndefined();
  const orders = Object.fromEntries(
    Object.entries<any>(result.participantResults).map(([id, r]) => [id, r.groupOrder]),
  );
  return { orders, report: result.report as any[], participantResults: result.participantResults };
};

const skips = (report: any[], reason: string) =>
  report
    .filter((entry) => entry?.skipped === reason)
    .map((entry) => [...entry.participantIds].sort((a: string, b: string) => a.localeCompare(b)));

describe('preReduce: NFL wild card, step 1 (A5)', () => {
  const policy = { preReduce: { groupBy: 'division' }, tallyDirectives: [{ attribute: 'gamesDiff' }] };

  it('without groupings, games difference orders the tied three A, C, B', () => {
    expect(tally(WILD_CARD, policy).orders).toEqual({ A: 1, C: 2, B: 3, Z: 4, Y: 5, X: 6 });
  });

  it('A cannot be placed before B, who leads their division: C, then B, then A', () => {
    // East's own table put B ahead of A. Candidates B and C: C (+8) beats B (+4) and is placed. The rest, A and B,
    // reduce to B, who is placed; then A.
    const groupRanks = { division: { B: 1, A: 2, C: 1 } };
    const { orders, report } = tally(WILD_CARD, policy, { groupings: DIVISIONS, groupRanks });
    expect(orders).toEqual({ C: 1, B: 2, A: 3, Z: 4, Y: 5, X: 6 });
    const reductions = report.filter((entry) => entry?.attribute === 'preReduce');
    expect(reductions[0]).toMatchObject({ groupBy: 'division', placed: ['C'] });
    expect([...reductions[0].candidates].sort((a: string, b: string) => a.localeCompare(b))).toEqual(['B', 'C']);
  });

  it('places ONE at a time and refills from its division: C, D, B, A (not the division leaders first)', () => {
    // add D (West, behind C in the West's own table) beating V 6-1 6-1 (+10). Candidates B and C: C (+8) is placed.
    // The rest are A, B and D; D is now the West's only one, so the candidates are B and D: D (+10) is placed, then B,
    // then A. Ordering the leaders first (B, C) and then the others (A, D) would give C, B, A, D instead.
    const results: CorpusResult[] = [...WILD_CARD, { sides: ['D', 'V'], score: '6-1 6-1', winningSide: 1 }];
    const groupings = { division: { ...DIVISIONS.division, D: 'WEST' } };
    const groupRanks = { division: { B: 1, A: 2, C: 1, D: 2 } };
    expect(tally(results, policy, { groupings, groupRanks }).orders).toEqual({
      C: 1,
      D: 2,
      B: 3,
      A: 4,
      Z: 5,
      Y: 6,
      V: 7,
      X: 8,
    });
  });

  it('when the division leader is also the best, nothing changes: A, C, B', () => {
    const groupRanks = { division: { A: 1, B: 2, C: 1 } };
    expect(tally(WILD_CARD, policy, { groupings: DIVISIONS, groupRanks }).orders).toEqual({
      A: 1,
      C: 2,
      B: 3,
      Z: 4,
      Y: 5,
      X: 6,
    });
  });

  it('a group without ranks is not reduced', () => {
    expect(tally(WILD_CARD, policy, { groupings: DIVISIONS }).orders).toEqual({ A: 1, C: 2, B: 3, Z: 4, Y: 5, X: 6 });
  });
});

describe('groupLeader: NBA "division winner" (L.2.b step 1)', () => {
  it('the division winner among the tied is placed first, and the others go on to the next criterion', () => {
    // B won the East; A did not, and C did not win the West. B first; A (+12) ahead of C (+8) on games difference
    const groupRanks = { division: { B: 1, A: 2, C: 2 } };
    const tallyDirectives = [{ attribute: 'groupLeader', groupBy: 'division' }, { attribute: 'gamesDiff' }];
    expect(tally(WILD_CARD, { tallyDirectives }, { groupings: DIVISIONS, groupRanks }).orders).toEqual({
      B: 1,
      A: 2,
      C: 3,
      Z: 4,
      Y: 5,
      X: 6,
    });
  });
});

describe('recordVsGroup: division win percentage', () => {
  it('splits a set within one division, and passes over a set across divisions or without meetings', () => {
    // A and B (East): A 1-0 against B and D, B 0-1 → A ahead. D (East) and Y (West): different divisions → level.
    // W and Z (West): Z never met a West team → level.
    const tallyDirectives = [{ attribute: 'recordVsGroup', groupBy: 'division' }];
    const { orders, report } = tally(DIVISION_RECORDS, { tallyDirectives }, { groupings: EAST_WEST });
    expect(orders).toEqual({ D: 1, Y: 1, A: 3, B: 4, W: 5, Z: 5 });
    expect(skips(report, 'groupBy')).toEqual([['D', 'Y']]);
    expect(skips(report, 'noMeetings')).toEqual([['W', 'Z']]);
  });
});

describe('recordVsSet: the record against a caller-defined set (NBA, against the postseason-eligible)', () => {
  it('reads the meetings with the set, and passes over a set where a member has none', () => {
    // set { D }: A beat D (1), B lost to D (0) → A ahead. D and Y: neither met D (D is not its own opponent) → level
    const tallyDirectives = [{ attribute: 'recordVsSet', setKey: 'eligible' }];
    const { orders, report } = tally(DIVISION_RECORDS, { tallyDirectives }, { participantSets: { eligible: ['D'] } });
    expect(orders).toEqual({ D: 1, Y: 1, A: 3, B: 4, W: 5, Z: 5 });
    expect(skips(report, 'noMeetings')).toEqual(expect.arrayContaining([['D', 'Y']]));
  });
});

describe('grouping measures and preReduce are validated where the policy is saved', () => {
  it.each([
    [{ preReduce: {} }],
    [{ preReduce: 'division' }],
    [{ tallyDirectives: [{ attribute: 'groupLeader' }] }],
    [{ tallyDirectives: [{ attribute: 'recordVsGroup', groupBy: '' }] }],
    [{ tallyDirectives: [{ attribute: 'recordVsSet' }] }],
    [{ tallyDirectives: [{ attribute: 'groupLeader', groupBy: 'division', idsFilter: true }] }],
    [{ tallyDirectives: [{ attribute: 'gamesWon', groupBy: 'division' }] }],
    [{ tallyDirectives: [{ attribute: 'recordVsGroup', groupBy: 'division', setKey: 'eligible' }] }],
    [{ groupOrderKey: 'groupLeader' }],
    [{ crossGroup: [{ attribute: 'recordVsSet' }] }],
  ])('refuses %j', (tallyPolicy) => {
    let result: any = validateTallyPolicy({ tallyPolicy });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('accepts the NFL and NBA shapes', () => {
    let result: any = validateTallyPolicy({
      tallyPolicy: {
        preReduce: { groupBy: 'division' },
        onSplit: 'EXTRACT_ONE',
        tallyDirectives: [
          { attribute: 'groupLeader', groupBy: 'division' },
          { attribute: 'headToHead', mode: 'SWEEP' },
          { attribute: 'recordVsGroup', groupBy: 'conference' },
          { attribute: 'commonOpponents', minSample: 4 },
          { attribute: 'recordVsSet', setKey: 'eligible' },
        ],
      },
    });
    expect(result.valid).toEqual(true);
  });
});
