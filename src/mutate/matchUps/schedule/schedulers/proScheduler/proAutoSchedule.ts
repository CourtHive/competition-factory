import { modifyParticipantMatchUpsCount } from '@Mutate/matchUps/schedule/scheduleMatchUps/modifyParticipantMatchUpsCount';
import { processNextMatchUps } from '@Mutate/matchUps/schedule/scheduleMatchUps/processNextMatchUps';
import { checkDailyLimits } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkDailyLimits';
import { matchUpChronologicalSort } from '@Functions/sorters/matchUpChronologicalSort';
import { competitionScheduleMatchUps } from '@Query/matchUps/competitionScheduleMatchUps';
import { bulkScheduleMatchUps } from '@Mutate/matchUps/schedule/bulkScheduleMatchUps';
import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { validMatchUps } from '@Validators/validMatchUp';
import { isObject } from '@Tools/objects';

// constants and types
import { INVALID_VALUES, MISSING_CONTEXT } from '@Constants/errorConditionConstants';
import { Tournament } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';

// NOTE: matchUps are assumed to be { inContext: true, nextMatchUps: true }

type ProAutoScheduleArgs = {
  tournamentRecords: { [key: string]: Tournament };
  matchUpDailyLimits?: { [key: string]: number };
  matchUps: HydratedMatchUp[];
  minCourtGridRows?: number;
  scheduledDate: string;
  courtIds?: string[];
};
export function proAutoSchedule({
  matchUpDailyLimits,
  minCourtGridRows = 10,
  tournamentRecords,
  scheduledDate,
  courtIds,
  matchUps,
}: ProAutoScheduleArgs) {
  if (!validMatchUps(matchUps)) return { error: INVALID_VALUES };
  if (matchUps.some(({ hasContext }) => !hasContext)) {
    return {
      info: 'matchUps must have { inContext: true, nextMatchUps: true }',
      error: MISSING_CONTEXT,
    };
  }

  const matchUpFilters = { localPerspective: true, scheduledDate };
  let result = competitionScheduleMatchUps({
    courtCompletedMatchUps: true,
    withCourtGridRows: true,
    minCourtGridRows,
    tournamentRecords,
    matchUpFilters,
  });
  if (result.error) return result;
  const { rows } = result;

  const gridMatchUps: HydratedMatchUp[] = [];

  const getMatchUpParticipantIds = (matchUp) =>
    [
      (matchUp.sides ?? []).map((side) => [side.participantId, side.participant?.individualParticipantIds]),
      (matchUp.potentialParticipants ?? []).flat().map((p) => [p.participantId, p.individualParticipantIds]),
    ]
      .flat(Infinity)
      .filter(Boolean);

  const gridRows = rows?.reduce((gridRows, row) => {
    const matchUpIds: string[] = [],
      participantIds: string[] = [];
    Object.values(row).forEach((c: any) => {
      if (isObject(c)) {
        if (c.matchUpId) {
          matchUpIds.push(c.matchUpId);
          gridMatchUps.push(c);
        }
        if (c.sides) {
          const matchUpParticipantIds = getMatchUpParticipantIds(c);
          participantIds.push(...matchUpParticipantIds);
        }
      }
    });
    const availableCourts = Object.values(row).filter(
      (c: any) =>
        isObject(c) && !c.matchUpId && !c.isBlocked && (!courtIds?.length || courtIds.includes(c.schedule?.courtId)),
    );
    return gridRows.concat({
      matchUpIds,
      availableCourts,
      rowId: row.rowId,
      participantIds,
    });
  }, []);

  // When Garman has already set scheduledTime on matchUps (Garman → Pro
  // workflow), walk earlier times first so they land on earlier rows.
  // The comparator is a no-op when either side lacks date/time, so a
  // stable sort preserves input order for fresh runs (proConflicts
  // fixtures). BYE / completed filtering happens upstream in
  // `findRoundMatchUps` for the production path; direct callers (tests)
  // pass raw matchUps through.
  matchUps.sort(matchUpChronologicalSort);

  const deps = getMatchUpDependencies({
    matchUps: matchUps.concat(gridMatchUps),
    includeParticipantDependencies: true,
    tournamentRecords,
  }).matchUpDependencies;

  // Per-participant per-day counters. Only used when matchUpDailyLimits is
  // provided. Pre-populated from gridMatchUps (matchUps already on the grid
  // for this date) so the limit reflects total daily load, not just what
  // this run is placing. modifyParticipantMatchUpsCount handles both entered
  // and potential (winner-advancing) participants.
  const enforceLimits = !!matchUpDailyLimits && Object.keys(matchUpDailyLimits).length > 0;
  const individualParticipantProfiles: any = {};
  const matchUpPotentialParticipantIds: any = {};
  const overLimitMatchUpIds: string[] = [];

  if (enforceLimits) {
    bumpCountersForMatchUps(gridMatchUps, individualParticipantProfiles, matchUpPotentialParticipantIds);
    // Seed downstream matchUps with the winner-advancement potentials from
    // matchUps already on the grid, so daily limits on R2+ recognize the
    // R1 winners (and their losers via loserMatchUpId) before placement.
    for (const m of gridMatchUps) {
      processNextMatchUps({ matchUpPotentialParticipantIds, matchUpNotBeforeTimes: {}, matchUp: m });
    }
  }

  const scheduled: HydratedMatchUp[] = [];
  const previousRowMatchUpIds: string[] = [];

  while (matchUps.length && gridRows.length) {
    const row = gridRows.shift();
    const unscheduledMatchUps: HydratedMatchUp[] = [];
    while (matchUps.length && row.availableCourts.length) {
      const unscheduledMatchUpIds = matchUps.concat(unscheduledMatchUps).map((m) => m.matchUpId);
      const matchUp = matchUps.shift();
      const verdict = evaluatePlacement({
        matchUp,
        row,
        deps,
        previousRowMatchUpIds,
        unscheduledMatchUpIds,
        getMatchUpParticipantIds,
        enforceLimits,
        matchUpDailyLimits,
        individualParticipantProfiles,
        matchUpPotentialParticipantIds,
      });

      if (verdict.canPlace && matchUp) {
        const court = row.availableCourts.shift();
        matchUp.schedule ??= {};
        Object.assign(matchUp.schedule, court.schedule);
        Object.assign(court, matchUp);
        scheduled.push(matchUp);
        if (enforceLimits) {
          modifyParticipantMatchUpsCount({
            matchUpPotentialParticipantIds,
            individualParticipantProfiles,
            value: 1,
            matchUp,
          });
          // Propagate winner/loser advancement so downstream matchUps in the
          // same run see this matchUp's participants in their potentials map.
          processNextMatchUps({ matchUpPotentialParticipantIds, matchUpNotBeforeTimes: {}, matchUp });
        }
        row.participantIds.push(...verdict.participantIds);
        row.matchUpIds.push(matchUp.matchUpId);
      } else if (matchUp && verdict.atLimit) {
        if (!overLimitMatchUpIds.includes(matchUp.matchUpId)) overLimitMatchUpIds.push(matchUp.matchUpId);
        // Even though this matchUp can't be placed, propagate its potential
        // participants forward so downstream matchUps' daily-limit checks see
        // the right pool. Otherwise a final-round matchUp ends up with an
        // empty potentials map and slips through unchecked.
        processNextMatchUps({ matchUpPotentialParticipantIds, matchUpNotBeforeTimes: {}, matchUp });
      } else if (matchUp) {
        unscheduledMatchUps.push(matchUp);
      }
    }
    matchUps.push(...unscheduledMatchUps);
    previousRowMatchUpIds.push(...row.matchUpIds);
  }

  const matchUpDetails = scheduled.map(({ matchUpId, tournamentId, schedule, drawId }) => ({
    tournamentId,
    matchUpId,
    drawId,
    schedule: {
      ...schedule,
      scheduledDate,
    },
  }));

  result = bulkScheduleMatchUps({ tournamentRecords, matchUpDetails });

  const notScheduled = matchUps;

  return { ...result, scheduled, notScheduled, overLimitMatchUpIds };
}

