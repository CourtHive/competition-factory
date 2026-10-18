/**
 * When a game is won. addPoint completes games with these, and pointsToCalculator counts the points to them,
 * so the "points to game" decoration and the point that completes the game cannot disagree.
 */
import type { FormatStructure, SetFormatStructure } from '@Types/scoring/types';
import { tiebreakMargin } from '@Tools/scoring/scoringUtilities';

/**
 * Check if a tiebreak game is won
 */
export function checkTiebreakWon(
  side1Points: number,
  side2Points: number,
  tiebreakTo: number,
  isNoAD: boolean = false,
): number | undefined {
  const diff = Math.abs(side1Points - side2Points);
  const minWin = tiebreakMargin(tiebreakTo, isNoAD);

  if ((side1Points >= tiebreakTo || side2Points >= tiebreakTo) && diff >= minWin) {
    return side1Points > side2Points ? 0 : 1;
  }
  return undefined;
}

/**
 * Check if a standard game is won (regular game or tiebreak within a standard set)
 */
export function checkStandardGameWon(
  side1Points: number,
  side2Points: number,
  setFormat: SetFormatStructure,
  isTiebreak: boolean,
  formatStructure?: FormatStructure,
): number | undefined {
  const isNoAd = setFormat.gameFormat?.NoAD || setFormat.NoAD || false;

  if (isTiebreak) {
    const tiebreakTo = setFormat.tiebreakFormat?.tiebreakTo || 7;
    const tiebreakNoAD = setFormat.tiebreakFormat?.NoAD || false;
    return checkTiebreakWon(side1Points, side2Points, tiebreakTo, tiebreakNoAD);
  }

  const pointsTo = 4;
  const diff = Math.abs(side1Points - side2Points);

  // No-AD scoring (golden point at deuce)
  if (isNoAd) {
    if (side1Points >= pointsTo || side2Points >= pointsTo) {
      return side1Points > side2Points ? 0 : 1;
    }
    return undefined;
  }

  // deuceAfter: after N deuces, the next point decides (golden point)
  // Deuce #1 is at 3-3, deuce #N is at (2+N)-(2+N)
  const deuceAfter = formatStructure?.gameFormat?.deuceAfter;
  if (deuceAfter && side1Points >= 2 + deuceAfter && side2Points >= 2 + deuceAfter) {
    // Past the deuce cap — next point wins (like NoAD)
    if (side1Points !== side2Points) {
      return side1Points > side2Points ? 0 : 1;
    }
    return undefined;
  }

  // Regular tennis scoring (deuce/advantage)
  if ((side1Points >= pointsTo || side2Points >= pointsTo) && diff >= 2) {
    return side1Points > side2Points ? 0 : 1;
  }

  return undefined;
}
