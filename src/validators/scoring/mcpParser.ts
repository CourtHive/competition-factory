/**
 * MCP Parser - Parse Match Charting Project CSV data
 *
 * Converts MCP CSV format to decorated MatchUp with rich point metadata:
 * - Serve locations (Wide, Body, T)
 * - Stroke types (Forehand, Backhand, Volley, etc.)
 * - Court positions and depths
 * - Shot sequences with directions
 * - Point results (Ace, Winner, Error, etc.)
 */

import { isString } from '@Tools/objects';
import type { PointResult, StrokeType, ServeLocation, RallyShot } from '@Types/scoring/types';

// ============================================================================
// Types
// ============================================================================

export interface MCPPoint {
  match_id: string;
  Pt: string;
  Set1: string;
  Set2: string;
  Gm1: string;
  Gm2: string;
  Pts: string;
  Svr: string;
  Ret: string;
  '1st': string;
  '2nd': string;
  PtWinner: string;
  isAce: string;
  isDouble: string;
  isUnforced: string;
  isForced: string;
  isRallyWinner: string;
  rallyCount: string;
  [key: string]: string;
}

export interface MCPMatch {
  match_id: string;
  points: MCPPoint[];
}

export interface ParsedMCPPoint {
  winner: 0 | 1;
  server: 0 | 1;
  result?: PointResult;
  stroke?: StrokeType;
  hand?: 'Forehand' | 'Backhand';
  serve?: 1 | 2;
  serveLocation?: ServeLocation;
  rally?: RallyShot[];
  rallyLength?: number;
  code?: string;
}

interface ShotParseResult {
  serves: string[];
  rally: string[];
  lets?: number;
  terminator?: string;
  result?: string;
  winner?: 'S' | 'R';
  error?: string;
  parse_notes?: string;
  first_serve?: {
    serves: string[];
    lets?: number;
    error?: string;
    parse_notes?: string;
  };
  serve?: 1 | 2;
  code?: string;
}

// ============================================================================
// Shot Code Mappings
// ============================================================================

const SERVE_CODES: Record<string, ServeLocation> = {
  '4': 'Wide',
  '5': 'Body',
  '6': 'T',
};

const FOREHAND_STROKES: Record<string, StrokeType> = {
  f: 'Forehand',
  r: 'Forehand Slice',
  v: 'Forehand Volley',
  o: 'Overhead Smash',
  u: 'Forehand Drop Shot',
  l: 'Forehand Lob',
  h: 'Forehand Half-volley',
  j: 'Forehand Drive Volley',
};

const BACKHAND_STROKES: Record<string, StrokeType> = {
  b: 'Backhand',
  s: 'Backhand Slice',
  z: 'Backhand Volley',
  p: 'Backhand Overhead Smash',
  y: 'Backhand Drop Shot',
  m: 'Backhand Lob',
  i: 'Backhand Half-volley',
  k: 'Backhand Drive Volley',
};

const OTHER_STROKES: Record<string, StrokeType> = {
  t: 'Trick Shot',
  q: 'Unknown Shot',
};

const ALL_STROKES = {
  ...FOREHAND_STROKES,
  ...BACKHAND_STROKES,
  ...OTHER_STROKES,
};

const DEPTHS: Record<string, 'shallow' | 'deep' | 'very deep'> = {
  '7': 'shallow',
  '8': 'deep',
  '9': 'very deep',
};

const DIRECTIONS: Record<string, 1 | 2 | 3> = {
  '1': 1,
  '2': 2,
  '3': 3,
};

const POSITIONS: Record<string, 'baseline' | 'net' | 'approach'> = {
  '+': 'approach',
  '-': 'net',
  '=': 'baseline',
};

const ERRORS: Record<string, string> = {
  n: 'Net',
  w: 'Out Wide',
  d: 'Out Long',
  x: 'Out Wide and Long',
  g: 'Foot Fault',
  e: 'Unknown',
  '!': 'Shank',
};

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Parse point winner from MCP data
 */
export function parsePointWinner(mcpPoint: MCPPoint, serverIndex: 0 | 1): 0 | 1 {
  const winner = mcpPoint.PtWinner;
  // Winner is same as server (1 or 2)
  if (winner === mcpPoint.Svr) {
    return serverIndex;
  } else {
    return (1 - serverIndex) as 0 | 1;
  }
}

/**
 * Parse shot sequence string into components
 *
 * MCP format: Each stroke starts with a letter code (f/b/s/r/v/z/o/p/etc)
 * followed by optional modifiers (numbers, positions, terminators)
 * Serve codes (4/5/6) stand alone
 */
