import { generateAndPopulateRRplayoffStructures } from './generateAndPopulateRRplayoffStructures';
import { getAvailablePlayoffProfiles } from '@Query/drawDefinition/getAvailablePlayoffProfiles';
import { assignDrawPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { NamingEntry, generatePlayoffStructures } from './drawTypes/playoffStructures';
import { directParticipants } from '@Mutate/matchUps/drawPositions/directParticipants';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { matchUpCompletion } from '@Query/matchUp/checkMatchUpIsComplete';
import { processPlayoffGroups } from './drawTypes/processPlayoffGroups';
import { getSourceRounds } from '@Query/drawDefinition/getSourceRounds';
import { decorateResult } from '@Functions/global/decorateResult';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getMatchUpId } from '@Functions/global/extractors';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { structuresOf } from '@Acquire/structureMembers';
import { findStructure } from '@Acquire/findStructure';
import { addGoesTo } from '@Query/matchUps/addGoesTo';
import { generateTieMatchUps } from './tieMatchUps';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { ensureInt } from '@Tools/ensureInt';
import { isConvertableInteger, nextPowerOf2 } from '@Tools/math';

// constants and types
import { INVALID_VALUES, MISSING_DRAW_DEFINITION, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DrawDefinition, DrawLink, Event, Structure, Tournament } from '@Types/tournamentTypes';
import { CONTAINER, LOSER, PLAY_OFF, TOP_DOWN } from '@Constants/drawDefinitionConstants';
import type { PlayoffGroupConfig } from '@Validators/validatePlayoffGroups';
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
  playoffGroups?: PlayoffGroupConfig[];
  // cap the rounds generated in each playoff structure (a consolation that plays one or two rounds);
  // roundLimits keys are SOURCE round numbers and override roundLimit for that structure
  roundLimits?: { [sourceRoundNumber: number]: number };
  roundNumbers?: number[];
  roundLimit?: number;
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
  const resolved = resolvePlayoffParams(params, stack);
  if (resolved.error || resolved.earlyReturn) return resolved.earlyReturn ?? resolved;

  const {
    addNameBaseToAttributeName,
    playoffStructureNameBase,
    finishingPositionNaming,
    finishingPositionLimit,
    availabilityResult,
    sourceStructureId,
    playoffAttributes,
    playoffPositions,
    roundOffsetLimit,
    tournamentRecord,
    exitProfileLimit,
    drawDefinition,
    roundProfiles,
    roundNumbers,
    roundLimits,
    roundLimit,
    structure,
    idPrefix,
    isMock,
    event,
    uuids,
  } = resolved;

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

  const isLuckyDraw = isLuckyBasedDraw(drawDefinition.drawType);

  for (const roundNumber of sourceRounds ?? []) {
    const roundInfo = roundsRanges?.find((roundInfo) => roundInfo.roundNumber === roundNumber);
    if (!roundInfo)
      return decorateResult({
        result: { error: INVALID_VALUES },
        context: { roundNumber },
        stack,
      });
    const drawSize = computePlayoffDrawSize({
      finishingPositionsCount: roundInfo.finishingPositions.length,
      isLuckyDraw,
      roundNumber,
      structure,
    });
    const finishingPositionOffset = Math.min(...roundInfo.finishingPositions) - 1;

    const stageSequence = 2;
    const sequenceLimit = roundNumber && roundProfile?.[roundNumber] && stageSequence + roundProfile[roundNumber] - 1;

    const result = generatePlayoffStructures({
      roundLimit: roundLimits?.[Number(roundNumber)] ?? roundLimit,
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

  const advanced = advanceCompletedMatchUps({
    inContextDrawMatchUps,
    sourceStructureId,
    tournamentRecord,
    drawDefinition,
    matchUpsMap,
    structure,
    event,
  });
  if (advanced?.error) return decorateResult({ result: advanced, stack });

  const byesAdvanced = advanceByeMatchUps({
    inContextDrawMatchUps,
    sourceStructureId,
    tournamentRecord,
    drawDefinition,
    event,
  });
  if (byesAdvanced?.error) return decorateResult({ result: byesAdvanced, stack });

  const matchUpModifications = buildMatchUpModifications({
    inContextDrawMatchUps,
    sourceStructureId,
    tournamentRecord,
    drawDefinition,
    matchUpsMap,
    params,
    stack,
  });
  if (!Array.isArray(matchUpModifications)) return decorateResult({ result: matchUpModifications, stack });

  return {
    structures: newStructures,
    matchUpModifications,
    links: newLinks,
    drawDefinition,
    ...SUCCESS,
  };
}

function resolvePlayoffParams(params: GenerateAndPopulateArgs, stack: string): any {
  if (!params.drawDefinition) {
    return { error: true, earlyReturn: decorateResult({ result: { error: MISSING_DRAW_DEFINITION }, stack }) };
  }

  const availabilityResult = getAvailablePlayoffProfiles(params);
  if (availabilityResult.error) {
    return { error: true, earlyReturn: decorateResult({ result: availabilityResult, stack }) };
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
    playoffGroups,
    roundProfiles,
    roundNumbers,
    roundLimits,
    roundLimit,
    idPrefix,
    isMock,
    event,
    uuids,
  } = params;

  const limits = [roundLimit, ...Object.values(roundLimits ?? {})].filter((limit) => limit !== undefined);
  if (limits.some((limit) => !isConvertableInteger(limit) || Number(limit) < 1)) {
    return {
      error: true,
      earlyReturn: decorateResult({ result: { error: INVALID_VALUES }, context: { roundLimit, roundLimits }, stack }),
    };
  }

  const drawDefinition = makeDeepCopy(params.drawDefinition, false, true);

  const { structure } = findStructure({
    structureId: sourceStructureId,
    drawDefinition,
  });

  if (!structure) {
    return { error: true, earlyReturn: decorateResult({ result: { error: STRUCTURE_NOT_FOUND }, stack }) };
  }

  if (structure.structureType === CONTAINER || structuresOf(structure)) {
    return {
      error: true,
      earlyReturn: generateAndPopulateRRplayoffStructures({
        sourceStructureId: structure.structureId,
        ...params,
        ...availabilityResult,
        drawDefinition,
      }),
    };
  }

  if (playoffGroups?.length) {
    return {
      error: true,
      earlyReturn: generatePositionBasedPlayoffs({
        sourceStructureId: sourceStructureId!,
        tournamentRecord,
        drawDefinition,
        playoffGroups,
        structure,
        idPrefix,
        isMock,
        event,
        uuids,
        stack,
      }),
    };
  }

  return {
    addNameBaseToAttributeName,
    playoffStructureNameBase,
    finishingPositionNaming,
    finishingPositionLimit,
    availabilityResult,
    sourceStructureId,
    playoffAttributes,
    playoffPositions,
    roundOffsetLimit,
    tournamentRecord,
    exitProfileLimit,
    drawDefinition,
    roundProfiles,
    roundNumbers,
    roundLimits,
    roundLimit,
    structure,
    idPrefix,
    isMock,
    event,
    uuids,
  };
}

function generatePositionBasedPlayoffs({
  sourceStructureId,
  tournamentRecord,
  drawDefinition,
  playoffGroups,
  structure,
  idPrefix,
  isMock,
  event,
  uuids,
  stack,
}) {
  const result = processPlayoffGroups({
    requireSequential: false,
    matchUpType: event?.eventType,
    sourceStructureId,
    drawDefinition,
    playoffGroups,
    groupCount: 1,
    idPrefix,
    isMock,
    uuids,
  });
  if (result.error) return decorateResult({ result, stack });
  const { structures: playoffStructures, links: playoffLinks } = result;

  if (!playoffStructures?.length) {
    return decorateResult({
      result: { error: INVALID_VALUES },
      info: 'No playoff structures generated',
      stack,
    });
  }

  drawDefinition.structures.push(...playoffStructures);
  if (playoffLinks?.length) drawDefinition.links.push(...playoffLinks);

  const { matchUps: inContextDrawMatchUps, matchUpsMap } = getAllDrawMatchUps({
    inContext: true,
    drawDefinition,
  });

  const advanced = advanceCompletedMatchUps({
    inContextDrawMatchUps,
    sourceStructureId,
    tournamentRecord,
    drawDefinition,
    matchUpsMap,
    structure,
    event,
  });
  if (advanced?.error) return decorateResult({ result: advanced, stack });

  const byesAdvanced = advanceByeMatchUps({
    inContextDrawMatchUps,
    sourceStructureId,
    tournamentRecord,
    drawDefinition,
    event,
  });
  if (byesAdvanced?.error) return decorateResult({ result: byesAdvanced, stack });

  return {
    structures: playoffStructures,
    links: playoffLinks,
    matchUpModifications: [],
    drawDefinition,
    ...SUCCESS,
  };
}

function computePlayoffDrawSize({ finishingPositionsCount, isLuckyDraw, roundNumber, structure }) {
  let drawSize = finishingPositionsCount;

  if (isLuckyDraw && structure) {
    const roundMatchUps = (structure.matchUps ?? []).filter((m) => m.roundNumber === roundNumber);
    const matchUpsInRound = roundMatchUps.length;
    const isFinal = matchUpsInRound === 1;
    if (!isFinal && matchUpsInRound % 2 !== 0) {
      const discardedCount = matchUpsInRound - 1;
      const adjusted = discardedCount % 2 === 0 ? discardedCount : discardedCount + 1;
      let p = 1;
      while (p < adjusted) p *= 2;
      drawSize = p;
    } else {
      drawSize = nextPowerOf2(drawSize);
    }
  }

  return drawSize;
}

function advanceCompletedMatchUps({
  inContextDrawMatchUps,
  sourceStructureId,
  tournamentRecord,
  drawDefinition,
  matchUpsMap,
  structure,
  event,
}) {
  const completedMatchUps = inContextDrawMatchUps?.filter(
    (matchUp) => matchUpCompletion(matchUp) && matchUp.structureId === sourceStructureId,
  );

  for (const matchUp of completedMatchUps ?? []) {
    const { matchUpId, score, winningSide } = matchUp;
    const targetData = positionTargets({
      inContextDrawMatchUps,
      drawDefinition,
      matchUpId,
    });
    // a malformed round link is returned; the other errors here are logged, as they were
    if (targetData.error) return targetData;
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
    if (result.error) pushGlobalLog({ method: 'generateAndPopulatePlayoffStructures', error: result.error });
  }
  return undefined;
}

export function advanceByeMatchUps({
  inContextDrawMatchUps,
  sourceStructureId,
  tournamentRecord,
  drawDefinition,
  event,
}) {
  const byeMatchUps = inContextDrawMatchUps?.filter(
    (matchUp) => matchUp.matchUpStatus === BYE && matchUp.structureId === sourceStructureId,
  );

  for (const matchUp of byeMatchUps ?? []) {
    const { matchUpId } = matchUp;
    const targetData = positionTargets({
      inContextDrawMatchUps,
      drawDefinition,
      matchUpId,
    });
    if (targetData.error) return targetData;
    const {
      targetLinks: { loserTargetLink },
      targetMatchUps: { loserMatchUpDrawPositionIndex, loserMatchUp },
    } = targetData;

    // a loser target found from a link always has its drawPositions and the index into them
    if (loserTargetLink && loserMatchUp?.drawPositions && loserMatchUpDrawPositionIndex !== undefined) {
      const targetStructureId = loserTargetLink.target.structureId;
      // the side's position, read structurally: index 0 is side 1
      const targetDrawPosition = getSideDrawPosition({
        sideNumber: loserMatchUpDrawPositionIndex + 1,
        structureId: targetStructureId,
        matchUp: loserMatchUp,
        drawDefinition,
      });
      if (!targetDrawPosition) continue;

      const result = assignDrawPositionBye({
        drawPosition: targetDrawPosition,
        structureId: targetStructureId,
        tournamentRecord,
        drawDefinition,
        event,
      });
      if (result.error) pushGlobalLog({ method: 'generateAndPopulatePlayoffStructures', error: result.error });
    }
  }
  return undefined;
}

function buildMatchUpModifications({
  inContextDrawMatchUps,
  sourceStructureId,
  tournamentRecord,
  drawDefinition,
  matchUpsMap,
  params,
  stack,
}) {
  const matchUpModifications: any[] = [];
  const goesTo = addGoesTo({
    inContextDrawMatchUps,
    drawDefinition,
    matchUpsMap,
  });
  if (goesTo.error) return goesTo;
  const goesToMap = goesTo.goesToMap;

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

  return matchUpModifications;
}
