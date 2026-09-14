import { feedInMatchUps } from '@Generators/drawDefinitions/feedInMatchUps';
import structureTemplate from '@Generators/templates/structureTemplate';
import { constantToString } from '@Tools/strings';
import { treeMatchUps } from './eliminationTree';

// constants and types
import { MAIN, CONSOLATION, LOSER, TOP_DOWN } from '@Constants/drawDefinitionConstants';
import { DrawLink, Structure } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

export function firstRoundLoserConsolation(params) {
  const {
    finishingPositionOffset = 0,
    playoffAttributes,
    stageSequence = 1,
    staggeredEntry,
    structureName,
    stage = MAIN,
    matchUpType,
    structureId,
    idPrefix,
    drawSize,
    isMock,
    uuids,
  } = params;

  const mainParams = {
    finishingPositionOffset,
    matchUpType,
    drawSize,
    idPrefix,
    isMock,
    uuids,
  };
  const { matchUps } = staggeredEntry ? feedInMatchUps(mainParams) : treeMatchUps(mainParams);

  const mainStructure = structureTemplate({
    structureName: structureName || playoffAttributes?.['0']?.name || constantToString(MAIN),
    structureId: structureId || uuids?.pop(),
    stageSequence,
    matchUpType,
    matchUps,
    stage,
  });

  const structures: Structure[] = [mainStructure];
  const links: DrawLink[] = [];

  if (drawSize > 2) {
    const consolationDrawPositions = drawSize / 2;

    const { matchUps: consolationMatchUps } = treeMatchUps({
      finishingPositionOffset: finishingPositionOffset + consolationDrawPositions,
      idPrefix: idPrefix && `${idPrefix}-c`,
      drawSize: consolationDrawPositions,
      matchUpType,
      isMock,
    });

    const consolation = constantToString(CONSOLATION);
    const consolationStructureName =
      playoffAttributes?.['0-1']?.name ??
      params.consolationStructureName ??
      (structureName ? `${structureName} ${consolation}` : consolation);

    const consolationStructure = structureTemplate({
      structureName: consolationStructureName,
      matchUps: consolationMatchUps,
      structureId: uuids?.pop(),
      stage: CONSOLATION,
      stageSequence: 1,
      matchUpType,
    });
    structures.push(consolationStructure);

    const link: DrawLink = {
      linkType: LOSER,
      source: {
        roundNumber: 1,
        structureId: mainStructure.structureId,
      },
      target: {
        roundNumber: 1,
        feedProfile: TOP_DOWN,
        structureId: consolationStructure.structureId,
      },
    };

    links.push(link);
  }

  return {
    ...SUCCESS,
    structures,
    links,
  };
}
