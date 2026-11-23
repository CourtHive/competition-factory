import { getBestFinishers } from '@Query/drawDefinition/getBestFinishers';
import { validateTallyPolicy } from '@Validators/validateTallyPolicy';
import { runCase, type CorpusResult } from './standingsFixtures';
import { describe, expect, it } from 'vitest';

// constants
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 * Best finishers across groups by the tally policy's `crossGroup` (Mentat `planning/STANDINGS_ENGINE_SPEC.md` § 5.7,
 * K7): FIFA's "best third-placed teams" problem, compared as a tuple rather than the packed GEMscore float.
 */

/** games A 42-30, B 53-52, C 47-40, D 23-43 */
const THREE_WAY: CorpusResult[] = [
  { sides: ['A', 'B'], score: '6-4 4-6 6-4', winningSide: 1 },
  { sides: ['A', 'C'], score: '4-6 6-4 4-6', winningSide: 2 },
  { sides: ['A', 'D'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['B', 'C'], score: '7-6(5) 6-7(5) 7-6(5)', winningSide: 1 },
  { sides: ['B', 'D'], score: '7-5 5-7 7-5', winningSide: 1 },
  { sides: ['C', 'D'], score: '6-0 0-6 6-0', winningSide: 1 },
];

describe('crossGroup values are written when a group is tallied', () => {
  it('each participant carries the policy crossGroup measures, a reversed one negated', () => {
    let result: any = runCase({
      policyDefinitions: {
        [POLICY_TYPE_ROUND_ROBIN_TALLY]: {
          crossGroup: [{ attribute: 'gamesDiff' }, { attribute: 'gamesLost', reversed: true }],
        },
      },
      orderField: 'groupOrder',
      results: THREE_WAY,
      description: '',
      clauses: [],
      rows: {},
      id: '',
    });
    const values = (id: string) => result.participantResults[id].crossGroupValues;
    expect(values('A')).toEqual([12, -30]);
    expect(values('B')).toEqual([1, -52]);
    expect(values('D')).toEqual([-20, -43]);
  });

  it('nothing is written without a crossGroup, so a v1 policy stores exactly what it did', () => {
    let result: any = runCase({
      orderField: 'groupOrder',
      results: THREE_WAY,
      description: '',
      clauses: [],
      rows: {},
      id: '',
    });
    expect(result.participantResults.A.crossGroupValues).toBeUndefined();
  });
});

describe('getBestFinishers', () => {
  // two groups' third-placed participants compete for one place; GEMscore and crossGroup disagree
  const groupResults = [
    {
      structureId: 'G1',
      results: {
        G1W: { groupOrder: 1, GEMscore: 9, crossGroupValues: [9, 0] },
        X: { groupOrder: 3, GEMscore: 5, crossGroupValues: [2, 10] },
      },
    },
    {
      structureId: 'G2',
      results: {
        G2W: { groupOrder: 1, GEMscore: 9, crossGroupValues: [9, 0] },
        Y: { groupOrder: 3, GEMscore: 4, crossGroupValues: [2, 11] },
      },
    },
  ];
  const selected = (results: any[]) =>
    getBestFinishers({ groupResults: results, finishingPositions: [1], bestOf: 3 }).selectedParticipants.map(
      ({ participantId }) => participantId,
    );

  it('compares crossGroup values as a tuple: level on the first, Y ahead on the second', () => {
    expect(selected(groupResults)).toEqual(['G1W', 'G2W', 'Y']);
  });

  it('falls back to GEMscore when the tallies carry no crossGroup values', () => {
    const withoutValues = groupResults.map(({ structureId, results }) => ({
      structureId,
      results: Object.fromEntries(
        Object.entries(results).map(([id, { crossGroupValues, ...rest }]) => [id, rest as any]),
      ),
    }));
    expect(selected(withoutValues)).toEqual(['G1W', 'G2W', 'X']);
  });
});

describe('crossGroup is validated where the policy is saved', () => {
  it.each([
    [{ crossGroup: 'gamesDiff' }],
    [{ crossGroup: [{ attribute: 'goalsFor' }] }],
    // a ratio is computed only when ordering and is unbounded: never a stored cross-group value
    [{ crossGroup: [{ attribute: 'setsRatio' }] }],
  ])('refuses %j', (tallyPolicy) => {
    let result: any = validateTallyPolicy({ tallyPolicy });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('accepts stored measures', () => {
    let result: any = validateTallyPolicy({
      tallyPolicy: { crossGroup: [{ attribute: 'matchUpsPct' }, { attribute: 'gamesDiff' }] },
    });
    expect(result.error).toBeUndefined();
  });
});
