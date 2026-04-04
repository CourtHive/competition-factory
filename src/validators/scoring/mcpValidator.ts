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

import { createMatchUp } from '@Mutate/scoring/createMatchUp';
import { addPoint } from '@Mutate/scoring/addPoint';
import { getScore } from '@Query/scoring/getScore';
import { deduceMatchUpFormat } from '@Query/scoring/deduceMatchUpFormat';
import type { MatchUp, AddPointOptions } from '@Types/scoring/types';
import { parseCSV, groupByMatch, parseMCPPoint, type MCPPoint, type MCPMatch } from './mcpParser';

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

/**
 * Extract final score from MCP data
 */
function extractFinalScore(points: MCPPoint[]): string | undefined {
  if (!points || points.length === 0) return undefined;

  // Get the last point to find the final score
  const lastPoint = points.at(-1);
  if (!lastPoint) return undefined;

  // MCP CSV has Set1, Set2 columns with final set scores
  const set1 = lastPoint.Set1;
  const set2 = lastPoint.Set2;
  const set3 = (lastPoint as any).Set3;
  const set4 = (lastPoint as any).Set4;
  const set5 = (lastPoint as any).Set5;

  const sets: string[] = [];
  if (set1) sets.push(`${set1}-${set2}`);
  if (set3) sets.push(`${set3}-${set2 || '0'}`);
  if (set4) sets.push(`${set4}-${set2 || '0'}`);
  if (set5) sets.push(`${set5}-${set2 || '0'}`);

  return sets.length > 0 ? sets.join(', ') : undefined;
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

  // Try to extract expected score from MCP data
  const expectedScore = extractFinalScore(mcpMatch.points);

  // Determine format
  let matchUpFormat: string;
  let formatDeduced = false;

  if (providedFormat) {
    matchUpFormat = providedFormat;
  } else if (expectedScore) {
    // Deduce format from expected score (like pbpValidator)
    matchUpFormat = deduceMatchUpFormat(expectedScore);
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

function decorateLastPoint(matchUp: MatchUp, parsedPoint: any) {
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
  const isComplete = matchUp.matchUpStatus === 'COMPLETED';

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
