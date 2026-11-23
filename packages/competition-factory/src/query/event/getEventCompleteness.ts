import { getDrawCompleteness } from '@Query/drawDefinition/getDrawCompleteness';

// constants and types
import { MISSING_EVENT } from '@Constants/errorConditionConstants';
import { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { Event, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

// getEventCompleteness is the EVENT layer of the completeness roll-up: it aggregates
// getDrawCompleteness across the event's drawDefinitions, preserving the per-draw breakdown for a
// director-facing progress view. Completeness (legitimately-incomplete state) stays separate from
// inconsistencies (contradictory state).

export type EventCompleteness = {
  eventId?: string;
  unassignedPositionCount: number;
  unplayedMatchUpCount: number;
  byDraw: any[];
};

type GetEventCompletenessArgs = {
  tournamentRecord?: Tournament;
  matchUpsMap?: MatchUpsMap;
  event: Event;
};

export function getEventCompleteness(
  params: GetEventCompletenessArgs,
): ResultType & { complete?: boolean; completeness?: EventCompleteness } {
  const { event, tournamentRecord, matchUpsMap } = params;
  if (!event) return { error: MISSING_EVENT };
  const eventId = event.eventId;

  const byDraw = (event.drawDefinitions ?? []).map((drawDefinition) => {
    const result: any = getDrawCompleteness({ drawDefinition, tournamentRecord, matchUpsMap, event });
    return { drawId: drawDefinition.drawId, complete: result.complete, completeness: result.completeness };
  });

  const unassignedPositionCount = byDraw.reduce(
    (sum, draw) => sum + (draw.completeness?.unassignedPositionCount ?? 0),
    0,
  );
  const unplayedMatchUpCount = byDraw.reduce((sum, draw) => sum + (draw.completeness?.unplayedMatchUpCount ?? 0), 0);
  const complete = unassignedPositionCount === 0 && unplayedMatchUpCount === 0;

  return { ...SUCCESS, complete, completeness: { eventId, unassignedPositionCount, unplayedMatchUpCount, byDraw } };
}
