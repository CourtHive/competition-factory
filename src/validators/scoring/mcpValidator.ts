/**
 * mcpValidator - Validate Match Charting Project CSV data
 *
 * Core API for MCP validation:
 * 1. Takes MCP CSV data (from Match Charting Project)
 * 2. Parses shot sequences with rich decorations
 * 3. Builds complete MatchUp with decorated points
 * 4. Validates scores and point progressions
 * 5. Returns MatchUp ready for hive-eye-tracker visualization
 */

import { parseCSV, groupByMatch, parseMCPPoint, type MCPPoint, type MCPMatch, type ParsedMCPPoint } from './mcpParser';
import { deduceMatchUpFormat } from '@Query/scoring/deduceMatchUpFormat';
import type { MatchUp, AddPointOptions } from '@Types/scoring/types';
import { createMatchUp } from '@Mutate/scoring/createMatchUp';
import { addPoint } from '@Mutate/scoring/addPoint';
import { getScore } from '@Query/scoring/getScore';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';

// ============================================================================
// Types
// ============================================================================

export interface MCPValidationOptions {
  // CSV content or file path
  csvData: string;

  // Specific match ID to validate (optional, validates all if not provided)
  matchId?: string;

  // Match format (if known), otherwise will be deduced from score
  matchUpFormat?: string;

  // Validate final score matches expected (from CSV data)
  validateScore?: boolean;

  // Debug mode - show detailed steps
  debug?: boolean;
}

export interface MCPValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];

  // Validation details
  matchesProcessed: number;
  pointsProcessed: number;
  matchUps: MatchUp[];

  // Summary stats
  totalAces: number;
  totalDoubleFaults: number;
  totalWinners: number;
  totalUnforcedErrors: number;
  totalForcedErrors: number;
}

export interface MCPMatchResult {
  valid: boolean;
  errors: string[];
  warnings: string[];

  matchUp: MatchUp;
  pointsProcessed: number;

  // Score validation
  expectedScore?: string;
  actualScore: string;
  scoreMatches?: boolean;
  formatDeduced: boolean;

