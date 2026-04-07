import { generateDrawTypeAndModifyDrawDefinition } from '@Assemblies/generators/drawDefinitions/generateDrawTypeAndModifyDrawDefinition';
import { newDrawDefinition } from '@Assemblies/generators/drawDefinitions/newDrawDefinition';
import { expect, it } from 'vitest';

import { DrawDefinition } from '@Types/tournamentTypes';
import { ITEM, CONTAINER, WIN_RATIO, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

it('can generate Round Robin Main Draws', () => {
  let drawDefinition: DrawDefinition = newDrawDefinition();
  const drawType = ROUND_ROBIN;
  let structure = generateDrawTypeAndModifyDrawDefinition({
    drawDefinition,
    drawSize: 16,
    drawType,
  }).structures?.[0];
  expect(structure?.structureType).toEqual(CONTAINER);
  expect(structure?.finishingPosition).toEqual(WIN_RATIO);
  expect(structure?.structures?.length).toEqual(4);
  expect(structure?.structures?.[0].structureType).toEqual(ITEM);
  expect(structure?.structures?.[0].matchUps?.length).toEqual(6);

  drawDefinition = newDrawDefinition();
  structure = generateDrawTypeAndModifyDrawDefinition({
    drawDefinition,
    drawSize: 32,
    drawType,
  }).structures?.[0];
  expect(structure?.structures?.length).toEqual(8);
});

it('can generate Round Robins with varying group sizes', () => {
  let drawDefinition: DrawDefinition = newDrawDefinition();
  let structureOptions = { groupSize: 5 };
  let structure = generateDrawTypeAndModifyDrawDefinition({
    drawType: ROUND_ROBIN,
    structureOptions,
    drawDefinition,
    drawSize: 30,
  }).structures?.[0];
  expect(structure?.structures?.length).toEqual(6);
  expect(structure?.structures?.[0].matchUps?.length).toEqual(10);

  drawDefinition = newDrawDefinition();
  structureOptions = { groupSize: 3 };
  structure = generateDrawTypeAndModifyDrawDefinition({
    drawType: ROUND_ROBIN,
    structureOptions,
    drawDefinition,
    drawSize: 30,
  }).structures?.[0];
  expect(structure?.structures?.length).toEqual(10);
  expect(structure?.structures?.[0].matchUps?.length).toEqual(3);
  expect(structure?.structures?.[0].matchUps?.[0].roundNumber).toEqual(1);
  expect(structure?.structures?.[0].matchUps?.[1].roundNumber).toEqual(2);
  expect(structure?.structures?.[0].matchUps?.[0].drawPositions).toMatchObject([1, 2]);
  expect(structure?.structures?.[0].matchUps?.[1].drawPositions).toMatchObject([1, 3]);
  expect(structure?.structures?.[0].matchUps?.[2].drawPositions).toMatchObject([2, 3]);
});
