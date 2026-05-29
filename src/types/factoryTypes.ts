import { DOUBLES_EVENT, SINGLES_EVENT, TEAM_EVENT } from '@Constants/eventConstants';
import { SignedInStatusUnion } from '@Constants/participantConstants';
import { HydratedMatchUp, HydratedParticipant } from './hydrated';
import { ErrorType } from '@Constants/errorConditionConstants';
import { ValidPolicyTypes } from '@Constants/policyConstants';
import type { FactoryEngineMethod } from './factoryEngineMethods';
import type { MethodSignatures } from './methodSignatures';
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
  TieFormat,
  Structure,
  MatchUp,
} from './tournamentTypes';

export type FactoryEngine = {
  [key: string]: any;
};

/**
 * Hint keys consumers pass instead of the fully-resolved entities. The
 * middleware looks these up against state and populates the resolved keys.
 * Universally accepted (and ignored when irrelevant), so the typed surface
 * never blocks a call that names a draw / event / matchUp / structure
 * directly.
 */
type EngineHintKeys = {
  tournamentId?: string;
  eventId?: string;
  drawId?: string;
  matchUpId?: string;
  structureId?: string;
};

/**
 * Transform a source function signature into its engine-call-surface
 * signature. Source functions declare params from the perspective of "I
 * receive everything fully resolved" (because the engine guarantees that).
 * Engine consumers call from the OPPOSITE perspective — "I have IDs in
 * state; resolve everything for me."
 *
 * EngineMethod relaxes the param shape so it matches the contract the
 * engine actually offers:
 *   - First param is optional (0-arg calls work for state-only methods)
 *   - All keys in the first param become optional (`Partial<P>`) because
 *     the engine populates auto-resolved entities from state and the
 *     source's own `requireParams()` checks the rest at runtime
 *   - EngineHintKeys (drawId, eventId, matchUpId, structureId, tournamentId)
 *     are admitted universally — they're the lookup keys consumers actually
 *     pass
 *
 * Tradeoff: TS no longer flags missing source-required keys at the type
 * level (e.g. `engine.generateDrawDefinition()` with no drawSize compiles).
 * The source's `requireParams` / nullability checks surface the same issue
 * as a runtime error envelope `{ error: MISSING_X }`. This honest contract
 * matches every documented engine call site in the ecosystem.
 */
export type EngineMethod<F> = F extends (firstParam: infer P, ...rest: infer R) => infer Ret
  ? // `[P] extends [object]` prevents distribution when source declares
    // `(params?: T) => R` — there, `P` infers as `T | undefined`, and the
    // naked-conditional `P extends object` would split the result into a
    // union of two function shapes, which TS then intersects at the call
    // site, putting the un-`Partial`-ed `T` back. The bracketed form keeps
    // `P` whole so the consumer-facing param stays uniformly `Partial<P>`.
    [NonNullable<P>] extends [object]
    ? (params?: Partial<NonNullable<P>> & EngineHintKeys, ...rest: R) => Ret
    : F
  : F;

/**
 * Names of methods provided by the developer-JOY facades (`engine.q`,
 * `engine.on/once/off/waitFor`, `engine.inspect`, `engine.build`). These
 * names also appear in `FactoryEngineMethod` because `gen:engine-methods`
 * walks the runtime engine, so we have to exclude them from the
 * `(...args: any[]) => any` fallback or the open shape competes with the
 * facades' precise generics in the intersection and TS picks `any`.
 */
type FacadeMethodNames = 'q' | 'on' | 'once' | 'off' | 'waitFor' | 'inspect' | 'build' | 'dryRun' | 'explain';

/**
 * Closed engine surface for consumers — every method name comes from
 * `factoryEngineMethods.ts`, which is regenerated from the live engine via
 * `pnpm gen:engine-methods`. Has no index signature, so calls like
 * `engine.findEvent(...)` (where `findEvent` is not a registered method)
 * fail at compile time.
 *
 * Methods listed in `MethodSignatures` carry real param + return types lifted
 * from the source declaration via `typeof`. Methods NOT listed there fall
 * through to the `(...args: any[]) => any` fallback so the surface stays
 * complete during the incremental signature roll-out. Adding a method to
 * `MethodSignatures` is purely additive and never breaks existing callers.
 *
 * Opt in at the consumer boundary:
 *
 *   import { tournamentEngine, FactoryEngineTyped } from 'tods-competition-factory';
 *   const engine = tournamentEngine as FactoryEngineTyped;
 */
