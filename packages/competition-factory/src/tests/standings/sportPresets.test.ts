import { POLICY_ROUND_ROBIN_TALLY_PREMIER_LEAGUE } from '@Fixtures/policies/POLICY_ROUND_ROBIN_TALLY_PREMIER_LEAGUE';
import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import { POLICY_ROUND_ROBIN_TALLY_FIVB } from '@Fixtures/policies/POLICY_ROUND_ROBIN_TALLY_FIVB';
import { POLICY_ROUND_ROBIN_TALLY_MLS } from '@Fixtures/policies/POLICY_ROUND_ROBIN_TALLY_MLS';
import { buildMatchUps, runCase, type CorpusResult } from './standingsFixtures';
import { getSeasonStandings } from '@Query/season/getSeasonStandings';
import { validateTallyPolicy } from '@Validators/validateTallyPolicy';
import { describe, expect, it } from 'vitest';

// constants and types
import { STANDINGS_PURPOSE_ADVANCEMENT, SUBJECT_PERSON } from '@Constants/seasonConstants';
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import type { Season } from '@Types/seasonTypes';

/*
 * Standings phase 2 § 1.6: football and volleyball presets, each written from its source read 2026-11-04 (named in the
 * preset's header). Every expected order is worked by hand.
 */

const SOCCER = 'HAL2A-S:T45';
const VOLLEYBALL = 'SET5-S:TB25-F:TB15';

describe.each([
  ['Premier League', POLICY_ROUND_ROBIN_TALLY_PREMIER_LEAGUE],
  ['MLS', POLICY_ROUND_ROBIN_TALLY_MLS],
  ['FIVB', POLICY_ROUND_ROBIN_TALLY_FIVB],
])('%s preset', (_name, preset) => {
  it('passes save validation and names its source', () => {
    const tallyPolicy = preset[POLICY_TYPE_ROUND_ROBIN_TALLY];
    let result: any = validateTallyPolicy({ tallyPolicy });
    expect(result.error).toBeUndefined();
    expect(tallyPolicy.policyName).toMatch(/20\d\d/);
  });
});

describe('Premier League: C.7 shares a place, C.17 separates it only at the end and only where it decides something', () => {
  /*
   * Goals by half. A beat B 1-0, C beat A 1-0, A beat D 2-0; B beat C 1-0; B drew D 1-1; C drew D 1-1.
   * A 6. B and C 4 each (a win, a draw, a loss), goals 2-2 each: level on points, goal difference and goals scored.
   * D 2. B beat C, so C.17's head-to-head points put B ahead.
   */
  const results: CorpusResult[] = [
    {
      sides: ['A', 'B'],
      sets: [
        [1, 0],
        [0, 0],
      ],
      winningSide: 1,
    },
    {
      sides: ['C', 'A'],
      sets: [
        [1, 0],
        [0, 0],
      ],
      winningSide: 1,
    },
    {
      sides: ['A', 'D'],
      sets: [
        [1, 0],
        [1, 0],
      ],
      winningSide: 1,
    },
    {
      sides: ['B', 'C'],
      sets: [
        [1, 0],
        [0, 0],
      ],
      winningSide: 1,
    },
    {
      sides: ['B', 'D'],
      sets: [
        [1, 0],
        [0, 1],
      ],
    },
    {
      sides: ['C', 'D'],
      sets: [
        [1, 0],
        [0, 1],
      ],
    },
  ];
  const matchUps = buildMatchUps({ results, format: SOCCER }).map((matchUp) => ({
    ...matchUp,
    sides: matchUp.sides?.map((side) => ({
      ...side,
      participant: {
        participantId: side.participantId,
        participantType: 'INDIVIDUAL',
        person: { personId: side.participantId },
      },
    })),
    tournamentId: 'P1',
    drawId: 'P1-draw',
    eventId: 'P1-event',
  })) as any[];
  const season = {
    seasonId: 'S',
    seriesId: 'SERIES',
    name: 'Season',
    startDate: '2026-01-01',
    status: 'ACTIVE',
    tallyPolicy: POLICY_ROUND_ROBIN_TALLY_PREMIER_LEAGUE[POLICY_TYPE_ROUND_ROBIN_TALLY],
    tiers: [{ tierId: 'T', tier: { system: 'MOCK', value: 'T' } }],
    periods: [
      {
        periodId: 'P1',
        periodNumber: 1,
        includeInStandings: true,
        competitions: [{ tierId: 'T', tournamentId: 'P1' }],
        placements: [
          {
            tierId: 'T',
            subjects: ['A', 'B', 'C', 'D'].map((subjectId) => ({ subjectType: SUBJECT_PERSON, subjectId })),
          },
        ],
      },
    ],
  } as unknown as Season;
  const order = (result: any) => result.standings.T.map(({ subject, rank }) => `${subject.subjectId}${rank}`);

  it('the published table shares second place (C.7)', () => {
    let result: any = getSeasonStandings({ season, matchUps });
    expect(result.error).toBeUndefined();
    expect(order(result)).toEqual(['A1', 'B2', 'C2', 'D4']);
  });

  it('the final table asked for qualification separates it by head-to-head points (C.17)', () => {
    let result: any = getSeasonStandings({ season, matchUps, purpose: STANDINGS_PURPOSE_ADVANCEMENT });
    expect(order(result)).toEqual(['A1', 'B2', 'C3', 'D4']);
  });
});