  // Stats
  aces: number;
  doubleFaults: number;
  winners: number;
  unforcedErrors: number;
  forcedErrors: number;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Parse match_id to extract player names
 */
function parseMatchId(matchId: string): {
  player1: string;
  player2: string;
  date?: string;
  tournament?: string;
} {
  // Format: YYYYMMDD-Gender-Tournament-Round-Player1-Player2
  // Example: 20151122-M-Tour_Finals-F-Roger_Federer-Novak_Djokovic
  const parts = matchId?.split('-') ?? [];

  if (parts.length < 6) {
    return {
      player1: 'Player 1',
      player2: 'Player 2',
    };
  }

  const date = parts[0];
  const tournament = parts[2]?.replaceAll('_', ' ');
  const player1 = parts[4]?.replaceAll('_', ' ') || 'Player 1';
  const player2 = parts[5]?.replaceAll('_', ' ') || 'Player 2';

  return {
    player1,
    player2,
    date,
    tournament,
  };
}

// ============================================================================
// Expected score, read from MCP's own columns
// ============================================================================

/**
 * What MCP's score columns say about a match, independently of the point-by-point replay.
 *
 * Every MCP row carries the state BEFORE its point: `Set1`/`Set2` are the SETS WON by each player
 * (not set scores), `Gm1`/`Gm2` the games in the current set and `Pts` the points in the current
 * game, from the server's perspective. A set's final games are therefore read off the row of its
 * last point: the games before that point plus one for the point's winner. A set that ends from
 * level games (6-6 to 7-6, or 0-0 to 1-0 for a match tiebreak) was decided by a tiebreak, and the
 * points charted at that games count are its tiebreak points.
 */
export interface MCPExpectedScore {
  // Score string in the same shape getScore() builds: '7-6(0), 4-6, 6-1'
  scoreString: string;
  // Sets won per player when the chart ends
  setsWon: [number, number];
  // Sets needed to win times two, less one: 3 or 5
  bestOf: number;
  // Whether a player has won the sets needed
  complete: boolean;
}

interface SetGames {
  games: [number, number];
  tiebreak?: [number, number];
}

const GAME_POINT_VALUES = new Set(['15', '30', '40', 'AD']);

function parsePair(first: string | undefined, second: string | undefined): [number, number] | undefined {
  const a = Number.parseInt(first ?? '', 10);
  const b = Number.parseInt(second ?? '', 10);
  if (Number.isNaN(a) || Number.isNaN(b)) return undefined;
  return [a, b];
}

function pointWinnerIndex(point: MCPPoint): 0 | 1 | undefined {
  if (point.PtWinner === '1') return 0;
  if (point.PtWinner === '2') return 1;
  return undefined;
}

interface GamePointOutcome {
  gameWon: boolean;
  // The point was a tiebreak point (numeric points at level games)
  tiebreak: boolean;
}

/**
 * Whether the point ends the game it is played in, read from `Pts` (server's perspective).
 *
 * Only needed for a chart's last row, which has no following row to compare sets-won against:
 * MCP's reduced export has no after-point columns, so the game-point test is made from the points
 * before. A tiebreak is recognised by numeric points at level games (15, 30 and 40 read as game
 * points); its end is read as first to 7 by 2, which a chart cut short inside a 10-point tiebreak
 * would misread (the replay then reports an incomplete match, so the anomaly still surfaces).
 */
function pointEndsGame(point: MCPPoint, games: [number, number]): GamePointOutcome {
  const [serverPoints = '', receiverPoints = ''] = point.Pts?.split('-') ?? [];
  const winnerIsServer = point.PtWinner === point.Svr;
  const [winner, loser] = winnerIsServer ? [serverPoints, receiverPoints] : [receiverPoints, serverPoints];

  const gameNotation = GAME_POINT_VALUES.has(winner) || GAME_POINT_VALUES.has(loser);
  const tiebreak = games[0] === games[1] && !gameNotation && /^\d+$/.test(winner) && /^\d+$/.test(loser);
  if (tiebreak) {
    const winnerAfter = Number.parseInt(winner, 10) + 1;
    return { tiebreak, gameWon: winnerAfter >= 7 && winnerAfter - Number.parseInt(loser, 10) >= 2 };
  }

  const gameWon = winner === 'AD' || (winner === '40' && loser !== '40' && loser !== 'AD');
  return { tiebreak, gameWon };
}

interface LastPointOutcome {
  gameWon: boolean;
  setWon: boolean;
}

/**
 * Whether a set can end on these games: a tiebreak decided it, or the winner leads by two with at
 * least four games. Guards a chart cut short at a game's end from being read as a finished set; a
 * set to six cut at 5-3 is still misread, which the replay's incomplete-match warning then surfaces.
 */
function setCanEndOn(tiebreak: boolean, gamesAfter: [number, number]): boolean {
  if (tiebreak) return true;
  const lead = Math.abs(gamesAfter[0] - gamesAfter[1]);
  return lead >= 2 && Math.max(...gamesAfter) >= 4;
}

/**
 * What a chart's last point decided. It has no following row to compare sets-won against, so the
 * after-point copies (`Set1_2`/`Set2_2`, `Gm1_2`/`Gm2_2`, see parseCSV) answer when the export
 * carries them; otherwise the game-point test does, and a game won on the last charted point ends
 * the set when the games allow it.
 */
function lastPointOutcome(
  point: MCPPoint,
  setsBefore: [number, number],
  gamesBefore: [number, number],
  gamesAfter: [number, number],
): LastPointOutcome {
  const setsAfterCopy = parsePair(point.Set1_2, point.Set2_2);
  const gamesAfterCopy = parsePair(point.Gm1_2, point.Gm2_2);
  if (setsAfterCopy && gamesAfterCopy) {
    const setWon = setsAfterCopy[0] !== setsBefore[0] || setsAfterCopy[1] !== setsBefore[1];
    const gameWon = setWon || gamesAfterCopy[0] !== gamesBefore[0] || gamesAfterCopy[1] !== gamesBefore[1];
    return { gameWon, setWon };
  }

  const { gameWon, tiebreak } = pointEndsGame(point, gamesBefore);
  return { gameWon, setWon: gameWon && setCanEndOn(tiebreak, gamesAfter) };
}

function formatSet({ games: [a, b], tiebreak }: SetGames): string {
  if (!tiebreak) return `${a}-${b}`;
  return a > b ? `${a}-${b}(${tiebreak[1]})` : `${a}(${tiebreak[0]})-${b}`;
}

function setsWonFrom(sets: SetGames[]): [number, number] {
  const setsWon: [number, number] = [0, 0];
  for (const { games } of sets) setsWon[games[0] > games[1] ? 0 : 1]++;
  return setsWon;
}

interface CollectedSets {
  sets: SetGames[];
  // Games of the set in progress when the chart ends, if any were won
  partial?: [number, number];
  // Points were charted after a player had won two sets
  continuedPastTwo: boolean;
}

/**
 * Points won at an unchanged games count: the tiebreak's points if the set ends from level games.
 */
function createLevelTally() {
  let tally: [number, number] = [0, 0];
  let tallyGames: [number, number] | undefined;
  return {
    record(games: [number, number], winner: 0 | 1) {
      if (!tallyGames || tallyGames[0] !== games[0] || tallyGames[1] !== games[1]) {
        tally = [0, 0];
        tallyGames = games;
      }
      tally[winner]++;
    },
    points: () => tally,
  };
}

/**
 * Whether the point ended its set, and the games standing after it: read from the next row's
 * before-point columns when there is one, else from the last row itself.
 */
function stateAfterPoint(
  point: MCPPoint,
  next: MCPPoint | undefined,
  setsBefore: [number, number],
  gamesBefore: [number, number],
  gamesAfter: [number, number],
): { setWon: boolean; current: [number, number] } {
  const nextSets = next && parsePair(next.Set1, next.Set2);
  const nextGames = next && parsePair(next.Gm1, next.Gm2);
  if (nextSets && nextGames) {
    return { setWon: nextSets[0] !== setsBefore[0] || nextSets[1] !== setsBefore[1], current: nextGames };
  }

  const outcome = lastPointOutcome(point, setsBefore, gamesBefore, gamesAfter);
  return { setWon: outcome.setWon, current: outcome.gameWon ? gamesAfter : gamesBefore };
}

/**
 * Walk the chart and collect each set's games: a set ends on the row before the sets-won columns
 * change, or on the last row when that row's point ends the set. A set that ends from level games
 * was decided by a tiebreak, whose points are the ones charted at that games count.
 */
function collectSets(points: MCPPoint[]): CollectedSets | undefined {
  const sets: SetGames[] = [];
  const tally = createLevelTally();
  let partial: [number, number] | undefined;
  let continuedPastTwo = false;

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const setsBefore = parsePair(point.Set1, point.Set2);
    const games = parsePair(point.Gm1, point.Gm2);
    if (!setsBefore || !games) return undefined;

    const winner = pointWinnerIndex(point);
    if (winner === undefined) continue;
    if (Math.max(...setsBefore) >= 2) continuedPastTwo = true;
    tally.record(games, winner);

    const gamesAfter: [number, number] = [games[0], games[1]];
    gamesAfter[winner]++;
    const { setWon, current } = stateAfterPoint(point, points[i + 1], setsBefore, games, gamesAfter);

    if (setWon) {
      const set: SetGames = { games: gamesAfter };
      if (games[0] === games[1]) set.tiebreak = tally.points();
      sets.push(set);
      partial = undefined;
    } else {
      partial = current[0] || current[1] ? current : undefined;
    }
  }

