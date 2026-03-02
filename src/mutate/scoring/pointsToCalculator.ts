/**
 * pointsToCalculator - Calculate minimum points/games to completion at each level
 *
 * For each point, the engine can decorate with:
 * - pointsToGame: min points each side needs to win current game
 * - gamesToSet: games each side needs to win current set
 * - pointsToSet: min points each side needs to win current set
 * - pointsToMatch: min points each side needs to win match
 * - isBreakpoint: receiver is one point from winning game
 *
 * Values represent the MINIMUM points assuming the side wins every subsequent point.
 * Calculated BEFORE the point is processed (state at time of serve).
 */

import type { MatchUp, FormatStructure, SetFormatStructure, SetScore } from '@Types/scoring/types';
import type { SetType } from '@Tools/scoring/scoringUtilities';

export interface PointsToDecoration {
  pointsToGame: [number, number];
  pointsToSet: [number, number];
  pointsToMatch: [number, number];
  gamesToSet: [number, number];
  isBreakpoint: boolean;
}

/**
 * Calculate pointsTo decorations for the current match state
 *
 * @param matchUp - Current matchUp state (BEFORE point is added)
 * @param formatStructure - Parsed format structure
 * @param setType - Current set type
 * @param activeSetFormat - Active set format (may differ for deciding set)
 * @param server - Current server (0 or 1), undefined if unknown
 * @returns Decoration object, or undefined if not calculable (timed sets)
 */
export function calculatePointsTo(
  matchUp: MatchUp,
  formatStructure: FormatStructure,
  setType: SetType,
  activeSetFormat: SetFormatStructure | undefined,
  server: 0 | 1 | undefined,
): PointsToDecoration | undefined {
  // Timed sets without point structure can't calculate
  if (setType === 'timed') return undefined;
  if (!activeSetFormat) return undefined;

  const currentSet = getCurrentSet(matchUp);
  const setsWon = getSetsWon(matchUp);
  const bestOf = formatStructure.exactly || formatStructure.bestOf || 3;
  const setsToWin = Math.ceil(bestOf / 2);

  // Get current game point scores
  const { side1Points, side2Points } = getCurrentGamePoints(currentSet);

  // Calculate pointsToGame
  const pointsToGame = calcPointsToGame(
    side1Points,
    side2Points,
    activeSetFormat,
    setType,
    formatStructure,
    currentSet,
  );

  // Calculate gamesToSet
  const gamesToSet = calcGamesToSet(currentSet, activeSetFormat, setType);

  // Calculate pointsToSet
  const pointsToSet = calcPointsToSet(pointsToGame, gamesToSet, activeSetFormat, setType);

  // Calculate pointsToMatch
  const pointsToMatch = calcPointsToMatch(pointsToSet, setsWon, setsToWin, formatStructure);

  // Breakpoint detection
  const isBreakpoint = detectBreakpoint(pointsToGame, server);

  return {
    pointsToGame,
    pointsToSet,
    pointsToMatch,
    gamesToSet,
    isBreakpoint,
  };
}

// ============================================================================
// Internal helpers
// ============================================================================

function getCurrentSet(matchUp: MatchUp): SetScore | undefined {
  const sets = matchUp.score.sets;
  if (sets.length === 0) return undefined;
  const last = sets.at(-1);
  return last?.winningSide === undefined ? last : undefined;
}

function getSetsWon(matchUp: MatchUp): [number, number] {
  const setsWon: [number, number] = [0, 0];
  matchUp.score.sets.forEach((set) => {
    if (set.winningSide === 1) setsWon[0]++;
    if (set.winningSide === 2) setsWon[1]++;
  });
  return setsWon;
}

function getCurrentGamePoints(currentSet: SetScore | undefined): { side1Points: number; side2Points: number } {
  if (!currentSet) return { side1Points: 0, side2Points: 0 };

  const gs1 = currentSet.side1GameScores || [];
  const gs2 = currentSet.side2GameScores || [];

  if (gs1.length === 0 && gs2.length === 0) {
    return { side1Points: 0, side2Points: 0 };
  }

  const gameIdx = Math.max(gs1.length, gs2.length) - 1;
  return {
    side1Points: gs1[gameIdx] ?? 0,
    side2Points: gs2[gameIdx] ?? 0,
  };
}