const tally = (policyDefinitions, results: CorpusResult[], format = SOCCER, externalValues?) =>
  runCase({
    policyDefinitions,
    format,
    orderField: 'groupOrder',
    description: '',
    clauses: [],
    rows: {},
    id: '',
    results,
    ...(externalValues && { externalValues }),
  } as any);
const groupOrder = (result: any, ids: string[]) =>
  [...ids].sort((a, b) => result.participantResults[a].groupOrder - result.participantResults[b].groupOrder);

describe('Premier League: goal difference, then goals scored', () => {
  it('ranks a circle of level clubs on goal difference before goals scored (C.5, C.6)', () => {
    /*
     * X beat Z 2-0, Y beat X 1-0, Z beat Y 5-4: three points each. Goal difference X +1, Y 0, Z -1; goals scored X 2,
     * Y 5, Z 5. Goal difference first gives X, Y, Z; goals scored first would put X last.
     */
    const results: CorpusResult[] = [
      {
        sides: ['X', 'Z'],
        sets: [
          [1, 0],
          [1, 0],
        ],
        winningSide: 1,
      },
      {
        sides: ['Y', 'X'],
        sets: [
          [1, 0],
          [0, 0],
        ],
        winningSide: 1,
      },
      {
        sides: ['Z', 'Y'],
        sets: [
          [3, 2],
          [2, 2],
        ],
        winningSide: 1,
      },
    ];
    let result: any = tally(POLICY_ROUND_ROBIN_TALLY_PREMIER_LEAGUE, results);
    expect(groupOrder(result, ['X', 'Y', 'Z'])).toEqual(['X', 'Y', 'Z']);
  });
});

describe('MLS', () => {
  it('ranks on wins before goal differential', () => {
    /*
     * Five clubs. A, D and E each beat B 3-0 and drew C 1-1; A beat D and E, D beat E (1-0 each); B beat C 1-0.
     * A 10, D 7, E 4. B 3 (one win, goals 1-9) and C 3 (three draws, goals 3-4): level on points, and C's goal
     * differential is the better, but B has more wins.
     */
    const threeNil: [number, number][] = [
      [2, 0],
      [1, 0],
    ];
    const oneAll: [number, number][] = [
      [1, 0],
      [0, 1],
    ];
    const oneNil: [number, number][] = [
      [1, 0],
      [0, 0],
    ];
    const results: CorpusResult[] = [
      ...['A', 'D', 'E'].flatMap((club): CorpusResult[] => [
        { sides: [club, 'B'], sets: threeNil, winningSide: 1 },
        { sides: [club, 'C'], sets: oneAll },
      ]),
      { sides: ['A', 'D'], sets: oneNil, winningSide: 1 },
      { sides: ['A', 'E'], sets: oneNil, winningSide: 1 },
      { sides: ['D', 'E'], sets: oneNil, winningSide: 1 },
      { sides: ['B', 'C'], sets: oneNil, winningSide: 1 },
    ];
    let result: any = tally(POLICY_ROUND_ROBIN_TALLY_MLS, results);
    expect(result.error).toBeUndefined();
    expect(groupOrder(result, ['A', 'B', 'C', 'D', 'E'])).toEqual(['A', 'D', 'E', 'B', 'C']);
  });

  it('separates one club at a time: the rest go through the procedure again', () => {
    /*
     * A circle: P beat Q, Q beat R, R beat P, each 1-0, so the three are level on everything, head-to-head included.
     * Disciplinary points Q 5, P 6, R 7 put Q first. P and R then start again, and R beat P: Q, R, P. Taking the
     * disciplinary order whole would give Q, P, R.
     */
    const oneNil: [number, number][] = [
      [1, 0],
      [0, 0],
    ];
    const results: CorpusResult[] = [
      { sides: ['P', 'Q'], sets: oneNil, winningSide: 1 },
      { sides: ['Q', 'R'], sets: oneNil, winningSide: 1 },
      { sides: ['R', 'P'], sets: oneNil, winningSide: 1 },
    ];
    let result: any = tally(POLICY_ROUND_ROBIN_TALLY_MLS, results, SOCCER, {
      disciplinaryPoints: { P: 6, Q: 5, R: 7 },
    });
    expect(groupOrder(result, ['P', 'Q', 'R'])).toEqual(['Q', 'R', 'P']);
  });
});