  return { sets, partial, continuedPastTwo };
}

/**
 * Read the match's final score from MCP's columns, with the sets needed to win.
 *
 * Best-of is deduced from the sets won: a player with three has won a best-of-five; a chart that
 * continues after a player reached two is a best-of-five in progress; otherwise best-of-three.
 * A set still in progress when the chart ends contributes its games, so a chart cut short still
 * compares against the replay (which then warns that the match is not complete).
 */
export function extractFinalScore(points: MCPPoint[]): MCPExpectedScore | undefined {
  const rows = points?.filter(Boolean) ?? [];
  if (rows.length === 0) return undefined;

  const collected = collectSets(rows);
  if (!collected || (collected.sets.length === 0 && !collected.partial)) return undefined;

  const { sets, partial, continuedPastTwo } = collected;
  const setsWon = setsWonFrom(sets);
  const bestOf = Math.max(...setsWon) === 3 || continuedPastTwo ? 5 : 3;
  const complete = Math.max(...setsWon) === (bestOf + 1) / 2;
  const setStrings = sets.map(formatSet);
  if (partial) setStrings.push(`${partial[0]}-${partial[1]}`);

  return { scoreString: setStrings.join(', '), setsWon, bestOf, complete };
}

/**
 * Deduce the matchUpFormat for an expected score: set-level details (set length, tiebreak,
 * advantage final set) from the score string, the set count from the sets won.
 */