/**
 * Calculate minimum points each side needs to win the current game
 */
function calcPointsToGame(
  side1Points: number,
  side2Points: number,
  activeSetFormat: SetFormatStructure,
  setType: SetType,
  formatStructure: FormatStructure,
  currentSet: SetScore | undefined,
): [number, number] {
  // Tiebreak-only sets or match tiebreaks: entire set is one game
  if (setType === 'tiebreakOnly') {
    const tbTo = activeSetFormat.tiebreakSet?.tiebreakTo || 11;
    const isNoAD = activeSetFormat.tiebreakSet?.NoAD || false;
    return calcTiebreakPointsTo(side1Points, side2Points, tbTo, isNoAD);
  }

  if (setType === 'matchTiebreak') {
    const tbTo = formatStructure.finalSetFormat?.tiebreakSet?.tiebreakTo || 10;
    const isNoAD = formatStructure.finalSetFormat?.tiebreakSet?.NoAD || false;
    return calcTiebreakPointsTo(side1Points, side2Points, tbTo, isNoAD);
  }

  // Standard set: detect if currently in tiebreak
  if (currentSet) {
    const s1Games = currentSet.side1Score || 0;
    const s2Games = currentSet.side2Score || 0;
    const setTo = activeSetFormat.setTo || 6;
    const tiebreakAt =
      (typeof activeSetFormat.tiebreakAt === 'number' ? activeSetFormat.tiebreakAt : undefined) ?? setTo;
    const noTiebreak = activeSetFormat.noTiebreak || false;

    if (!noTiebreak && s1Games === tiebreakAt && s2Games === tiebreakAt) {
      // We're in a tiebreak within a standard set
      const tbTo = activeSetFormat.tiebreakFormat?.tiebreakTo || 7;
      const isNoAD = activeSetFormat.tiebreakFormat?.NoAD || false;
      return calcTiebreakPointsTo(side1Points, side2Points, tbTo, isNoAD);
    }
  }

  // Consecutive game format: return count as minimum-to-win
  if (formatStructure.gameFormat?.type === 'CONSECUTIVE') {
    const count = formatStructure.gameFormat.count || 3;
    return [count, count];
  }

  // Regular game within standard set
  return calcStandardGamePointsTo(side1Points, side2Points, activeSetFormat, formatStructure);
}

/**
 * Standard game: 4 points, win by 2 (or NoAD: win by 1 at deuce)
 */
function calcStandardGamePointsTo(
  p1: number,
  p2: number,
  setFormat: SetFormatStructure,
  formatStructure?: FormatStructure,
): [number, number] {
  const isNoAD = setFormat.gameFormat?.NoAD || setFormat.NoAD || false;
  const deuceAfter = formatStructure?.gameFormat?.deuceAfter;
  const pointsTo = 4;

  return [
    calcSidePointsToGame(p1, p2, pointsTo, isNoAD, deuceAfter),
    calcSidePointsToGame(p2, p1, pointsTo, isNoAD, deuceAfter),
  ];
}

function calcSidePointsToGame(
  myPoints: number,
  oppPoints: number,
  pointsTo: number,
  isNoAD: boolean,
  deuceAfter?: number,
): number {
  if (myPoints >= pointsTo - 1 && oppPoints >= pointsTo - 1) {
    // Deuce/advantage territory
    if (isNoAD) {
      // Golden point: whoever wins next point wins game
      if (myPoints > oppPoints) return 0;
      if (myPoints === oppPoints) return 1;
      return 2;
    }

    // deuceAfter: once both sides reach (2 + deuceAfter), it's golden point
    if (deuceAfter && myPoints >= 2 + deuceAfter && oppPoints >= 2 + deuceAfter) {
      if (myPoints > oppPoints) return 0;
      if (myPoints === oppPoints) return 1;
      return 2;
    }

    // Standard deuce: need 2-point lead
    const diff = myPoints - oppPoints;
    if (diff >= 2) return 0; // Already won
    if (diff === 1) return 1; // At advantage
    if (diff === 0) return 2; // At deuce
    return 2; // Behind: need to equalize + win 2
  }

  if (myPoints >= pointsTo) return 0; // Already won
  return pointsTo - myPoints;
}

