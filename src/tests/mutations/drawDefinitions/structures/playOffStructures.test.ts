import { generateDrawTypeAndModifyDrawDefinition } from '@Assemblies/generators/drawDefinitions/generateDrawTypeAndModifyDrawDefinition';
import { newDrawDefinition } from '@Assemblies/generators/drawDefinitions/newDrawDefinition';
import { setStageDrawSize } from '@Mutate/drawDefinitions/entryGovernor/stageEntryCounts';
import { instanceCount } from '@Tools/arrays';
import { numericSort } from '@Tools/sorting';
import { expect, it } from 'vitest';

// Constants and types
import { TOP_DOWN, LOSER, COMPASS, PLAYOFF, MAIN } from '@Constants/drawDefinitionConstants';
import { DrawDefinition } from '@Types/tournamentTypes';
import { ERROR } from '@Constants/resultConstants';

it('can generate compass draws', () => {
  let result: any = playoffDraw({
    drawType: COMPASS,
    drawSize: 3,
  }).result;
  expect(result).toHaveProperty(ERROR);

  let drawDefinition =
    playoffDraw({
      drawType: COMPASS,
      drawSize: 4,
    }).drawDefinition ?? {};
  expect(drawDefinition.links?.length).toEqual(1);
  expect(drawDefinition.structures?.length).toEqual(2);
  let structureNames = drawDefinition.structures?.map((structure) => structure.structureName);
  ['East', 'West'].forEach((direction) => expect(structureNames?.includes(direction)).toEqual(true));

  drawDefinition =
    playoffDraw({
      drawType: COMPASS,
      drawSize: 8,
    }).drawDefinition ?? {};
  expect(drawDefinition.links?.length).toEqual(3);
  expect(drawDefinition.structures?.length).toEqual(4);
  structureNames = drawDefinition.structures?.map((structure) => structure.structureName);
  ['East', 'West', 'North', 'South'].forEach((direction) => expect(structureNames?.includes(direction)).toEqual(true));

  drawDefinition =
    playoffDraw({
      drawSize: 32,
      drawType: COMPASS,
    }).drawDefinition ?? {};
  expect(drawDefinition.links?.length).toEqual(7);
  expect(drawDefinition.structures?.length).toEqual(8);
  drawDefinition.links?.forEach((link) => {
    expect(link.linkType).toEqual(LOSER);
    expect(link.target.feedProfile).toEqual(TOP_DOWN);
  });
  structureNames = drawDefinition.structures?.map((structure) => structure.structureName);
  ['East', 'West', 'North', 'South', 'Northeast', 'Southwest', 'Northwest', 'Southeast'].forEach((direction) => {
    expect(structureNames?.includes(direction)).toEqual(true);
  });

  ({ result, drawDefinition } = playoffDraw({
    drawSize: 64,
    drawType: COMPASS,
  }));
  expect(result).not.toHaveProperty(ERROR);
  expect(drawDefinition.links?.length).toEqual(7);
  expect(drawDefinition.structures?.length).toEqual(8);
});

it('generates compass draws with correct links', () => {
  const { result, drawDefinition } = playoffDraw({
    drawSize: 32,
    drawType: COMPASS,
  });
  expect(result).not.toHaveProperty(ERROR);

  const links = drawDefinition.links;
  expect(links?.length).toEqual(7);

  const structureNameMap = Object.assign(
    {},
    ...(drawDefinition.structures ?? []).map(({ structureId, structureName = '' }) => ({
      [structureName]: structureId,
    })),
  );

  expect(
    confirmUniqueLink({
      links,
      sourceStructureId: structureNameMap['East'],
      targetStructureId: structureNameMap['West'],
      sourceRound: 1,
      targetRound: 1,
    }),
  ).toEqual(true);
  expect(
    confirmUniqueLink({
      links,
      sourceStructureId: structureNameMap['West'],
      targetStructureId: structureNameMap['South'],
      sourceRound: 1,
      targetRound: 1,
    }),
  ).toEqual(true);
  expect(
    confirmUniqueLink({
      links,
      sourceStructureId: structureNameMap['South'],
      targetStructureId: structureNameMap['Southeast'],
      sourceRound: 1,
      targetRound: 1,
    }),
  ).toEqual(true);
  expect(
    confirmUniqueLink({
      links,
      sourceStructureId: structureNameMap['North'],
      targetStructureId: structureNameMap['Northwest'],
      sourceRound: 1,
      targetRound: 1,
    }),
  ).toEqual(true);
  expect(
    confirmUniqueLink({
      links,
      sourceStructureId: structureNameMap['West'],
      targetStructureId: structureNameMap['Southwest'],
      sourceRound: 2,
      targetRound: 1,
    }),
  ).toEqual(true);
  expect(
    confirmUniqueLink({
      links,
      sourceStructureId: structureNameMap['East'],
      targetStructureId: structureNameMap['North'],
      sourceRound: 2,
      targetRound: 1,
    }),
  ).toEqual(true);
  expect(
    confirmUniqueLink({
      links,
      sourceStructureId: structureNameMap['East'],
      targetStructureId: structureNameMap['Northeast'],
      sourceRound: 3,
      targetRound: 1,
    }),
  ).toEqual(true);

  // also test false conditions
  expect(
    confirmUniqueLink({
      links,
      sourceStructureId: structureNameMap['East'],
      targetStructureId: structureNameMap['West'],
      sourceRound: 2,
      targetRound: 1,
    }),
  ).toEqual(false);
  expect(
    confirmUniqueLink({
      links,
      sourceStructureId: structureNameMap['East'],
      targetStructureId: structureNameMap['South'],
      sourceRound: 1,
      targetRound: 1,
    }),
  ).toEqual(false);
});

