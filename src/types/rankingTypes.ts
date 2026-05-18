import type { EventTypeUnion } from './tournamentTypes';

// ─── Top-Level Policy ────────────────────────────────────────────────

/** Top-level ranking policy attached via POLICY_TYPE_RANKING_POINTS */
export interface RankingPolicy {
  policyName?: string;

  /** Optional version identifier for historical recalculation */
  policyVersion?: string;

  /** Date range during which this entire policy is valid */
  validDateRange?: DateRange;

  awardProfiles: AwardProfile[];
  qualityWinProfiles?: QualityWinProfile[];
  aggregationRules?: AggregationRules;

  /** Global defaults — overridable per-profile */
  requireWinForPoints?: boolean;
  requireWinFirstRound?: boolean;

  /** How to attribute doubles/pair points to individuals */
  doublesAttribution?: DoublesAttribution;

  /**
   * How to resolve category when matching profiles.
   * - 'eventCategory' (default): use event.category + event.gender
   * - 'participantPrimary': use participant's primary category scale
   */
  categoryResolution?: 'eventCategory' | 'participantPrimary';

  /**
   * Maps TierClassification (system + value) to numeric ranking levels.
   * Keyed by system, then by value within that system.
   *
   * Example:
   * ```
   * tierToLevel: {
   *   ITF_JUNIOR: { '1': 1, '2': 2, '3': 3, 'J500': 4, 'J300': 5 },
   *   ATP: { 'Grand Slam': 1, '1000': 2, '500': 3, '250': 4 },
   *   PPA: { 'Major': 1, 'Gold': 2, 'Silver': 3, 'Bronze': 4 },
   * }
   * ```
   */
  tierToLevel?: Record<string, Record<string, number>>;

  /**
   * How results contribute to ranking lists.
   * - 'per-category' (default): each ranking list is computed from awards
   *   filtered to its category, plus optional categoryAggregation rules.
   * - 'shared': one pool of awards feeds every age-eligible ranking list
   *   the participant qualifies for. No categoryAggregation rules are
   *   evaluated under this model. (Tennis Canada paradigm.)
   */
  pointPoolModel?: PointPoolModel;

  /**
   * Ranking lists that are filtered views of another list, not computed
   * independently. Captures ČTS's "U16 is a reduced extract of the U18
   * ranking" — and could also model TE's "14&U-eligible players appear
   * on both 14&U and 16&U lists" if we ever choose to refactor that.
   *
   * At snapshot-generation time, the derived snapshot is produced by
   * filtering the source snapshot's entries — no independent aggregation.
   */
  derivedRankings?: DerivedRanking[];
}

export type PointPoolModel = 'per-category' | 'shared';

// ─── Category Scope ──────────────────────────────────────────────────

/**
 * Category matching criteria for award profiles.
 * Mirrors the factory's rich Category model + Event-level fields.
 *
 * All fields are optional. An empty CategoryScope matches everything.
 * Multiple values in an array field are OR'd (match any).
 * Multiple populated fields are AND'd (all must match).
 */
export interface CategoryScope {
  /** Match event.category.ageCategoryCode */
  ageCategoryCodes?: string[];

  /** Match event.gender (MALE, FEMALE, MIXED, ANY) */
  genders?: string[];

  /** Match event.category.categoryName */
  categoryNames?: string[];

  /** Match event.category.type (AGE, BOTH, LEVEL) */
  categoryTypes?: string[];

  /** Match event.category.ratingType */
  ratingTypes?: string[];

  /** Match event.category.ballType */
  ballTypes?: string[];

  /** Match event.wheelchairClass */
  wheelchairClasses?: string[];

  /** Match event.category.subType */
  subTypes?: string[];
}

// ─── Award Profile Scope & Definition ────────────────────────────────

/**
 * Scoping criteria that determine when an awardProfile applies.
 *
 * All scope fields are optional. An empty scope matches everything
 * (useful for a single catch-all profile in simple policies).
 * When multiple fields are populated, all must match (AND logic).
 * Within an array field, any match suffices (OR logic).
 */