export function shotSplitter(shotSequence: string): string[] {
  const shots: string[] = [];
  let currentShot = '';

  // Stroke code letters that start a new shot
  const strokeCodes = 'fbrsvzouymlhijkpqt';
  // Serve codes that stand alone
  const serveCodes = '456';

  for (let i = 0; i < shotSequence.length; i++) {
    const char = shotSequence[i];
    if (!char) continue;

    // Check if this is a stroke or serve code (starts new shot)
    if (strokeCodes.includes(char) || serveCodes.includes(char)) {
      // Push previous shot if exists
      if (currentShot) {
        shots.push(currentShot);
      }
      currentShot = char;
    }
    // Modifiers attach to current shot
    else {
      currentShot += char;
    }
  }

  // Push final shot
  if (currentShot) {
    shots.push(currentShot);
  }

  return shots;
}

/**
 * Check if shot contains a terminator
 */
function containsTerminator(shot: string): string | undefined {
  if (shot.includes('*')) return '*';
  if (shot.includes('#')) return '#';
  if (shot.includes('@')) return '@';
  return undefined;
}

/**
 * Check if shot is a fault
 */
function shotFault(shot: string | undefined): string | undefined {
  if (!shot) return undefined;
  for (const errorCode of Object.keys(ERRORS)) {
    if (shot.includes(errorCode)) {
      return errorCode;
    }
  }
  return undefined;
}

/**
 * Find serve shots in sequence
 */
function findServes(shots: string[]): string[] {
  const serves: string[] = [];

  for (const shot of shots) {
    if (!shot) continue;
    // Serve codes are 4, 5, 6
    const firstChar = shot[0];
    if (firstChar && /[456]/.test(firstChar)) {
      serves.push(shot);
    } else {
      break;
    }
  }

  return serves;
}

/**
 * Analyze shot sequence into components
 */
export function analyzeSequence(shotSequence: string): ShotParseResult {
  if (!isString(shotSequence)) {
    return { serves: [], rally: [] };
  }
  let result: string | undefined;
  let terminator: string | undefined;
  let ignoredShots: string[] | undefined;

  // Count lets
  const lets = shotSequence.split('c').length - 1;
  // Remove all lets
  shotSequence = shotSequence.split('c').join('');

  const shots = shotSplitter(shotSequence);
  let trimmedShots = shots;

  // Find terminator and trim shots after it
  for (let s = shots.length - 1; s >= 0; s--) {
    const shot = shots[s];
    if (!shot) continue;
    terminator = containsTerminator(shot);
    if (terminator) {
      trimmedShots = shots.slice(0, s + 1);
      ignoredShots = shots.slice(s + 1);
      result = shot;
      break;
    }
  }

  const serves = findServes(trimmedShots);
  const rally = serves.length ? trimmedShots.slice(serves.length) : trimmedShots;

  // Check for simple results without rally
  if (!terminator && !serves.length && rally.length === 1) {
    const code = rally[0];
    if (code && ['S', 'P', 'Q', 'R'].includes(code)) {
      result = code;
      rally.length = 0;
    }
  }

  const analysis: ShotParseResult = { serves, rally };
  if (lets) analysis.lets = lets;
  if (terminator) analysis.terminator = terminator;
  if (result) analysis.result = result;
  if (ignoredShots?.length) {
    // Store but don't use
  }

  return analysis;
}

/**
 * Parse point from serve codes (1st and 2nd serve)
 */
export function pointParser(serves: [string, string]): ShotParseResult {
  const code = serves.join('|');

  // Parse first serve
  const s1result = shotParser(serves[0], 1);

  if (s1result.winner === 'S' || !serves[1]) {
    s1result.serve = 1;
    s1result.code = code;
    return s1result;
  }

  // Parse second serve
  const s2result = shotParser(serves[1], 2);
  s2result.serve = 2;
  s2result.first_serve = {
    serves: s1result.serves,
  };
  if (s1result.lets) s2result.first_serve.lets = s1result.lets;
  if (s1result.error) s2result.first_serve.error = s1result.error;
  if (s1result.parse_notes) s2result.first_serve.parse_notes = s1result.parse_notes;

  s2result.code = code;
  return s2result;
}

/**
 * Parse individual shot sequence
 */
