import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { constantToString } from '@Tools/strings';
import { generateRange } from '@Tools/arrays';
import { deriveExponent } from '@Tools/math';
import { globalState } from '../../..';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, MAIN, PLAYOFF } from '@Constants/drawDefinitionConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

it('errors if attempting generation of existing playoff structure', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
  });

  tournamentEngine.setState(tournamentRecord);

  const roundProfiles = [{ 3: 1 }, { 4: 1 }];
  const playoffAttributes = {
    '0-3': { name: 'Silver', abbreviation: 'S' },
    '0-4': { name: 'Gold', abbreviation: 'G' },
  };
  const {
    drawDefinition: {
      structures: [{ structureId }],
    },
  } = tournamentEngine.getEvent({ drawId });

  let result = tournamentEngine.addPlayoffStructures({
    playoffStructureNameBase: 'Playoff',
    playoffAttributes,
    roundProfiles,
    structureId,
    drawId,
  });

  expect(result.success).toEqual(true);

  result = tournamentEngine.addPlayoffStructures({
    playoffStructureNameBase: 'Playoff',
    playoffAttributes,
    roundProfiles,
    structureId,
    drawId,
  });

  // cannot add the same playoff structures multiple times
  expect(result.error).toEqual(INVALID_VALUES);
});

it.each([
  [32, INVALID_VALUES, undefined],
  [64, undefined, 74],
])('can add Silver, Gold and 3-4 playoff structures, then delete them', (drawSize, error, playoffMatchesCount) => {
  const drawProfiles = [{ drawSize }];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);
  let { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
  expect(matchUps.length).toEqual(drawSize - 1);

  const roundProfiles = [{ 3: 1 }, { 4: 1 }, { 5: 1 }];
  const playoffAttributes = {
    '0-3': { name: 'Silver', abbreviation: 'S' },
    '0-4': { name: 'Gold', abbreviation: 'G' },
  };
  const {
    drawDefinition: {
      structures: [{ structureId }],
    },
  } = tournamentEngine.getEvent({ drawId });

  const result = tournamentEngine.addPlayoffStructures({
    playoffStructureNameBase: 'Playoff',
    playoffAttributes,
    roundProfiles,
    structureId,
    drawId,
  });

  if (error) {
    expect(result.error).toEqual(error);
  } else {
    expect(result.success).toEqual(true);
    const {
      drawDefinition: { structures },
    } = tournamentEngine.getEvent({ drawId });

    for (const structure of structures) {
      expect(structure.updatedAt).not.toBeUndefined();
    }

    const structureNames = structures.map(({ structureName }) => structureName);
    expect(structureNames).toEqual([constantToString(MAIN), 'Silver', 'Gold', 'Playoff 3-4']);

    ({ matchUps } = tournamentEngine.allDrawMatchUps({ drawId }));
    expect(matchUps.length).toEqual(playoffMatchesCount);

    const playoffStructureIds = structures.map(({ structureId }) => structureId).filter((s) => s !== structureId);

    playoffStructureIds.forEach((structureId) => {
      const result = tournamentEngine.removeStructure({
        structureId,
        drawId,
      });
      expect(result.success).toEqual(true);
    });

    ({ matchUps } = tournamentEngine.allDrawMatchUps({ drawId }));
    expect(matchUps.length).toEqual(drawSize - 1);
  }
});

