import { feedInChampionship } from '@Tests/mutations/drawDefinitions/primitives/feedIn';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { accumulate } from '@Functions/reducers/accumulate';
import { mocksEngine } from '@Assemblies/engines/mock';
import { tournamentEngine } from '@Engines/syncEngine';
import { generateRange } from '@Tools/arrays';
import { it, test, expect } from 'vitest';
import { isOdd } from '@Tools/math';

// constants
import { BOTTOM_UP, CONSOLATION, FEED_IN_CHAMPIONSHIP_TO_SF, MAIN, TOP_DOWN } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_FEED_IN } from '@Constants/policyConstants';

const feedPolicy = {
  roundGroupedOrder: [
    [1], // complete round TOP_DOWN
    [1], // complete round BOTTOM_UP
    [1, 2], // 1st half BOTTOM_UP, 2nd half BOTTOM_UP
    [3, 4, 1, 2], // 3rd Qtr BOTTOM_UP, 4th Qtr BOTTOM_UP, 1st Qtr BOTTOM_UP, 2nd Qtr BOTTOM_UP
    [2, 1, 4, 3, 6, 5, 8, 7],
    [1],
  ],
  roundFeedProfiles: [TOP_DOWN, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP],
};

it('can generate FEED_IN_CHAMPIONSHIP to RSF', () => {
  const { links, drawDefinition, mainDrawMatchUps, consolationMatchUps, consolationStructure } = feedInChampionship({
    drawType: FEED_IN_CHAMPIONSHIP_TO_SF,
    drawSize: 32,
    feedPolicy,
  });

  expect(consolationMatchUps.length).toEqual(29);
  expect(mainDrawMatchUps.length).toEqual(31);
  expect(links.length).toEqual(4);

  const { matchUps } = getAllStructureMatchUps({
    structure: consolationStructure,
    inContext: true,
    drawDefinition,
  });

  const validations = [
    [1, 1, 1, '1-2', 'C-R16-Q'],
    [1, 1, 2, '3-4', 'C-R16-Q'],
    [1, 2, 1, '5-6', 'C-R16-Q'],
    [1, 2, 2, '7-8', 'C-R16-Q'],
    [1, 3, 1, '9-10', 'C-R16-Q'],
    [1, 3, 2, '11-12', 'C-R16-Q'],
    [1, 4, 1, '13-14', 'C-R16-Q'],
    [1, 4, 2, '15-16', 'C-R16-Q'],
    [1, 5, 1, '17-18', 'C-R16-Q'],
    [1, 5, 2, '19-20', 'C-R16-Q'],
    [1, 6, 1, '21-22', 'C-R16-Q'],
    [1, 6, 2, '23-24', 'C-R16-Q'],
    [1, 7, 1, '25-26', 'C-R16-Q'],
    [1, 7, 2, '27-28', 'C-R16-Q'],
    [1, 8, 1, '29-30', 'C-R16-Q'],
    [1, 8, 2, '31-32', 'C-R16-Q'],

    [2, 1, 1, '29-32', 'C-R16'],
    [2, 2, 1, '25-28', 'C-R16'],
    [2, 3, 1, '21-24', 'C-R16'],
    [2, 4, 1, '17-20', 'C-R16'],
    [2, 5, 1, '13-16', 'C-R16'],
    [2, 6, 1, '9-12', 'C-R16'],
    [2, 7, 1, '5-8', 'C-R16'],
    [2, 8, 1, '1-4', 'C-R16'],

    [4, 1, 1, '9-16', 'C-QF'],
    [4, 2, 1, '1-8', 'C-QF'],
    [4, 3, 1, '25-32', 'C-QF'],
    [4, 4, 1, '17-24', 'C-QF'],

    [6, 1, 1, '17-32', 'C-SF'],
    [6, 2, 1, '1-16', 'C-SF'],
  ];

  validateSourceDrawPositionRanges({
    validations,
    matchUps,
  });
});

function validateSourceDrawPositionRanges({ matchUps, validations }) {
  validations.forEach((validation) => {
    const [roundNumber, roundPosition, sideNumber, range, roundName] = validation;
    const matchUp = matchUps.find(
      (matchUp) => matchUp.roundNumber === roundNumber && matchUp.roundPosition === roundPosition,
    );
    const side = matchUp.sides.find((side) => side.sideNumber === sideNumber);
    expect(side.sourceDrawPositionRange).toEqual(range);
    expect(matchUp.abbreviatedRoundName).toEqual(roundName);
  });
}

