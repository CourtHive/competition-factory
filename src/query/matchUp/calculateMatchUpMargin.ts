import { getScoreComponents } from './scoreComponents';

// constants
import { WALKOVER, DEFAULTED, DOUBLE_WALKOVER, DOUBLE_DEFAULT } from '@Constants/matchUpStatusConstants';
import { MISSING_MATCHUP, INVALID_VALUES, ErrorType } from '@Constants/errorConditionConstants';
import { MatchUp, Set as SetType } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

type CalculateMatchUpMarginArgs = {
  matchUp: MatchUp;
};

type CalculateMatchUpMarginResult = {
  margin?: number;
  setRatio?: number;
  gameRatio?: number;
  pointRatio?: number;
  setsWonByLoser?: number;
  setsWonByWinner?: number;
  gameDifferential?: number;
  success?: boolean;
  error?: ErrorType;
};

// MatchUp statuses where no meaningful margin can be calculated
const NO_MARGIN_STATUSES = new Set([WALKOVER, DEFAULTED, DOUBLE_WALKOVER, DOUBLE_DEFAULT]);

/**
 * Calculate the margin of defeat for a completed matchUp.
 *
 * Returns a unified `margin` value between 0 and 1 where:
 * - Values approaching 1 = most competitive (closest match)
 * - Values approaching 0 = most one-sided
 * - NaN = no meaningful score (walkover, default, etc.)
 *
 * The margin is derived from whichever score layer has the most data:
 * - `pointRatio` — from `side1PointScore`/`side2PointScore` (timed/points-based sets)
 * - `gameRatio`  — from `side1Score`/`side2Score` (standard game-based sets)
 * - `setRatio`   — from set win counts (fallback when neither games nor points are available)
 *
 * For lucky draw advancement, higher `margin` means the loser lost by the
 * narrowest margin and should be favored for advancement.
 */
export function calculateMatchUpMargin({ matchUp }: CalculateMatchUpMarginArgs): CalculateMatchUpMarginResult {
  if (!matchUp) return { error: MISSING_MATCHUP };

  const { winningSide, score, matchUpStatus } = matchUp;
  if (!winningSide || !score) return { error: INVALID_VALUES };

  // No meaningful margin for walkovers, defaults, etc.
  if (matchUpStatus && NO_MARGIN_STATUSES.has(matchUpStatus)) {
    return {
      ...SUCCESS,
      margin: Number.NaN,
      setRatio: Number.NaN,
      gameRatio: Number.NaN,
      pointRatio: Number.NaN,
      setsWonByLoser: 0,
      setsWonByWinner: 0,
      gameDifferential: 0,
    };
  }

  const sets: SetType[] = score.sets || [];
  const losingSide = winningSide === 1 ? 2 : 1;

  // --- Set ratio ---
  const setsWonByWinner = sets.filter((s) => s.winningSide === winningSide).length;
  const setsWonByLoser = sets.filter((s) => s.winningSide === losingSide).length;
  const totalSetsDecided = setsWonByWinner + setsWonByLoser;
  const setRatio = totalSetsDecided > 0 ? setsWonByLoser / totalSetsDecided : Number.NaN;

  // --- Point ratio (timed/points-based sets) ---
  let hasPoints = false;
  let winnerPoints = 0;
  let loserPoints = 0;
  for (const s of sets) {
    const wp = winningSide === 1 ? s.side1PointScore : s.side2PointScore;
    const lp = winningSide === 1 ? s.side2PointScore : s.side1PointScore;
    if (wp != null) {
      winnerPoints += Number(wp);
      hasPoints = true;
    }
    if (lp != null) {
      loserPoints += Number(lp);
      hasPoints = true;
    }
  }
  const totalPoints = winnerPoints + loserPoints;
  const pointRatio = hasPoints && totalPoints > 0 ? loserPoints / totalPoints : Number.NaN;

  // --- Game ratio (standard game-based sets) ---
  const { games } = getScoreComponents({ score });
  const winnerGames = games[winningSide - 1];
  const loserGames = games[losingSide - 1];
  const totalGames = winnerGames + loserGames;
  const gameRatio = totalGames > 0 ? loserGames / totalGames : Number.NaN;
  const gameDifferential = winnerGames - loserGames;

  // --- Unified margin: prefer the most granular available data ---
  // Points > Games > Sets
  let margin: number;
  if (Number.isFinite(pointRatio)) {
    margin = pointRatio;
  } else if (Number.isFinite(gameRatio)) {
    margin = gameRatio;
  } else {
    margin = setRatio;
  }

  return {
    ...SUCCESS,
    margin,
    setRatio,
    gameRatio,
    pointRatio,
    setsWonByLoser,
    setsWonByWinner,
    gameDifferential,
  };
}
