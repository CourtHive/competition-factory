import type { COMPLETED, IN_PROGRESS, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { PointMultiplier } from '@Types/competitionFormat';
import type { ServiceState } from './service';

/**
 * ScoringEngine v2 — the types of the clean-room reducer `state = reduce(configuration, timeline)`.
 *
 * Written from `documentation/docs/scoring-engine/scoring-engine-spec.md` (SE1) and the conformance cases, not
 * from v1's code. Section numbers in comments (§ n) are that page's.
 */

/** 0-indexed side: 0 is side 1 (§ 1.3) */
export type Side = 0 | 1;
/** 1-indexed side: 1 is side 1 (§ 1.3) */
export type SideNumber = 1 | 2;
export type Pair = [number, number];

/** the configuration an engine is built from (§ 1.1) */
export type ScoringConfiguration = {
  matchUpFormat?: string;
  competitionFormat?: {
    matchUpFormat?: string;
    pointMultipliers?: PointMultiplier[];
    serverRule?: string;
    [key: string]: unknown;
  };
  pointMultipliers?: PointMultiplier[];
};

/** an entry's facts: whatever the caller supplied, read field by field and validated before use (§ 2) */
export type EntryData = Record<string, unknown>;

/** one timeline entry as persisted (§ 12.1); `data` holds only the facts the caller supplied */
export type TimelineEntry = {
  type: string;
  data?: EntryData;
  timestamp?: string;
  pointIndex?: number;
  [key: string]: unknown;
};

/** a set as the state records it (§ 1.2) */
export type ScoredSet = {
  setNumber: number;
  side1Score: number;
  side2Score: number;
  side1TiebreakScore?: number;
  side2TiebreakScore?: number;
  winningSide?: SideNumber;
  side1GameScores?: number[];
  side2GameScores?: number[];
  isTiebreakOnly?: boolean;
  /** a timed segment (§ 6.5) */
  isTimed?: boolean;
  /** a segment closed, with or without a winner (§ 1.2, § 6.4) */
  segmentComplete?: boolean;
};

/** the game in play in the last set, when one has points (§ 4.1, § 5) */
export type GameInPlay = {
  /** the score of the game: points, or point values in a segment scored in units */
  score: Pair;
  /** the points played in it (its count, whatever their values) */
  pointsPlayed: number;
  /** a consecutive-points game: the side on a run and its length (§ 4.1 rule 4) */
  run?: { side: Side; length: number };
};

/** a materialized point (§ 11.1): its recorded facts plus its coordinates */
export type ScoredPoint = {
  [key: string]: unknown;
  index: number;
  pointNumber: number;
  winner: Side;
  winningSide: SideNumber;
  set: number;
  game: number;
  number: number;
  score: string;
  scoreValue?: number;
  timestamp?: string;
};

/** the statuses scoring itself produces (§ 1.2); any other is set outside scoring */
export type MatchStatus = typeof TO_BE_PLAYED | typeof IN_PROGRESS | typeof COMPLETED;

export type ScoringState = {
  matchUpStatus: MatchStatus;
  winningSide?: SideNumber;
  sets: ScoredSet[];
  points: ScoredPoint[];
  game?: GameInPlay;
  /** what the timeline has said about service (§ 10) */
  service: ServiceState;
  /** scoring entries (point, game, set) accepted so far: a second baseline is refused once there are any (§ 2.5) */
  scoringEntries: number;
};

/** why an accepted input recorded nothing (the API's `ignored` codes) */
export type IgnoredCode = 'NO_WINNER' | 'MATCH_COMPLETED' | 'NO_SET_BEYOND_N' | 'TIEBREAK_IN_PLAY';

export type Refusal = { code: string; message: string };

/** what one action did: recorded, accepted and ignored, or refused before anything was written (§ 2) */
export type StepOutcome =
  { recorded: true } | { recorded: false; ignored: IgnoredCode } | { recorded: false; refused: Refusal };