/**
 * Tiebreak: play to tiebreakTo, win by 2 (or NoAD: win by 1)
 */
function calcTiebreakPointsTo(p1: number, p2: number, tiebreakTo: number, isNoAD: boolean): [number, number] {
  return [calcSideTiebreakPointsTo(p1, p2, tiebreakTo, isNoAD), calcSideTiebreakPointsTo(p2, p1, tiebreakTo, isNoAD)];
}

function calcSideTiebreakPointsTo(myPoints: number, oppPoints: number, tiebreakTo: number, isNoAD: boolean): number {
  if (myPoints >= tiebreakTo && (myPoints - oppPoints >= 2 || (isNoAD && myPoints > oppPoints))) {
    return 0; // Already won
  }
  if (myPoints >= tiebreakTo - 1 && oppPoints >= tiebreakTo - 1) {
    // Extended play territory
    if (isNoAD) {
      if (myPoints > oppPoints) return 0;
      if (myPoints === oppPoints) return 1;
      return 2;
    }
    const diff = myPoints - oppPoints;
    if (diff >= 2) return 0;
    if (diff === 1) return 1;
    if (diff === 0) return 2;
    return 2;
  }
  if (myPoints >= tiebreakTo) return 0;
  return tiebreakTo - myPoints;
}

/**
 * Calculate games each side needs to win the current set
 */
function calcGamesToSet(
  currentSet: SetScore | undefined,
  activeSetFormat: SetFormatStructure,
  setType: SetType,
): [number, number] {
  // Tiebreak-only / match tiebreak: 1 game = 1 set, always 1 game needed at start
  if (setType === 'tiebreakOnly' || setType === 'matchTiebreak') {
    // If set is in progress (no winner yet), need 1 game
    if (!currentSet || currentSet.winningSide !== undefined) return [1, 1];
    return [1, 1]; // The "game" is the entire tiebreak
  }

  // Standard set
  const s1 = currentSet?.side1Score || 0;
  const s2 = currentSet?.side2Score || 0;
  const setTo = activeSetFormat.setTo || 6;
  const tiebreakAt = (typeof activeSetFormat.tiebreakAt === 'number' ? activeSetFormat.tiebreakAt : undefined) ?? setTo;
  const noTiebreak = activeSetFormat.noTiebreak || false;
  const winBy = activeSetFormat.winBy || 2;

  return [
    calcSideGamesToSet(s1, s2, setTo, tiebreakAt, noTiebreak, winBy),
    calcSideGamesToSet(s2, s1, setTo, tiebreakAt, noTiebreak, winBy),
  ];
}

function calcSideGamesToSet(
  myGames: number,
  oppGames: number,
  setTo: number,
  tiebreakAt: number,
  noTiebreak: boolean,
  winBy: number,
): number {
  // At tiebreak threshold: need 1 more game (the tiebreak)
  if (!noTiebreak && myGames === tiebreakAt && oppGames === tiebreakAt) {
    return 1;
  }

  // Already at or above setTo
  if (myGames >= setTo) {
    const diff = myGames - oppGames;
    if (diff >= winBy) return 0; // Already won
    // Need to build margin (no tiebreak or advantage set)
    return winBy - diff;
  }

  // Simple case: games needed to reach setTo
  const needed = setTo - myGames;

  // If opponent is close enough that we'll need a tiebreak/margin
  if (oppGames >= setTo - 1 && myGames >= setTo - 1) {
    // Both close to setTo — may need tiebreak
    if (!noTiebreak) {
      // Tiebreak available: at worst need to reach tiebreakAt + win tiebreak
      return Math.max(1, setTo - myGames);
    }
    // No tiebreak: need winBy margin
    const diff = myGames - oppGames;
    if (diff >= winBy) return 0;
    return winBy - diff;
  }

  return needed;
}

