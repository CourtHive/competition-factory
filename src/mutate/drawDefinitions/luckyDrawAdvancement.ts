import { modifyPositionAssignmentsNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getLuckyDrawRoundStatus } from '@Query/drawDefinition/getLuckyDrawRoundStatus';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { decorateResult } from '@Functions/global/decorateResult';
import { getDevContext } from '@Global/state/globalState';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { isLucky } from '@Query/drawDefinition/isLucky';
import { findStructure } from '@Acquire/findStructure';

// constants
import { INVALID_VALUES, MISSING_DRAW_DEFINITION, MISSING_PARTICIPANT_ID } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { LOSER, WIN_RATIO } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

type LuckyDrawAdvancementArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  participantId?: string;
  structureId?: string;
  random?: () => number;
  roundNumber: number;
  event?: Event;
};

const stack = 'luckyDrawAdvancement';

/**
 * Advances participants from a completed round into the next round of a lucky draw.
 *
 * For pre-feed rounds: advances all winners + the selected lucky loser.
 * For non-pre-feed rounds: advances all winners (no loser selection needed).
 *
 * Works by assigning virtual drawPositions to next-round matchUps and creating
 * corresponding positionAssignment entries, which enables the standard scoring
 * flow to work for those matchUps.
 */
export function luckyDrawAdvancement({
  tournamentRecord,
  drawDefinition,
  participantId,
  structureId,
  roundNumber,
  random,
  event,
}: LuckyDrawAdvancementArgs): ResultType {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  structureId = structureId || drawDefinition.structures?.[0]?.structureId;
  if (!structureId) return { error: INVALID_VALUES };

  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return { error: INVALID_VALUES };

  if (!isLuckyBasedDraw(drawDefinition.drawType) && !isLucky({ drawDefinition, structure })) {
    return decorateResult({ result: { error: INVALID_VALUES }, info: 'Not a lucky draw' });
  }

  // Get round status with participant info
  const statusResult = getLuckyDrawRoundStatus({ tournamentRecord, drawDefinition, structureId });
  if (statusResult.error) return statusResult;

  const roundStatus = statusResult.rounds?.find((r) => r.roundNumber === roundNumber);
  if (!roundStatus?.isComplete) {
    return decorateResult({ result: { error: INVALID_VALUES }, info: 'Round is not complete' });
  }

  // Validate pre-feed round requires a lucky loser selection
  if (roundStatus.isPreFeedRound && roundStatus.needsLuckySelection) {
    if (!participantId) return { error: MISSING_PARTICIPANT_ID };

    const eligible = roundStatus.eligibleLosers?.find((l) => l.participantId === participantId);
    if (!eligible) {
      return decorateResult({
        result: { error: INVALID_VALUES },
        info: 'Participant is not an eligible loser from this round',
      });
    }
  }

  // Find next round matchUps sorted by roundPosition
  const nextRoundNumber = roundNumber + 1;
  const nextRoundMatchUps = (structure.matchUps ?? [])
    .filter((m) => m.roundNumber === nextRoundNumber)
    .sort((a, b) => (a.roundPosition || 0) - (b.roundPosition || 0));

  // Collect advancing participant IDs: winners in roundPosition order + lucky loser
  const winners = roundStatus.advancingWinners ?? [];
  const advancingParticipantIds = winners.map((w) => w.participantId);

  if (roundStatus.isPreFeedRound && participantId) {
    insertLuckyLoser({
      advancingParticipantIds,
      nextRoundMatchUps,
      roundStatus,
      participantId,
      winners,
      random,
    });
  }

  if (!nextRoundMatchUps.length) {
    return decorateResult({ result: { error: INVALID_VALUES }, info: 'No matchUps found in next round' });
  }

  const expectedCount = nextRoundMatchUps.length * 2;
  if (advancingParticipantIds.length !== expectedCount) {
    return decorateResult({
      result: { error: INVALID_VALUES },
      info: `Expected ${expectedCount} advancing participants, got ${advancingParticipantIds.length}`,
    });
  }

  let positionAssignments = structure.positionAssignments ?? [];
  positionAssignments = cleanupStalePositionAssignments({
    positionAssignments,
    nextRoundMatchUps,
    structure,
    roundNumber,
  });
  structure.positionAssignments = positionAssignments;

  const prepError = prepareNextRoundMatchUps({ nextRoundMatchUps, positionAssignments });
  if (prepError) return prepError;

  const tournamentId = tournamentRecord?.tournamentId;

  assignNextRoundPositions({
    advancingParticipantIds,
    positionAssignments,
    nextRoundMatchUps,
    drawDefinition,
    roundNumber,
    roundStatus,
    participantId,
    tournamentId,
    structureId,
    structure,
  });

  modifyPositionAssignmentsNotice({
    drawDefinition,
    tournamentId,
    structure,
    event,
  });

  if (roundStatus.isPreFeedRound && participantId) {
    handleDiscardedLosers({
      drawDefinition,
      tournamentRecord,
      roundStatus,
      participantId,
      structureId,
      roundNumber,
      event,
    });
  }

  return { ...SUCCESS };
}

