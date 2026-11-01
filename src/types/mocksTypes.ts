import type { GenerateDrawDefinitionArgs, ParticipantsProfile, PolicyDefinitions } from './factoryTypes';
import type {
  Availability,
  Category,
  DrawTypeUnion,
  EventTypeUnion,
  Extension,
  GenderUnion,
  MatchUpStatusUnion,
  Participant,
  ParticipantTypeUnion,
  SexUnion,
  StageTypeUnion,
  TieFormat,
  TimeItem,
  Tournament,
} from './tournamentTypes';

/**
 * The inputs mocksEngine accepts, as CLOSED types: an unknown key is a compile error at every call site.
 *
 * Derived from what the generators READ (2026-10-17 profile-key inventory), not from the docs. Before
 * these existed every profile was `any`, and the 2026-10-15 sweep found 28 drawProfiles setting an
 * option that took no effect (26 of them `completeAllMatchUps`) and typos (`mathcUpType`, `automate`)
 * that tests asserted around for weeks.
 */

/**
 * Enum-valued fields also accept `string`: profiles are routinely built in variables, where a literal
 * widens. What the types close is the set of KEYS, which is where misplaced options hide.
 */
type Loose<T extends string> = T | (string & Record<never, never>);

/** A category with its `type` as a plain string, as profiles built in variables carry it. */
type MockCategory = Omit<Category, 'type'> & { type?: string };

/** Policies as tests and catalogs write them; each is validated where it is applied. */
type MockPolicyDefinitions = PolicyDefinitions | { [policyType: string]: unknown };

/** A tieFormat as tests and catalogs write it; the engine validates it where it is applied. */
type MockTieFormat = TieFormat | { [key: string]: unknown };

/** Whole-number percentages; the remainder is COMPLETED. */
export type MatchUpStatusProfile = Partial<Record<MatchUpStatusUnion, number>>;

/** A completion option: `true` for generated scores, or a score string every matchUp receives. */
export type CompleteAllMatchUps = boolean | string;

type CompletionOptions = {
  matchUpStatusProfile?: MatchUpStatusProfile;
  completeAllMatchUps?: CompleteAllMatchUps;
  randomWinningSide?: boolean;
};

/** One authored outcome on a drawProfile, located by structure, round and position. */
export type MockOutcome = {
  matchUpStatus?: Loose<MatchUpStatusUnion>;
  matchUpStatusCodes?: unknown[];
  drawPositions?: number[];
  structureOrder?: number;
  stageSequence?: number;
  matchUpFormat?: string;
  roundPosition?: number;
  matchUpIndex?: number;
  roundNumber?: number;
  scoreString?: string;
  winningSide?: number;
  stage?: Loose<StageTypeUnion>;
};

export type MockStructureProfile = {
  qualifyingRoundNumber?: number;
  qualifyingPositions?: number;
  seededParticipants?: unknown[];
  seedingScaleName?: string;
  participantsCount?: number;
  structureOptions?: unknown;
  seedingProfile?: unknown;
  stageSequence?: number;
  structureName?: string;
  matchUpFormat?: string;
  seedByRanking?: boolean;
  matchUpType?: Loose<EventTypeUnion>;
  structureId?: string;
  seedsCount?: number;
  placeByes?: boolean;
  drawType?: Loose<DrawTypeUnion>;
  drawSize?: number;
};

export type MockQualifyingProfile = {
  structureProfiles: MockStructureProfile[];
  roundTarget?: number;
};

