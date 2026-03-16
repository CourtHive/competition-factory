import { generateAndPopulateRRplayoffStructures } from './generateAndPopulateRRplayoffStructures';
import { getAvailablePlayoffProfiles } from '@Query/drawDefinition/getAvailablePlayoffProfiles';
import { assignDrawPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { NamingEntry, generatePlayoffStructures } from './drawTypes/playoffStructures';
import { directParticipants } from '@Mutate/matchUps/drawPositions/directParticipants';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { checkMatchUpIsComplete } from '@Query/matchUp/checkMatchUpIsComplete';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { getSourceRounds } from '@Query/drawDefinition/getSourceRounds';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getMatchUpId } from '@Functions/global/extractors';
import { addGoesTo } from '@Query/matchUps/addGoesTo';
import { findStructure } from '@Acquire/findStructure';
import { generateTieMatchUps } from './tieMatchUps';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { nextPowerOf2 } from '@Tools/math';
import { ensureInt } from '@Tools/ensureInt';

// constants and types
import { INVALID_VALUES, MISSING_DRAW_DEFINITION, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DrawDefinition, DrawLink, Event, Structure, Tournament } from '@Types/tournamentTypes';
import { CONTAINER, LOSER, PLAY_OFF, TOP_DOWN } from '@Constants/drawDefinitionConstants';
import { RoundProfile, ResultType } from '@Types/factoryTypes';
import { BYE } from '@Constants/matchUpStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { TEAM } from '@Constants/matchUpTypes';