it('generates compass draws with correct finishing drawPositions', () => {
  let drawDefinition =
    playoffDraw({
      drawSize: 32,
      drawType: COMPASS,
    }).drawDefinition ?? {};
  expect(drawDefinition.links?.length).toEqual(7);
  expect(drawDefinition.structures?.length).toEqual(8);

  let structures = drawDefinition.structures;

  let structureNameMap = Object.assign(
    {},
    ...(structures ?? []).map(({ structureId, structureName = '' }) => ({
      [structureName]: structureId,
    })),
  );

  let matchUp = findMatchInStructures({
    structures,
    structureId: structureNameMap['East'],
    roundNumber: 1,
    roundPosition: 1,
  });
  expect(matchUp.finishingPositionRange.loser).toMatchObject([17, 32]);

  matchUp = findMatchInStructures({
    structures,
    structureId: structureNameMap['West'],
    roundNumber: 1,
    roundPosition: 1,
  });
  expect(matchUp.finishingPositionRange.loser).toMatchObject([25, 32]);

  matchUp = findMatchInStructures({
    structures,
    structureId: structureNameMap['South'],
    roundNumber: 1,
    roundPosition: 1,
  });
  expect(matchUp.finishingPositionRange.loser).toMatchObject([29, 32]);

  matchUp = findMatchInStructures({
    structures,
    structureId: structureNameMap['Southeast'],
    roundNumber: 1,
    roundPosition: 1,
  });
  expect(matchUp.finishingPositionRange.loser).toMatchObject([31, 32]);

  matchUp = findMatchInStructures({
    structures,
    structureId: structureNameMap['North'],
    roundNumber: 1,
    roundPosition: 1,
  });
  expect(matchUp.finishingPositionRange.loser).toMatchObject([13, 16]);

  matchUp = findMatchInStructures({
    structures,
    structureId: structureNameMap['Northwest'],
    roundNumber: 1,
    roundPosition: 1,
  });
  expect(matchUp.finishingPositionRange.loser).toMatchObject([15, 16]);

  matchUp = findMatchInStructures({
    structures,
    structureId: structureNameMap['Northeast'],
    roundNumber: 1,
    roundPosition: 1,
  });
  expect(matchUp.finishingPositionRange.loser).toMatchObject([7, 8]);

  matchUp = findMatchInStructures({
    structures,
    structureId: structureNameMap['Southwest'],
    roundNumber: 1,
    roundPosition: 1,
  });
  expect(matchUp.finishingPositionRange.loser).toMatchObject([23, 24]);

  drawDefinition =
    playoffDraw({
      drawType: COMPASS,
      drawSize: 64,
    }).drawDefinition ?? {};
  expect(drawDefinition.links?.length).toEqual(7);
  expect(drawDefinition.structures?.length).toEqual(8);

  structures = drawDefinition.structures;
  structureNameMap = Object.assign(
    {},
    ...(structures ?? []).map(({ structureId, structureName = '' }) => ({
      [structureName]: structureId,
    })),
  );

  matchUp = findMatchInStructures({
    structureId: structureNameMap['East'],
    roundPosition: 1,
    roundNumber: 1,
    structures,
  });
  expect(matchUp.finishingPositionRange.loser).toMatchObject([33, 64]);

  matchUp = findMatchInStructures({
    structures,
    structureId: structureNameMap['West'],
    roundNumber: 1,
    roundPosition: 1,
  });
  expect(matchUp.finishingPositionRange.loser).toMatchObject([49, 64]);

  matchUp = findMatchInStructures({
    structures,
    structureId: structureNameMap['South'],
    roundNumber: 1,
    roundPosition: 1,
  });
  expect(matchUp.finishingPositionRange.loser).toMatchObject([57, 64]);

  matchUp = findMatchInStructures({
    structures,
    structureId: structureNameMap['Southeast'],
    roundNumber: 1,
    roundPosition: 1,
  });
  expect(matchUp.finishingPositionRange.loser).toMatchObject([61, 64]);

  matchUp = findMatchInStructures({
    structures,
    structureId: structureNameMap['North'],
    roundNumber: 1,
    roundPosition: 1,
  });
  expect(matchUp.finishingPositionRange.loser).toMatchObject([25, 32]);

  matchUp = findMatchInStructures({
    structures,
    structureId: structureNameMap['Northwest'],
    roundNumber: 1,
    roundPosition: 1,
  });
  expect(matchUp.finishingPositionRange.loser).toMatchObject([29, 32]);

  matchUp = findMatchInStructures({
    structures,
    structureId: structureNameMap['Northeast'],
    roundNumber: 1,
    roundPosition: 1,
  });
  expect(matchUp.finishingPositionRange.loser).toMatchObject([13, 16]);

  matchUp = findMatchInStructures({
    structures,
    structureId: structureNameMap['Southwest'],
    roundNumber: 1,
    roundPosition: 1,
  });
  expect(matchUp.finishingPositionRange.loser).toMatchObject([45, 48]);
});

