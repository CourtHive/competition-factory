import type { AvoidancePolicy, MatchUpActionsPolicy } from './policyShapes';
import { DOUBLES_EVENT, SINGLES_EVENT, TEAM_EVENT } from '@Constants/eventConstants';
import type { RotatingPartnerScoringPolicies } from './rotatingPartnerScoring';
import type { RotatingPartnerTallyPolicy } from './rotatingPartnerTally';
import { SignedInStatusUnion } from '@Constants/participantConstants';
import type { RoundRobinTallyPolicy } from './roundRobinTallyPolicy';
import type { HydrationCache } from './hydrationCacheTypes';
import { HydratedMatchUp, HydratedParticipant } from './hydrated';
import { ErrorType } from '@Constants/errorConditionConstants';
import type { RatingsPolicy } from './ratingsPolicyTypes';
import type { Attribution } from './presenceTypes';
import type { LadderPolicy } from './ladderTypes';
import {
  Category,
  DrawDefinition,
  Entry,
  Event,
  Extension,
  MatchUpFinishingPositionRange,
  StageTypeUnion,
  TeamCompetitor,
  TimeItem,
  Tournament,
  EventTypeUnion,
  ParticipantTypeUnion,
  GenderUnion,
  SexUnion,
  ParticipantRoleUnion,
  MatchUpStatusUnion,
  DrawTypeUnion,
  SeedingProfileUnion,
  SeedingBasisUnion,
  MatchUpSchedule,
  TieFormat,
  Structure,
  MatchUp,
} from './tournamentTypes';
import {
  ValidPolicyTypes,
  POLICY_TYPE_SEEDING,
  POLICY_TYPE_SCORING,
  POLICY_TYPE_ROTATING_PARTNER_TALLY,
  POLICY_TYPE_ROUND_ROBIN_TALLY,
  POLICY_TYPE_SCHEDULING,
  POLICY_TYPE_ROUND_NAMING,
  POLICY_TYPE_MATCHUP_ACTIONS,
  POLICY_TYPE_AVOIDANCE,
  POLICY_TYPE_LADDER,
  POLICY_TYPE_RATINGS,
} from '@Constants/policyConstants';

export type FactoryEngine = {
  [key: string]: any;
};

export type { FactoryEngineMethod } from './factoryEngineMethods';

export type TournamentRecords = {
  [key: string]: Tournament;
};

export type CheckInOutParticipantArgs = {
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  matchUp?: MatchUp | HydratedMatchUp;
  /** the SUBJECT — an INDIVIDUAL participant. A PAIR or TEAM is refused (CODES 7.0.0) */
  participantId: string;
  matchUpId: string;
  event?: Event;
  /** who ATTESTED the presence — never who is present. May name somebody not in the record */
  attributedTo?: Attribution;
  /** ISO — when the presence HAPPENED, as opposed to when this instance wrote it. Defaults to now */
  occurredAt?: string;
  /** supply to make a replayed mutation idempotent across a disconnected sync */
  attestationId?: string;
  notes?: string;
};

export type ScheduleTimesResult = { scheduleTime: string };

export type SeedBlock = {
  drawPositions: number[];
  seedNumbers: number[];
};

export type SeedingProfile = {
  groupSeedingThreshold?: number;
  /**
   * Seeding pattern for a seed block. `ADJACENT` is a synonym for `CLUSTER`.
   * Unrelated to `PositioningProfileEnum`, which governs a different concern.
   */
  positioning?: SeedingProfileUnion;
  nonRandom?: boolean;
};

/**
 * One row of a seeding policy's `seedsCountThresholds`.
 *
 * With `drawSizeProgression` the largest threshold at or below the draw size applies;
 * without it, only an exact `drawSize` match does.
 */
export type SeedsCountThreshold = {
  minimumParticipantCount: number;
  seedsCount: number;
  drawSize: number;
};

/**
 * The `seedingProfile` as it appears in a SEEDING **policy** — a superset of
 * {@link SeedingProfile}, which is the profile as it applies to a single draw.
 *
 * A policy may express the profile three ways, and `validateAndDeriveDrawValues`
 * resolves them in this order:
 *
 * 1. an explicit `seedingProfile` param on the draw-generation call;
 * 2. `drawTypes[drawType]` — a per-drawType override;
 * 3. the profile itself.
 *
 * This is the OBJECT form — what a policy editor holds and mutates. The legacy bare-string
 * form is expressed on {@link SeedingPolicy.seedingProfile}, not here: `getSeedPattern` and
 * `structureTemplate` both accept a positioning string where a profile object is expected.
 */