function deduceFormatFromExpected(expected: MCPExpectedScore): string {
  return deduceMatchUpFormat(expected.scoreString).replace(/^SET\d+/, `SET${expected.bestOf}`);
}

/**
 * Validate single MCP match
 */
export function validateMCPMatch(
  mcpMatch: MCPMatch,
  options: {
    matchUpFormat?: string;
    validateScore?: boolean;
    debug?: boolean;
  } = {},
): MCPMatchResult {
  const { matchUpFormat: providedFormat, validateScore = true, debug = false } = options;

  const errors: string[] = [];
  const warnings: string[] = [];

  // Parse match metadata
  const metadata = parseMatchId(mcpMatch.match_id);

  // Read the expected score from MCP's own columns
  const expected = extractFinalScore(mcpMatch.points);
  const expectedScore = expected?.scoreString;

  // Determine format
  let matchUpFormat: string;
  let formatDeduced = false;

  if (providedFormat) {
    matchUpFormat = providedFormat;
  } else if (expected) {
    // Set count from the sets won, set details from the score (like pbpValidator)
    matchUpFormat = deduceFormatFromExpected(expected);
    formatDeduced = true;
    if (debug) {
      console.log(`Deduced format: ${matchUpFormat} from score: ${expectedScore}`);
    }
  } else {
    // Default format
    matchUpFormat = 'SET3-S:6/TB7';
    formatDeduced = true;
    warnings.push('No format provided, using default SET3-S:6/TB7');
  }

  if (debug) {
    console.log(`Validating match: ${metadata.player1} vs ${metadata.player2}`);
    console.log(`Format: ${matchUpFormat}`);
    console.log(`Total points: ${mcpMatch.points.length}`);
    if (expectedScore) {
      console.log(`Expected score: ${expectedScore}`);
    }
  }

  // Create matchUp
  let matchUp = createMatchUp({
    matchUpFormat,
    matchUpId: mcpMatch.match_id,
  });

  // Add player names to sides
  if (matchUp.sides[0]) {
    matchUp.sides[0].participant = {
      participantId: 'player1',
      participantName: metadata.player1,
      participantType: 'INDIVIDUAL',
      participantRole: 'COMPETITOR',
    };
  }
  if (matchUp.sides[1]) {
    matchUp.sides[1].participant = {
      participantId: 'player2',
      participantName: metadata.player2,
      participantType: 'INDIVIDUAL',
      participantRole: 'COMPETITOR',
    };
  }

  // Process points
  const processed = processValidationPoints(mcpMatch.points, matchUp, { errors, debug });
  matchUp = processed.matchUp;

  // Validate final score
  const validated = validateFinalScore(matchUp, expectedScore, { errors, warnings, validateScore, debug });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    matchUp,
    pointsProcessed: processed.pointsProcessed,
    expectedScore,
    actualScore: validated.actualScore,
    scoreMatches: validated.scoreMatches,
    formatDeduced,
    aces: processed.aces,
    doubleFaults: processed.doubleFaults,
    winners: processed.winners,
    unforcedErrors: processed.unforcedErrors,
    forcedErrors: processed.forcedErrors,
  };
}

