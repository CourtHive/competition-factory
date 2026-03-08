import { renameStructures } from '@Mutate/drawDefinitions/structureGovernor/renameStructures';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { INVALID_VALUES, MISSING_DRAW_DEFINITION, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { COMPASS, FIRST_MATCH_LOSER_CONSOLATION, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

it('can rename structures', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: COMPASS, drawSize: 32 }],
    setState: true,
  });

  let { drawDefinition } = tournamentEngine.getEvent({ drawId });
  let structureMap = Object.assign(
    {},
    ...drawDefinition.structures.map(({ structureId, structureName }) => ({
      [structureId]: structureName,
    })),
  );
  expect(Object.values(structureMap)).toEqual([
    'East',
    'West',
    'North',
    'South',
    'Northeast',
    'Northwest',
    'Southwest',
    'Southeast',
  ]);

  const newNames = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const structureDetails = Object.keys(structureMap).map((structureId, i) => ({
    structureName: newNames[i],
    structureId,
  }));

  const result = tournamentEngine.renameStructures({ drawId, structureDetails });
  expect(result.success).toEqual(true);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  structureMap = Object.assign(
    {},
    ...drawDefinition.structures.map(({ structureId, structureName }) => ({
      [structureId]: structureName,
    })),
  );

  expect(Object.values(structureMap)).toEqual(newNames);
});

it('can rename contained structures', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN, drawSize: 32 }],
    setState: true,
  });

  let { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const getStructureMap = (structure) =>
    structure.structures.reduce((groups, { structureId, structureName }) => {
      groups[structureId] = {
        structureName,
        structureId,
      };
      return groups;
    }, {});
  const newNames = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const structureDetails = Object.keys(getStructureMap(drawDefinition.structures[0])).map((structureId, i) => ({
    structureName: newNames[i],
    structureId,
  }));

  const result = tournamentEngine.renameStructures({ drawId, structureDetails });
  expect(result.success).toEqual(true);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const structureMap = getStructureMap(drawDefinition.structures[0]);

  expect(Object.values(structureMap).map((s: any) => s.structureName)).toEqual(newNames);
});

it('returns INVALID_VALUES when structureDetails is not an array', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: COMPASS, drawSize: 32 }],
    setState: true,
  });

  const result = tournamentEngine.renameStructures({ drawId, structureDetails: 'not an array' });
  expect(result.error).toEqual(INVALID_VALUES);
});

it('returns MISSING_DRAW_DEFINITION when drawDefinition is missing', () => {
  // Call the function directly without drawDefinition
  // @ts-expect-error testing missing drawDefinition
  const result = renameStructures({ structureDetails: [{ structureId: 'x', structureName: 'y' }] });
  expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
});

it('returns MISSING_VALUE when all structureDetails entries are invalid', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: COMPASS, drawSize: 32 }],
    setState: true,
  });

  // detail entries that are not objects
  let result = tournamentEngine.renameStructures({ drawId, structureDetails: ['not an object', 42, null] });
  expect(result.error).toEqual(MISSING_VALUE);

  // detail entries missing required fields
  result = tournamentEngine.renameStructures({
    drawId,
    structureDetails: [{ structureId: 'x' }, { structureName: 'y' }, {}],
  });
  expect(result.error).toEqual(MISSING_VALUE);
});

it('filters out invalid details and renames only valid ones', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: COMPASS, drawSize: 32 }],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const firstStructureId = drawDefinition.structures[0].structureId;

  // Mix of valid and invalid details
  const result = tournamentEngine.renameStructures({
    drawId,
    structureDetails: [
      { structureId: firstStructureId, structureName: 'Renamed' },
      'not an object',
      { structureId: '', structureName: 'Missing Id' },
      { structureId: 'x', structureName: '' },
    ],
  });
  expect(result.success).toEqual(true);

  const updated = tournamentEngine.getEvent({ drawId }).drawDefinition;
  expect(updated.structures[0].structureName).toEqual('Renamed');
  // Other structures should be unchanged
  expect(updated.structures[1].structureName).toEqual('West');
});

it('handles structures without sub-structures (no structure.structures)', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 16 }],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  // FMLC has top-level structures without sub-structures
  const structureIds = drawDefinition.structures.map((s) => s.structureId);

  const structureDetails = structureIds.map((structureId, i) => ({
    structureName: `Structure ${i + 1}`,
    structureId,
  }));

  const result = tournamentEngine.renameStructures({ drawId, structureDetails });
  expect(result.success).toEqual(true);

  const updated = tournamentEngine.getEvent({ drawId }).drawDefinition;
  updated.structures.forEach((s, i) => {
    expect(s.structureName).toEqual(`Structure ${i + 1}`);
  });
});