/**
 * Calculate minimum points each side needs to win the current set
 */
function calcPointsToSet(
  pointsToGame: [number, number],
  gamesToSet: [number, number],
  _activeSetFormat: SetFormatStructure,
  setType: SetType,
): [number, number] {
  // For tiebreak-only / match tiebreak, pointsToSet = pointsToGame
  if (setType === 'tiebreakOnly' || setType === 'matchTiebreak') {
    return [...pointsToGame] as [number, number];
  }

  // Standard set: pointsToGame + (remaining games × min points per game)
  const minPointsPerGame = 4; // Minimum for standard game (love game)

  return [
    calcSidePointsToSet(pointsToGame[0], gamesToSet[0], minPointsPerGame),
    calcSidePointsToSet(pointsToGame[1], gamesToSet[1], minPointsPerGame),
  ];
}

function calcSidePointsToSet(pointsToCurrentGame: number, gamesNeeded: number, minPointsPerGame: number): number {
  if (gamesNeeded <= 0) return 0;

  // Points for current game + remaining games at minimum
  const remainingGames = Math.max(0, gamesNeeded - 1);
  return pointsToCurrentGame + remainingGames * minPointsPerGame;
}

/**
 * Calculate minimum points each side needs to win the match
 */
function calcPointsToMatch(
  pointsToSet: [number, number],
  setsWon: [number, number],
  setsToWin: number,
  formatStructure: FormatStructure,
): [number, number] {
  // Calculate minimum points per set for remaining sets
  const sf = formatStructure.setFormat;
  const minPointsPerSet = getMinPointsPerSet(sf, formatStructure);

  return [
    calcSidePointsToMatch(pointsToSet[0], setsWon[0], setsToWin, minPointsPerSet),
    calcSidePointsToMatch(pointsToSet[1], setsWon[1], setsToWin, minPointsPerSet),
  ];
}

function getMinPointsPerSet(sf: SetFormatStructure | undefined, formatStructure: FormatStructure): number {
  if (!sf) return 24; // Default: 6 games × 4 points

  if (sf.tiebreakSet) {
    return sf.tiebreakSet.tiebreakTo || 11;
  }

  if (sf.timed) return 0; // Can't calculate

  const setTo = sf.setTo || 6;
  const gameType = formatStructure.gameFormat?.type;
  const minPointsPerGame = gameType === 'CONSECUTIVE' ? formatStructure.gameFormat?.count || 3 : 4;

  return setTo * minPointsPerGame;
}

function calcSidePointsToMatch(
  pointsToCurrentSet: number,
  setsWonBySide: number,
  setsToWin: number,
  minPointsPerSet: number,
): number {
  if (setsWonBySide >= setsToWin) return 0; // Already won

  const remainingSets = Math.max(0, setsToWin - setsWonBySide - 1);
  return pointsToCurrentSet + remainingSets * minPointsPerSet;
}

/**
 * Detect breakpoint: receiver is 1 point from winning the game
 */
function detectBreakpoint(pointsToGame: [number, number], server: 0 | 1 | undefined): boolean {
  if (server === undefined) return false;

  // In tiebreak-only sets, there's no "break" concept in the traditional sense
  // But we can still detect if the receiver is 1 point from winning the tiebreak
  const receiverIndex = 1 - server;
  return pointsToGame[receiverIndex] === 1;
}

/**
 * Overloaded calculator for standard set tiebreak context
 *
 * Called when we know we're in a tiebreak within a standard set
 * (used by addPoint to provide accurate pointsToGame during tiebreaks)
 */
export function calcPointsToGameInTiebreak(p1: number, p2: number, setFormat: SetFormatStructure): [number, number] {
  const tbTo = setFormat.tiebreakFormat?.tiebreakTo || 7;
  const isNoAD = setFormat.tiebreakFormat?.NoAD || false;
  return calcTiebreakPointsTo(p1, p2, tbTo, isNoAD);
}