/**
 * Places discarded losers from a lucky draw pre-feed round into a linked
 * consolidation/playoff structure at the specified target round.
 */
function placeDiscardedLosers({
  drawDefinition,
  tournamentRecord,
  targetStructureId,
  targetRoundNumber,
  feedProfile,
  participantIds,
  event,
}: {
  drawDefinition: DrawDefinition;
  tournamentRecord?: Tournament;
  targetStructureId: string;
  targetRoundNumber: number;
  feedProfile?: string;
  participantIds: string[];
  event?: Event;
}): ResultType | undefined {
  const { structure: targetStructure } = findStructure({ drawDefinition, structureId: targetStructureId });
  if (!targetStructure) return { error: INVALID_VALUES };

  // AD_HOC target structures (finishingPosition=WIN_RATIO) don't use matchUps
  // or position assignments. Participants are already in drawDefinition.entries
  // and available for ad-hoc round generation.
  if (isAdHoc({ structure: targetStructure }) && targetStructure.finishingPosition === WIN_RATIO) {
    return { ...SUCCESS };
  }

  let targetMatchUps = (targetStructure.matchUps ?? [])
    .filter((m) => m.roundNumber === targetRoundNumber)
    .sort((a, b) => (a.roundPosition || 0) - (b.roundPosition || 0));

  let targetPositionAssignments = targetStructure.positionAssignments ?? [];
  const unfilledPositions: number[] = [];

  targetStructure.matchUps ??= [];
  if (targetMatchUps.length === 0) {
    createVirtualMatchUps({
      targetStructure,
      targetStructureId,
      targetRoundNumber,
      participantIds,
      unfilledPositions,
    });

    targetMatchUps = targetStructure.matchUps
      .filter((m) => m.roundNumber === targetRoundNumber)
      .sort((a, b) => (a.roundPosition || 0) - (b.roundPosition || 0));
  } else {
    findUnfilledPositions({
      targetMatchUps,
      targetPositionAssignments,
      targetStructure,
      unfilledPositions,
    });
  }

  // Order positions based on feedProfile
  if (feedProfile === 'BOTTOM_UP') {
    unfilledPositions.sort((a, b) => b - a);
  } else {
    unfilledPositions.sort((a, b) => a - b);
  }

  const tournamentId = tournamentRecord?.tournamentId;

  // Place each discarded loser into the next available position
  for (let i = 0; i < participantIds.length && i < unfilledPositions.length; i++) {
    const drawPosition = unfilledPositions[i];
    const participantId = participantIds[i];

    // Update existing empty assignment if present, otherwise append
    const existingAssignment = targetPositionAssignments.find(
      (a) => a.drawPosition === drawPosition && !a.participantId,
    );
    if (existingAssignment) {
      existingAssignment.participantId = participantId;
    } else {
      targetPositionAssignments.push({ drawPosition, participantId });
    }

    // Find which matchUp this position belongs to and notify
    const matchUp = targetMatchUps.find((m) => m.drawPositions?.includes(drawPosition));
    if (matchUp) {
      modifyMatchUpNotice({
        context: stack,
        drawDefinition,
        tournamentId,
        structureId: targetStructureId,
        matchUp,
      });
    }
  }

  targetStructure.positionAssignments = targetPositionAssignments;

  modifyPositionAssignmentsNotice({
    drawDefinition,
    tournamentId,
    structure: targetStructure,
    event,
  });

  return { ...SUCCESS };
}