export type PolicySeedingProfile = SeedingProfile & {
  /** Per-drawType overrides, keyed by drawType. Consulted BEFORE the outer profile. */
  drawTypes?: { [drawType: string]: SeedingProfile | SeedingProfileUnion };
};

/**
 * A SEEDING policy, as the factory actually reads it.
 *
 * This shape was previously undeclared — `PolicyDefinitions` types every policy as
 * `{ [key: string]: any }`, so `seedingProfile.drawTypes` was read by
 * `validateAndDeriveDrawValues` without any type describing it. Consumers that needed
 * the shape had to hand-write a mirror, which is how a mirror comes to drift.
 *
 * Wired into {@link PolicyDefinitions} under `POLICY_TYPE_SEEDING` (#4839, breaking); other
 * policy types remain `{ [key: string]: any }`.
 */
/**
 * An allowance for seeds ABOVE the count `seedsCountThresholds` yields — *additional* seeds, not
 * a larger seed count.
 *
 * The distinction is the whole point. A governing body that protects a returning player does not
 * raise a 128-draw from 32 seeds to 33; it adds a 33rd seed alongside the 32, so that no one is
 * displaced from a seeding slot they earned. The factory's block positioning already gives that
 * for free — `constructPower2Blocks` fills seed blocks in order, so extras consume the NEXT block
 * and the blocks below it are untouched — which is why this is an allowance on the COUNT and
 * nothing more.
 *
 * What this does NOT do, deliberately:
 *
 * - **It does not decide eligibility.** "The player's first eight events of the season" is a
 *   counter across tournaments; the factory sees one `tournamentRecord`. Entitlement is determined
 *   upstream and arrives here recorded, as a {@link SeedingBasisUnion} on the seed assignment.
 * - **It does not vary by draw size.** A body needing different allowances per draw size expresses
 *   that as separate policies, which is also how a body that permits none under one rule book and
 *   some under another expresses THAT — a different policy, resolved through the normal hierarchy.
 * - **It does not police the basis.** `bases` narrows what may CLAIM an additional seed and is
 *   reported by `getAdditionalSeedsAllowance` so a client can build the right control. It is not a
 *   write-time refusal: the count is the binding limit.
 */
export type AdditionalSeedsAllowance = {
  /** How many seeds are permitted above the threshold count. */
  maxCount: number;
  /** Which bases may claim one. Omitted means any basis may. */
  bases?: SeedingBasisUnion[];
};

export type SeedingPolicy = {
  seedsCountThresholds?: SeedsCountThreshold[];
  validSeedPositions?: { ignore?: boolean; strict?: boolean };
  /** The object form, or the legacy bare positioning string the readers still honour. */
  seedingProfile?: PolicySeedingProfile | SeedingProfileUnion;
  /** Seeds permitted ABOVE the threshold count. See {@link AdditionalSeedsAllowance}. */
  additionalSeeds?: AdditionalSeedsAllowance;
  containerByesIgnoreSeeding?: boolean;
  duplicateSeedNumbers?: boolean;
  drawSizeProgression?: boolean;
  policyName?: string;
};

export type ScaleAttributes = {
  eventType?: EventTypeUnion;
  scaleName?: string;
  scaleType: string;
  accessor?: string; // optional - string determining how to access attribute if scaleValue is an object
  ascending?: boolean; // optional - `false` sorts scaled entries highest first (`getScaledEntries`)
};

export type ScaleItem = {
  scaleDate?: string | Date;
  eventType?: EventTypeUnion;
  scaleName: string;
  scaleType: string;
  scaleValue: any;
};

export type Flight = {
  manuallyAdded?: boolean; // added with a draw (`addDrawDefinition`) rather than by an automated split
  drawEntries: Entry[]; // entries allocated to target draw
  // the flight's level, fixed when the flight is made: award points are looked up by it, so reordering or deleting
  // draws never renumbers it. Display order is `drawOrder`
  flightNumber: number;
  drawOrder?: number; // display order, written by `updateDrawIdsOrder`; once the flight's draw exists, the draw's `drawOrder` governs
  // custom name for the generated draw; a draw added without a name leaves it unset (`addDrawDefinition`)
  drawName?: string;
  drawId: string; // unique identifier for generating drawDefinitions
  stage?: StageTypeUnion; // set by `addFlight`
  qualifyingPositions?: number; // set by `addFlight`
};