/** Keys the draw generators read after the drawProfile is spread into `generateDrawDefinition`, beyond its declared args. */
type DrawGeneratorPassThrough = {
  // read by structure seeding and automated positioning, which prepareStage spreads the params into
  seedAssignmentProfile?: Record<number, number | string>;
  provisionalPositioning?: boolean;
  applyPositioning?: boolean;
  assignSeedsCount?: number;
  placementGroup?: number;
  seedByRanking?: boolean;
  seedLimit?: number;
  addNameBaseToAttributeName?: boolean;
  playoffStructureNameBase?: string;
  consolationStructureName?: string;
  finishingPositionNaming?: unknown;
  finishingPositionLimit?: number;
  finishingPositionOffset?: number;
  qualifyingRoundNumber?: number;
  seededParticipants?: unknown[];
  overwriteExisting?: boolean;
  requireSequential?: boolean;
  exitProfileLimit?: boolean;
  roundOffsetLimit?: number;
  structureNameMap?: Record<string, string>;
  seedingScaleName?: string;
  structureOptions?: unknown;
  qualifiersCount?: number;
  staggeredEntry?: boolean;
  groupNameBase?: string;
  stageSequence?: number;
  roundProfile?: unknown;
  structureId?: string;
  roundOffset?: number;
  groupNames?: string[];
  roundTarget?: number;
  roundLimit?: number;
  feedPolicy?: unknown;
  skipRounds?: number;
};

/**
 * One draw (and, at the top level, the event that holds it). Its keys are the mocks' own, plus every
 * `generateDrawDefinition` option, because the profile is spread into that call.
 */
export type MockDrawProfile = Partial<
  Omit<
    GenerateDrawDefinitionArgs,
    | 'tournamentRecord'
    | 'event'
    | 'qualifyingProfiles'
    | 'drawType'
    | 'matchUpType'
    | 'tieFormat'
    | 'drawMatic'
    | 'withPlayoffs'
    | 'policyDefinitions'
    | 'seedingProfile'
  >
> &
  DrawGeneratorPassThrough &
  CompletionOptions & {
    qualifyingProfiles?: MockQualifyingProfile[];
    matchUpType?: Loose<EventTypeUnion>;
    drawType?: Loose<DrawTypeUnion>;
    tieFormat?: MockTieFormat;
    // validated where they are applied; the profile passes them through
    policyDefinitions?: MockPolicyDefinitions;
    withPlayoffs?: { [key: string]: unknown };
    seedingProfile?: { [key: string]: unknown };
    drawMatic?: { [key: string]: unknown };
    excessParticipantAlternates?: boolean;
    eventAttributes?: Record<string, unknown>;
    scaledParticipantsCount?: number;
    teamGenders?: { [gender: string]: number };
    tournamentAlternates?: number;
    rankingRange?: readonly number[];
    uniqueParticipants?: boolean;
    eventExtensions?: Extension[];
    drawExtensions?: Extension[];
    qualifyingPositions?: number;
    participantsCount?: number;
    alternatesCount?: number;
    ignoreDefaults?: boolean;
    eventType?: Loose<EventTypeUnion>;
    completionGoal?: number;
    outcomes?: MockOutcome[];
    tieFormatId?: string;
    timeItems?: TimeItem[];
    gender?: Loose<GenderUnion>;
    teamNames?: string[];
    buildTeams?: boolean;
    category?: MockCategory;
    eventName?: string;
    scaleName?: string;
    generate?: boolean;
    stage?: Loose<StageTypeUnion>;
    addEvent?: boolean;
    eventId?: string;
    publish?: boolean;
  };

export type MockEventProfile = CompletionOptions & {
  // the generate path reads only participantsCount; modifyTournamentRecord's existing-event path generates from it
  participantsProfile?: MockParticipantsProfile;
  policyDefinitions?: MockPolicyDefinitions;
  eventAttributes?: Record<string, unknown>;
  ratingsParameters?: Record<string, unknown>;
  scaledParticipantsCount?: number;
  rankingRange?: readonly number[];
  autoEntryPositions?: boolean;
  eventExtensions?: Extension[];
  drawProfiles?: MockDrawProfile[];
  surfaceCategory?: string;
  tieFormatName?: string;
  eventType?: Loose<EventTypeUnion>;
  processCodes?: string[];
  timeItems?: TimeItem[];
  discipline?: string;
  eventLevel?: string;
  tieFormat?: MockTieFormat;
  eventIndex?: number;
  gender?: Loose<GenderUnion>;
  category?: MockCategory;
  eventName?: string;
  ballType?: string;
  uuids?: string[];
  eventId?: string;
  publish?: boolean;
  isMock?: boolean;
};