export interface AwardProfileScope {
  dateRanges?: DateRange[];
  eventTypes?: EventTypeUnion[];
  drawTypes?: string[];
  drawSizes?: number[];
  maxDrawSize?: number;
  stages?: string[];
  stageSequences?: number[];
  levels?: number[];
  maxLevel?: number;
  flights?: FlightConfig;
  maxFlightNumber?: number;
  participationOrder?: number;
  category?: CategoryScope;

  /**
   * Optional priority for deterministic profile selection.
   * Higher values win when multiple profiles match.
   * When omitted, specificity scoring determines precedence.
   */
  priority?: number;
}

export interface AwardProfile extends AwardProfileScope {
  /** Human-readable label for auditing/debugging */
  profileName?: string;

  /** Points by finishing position (key = max finishingPositionRange value) */
  finishingPositionRanges?: Record<number, PositionValue>;

  /** Alternative: awards based on finishing round won/lost */
  finishingRound?: Record<number, { won?: PositionValue; lost?: PositionValue }>;

  /** Points per win in consolation/secondary structures */
  perWinPoints?: PerWinPointsDef | PerWinPointsDef[];

  /** Simple points-per-win value (shorthand) */
  pointsPerWin?: number | LevelKeyed<number>;

  /** Restrict finishing-position points to specific participationOrders */
  finishingPositionPoints?: { participationOrders: number[] };

  /**
   * Cap on matches that earn per-win points.
   * Counted entity: matchUps won within the scope of this profile.
   * Can be a flat number or level-keyed.
   * Scope: per participant per draw (resets across draws in same event).
   */
  maxCountableMatches?: number | LevelKeyed<number | undefined>;

  /**
   * Bonus points for specific finishing positions, independent of
   * finishingPositionRanges. Useful for L6-7 champion/finalist bonuses.
   */
  bonusPoints?: BonusPointDef[];

  /** Override global requireWinForPoints at profile level */
  requireWinForPoints?: boolean;
  requireWinFirstRound?: boolean;
}

// ─── Position Value Resolution ───────────────────────────────────────

/**
 * A PositionValue resolves to a numeric point award through getAwardPoints.
 *
 * Resolution forms (simplest to most complex):
 *
 *   75                                    → flat value
 *   { value: 75 }                         → explicit flat value
 *   { level: { 1: 3000, 2: 1650 } }      → keyed by level
 *   { level: [3000, 1650, 900] }          → indexed by level (level-1)
 *   { flights: [540, 351, 270, 189] }     → indexed by flightNumber (flight-1)
 *   { level: { 4: { flights: [...] } } }  → level then flight
 *   [{ drawSize: 64, threshold: true, value: 3000 }, { value: 2800 }]
 *                                         → array: first drawSize match wins
 *
 * Array form: evaluated in order. Each element can carry `drawSize`,
 * `drawSizes`, `threshold` (drawSize >= N), and `requireWin`.
 * First match wins. An element with no drawSize/drawSizes is the default.
 */
export type PositionValue = number | PositionValueObject | PositionValueObject[];

export interface PositionValueObject {
  value?: number;

  /** Level-keyed lookup. Record<level, value> or array indexed by level-1. */
  level?: Record<number, number | FlightValues> | (number | FlightValues)[];

  /** Flight-keyed lookup. Array indexed by flightNumber-1. */
  flights?: number[];

  /** Flight values with explicit keys */
  f?: number[];

  /** Specific drawSize this entry applies to */
  drawSize?: number;

  /** Array of drawSizes this entry applies to */
  drawSizes?: number[];

  /** When true, this entry applies to drawSizes >= drawSize */
  threshold?: boolean;

  /** Require a win to earn these points */
  requireWin?: boolean;

  /** For finishingRound: separate won/lost values */
  won?: number | PositionValueObject;
  lost?: number | PositionValueObject;
}

/** Flight-keyed values (typically arrays indexed by flightNumber-1) */
export interface FlightValues {
  flights?: number[];
  f?: number[];
}

// ─── Per-Win Points ──────────────────────────────────────────────────

export interface PerWinPointsDef {
  /** Which participationOrders this applies to */
  participationOrders?: number[];

  /** Flat value */
  value?: number;

  /** Level-keyed value. Record<level, value|LineValues> or array indexed by level-1. */
  level?: Record<number, number | LineValues> | (number | LineValues)[];

  /** Team line-position values */
  line?: number[];

