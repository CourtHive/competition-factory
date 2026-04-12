import { generateDrawTypeAndModifyDrawDefinition } from '@Assemblies/generators/drawDefinitions/generateDrawTypeAndModifyDrawDefinition';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getStructureMatchUps } from '@Query/structure/getStructureMatchUps';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getDrawStructures } from '@Acquire/findStructure';
import { feedInChampionship } from '../../drawDefinitions/primitives/feedIn';
import { newDrawDefinition } from '@Assemblies/generators/drawDefinitions/newDrawDefinition';
import { expect, it } from 'vitest';

import { DrawDefinition } from '@Types/tournamentTypes';
import { ERROR } from '@Constants/resultConstants';
import { MAIN, FEED_IN_CHAMPIONSHIP, FIRST_MATCH_LOSER_CONSOLATION, COMPASS } from '@Constants/drawDefinitionConstants';

it('can direct participants in First Match Consolation (FIRST_MATCH_LOSER_CONSOLATION)', () => {
  const drawSize = 32;
  const drawDefinition: DrawDefinition = newDrawDefinition();
  const result = generateDrawTypeAndModifyDrawDefinition({
    drawType: FIRST_MATCH_LOSER_CONSOLATION,
    drawDefinition,
    drawSize,
  });
  expect(result).not.toHaveProperty(ERROR);
  expect(drawDefinition.links?.length).toEqual(2);
  const {
    structures: [structure],
  } = getDrawStructures({ drawDefinition, stage: MAIN });

  // not requiring participants, just checking round Positions
  const { upcomingMatchUps, pendingMatchUps } = getStructureMatchUps({
    requireParticipants: false,
    structure,
  });

  const { matchUps: inContextDrawMatchUps } = getAllDrawMatchUps({
    inContext: true,
    drawDefinition,
  });

  // test first matchUp in roundNumber: 1
  let matchUpId = upcomingMatchUps?.reduce((matchUpId: any, matchUp) => {
    return matchUp.roundNumber === 1 && matchUp.roundPosition === 1 ? matchUp.matchUpId : matchUpId;
  }, undefined);

  let {
    matchUp,
    targetMatchUps: { winnerMatchUp, loserMatchUp },
  } = positionTargets({
    drawDefinition,
    inContextDrawMatchUps,
    matchUpId,
  });

  expect(matchUp.roundNumber).toEqual(1);
  expect(matchUp.roundPosition).toEqual(1);
  expect(winnerMatchUp.roundNumber).toEqual(2);
  expect(winnerMatchUp.roundPosition).toEqual(1);
  expect(loserMatchUp.roundNumber).toEqual(1);
  expect(loserMatchUp.roundPosition).toEqual(1);

  expect(matchUp.structureId).toEqual(winnerMatchUp.structureId);
  expect(matchUp.structureId).not.toEqual(loserMatchUp.structureId);

  // test last matchUp in roundNumber: 1
  matchUpId = upcomingMatchUps?.reduce((matchUpId: any, matchUp) => {
    return matchUp.roundNumber === 1 && matchUp.roundPosition === drawSize / 2 ? matchUp.matchUpId : matchUpId;
  }, undefined);

  ({
    matchUp,
    targetMatchUps: { winnerMatchUp, loserMatchUp },
  } = positionTargets({
    drawDefinition,
    inContextDrawMatchUps,
    matchUpId,
  }));

  expect(matchUp.roundNumber).toEqual(1);
  expect(matchUp.roundPosition).toEqual(drawSize / 2);
  expect(winnerMatchUp.roundNumber).toEqual(2);
  expect(winnerMatchUp.roundPosition).toEqual(drawSize / 4);
  expect(loserMatchUp.roundNumber).toEqual(1);
  expect(loserMatchUp.roundPosition).toEqual(drawSize / 4);

  expect(matchUp.structureId).toEqual(winnerMatchUp.structureId);
  expect(matchUp.structureId).not.toEqual(loserMatchUp.structureId);

  matchUpId = pendingMatchUps?.[0]?.matchUpId;
  const {
    matchUp: matchUp2ndRound,
    targetMatchUps: { winnerMatchUp: winnerMatchUp2ndRound, loserMatchUp: loserMatchUp2ndRound },
  } = positionTargets({
    drawDefinition,
    inContextDrawMatchUps,
    matchUpId,
  });

  expect(matchUp2ndRound.roundNumber).toEqual(2);
  expect(winnerMatchUp2ndRound.roundNumber).toEqual(3);

  expect(matchUp2ndRound.structureId).toEqual(winnerMatchUp2ndRound.structureId);
  expect(loserMatchUp2ndRound.roundNumber).toEqual(2);
  expect(loserMatchUp2ndRound.roundPosition).toEqual(1);
});

