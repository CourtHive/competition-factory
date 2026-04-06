import { generatePlayoffStructures } from '@Generators/drawDefinitions/drawTypes/playoffStructures';
import { generatePagePlayoff } from '@Generators/drawDefinitions/drawTypes/pagePlayoff';
import { getPositionRangeMap } from '@Query/drawDefinition/getPositionRangeMap';
import { validatePlayoffGroups } from '@Validators/validatePlayoffGroups';
import { firstRoundLoserConsolation } from './firstRoundLoserConsolation';
import structureTemplate from '@Generators/templates/structureTemplate';
import { decorateResult } from '@Functions/global/decorateResult';
import { structureSort } from '@Functions/sorters/structureSort';
import { generateCurtisConsolation } from './curtisConsolation';
import { generateRoundRobin } from './roundRobin/roundRobin';
import { feedInChampionship } from './feedInChamp';
import { treeMatchUps } from './eliminationTree';
import { numericSort } from '@Tools/sorting';
import { nextPowerOf2 } from '@Tools/math';

// constants and types
import { INVALID_CONFIGURATION, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_FEED_IN } from '@Constants/policyConstants';
import { DrawLink, Structure } from '@Types/tournamentTypes';
import { GEM_SCORE } from '@Constants/tallyConstants';
import { WIN_RATIO } from '@Constants/statsConstants';
import { ResultType } from '@Types/factoryTypes';
import {
  AD_HOC,
  COMPASS,
  COMPASS_ATTRIBUTES,
  CURTIS_CONSOLATION,
  DRAW,
  FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_QF,
  FEED_IN_CHAMPIONSHIP_TO_R16,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  LOSER,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  OLYMPIC,
  OLYMPIC_ATTRIBUTES,
  PLAY_OFF,
  PLAYOFF,
  POSITION,
  PAGE_PLAYOFF,
  ROUND_ROBIN,
  SINGLE_ELIMINATION,
  TOP_DOWN,
  WINNER,
} from '@Constants/drawDefinitionConstants';

const FEED_IN_DRAW_TYPES = new Set([
  FIRST_MATCH_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_R16,
  FEED_IN_CHAMPIONSHIP_TO_QF,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
]);

const COMPASS_OLYMPIC_PLAYOFF_TYPES = new Set([COMPASS, OLYMPIC, PLAYOFF]);

