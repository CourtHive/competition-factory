import type { competitionFormat } from './competitionFormat';

export interface Tournament {
  activeDates?: Date[] | string[]; // dates from startDate to endDate on which the tournament is active
  createdAt?: Date | string;
  endDate?: string;
  events?: Event[];
  extensions?: Extension[];
  // CODES first-class: previously stored as `factory` extension (processor versioning)
  factory?: { version?: string; [key: string]: any };
  formalName?: string;
  hostCountryCode?: CountryCodeUnion;
  indoorOutdoor?: IndoorOutdoorUnion;
  isMock?: boolean;
  // CODES first-class: previously stored as `linkedTournamentsIds` extension
  // with shape `{tournamentIds: string[]}`; CODES flattens that wrapper away.
  linkedTournamentIds?: string[];
  localTimeZone?: string;
  matchUps?: MatchUp[];
  notes?: string;
  onlineResources?: OnlineResource[];
  parentOrganisationId?: string;
  parentOrganisation?: Organisation;
  participants?: Participant[];
  processCodes?: string[];
  promotionalName?: string;
  registrationProfile?: RegistrationProfile;
  // CODES first-class group leaf: previously stored as separate
  // `schedulingProfile`, `scheduleLimits`, and `scheduleTiming` extensions.
  scheduling?: {
    profile?: any;
    dailyLimits?: any;
    timing?: any;
    // Alternate ("contingency") scheduling plans a tournament director builds
    // off the current schedule, cycles through, and can commit as the official
    // schedule (uncompleted matchUps only). Persisted first-class — NEVER a
    // legacy extension, and NEVER emitted to public / arena read surfaces.
    scenarios?: ScheduleScenario[];
    practice?: {
      defaultCapacity?: number | null;
    };
    [key: string]: any;
  };
  season?: string;
  startDate?: string;
  surfaceCategory?: SurfaceCategoryUnion;
  timeItems?: TimeItem[];
  totalPrizeMoney?: PrizeMoney[];
  tournamentCategories?: Category[];
  tournamentGroups?: string[];
  tournamentId: string;
  tournamentLevel?: TournamentLevelUnion;
  tournamentName?: string;
  tournamentOtherIds?: UnifiedTournamentID[];
  tournamentRank?: string;
  tournamentStatus?: TournamentStatusUnion;
  tournamentTier?: TierClassification;
  updatedAt?: Date | string;
  venues?: Venue[];
  weekdays?: WeekdayUnion[];
}

// Derived from the canonical tournamentStatuses tuple so the type, the constants, and the
// setTournamentStatus validator share one source of truth (previously the hand-written union
// read 'ABANDONDED' and omitted IN_PROGRESS, which the validator nonetheless accepted).
/** Lifecycle status of a tournament. Values mirror the `tournamentStatuses` tuple. */
export enum TournamentStatusEnum {
  ACTIVE = 'ACTIVE',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  ABANDONED = 'ABANDONED',
  CANCELLED = 'CANCELLED',
}
export type TournamentStatusUnion = `${TournamentStatusEnum}`;

export interface Organisation {
  onlineResources?: OnlineResource[];
  organisationAbbreviation: string;
  parentOrganisationId?: string;
  extensions?: Extension[];
  organisationName: string;
  organisationId: string;
  notes?: string;
}

export interface Event {
  activeDates?: Date[] | string[]; // dates from startDate to endDate on which the tournament is active
  allowedDrawTypes?: DrawTypeUnion[];
  category?: Category;
  competitionFormat?: competitionFormat;
  createdAt?: Date | string;
  discipline?: DisciplineUnion;
  drawDefinitions?: DrawDefinition[];
  endDate?: string;
  entries?: Entry[];
  eventAbbreviation?: string;
  eventId: string;
  eventLevel?: TournamentLevelUnion;
  eventName?: string;
  eventOrder?: number;
  // CODES first-class: this event's identity in OTHER organisations' systems, one entry
  // per organisation. The entry flagged `isOrigin` is the sanctioning source the event
  // came from — its `tournamentId` is that organisation's, NOT the carrying record's.
  eventOtherIds?: UnifiedEventID[];
  eventRank?: string;
  eventTier?: TierClassification;
  eventType?: EventTypeUnion;
  extensions?: Extension[];
  // CODES first-class: previously stored as `flightProfile` extension
  flightProfile?: any;
  gender?: GenderUnion;
  indoorOutdoor?: IndoorOutdoorUnion;
  isMock?: boolean;
  links?: DrawLink[];
  matchUpFormat?: string;
  notes?: string;
  processCodes?: string[];
  startDate?: string;
  surfaceCategory?: SurfaceCategoryUnion;
  tennisOfficialIds?: string[];
  tieFormat?: TieFormat;
  tieFormatId?: string;
  tieFormats?: TieFormat[];
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  weekdays?: WeekdayUnion[];
  wheelchairClass?: WheelchairClassUnion;
}

export const DrawTypeEnum = {
  AD_HOC: 'AD_HOC',
  ADAPTIVE: 'ADAPTIVE',
  COMPASS: 'COMPASS',
  CURTIS_CONSOLATION: 'CURTIS_CONSOLATION',
  DOUBLE_ELIMINATION: 'DOUBLE_ELIMINATION',
  FEED_IN: 'FEED_IN',
  FEED_IN_CHAMPIONSHIP: 'FEED_IN_CHAMPIONSHIP',
  FEED_IN_CHAMPIONSHIP_TO_QF: 'FEED_IN_CHAMPIONSHIP_TO_QF',
  FEED_IN_CHAMPIONSHIP_TO_R16: 'FEED_IN_CHAMPIONSHIP_TO_R16',
  FEED_IN_CHAMPIONSHIP_TO_SF: 'FEED_IN_CHAMPIONSHIP_TO_SF',
  FIRST_MATCH_LOSER_CONSOLATION: 'FIRST_MATCH_LOSER_CONSOLATION',
  FIRST_ROUND_LOSER_CONSOLATION: 'FIRST_ROUND_LOSER_CONSOLATION',
  MODIFIED_FEED_IN_CHAMPIONSHIP: 'MODIFIED_FEED_IN_CHAMPIONSHIP',
  LUCKY_DRAW: 'LUCKY_DRAW',
  OLYMPIC: 'OLYMPIC',
  OTHER: 'OTHER',
  PAGE_PLAYOFF: 'PAGE_PLAYOFF',
  PLAYOFF: 'PLAYOFF',
  ROUND_ROBIN: 'ROUND_ROBIN',
  ROUND_ROBIN_WITH_PLAYOFF: 'ROUND_ROBIN_WITH_PLAYOFF',
  SINGLE_ELIMINATION: 'SINGLE_ELIMINATION',
  SWISS: 'SWISS',
} as const;

export type DrawTypeUnion = keyof typeof DrawTypeEnum;

export interface Category {
  ageCategoryCode?: string;
  ageMax?: number;
  ageMaxDate?: string;
  ageMin?: number;
  ageMinDate?: string;
  ballType?: BallTypeUnion;
  categoryName?: string;
  categoryType?: string;
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  ratingMax?: number;
  ratingMin?: number;
  ratingType?: string;
  subType?: string;
  timeItems?: TimeItem[];
  type?: CategoryUnion;
  updatedAt?: Date | string;
}

export enum BallTypeEnum {
  HIGH_ALTITUDE = 'HIGH_ALTITUDE',
  STAGE1GREEN = 'STAGE1GREEN',
  STAGE2ORANGE = 'STAGE2ORANGE',
  STAGE3RED = 'STAGE3RED',
  T2STANDARD_PRESSURELESS = 'T2STANDARD_PRESSURELESS',
  T2STANDARD_PRESSURISED = 'T2STANDARD_PRESSURISED',
  TYPE1FAST = 'TYPE1FAST',
  TYPE3SLOW = 'TYPE3SLOW',
}
export type BallTypeUnion = `${BallTypeEnum}`;

export interface Extension {
  // Written by `addExtension` whenever `creationTime` is not disabled, and honoured when
  // the caller supplies one. Declared here to match runtime: the field has always been
  // written, but an `Object.assign` bypassed the checker, so the type was silently out of
  // sync for as long as the field existed. Mirrors {@link TimeItem}.
  createdAt?: Date | string;
  description?: string;
  name: string;
  value: any;
}

export interface TimeItem {
  createdAt?: Date | string;
  itemDate?: Date | string;
  itemSubTypes?: string[];
  itemType?: string;
  itemValue?: any;
}

