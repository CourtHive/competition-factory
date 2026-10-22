/**
 * addPoint - Add a point to a matchUp
 *
 * Format-driven scoring engine that handles:
 * - Standard sets (tennis, padel)
 * - Tiebreak-only sets (pickleball, squash, badminton, table tennis, fencing, volleyball, esports)
 * - Match tiebreaks (final set tiebreak)
 * - Rally scoring (@RALLY modifier)
 * - Consecutive game format (TYPTI: -G:3C)
 * - Timed sets (records scoring events, doesn't auto-complete)
 * - Aggregate scoring (match-level A, set-level A)
 * - Exactly formats (all N sets must be played)
 * - NoAD games and tiebreaks
 */

import { checkStandardGameWon, checkStandardSetWon, checkTiebreakWon } from './gameWon';
import { openSetNumber } from '@Helpers/matchUpFormatCode/aggregateDecider';
import type { SetType } from '@Tools/scoring/scoringUtilities';
import type { PointMultiplier } from './resolvePointValue';
import { checkAndFinalizeMatch } from './matchCompletion';
import { calculatePointsTo } from './pointsToCalculator';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { resolvePointValue } from './resolvePointValue';
import { inferServeSide } from './serveSideCalculator';
import { addCombinedPoint } from './addCombinedPoint';
import { isObject } from '@Tools/objects';
import { nowIso } from '@Tools/clock';
import {
  inputLevels,
  resolveSetType,
  inputLevelError,
  isLiveDecidingSet,
  isAggregateFormat,
  isStandardSetTiebreak,
} from '@Tools/scoring/scoringUtilities';
import type {
  MatchUp,
  AddPointOptions,
  Point,
  SetScore,
  FormatStructure,
  SetFormatStructure,
} from '@Types/scoring/types';