export function processPlayoffGroups({
  requireSequential = true,
  playoffMatchUpFormat,
  playoffAttributes,
  sourceStructureId,
  policyDefinitions,
  stageSequence,
  drawDefinition,
  playoffGroups,
  matchUpType,
  feedPolicy,
  groupCount,
  groupSize,
  idPrefix,
  isMock,
  uuids,
}: any = {}): ResultType & {
  finishingPositionTargets?: any;
  structures?: Structure[];
  positionRangeMap?: any;
  links?: DrawLink[];
} {
  const resolvedFeedPolicy = feedPolicy || policyDefinitions?.[POLICY_TYPE_FEED_IN];
  const stack = 'processPlayoffGroups';

  let finishingPositionOffset = 0;
  const finishingPositionTargets: any[] = [];
  const structures: any[] = [];
  const links: any[] = [];

  const hasBestOfOrRemainder = playoffGroups?.some((pg) => pg.bestOf !== undefined || pg.remainder);
  if (hasBestOfOrRemainder && groupSize) {
    const validation = validatePlayoffGroups({ playoffGroups, groupCount, groupSize });
    if (!validation.valid) {
      return decorateResult({
        result: { error: validation.error || INVALID_CONFIGURATION },
        context: { info: validation.info },
        stack,
      });
    }
  }

  const nonRemainderGroups = playoffGroups?.filter((pg) => !pg.remainder);

  const { error, positionRangeMap } = getPositionRangeMap({
    structureId: sourceStructureId,
    playoffGroups: nonRemainderGroups,
    drawDefinition,
  });

  if (error) return decorateResult({ result: { error }, stack });

  const validFinishingPositions =
    !positionRangeMap ||
    nonRemainderGroups?.every((profile) => {
      const { finishingPositions = [] } = profile;
      if (!finishingPositions.length) return false;

      const sequential = [...finishingPositions]
        .sort(numericSort)
        .map((pos, i) => (finishingPositions[i + 1] || pos) - pos)
        .every((val) => val < 2);

      return (!requireSequential || sequential) && finishingPositions.every((position) => positionRangeMap[position]);
    });

  if (!validFinishingPositions) {
    return decorateResult({
      context: { validFinishingPositions: Object.values(positionRangeMap) },
      result: { error: INVALID_VALUES },
      stack,
    });
  }

  let totalClaimed = 0;

  for (const playoffGroup of playoffGroups) {
    const { bestOf, rankBy, remainder } = playoffGroup;

    if (remainder) {
      const remainderResult = processRemainderGroup({
        finishingPositionOffset,
        playoffMatchUpFormat,
        sourceStructureId,
        stageSequence,
        totalClaimed,
        playoffGroup,
        matchUpType,
        groupCount,
        groupSize,
        idPrefix,
        isMock,
        uuids,
      });
      structures.push(remainderResult.structure);
      links.push(remainderResult.link);
      finishingPositionTargets.push(remainderResult.target);
      finishingPositionOffset += remainderResult.remainderCount;
      totalClaimed += remainderResult.remainderCount;
      continue;
    }

    const finishingPositions = playoffGroup.finishingPositions ?? [];
    const positionsPlayedOff =
      positionRangeMap && finishingPositions.flatMap((p: number) => positionRangeMap[p]?.finishingPositions ?? []);

    const participantsInDraw = bestOf ?? groupCount * finishingPositions.length;
    totalClaimed += participantsInDraw;
    const drawSize = nextPowerOf2(participantsInDraw);

    const playoffDrawType = (drawSize === 2 && SINGLE_ELIMINATION) || playoffGroup.drawType || SINGLE_ELIMINATION;

    if (positionsPlayedOff) {
      finishingPositionOffset = Math.min(...positionsPlayedOff) - 1;
    }

    const structureName = resolveStructureName({ positionsPlayedOff, playoffGroup });

    const playoffGroupParams = {
      addNameBaseToAttributeName: playoffGroup.addNameBaseToAttributeName,
      playoffStructureNameBase: playoffGroup.playoffStructureNameBase,
      finishingPositionNaming: playoffGroup.finishingPositionNaming,
      finishingPositionLimit: playoffGroup.finishingPositionLimit,
      structureId: playoffGroup.structureId ?? uuids?.pop(),
      playoffAttributes: playoffGroup.playoffAttributes,
      structureNameMap: playoffGroup.structureNameMap,
      sequenceLimit: playoffGroup.sequenceLimit,
      structureName,
    };

    const params = {
      ...playoffGroupParams,
      idPrefix: idPrefix && `${idPrefix}-po`,
      appliedPolicies: policyDefinitions,
      finishingPositionOffset,
      stage: PLAY_OFF,
      stageSequence,
      matchUpType,
      drawSize,
      isMock,
      uuids,
    };

    const updateStructureAndLinks = ({ playoffStructures, playoffLinks }) => {
      const [playoffStructure] = playoffStructures;
      const playoffLink = generatePlayoffLink({
        playoffStructureId: playoffStructure.structureId,
        finishingPositions,
        sourceStructureId,
        bestOf,
        rankBy,
      });

      links.push(playoffLink, ...playoffLinks);
      structures.push(...playoffStructures);
      finishingPositionTargets.push({
        structureId: playoffStructure.structureId,
        finishingPositions,
      });
      finishingPositionOffset += participantsInDraw;
    };

    if (playoffDrawType === SINGLE_ELIMINATION) {
      processSingleEliminationPlayoff({
        finishingPositionOffset,
        playoffMatchUpFormat,
        finishingPositions,
        sourceStructureId,
        participantsInDraw,
        stageSequence,
        playoffGroup,
        structureName,
        matchUpType,
        drawSize,
        idPrefix,
        bestOf,
        rankBy,
        isMock,
        uuids,
        finishingPositionTargets,
        structures,
        links,
      });
      finishingPositionOffset += participantsInDraw;
    } else if (COMPASS_OLYMPIC_PLAYOFF_TYPES.has(playoffDrawType)) {
      const earlyReturn = processCompassOlympicPlayoff({
        finishingPositionOffset,
        finishingPositions,
        sourceStructureId,
        playoffAttributes,
        playoffDrawType,
        stageSequence,
        playoffGroup,
        drawSize,
        idPrefix,
        bestOf,
        rankBy,
        isMock,
        uuids,
        finishingPositionTargets,
        structures,
        links,
      });
      if (earlyReturn) return earlyReturn;
      finishingPositionOffset += participantsInDraw;
    } else if (FEED_IN_DRAW_TYPES.has(playoffDrawType)) {
      processFeedInPlayoff({
        finishingPositionOffset,
        finishingPositions,
        sourceStructureId,
        playoffDrawType,
        playoffGroup,
        structureName,
        matchUpType,
        drawSize,
        idPrefix,
        bestOf,
        rankBy,
        isMock,
        uuids,
        feedPolicy: resolvedFeedPolicy,
        finishingPositionTargets,
        structures,
        links,
      });
      finishingPositionOffset += participantsInDraw;
    } else if (playoffDrawType === ROUND_ROBIN) {
      const { structures: playoffStructures, links: playoffLinks } = generateRoundRobin({
        ...params,
        structureOptions: playoffGroup.structureOptions || { groupSize: 4 },
      });
      updateStructureAndLinks({ playoffStructures, playoffLinks });
    } else if (playoffDrawType === FIRST_ROUND_LOSER_CONSOLATION) {
      const { structures: playoffStructures, links: playoffLinks } = firstRoundLoserConsolation(params);
      updateStructureAndLinks({ playoffStructures, playoffLinks });
    } else if (playoffDrawType === CURTIS_CONSOLATION) {
      const { structures: playoffStructures, links: playoffLinks } = generateCurtisConsolation(params);
      updateStructureAndLinks({ playoffStructures, playoffLinks });
    } else if (playoffDrawType === PAGE_PLAYOFF) {
      const earlyReturn = processPagePlayoff({
        finishingPositionTargets,
        participantsInDraw,
        sourceStructureId,
        finishingPositions,
        drawDefinition,
        playoffGroup,
        structures,
        params,
        links,
        stack,
      });
      if (earlyReturn) return earlyReturn;
    } else if (playoffDrawType === AD_HOC) {
      processAdHocPlayoff({
        finishingPositions,
        stageSequence,
        structureName,
        playoffGroup,
        groupSize,
        uuids,
        updateStructureAndLinks,
      });
    }
  }

  return { finishingPositionTargets, positionRangeMap, structures, links };
}

