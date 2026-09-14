import tournamentEngine from '@Engines/syncEngine';
import scaleEngine from '@Engines/scaleEngine';
import { mocksEngine } from '../../..';
import { expect, it } from 'vitest';
import fs from 'fs';

// constants
import { CURTIS_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { SINGLES } from '@Constants/eventConstants';

const awardProfiles = [
  {
    eventTypes: [SINGLES],
    drawTypes: [CURTIS_CONSOLATION],
    finishingPositionRanges: {
      1: { value: 3000 },
      2: { value: 2400 },
      3: { value: 1950 },
      4: { value: 1800 },
      5: { value: 1350 },
      6: { value: 1050 },
      8: { value: 930 },
      16: { value: 750 },
      32: { value: 390 },
      64: { value: 270 },
    },
    pointsPerWin: 60,
  },
];

const policyDefinitions = {
  [POLICY_TYPE_RANKING_POINTS]: {
    requireWinFirstRound: true,
    requireWinForPoints: false,
    awardProfiles,
  },
};

// prettier-ignore
const scenarios = [
  {
    drawSize: 32,
    inspect: false,
    pointScenarios: {
      1: [3000], 2: [2400], 3: [1950, 1920, 1110], 4: [1860, 1800, 1050], 5: [1350],
      6: [1050], '5-6': [990], 8: [930], 9: [990, 300], 10: [930, 240], '11-12': [180, 870],
      '13-16': [810, 120], 16: [750], '17-24': [60], '21-24': [510, 180]
    },
  },
  {
    drawSize: 64,
    inspect: false,
    pointScenarios: {
      1: [3000], 2: [2400], 3: [1950, 1860], 4: [1800], 5: [1350, 1110, 990],
      6: [1050, 930], '7-8': [990, 870], 8: [930], '9-12': [810], 16: [750],
      '19-20': [570, 240], '21-24': [510, 180], 32: [390], 17: [690, 360],
      18: [630, 360, 300],'25-32': [450, 120], '33-48': [60]
    },
  },
];

it.each(scenarios)('will generate pointsPerWin for all finishingPositions which are not defined', (scenario) => {
  const drawProfiles = [
    {
      drawType: CURTIS_CONSOLATION,
      drawSize: scenario.drawSize,
    },
  ];
  let result = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    randomWinningSide: true,
    policyDefinitions,
    drawProfiles,
  });

  const { tournamentRecord } = result;
  tournamentEngine.setState(tournamentRecord);

  const { policyDefinitions: attachedPolicies } = tournamentEngine.getPolicyDefinitions({
    policyTypes: [POLICY_TYPE_RANKING_POINTS],
  });
  expect(attachedPolicies[POLICY_TYPE_RANKING_POINTS]).not.toBeUndefined();

  const finishingPositionSort = (a, b) => a.draws[0].finishingPositionRange[0] - b.draws[0].finishingPositionRange[0];

  result = scaleEngine.getTournamentPoints();
  expect(result.success).toEqual(true);

  const participants = result.participantsWithOutcomes.sort(finishingPositionSort);

  const pointAwards = Object.keys(result.personPoints)
    .flatMap((personId) => {
      const personResults = result.personPoints[personId];
      const participant = participants.find((p) => p.person.personId === personId);
      const entryPosition = participant?.draws[0].entryPosition;
      return personResults.map((pResult) => {
        const { positionPoints, rangeAccessor, perWinPoints, winCount, points } = pResult;

        if (scenario.pointScenarios[rangeAccessor]) {
          const included = scenario.pointScenarios[rangeAccessor].includes(points);
          if (!included) console.log({ rangeAccessor, points });
        } else {
          console.log('missing', { rangeAccessor });
        }

        return [points, rangeAccessor, winCount, perWinPoints, positionPoints, entryPosition];
      });
    })
    .sort((a, b) => b[0] - a[0]);

  // expect(Object.keys(result.personPoints).length).toEqual(24);
  /*
    Object.values(result.personPoints).forEach((personResults) => {
      personResults.forEach((personResult) => {
        const { rangeAccessor, positionPoints, perWinPoints } = personResult;

        if (positionPoints && !perWinPoints) encounteredRangeAccessors.push(rangeAccessor); 
      });
    });
    */

  if (scenario.inspect) {
    console.log(pointAwards);
    // written out for sanity checks
    const dirPath = './scratch/';
    if (fs.existsSync(dirPath)) {
      fs.writeFileSync(`${dirPath}consolationPointsPerWin.json`, JSON.stringify(participants, undefined, 1));
    }
  }
});
