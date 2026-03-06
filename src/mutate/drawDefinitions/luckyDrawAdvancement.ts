import { modifyPositionAssignmentsNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getLuckyDrawRoundStatus } from '@Query/drawDefinition/getLuckyDrawRoundStatus';
import { decorateResult } from '@Functions/global/decorateResult';
import { findStructure } from '@Acquire/findStructure';

// constants
import { INVALID_VALUES, MISSING_DRAW_DEFINITION, MISSING_PARTICIPANT_ID } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { LUCKY_DRAW } from '@Constants/drawDefinitionConstants';
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
    console.log(`[${stack}] Round ${roundNumber} not complete`, {
      roundStatus: roundStatus
        ? { completedCount: roundStatus.completedCount, matchUpsCount: roundStatus.matchUpsCount }
        : 'not found',
      availableRounds: statusResult.rounds?.map((r) => r.roundNumber),
    });
    return decorateResult({ result: { error: INVALID_VALUES }, info: 'Round is not complete' });
  }

  // Validate pre-feed round requires a lucky loser selection
  if (roundStatus.isPreFeedRound && roundStatus.needsLuckySelection) {
    if (!participantId) return { error: MISSING_PARTICIPANT_ID };

    const eligible = roundStatus.eligibleLosers?.find((l) => l.participantId === participantId);
    if (!eligible) {
      console.log(`[${stack}] Participant not eligible`, {
        participantId,
        eligibleLosers: roundStatus.eligibleLosers?.map((l) => l.participantId),
      });
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
    const defeatingWinnerIdx = luckyLoserInfo
      ? winners.findIndex((w) => w.matchUpId === luckyLoserInfo.matchUpId)
      : -1;

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
    console.log(`[${stack}] No matchUps in round ${nextRoundNumber}`, {
      allRounds: [...new Set((structure.matchUps || []).map((m) => m.roundNumber))].sort(),
    });
    return decorateResult({ result: { error: INVALID_VALUES }, info: 'No matchUps found in next round' });
  }

  const expectedCount = nextRoundMatchUps.length * 2;
  if (advancingParticipantIds.length !== expectedCount) {
    console.log(`[${stack}] Participant count mismatch`, {
      expected: expectedCount,
      got: advancingParticipantIds.length,
      nextRoundMatchUpsCount: nextRoundMatchUps.length,
      advancingParticipantIds,
      isPreFeedRound: roundStatus.isPreFeedRound,
      winnersCount: winners.length,
    });
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
      const hasFilled = entries.some((a) => !!a.participantId);
      if (entries.length > 1 || hasEmpty) {
        stalePositions.push(dp);
        if (hasFilled && hasEmpty) {
          console.log(`[${stack}] Duplicate positionAssignment entries for drawPosition ${dp}`, {
            entries,
          });
        }
      }
    }

    if (stalePositions.length) {
      const staleSet = new Set(stalePositions);
      console.log(`[${stack}] Removing stale positionAssignment entries for drawPositions`, {
        stalePositions,
        beforeCount: positionAssignments.length,
      });
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
      console.log(`[${stack}] Next round matchUp already assigned`, {
        matchUpId: matchUp.matchUpId,
        roundPosition: matchUp.roundPosition,
        drawPositions: dps,
        assignedPositions,
        assignments: dps.map((dp) => positionAssignments.find((a) => a.drawPosition === dp)),
      });
      return decorateResult({
        result: { error: INVALID_VALUES },
        info: 'Next round already has participants assigned',
      });
    }

    // Clear stale drawPositions so new positions are computed cleanly
    if (dps.some(Boolean)) {
      console.log(`[${stack}] Clearing stale drawPositions on matchUp ${matchUp.matchUpId}`, {
        stalePositions: dps,
      });
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

  console.log(`[${stack}] Advancing round ${roundNumber} → ${nextRoundNumber}`, {
    advancingParticipantIds,
    nextRoundMatchUps: nextRoundMatchUps.map((m) => ({
      matchUpId: m.matchUpId,
      roundPosition: m.roundPosition,
      drawPositions: m.drawPositions,
    })),
    maxPosition,
    nextPosition,
    positionAssignmentCount: positionAssignments.length,
  });

  // Assign drawPositions to next-round matchUps and create positionAssignments
  const tournamentId = tournamentRecord?.tournamentId;

  for (let i = 0; i < nextRoundMatchUps.length; i++) {
    const matchUp = nextRoundMatchUps[i];
    const pos1 = nextPosition++;
    const pos2 = nextPosition++;
    const pid1 = advancingParticipantIds[i * 2];
    const pid2 = advancingParticipantIds[i * 2 + 1];

    matchUp.drawPositions = [pos1, pos2];

    positionAssignments.push({ drawPosition: pos1, participantId: pid1 }, { drawPosition: pos2, participantId: pid2 });

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

  return { ...SUCCESS };
}
