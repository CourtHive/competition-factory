// types
import type { FootprintContext, MethodFootprint } from './mutationFootprints';

const TOURNAMENT: MethodFootprint = { shards: ['tournament'] };
const SHELL: MethodFootprint = { shards: ['shell'] };
type QueryFootprintRule = (params: Record<string, unknown>) => MethodFootprint;

/**
 * Both action queries resolve participants from the event's entries and other draws (alternates, other flights,
 * pairs and team line-ups). One draw plus its participants is not a complete context. Start conservatively with
 * the event's draws and all participants; narrow only after real whole/partial result parity proves it safe.
 */
const eventActions: QueryFootprintRule = (params) => {
  if (typeof params.drawId !== 'string' || !params.drawId || typeof params.eventId !== 'string' || !params.eventId)
    return TOURNAMENT;
  return {
    shards: ['shell', 'draw', 'eventDraws', 'participants'],
    drawIds: [params.drawId],
    eventIds: [params.eventId],
    drawEventIds: { [params.drawId]: params.eventId },
  };
};

/** Query-only declarations; tests cross-check methodKinds and full factory query results. */
export const queryFootprints: Record<string, QueryFootprintRule> = {
  matchUpActions: eventActions,
  positionActions: eventActions,
};

export function getQueryMethodFootprint(
  method: string,
  params: Record<string, unknown> | undefined,
  context: FootprintContext = {},
): MethodFootprint {
  const rule = Object.hasOwn(queryFootprints, method) ? queryFootprints[method] : undefined;
  if (!rule) return TOURNAMENT;
  const runsAgainst = params?.tournamentId ?? context.activeTournamentId;
  if (context.tournamentId && runsAgainst && runsAgainst !== context.tournamentId) return SHELL;
  return rule(params ?? {});
}