it.each([32, 64])('can delete playoffStructures beyond stageSequence 2', (drawSize: number) => {
  const drawProfiles = [{ drawSize, drawType: PLAYOFF }];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);
  let {
    drawDefinition: { structures },
  } = tournamentEngine.getEvent({ drawId });
  const [{ structureId }] = structures;

  const generatedStructuresCount = structures.length;

  const apResult = tournamentEngine.getAvailablePlayoffProfiles({
    structureId,
    drawId,
  });
  let { playoffRounds, playoffRoundsRanges } = apResult;
  const { positionsPlayedOff } = apResult;
  // since this is a PLAY_OFF structure there are no available structures to add
  expect(playoffRounds).toEqual([]);
  expect(playoffRoundsRanges).toEqual([]);
  expect(positionsPlayedOff).toEqual(generateRange(1, drawSize + 1));

  const stageSequence2structureIds = structures
    .filter(({ stageSequence }) => stageSequence === 2)
    .map(({ structureId }) => structureId);

  const deletedStructureCounts = stageSequence2structureIds.map((structureId) => {
    const result = tournamentEngine.removeStructure({
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);
    return result.removedStructureIds.length;
  });

  expect(deletedStructureCounts.length).toEqual(stageSequence2structureIds.length);

  expect(deletedStructureCounts.reduce((a, b) => a + b, 0)).toEqual(generatedStructuresCount - 1);

  structures = tournamentEngine.getEvent({ drawId }).drawDefinition.structures;
  expect(structures.length).toEqual(1);

  ({ playoffRounds, playoffRoundsRanges } = tournamentEngine.getAvailablePlayoffProfiles({
    structureId,
    drawId,
  }));

  const rangeMap = playoffRoundsRanges.map(
    ({ finishingPositionRange, roundNumber }) => `${roundNumber}|${finishingPositionRange}`,
  );
  if (drawSize === 32) {
    expect(rangeMap).toEqual(['1|17-32', '2|9-16', '3|5-8', '4|3-4']);
  } else if (drawSize === 64) {
    expect(rangeMap).toEqual(['1|33-64', '2|17-32', '3|9-16', '4|5-8', '5|3-4']);
  }
  const expectdPlayoffRounds = (deriveExponent(drawSize) || 0) - 1;
  expect(playoffRounds.length).toEqual(expectdPlayoffRounds);
});

it('can add 3-4 playoff structure to a SINGLE ELIMINATION structure', () => {
  const { success, drawDefinition } = tournamentEngineAddPlayoffsTest({
    playoffStructureNameBase: 'Playoff',
    playoffPositions: [3, 4],
    drawSize: 16,
  });
  expect(success).toEqual(true);

  const { links, structures } = drawDefinition;
  expect(links.length).toEqual(1);
  expect(structures.length).toEqual(2);
  expect(structures[1].structureName).toEqual('Playoff 3-4');
});

it('can add 5-8 playoff structure to a SINGLE ELIMINATION structure', () => {
  const { success, drawDefinition } = tournamentEngineAddPlayoffsTest({
    playoffPositions: [5, 6, 7, 8],
    drawSize: 16,
  });
  expect(success).toEqual(true);
  const { links, structures } = drawDefinition;
  expect(links.length).toEqual(2);
  expect(structures.length).toEqual(3);
});

it('can add playoff structures to a FIRST_MATCH_LOSER_CONSOLATION structure', () => {
  const allMatchUps: any[] = [];
  let matchUpAddNotices = 0;

  const subscriptions = {
    addMatchUps: (payload) => {
      if (Array.isArray(payload)) {
        payload.forEach(({ matchUps }) => {
          matchUpAddNotices += 1;
          allMatchUps.push(...matchUps);
        });
      }
    },
  };

  globalState.setSubscriptions({ subscriptions });

  const { success, drawDefinition } = tournamentEngineAddPlayoffsTest({
    drawSize: 16,
    playoffPositions: [3, 4],
    drawType: FIRST_MATCH_LOSER_CONSOLATION,
  });
  expect(success).toEqual(true);
  const { links, structures } = drawDefinition;
  expect(links.length).toEqual(3);
  expect(structures.length).toEqual(3);

  expect(allMatchUps.length).toEqual(27);
  expect(matchUpAddNotices).toEqual(2);
});

function tournamentEngineAddPlayoffsTest(params) {
  const { playoffStructureNameBase, playoffPositions, roundNumbers, drawSize, drawType } = params;
  const drawProfiles = [{ drawSize, drawType }];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles });
  tournamentEngine.setState(tournamentRecord);
  const {
    drawDefinition: {
      structures: [{ structureId }],
    },
  } = tournamentEngine.getEvent({ drawId });

  const result = tournamentEngine.addPlayoffStructures({
    playoffStructureNameBase,
    playoffPositions,
    roundNumbers,
    structureId,
    drawId,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  return { ...result, drawDefinition };
}