const scenarios = [
  // { drawSize: 256, consolationCount: 253, mainDrawCount: 255, linksCount: 7 }, // SKIP - processing intensive
  { drawSize: 128, consolationCount: 125, mainDrawCount: 127, linksCount: 6 },
  { drawSize: 64, consolationCount: 61, mainDrawCount: 63, linksCount: 5 },
  { drawSize: 32, consolationCount: 29, mainDrawCount: 31, linksCount: 4 },
  { drawSize: 16, consolationCount: 13, mainDrawCount: 15, linksCount: 3 },
  { drawSize: 8, consolationCount: 5, mainDrawCount: 7, linksCount: 2 },
];

test.each(scenarios)('FEED_IN_CHAMPIONSHIP to RSF has proper sourceDrawPositionRanges', (scenario) => {
  const { drawSize, consolationCount, mainDrawCount, linksCount } = scenario;
  const { links, drawDefinition, mainDrawMatchUps, consolationMatchUps, consolationStructure } = feedInChampionship({
    drawType: FEED_IN_CHAMPIONSHIP_TO_SF,
    feedPolicy,
    drawSize,
  });

  expect(consolationMatchUps.length).toEqual(consolationCount);
  expect(mainDrawMatchUps.length).toEqual(mainDrawCount);
  expect(links.length).toEqual(linksCount);

  const { matchUps } = getAllStructureMatchUps({
    structure: consolationStructure,
    inContext: true,
    drawDefinition,
  });

  const finishingRounds = [12, 10, 8, 6, 4, 2];
  const roundSourceRanges = {};

  const directions: any[] = [];
  for (const finishingRound of finishingRounds) {
    const finishingRoundMatchUps = matchUps.filter((matchUp) => matchUp.finishingRound === finishingRound);
    const rsr = finishingRoundMatchUps.flatMap((matchUp) =>
      matchUp.sides.map((side) => side.sourceDrawPositionRange).filter(Boolean),
    );
    if (rsr.length) {
      roundSourceRanges[finishingRound] = rsr;
      const reduction = rsr.map((range) => accumulate(range.split('-').map(Number)));
      const direction = reduction[0] < reduction[reduction.length - 1] ? 'ascending' : 'descending';
      directions.push(direction);
    }
  }

  const check = directions.every((direction, i) => (direction === isOdd(i) ? 'ascending' : 'descending'));
  expect(check).toEqual(true);
});

test.each(scenarios)(
  'Consolation participant finishing matchUp sourceDrawPosition ranges map to participantAssignments',
  (scenario) => {
    const drawId = 'did';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: FEED_IN_CHAMPIONSHIP_TO_SF,
          drawSize: scenario.drawSize,
          idPrefix: 'm',
          drawId,
        },
      ],
      policyDefinitions: { [POLICY_TYPE_FEED_IN]: feedPolicy },
      completeAllMatchUps: true,
      setState: true,
    });

    const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
    const mainStructure = drawDefinition.structures.find((structure) => structure.stage === MAIN);
    const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const consolationMatchUps = matchUps.filter((matchUp) => matchUp.stage === CONSOLATION);
    const positionAssignments = tournamentEngine.getPositionAssignments({
      structure: mainStructure,
    }).positionAssignments;
    const positionAssignmentMap = Object.assign(
      {},
      ...positionAssignments.map((assignment) => ({ [assignment.participantId]: assignment.drawPosition })),
    );

    const finishingRounds: number[] = [];
    consolationMatchUps.forEach((matchUp) => {
      const { sides, finishingRound, roundNumber } = matchUp;
      if (roundNumber !== 1 && isOdd(finishingRound)) return;

      sides.forEach((side) => {
        const { participantId, sourceDrawPositionRange } = side;
        if (sourceDrawPositionRange) {
          const range = sourceDrawPositionRange.split('-').map(Number);
          const positionRange = generateRange(range[0], range[1] + 1);
          const participantOriginDrawPosition = positionAssignmentMap[participantId];
          const check = positionRange.includes(participantOriginDrawPosition);
          expect(check).toEqual(true);
          if (!finishingRounds.includes(finishingRound)) finishingRounds.push(finishingRound);
        }
      });
    });

    // the first member of the array is { roundNumber: 1 } which also has an odd finishingRound
    // all other members of the array are event numbered finishingRounds
    expect(!isOdd(accumulate(finishingRounds.slice(1)))).toEqual(true);
    expect(isOdd(accumulate(finishingRounds))).toEqual(true);
    expect(isOdd(finishingRounds[0])).toEqual(true);
  },
  0,
);
