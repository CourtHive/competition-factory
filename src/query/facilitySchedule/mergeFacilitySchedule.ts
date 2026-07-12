// constants and types
import {
  FacilityScheduleConflictReason,
  FacilityScheduleConflict,
  FacilityScheduleGrid,
  ScheduleCell,
} from '@Types/facilityScheduleTypes';

type MergeFacilityScheduleArgs = {
  projections?: ScheduleCell[][];
};

/**
 * Pure reduce over N per-tournament `ScheduleCell[]` projections into one venue-scoped court
 * grid keyed (venueId → courtId → scheduledDate), with advisory double-booking detection.
 *
 * Never mutates its inputs and never writes anywhere (INV-1). The same matchUp appearing in
 * more than one projection (embed-by-copy divergence) is de-duplicated by `matchUpId` so it is
 * counted once and cannot collide with itself.
 *
 * See planning/LINKED_TOURNAMENTS_AND_SHARED_FACILITY_SCHEDULING.md (§4.5).
 */
export function mergeFacilitySchedule(params: MergeFacilityScheduleArgs): FacilityScheduleGrid {
  const projections = Array.isArray(params?.projections) ? params.projections : [];
  const grid: FacilityScheduleGrid = { venues: {}, conflicts: [], unplaced: [] };

  const seenMatchUpIds = new Set<string>();
  for (const projection of projections) {
    if (!Array.isArray(projection)) continue;
    for (const cell of projection) {
      if (cell && !seenMatchUpIds.has(cell.matchUpId)) {
        seenMatchUpIds.add(cell.matchUpId);
        placeCell(grid, cell);
      }
    }
  }

  grid.conflicts = detectConflicts(grid);
  sortGrid(grid);
  return grid;
}

function placeCell(grid: FacilityScheduleGrid, cell: ScheduleCell): void {
  const { venueId, courtId, scheduledDate } = cell;
  if (!venueId || !courtId || !scheduledDate) {
    grid.unplaced.push(cell);
    return;
  }

  if (!grid.venues[venueId]) grid.venues[venueId] = { venueId, courts: {} };
  const venue = grid.venues[venueId];
  if (!venue.courts[courtId]) venue.courts[courtId] = { venueId, courtId, dates: {} };
  const court = venue.courts[courtId];
  if (!court.dates[scheduledDate]) court.dates[scheduledDate] = [];
  court.dates[scheduledDate].push(cell);
}

function detectConflicts(grid: FacilityScheduleGrid): FacilityScheduleConflict[] {
  const conflicts: FacilityScheduleConflict[] = [];
  for (const venue of Object.values(grid.venues)) {
    for (const court of Object.values(venue.courts)) {
      for (const [scheduledDate, cells] of Object.entries(court.dates)) {
        addGroupedConflicts(
          conflicts,
          cells,
          'courtOrder',
          'SAME_COURT_ORDER',
          court.venueId,
          court.courtId,
          scheduledDate,
        );
        addGroupedConflicts(
          conflicts,
          cells,
          'scheduledTime',
          'SAME_SCHEDULED_TIME',
          court.venueId,
          court.courtId,
          scheduledDate,
        );
      }
    }
  }
  return conflicts;
}

function addGroupedConflicts(
  conflicts: FacilityScheduleConflict[],
  cells: ScheduleCell[],
  field: 'courtOrder' | 'scheduledTime',
  reason: FacilityScheduleConflictReason,
  venueId: string,
  courtId: string,
  scheduledDate: string,
): void {
  const groups = new Map<string | number, ScheduleCell[]>();
  for (const cell of cells) {
    const value = cell[field];
    if (value === undefined || value === null) continue;
    const group = groups.get(value) ?? [];
    group.push(cell);
    groups.set(value, group);
  }

  for (const [value, group] of groups) {
    if (group.length < 2) continue;
    conflicts.push({
      venueId,
      courtId,
      scheduledDate,
      reason,
      matchUpIds: group.map((cell) => cell.matchUpId),
      tournamentIds: [...new Set(group.map((cell) => cell.tournamentId))],
      ...(field === 'courtOrder' ? { courtOrder: value as number } : { scheduledTime: value as string }),
    });
  }
}

function sortGrid(grid: FacilityScheduleGrid): void {
  for (const venue of Object.values(grid.venues)) {
    for (const court of Object.values(venue.courts)) {
      for (const cells of Object.values(court.dates)) {
        cells.sort(compareCells);
      }
    }
  }
}

function compareCells(a: ScheduleCell, b: ScheduleCell): number {
  const orderA = a.courtOrder ?? Number.MAX_SAFE_INTEGER;
  const orderB = b.courtOrder ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  return (a.scheduledTime ?? '').localeCompare(b.scheduledTime ?? '');
}