/**
 * LEGACY: links between flights, from flight-based voluntary consolation (removed 2022-04-13). Nothing writes them
 * now; `addDrawDefinition` still refuses a draw whose linked source draw is missing.
 */
export type FlightLink = { source?: { drawId?: string }; target?: { drawId?: string } };

/** Stored as `event.flightProfile` (CODES first-class; the `flightProfile` extension on older records). */
export type FlightProfile = {
  scaleAttributes?: ScaleAttributes;
  splitMethod?: string;
  flights: Flight[];
  links?: FlightLink[];
};

/** A flight as `getFlightProfile` returns it through an engine: a copy, with the draw generated for it attached. */
export type HydratedFlight = Flight & { drawDefinition?: DrawDefinition };

/** `getFlightProfile`'s return through an engine (called with `eventId`): a deep copy whose flights carry their draws. */
export type HydratedFlightProfile = Omit<FlightProfile, 'flights'> & { flights: HydratedFlight[] };

/**
 * Minutes a scheduling timing entry states, by matchUp type. A reader takes the matchUp's own type, else TEAM for a
 * line of a TEAM event, else `default`. `SINGLES_DOUBLES` / `DOUBLES_SINGLES` are recovery minutes when a participant's
 * next matchUp changes type (from SINGLES to DOUBLES, and the reverse).
 */
export type SchedulingMinutes = {
  default?: number;
  SINGLES?: number;
  DOUBLES?: number;
  TEAM?: number;
  SINGLES_DOUBLES?: number;
  DOUBLES_SINGLES?: number;
};

/** Minutes for the categories it names: by `categoryNames`, else `categoryTypes`; an entry naming neither matches any. */
export type SchedulingCategoryTimes = {
  categoryNames?: string[];
  categoryTypes?: string[];
  minutes: SchedulingMinutes;
};

/** A recovery band keyed on measured played minutes; the band without `upTo` is the catch-all. */
export type SchedulingRecoveryBand = {
  upTo?: number;
  minutes: number;
};

export type SchedulingRecoveryTimes = SchedulingCategoryTimes & {
  /** Recovery banded by the measured duration of the previous matchUp; wins over `minutes` when a duration is known. */
  byPlayedMinutes?: SchedulingRecoveryBand[];
};

/** Times used when no format-specific entry matches. */
export type SchedulingDefaultTimes = {
  averageTimes?: SchedulingCategoryTimes[];
  recoveryTimes?: SchedulingRecoveryTimes[];
  /** Rest across a day boundary. Absent means no rule, not zero. */
  overnightTimes?: SchedulingCategoryTimes[];
  /** Minutes between two venues with no stated transit. */
  transitMinutes?: number;
};

export type SchedulingFormatAverageTimes = {
  matchUpFormatCodes: string[];
  averageTimes: SchedulingCategoryTimes[];
};

export type SchedulingFormatRecoveryTimes = {
  matchUpFormatCodes: string[];
  recoveryTimes: SchedulingRecoveryTimes[];
};

/** Most matchUps a participant may play in a day, per matchUp type and in total. */
export type SchedulingDailyLimits = {
  SINGLES?: number;
  DOUBLES?: number;
  TEAM?: number;
  total?: number;
};

/** One participant's daily limits, overriding the policy's `defaultDailyLimits`. */
export type SchedulingParticipantDailyLimits = SchedulingDailyLimits & {
  participantId: string;
};

/**
 * A SCHEDULING policy. Stored, like every policy, in the record's applied policies, resolved for a draw from the
 * draw's policy, else its event's, else the tournament's. Mirrored by the `SchedulingPolicy` definition in the CODES
 * schema (`tournament.schema.json`); `policyDefinitionsSchema.test.ts` keeps the two in step.
 */
export type SchedulingPolicy = {
  policyName?: string;
  /** Whether courts or venues may be modified once matchUps are scheduled on them. */
  allowModificationWhenMatchUpsScheduled?: { courts?: boolean; venues?: boolean };
  defaultTimes?: SchedulingDefaultTimes;
  /**
   * Minutes per scheduling period (Garman's `L`) for a run that does not state one. A run's own `periodLength` wins,
   * then a profile round's own `periodLength`, then this; absent, the schedulers keep their own defaults. A positive
   * number; anything else is ignored.
   */
  defaultPeriodLength?: number;
  defaultDailyLimits?: SchedulingDailyLimits;
  matchUpAverageTimes?: SchedulingFormatAverageTimes[];
  matchUpRecoveryTimes?: SchedulingFormatRecoveryTimes[];
  matchUpDailyLimits?: SchedulingParticipantDailyLimits[];
};

