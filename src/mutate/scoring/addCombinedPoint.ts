import { analyzeCombinedPointSet } from '@Helpers/matchUpFormatCode/combinedPointFormat';
import { nowIso } from '@Tools/clock';

// constants and types
import type { RotatingPartnerScoreContract } from '@Types/rotatingPartnerScoring';
import type { AddPointOptions, MatchUp, Point } from '@Types/scoring/types';
import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';

/** One rally is one point. Server rotation is supplied by the caller, not inferred from tennis games. */
export function addCombinedPoint(
  matchUp: MatchUp,
  options: AddPointOptions,
  winner: 0 | 1,
  server: 0 | 1 | undefined,
  contract: RotatingPartnerScoreContract,
): MatchUp {
  if (![0, 1].includes(winner) || (options.scoreValue !== undefined && options.scoreValue !== 1)) return matchUp;
  const existing = matchUp.score.sets[0] ?? { setNumber: 1, side1Score: 0, side2Score: 0 };
  const before = analyzeCombinedPointSet(existing, contract);
  if (!before.valid || before.complete || matchUp.score.sets.length > 1) return matchUp;
  const set = { ...existing };
  set.side1Score = (set.side1Score ?? 0) + (winner === 0 ? 1 : 0);
  set.side2Score = (set.side2Score ?? 0) + (winner === 1 ? 1 : 0);
  const analysis = analyzeCombinedPointSet(set, contract);
  if (!analysis.valid) return matchUp;
  set.winningSide = analysis.winningSide;
  const point: Point = {
    ...options,
    pointNumber: (matchUp.history?.points.length ?? 0) + 1,
    winner,
    winningSide: (winner + 1) as 1 | 2,
    server,
    serverSideNumber: server === undefined ? undefined : ((server + 1) as 1 | 2),
    timestamp: options.timestamp ?? nowIso(),
    score: `${set.side1Score}-${set.side2Score}`,
  };
  matchUp.history ??= { points: [] };
  matchUp.history.points.push(point);
  matchUp.score.sets = [set];
  matchUp.winningSide = analysis.winningSide;
  matchUp.matchUpStatus = analysis.complete ? COMPLETED : IN_PROGRESS;
  return matchUp;
}