function processRemainderGroup({
  finishingPositionOffset,
  playoffMatchUpFormat,
  sourceStructureId,
  stageSequence,
  totalClaimed,
  playoffGroup,
  matchUpType,
  groupCount,
  groupSize,
  idPrefix,
  isMock,
  uuids,
}) {
  const totalParticipants = groupCount * groupSize;
  const remainderCount = totalParticipants - totalClaimed;
  const drawSize = nextPowerOf2(remainderCount);
  const allPositions = Array.from({ length: groupSize }, (_, i) => i + 1);
  const structureName = playoffGroup.structureName || 'Remainder Playoff';

  const { matchUps } = treeMatchUps({
    finishingPositionLimit: finishingPositionOffset + remainderCount,
    idPrefix: idPrefix && `${idPrefix}-po`,
    finishingPositionOffset,
    matchUpType,
    drawSize,
    isMock,
    uuids,
  });

  const playoffStructure = structureTemplate({
    structureId: playoffGroup.structureId ?? uuids?.pop(),
    matchUpFormat: playoffMatchUpFormat,
    stage: PLAY_OFF,
    structureName,
    stageSequence,
    matchUps,
  });

  const link = generatePlayoffLink({
    playoffStructureId: playoffStructure.structureId,
    finishingPositions: allPositions,
    sourceStructureId,
    remainder: true,
  });

  return {
    structure: playoffStructure,
    target: {
      structureId: playoffStructure.structureId,
      finishingPositions: allPositions,
    },
    remainderCount,
    link,
  };
}

function processSingleEliminationPlayoff({
  finishingPositionOffset,
  playoffMatchUpFormat,
  finishingPositions,
  sourceStructureId,
  participantsInDraw,
  stageSequence,
  playoffGroup,
  structureName,
  matchUpType,
  drawSize,
  idPrefix,
  bestOf,
  rankBy,
  isMock,
  uuids,
  finishingPositionTargets,
  structures,
  links,
}) {
  const { matchUps } = treeMatchUps({
    finishingPositionLimit: finishingPositionOffset + participantsInDraw,
    idPrefix: idPrefix && `${idPrefix}-po`,
    finishingPositionOffset,
    matchUpType,
    drawSize,
    isMock,
    uuids,
  });

  const playoffStructure = structureTemplate({
    structureId: playoffGroup.structureId ?? uuids?.pop(),
    matchUpFormat: playoffMatchUpFormat,
    stage: PLAY_OFF,
    structureName,
    stageSequence,
    matchUps,
  });
  structures.push(playoffStructure);

  const playoffLink = generatePlayoffLink({
    playoffStructureId: playoffStructure.structureId,
    finishingPositions,
    sourceStructureId,
    bestOf,
    rankBy,
  });
  links.push(playoffLink);

  finishingPositionTargets.push({
    structureId: playoffStructure.structureId,
    finishingPositions,
  });
}

