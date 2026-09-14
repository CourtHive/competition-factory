import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { xa } from '@Tools/extractAttributes';
import { expect, it } from 'vitest';

// constants
import { COMPASS } from '@Constants/drawDefinitionConstants';

it('can order structures', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, drawType: COMPASS }],
  });

  tournamentEngine.setState(tournamentRecord);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  expect(drawDefinition.structures.length).toEqual(8);

  const newOrder = [1, 3, 5, 7, 2, 4, 6, 8];
  const structureIds = drawDefinition.structures.map(xa('structureId'));
  const orderMap = Object.assign(
    {},
    ...structureIds.map((structureId, index) => ({
      [structureId]: newOrder[index],
    })),
  );
  const result = tournamentEngine.setStructureOrder({ drawId, orderMap });
  expect(result.success).toEqual(true);

  const orderedStructures = tournamentEngine.getEvent({ drawId }).drawDefinition.structures;
  const structuresOrder = orderedStructures.map(xa('structureOrder'));
  expect(structuresOrder).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  const orderedStructureIds = orderedStructures.map(xa('structureId'));
  expect(structureIds).not.toEqual(orderedStructureIds);

  const expectedStructureIdsOrder = newOrder.map((i) => structureIds[i + 1]);
  expect(expectedStructureIdsOrder).not.toEqual(orderedStructureIds);
});
