import { generateTieMatchUpScore } from './generateTieMatchUpScore';
import { isDoubleExit } from '@Validators/isExit';
import type { MatchUpStatusUnion, Score } from '@Types/tournamentTypes';

/** An explicit double exit withdraws both teams and keeps the score allowed by the requested status. */
export function projectTeamOutcome(
  args: Parameters<typeof generateTieMatchUpScore>[0],
  request: { matchUpStatus?: MatchUpStatusUnion; score?: Score },
) {
  if (isDoubleExit(request.matchUpStatus)) return { projectedWinningSide: undefined, score: request.score };
  const { winningSide, scoreStringSide1, scoreStringSide2, set } = generateTieMatchUpScore(args);
  return { projectedWinningSide: winningSide, score: { scoreStringSide1, scoreStringSide2, sets: set ? [set] : [] } };
}
