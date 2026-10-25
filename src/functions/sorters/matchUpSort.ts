import { stageOrder } from '@Constants/drawDefinitionConstants';
import { HydratedMatchUp } from '@Types/hydrated';

/**
 * The only fields the sort reads. A HydratedMatchUp (or any matchUp) satisfies it; a missing or null key sorts as 0.
 */
export type MatchUpSortKeys = Partial<Record<'stageSequence' | 'roundNumber' | 'roundPosition', number | null>> & {
  stage?: HydratedMatchUp['stage'] | null;
};

/**
 * Sorting function to arrange matchUps by stage, stageSequence, roundNumber, roundPosition (where applicable)
 * - Useful for automatically scoring all matchUps in connected draw structures
 * - Useful for visualizing the progression of drawPositions through rounds
 *
 * @param {object} a - matchUp object
 * @param {object} b - matchUp object
 *
 */
export function matchUpSort(a: MatchUpSortKeys, b: MatchUpSortKeys): number {
  return (
    stageDifference(a, b) ||
    (a?.stageSequence || 0) - (b?.stageSequence || 0) ||
    (a?.roundNumber && b?.roundNumber && a.roundNumber - b.roundNumber) ||
    (a?.roundPosition ?? 0) - (b?.roundPosition ?? 0)
  );
}

function stageDifference(a, b) {
  return (stageOrder[a?.stage] || 0) - (stageOrder[b?.stage] || 0);
}