/** A ROUND NAMING policy: how rounds are named and abbreviated. Mirrored by the CODES schema's `RoundNamingPolicy`. */
export type RoundNamingPolicy = {
  policyName?: string;
  namingConventions?: { round?: string; pre?: string };
  /** Round name by the number of matchUps in the round (`1: 'Final'`). */
  roundNamingMap?: { [matchUpsCount: string]: string };
  abbreviatedRoundNamingMap?: { [matchUpsCount: string]: string };
  /** A qualifying structure's final round names, by the number of matchUps. */
  qualifyingFinishMap?: { [matchUpsCount: string]: string };
  affixes?: { roundNumber?: string; preFeedRound?: string; preQualifying?: string };
  /** Prefix for each stage (MAIN, QUALIFYING, CONSOLATION, PLAY_OFF). */
  stageConstants?: { [stage: string]: string };
};

export type PolicyDefinitions = {
  [key in ValidPolicyTypes]?: { [key: string]: any };
} & {
  [POLICY_TYPE_ROTATING_PARTNER_TALLY]?: RotatingPartnerTallyPolicy;
  [POLICY_TYPE_SEEDING]?: SeedingPolicy;
  [POLICY_TYPE_SCHEDULING]?: SchedulingPolicy;
  [POLICY_TYPE_ROUND_NAMING]?: RoundNamingPolicy;
  [POLICY_TYPE_MATCHUP_ACTIONS]?: MatchUpActionsPolicy;
  [POLICY_TYPE_AVOIDANCE]?: AvoidancePolicy;
  [POLICY_TYPE_LADDER]?: LadderPolicy;
  [POLICY_TYPE_ROUND_ROBIN_TALLY]?: RoundRobinTallyPolicy;
  [POLICY_TYPE_RATINGS]?: RatingsPolicy;
  [POLICY_TYPE_SCORING]?: { rotatingPartners?: RotatingPartnerScoringPolicies; [key: string]: unknown };
};

/** A directive `getExtensionUpdate` returns, to replay an extension on another engine through `executionQueue`. */
export type QueueMethod =
  | { method: 'addExtension'; params: { extension: Extension; discover: boolean } }
  | { method: 'addEventExtension'; params: { eventId: string; extension: Extension } };

export type RoundProfile = {
  [key: number]: {
    finishingPositionRange: MatchUpFinishingPositionRange;
    pairedDrawPositions: number[][];
    abbreviatedRoundName?: string;
    hasFedDrawPosition?: boolean;
    participantsCount?: number;
    drawPositions?: number[];
    inactiveRound?: boolean;
    feedRoundIndex?: number;
    inactiveCount?: number;
    finishingRound?: number;
    preFeedRound?: boolean;
    matchUpsCount: number;
    roundFactor?: number;
    feedRound?: boolean;
    roundIndex?: number;
    roundNumber: number;
    roundName?: string;
  };
};

export type ParticipantFilters = {
  accessorValues?: { accessor: string; value: any }[];
  participantRoleResponsibilities?: string[];
  participantRoles?: ParticipantRoleUnion[];
  participantTypes?: ParticipantTypeUnion[];
  signInStatus?: SignedInStatusUnion;
  positionedParticipants?: boolean; // boolean - participantIds that are included in any structure.positionAssignments
  eventEntryStatuses?: string[]; // {string[]} participantIds that are in entry.entries with entryStatuses
  drawEntryStatuses?: string[]; // {string[]} participantIds that are in draw.entries or flightProfile.flights[].drawEntries with entryStatuses
  enableOrFiltering?: boolean;
  participantIds?: string[];
  genders?: GenderUnion[];
  eventIds?: string[];
};

export type StructureSortConfig = {
  deprioritizeCompleted?: boolean;
  mode?: { [key: string]: number };
};

export type PersonData = {
  participantExtensions?: Extension[];
  participantTimeItems?: TimeItem[];
  [key: string]: any;
};

export type AddressProps = {
  postalCodesCount?: number;
  citiesCount?: number;
  statesCount?: number;
  [key: string]: any;
};

export type TeamKey = {
  participantAttribute?: string;
  addParticipants?: boolean;
  personAttribute?: string;
  teamNames?: string[];
  accessor?: string;
  uuids?: string[];
};

export type ScheduleAnalysis =
  | boolean
  | {
      scheduledMinutesDifference: number;
    };

