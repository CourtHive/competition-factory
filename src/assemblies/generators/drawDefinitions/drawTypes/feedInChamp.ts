import { feedInMatchUps } from '@Generators/drawDefinitions/feedInMatchUps';
import { feedInLinks } from '@Generators/drawDefinitions/links/feedInLinks';
import structureTemplate from '@Generators/templates/structureTemplate';
import { constantToString } from '@Tools/strings';
import { treeMatchUps } from './eliminationTree';

// constants and types
import { MAIN, CONSOLATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_FEED_IN } from '@Constants/policyConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { DrawLink } from '@Types/tournamentTypes';

export function feedInChampionship(params) {
  const {
    finishingPositionOffset,
    stageSequence = 1,
    playoffAttributes,
    feedsFromFinal,
    staggeredEntry,
    structureName,
    stage = MAIN,
    structureId,
    matchUpType,
    skipRounds,
    feedRounds,
    idPrefix,
    drawSize,
    isMock,
    uuids,
    fmlc,
  } = params;

  const feedPolicy =
    params.feedPolicy ||
    params.policyDefinitions?.[POLICY_TYPE_FEED_IN] ||
    params.appliedPolicies?.[POLICY_TYPE_FEED_IN];

  const mainParams = {
    finishingPositionOffset,
    matchUpType,
    skipRounds,
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

  const structures = [mainStructure];
  const links: DrawLink[] = [];

  const baseDrawSize = drawSize / 2;
  const { matchUps: consolationMatchUps, roundsCount } = feedInMatchUps({
    finishingPositionOffset: baseDrawSize,
    idPrefix: idPrefix && `${idPrefix}-c`,
    isConsolation: true,
    feedsFromFinal,
    baseDrawSize,
    matchUpType,
    feedRounds,
    skipRounds,
    isMock,
    uuids,
    fmlc,
  });

  if (drawSize > 2) {
    const name = playoffAttributes?.['0-1']?.name ?? constantToString(CONSOLATION);
    const structureName = params.playoffStructureNameBase ? `${params.playoffStructureNameBase} ${name}` : name;

    const consolationStructure = structureTemplate({
      matchUps: consolationMatchUps,
      structureId: uuids?.pop(),
      stage: CONSOLATION,
      stageSequence: 1,
      structureName,
      matchUpType,
    });
    structures.push(consolationStructure);

    const feedLinks = feedInLinks({
      consolationStructure,
      mainStructure,
      roundsCount,
      feedPolicy,
      fmlc,
    });

    links.push(...feedLinks);
  }

  return {
    ...SUCCESS,
    structures,
    links,
  };
}
