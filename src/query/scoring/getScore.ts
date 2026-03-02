/**
 * getScore - Get current score from matchUp
 *
 * Pure function that extracts score information including
 * display-formatted point values and point situation booleans.
 */

import type { MatchUp, ScoreResult, PointSituation, FormatStructure, SetFormatStructure } from '@Types/scoring/types';
import { resolveSetType } from '@Tools/scoring/scoringUtilities';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { calculatePointsTo } from '@Mutate/scoring/pointsToCalculator';
import { deriveServer, formatGameScore } from '@Mutate/scoring/addPoint';

export interface GetScoreOptions {
  useBracketNotation?: boolean; // Use [10-8] format for match tiebreaks
}

/**
 * Get the current score
 *
 * @param matchUp - Current matchUp state
 * @param options - Score formatting options
 * @returns Score information with pointDisplay and situation
 */
export function getScore(matchUp: MatchUp, options?: GetScoreOptions): ScoreResult {
  const sets = matchUp.score.sets;

  // Build score string
  const scoreString = buildScoreString(matchUp, options?.useBracketNotation);

  // Get current games (last incomplete set only; completed sets return 0-0)
  const currentSet = sets.length > 0 ? sets.at(-1) : null;
  const games =
    currentSet && currentSet.winningSide === undefined
      ? [currentSet.side1Score || 0, currentSet.side2Score || 0]
      : [0, 0];

  // Get current points (last game in current set)
  let points: number[] = [0, 0];
  if (currentSet?.side1GameScores && currentSet.side2GameScores) {
    const gameIndex = Math.max(currentSet.side1GameScores.length, currentSet.side2GameScores.length) - 1;

    if (gameIndex >= 0) {
      points = [currentSet.side1GameScores[gameIndex] || 0, currentSet.side2GameScores[gameIndex] || 0];
    }
  }

  // Compute pointDisplay and situation
  const pointDisplay = computePointDisplay(matchUp, points);
  const situation = computeSituation(matchUp);

  return {
    sets,
    scoreString,
    games,
    points,
    pointDisplay,
    situation,
  };
}

/**
 * Compute display-formatted point values (e.g., ['40', 'AD'])
 */
function computePointDisplay(matchUp: MatchUp, points: number[]): [string, string] | undefined {
  // Only compute if match is in progress and not completed
  if (matchUp.matchUpStatus === 'COMPLETED' || matchUp.matchUpStatus === 'TO_BE_PLAYED') {
    return undefined;
  }

  const formatStructure = parse(matchUp.matchUpFormat);
  if (!formatStructure) return undefined;

  const currentSet = matchUp.score.sets.at(-1);
  if (!currentSet || currentSet.winningSide !== undefined) return undefined;

  // Determine set type context
  const setsWon: [number, number] = [0, 0];
  matchUp.score.sets.forEach((set) => {
    if (set.winningSide === 1) setsWon[0]++;
    if (set.winningSide === 2) setsWon[1]++;
  });
  const setType = resolveSetType(formatStructure, setsWon);

  // Detect tiebreak or consecutive
  const isTiebreakOnly = setType === 'tiebreakOnly' || setType === 'matchTiebreak';
  const isConsecutive = formatStructure.gameFormat?.type === 'CONSECUTIVE';

  let isTiebreak = isTiebreakOnly;
  if (!isTiebreak && setType === 'standard') {
    const bestOf = formatStructure.exactly || formatStructure.bestOf || 3;
    const setsToWin = Math.ceil(bestOf / 2);
    const isDecidingSet = setsWon[0] === setsToWin - 1 && setsWon[1] === setsToWin - 1;
    const activeSetFormat: SetFormatStructure | undefined =
      isDecidingSet && formatStructure.finalSetFormat ? formatStructure.finalSetFormat : formatStructure.setFormat;

    if (activeSetFormat) {
      const s1Games = currentSet.side1Score || 0;
      const s2Games = currentSet.side2Score || 0;
      const setTo = activeSetFormat.setTo || 6;
      const tiebreakAt =
        (typeof activeSetFormat.tiebreakAt === 'number' ? activeSetFormat.tiebreakAt : undefined) ?? setTo;
      const noTiebreak = activeSetFormat.noTiebreak || false;
      const finalSetNoTiebreak = isDecidingSet && formatStructure.finalSetFormat?.noTiebreak;
      isTiebreak = !noTiebreak && !finalSetNoTiebreak && s1Games === tiebreakAt && s2Games === tiebreakAt;
    }
  }

  const scoreStr = formatGameScore(points[0], points[1], isTiebreak, isConsecutive && !isTiebreak);
  const parts = scoreStr.split('-');
  if (parts.length === 2) {
    return [parts[0], parts[1]] as [string, string];
  }
  return [String(points[0]), String(points[1])];
}

/**
 * Compute point situation booleans for the NEXT point
 */