export type MockVenueProfile = {
  venueDateAvailability?: Availability[];
  courtTimings?: (Partial<Availability> | undefined)[];
  dateAvailability?: Availability[];
  venueAbbreviation?: string;
  defaultStartTime?: string;
  defaultEndTime?: string;
  courtNames?: string[];
  courtsCount?: number;
  isPrimary?: boolean;
  courtIds?: string[];
  startTime?: string;
  venueName?: string;
  idPrefix?: string;
  endTime?: string;
  venueId?: string;
};

/** `mocksEngine.generateSeason`: one record per period, one TEAM event per tier, and the Season document. */
export type MockSeasonProfile = {
  tiers: { tierId?: string; tierValue?: string; teamsCount: number; tieFormatName?: string }[];
  periods?: { phase?: string; includeInStandings?: boolean }[];
  completeAllMatchUps?: boolean;
  tieFormatName?: string;
  tierSystem?: string;
  seasonName?: string;
  startDate?: string;
  seasonId?: string;
  seriesId?: string;
};

export type MockLeagueProfile = {
  teamProfiles?: { teamName?: string; teamId?: string; venueIds?: string[] }[];
  participantsProfile?: MockParticipantsProfile;
  roundsCount?: number | string;
  individualParticipants?: boolean;
  pairingProfile?: GenerateDrawDefinitionArgs['pairingProfile'];
  tieFormatName?: string;
  tieFormat?: MockTieFormat;
  leagueName?: string;
  teamsCount?: number;
  automated?: boolean;
  gender?: Loose<GenderUnion>;
  category?: MockCategory;
  startDate?: string;
  eventName?: string;
  leagueId?: string;
  idPrefix?: string;
  eventId?: string;
};

/**
 * The participant options the mocks read. `ParticipantsProfile` is also the hydration profile of the
 * participant queries, so it stays as it is; this is the mocks' own closed subset of it, plus the
 * generator's keys it lacks.
 */
export type MockParticipantsProfile = Pick<
  ParticipantsProfile,
  | 'scaledParticipantsCount'
  | 'nationalityCodesCount'
  | 'scaleAllParticipants'
  | 'personExtensions'
  | 'valuesInstanceLimit'
  | 'addressProps'
  | 'participantsCount'
  | 'consideredDate'
  | 'personData'
  | 'personIds'
  | 'inContext'
  | 'withISO2'
  | 'withIOC'
  | 'teamKey'
  | 'idPrefix'
  | 'uuids'
> & {
  participantType?: Loose<ParticipantTypeUnion>;
  rankingRange?: readonly number[];
  category?: MockCategory;
  nationalityCodeType?: 'IOC' | 'ISO';
  sex?: Loose<SexUnion>;
  ratingsParameters?: Record<string, unknown>;
  individualParticipants?: boolean;
  nationalityCodes?: string[];
  ratingsValues?: unknown[];
  participantRole?: string;
  categories?: MockCategory[];
  matchUpType?: Loose<EventTypeUnion>;
  teamSize?: number;
};

/** The generate path's scheduling profile: dates, each with venues, each with rounds by drawId. */
export type MockSchedulingProfile = {
  scheduleDate: string;
  venues?: {
    venueId: string;
    rounds: {
      drawId: string;
      roundNumber?: number;
      winnerFinishingPositionRange?: string;
      roundSegment?: { segmentNumber: number; segmentsCount: number };
    }[];
  }[];
}[];

export type MockScenarioProfile = {
  /** the matchUps due within this many minutes of the anchor are checked in (both sides' individuals) */
  checkedIn?: { withinMinutes: number };
  /** the matchUps due within this many minutes of the anchor are called (`calledAt` set to the anchor) */
  called?: { withinMinutes: number };
  /** deliberate conflicts, each the one `proConflicts` reports; they need `assignCourts` */
  conflicts?: { type: string; count?: number }[];
  minutesBeforeAnchor?: number;
  assignCourts?: boolean;
  /** 'NOW', or an ISO datetime for a deterministic anchor */
  anchor?: string;
};

