import { modifyPositionAssignmentsNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getLuckyDrawRoundStatus } from '@Query/drawDefinition/getLuckyDrawRoundStatus';
import { decorateResult } from '@Functions/global/decorateResult';
import { findStructure } from '@Acquire/findStructure';

// constants
import { INVALID_VALUES, MISSING_DRAW_DEFINITION, MISSING_PARTICIPANT_ID } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { LOSER, LUCKY_DRAW } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

type LuckyDrawAdvancementArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  participantId?: string;
  structureId?: string;
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
  event,
}: LuckyDrawAdvancementArgs): ResultType {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (drawDefinition.drawType !== LUCKY_DRAW) {
    return decorateResult({ result: { error: INVALID_VALUES }, info: 'Not a lucky draw' });
  }

  structureId = structureId || drawDefinition.structures?.[0]?.structureId;
  if (!structureId) return { error: INVALID_VALUES };

  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return { error: INVALID_VALUES };

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
  const nextRoundMatchUps = (structure.matchUps || [])
    .filter((m) => m.roundNumber === nextRoundNumber)
    .sort((a, b) => (a.roundPosition || 0) - (b.roundPosition || 0));

  // Collect advancing participant IDs: winners in roundPosition order + lucky loser
  const winners = roundStatus.advancingWinners || [];
  const advancingParticipantIds = winners.map((w) => w.participantId);

  if (roundStatus.isPreFeedRound && participantId) {
    // Place the lucky loser in the opposite half of the next round from
    // the winner who defeated them, so they cannot meet until the final.
    const luckyLoserInfo = roundStatus.eligibleLosers?.find((l) => l.participantId === participantId);
    const defeatingWinnerIdx = luckyLoserInfo ? winners.findIndex((w) => w.matchUpId === luckyLoserInfo.matchUpId) : -1;

    const numMatchUps = nextRoundMatchUps.length;
    const halfSplit = Math.ceil(numMatchUps / 2);

    if (defeatingWinnerIdx >= 0 && numMatchUps > 1) {
      // Find insertion positions that place the lucky loser in the opposite
      // half from the defeating winner. When inserting at position p, the
      // lucky loser lands in matchUp floor(p/2) and the defeating winner
      // (originally at index d) shifts right by 1 if p <= d.
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
        const randomIdx = Math.floor(Math.random() * validPositions.length);
        advancingParticipantIds.splice(validPositions[randomIdx], 0, participantId);
      } else {
        // Fallback: no valid opposite-half position found (e.g., 1 matchUp)
        advancingParticipantIds.push(participantId);
      }
    } else {
      // No defeating winner info or only 1 matchUp — append as before
      advancingParticipantIds.push(participantId);
    }
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

  // Collect all drawPositions referenced by next-round matchUps so we can
  // clean up stale positionAssignment entries left behind by prior removals.
  let positionAssignments = structure.positionAssignments || [];
  const nextRoundDrawPositions = new Set(nextRoundMatchUps.flatMap((m) => (m.drawPositions || []).filter(Boolean)));

  // A drawPosition is "stale" when it appears in a next-round matchUp AND
  // has duplicate positionAssignment entries (one with participantId, one
  // without) — this is the hallmark of a removal that didn't fully clean up.
  // Remove ALL positionAssignment entries for these drawPositions so we can
  // re-assign cleanly.
  if (nextRoundDrawPositions.size) {
    const stalePositions: number[] = [];
    for (const dp of nextRoundDrawPositions) {
      const entries = positionAssignments.filter((a) => a.drawPosition === dp);
      const hasEmpty = entries.some((a) => !a.participantId);
      if (entries.length > 1 || hasEmpty) {
        stalePositions.push(dp);
      }
    }

    if (stalePositions.length) {
      const staleSet = new Set(stalePositions);
      positionAssignments = positionAssignments.filter((a) => !staleSet.has(a.drawPosition));
      structure.positionAssignments = positionAssignments;
    }
  }

  // Check that next-round matchUps don't already have participants assigned.
  // After stale cleanup above, any remaining assigned positions indicate a
  // genuinely active advancement that should not be overwritten.
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

    // Clear stale drawPositions so new positions are computed cleanly
    if (dps.some(Boolean)) {
      matchUp.drawPositions = [];
    }
  }

  // Compute new drawPositions starting after the max existing position.
  // Only count positions backed by a positionAssignment with a participantId.
  const assignedDrawPositions = new Set(positionAssignments.filter((a) => a.participantId).map((a) => a.drawPosition));

  const liveMatchUpPositions = (structure.matchUps || [])
    .flatMap((m) => m.drawPositions || [])
    .filter((dp) => dp && assignedDrawPositions.has(dp));

  const allLivePositions = [...assignedDrawPositions, ...liveMatchUpPositions];
  const maxPosition = allLivePositions.length ? Math.max(...allLivePositions) : 0;
  let nextPosition = maxPosition + 1;

  // Assign drawPositions to next-round matchUps and create positionAssignments
  const tournamentId = tournamentRecord?.tournamentId;

  for (let i = 0; i < nextRoundMatchUps.length; i++) {
    const matchUp = nextRoundMatchUps[i];
    const pos1 = nextPosition++;
    const pos2 = nextPosition++;
    const pid1 = advancingParticipantIds[i * 2];
    const pid2 = advancingParticipantIds[i * 2 + 1];

    matchUp.drawPositions = [pos1, pos2];

    const assignment1: any = { drawPosition: pos1, participantId: pid1 };
    const assignment2: any = { drawPosition: pos2, participantId: pid2 };

    // Mark the lucky loser's position assignment so addMatchUpContext can distinguish
    // lucky advancement from qualifying lucky losers
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

  modifyPositionAssignmentsNotice({
    drawDefinition,
    tournamentId,
    structure,
    event,
  });

  // Place discarded losers into linked consolidation/playoff structures
  if (roundStatus.isPreFeedRound && participantId) {
    const discardedLosers = (roundStatus.eligibleLosers || [])
      .filter((l) => l.participantId !== participantId)
      .map((l) => l.participantId);

    if (discardedLosers.length) {
      const loserLinks = (drawDefinition.links || []).filter(
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
        if (result?.error) {
          console.warn('Failed to place discarded losers in consolidation structure:', result.error);
        }
      }
    }
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

  let targetMatchUps = (targetStructure.matchUps || [])
    .filter((m) => m.roundNumber === targetRoundNumber)
    .sort((a, b) => (a.roundPosition || 0) - (b.roundPosition || 0));

  let targetPositionAssignments = targetStructure.positionAssignments || [];
  const unfilledPositions: number[] = [];

  if (!targetMatchUps.length) {
    // Target structure has no matchUps (e.g. generated by addPlayoffStructures for
    // non-power-of-2 drawSize). Create virtual matchUps to hold the discarded losers.
    if (!targetStructure.matchUps) targetStructure.matchUps = [];
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

    targetMatchUps = targetStructure.matchUps
      .filter((m) => m.roundNumber === targetRoundNumber)
      .sort((a, b) => (a.roundPosition || 0) - (b.roundPosition || 0));
  } else {
    // Find unfilled draw positions in existing target round matchUps
    for (const matchUp of targetMatchUps) {
      for (const dp of matchUp.drawPositions || []) {
        if (!dp) continue;
        const assignment = targetPositionAssignments.find((a) => a.drawPosition === dp);
        if (!assignment?.participantId && !assignment?.bye) {
          unfilledPositions.push(dp);
        }
      }
    }

    if (!unfilledPositions.length) {
      // If no existing draw positions, create virtual ones (same pattern as main lucky draw)
      const assignedDrawPositions = new Set(
        targetPositionAssignments.filter((a) => a.participantId).map((a) => a.drawPosition),
      );
      const livePositions = (targetStructure.matchUps || [])
        .flatMap((m) => m.drawPositions || [])
        .filter((dp) => dp && assignedDrawPositions.has(dp));
      const allLive = [...assignedDrawPositions, ...livePositions];
      let nextPosition = allLive.length ? Math.max(...allLive) + 1 : 1;

      // Assign positions to target round matchUps that don't have them
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

    targetPositionAssignments.push({ drawPosition, participantId });

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
