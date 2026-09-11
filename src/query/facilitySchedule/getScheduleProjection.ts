import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';

// constants and types
import { MISSING_TOURNAMENT_RECORD, ErrorType } from '@Constants/errorConditionConstants';
import { ScheduleCell } from '@Types/facilityScheduleTypes';
import { Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

type GetScheduleProjectionArgs = {
  tournamentRecord?: Tournament;
  venueIds?: string[];
};

/**
 * Reduce a single tournamentRecord to slim, read-only `ScheduleCell`s for the shared-facility
 * view. Pure transform (no I/O, no globalState): it does NOT apply publish-state gating — the
 * caller decides operational (`usePublishState: false`) vs. public. When `venueIds` is provided,
 * only cells resolving to those venues are returned. A matchUp contributes a cell only if it has
 * been placed (has a `scheduledDate` or a `courtId`).
 *
 * See planning/LINKED_TOURNAMENTS_AND_SHARED_FACILITY_SCHEDULING.md (§4.5, INV-5/INV-6).
 */
export function getScheduleProjection(params: GetScheduleProjectionArgs): {
  error?: ErrorType;
  scheduleCells?: ScheduleCell[];
} {
  const { tournamentRecord, venueIds } = params ?? {};
  if (!tournamentRecord) {
    return decorateResult({ result: { error: MISSING_TOURNAMENT_RECORD }, stack: 'getScheduleProjection' });
  }

  const courtToVenueId = buildCourtToVenueMap(tournamentRecord);
  const venueFilter = venueIds?.length ? new Set(venueIds) : undefined;

  const { matchUps = [] } = allTournamentMatchUps({ tournamentRecord, inContext: true });

  const scheduleCells: ScheduleCell[] = [];
  for (const matchUp of matchUps) {
    const schedule = matchUp.schedule ?? {};
    const { courtId, courtOrder, scheduledDate, scheduledTime } = schedule;

    // only placed matchUps contribute to facility occupancy
    if (!scheduledDate && !courtId) continue;

    const venueId = schedule.venueId ?? (courtId ? courtToVenueId[courtId] : undefined);
    if (venueFilter && (!venueId || !venueFilter.has(venueId))) continue;

    scheduleCells.push({
      tournamentId: matchUp.tournamentId ?? tournamentRecord.tournamentId,
      eventId: matchUp.eventId,
      drawId: matchUp.drawId,
      matchUpId: matchUp.matchUpId,
      venueId,
      courtId,
      courtOrder,
      scheduledDate,
      scheduledTime,
      matchUpStatus: matchUp.matchUpStatus,
      matchUpType: matchUp.matchUpType,
      roundName: matchUp.roundName,
      roundNumber: matchUp.roundNumber,
      matchUpFormat: matchUp.matchUpFormat,
      labels: deriveLabels(matchUp),
    });
  }

  return { ...SUCCESS, scheduleCells };
}

function buildCourtToVenueMap(tournamentRecord: Tournament): { [courtId: string]: string } {
  const map: { [courtId: string]: string } = {};
  for (const venue of tournamentRecord.venues ?? []) {
    for (const court of venue.courts ?? []) {
      if (court.courtId) map[court.courtId] = venue.venueId;
    }
  }
  return map;
}

function deriveLabels(matchUp: any): string[] {
  const sides = matchUp.sides ?? [];
  return sides.map((side: any) => side?.participant?.participantName).filter(Boolean);
}