  /** Max line positions that earn points */
  limit?: number;
}

/** Line-position-keyed values for team events */
export interface LineValues {
  line?: number[];
  limit?: number;
  f?: number[];
}

// ─── Bonus Points ────────────────────────────────────────────────────

export interface BonusPointDef {
  /** Which finishing positions earn the bonus (e.g., [1] for champion) */
  finishingPositions: number[];

  /** Bonus value. Always use Record<level, value> for level-keyed, never arrays. */
  value: number | LevelKeyed<number>;
}

// ─── Quality Win Profiles ────────────────────────────────────────────

export interface QualityWinProfile {
  /** Ranking ranges and their bonus point values */
  rankingRanges: QualityWinRange[];

  /** Which ranking scale to use for opponent ranking lookup */
  rankingScaleName: string;

  /** Event type for the ranking scale lookup (defaults to matchUp's eventType) */
  rankingEventType?: string;

  /**
   * When to snapshot opponent ranking:
   * - 'tournamentStart' (default): use ranking as of tournament startDate
   * - 'matchDate': use ranking as of matchUp endDate
   * - 'latestAvailable': use most recent scaleItem regardless of date
   */
  rankingSnapshot?: 'tournamentStart' | 'matchDate' | 'latestAvailable';

  /** Fallback behavior when opponent has no ranking */
  unrankedOpponentBehavior?: 'noBonus' | 'useDefaultRank';
  defaultRank?: number;

  // ── Scope limiters ──
  levels?: number[];
  eventTypes?: EventTypeUnion[];
  drawTypes?: string[];
  stages?: string[];
  dateRanges?: DateRange[];
  category?: CategoryScope;

  /** Maximum total quality-win bonus per tournament per participant */
  maxBonusPerTournament?: number;

  /** Whether walkovers/defaults count as quality wins */
  includeWalkovers?: boolean;
}

export interface QualityWinRange {
  /** Inclusive ranking range [low, high] */
  rankRange: [number, number];
  /** Bonus points awarded for a win against opponent in this range */
  value: number;
}

// ─── Aggregation Rules ───────────────────────────────────────────────

/**
 * Controls how per-tournament PointAwards are aggregated into a ranking list.
 *
 * Real-world ranking systems don't simply sum all points. They count the
 * best N results from separate "buckets". The `countingBuckets` array
 * defines these buckets.
 *
 * If `countingBuckets` is omitted, all PointAwards are summed (simple case).
 */
export interface AggregationRules {
  countingBuckets?: CountingBucket[];

  /** Simple fallback: global best-of-N across all results. 0 or undefined = count all. */
  bestOfCount?: number;

  /** Rolling period in days (e.g., 365 for 52-week ranking) */
  rollingPeriodDays?: number;

  /** Point decay function */
  decayFunction?: 'none' | 'linear' | 'stepped';
  decaySteps?: { afterDays: number; multiplier: number }[];

  /** Separate ranking lists by gender (default: true) */
  separateByGender?: boolean;

  /** Generate per-category ranking lists (default: true) */
  perCategory?: boolean;

  /** Minimum number of counting results (across all buckets) to receive a ranking */
  minCountableResults?: number;

  /** Max results counted from a single tournament level (e.g., max 2 from L7) */
  maxResultsPerLevel?: Record<number, number>;

  /** How to attribute doubles points to individual rankings */
  doublesAttribution?: DoublesAttribution;

  /** Tiebreaker criteria, applied in order */
  tiebreakCriteria?: TiebreakCriterion[];

  /**
   * Category aggregation rules: how point awards earned in one category
   * contribute to ranking lists in another. Evaluated by generateRankingList
   * at aggregation time (not at award-emission time).
   *
   * - USTA Junior uses these for downward 20% carry + upward play-up.
   * - Tennis Europe uses them for the 14&U max-2-of-6 cap and the
   *   12&U→14&U carry (via rerateTo).
   * - LTA uses them for Combined Ranking pool composition.
   * - Tennis Australia uses them for the De Minaur Junior Tour caps + carve-outs.
   * - ČTS uses an empty array (Article 28 prohibits cross-category rerate).
   * - Tennis Canada (pointPoolModel='shared') does not evaluate these.
   */
  categoryAggregation?: CategoryAggregationRule[];
}

