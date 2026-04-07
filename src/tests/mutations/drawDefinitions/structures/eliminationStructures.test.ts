import { generateDrawTypeAndModifyDrawDefinition } from '@Assemblies/generators/drawDefinitions/generateDrawTypeAndModifyDrawDefinition';
import { treeMatchUps } from '@Assemblies/generators/drawDefinitions/drawTypes/eliminationTree';
import { validDrawPositions } from '@Validators/validDrawPositions';
import { DrawDefinition } from '@Types/tournamentTypes';
import { structureSort } from '@Functions/sorters/structureSort';
import { newDrawDefinition } from '@Assemblies/generators/drawDefinitions/newDrawDefinition';
import { expect, it } from 'vitest';

import { ERROR } from '@Constants/resultConstants';
import {
  MAIN,
  CONSOLATION,
  TOP_DOWN,
  BOTTOM_UP,
  FIRST_MATCH_LOSER_CONSOLATION,
  LOSER,
  CURTIS,
  SINGLE_ELIMINATION,
  COMPASS,
  PLAY_OFF,
  AGGREGATE_EVENT_STRUCTURES,
} from '@Constants/drawDefinitionConstants';

it('can generate main draw', () => {
  const drawDefinition = newDrawDefinition();

  const structure = generateDrawTypeAndModifyDrawDefinition({ drawDefinition, drawSize: 16 })?.structures?.[0];
  const matchUps = structure?.matchUps ?? [];
  const matchUpsCount = matchUps?.length;
  expect(matchUpsCount).toEqual(15);

  const drawPositions = [
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [9, 10],
    [11, 12],
    [13, 14],
    [15, 16],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
  ];

  matchUps.forEach((matchUp, i) => expect(matchUp.drawPositions?.filter(Boolean)).toMatchObject(drawPositions[i]));

  const finishingRounds = [4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 2, 2, 1];
  matchUps.forEach((matchUp, i) => expect(matchUp.finishingRound).toEqual(finishingRounds[i]));

  expect(validDrawPositions({ matchUps })).toEqual(true);
});

it('generates main draw with expected finishing drawPositions', () => {
  const drawDefinition = newDrawDefinition();
  const structure = generateDrawTypeAndModifyDrawDefinition({ drawDefinition, drawSize: 16 })?.structures?.[0];
  const matchUps = structure?.matchUps ?? [];
  const matchesCount = matchUps?.length;
  expect(matchesCount).toEqual(15);

  const finishingPositionRanges = [
    { loser: [9, 16], winner: [1, 8] },
    { loser: [5, 8], winner: [1, 4] },
    { loser: [3, 4], winner: [1, 2] },
    { loser: [2, 2], winner: [1, 1] },
  ];

  matchUps.forEach((matchUp) => {
    // @ts-expect-error possibly undefined
    const roundIndex = matchUp.roundNumber - 1;
    const expectedLoserRange = finishingPositionRanges[roundIndex].loser;
    const expectedWinnerRange = finishingPositionRanges[roundIndex].winner;
    expect(matchUp.finishingPositionRange?.loser).toMatchObject(expectedLoserRange);
    expect(matchUp.finishingPositionRange?.winner).toMatchObject(expectedWinnerRange);
  });
});

it('can set roundLimit and produce expected finishingRounds', () => {
  const { matchUps } = treeMatchUps({ drawSize: 16, roundLimit: 2 });
  expect(matchUps.length).toEqual(12);
  const finishingRounds = [2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1];
  matchUps.forEach((matchUp, i) => expect(matchUp.finishingRound).toEqual(finishingRounds[i]));
});

it('can generate qualifying draw based on desired qualifyingPositions', () => {
  const { matchUps } = treeMatchUps({ drawSize: 16, qualifyingPositions: 8 });
  expect(matchUps.length).toEqual(8);
  const finishingRounds = [1, 1, 1, 1, 1, 1, 1, 1];
  matchUps.forEach((matchUp, i) => expect(matchUp.finishingRound).toEqual(finishingRounds[i]));
});

it('can generate first matchUp loser consolation', () => {
  const drawDefinition: DrawDefinition = newDrawDefinition();
  const result = generateDrawTypeAndModifyDrawDefinition({
    drawType: FIRST_MATCH_LOSER_CONSOLATION,
    drawDefinition,
    drawSize: 16,
  });
  expect(result).not.toHaveProperty(ERROR);
  expect(drawDefinition.links?.length).toEqual(2);
  expect(drawDefinition.structures?.length).toEqual(2);
  const mainDraw = drawDefinition.structures?.[0];
  const consolationDraw = drawDefinition.structures?.[1];
  expect(mainDraw?.matchUps?.length).toEqual(15);
  expect(consolationDraw?.matchUps?.length).toEqual(11);
});

