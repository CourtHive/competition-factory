import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { scheduledMatchUpDate } from '@Query/matchUp/scheduledMatchUpDate';
import { scheduledMatchUpTime } from '@Query/matchUp/scheduledMatchUpTime';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { findDrawDefinition } from '@Acquire/findDrawDefinition';
import { extractDate, extractTime } from '@Tools/dateTime';

// constants and types
import { DrawDefinition, MatchUp, MatchUpStatusUnion, Score, Tournament } from '@Types/tournamentTypes';
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

export function wasPlayed(matchUp?: { matchUpStatus?: MatchUpStatusUnion; score?: Score }): boolean {
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
  matchUpStatus?: MatchUpStatusUnion;
  structureId?: string;
  roundNumber?: number;
  matchUpId: string;
} & Placement;

type MatchUpDependencies = ReturnType<typeof getMatchUpDependencies>['matchUpDependencies'];
type PlayedOrderGraph = { matchUpDependencies?: MatchUpDependencies; inContextMatchUps?: HydratedMatchUp[] };

type PlayedOrderArgs = {
  pendingPlacements?: PendingPlacements;
  matchUpDependencies?: MatchUpDependencies;
  inContextMatchUps?: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  schedule: Placement;
  matchUpId: string;
};

/** what the played order reads of a STORED matchUp: where it is placed, whether it was played, and how it is named */
export type StoredPlayedOrderFacts = Placement & {
  matchUpStatus?: MatchUpStatusUnion;
  roundNumber?: number;
  played: boolean;
};
export type DrawPlayedOrderFacts = { [matchUpId: string]: StoredPlayedOrderFacts };

/**
 * A draw's stored matchUps as the played order reads them, by matchUpId: plain data, so a caller can resolve them once and
 * judge any number of placements without the draw. Undefined when nobody has played in the draw: it imposes nothing.
 */
export function drawPlayedOrderFacts(drawDefinition: DrawDefinition): DrawPlayedOrderFacts | undefined {
  // read from the stored matchUps first: a draw nobody has played in imposes nothing, and building the draw's matchUps
  // to find that out, on every write of a scheduler's run, was most of a direct run's cost on a large draw
  if (!storedMatchUpPlayed(drawDefinition)) return undefined;
  const rawMatchUps: MatchUp[] = allDrawMatchUps({ drawDefinition, inContext: false }).matchUps ?? [];
  if (!rawMatchUps.some(wasPlayed)) return undefined;
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

/** whether any matchUp the draw stores was played: every structure's, a round robin's groups' and every tie matchUp */
function storedMatchUpPlayed(drawDefinition: DrawDefinition): boolean {
  const played = (matchUp: MatchUp): boolean => wasPlayed(matchUp) || !!matchUp.tieMatchUps?.some(played);
  const inStructure = (structure: StoredStructure): boolean =>
    !!structure.matchUps?.some(played) || !!structure.structures?.some(inStructure);
  return (drawDefinition.structures ?? []).some((structure) => inStructure(structure as StoredStructure));
}

const placementOf = ({ scheduledDate, scheduledTime }: Placement): Placement => ({ scheduledDate, scheduledTime });

/**
 * The played-order refusal for one write, or undefined. `pendingPlacements` are the other placements of the same batch,
 * read in place of what is stored, so a bulk write is judged on the state it leaves and not on its intermediate steps.
 */
export function checkPlayedOrder(params: PlayedOrderArgs): ResultType | undefined {
  const { drawDefinition, matchUpDependencies, inContextMatchUps, ...rest } = params;
  if (rest.schedule.scheduledDate === undefined && rest.schedule.scheduledTime === undefined) return undefined;
  // a draw nobody has played in yet imposes nothing, whatever moves
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
  pendingPlacements?: PendingPlacements;
  /** the dependency graph and the in-context matchUps, asked for only when the write moves a matchUp */
  graph: () => PlayedOrderGraph;
  facts: DrawPlayedOrderFacts;
  schedule: Placement;
  matchUpId: string;
};

/** the rule itself, over a draw's stored facts (`drawPlayedOrderFacts`): it reads no record */
export function playedOrderRefusal({
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
  const played = (id: string) => (facts[id] ? facts[id].played : wasPlayed(inContext.get(id)));

  const dependencies = matchUpDependencies?.[matchUpId] ?? {};
  const blocking: BlockingMatchUp[] = [];
  for (const sourceId of dependencies.matchUpIds ?? []) {
    if (played(sourceId) && notAfter(placement, placementOfId(sourceId)))
      blocking.push(describe(sourceId, 'playedSource'));
  }
  if (target.played)
    for (const dependentId of dependencies.dependentMatchUpIds ?? []) {
      if (notAfter(placementOfId(dependentId), placement)) blocking.push(describe(dependentId, 'dependent'));
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
 *
 * The first refusal is returned; with `allRefusals`, every placement is judged and the first refusal carries them all
 * in `context.refusals`, so a caller can name every offender at once.
 */
export function checkBatchPlayedOrder({
  matchUpDependencies: givenDependencies,
  inContextMatchUps: givenMatchUps,
  tournamentRecord,
  allRefusals,
  placements,
}: {
  matchUpDependencies?: MatchUpDependencies;
  inContextMatchUps?: HydratedMatchUp[];
  placements: BatchPlacement[];
  tournamentRecord: Tournament;
  allRefusals?: boolean;
}): ResultType | undefined {
  const draws = new Map<string, { drawDefinition: DrawDefinition; facts: DrawPlayedOrderFacts }>();
  for (const { drawId } of placements) {
    if (draws.has(drawId)) continue;
    const drawDefinition = findDrawDefinition({ tournamentRecord, drawId }).drawDefinition;
    // a draw nobody has played in imposes nothing
    const facts = drawDefinition && drawPlayedOrderFacts(drawDefinition);
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
    const refusal = playedOrderRefusal({ facts: draw.facts, pendingPlacements, matchUpId, schedule, graph });
    if (refusal && !allRefusals) return refusal;
    if (refusal) refusals.push(refusal);
  }
  if (!refusals.length) return undefined;
  const [first] = refusals;
  // copies: the first refusal's own context takes the list, which must not contain itself
  return decorateResult({ result: first, context: { refusals: refusals.map(({ context }) => ({ ...context })) } });
}