export type ParticipantsProfile = {
  participantType?: ParticipantTypeUnion;
  scaledParticipantsCount?: number;
  rankingRange?: [number, number];
  nationalityCodesCount?: number;
  scaleAllParticipants?: boolean;
  personExtensions?: Extension[];
  valuesInstanceLimit?: number;
  addressProps?: AddressProps;
  convertExtensions?: boolean;
  participantsCount?: number;
  addParticipants?: boolean;
  withScaleValues?: boolean;
  personAttribute?: string;
  consideredDate?: string;
  withGroupings?: boolean;
  personData?: PersonData;
  personIds?: string[];
  inContext?: boolean;
  category?: Category;
  withISO2?: boolean;
  withIOC?: boolean;
  teamKey?: TeamKey;
  idPrefix?: string;
  uuids?: string[];
  sex?: SexUnion;

  // Usage via participantsProfile unconfirmed...
  usePublishState?: boolean;
  withStatistics?: boolean;
  withOpponents?: boolean;
  withMatchUps?: boolean;
  withSeeding?: boolean;
  withEvents?: boolean;
  withDraws?: boolean;

  participantFilters?: ParticipantFilters;
  scheduleAnalysis?: ScheduleAnalysis;
  policyDefinitions?: PolicyDefinitions;
};

export type ScheduleVisibilityFilters = {
  visibilityThreshold: string;
  eventIds?: string[];
  drawIds?: string[];
};

export type ContextContent = {
  policies?: PolicyDefinitions;
};

export type ContextProfile = {
  withCompetitiveness?: boolean;
  withScaleValues?: boolean;
  inferGender?: boolean;
  exclude?: string[];
};

type Counters = {
  walkoverWins: number;
  defaultWins: number;
  walkovers: number;
  defaults: number;
  losses: number;
  wins: number;
};

export type ScheduleConflict = {
  priorScheduledMatchUpId: string;
  matchUpIdWithConflict: string;
};

export type LineParticipation = {
  collectionPosition: number;
  collectionId?: string;
  won: boolean;
};

export type StructureParticipation = {
  lineParticipation?: LineParticipation[];
  rankingStage: StageTypeUnion;
  walkoverWinCount: number;
  defaultWinCount: number;
  stageSequence: number;
  structureId: string;
  winCount: number;
  drawId: string;
  /** Round robin group stage only (withRankingProfile): the participant's resolved place within their group. */
  groupOrder?: number;
  /** Round robin group stage only (withRankingProfile): the number of positions in that group. */
  groupSize?: number;
};

export type MappedParticipant = {
  structureParticipation: { [key: string]: StructureParticipation } | StructureParticipation[];
  potentialMatchUps: {
    tournamentId: string;
    matchUpId: string;
    eventId: string;
    drawId: string;
  }[];
  scheduleConflicts: { [key: string]: ScheduleConflict };
  scheduleItems: any[];
  participant: HydratedParticipant & {
    groupParticipantIds: string[];
    pairParticipantIds: string[];
    teamParticipantIds: string[];
    groups: {
      participantRoleResponsibilities?: string[];
      participantOtherName?: string;
      participantName: string;
      participantId: string;
    }[];
    teams: {
      participantRoleResponsibilities?: string[];
      participantOtherName?: string;
      participantName: string;
      participantId: string;
      teamId: string;
    }[];
  };
  // NOTE: for the following an Object is used for the aggregation step and the reuslt is returned as an array
  statistics: { [key: string]: any } | any[];
  opponents: { [key: string]: any } | any[];
  pairIdMap: { [key: string]: any } | any[];
  matchUps: { [key: string]: any } | any[];
  events: { [key: string]: any } | any[];
  draws: { [key: string]: any } | any[];
  counters: Counters & {
    [DOUBLES_EVENT]: Counters;
    [SINGLES_EVENT]: Counters;
    [TEAM_EVENT]: Counters;
  };
};

export type ParticipantMap = { [key: string]: MappedParticipant };

