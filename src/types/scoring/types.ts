/**
 * UMO v4.0 - TODS TypeScript Interfaces
 *
 * Pure TypeScript types matching TODS specification
 * All structures are JSON-serializable
 */

// ============================================================================
// TODS Core Types
// ============================================================================

/**
 * TODS MatchUp - Central data structure
 */
export interface MatchUp {
  matchUpId: string;
  matchUpFormat: string;
  matchUpStatus: MatchUpStatus;
  matchUpType: MatchUpType;
  sides: Side[];
  score: Score;
  winningSide?: number;
  startTime?: string;
  endTime?: string;
  schedule?: Schedule;
  collectionPosition?: number;
  roundNumber?: number;
  roundPosition?: number;
  createdAt?: string;
  updatedAt?: string;

  // Optional: When true, flip the base server derivation. When false, don't flip.
  // When undefined, fall back to first-point inference.
  // Set via ScoringEngine.setServer() to correct server tracking mid-match.
  serverFlip?: boolean;

  // Optional: History for undo functionality
  history?: MatchUpHistory;
}

/**
 * Side represents one player or team
 */
export interface Side {
  sideNumber: number;
  participantId?: string;
  participant?: Participant;
  lineUp?: TeamCompetitor[];
}

/**
 * TODS Participant
 */
export interface Participant {
  participantId: string;
  participantName?: string;
  participantType: ParticipantType;
  participantRole: ParticipantRole;
  participantStatus?: ParticipantStatus;
  person?: Person;
  individualParticipants?: Participant[];
}

/**
 * Person information
 */
export interface Person {
  personId?: string;
  standardGivenName?: string;
  standardFamilyName?: string;
  nationalityCode?: string;
  sex?: 'MALE' | 'FEMALE' | 'OTHER';
}

/**
 * Team competitor in a lineUp (for substitution tracking)
 */
export interface TeamCompetitor {
  participantId: string;
  collectionAssignments?: CollectionAssignment[];
}

/**
 * Collection assignment for team lineUp
 */
export interface CollectionAssignment {
  collectionId: string;
  collectionPosition?: number;
  previousParticipantId?: string;
  substitutionOrder?: number;
}

/**
 * Substitution event recorded in match history
 */
export interface SubstitutionEvent {
  sideNumber: 1 | 2;
  outParticipantId: string;
  inParticipantId: string;
  beforePointIndex: number;
  timestamp?: string;
}

/**
 * Score structure
 */
export interface Score {
  sets: SetScore[];
  scoreStringSide1?: string;
  scoreStringSide2?: string;
}

/**
 * Set score
 */
export interface SetScore {
  setNumber: number;
  side1Score?: number;
  side2Score?: number;
  side1TiebreakScore?: number;
  side2TiebreakScore?: number;
  side1GameScores?: number[];
  side2GameScores?: number[];
  winningSide?: number;
  setFormat?: string;
  /** Game indices that are hard boundaries (not recalculated past) */
  hardBoundaries?: number[];
  /** Current consecutive point streak for TYPTI format */
  currentStreak?: { side: 0 | 1; count: number };
  /** Whether this set is tiebreak-only (the entire set is one tiebreak game) */
  isTiebreakOnly?: boolean;
  /** Whether this set is timed */
  isTimed?: boolean;
}

/**
 * Schedule information
 */
export interface Schedule {
  scheduledTime?: string;
  scheduledDate?: string;
  venueId?: string;
  courtId?: string;
}

/**
 * History for undo functionality
 */
export interface MatchUpHistory {
  points: Point[];
  states?: MatchUpState[];
  entries?: ScoreEntry[];
  substitutions?: SubstitutionEvent[];
}

/**
 * Score entry for tracking game/set/segment-level inputs
 * alongside point-level entries in history
 */
export interface ScoreEntry {
  type: 'point' | 'game' | 'set' | 'endSegment' | 'setInitialScore' | 'substitution' | 'setServer';
  data: any;
  timestamp: string;
  pointIndex?: number;
}

/**
 * Point record stored in match history
 *
 * @remarks
 * Points use 0-based player indices (NOT TODS sideNumber):
 * - 0 = side 1 (first player/team)
 * - 1 = side 2 (second player/team)
 *
 * **MCP Decorations:**
 * Rich point metadata from Match Charting Project includes serve locations,
 * stroke types, court positions, and rally sequences. These decorations are
 * compatible with hive-eye-tracker visualization requirements.
 */
