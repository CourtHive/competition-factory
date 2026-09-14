import { getPositionsPlayedOff } from '@Query/drawDefinition/getPositionsPlayedOff';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { chunkByNth } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants
import { ADD_MATCHUPS, DELETED_MATCHUP_IDS } from '@Constants/topicConstants';
import {
  COMPASS,
  CURTIS,
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  ROUND_ROBIN,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

it('cann add ROUND_ROBIN playoff structures', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN, drawSize: 8 }],
  });

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  let drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const structureId = drawDefinition.structures[0].structureId;

  const getAvailablePlayoffs = {
    method: 'getAvailablePlayoffProfiles',
    params: {
      structureId,
      drawId,
    },
  };

  result = tournamentEngine.executionQueue([getAvailablePlayoffs]);
  expect(result.results.length).toEqual(1); // not a mutation; not expecting SUCCESS

  expect(result.results[0].positionsNotPlayedOff).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

  const playoffFinishingPositionRanges = result.results[0].playoffFinishingPositionRanges;
  expect(playoffFinishingPositionRanges).toEqual([
    {
      finishingPositionRange: '1-2',
      finishingPositions: [1, 2],
      finishingPosition: 1,
    },
    {
      finishingPositionRange: '3-4',
      finishingPositions: [3, 4],
      finishingPosition: 2,
    },
    {
      finishingPositionRange: '5-6',
      finishingPositions: [5, 6],
      finishingPosition: 3,
    },
    {
      finishingPositionRange: '7-8',
      finishingPositions: [7, 8],
      finishingPosition: 4,
    },
  ]);

  let methods = [
    {
      method: 'addPlayoffStructures',
      params: {
        structureId,
        drawId,

        playoffGroups: [
          {
            drawType: SINGLE_ELIMINATION,
            structureName: 'Playoff 1-2',
            finishingPositions: [1],
          },
          {
            drawType: SINGLE_ELIMINATION,
            structureName: 'Playoff 5-6',
            finishingPositions: [3],
          },
        ],
      },
    },
  ];

  result = tournamentEngine.executionQueue(methods);
  expect(result.success).toEqual(true);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  result = getPositionsPlayedOff({ drawDefinition });
  expect(result).toEqual({
    positionsNotPlayedOff: [3, 4, 7, 8],
    positionsPlayedOff: [1, 2, 5, 6],
  });

  result = tournamentEngine.executionQueue([getAvailablePlayoffs]);
  expect(result.results[0].positionsNotPlayedOff).toEqual([3, 4, 7, 8]);

  methods = [
    {
      method: 'addPlayoffStructures',
      params: {
        structureId,
        drawId,

        playoffGroups: [
          {
            drawType: SINGLE_ELIMINATION,
            structureName: 'Playoff 3-4',
            finishingPositions: [2],
          },
          {
            drawType: SINGLE_ELIMINATION,
            structureName: 'Playoff 7-8',
            finishingPositions: [4],
          },
        ],
      },
    },
  ];

  result = tournamentEngine.executionQueue(methods);
  expect(result.success).toEqual(true);
});

const scenarios: any[] = [
  {
    drawType: FIRST_MATCH_LOSER_CONSOLATION,
    generatedStructuresCount: 8,
    generatedMatchUpsCount: 48,
  },
  {
    drawType: MODIFIED_FEED_IN_CHAMPIONSHIP,
    generatedStructuresCount: 8,
    generatedMatchUpsCount: 48,
  },
  {
    drawType: FEED_IN_CHAMPIONSHIP,
    generatedStructuresCount: 8,
    generatedMatchUpsCount: 52,
  },
  {
    drawType: SINGLE_ELIMINATION,
    generatedStructuresCount: 4,
    generatedMatchUpsCount: 28,
  },
  {
    generatedStructuresCount: 4,
    generatedMatchUpsCount: 48,
    drawType: ROUND_ROBIN,
  },
  {
    generatedStructuresCount: 16,
    generatedMatchUpsCount: 48,
    drawType: COMPASS,
  },
  {
    generatedStructuresCount: 12,
    generatedMatchUpsCount: 156,
    baseMatchUpsCount: 96,
    drawType: CURTIS,
    drawSize: 64,
  },
];