function handleDiscardedLosers({
  drawDefinition,
  tournamentRecord,
  roundStatus,
  participantId,
  structureId,
  roundNumber,
  event,
}) {
  const discardedLosers = (roundStatus.eligibleLosers ?? [])
    .filter((l) => l.participantId !== participantId)
    .map((l) => l.participantId);

  if (!discardedLosers.length) return;

  const loserLinks = (drawDefinition.links ?? []).filter(
    (link) =>
      link.linkType === LOSER &&
      link.source.structureId === structureId &&
      (link.source.roundNumber || 1) === roundNumber,
  );

  for (const link of loserLinks) {
    const result = placeDiscardedLosers({
      drawDefinition,
      tournamentRecord,
      targetStructureId: link.target.structureId,
      targetRoundNumber: link.target.roundNumber,
      feedProfile: link.target.feedProfile,
      participantIds: discardedLosers,
      event,
    });
    if (result?.error && getDevContext()) {
      console.warn('Failed to place discarded losers in consolidation structure:', result.error);
    }
  }
}

function prepareNextRoundMatchUps({ nextRoundMatchUps, positionAssignments }): ResultType | undefined {
  for (const matchUp of nextRoundMatchUps) {
    const dps = matchUp.drawPositions;
    if (!dps?.length) continue;

    const assignedPositions = dps.filter((dp) => {
      if (!dp) return false;
      return positionAssignments.some((a) => a.drawPosition === dp && a.participantId);
    });

    if (assignedPositions.length) {
      return decorateResult({
        result: { error: INVALID_VALUES },
        info: 'Next round already has participants assigned',
      });
    }

    if (dps.some(Boolean)) {
      matchUp.drawPositions = [];
    }
    if (matchUp.matchUpStatus && matchUp.matchUpStatus !== 'TO_BE_PLAYED') {
      matchUp.matchUpStatus = undefined;
      matchUp.winningSide = undefined;
      matchUp.score = undefined;
    }
  }

  return undefined;
}

function insertLuckyLoser({ advancingParticipantIds, nextRoundMatchUps, roundStatus, participantId, winners, random }) {
  const luckyLoserInfo = roundStatus.eligibleLosers?.find((l) => l.participantId === participantId);
  const defeatingWinnerIdx = luckyLoserInfo ? winners.findIndex((w) => w.matchUpId === luckyLoserInfo.matchUpId) : -1;

  const numMatchUps = nextRoundMatchUps.length;
  const halfSplit = Math.ceil(numMatchUps / 2);

  if (defeatingWinnerIdx < 0 || numMatchUps <= 1) {
    advancingParticipantIds.push(participantId);
    return;
  }

  const totalSlots = numMatchUps * 2;
  const validPositions: number[] = [];

  for (let p = 0; p < totalSlots; p++) {
    const luckyMatchUp = Math.floor(p / 2);
    const shiftedIdx = defeatingWinnerIdx + (p <= defeatingWinnerIdx ? 1 : 0);
    const winnerMatchUp = Math.floor(shiftedIdx / 2);

    const luckyInTopHalf = luckyMatchUp < halfSplit;
    const winnerInTopHalf = winnerMatchUp < halfSplit;

    if (luckyInTopHalf !== winnerInTopHalf) {
      validPositions.push(p);
    }
  }

  if (validPositions.length) {
    const randomIdx = Math.floor((random ?? Math.random)() * validPositions.length);
    advancingParticipantIds.splice(validPositions[randomIdx], 0, participantId);
  } else {
    advancingParticipantIds.push(participantId);
  }
}

function cleanupStalePositionAssignments({ positionAssignments, nextRoundMatchUps, structure, roundNumber }) {
  const nextRoundDrawPositions = new Set(nextRoundMatchUps.flatMap((m) => (m.drawPositions ?? []).filter(Boolean)));

  if (nextRoundDrawPositions.size) {
    const stalePositions: number[] = [];
    for (const dp of nextRoundDrawPositions) {
      const entries = positionAssignments.filter((a) => a.drawPosition === dp);
      const hasEmpty = entries.some((a) => !a.participantId && !a.bye);
      if (entries.length > 1 || hasEmpty) {
        stalePositions.push(dp as any);
      }
    }

    if (stalePositions.length) {
      const staleSet = new Set(stalePositions);
      positionAssignments = positionAssignments.filter((a) => !staleSet.has(a.drawPosition));
    }
  }

  const completedRoundPositions = new Set(
    (structure.matchUps ?? [])
      .filter((m) => m.roundNumber && m.roundNumber <= roundNumber)
      .flatMap((m) => m.drawPositions ?? [])
      .filter(Boolean),
  );
  positionAssignments = positionAssignments.filter((a) => {
    if (a.participantId || a.bye) return true;
    return completedRoundPositions.has(a.drawPosition);
  });

  return positionAssignments;
}

