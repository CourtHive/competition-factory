import { DOUBLES_EVENT, SINGLES_EVENT, TEAM_EVENT } from '@Constants/eventConstants';
import { SignedInStatusUnion } from '@Constants/participantConstants';
import { HydratedMatchUp, HydratedParticipant } from './hydrated';
import { ErrorType } from '@Constants/errorConditionConstants';
import { ValidPolicyTypes } from '@Constants/policyConstants';
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
  uuids?: string[];
  drawId?: string;
  event: Event;
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
  dynamicRatings?: boolean;
  refreshDynamic?: boolean;
  encounterValue?: number;
  sameTeamValue?: number; // only required if not present in ratingsParameters.ts
  scaleAccessor?: string;
  maxIterations?: number;
  matchUpIds?: string[];
  structure?: Structure;
  roundsCount?: number;
  structureId?: string;
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
