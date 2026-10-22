import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { scheduledMatchUpDate } from '@Query/matchUp/scheduledMatchUpDate';
import { scheduledMatchUpTime } from '@Query/matchUp/scheduledMatchUpTime';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { findDrawDefinition } from '@Acquire/findDrawDefinition';
import { extractDate, extractTime } from '@Tools/dateTime';

// constants and types
import { DrawDefinition, MatchUp, Score, Tournament } from '@Types/tournamentTypes';
import { COMPLETED, DEFAULTED, RETIRED } from '@Constants/matchUpStatusConstants';
import { ANACHRONISM } from '@Constants/errorConditionConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import { ResultType } from '@Types/factoryTypes';

/**
 * A matchUp may not be placed before a matchUp it depends on that was PLAYED, and a played matchUp may not be placed
 * after a matchUp that depends on it (CA 2026-10-22, the C2 ordering rule in SCHEDULING_PIPELINE_VNEXT.md § 5).
 *
 * - **Played**: COMPLETED, RETIRED or DEFAULTED, with a score. A walkover, a double exit, a cancelled or abandoned
 *   matchUp, a dead rubber or a BYE was not played and imposes nothing; nor does a matchUp IN_PROGRESS or SUSPENDED,
 *   whatever its score (CA).
 * - **Depends on**: the dependency graph's links (winner, loser, feed, qualifying to main, group to playoff). AD_HOC
 *   rounds and the rounds of a round robin carry no links, so they impose no order.
 * - **Before**: scheduled against scheduled only. An earlier date; or the same date with both times set and the
 *   dependent's at or before the source's (a played matchUp did not last no time at all). A same-day placement without a
 *   time, or a source without a date, proves nothing. Recorded start and end times are never compared: they are stored
 *   as instants, and an end time is often when the score was entered.
 *
 * Asked only of a write that MOVES a matchUp's date or time, so a court, an order, an official or an unchanged schedule
 * is never refused, and nothing an operator already stored is refused or erased.
 */

export type Placement = { scheduledDate?: string; scheduledTime?: string };
export type PendingPlacements = { [matchUpId: string]: Placement };

const PLAYED_STATUSES = new Set<string>([COMPLETED, RETIRED, DEFAULTED]);

export function wasPlayed(matchUp?: { matchUpStatus?: string; score?: Score }): boolean {
  return !!matchUp?.matchUpStatus && PLAYED_STATUSES.has(matchUp.matchUpStatus) && checkScoreHasValue(matchUp);
}

/** a stored or proposed schedule as a calendar date and an HH:MM time; empty values are absent */
function normalized({ scheduledDate, scheduledTime }: Placement): Placement {
  return {
    scheduledDate: extractDate(scheduledDate) || extractDate(scheduledTime) || undefined,
    scheduledTime: (scheduledTime && extractTime(scheduledTime)) || undefined,
  };
}

function storedPlacement(matchUp: MatchUp): Placement {
  return normalized({
    scheduledDate: scheduledMatchUpDate({ matchUp }).scheduledDate,
    scheduledTime: scheduledMatchUpTime({ matchUp }).scheduledTime,
  });
}

/** `earlier` is provably at or before `later` */
function notAfter(earlier: Placement, later: Placement): boolean {
  if (!earlier.scheduledDate || !later.scheduledDate) return false;
  if (earlier.scheduledDate !== later.scheduledDate) return earlier.scheduledDate < later.scheduledDate;
  return !!earlier.scheduledTime && !!later.scheduledTime && earlier.scheduledTime <= later.scheduledTime;
}

/** where a schedule write leaves a matchUp: what it states, else what is stored */
export function placementAfterWrite(stored: Placement, schedule: Placement): Placement {
  const statedTime = schedule.scheduledTime !== undefined ? normalized({ scheduledTime: schedule.scheduledTime }) : {};
  return {
    scheduledDate:
      schedule.scheduledDate !== undefined
        ? extractDate(schedule.scheduledDate) || undefined
        : (statedTime.scheduledDate ?? stored.scheduledDate),
    scheduledTime: schedule.scheduledTime !== undefined ? statedTime.scheduledTime : stored.scheduledTime,
  };
}

type BlockingMatchUp = {
  relation: 'playedSource' | 'dependent';
  matchUpStatus?: string;
  structureId?: string;
  roundNumber?: number;
  matchUpId: string;
} & Placement;

type PlayedOrderArgs = {
  pendingPlacements?: PendingPlacements;
  matchUpDependencies?: ReturnType<typeof getMatchUpDependencies>['matchUpDependencies'];
  inContextMatchUps?: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  schedule: Placement;
  matchUpId: string;
};

/**
 * The played-order refusal for one write, or undefined. `pendingPlacements` are the other placements of the same batch,
 * read in place of what is stored, so a bulk write is judged on the state it leaves and not on its intermediate steps.
 */
