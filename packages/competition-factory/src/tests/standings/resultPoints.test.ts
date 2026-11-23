import { getParticipantResults } from '@Query/matchUps/roundRobinTally/getParticipantResults';
import { buildMatchUps, runCase, type CorpusResult } from './standingsFixtures';
import { validateTallyPolicy } from '@Validators/validateTallyPolicy';
import { describe, expect, it } from 'vitest';

// constants
import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 * Classification points by result (S4b; the E1 acceptance fixtures in Mentat `planning/ROUND_ROBIN_RESULT_POINTS.md`).
 * Statuses are mapped explicitly by each rule: here a FIBA "forfeit" is a WALKOVER and a "default" a DEFAULTED.
 */

const FIBA = {
  rules: [
    { id: 'forfeit', matchUpStatuses: [WALKOVER], winner: 2, loser: 0 },
    { id: 'played-or-default', winner: 2, loser: 1 },
  ],
};
const VOLLEYBALL = {
  rules: [
    { id: 'forfeit', matchUpStatuses: [WALKOVER], winner: 3, loser: 0 },
    { id: 'five-sets', loserSetsWon: [2], winner: 2, loser: 1 },
    { id: 'win', winner: 3, loser: 0 },
  ],
};

const tally = (results: CorpusResult[], resultPoints: object, extra: object = {}) => {
  let result: any = runCase({
    policyDefinitions: { [POLICY_TYPE_ROUND_ROBIN_TALLY]: { resultPoints, ...extra } },
    orderField: 'groupOrder',
    description: '',
    clauses: [],
    rows: {},
    id: '',
    results,
    format: (extra as any).format,
  });
  expect(result.error).toBeUndefined();
  return result.participantResults;
};

describe('FIBA: win 2, played or defaulted loss 1, forfeit 0', () => {
  const beatB: CorpusResult = { sides: ['A', 'B'], score: '6-1 6-1', winningSide: 1 };

  it('one win and one played loss total 3', () => {
    const results = tally([beatB, { sides: ['A', 'C'], score: '1-6 1-6', winningSide: 2 }], FIBA);
    expect(results.A.classificationPoints).toEqual(3);
    expect(results.A.classificationContributions.map(({ ruleId }) => ruleId)).toEqual([
      'played-or-default',
      'played-or-default',
    ]);
  });

  it('the loss as a forfeit totals 2', () => {
    const results = tally([beatB, { sides: ['A', 'C'], matchUpStatus: WALKOVER, winningSide: 2 }], FIBA);
    expect(results.A.classificationPoints).toEqual(2);
    expect(results.C.classificationPoints).toEqual(2);
  });

  it('the loss as a default stays worth 1', () => {
    const results = tally([beatB, { sides: ['A', 'C'], matchUpStatus: DEFAULTED, winningSide: 2 }], FIBA);
    expect(results.A.classificationPoints).toEqual(3);
  });
});

describe('volleyball: 3 for a 3-0 or 3-1, 2 and 1 for a 3-2, a forfeit first', () => {
  const format = 'SET5-S:6/TB7';
  const results: CorpusResult[] = [
    { sides: ['A', 'B'], score: '6-0 0-6 6-0 0-6 6-0', winningSide: 1 },
    { sides: ['A', 'C'], score: '6-0 6-0 6-0', winningSide: 1 },
    { sides: ['B', 'C'], score: '6-0 0-6 6-0 6-0', winningSide: 1 },
  ];

  it('scores by the margin, and orders by classification points', () => {
    const participantResults = tally(results, VOLLEYBALL, { format, groupOrderKey: 'classificationPoints' });
    // A: 2 (3-2 win) + 3 (3-0); B: 1 (3-2 loss) + 3 (3-1); C: 0 + 0
    expect(participantResults.A.classificationPoints).toEqual(5);
    expect(participantResults.B.classificationPoints).toEqual(4);
    expect(participantResults.C.classificationPoints).toEqual(0);
    expect(['A', 'B', 'C'].map((id) => participantResults[id].groupOrder)).toEqual([1, 2, 3]);
  });

  it('a forfeit takes precedence over the score rules', () => {
    const participantResults = tally(
      [...results.slice(0, 2), { sides: ['B', 'C'], matchUpStatus: WALKOVER, winningSide: 1 }],
      VOLLEYBALL,
      { format },
    );
    expect(participantResults.B.classificationContributions.at(-1)).toMatchObject({ ruleId: 'forfeit', points: 3 });
  });

  it('a recalculation over a subset counts only the meetings among it, once', () => {
    const matchUps = buildMatchUps({ results, format });
    const tallyPolicy = { resultPoints: VOLLEYBALL };
    let result: any = getParticipantResults({
      matchUps,
      participantIds: ['A', 'B'],
      tallyPolicy,
      matchUpFormat: format,
    });
    expect(result.participantResults.A.classificationPoints).toEqual(2);
    expect(result.participantResults.B.classificationPoints).toEqual(1);
  });
});

describe('diagnostics and storage', () => {
  it('a result no rule matches is reported on both participants, never counted as 0 in silence', () => {
    const forfeitOnly = { rules: [{ id: 'forfeit', matchUpStatuses: [WALKOVER], winner: 2, loser: 0 }] };
    const results = tally([{ sides: ['A', 'B'], score: '6-1 6-1', winningSide: 1 }], forfeitOnly);
    expect(results.A.classificationUnmatched).toEqual(['m1-AB']);
    expect(results.B.classificationUnmatched).toEqual(['m1-AB']);
    expect(results.A.classificationPoints).toEqual(0);
  });

  it('nothing is written without resultPoints', () => {
    let result: any = runCase({
      results: [{ sides: ['A', 'B'], score: '6-1 6-1', winningSide: 1 }],
      orderField: 'groupOrder',
      description: '',
      clauses: [],
      rows: {},
      id: '',
    });
    expect(result.participantResults.A.classificationPoints).toBeUndefined();
  });
});

describe('resultPoints is validated where the policy is saved', () => {
  it.each([
    [{ resultPoints: { rules: [] } }],
    [{ resultPoints: { rules: [{ id: 'a', winner: 2 }] } }],
    [{ resultPoints: { rules: [{ id: 'a', isDrawn: true }] } }],
    [
      {
        resultPoints: {
          rules: [
            { id: 'a', winner: 2, loser: 0 },
            { id: 'a', winner: 1, loser: 0 },
          ],
        },
      },
    ],
    [{ resultPoints: { rules: [{ id: 'a', winner: 2, loser: 0, loserSetsWon: [-1] }] } }],
    [{ resultPoints: { rules: [{ id: 'a', winner: Infinity, loser: 0 }] } }],
  ])('refuses %j', (tallyPolicy) => {
    let result: any = validateTallyPolicy({ tallyPolicy });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('accepts the FIBA and volleyball rules, and classificationPoints as the primary measure', () => {
    for (const resultPoints of [FIBA, VOLLEYBALL]) {
      let result: any = validateTallyPolicy({ tallyPolicy: { resultPoints, groupOrderKey: 'classificationPoints' } });
      expect(result.error).toBeUndefined();
    }
  });
});
