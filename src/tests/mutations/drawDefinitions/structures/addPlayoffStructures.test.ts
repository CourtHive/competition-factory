import { generateDrawTypeAndModifyDrawDefinition } from '@Assemblies/generators/drawDefinitions/generateDrawTypeAndModifyDrawDefinition';
import { newDrawDefinition } from '@Assemblies/generators/drawDefinitions/newDrawDefinition';
import { addPlayoffStructures } from '@Mutate/drawDefinitions/addPlayoffStructures';
import { expect, it } from 'vitest';

// Constants and types
import { FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { DrawDefinition } from '@Types/tournamentTypes';

it('can add 3-4 playoff structure to a SINGLE ELIMINATION structure', () => {
  const { success, drawDefinition } = drawEngineAddStructuresTest({
    playoffPositions: [3, 4],
    drawSize: 16,
  });
  expect(success).toEqual(true);
  const { links, structures } = drawDefinition;
  expect(links?.length).toEqual(1);
  expect(structures?.length).toEqual(2);
});

it('can add 5-8 playoff structure to a SINGLE ELIMINATION structure by playoffPositions', () => {
  const { success, drawDefinition } = drawEngineAddStructuresTest({
    playoffPositions: [5, 6, 7, 8],
    drawSize: 16,
  });
  expect(success).toEqual(true);
  const { links, structures } = drawDefinition;
  expect(links?.length).toEqual(2);
  expect(structures?.length).toEqual(3);

  // because this is drawEngine there is no attachment of drawDefinition to a tournamentRecord
});

it('can add 5-8 playoff structure to a SINGLE ELIMINATION structure by a single playoff position', () => {
  const { success, drawDefinition } = drawEngineAddStructuresTest({
    playoffPositions: [5],
    drawSize: 16,
  });
  expect(success).toEqual(true);
  const { links, structures } = drawDefinition;
  expect(links?.length).toEqual(2);
  expect(structures?.length).toEqual(3);
});

it('can add 3-8 playoff structures to a SINGLE ELIMINATION by a single playoff position from each structure', () => {
  const { success, drawDefinition } = drawEngineAddStructuresTest({
    playoffPositions: [3, 5],
    drawSize: 16,
  });
  expect(success).toEqual(true);
  const { links, structures } = drawDefinition;
  expect(links?.length).toEqual(3);
  expect(structures?.length).toEqual(4);
});

it('can add 3-8 playoff structures to a SINGLE ELIMINATION by roundNumbers', () => {
  const { success, drawDefinition } = drawEngineAddStructuresTest({
    roundNumbers: [2, 3],
    drawSize: 16,
  });
  expect(success).toEqual(true);
  const { links, structures } = drawDefinition;
  expect(links?.length).toEqual(3);
  expect(structures?.length).toEqual(4);
});

it('can add 5-8 playoff structure to a SINGLE ELIMINATION structure by roundNumbers', () => {
  const result = drawEngineAddStructuresTest({
    roundNumbers: [2],
    drawSize: 16,
  });
  expect(result.success).toEqual(true);
  const { links, structures } = result.drawDefinition;
  expect(links?.length).toEqual(2);
  expect(structures?.length).toEqual(3);
});

it('can add 3-4 playoff structure to a FIRST_MATCH_LOSER_CONSOLATION structure', () => {
  const { success, drawDefinition } = drawEngineAddStructuresTest({
    drawType: FIRST_MATCH_LOSER_CONSOLATION,
    playoffPositions: [3, 4],
    drawSize: 16,
  });
  expect(success).toEqual(true);
  const { links, structures } = drawDefinition;
  expect(links?.length).toEqual(3);
  expect(structures?.length).toEqual(3);
});

function drawEngineAddStructuresTest(params) {
  const { playoffPositions, roundNumbers, drawSize, drawType } = params;

  const drawDefinition: DrawDefinition = newDrawDefinition();
  let result = generateDrawTypeAndModifyDrawDefinition({
    drawDefinition,
    drawSize,
    drawType,
  });
  expect(result.success).toEqual(true);

  const mainStructure = drawDefinition.structures?.find((structure) => structure.stage === MAIN);
  result = addPlayoffStructures({
    structureId: mainStructure?.structureId,
    playoffPositions,
    drawDefinition,
    roundNumbers,
  });

  return { ...result, drawDefinition };
}