export type FactoryEngineTyped = MethodSignatures &
  Record<Exclude<FactoryEngineMethod, keyof MethodSignatures | FacadeMethodNames>, (...args: any[]) => any> & {
    /**
     * Developer-JOY unwrap query facade — see `src/forge/q.ts`.
     *
     * Returns the unwrapped primary payload of common queries directly:
     *
     *   const events = engine.q.events();          // Event[]
     *   const event  = engine.q.event({ eventId }); // Event | undefined
     *
     * Replaces the `tournamentEngine.getEvents()?.events ?? []` boilerplate.
     * Per-method arg shapes are still `any`; typed signatures are a follow-up.
     */
    q: import('../forge').QueryFacade;

    /**
     * Developer-JOY typed event bus — see `src/forge/bus.ts`.
     *
     * Multi-subscriber ergonomic surface over the legacy `setSubscriptions`
     * single-callback system. Handlers receive one payload per call (the bus
     * iterates the underlying notice array); ~12 topics are precisely typed
     * via `TopicPayloadMap`, the rest fall through to `unknown`.
     *
     *   const off = engine.on('addMatchUps', e => relay.publish(e.matchUps));
     *   const m   = await engine.waitFor('modifyMatchUp', p => p.matchUp.matchUpId === id);
     */
    // Inline the bus generics directly (rather than `EventBus['on']` lookups)
    // so contextual inference flows through in consumer code under strict.
    // The handler param picks up its TopicPayloadMap[T] type from the topic
    // literal without an explicit annotation.
    on<T extends import('../forge').Topic>(
      topic: T,
      handler: (payload: import('../forge').TopicPayloadMap[T]) => void,
    ): import('../forge').Unsubscribe;
    once<T extends import('../forge').Topic>(
      topic: T,
      handler: (payload: import('../forge').TopicPayloadMap[T]) => void,
    ): import('../forge').Unsubscribe;
    off<T extends import('../forge').Topic>(
      topic: T,
      handler?: (payload: import('../forge').TopicPayloadMap[T]) => void,
    ): void;
    waitFor<T extends import('../forge').Topic>(
      topic: T,
      predicate?: (payload: import('../forge').TopicPayloadMap[T]) => boolean,
    ): Promise<import('../forge').TopicPayloadMap[T]>;

    /**
     * Developer-JOY state-inspection snapshot — see `src/forge/inspect.ts`.
     *
     * Returns a typed snapshot of "what's loaded right now": engine version,
     * write-mode flags, loaded tournament IDs + counts, subscribed topics,
     * devContext. Side-effect-free and cheap; safe to call from hot paths.
     */
    inspect(): import('../forge').EngineInspection;

    /**
     * Developer-JOY fluent builders — see `src/forge/builders/`.
     *
     * Chainable composition of addEvent → generateDrawDefinition →
     * addDrawDefinition → addEventEntries (and addParticipant) into a single
     * executionQueue dispatch. Pre-assigns `eventId`/`drawId`/`participantId`
     * so callers can reference them before terminal verbs resolve.
     *
     *   const { eventId, drawIds } = engine.build.event({ eventName: 'U16 Singles' })
     *     .singles().gender('MALE').draw(32, { seedsCount: 8 }).entries(ids).create();
     *
     *   const request = engine.build.event(...).singles().draw(8).toRequest();
     *   socket.send('executionQueue', request);
     */
    build: import('../forge').BuildFacade;

    /**
     * Developer-JOY mutation preview — see `src/forge/dryRun.ts` (#3).
     *
     * Run an `executionQueue` against the loaded state, capture the
     * would-be diff (RFC 6902 JSON patch) and the topic/payload notices
     * the real call would emit, then restore the snapshot. State is
     * never persisted; subscribers are never notified.
     *
     *   const { wouldSucceed, patch, willEmitNotices } = engine.dryRun([
     *     { method: 'deleteDrawDefinition', params: { drawId } },
     *   ]);
     */
    dryRun(directives: Directives): import('../forge').DryRunResult;

    /**
     * Developer-JOY pre-flight readiness check — see `src/forge/explain.ts` (#12).
     *
     * Project `dryRun` down to the four signals UI gating wants:
     *   `{ wouldSucceed, reason?, willEmitTopics, touchesPaths }`.
     * Plus `detail` carrying the full dryRun result for callers that
     * need the patch.
     *
     *   const { wouldSucceed, reason } = engine.explain('deleteDrawDefinition', { drawId });
     */
    explain(method: string, params?: Record<string, any>): import('../forge').ExplainResult;
  };

