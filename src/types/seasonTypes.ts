import type { RoundRobinTallyPolicy } from './roundRobinTallyPolicy';
import type {
  Category,
  Extension,
  Organisation,
  TierClassification,
  TierMovementUnion,
  TimeItem,
} from './tournamentTypes';

/**
 * CODES `Series` and `Season`: how competitions that recur (a box league, a ladder season, a tiered team league,
 * a college dual season) are declared ACROSS tournamentRecords.
 *
 * A season REFERENCES competitions and never contains them. One tournamentRecord may hold a whole local league
 * season (its levels as events, its sub-flights as draws), and one season may reference many records; a
 * `CompetitionRef` narrows to an event or a draw for exactly that reason. The factory defines and validates these
 * documents and answers questions about them with pure functions; it stores nothing. Whichever service declares a
 * season stores it.
 *
 * Design: Mentat `planning/RECURRING_SEASON_STRUCTURE_RESEARCH.md` (shape A) and
 * `planning/LEAGUE_MANAGEMENT_REQUIREMENTS_SYNTHESIS.md` (R10 advancement).
 */

export type SeasonStatus = 'DECLARED' | 'ACTIVE' | 'CLOSED' | 'ABANDONED';
export type SeasonSubjectType = 'PERSON' | 'TEAM';

/** The competition that recurs ("Adult 18 & Over", "Tuesday Box League"); each year's edition is a `Season`. */
export type Series = {
  seriesId: string;
  name: string;
  ownerOrganisation?: Organisation;
  /** the tier system its seasons' tiers are expressed in, e.g. 'ALTA' or 'NTRP' */
  tierSystem?: string;
  discipline?: string;
  extensions?: Extension[];
};

/** One edition of a `Series`. */
export type Season = {
  seasonId: string;
  seriesId: string;
  /** the edge along which movement and carry-over travel from the previous edition */
  precedingSeasonId?: string;
  name: string;
  startDate: string;
  endDate?: string;
  status: SeasonStatus;
  tiers: SeasonTier[];
  /** ordered by `periodNumber` */
  periods: SeasonPeriod[];
  /** declared before play: who advances out of a period into a later competition of THIS season */
  advancements?: SeasonAdvancement[];
  /** declared before play (R7): how many move up and down between sibling tiers at the close of a period */
  movementRules?: SeasonMovementRule[];
  /**
   * how the season's tables are ordered: the round-robin tally policy, read by the standings engine (primary measure,
   * tie-break directives, head-to-head across periods). A tier's own policy overrides it. Without one, tables are
   * ranked flat by `orderBy`.
   */
  tallyPolicy?: RoundRobinTallyPolicy;
  extensions?: Extension[];
  timeItems?: TimeItem[];
};

/** A level of play within a season: a rating level, a flight, a box. Tiers may nest (sub-flights within a flight). */
export type SeasonTier = {
  tierId: string;
  /** feeds `getTierMovement` for promotion and relegation between seasons */
  tier: TierClassification;
  parentTierId?: string;
  name?: string;
  gender?: string;
  category?: Category;
  /** this tier's table ordering, overriding the season's `tallyPolicy` */
  tallyPolicy?: RoundRobinTallyPolicy;
};

/** One bounded slice of a season's play: a box-league cycle, the regular season, a playoff, a championship. */
export type SeasonPeriod = {
  periodId: string;
  periodNumber: number;
  phase?: string;
  startDate?: string;
  endDate?: string;
  /** whether this period's results count toward the season's standings */
  includeInStandings: boolean;
  /** who plays in which tier during this period */
  placements?: SeasonPlacement[];
  /** references only: never an embedded record */
  competitions: CompetitionRef[];
};

export type SeasonPlacement = { tierId: string; subjects: SeasonSubject[] };

/** A competition a period is realised by. Narrows to an event or a draw when one record holds several tiers. */
export type CompetitionRef = {
  tierId: string;
  tournamentId: string;
  eventId?: string;
  drawId?: string;
};

/** The durable identity standings are kept for: a `personId`, or a team id that is stable across records. */
export type SeasonSubject = { subjectType: SeasonSubjectType; subjectId: string };

/**
 * R10: who advances out of a period into a later competition of the same season. The local league winner goes
 * to the area playoff, the area winner to sectionals. Distinct from movement between seasons (promotion and
 * relegation), which is answered by `getTierMovement`. The number of steps can differ from one area to another,
 * so each advancement is declared separately rather than implied by period order.
 */
export type SeasonAdvancement = {
  advancementId: string;
  fromPeriodId: string;
  fromTierId: string;
  rule: SeasonAdvancementRule;
  to: { periodId: string; tierId: string };
};

/**
 * `TOP_N`: a fixed number of berths. `BERTHS_BY_SIZE`: the berths depend on how many subjects the tier has, e.g.
 * `[{ minSubjects: 0, n: 1 }, { minSubjects: 30, n: 2 }, { minSubjects: 45, n: 3 }]`; the entry with the largest
 * `minSubjects` not above the tier's size applies.
 */
export type SeasonAdvancementRule =
  { type: 'TOP_N'; n: number } | { type: 'BERTHS_BY_SIZE'; berths: { minSubjects: number; n: number }[] };

/** The results a season's standings tally for each subject. */
export type SeasonStandingsTally = {
  matchUpsWon: number;
  matchUpsLost: number;
  matchUpsDrawn: number;
  /** for TEAM matchUps: the tie score (lines, points or games) won and conceded, summed */
  valueWon: number;
  valueLost: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
};

/** One subject's line in a season's standings. */
export type SeasonStandingRow = SeasonStandingsTally & {
  subject: SeasonSubject;
  /** the record-scoped participantIds this subject played as */
  participantIds: string[];
  rank: number;
};

/**
 * R7: promotion and relegation between SIBLING tiers (tiers sharing a `parentTierId`, or all top-level tiers),
 * ordered by `tier.numericRank` (lower is more prestigious). A rule without `tierId` is the default for every tier;
 * a rule naming a tier overrides it. The top tier of a ladder never promotes and the bottom tier never relegates.
 */
export type SeasonMovementRule = {
  tierId?: string;
  promote?: number;
  relegate?: number;
};

/** One subject's proposed movement at the close of a period, labelled by `getTierMovement`. */
export type SeasonMovementProposal = {
  subject: SeasonSubject;
  fromTierId: string;
  toTierId: string;
  movement: TierMovementUnion;
  /** the subject's rank in its tier's standings for the period */
  rank: number;
};

/** Subjects level on rank across a promotion or relegation cut: the season's rules decide, not the factory. */
export type SeasonMovementTie = {
  tierId: string;
  cut: 'PROMOTE' | 'RELEGATE';
  /** how many of the tied subjects the cut has room for */
  placesAtCut: number;
  subjects: SeasonSubject[];
};

/** An operator's decision that replaces a proposal (S9); `toTierId` absent withdraws the subject. */
export type SeasonMovementOverride = {
  subject: SeasonSubject;
  toTierId?: string;
  reason?: string;
  by?: string;
};

/** A proposal an override changed, kept so the revision is visible. */
export type SeasonMovementRevision = SeasonMovementOverride & {
  fromTierId?: string;
  proposedTierId?: string;
  movement: TierMovementUnion;
};
