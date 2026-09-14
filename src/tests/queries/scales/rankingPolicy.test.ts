import { awardProfileExpandedLevels, awardProfileLevels, awardProfileThresholds } from './awardProfileExamples';
import { finishingPositionSort, getFpMap } from './awardTestUtils';
import { getAwardProfile } from '@Query/scales/getAwardProfile';
import tournamentEngine from '@Engines/syncEngine';
import scaleEngine from '@Engines/scaleEngine';
import { mocksEngine } from '../../..';
import { expect, it } from 'vitest';

// constants
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

const awardProfiles = [
  {
    finishingPositionPoints: { participationOrders: [1] }, // only assign points for finishing positions when participationOrder: 1
    perWinPoints: [{ participationOrders: [2, 3, 4, 5], value: 105 }],
    finishingPositionRanges: {
      1: { value: 3000 },
      2: { value: 2400 },
      3: { value: 1950 },
      4: { value: 1800 },
      8: { value: 1110 },
      16: { value: 750 },
      32: { value: 450 },
      64: { value: 270 },
      128: { value: 120 },
      256: { value: 90 },
    },
  },
];

const winMap = 0;
const positionKey = 1;
const pointTotal = 2;

// prettier-ignore
const fpMapExpectation = [
    [[5], '1-1', 3000],
    [[4], '2-2', 2400],
    [[3], '3-4', 1800],
    [[3], '3-4', 1800],
    [[2, 2], '5-5', 1320],
    [[2, 1], '6-6', 1215],
    [[2, 0], '7-8', 1110],
    [[2, 0], '7-8', 1110],
    [[1, 3], '9-9', 1065],
    [[1, 2], '10-10', 960],
    [[1, 1], '11-12', 855],
    [[1, 1], '11-12', 855],
    [[1, 0, 2], '13-13', 960],
    [[1, 0, 1], '14-14', 855],
    [[1, 0, 0], '15-16', 750],
    [[1, 0, 0], '15-16', 750],
    [[0, 4], '17-17', 870],
    [[0, 3], '18-18', 765],
    [[0, 2], '19-20', 660],
    [[0, 2], '19-20', 660],
    [[0, 1, 2], '21-21', 765],
    [[0, 1, 1], '22-22', 660],
    [[0, 1, 0], '23-24', 555],
    [[0, 1, 0], '23-24', 555],
    [[0, 0, 3], '25-25', 765],
    [[0, 0, 2], '26-26', 660],
    [[0, 0, 1], '27-28', 555],
    [[0, 0, 1], '27-28', 555],
    [[0, 0, 0, 2], '29-29', 660],
    [[0, 0, 0, 1], '30-30', 555],
    [[0, 0, 0, 0], '31-32', 450],
    [[0, 0, 0, 0], '31-32', 450],
  ];

const policyDefinitions: any = {
  [POLICY_TYPE_RANKING_POINTS]: { awardProfiles },
};

it('can discover default awardProfiles', () => {
  const awardCriteria = {};
  const { awardProfile } = getAwardProfile({
    awardProfiles,
    ...awardCriteria,
  });
  expect(awardProfile).not.toBeUndefined();
});

it('supports finishingPositionRanges definitions with or without level', () => {
  const drawProfiles = [{ drawType: COMPASS, drawSize: 32 }];
  mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    setState: true,
    drawProfiles,
  });

  const participants = tournamentEngine
    .getParticipants({ withRankingProfile: true })
    .participants.sort(finishingPositionSort);

  let result = scaleEngine.getTournamentPoints({ policyDefinitions });
  expect(result.success).toEqual(true);
  let personPoints = result.personPoints;

  let fpMap = getFpMap(participants, personPoints);
  expect(fpMap).toEqual(fpMapExpectation);

  // use awardProfiles with levels
  policyDefinitions[POLICY_TYPE_RANKING_POINTS].awardProfiles = [awardProfileExpandedLevels];

  result = scaleEngine.getTournamentPoints({ policyDefinitions, level: 1 });
  expect(result.success).toEqual(true);
  personPoints = result.personPoints;

  fpMap = getFpMap(participants, personPoints);
  expect(fpMap).toEqual(fpMapExpectation);

  // use awardProfiles with levels
  policyDefinitions[POLICY_TYPE_RANKING_POINTS].awardProfiles = [awardProfileLevels];

  result = scaleEngine.getTournamentPoints({ policyDefinitions, level: 1 });
  expect(result.success).toEqual(true);
  personPoints = result.personPoints;

  fpMap = getFpMap(participants, personPoints);
  expect(fpMap).toEqual(fpMapExpectation);
});