function processCompassOlympicPlayoff({
  finishingPositionOffset,
  finishingPositions,
  sourceStructureId,
  playoffAttributes,
  playoffDrawType,
  stageSequence,
  playoffGroup,
  drawSize,
  idPrefix,
  bestOf,
  rankBy,
  isMock,
  uuids,
  finishingPositionTargets,
  structures,
  links,
}) {
  const params: any = {
    playoffAttributes: playoffGroup.playoffAttributes ?? playoffAttributes,
    playoffStructureNameBase: playoffGroup.playoffStructureNameBase,
    structureId: playoffGroup.structureId ?? uuids?.pop(),
    structureName: playoffGroup.structureName,
    idPrefix: idPrefix && `${idPrefix}-po`,
    addNameBaseToAttributeName: true,
    finishingPositionOffset,
    stage: PLAY_OFF,
    roundOffset: 0,
    stageSequence,
    drawSize,
    isMock,
    uuids,
  };

  if (playoffDrawType === COMPASS) {
    Object.assign(params, {
      playoffAttributes: playoffGroup?.playoffAttributes ?? playoffAttributes ?? COMPASS_ATTRIBUTES,
      roundOffsetLimit: 3,
    });
  } else if (playoffDrawType === OLYMPIC) {
    Object.assign(params, {
      playoffAttributes: playoffGroup?.playoffAttributes ?? playoffAttributes ?? OLYMPIC_ATTRIBUTES,
      roundOffsetLimit: 2,
    });
  }

  const result = generatePlayoffStructures(params);
  if (result.error) return result;

  if (result.links?.length) links.push(...result.links);
  if (result.structures?.length) structures.push(...result.structures);
  structures.sort(structureSort);

  if (result.structureId) {
    const playoffLink = generatePlayoffLink({
      playoffStructureId: result.structureId,
      finishingPositions,
      sourceStructureId,
      bestOf,
      rankBy,
    });
    links.push(playoffLink);
    finishingPositionTargets.push({
      structureId: result.structureId,
      finishingPositions,
    });
  }

  return undefined;
}

function processFeedInPlayoff({
  finishingPositionOffset,
  finishingPositions,
  sourceStructureId,
  playoffDrawType,
  playoffGroup,
  structureName,
  matchUpType,
  feedPolicy,
  drawSize,
  idPrefix,
  bestOf,
  rankBy,
  isMock,
  uuids,
  finishingPositionTargets,
  structures,
  links,
}) {
  const uuidsFMLC = [uuids?.pop(), uuids?.pop()];
  const params: any = {
    playoffStructureNameBase: playoffGroup.playoffStructureNameBase,
    structureId: playoffGroup.structureId ?? uuids?.pop(),
    playoffAttributes: playoffGroup.playoffAttributes,
    idPrefix: idPrefix && `${idPrefix}-po`,
    finishingPositionOffset,
    uuids: uuidsFMLC,
    stage: PLAY_OFF,
    structureName,
    matchUpType,
    feedPolicy,
    drawSize,
    isMock,
  };

  const additionalAttributes = {
    [FIRST_MATCH_LOSER_CONSOLATION]: { fmlc: true, feedRounds: 1 },
    [MODIFIED_FEED_IN_CHAMPIONSHIP]: { feedRounds: 1 },
    [FEED_IN_CHAMPIONSHIP_TO_R16]: { feedsFromFinal: 3 },
    [FEED_IN_CHAMPIONSHIP_TO_QF]: { feedsFromFinal: 2 },
    [FEED_IN_CHAMPIONSHIP_TO_SF]: { feedsFromFinal: 1 },
  };

  Object.assign(params, additionalAttributes[playoffDrawType] ?? {});

  const { structures: championshipStructures, links: feedInLinks } = feedInChampionship(params);
  const [playoffStructure] = championshipStructures;
  const playoffLink = generatePlayoffLink({
    playoffStructureId: playoffStructure.structureId,
    finishingPositions,
    sourceStructureId,
    bestOf,
    rankBy,
  });

  links.push(playoffLink, ...feedInLinks);
  structures.push(...championshipStructures);
  finishingPositionTargets.push({
    structureId: playoffStructure.structureId,
    finishingPositions,
  });
}


