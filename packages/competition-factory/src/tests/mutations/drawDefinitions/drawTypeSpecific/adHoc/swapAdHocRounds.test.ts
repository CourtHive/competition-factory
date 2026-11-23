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
  { drawType: SINGLE_ELIMINATION, drawSize: 8 },
  {
    swapAdHocRounds: [2, 4],
    drawType: AD_HOC,
    automated: true,
    roundsCount: 4,
    drawSize: 5,
    expectation: {
      modifiedMatchUpsCount: 4,
      matchUpIds: [
        ['drawId-m-1-0', 'drawId-m-1-1'],
        ['drawId-m-2-0', 'drawId-m-2-1'],
        ['drawId-m-3-0', 'drawId-m-3-1'],
        ['drawId-m-4-0', 'drawId-m-4-1'],
      ],
      shiftedMatchUpIds: [
        ['drawId-m-1-0', 'drawId-m-1-1'],
        ['drawId-m-4-0', 'drawId-m-4-1'],
        ['drawId-m-3-0', 'drawId-m-3-1'],
        ['drawId-m-2-0', 'drawId-m-2-1'],
      ],
    },
  },
  {
    drawType: AD_HOC,
    automated: false,
    roundsCount: 4,
    drawSize: 0,
  },
];

const getIdMap = (matchUps) =>
  Object.values(tournamentEngine.getRoundMatchUps({ matchUps }).roundMatchUps).map((round: any) =>
    round.map((matchUp) => matchUp.matchUpId),
  );

test.each(scenarios)('can swap AD_HOC rounds', (scenario) => {
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
  let result = tournamentEngine.swapAdHocRounds();
  expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  result = tournamentEngine.swapAdHocRounds({ drawId });
  expect(result.error).toEqual(MISSING_STRUCTURE_ID);
  result = tournamentEngine.swapAdHocRounds({ drawId, structureId });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.swapAdHocRounds({
    roundNumbers: [0, 100],
    structureId,
    drawId,
  });

  // drawTypes that are not AD_HOC do not support swapping rounds
  if (scenario.drawType !== AD_HOC) return expect(result.error).toEqual(INVALID_STRUCTURE);

  // drawSize of 0 does not support swapping rounds
  if (scenario.drawSize === 0) return expect(result.error).toEqual(MISSING_MATCHUPS);

  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.swapAdHocRounds({
    roundNumbers: [1, 2, 3],
    structureId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.swapAdHocRounds({
    roundNumbers: ['a', 'b'],
    structureId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.swapAdHocRounds({
    roundNumbers: scenario.swapAdHocRounds,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  if (scenario.expectation?.modifiedMatchUpsCount)
    expect(modifiedMatchUpsCount).toEqual(scenario.expectation.modifiedMatchUpsCount);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const structure = drawDefinition.structures.find((structure) => structure.structureId === structureId);
  if (scenario.expectation?.shiftedMatchUpIds) {
    expect(getIdMap(structure.matchUps)).toEqual(scenario.expectation.shiftedMatchUpIds);
  }
});