const scenarios = [
  {
    drawSize: 64,
    expectations: [
      { positionKey: '1-1', pointTotal: 3000, winMap: [6] },
      { positionKey: '2-2', pointTotal: 2400, winMap: [5] },
      { positionKey: '3-4', pointTotal: 1800, winMap: [4] },
    ],
  },
  {
    drawSize: 32,
    expectations: [
      { positionKey: '1-1', pointTotal: 2800, winMap: [5] },
      { positionKey: '2-2', pointTotal: 2000, winMap: [4] },
      { positionKey: '3-4', pointTotal: 1750, winMap: [3] },
    ],
  },
  {
    drawSize: 16,
    expectations: [
      { positionKey: '1-1', pointTotal: 2800, winMap: [4] },
      { positionKey: '2-2', pointTotal: 2000, winMap: [3] },
      { positionKey: '3-3', pointTotal: 1950, winMap: [2, 1] },
      { positionKey: '4-4', pointTotal: 1775, winMap: [2, 0] },
    ],
  },
  {
    drawSize: 8,
    expectations: [
      { positionKey: '1-1', pointTotal: 2800, winMap: [3] },
      { positionKey: '2-2', pointTotal: 1800, winMap: [2] },
      { positionKey: '3-3', pointTotal: 1950, winMap: [1, 1] },
      { positionKey: '4-4', pointTotal: 1750, winMap: [1, 0] },
    ],
  },
  {
    drawSize: 4,
    expectations: [
      { positionKey: '1-1', pointTotal: 2800, winMap: [2] },
      { positionKey: '2-2', pointTotal: 1800, winMap: [1] },
      { positionKey: '3-3', pointTotal: 1950, winMap: [0, 1] },
      { positionKey: '4-4', pointTotal: 1775, winMap: [0, 0] },
    ],
  },
];

it.each(scenarios)('supports drawSize thresholds', (scenario) => {
  const drawProfiles = [{ drawType: COMPASS, drawSize: scenario.drawSize }];
  mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    setState: true,
    drawProfiles,
  });

  const participants = tournamentEngine
    .getParticipants({
      withRankingProfile: true,
    })
    .participants.sort(finishingPositionSort);

  // use awardProfiles with thresholds
  policyDefinitions[POLICY_TYPE_RANKING_POINTS].awardProfiles = [awardProfileThresholds];

  let result = scaleEngine.getTournamentPoints({ policyDefinitions });
  expect(result.success).toEqual(true);
  const personPoints = result.personPoints;

  const fpMap = getFpMap(participants, personPoints);

  for (const expectation of scenario.expectations) {
    const target = fpMap.find((e) => e[positionKey] === expectation.positionKey);
    if (target) {
      if (expectation.pointTotal) {
        expect(target[pointTotal]).toEqual(expectation.pointTotal);
      } else {
        console.log({ pointTotal: expectation.pointTotal });
      }
      if (expectation.winMap) {
        expect(target[winMap]).toEqual(expectation.winMap);
      } else {
        console.log({ winMap: expectation.winMap });
      }
    }
  }
});

// prettier-ignore
const requireWinScenarios = [
  { drawSize: 8, requireWinFirstRound: true, requireWin: false, totalPointsAwarded: 9150, },
  { drawSize: 8, requireWinFirstRound: false, requireWin: false, totalPointsAwarded: 13590, },
  { drawSize: 8, requireWinFirstRound: false, requireWin: true, totalPointsAwarded: 9150, },
  { drawSize: 16, requireWinFirstRound: true, requireWin: false, totalPointsAwarded: 13590, },
  { drawSize: 16, requireWinFirstRound: false, requireWin: false, totalPointsAwarded: 19590, },
  { drawSize: 16, requireWinFirstRound: false, requireWin: true, totalPointsAwarded: 13590, },
];

it.each(requireWinScenarios)(
  'supports requiredWins for a complete awardProfile or for discrete finishingPositions',
  (scenario) => {
    const drawProfiles = [{ drawType: COMPASS, drawSize: scenario.drawSize }];
    mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      setState: true,
      drawProfiles,
    });

    const participants = tournamentEngine
      .getParticipants({
        withRankingProfile: true,
      })
      .participants.sort(finishingPositionSort);

    const awardProfileRequiredWins = [
      {
        requireWinFirstRound: scenario.requireWinFirstRound,
        finishingPositionRanges: {
          1: { value: 3000 },
          2: { value: 2400 },
          3: { value: 1950 },
          4: { value: 1800 },
          8: [{ drawSize: 8, requireWin: scenario.requireWin, value: 1110 }, { value: 1110 }],
          16: [{ drawSize: 16, requireWin: scenario.requireWin, value: 750 }, { value: 750 }],
        },
      },
    ];

    // use awardProfiles with requiredWins
    policyDefinitions[POLICY_TYPE_RANKING_POINTS].awardProfiles = awardProfileRequiredWins;

    let result = scaleEngine.getTournamentPoints({ policyDefinitions });
    expect(result.success).toEqual(true);
    const personPoints = result.personPoints;

    const fpMap = getFpMap(participants, personPoints);
    const totalPointsAwarded = fpMap.map((entry) => entry[pointTotal]).reduce((a, b) => (a || 0) + (b || 0), 0);
    expect(totalPointsAwarded).toEqual(scenario.totalPointsAwarded);
  },
);
