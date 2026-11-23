import { getStructureCompleteness } from '@Query/drawDefinition/getStructureCompleteness';

// constants and types
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

// getDrawCompleteness is the DRAW layer of the completeness roll-up. getStructureCompleteness
// already aggregates every structure of the draw, so this stamps drawId for provenance and is the
// composition point the EVENT layer rolls up. Completeness (legitimately-incomplete state) is kept
// separate from inconsistencies (contradictory state) — see getDrawInconsistencies.

export type DrawCompleteness = {
  drawId?: string;
  unassignedPositionCount: number;
  unplayedMatchUpCount: number;
  structures: any[];
};

type GetDrawCompletenessArgs = {
  drawDefinition: DrawDefinition;
  tournamentRecord?: Tournament;
  matchUpsMap?: MatchUpsMap;
  drawId?: string;
  event?: Event;
};

export function getDrawCompleteness(
  params: GetDrawCompletenessArgs,
): ResultType & { complete?: boolean; completeness?: DrawCompleteness } {
  const { drawDefinition } = params;
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  const drawId = params.drawId ?? drawDefinition.drawId;

  const result: any = getStructureCompleteness(params);
  if (result.error) return result;

  return { ...SUCCESS, complete: result.complete, completeness: { drawId, ...result.completeness } };
}