it('can direct participants in FEED_IN_CHAMPIONSHIP structure', () => {
  const drawSize = 16;
  const drawDefinition: any =
    feedInChampionship({
      drawType: FEED_IN_CHAMPIONSHIP,
      feedPolicy: { roundGroupedOrder: [] },
      drawSize,
    }).drawDefinition ?? {};
  expect(drawDefinition?.links?.length).toEqual(4);
  const {
    structures: [structure],
  } = getDrawStructures({ drawDefinition, stage: MAIN });

  // not requiring participants for this round of testing
  const { upcomingMatchUps, pendingMatchUps } = getStructureMatchUps({
    structure,
    requireParticipants: false,
  });
  expect(upcomingMatchUps?.length).toEqual(drawSize / 2);

  const { matchUps: inContextDrawMatchUps } = getAllDrawMatchUps({
    inContext: true,
    drawDefinition,
  });

  // test first matchUp in roundNumber: 1
  let matchUpId = upcomingMatchUps?.reduce((matchUpId: any, matchUp) => {
    return matchUp.roundNumber === 1 && matchUp.roundPosition === 1 ? matchUp.matchUpId : matchUpId;
  }, undefined);

  let {
    matchUp,
    targetMatchUps: { winnerMatchUp, loserMatchUp },
  } = positionTargets({
    inContextDrawMatchUps,
    drawDefinition,
    matchUpId,
  });

  expect(matchUp.structureId).toEqual(winnerMatchUp.structureId);
  expect(matchUp.structureId).not.toEqual(loserMatchUp.structureId);

  expect(matchUp.roundNumber).toEqual(1);
  expect(winnerMatchUp.roundNumber).toEqual(2);
  expect(loserMatchUp.roundNumber).toEqual(1);

  expect(matchUp.roundPosition).toEqual(1);
  expect(winnerMatchUp.roundPosition).toEqual(1);
  expect(loserMatchUp.roundPosition).toEqual(1);

  // test last matchUp in roundNumber: 1
  matchUpId = upcomingMatchUps?.reduce((matchUpId: any, matchUp) => {
    return matchUp.roundNumber === 1 && matchUp.roundPosition === drawSize / 2 ? matchUp.matchUpId : matchUpId;
  }, undefined);

  ({
    matchUp,
    targetMatchUps: { winnerMatchUp, loserMatchUp },
  } = positionTargets({
    drawDefinition,
    inContextDrawMatchUps,
    matchUpId,
  }));

  expect(matchUp.structureId).toEqual(winnerMatchUp.structureId);
  expect(matchUp.structureId).not.toEqual(loserMatchUp.structureId);

  expect(matchUp.roundNumber).toEqual(1);
  expect(winnerMatchUp.roundNumber).toEqual(2);
  expect(loserMatchUp.roundNumber).toEqual(1);

  expect(matchUp.roundPosition).toEqual(drawSize / 2);
  expect(winnerMatchUp.roundPosition).toEqual(drawSize / 4);
  expect(loserMatchUp.roundPosition).toEqual(drawSize / 4);

  matchUpId = pendingMatchUps?.[0].matchUpId;
  const {
    matchUp: matchUp2ndRound,
    targetMatchUps: { winnerMatchUp: winnerMatchUp2ndRound, loserMatchUp: loserMatchUp2ndRound },
  } = positionTargets({
    drawDefinition,
    inContextDrawMatchUps,
    matchUpId,
  });

  expect(matchUp2ndRound.roundNumber).toEqual(2);
  expect(winnerMatchUp2ndRound.roundNumber).toEqual(3);
  expect(loserMatchUp2ndRound.roundNumber).toEqual(2);

  expect(matchUp2ndRound.roundPosition).toEqual(1);
  expect(winnerMatchUp2ndRound.roundPosition).toEqual(1);
  // 2nd round should be fed BOTTOM_UP
  expect(loserMatchUp2ndRound.roundPosition).toEqual(4);

  expect(matchUp2ndRound.structureId).toEqual(winnerMatchUp2ndRound.structureId);
  expect(matchUp2ndRound.structureId).not.toEqual(loserMatchUp2ndRound.structureId);
  expect(matchUp2ndRound.structureId).not.toEqual(loserMatchUp2ndRound.structureId);

  expect(loserMatchUp.structureId).toEqual(loserMatchUp2ndRound.structureId);
});

