/**
 * getScoreboard - Get formatted scoreboard display
 *
 * Pure function that formats score for display
 */

import type { MatchUp, GetScoreboardOptions } from '@Types/scoring/types';
import { parse } from '@Helpers/matchUpFormatCode/parse';

/**
 * Get formatted scoreboard
 *
 * @param matchUp - Current matchUp state
 * @param options - Display options (perspective)
 * @returns Formatted scoreboard string
 */
export function getScoreboard(matchUp: MatchUp, options?: GetScoreboardOptions): string {
  const sets = matchUp.score.sets;

  if (sets.length === 0) {
    return '0-0';
  }

  const perspective = options?.perspective;

  // Format each set
  const setStrings = sets.map((set) => {
    let s1 = set.side1Score || 0;
    let s2 = set.side2Score || 0;

    // Apply perspective (swap sides if needed)
    if (perspective === 1) {
      [s1, s2] = [s2, s1];
    }

    // Check if tiebreak was played
    if (set.side1TiebreakScore !== undefined || set.side2TiebreakScore !== undefined) {
      let tb1 = set.side1TiebreakScore || 0;
      let tb2 = set.side2TiebreakScore || 0;

      // Apply perspective to tiebreak scores
      if (perspective === 1) {
        [tb1, tb2] = [tb2, tb1];
      }

      // Show tiebreak score in parentheses for loser
      if (s1 > s2) {
        return `${s1}-${s2}(${tb2})`;
      } else {
        return `${s1}(${tb1})-${s2}`;
      }
    }

    return `${s1}-${s2}`;
  });

  // Get current game score if match in progress
  const currentSet = sets.at(-1);
  if (matchUp.matchUpStatus === 'IN_PROGRESS' && currentSet && !currentSet.winningSide) {
    const gameScores = currentSet.side1GameScores ?? [];
    const gameIndex = gameScores.length - 1;

    if (gameIndex >= 0 && gameScores.length > 0) {
      let p1 = gameScores[gameIndex] || 0;
      let p2 = (currentSet.side2GameScores ?? [])[gameIndex] || 0;

      // Don't show game score if it's 0-0 at start of new game
      if (p1 === 0 && p2 === 0) {
        return setStrings.join(', ');
      }

      // Apply perspective
      if (perspective === 1) {
        [p1, p2] = [p2, p1];
      }

      // Check if it's a tiebreak or consecutive format
      const s1 = currentSet.side1Score || 0;
      const s2 = currentSet.side2Score || 0;

      // Parse format to determine tiebreak threshold and game format
      const formatStructure = matchUp.matchUpFormat ? parse(matchUp.matchUpFormat) : undefined;
      const setTo = formatStructure?.setFormat?.setTo || 6;
      const tiebreakAt =
        (typeof formatStructure?.setFormat?.tiebreakAt === 'number'
          ? formatStructure.setFormat.tiebreakAt
          : undefined) ?? setTo;
      const isTiebreak = s1 === tiebreakAt && s2 === tiebreakAt;
      const isConsecutive = formatStructure?.gameFormat?.type === 'CONSECUTIVE';

      const lastSetString = setStrings.at(-1);
      const prefix = `${setStrings.slice(0, -1).join(', ')}${setStrings.length > 1 ? ', ' : ''}${lastSetString}`;

      if (isTiebreak || isConsecutive) {
        // Tiebreak or consecutive: show numeric score
        return `${prefix} (${p1}-${p2})`;
      } else {
        // Regular game: convert to tennis score
        const tennisScore = formatTennisScore(p1, p2);
        return `${prefix} (${tennisScore})`;
      }
    }
  }

  return setStrings.join(', ');
}

/**
 * Format tennis score (0, 15, 30, 40, A, G)
 */
function formatTennisScore(p1: number, p2: number): string {
  const points = ['0', '15', '30', '40'];

  // Both at 3 or under (includes deuce at 3-3 → '40-40')
  if (p1 <= 3 && p2 <= 3) {
    return `${points[p1]}-${points[p2]}`;
  }

  // Advantage or game point (both sides at 3+, at least one > 3)
  if (p1 >= 3 && p2 >= 3) {
    const diff = p1 - p2;
    if (diff === 0) return '40-40';
    if (diff === 1) return 'A-40';
    if (diff === -1) return '40-A';
    if (diff >= 2) return 'G-40';
    return '40-G';
  }

  // One side at 4+ vs other at 0-2 (p1=3 with p2<3 caught by first check)
  // Since min(p1) is 4 and max(p2) is 2, diff is always >= 2 → game won.
  if (p1 >= 3) {
    return 'G-40';
  }

  if (p2 >= 3) {
    return '40-G';
  }

  // DEAD CODE: all p1 < 3 && p2 < 3 cases are caught by the first check.
  return `${points[p1]}-${points[p2]}`;
}