function assignNextRoundPositions({
  advancingParticipantIds,
  positionAssignments,
  nextRoundMatchUps,
  drawDefinition,
  roundNumber,
  roundStatus,
  participantId,
  tournamentId,
  structureId,
  structure,
}) {
  const allAssignedPositions = new Set(positionAssignments.map((a) => a.drawPosition));
  const allMatchUpPositions = (structure.matchUps ?? []).flatMap((m) => m.drawPositions ?? []).filter(Boolean);
  const allPositions = [...allAssignedPositions, ...allMatchUpPositions];
  const maxPosition = allPositions.length ? Math.max(...allPositions) : 0;
  let nextPosition = maxPosition + 1;

  for (let i = 0; i < nextRoundMatchUps.length; i++) {
    const matchUp = nextRoundMatchUps[i];
    const pos1 = nextPosition++;
    const pos2 = nextPosition++;
    const pid1 = advancingParticipantIds[i * 2];
    const pid2 = advancingParticipantIds[i * 2 + 1];

    matchUp.drawPositions = [pos1, pos2];

    const assignment1: any = { drawPosition: pos1, participantId: pid1 };
    const assignment2: any = { drawPosition: pos2, participantId: pid2 };

    if (roundStatus.isPreFeedRound && participantId) {
      if (pid1 === participantId) {
        assignment1.extensions = [{ name: 'luckyAdvancement', value: { fromRoundNumber: roundNumber } }];
      } else if (pid2 === participantId) {
        assignment2.extensions = [{ name: 'luckyAdvancement', value: { fromRoundNumber: roundNumber } }];
      }
    }

    positionAssignments.push(assignment1, assignment2);

    modifyMatchUpNotice({
      context: stack,
      drawDefinition,
      tournamentId,
      structureId,
      matchUp,
    });
  }

  structure.positionAssignments = positionAssignments;
}

function createVirtualMatchUps({
  targetStructure,
  targetStructureId,
  targetRoundNumber,
  participantIds,
  unfilledPositions,
}) {
  const matchUpCount = Math.ceil(participantIds.length / 2);
  let nextPosition = 1;

  for (let i = 0; i < matchUpCount; i++) {
    const pos1 = nextPosition++;
    const pos2 = nextPosition++;
    const matchUp: any = {
      matchUpId: `${targetStructureId}-mu-${i + 1}`,
      roundNumber: targetRoundNumber,
      roundPosition: i + 1,
      drawPositions: [pos1, pos2],
      matchUpStatus: 'TO_BE_PLAYED',
    };
    targetStructure.matchUps.push(matchUp);
    unfilledPositions.push(pos1, pos2);
  }
}

function findUnfilledPositions({ targetMatchUps, targetPositionAssignments, targetStructure, unfilledPositions }) {
  for (const matchUp of targetMatchUps) {
    for (const dp of matchUp.drawPositions ?? []) {
      if (!dp) continue;
      const assignment = targetPositionAssignments.find((a) => a.drawPosition === dp);
      if (!assignment?.participantId && !assignment?.bye) {
        unfilledPositions.push(dp);
      }
    }
  }

  if (!unfilledPositions.length) {
    const assignedDrawPositions = new Set(
      targetPositionAssignments.filter((a) => a.participantId).map((a) => a.drawPosition),
    );
    const livePositions = (targetStructure.matchUps ?? [])
      .flatMap((m) => m.drawPositions ?? [])
      .filter((dp) => dp && assignedDrawPositions.has(dp));
    const allLive = [...assignedDrawPositions, ...livePositions];
    let nextPosition = allLive.length ? Math.max(...allLive) + 1 : 1;

    for (const matchUp of targetMatchUps) {
      if (!matchUp.drawPositions?.length || !matchUp.drawPositions.some(Boolean)) {
        const pos1 = nextPosition++;
        const pos2 = nextPosition++;
        matchUp.drawPositions = [pos1, pos2];
        unfilledPositions.push(pos1, pos2);
      }
    }
  }
}