it.each(scenarios)('cann ADD and REMOVE various types of playoff structures to/from ROUND_ROBIN draws', (scenario) => {
  const deletedMatchUpIds: string[] = [];
  let matchUpAddNotices: number[] = [];

  const subscriptions = {
    [ADD_MATCHUPS]: (payload) => {
      if (Array.isArray(payload)) {
        payload.forEach(({ matchUps }) => {
          matchUpAddNotices.push(matchUps.length);
        });
      }
    },
    [DELETED_MATCHUP_IDS]: (notices) => {
      notices.forEach(({ matchUpIds }) => deletedMatchUpIds.push(...matchUpIds));
    },
  };

  setSubscriptions({ subscriptions });

  const baseMatchUpsCount = 48;
  const drawSize = 32;

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN, drawSize: scenario.drawSize ?? drawSize }],
  });

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);
  matchUpAddNotices = [];

  let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  expect(matchUps.length).toEqual(scenario.baseMatchUpsCount ?? baseMatchUpsCount);

  let drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const structureId = drawDefinition.structures[0].structureId;
  const baseStructuresCount = drawDefinition.structures.length;

  const getAvailablePlayoffs = {
    method: 'getAvailablePlayoffProfiles',
    params: {
      structureId,
      drawId,
    },
  };

  result = tournamentEngine.executionQueue([getAvailablePlayoffs]);
  expect(result.results.length).toEqual(1); // not a mutation; not expecting SUCCESS

  const methods = [
    {
      method: 'addPlayoffStructures',
      params: {
        structureId,
        drawId,

        playoffGroups: [
          {
            structureName: 'Playoff 1-2',
            drawType: scenario.drawType,
            finishingPositions: [1],
          },
          {
            structureName: 'Playoff 3-4',
            drawType: scenario.drawType,
            finishingPositions: [2],
          },
          {
            structureName: 'Playoff 5-6',
            drawType: scenario.drawType,
            finishingPositions: [3],
          },
          {
            structureName: 'Playoff 7-8',
            drawType: scenario.drawType,
            finishingPositions: [4],
          },
        ],
      },
    },
  ];

  result = tournamentEngine.executionQueue(methods);
  expect(result.success).toEqual(true);
  const addedStructureIds = result.results[0].addedStructureIds;

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;

  const generatedStructuresCount = drawDefinition.structures.length - baseStructuresCount;
  expect(addedStructureIds.length).toEqual(generatedStructuresCount);

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const matchUpsCount = matchUps.length;
  const generatedMatchUpsCount = matchUpsCount - baseMatchUpsCount;
  expect(generatedStructuresCount).toEqual(scenario.generatedStructuresCount);
  expect(generatedMatchUpsCount).toEqual(scenario.generatedMatchUpsCount);

  const groupsCount = methods[0].params.playoffGroups.length;
  const structureIdGroups = chunkByNth(addedStructureIds, groupsCount);
  expect(structureIdGroups.length).toEqual(groupsCount);

  const structuresCount = drawDefinition.structures.length;
  // deleting the first structure of each structureIdGroup should delete all child structures
  result = tournamentEngine.removeStructure({
    structureId: structureIdGroups[0][0],
    drawId,
  });
  expect(result.success).toEqual(true);

  // only deleted 1 of the playoff structures
  expect(matchUpAddNotices[0] / groupsCount).toEqual(deletedMatchUpIds.length);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const deletedStructuresCount = structuresCount - drawDefinition.structures.length;

  expect(deletedStructuresCount).toEqual(result.removedStructureIds.length);

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const deletedMatchUpsCount = matchUpsCount - matchUps.length;
  expect(deletedMatchUpsCount).toEqual(result.removedMatchUpIds.length);
});
