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
import { isAggregateFormat, isStandardSetTiebreak } from '@Tools/scoring/scoringUtilities';
import { finalSetGoverns } from '@Helpers/matchUpFormatCode/aggregateDecider';
import { checkStandardGameWon, checkTiebreakWon } from './gameWon';
import type { SetType } from '@Tools/scoring/scoringUtilities';
import { aggregateTotals } from './matchCompletion';

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

  // Calculate pointsToMatch, by the match's completion rule (§ 11.2)
  const pointsToMatch = calcPointsToMatch(pointsToSet, setsWon, setsToWin, formatStructure, matchUp);

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

  const gs1 = currentSet.side1GameScores ?? [];
  const gs2 = currentSet.side2GameScores ?? [];

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
  if (currentSet && isStandardSetTiebreak(activeSetFormat, currentSet.side1Score || 0, currentSet.side2Score || 0)) {
    const tbTo = activeSetFormat.tiebreakFormat?.tiebreakTo || 7;
    const isNoAD = activeSetFormat.tiebreakFormat?.NoAD || false;
    return calcTiebreakPointsTo(side1Points, side2Points, tbTo, isNoAD);
  }

  // Consecutive game format: the side on the run needs the rest of it, the other side a whole run (CA 2026-10-21)
  if (formatStructure.gameFormat?.type === 'CONSECUTIVE') {
    const count = formatStructure.gameFormat.count || 3;
    const streak = currentSet?.currentStreak;
    const rest = (side: 0 | 1) => (streak?.side === side ? count - streak.count : count);
    return [rest(0), rest(1)];
  }

  // Regular game within standard set
  return calcStandardGamePointsTo(side1Points, side2Points, activeSetFormat, formatStructure);
}

/**
 * Standard game: 4 points, win by 2 (NoAD and deuceAfter: the next point decides at deuce)
 */
function calcStandardGamePointsTo(
  p1: number,
  p2: number,
  setFormat: SetFormatStructure,
  formatStructure?: FormatStructure,
): [number, number] {
  return pointsUntilWon(p1, p2, (s1, s2) => checkStandardGameWon(s1, s2, setFormat, false, formatStructure));
}

/**
 * Tiebreak: play to tiebreakTo, win by 2 (or NoAD: win by 1)
 */
function calcTiebreakPointsTo(p1: number, p2: number, tiebreakTo: number, isNoAD: boolean): [number, number] {
  return pointsUntilWon(p1, p2, (s1, s2) => checkTiebreakWon(s1, s2, tiebreakTo, isNoAD));
}

/**
 * The minimum points each side needs: how many points in a row it must win, the opponent scoring none, before
 * `gameWon` names it the winner. A trailing side must first take away the opponent's lead, so at 5-6 in a
 * tiebreak to 7 the trailing side needs 3 (6-6, 7-6, 8-6), and at 15-40 it needs 4 (30-40, deuce, ad, game).
 * Counting against the predicate addPoint completes games with keeps NoAD, deuceAfter and margins in agreement.
 */
function pointsUntilWon(
  p1: number,
  p2: number,
  gameWon: (side1Points: number, side2Points: number) => number | undefined,
): [number, number] {
  // a decided game has nothing left to win in it (the engine opens the next game at 0-0 before asking)
  if (gameWon(p1, p2) !== undefined) return [0, 0];
  return [sidePointsUntilWon(p1, p2, 0, gameWon), sidePointsUntilWon(p2, p1, 1, gameWon)];
}

