/**
 * getScoreboard - Get formatted scoreboard display
 *
 * Pure function that formats score for display
 */

import type { MatchUp, GetScoreboardOptions, SetScore, FormatStructure } from '@Types/scoring/types';
import { isLiveDecidingSet, isStandardSetTiebreak } from '@Tools/scoring/scoringUtilities';
import { openSetNumber } from '@Helpers/matchUpFormatCode/aggregateDecider';
import { parse } from '@Helpers/matchUpFormatCode/parse';

// constants
import { IN_PROGRESS } from '@Constants/matchUpStatusConstants';

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
  const currentSet = sets.at(-1);
  const inPlay = matchUp.matchUpStatus === IN_PROGRESS && !!currentSet && !isClosed(currentSet);
  // a level timed segment playing its declared tiebreak at time: the tiebreak is the game in play
  const tiebreakAtTime =
    inPlay && currentSet.side1TiebreakScore !== undefined && currentSet.side2TiebreakScore !== undefined;

  // Format each set
  const setStrings = sets.map((set) => {
    let s1 = set.side1Score || 0;
    let s2 = set.side2Score || 0;

    // Apply perspective (swap sides if needed)
    if (perspective === 1) {
      [s1, s2] = [s2, s1];
    }

    // Check if tiebreak was played
    const tiebreakPlayed = set.side1TiebreakScore !== undefined || set.side2TiebreakScore !== undefined;
    if (tiebreakPlayed && !(tiebreakAtTime && set === currentSet)) {
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

  if (!inPlay) return setStrings.join(', ');

  // The game in play, read by the format governing the set in play (spec § 3.2, § 11.3; CA 2026-10-18)
  let p1: number;
  let p2: number;
  if (tiebreakAtTime) {
    p1 = currentSet.side1TiebreakScore!;
    p2 = currentSet.side2TiebreakScore!;
  } else {
    const gameIndex = (currentSet.side1GameScores ?? []).length - 1;
    if (gameIndex < 0) return setStrings.join(', ');
    p1 = currentSet.side1GameScores![gameIndex] || 0;
    p2 = (currentSet.side2GameScores ?? [])[gameIndex] || 0;
  }

  // Don't show game score if it's 0-0 at start of new game
  if (p1 === 0 && p2 === 0) {
    return setStrings.join(', ');
  }

  // Apply perspective
  if (perspective === 1) {
    [p1, p2] = [p2, p1];
  }

  const formatStructure = matchUp.matchUpFormat ? parse(matchUp.matchUpFormat) : undefined;
  const setFormat = formatStructure ? liveSetFormat(matchUp, formatStructure) : undefined;
  // numeric points: a tiebreak-only set (a match tiebreak included), a standard set's tiebreak, the
  // tiebreak at time, and a consecutive-points game; tennis points otherwise
  const isTiebreak =
    tiebreakAtTime ||
    !!setFormat?.tiebreakSet ||
    (!setFormat?.timed && isStandardSetTiebreak(setFormat, currentSet.side1Score || 0, currentSet.side2Score || 0));
  const isConsecutive = formatStructure?.gameFormat?.type === 'CONSECUTIVE';

  const prefix = setStrings.join(', ');
  if (isTiebreak || isConsecutive) {
    // Tiebreak or consecutive: show numeric score
    return `${prefix} (${p1}-${p2})`;
  }
  // Regular game: convert to tennis score
  return `${prefix} (${formatTennisScore(p1, p2)})`;
}

/** The format governing the set in play (spec § 3.2): the final-set format in the deciding set. */
function liveSetFormat(matchUp: MatchUp, formatStructure: FormatStructure) {
  const setsWon: [number, number] = [0, 0];
  for (const set of matchUp.score.sets) {
    if (set.winningSide === 1) setsWon[0]++;
    if (set.winningSide === 2) setsWon[1]++;
  }
  const isDecidingSet = isLiveDecidingSet(formatStructure, setsWon, openSetNumber(matchUp.score.sets));
  return isDecidingSet && formatStructure.finalSetFormat ? formatStructure.finalSetFormat : formatStructure.setFormat;
}

/** A set that is over: won, or a timed segment closed with or without a winner. */
function isClosed(set: SetScore): boolean {
  return set.winningSide !== undefined || !!(set as SetScore & { segmentComplete?: boolean }).segmentComplete;
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