// ─── Category Aggregation Rules ──────────────────────────────────────

/**
 * How point awards earned in one category contribute to ranking lists
 * in another. Evaluated by generateRankingList at aggregation time.
 *
 * PointAwards themselves are never rewritten — the rule is interpreted
 * at list-generation, not at award-emission. (Tennis Europe's 12U starting
 * points are an emission-time concern handled separately.)
 */
export interface CategoryAggregationRule {
  /** Human-readable label for auditing. */
  ruleName?: string;

  /** Source categories whose awards feed this rule. */
  source: CategoryScope;

  /** Target category that the carried contribution lands in. */
  target: CategoryScope;

  /**
   * Multiplier on source point components.
   * - 0.2 : USTA 20% next-older carry
   * - 1.0 : USTA upward play-up, Tennis Europe play-up, Tennis Australia
   * Mutually exclusive with rerateTo.
   */
  multiplier?: number;

  /**
   * Re-rate the source result against a different award profile
   * (by profileName). Captures DTB Rangliste's own-age-determines-
   * round-value rule. Tennis Europe's 12U starting-points carry is
   * handled at emission time, not via this field.
   * Mutually exclusive with multiplier.
   */
  rerateTo?: { profileName: string };

  /**
   * Boolean form (USTA): participant must have at least one direct
   * target-category award to appear on the target list at all.
   */
  requireParticipationInTarget?: boolean;

  /**
   * Numeric form (LTA, DTB participation floor): minimum number of
   * direct target-category results required. Stronger than the boolean.
   */
  minResultsFromTarget?: number;

  /**
   * Bounded window of eligible source categories relative to target.
   * LTA: { olderBy: 2 } — up to 2 age groups above target.
   * If omitted, source is whatever CategoryScope matches.
   */
  eligibleSourceWindow?: {
    olderBy?: number;
    youngerBy?: number;
  };

  /**
   * After a player ages up into the target, prior-category results
   * remain eligible for this many months. LTA: 12.
   */
  retentionMonthsAfterAging?: number;

  /**
   * Maximum carried results per participant per rule.
   * Tennis Europe: 2 (singles from 16U). Tennis Australia: 3 singles + 3 doubles.
   */
  maxCarriedResults?: number;

  /**
   * Carried results compete with native target awards for bestOfCount
   * slots (default true); when false, contributions sum on top.
   */
  subjectToBucketLimits?: boolean;

  /**
   * Which point components to carry. Defaults to all components.
   */
  carryComponents?: PointComponent[];

  /**
   * Exclusion predicates for source awards. Tennis Australia's
   * "J1000 14u results excluded for player aging up to 16u Finals".
   * Any matching predicate disqualifies the source award from this rule.
   */
  excludedSourceFilters?: SourceFilter[];
}

export interface SourceFilter {
  levels?: number[];
  drawTypes?: string[];
  eventTiers?: string[];
  /** Disqualify when participant has aged out of source category by snapshot date. */
  ageEligibility?: 'agingUpToTarget' | 'agingDownFromSource';
}

// ─── Derived Rankings ────────────────────────────────────────────────

/**
 * A ranking list that is a filtered view of another list, not an
 * independent computation. Used by ČTS where the U16 ("ml. dorost")
 * ranking is a reduced extract of the U18 ("dorost") ranking.
 *
 * At snapshot-generation time, the derived snapshot's entries are
 * the source snapshot's entries filtered by the rules below, with
 * ranks re-numbered 1..N within the filtered set.
 */
export interface DerivedRanking {
  /** The category whose ranking list is being derived (e.g., U16). */
  category: CategoryScope;

  /** The source ranking list this is derived from (e.g., U18). */
  derivedFrom: CategoryScope;

  /** Filter applied to source entries to produce derived entries. */
  filter: DerivedFilter;
}

export interface DerivedFilter {
  /**
   * Exclude players who will age up at end of current period.
   * Captures ČTS's rCŽ (reduced ranking) rule.
   */
  excludePlayersAgingUp?: boolean;

  /**
   * Limit to participants whose effective age is in this range at
   * snapshot date. Inclusive bounds. ČTS U16 = { max: 16 }.
   */
  ageRange?: { min?: number; max?: number };

