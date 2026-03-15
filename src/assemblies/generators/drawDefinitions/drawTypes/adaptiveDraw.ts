import structureTemplate from '../../templates/structureTemplate';
import { luckyDraw, luckyRoundProfiles } from './luckyDraw';
import { isPowerOf2 } from '@Tools/math';

// constants
import { LOSER, MAIN, PLAY_OFF, TOP_DOWN, ADAPTIVE_ATTRIBUTES } from '@Constants/drawDefinitionConstants';
import { ErrorType } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { DrawLink, Structure } from '@Types/tournamentTypes';
import { NamingEntry } from './playoffStructures';

type GenerateAdaptiveStructuresArgs = {
  finishingPositionOffset?: number;
  playoffAttributes?: NamingEntry;
  roundOffsetLimit?: number;
  stageSequence?: number;
  structureName?: string;
  childStage?: string;
  matchUpType?: string;
  roundOffset?: number;
  structureId?: string;
  exitProfile?: string;
  drawSize: number;
  idPrefix?: string;
  isMock?: boolean;
  uuids?: string[];
  stage?: string;
};

export function generateAdaptiveStructures(params: GenerateAdaptiveStructuresArgs): {
  structures?: Structure[];
  structureId?: string;
  links?: DrawLink[];
  error?: ErrorType;
} {
  const {
    finishingPositionOffset = 0,
    playoffAttributes = ADAPTIVE_ATTRIBUTES,
    stageSequence = 1,
    exitProfile = '0',
    roundOffsetLimit = 3,
    roundOffset = 0,
    childStage = PLAY_OFF,
    stage = MAIN,
    matchUpType,
    structureId,
    drawSize,
    idPrefix,
    isMock,
    uuids,
  } = params;

  const generateStructure = !playoffAttributes || playoffAttributes[exitProfile];
  if (!generateStructure || drawSize < 2) return {};

  const structures: Structure[] = [];
  const links: DrawLink[] = [];

  const attributeProfile = playoffAttributes[exitProfile];
  const structureName =
    params.structureName ||
    attributeProfile?.name ||
    `${finishingPositionOffset + 1}-${finishingPositionOffset + drawSize}`;

  const structureAbbreviation = attributeProfile?.abbreviation;
  const resolvedStructureId = structureId ?? attributeProfile?.structureId ?? uuids?.pop();

  // Generate matchUps for this structure using luckyDraw (handles both power-of-2 and non-power-of-2)
  const { matchUps } = luckyDraw({
    finishingPositionOffset,
    matchUpType,
    drawSize,
    idPrefix: idPrefix && `${idPrefix}-${structureName}-RP`,
    isMock,
    uuids,
  });

  const structure = structureTemplate({
    structureAbbreviation,
    structureName,
    stageSequence,
    matchUpType,
    roundOffset,
    structureId: resolvedStructureId,
    matchUps,
    stage,
  });

  structures.push(structure);

  // Compute child sizes from round profiles
  const childRounds = computeChildRounds(drawSize);
  const rounds = childRounds.length;
  const roundsToPlayOff = Math.min(roundOffsetLimit - roundOffset, rounds);

  for (let i = 0; i < roundsToPlayOff; i++) {
    const { roundNumber, childSize } = childRounds[i];
    if (childSize < 2) continue;

    const childFinishingPositionOffset = finishingPositionOffset + computeParticipantsAbove(drawSize, roundNumber);

    const childExitProfile = `${exitProfile}-${roundNumber}`;

    const childResult = generateAdaptiveStructures({
      finishingPositionOffset: childFinishingPositionOffset,
      exitProfile: childExitProfile,
      roundOffset: roundOffset + roundNumber,
      stageSequence: stageSequence + 1,
      drawSize: childSize,
      stage: childStage,
      playoffAttributes,
      roundOffsetLimit,
      childStage,
      matchUpType,
      idPrefix,
      isMock,
      uuids,
    });

    if (childResult.structureId && structure.structureId) {
      const link = {
        linkType: LOSER,
        source: {
          roundNumber,
          structureId: structure.structureId,
        },
        target: {
          roundNumber: 1,
          feedProfile: TOP_DOWN,
          structureId: childResult.structureId,
        },
      };
      links.push(link);
    }

    if (childResult.structures?.length) structures.push(...childResult.structures);
    if (childResult.links?.length) links.push(...childResult.links);
  }

  return {
    structureId: structure.structureId,
    structures,
    links,
    ...SUCCESS,
  };
}

/**
 * Compute the child draw sizes for each round of a lucky draw structure.
 * For each round, losers exit to a child structure:
 * - Pre-feed round: childSize = matchUpsCount - 1 (1 lucky loser stays for feed)
 * - Non-pre-feed round: childSize = matchUpsCount (all losers exit)
 */
function computeChildRounds(drawSize: number): { roundNumber: number; childSize: number }[] {
  if (isPowerOf2(drawSize)) {
    // Power-of-2: standard halving like COMPASS
    const rounds = Math.ceil(Math.log(drawSize) / Math.log(2));
    const result: { roundNumber: number; childSize: number }[] = [];
    for (let r = 1; r <= rounds; r++) {
      const childSize = drawSize / Math.pow(2, r);
      if (childSize >= 2) {
        result.push({ roundNumber: r, childSize });
      }
    }
    return result;
  }

  const roundProfiles = luckyRoundProfiles(drawSize);
  const result: { roundNumber: number; childSize: number }[] = [];

  for (let i = 0; i < roundProfiles.length - 1; i++) {
    const profile = roundProfiles[i];
    const matchUpsCount = profile.participantsCount / 2;

    // In a pre-feed round, one loser is retained as a lucky loser for the next round's feed
    const childSize = profile.preFeedRound ? matchUpsCount - 1 : matchUpsCount;

    if (childSize >= 2) {
      result.push({ roundNumber: i + 1, childSize });
    }
  }

  return result;
}

/**
 * Compute how many participants finish above a given round's losers.
 * This determines the finishing position offset for child structures.
 */
function computeParticipantsAbove(drawSize: number, roundNumber: number): number {
  if (isPowerOf2(drawSize)) {
    return drawSize / Math.pow(2, roundNumber);
  }

  const roundProfiles = luckyRoundProfiles(drawSize);
  // Participants who survive past this round = participants in the next round
  if (roundNumber < roundProfiles.length) {
    return Math.ceil(roundProfiles[roundNumber].participantsCount / 2);
  }
  return 1; // final winner
}
