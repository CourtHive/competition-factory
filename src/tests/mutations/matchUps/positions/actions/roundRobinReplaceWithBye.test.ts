import { replaceWithAlternate, replaceWithBye } from '@Tests/mutations/drawDefinitions/testingUtilities';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { instanceCount } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

it('can replace positioned participant with a bye and move to ALTERNATEs', () => {
  const drawProfiles = [
    {
      drawSize: 4,
      alternatesCount: 10,
      participantsCount: 4,
      drawType: ROUND_ROBIN,
    },
  ];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  const {
    drawDefinition: {
      structures: [structure],
    },
  } = tournamentEngine.getEvent({ drawId });
  const structureId = structure.structureId;

  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  let matchUpStatuses = matchUps.map(({ matchUpStatus }) => matchUpStatus);
  expect(instanceCount(matchUpStatuses)[TO_BE_PLAYED]).toEqual(6);

  let result = replaceWithBye({ drawId, structureId, drawPosition: 1 });
  expect(result.success).toEqual(true);
  result = replaceWithBye({ drawId, structureId, drawPosition: 2 });
  expect(result.success).toEqual(true);
  result = replaceWithBye({ drawId, structureId, drawPosition: 3 });
  expect(result.success).toEqual(true);
  result = replaceWithBye({ drawId, structureId, drawPosition: 4 });
  expect(result.success).toEqual(true);

  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  matchUpStatuses = matchUps.map(({ matchUpStatus }) => matchUpStatus);
  expect(instanceCount(matchUpStatuses)[BYE]).toEqual(6);

  result = replaceWithAlternate({ drawId, structureId, drawPosition: 4 });
  expect(result.success).toEqual(true);
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  matchUpStatuses = matchUps.map(({ matchUpStatus }) => matchUpStatus);
  expect(instanceCount(matchUpStatuses)[BYE]).toEqual(6);

  result = replaceWithAlternate({ drawId, structureId, drawPosition: 2 });
  expect(result.success).toEqual(true);

  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  matchUpStatuses = matchUps.map(({ matchUpStatus }) => matchUpStatus);
  expect(instanceCount(matchUpStatuses)[TO_BE_PLAYED]).toEqual(1);

  result = replaceWithAlternate({ drawId, structureId, drawPosition: 3 });
  expect(result.success).toEqual(true);
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  matchUpStatuses = matchUps.map(({ matchUpStatus }) => matchUpStatus);
  expect(instanceCount(matchUpStatuses)[TO_BE_PLAYED]).toEqual(3);

  result = replaceWithAlternate({ drawId, structureId, drawPosition: 1 });
  expect(result.success).toEqual(true);

  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  matchUpStatuses = matchUps.map(({ matchUpStatus }) => matchUpStatus);
  expect(instanceCount(matchUpStatuses)[TO_BE_PLAYED]).toEqual(6);
});