// OPEN, sport-agnostic vocabulary (see planning/DISCIPLINE_EXTENSIBILITY.md). The `disciplines`
// tuple is the curated KNOWN set (autocompletes, feeds attr-audit typo defense), but the type
// accepts any string so new sports (VOLLEYBALL, PADEL, …) need no factory release. The
// `& {}` on the string arm preserves literal autocomplete for the known values (a bare
// `| string` would collapse the union). Constrain to a whitelist via the `allowedDisciplines`
// policy, and normalize input with `normalizeDiscipline` (@Helpers/coercedDiscipline).
/**
 * The KNOWN disciplines. The vocabulary is deliberately OPEN — see
 * planning/DISCIPLINE_EXTENSIBILITY.md — so DisciplineUnion keeps its
 * `| (string & {})` arm and still accepts any string. This enum names the
 * curated set for autocomplete and normalization; it does not close the type.
 */
export enum DisciplineEnum {
  TENNIS = 'TENNIS',
  BEACH_TENNIS = 'BEACH_TENNIS',
  WHEELCHAIR_TENNIS = 'WHEELCHAIR_TENNIS',
  PADEL = 'PADEL',
  PICKLEBALL = 'PICKLEBALL',
  VOLLEYBALL = 'VOLLEYBALL',
  BEACH_VOLLEYBALL = 'BEACH_VOLLEYBALL',
}
export type DisciplineUnion = `${DisciplineEnum}` | (string & {});
/** How an event category is defined. */
export enum CategoryEnum {
  AGE = 'AGE',
  BOTH = 'BOTH',
  LEVEL = 'LEVEL',
}
export type CategoryUnion = `${CategoryEnum}`;

