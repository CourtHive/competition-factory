import { findMatchUpFormatTiming } from '@Acquire/findMatchUpFormatTiming';
import { definedAttributes } from '@Tools/definedAttributes';
import { instanceCount } from '@Tools/arrays';

import { BYE, completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';

export function getRoundId(obj) {
  const { containerStructureId, roundSegment, isRoundRobin, tournamentId, roundNumber, structureId, eventId, drawId } =
    obj;
  const relevantStructureId = isRoundRobin ? containerStructureId : structureId;

  // retain order
  const id = [
    tournamentId, // 1
    eventId, // 2
    drawId, // 3
    relevantStructureId, // 4
    roundNumber, // 5
  ].join('|');

  return definedAttributes({
    structureId: relevantStructureId,
    roundSegment,
    tournamentId,
    roundNumber,
    eventId,
    drawId,
    id,
  });
}

export function getRoundTiming({ round, matchUps, events, tournamentRecords }) {
  const event = events.find((event) => event.eventId === round.eventId);
  const { eventType, category, categoryType } = event ?? {};
  const { categoryName, ageCategoryCode } = category ?? {};
  const formatCounts = instanceCount(matchUps.map(({ matchUpFormat }) => matchUpFormat));

  let roundMinutes = 0;
  Object.keys(formatCounts).forEach((matchUpFormat) => {
    const formatCount = formatCounts[matchUpFormat];
    const result = findMatchUpFormatTiming({
      categoryName: categoryName || ageCategoryCode,
      tournamentId: round.tournamentId,
      eventId: round.eventId,
      tournamentRecords,
      matchUpFormat,
      categoryType,
      eventType,
    });
    if (result.error) return result;
    const formatMinutes = result.averageMinutes * formatCount;
    if (!isNaN(roundMinutes)) roundMinutes += formatMinutes;
    return undefined;
  });

  return { roundMinutes };
}

export function getFinishingPositionDetails(matchUps) {
  return (matchUps ?? []).reduce(
    (foo, matchUp) => {
      const sum = (matchUp.finishingPositionRange?.winner ?? []).reduce((a, b) => a + b, 0);
      const winnerFinishingPositionRange = (matchUp.finishingPositionRange?.winner ?? []).join('-') || '';
      return !foo.minFinishingSum || sum < foo.minFinishingSum
        ? { minFinishingSum: sum, winnerFinishingPositionRange }
        : foo;
    },
    { minFinishingSum: 0, winnerFinishingPositionRange: '' },
  );
}

export function getRoundProfile(matchUps) {
  const matchUpsCount = matchUps.length;
  const byeCount = matchUps.filter(({ sides }) => sides?.some(({ bye }) => bye)).length || 0;
  const completedCount =
    matchUps.filter(({ winningSide, matchUpStatus }) => winningSide || completedMatchUpStatuses.includes(matchUpStatus))
      .length || 0;
  const scheduledCount =
    matchUps.filter(
      ({ schedule, matchUpStatus }) => schedule?.scheduledDate && schedule?.scheduledTime && matchUpStatus !== BYE,
    ).length || 0;
  const consideredCount = matchUpsCount - byeCount;
  const isComplete = consideredCount === completedCount;
  const unscheduledCount = consideredCount - scheduledCount;
  const incompleteCount = consideredCount - scheduledCount;
  const isScheduled = consideredCount === scheduledCount;
  return {
    unscheduledCount,
    incompleteCount,
    scheduledCount,
    completedCount,
    matchUpsCount,
    isScheduled,
    isComplete,
    byeCount,
  };
}