function bumpCountersForMatchUps(
  matchUps: HydratedMatchUp[],
  individualParticipantProfiles: any,
  matchUpPotentialParticipantIds: any,
): void {
  for (const m of matchUps) {
    modifyParticipantMatchUpsCount({
      matchUpPotentialParticipantIds,
      individualParticipantProfiles,
      value: 1,
      matchUp: m,
    });
  }
}

// Evaluate whether `matchUp` can be placed on `row` given dependency,
// participant-conflict, and (optional) daily-limit constraints. Returns a
// discriminated verdict: `canPlace` (with side-effect inputs prepared),
// `atLimit` (over the daily limit — should NOT be retried), or neither
// (defer to a later row).
function evaluatePlacement({
  matchUp,
  row,
  deps,
  previousRowMatchUpIds,
  unscheduledMatchUpIds,
  getMatchUpParticipantIds,
  enforceLimits,
  matchUpDailyLimits,
  individualParticipantProfiles,
  matchUpPotentialParticipantIds,
}: any): { canPlace: boolean; atLimit: boolean; participantIds: string[] } {
  if (!matchUp) return { canPlace: false, atLimit: false, participantIds: [] };

  const matchUpId = matchUp.matchUpId;
  const linkedMatchUpIds = deps[matchUpId].matchUpIds.concat(deps[matchUpId].dependentMatchUpIds);

  const unscheduledContainSource = unscheduledMatchUpIds.some((id: string) => deps[matchUpId].matchUpIds.includes(id));
  const previousIncludesDependent = previousRowMatchUpIds.some((id: string) =>
    deps[matchUpId].dependentMatchUpIds.includes(id),
  );
  const rowIncludesLinked = row.matchUpIds.some((id: string) => linkedMatchUpIds.includes(id));

  const participantIds: string[] = getMatchUpParticipantIds(matchUp);
  const rowContainsParticipants = row.participantIds.some((id: string) => participantIds.includes(id));

  let atLimitParticipantIds: string[] = [];
  if (enforceLimits) {
    const dlResult = checkDailyLimits({
      matchUpPotentialParticipantIds,
      individualParticipantProfiles,
      matchUpDailyLimits,
      matchUp,
    });
    atLimitParticipantIds = dlResult.participantIdsAtLimit;
  }

  const atLimit = atLimitParticipantIds.length > 0;
  const canPlace =
    !rowIncludesLinked &&
    !unscheduledContainSource &&
    !rowContainsParticipants &&
    !previousIncludesDependent &&
    !atLimit;

  return { canPlace, atLimit, participantIds };
}
