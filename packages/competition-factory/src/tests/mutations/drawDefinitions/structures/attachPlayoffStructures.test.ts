import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { EXISTING_STRUCTURE, INVALID_VALUES } from '@Constants/errorConditionConstants';

it('will not allow attaching structures with links duplicating existing links', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
  });

  tournamentEngine.setState(tournamentRecord);

  let result = tournamentEngine.getAvailablePlayoffProfiles({ drawId });
  const { playoffRounds, structureId } = result.availablePlayoffProfiles[0];
  const { positionsPlayedOff } = result;

  expect(playoffRounds).toEqual([1, 2, 3, 4]);
  expect(positionsPlayedOff).toEqual([1, 2]);

  let roundProfiles: any = [{ [3]: 1 }];
  result = tournamentEngine.generateAndPopulatePlayoffStructures({
    roundProfiles,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.attachPlayoffStructures({ drawId, ...result });
  expect(result.success).toEqual(true);

  result = tournamentEngine.generateAndPopulatePlayoffStructures({
    roundProfiles,
    structureId,
    drawId,
  });
  // will not allow generation of a structure which already exists
  expect(result.error).toEqual(INVALID_VALUES);

  roundProfiles = [{ [4]: 1 }];
  result = tournamentEngine.generateAndPopulatePlayoffStructures({
    roundProfiles,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  // this time generate the duplicate structures BEFORE attaching (simulate dual-tabbing)
  const secondResult = tournamentEngine.generateAndPopulatePlayoffStructures({
    roundProfiles,
    structureId,
    drawId,
  });
  expect(secondResult.success).toEqual(true);

  result = tournamentEngine.attachPlayoffStructures({ drawId, ...result });
  expect(result.success).toEqual(true);

  result = tournamentEngine.attachPlayoffStructures({
    ...secondResult,
    drawId,
  });
  expect(result.error).toEqual(EXISTING_STRUCTURE);
});