function processPagePlayoff({
  finishingPositionTargets,
  participantsInDraw,
  sourceStructureId,
  finishingPositions,
  drawDefinition,
  playoffGroup,
  structures,
  params,
  links,
  stack,
}) {
  if (participantsInDraw !== 4) {
    return decorateResult({
      result: { error: INVALID_CONFIGURATION },
      context: { info: 'PAGE_PLAYOFF requires exactly 4 participants' },
      stack,
    });
  }

  const sourceStructure = drawDefinition?.structures?.find((s) => s.structureId === sourceStructureId);
  const isEliminationSource = sourceStructure && !sourceStructure.structures && !sourceStructure.structureType;

  if (isEliminationSource) {
    return processPagePlayoffFromElimination({
      finishingPositionTargets, sourceStructureId, drawDefinition, playoffGroup, structures, params, links,
    });
  }

  return processPagePlayoffFromRR({
    finishingPositionTargets, sourceStructureId, finishingPositions, playoffGroup, structures, params, links, stack,
  });
}

function processPagePlayoffFromElimination({
  finishingPositionTargets, sourceStructureId, drawDefinition, playoffGroup, structures, params, links,
}) {
  const structureName = playoffGroup.structureName;
  const { matchUpType, isMock, uuids, idPrefix, finishingPositionOffset = 0 } = params;
  const stage = PLAY_OFF;

  const { matchUps: elimMatchUps } = treeMatchUps({
    finishingPositionOffset: finishingPositionOffset + 2,
    idPrefix: idPrefix && `${idPrefix}-el`,
    drawSize: 2, matchUpType, isMock, uuids,
  });
  const elimStructure = structureTemplate({
    structureName: structureName ? `${structureName} 3-4 Playoff` : '3-4 Playoff',
    structureAbbreviation: 'EL', structureId: uuids?.pop(),
    matchUps: elimMatchUps, stageSequence: 1, matchUpType, stage,
  });

  const { matchUps: q2MatchUps } = treeMatchUps({
    finishingPositionOffset: finishingPositionOffset + 1,
    idPrefix: idPrefix && `${idPrefix}-q2`,
    drawSize: 2, matchUpType, isMock, uuids,
  });
  const q2Structure = structureTemplate({
    structureName: structureName ? `${structureName} Qualifier 2` : 'Qualifier 2',
    structureAbbreviation: 'Q2', structureId: uuids?.pop(),
    matchUps: q2MatchUps, stageSequence: 2, matchUpType, stage,
  });

  const { matchUps: finalMatchUps } = treeMatchUps({
    finishingPositionOffset,
    idPrefix: idPrefix && `${idPrefix}-fi`,
    drawSize: 2, matchUpType, isMock, uuids,
  });
  const finalStructure = structureTemplate({
    structureName: structureName ? `${structureName} Final` : 'Playoff Final',
    structureAbbreviation: 'F', structureId: uuids?.pop(),
    matchUps: finalMatchUps, stageSequence: 3, matchUpType, stage,
  });

  structures.push(elimStructure, q2Structure, finalStructure);

  const sourceStructure = drawDefinition?.structures?.find((s) => s.structureId === sourceStructureId);
  const sourceMatchUps = sourceStructure?.matchUps || [];
  const finalRoundNumber = sourceMatchUps.length ? Math.max(...sourceMatchUps.map((m) => m.roundNumber)) : 1;

  links.push(
    generatePlayoffLink({ playoffStructureId: elimStructure.structureId, finishingPositions: [3, 4], sourceStructureId }),
    { linkType: WINNER, source: { structureId: sourceStructureId, roundNumber: finalRoundNumber }, target: { feedProfile: TOP_DOWN, roundNumber: 1, structureId: finalStructure.structureId } },
    { linkType: LOSER, source: { structureId: sourceStructureId, roundNumber: finalRoundNumber }, target: { feedProfile: TOP_DOWN, roundNumber: 1, structureId: q2Structure.structureId } },
    { linkType: WINNER, source: { structureId: elimStructure.structureId, roundNumber: 1 }, target: { feedProfile: TOP_DOWN, roundNumber: 1, structureId: q2Structure.structureId } },
    { linkType: WINNER, source: { structureId: q2Structure.structureId, roundNumber: 1 }, target: { feedProfile: TOP_DOWN, roundNumber: 1, structureId: finalStructure.structureId } },
  );

  finishingPositionTargets.push({ structureId: elimStructure.structureId, finishingPositions: [3, 4] });
  return undefined;
}