  /** Further category match (e.g., gender) applied as conjunction. */
  additionalScope?: CategoryScope;
}

export interface CountingBucket {
  /** Human-readable label for this bucket */
  bucketName?: string;

  /** Which eventTypes feed into this bucket (undefined = all) */
  eventTypes?: EventTypeUnion[];

  /**
   * Which components of PointAward to sum for this bucket.
   * Valid values: 'positionPoints', 'perWinPoints', 'bonusPoints', 'qualityWinPoints'
   * If omitted, sums the total `points` field (all components).
   */
  pointComponents?: PointComponent[];

  /** How many best results to count from this bucket (0 or undefined = all) */
  bestOfCount?: number;

  /** Max results from a single tournament level within this bucket */
  maxResultsPerLevel?: Record<number, number>;

  /** Minimum results in this bucket required (independent of global min) */
  minResults?: number;

  /** Optional level filter — only include results from these levels */
  levels?: number[];

  /**
   * Mandatory counting rules. Results from mandatory levels always count,
   * even if they are worse than optional results. Mandatory results fill
   * bestOfCount slots first; remaining slots are filled with the best
   * optional results. If mandatory results exceed bestOfCount, all
   * mandatory results still count (mandatory takes priority).
   */
  mandatoryRules?: MandatoryRule[];
}

/**
 * Defines a set of tournament levels whose results must always count
 * toward a participant's ranking, regardless of point value.
 */
export interface MandatoryRule {
  /** Human-readable label (e.g., 'Grand Slams', 'ATP 1000') */
  ruleName?: string;

  /** Tournament levels that are mandatory under this rule */
  levels: number[];

  /** If set, only the best N results from these levels count; otherwise all count */
  bestOfCount?: number;
}

export type PointComponent = 'positionPoints' | 'perWinPoints' | 'bonusPoints' | 'qualityWinPoints';

export type DoublesAttribution = 'fullToEach' | 'splitEven' | 'teamOnly';

export type TiebreakCriterion = 'headToHead' | 'mostWins' | 'highestSingleResult' | 'mostCountingResults' | 'rating';

// ─── Point Award Output ──────────────────────────────────────────────

/**
 * Granular point breakdown for a single participant in a single draw.
 * Every field needed for downstream aggregation, debugging, and display.
 */
export interface PointAward {
  participantId: string;
  personId?: string;

  // Context
  tournamentId?: string;
  eventId?: string;
  drawId: string;
  structureId?: string;
  eventType: string;
  drawType?: string;
  stage?: string;
  stageSequence?: number;

  // Category snapshot (what category was the event when points were earned)
  category?: {
    ageCategoryCode?: string;
    categoryName?: string;
    ratingType?: string;
    gender?: string;
  };

  // Point breakdown
  points: number;
  positionPoints: number;
  perWinPoints: number;
  qualityWinPoints: number;
  bonusPoints: number;

  // Line-based points (team events)
  linePoints?: number;
  collectionPosition?: number;

  // Match data
  winCount: number;
  rangeAccessor: string | number;

  // Dates
  startDate?: string;
  endDate?: string;

  // Level for cross-tournament comparison
  level?: number;

  // Audit: which profile was selected and why
  profileName?: string;
}

// ─── Ranking List Output ─────────────────────────────────────────────

export interface RankingListEntry {
  rank: number;
  participantId: string;
  personId?: string;

  totalPoints: number;
  countingResults: number;

  /** Per-bucket breakdown (when countingBuckets defined) */
  bucketTotals?: Record<string, number>;

  tournamentResults: PointAward[];

  // Tiebreaker metadata (for deterministic ordering)
  tiebreakValues?: Record<TiebreakCriterion, number>;

  // Whether this entry meets minimum requirements
  meetsMinimum: boolean;
}

// ─── Supporting Types ────────────────────────────────────────────────

export interface DateRange {
  startDate?: string;
  endDate?: string;
}

export interface FlightConfig {
  flightNumbers?: number[];
  pct?: Record<number, number>;
}

/**
 * Level-keyed value: either Record<level, T> or T[] indexed by level-1.
 * Prefer Record form for new code to avoid off-by-one ambiguity.
 */
export type LevelKeyed<T> = { level: Record<number, T> | T[] };
