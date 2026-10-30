import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { scheduledMatchUpDate } from '@Query/matchUp/scheduledMatchUpDate';
import { scheduledMatchUpTime } from '@Query/matchUp/scheduledMatchUpTime';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import { extractDate, extractTime } from '@Tools/dateTime';

// constants and types
import { DrawDefinition, MatchUp, MatchUpStatusUnion, Score } from '@Types/tournamentTypes';
import { BYE, COMPLETED, DEFAULTED, RETIRED } from '@Constants/matchUpStatusConstants';
import { HydratedMatchUp } from '@Types/hydrated';

/**
 * What the schedule order reads (CA 2026-10-22, widened CA 2026-10-30): read-only, so the order's refusals
 * (`@Mutate/matchUps/schedule/scheduleItems/playedOrder`) and `getMatchUpScheduleBounds` read the same facts and the same
 * neighbours, and the bounds a client offers cannot disagree with the writes the engine refuses.
 */

export type Placement = { scheduledDate?: string; scheduledTime?: string };
export type PendingPlacements = { [matchUpId: string]: Placement };

const PLAYED_STATUSES = new Set<string>([COMPLETED, RETIRED, DEFAULTED]);

export function wasPlayed(matchUp?: { matchUpStatus?: MatchUpStatusUnion; score?: Score }): boolean {
  return !!matchUp?.matchUpStatus && PLAYED_STATUSES.has(matchUp.matchUpStatus) && checkScoreHasValue(matchUp);
}

/** every matchUp but a BYE imposes order on the matchUps linked to it (CA 2026-10-30) */
export function imposesOrder(matchUp?: { matchUpStatus?: MatchUpStatusUnion }): boolean {
  return matchUp?.matchUpStatus !== BYE;
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
export function notAfter(earlier: Placement, later: Placement): boolean {
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

export type MatchUpDependencies = ReturnType<typeof getMatchUpDependencies>['matchUpDependencies'];

/** what the played order reads of a STORED matchUp: where it is placed, whether it was played, and how it is named */
export type StoredPlayedOrderFacts = Placement & {
  matchUpStatus?: MatchUpStatusUnion;
  roundNumber?: number;
  played: boolean;
};
export type DrawPlayedOrderFacts = { [matchUpId: string]: StoredPlayedOrderFacts };

/**
 * A draw's stored matchUps as the order reads them, by matchUpId: plain data, so a caller can resolve them once and
 * judge any number of placements without the draw. Undefined when no matchUp of the draw is placed: it imposes nothing.
 */
export function drawPlayedOrderFacts(
  drawDefinition: DrawDefinition,
  /** a batch placing several of the draw's matchUps is judged against itself, whatever is stored */
  { batched }: { batched?: boolean } = {},
): DrawPlayedOrderFacts | undefined {
  // read from the stored matchUps first: a draw with nothing placed imposes nothing, and building the draw's matchUps
  // to find that out, on every write of a scheduler's run, was most of a direct run's cost on a large draw
  if (!batched && !storedMatchUpPlaced(drawDefinition)) return undefined;
  const rawMatchUps: MatchUp[] = allDrawMatchUps({ drawDefinition, inContext: false }).matchUps ?? [];
  const facts: DrawPlayedOrderFacts = {};
  for (const matchUp of rawMatchUps) {
    facts[matchUp.matchUpId] = {
      ...storedPlacement(matchUp),
      matchUpStatus: matchUp.matchUpStatus,
      roundNumber: matchUp.roundNumber,
      played: wasPlayed(matchUp),
    };
  }
  return facts;
}

type StoredStructure = { matchUps?: MatchUp[]; structures?: StoredStructure[] };

/** a stored matchUp's placement says something: it has a date or a time */
const isPlaced = (matchUp: MatchUp): boolean => {
  const { scheduledDate, scheduledTime } = storedPlacement(matchUp);
  return !!(scheduledDate || scheduledTime);
};

/** whether any matchUp the draw stores is placed: every structure's, a round robin's groups' and every tie matchUp */
function storedMatchUpPlaced(drawDefinition: DrawDefinition): boolean {
  const placed = (matchUp: MatchUp): boolean => isPlaced(matchUp) || !!matchUp.tieMatchUps?.some(placed);
  const inStructure = (structure: StoredStructure): boolean =>
    !!structure.matchUps?.some(placed) || !!structure.structures?.some(inStructure);
  return (drawDefinition.structures ?? []).some((structure) => inStructure(structure as StoredStructure));
}

export const placementOf = ({ scheduledDate, scheduledTime }: Placement): Placement => ({
  scheduledDate,
  scheduledTime,
});

type OrderingNeighboursArgs = {
  inContext: Map<string, HydratedMatchUp>;
  matchUpDependencies?: MatchUpDependencies;
  facts: DrawPlayedOrderFacts;
  plannedOrder: boolean;
  matchUpId: string;
};

/**
 * Every matchUp that depends on each matchUp, however far downstream. The graph's `matchUpIds` (sources) are exhaustive
 * but its `dependentMatchUpIds` are direct only, so a quarterfinal whose semifinal is not yet dated would otherwise be
 * placed after a dated final. Built once per graph.
 */
const transitiveDependentsByGraph = new WeakMap<object, Map<string, string[]>>();
function transitiveDependents(matchUpDependencies: MatchUpDependencies, matchUpId: string): string[] {
  let byId = transitiveDependentsByGraph.get(matchUpDependencies);
  if (!byId) {
    byId = new Map();
    for (const dependentId of Object.keys(matchUpDependencies)) {
      for (const sourceId of matchUpDependencies[dependentId]?.matchUpIds ?? []) {
        const dependents = byId.get(sourceId);
        if (dependents) dependents.push(dependentId);
        else byId.set(sourceId, [dependentId]);
      }
    }
    transitiveDependentsByGraph.set(matchUpDependencies, byId);
  }
  return byId.get(matchUpId) ?? [];
}

/** whether a matchUp was played, read from the stored facts or else from its hydrated matchUp */
export const playedOf =
  (facts: DrawPlayedOrderFacts, inContext: Map<string, HydratedMatchUp>) =>
  (id: string): boolean =>
    facts[id] ? facts[id].played : wasPlayed(inContext.get(id));

/**
 * The matchUps that order a matchUp: the `sources` it may not be placed at or before, and the `dependents` it may not
 * be placed after. The refusal and `getMatchUpScheduleBounds` both read them here, so the bounds a client offers and
 * the writes the engine refuses cannot disagree.
 */
export function orderingNeighbours({
  matchUpDependencies,
  plannedOrder,
  matchUpId,
  inContext,
  facts,
}: OrderingNeighboursArgs): { sources: string[]; dependents: string[] } {
  const target = facts[matchUpId];
  if (!target || !imposesOrder(target)) return { sources: [], dependents: [] };
  const played = playedOf(facts, inContext);
  const ordersAtAll = (id: string) => imposesOrder(facts[id] ?? inContext.get(id));
  const dependencies = matchUpDependencies?.[matchUpId] ?? {};
  // with `plannedOrder: false` only a played matchUp orders: the rule as it stood before CA 2026-10-30
  const sources = (dependencies.matchUpIds ?? []).filter((id) => ordersAtAll(id) && (plannedOrder || played(id)));
  // the target orders its dependents in the same way, whether or not a dependent was played
  // the graph's dependents are direct only; every matchUp downstream orders the target
  const dependents =
    (plannedOrder || target.played) && matchUpDependencies
      ? transitiveDependents(matchUpDependencies, matchUpId).filter(ordersAtAll)
      : [];
  return { sources, dependents };
}