type GenerateAndPopulateArgs = {
  addNameBaseToAttributeName?: boolean;
  finishingPositionNaming?: NamingEntry;
  playoffStructureNameBase?: string;
  playoffAttributes?: NamingEntry;
  finishingPositionLimit?: number;
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  roundProfiles?: RoundProfile[];
  playoffPositions?: number[];
  roundOffsetLimit?: number;
  exitProfileLimit?: boolean;
  roundNumbers?: number[];
  structureId: string;
  idPrefix?: string;
  isMock?: boolean;
  uuids?: string[];
  event?: Event;
};
export function generateAndPopulatePlayoffStructures(params: GenerateAndPopulateArgs): ResultType & {
  drawDefinition?: DrawDefinition;
  matchUpModifications?: any[];
  structures?: Structure[];
  links?: DrawLink[];
  success?: boolean;
} {
  const stack = 'genPlayoffStructure';
  if (!params.drawDefinition)
    return decorateResult({
      result: { error: MISSING_DRAW_DEFINITION },
      stack,
    });

  const availabilityResult = getAvailablePlayoffProfiles(params);
  if (availabilityResult.error) {
    return decorateResult({ result: availabilityResult, stack });
  }

  const {
    structureId: sourceStructureId,
    addNameBaseToAttributeName,
    playoffStructureNameBase,
    finishingPositionNaming,
    finishingPositionLimit,
    playoffAttributes,
    playoffPositions,
    roundOffsetLimit,
    tournamentRecord,
    exitProfileLimit,
    roundProfiles,
    roundNumbers,
    idPrefix,
    isMock,
    event,
    uuids,
  } = params;

  // The goal here is to return { structures, links } and not modify existing drawDefinition
  // However, a copy of the drawDefinition needs to have the structures attached in order to
  // populate the newly created structures with participants which should advance into them
  const drawDefinition = makeDeepCopy(params.drawDefinition, false, true);

  const { structure } = findStructure({
    structureId: sourceStructureId,
    drawDefinition,
  });

  if (!structure) return decorateResult({ result: { error: STRUCTURE_NOT_FOUND }, stack });

  if (structure.structureType === CONTAINER || structure.structures) {
    return generateAndPopulateRRplayoffStructures({
      sourceStructureId: structure.structureId,
      ...params,
      ...availabilityResult,
      drawDefinition, // order is important!
    });
  }

  const { playoffRoundsRanges: availablePlayoffRoundsRanges, playoffRounds: availablePlayoffRounds } =
    availabilityResult;

  const {
    playoffPositionsReturned,
    error: sourceRoundsError,
    playoffSourceRounds,
    playoffRoundsRanges,
  } = getSourceRounds(params);

  if (sourceRoundsError) {
    return decorateResult({ result: { error: sourceRoundsError }, stack });
  }

  const roundProfile = roundProfiles?.length && Object.assign({}, ...roundProfiles);

  const targetRoundNumbers =
    roundNumbers || (typeof roundProfiles === 'object' && roundProfiles.flatMap((p) => Object.keys(p)));

  const validRoundNumbers =
    Array.isArray(targetRoundNumbers) &&
    targetRoundNumbers.map((p) => !Number.isNaN(Number(p)) && ensureInt(p)).filter(Boolean);

  if (validRoundNumbers) {
    if (!Array.isArray(validRoundNumbers))
      return decorateResult({
        result: { error: INVALID_VALUES },
        context: { validRoundNumbers },
        stack,
      });

    validRoundNumbers.forEach((roundNumber) => {
      if (!availablePlayoffRounds?.includes(roundNumber)) {
        return decorateResult({
          result: { error: INVALID_VALUES },
          context: { roundNumber },
          stack,
        });
      }
      return undefined;
    });
  }

  if (playoffPositions) {
    playoffPositions.forEach((playoffPosition) => {
      if (!playoffPositionsReturned?.includes(playoffPosition)) {
        return decorateResult({
          result: { error: INVALID_VALUES },
          context: { playoffPosition },
          stack,
        });
      }
      return undefined;
    });
  }

  const sourceRounds = validRoundNumbers || playoffSourceRounds;
  const roundsRanges = validRoundNumbers ? availablePlayoffRoundsRanges : playoffRoundsRanges;

  const newStructures: Structure[] = [];
  const newLinks: DrawLink[] = [];

  // For LUCKY_DRAW pre-feed rounds, the playoff drawSize must be computed from
  // the actual matchUp count (discarded losers = matchUpsInRound - 1), not from
  // finishing positions which don't account for the lucky loser selection.
  const isLuckyDraw = isLuckyBasedDraw(drawDefinition.drawType);

  for (const roundNumber of sourceRounds ?? []) {
    const roundInfo = roundsRanges?.find((roundInfo) => roundInfo.roundNumber === roundNumber);
    if (!roundInfo)
      return decorateResult({
        result: { error: INVALID_VALUES },
        context: { roundNumber },
        stack,
      });
    let drawSize = roundInfo.finishingPositions.length;
    const finishingPositionOffset = Math.min(...roundInfo.finishingPositions) - 1;

    // Lucky draw override: pre-feed rounds have odd matchUp count; discarded losers = count - 1
    if (isLuckyDraw && structure) {
      const roundMatchUps = (structure.matchUps || []).filter((m) => m.roundNumber === roundNumber);
      const matchUpsInRound = roundMatchUps.length;
      const isFinal = matchUpsInRound === 1;
      if (!isFinal && matchUpsInRound % 2 !== 0) {
        // Pre-feed round: all losers minus the lucky selection
        const discardedCount = matchUpsInRound - 1;
        // If odd, round up for a single BYE
        const adjusted = discardedCount % 2 === 0 ? discardedCount : discardedCount + 1;
        // Round up to next power of 2 for standard elimination bracket
        let p = 1;
        while (p < adjusted) p *= 2;
        drawSize = p;
      } else {
        // For rounds with even matchUp count (e.g. drawSize 11 has 6 matchUps in round 1
        // including a BYE), the loser count may still not be a power of 2.
        // Round up to next power of 2 for a valid elimination bracket.
        drawSize = nextPowerOf2(drawSize);
      }
    }

    const stageSequence = 2;
    const sequenceLimit = roundNumber && roundProfile?.[roundNumber] && stageSequence + roundProfile[roundNumber] - 1;

    const result = generatePlayoffStructures({
      exitProfile: `0-${roundNumber}`,
      addNameBaseToAttributeName,
      playoffStructureNameBase,
      finishingPositionOffset,
      playoffAttributes,
      exitProfileLimit,
      stage: PLAY_OFF,
      roundOffset: 0,
      drawDefinition,
      sequenceLimit,
      stageSequence,
      drawSize,
      idPrefix,
      isMock,
      uuids,

      finishingPositionNaming,
      finishingPositionLimit,
      roundOffsetLimit,
    });
    if (result.error) return decorateResult({ result, stack });

    const { structures, links } = result;

    if (structures?.length) newStructures.push(...structures);
    if (links?.length) newLinks.push(...links);

    if (result.structureId && roundNumber) {
      const link: DrawLink = {
        linkType: LOSER,
        source: {
          structureId: sourceStructureId,
          roundNumber,
        },
        target: {
          structureId: result.structureId,
          feedProfile: TOP_DOWN,
          roundNumber: 1,
        },
      };

      newLinks.push(link);
    }
  }

  if (!newStructures.length)
    return decorateResult({
      result: { error: INVALID_VALUES },
      info: 'No structures generated',
      stack,
    });

  drawDefinition.structures.push(...newStructures);
  drawDefinition.links.push(...newLinks);

  const { matchUps: inContextDrawMatchUps, matchUpsMap } = getAllDrawMatchUps({
    inContext: true,
    drawDefinition,
  });

  const newStructureIds = new Set(newStructures.map(({ structureId }) => structureId));
  const addedMatchUpIds = inContextDrawMatchUps
    ?.filter(({ structureId }) => newStructureIds.has(structureId))
    .map(getMatchUpId);

  const addedMatchUps = matchUpsMap?.drawMatchUps?.filter(({ matchUpId }) => addedMatchUpIds?.includes(matchUpId));

  if (addedMatchUps?.length) {
    const tieFormat = resolveTieFormat({ drawDefinition, event })?.tieFormat;

    if (tieFormat) {
      addedMatchUps.forEach((matchUp) => {
        const { tieMatchUps } = generateTieMatchUps({ matchUp, tieFormat, isMock });
        Object.assign(matchUp, { tieMatchUps, matchUpType: TEAM });
      });
    }
  }

  // now advance any players from completed matchUps into the newly added structures
  // Note: for lucky draw pre-feed rounds, directParticipants itself skips loser
  // direction — luckyDrawAdvancement handles placement after the lucky loser selection
  const completedMatchUps = inContextDrawMatchUps?.filter(
    (matchUp) => checkMatchUpIsComplete({ matchUp }) && matchUp.structureId === sourceStructureId,
  );

  completedMatchUps?.forEach((matchUp) => {
    const { matchUpId, score, winningSide } = matchUp;
    const targetData = positionTargets({
      inContextDrawMatchUps,
      drawDefinition,
      matchUpId,
    });
    const result = directParticipants({
      inContextDrawMatchUps,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      winningSide,
      targetData,
      matchUpId,
      structure,
      matchUp,
      score,
      event,
    });
    if (result.error) console.log(result.error);
  });

  const byeMatchUps = inContextDrawMatchUps?.filter(
    (matchUp) => matchUp.matchUpStatus === BYE && matchUp.structureId === sourceStructureId,
  );

  byeMatchUps?.forEach((matchUp) => {
    const { matchUpId } = matchUp;
    const targetData = positionTargets({
      inContextDrawMatchUps,
      drawDefinition,
      matchUpId,
    });
    const {
      targetLinks: { loserTargetLink },
      targetMatchUps: {
        loserMatchUpDrawPositionIndex, // only present when positionTargets found without loserMatchUpId
        loserMatchUp,
      },
    } = targetData;

    if (loserTargetLink && loserMatchUp) {
      const targetStructureId = loserTargetLink.target.structureId;
      const targetDrawPosition = loserMatchUp.drawPositions[loserMatchUpDrawPositionIndex];

      const result = assignDrawPositionBye({
        drawPosition: targetDrawPosition,
        structureId: targetStructureId,
        tournamentRecord,
        drawDefinition,
        event,
      });
      if (result.error) console.log(result.error);
    }
  });

  // the matchUps in the source structure must have goesTo details added
  const matchUpModifications: any[] = [];
  const goesToMap = addGoesTo({
    inContextDrawMatchUps,
    drawDefinition,
    matchUpsMap,
  }).goesToMap;

  const { structure: sourceStructure } = findStructure({
    drawDefinition: params.drawDefinition,
    structureId: sourceStructureId,
  });

  const { matchUps: sourceStructureMatchUps } = getAllStructureMatchUps({
    structure: sourceStructure,
  });

  sourceStructureMatchUps.forEach((matchUp) => {
    const loserMatchUpId = goesToMap?.loserMatchUpIds[matchUp.matchUpId];
    if (loserMatchUpId && matchUp.loserMatchUpId !== loserMatchUpId) {
      matchUp.loserMatchUpId = loserMatchUpId;
      const modification = {
        tournamentId: tournamentRecord?.tournamentId,
        eventId: params.event?.eventId,
        context: stack,
        matchUp,
      };
      matchUpModifications.push(modification);
    }
    const winnerMatchUpId = goesToMap?.winnerMatchUpIds[matchUp.matchUpId];
    if (winnerMatchUpId && matchUp.winnerMatchUpId !== winnerMatchUpId) {
      matchUp.winnerMatchUpId = winnerMatchUpId;
      const modification = {
        tournamentId: tournamentRecord?.tournamentId,
        eventId: params.event?.eventId,
        context: stack,
        matchUp,
      };
      matchUpModifications.push(modification);
    }
  });

  return {
    structures: newStructures,
    matchUpModifications,
    links: newLinks,
    drawDefinition,
    ...SUCCESS,
  };
}