it('can generate a Curtis Consolation draw', () => {
  const drawDefinition: DrawDefinition = newDrawDefinition();
  const result = generateDrawTypeAndModifyDrawDefinition({
    drawType: CURTIS,
    drawDefinition,
    drawSize: 64,
  });
  const state = result?.drawDefinition;
  expect(state?.structures?.length).toEqual(4);
  expect(state?.links?.length).toEqual(5);

  const sourceRounds = [1, 2, 3, 4, 5];
  const targetRounds = [1, 2, 1, 2, 1];
  const feedProfiles = [TOP_DOWN, BOTTOM_UP, TOP_DOWN, BOTTOM_UP, TOP_DOWN];

  state?.links?.forEach((link, i) => {
    expect(link.linkType).toEqual(LOSER);
    expect(link.source.roundNumber).toEqual(sourceRounds[i]);
    expect(link.target.roundNumber).toEqual(targetRounds[i]);
    expect(link.target.feedProfile).toEqual(feedProfiles[i]);
  });

  const stageSequences = [1, 2, 1, 2];
  const matchUps = [63, 1, 47, 11];
  const stages = [MAIN, PLAY_OFF, CONSOLATION, CONSOLATION];

  const firstRoundFinishingPositions = [
    { winner: [1, 32], loser: [33, 64] },
    { winner: [3, 3], loser: [4, 4] },
    { winner: [17, 48], loser: [49, 64] },
    { winner: [5, 12], loser: [13, 16] },
  ];

  const finalRoundFinishingPositions = [
    { winner: [1, 1], loser: [2, 2] },
    { winner: [3, 3], loser: [4, 4] },
    { winner: [17, 17], loser: [18, 18] },
    { winner: [5, 5], loser: [6, 6] },
  ];

  const structures = state?.structures?.sort((a, b) => structureSort(a, b, { mode: AGGREGATE_EVENT_STRUCTURES }));

  structures?.forEach((structure, i) => {
    expect(structure.stage).toEqual(stages[i]);
    expect(structure.matchUps?.length).toEqual(matchUps[i]);
    expect(structure.stageSequence).toEqual(stageSequences[i]);

    const firstMatchUp = structure.matchUps?.[0];
    const finalMatchUp = structure.matchUps?.[structure.matchUps.length - 1];

    expect(firstMatchUp?.finishingPositionRange?.winner).toMatchObject(firstRoundFinishingPositions[i].winner);
    expect(finalMatchUp?.finishingPositionRange?.winner).toMatchObject(finalRoundFinishingPositions[i].winner);
    expect(firstMatchUp?.finishingPositionRange?.loser).toMatchObject(firstRoundFinishingPositions[i].loser);
    expect(finalMatchUp?.finishingPositionRange?.loser).toMatchObject(finalRoundFinishingPositions[i].loser);
  });
});

it('reasonably handles Curtis Consolation draw sizes less than 64', () => {
  const drawSizes = [32, 16, 8, 4];
  const structures = [3, 3, 2, 2, 1];
  const links = [4, 3, 1, 1, 0];

  drawSizes.forEach((_, i) => {
    const drawDefinition: DrawDefinition = newDrawDefinition();
    generateDrawTypeAndModifyDrawDefinition({
      drawSize: drawSizes[i],
      drawType: CURTIS,
      drawDefinition,
    });
    expect(drawDefinition.structures?.length).toEqual(structures[i]);
    expect(drawDefinition.links?.length).toEqual(links[i]);
  });
});

it('does not generate multi-structure draws with fewer than 4 participants', () => {
  const drawDefinition: DrawDefinition = newDrawDefinition();
  generateDrawTypeAndModifyDrawDefinition({
    drawTypeCoercion: false,
    drawType: CURTIS,
    drawDefinition,
    drawSize: 2,
  });
  expect(drawDefinition.structures?.length).toEqual(0);
  expect(drawDefinition.links?.length).toEqual(0);

  generateDrawTypeAndModifyDrawDefinition({
    drawTypeCoercion: false,
    drawType: COMPASS,
    drawDefinition,
    drawSize: 2,
  });
  expect(drawDefinition.structures?.length).toEqual(0);
  expect(drawDefinition.links?.length).toEqual(0);

  generateDrawTypeAndModifyDrawDefinition({
    drawType: SINGLE_ELIMINATION,
    drawDefinition,
    drawSize: 2,
  });
  expect(drawDefinition.structures?.length).toEqual(1);
  expect(drawDefinition.links?.length).toEqual(0);
});

it('can coerce multi-structure draws to SINGLE_ELIMINATION for drawSize: 2', () => {
  const drawDefinition: DrawDefinition = newDrawDefinition();
  generateDrawTypeAndModifyDrawDefinition({
    drawTypeCoercion: true,
    drawType: CURTIS,
    drawDefinition,
    drawSize: 2,
  });
  expect(drawDefinition.structures?.length).toEqual(1);

  generateDrawTypeAndModifyDrawDefinition({
    drawType: COMPASS,
    drawDefinition,
    drawSize: 2,
  });
  expect(drawDefinition.structures?.length).toEqual(1);

  generateDrawTypeAndModifyDrawDefinition({
    drawType: FIRST_MATCH_LOSER_CONSOLATION,
    drawDefinition,
    drawSize: 2,
  });
  expect(drawDefinition.structures?.length).toEqual(1);
});