export type GetMatchUpsArgs = {
  scheduleVisibilityFilters?: ScheduleVisibilityFilters;
  /** Internal: lookups shared within one read (see hydrationCache.ts). Never hold one across calls. */
  hydrationCache?: HydrationCache;
  tournamentAppliedPolicies?: PolicyDefinitions;
  participantsProfile?: ParticipantsProfile;
  participants?: HydratedParticipant[];
  policyDefinitions?: PolicyDefinitions;
  context?: { [key: string]: any };
  contextFilters?: MatchUpFilters;
  matchUpFilters?: MatchUpFilters;
  contextContent?: ContextContent;
  participantMap?: ParticipantMap;
  hydrateParticipants?: boolean;
  tournamentRecord?: Tournament;
  contextProfile?: ContextProfile;
  drawDefinition?: DrawDefinition;
  afterRecoveryTimes?: boolean;
  useParticipantMap?: boolean;
  usePublishState?: boolean;
  nextMatchUps?: boolean;
  tournamentId?: string;
  publishStatus?: any;
  inContext?: boolean;
  event?: Event;
};

export type GroupInfo = {
  [key: string]: {
    participantName: string;
    participantId: string;
  };
};

export type GroupsMatchUpsResult = {
  abandonedMatchUps?: HydratedMatchUp[];
  completedMatchUps?: HydratedMatchUp[];
  upcomingMatchUps?: HydratedMatchUp[];
  participants?: HydratedParticipant[];
  pendingMatchUps?: HydratedMatchUp[];
  byeMatchUps?: HydratedMatchUp[];
  matchUpsMap?: MatchUpsMap;
  matchUpsCount?: number;
  groupInfo?: GroupInfo;
  success?: boolean;
  error?: ErrorType;
};

export type ExitProfiles = { [key: string]: string[] };

type MinutesMapping = {
  categoryNames: string[];
  minutes: any;
};

export type ScheduleTiming = {
  matchUpRecoveryTimes: {
    [key: string]: {
      recoveryTiming: MinutesMapping[];
      matchUpFormatCodes: string[];
    };
  }[];
  matchUpAverageTimes: {
    [key: string]: {
      [key: string]: {
        averageTiming: MinutesMapping[];
        matchUpFormatCodes: string[];
      };
    };
  }[];
};

export type Substitution = {
  previousParticipantId: string;
  substitutionOrder: number;
  participantId: string;
};

/**
 * A structure-naming map for generated playoff structures. `abbreviation` is optional: the generators read it with
 * `?.` and the structure's `structureAbbreviation` is optional, so a name alone — what the Add playoffs dialog sends —
 * is a complete entry. It was declared required, and three typed call sites cast to send a name.
 */
export type PlayoffAttributes = {
  [key: string | number]: { name: string; abbreviation?: string };
};

/**
 * A structure-naming map keyed by finishing-position range (e.g. `'1-4'`).
 *
 * {@link PlayoffAttributes} with an optional `structureId`, which pins the generated
 * structure's id rather than letting the generator mint one.
 */
export type NamingEntry = {
  [key: string]: { name: string; abbreviation?: string; structureId?: string };
};

/**
 * Arguments for playoff structure generation within generateDrawDefinition().
 *
 * All fields except `roundPlayoffs` are passed directly to addPlayoffStructures().
 *
 * `roundPlayoffs` enables recursive nesting: each key is a source round number
 * from the current level, and its value is a WithPlayoffsArgs that defines
 * sub-playoff structures attached to the structure created from that round's losers.
 *
 * Example — full COMPASS (8 structures) in one call:
 * ```
 * withPlayoffs: {
 *   roundProfiles: [{ 1: 1 }, { 2: 1 }, { 3: 1 }],
 *   playoffAttributes: { '0-1': { name: 'West', abbreviation: 'W' }, ... },
 *   roundPlayoffs: {
 *     1: {  // children of West
 *       roundProfiles: [{ 1: 1 }, { 2: 1 }],
 *       playoffAttributes: { '0-1': { name: 'South', abbreviation: 'S' }, ... },
 *       roundPlayoffs: {
 *         1: { roundProfiles: [{ 1: 1 }], playoffAttributes: { '0-1': { name: 'Southeast', abbreviation: 'SE' } } },
 *       },
 *     },
 *     2: { roundProfiles: [{ 1: 1 }], playoffAttributes: { '0-1': { name: 'Northwest', abbreviation: 'NW' } } },
 *   },
 * }
 * ```
 */
export type WithPlayoffsArgs = {
  roundProfiles?: { [key: number]: number }[];
  playoffAttributes?: PlayoffAttributes;
  playoffStructureNameBase?: string;
  addNameBaseToAttributeName?: boolean;
  finishingPositionNaming?: NamingEntry;
  finishingPositionLimit?: number;
  playoffPositions?: number[];
  roundOffsetLimit?: number;
  exitProfileLimit?: boolean;
  roundNumbers?: number[];
  /** Recursive child playoffs keyed by source round number from this level's structure. */
  roundPlayoffs?: {
    [roundNumber: number]: WithPlayoffsArgs;
  };
};