function sidePointsUntilWon(
  myPoints: number,
  oppPoints: number,
  sideIndex: 0 | 1,
  gameWon: (side1Points: number, side2Points: number) => number | undefined,
): number {
  // Winning every point, a side wins once it leads by the margin past the target: the bound only guards a
  // malformed format from looping.
  for (let needed = 1; needed <= oppPoints + 1000; needed++) {
    const mine = myPoints + needed;
    const winner = sideIndex === 0 ? gameWon(mine, oppPoints) : gameWon(oppPoints, mine);
    if (winner === sideIndex) return needed;
  }
  return 0;
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
 * The `pointsToMatch` of a side that cannot win the match however many points in a row it wins: in an exactly
 * or aggregate format, where every set (or segment) is played and the count (or total) decides, a side too
 * far behind is not reached by winning every remaining point.
 */
export const NO_POINTS_TO_MATCH = -1;

/**
 * Calculate minimum points each side needs to win the match, by the match's completion rule (spec § 9,
 * § 11.2; CA 2026-10-18): the sets to win in a best of N; all N sets in an exactly format, the side
 * then needing more sets than the other; and in an aggregate of tiebreak-only segments, every segment, the
 * side then needing the greater total (or a level one and the declared decider).
 */
function calcPointsToMatch(
  pointsToSet: [number, number],
  setsWon: [number, number],
  setsToWin: number,
  formatStructure: FormatStructure,
  matchUp: MatchUp,
): [number, number] {
  if (isAggregateFormat(formatStructure) && formatStructure.setFormat?.tiebreakSet)
    return aggregatePointsToMatch(pointsToSet, formatStructure, matchUp);
  if (formatStructure.exactly && !isAggregateFormat(formatStructure))
    return exactlyPointsToMatch(pointsToSet, setsWon, formatStructure, matchUp);

  // Calculate minimum points per set for remaining sets
  const sf = formatStructure.setFormat;
  const minPointsPerSet = getMinPointsPerSet(sf, formatStructure);

  return [
    calcSidePointsToMatch(pointsToSet[0], setsWon[0], setsToWin, minPointsPerSet),
    calcSidePointsToMatch(pointsToSet[1], setsWon[1], setsToWin, minPointsPerSet),
  ];
}

/** A set that is over: won, or a timed segment closed with or without a winner. */
function isClosedSet(set: SetScore): boolean {
  return set.winningSide !== undefined || !!(set as SetScore & { segmentComplete?: boolean }).segmentComplete;
}

/** The set numbers still to be played after the one in play, up to `lastSetNumber`. */
function setNumbersAfterInPlay(matchUp: MatchUp, lastSetNumber: number): number[] {
  const inPlaySetNumber = matchUp.score.sets.filter(isClosedSet).length + 1;
  const remaining: number[] = [];
  for (let setNumber = inPlaySetNumber + 1; setNumber <= lastSetNumber; setNumber++) remaining.push(setNumber);
  return remaining;
}

/** The fewest points that win set `setNumber` from love, by the format governing it (§ 3.2). */
function minPointsForSet(formatStructure: FormatStructure, setNumber: number): number {
  const governing = finalSetGoverns(formatStructure, setNumber, false) ? formatStructure.finalSetFormat : undefined;
  return getMinPointsPerSet(governing ?? formatStructure.setFormat, formatStructure);
}

/** Exactly N, not aggregate (§ 9.2): every set is played, and the side with more sets wins. */
function exactlyPointsToMatch(
  pointsToSet: [number, number],
  setsWon: [number, number],
  formatStructure: FormatStructure,
  matchUp: MatchUp,
): [number, number] {
  const remaining = setNumbersAfterInPlay(matchUp, formatStructure.exactly!);
  const remainingPoints = remaining.reduce((sum, setNumber) => sum + minPointsForSet(formatStructure, setNumber), 0);
  const side = (index: 0 | 1): number => {
    // winning every point from here, the side wins the set in play and every set after it
    const setsAtTheEnd = setsWon[index] + 1 + remaining.length;
    if (setsAtTheEnd <= setsWon[1 - index]) return NO_POINTS_TO_MATCH;
    return pointsToSet[index] + remainingPoints;
  };
  return [side(0), side(1)];
}

/**
 * Aggregate of tiebreak-only segments (§ 9.3, § 9.4): every one of the N is played and the total decides; a
 * level total is settled by the declared decider of an exactly-N aggregate (set N + 1), and is otherwise a
 * tie. In the decider itself, the decider is the match.
 */
function aggregatePointsToMatch(
  pointsToSet: [number, number],
  formatStructure: FormatStructure,
  matchUp: MatchUp,
): [number, number] {
  const setCount = formatStructure.exactly || formatStructure.bestOf || 3;
  const sets = matchUp.score.sets;
  const closed = sets.filter(isClosedSet);
  if (closed.length >= setCount) return [...pointsToSet] as [number, number];

  const totals = aggregateTotals(closed);
  const inPlay = sets.at(-1) && !isClosedSet(sets.at(-1)!) ? sets.at(-1) : undefined;
  totals[0] += inPlay?.side1GameScores?.[0] ?? 0;
  totals[1] += inPlay?.side2GameScores?.[0] ?? 0;

  const remaining = setNumbersAfterInPlay(matchUp, setCount);
  const remainingPoints = remaining.reduce((sum, setNumber) => sum + minPointsForSet(formatStructure, setNumber), 0);
  const decider = formatStructure.exactly ? formatStructure.finalSetFormat : undefined;
  const side = (index: 0 | 1): number => {
    const gained = pointsToSet[index] + remainingPoints;
    const total = totals[index] + gained;
    const opponent = totals[1 - index];
    if (total > opponent) return gained;
    if (total === opponent && decider) return gained + getMinPointsPerSet(decider, formatStructure);
    return NO_POINTS_TO_MATCH;
  };
  return [side(0), side(1)];
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
