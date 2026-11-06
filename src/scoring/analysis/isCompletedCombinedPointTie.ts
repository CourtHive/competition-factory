import { analyzeCombinedPointSet } from '@Helpers/matchUpFormatCode/combinedPointFormat';
import { parse } from '@Helpers/matchUpFormatCode/parse';

// constants and types
import type { MatchUpStatusUnion, Score } from '@Types/tournamentTypes';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

/** Route only complete permitted shared ties through the winnerless completion writer. */
export function isCompletedCombinedPointTie(params: {
  score?: Score;
  winningSide?: number;
  matchUpStatus?: MatchUpStatusUnion;
  matchUpFormat?: string;
}): boolean {
  if (
    (params.matchUpStatus ?? COMPLETED) !== COMPLETED ||
    params.winningSide !== undefined ||
    params.score?.sets?.length !== 1
  )
    return false;
  const format = parse(params.matchUpFormat ?? '')?.setFormat;
  if (!format?.combinedPointTotal || format.tieResolution !== 'ALLOW') return false;
  const result = analyzeCombinedPointSet(params.score.sets[0], {
    combinedPointTotal: format.combinedPointTotal,
    tieResolution: 'ALLOW',
  });
  return !!(result.valid && result.complete && result.tied);
}