export interface Point {
  /** Sequential point number (1-indexed) */
  pointNumber: number;

  /** Winner of the point: 0 = side 1, 1 = side 2 (player index, not sideNumber) */
  winner: 0 | 1;

  /** Winner of the point: 1 = side 1, 2 = side 2 (TODS sideNumber) */
  winningSide?: 1 | 2;

  /** Server of the point: 0 = side 1, 1 = side 2 (player index, not sideNumber) */
  server?: 0 | 1;

  /** Server side: 1 = side 1, 2 = side 2 (TODS sideNumber) */
  serverSideNumber?: 1 | 2;

  /** Specific participant serving (for doubles rotation tracking) */
  serverParticipantId?: string;

  /** ISO 8601 timestamp when point was played */
  timestamp?: string;

  /** Number of shots in the rally */
  rallyLength?: number;

  /** Score after this point (e.g., "15-0") */
  score?: string;

  // MCP Decorations (from Match Charting Project data)
  /** Result of the point */
  result?: PointResult;

  /** Stroke type used on the final shot */
  stroke?: StrokeType;

  /** Hand/wing used on the final shot */
  hand?: 'Forehand' | 'Backhand';

  /** Which serve (1st or 2nd) */
  serve?: 1 | 2;

  /** Serve location */
  serveLocation?: ServeLocation;

  /** Full rally shot sequence with details */
  rally?: RallyShot[];

  /** Court location information */
  location?: string;

  /** Was this a break point? */
  breakpoint?: boolean;

  /** Original MCP code for traceability */
  code?: string;

  // Engine-computed decorations
  /** Points each side needs to win current game: [side1, side2] */
  pointsToGame?: [number, number];

  /** Points each side needs to win current set: [side1, side2] */
  pointsToSet?: [number, number];

  /** Points each side needs to win the match: [side1, side2] */
  pointsToMatch?: [number, number];

  /** Games each side needs to win current set: [side1, side2] */
  gamesToSet?: [number, number];

  /** Which court side the serve is from */
  serveSide?: 'deuce' | 'ad';

  /** Whether the receiver is one point from winning the game */
  isBreakpoint?: boolean;

  // Score value & active players (Phase 3)
  /** Effective score increment (1 for normal, 2+ with multipliers) */
  scoreValue?: number;

  /** Active players per side at the time of this point */
  activePlayers?: [string, string] | [string[], string[]];

  // Override decorations (set by tracker/user)
  /** Serve was from the wrong court side */
  wrongSide?: boolean;

  /** Wrong player was serving */
  wrongServer?: boolean;

  /** Point was awarded as a penalty */
  penaltyPoint?: boolean;

  /** Specific penalty type from competition format profile */
  penaltyType?: string;

  /** Game boundary after this point should not be recalculated past */
  hardBoundary?: boolean;
}

/**
 * Point result types (how the point ended)
 */
export type PointResult =
  | 'Ace'
  | 'Winner'
  | 'Serve Winner'
  | 'Forced Error'
  | 'Unforced Error'
  | 'Double Fault'
  | 'Penalty'
  | 'Unknown';

/**
 * Stroke types in tennis
 */
export type StrokeType =
  | 'Forehand'
  | 'Backhand'
  | 'Forehand Slice'
  | 'Backhand Slice'
  | 'Forehand Volley'
  | 'Backhand Volley'
  | 'Overhead Smash'
  | 'Backhand Overhead Smash'
  | 'Forehand Drop Shot'
  | 'Backhand Drop Shot'
  | 'Forehand Lob'
  | 'Backhand Lob'
  | 'Forehand Half-volley'
  | 'Backhand Half-volley'
  | 'Forehand Drive Volley'
  | 'Backhand Drive Volley'
  | 'Trick Shot'
  | 'Unknown Shot';

/**
 * Serve locations
 */
export type ServeLocation = 'Wide' | 'Body' | 'T';

/**
 * Rally shot with court position and stroke details
 */
export interface RallyShot {
  /** Shot number in the rally (1-indexed) */
  shotNumber: number;