function decorateLastPoint(matchUp: MatchUp, parsedPoint: ParsedMCPPoint) {
  if (matchUp.history?.points && matchUp.history.points.length > 0) {
    const lastPoint = matchUp.history.points.at(-1);
    if (lastPoint) {
      if (parsedPoint.result) lastPoint.result = parsedPoint.result;
      if (parsedPoint.stroke) lastPoint.stroke = parsedPoint.stroke;
      if (parsedPoint.hand) lastPoint.hand = parsedPoint.hand;
      if (parsedPoint.serve) lastPoint.serve = parsedPoint.serve;
      if (parsedPoint.serveLocation) lastPoint.serveLocation = parsedPoint.serveLocation;
      if (parsedPoint.rally) lastPoint.rally = parsedPoint.rally;
      if (parsedPoint.rallyLength) lastPoint.rallyLength = parsedPoint.rallyLength;
      if (parsedPoint.code) lastPoint.code = parsedPoint.code;
    }
  }
}

function countResult(
  result: string | undefined,
  stats: { aces: number; doubleFaults: number; winners: number; unforcedErrors: number; forcedErrors: number },
) {
  if (result === 'Ace') stats.aces++;
  if (result === 'Double Fault') stats.doubleFaults++;
  if (result === 'Winner') stats.winners++;
  if (result === 'Unforced Error') stats.unforcedErrors++;
  if (result === 'Forced Error') stats.forcedErrors++;
}

function processSinglePoint(
  mcpPoint: MCPPoint,
  matchUp: MatchUp,
  index: number,
  totalPoints: number,
  debug: boolean,
  errors: string[],
  stats: { aces: number; doubleFaults: number; winners: number; unforcedErrors: number; forcedErrors: number },
): { matchUp: MatchUp; processed: boolean } {
  const currentServer: 0 | 1 = mcpPoint.Svr === '1' ? 0 : 1;

  try {
    const parsedPoint = parseMCPPoint(mcpPoint, currentServer);

    const pointOptions: AddPointOptions = {
      winner: parsedPoint.winner,
      server: parsedPoint.server,
    };

    matchUp = addPoint(matchUp, pointOptions);
    decorateLastPoint(matchUp, parsedPoint);
    countResult(parsedPoint.result, stats);

    if (debug && (index < 5 || index === totalPoints - 1)) {
      const score = getScore(matchUp);
      console.log(`Point ${index + 1}: ${parsedPoint.result || 'Rally'} → ${score.scoreString}`);
    }

    return { matchUp, processed: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`Point ${index + 1}: ${errorMessage}`);
    if (debug) {
      console.error(`Point ${index + 1} failed:`, errorMessage);
    }
    return { matchUp, processed: false };
  }
}

function processValidationPoints(
  points: MCPPoint[],
  inputMatchUp: MatchUp,
  options: { errors: string[]; debug: boolean },
): {
  matchUp: MatchUp;
  pointsProcessed: number;
  aces: number;
  doubleFaults: number;
  winners: number;
  unforcedErrors: number;
  forcedErrors: number;
} {
  const { errors, debug } = options;
  let matchUp = inputMatchUp;
  let pointsProcessed = 0;
  const stats = { aces: 0, doubleFaults: 0, winners: 0, unforcedErrors: 0, forcedErrors: 0 };

  for (let i = 0; i < points?.length; i++) {
    const mcpPoint = points[i];
    if (!mcpPoint) continue;

    const result = processSinglePoint(mcpPoint, matchUp, i, points.length, debug, errors, stats);
    matchUp = result.matchUp;
    if (result.processed) pointsProcessed++;
  }

  return { matchUp, pointsProcessed, ...stats };
}