export type LineUp = TeamCompetitor[];

export type StructureProfile = {
  distanceFromMain?: number;
  drawSources: string[];
  drawTargets: string[];
  progeny?: string[];
  sources: string[];
  targets: string[];
  rootStage?: StageTypeUnion;
  stage?: StageTypeUnion;
};

export type IdCollections = {
  groupParticipants: string[];
  pairParticipants: string[];
  teamParticipants: string[];
};

type Request = {
  requestType: string;
  requestId: string;
  startTime: string;
  endTime: string;
  date: string;
};
export type PersonRequests = {
  [key: string]: Request[];
};

export type AddScheduleAttributeArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  removePriorValues?: boolean;
  disableNotice?: boolean;
  matchUpId: string;
  event?: Event;
  /** a schedule plan's working copy of the matchUp, written in its place; internal (a caller's `matchUp` is never written) */
  workingMatchUp?: MatchUp;
};

export type MatchUpFilters = {
  matchUpStatuses?: MatchUpStatusUnion[];
  excludeMatchUpStatuses?: string[];
  hasParticipantsCount?: number;
  isCollectionMatchUp?: boolean;
  matchUpFormats?: string[];
  roundPositions?: number[];
  hasWinningSide?: boolean;
  collectionIds?: string[];
  roundNumbers?: number[];
  isMatchUpTie?: boolean;
  matchUpFormat?: string;
  matchUpIds?: string[];
  roundNames?: string[];

  // only applies to inContext matchUps and only when processContext boolean is true
  processContext?: boolean;

  stageSequences?: string[];
  scheduledDates?: string[];
  participantIds?: string[];
  stages?: StageTypeUnion[];
  tournamentIds?: string[];
  matchUpTypes?: string[];
  structureIds?: string[];
  scheduledDate?: string;
  readyToScore?: boolean;
  courtIds?: string[];
  eventIds?: string[];
  venueIds?: string[];
  drawIds?: string[];

  filterMatchUpTypes?: boolean;
  filterMatchUpIds?: boolean;
};

/**
 * A pairing SHAPE applied by round generation, as distinct from a draw structure. `ROUND_ROBIN` pairs every
 * entrant with every other entrant once per encounter; `encounters: 2` is a double round robin, `3` a
 * triple. `mirrored` (default true) swaps side order on alternating encounters, making a double round robin
 * home-and-home. A `roundsCount` alongside a pairingProfile truncates the schedule to a PARTIAL round robin
 * and is rejected if it exceeds the rounds the shape can supply.
 */
export type PairingProfile = {
  shape: string;
  encounters?: number;
  mirrored?: boolean;
};

export type GenerateDrawDefinitionArgs = {
  /** Requested limits, bounded by the sanction record overrideLimits. */
  constraintOverrides?: { drawSize?: number; maxWildcards?: number; maxAlternates?: number; maxQualifiers?: number };
  /**
   * Passed through to the drawType's generator: `groupSize` for ROUND_ROBIN and ROUND_ROBIN_WITH_PLAYOFF,
   * `playoffGroups` for ROUND_ROBIN_WITH_PLAYOFF.
   */
  structureOptions?: { groupSize?: number; [key: string]: unknown };
  automated?: boolean | { seedsOnly: boolean };
  playoffAttributes?: PlayoffAttributes;
  policyDefinitions?: PolicyDefinitions;
  appliedPolicies?: PolicyDefinitions;
  voluntaryConsolation?: {
    structureAbbreviation?: string;
    structureName?: string;
    structureId?: string;
  };
  enforceMinimumDrawSize?: boolean;
  /**
   * Defaults to `true`. When `true`, a requested `seedsCount` is clamped down to the maximum the
   * active seeding policy's `seedsCountThresholds` allow for the draw size and participant count.
   * Set `false` to let an explicit `seedsCount` stand above that threshold — an operator override
   * of the policy, not of the structure. The structural limits still apply either way:
   * `seedsCount` is capped at the stage's entry count and at `drawSize`, and exceeding the
   * structure's position count raises `SEEDSCOUNT_GREATER_THAN_DRAW_SIZE`.
   */
  enforcePolicyLimits?: boolean;
  ignoreAllowedDrawTypes?: boolean;
  qualifyingPlaceholder?: boolean;
  considerEventEntries?: boolean; // defaults to true; look for entries in event.entries when drawEntries not provided
  seedingProfile?: SeedingProfile;
  hydrateCollections?: boolean;
  tournamentRecord: Tournament;
  matchUpType?: EventTypeUnion;
  hydrateRoundNames?: boolean;
  /** AD_HOC: permit a roundsCount of up to (entrants - 1) * 2, replaying pairings a second time */
  enableDoubleRobin?: boolean;
  /** AD_HOC: apply a pairing shape to round generation (see {@link PairingProfile}) */
  pairingProfile?: PairingProfile;
  drawTypeCoercion?: boolean;
  ignoreStageSpace?: boolean;
  qualifyingProfiles?: any[];
  drawMatic?: DrawMaticArgs;
  qualifyingOnly?: boolean;
  drawType?: DrawTypeUnion;
  enforceGender?: boolean;
  processCodes?: string[];
  matchUpFormat?: string;
  structureName?: string;
  tieFormatName?: string;
  tieFormat?: TieFormat;
  withPlayoffs?: WithPlayoffsArgs;
  drawEntries?: Entry[];
  roundsCount?: number;
  seedsCount?: number;
  placeByes?: boolean;
  drawName?: string;
  drawSize?: number;
  idPrefix?: string;
  isMock?: boolean;
  random?: () => number;
  targetMatchUpIds?: TargetMatchUpId[];
  uuids?: string[];
  drawId?: string;
  event: Event;
};

