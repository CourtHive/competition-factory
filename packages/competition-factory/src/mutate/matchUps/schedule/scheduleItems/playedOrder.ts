import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { decorateResult } from '@Functions/global/decorateResult';
import { findDrawDefinition } from '@Acquire/findDrawDefinition';
import {
  DrawPlayedOrderFacts,
  MatchUpDependencies,
  PendingPlacements,
  Placement,
  drawPlayedOrderFacts,
  notAfter,
  orderingNeighbours,
  placementAfterWrite,
  placementOf,
  playedOf,
} from '@Query/matchUps/scheduling/scheduleOrder';

// constants and types
import { DrawDefinition, MatchUpStatusUnion, Tournament } from '@Types/tournamentTypes';
import { ANACHRONISM } from '@Constants/errorConditionConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import { ResultType } from '@Types/factoryTypes';

// what the order reads lives in @Query (read-only); re-exported for the scheduling modules that already import it here
export type {
  DrawPlayedOrderFacts,
  PendingPlacements,
  Placement,
  StoredPlayedOrderFacts,
} from '@Query/matchUps/scheduling/scheduleOrder';
export {
  drawPlayedOrderFacts,
  imposesOrder,
  orderingNeighbours,
  placementAfterWrite,
  placementOf,
  wasPlayed,
} from '@Query/matchUps/scheduling/scheduleOrder';

/**
 * A matchUp may not be placed at or before a matchUp it depends on, nor after a matchUp that depends on it. This was the
 * PLAYED order (CA 2026-10-22, the C2 ordering rule in SCHEDULING_PIPELINE_VNEXT.md § 5): only a played matchUp imposed
 * anything. It now binds plans as well as history (CA 2026-10-30): an impossible order is impossible whether or not the
 * earlier matchUp has been played.
 *
 * - **Imposes order**: every matchUp but a BYE, which is never played and carries no placement of its own. Walkovers,
 *   defaults and double exits impose order like any other matchUp (CA 2026-10-30). **Played** (COMPLETED, RETIRED or
 *   DEFAULTED, with a score) is still recorded, so a refusal can say whether the matchUp in the way was played.
 * - **Depends on**: the dependency graph's links (winner, loser, feed, qualifying to main, group to playoff). AD_HOC
 *   rounds and the rounds of a round robin carry no links, so they impose no order.
 * - **Before**: scheduled against scheduled only. An earlier date; or the same date with both times set and the
 *   dependent's at or before the source's (a matchUp does not last no time at all). A same-day placement without a
 *   time, or a source without a date, proves nothing. Recorded start and end times are not compared here.
 *
 * Asked only of a write that MOVES a matchUp's date or time, so a court, an order, an official or an unchanged schedule
 * is never refused, and nothing an operator already stored is refused or erased.
 */

type BlockingMatchUp = {
  /** `source` is a matchUp it depends on, `playedSource` one that was played; `dependent` depends on it */
  relation: 'source' | 'playedSource' | 'dependent';
  matchUpStatus?: MatchUpStatusUnion;
  structureId?: string;
  roundNumber?: number;
  matchUpId: string;
} & Placement;

type PlayedOrderGraph = { matchUpDependencies?: MatchUpDependencies; inContextMatchUps?: HydratedMatchUp[] };

type PlayedOrderArgs = {
  /** false: only a played matchUp orders, as before CA 2026-10-30 (default true: plans order too) */
  plannedOrder?: boolean;
  pendingPlacements?: PendingPlacements;
  matchUpDependencies?: MatchUpDependencies;
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
  const { drawDefinition, matchUpDependencies, inContextMatchUps, ...rest } = params;
  if (rest.schedule.scheduledDate === undefined && rest.schedule.scheduledTime === undefined) return undefined;
  // a draw with nothing placed imposes nothing, whatever moves
  const facts = drawPlayedOrderFacts(drawDefinition);
  if (!facts) return undefined;
  const graph = (): PlayedOrderGraph => {
    if (matchUpDependencies && inContextMatchUps) return { matchUpDependencies, inContextMatchUps };
    const resolved = getMatchUpDependencies({ drawDefinition });
    return { matchUpDependencies: resolved.matchUpDependencies, inContextMatchUps: resolved.matchUps };
  };
  return playedOrderRefusal({ ...rest, facts, graph });
}

type PlayedOrderRefusalArgs = {
  /** false: only a played matchUp orders, as before CA 2026-10-30 (default true: plans order too) */
  plannedOrder?: boolean;
  pendingPlacements?: PendingPlacements;
  /** the dependency graph and the in-context matchUps, asked for only when the write moves a matchUp */
  graph: () => PlayedOrderGraph;
  facts: DrawPlayedOrderFacts;
  schedule: Placement;
  matchUpId: string;
};

