import { feedInMatchUps } from '@Assemblies/generators/drawDefinitions/feedInMatchUps';
import { feedInLinks } from '@Assemblies/generators/drawDefinitions/links/feedInLinks';
import { structureTemplate } from '@Assemblies/generators/templates/structureTemplate';
import { constantToString } from '@Tools/strings';
import { treeMatchUps } from './eliminationTree';

// constants and types
import { MAIN, CONSOLATION, PLAY_OFF, LOSER, TOP_DOWN } from '@Constants/drawDefinitionConstants';
import { DrawLink, Structure } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

export function generateCurtisConsolation(params) {
  const {
    playoffStructureNameBase,
    finishingPositionOffset,
    stageSequence = 1,
    playoffAttributes,
    structureNameMap,
    staggeredEntry,
    stage = MAIN,
    matchUpType,
    structureId,
    drawSize,
    idPrefix,
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
  const { matchUps, roundsCount: mainDrawRoundsCount } = staggeredEntry
    ? feedInMatchUps(mainParams)
    : treeMatchUps(mainParams);
  const structureName = params.structureName ?? playoffAttributes?.['0']?.name ?? constantToString(MAIN);
  const mainStructure = structureTemplate({
    structureId: structureId || uuids?.pop(),
    structureName,
    stageSequence,
    matchUpType,
    matchUps,
    stage,
  });

  const structures: Structure[] = [mainStructure];
  const links: DrawLink[] = [];

  if (drawSize > 2) {
    const feedRoundOffsets = [0, 2].slice(0, drawSize / 16);
    const consolationItems = feedRoundOffsets.map((roundOffset, index) => {
      const stageSequence = index + 1;
      const { consolationStructure } = consolationFeedStructure({
        idPrefix: idPrefix && `${idPrefix}-c${index}`,
        structureId: uuids?.pop(),
        playoffStructureNameBase,
        playoffAttributes,
        structureNameMap,
        stageSequence,
        roundOffset,
        matchUpType,
        drawSize,
        isMock,
        index,
        uuids,
      });

      structures.push(consolationStructure);

      const links = feedInLinks({
        consolationStructure,
        roundsCount: 2,
        mainStructure,
        roundOffset,
      });

      return { consolationStructure, links };
    });

    const consolationLinks = consolationItems.map((item) => item.links).flat();
    links.push(...consolationLinks);

    // only add 3-4 playoff structure
    // 1. if there is one consolation round, drawSize === 16
    // 2. if drawSize > 32
    // when drawSize === 32 then all rounds feed into the two consolation structures
    if ((drawSize >= 4 && drawSize <= 16) || drawSize > 32) {
      const { matchUps: playoffMatchUps } = treeMatchUps({
        idPrefix: idPrefix && `${idPrefix}-p3t4`,
        finishingPositionOffset: 2,
        drawSize: 2,
        matchUpType,
        isMock,
      });
      const defaultName = playoffAttributes?.['3-4']?.name ?? constantToString(PLAY_OFF);
      const mappedStructureName = structureNameMap?.[defaultName] || defaultName;
      const structureName = playoffStructureNameBase
        ? `${playoffStructureNameBase} ${mappedStructureName}`
        : mappedStructureName;

      const playoffStructure = structureTemplate({
        structureId: uuids?.pop(),
        matchUps: playoffMatchUps,
        stageSequence: 2,
        stage: PLAY_OFF,
        structureName,
        matchUpType,
      });

      const playoffLink: DrawLink = {
        linkType: LOSER,
        source: {
          roundNumber: mainDrawRoundsCount - 1,
          structureId: mainStructure.structureId,
        },
        target: {
          structureId: playoffStructure.structureId,
          feedProfile: TOP_DOWN,
          roundNumber: 1,
        },
      };

      structures.push(playoffStructure);
      links.push(playoffLink);
    }
  }

  return { structures, links, ...SUCCESS };
}

function consolationFeedStructure({
  playoffStructureNameBase,
  stageSequence = 1,
  playoffAttributes,
  structureNameMap,
  roundOffset = 0,
  matchUpType,
  structureId,
  idPrefix,
  drawSize,
  isMock,
  index,
  uuids,
}) {
  const consolationDrawPositions = drawSize / (2 * Math.pow(2, roundOffset));

  const { matchUps: consolationMatchUps, roundsCount: consolationRoundsCount } = feedInMatchUps({
    finishingPositionOffset: consolationDrawPositions,
    baseDrawSize: consolationDrawPositions,
    isConsolation: true,
    feedRounds: 1,
    matchUpType,
    idPrefix,
    isMock,
    uuids,
  });
  const indexedStructureName =
    (index === 0 && playoffAttributes?.['0-1']?.name) || (index === 1 && playoffAttributes?.['0-3']?.name);
  const defaultName = indexedStructureName || `${constantToString(CONSOLATION)} ${index + 1}`;
  const mappedStructureName = structureNameMap?.[defaultName] || defaultName;
  const structureName = playoffStructureNameBase
    ? `${playoffStructureNameBase} ${mappedStructureName}`
    : mappedStructureName;

  const consolationStructure = structureTemplate({
    matchUps: consolationMatchUps,
    stage: CONSOLATION,
    structureName,
    stageSequence,
    matchUpType,
    structureId,
  });

  return { consolationStructure, consolationRoundsCount };
}