  /** Player who hit this shot (0 or 1) */
  player: 0 | 1;

  /** Stroke type */
  stroke: StrokeType;

  /** Direction of shot (1=FH side, 2=middle, 3=BH side) */
  direction?: 1 | 2 | 3;

  /** Depth of shot */
  depth?: 'shallow' | 'deep' | 'very deep';

  /** Court position */
  position?: 'baseline' | 'net' | 'approach';

  /** Original MCP code for this shot */
  code?: string;
}

/**
 * Saved state for undo
 */
export interface MatchUpState {
  score: Score;
  matchUpStatus: MatchUpStatus;
  winningSide?: number;
}

// ============================================================================
// Enums & Constants
// ============================================================================

export type MatchUpStatus =
  | 'TO_BE_PLAYED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ABANDONED'
  | 'DEFAULTED'
  | 'RETIRED'
  | 'WALKOVER';

export type MatchUpType = 'SINGLES' | 'DOUBLES' | 'TEAM';

export type ParticipantType = 'INDIVIDUAL' | 'PAIR' | 'TEAM';

export type ParticipantRole = 'COMPETITOR' | 'ALTERNATE' | 'SEED';

export type ParticipantStatus = 'ACTIVE' | 'INACTIVE' | 'WITHDRAWN';

// ============================================================================
// Function Options
// ============================================================================

/**
 * Options for creating a matchUp
 */
export interface CreateMatchUpOptions {
  matchUpId?: string;
  matchUpFormat: string;
  participants?: Participant[];
  isDoubles?: boolean;
  matchUpType?: MatchUpType;
}

/**
 * Options for adding a point
 *
 * @remarks
 * The winner and server use 0-based player indices (NOT TODS sideNumber):
 * - 0 = side 1 (first player/team)
 * - 1 = side 2 (second player/team)
 *
 * This matches the common point-by-point notation used in tennis datasets
 * where points are represented as strings like "0011001100..." where each
 * character indicates the winner of that point (0 or 1).
 *
 * @example
 * ```typescript
 * // Player 1 (side 1) wins the point
 * addPoint(matchUp, { winner: 0 });
 *
 * // Player 2 (side 2) wins the point
 * addPoint(matchUp, { winner: 1, server: 0 });
 * ```
 */
export interface AddPointOptions {
  // 0-indexed convention (existing)
  /** Winner of the point: 0 = side 1, 1 = side 2 (player index, not sideNumber) */
  winner?: 0 | 1;

  /** Server of the point: 0 = side 1, 1 = side 2 (player index, not sideNumber) */
  server?: 0 | 1;

  // 1-indexed convention (TODS-aligned)
  /** Winner of the point: 1 = side 1, 2 = side 2 (TODS sideNumber) */
  winningSide?: 1 | 2;

  /** Server side: 1 = side 1, 2 = side 2 (TODS sideNumber) */
  serverSideNumber?: 1 | 2;

  /** Specific participant serving (for doubles rotation tracking) */
  serverParticipantId?: string;

  /** Override score increment for this point (default 1, used by timed/IONSport formats) */
  scoreValue?: number;

  /** ISO 8601 timestamp when point was played */
  timestamp?: string;

  /** Number of shots in the rally (optional metadata) */
  rallyLength?: number;

  /** Point result for multiplier resolution (e.g., 'Ace', 'Winner') */
  result?: PointResult;

  /** Specific penalty type from competition format profile */
  penaltyType?: string;

  // Override decorations
  /** Serve was from the wrong court side */
  wrongSide?: boolean;

  /** Wrong player was serving */
  wrongServer?: boolean;

  /** Point was awarded as a penalty */
  penaltyPoint?: boolean;
}

/**
 * Options for getting scoreboard
 */
