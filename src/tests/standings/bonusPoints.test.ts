import { validateTallyPolicy } from '@Validators/validateTallyPolicy';
import { runCase, type CorpusResult } from './standingsFixtures';
import { describe, expect, it } from 'vitest';

// constants
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';

/*
 * Standings phase 2 § 1.5: a bonus rule adds to the deciding rule's award. Rugby's losing bonus, from the PREM league
 * table regulations (premrugby.com, read 2026-11-04): 4 for a win, 2 for a draw, 1 to a team that loses a match by 7
 * points or less. The four-try bonus needs the tries, which a score does not record, so it is not tested here.
 */
// a side's points are each half's score, as football's goals are, so points difference is gamesDiff
const RUGBY = 'HAL2A-S:T40';
const rugbyPolicy = {
  [POLICY_TYPE_ROUND_ROBIN_TALLY]: {
    policyName: 'rugby losing bonus',
    groupOrderKey: 'classificationPoints',
    resultPoints: {
      rules: [
        { id: 'win', winner: 4, loser: 0 },
        { id: 'draw', isDrawn: true, points: 2 },
        { id: 'losingBonus', bonus: true, loserMarginAtMost: 7, winner: 0, loser: 1 },
      ],
    },
    tallyDirectives: [{ attribute: 'gamesDiff', idsFilter: false }],
  },
};

/*
 * Each match by halves, the side's points per half:
 *   A beat B 20-17 (by 3)    A beat C 30-10 (by 20)    A drew D 13-13
 *   B beat C 24-17 (by 7)    B beat D 21-14 (by 7)     C beat D 22-14 (by 8)
 * A: 4 + 4 + 2 = 10. B: 1 (lost by 3) + 4 + 4 = 9. C: 0 + 1 (lost by 7) + 4 = 5. D: 2 + 1 (lost by 7) + 0 = 3.
 */
const results: CorpusResult[] = [
  {
    sides: ['A', 'B'],
    sets: [
      [10, 7],
      [10, 10],
    ],
    winningSide: 1,
  },
  {
    sides: ['A', 'C'],
    sets: [
      [15, 5],
      [15, 5],
    ],
    winningSide: 1,
  },
  {
    sides: ['A', 'D'],
    sets: [
      [6, 6],
      [7, 7],
    ],
  },
  {
    sides: ['B', 'C'],
    sets: [
      [12, 10],
      [12, 7],
    ],
    winningSide: 1,
  },
  {
    sides: ['B', 'D'],
    sets: [
      [14, 7],
      [7, 7],
    ],
    winningSide: 1,
  },
  {
    sides: ['C', 'D'],
    sets: [
      [11, 7],
      [11, 7],
    ],
    winningSide: 1,
  },
];

const tally = (policyDefinitions = rugbyPolicy) =>
  runCase({
    policyDefinitions,
    format: RUGBY,
    orderField: 'groupOrder',
    description: '',
    clauses: [],
    rows: {},
    id: '',
    results,
  });

describe('a losing bonus', () => {
  it('adds a point for a loss by 7 or fewer, the margin read from the summed halves', () => {
    let result: any = tally();
    expect(result.error).toBeUndefined();
    const points = ['A', 'B', 'C', 'D'].map((id) => result.participantResults[id].classificationPoints);
    expect(points).toEqual([10, 9, 5, 3]);
    expect(['A', 'B', 'C', 'D'].map((id) => result.participantResults[id].groupOrder)).toEqual([1, 2, 3, 4]);
  });

  it('lists the bonus as its own contribution', () => {
    let result: any = tally();
    const contributions = result.participantResults.B.classificationContributions.map(({ ruleId, points }) => [
      ruleId,
      points,
    ]);
    // lost to A (win rule, 0 to the loser, then the bonus), beat C and D
    expect(contributions).toEqual([
      ['win', 0],
      ['losingBonus', 1],
      ['win', 4],
      ['win', 4],
    ]);
  });

  it('a bonus never matches a result no deciding rule matched', () => {
    const tallyPolicy = structuredClone(rugbyPolicy[POLICY_TYPE_ROUND_ROBIN_TALLY]);
    tallyPolicy.resultPoints.rules = tallyPolicy.resultPoints.rules.filter(({ id }) => id !== 'draw');
    let result: any = tally({ [POLICY_TYPE_ROUND_ROBIN_TALLY]: tallyPolicy });
    // the A-D draw is unmatched on both sides, and the bonus does not rescue it
    expect(result.participantResults.A.classificationUnmatched).toHaveLength(1);
    expect(result.participantResults.D.classificationPoints).toEqual(1);
  });

  it('a bonus listed first still only adds: the first deciding rule decides', () => {
    const tallyPolicy = structuredClone(rugbyPolicy[POLICY_TYPE_ROUND_ROBIN_TALLY]);
    const [win, draw, losingBonus] = tallyPolicy.resultPoints.rules;
    tallyPolicy.resultPoints.rules = [losingBonus, win, draw];
    let result: any = tally({ [POLICY_TYPE_ROUND_ROBIN_TALLY]: tallyPolicy });
    expect(['A', 'B', 'C', 'D'].map((id) => result.participantResults[id].classificationPoints)).toEqual([10, 9, 5, 3]);
  });

  it('passes save validation', () => {
    let result: any = validateTallyPolicy({ tallyPolicy: rugbyPolicy[POLICY_TYPE_ROUND_ROBIN_TALLY] });
    expect(result.error).toBeUndefined();
  });
});
