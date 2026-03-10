import { includesMatchUpEventType } from '@Helpers/matchUpEventTypes/includesMatchUpEventType';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { scheduledMatchUpTime } from './matchUp/scheduledMatchUpTime';
import { scheduledMatchUpDate } from './matchUp/scheduledMatchUpDate';
import { matchUpAllocatedCourts } from './matchUp/courtAllocations';
import { matchUpAssignedCourtId } from './matchUp/courtAssignment';
import { matchUpAssignedVenueId } from './matchUp/venueAssignment';
import { extractDate, sameDay } from '@Tools/dateTime';

// constants and types
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { MatchUpFilters } from '@Types/factoryTypes';
import { HydratedMatchUp } from '@Types/hydrated';

type FilterMatchUpsArgs = MatchUpFilters & {
  matchUps: HydratedMatchUp[];
};

export function filterMatchUps(params: FilterMatchUpsArgs) {
  if (!Array.isArray(params.matchUps)) return [];
  const {
    matchUps,

    excludeMatchUpStatuses,
    hasParticipantsCount,
    isCollectionMatchUp,
    matchUpStatuses,
    hasWinningSide,
    matchUpFormats,
    roundPositions,
    matchUpFormat,
    collectionIds,
    isMatchUpTie,
    roundNumbers,
    matchUpIds,
    roundNames,

    filterMatchUpTypes = true,
    filterMatchUpIds = true,

    // only applies to inContext matchUps and only when processContext boolean is true
    stageSequences,
    scheduledDates,
    scheduledDate,
    participantIds,
    processContext,
    tournamentIds,
    matchUpTypes,
    structureIds,
    readyToScore,
    courtIds,
    eventIds,
    venueIds,
    drawIds,
    stages,
  } = params;

  const targetParticipantIds = Array.isArray(participantIds) ? participantIds.filter(Boolean) : [];
  const targetMatchUpStatuses = Array.isArray(matchUpStatuses) ? matchUpStatuses.filter(Boolean) : [];
  const excludeTargetMatchUpStatuses = Array.isArray(excludeMatchUpStatuses)
    ? excludeMatchUpStatuses.filter(Boolean)
    : [];

  const targetStages = Array.isArray(stages) ? stages.filter(Boolean) : [];
  const targetStageSequences = Array.isArray(stageSequences) ? stageSequences.filter(Boolean) : [];
  const targetCollectionIds = Array.isArray(collectionIds) ? collectionIds.filter(Boolean) : [];
  const targetRoundNames = Array.isArray(roundNames) ? roundNames.filter(Boolean) : [];
  const targetRoundNumbers = Array.isArray(roundNumbers) ? roundNumbers.filter(Boolean) : [];
  const targetRoundPositions = Array.isArray(roundPositions) ? roundPositions.filter(Boolean) : [];

  const targetMatchUpIds = Array.isArray(matchUpIds) && filterMatchUpIds ? matchUpIds.filter(Boolean) : [];
  const targetMatchUpTypes = Array.isArray(matchUpTypes) && filterMatchUpTypes ? matchUpTypes.filter(Boolean) : [];
  const targetCourtIds = Array.isArray(courtIds) ? courtIds.filter(Boolean) : [];
  const targetVenueIds = Array.isArray(venueIds) ? venueIds.filter(Boolean) : [];
  const targetMatchUpFormats =
    (Array.isArray(matchUpFormats) && matchUpFormats.filter(Boolean)) ||
    (typeof matchUpFormat === 'string' && [matchUpFormat]) ||
    [];
  const targetScheduledDates =
    (Array.isArray(scheduledDates) && scheduledDates.filter(Boolean).length && scheduledDates.filter(Boolean)) ||
    (typeof scheduledDate === 'string' && scheduledDate.length && [scheduledDate]) ||
    [];

  const targetTournamentIds = Array.isArray(tournamentIds) ? tournamentIds.filter(Boolean) : [];
  const targetEventIds = Array.isArray(eventIds) ? eventIds.filter(Boolean) : [];
  const targetDrawIds = Array.isArray(drawIds) ? drawIds.filter(Boolean) : [];
  const targetStructureIds = Array.isArray(structureIds) ? structureIds.filter(Boolean) : [];

  return matchUps.filter((matchUp) => {
    if (readyToScore && !isMatchUpEventType(TEAM_MATCHUP)(matchUp) && !matchUp.readyToScore) return false;
    if (matchUp.winningSide && hasWinningSide && ![1, 2].includes(matchUp.winningSide)) return false;
    if (isMatchUpTie !== undefined) {
      if (isMatchUpTie && !matchUp.tieMatchUps) {
        return false;
      }
      if (!isMatchUpTie && matchUp.tieMatchUps) {
        return false;
      }
    }
    if (isCollectionMatchUp !== undefined) {
      if (isCollectionMatchUp && !matchUp.collectionId) {
        return false;
      }
      if (!isCollectionMatchUp && matchUp.collectionId) {
        return false;
      }
    }

    if (targetStages.length && !targetStages.includes(matchUp.stage)) {
      return false;
    }
    if (targetStageSequences.length && !targetStageSequences.includes(matchUp.stageSequence)) {
      return false;
    }
    if (targetCollectionIds.length && (!matchUp.collectionId || !targetCollectionIds.includes(matchUp.collectionId))) {
      return false;
    }
    if (targetRoundNames.length && (!matchUp.roundName || !targetRoundNames.includes(matchUp.roundName))) {
      return false;
    }
    if (targetRoundNumbers.length && (!matchUp.roundNumber || !targetRoundNumbers.includes(matchUp.roundNumber))) {
      return false;
    }
    if (
      targetRoundPositions.length &&
      (!matchUp.roundPosition || !targetRoundPositions.includes(matchUp.roundPosition))
    ) {
      return false;
    }
    if (
      targetMatchUpStatuses.length &&
      (!matchUp.matchUpStatus || !targetMatchUpStatuses.includes(matchUp.matchUpStatus))
    ) {
      return false;
    }
    if (
      excludeTargetMatchUpStatuses.length &&
      matchUp.matchUpStatus &&
      excludeTargetMatchUpStatuses.includes(matchUp.matchUpStatus)
    ) {
      return false;
    }
    if (targetMatchUpIds.length && !targetMatchUpIds.includes(matchUp.matchUpId)) {
      return false;
    }
    if (
      targetMatchUpTypes.length &&
      (!matchUp.matchUpType || !includesMatchUpEventType(targetMatchUpTypes, matchUp.matchUpType))
    ) {
      return false;
    }
    if (
      targetMatchUpFormats.length &&
      (!matchUp.matchUpFormat || !targetMatchUpFormats.includes(matchUp.matchUpFormat))
    ) {
      return false;
    }

    if (targetScheduledDates?.length) {
      const { scheduledTime } = scheduledMatchUpTime({ matchUp });
      const { scheduledDate: matchUpDate } = scheduledMatchUpDate({ matchUp });
      const scheduledTimeDate = extractDate(scheduledTime);
      const comparisonDate = scheduledTimeDate || matchUpDate;

      if (!targetScheduledDates.some((scheduledDate) => sameDay(scheduledDate, comparisonDate))) return false;
    }

    if (targetCourtIds.length) {
      const { courtId } = matchUpAssignedCourtId({ matchUp });
      const { allocatedCourts } = matchUpAllocatedCourts({ matchUp });
      const allocatedCourtIds = allocatedCourts?.map(({ courtId }) => courtId);
      if (!targetCourtIds.filter(Boolean).includes(courtId) || allocatedCourtIds?.includes(courtId)) {
        return false;
      }
    }

    if (targetVenueIds.length) {
      const { venueId } = matchUpAssignedVenueId({ matchUp });
      if (!targetVenueIds.filter(Boolean).includes(venueId)) {
        return false;
      }
    }

    if (processContext) {
      if (targetTournamentIds.length && !targetTournamentIds.includes(matchUp.tournamentId)) {
        return false;
      }

      if (targetEventIds.length && !targetEventIds.includes(matchUp.eventId)) {
        return false;
      }

      if (targetDrawIds.length && !targetDrawIds.includes(matchUp.drawId)) {
        return false;
      }

      if (targetStructureIds.length && !targetStructureIds.includes(matchUp.structureId)) {
        return false;
      }

      const matchUpParticipantIds = matchUp.sides?.map(({ participantId }) => participantId).filter(Boolean) ?? [];
      if (hasParticipantsCount && matchUpParticipantIds.length < hasParticipantsCount) {
        return false;
      }
      if (targetParticipantIds.length) {
        const containsTargetedParticipantId = targetParticipantIds.some((participantId) =>
          matchUpParticipantIds.includes(participantId),
        );
        if (!containsTargetedParticipantId) return false;
      }
    }

    return true;
  });
}