it('can generate draw which plays off all drawPositions', () => {
  const { result, drawDefinition } = playoffDraw({
    drawType: PLAYOFF,
    drawSize: 64,
  });
  expect(result).not.toHaveProperty(ERROR);
  expect(drawDefinition?.links?.length).toEqual(31);
  expect(drawDefinition?.structures?.length).toEqual(32);
  drawDefinition?.links?.forEach((link) => expect(link.target.feedProfile).toEqual(TOP_DOWN));
  const structureNames = drawDefinition?.structures?.map((structure) => structure.structureName);
  const stageSequences = drawDefinition?.structures?.map(({ stageSequence }) => stageSequence).sort(numericSort);

  const stageSequenceCount = instanceCount(stageSequences);
  expect(stageSequenceCount).toEqual({ 1: 1, 2: 5, 3: 10, 4: 10, 5: 5, 6: 1 });

  [
    '1-64',
    '33-64',
    '49-64',
    '57-64',
    '61-64',
    '63-64',
    '59-60',
    '53-56',
    '55-56',
    '51-52',
    '41-48',
    '45-48',
    '47-48',
    '43-44',
    '37-40',
    '39-40',
    '35-36',
    '17-32',
    '25-32',
    '29-32',
    '31-32',
    '27-28',
    '21-24',
    '23-24',
    '19-20',
    '9-16',
    '13-16',
    '15-16',
    '11-12',
    '5-8',
    '7-8',
    '3-4',
  ].forEach((playoff) => {
    expect(structureNames?.includes(playoff)).toEqual(true);
  });
});

it('can generate elimination which specifies drawPositions to playoff', () => {
  let drawDefinition =
    playoffDraw({
      finishingPositionLimit: 4,
      drawType: PLAYOFF,
      drawSize: 16,
    }).drawDefinition ?? {};
  expect(drawDefinition.links?.length).toEqual(1);
  expect(drawDefinition.structures?.length).toEqual(2);
  expect(drawDefinition.structures?.[0].matchUps?.length).toEqual(15);
  expect(drawDefinition.structures?.[1].matchUps?.length).toEqual(1);

  drawDefinition =
    playoffDraw({
      finishingPositionLimit: 8,
      drawType: PLAYOFF,
      drawSize: 16,
    }).drawDefinition ?? {};
  expect(drawDefinition.links?.length).toEqual(3);
  expect(drawDefinition.structures?.length).toEqual(4);
  expect(drawDefinition.structures?.[0].matchUps?.length).toEqual(15);
  expect(drawDefinition.structures?.[1].matchUps?.length).toEqual(3);
  expect(drawDefinition.structures?.[2].matchUps?.length).toEqual(1);
  expect(drawDefinition.structures?.[3].matchUps?.length).toEqual(1);

  drawDefinition =
    playoffDraw({
      finishingPositionLimit: 8,
      drawType: PLAYOFF,
      drawSize: 32,
    }).drawDefinition ?? {};
  expect(drawDefinition.links?.length).toEqual(3);
  expect(drawDefinition.structures?.length).toEqual(4);
  expect(drawDefinition.structures?.[0].matchUps?.length).toEqual(31);
  expect(drawDefinition.structures?.[1].matchUps?.length).toEqual(3);
  expect(drawDefinition.structures?.[2].matchUps?.length).toEqual(1);
  expect(drawDefinition.structures?.[3].matchUps?.length).toEqual(1);
});

function playoffDraw(params) {
  const { drawSize, drawType, finishingPositionLimit } = params;
  const drawDefinition: DrawDefinition = newDrawDefinition();
  setStageDrawSize({ drawDefinition, stage: MAIN, drawSize });

  const result = generateDrawTypeAndModifyDrawDefinition({
    finishingPositionLimit,
    drawDefinition,
    drawType,
  });
  return { result, drawDefinition };
}

function findMatchInStructures({ structures, structureId, roundNumber, roundPosition }) {
  const structure = structures.reduce((p, c) => (c.structureId === structureId ? c : p), undefined);

  return structure.matchUps.reduce(
    (p, c) => (c.roundNumber === roundNumber && c.roundPosition === roundPosition ? c : p),
    undefined,
  );
}

function confirmUniqueLink({ links, sourceStructureId, targetStructureId, sourceRound, targetRound }) {
  const matchingLinks = links.reduce((p, c) => {
    const test1 = c.source.structureId === sourceStructureId;
    const test2 = c.target.structureId === targetStructureId;
    const test3 = c.source.roundNumber === sourceRound;
    const test4 = c.target.roundNumber === targetRound;
    return test1 && test2 && test3 && test4 ? p.concat(c) : p;
  }, []);
  return matchingLinks.length === 1;
}