// constants
import { COMPLETED, IN_PROGRESS, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { RALLY } from '@Constants/matchUpFormatConstants';

/**
 * Config for addPoint — optional multiplier support
 */
export interface AddPointConfig {
  pointMultipliers?: PointMultiplier[];
}

/**
 * Add a point to the matchUp
 *
 * @param matchUp - Current matchUp state
 * @param options - Point options (winner, server, etc)
 * @param config - Optional config (point multipliers, etc)
 * @returns matchUp with point added
 */
export function addPoint(matchUp: MatchUp, options: AddPointOptions, config?: AddPointConfig): MatchUp {
  // IMPORTANT: Do NOT clone matchUp! The v3 adapter needs mutation to work.
  if (!isObject(options)) return matchUp;
  validatePointInput(options);

  // Normalize between 0-indexed (winner/server) and 1-indexed (winningSide/serverSideNumber)
  let winner = options.winner;
  let server = options.server;
  const { timestamp } = options;

  if (winner === undefined && options.winningSide !== undefined) {
    winner = (options.winningSide - 1) as 0 | 1;
  }
  if (server === undefined && options.serverSideNumber !== undefined) {
    server = (options.serverSideNumber - 1) as 0 | 1;
  }

  if (winner === undefined || winner === null) return matchUp;
  // A finished match takes no more points. Measured 2026-10-01 by the golden corpus's scoring
  // source: without this, a point after a completed 6-4 6-0 opened a THIRD set with a game in it,
  // in all 72 recorded streams. The point is ignored, not refused: this function returns the
  // matchUp it was given, as it does for an undecidable winner, and the engine's event detection
  // (which compares completeness before and after) sees no change.
  if (matchUp.matchUpStatus === COMPLETED) return matchUp;
  const newMatchUp = matchUp;

  // Initialize history if not present
  newMatchUp.history ??= { points: [] };

  // Parse format to get structure
  const formatStructure: FormatStructure | undefined = parse(matchUp.matchUpFormat);
  if (!formatStructure) {
    throw new Error(`Invalid matchUpFormat: ${matchUp.matchUpFormat}`);
  }
  // An exactly format plays N sets and no more ("Exactly N Sets"): once all N are closed a level count
  // names no winner, and a point after it starts nothing. Ignored, as a point after the match is.
  if (
    formatStructure.exactly &&
    !isAggregateFormat(formatStructure) &&
    openSetNumber(matchUp.score.sets) > formatStructure.exactly
  )
    return matchUp;
  if (formatStructure.setFormat?.combinedPointTotal)
    return addCombinedPoint(matchUp, options, winner, server, {
      combinedPointTotal: formatStructure.setFormat.combinedPointTotal,
      tieResolution: formatStructure.setFormat.tieResolution!,
      winningMargin: formatStructure.setFormat.winningMargin,
    });
  const bestOf = formatStructure.exactly || formatStructure.bestOf || 3;
  const setsToWin = Math.ceil(bestOf / 2);

  // Create point record - preserve all metadata from options
  const pointNumber = newMatchUp.history.points.length + 1;
  const pointIndex = newMatchUp.history.points.length;

  // Calculate sets won so far
  const setsWon: [number, number] = [0, 0];
  newMatchUp.score.sets.forEach((set) => {
    if (set.winningSide === 1) setsWon[0]++;
    if (set.winningSide === 2) setsWon[1]++;
  });

  // Resolve the set type for the current/next set
  const setNumber = openSetNumber(newMatchUp.score.sets);
  const setType = resolveSetType(formatStructure, setsWon, setNumber);

  // Determine the active set format
  const isDecidingSet = isLiveDecidingSet(formatStructure, setsWon, setNumber);
  const activeSetFormat: SetFormatStructure | undefined =
    isDecidingSet && formatStructure.finalSetFormat ? formatStructure.finalSetFormat : formatStructure.setFormat;
  if (!inputLevels(activeSetFormat).point) throw inputLevelError('point');

  // Derive the server if not provided, where the set in play derives one (§ 10): none is derived in a
  // tiebreak-only format, so its points record a server only when the caller supplies it
  const rule = serviceRule(formatStructure, activeSetFormat);
  if (server === undefined && rule !== 'none') {
    server = deriveServer(newMatchUp, formatStructure, setType);
  }

  // Derive 'code' if not provided
  let derivedCode = (options as any).code;
  if (!derivedCode && winner !== undefined && server !== undefined) {
    derivedCode = winner === server ? 'S' : 'R';
  }

  const point: Point = {
    ...options,
    pointNumber,
    winner,
    winningSide: (winner + 1) as 1 | 2,
    server,
    serverSideNumber: server === undefined ? undefined : ((server + 1) as 1 | 2),
    serverParticipantId: options.serverParticipantId,
    timestamp: timestamp || nowIso(),
  };

  if (derivedCode) {
    point.code = derivedCode;
  }

  // Add v3-compatible index field
  (point as any).index = pointIndex;

  // Calculate pointsTo decorations BEFORE processing the point
  // These represent the state at the moment of the serve
  const pointsToInfo = calculatePointsTo(newMatchUp, formatStructure, setType, activeSetFormat, server);
  if (pointsToInfo) {
    point.pointsToGame = pointsToInfo.pointsToGame;
    point.pointsToSet = pointsToInfo.pointsToSet;
    point.pointsToMatch = pointsToInfo.pointsToMatch;
    point.gamesToSet = pointsToInfo.gamesToSet;
    point.isBreakpoint = pointsToInfo.isBreakpoint;
  }

  // Calculate serve side BEFORE processing the point
  const serveSide = inferServeSide(newMatchUp, formatStructure, setType);
  if (serveSide !== undefined) {
    point.serveSide = serveSide;
  }

  // Resolve point multiplier for score increment
  // If scoreValue is explicitly set on options, use it directly (parser override). A configured multiplier
  // applies only where a point is a unit; where points build games it is not consulted (§ 4.4, CA 2026-10-18).
  const multipliers = config?.pointMultipliers ?? [];
  const countsUnits = pointCountsUnits(newMatchUp, formatStructure, setType, activeSetFormat);
  const scoreIncrement = options.scoreValue ?? (countsUnits ? resolvePointValue(point, multipliers) : 1);
  if (scoreIncrement !== 1) {
    point.scoreValue = scoreIncrement;
  }

  // Add point to history
  newMatchUp.history.points.push(point);

  // Update match status if first point
  if (newMatchUp.matchUpStatus === TO_BE_PLAYED) {
    newMatchUp.matchUpStatus = IN_PROGRESS;
  }

  // Dispatch to set-type-specific scoring logic
  switch (setType) {
    case 'tiebreakOnly':
      handleTiebreakOnlySet(newMatchUp, point, winner, formatStructure, activeSetFormat!, setsToWin, scoreIncrement);
      break;
    case 'matchTiebreak':
      handleMatchTiebreak(newMatchUp, point, winner, formatStructure, setsToWin, scoreIncrement);
      break;
    case 'timed':
      handleTimedSet(newMatchUp, point, winner, activeSetFormat!, scoreIncrement, formatStructure, setsToWin);
      break;
    case 'standard':
    default:
      handleStandardSet(newMatchUp, point, winner, formatStructure, activeSetFormat!, setsToWin, isDecidingSet);
      break;
  }

  // Under @RALLY a setServer correction names the server of one point; then the rally winner serves (§ 10.4)
  if (rule === 'rallyWinner') delete newMatchUp.serverFlip;

  return newMatchUp;
}

// ============================================================================
// Set Type Handlers
// ============================================================================

/**
 * Handle scoring for standard sets (games with points, tiebreaks at threshold)
 */
function handleStandardSet(
  matchUp: MatchUp,
  point: Point,
  winner: 0 | 1,
  formatStructure: FormatStructure,
  activeSetFormat: SetFormatStructure,
  setsToWin: number,
  isDecidingSet: boolean,
): void {
  const currentSet = getOrCreateSet(matchUp, false, false);
  const currentSetIndex = matchUp.score.sets.indexOf(currentSet);

  const side1Games = currentSet.side1Score || 0;
  const side2Games = currentSet.side2Score || 0;
  const side1GameScores = currentSet.side1GameScores ?? [];
  const side2GameScores = currentSet.side2GameScores ?? [];

  // Initialize game if needed
  if (side1GameScores.length === 0 && side2GameScores.length === 0) {
    side1GameScores.push(0);
    side2GameScores.push(0);
  }

  // Get current game point scores
  const currentGameIndex = Math.max(side1GameScores.length, side2GameScores.length) - 1;
  let side1Points = currentGameIndex >= 0 ? (side1GameScores[currentGameIndex] ?? 0) : 0;
  let side2Points = currentGameIndex >= 0 ? (side2GameScores[currentGameIndex] ?? 0) : 0;

  // V3-compatible point metadata
  // gameOffset accounts for games added via addGame() that have no gameScores entries
  const pointBasedGames = Math.max(side1GameScores.length, side2GameScores.length) - 1;
  const gameOffset = side1Games + side2Games - pointBasedGames;
  (point as any).set = currentSetIndex;
  (point as any).game = gameOffset + currentGameIndex;
  (point as any).number = pointsPlayedBefore(matchUp, point, side1Points + side2Points);

  // Add point to winner
  if (winner === 0) {
    side1Points++;
    side1GameScores[side1GameScores.length - 1] = side1Points;
  } else {
    side2Points++;
    side2GameScores[side2GameScores.length - 1] = side2Points;
  }

  currentSet.side1GameScores = side1GameScores;
  currentSet.side2GameScores = side2GameScores;

  // Detect CONSECUTIVE game format
  const isConsecutive = formatStructure.gameFormat?.type === 'CONSECUTIVE';
  const consecutiveCount = formatStructure.gameFormat?.count || 3;

  // Track streak for CONSECUTIVE games
  if (isConsecutive) {
    const streak = currentSet.currentStreak;
    if (streak?.side === winner) {
      currentSet.currentStreak = { side: winner, count: streak.count + 1 };
    } else {
      currentSet.currentStreak = { side: winner, count: 1 };
    }
  }

  // Check if in tiebreak: the ACTIVE format's say, deciding set or not — see `setHasTiebreak`
  const isTiebreak = isStandardSetTiebreak(activeSetFormat, side1Games, side2Games);

  // Check if game is won
  let gameWon: number | undefined;
  if (isConsecutive && !isTiebreak) {
    gameWon = currentSet.currentStreak!.count >= consecutiveCount ? currentSet.currentStreak!.side : undefined;
  } else {
    gameWon = checkStandardGameWon(side1Points, side2Points, activeSetFormat, isTiebreak, formatStructure);
  }

  // Calculate game score display
  const gameScore =
    gameWon === undefined ? formatGameScore(side1Points, side2Points, isTiebreak, isConsecutive && !isTiebreak) : '0-0';
  point.score = gameScore;

  if (gameWon !== undefined) {
    handleGameCompletion(
      currentSet,
      gameWon,
      side1Games,
      side2Games,
      side1Points,
      side2Points,
      isTiebreak,
      isConsecutive,
      matchUp,
      formatStructure,
      activeSetFormat,
      isDecidingSet,
      setsToWin,
    );
  }
}

function handleGameCompletion(
  currentSet: SetScore,
  gameWon: number,
  side1Games: number,
  side2Games: number,
  side1Points: number,
  side2Points: number,
  isTiebreak: boolean,
  isConsecutive: boolean,
  matchUp: MatchUp,
  formatStructure: FormatStructure,
  activeSetFormat: SetFormatStructure,
  isDecidingSet: boolean,
  setsToWin: number,
): void {
  if (isConsecutive) {
    currentSet.currentStreak = undefined;
  }

  if (gameWon === 0) {
    currentSet.side1Score = side1Games + 1;
  } else {
    currentSet.side2Score = side2Games + 1;
  }

  if (isTiebreak) {
    currentSet.side1TiebreakScore = side1Points;
    currentSet.side2TiebreakScore = side2Points;
  }

  const setWon = checkStandardSetWon(
    currentSet.side1Score || 0,
    currentSet.side2Score || 0,
    activeSetFormat,
    isDecidingSet,
    formatStructure.finalSetFormat,
  );

  if (typeof setWon === 'number') {
    currentSet.winningSide = setWon + 1;
    checkAndFinalizeMatch(matchUp, formatStructure, setsToWin);
  } else {
    currentSet.side1GameScores!.push(0);
    currentSet.side2GameScores!.push(0);
  }
}

/**
 * Handle scoring for tiebreak-only sets (pickleball, squash, etc.)
 * The entire set is one tiebreak game played to tiebreakSet.tiebreakTo
 */
function handleTiebreakOnlySet(
  matchUp: MatchUp,
  point: Point,
  winner: 0 | 1,
  formatStructure: FormatStructure,
  activeSetFormat: SetFormatStructure,
  setsToWin: number,
  scoreIncrement: number = 1,
): void {
  const currentSet = getOrCreateSet(matchUp, true, false);
  const currentSetIndex = matchUp.score.sets.indexOf(currentSet);

  const tiebreakTo = activeSetFormat.tiebreakSet!.tiebreakTo || 11;
  const isNoAD = activeSetFormat.tiebreakSet!.NoAD || false;

  // Initialize game scores if needed
  const side1GameScores = currentSet.side1GameScores ?? [];
  const side2GameScores = currentSet.side2GameScores ?? [];
  if (side1GameScores.length === 0 && side2GameScores.length === 0) {
    side1GameScores.push(0);
    side2GameScores.push(0);
    currentSet.side1GameScores = side1GameScores;
    currentSet.side2GameScores = side2GameScores;
  }

  // Get current point scores (these ARE the set scores for tiebreak-only)
  let side1Points = side1GameScores[0] || 0;
  let side2Points = side2GameScores[0] || 0;

  // V3-compatible point metadata
  (point as any).set = currentSetIndex;
  (point as any).game = 0; // Always game 0 (the entire set is one game)
  (point as any).number = pointsPlayedBefore(matchUp, point, side1Points + side2Points);

  // Add point to winner (with multiplier support)
  if (winner === 0) {
    side1Points += scoreIncrement;
    side1GameScores[0] = side1Points;
  } else {
    side2Points += scoreIncrement;
    side2GameScores[0] = side2Points;
  }

  currentSet.side1GameScores = side1GameScores;
  currentSet.side2GameScores = side2GameScores;

  // Game score display (numeric for tiebreak)
  const gameWon = checkTiebreakWon(side1Points, side2Points, tiebreakTo, isNoAD);
  point.score = gameWon === undefined ? `${side1Points}-${side2Points}` : '0-0';

  if (gameWon !== undefined) {
    // Set is complete
    currentSet.winningSide = gameWon + 1;
    currentSet.side1TiebreakScore = side1Points;
    currentSet.side2TiebreakScore = side2Points;
    // TODS convention: side scores are 1-0 / 0-1 for tiebreak-only sets
    currentSet.side1Score = gameWon === 0 ? 1 : 0;
    currentSet.side2Score = gameWon === 0 ? 0 : 1;

    checkAndFinalizeMatch(matchUp, formatStructure, setsToWin);
  }
}

/**
 * Handle scoring for match tiebreak (final set is one tiebreak game)
 */
function handleMatchTiebreak(
  matchUp: MatchUp,
  point: Point,
  winner: 0 | 1,
  formatStructure: FormatStructure,
  setsToWin: number,
  scoreIncrement: number = 1,
): void {
  const tiebreakTo = formatStructure.finalSetFormat?.tiebreakSet?.tiebreakTo || 10;
  const isNoAD = formatStructure.finalSetFormat?.tiebreakSet?.NoAD || false;

  // a match tiebreak is a set scored by a tiebreak-only rule, and is marked as one (§ 1.2, CA 2026-10-21)
  const currentSet = getOrCreateSet(matchUp, true, false);
  const currentSetIndex = matchUp.score.sets.indexOf(currentSet);

  // Initialize game scores if needed
  const side1GameScores = currentSet.side1GameScores ?? [];
  const side2GameScores = currentSet.side2GameScores ?? [];
  if (side1GameScores.length === 0 && side2GameScores.length === 0) {
    side1GameScores.push(0);
    side2GameScores.push(0);
    currentSet.side1GameScores = side1GameScores;
    currentSet.side2GameScores = side2GameScores;
  }

  let side1Points = side1GameScores[0] || 0;
  let side2Points = side2GameScores[0] || 0;

  // V3-compatible point metadata
  (point as any).set = currentSetIndex;
  (point as any).game = 0;
  (point as any).number = pointsPlayedBefore(matchUp, point, side1Points + side2Points);

  // Add point (with multiplier support)
  if (winner === 0) {
    side1Points += scoreIncrement;
    side1GameScores[0] = side1Points;
  } else {
    side2Points += scoreIncrement;
    side2GameScores[0] = side2Points;
  }

  currentSet.side1GameScores = side1GameScores;
  currentSet.side2GameScores = side2GameScores;

  const gameWon = checkTiebreakWon(side1Points, side2Points, tiebreakTo, isNoAD);
  point.score = gameWon === undefined ? `${side1Points}-${side2Points}` : '0-0';

  if (gameWon !== undefined) {
    currentSet.side1TiebreakScore = side1Points;
    currentSet.side2TiebreakScore = side2Points;
    currentSet.side1Score = gameWon === 0 ? 1 : 0;
    currentSet.side2Score = gameWon === 0 ? 0 : 1;
    currentSet.winningSide = gameWon + 1;

    checkAndFinalizeMatch(matchUp, formatStructure, setsToWin);
  }
}

/**
 * Handle scoring for timed sets
 * Points are recorded but the set does NOT auto-complete.
 * The set completes via endSegment() on the engine.
 */
/** A point with the set, game and point-in-game coordinates the scorer writes onto it. */
type PlacedPoint = Point & { set?: number; game?: number; number?: number };

/**
 * A point's `number`: the points played in its game before it (§ 11.1), not their values. The running score counts
 * values, so each earlier point of the game worth other than one is taken back to one (SE2a-D12, CA 2026-10-21).
 */
function pointsPlayedBefore(matchUp: MatchUp, point: Point, runningScore: number): number {
  const { set, game } = point as PlacedPoint;
  const earlier = (matchUp.history?.points ?? []) as PlacedPoint[];
  const extra = earlier
    .filter((before) => before !== point && before.set === set && before.game === game)
    .reduce((sum, before) => sum + (before.scoreValue ?? 1) - 1, 0);
  return runningScore - extra;
}
/** A set a timed segment or tiebreak closes. */
type ClosableSet = SetScore & { segmentComplete?: boolean };

function handleTimedSet(
  matchUp: MatchUp,
  point: Point,
  winner: 0 | 1,
  activeSetFormat: SetFormatStructure,
  scoreIncrement: number = 1,
  formatStructure?: FormatStructure,
  setsToWin: number = 2,
): void {
  const currentSet = getOrCreateSet(matchUp, false, true);
  const currentSetIndex = matchUp.score.sets.indexOf(currentSet);
  (point as PlacedPoint).set = currentSetIndex;

  // Level at time with a declared `/TB{n}`: endSegment opened a tiebreak, and the set waits on it
  if (currentSet.side1TiebreakScore !== undefined && currentSet.side2TiebreakScore !== undefined) {
    handleTimedTiebreakPoint(matchUp, currentSet, point, winner, activeSetFormat, formatStructure, setsToWin);
    return;
  }

  if (timedSetBuildsGames(formatStructure, activeSetFormat)) {
    handleTimedGamePoint(currentSet, point, winner, activeSetFormat, formatStructure);
    return;
  }

  (point as PlacedPoint).game = 0;
  (point as PlacedPoint).number = pointsPlayedBefore(
    matchUp,
    point,
    (currentSet.side1Score || 0) + (currentSet.side2Score || 0),
  );

  // Just increment the score — set doesn't auto-complete (with multiplier support)
  if (winner === 0) {
    currentSet.side1Score = (currentSet.side1Score || 0) + scoreIncrement;
  } else {
    currentSet.side2Score = (currentSet.side2Score || 0) + scoreIncrement;
  }

  const s1 = currentSet.side1Score || 0;
  const s2 = currentSet.side2Score || 0;
  point.score = `${s1}-${s2}`;
}

/**
 * Whether points in this timed set build games. A games-based timed set (`T{minutes}`, `T{minutes}G`)
 * under the SET root is a tennis-family set: its points make games of the match's game format (`-G:`:
 * traditional, with deuce, No-Ad and deuce caps, or consecutive points, CA 2026-10-18), and the set
 * counts games (CA 2026-10-17). Elsewhere a point stays one scoring unit:
 * - under another root (HAL, QTR, PER, RND, INN) and in the standalone form, a game is the sport's own
 *   unit (a goal, a basket);
 * - in an aggregate format the segment's total is its units: INTENNSE bolts (`SET2XA-S:T10`) score
 *   point by point, with point multipliers.
 */
export function timedSetBuildsGames(
  formatStructure: FormatStructure | undefined,
  setFormat: SetFormatStructure,
): boolean {
  if (!formatStructure || formatStructure.matchRoot || formatStructure.simplified) return false;
  return !formatStructure.aggregate && setFormat.based !== 'P';
}

/**
 * Whether a point is a unit of the set in play's score, so its value counts (spec § 4.4, § 5 rule 5, § 6.2;
 * CA 2026-10-18): a tiebreak-only segment (a match tiebreak included), and a timed segment whose points do
 * not build games. Where points build games (a standard set, a tennis-family timed set, the tiebreak a level
 * timed set plays at time) and in a combined total, a point is one point and nothing else.
 */
export function pointCountsUnits(
  matchUp: MatchUp,
  formatStructure: FormatStructure,
  setType: SetType,
  setFormat: SetFormatStructure | undefined,
): boolean {
  if (!setFormat || setFormat.combinedPointTotal) return false;
  if (setType === 'tiebreakOnly' || setType === 'matchTiebreak') return true;
  if (setType !== 'timed' || timedSetBuildsGames(formatStructure, setFormat)) return false;
  const set = matchUp.score.sets.at(-1);
  const inPlay = set && openSetNumber(matchUp.score.sets) === matchUp.score.sets.length;
  return !(inPlay && set.side1TiebreakScore !== undefined && set.side2TiebreakScore !== undefined);
}

function handleTimedGamePoint(
  currentSet: SetScore,
  point: Point,
  winner: 0 | 1,
  setFormat: SetFormatStructure,
  formatStructure?: FormatStructure,
): void {
  const side1GameScores = (currentSet.side1GameScores ??= []);
  const side2GameScores = (currentSet.side2GameScores ??= []);
  if (!side1GameScores.length) {
    side1GameScores.push(0);
    side2GameScores.push(0);
  }
  const last = side1GameScores.length - 1;
  (point as PlacedPoint).game = (currentSet.side1Score || 0) + (currentSet.side2Score || 0);
  (point as PlacedPoint).number = side1GameScores[last] + side2GameScores[last];

  if (winner === 0) side1GameScores[last] += 1;
  else side2GameScores[last] += 1;

  // the games are of the match's declared game format, a consecutive-points one included (§ 3.5, CA 2026-10-18)
  const gameFormat = formatStructure?.gameFormat;
  const consecutiveCount = gameFormat?.type === 'CONSECUTIVE' ? gameFormat.count || 3 : undefined;
  let gameWon: number | undefined;
  if (consecutiveCount) {
    const streak = currentSet.currentStreak;
    currentSet.currentStreak = { side: winner, count: streak?.side === winner ? streak.count + 1 : 1 };
    gameWon = currentSet.currentStreak.count >= consecutiveCount ? winner : undefined;
  } else {
    gameWon = checkStandardGameWon(side1GameScores[last], side2GameScores[last], setFormat, false, formatStructure);
  }
  if (gameWon === undefined) {
    point.score = formatGameScore(side1GameScores[last], side2GameScores[last], false, !!consecutiveCount);
    return;
  }
  currentSet.currentStreak = undefined;
  if (gameWon === 0) currentSet.side1Score = (currentSet.side1Score || 0) + 1;
  else currentSet.side2Score = (currentSet.side2Score || 0) + 1;
  side1GameScores.push(0);
  side2GameScores.push(0);
  point.score = '0-0';
}

/**
 * A point of the tiebreak a level timed set plays at time (`T{minutes}/TB{n}`, CA 2026-10-17). The
 * tiebreak's winner takes the set by one more game (or point, in a points-based set), as a tennis
 * tiebreak wins 7-6, and the set is closed.
 */
function handleTimedTiebreakPoint(
  matchUp: MatchUp,
  currentSet: SetScore,
  point: Point,
  winner: 0 | 1,
  setFormat: SetFormatStructure,
  formatStructure: FormatStructure | undefined,
  setsToWin: number,
): void {
  // endSegment opened the tiebreak with the games and the tiebreak points all set
  const games = [currentSet.side1Score!, currentSet.side2Score!];
  (point as PlacedPoint).game = games[0] + games[1];
  (point as PlacedPoint).number = currentSet.side1TiebreakScore! + currentSet.side2TiebreakScore!;
  if (winner === 0) currentSet.side1TiebreakScore! += 1;
  else currentSet.side2TiebreakScore! += 1;

  const tb1 = currentSet.side1TiebreakScore!;
  const tb2 = currentSet.side2TiebreakScore!;
  // only a set that declares `/TB{n}` opens one, so its tiebreak format is there
  const tiebreak = setFormat.tiebreakFormat!;
  const won = checkTiebreakWon(tb1, tb2, tiebreak.tiebreakTo!, tiebreak.NoAD);
  point.score = `${tb1}-${tb2}`;
  if (won === undefined) return;

  // the point that completes the tiebreak completes a game, so it shows the next game's 0-0 (§ 11.1, CA 2026-10-21)
  point.score = '0-0';
  if (won === 0) currentSet.side1Score = games[0] + 1;
  else currentSet.side2Score = games[1] + 1;
  currentSet.winningSide = won + 1;
  (currentSet as ClosableSet).segmentComplete = true;
  if (formatStructure) checkAndFinalizeMatch(matchUp, formatStructure, setsToWin);
}

// ============================================================================
// Shared Helpers
// ============================================================================

/**
 * Get or create the current active set
 */
function getOrCreateSet(matchUp: MatchUp, isTiebreakOnly: boolean, isTimed: boolean): SetScore {
  const currentSetIndex = matchUp.score.sets.length - 1;
  const currentSet = currentSetIndex >= 0 ? matchUp.score.sets[currentSetIndex] : undefined;
  if (currentSet && currentSet.winningSide === undefined && !(currentSet as any).segmentComplete) {
    return currentSet;
  }

  // Need new set
  const newSet: SetScore = { setNumber: matchUp.score.sets.length + 1, side1Score: 0, side2Score: 0 };
  // a timed set scored in units plays no game point by point, so it has no per-game counts; one whose points build
  // games opens them with its first point (CA 2026-10-21)
  if (!isTimed) Object.assign(newSet, { side1GameScores: [], side2GameScores: [] });
  if (isTiebreakOnly) newSet.isTiebreakOnly = true;
  if (isTimed) newSet.isTimed = true;

  matchUp.score.sets.push(newSet);
  return newSet;
}

const SIDE_INDEX = new Set([0, 1]);
const SIDE_NUMBER = new Set([1, 2]);

/**
 * Refuse a point input the scorer cannot take, before anything is written: a side outside 0/1 (or 1/2),
 * the two spellings of a side naming different sides, or a scoreValue that is negative or not finite.
 * A zero scoreValue is allowed. A missing winner is not an error here: such a point is ignored.
 */
export function validatePointInput(options: Partial<AddPointOptions>): void {
  const { winner, winningSide, server, serverSideNumber, scoreValue } = options;
  if (winner != null && !SIDE_INDEX.has(winner)) throw new Error(`Invalid winner: ${winner}`);
  if (winningSide != null && !SIDE_NUMBER.has(winningSide)) throw new Error(`Invalid winningSide: ${winningSide}`);
  if (winner != null && winningSide != null && winner + 1 !== winningSide)
    throw new Error(`winner ${winner} and winningSide ${winningSide} disagree`);
  if (server != null && !SIDE_INDEX.has(server)) throw new Error(`Invalid server: ${server}`);
  if (serverSideNumber != null && !SIDE_NUMBER.has(serverSideNumber))
    throw new Error(`Invalid serverSideNumber: ${serverSideNumber}`);
  if (server != null && serverSideNumber != null && server + 1 !== serverSideNumber)
    throw new Error(`server ${server} and serverSideNumber ${serverSideNumber} disagree`);
  const { observedServeSide } = options;
  if (observedServeSide !== undefined && observedServeSide !== 'deuce' && observedServeSide !== 'ad')
    throw new Error(`Invalid observedServeSide: ${observedServeSide}`);
  if (scoreValue !== undefined && !(Number.isFinite(scoreValue) && scoreValue >= 0))
    throw new Error(`Invalid scoreValue: ${scoreValue}`);
}

/**
 * How the side due to serve is known in a set (spec § 10, CA 2026-10-18):
 * - `rotation`: derived by the format (§ 10.1–10.3): game by game in standard sets, Rule 5(b) in a tiebreak
 *   (a tennis match tiebreak `-F:TB{n}` included), and unit by unit in timed segments, continuously across
 *   segments;
 * - `rallyWinner`: under `@RALLY` the rally winner serves next (§ 10.4);
 * - `none`: no server is derived (§ 10.2 rule 2, § 10.4): a combined total `P{n}`, and a tiebreak-only
 *   format (`S:TB{n}`: squash, table tennis, pickleball and badminton shapes) until each sport's own rule is
 *   added. A point there records a server only when the caller supplies one.
 */
export type ServiceRule = 'rotation' | 'rallyWinner' | 'none';

export function serviceRule(
  formatStructure: FormatStructure | undefined,
  setFormat: SetFormatStructure | undefined,
): ServiceRule {
  if (!formatStructure || !setFormat || setFormat.combinedPointTotal) return 'none';
  if (setFormat.modifier === RALLY || setFormat.tiebreakSet?.modifier === RALLY) return 'rallyWinner';
  if (setFormat.tiebreakSet && formatStructure.setFormat?.tiebreakSet) return 'none';
  return 'rotation';
}

/** The format governing the set the next point lands in (§ 3.2). */
export function liveSetFormat(matchUp: MatchUp, formatStructure: FormatStructure): SetFormatStructure | undefined {
  const setsWon: [number, number] = [0, 0];
  for (const set of matchUp.score.sets) {
    if (set.winningSide === 1) setsWon[0]++;
    if (set.winningSide === 2) setsWon[1]++;
  }
  const isDecidingSet = isLiveDecidingSet(formatStructure, setsWon, openSetNumber(matchUp.score.sets));
  return isDecidingSet && formatStructure.finalSetFormat ? formatStructure.finalSetFormat : formatStructure.setFormat;
}

/** The service rule of the set the next point lands in. */
export function liveServiceRule(matchUp: MatchUp, formatStructure: FormatStructure | undefined): ServiceRule {
  if (!formatStructure) return 'none';
  return serviceRule(formatStructure, liveSetFormat(matchUp, formatStructure));
}

/**
 * The side due to serve the next point. Where no server is derived (`none`) this is a placeholder kept for
 * API compatibility: the side a `setServer` named, or side 1 (`liveServiceRule` says which it is).
 *
 * Exported for use by ScoringEngine.getNextServer() and getScore() situation.
 */
export function deriveServer(matchUp: MatchUp, formatStructure: FormatStructure, setType: SetType): 0 | 1 {
  const rule = liveServiceRule(matchUp, formatStructure);
  const baseServer = deriveServerBase(matchUp, formatStructure, setType);

  // Priority 1: Explicit serverFlip (set via ScoringEngine.setServer()).
  // When defined, it takes full control — true flips the base, false keeps it.
  // This replaces first-point inference for the current position onward.
  // During rebuild, serverFlip is only set when the setServer timeline entry
  // is replayed, so points before it use first-point inference naturally.
  // Under @RALLY a correction names the server of the next point only: the rule resumes after it.
  if (matchUp.serverFlip !== undefined) {
    return matchUp.serverFlip ? ((1 - baseServer) as 0 | 1) : baseServer;
  }
  if (rule !== 'rotation') return baseServer;

  // Priority 2: Infer from the first recorded point's explicit server.
  // If it disagrees with the base derivation at that point's position, flip all
  // subsequent derivations. This handles both starting from scratch (where
  // side 1 starts) and mid-match entry (where the first recorded point may
  // be in set 2+ after addSet calls).
  const firstPoint = matchUp.history?.points?.[0] as PlacedPoint | undefined;
  if (firstPoint?.server !== undefined && firstPoint.server !== baseAtPoint(matchUp, firstPoint)) {
    return (1 - baseServer) as 0 | 1;
  }
  return baseServer;
}

/** Games (or units) a set recorded: a tiebreak and a tiebreak-only set count as one. */
function unitsOf(set: SetScore): number {
  return (set.side1Score || 0) + (set.side2Score || 0);
}

/**
 * The rotation's server at a recorded point's position: the units played before it, across every set. In a
 * timed segment whose points are units (no games) a point is one unit; elsewhere a game is.
 */
function baseAtPoint(matchUp: MatchUp, point: PlacedPoint): 0 | 1 {
  const setIndex = point.set ?? 0;
  let unitsBefore = 0;
  for (const set of matchUp.score.sets.slice(0, setIndex)) unitsBefore += unitsOf(set);
  const set = matchUp.score.sets[setIndex];
  const unitPoints = !!set?.isTimed && !set.side1GameScores?.length;
  unitsBefore += (unitPoints ? point.number : point.game) ?? 0;
  return (unitsBefore % 2) as 0 | 1;
}

/**
 * The derivation before any orientation (§ 10.6). Rotation: side 1 serves the first unit of the match and
 * service alternates every unit, counted across every set however it was recorded (by points, `addGame`,
 * `addSet` or a baseline), so a new set's first unit is served by the side that did not serve the last
 * unit before it (§ 10.1, § 10.3). A unit is a game in a standard set and in a timed set whose points build
 * games, and a point (or unit) in a timed segment whose points are units. A tiebreak (in a standard set, a
 * match tiebreak, or the tiebreak a level timed segment plays at time) is opened by the side due to serve
 * the next unit and follows Rule 5(b). Rally: the winner of the point before (§ 10.4). None: side 1.
 */
export function deriveServerBase(matchUp: MatchUp, formatStructure: FormatStructure, setType: SetType): 0 | 1 {
  const rule = liveServiceRule(matchUp, formatStructure);
  if (rule === 'none') return 0;
  if (rule === 'rallyWinner') return matchUp.history?.points?.at(-1)?.winner ?? 0;

  const sets = matchUp.score.sets;
  const setNumber = openSetNumber(sets);
  const inPlay = setNumber <= sets.length ? sets[setNumber - 1] : undefined;
  let unitsBefore = 0;
  for (const set of sets.slice(0, setNumber - 1)) unitsBefore += unitsOf(set);
  const nextUnit = ((unitsBefore + (inPlay ? unitsOf(inPlay) : 0)) % 2) as 0 | 1;

  if (setType === 'tiebreakOnly' || setType === 'matchTiebreak') {
    const pointsPlayed = (inPlay?.side1GameScores?.[0] || 0) + (inPlay?.side2GameScores?.[0] || 0);
    // the side due to serve the next game opens the match tiebreak
    return tiebreakServer((unitsBefore % 2) as 0 | 1, pointsPlayed);
  }

  if (setType === 'timed') {
    const tiebreakAtTime = inPlay?.side1TiebreakScore !== undefined && inPlay?.side2TiebreakScore !== undefined;
    if (tiebreakAtTime) return tiebreakServer(nextUnit, inPlay.side1TiebreakScore! + inPlay.side2TiebreakScore!);
    return nextUnit;
  }

  // the format governing the set in play — the scorer's own choice, so both agree on a tiebreak
  const activeSetFormat = liveSetFormat(matchUp, formatStructure);
  if (inPlay && isStandardSetTiebreak(activeSetFormat, inPlay.side1Score || 0, inPlay.side2Score || 0)) {
    const tiebreakPoints = (inPlay.side1GameScores?.at(-1) || 0) + (inPlay.side2GameScores?.at(-1) || 0);
    // the side due to serve the next game opens the tiebreak
    return tiebreakServer(nextUnit, tiebreakPoints);
  }

  return nextUnit;
}

/**
 * The server of the next point of a tiebreak: the opening server serves one point, then each side
 * serves two in turn (ITF Rules of Tennis, Rule 5(b)) — servers 0, 1, 1, 0, 0, 1, 1, … for opener 0.
 */
export function tiebreakServer(openingServer: 0 | 1, pointsPlayed: number): 0 | 1 {
  return ((openingServer + Math.floor((pointsPlayed + 1) / 2)) % 2) as 0 | 1;
}

/**
 * Format game score as tennis score string (e.g., '0-15', '30-30', '40-A')
 *
 * Exported for use by getScore() pointDisplay.
 */
export function formatGameScore(p1: number, p2: number, isTiebreak: boolean, isConsecutive?: boolean): string {
  if (isTiebreak || isConsecutive) {
    return `${p1}-${p2}`;
  }

  const points = ['0', '15', '30', '40'];

  if (p1 < 4 && p2 < 4) {
    return `${points[p1]}-${points[p2]}`;
  }

  if (p1 >= 3 && p2 >= 3 && p1 === p2) {
    return '40-40';
  }

  if (p1 >= 3 && p2 >= 3) {
    const diff = p1 - p2;
    if (diff === 1) return 'A-40';
    if (diff === -1) return '40-A';
    if (diff >= 2) return 'G-40';
    if (diff <= -2) return '40-G';
  }

  if (p1 >= 3) {
    return `40-${p2 < 4 ? points[p2] : '40'}`;
  }

  if (p2 >= 3) {
    return `${p1 < 4 ? points[p1] : '40'}-40`;
  }

  return `${p1 < 4 ? points[p1] : '0'}-${p2 < 4 ? points[p2] : '0'}`;
}

// where it lived before gameWon held every win predicate; its importers read it from here
export { checkStandardSetWon };
