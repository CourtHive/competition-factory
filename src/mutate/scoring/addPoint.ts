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

import type {
  MatchUp,
  AddPointOptions,
  Point,
  SetScore,
  FormatStructure,
  SetFormatStructure,
} from '@Types/scoring/types';
import { resolveSetType, isAggregateFormat } from '@Tools/scoring/scoringUtilities';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import type { SetType } from '@Tools/scoring/scoringUtilities';
import { calculatePointsTo } from './pointsToCalculator';
import { inferServeSide } from './serveSideCalculator';
import { resolvePointValue } from './resolvePointValue';
import type { PointMultiplier } from './resolvePointValue';
import { isObject } from '@Tools/objects';

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
  const newMatchUp = matchUp;

  // Initialize history if not present
  newMatchUp.history ??= { points: [] };

  // Parse format to get structure
  const formatStructure: FormatStructure | undefined = parse(matchUp.matchUpFormat);
  if (!formatStructure) {
    throw new Error(`Invalid matchUpFormat: ${matchUp.matchUpFormat}`);
  }
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
  const setType = resolveSetType(formatStructure, setsWon);

  // Determine the active set format
  const isDecidingSet = setsWon[0] === setsToWin - 1 && setsWon[1] === setsToWin - 1;
  const activeSetFormat: SetFormatStructure | undefined =
    isDecidingSet && formatStructure.finalSetFormat ? formatStructure.finalSetFormat : formatStructure.setFormat;

  // Detect rally scoring (skip auto server derivation)
  const isRallyScoring = !!(
    activeSetFormat?.tiebreakSet?.modifier === 'RALLY' || activeSetFormat?.modifier === 'RALLY'
  );

  // Derive server if not provided and not rally scoring
  if (server === undefined && !isRallyScoring) {
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
    serverSideNumber: server !== undefined ? ((server + 1) as 1 | 2) : undefined,
    serverParticipantId: options.serverParticipantId,
    timestamp: timestamp || new Date().toISOString(),
  };

  if (derivedCode) {
    (point as any).code = derivedCode;
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
  // If scoreValue is explicitly set on options, use it directly (parser override)
  const multipliers = config?.pointMultipliers || [];
  const scoreIncrement = options.scoreValue ?? resolvePointValue(point, multipliers);
  if (scoreIncrement !== 1) {
    point.scoreValue = scoreIncrement;
  }

  // Add point to history
  newMatchUp.history.points.push(point);

  // Update match status if first point
  if (newMatchUp.matchUpStatus === 'TO_BE_PLAYED') {
    newMatchUp.matchUpStatus = 'IN_PROGRESS';
  }

  // Dispatch to set-type-specific scoring logic
  switch (setType) {
    case 'tiebreakOnly':
      handleTiebreakOnlySet(
        newMatchUp,
        point,
        winner,
        formatStructure,
        activeSetFormat!,
        setsWon,
        setsToWin,
        scoreIncrement,
      );
      break;
    case 'matchTiebreak':
      handleMatchTiebreak(newMatchUp, point, winner, formatStructure, setsWon, setsToWin, scoreIncrement);
      break;
    case 'timed':
      handleTimedSet(newMatchUp, point, winner, activeSetFormat!, scoreIncrement);
      break;
    case 'standard':
    default:
      handleStandardSet(
        newMatchUp,
        point,
        winner,
        formatStructure,
        activeSetFormat!,
        setsWon,
        setsToWin,
        isDecidingSet,
      );
      break;
  }

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
  _setsWon: [number, number],
  setsToWin: number,
  isDecidingSet: boolean,
): void {
  const currentSet = getOrCreateSet(matchUp, false, false);
  const currentSetIndex = matchUp.score.sets.indexOf(currentSet);

  const side1Games = currentSet.side1Score || 0;
  const side2Games = currentSet.side2Score || 0;
  const side1GameScores = currentSet.side1GameScores || [];
  const side2GameScores = currentSet.side2GameScores || [];

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
  const gameOffset = (side1Games + side2Games) - pointBasedGames;
  (point as any).set = currentSetIndex;
  (point as any).game = gameOffset + currentGameIndex;
  (point as any).number = side1Points + side2Points;

  // Get format details
  const setTo = activeSetFormat.setTo || 6;
  const tiebreakAt = (typeof activeSetFormat.tiebreakAt === 'number' ? activeSetFormat.tiebreakAt : undefined) ?? setTo;
  const finalSetNoTiebreak = isDecidingSet && formatStructure.finalSetFormat?.noTiebreak;

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
    if (streak && streak.side === winner) {
      currentSet.currentStreak = { side: winner, count: streak.count + 1 };
    } else {
      currentSet.currentStreak = { side: winner, count: 1 };
    }
  }

  // Check if in tiebreak
  const isTiebreak = !finalSetNoTiebreak && side1Games === tiebreakAt && side2Games === tiebreakAt;

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
  (point as any).score = gameScore;

  if (gameWon !== undefined) {
    // Reset streak on game completion
    if (isConsecutive) {
      currentSet.currentStreak = undefined;
    }
    // Increment game score
    if (gameWon === 0) {
      currentSet.side1Score = side1Games + 1;
    } else {
      currentSet.side2Score = side2Games + 1;
    }

    // Record tiebreak scores
    if (isTiebreak) {
      currentSet.side1TiebreakScore = side1Points;
      currentSet.side2TiebreakScore = side2Points;
    }

    // Check if set is won
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
      // Start new game
      currentSet.side1GameScores.push(0);
      currentSet.side2GameScores.push(0);
    }
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
  _setsWon: [number, number],
  setsToWin: number,
  scoreIncrement: number = 1,
): void {
  const currentSet = getOrCreateSet(matchUp, true, false);
  const currentSetIndex = matchUp.score.sets.indexOf(currentSet);

  const tiebreakTo = activeSetFormat.tiebreakSet!.tiebreakTo || 11;
  const isNoAD = activeSetFormat.tiebreakSet!.NoAD || false;

  // Initialize game scores if needed
  const side1GameScores = currentSet.side1GameScores || [];
  const side2GameScores = currentSet.side2GameScores || [];
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
  (point as any).number = side1Points + side2Points;

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
  (point as any).score = gameWon === undefined ? `${side1Points}-${side2Points}` : '0-0';

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
  _setsWon: [number, number],
  setsToWin: number,
  scoreIncrement: number = 1,
): void {
  const tiebreakTo = formatStructure.finalSetFormat?.tiebreakSet?.tiebreakTo || 10;
  const isNoAD = formatStructure.finalSetFormat?.tiebreakSet?.NoAD || false;

  const currentSet = getOrCreateSet(matchUp, false, false);
  const currentSetIndex = matchUp.score.sets.indexOf(currentSet);

  // Initialize game scores if needed
  const side1GameScores = currentSet.side1GameScores || [];
  const side2GameScores = currentSet.side2GameScores || [];
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
  (point as any).number = side1Points + side2Points;

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
  (point as any).score = gameWon === undefined ? `${side1Points}-${side2Points}` : '0-0';

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
function handleTimedSet(
  matchUp: MatchUp,
  point: Point,
  winner: 0 | 1,
  _activeSetFormat: SetFormatStructure,
  scoreIncrement: number = 1,
): void {
  const currentSet = getOrCreateSet(matchUp, false, true);
  const currentSetIndex = matchUp.score.sets.indexOf(currentSet);

  // V3-compatible point metadata
  (point as any).set = currentSetIndex;
  (point as any).game = 0;
  (point as any).number = (currentSet.side1Score || 0) + (currentSet.side2Score || 0);

  // Just increment the score — set doesn't auto-complete (with multiplier support)
  if (winner === 0) {
    currentSet.side1Score = (currentSet.side1Score || 0) + scoreIncrement;
  } else {
    currentSet.side2Score = (currentSet.side2Score || 0) + scoreIncrement;
  }

  const s1 = currentSet.side1Score || 0;
  const s2 = currentSet.side2Score || 0;
  (point as any).score = `${s1}-${s2}`;
}

// ============================================================================
// Shared Helpers
// ============================================================================

/**
 * Get or create the current active set
 */
function getOrCreateSet(matchUp: MatchUp, isTiebreakOnly: boolean, isTimed: boolean): SetScore {
  const currentSetIndex = matchUp.score.sets.length - 1;
  if (currentSetIndex >= 0 && matchUp.score.sets[currentSetIndex].winningSide === undefined) {
    return matchUp.score.sets[currentSetIndex];
  }

  // Need new set
  const newSet: SetScore = {
    setNumber: matchUp.score.sets.length + 1,
    side1Score: 0,
    side2Score: 0,
    side1GameScores: [],
    side2GameScores: [],
  };
  if (isTiebreakOnly) newSet.isTiebreakOnly = true;
  if (isTimed) newSet.isTimed = true;

  matchUp.score.sets.push(newSet);
  return newSet;
}

/**
 * Check match completion and finalize if complete
 */
function checkAndFinalizeMatch(matchUp: MatchUp, formatStructure: FormatStructure, setsToWin: number): void {
  const setsWon: [number, number] = [0, 0];
  matchUp.score.sets.forEach((set) => {
    if (set.winningSide === 1) setsWon[0]++;
    if (set.winningSide === 2) setsWon[1]++;
  });

  const isAggregate = isAggregateFormat(formatStructure);
  const exactly = formatStructure.exactly;

  if (isAggregate) {
    // Aggregate: all sets must be played, winner by total score
    const totalSets = exactly || formatStructure.bestOf || 3;
    const completedSets = matchUp.score.sets.filter((s) => s.winningSide !== undefined).length;
    if (completedSets < totalSets) return;

    // Sum scores
    const totals = matchUp.score.sets.reduce(
      (acc, set) => {
        // For tiebreak-only sets, use tiebreak scores
        if (set.side1TiebreakScore !== undefined && set.side2TiebreakScore !== undefined) {
          acc[0] += set.side1TiebreakScore;
          acc[1] += set.side2TiebreakScore;
        } else {
          acc[0] += set.side1Score ?? 0;
          acc[1] += set.side2Score ?? 0;
        }
        return acc;
      },
      [0, 0],
    );

    if (totals[0] !== totals[1]) {
      matchUp.matchUpStatus = 'COMPLETED';
      matchUp.winningSide = totals[0] > totals[1] ? 1 : 2;
      matchUp.endTime = new Date().toISOString();
    }
    // If tied, match continues (conditional tiebreak set may be added)
    return;
  }

  // Standard: first to setsToWin
  const hasWinner = setsWon[0] >= setsToWin || setsWon[1] >= setsToWin;
  if (!hasWinner) return;

  // For exactly formats, all sets must be completed
  if (exactly) {
    const completedSets = matchUp.score.sets.filter((s) => s.winningSide !== undefined).length;
    if (completedSets < exactly) return;
  }

  const matchWinner = setsWon[0] >= setsToWin ? 0 : 1;
  matchUp.matchUpStatus = 'COMPLETED';
  matchUp.winningSide = matchWinner + 1;
  matchUp.endTime = new Date().toISOString();
}

/**
 * Check if a tiebreak game is won
 */
function checkTiebreakWon(
  side1Points: number,
  side2Points: number,
  tiebreakTo: number,
  isNoAD: boolean = false,
): number | undefined {
  const diff = Math.abs(side1Points - side2Points);
  const minWin = isNoAD ? 1 : 2;

  if ((side1Points >= tiebreakTo || side2Points >= tiebreakTo) && diff >= minWin) {
    return side1Points > side2Points ? 0 : 1;
  }
  return undefined;
}

/**
 * Check if a standard game is won (regular game or tiebreak within a standard set)
 */
function checkStandardGameWon(
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

/**
 * Check if a standard set is won
 */
function checkStandardSetWon(
  side1Games: number,
  side2Games: number,
  setFormat: SetFormatStructure,
  isDecidingSet: boolean,
  finalSetFormat?: SetFormatStructure,
): number | undefined {
  const setTo = setFormat.setTo || 6;
  const tiebreakAt = (typeof setFormat.tiebreakAt === 'number' ? setFormat.tiebreakAt : undefined) ?? setTo;
  const finalSetNoTiebreak = isDecidingSet && finalSetFormat?.noTiebreak;

  // For setTo === 1, first to 1 game wins
  if (setTo === 1) {
    if (side1Games >= 1 || side2Games >= 1) {
      return side1Games > side2Games ? 0 : 1;
    }
    return undefined;
  }

  const activeFormat = isDecidingSet && finalSetFormat ? finalSetFormat : setFormat;
  const winBy = activeFormat.winBy || 2;

  // Check if tiebreak was played and won (e.g., 7-6 after tiebreak at 6-6)
  if (!finalSetNoTiebreak && (side1Games === tiebreakAt + 1 || side2Games === tiebreakAt + 1)) {
    return side1Games > side2Games ? 0 : 1;
  }

  // Regular set win (must meet threshold and win by margin)
  if (side1Games >= setTo || side2Games >= setTo) {
    const diff = Math.abs(side1Games - side2Games);
    if (diff >= winBy) {
      return side1Games > side2Games ? 0 : 1;
    }
  }

  return undefined;
}

/**
 * Derive server from match state
 *
 * Exported for use by ScoringEngine.getNextServer() and getScore() situation.
 */
export function deriveServer(matchUp: MatchUp, formatStructure: FormatStructure, setType: SetType): 0 | 1 {
  const baseServer = deriveServerBase(matchUp, formatStructure, setType);

  // Respect initial server choice: if the first recorded point was explicitly
  // served by side 1, all format-based derivations (which assume side 0 starts)
  // must be flipped to maintain correct alternation.
  const firstPointServer = matchUp.history?.points?.[0]?.server;
  if (firstPointServer === 1) {
    return (1 - baseServer) as 0 | 1;
  }
  return baseServer;
}

function deriveServerBase(matchUp: MatchUp, formatStructure: FormatStructure, setType: SetType): 0 | 1 {
  const currentSetIndex = matchUp.score.sets.length - 1;
  const currentSet = currentSetIndex >= 0 ? matchUp.score.sets[currentSetIndex] : undefined;

  // For tiebreak-only sets and match tiebreaks, alternate every 2 points
  if (setType === 'tiebreakOnly' || setType === 'matchTiebreak') {
    const side1GameScores = currentSet?.side1GameScores || [];
    const side2GameScores = currentSet?.side2GameScores || [];
    const pointsPlayed = (side1GameScores[0] || 0) + (side2GameScores[0] || 0);

    // Count total games from all previous sets to determine initial tiebreak server
    let totalPreviousGames = 0;
    for (let i = 0; i < matchUp.score.sets.length - 1; i++) {
      const s = matchUp.score.sets[i];
      totalPreviousGames += (s.side1Score || 0) + (s.side2Score || 0);
    }

    const tiebreakInitialServer = totalPreviousGames % 2;
    const serverOffset = Math.floor(pointsPlayed / 2) % 2;
    return ((tiebreakInitialServer + serverOffset) % 2) as 0 | 1;
  }

  // For timed sets, use simple alternation by scoring events
  if (setType === 'timed') {
    const totalEvents = (currentSet?.side1Score || 0) + (currentSet?.side2Score || 0);
    return (totalEvents % 2) as 0 | 1;
  }

  // Standard sets
  const side1Games = currentSet?.side1Score || 0;
  const side2Games = currentSet?.side2Score || 0;

  const setTo = formatStructure.setFormat?.setTo || 6;
  const tiebreakAt =
    (typeof formatStructure.setFormat?.tiebreakAt === 'number' ? formatStructure.setFormat.tiebreakAt : undefined) ??
    setTo;
  const finalSetNoTiebreak = formatStructure.finalSetFormat?.noTiebreak;

  const inTiebreak = !finalSetNoTiebreak && side1Games === tiebreakAt && side2Games === tiebreakAt;

  if (inTiebreak) {
    const side1GameScores = currentSet?.side1GameScores || [];
    const side2GameScores = currentSet?.side2GameScores || [];
    const tiebreakPoints = (side1GameScores.at(-1) || 0) + (side2GameScores.at(-1) || 0);

    const totalGames = side1Games + side2Games;
    const tiebreakInitialServer = totalGames % 2;
    const serverOffset = Math.floor(tiebreakPoints / 2) % 2;
    return ((tiebreakInitialServer + serverOffset) % 2) as 0 | 1;
  }

  // Regular game: server alternates each game
  const totalGames = side1Games + side2Games;
  return (totalGames % 2) as 0 | 1;
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