export function shotParser(shotSequence: string, whichServe: 1 | 2): ShotParseResult {
  const parsedShots = analyzeSequence(shotSequence);

  // Immediate server wins
  if (['Q', 'S'].includes(parsedShots.result || '')) {
    parsedShots.winner = 'S';
    return parsedShots;
  }

  // Immediate receiver wins
  if (['P', 'R'].includes(parsedShots.result || '')) {
    parsedShots.winner = 'R';
    return parsedShots;
  }

  // No terminator on second serve = receiver wins
  if (!parsedShots.terminator && !shotFault(parsedShots.serves[0]) && parsedShots.serves.length > 2) {
    parsedShots.winner = 'R';
    return parsedShots;
  }

  // Determine last player (even shots = receiver, odd = server)
  const lastPlayer: 'S' | 'R' = (parsedShots.serves.length + parsedShots.rally.length) % 2 === 0 ? 'R' : 'S';
  let finalShot: string | undefined;
  if (parsedShots.rally.length > 0) {
    finalShot = parsedShots.rally[parsedShots.rally.length - 1];
  } else if (parsedShots.serves.length > 0) {
    finalShot = parsedShots.serves[parsedShots.serves.length - 1];
  }

  // No final shot - continue
  if (!finalShot) {
    return { ...parsedShots, winner: undefined };
  }

  // No rally - check for ace/serve winner/fault
  if (!parsedShots.rally.length) {
    return resolveServeOnlyResult(parsedShots, whichServe);
  }

  // Rally exists - resolve from terminator and shot context
  return resolveRallyResult(parsedShots, lastPlayer, finalShot);
}

function resolveServeOnlyResult(parsedShots: ShotParseResult, whichServe: 1 | 2): ShotParseResult {
  if (parsedShots.terminator === '*') {
    parsedShots.result = 'Ace';
    parsedShots.winner = 'S';
  } else if (parsedShots.terminator === '#') {
    parsedShots.result = 'Serve Winner';
    parsedShots.winner = 'S';
  } else {
    const firstServeFault = shotFault(parsedShots.serves[0]);
    if (firstServeFault) {
      parsedShots.error = ERRORS[firstServeFault];
      if (whichServe === 2) {
        parsedShots.result = 'Double Fault';
        parsedShots.winner = 'R';
      }
    } else {
      parsedShots.parse_notes = 'treated as a fault';
      if (whichServe === 2) {
        parsedShots.result = 'Double Fault';
        parsedShots.winner = 'R';
      }
    }
  }
  return parsedShots;
}

function resolveRallyResult(parsedShots: ShotParseResult, lastPlayer: 'S' | 'R', finalShot: string): ShotParseResult {
  // Special case: serve + immediate error on return (serve winner)
  if (parsedShots.rally.length === 1 && finalShot.includes('#')) {
    parsedShots.result = 'Serve Winner';
    parsedShots.winner = 'S';
    const faultCode = shotFault(finalShot);
    if (faultCode) parsedShots.error = ERRORS[faultCode];
    return parsedShots;
  }

  // Determine result from terminator
  if (finalShot.includes('#')) {
    parsedShots.result = 'Forced Error';
    parsedShots.error = ERRORS[shotFault(finalShot)!];
    parsedShots.winner = lastPlayer === 'R' ? 'S' : 'R';
  } else if (finalShot.includes('*')) {
    parsedShots.result = 'Winner';
    parsedShots.winner = lastPlayer;
  } else if (finalShot.includes('@')) {
    parsedShots.result = 'Unforced Error';
    parsedShots.error = ERRORS[shotFault(finalShot)!];
    parsedShots.winner = lastPlayer === 'R' ? 'S' : 'R';
  } else if (!shotFault(parsedShots.serves[0])) {
    if (parsedShots.serves.length && parsedShots.rally.length) {
      parsedShots.parse_notes = 'no terminator: receiver wins point';
      parsedShots.result = 'Unknown';
      parsedShots.winner = 'R';
    } else if (parsedShots.rally.length === 1 && shotFault(finalShot)) {
      parsedShots.error = ERRORS[shotFault(finalShot)!];
      parsedShots.winner = lastPlayer === 'R' ? 'S' : 'R';
    }
  } else if (parsedShots.rally.length === 1 && shotFault(finalShot)) {
    parsedShots.error = ERRORS[shotFault(finalShot)!];
    parsedShots.winner = lastPlayer === 'R' ? 'S' : 'R';
  }

  return parsedShots;
}

/**
 * Extract stroke type from shot code
 */
function extractStroke(shotCode: string | undefined): StrokeType | undefined {
  if (!shotCode) return undefined;
  for (const char of shotCode) {
    const stroke = ALL_STROKES[char as keyof typeof ALL_STROKES];
    if (stroke) {
      return stroke;
    }
  }
  return undefined;
}

/**
 * Extract serve location from serve code
 */
function extractServeLocation(serveCode: string | undefined): ServeLocation | undefined {
  if (!serveCode) return undefined;
  for (const char of serveCode) {
    const location = SERVE_CODES[char as keyof typeof SERVE_CODES];
    if (location) {
      return location;
    }
  }
  return undefined;
}

