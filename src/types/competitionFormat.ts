/**
 * competitionFormat — defines HOW a sport is played
 *
 * Sits alongside tieFormat (WHAT is played) and matchUpFormat (scoring structure).
 * Covers timers, penalties, substitutions, point multipliers, point descriptors.
 *
 * Hierarchical resolution (same pattern as tieFormat/matchUpFormat):
 *   matchUp > structure > drawDefinition > event
 */

import { Extension } from './tournamentTypes';

// ============================================================================
// Core competitionFormat
// ============================================================================

export type ServerRule = 'ALTERNATE_GAMES' | 'WINNER_SERVES';

export interface competitionFormat {
  competitionFormatId?: string;
  competitionFormatName?: string;
  matchUpFormat?: string;
  sport?: SportUnion;
  timerProfile?: TimerProfile;
  timeoutRules?: TimeoutRules;
  substitutionRules?: SubstitutionRules;
  playerRules?: PlayerRules;
  penaltyProfile?: PenaltyProfile;
  penaltyBoxProfile?: PenaltyBoxProfile;
  pointProfile?: PointProfile;
  pointMultipliers?: PointMultiplier[];
  /** Server determination rule: 'ALTERNATE_GAMES' (default) or 'WINNER_SERVES' */
  serverRule?: ServerRule;
  extensions?: Extension[];
  notes?: string;
}

// ============================================================================
// Sport Union
// ============================================================================

/** Sports a competition format can describe. */
export enum SportEnum {
  TENNIS = 'TENNIS',
  PADEL = 'PADEL',
  PICKLEBALL = 'PICKLEBALL',
  SQUASH = 'SQUASH',
  BADMINTON = 'BADMINTON',
  TABLE_TENNIS = 'TABLE_TENNIS',
  INTENNSE = 'INTENNSE',
  TYPTI = 'TYPTI',
  VOLLEYBALL = 'VOLLEYBALL',
  FENCING = 'FENCING',
  OTHER = 'OTHER',
}
export type SportUnion = `${SportEnum}`;

// ============================================================================
// Timer Profile
// ============================================================================

export interface TimerProfile {
  shotClockSeconds?: number;
  segmentTimers?: SegmentTimer[];
  changeoverSeconds?: number;
  setBreakSeconds?: number;
}

export interface SegmentTimer {
  segmentType: 'set' | 'half' | 'quarter' | 'period' | 'round' | 'frame' | 'map';
  minutes: number;
  direction?: 'up' | 'down';
  stoppageTime?: boolean;
}

// ============================================================================
// Timeout Rules
// ============================================================================

export type TimeoutScope = 'MATCHUP' | 'SET' | 'HALF' | 'SEGMENT';

export interface TimeoutRules {
  count: number;
  per: TimeoutScope;
  durationSeconds?: number;
  maxPerSide?: number; // Max timeouts per competitor/team side. Omit = count is total shared.
}

// ============================================================================
// Substitution Rules
// ============================================================================

export type SubstitutionTiming = 'BETWEEN_GAMES' | 'BETWEEN_POINTS' | 'ANY';

export interface SubstitutionRules {
  allowed: boolean;
  maxPerMatchUp?: number; // Omit = unlimited; 0 = none despite allowed: true
  maxPerSegment?: number; // Omit = unlimited per segment
  allowedMatchUpTypes?: ('SINGLES' | 'DOUBLES')[];
  timing?: SubstitutionTiming;
  minRosterSize?: number;
  maxRosterSize?: number;
}

// ============================================================================
// Player Rules
// ============================================================================

export interface PlayerRules {
  maxMinutesPerSegment?: number; // e.g., 6 for INTENNSE SINGLES
  matchUpTypes?: ('SINGLES' | 'DOUBLES')[]; // Which matchUp types this applies to
}

// ============================================================================
// Penalty Profile
// ============================================================================

export interface PenaltyProfile {
  sport?: SportUnion;
  penaltyTypes: PenaltyTypeDefinition[];
  escalation?: PenaltyEscalation[];
}

export interface PenaltyTypeDefinition {
  penaltyType: string;
  label: string;
  category?: 'code_violation' | 'time_violation' | 'conduct' | 'other';
}

export interface PenaltyEscalation {
  step: number;
  consequence: 'warning' | 'point' | 'game' | 'default';
}

// ============================================================================
// Penalty Box Profile
// ============================================================================

export interface PenaltyBoxProfile {
  durationSeconds: number; // Time in penalty box before player can return (e.g., 120 for INTENNSE)
}

// ============================================================================
// Point Profile
// ============================================================================

export interface PointProfile {
  sport?: SportUnion;
  pointResults: PointResultDefinition[];
  strokeTypes?: string[];
  serveLocations?: string[];
}

export interface PointResultDefinition {
  result: string;
  label: string;
  isError?: boolean;
  isServe?: boolean;
}

// ============================================================================
// Point Multiplier
// ============================================================================

export interface PointMultiplier {
  condition: { results?: string[]; strokes?: string[]; setTypes?: string[] };
  value: number;
}
