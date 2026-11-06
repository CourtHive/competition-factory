import { isLevelScore } from '@Scoring/analysis/levelScore';
import { parseTallyFormat } from './parseTallyFormat';

// constants and types
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import type { MatchUp } from '@Types/tournamentTypes';

/**
 * Only a complete tie permitted by the scoring contract is a drawn result: a level combined total, or a level finish
 * of a format that can end level (scoring spec § 9.7), with no winner named.
 */
export function isDrawnResult(matchUp: MatchUp, fallbackFormat?: string): boolean {
  return (
    matchUp.matchUpStatus === COMPLETED &&
    matchUp.winningSide === undefined &&
    isLevelScore(matchUp.score, matchUp.matchUpFormat ?? fallbackFormat)
  );
}

export function isCombinedPointFormat(format?: string): boolean {
  return !!parseTallyFormat(format ?? '')?.setFormat?.combinedPointTotal;
}