export type { FactoryEngineMethod } from './factoryEngineMethods';
export type { MethodSignatures } from './methodSignatures';

export type TournamentRecords = {
  [key: string]: Tournament;
};

export type Directives = {
  pipe?: { [key: string]: boolean };
  params?: { [key: string]: any };
  method: string;
}[];

export type CheckInOutParticipantArgs = {
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  matchUp?: HydratedMatchUp;
  participantId: string;
  matchUpId: string;
  event?: Event;
};

export type ScheduleTimesResult = { scheduleTime: string };

export type SeedBlock = {
  drawPositions: number[];
  seedNumbers: number[];
};

export type SeedingProfile = {
  groupSeedingThreshold?: number;
  positioning?: string;
  nonRandom?: boolean;
};

export type ScaleAttributes = {
  eventType?: EventTypeUnion;
  scaleName?: string;
  scaleType: string;
  accessor?: string; // optional - string determining how to access attribute if scaleValue is an object
};

export type ScaleItem = {
  scaleDate?: string | Date;
  eventType?: EventTypeUnion;
  scaleName: string;
  scaleType: string;
  scaleValue: any;
};

export type Flight = {
  manuallyAdded?: boolean;
  drawEntries: Entry[]; // entries allocated to target draw
  flightNumber: number;
  drawName: string; // custom name for generated draw
  drawId: string; // unique identifier for generating drawDefinitions
};

export type FlightProfile = {
  scaleAttributes?: ScaleAttributes;
  splitMethod?: string;
  flights: Flight[];
};

export type PolicyDefinitions = {
  [key in ValidPolicyTypes]?: { [key: string]: any };
};

export type QueueMethod = {
  params: { [key: string]: any };
  method: string;
};

export type RoundProfile = {
  [key: number]: {
    finishingPositionRange: MatchUpFinishingPositionRange;
    pairedDrawPositions: number[][];
    abbreviatedRoundName?: string;
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
  drawEntryStatuses?: string[]; // {string[]} participantIds that are in draw.entries or flightProfile.flights[].drawEnteredParticipantIds with entryStatuses
  enableOrFiltering?: boolean;
  participantIds?: string[];
  genders?: GenderUnion;
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

export type PlayoffAttributes = {
  [key: string | number]: { name: string; abbreviation: string };
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
  finishingPositionNaming?: any;
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
  rootStage?: string;
  stage?: string;
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

export type GenerateDrawDefinitionArgs = {
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
  ignoreAllowedDrawTypes?: boolean;
  qualifyingPlaceholder?: boolean;
  considerEventEntries?: boolean; // defaults to true; look for entries in event.entries when drawEntries not provided
  seedingProfile?: SeedingProfile;
  hydrateCollections?: boolean;
  tournamentRecord: Tournament;
  matchUpType?: EventTypeUnion;
  hydrateRoundNames?: boolean;
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

export type ResultType = {
  context?: { [key: string]: any };
  stack?: string | string[];
  errors?: string[];
  error?: ErrorType;
  success?: boolean;
  valid?: boolean;
  info?: any;
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
  schedule?: any;
  matchUp: any;
};