function validateFinalScore(
  matchUp: MatchUp,
  expectedScore: string | undefined,
  options: { errors: string[]; warnings: string[]; validateScore: boolean; debug: boolean },
): { actualScore: string; scoreMatches?: boolean } {
  const { errors, warnings, validateScore, debug } = options;

  const finalScore = getScore(matchUp);
  const actualScore = finalScore.scoreString;
  const isComplete = matchUp.matchUpStatus === COMPLETED;

  if (!isComplete) {
    warnings.push(`Match not complete. Final score: ${actualScore}`);
  }

  let scoreMatches: boolean | undefined;
  if (validateScore && expectedScore) {
    const normalizedExpected = normalizeScoreString(expectedScore);
    const normalizedActual = normalizeScoreString(actualScore);

    scoreMatches = normalizedExpected === normalizedActual;

    if (!scoreMatches) {
      errors.push(`Score mismatch: expected "${expectedScore}", got "${actualScore}"`);
    }

    if (debug) {
      console.log(`Expected: ${expectedScore} → ${normalizedExpected}`);
      console.log(`Actual: ${actualScore} → ${normalizedActual}`);
      console.log(`Score matches: ${scoreMatches}`);
    }
  }

  if (debug) {
    console.log(`Final score: ${actualScore}`);
    console.log(`Match complete: ${isComplete}`);
    console.log(`Stats logged in processValidationPoints`);
  }

  return { actualScore, scoreMatches };
}

/**
 * Normalize score string for comparison
 * Same logic as pbpValidator
 */
function normalizeScoreString(score: string): string {
  return score
    .replaceAll(/\s+/g, '') // Remove all whitespace
    .replaceAll(',', ', ') // Standardize comma spacing
    .toLowerCase();
}

/**
 * Validate MCP CSV data
 *
 * Main mcpValidator API
 */
export function mcpValidator(options: MCPValidationOptions): MCPValidationResult {
  const { csvData, matchId, matchUpFormat, debug = false } = options;

  const errors: string[] = [];
  const warnings: string[] = [];
  const matchUps: MatchUp[] = [];

  // Parse CSV
  let mcpPoints: MCPPoint[];
  try {
    mcpPoints = parseCSV(csvData);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`Failed to parse CSV: ${errorMessage}`);
    return {
      valid: false,
      errors,
      warnings,
      matchesProcessed: 0,
      pointsProcessed: 0,
      matchUps: [],
      totalAces: 0,
      totalDoubleFaults: 0,
      totalWinners: 0,
      totalUnforcedErrors: 0,
      totalForcedErrors: 0,
    };
  }

  // Group by match
  const matches = groupByMatch(mcpPoints);

  if (debug) {
    console.log(`Parsed ${mcpPoints.length} points from ${matches.length} matches`);
  }

  // Filter by matchId if provided
  const matchesToProcess = matchId ? matches.filter((m) => m.match_id === matchId) : matches;

  if (matchesToProcess.length === 0) {
    errors.push(matchId ? `Match ID not found: ${matchId}` : 'No matches found in CSV data');
    return {
      valid: false,
      errors,
      warnings,
      matchesProcessed: 0,
      pointsProcessed: 0,
      matchUps: [],
      totalAces: 0,
      totalDoubleFaults: 0,
      totalWinners: 0,
      totalUnforcedErrors: 0,
      totalForcedErrors: 0,
    };
  }

  // Stats accumulators
  let totalPointsProcessed = 0;
  let totalAces = 0;
  let totalDoubleFaults = 0;
  let totalWinners = 0;
  let totalUnforcedErrors = 0;
  let totalForcedErrors = 0;

  // Process each match
  for (const match of matchesToProcess) {
    const result = validateMCPMatch(match, { matchUpFormat, debug });

    // Accumulate results
    if (!result.valid) {
      errors.push(...result.errors);
    }
    warnings.push(...result.warnings);
    matchUps.push(result.matchUp);

    totalPointsProcessed += result.pointsProcessed;
    totalAces += result.aces;
    totalDoubleFaults += result.doubleFaults;
    totalWinners += result.winners;
    totalUnforcedErrors += result.unforcedErrors;
    totalForcedErrors += result.forcedErrors;
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    matchesProcessed: matchesToProcess.length,
    pointsProcessed: totalPointsProcessed,
    matchUps,
    totalAces,
    totalDoubleFaults,
    totalWinners,
    totalUnforcedErrors,
    totalForcedErrors,
  };
}

/**
 * Export MatchUp to JSON for hive-eye-tracker
 */
export function exportMatchUpJSON(matchUp: MatchUp): string {
  return JSON.stringify(matchUp, null, 2);
}
