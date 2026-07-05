import { bulkScheduleMatchUps } from '@Mutate/matchUps/schedule/bulkScheduleMatchUps';
import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { validMatchUps } from '@Validators/validMatchUp';
import { ensureInt } from '@Tools/ensureInt';
import { unique } from '@Tools/arrays';

// constants and types
import { INVALID_VALUES, MISSING_CONTEXT } from '@Constants/errorConditionConstants';
import { IN_PROGRESS, SUSPENDED } from '@Constants/matchUpStatusConstants';
import { Tournament } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';

/**
 * Court-preserving, scheduledTime-preserving conflict resolver.
 *
 * Model (mirrors `proConflicts`): the schedule is a grid whose COLUMNS are
 * courts and whose ROWS are `courtOrder` bands. A cross-column conflict is
 * the same participant — or the same *potential* participant (winner
 * advancement) — appearing in two cells of the same row.
 *
 * This method re-lays the grid VERTICALLY to remove those conflicts:
 *   - a matchUp's `courtId` never changes (fixed column)
 *   - a matchUp's `scheduledTime` never changes (fixed clock time)
 *   - only `courtOrder` (the row) changes, and blank rows are inserted to
 *     space colliding matchUps onto different rows
 *
 * Per-column ordering:
 *   0. played (has `winningSide`) — anchored at the top, in play order
 *   1. in-progress — beneath played, where constraints allow
 *   2. to-be-played — below, in `scheduledTime` order (repairs TD inversions)
 *
 * Cross-column: every dependency source must occupy a STRICTLY earlier row
 * than the matchUp it feeds. The only genuinely unsolvable case is the one a
 * director creates by hand: a feeder scheduled at a LATER clock time than the
 * match it feeds (`source.scheduledTime > dependent.scheduledTime`). Those are
 * reported in `unresolvable`, placed best-effort, and never forced.
 *
 * Folds both `CONFLICT_PARTICIPANTS` and `CONFLICT_POTENTIAL_PARTICIPANTS`
 * by using each matchUp's deep dependency participantIds as its conflict key.
 * Every normally-placed row is therefore conflict-free by construction and a
 * force-placed (deadlock-broken) matchUp is alone on its row — so callers can
 * confirm the result by re-running `proConflicts`, which is the canonical
 * detector. Returns `{ resolved, unresolvable }`.
 *
 * NOTE: matchUps are assumed to be { inContext: true, nextMatchUps: true }.
 */

const ACTIVE_STATUSES = new Set([IN_PROGRESS, SUSPENDED]);
// '~' (0x7E) sorts after any digit/':' so a missing scheduledTime lands last
const TIME_LAST = '~';

type ProColumnResolveArgs = {
  tournamentRecords: { [key: string]: Tournament };
  matchUps: HydratedMatchUp[];
  scheduledDate: string;
  courtIds?: string[];
};

export function proColumnResolve({ tournamentRecords, matchUps, scheduledDate, courtIds }: ProColumnResolveArgs) {
  if (!validMatchUps(matchUps) || !scheduledDate) return { error: INVALID_VALUES };
  if (matchUps.some(({ hasContext }) => !hasContext)) {
    return { info: 'matchUps must have { inContext: true, nextMatchUps: true }', error: MISSING_CONTEXT };
  }

  const onGrid = matchUps.filter(
    (m) =>
      m.schedule?.courtId &&
      m.schedule?.scheduledDate === scheduledDate &&
      (!courtIds?.length || courtIds.includes(m.schedule.courtId)),
  );
  if (!onGrid.length) return { success: true, resolved: [], unresolvable: [] };

  const drawIds = unique(matchUps.map((m) => m.drawId));
  const deps = getMatchUpDependencies({
    includeParticipantDependencies: true,
    tournamentRecords,
    drawIds,
  }).matchUpDependencies;

  const byId: Record<string, HydratedMatchUp> = {};
  for (const m of onGrid) byId[m.matchUpId] = m;
  const gridIds = new Set(onGrid.map((m) => m.matchUpId));

  // group into columns and sort each into tiered (played → active → tbp) order
  const columns: Record<string, HydratedMatchUp[]> = {};
  for (const m of onGrid) {
    const courtId = m.schedule?.courtId as string;
    (columns[courtId] ??= []).push(m);
  }
  const courtIdList = Object.keys(columns);
  for (const courtId of courtIdList) columns[courtId] = columns[courtId].toSorted(columnComparator);

  const unresolvable: { matchUpId: string; reason: string; sourceMatchUpIds: string[] }[] = [];
  const rowOf = assignRows({ columns, courtIdList, deps, gridIds, unresolvable });

  addChronologyIssues({ onGrid, deps, gridIds, byId, unresolvable });

  const { matchUpDetails, resolved } = buildDetails({ rowOf, byId, scheduledDate });

  const result: any = matchUpDetails.length
    ? bulkScheduleMatchUps({ tournamentRecords, matchUpDetails, scheduleCompletedMatchUps: true })
    : { success: true };

  return { ...result, resolved, unresolvable };
}

function tierOf(matchUp: HydratedMatchUp): number {
  if (matchUp.winningSide) return 0;
  if (ACTIVE_STATUSES.has(matchUp.matchUpStatus)) return 1;
  return 2;
}

function timeKey(matchUp: HydratedMatchUp): string {
  return matchUp.schedule?.scheduledTime || TIME_LAST;
}