export interface DrawDefinition {
  activeDates?: Date[] | string[]; // dates from startDate to endDate on which the tournament is active
  automated?: boolean;
  competitionFormat?: competitionFormat;
  createdAt?: Date | string;
  drawId: string;
  drawName?: string;
  drawOrder?: number;
  // CODES first-class: this draw's identity in OTHER organisations' systems. The entry
  // flagged `isOrigin` is the system the draw came from. See {@link UnifiedDrawID}.
  drawOtherIds?: UnifiedDrawID[];
  drawRepresentativeIds?: string[];
  drawStatus?: DrawStatusUnion;
  drawType?: DrawTypeUnion;
  endDate?: string;
  entries?: Entry[];
  extensions?: Extension[];
  // CODES first-class: previously stored as `competitionState` extension
  competitionState?: any;
  // CODES first-class: previously stored as `draftState` extension
  draftState?: any;
  // CODES first-class: previously stored as `flightProfile` extension
  flightProfile?: any;
  // Per-flight ordering number, sourced from the parent event's flightProfile
  // (`flightProfile.flights[].flightNumber`) when a draw was generated as part
  // of a multi-flight event. Optional because legacy + single-flight draws
  // don't carry it. Consumers (TMX draws table/grid) use it for display
  // ordering.
  flightNumber?: number;
  isMock?: boolean;
  // CODES first-class: previously stored as `lineUps` extension
  lineUps?: any;
  links?: DrawLink[];
  matchUpFormat?: string;
  matchUps?: MatchUp[];
  matchUpType?: EventTypeUnion;
  notes?: string;
  processCodes?: string[];
  startDate?: string;
  structures?: Structure[];
  tieFormat?: TieFormat;
  tieFormatId?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

/** Aggregate play state of a draw. */
export enum DrawStatusEnum {
  COMPLETED = 'COMPLETED',
  IN_PROGRESS = 'IN_PROGRESS',
  TO_BE_PLAYED = 'TO_BE_PLAYED',
}
export type DrawStatusUnion = `${DrawStatusEnum}`;

export interface Entry {
  createdAt?: Date | string;
  entryId?: string;
  entryPosition?: number;
  entryStage?: StageTypeUnion;
  entryStageSequence?: number;
  entryStatus?: EntryStatusUnion;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  participantId: string;
  // CODES first-class: previously stored as `roundTarget` extension on entry
  roundTarget?: number;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  scaleValue?: number;
}

// NOTE: PLAY_OFF (underscore) is a stage type. PLAYOFF (no underscore) is a draw type (see DrawTypeEnum).
export enum StageTypeEnum {
  CONSOLATION = 'CONSOLATION',
  MAIN = 'MAIN',
  PLAY_OFF = 'PLAY_OFF',
  QUALIFYING = 'QUALIFYING',
  VOLUNTARY_CONSOLATION = 'VOLUNTARY_CONSOLATION',
}
export type StageTypeUnion = `${StageTypeEnum}`;

export enum EntryStatusEnum {
  ALTERNATE = 'ALTERNATE',
  CONFIRMED = 'CONFIRMED',
  DIRECT_ACCEPTANCE = 'DIRECT_ACCEPTANCE',
  FEED_IN = 'FEED_IN',
  JUNIOR_EXEMPT = 'JUNIOR_EXEMPT',
  LUCKY_LOSER = 'LUCKY_LOSER',
  ORGANISER_ACCEPTANCE = 'ORGANISER_ACCEPTANCE',
  QUALIFIER = 'QUALIFIER',
  REGISTERED = 'REGISTERED',
  SPECIAL_EXEMPT = 'SPECIAL_EXEMPT',
  UNGROUPED = 'UNGROUPED',
  UNPAIRED = 'UNPAIRED',
  WILDCARD = 'WILDCARD',
  WITHDRAWN = 'WITHDRAWN',
}
export type EntryStatusUnion = `${EntryStatusEnum}`;

export interface DrawLink {
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  linkCondition?: string;
  linkType: LinkTypeUnion;
  notes?: string;
  source: DrawLinkSource;
  target: DrawLinkTarget;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export enum LinkTypeEnum {
  LOSER = 'LOSER',
  POSITION = 'POSITION',
  WINNER = 'WINNER',
}
export type LinkTypeUnion = `${LinkTypeEnum}`;

export interface DrawLinkSource {
  bestOf?: number;
  createdAt?: Date | string;
  drawId?: string;
  extensions?: Extension[];
  finishingPositions?: number[];
  isMock?: boolean;
  notes?: string;
  rankBy?: string;
  qualifyingPositions?: number;
  remainder?: boolean;
  roundNumber?: number;
  structureId: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export interface DrawLinkTarget {
  createdAt?: Date | string;
  drawId?: string;
  extensions?: Extension[];
  feedProfile: PositioningProfileUnion;
  groupedOrder?: number[];
  isMock?: boolean;
  notes?: string;
  positionInterleave?: Interleave;
  roundNumber: number;
  structureId: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export enum PositioningProfileEnum {
  BOTTOM_UP = 'BOTTOM_UP',
  DRAW = 'DRAW',
  LOSS_POSITION = 'LOSS_POSITION',
  RANDOM = 'RANDOM',
  TOP_DOWN = 'TOP_DOWN',
  WATERFALL = 'WATERFALL',
}
export type PositioningProfileUnion = `${PositioningProfileEnum}`;

/**
 * How much of a nested collection a query returns — shared by `getEventData({ drawsProfile })` and
 * `getDrawData({ structuresProfile })`.
 *
 * `FULL` is the default and the pre-existing behaviour — every draw hydrated through `getDrawData`.
 * `STUBS` emits cheap per-draw metadata only, skipping structure assembly entirely: on a Grand-Slam
 * singles event that is ~15 KB against ~788 KB. The axis is monotone containment
 * (`drawInfo ⊃ structures ⊃ roundMatchUps`), which is why it is one ordinal parameter rather than
 * independent flags.
 */
export enum PayloadProfileEnum {
  FULL = 'FULL',
  STUBS = 'STUBS',
}
export type PayloadProfileUnion = `${PayloadProfileEnum}`;

export enum SeedingProfileEnum {
  CLUSTER = 'CLUSTER',
  SEPARATE = 'SEPARATE',
  WATERFALL = 'WATERFALL',
}
export type SeedingProfileUnion = `${SeedingProfileEnum}`;

export interface Interleave {
  interleave: number;
  offset: number;
}

/**
 * The competition formats an event can take.
 *
 * Was previously a union of `typeof` constants with no enum behind it, which left
 * consumers able to type against EventTypeUnion but unable to reference a member
 * at runtime — the outlier ClubSpark reported. Now enum-backed like the other 33
 * vocabularies, with the union derived from it.
 */
export enum EventTypeEnum {
  SINGLES = 'SINGLES',
  DOUBLES = 'DOUBLES',
  TEAM = 'TEAM',
  HYBRID = 'HYBRID',
}
export type EventTypeUnion = `${EventTypeEnum}`;

/** Placement attributes a {@link ScheduleLock} can pin. */
export type ScheduleLockAttribute =
  'allocatedCourts' | 'courtId' | 'courtOrder' | 'scheduledDate' | 'scheduledTime' | 'venueId';

/**
 * CODES first-class: a director's declaration that a matchUp's placement is
 * deliberate and must not be moved by bulk or automated scheduling — the
 * marquee match promised centre court at 19:00 surviving a Clear or a
 * re-schedule of the rest of the day.
 *
 * The lock guards PLACEMENT only. `startTime` / `stopTime` / `resumeTime` /
 * `endTime` record actual play and stay writable, or a locked matchUp could
 * never be played. It is also inert once the matchUp reaches a completed
 * status, where completed-status protection already applies.
 *
 * Presence of the object is the lock; `attributes` narrows it to specific
 * placement fields (absent ⇒ the whole placement). Timestamps are
 * caller-supplied — the factory never stamps wall-clock.
 *
 * Unrelated to `tournamentRecord.mutationLocks`, which gate whole methods at
 * tournament grain.
 */
export interface ScheduleLock {
  attributes?: ScheduleLockAttribute[];
  lockedAt?: string;
  lockedBy?: string;
  reason?: string;
}

/**
 * CODES first-class schedule attributes on a matchUp. Each field was
 * historically stored as a `timeItem` of the corresponding `itemType`
 * (SCHEDULED_DATE, ASSIGN_COURT, etc.). In CODES the canonical surface is
 * this object; `timeItems[]` remains the home of `START_TIME / STOP_TIME /
 * RESUME_TIME / END_TIME` because `matchUpDuration()` walks the full
 * ordered history. Derived fields like `startTime`, `endTime`,
 * `milliseconds`, `time`, `venueName`, `courtName`, `isoDateString`, and
 * the recovery-time calculations remain hydration-time outputs and are
 * NOT first-class writable.
 */
export interface MatchUpSchedule {
  allocatedCourts?: any[];
  // CODES 5.0.0 first-class: ISO timestamp captured when the matchUp is
  // deliberately placed on the TMX active strip ("calling the match to court").
  // Distinct from scheduledTime (plan) and START_TIME timeItem (actual start).
  // Cleared only by explicit removal; persists past START_TIME as history.
  calledAt?: string;
  courtAnnotation?: string;
  courtId?: string;
  courtOrder?: number;
  homeParticipantId?: string;
  // CODES 5.0.0 first-class: pins this placement against bulk clears and
  // automated scheduling. See {@link ScheduleLock}. No legacy timeItem mirror.
  lock?: ScheduleLock;
  official?: any;
  // participantId of a nominated scorekeeper for this matchUp (crowd-scoring Phase D).
  // SCHEDULE.ASSIGNMENT.SCOREKEEPER first-class value; not cleared by rescheduling.
  scorekeeper?: any;
  // participantId of an assigned timekeeper (timed matchUpFormats).
  // SCHEDULE.ASSIGNMENT.TIMEKEEPER first-class value; not cleared by rescheduling.
  timekeeper?: any;
  scheduledDate?: string;
  // sparse: the calendar day (scheduledDate + 1) on which a matchUp's END_TIME
  // falls when the match crossed midnight. Absent ⇒ the end is on scheduledDate.
  endDate?: string;
  scheduledTime?: string;
  // CODES 5.0.0 first-class: ISO timestamp auto-captured the first time a
  // matchUp receives a meaningful score/winningSide. A lightweight proxy for
  // "when did this match actually finish" — useful for analytics on tournament
  // director behavior when no explicit END_TIME timeItem was recorded.
  // Cleared automatically when the score is removed; an actual endTime, when
  // present, supersedes it. No legacy timeItem mirror.
  scoredTime?: string;
  timeModifiers?: string[];
  venueId?: string;
  // derived/hydrated read-only fields (populated by getMatchUpScheduleDetails)
  [key: string]: any;
}

/**
 * One proposed matchUp placement inside a {@link ScheduleScenario}. The shape
 * is deliberately identical to a `bulkScheduleMatchUps` `matchUpDetails` entry
 * so that committing a scenario is a direct hand-off to that mutation. An
 * empty `schedule` (with `removePriorValues`) encodes "pull this matchUp off
 * the grid" when the scenario is applied.
 */
export interface ScenarioPlacement {
  tournamentId: string;
  matchUpId: string;
  schedule: MatchUpSchedule;
}

/**
 * A named alternate scheduling plan stored on `tournamentRecord.scheduling.scenarios`.
 * Placements hold resolved matchUp positions only (courts / times / order) — a
 * scenario never re-runs the round-level scheduler. `createdAt` / `updatedAt`
 * are caller-provided ISO strings (factory does not stamp wall-clock, matching
 * the `calledAt` idiom). `basedOnHash` fingerprints the official schedule at
 * authoring time so drift / rebase can be detected before a commit.
 */
export interface ScheduleScenario {
  scenarioId: string;
  scenarioName: string;
  scheduledDates?: string[];
  createdAt?: string;
  updatedAt?: string;
  notes?: string;
  basedOnHash?: string;
  placements: ScenarioPlacement[];
}

export interface MatchUp {
  collectionId?: string;
  collectionPosition?: number;
  createdAt?: Date | string;
  // CODES first-class: previously stored as `delegatedOutcome` extension
  delegatedOutcome?: any;
  // CODES first-class: previously stored as `disableAutoCalc` extension (tie matchUp)
  disableAutoCalc?: boolean;
  drawPositions?: number[];
  endDate?: string;
  extensions?: Extension[];
  finishingPositionRange?: MatchUpFinishingPositionRange;
  finishingRound?: number;
  indoorOutdoor?: IndoorOutdoorUnion;
  isMock?: boolean;
  loserMatchUpId?: string;
  matchUpDuration?: string;
  matchUpFormat?: string;
  matchUpId: string;
  matchUpStatus?: MatchUpStatusUnion;
  matchUpStatusCodes?: any[];
  matchUpType?: EventTypeUnion;
  notes?: string;
  orderOfFinish?: number;
  processCodes?: string[];
  roundName?: string;
  roundNumber?: number;
  roundPosition?: number;
  // CODES first-class: previously stored as schedule-related timeItems
  schedule?: MatchUpSchedule;
  score?: Score;
  sides?: Side[];
  startDate?: string;
  surfaceCategory?: SurfaceCategoryUnion;
  tieFormat?: TieFormat;
  tieFormatId?: string;
  tieMatchUps?: MatchUp[];
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  winnerMatchUpId?: string;
  winningSide?: number;
}

export interface MatchUpFinishingPositionRange {
  loser: number[];
  winner: number[];
}

// Derived from the canonical indoorOutdoorTypes tuple (mirrors TournamentStatusUnion / DisciplineUnion)
// so the type and venueConstants share one source of truth and attr-audit has a value vocab to guard the
// indoorOutdoor literals (e.g. court.indoorOutdoor === 'INDOOR') against typos.
/** Whether a venue or court is indoors. Mirrors the `indoorOutdoorTypes` tuple. */
export enum IndoorOutdoorEnum {
  INDOOR = 'INDOOR',
  OUTDOOR = 'OUTDOOR',
  MIXED = 'MIXED',
}
export type IndoorOutdoorUnion = `${IndoorOutdoorEnum}`;

export enum MatchUpStatusEnum {
  ABANDONED = 'ABANDONED',
  AWAITING_RESULT = 'AWAITING_RESULT',
  BYE = 'BYE',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  DEAD_RUBBER = 'DEAD_RUBBER',
  DEFAULTED = 'DEFAULTED',
  DOUBLE_DEFAULT = 'DOUBLE_DEFAULT',
  DOUBLE_WALKOVER = 'DOUBLE_WALKOVER',
  IN_PROGRESS = 'IN_PROGRESS',
  INCOMPLETE = 'INCOMPLETE',
  NOT_PLAYED = 'NOT_PLAYED',
  RETIRED = 'RETIRED',
  SUSPENDED = 'SUSPENDED',
  TO_BE_PLAYED = 'TO_BE_PLAYED',
  WALKOVER = 'WALKOVER',
}
export type MatchUpStatusUnion = `${MatchUpStatusEnum}`;

export interface Score {
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  scoreStringSide1?: string;
  scoreStringSide2?: string;
  sets?: Set[];
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export interface Set {
  createdAt?: Date | string;
  extensions?: Extension[];
  games?: Game[];
  isMock?: boolean;
  notes?: string;
  setDuration?: string;
  setFormat?: string;
  setNumber?: number;
  side1PointScore?: number | string;
  side1Score?: number;
  side1TiebreakScore?: number;
  side2PointScore?: number | string;
  side2Score?: number;
  side2TiebreakScore?: number;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  winningSide?: number;
}

export interface Game {
  createdAt?: Date | string;
  extensions?: Extension[];
  gameDuration?: string;
  gameFormat?: string;
  gameNumber?: number;
  isMock?: boolean;
  notes?: string;
  points?: Point[];
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  winningSide?: number;
  winReason?: WinReasonUnion;
}

export interface Point {
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  pointDuration?: string;
  pointNumber?: number;
  shots?: Shot[];
  side1Score?: string;
  side2Score?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  winningSide?: number;
  winReason?: WinReasonUnion;
}

export interface Shot {
  bounceAt?: CourtPosition;
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  participantId: string;
  shotDetail?: ShotDetailUnion;
  shotMadeFrom?: CourtPosition;
  shotNumber?: number;
  shotOutcome?: ShotOutcomeUnion;
  shotType?: ShotTypeUnion;
  sideNumber?: number;
  speed?: number;
  spin?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export interface CourtPosition {
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  positionName?: CourtPositionUnion;
  timeAtPosition?: Date | string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  x?: number;
  y?: number;
}

export enum CourtPositionEnum {
  BASELINE = 'BASELINE',
  LEFT_SERVICE_COURT = 'LEFT_SERVICE_COURT',
  NET = 'NET',
  RIGHT_SERVICE_COURT = 'RIGHT_SERVICE_COURT',
  SERVICELINE = 'SERVICELINE',
}
export type CourtPositionUnion = `${CourtPositionEnum}`;

export enum ShotDetailEnum {
  DRIVE = 'DRIVE',
  DRIVE_VOLLEY = 'DRIVE_VOLLEY',
  DROP_SHOT = 'DROP_SHOT',
  GROUND_STROKE = 'GROUND_STROKE',
  HALF_VOLLEY = 'HALF_VOLLEY',
  LOB = 'LOB',
  PASSING_SHOT = 'PASSING_SHOT',
  SMASH = 'SMASH',
  TRICK = 'TRICK',
  VOLLEY = 'VOLLEY',
}
export type ShotDetailUnion = `${ShotDetailEnum}`;

export enum ShotOutcomeEnum {
  IN = 'IN',
  LET = 'LET',
  NET = 'NET',
  OUT = 'OUT',
}
export type ShotOutcomeUnion = `${ShotOutcomeEnum}`;

export enum ShotTypeEnum {
  BACKHAND = 'BACKHAND',
  FOREHAND = 'FOREHAND',
  SERVE = 'SERVE',
}
export type ShotTypeUnion = `${ShotTypeEnum}`;

export enum WinReasonEnum {
  ACE = 'ACE',
  DOUBLE_FAULT = 'DOUBLE_FAULT',
  ERROR = 'ERROR',
  FORCED = 'FORCED',
  NET_CORD = 'NET_CORD',
  PENALTY = 'PENALTY',
  UNFORCED = 'UNFORCED',
  WINNER = 'WINNER',
}
export type WinReasonUnion = `${WinReasonEnum}`;

export interface Side {
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  lineUp?: TeamCompetitor[];
  notes?: string;
  participantId?: string;
  participant?: Participant;
  sideNumber?: number;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export interface TeamCompetitor {
  collectionAssignments?: CollectionAssignment[];
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  participantId: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export interface Team {
  gender?: GenderUnion;
  homeVenueIds?: string[];
  nativeTeamName?: string;
  otherTeamNames?: string[];
  parentOrganisationId?: string;
  personIds?: string[];
  previousTeamNames?: string[];
  teamId: string;
  teamName?: string;
}

export interface CollectionAssignment {
  collectionId: string;
  collectionPosition: number;
  previousParticipantId?: string;
  substitutionOrder?: number;
}

export enum SurfaceCategoryEnum {
  ARTIFICIAL = 'ARTIFICIAL',
  CARPET = 'CARPET',
  CLAY = 'CLAY',
  GRASS = 'GRASS',
  HARD = 'HARD',
}
export type SurfaceCategoryUnion = `${SurfaceCategoryEnum}`;

/**
 * Where a TEAM matchUp's score comes from.
 *
 * `DERIVED` (the default) computes the tie score from the collection matchUps ("lines"), which is how a
 * scored tie behaves everywhere the lines are entered.
 *
 * `REPORTED` states that the aggregate result is authoritative and the lines are **unpopulated by design**
 * — the publisher reports the team result (3–2, or games) and never the per-line detail. This is a
 * different fact from "the lines have not been entered yet", and consumers need to tell them apart: a
 * REPORTED tie with empty lines is complete, not awaiting data entry.
 *
 * Declared on a {@link TieFormat}, so it resolves hierarchically (matchUp > structure > drawDefinition >
 * event) and a federation that never publishes line detail can state it once on the event.
 */
export enum TieScoreSourceEnum {
  DERIVED = 'DERIVED',
  REPORTED = 'REPORTED',
}
export type TieScoreSourceUnion = `${TieScoreSourceEnum}`;

export interface TieFormat {
  collectionDefinitions: CollectionDefinition[];
  collectionGroups?: CollectionGroup[];
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  scoreSource?: TieScoreSourceUnion;
  tieFormatId?: string;
  tieFormatName?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  winCriteria: WinCriteria;
}

export interface CollectionDefinition {
  collectionValueProfiles?: CollectionValueProfile[];
  collectionGroupNumber?: number;
  category?: Category;
  collectionId: string;
  collectionName?: string;
  collectionOrder?: number;
  collectionValue?: number;
  createdAt?: Date | string;
  extensions?: Extension[];
  gender?: GenderUnion;
  isMock?: boolean;
  matchUpCount?: number;
  matchUpFormat?: string;
  matchUpType?: EventTypeUnion;
  matchUpValue?: number;
  notes?: string;
  processCodes?: string[];
  scoreValue?: number;
  setValue?: number;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  winCriteria?: WinCriteria;
}

export interface CollectionValueProfile {
  collectionPosition: number;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  extensions?: Extension[];
  timeItems?: TimeItem[];
  matchUpValue: number;
  isMock?: boolean;
  notes?: string;
}

/**
 * The gender category of a COMPETITION — an event, a category, a draw.
 *
 * Distinct from {@link SexEnum}, which describes a PERSON. The two overlap on
 * F / M / FEMALE / MALE and then diverge deliberately: a competition can be
 * MIXED or ANY, a person cannot; a person can be OTHER, a competition cannot.
 *
 * Both vocabularies are served by the single `genderConstants` object, so
 * `genderConstants.OTHER` is a legitimate `sex` but NOT a legitimate `gender`,
 * and `genderConstants.MIXED` is the reverse. Prefer the enum members over the
 * bucket when you know which dimension you are setting — the union types reject
 * the wrong one at compile time.
 */
export enum GenderEnum {
  FEMALE_ABBR = 'F',
  MIXED_ABBR = 'X',
  MALE_ABBR = 'M',
  ANY_ABBR = 'A',

  FEMALE = 'FEMALE',
  MIXED = 'MIXED',
  MALE = 'MALE',
  ANY = 'ANY',
}
export type GenderUnion = `${GenderEnum}`;

export interface WinCriteria {
  aggregateValue?: boolean;
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  valueGoal: number;
}

export interface CollectionGroup {
  createdAt?: Date | string;
  extensions?: Extension[];
  groupName?: string;
  groupNumber: number;
  groupValue?: number;
  isMock?: boolean;
  notes?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  winCriteria?: WinCriteria;
}

export interface Structure {
  competitionFormat?: competitionFormat;
  createdAt?: Date | string;
  extensions?: Extension[];
  finishingPosition?: FinishingPositionUnion;
  isMock?: boolean;
  matchUpFormat?: string;
  matchUps?: MatchUp[];
  matchUpType?: EventTypeUnion;
  notes?: string;
  positionAssignments?: PositionAssignment[];
  processCodes?: string[];
  qualifyingRoundNumber?: number;
  roundLimit?: number;
  roundOffset?: number;
  // CODES first-class: previously stored as `roundTarget` extension (qualifying routing)
  roundTarget?: number;
  seedAssignments?: SeedAssignment[];
  seedingProfile?: SeedingProfileUnion;
  seedLimit?: number;
  stage?: StageTypeUnion;
  stageSequence?: number;
  structureAbbreviation?: string;
  structureId: string;
  structureName?: string;
  structures?: Structure[];
  structureOrder?: number;
  structureType?: StructureTypeUnion;
  tieFormat?: TieFormat;
  tieFormatId?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export enum FinishingPositionEnum {
  ROUND_OUTCOME = 'ROUND_OUTCOME',
  WIN_RATIO = 'WIN_RATIO',
}
export type FinishingPositionUnion = `${FinishingPositionEnum}`;

export interface TallyResult {
  GEMscore?: number;
  allDefaults?: number;
  defaults?: number;
  defeats?: any[];
  gamesLost?: number;
  gamesPct?: number;
  gamesWon?: number;
  groupOrder?: number;
  matchUpsCancelled?: number;
  matchUpsLost?: number;
  matchUpsPct?: number;
  matchUpsWon?: number;
  pointsLost?: number;
  pointsPct?: number;
  pointsWon?: number;
  pressureOrder?: number;
  pressureScores?: number[];
  provisionalOrder?: number;
  rankOrder?: number;
  retirements?: number;
  setsLost?: number;
  setsPct?: number;
  setsWon?: number;
  subOrder?: number;
  tieDoublesLost?: number;
  tieDoublesWon?: number;
  tieMatchUpsLost?: number;
  tieMatchUpsWon?: number;
  tieSinglesLost?: number;
  tieSinglesWon?: number;
  ties?: number;
  victories?: any[];
  walkovers?: number;
  [key: string]: any;
}

export interface PositionAssignment {
  bye?: boolean;
  createdAt?: Date | string;
  // CODES first-class: previously stored as `disableLinks` extension
  disableLinks?: boolean;
  drawPosition: number;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  participantId?: string;
  qualifier?: boolean;
  // CODES first-class: previously stored as `tally` extension
  tally?: TallyResult;
  // CODES first-class: previously stored as `subOrder` extension
  subOrder?: number;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export interface SeedAssignment {
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  participantId?: string;
  seedNumber: number;
  seedValue: number | string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export enum StructureTypeEnum {
  CONTAINER = 'CONTAINER',
  ITEM = 'ITEM',
}
export type StructureTypeUnion = `${StructureTypeEnum}`;

/**
 * Competitive tier classification — federation-specific prestige level.
 * Orthogonal to `tournamentLevel` (organizational scope: LOCAL → INTERNATIONAL).
 *
 * Examples:
 *   { system: 'ITF_JUNIOR', value: '3', numericRank: 3 }
 *   { system: 'ATP', value: '1000', numericRank: 2 }
 *   { system: 'PPA', value: 'Gold', numericRank: 2 }
 *   { system: 'BWF', value: 'Super 500', numericRank: 4 }
 */
/**
 * Movement of a competitor between the tiers of consecutive seasons — promotion and relegation.
 *
 * A league's competitive structure is a lattice of tiers (flights, divisions) that competitors move
 * between from one season to the next. That movement is the leveling signal for a population that
 * often has no individual ratings at all: community-league TEAMs whose members are never enumerated.
 *
 * Derived by comparing two {@link TierClassification}s, so it says only what the evidence supports —
 * `REALIGNED` where the tiers are not comparable, rather than guessing a direction.
 */
export enum TierMovementEnum {
  /** moved to a more prestigious tier */
  PROMOTED = 'PROMOTED',
  /** moved to a less prestigious tier */
  RELEGATED = 'RELEGATED',
  /** same tier in both seasons */
  HELD = 'HELD',
  /** the tier changed but the two are not comparable (different systems, or no level resolvable) */
  REALIGNED = 'REALIGNED',
  /** present in the earlier season, absent from the later one */
  WITHDRAWN = 'WITHDRAWN',
  /** absent from the earlier season, present in the later one */
  ENTERED = 'ENTERED',
}
export type TierMovementUnion = `${TierMovementEnum}`;

export interface TierClassification {
  /** Federation/governing body tier system (e.g. 'ITF_JUNIOR', 'ATP', 'PPA', 'BWF') */
  system: string;
  /** Tier value within the system (e.g. '3', '1000', 'Gold', 'Super 500') */
  value: string;
  /** Optional sortable prestige rank within the system (lower = more prestigious) */
  numericRank?: number;
}

export enum TournamentLevelEnum {
  CLUB = 'CLUB',
  DISTRICT = 'DISTRICT',
  INTERNATIONAL = 'INTERNATIONAL',
  LOCAL = 'LOCAL',
  NATIONAL = 'NATIONAL',
  RECREATIONAL = 'RECREATIONAL',
  REGIONAL = 'REGIONAL',
  ZONAL = 'ZONAL',
}
export type TournamentLevelUnion = `${TournamentLevelEnum}`;

export enum WheelchairClassEnum {
  QUAD = 'QUAD',
  STANDARD = 'STANDARD',
}
export type WheelchairClassUnion = `${WheelchairClassEnum}`;

export enum CountryCodeEnum {
  ABW = 'ABW',
  AFG = 'AFG',
  AGO = 'AGO',
  AIA = 'AIA',
  ALA = 'ALA',
  ALB = 'ALB',
  AND = 'AND',
  ANT = 'ANT',
  ARE = 'ARE',
  ARG = 'ARG',
  ARM = 'ARM',
  ASM = 'ASM',
  ATA = 'ATA',
  ATF = 'ATF',
  ATG = 'ATG',
  AUS = 'AUS',
  AUT = 'AUT',
  AZE = 'AZE',
  BDI = 'BDI',
  BEL = 'BEL',
  BEN = 'BEN',
  BFA = 'BFA',
  BGD = 'BGD',
  BGR = 'BGR',
  BHR = 'BHR',
  BHS = 'BHS',
  BIH = 'BIH',
  BLM = 'BLM',
  BLR = 'BLR',
  BLZ = 'BLZ',
  BMU = 'BMU',
  BOL = 'BOL',
  BRA = 'BRA',
  BRB = 'BRB',
  BRN = 'BRN',
  BTN = 'BTN',
  BVT = 'BVT',
  BWA = 'BWA',
  CAF = 'CAF',
  CAN = 'CAN',
  CCK = 'CCK',
  CGD = 'CGD',
  CHE = 'CHE',
  CHL = 'CHL',
  CHN = 'CHN',
  CIV = 'CIV',
  CMR = 'CMR',
  COD = 'COD',
  COG = 'COG',
  COK = 'COK',
  COL = 'COL',
  COM = 'COM',
  CPV = 'CPV',
  CRI = 'CRI',
  CUB = 'CUB',
  CUW = 'CUW',
  CXR = 'CXR',
  CYM = 'CYM',
  CYP = 'CYP',
  CZE = 'CZE',
  DEU = 'DEU',
  DJI = 'DJI',
  DMA = 'DMA',
  DNK = 'DNK',
  DOM = 'DOM',
  DZA = 'DZA',
  ECU = 'ECU',
  EGY = 'EGY',
  ERI = 'ERI',
  ESE = 'ESE',
  ESH = 'ESH',
  ESP = 'ESP',
  ETH = 'ETH',
  FIN = 'FIN',
  FJI = 'FJI',
  FLK = 'FLK',
  FRA = 'FRA',
  FRO = 'FRO',
  FSM = 'FSM',
  GAB = 'GAB',
  GBR = 'GBR',
  GEO = 'GEO',
  GGY = 'GGY',
  GHA = 'GHA',
  GIB = 'GIB',
  GIN = 'GIN',
  GLP = 'GLP',
  GMB = 'GMB',
  GNB = 'GNB',
  GNQ = 'GNQ',
  GRC = 'GRC',
  GRD = 'GRD',
  GRL = 'GRL',
  GTM = 'GTM',
  GUF = 'GUF',
  GUM = 'GUM',
  GUY = 'GUY',
  HKG = 'HKG',
  HMD = 'HMD',
  HND = 'HND',
  HRV = 'HRV',
  HTI = 'HTI',
  HUN = 'HUN',
  IDN = 'IDN',
  IMN = 'IMN',
  IND = 'IND',
  IOT = 'IOT',
  IRL = 'IRL',
  IRN = 'IRN',
  IRQ = 'IRQ',
  ISL = 'ISL',
  ISR = 'ISR',
  ITA = 'ITA',
  JAM = 'JAM',
  JEY = 'JEY',
  JOR = 'JOR',
  JPN = 'JPN',
  KAZ = 'KAZ',
  KEN = 'KEN',
  KGZ = 'KGZ',
  KHM = 'KHM',
  KIR = 'KIR',
  KNA = 'KNA',
  KOR = 'KOR',
  KOS = 'KOS',
  KWT = 'KWT',
  LAO = 'LAO',
  LBN = 'LBN',
  LBR = 'LBR',
  LBY = 'LBY',
  LCA = 'LCA',
  LIE = 'LIE',
  LKA = 'LKA',
  LSO = 'LSO',
  LTU = 'LTU',
  LUX = 'LUX',
  LVA = 'LVA',
  MAC = 'MAC',
  MAF = 'MAF',
  MAR = 'MAR',
  MCO = 'MCO',
  MDA = 'MDA',
  MDG = 'MDG',
  MDV = 'MDV',
  MEX = 'MEX',
  MHL = 'MHL',
  MKD = 'MKD',
  MLI = 'MLI',
  MLT = 'MLT',
  MMR = 'MMR',
  MNE = 'MNE',
  MNG = 'MNG',
  MNP = 'MNP',
  MOZ = 'MOZ',
  MRT = 'MRT',
  MSR = 'MSR',
  MTQ = 'MTQ',
  MUS = 'MUS',
  MWI = 'MWI',
  MYS = 'MYS',
  MYT = 'MYT',
  NAM = 'NAM',
  NCL = 'NCL',
  NER = 'NER',
  NFK = 'NFK',
  NGA = 'NGA',
  NIC = 'NIC',
  NIU = 'NIU',
  NLD = 'NLD',
  NMP = 'NMP',
  NOR = 'NOR',
  NPL = 'NPL',
  NRU = 'NRU',
  NZL = 'NZL',
  OMN = 'OMN',
  PAK = 'PAK',
  PAN = 'PAN',
  PCN = 'PCN',
  PER = 'PER',
  PHL = 'PHL',
  PLW = 'PLW',
  PNG = 'PNG',
  POL = 'POL',
  PRI = 'PRI',
  PRK = 'PRK',
  PRT = 'PRT',
  PRY = 'PRY',
  PSE = 'PSE',
  PYF = 'PYF',
  QAT = 'QAT',
  REU = 'REU',
  ROU = 'ROU',
  RUS = 'RUS',
  RWA = 'RWA',
  SAU = 'SAU',
  SDN = 'SDN',
  SEN = 'SEN',
  SGP = 'SGP',
  SGS = 'SGS',
  SHN = 'SHN',
  SJM = 'SJM',
  SLB = 'SLB',
  SLE = 'SLE',
  SLV = 'SLV',
  SMR = 'SMR',
  SMX = 'SMX',
  SOM = 'SOM',
  SPM = 'SPM',
  SRB = 'SRB',
  SSD = 'SSD',
  STP = 'STP',
  SUR = 'SUR',
  SVK = 'SVK',
  SVN = 'SVN',
  SWE = 'SWE',
  SWZ = 'SWZ',
  SYC = 'SYC',
  SYR = 'SYR',
  TCA = 'TCA',
  TCD = 'TCD',
  TGO = 'TGO',
  THA = 'THA',
  TJK = 'TJK',
  TKL = 'TKL',
  TKM = 'TKM',
  TLS = 'TLS',
  TON = 'TON',
  TTO = 'TTO',
  TUN = 'TUN',
  TUR = 'TUR',
  TUV = 'TUV',
  TWN = 'TWN',
  TZA = 'TZA',
  UGA = 'UGA',
  UKR = 'UKR',
  UMI = 'UMI',
  URY = 'URY',
  USA = 'USA',
  UZB = 'UZB',
  VAT = 'VAT',
  VCT = 'VCT',
  VEN = 'VEN',
  VGB = 'VGB',
  VIR = 'VIR',
  VNM = 'VNM',
  VUT = 'VUT',
  WLF = 'WLF',
  WSM = 'WSM',
  YEM = 'YEM',
  ZAF = 'ZAF',
  ZMB = 'ZMB',
  ZWE = 'ZWE',
}
export type CountryCodeUnion = `${CountryCodeEnum}`;

export interface OnlineResource {
  createdAt?: Date | string;
  extensions?: Extension[];
  identifier?: string;
  isMock?: boolean;
  name?: string;
  notes?: string;
  provider?: string;
  resourceSubType?: string;
  resourceType?: OnlineResourceTypeUnion;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export enum OnlineResourceTypeEnum {
  EMAIL = 'EMAIL',
  OTHER = 'OTHER',
  SOCIAL_MEDIA = 'SOCIAL_MEDIA',
  URL = 'URL',
}
export type OnlineResourceTypeUnion = `${OnlineResourceTypeEnum}`;

export interface Participant {
  contacts?: Contact[];
  createdAt?: Date | string;
  extensions?: Extension[];
  homeVenueIds?: string[]; // only releveant when participantType is TEAM
  individualParticipantIds?: string[];
  isMock?: boolean;
  notes?: string;
  onlineResources?: OnlineResource[];
  participantId: string;
  participantName?: string;
  // CODES first-class: this participant's identity in OTHER organisations' systems, one
  // entry per organisation. Unlike `person.personOtherIds` this works for PAIR and TEAM
  // participants, which carry no `person` at all.
  participantOtherIds?: UnifiedParticipantID[];
  participantOtherName?: string;
  participantRole?: ParticipantRoleUnion;
  participantRoleResponsibilities?: string[];
  participantStatus?: ParticipantStatusUnion;
  participantType?: ParticipantTypeUnion;
  penalties?: Penalty[];
  person?: Person;
  personId?: string;
  representing?: CountryCodeUnion;
  teamId?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  useOtherName?: boolean;
}

export interface Contact {
  createdAt?: Date | string;
  emailAddress?: string;
  extensions?: Extension[];
  fax?: string;
  isMock?: boolean;
  isPublic?: boolean;
  mobileTelephone?: string;
  name?: string;
  notes?: string;
  telephone?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export enum ParticipantRoleEnum {
  ADMINISTRATION = 'ADMINISTRATION',
  CAPTAIN = 'CAPTAIN',
  COACH = 'COACH',
  COMPETITOR = 'COMPETITOR',
  DIRECTOR = 'DIRECTOR',
  HOSPITALITY = 'HOSPITALITY',
  MEDIA = 'MEDIA',
  MEDICAL = 'MEDICAL',
  OFFICIAL = 'OFFICIAL',
  OTHER = 'OTHER',
  PHYSIO = 'PHYSIO',
  SCOREKEEPER = 'SCOREKEEPER',
  SECURITY = 'SECURITY',
  STRINGER = 'STRINGER',
  SUPERVISOR = 'SUPERVISOR',
  TIMEKEEPER = 'TIMEKEEPER',
  TRAINER = 'TRAINER',
  TRANSPORT = 'TRANSPORT',
  VOLUNTEER = 'VOLUNTEER',
}
export type ParticipantRoleUnion = `${ParticipantRoleEnum}`;

export enum ParticipantStatusEnum {
  ACTIVE = 'ACTIVE',
  WITHDRAWN = 'WITHDRAWN',
}
export type ParticipantStatusUnion = `${ParticipantStatusEnum}`;

export enum ParticipantTypeEnum {
  GROUP = 'GROUP',
  INDIVIDUAL = 'INDIVIDUAL',
  PAIR = 'PAIR',
  TEAM = 'TEAM',
}
export type ParticipantTypeUnion = `${ParticipantTypeEnum}`;

export interface Penalty {
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  issuedAt?: string;
  matchUpId?: string;
  notes?: string;
  penaltyCode?: string;
  penaltyId: string;
  penaltyType: PenaltyTypeUnion;
  refereeParticipantId?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export enum PenaltyTypeEnum {
  BALL_ABUSE = 'BALL_ABUSE',
  COACHING = 'COACHING',
  DRESS_CODE_VIOLATION = 'DRESS_CODE_VIOLATION',
  EQUIMENT_VIOLATION = 'EQUIMENT_VIOLATION',
  FAILUIRE_TO_SIGN_IN = 'FAILUIRE_TO_SIGN_IN',
  FAILURE_TO_COMPLETE = 'FAILURE_TO_COMPLETE',
  INELIGIBILITY = 'INELIGIBILITY',
  LEAVING_THE_COURT = 'LEAVING_THE_COURT',
  NO_SHOW = 'NO_SHOW',
  OTHER = 'OTHER',
  PHYSICAL_ABUSE = 'PHYSICAL_ABUSE',
  PROHIBITED_SUBSTANCE = 'PROHIBITED_SUBSTANCE',
  PUNCTUALITY = 'PUNCTUALITY',
  RACKET_ABUSE = 'RACKET_ABUSE',
  REFUSAL_TO_PLAY = 'REFUSAL_TO_PLAY',
  UNSPORTSMANLIKE_CONDUCT = 'UNSPORTSMANLIKE_CONDUCT',
  VERBAL_ABUSE = 'VERBAL_ABUSE',
}
export type PenaltyTypeUnion = `${PenaltyTypeEnum}`;

export interface Person {
  addresses?: Address[];
  biographicalInformation?: BiographicalInformation;
  birthDate?: string;
  /** Year-precision date of birth (CODES). Use when only the birth year is
   *  known (common in federation junior data). `birthDate` is authoritative when
   *  both are present; age/category eligibility falls back to this via the
   *  calendar-year convention (age-in-year = year − birthYear). */
  birthYear?: number;
  contacts?: Contact[];
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  nationalityCode?: string;
  nativeFamilyName?: string;
  nativeGivenName?: string;
  notes?: string;
  onlineResources?: OnlineResource[];
  otherNames?: string[];
  parentOrganisationId?: string;
  passportFamilyName?: string;
  passportGivenName?: string;
  personId: string;
  personOtherIds?: UnifiedPersonID[];
  previousNames?: string[];
  sectionId?: string;
  sex?: SexUnion;
  standardFamilyName?: string;
  standardGivenName?: string;
  status?: string;
  tennisId?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  wheelchair?: boolean;
}

export interface Address {
  addressLine1?: string;
  addressLine2?: string;
  addressLine3?: string;
  addressName?: string;
  addressType?: AddressTypeUnion;
  city?: string;
  countryCode?: CountryCodeUnion;
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  /**
   * Stored as a number in production records, but written as a string by some
   * producers (e.g. `activateFromSanctioning` stringifies sanctioning coordinates).
   * Both forms are real; consumers must coerce rather than assume.
   */
  latitude?: string | number;
  longitude?: string | number;
  notes?: string;
  postalCode?: string;
  state?: string;
  timeItems?: TimeItem[];
  timeZone?: string;
  updatedAt?: Date | string;
}

export enum AddressTypeEnum {
  HOME = 'HOME',
  MAIL = 'MAIL',
  PRIMARY = 'PRIMARY',
  RESIDENTIAL = 'RESIDENTIAL',
  VENUE = 'VENUE',
  WORK = 'WORK',
}
export type AddressTypeUnion = `${AddressTypeEnum}`;

export interface TeamAttribute {
  teamId?: string;
  teamName?: string;
  jerseyNumber?: string;
  jerseyName?: string;
  position?: string;
  captain?: boolean;
}

export interface BiographicalInformation {
  ageBeganTennis?: number;
  ageTurnedPro?: number;
  birthCountryCode?: CountryCodeUnion;
  coachId?: string;
  createdAt?: Date | string;
  doublePlayingHand?: PlayingDoubleHandCodeUnion;
  extensions?: Extension[];
  height?: number;
  heightUnit?: LengthUnitUnion;
  isMock?: boolean;
  notes?: string;
  organisationIds?: string[];
  placeOfResidence?: string;
  playingHand?: PlayingHandCodeUnion;
  residenceCountryCode?: CountryCodeUnion;
  teamAttributes?: TeamAttribute[];
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  weight?: number;
  weightUnit?: WeightUnitEnum;
}

export enum PlayingDoubleHandCodeEnum {
  BACKHAND = 'BACKHAND',
  BOTH = 'BOTH',
  FOREHAND = 'FOREHAND',
  NONE = 'NONE',
}
export type PlayingDoubleHandCodeUnion = `${PlayingDoubleHandCodeEnum}`;

export enum LengthUnitEnum {
  CENTIMETER = 'CENTIMETER',
  METER = 'METER',
  MILLIMETER = 'MILLIMETER',
}
export type LengthUnitUnion = `${LengthUnitEnum}`;

export enum PlayingHandCodeEnum {
  AMBIDEXTROUS = 'AMBIDEXTROUS',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
}
export type PlayingHandCodeUnion = `${PlayingHandCodeEnum}`;

export enum WeightUnitEnum {
  GRAM = 'GRAM',
  KILOGRAM = 'KILOGRAM',
}
export type WeightUnitUnion = `${WeightUnitEnum}`;

export interface UnifiedPersonID {
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  organisationId: string;
  personId: string;
  timeItems?: TimeItem[];
  uniqueOrganisationName?: string;
  updatedAt?: Date | string;
}

/**
 * The sex of a PERSON. Distinct from {@link GenderEnum}, which is the gender
 * category of a competition — see the note there for how the two diverge.
 */
export enum SexEnum {
  FEMALE_ABBR = 'F',
  MALE_ABBR = 'M',
  OTHER_ABBR = 'O',

  FEMALE = 'FEMALE',
  MALE = 'MALE',
  OTHER = 'OTHER',
}
export type SexUnion = `${SexEnum}`;

export interface RegistrationProfile {
  // temporal
  createdAt?: Date | string;
  entriesClose?: Date | string;
  entriesOpen?: Date | string;
  updatedAt?: Date | string;
  withdrawalDeadline?: Date | string;

  // entry & eligibility
  eligibilityNotes?: string;
  entryFees?: RegistrationEntryFee[];
  entryMethod?: string;
  entryUrl?: string;

  // logistics (structured + HTML notes)
  accommodation?: LogisticsSection;
  hospitality?: LogisticsSection;
  medicalInfo?: LogisticsSection;
  transportation?: LogisticsSection;

  // simple text
  contingencyPlan?: string;
  dressCode?: string;

  // ceremony & social
  awardsCeremonyDate?: string;
  awardsDescription?: string;
  drawCeremonyDate?: string;
  socialEvents?: SocialEvent[];

  // regulations & compliance
  codeOfConduct?: DocumentLink;
  regulations?: DocumentLink[];

  // branding
  sponsors?: Sponsor[];

  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  timeItems?: TimeItem[];
}

export interface LogisticsSection {
  notes?: string;
  options?: LogisticsOption[];
}

export interface LogisticsOption {
  address?: string;
  description?: string;
  email?: string;
  extensions?: Extension[];
  name: string;
  notes?: string;
  phone?: string;
  priceRange?: string;
  url?: string;
}

export interface SocialEvent {
  date?: string;
  description?: string;
  location?: string;
  name: string;
  time?: string;
}

export interface Sponsor {
  logoUrl?: string;
  name: string;
  tier?: string;
  websiteUrl?: string;
}

export interface DocumentLink {
  description?: string;
  name: string;
  url?: string;
}

export interface RegistrationEntryFee {
  amount: number;
  category?: string;
  currencyCode: string;
  eventType?: EventTypeUnion;
  extensions?: Extension[];
}

export interface PrizeMoney {
  amount: number;
  createdAt?: Date | string;
  currencyCode: string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export interface UnifiedTournamentID {
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  /** marks this entry as the source the RECORD originated from — the ingest or
   *  sanctioning system the whole tournament was acquired from. At most one entry per
   *  tournament should carry it; every other entry is a system the tournament is merely
   *  also known to (typically acquired by copy-back).
   *
   *  Mirrors {@link UnifiedEventID.isOrigin} one grain up. The two are independent: a
   *  record acquired wholesale from one organisation can still carry events sanctioned
   *  by others, so neither flag can be inferred from the other.
   *
   *  Unlike `UnifiedEventID`, `tournamentId` here stays REQUIRED. `eventId` is optional
   *  at event grain because the origin may not hold the event yet; at tournament grain
   *  the id is the entire payload, and an entry without one carries no identity at all. */
  isOrigin?: boolean;
  notes?: string;
  organisationId: string;
  timeItems?: TimeItem[];
  tournamentId: string;
  uniqueOrganisationName?: string;
  updatedAt?: Date | string;
}

/**
 * CODES first-class: a DRAW's identity in another organisation's system — the
 * draw-grain member of the `Unified*ID` family ({@link UnifiedTournamentID},
 * {@link UnifiedEventID}, {@link UnifiedParticipantID}, {@link UnifiedPersonID},
 * {@link UnifiedVenueID}).
 *
 * Carried on `DrawDefinition.drawOtherIds[]`. It exists because an outside organisation's
 * draw-grain object is frequently the ONLY grain that carries the identity and the
 * metadata worth addressing. UTR is the motivating case: a UTR "flight" is a real remote
 * object with its own GUID, its own `drawSize`, and its own UTR-band bounds, and it maps
 * 1:1 to a CODES `drawDefinition` — while UTR has no event-grain object at all, so the
 * CODES event above it is a synthetic gender × matchUpType grouping with no counterpart
 * to record.
 *
 * Every id attribute is OPTIONAL and belongs to `organisationId`, never to the carrying
 * record. Populate only the ones the origin system actually has: UTR supplies
 * `tournamentId` (its event id) + `drawId` (the flight GUID) and no `eventId`, and an
 * origin that models events supplies `eventId` too. `drawId` is absent until the draw
 * exists there, which is the copy-back case — see {@link UnifiedEventID}.
 */
export interface UnifiedDrawID {
  createdAt?: Date | string;
  /** that organisation's id for this draw */
  drawId?: string;
  /** that organisation's id for the event carrying this draw, when it models events */
  eventId?: string;
  extensions?: Extension[];
  isMock?: boolean;
  /** marks this entry as the source the draw originated from. At most one entry per draw
   *  should carry it. */
  isOrigin?: boolean;
  notes?: string;
  organisationId: string;
  timeItems?: TimeItem[];
  /** **that organisation's** tournamentId — never the carrying record's */
  tournamentId?: string;
  uniqueOrganisationName?: string;
  updatedAt?: Date | string;
}

/**
 * CODES first-class: an EVENT's identity in another organisation's system —
 * the event-grain member of the `Unified*ID` family
 * ({@link UnifiedTournamentID}, {@link UnifiedPersonID}, {@link UnifiedVenueID}).
 *
 * Carried on `Event.eventOtherIds[]`. It exists because a single tournamentRecord
 * can hold events sanctioned by SEVERAL organisations, each of which has its own
 * internal `tournamentId`. The record has exactly one `tournamentId`; an event's
 * sanctioning tournament is independent of it, and the sanctioning body may hold no
 * record that carries the event at all.
 *
 * `tournamentId` is therefore OPTIONAL and deliberately *not* the carrying record's:
 * it is the id of the tournament in `organisationId`'s system. `eventId` is likewise
 * that system's id for this event, which is absent until the event exists there —
 * an event may be copied back to its origin after the fact, or through an external
 * API integration, at which point the returned id is written here.
 */
/**
 * CODES first-class: a PARTICIPANT's identity in another organisation's system — the
 * participant-grain member of the `Unified*ID` family ({@link UnifiedTournamentID},
 * {@link UnifiedEventID}, {@link UnifiedPersonID}, {@link UnifiedVenueID}).
 *
 * Carried on `Participant.participantOtherIds[]`. It exists because
 * {@link UnifiedPersonID} cannot cover every competitor: `personOtherIds` hangs off
 * `participant.person`, and a **PAIR or TEAM participant has no `person`** — only
 * `individualParticipantIds`. So a pair or team registered with an outside body had
 * nowhere to record that body's id for it.
 *
 * Sitting on the participant rather than the person makes it uniform across INDIVIDUAL,
 * PAIR and TEAM, and it is what lets an integration layer address results back to the
 * sanctioning system that registered them.
 */
export interface UnifiedParticipantID {
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  organisationId: string;
  /** that organisation's id for this participant — its registration/entry identity, which
   *  need not resemble any id of ours */
  participantId: string;
  timeItems?: TimeItem[];
  uniqueOrganisationName?: string;
  updatedAt?: Date | string;
}

export interface UnifiedEventID {
  createdAt?: Date | string;
  eventId?: string;
  extensions?: Extension[];
  /** marks this entry as the SANCTIONING SOURCE the event originated from. At most one
   *  entry per event should carry it; every other entry is a system the event is merely
   *  also known to (typically acquired by copy-back). */
  isOrigin?: boolean;
  isMock?: boolean;
  notes?: string;
  organisationId: string;
  timeItems?: TimeItem[];
  tournamentId?: string;
  uniqueOrganisationName?: string;
  updatedAt?: Date | string;
}

export interface Venue {
  addresses?: Address[];
  contacts?: Contact[];
  courts?: Court[];
  createdAt?: Date | string;
  dateAvailability?: Availability[];
  defaultEndTime?: string;
  defaultStartTime?: string;
  // CODES first-class: previously stored as `disabled` extension
  disabled?: boolean | { dates?: string[] };
  extensions?: Extension[];
  // Canonical cross-tournament facility identity (courthive-facilities). Defaults
  // to venueId — a venue is its own facility unless several venues dedupe to one
  // physical facility. Read into the read-model `facility_id` by cast().
  facilityId?: string;
  isMock?: boolean;
  isPrimary?: boolean;
  notes?: string;
  onlineResources?: OnlineResource[];
  parentOrganisationId?: string;
  roles?: string[];
  subVenues?: Venue[];
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
  venueAbbreviation?: string;
  venueId: string;
  venueName?: string;
  venueOtherIds?: UnifiedVenueID[];
  venueType?: string;
}

export interface Court {
  altitude?: number;
  courtDimensions?: string;
  courtId: string;
  courtName?: string;
  createdAt?: Date | string;
  dateAvailability?: Availability[];
  // CODES first-class: previously stored as `disabled` extension
  disabled?: boolean | { dates?: string[] };
  /**
   * The sport this court is for. Absent means unspecified, NOT tennis — a court nobody has
   * declared a discipline for is not evidence that it is a tennis court, and defaulting it
   * would invent data.
   *
   * A physical surface can serve more than one sport (a tennis court with pickleball lines, or a
   * portable net dropped on it). That is a court CAPABILITY and is deliberately NOT modelled
   * here: this field says what the court IS, so a dedicated pickleball court is distinguishable
   * from a tennis court. Do not repurpose it to mean "can also host" — that turns one physical
   * slab into two schedulable courts.
   *
   * Open vocabulary, like `Event.discipline`: normalize with `normalizeDiscipline` and constrain
   * with the `allowedDisciplines` policy where a fixed list is required.
   */
  discipline?: DisciplineUnion;
  extensions?: Extension[];
  floodlit?: boolean;
  indoorOutdoor?: IndoorOutdoorUnion;
  isMock?: boolean;
  latitude?: string;
  longitude?: string;
  notes?: string;
  onlineResources?: OnlineResource[];
  pace?: string;
  surfaceCategory?: SurfaceCategoryUnion;
  surfacedDate?: Date | string;
  surfaceType?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export interface Availability {
  bookings?: Booking[];
  createdAt?: Date | string;
  date?: string;
  endTime?: string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  startTime?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

/**
 * What a court booking represents. Persisted on `Booking.bookingType`.
 *
 * DRYING is deliberately distinct from MAINTENANCE: maintenance is planned and
 * can usually be deferred, drying is reactive and cannot — they need separate
 * scheduling precedence, and collapsing them makes "how much court time did we
 * lose to weather?" unanswerable after the fact.
 *
 * SCHEDULED is an umbrella for court time allocated to tournament play — it
 * means the time is spoken for, whether or not a specific matchUp ends up on
 * the court. It is NOT how scheduled matchUps reach the availability engine:
 * those arrive through `AvailabilityEngine.importScheduledMatchUps()`, which
 * builds SCHEDULED blocks straight from matchUps and never touches
 * `bookingType`.
 *
 * The engine-side vocabulary these map onto is `BLOCK_TYPES` (a superset — it
 * also carries derived and legacy states that are never persisted here).
 */
export enum BookingTypeEnum {
  BLOCKED = 'BLOCKED',
  CLOSED = 'CLOSED',
  DRYING = 'DRYING',
  MAINTENANCE = 'MAINTENANCE',
  PRACTICE = 'PRACTICE',
  RESERVED = 'RESERVED',
  SCHEDULED = 'SCHEDULED',
}
export type BookingTypeUnion = `${BookingTypeEnum}`;

export interface Booking {
  bookingId?: string;
  // Widened with `(string & {})` so unrecognised values from external sources
  // still type-check while known members keep autocompleting. The engine maps
  // anything unrecognised to BLOCK_TYPES.BLOCKED — see BOOKING_TYPE_MAP.
  bookingType?: BookingTypeUnion | (string & {});
  capacity?: number | null;
  createdAt?: Date | string;
  endTime?: string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  registrations?: PracticeRegistration[];
  startTime?: string;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

/**
 * Lifecycle of one participant's registration against a PRACTICE booking.
 *
 * Enum-only by design — there is deliberately no const-module twin. Both values
 * are strings that already carry unrelated meanings elsewhere in the domain:
 * `CONFIRMED` is an entry status (`entryStatusValues`) and `CANCELLED` is both a
 * matchUp status (`matchUpStatusValues`) and a tournament status
 * (`tournamentConstants`). Pinning this vocabulary to any of those buckets would
 * assert a relationship that does not exist, and minting a third `CANCELLED`
 * const would make an import ambiguous at a glance. Same call, same reasoning as
 * `DrawStatusEnum`. The enum is value-exported (see `types/enumExports.ts`), so
 * consumers reach `PracticeRegistrationStatusEnum.CONFIRMED` at runtime.
 */
export enum PracticeRegistrationStatusEnum {
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
}
export type PracticeRegistrationStatusUnion = `${PracticeRegistrationStatusEnum}`;

export interface PracticeRegistration {
  cancelledAt?: Date | string;
  createdAt?: Date | string;
  endTime: string;
  extensions?: Extension[];
  notes?: string;
  participantId: string;
  registeredAt?: Date | string;
  registrationId: string;
  startTime: string;
  status?: PracticeRegistrationStatusUnion;
  timeItems?: TimeItem[];
  updatedAt?: Date | string;
}

export interface UnifiedVenueID {
  createdAt?: Date | string;
  extensions?: Extension[];
  isMock?: boolean;
  notes?: string;
  organisationId: string;
  timeItems?: TimeItem[];
  uniqueOrganisationName?: string;
  updatedAt?: Date | string;
  venueId: string;
}

export enum WeekdayEnum {
  MON = 'MON',
  TUE = 'TUE',
  WED = 'WED',
  THU = 'THU',
  FRI = 'FRI',
  SAT = 'SAT',
  SUN = 'SUN',
}
export type WeekdayUnion = `${WeekdayEnum}`;