/** What every mocksEngine method also accepts at the engine boundary. */
type MockEngineCall = {
  /** a seed: the call's draws, and every draw it reaches, are determined by it */
  nonRandom?: number;
  setState?: boolean;
};

export type GenerateTournamentRecordArgs = MockEngineCall &
  CompletionOptions & {
    participantsProfile?: MockParticipantsProfile;
    scenarioProfile?: MockScenarioProfile;
    schedulingProfile?: MockSchedulingProfile;
    leagueProfiles?: MockLeagueProfile[];
    venueProfiles?: MockVenueProfile[];
    eventProfiles?: MockEventProfile[];
    drawProfiles?: MockDrawProfile[];
    tournamentAttributes?: Partial<Tournament>;
    ratingsParameters?: Record<string, unknown>;
    policyDefinitions?: MockPolicyDefinitions;
    /**
     * @deprecated ignored: completed matchUps are never scheduled (CA 2026-10-23). An auto-scheduled tournament has its
     * results applied after it is scheduled, so its completed matchUps carry schedules. Removed at the next major.
     */
    scheduleCompletedMatchUps?: boolean;
    tournamentExtensions?: Extension[];
    hydrateCollections?: boolean;
    autoEntryPositions?: boolean;
    /** also return `methods`: the engine calls that reproduce this record (see `scenarioRecorder`) */
    recordMethods?: boolean;
    participants?: Participant[];
    random?: () => number;
    tournamentName?: string;
    autoSchedule?: boolean;
    periodLength?: number;
    startDate?: string;
    endDate?: string;
    isMock?: boolean;
    uuids?: string[];
  };

export type ModifyTournamentRecordArgs = MockEngineCall &
  CompletionOptions & {
    participantsProfile?: MockParticipantsProfile;
    ratingsParameters?: Record<string, unknown>;
    venueProfiles?: MockVenueProfile[];
    eventProfiles?: MockEventProfile[];
    drawProfiles?: MockDrawProfile[];
    /** the canonical scheduling profile, applied with setSchedulingProfile (not the generate path's shape) */
    schedulingProfile?: unknown[];
    hydrateCollections?: boolean;
    autoEntryPositions?: boolean;
    tournamentRecord: Tournament;
    /** keep what was written before a refusal and report it as `retained` (default: all or nothing) */
    keepPartial?: boolean;
    /** also return `methods`: the engine calls that make these modifications (see `scenarioRecorder`) */
    recordMethods?: boolean;
    random?: () => number;
    autoSchedule?: boolean;
    periodLength?: number;
    isMock?: boolean;
    uuids?: string[];
  };

export type GenerateOutcomeArgs = MockEngineCall & {
  matchUpStatusProfile?: MatchUpStatusProfile;
  defaultWithScorePercent?: number;
  random?: () => number;
  pointsPerMinute?: number;
  matchUpFormat?: string;
  winningSide?: number;
  sideWeight?: number;
};

export type CompleteDrawMatchUpsArgs = MockEngineCall &
  CompletionOptions & {
    completeRoundRobinPlayoffs?: boolean;
    /** per structure, complete at most this many rounds, counted from its first round still to play */
    roundsToComplete?: number;
    tournamentRecord?: Tournament;
    drawDefinition?: { [key: string]: unknown };
    event?: { [key: string]: unknown };
    structureIds?: string[];
    random?: () => number;
    completionGoal?: number;
    stageSequence?: number;
    matchUpFormat?: string;
    roundNumber?: number;
    stage?: Loose<StageTypeUnion>;
    drawId?: string;
  };

export type GenerateParticipantsArgs = MockEngineCall &
  MockParticipantsProfile & {
    gendersCount?: { [gender: string]: number };
    random?: () => number;
  };