it('can direct participants in COMPASS', () => {
  const drawDefinition: DrawDefinition = newDrawDefinition() ?? {};
  const result = generateDrawTypeAndModifyDrawDefinition({
    drawType: COMPASS,
    drawDefinition,
    drawSize: 32,
  });
  expect(result).not.toHaveProperty(ERROR);
  expect(drawDefinition.links?.length).toEqual(7);
  const {
    structures: [structure],
  } = getDrawStructures({ drawDefinition, stage: MAIN });

  // not requiring participants, just checking round Positions
  const { upcomingMatchUps, pendingMatchUps } = getStructureMatchUps({
    requireParticipants: false,
    structure,
  });

  const { matchUps: inContextDrawMatchUps } = getAllDrawMatchUps({
    inContext: true,
    drawDefinition,
  });

  let matchUpId = upcomingMatchUps?.[0].matchUpId ?? ''; // keep TypeScript happy!
  const {
    matchUp,
    targetLinks: { loserTargetLink },
    targetMatchUps: { winnerMatchUp, loserMatchUp },
  } = positionTargets({
    inContextDrawMatchUps,
    drawDefinition,
    matchUpId,
  });

  const structureNameMap = Object.assign(
    {},
    ...(drawDefinition.structures ?? []).map(({ structureId, structureName = '' }) => ({
      [structureName]: structureId,
    })),
  );

  expect(matchUp.roundNumber).toEqual(1);
  expect(winnerMatchUp.roundNumber).toEqual(2);
  expect(loserMatchUp.roundNumber).toEqual(1);

  expect(matchUp.roundPosition).toEqual(1);
  expect(winnerMatchUp.roundPosition).toEqual(1);
  expect(loserMatchUp.roundPosition).toEqual(1);

  expect(loserTargetLink.source.structureId).toEqual(structureNameMap['East']);
  expect(loserTargetLink.target.structureId).toEqual(structureNameMap['West']);

  expect(matchUp.structureId).toEqual(winnerMatchUp.structureId);
  expect(matchUp.structureId).not.toEqual(loserMatchUp.structureId);

  matchUpId = pendingMatchUps?.[0].matchUpId ?? ''; // keep TypeScript happy
  const {
    matchUp: matchUp2ndRound,
    targetLinks: { loserTargetLink: round2loserTargetLink },
    targetMatchUps: { winnerMatchUp: winnerMatchUp2ndRound, loserMatchUp: loserMatchUp2ndRound },
  } = positionTargets({
    inContextDrawMatchUps,
    drawDefinition,
    matchUpId,
  });

  expect(matchUp2ndRound.roundNumber).toEqual(2);
  expect(winnerMatchUp2ndRound.roundNumber).toEqual(3);
  expect(loserMatchUp2ndRound.roundNumber).toEqual(1);

  expect(matchUp.roundPosition).toEqual(1);
  expect(winnerMatchUp.roundPosition).toEqual(1);
  expect(loserMatchUp.roundPosition).toEqual(1);

  expect(round2loserTargetLink.source.structureId).toEqual(structureNameMap['East']);
  expect(round2loserTargetLink.target.structureId).toEqual(structureNameMap['North']);

  expect(matchUp2ndRound.structureId).toEqual(winnerMatchUp2ndRound.structureId);
  expect(matchUp2ndRound.structureId).not.toEqual(loserMatchUp2ndRound.structureId);
  expect(loserMatchUp.structureId).not.toEqual(loserMatchUp2ndRound.structureId);
});