describe('FIVB', () => {
  /** a volleyball result: each set's rally points, the set's winner read from them */
  const volleyball = (sides: [string, string], sets: [number, number][]) => ({ sides, sets });
  const won = (s1: number, s2: number): [number, number] => [s1, s2];

  /** volleyball matchUps: each set's rally points as its tiebreak score, the set won by the side with more */
  const volleyballMatchUps = (results: { sides: [string, string]; sets: [number, number][] }[]) =>
    buildMatchUps({
      results: results.map(({ sides }) => ({ sides, winningSide: 1 as const, sets: [[0, 0]] as [number, number][] })),
      format: VOLLEYBALL,
    }).map((matchUp, index) => ({
      ...matchUp,
      score: {
        sets: results[index].sets.map(([side1TiebreakScore, side2TiebreakScore], setIndex) => ({
          setNumber: setIndex + 1,
          side1TiebreakScore,
          side2TiebreakScore,
          winningSide: side1TiebreakScore > side2TiebreakScore ? 1 : 2,
        })),
      },
    }));
  const tallyVolleyball = (results: { sides: [string, string]; sets: [number, number][] }[]) =>
    tallyParticipantResults({
      policyDefinitions: POLICY_ROUND_ROBIN_TALLY_FIVB,
      matchUpFormat: VOLLEYBALL,
      matchUps: volleyballMatchUps(results),
    });

  it('ranks equal winners by match points: a 3-2 is 2 and 1', () => {
    /*
     * A beat B, C and D 3-0. B beat C 3-2 (B 2, C 1), C beat D 3-0 (C 3), D beat B 3-0 (D 3).
     * B, C and D have a win each: match points C 4, D 3, B 2.
     */
    const straight = [won(25, 20), won(25, 20), won(25, 20)];
    const fiveSets = [won(25, 20), won(20, 25), won(25, 20), won(20, 25), won(15, 10)];
    const results = [
      volleyball(['A', 'B'], straight),
      volleyball(['A', 'C'], straight),
      volleyball(['A', 'D'], straight),
      volleyball(['B', 'C'], fiveSets),
      volleyball(['C', 'D'], straight),
      volleyball(['D', 'B'], straight),
    ];
    let result: any = tallyVolleyball(results);
    expect(result.error).toBeUndefined();
    const points = ['A', 'B', 'C', 'D'].map((id) => result.participantResults[id].classificationPoints);
    expect(points).toEqual([9, 2, 4, 3]);
    expect(groupOrder(result, ['A', 'B', 'C', 'D'])).toEqual(['A', 'C', 'D', 'B']);
  });

  it('ranks on victories before match points', () => {
    /*
     * W beat X and Y 3-2 and lost to Z 0-3: two wins, 4 points. X beat Y 3-0, lost to W and Z 2-3: one win, 5 points.
     * Y beat Z 3-0: one win, 4 points. Z beat W 3-0 and X 3-2: two wins, 5 points.
     * Victories first: Z, W (two wins; Z on points), then X, Y. Match points first would put X second.
     */
    const straight = [won(25, 20), won(25, 20), won(25, 20)];
    const fiveSets = [won(25, 20), won(20, 25), won(25, 20), won(20, 25), won(15, 10)];
    let result: any = tallyVolleyball([
      volleyball(['W', 'X'], fiveSets),
      volleyball(['W', 'Y'], fiveSets),
      volleyball(['Z', 'W'], straight),
      volleyball(['X', 'Y'], straight),
      volleyball(['Z', 'X'], fiveSets),
      volleyball(['Y', 'Z'], straight),
    ]);
    expect(['W', 'X', 'Y', 'Z'].map((id) => result.participantResults[id].classificationPoints)).toEqual([4, 5, 4, 5]);
    expect(groupOrder(result, ['W', 'X', 'Y', 'Z'])).toEqual(['Z', 'W', 'X', 'Y']);
  });
});