function computeSituation(matchUp: MatchUp): PointSituation | undefined {
  // Only compute if match is in progress
  if (matchUp.matchUpStatus === 'COMPLETED' || matchUp.matchUpStatus === 'TO_BE_PLAYED') {
    return undefined;
  }

  const formatStructure: FormatStructure | undefined = parse(matchUp.matchUpFormat);
  if (!formatStructure) return undefined;

  const bestOf = formatStructure.exactly || formatStructure.bestOf || 3;
  const setsToWin = Math.ceil(bestOf / 2);

  // Calculate sets won
  const setsWon: [number, number] = [0, 0];
  matchUp.score.sets.forEach((set) => {
    if (set.winningSide === 1) setsWon[0]++;
    if (set.winningSide === 2) setsWon[1]++;
  });

  const setType = resolveSetType(formatStructure, setsWon);

  // Determine active set format
  const isDecidingSet = setsWon[0] === setsToWin - 1 && setsWon[1] === setsToWin - 1;
  const activeSetFormat: SetFormatStructure | undefined =
    isDecidingSet && formatStructure.finalSetFormat ? formatStructure.finalSetFormat : formatStructure.setFormat;

  // Derive server for the next point
  const isRallyScoring = !!(
    activeSetFormat?.tiebreakSet?.modifier === 'RALLY' || activeSetFormat?.modifier === 'RALLY'
  );
  let server: 0 | 1 | undefined;
  if (!isRallyScoring) {
    server = deriveServer(matchUp, formatStructure, setType);
  }

  // Call calculatePointsTo for the current state (before next point)
  const pointsToInfo = calculatePointsTo(matchUp, formatStructure, setType, activeSetFormat, server);
  if (!pointsToInfo) {
    // Timed sets — can't compute
    return {
      isBreakPoint: false,
      isGamePoint: false,
      isSetPoint: false,
      isMatchPoint: false,
      isGoldenPoint: false,
      isTiebreak: false,
      server,
    };
  }

  const { pointsToGame, pointsToSet, pointsToMatch, isBreakpoint } = pointsToInfo;

  // Detect tiebreak state
  let isTiebreak = setType === 'tiebreakOnly' || setType === 'matchTiebreak';
  if (!isTiebreak && setType === 'standard' && activeSetFormat) {
    const currentSet = matchUp.score.sets.at(-1);
    if (currentSet) {
      const s1Games = currentSet.side1Score || 0;
      const s2Games = currentSet.side2Score || 0;
      const setTo = activeSetFormat.setTo || 6;
      const tiebreakAt =
        (typeof activeSetFormat.tiebreakAt === 'number' ? activeSetFormat.tiebreakAt : undefined) ?? setTo;
      const noTiebreak = activeSetFormat.noTiebreak || false;
      const finalSetNoTiebreak = isDecidingSet && formatStructure.finalSetFormat?.noTiebreak;
      isTiebreak = !noTiebreak && !finalSetNoTiebreak && s1Games === tiebreakAt && s2Games === tiebreakAt;
    }
  }

  // Detect NoAD mode
  const isNoAD = !!(
    activeSetFormat?.NoAD ||
    activeSetFormat?.gameFormat?.NoAD ||
    (isTiebreak &&
      !!(
        activeSetFormat?.tiebreakFormat?.NoAD ||
        activeSetFormat?.tiebreakSet?.NoAD ||
        formatStructure.finalSetFormat?.tiebreakSet?.NoAD
      ))
  );

  // isGoldenPoint: both sides need exactly 1 point to win the game
  // Triggers for NoAD (every deuce) or deuceAfter (at the Nth deuce)
  const deuceAfter = formatStructure.gameFormat?.deuceAfter;
  const isGoldenPoint =
    pointsToGame[0] === 1 && pointsToGame[1] === 1 && (isNoAD || (!!deuceAfter && !isTiebreak));

  // isGamePoint: server is 1 point from winning the game
  const isGamePoint = server === undefined ? false : pointsToGame[server] === 1;

  // isSetPoint: either side is 1 point from winning the set
  const isSetPoint = Math.min(pointsToSet[0], pointsToSet[1]) === 1;

  // isMatchPoint: either side is 1 point from winning the match
  const isMatchPoint = Math.min(pointsToMatch[0], pointsToMatch[1]) === 1;

  return {
    isBreakPoint: isBreakpoint,
    isGamePoint,
    isSetPoint,
    isMatchPoint,
    isGoldenPoint,
    isTiebreak,
    server,
  };
}

/**
 * Build score string (e.g., "6-4, 4-6, 6-3")
 *
 * @param matchUp - The matchUp to get score from
 * @param useBracketNotation - Use [10-8] format for match tiebreaks (default: false)
 */
function buildScoreString(matchUp: MatchUp, useBracketNotation: boolean = false): string {
  const sets = matchUp.score.sets;

  if (sets.length === 0) {
    return '0-0';
  }

  const setStrings = sets.map((set) => {
    const s1 = set.side1Score || 0;
    const s2 = set.side2Score || 0;

    // Check if tiebreak was played
    if (set.side1TiebreakScore !== undefined || set.side2TiebreakScore !== undefined) {
      const tb1 = set.side1TiebreakScore || 0;
      const tb2 = set.side2TiebreakScore || 0;

      // Check if this is a match tiebreak (setTo = tiebreak max score)
      const isMatchTiebreak = (s1 === 0 && s2 === 1) || (s1 === 1 && s2 === 0);

      if (useBracketNotation && isMatchTiebreak) {
        // Use [10-8] notation for match tiebreaks
        return `[${tb1}-${tb2}]`;
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

  return setStrings.join(', ');
}
