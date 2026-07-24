import { collectScopedRecords, findScopedScenario } from '@Query/matchUps/scheduling/scheduleScenarioReconciliation';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { mergeFacilitySchedule } from '@Query/facilitySchedule/mergeFacilitySchedule';

// constants and types
import { FacilityScheduleGrid, ScheduleCell } from '@Types/facilityScheduleTypes';
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { ScheduleScenario, Tournament } from '@Types/tournamentTypes';
import { TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

export type ScenarioProjectionCell = ScheduleCell & { scenarioStatus: 'official' | 'planned' };

type GetScenarioScheduleProjectionArgs = {
  tournamentRecords?: TournamentRecords;
  tournamentRecord?: Tournament;
  tournamentId?: string;
  scenarioId: string;
  venueIds?: string[];
};

/**
 * The unofficial ("Plan mode") schedule overlay: the official schedule with a
 * scenario's placements laid on top, WITHOUT writing to any matchUp. Each cell
 * is tagged `official` or `planned`; completed matchUps keep their official
 * placement (a commit would skip them) and are reported via
 * `skippedCompletedMatchUpIds`. Double-booking conflicts in the projected plan
 * come from `mergeFacilitySchedule` (`SAME_COURT_ORDER` / `SAME_SCHEDULED_TIME`).
 *
 * Pure read-model (INV-1) — reuses the shared-facility `ScheduleCell` contract so
 * TMX renders the same shape it already knows.
 */
export function getScenarioScheduleProjection(params: GetScenarioScheduleProjectionArgs): {
  error?: any;
  scheduleCells?: ScenarioProjectionCell[];
  grid?: FacilityScheduleGrid;
  conflicts?: FacilityScheduleGrid['conflicts'];
  plannedMatchUpIds?: string[];
  skippedCompletedMatchUpIds?: string[];
} {
  const { scenario, error } = findScopedScenario(params);
  if (error || !scenario) return { error };

  const placementMap = buildPlacementMap(scenario);
  const venueFilter = params.venueIds?.length ? new Set(params.venueIds) : undefined;

  const cells: ScenarioProjectionCell[] = [];
  const plannedMatchUpIds: string[] = [];
  const skippedCompletedMatchUpIds: string[] = [];

  for (const record of collectScopedRecords(params)) {
    const courtToVenue = buildCourtToVenueMap(record);
    const { matchUps = [] } = allTournamentMatchUps({ tournamentRecord: record, inContext: true });
    for (const matchUp of matchUps) {
      const cell = projectMatchUp({
        matchUp,
        record,
        placementMap,
        courtToVenue,
        venueFilter,
        plannedMatchUpIds,
        skippedCompletedMatchUpIds,
      });
      if (cell) cells.push(cell);
    }
  }

  const grid = mergeFacilitySchedule({ projections: [cells] });
  return {
    ...SUCCESS,
    scheduleCells: cells,
    grid,
    conflicts: grid.conflicts,
    plannedMatchUpIds,
    skippedCompletedMatchUpIds,
  };
}

function buildPlacementMap(scenario: ScheduleScenario): { [matchUpId: string]: any } {
  const map: { [matchUpId: string]: any } = {};
  for (const placement of scenario.placements ?? []) map[placement.matchUpId] = placement.schedule ?? {};
  return map;
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

type ProjectMatchUpArgs = {
  matchUp: any;
  record: Tournament;
  placementMap: { [matchUpId: string]: any };
  courtToVenue: { [courtId: string]: string };
  venueFilter?: Set<string>;
  plannedMatchUpIds: string[];
  skippedCompletedMatchUpIds: string[];
};

function projectMatchUp(args: ProjectMatchUpArgs): ScenarioProjectionCell | undefined {
  const { matchUp, record, placementMap, courtToVenue, venueFilter } = args;
  const override = placementMap[matchUp.matchUpId];
  const completed = matchUp.winningSide || completedMatchUpStatuses.includes(matchUp.matchUpStatus);

  let scenarioStatus: 'official' | 'planned' = 'official';
  let schedule = matchUp.schedule ?? {};
  if (override) {
    if (completed) {
      args.skippedCompletedMatchUpIds.push(matchUp.matchUpId);
    } else {
      schedule = override;
      scenarioStatus = 'planned';
      args.plannedMatchUpIds.push(matchUp.matchUpId);
    }
  }

  const { courtId, courtOrder, scheduledDate, scheduledTime } = schedule;
  if (!scheduledDate && !courtId) return undefined; // unplaced

  const venueId = schedule.venueId ?? (courtId ? courtToVenue[courtId] : undefined);
  if (venueFilter && (!venueId || !venueFilter.has(venueId))) return undefined;

  return {
    tournamentId: matchUp.tournamentId ?? record.tournamentId,
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
    labels: (matchUp.sides ?? []).map((side: any) => side?.participant?.participantName).filter(Boolean),
    scenarioStatus,
  };
}