function columnComparator(a: HydratedMatchUp, b: HydratedMatchUp): number {
  const tierDiff = tierOf(a) - tierOf(b);
  if (tierDiff) return tierDiff;
  // played tier keeps historical play order; unplayed tiers order by clock time
  const primary =
    tierOf(a) === 0
      ? ensureInt(a.schedule?.courtOrder ?? 0) - ensureInt(b.schedule?.courtOrder ?? 0)
      : timeKey(a).localeCompare(timeKey(b));
  if (primary) return primary;
  return ensureInt(a.schedule?.courtOrder ?? 0) - ensureInt(b.schedule?.courtOrder ?? 0);
}

function sourcesSatisfied(
  matchUp: HydratedMatchUp,
  row: number,
  rowOf: Record<string, number>,
  deps,
  gridIds,
): boolean {
  const sources = deps[matchUp.matchUpId]?.matchUpIds ?? [];
  return sources.every((id: string) => !gridIds.has(id) || (rowOf[id] !== undefined && rowOf[id] < row));
}

function participantsClash(matchUp: HydratedMatchUp, rowParticipants: Set<string>, deps): boolean {
  const pids = deps[matchUp.matchUpId]?.participantIds ?? [];
  return pids.some((id: string) => rowParticipants.has(id));
}

function blockingSources(
  matchUp: HydratedMatchUp,
  row: number,
  rowOf: Record<string, number>,
  deps,
  gridIds,
): string[] {
  const sources = deps[matchUp.matchUpId]?.matchUpIds ?? [];
  return sources.filter((id: string) => gridIds.has(id) && !(rowOf[id] !== undefined && rowOf[id] < row));
}

// Greedy court-locked row sweep. Blank cells (gaps) are the "spacing". A row
// that places nothing is a deadlock (a hand-made ordering cycle); break it by
// force-placing the earliest stalled head and recording it as unresolvable.
function assignRows({ columns, courtIdList, deps, gridIds, unresolvable }): Record<string, number> {
  const ptr: Record<string, number> = Object.fromEntries(courtIdList.map((c: string) => [c, 0]));
  const rowOf: Record<string, number> = {};
  const remaining = () => courtIdList.some((c: string) => ptr[c] < columns[c].length);

  let row = 0;
  while (remaining()) {
    row += 1;
    const rowParticipants = new Set<string>();
    let placedThisRow = 0;

    for (const courtId of courtIdList) {
      const matchUp = columns[courtId][ptr[courtId]];
      if (!matchUp) continue;
      if (!sourcesSatisfied(matchUp, row, rowOf, deps, gridIds)) continue;
      if (participantsClash(matchUp, rowParticipants, deps)) continue;

      rowOf[matchUp.matchUpId] = row;
      for (const pid of deps[matchUp.matchUpId]?.participantIds ?? []) rowParticipants.add(pid);
      ptr[courtId] += 1;
      placedThisRow += 1;
    }

    if (!placedThisRow) forcePlaceStalledHead({ columns, courtIdList, ptr, rowOf, deps, gridIds, row, unresolvable });
  }
  return rowOf;
}

function forcePlaceStalledHead({ columns, courtIdList, ptr, rowOf, deps, gridIds, row, unresolvable }): void {
  let chosen: { courtId: string; matchUp: HydratedMatchUp } | undefined;
  for (const courtId of courtIdList) {
    const matchUp = columns[courtId][ptr[courtId]];
    if (!matchUp) continue;
    if (!chosen || columnComparator(matchUp, chosen.matchUp) < 0) chosen = { courtId, matchUp };
  }
  if (!chosen) return;

  const { courtId, matchUp } = chosen;
  rowOf[matchUp.matchUpId] = row;
  ptr[courtId] += 1;
  unresolvable.push({
    matchUpId: matchUp.matchUpId,
    reason: 'orderingDeadlock',
    sourceMatchUpIds: blockingSources(matchUp, row, rowOf, deps, gridIds),
  });
}

// A director-made impossibility: a feeder scheduled at a later clock time than
// the match it feeds. Reported even when the sweep happens to place it.
function addChronologyIssues({ onGrid, deps, gridIds, byId, unresolvable }): void {
  const flagged = new Set(unresolvable.map((u) => u.matchUpId));
  for (const matchUp of onGrid) {
    const time = matchUp.schedule?.scheduledTime;
    if (!time) continue;
    const laterSources = (deps[matchUp.matchUpId]?.matchUpIds ?? []).filter((id: string) => {
      const sourceTime = gridIds.has(id) ? byId[id]?.schedule?.scheduledTime : undefined;
      return sourceTime && sourceTime > time;
    });
    if (laterSources.length && !flagged.has(matchUp.matchUpId)) {
      flagged.add(matchUp.matchUpId);
      unresolvable.push({ matchUpId: matchUp.matchUpId, reason: 'chronology', sourceMatchUpIds: laterSources });
    }
  }
}

function buildDetails({ rowOf, byId, scheduledDate }) {
  const matchUpDetails: any[] = [];
  const resolved: { matchUpId: string; courtId: string; from: number; to: number }[] = [];
  for (const [matchUpId, courtOrder] of Object.entries(rowOf) as [string, number][]) {
    const matchUp = byId[matchUpId];
    const from = ensureInt(matchUp.schedule?.courtOrder ?? 0);
    if (from === courtOrder) continue;
    matchUpDetails.push({
      tournamentId: matchUp.tournamentId,
      drawId: matchUp.drawId,
      matchUpId,
      schedule: {
        courtId: matchUp.schedule?.courtId,
        venueId: matchUp.schedule?.venueId,
        scheduledTime: matchUp.schedule?.scheduledTime,
        scheduledDate,
        courtOrder,
      },
    });
    resolved.push({ matchUpId, courtId: matchUp.schedule?.courtId as string, from, to: courtOrder });
  }
  return { matchUpDetails, resolved };
}