/**
 * Build rally shot sequence with positions
 */
function buildRallySequence(serves: string[], rallyShots: string[], serverIndex: 0 | 1): RallyShot[] {
  const sequence: RallyShot[] = [];
  let shotNumber = 1;
  let currentPlayer = serverIndex;

  // Add serve as first shot if valid serve
  if (serves.length > 0 && !shotFault(serves[serves.length - 1])) {
    const serveCode = serves[serves.length - 1];
    const stroke = extractStroke(serveCode) || 'Forehand';

    sequence.push({
      shotNumber: shotNumber++,
      player: currentPlayer,
      stroke,
      code: serveCode,
    });

    currentPlayer = (1 - currentPlayer) as 0 | 1;
  }

  // Add rally shots
  for (const shotCode of rallyShots) {
    const stroke = extractStroke(shotCode);
    if (!stroke) continue;

    const shot: RallyShot = {
      shotNumber: shotNumber++,
      player: currentPlayer,
      stroke,
      code: shotCode,
    };

    // Extract direction
    for (const char of shotCode) {
      const direction = DIRECTIONS[char as keyof typeof DIRECTIONS];
      if (direction !== undefined) {
        shot.direction = direction;
      }
    }

    // Extract depth
    for (const char of shotCode) {
      const depth = DEPTHS[char as keyof typeof DEPTHS];
      if (depth) {
        shot.depth = depth;
      }
    }

    // Extract position
    for (const char of shotCode) {
      const position = POSITIONS[char as keyof typeof POSITIONS];
      if (position) {
        shot.position = position;
      }
    }

    sequence.push(shot);
    currentPlayer = (1 - currentPlayer) as 0 | 1;
  }

  return sequence;
}

/**
 * Parse MCP point into decorated point
 */
export function parseMCPPoint(mcpPoint: MCPPoint, serverIndex: 0 | 1): ParsedMCPPoint {
  const winner = parsePointWinner(mcpPoint, serverIndex);

  const first = mcpPoint['1st'] || '';
  const second = mcpPoint['2nd'] || '';

  // Handle empty/invalid serve codes
  if (!first && !second) {
    return {
      winner,
      server: serverIndex,
      result: 'Unknown',
    };
  }

  const parsed = pointParser([first, second]);

  const point: ParsedMCPPoint = {
    winner,
    server: serverIndex,
  };

  // Add result
  if (parsed.result) {
    point.result = parsed.result as PointResult;
  }

  // Add serve number
  if (parsed.serve) {
    point.serve = parsed.serve;
  }

  // Add serve location
  const serveCode = parsed.serve === 1 ? first : second;
  const serveLocation = extractServeLocation(serveCode);
  if (serveLocation) {
    point.serveLocation = serveLocation;
  }

  // Add stroke from final shot
  const finalRallyShot = parsed.rally[parsed.rally.length - 1];
  if (finalRallyShot) {
    const stroke = extractStroke(finalRallyShot);
    if (stroke) {
      point.stroke = stroke;
      // Determine hand from stroke
      if (Object.values(FOREHAND_STROKES).includes(stroke)) {
        point.hand = 'Forehand';
      } else if (Object.values(BACKHAND_STROKES).includes(stroke)) {
        point.hand = 'Backhand';
      }
    }
  }

  // Build rally sequence
  const rallySequence = buildRallySequence(parsed.serves, parsed.rally, serverIndex);
  if (rallySequence.length > 0) {
    point.rally = rallySequence;
    point.rallyLength = rallySequence.length;
  }

  // Add code
  if (parsed.code) {
    point.code = parsed.code;
  }

  return point;
}

/**
 * Parse CSV content into MCP points
 */
export function parseCSV(csvContent: string): MCPPoint[] {
  if (!csvContent || !isString(csvContent)) return [];
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0]?.split(',') || [];
  const points: MCPPoint[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const values = line.split(',');
    const point: Record<string, string> = {};

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      if (header) {
        point[header] = values[j] || '';
      }
    }

    points.push(point as MCPPoint);
  }

  return points;
}

/**
 * Group points by match_id
 */
export function groupByMatch(points: MCPPoint[]): MCPMatch[] {
  if (!Array.isArray(points)) return [];
  const matches = new Map<string, MCPPoint[]>();

  for (const point of points) {
    const matchId = point.match_id;
    if (!matches.has(matchId)) {
      matches.set(matchId, []);
    }
    matches.get(matchId)!.push(point);
  }

  return Array.from(matches.entries()).map(([match_id, points]) => ({
    match_id,
    points,
  }));
}