/** the rule itself, over a draw's stored facts (`drawPlayedOrderFacts`): it reads no record */
export function playedOrderRefusal({
  plannedOrder = true,
  pendingPlacements,
  matchUpId,
  schedule,
  facts,
  graph,
}: PlayedOrderRefusalArgs): ResultType | undefined {
  if (schedule.scheduledDate === undefined && schedule.scheduledTime === undefined) return undefined;
  const target = facts[matchUpId];
  if (!target) return undefined;

  const stored = placementOf(target);
  const placement = placementAfterWrite(stored, schedule);
  if (placement.scheduledDate === stored.scheduledDate && placement.scheduledTime === stored.scheduledTime)
    return undefined;

  const { matchUpDependencies, inContextMatchUps } = graph();
  const inContext = new Map((inContextMatchUps ?? []).map((matchUp) => [matchUp.matchUpId, matchUp]));
  const placementOfId = (id: string): Placement => {
    if (pendingPlacements?.[id]) return pendingPlacements[id];
    const stored = facts[id];
    return stored ? placementOf(stored) : {};
  };
  const describe = (id: string, relation: BlockingMatchUp['relation']): BlockingMatchUp => {
    const hydrated = inContext.get(id);
    const stored = facts[id];
    return {
      ...placementOfId(id),
      matchUpStatus: stored?.matchUpStatus ?? hydrated?.matchUpStatus,
      roundNumber: stored?.roundNumber ?? hydrated?.roundNumber,
      structureId: hydrated?.structureId,
      matchUpId: id,
      relation,
    };
  };
  const played = playedOf(facts, inContext);
  const { sources, dependents } = orderingNeighbours({
    matchUpDependencies,
    plannedOrder,
    matchUpId,
    inContext,
    facts,
  });

  const blocking: BlockingMatchUp[] = [
    ...sources
      .filter((sourceId) => notAfter(placement, placementOfId(sourceId)))
      .map((sourceId) => describe(sourceId, played(sourceId) ? 'playedSource' : 'source')),
    ...dependents
      .filter((dependentId) => notAfter(placementOfId(dependentId), placement))
      .map((dependentId) => describe(dependentId, 'dependent')),
  ];

  if (!blocking.length) return undefined;
  return decorateResult({
    result: { error: ANACHRONISM },
    info: 'a matchUp cannot be scheduled at or before a matchUp it depends on, nor after one that depends on it',
    stack: 'checkPlayedOrder',
    context: { matchUpId, ...placement, blockingMatchUps: blocking },
  });
}

export type BatchPlacement = { drawId: string; matchUpId: string; schedule: Placement };

/**
 * The played-order refusal for a whole batch, decided before any of it is written: every placement is judged against
 * the state the batch leaves (each other placement in place of what is stored), so a batch that moves a semifinal and
 * its final earlier together is not refused for the step between, and a refusal leaves nothing half-written.
 *
 * The first refusal is returned; with `allRefusals`, every placement is judged and the first refusal carries them all
 * in `context.refusals`, so a caller can name every offender at once.
 */
export function checkBatchPlayedOrder({
  matchUpDependencies: givenDependencies,
  inContextMatchUps: givenMatchUps,
  tournamentRecord,
  plannedOrder,
  allRefusals,
  placements,
}: {
  /** false: only a played matchUp orders, as before CA 2026-10-30 (default true: plans order too) */
  plannedOrder?: boolean;
  matchUpDependencies?: MatchUpDependencies;
  inContextMatchUps?: HydratedMatchUp[];
  placements: BatchPlacement[];
  tournamentRecord: Tournament;
  allRefusals?: boolean;
}): ResultType | undefined {
  const placementsByDraw = new Map<string, number>();
  for (const { drawId } of placements) placementsByDraw.set(drawId, (placementsByDraw.get(drawId) ?? 0) + 1);

  const draws = new Map<string, { drawDefinition: DrawDefinition; facts: DrawPlayedOrderFacts }>();
  for (const [drawId, count] of placementsByDraw) {
    const drawDefinition = findDrawDefinition({ tournamentRecord, drawId }).drawDefinition;
    // a draw with nothing placed imposes nothing, unless the batch places several of its matchUps: they order each other
    const facts = drawDefinition && drawPlayedOrderFacts(drawDefinition, { batched: count > 1 });
    if (drawDefinition && facts) draws.set(drawId, { drawDefinition, facts });
  }
  if (!draws.size) return undefined;

  const pendingPlacements: PendingPlacements = {};
  for (const { drawId, matchUpId, schedule } of placements) {
    const stored = draws.get(drawId)?.facts[matchUpId];
    if (stored) pendingPlacements[matchUpId] = placementAfterWrite(placementOf(stored), schedule);
  }

  const refusals: ResultType[] = [];
  const graphByDraw = new Map<string, PlayedOrderGraph>();
  for (const { drawId, matchUpId, schedule } of placements) {
    const draw = draws.get(drawId);
    if (!draw) continue;
    // the caller's graph when it has one (a bulk call builds it once for every tournament), else one per draw
    const graph = (): PlayedOrderGraph => {
      if (givenDependencies && givenMatchUps)
        return { matchUpDependencies: givenDependencies, inContextMatchUps: givenMatchUps };
      if (!graphByDraw.has(drawId)) {
        const { matchUpDependencies, matchUps } = getMatchUpDependencies({ drawDefinition: draw.drawDefinition });
        graphByDraw.set(drawId, { matchUpDependencies, inContextMatchUps: matchUps });
      }
      return graphByDraw.get(drawId) ?? {};
    };
    const refusal = playedOrderRefusal({
      facts: draw.facts,
      pendingPlacements,
      plannedOrder,
      matchUpId,
      schedule,
      graph,
    });
    if (refusal && !allRefusals) return refusal;
    if (refusal) refusals.push(refusal);
  }
  if (!refusals.length) return undefined;
  const [first] = refusals;
  // copies: the first refusal's own context takes the list, which must not contain itself
  return decorateResult({ result: first, context: { refusals: refusals.map(({ context }) => ({ ...context })) } });
}