function processPagePlayoffFromRR({
  finishingPositionTargets, sourceStructureId, finishingPositions, playoffGroup, structures, params, links, stack,
}) {
  const pagePlayoffResult = generatePagePlayoff({ ...params, structureName: playoffGroup.structureName });
  if (pagePlayoffResult.error) return decorateResult({ result: pagePlayoffResult, stack });

  structures.push(...pagePlayoffResult.structures);
  links.push(...pagePlayoffResult.links);

  const q1Structure = pagePlayoffResult.structures.find((s) => s.structureAbbreviation === 'Q1');
  const elimStructure = pagePlayoffResult.structures.find((s) => s.structureAbbreviation === 'EL');

  if (finishingPositions.length >= 2 && q1Structure && elimStructure) {
    const half = Math.ceil(finishingPositions.length / 2);
    const q1Positions = finishingPositions.slice(0, half);
    const elimPositions = finishingPositions.slice(half);
    links.push(
      generatePlayoffLink({ playoffStructureId: q1Structure.structureId, finishingPositions: q1Positions, sourceStructureId }),
      generatePlayoffLink({ playoffStructureId: elimStructure.structureId, finishingPositions: elimPositions, sourceStructureId }),
    );
    finishingPositionTargets.push(
      { structureId: q1Structure.structureId, finishingPositions: q1Positions },
      { structureId: elimStructure.structureId, finishingPositions: elimPositions },
    );
  } else if (q1Structure && elimStructure) {
    links.push(
      generatePlayoffLink({ playoffStructureId: q1Structure.structureId, finishingPositions, sourceStructureId }),
      generatePlayoffLink({ playoffStructureId: elimStructure.structureId, finishingPositions, sourceStructureId }),
    );
    finishingPositionTargets.push(
      { structureId: q1Structure.structureId, finishingPositions },
      { structureId: elimStructure.structureId, finishingPositions },
    );
  }
  return undefined;
}

function processAdHocPlayoff({
  finishingPositions,
  stageSequence,
  structureName,
  playoffGroup,
  groupSize,
  uuids,
  updateStructureAndLinks,
}) {
  if (!finishingPositions.length && groupSize) {
    finishingPositions.push(...Array.from({ length: groupSize }, (_, i) => i + 1));
  }
  const structure = structureTemplate({
    structureId: playoffGroup.structureId ?? uuids?.pop(),
    structureName: playoffGroup.structureName || structureName || 'Playoff',
    finishingPosition: WIN_RATIO,
    stage: PLAY_OFF,
    stageSequence,
    matchUps: [],
  });
  updateStructureAndLinks({
    playoffStructures: [structure],
    playoffLinks: [],
  });
}

function resolveStructureName({ positionsPlayedOff, playoffGroup }) {
  const finishingPositionRange =
    positionsPlayedOff && `${Math.min(...positionsPlayedOff)}-${Math.max(...positionsPlayedOff)}`;
  return (
    playoffGroup.structureName ||
    (finishingPositionRange && playoffGroup.playoffAttributes?.[finishingPositionRange]?.name) ||
    playoffGroup.playoffAttributes?.['0']?.name
  );
}

function generatePlayoffLink({
  playoffStructureId,
  finishingPositions,
  sourceStructureId,
  remainder,
  bestOf,
  rankBy,
}: any) {
  const source: any = {
    structureId: sourceStructureId,
    finishingPositions,
  };

  if (bestOf !== undefined) {
    source.bestOf = bestOf;
    source.rankBy = rankBy || GEM_SCORE;
  }

  if (remainder) {
    source.remainder = true;
  }

  return {
    linkType: POSITION,
    source,
    target: {
      structureId: playoffStructureId,
      feedProfile: DRAW,
      roundNumber: 1,
    },
  };
}