export function checkPlayedOrder(params: PlayedOrderArgs): ResultType | undefined {
  const { drawDefinition, matchUpId, schedule, pendingPlacements } = params;
  if (schedule.scheduledDate === undefined && schedule.scheduledTime === undefined) return undefined;

  const rawMatchUps: MatchUp[] = allDrawMatchUps({ drawDefinition, inContext: false }).matchUps ?? [];
  // fast path: a draw nobody has played in yet imposes nothing, whatever moves
  if (!rawMatchUps.some(wasPlayed)) return undefined;
  const rawById = new Map(rawMatchUps.map((matchUp) => [matchUp.matchUpId, matchUp]));
  const target = rawById.get(matchUpId);
  if (!target) return undefined;

  const stored = storedPlacement(target);
  const placement = placementAfterWrite(stored, schedule);
  if (placement.scheduledDate === stored.scheduledDate && placement.scheduledTime === stored.scheduledTime)
    return undefined;

  let { matchUpDependencies, inContextMatchUps } = params;
  if (!matchUpDependencies || !inContextMatchUps)
    ({ matchUpDependencies, matchUps: inContextMatchUps } = getMatchUpDependencies({ drawDefinition }));
  const inContext = new Map((inContextMatchUps ?? []).map((matchUp) => [matchUp.matchUpId, matchUp]));
  const placementOf = (id: string): Placement => {
    if (pendingPlacements?.[id]) return pendingPlacements[id];
    const raw = rawById.get(id);
    return raw ? storedPlacement(raw) : {};
  };
  const describe = (id: string, relation: BlockingMatchUp['relation']): BlockingMatchUp => {
    const hydrated = inContext.get(id);
    const raw = rawById.get(id);
    return {
      ...placementOf(id),
      matchUpStatus: raw?.matchUpStatus ?? hydrated?.matchUpStatus,
      roundNumber: raw?.roundNumber ?? hydrated?.roundNumber,
      structureId: hydrated?.structureId,
      matchUpId: id,
      relation,
    };
  };

  const dependencies = matchUpDependencies?.[matchUpId] ?? {};
  const blocking: BlockingMatchUp[] = [];
  for (const sourceId of dependencies.matchUpIds ?? []) {
    const source = rawById.get(sourceId) ?? inContext.get(sourceId);
    if (wasPlayed(source) && notAfter(placement, placementOf(sourceId)))
      blocking.push(describe(sourceId, 'playedSource'));
  }
  if (wasPlayed(target))
    for (const dependentId of dependencies.dependentMatchUpIds ?? []) {
      if (notAfter(placementOf(dependentId), placement)) blocking.push(describe(dependentId, 'dependent'));
    }

  if (!blocking.length) return undefined;
  return decorateResult({
    result: { error: ANACHRONISM },
    info: 'a matchUp cannot be scheduled before a played matchUp it depends on',
    stack: 'checkPlayedOrder',
    context: { matchUpId, ...placement, blockingMatchUps: blocking },
  });
}

export type BatchPlacement = { drawId: string; matchUpId: string; schedule: Placement };

/**
 * The played-order refusal for a whole batch, decided before any of it is written: every placement is judged against
 * the state the batch leaves (each other placement in place of what is stored), so a batch that moves a semifinal and
 * its final earlier together is not refused for the step between, and a refusal leaves nothing half-written.
 */
export function checkBatchPlayedOrder({
  tournamentRecord,
  placements,
}: {
  placements: BatchPlacement[];
  tournamentRecord: Tournament;
}): ResultType | undefined {
  const draws = new Map<string, { drawDefinition: DrawDefinition; raw: Map<string, MatchUp> }>();
  for (const { drawId } of placements) {
    if (draws.has(drawId)) continue;
    const drawDefinition = findDrawDefinition({ tournamentRecord, drawId }).drawDefinition;
    if (!drawDefinition) continue;
    const rawMatchUps: MatchUp[] = allDrawMatchUps({ drawDefinition, inContext: false }).matchUps ?? [];
    // a draw nobody has played in imposes nothing
    if (!rawMatchUps.some(wasPlayed)) continue;
    draws.set(drawId, { drawDefinition, raw: new Map(rawMatchUps.map((matchUp) => [matchUp.matchUpId, matchUp])) });
  }
  if (!draws.size) return undefined;

  const pendingPlacements: PendingPlacements = {};
  for (const { drawId, matchUpId, schedule } of placements) {
    const raw = draws.get(drawId)?.raw.get(matchUpId);
    if (raw) pendingPlacements[matchUpId] = placementAfterWrite(storedPlacement(raw), schedule);
  }

  const dependenciesByDraw = new Map<string, ReturnType<typeof getMatchUpDependencies>>();
  for (const { drawId, matchUpId, schedule } of placements) {
    const draw = draws.get(drawId);
    if (!draw) continue;
    if (!dependenciesByDraw.has(drawId))
      dependenciesByDraw.set(drawId, getMatchUpDependencies({ drawDefinition: draw.drawDefinition }));
    const { matchUpDependencies, matchUps } = dependenciesByDraw.get(drawId) ?? {};
    const refusal = checkPlayedOrder({
      drawDefinition: draw.drawDefinition,
      inContextMatchUps: matchUps,
      matchUpDependencies,
      pendingPlacements,
      matchUpId,
      schedule,
    });
    if (refusal) return refusal;
  }
  return undefined;
}
