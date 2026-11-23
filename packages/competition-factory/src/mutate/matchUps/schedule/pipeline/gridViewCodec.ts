import type { ParticipantReachability } from '../scheduleMatchUps/getParticipantReachability';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { GridDateView } from './gridPlan';

/**
 * A grid date's view as JSON, and back: the CONTRACT of what the grid plan decides from (`kernel.scheduling.grid@1`).
 * A plan made from a view equals the plan made from the same view written here and read back.
 *
 * What is written is only what the plan reads: of each matchUp to place and each already on the grid, its identity,
 * draw, tournament, type and scheduled date and time; of the dependency graph, each matchUp's sources and dependents;
 * the reachability whole (its `upstream` Sets as sorted arrays); the rows and their free cells whole; the closures and
 * the limits.
 */
const GRID_VIEW_KEYS: Record<keyof GridDateView, 'required' | 'optional'> = {
  matchUpDependencies: 'required',
  dailyLimitsWarnOnly: 'optional',
  dailyLimitOverrides: 'optional',
  matchUpDailyLimits: 'optional',
  courtClosures: 'required',
  scheduledDate: 'required',
  gridMatchUps: 'required',
  reachability: 'required',
  gridRows: 'required',
  matchUps: 'required',
};

/** the grid view's members a conformance case's input must carry */
export const requiredGridViewKeys = () =>
  Object.entries(GRID_VIEW_KEYS).flatMap(([key, kind]) => (kind === 'required' ? [key] : []));

const pickMatchUp = ({ matchUpId, drawId, tournamentId, matchUpType, schedule }: HydratedMatchUp) => {
  const picked: Record<string, unknown> = { matchUpId, drawId, tournamentId, matchUpType };
  const { scheduledDate, scheduledTime } = schedule ?? {};
  if (schedule) picked.schedule = { scheduledDate, scheduledTime };
  return picked;
};

type EncodedReachability = Omit<ParticipantReachability, 'upstream'> & { upstream: { [matchUpId: string]: string[] } };

/** the grid date's view as plain data: what JSON carries, and what a conformance case holds as its input */
export function gridViewData(view: GridDateView): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const key of Object.keys(GRID_VIEW_KEYS) as (keyof GridDateView)[]) data[key] = view[key];
  data.matchUps = view.matchUps.map(pickMatchUp);
  data.gridMatchUps = view.gridMatchUps.map(pickMatchUp);
  data.matchUpDependencies = Object.fromEntries(
    Object.entries(view.matchUpDependencies ?? {}).map(([matchUpId, { matchUpIds, dependentMatchUpIds }]) => [
      matchUpId,
      { matchUpIds, dependentMatchUpIds },
    ]),
  );
  const upstream = Object.fromEntries(
    Object.entries(view.reachability.upstream).map(([matchUpId, ids]) => [
      matchUpId,
      [...ids].sort((a, b) => a.localeCompare(b, 'en')),
    ]),
  );
  data.reachability = { ...view.reachability, upstream } satisfies EncodedReachability;
  return data;
}

/** a grid date's view from plain data (`gridViewData`), as the plan reads it */
export function gridViewFromData(data: Record<string, unknown>): GridDateView {
  const reachability = data.reachability as EncodedReachability;
  const upstream = Object.fromEntries(
    Object.entries(reachability.upstream).map(([matchUpId, ids]) => [matchUpId, new Set(ids)]),
  );
  return { ...data, reachability: { ...reachability, upstream } } as GridDateView;
}
