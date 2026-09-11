import structureTemplate from '../../templates/structureTemplate';
import { generateRange } from '@Tools/arrays';
import { feedInMatchUps } from '../feedInMatchUps';
import { treeMatchUps } from './eliminationTree';

import { LOSER, MAIN, TOP_DOWN } from '@Constants/drawDefinitionConstants';
import { ErrorType } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { DrawDefinition, DrawLink, MatchUp, Structure } from '@Types/tournamentTypes';

export type NamingEntry = {
  [key: string]: { name: string; abbreviation: string; structureId?: string };
};

type GeneratePlayoffStructuresArgs = {
  addNameBaseToAttributeName?: boolean;
  finishingPositionNaming?: NamingEntry;
  playoffStructureNameBase?: string;
  finishingPositionOffset?: number;
  playoffAttributes?: NamingEntry;
  finishingPositionLimit?: number;
  drawDefinition?: DrawDefinition;
  exitProfileLimit?: boolean;
  roundOffsetLimit?: number;
  staggeredEntry?: boolean; // should only apply to playoffs from round robins
  sequenceLimit?: number;
  stageSequence?: number;
  structureName?: string;
  childStage?: string; // stage to use for child structures (e.g. PLAY_OFF for COMPASS/OLYMPIC secondaries)
  matchUpType?: string;
  roundOffset?: number;
  structureId?: string;
  exitProfile?: string;
  drawSize: number;
  idPrefix?: string;
  isMock?: boolean;
  uuids?: string[];
  stage: string;
};

export function generatePlayoffStructures(params: GeneratePlayoffStructuresArgs): {
  structures?: Structure[];
  structureName?: string;
  structureId?: string;
  matchUps?: MatchUp[];
  links?: DrawLink[];
  error?: ErrorType;
} {
  const {
    finishingPositionOffset = 0,
    addNameBaseToAttributeName,
    playoffStructureNameBase,
    finishingPositionNaming,
    finishingPositionLimit,
    playoffAttributes,
    stageSequence = 1,
    exitProfile = '0',
    exitProfileLimit,
    roundOffsetLimit,
    roundOffset = 0,
    drawDefinition,
    staggeredEntry, // not propagated to child structures
    sequenceLimit,
    childStage,
    stage = MAIN,
    drawSize,
    idPrefix,
    isMock,
    uuids,
  } = params;
  const generateStructure = !playoffAttributes || !exitProfileLimit || playoffAttributes?.[exitProfile];

  if (!generateStructure || drawSize < 2 || (sequenceLimit && stageSequence > sequenceLimit)) return {};

  const allMatchUps: any[] = [];
  const structures: Structure[] = [];
  const links: DrawLink[] = [];

  const matchUpType = params.matchUpType ?? drawDefinition?.matchUpType;

  const finishingPositionsFrom = finishingPositionOffset + 1;
  const finishingPositionsTo = finishingPositionOffset + drawSize;
  const finishingPositionRange = `${finishingPositionsFrom}-${finishingPositionsTo}`;
  const attributeProfile = playoffAttributes?.[exitProfile];
  const base = (playoffStructureNameBase && `${playoffStructureNameBase} `) || '';
  const customNaming = playoffAttributes?.[finishingPositionRange] ?? finishingPositionNaming?.[finishingPositionRange];

  const structureName =
    params.structureName ||
    customNaming?.name ||
    (attributeProfile?.name &&
      (addNameBaseToAttributeName ? `${base}${attributeProfile?.name}` : attributeProfile.name)) ||
    `${base}${finishingPositionRange}`;

  const structureAbbreviation = customNaming?.abbreviation ?? attributeProfile?.abbreviation;
  const structureId = params.structureId ?? attributeProfile?.structureId ?? uuids?.pop();

  const mainParams = {
    idPrefix: idPrefix && `${idPrefix}-${structureName}-RP`,
    finishingPositionOffset,
    matchUpType,
    drawSize,
    isMock,
    uuids,
  };
  const { matchUps } = staggeredEntry
    ? feedInMatchUps(mainParams) // should only every apply to initial structure
    : treeMatchUps(mainParams);

  const structure = structureTemplate({
    structureAbbreviation,
    stageSequence,
    structureName,
    matchUpType,
    roundOffset,
    structureId,
    matchUps,
    stage,
  });

  allMatchUps.push(...matchUps);
  structures.push(structure);

  const rounds = Math.ceil(Math.log(drawSize) / Math.log(2));
  const roundsToPlayOff = roundOffsetLimit
    ? Math.min(roundOffsetLimit - roundOffset, rounds)
    : ((!finishingPositionLimit || finishingPositionsFrom < finishingPositionLimit) && rounds) || 0;

  if (drawSize > 2) {
    generateRange(1, roundsToPlayOff + 1).forEach((roundNumber) => generateChildStructures(roundNumber));
  }

  return {
    structureId: structure.structureId,
    matchUps: allMatchUps,
    structureName,
    structures,
    links,
    ...SUCCESS,
  };

  function generateChildStructures(roundNumber) {
    const playoffDrawPositions = drawSize / Math.pow(2, roundNumber);
    if (playoffDrawPositions < 2) return;

    const childFinishingPositionOffset = drawSize / Math.pow(2, roundNumber) + finishingPositionOffset;
    if (finishingPositionLimit && childFinishingPositionOffset + 1 > finishingPositionLimit) return;

    const {
      structures: childStructures,
      structureId: targetStructureId,
      matchUps: childMatchUps,
      links: childLinks,
    } = generatePlayoffStructures({
      finishingPositionOffset: childFinishingPositionOffset,
      exitProfile: `${exitProfile}-${roundNumber}`,
      roundOffset: roundOffset + roundNumber,
      stageSequence: stageSequence + 1,
      stage: childStage ?? stage,
      drawSize: playoffDrawPositions,
      addNameBaseToAttributeName,
      playoffStructureNameBase,
      finishingPositionNaming,
      finishingPositionLimit,
      playoffAttributes,
      exitProfileLimit,
      roundOffsetLimit,
      drawDefinition,
      sequenceLimit,
      childStage,
      matchUpType,
      idPrefix,
      uuids,
    });

    if (structure.structureId && targetStructureId) {
      const link: DrawLink = {
        linkType: LOSER,
        source: {
          roundNumber,
          structureId: structure.structureId,
        },
        target: {
          roundNumber: 1,
          feedProfile: TOP_DOWN,
          structureId: targetStructureId,
        },
      };

      if (childLinks && structure) childLinks.push(link);
      if (childLinks?.length) links.push(...childLinks);
    }
    if (childStructures?.length) structures.push(...childStructures);
    if (childMatchUps?.length) allMatchUps.push(...childMatchUps);

    return {
      structureId: targetStructureId,
      childLinks,
      structures,
    };
  }
}
