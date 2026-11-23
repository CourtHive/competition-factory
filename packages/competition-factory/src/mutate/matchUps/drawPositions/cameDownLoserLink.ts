import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionTargets } from '@Query/matchUp/positionTargets';

// types
import type { DrawDefinition, MatchUp } from '@Types/tournamentTypes';

/**
 * The target is the source's own loser target: the exit reached it over the link, not relayed past a BYE. Shared by
 * `positionClear`'s `awardStands` and `withdrawFromMatchUp`'s `awardsEmptySeat`, which each decide whether a produced
 * exit keeps its award to a seat nobody has reached; a module of its own so that `sideExitProvenance` need not import
 * `positionClear`, which imports it.
 */
export function cameDownLoserLink({
  drawDefinition,
  targetMatchUp,
  sourceMatchUpId,
}: {
  drawDefinition: DrawDefinition;
  sourceMatchUpId?: string;
  targetMatchUp: MatchUp;
}): boolean {
  if (!sourceMatchUpId) return false;
  const inContextDrawMatchUps = getAllDrawMatchUps({ inContext: true, drawDefinition })?.matchUps ?? [];
  const targets = positionTargets({ matchUpId: sourceMatchUpId, inContextDrawMatchUps, drawDefinition });
  return targets.targetMatchUps?.loserMatchUp?.matchUpId === targetMatchUp.matchUpId;
}
