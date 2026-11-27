import { planScheduleItems } from '@Mutate/matchUps/schedule/scheduleItems/scheduleItems';
import { checkBatchPlayedOrder, BatchPlacement } from './scheduleItems/playedOrder';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import { findDrawDefinition } from '@Acquire/findDrawDefinition';

// constants and types
import { BYE, completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { DrawDefinition, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import {
  MISSING_SCHEDULE,
  SCHEDULE_LOCKED,
  MISSING_MATCHUP_IDS,
  MISSING_TOURNAMENT_RECORD,
  ErrorType,
} from '@Constants/errorConditionConstants';
import type { MatchUpDependencies, MatchUpScheduleDetail, MatchUpScheduleRequest } from '@Types/factoryTypes';

type BulkScheduleMachUpsArgs = {
  tournamentRecords?: { [key: string]: Tournament };
  scheduleCompletedMatchUps?: boolean;
  overrideScheduleLock?: boolean;
  tournamentRecord?: Tournament;
  scheduleByeMatchUps?: boolean;
  errorOnAnachronism?: boolean;
  removePriorValues?: boolean;
  checkChronology?: boolean;
  matchUpDependencies?: MatchUpDependencies;
  /** hydrated matchUps the caller already holds; without them each call hydrates the tournament again */
  inContextMatchUps?: HydratedMatchUp[];
  matchUpIds?: string[];
  matchUpDetails?: MatchUpScheduleDetail[];
  schedule?: MatchUpScheduleRequest;
  /** the batch's played order was checked by the caller, across every tournament it writes */
  playedOrderChecked?: boolean;
  /** check the batch's played order and write nothing (the caller's first pass over several tournaments) */
  playedOrderOnly?: boolean;
  /** false: only a played matchUp orders, as before 2026-10-30 (default true: plans order too) */
  plannedOrder?: boolean;
};

type BulkScheduleResult = {
  notFoundMatchUpIds?: string[];
  lockedMatchUpIds?: string[];
  skippedMatchUpIds?: string[];
  error?: ErrorType;
  scheduled?: number;
  warnings?: any[];
};

export function bulkScheduleTournamentMatchUps(params: BulkScheduleMachUpsArgs): BulkScheduleResult {
  const { result, commits } = planBulkScheduleTournamentMatchUps(params);
  for (const commit of commits) commit();
  return result;
}

/**
 * Every matchUp of the batch planned before any is written. Each matchUp is its own schedule plan, as each was its own
 * call; a locked matchUp is skipped, and a refused one ends the batch, returning the plans before it with the refusal,
 * as the batch always kept what it had written by then. The commits are bound and run in order.
 */
export function planBulkScheduleTournamentMatchUps({
  scheduleCompletedMatchUps = false,
  scheduleByeMatchUps = false,
  errorOnAnachronism = false,
  checkChronology = true,
  overrideScheduleLock,
  matchUpDependencies,
  removePriorValues,
  tournamentRecords,
  tournamentRecord,
  matchUpDetails,
  inContextMatchUps: givenInContextMatchUps,
  playedOrderChecked,
  playedOrderOnly,
  plannedOrder,
  matchUpIds,
  schedule,
}: BulkScheduleMachUpsArgs): { result: BulkScheduleResult; commits: (() => void)[] } {
  const commits: (() => void)[] = [];
  const refuse = (result: BulkScheduleResult) => ({ result, commits });
  if (!tournamentRecord) return refuse({ error: MISSING_TOURNAMENT_RECORD });
  if (!matchUpDetails && (!matchUpIds || !Array.isArray(matchUpIds))) return refuse({ error: MISSING_MATCHUP_IDS });

  if (!matchUpDetails && (!schedule || typeof schedule !== 'object')) return refuse({ error: MISSING_SCHEDULE });

  let inContextMatchUps = givenInContextMatchUps;
  const lockedMatchUpIds: string[] = [];
  const warnings: any[] = [];
  let scheduled = 0;

  // Optimize getting matchUps for all tournamentRecords
  // if matchUpDependencies are provided, skip this step
  if (checkChronology && !matchUpDependencies) {
    const result = getMatchUpDependencies({
      tournamentRecords,
      tournamentRecord,
    });
    matchUpDependencies = result.matchUpDependencies;
    inContextMatchUps = result.matchUps;
  }

  // Optimize getting matchUps for all tournamentRecords
  // if inContextMatchUps retrieved in previous step, skip this step
  inContextMatchUps ??= allTournamentMatchUps({ tournamentRecord })?.matchUps ?? [];

  const detailMatchUpIds = matchUpDetails?.map((detail) => detail.matchUpId);
  const requestedMatchUpIds = new Set<string>(matchUpIds ?? detailMatchUpIds ?? []);
  const isRequested = (matchUpId: string) => requestedMatchUpIds.has(matchUpId);
  const { tournamentId } = tournamentRecord;

  // A requested matchUp that is a BYE or completed is deliberately not scheduled (unless the caller opts in), but
  // it is REPORTED: a caller handed `scheduled: 0` and nothing else cannot tell a skip from a lost request.
  const skippedMatchUpIds: string[] = [];

  // first organize matchUpIds by drawId
  const drawIdMap = inContextMatchUps.reduce((drawIdMap, matchUp) => {
    const { matchUpId, drawId, matchUpStatus } = matchUp;
    if (
      (scheduleByeMatchUps || matchUpStatus !== BYE) &&
      (scheduleCompletedMatchUps || !matchUpStatus || !completedMatchUpStatuses.includes(matchUpStatus))
    ) {
      if (drawIdMap[drawId]) {
        drawIdMap[drawId].push(matchUpId);
      } else {
        drawIdMap[drawId] = [matchUpId];
      }
    } else if ((!matchUp.tournamentId || matchUp.tournamentId === tournamentId) && isRequested(matchUpId)) {
      skippedMatchUpIds.push(matchUpId);
    }
    return drawIdMap;
  }, {});

  const attemptedMatchUpIds = new Set<string>(skippedMatchUpIds);
  const scheduleOf = (matchUpId: string) => detailScheduleOf({ matchUpDetails, schedule, matchUpId });

  const gate = playedOrderGate({
    plannedOrder,
    matchUpDependencies,
    inContextMatchUps,
    playedOrderChecked,
    tournamentRecord,
    playedOrderOnly,
    isRequested,
    scheduleOf,
    drawIdMap,
  });
  if (gate) return refuse(gate);

  for (const drawId of Object.keys(drawIdMap)) {
    const { drawDefinition } = findDrawDefinition({
      tournamentRecord,
      drawId,
    });
    if (!drawDefinition) continue;

    const drawMatchUpIds = drawIdMap[drawId].filter(isRequested);
    drawMatchUpIds.forEach((matchUpId) => attemptedMatchUpIds.add(matchUpId));

    // optimize matchUp retrieval
    const drawMatchUps = allDrawMatchUps({
      inContext: false,
      drawDefinition,
    }).matchUps;

    const refusal = planDrawSchedules({
      onScheduled: () => (scheduled += 1),
      overrideScheduleLock,
      matchUpDependencies,
      errorOnAnachronism,
      removePriorValues,
      inContextMatchUps,
      tournamentRecords,
      lockedMatchUpIds,
      tournamentRecord,
      checkChronology,
      drawDefinition,
      drawMatchUpIds,
      drawMatchUps,
      scheduleOf,
      warnings,
      commits,
    });
    if (refusal) return refuse(refusal);
  }

  // a requested matchUpId this tournament does not hold is reported rather than dropped in silence
  const notFoundMatchUpIds = [...requestedMatchUpIds].filter((matchUpId) => !attemptedMatchUpIds.has(matchUpId));

  const result = {
    ...SUCCESS,
    ...(warnings.length ? { warnings } : {}),
    ...(lockedMatchUpIds.length ? { lockedMatchUpIds } : {}),
    ...(skippedMatchUpIds.length ? { skippedMatchUpIds } : {}),
    ...(notFoundMatchUpIds.length ? { notFoundMatchUpIds } : {}),
    scheduled,
  };
  return { result, commits };
}

function detailScheduleOf({ matchUpDetails, schedule, matchUpId }) {
  return matchUpDetails?.find((details) => details.matchUpId === matchUpId)?.schedule || schedule;
}

/**
 * A played matchUp's order is refused for the whole batch, before any of it is written; a caller's first pass over
 * several tournaments (`playedOrderOnly`) stops here either way, writing nothing
 */
type PlayedOrderGateArgs = {
  scheduleOf: (matchUpId: string) => BatchPlacement['schedule'];
  matchUpDependencies?: BulkScheduleMachUpsArgs['matchUpDependencies'];
  drawIdMap: { [drawId: string]: string[] };
  isRequested: (matchUpId: string) => boolean;
  inContextMatchUps?: HydratedMatchUp[];
  playedOrderChecked?: boolean;
  tournamentRecord: Tournament;
  playedOrderOnly?: boolean;
  plannedOrder?: boolean;
};

function playedOrderGate({
  matchUpDependencies,
  inContextMatchUps,
  playedOrderChecked,
  playedOrderOnly,
  tournamentRecord,
  plannedOrder,
  drawIdMap,
  isRequested,
  scheduleOf,
}: PlayedOrderGateArgs) {
  if (!playedOrderChecked) {
    const placements = Object.keys(drawIdMap).flatMap((drawId) =>
      drawIdMap[drawId]
        .filter(isRequested)
        .map((matchUpId) => ({ drawId, matchUpId, schedule: scheduleOf(matchUpId) })),
    );
    const refusal = checkBatchPlayedOrder({
      matchUpDependencies,
      inContextMatchUps,
      tournamentRecord,
      plannedOrder,
      placements,
    });
    if (refusal) return refusal;
  }
  return playedOrderOnly ? { ...SUCCESS, scheduled: 0 } : undefined;
}

type DrawSchedulesArgs = Omit<BulkScheduleMachUpsArgs, 'matchUpIds' | 'matchUpDetails' | 'schedule'> & {
  scheduleOf: (matchUpId: string) => BatchPlacement['schedule'];
  drawDefinition: DrawDefinition;
  drawMatchUps?: HydratedMatchUp[];
  lockedMatchUpIds: string[];
  commits: (() => void)[];
  drawMatchUpIds: string[];
  onScheduled: () => void;
  warnings: unknown[];
};

/** each requested matchUp of one draw, planned in order: a locked one is skipped, and a refused one ends the batch */
function planDrawSchedules({
  lockedMatchUpIds,
  drawMatchUpIds,
  onScheduled,
  scheduleOf,
  warnings,
  commits,
  ...params
}: DrawSchedulesArgs): BulkScheduleResult | undefined {
  for (const matchUpId of drawMatchUpIds) {
    const plan = planScheduleItems({
      ...params,
      schedule: scheduleOf(matchUpId),
      playedOrderChecked: true,
      matchUpId,
    } as Parameters<typeof planScheduleItems>[0]);
    const result = 'commit' in plan ? plan.result : plan;
    if ('commit' in plan) commits.push(plan.commit);
    if (result?.warnings?.length) warnings.push(...result.warnings);
    if (result?.success) onScheduled();
    // A locked matchUp is SKIPPED, never fatal: one pinned marquee match must
    // not abort a Clear or a bulk re-schedule of the other 200. Reported back
    // so the caller can say what it preserved.
    if (result.error === SCHEDULE_LOCKED) {
      lockedMatchUpIds.push(matchUpId);
      continue;
    }
    if (result.error) return result;
  }
  return undefined;
}