export type TargetMatchUpId = {
  matchUpId: string;
  roundNumber: number;
  roundPosition: number;
  stage?: string;
  stageSequence?: number;
  exitProfile?: string;
  structureId?: string;
};

export type DrawMaticArgs = {
  adHocRatings?: { [key: string]: number };
  restrictRoundsCount?: boolean;
  restrictEntryStatus?: boolean;
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  enableDoubleRobin?: boolean;
  generateMatchUps?: boolean;
  eventType?: EventTypeUnion;
  salted?: number | boolean;
  participantIds?: string[];
  /** @deprecated in 8.0.0 drawMatic never writes ratings; store them with `setParticipantScaleItems` (see the 8.0.0 migration guide) */
  updateParticipantRatings?: boolean;
  dynamicRatings?: boolean;
  convertToELO?: boolean;
  refreshDynamic?: boolean;
  encounterValue?: number;
  sameTeamValue?: number; // only required if not present in ratingsParameters.ts
  scaleAccessor?: string;
  maxIterations?: number;
  matchUpIds?: string[];
  structure?: Structure;
  roundsCount?: number;
  structureId?: string;
  random?: () => number;
  scaleName?: string; // can be custom rating name to seed dynamic ratings
  idPrefix?: string;
  isMock?: boolean;
  event: Event;
};

/** a success that still has something to say — the draw is right, and the client may want to act */
export type ResultWarning = {
  code: string;
  matchUpIds?: string[];
  setNumbers?: number[];
  eventId?: string;
  drawId?: string;
  /** the error behind the warning, where something was left undone because of one */
  error?: ErrorType;
  info?: unknown;
};

/** an entry draw generation left out, and why: the error addDrawEntry reported for it */
export type EntryNotPlaced = {
  participantId: string;
  entryStatus?: string;
  entryStage?: string;
  reason: string;
};

/** ENTRIES_NOT_PLACED: the entries of one stage that draw generation left out because the stage was full */
export type EntriesNotPlacedWarning = ResultWarning & {
  entries: EntryNotPlaced[];
  participantIds: string[];
  drawSize: number;
  message: string;
  count: number;
  stage: string;
};

export type ResultType = {
  /** what the method knew when it refused or warned; read a key only after checking it holds what you expect */
  context?: Record<string, unknown>;
  warnings?: ResultWarning[];
  stack?: string | string[];
  errors?: string[];
  error?: ErrorType;
  success?: boolean;
  valid?: boolean;
  /** a human-readable or structured note on the result; its shape is the method's own */
  info?: unknown;
};

export type MappedMatchUps = {
  [key: string]: {
    matchUps: HydratedMatchUp[] | MatchUp[] | undefined;
    itemStructureIds: string[];
    structureName?: string;
  };
};

export type MatchUpsMap = {
  mappedMatchUps: MappedMatchUps;
  drawMatchUps: MatchUp[];
};

export type Tally = [number, number];

export type ScheduledMatchUpArgs = {
  visibilityThreshold?: string;
  timeStamp?: string;
  schedule?: MatchUpSchedule;
  matchUp: any;
};