export interface GetScoreboardOptions {
  perspective?: number;
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

// ============================================================================
// Internal Scoring Types (not exposed in TODS)
// ============================================================================

/**
 * Internal format structure (from matchUpFormatCode.parse)
 *
 * Matches the full ParsedFormat from tods-competition-factory grammar:
 * SET3-S:6/TB7, SET7XA-S:T10P, HAL2A-S:T45, SET3-S:TB11@RALLY, SET5-S:5-G:3C, etc.
 */
export interface FormatStructure {
  bestOf?: number;
  exactly?: number;
  aggregate?: boolean;
  matchRoot?: string; // Only when NOT 'SET': 'HAL' | 'QTR' | 'PER' | 'INN' | 'RND' | 'FRM' | 'MAP' | 'MAT'
  matchMods?: string[]; // Unknown modifier letters (forward compat)
  setFormat?: SetFormatStructure;
  finalSetFormat?: SetFormatStructure;
  gameFormat?: GameFormatStructure;
  matchUpConstraint?: MatchUpConstraintStructure;
  simplified?: boolean; // True for standalone timed (T20, T10P)
}

/**
 * Match-level constraint structure (e.g., game time cap)
 */
export interface MatchUpConstraintStructure {
  timed?: boolean;
  minutes?: number;
}

/**
 * Set format structure
 *
 * Four mutually exclusive set types:
 * 1. Standard set: has setTo (e.g., S:6/TB7)
 * 2. Tiebreak-only set: has tiebreakSet (e.g., S:TB11)
 * 3. Timed set: has timed+minutes (e.g., S:T10P)
 * 4. Outs-based set: has outs (e.g., S:O3 — baseball/wiffle ball innings)
 */
export interface SetFormatStructure {
  // Standard set
  setTo?: number;
  tiebreakAt?: number | string;
  tiebreakFormat?: TiebreakFormatStructure;
  noTiebreak?: boolean;
  NoAD?: boolean;
  winBy?: number;
  // Tiebreak-only set (mutually exclusive with setTo)
  tiebreakSet?: TiebreakFormatStructure;
  // Timed set
  timed?: boolean;
  minutes?: number;
  based?: string; // 'P' (points) | 'G' (games, default)
  modifier?: string;
  // Outs-based set (baseball/wiffle ball innings)
  outs?: number;
  // Game format within set
  gameFormat?: GameFormatStructure;
}

/**
 * Tiebreak format structure
 */
export interface TiebreakFormatStructure {
  tiebreakTo?: number;
  modifier?: string; // 'RALLY' for rally scoring
  NoAD?: boolean; // Win-by-1 tiebreak
}

/**
 * Game format structure
 */
export interface GameFormatStructure {
  type?: 'CONSECUTIVE' | 'TRADITIONAL';
  count?: number; // Consecutive points per game (for TYPTI)
  deuceAfter?: number; // Deuce cap: 1=golden point, 3=Star Point, undefined=unlimited
  NoAD?: boolean;
}

/**
 * Set type resolved from format + current state
 */
export type SetType = 'standard' | 'tiebreakOnly' | 'timed' | 'matchTiebreak';

// ============================================================================
// Engine API Types
// ============================================================================

/**
 * Options for ending a timed segment
 */
export interface EndSegmentOptions {
  /** Which set/segment to end (1-indexed, defaults to current) */
  setNumber?: number;
  /** When the segment ended */
  timestamp?: string;
  /** Reason for ending */
  reason?: 'time' | 'mercy' | 'manual';
}

/**
 * Options for setting initial score (late arrival)
 */
export interface InitialScoreOptions {
  /** Completed sets */
  sets: Array<{
    side1Score: number;
    side2Score: number;
    side1TiebreakScore?: number;
    side2TiebreakScore?: number;
    winningSide?: number;
  }>;
  /** Current in-progress set's game score */
  currentSetScore?: {
    side1Score: number;
    side2Score: number;
  };
  /** Current in-progress game's point score */
  currentGameScore?: {
    side1Points: number;
    side2Points: number;
  };
  /** Who is currently serving */
  server?: 0 | 1;
}

/**
 * Options for adding a complete set score (Phase 2: set-level input)
 */
export interface AddSetOptions {
  /** Side 1 game/point score for this set */
  side1Score: number;
  /** Side 2 game/point score for this set */
  side2Score: number;
  /** Side 1 tiebreak score (if tiebreak was played) */
  side1TiebreakScore?: number;
  /** Side 2 tiebreak score (if tiebreak was played) */
  side2TiebreakScore?: number;
  /** Winning side (1 or 2). Can be inferred from scores + format */
  winningSide?: 1 | 2;
  /** ISO 8601 timestamp */
  timestamp?: string;
}

/**
 * Options for adding a game result (Phase 2: game-level input)
 */
export interface AddGameOptions {
  /** Winner of the game: 0 = side 1, 1 = side 2 (player index) */
  winner: 0 | 1;
  /** Tiebreak score if this was a tiebreak game [side1, side2] */
  tiebreakScore?: [number, number];
  /** ISO 8601 timestamp */
  timestamp?: string;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Point situation booleans for the NEXT point to be played
 */
export interface PointSituation {
  /** Receiver is 1 point from winning the current game */
  isBreakPoint: boolean;
  /** Server is 1 point from winning the current game */
  isGamePoint: boolean;
  /** Either side is 1 point from winning the current set */
  isSetPoint: boolean;
  /** Either side is 1 point from winning the match */
  isMatchPoint: boolean;
  /** NoAD format and both sides at deuce (deciding point) */
  isGoldenPoint: boolean;
  /** Currently in a tiebreak game */
  isTiebreak: boolean;
  /** Who serves next: 0 = side 1, 1 = side 2 */
  server?: 0 | 1;
}

/**
 * Score query result
 */
export interface ScoreResult {
  sets: SetScore[];
  scoreString: string;
  games?: number[];
  points?: number[];
  /** Display-formatted point values, e.g. ['40', 'AD'], ['15', '30'] */
  pointDisplay?: [string, string];
  /** Situation booleans for the next point to be played */
  situation?: PointSituation;
}

/**
 * Statistics result
 */
export interface Statistics {
  totalPoints: number;
  pointsWon: number[];
  gamesWon: number[];
  setsWon: number[];
  aces?: number[];
  doubleFaults?: number[];
  breakPoints?: number[];
}

// ============================================================================
// Episode Types
// ============================================================================

/**
 * Episode point context — enriched per-point data within an episode
 */
export interface EpisodePoint {
  /** 0-indexed point index in match history */
  index: number;
  /** Point number within current game (0-indexed) */
  number: number;
  /** Winner: 0 = side 1, 1 = side 2 */
  winner: 0 | 1;
  /** Server: 0 = side 1, 1 = side 2 */
  server?: 0 | 1;
  /** Score display at this point (e.g. "15-30") */
  score?: string;
  /** Point result (e.g. 'Ace', 'Winner') */
  result?: string;
}

/**
 * Episode game context
 */
export interface EpisodeGame {
  /** Game index within the set (0-indexed) */
  index: number;
  /** Whether this game is a tiebreak */
  isTiebreak: boolean;
  /** Whether a game was completed on this point */
  complete: boolean;
  /** Winner of this game if complete */
  winner?: 0 | 1;
}

/**
 * Episode set context
 */
export interface EpisodeSet {
  /** Set index (0-indexed) */
  index: number;
  /** Whether a set was completed on this point */
  complete: boolean;
  /** Winner of this set if complete */
  winner?: 0 | 1;
}

/**
 * Episode "needed" context — points/games needed to win at each level
 */
export interface EpisodeNeeded {
  /** Points each side needs to win current game: [side1, side2] */
  pointsToGame?: [number, number];
  /** Points each side needs to win current set: [side1, side2] */
  pointsToSet?: [number, number];
  /** Points each side needs to win the match: [side1, number] */
  pointsToMatch?: [number, number];
  /** Games each side needs to win current set: [side1, side2] */
  gamesToSet?: [number, number];
  /** Whether this is a breakpoint */
  isBreakpoint?: boolean;
}

/**
 * Episode — a single point enriched with full game/set/match context
 *
 * Transforms flat point history into structured episodes suitable for
 * visualization, timeline rendering, and detailed analysis.
 */
export interface Episode {
  /** Action type (always 'addPoint') */
  action: 'addPoint';
  /** Point-level data */
  point: EpisodePoint;
  /** Game-level context */
  game: EpisodeGame;
  /** Set-level context */
  set: EpisodeSet;
  /** Points/games needed at each level (before this point was played) */
  needed: EpisodeNeeded;
  /** Who serves the next point (0 or 1) */
  nextService: number;
  /** Point result type (e.g. 'Ace', 'Winner') */
  result?: string;
  /** Whether the match is complete after this point */
  complete: boolean;
}
