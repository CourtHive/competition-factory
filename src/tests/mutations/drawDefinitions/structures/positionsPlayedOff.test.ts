import { generateDrawTypeAndModifyDrawDefinition } from '@Assemblies/generators/drawDefinitions/generateDrawTypeAndModifyDrawDefinition';
import { newDrawDefinition } from '@Assemblies/generators/drawDefinitions/newDrawDefinition';
import { getPositionsPlayedOff } from '@Query/drawDefinition/getPositionsPlayedOff';
import { expect, it } from 'vitest';

// constants and types
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DrawDefinition } from '@Types/tournamentTypes';

it('can correctly determin positions playedOff for STANDARD_ELIMINATION', () => {
  const drawDefinition: DrawDefinition = newDrawDefinition();
  const result = generateDrawTypeAndModifyDrawDefinition({ drawDefinition, drawSize: 16 });
  expect(result.success).toEqual(true);

  const structureIds = drawDefinition.structures?.map((s) => s.structureId);

  const { positionsPlayedOff } = getPositionsPlayedOff({
    drawDefinition,
    structureIds,
  });
  expect(positionsPlayedOff).toEqual([1, 2]);
});

it('can correctly determin positions playedOff for FIRST_MATCH_LOSER_CONSOLATION', () => {
  const drawDefinition: DrawDefinition = newDrawDefinition();
  const result = generateDrawTypeAndModifyDrawDefinition({
    drawType: FIRST_MATCH_LOSER_CONSOLATION,
    drawDefinition,
    drawSize: 16,
  });
  expect(result.success).toEqual(true);
  const structureIds = result.drawDefinition?.structures?.map((s) => s.structureId);

  const { positionsPlayedOff } = getPositionsPlayedOff({
    drawDefinition,
    structureIds,
  });
  expect(positionsPlayedOff).toEqual([1, 2, 9, 10]);
});
