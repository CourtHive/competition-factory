import { setSubscriptions } from '@Global/state/syncGlobalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { AD_HOC, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';
import {
  INVALID_STRUCTURE,
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  MISSING_MATCHUPS,
  MISSING_STRUCTURE_ID,
} from '@Constants/errorConditionConstants';

const scenarios: any[] = [
  { drawType: SINGLE_ELIMINATION, drawSize: 8, targetRoundNumber: 3, roundNumber: 2 },
  {
    targetRoundNumber: 4,
    roundNumber: 2,

    drawType: AD_HOC,
    automated: false,
    roundsCount: 4,
    drawSize: 0,
  },
  {
    drawType: AD_HOC,
    automated: true,
    roundsCount: 4,
    drawSize: 5,

    targetRoundNumber: 4,
    roundNumber: 2,

    expectation: {
      modifiedMatchUpsCount: 6,
      matchUpIds: [
        ['drawId-m-1-0', 'drawId-m-1-1'],
        ['drawId-m-2-0', 'drawId-m-2-1'],
        ['drawId-m-3-0', 'drawId-m-3-1'],
        ['drawId-m-4-0', 'drawId-m-4-1'],
      ],
      shiftedMatchUpIds: [
        ['drawId-m-1-0', 'drawId-m-1-1'],
        ['drawId-m-3-0', 'drawId-m-3-1'],
        ['drawId-m-4-0', 'drawId-m-4-1'],
        ['drawId-m-2-0', 'drawId-m-2-1'],
      ],
    },
  },
  {
    drawType: AD_HOC,
    automated: true,
    roundsCount: 4,
    drawSize: 5,

    targetRoundNumber: 2,
    roundNumber: 4,

    expectation: {
      modifiedMatchUpsCount: 6,
      matchUpIds: [
        ['drawId-m-1-0', 'drawId-m-1-1'],
        ['drawId-m-2-0', 'drawId-m-2-1'],
        ['drawId-m-3-0', 'drawId-m-3-1'],
        ['drawId-m-4-0', 'drawId-m-4-1'],
      ],
      shiftedMatchUpIds: [
        ['drawId-m-1-0', 'drawId-m-1-1'],
        ['drawId-m-4-0', 'drawId-m-4-1'],
        ['drawId-m-2-0', 'drawId-m-2-1'],
        ['drawId-m-3-0', 'drawId-m-3-1'],
      ],
    },
  },
];

const getIdMap = (matchUps) =>
  Object.values(tournamentEngine.getRoundMatchUps({ matchUps }).roundMatchUps).map((round: any) =>
    round.map((matchUp) => matchUp.matchUpId),
  );

test.each(scenarios)('can shift AD_HOC rounds', (scenario) => {
  let modifiedMatchUpsCount = 0;
  setSubscriptions({
    subscriptions: { [MODIFY_MATCHUP]: (matchUps) => (modifiedMatchUpsCount += matchUps?.length || 0) },
  });

  const { drawSize, eventType } = scenario;
  const drawId = 'drawId';

  mocksEngine.generateTournamentRecord({
    participantsProfile: { idPrefix: 'P' },
    drawProfiles: [
      {
        automated: scenario.automated,
        drawType: scenario.drawType,
        roundsCount: 4,
        idPrefix: 'm',
        eventType,
        drawSize,
        drawId,
      },
    ],
    setState: true,
  });

  const {
    drawDefinition: {
      structures: [mainStructure],
    },
  } = tournamentEngine.getEvent({ drawId });

  if (scenario.expectation?.matchUpIds) {
    expect(getIdMap(mainStructure.matchUps)).toEqual(scenario.expectation.matchUpIds);
  }

  const structureId = mainStructure.structureId;
  let result = tournamentEngine.shiftAdHocRounds();
  expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  result = tournamentEngine.shiftAdHocRounds({ drawId });
  expect(result.error).toEqual(MISSING_STRUCTURE_ID);
  result = tournamentEngine.shiftAdHocRounds({ drawId, structureId });
  expect(result.error).toEqual(INVALID_VALUES);

  if (scenario.drawType === AD_HOC && scenario.drawSize > 0) {
    result = tournamentEngine.shiftAdHocRounds({
      roundNumber: scenario.roundNumber,
      targetRoundNumber: 100,
      structureId,
      drawId,
    });

    expect(result.error).toEqual(INVALID_VALUES);
  }

  result = tournamentEngine.shiftAdHocRounds({
    roundNumber: scenario.roundNumber,
    targetRoundNumber: 0,
    structureId,
    drawId,
  });

  expect([INVALID_STRUCTURE, INVALID_VALUES, MISSING_MATCHUPS].includes(result.error)).toEqual(true);

  result = tournamentEngine.shiftAdHocRounds({
    roundNumber: scenario.roundNumber,
    targetRoundNumber: 'y',
    structureId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.shiftAdHocRounds({
    targetRoundNumber: scenario.targetRoundNumber,
    roundNumber: 'x',
    structureId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.shiftAdHocRounds({
    targetRoundNumber: scenario.targetRoundNumber,
    roundNumber: scenario.roundNumber,
    structureId,
    drawId,
  });

  // drawTypes that are not AD_HOC do not support swapping rounds
  if (scenario.drawType !== AD_HOC) return expect(result.error).toEqual(INVALID_STRUCTURE);

  // drawSize of 0 does not support swapping rounds
  if (scenario.drawSize === 0) return expect(result.error).toEqual(MISSING_MATCHUPS);

  expect(result.success).toEqual(true);

  if (scenario.expectation?.modifiedMatchUpsCount)
    expect(modifiedMatchUpsCount).toEqual(scenario.expectation.modifiedMatchUpsCount);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const structure = drawDefinition.structures.find((structure) => structure.structureId === structureId);
  if (scenario.expectation?.shiftedMatchUpIds) {
    expect(getIdMap(structure.matchUps)).toEqual(scenario.expectation.shiftedMatchUpIds);
  }
});
