import { getMatchUpStatusScopeViolation } from '@Query/matchUps/getMatchUpStatusScopeViolation';
import { isDeciderStructure } from '@Query/drawDefinition/deciderStructures';
import { matchUpStatusScopes } from '@Constants/matchUpStatusScopes';

// constants and types
import type { DrawDefinition, MatchUp, MatchUpStatusUnion } from '@Types/tournamentTypes';

/**
 * The scoped statuses a mutation would refuse on this matchUp, from the same registry and checker the mutation uses.
 *
 * Both booleans are explicit: the checker deliberately permits missing matchUp context, so an omitted one would read
 * as permission. The Decider is read by the same `isDeciderStructure` the mutation path asks.
 */
export function getDisabledMatchUpStatuses({
  drawDefinition,
  structureId,
  matchUp,
}: {
  drawDefinition: DrawDefinition;
  structureId?: string;
  matchUp: MatchUp;
}): MatchUpStatusUnion[] {
  const context = {
    isDeciderMatchUp: isDeciderStructure({ drawDefinition, structureId }),
    isTieMatchUp: !!matchUp.collectionId,
    drawType: drawDefinition.drawType,
  };
  const statuses = Object.keys(matchUpStatusScopes) as MatchUpStatusUnion[];
  return statuses
    .filter((matchUpStatus) => !!getMatchUpStatusScopeViolation({ ...context, matchUpStatus }))
    .toSorted((a, b) => a.localeCompare(b, 'en'));
}
