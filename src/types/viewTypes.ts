/**
 * Result types of the public view queries — `getEventData` and `competitionScheduleMatchUps` — and of the
 * queries they are composed from (`getDrawData`, `getTournamentInfo`, `getVenueData`, `getCourtInfo`).
 *
 * Every consumer of these views (server, public viewer, client) reads one shape, so each field here is
 * one the building code actually returns: optional where it is conditionally present, never invented.
 */
import type { DrawPublishingDetails, PublishingDetail } from '@Mutate/publishing/publishEvent';
import { HydratedMatchUp, HydratedParticipant } from './hydrated';
import { ErrorType } from '@Constants/errorConditionConstants';
import type { GroupInfo, RoundProfile } from './factoryTypes';
import type {
  Address,
  Booking,
  Court,
  DrawDefinition,
  Event,
  OnlineResource,
  PositionAssignment,
  SeedAssignment,
  Structure,
  SurfaceCategoryUnion,
  TallyResult,
  Tournament,
  Venue,
} from './tournamentTypes';

/** `getCourtInfo(...).courtInfo`: the public attributes of a court; availability is never included. */
export type CourtInfo = Pick<
  Court,
  | 'altitude'
  | 'courtId'
  | 'courtName'
  | 'courtDimensions'
  | 'latitude'
  | 'longitude'
  | 'surfaceCategory'
  | 'surfaceType'
  | 'surfacedDate'
  | 'pace'
  | 'notes'
>;

/** `getVenueData(...).venueData`: a venue's public identity and its courts' public attributes. */
export type VenueData = Pick<Venue, 'venueAbbreviation' | 'venueName' | 'venueId'> & {
  courtsInfo: CourtInfo[];
};

/** One event as listed in `tournamentInfo.eventInfo` (`extractEventInfo`). */
export type TournamentEventInfo = Pick<
  Event,
  | 'competitionFormat'
  | 'surfaceCategory'
  | 'matchUpFormat'
  | 'discipline'
  | 'eventLevel'
  | 'eventName'
  | 'eventType'
  | 'startDate'
  | 'category'
  | 'endDate'
  | 'eventId'
  | 'gender'
  | 'notes'
> & {
  /** not a declared Event attribute; passed through when a record carries it */
  ballType?: string;
  /** not a declared Event attribute; passed through when a record carries it */
  onlineResources?: OnlineResource[];
  drawDefinitionCount?: number;
  /** every distinct matchUpFormat declared anywhere in the event; absent when none is */
  matchUpFormats?: string[];
  /** the event's playing days (getEventPlayingDates); absent unless the event's own dates narrow the tournament's */
  playingDates?: string[];
  entriesCount: number;
};

/** The tournament-level publish state (`getPublishState(...).publishState.tournament`). */
export type TournamentPublishState = {
  status?: { published?: boolean; publishedEventIds?: string[] };
  orderOfPlay?: PublishingDetail & { scheduledDates?: string[]; eventIds?: string[] };
  info?: PublishingDetail & { eventIds?: string[] };
  participants?: PublishingDetail;
  [key: string]: unknown;
};

/** One structure as listed by `getTournamentInfo({ withStructureDetails: true })`; undefined values are removed. */
export type TournamentInfoStructure = {
  eventId: string;
  eventName?: string;
  eventType?: Event['eventType'];
  drawId: string;
  drawName?: string;
  drawType?: DrawDefinition['drawType'];
  structureId: string;
  structureName?: string;
  stage?: Structure['stage'];
  stageSequence?: number;
  positionAssignments?: PositionAssignment[];
  seedAssignments?: SeedAssignment[];
  matchUpFormat?: string;
};

export type TournamentMatchUpStats = {
  total: number;
  completed: number;
  scheduled: number;
  percentComplete: number;
};

/** `getTournamentInfo(...).tournamentInfo`; attributes whose value is undefined are removed. */
export type TournamentInfo = Pick<
  Tournament,
  | 'tournamentId'
  | 'tournamentLevel'
  | 'tournamentRank'
  | 'tournamentStatus'
  | 'tournamentTier'
  | 'formalName'
  | 'tournamentName'
  | 'promotionalName'
  | 'onlineResources'
  | 'localTimeZone'
  | 'activeDates'
  | 'startDate'
  | 'endDate'
  | 'hostCountryCode'
  | 'venues'
  | 'notes'
  | 'registrationProfile'
  | 'parentOrganisation'
  | 'updatedAt'
> & {
  /** the first address of the primary venue */
  tournamentAddress?: Address;
  /** staff participants, carrying only the contacts marked `isPublic` */
  tournamentContacts?: HydratedParticipant[];
  imageUrl?: string;
  /** tournament timeItems keyed by `itemType` */
  timeItemValues?: { [itemType: string]: unknown };
  publishState?: TournamentPublishState;
  eventInfo?: TournamentEventInfo[];
  /** with `withStructureDetails` */
  structures?: TournamentInfoStructure[];
  /** with `withMatchUpStats` */
  matchUpStats?: TournamentMatchUpStats;
  individualParticipantCount?: number;
  teamParticipantCount?: number;
  eventCount?: number;
};

/** An event's publish state as `getEventData` reports it (`eventInfo.publishState`). */
export type EventPublishState = {
  status?: {
    published?: boolean;
    publishedDrawIds?: string[];
    publishedSeeding?: { published?: boolean; seedingScaleNames?: string[]; drawIds?: string[] };
    drawDetails?: { [drawId: string]: Partial<DrawPublishingDetails> };
  };
};

/**
 * `getEventData(...).eventData.eventInfo`. `competitionFormat` is withheld while `usePublishState` is set and
 * the event is unpublished.
 */
export type EventInfo = Pick<
  Event,
  | 'eventId'
  | 'eventName'
  | 'eventType'
  | 'eventLevel'
  | 'surfaceCategory'
  | 'matchUpFormat'
  | 'competitionFormat'
  | 'category'
  | 'gender'
  | 'startDate'
  | 'endDate'
  | 'discipline'
> & {
  /** not a declared Event attribute; passed through when a record carries it */
  ballType?: string;
  /** the event's DISPLAY extension value */
  display?: unknown;
  /** the event's playing days (getEventPlayingDates); absent unless the event's own dates narrow the tournament's */
  playingDates?: string[];
  publishState?: EventPublishState;
  published?: boolean;
};

/**
 * One structure of a draw: what `getDrawData` returns under `structuresProfile: STUBS`. Cheap metadata only;
 * `structureActive` / `structureCompleted` are derived from raw matchUp statuses.
 */
export type StructureStub = Pick<
  Structure,
  'stageSequence' | 'structureName' | 'structureType' | 'finishingPosition' | 'matchUpFormat' | 'stage'
> & {
  /** the structure's DISPLAY extension value (its PUBLIC_DISPLAY entry when it has one) */
  display?: unknown;
  structureActive: boolean;
  structureCompleted: boolean;
  structureId: string;
};

/** A participant's placement and tally in a structure. */
export type StructureParticipantResult = {
  participantResult?: TallyResult;
  participantId?: string;
  drawPosition: number;
};

/**
 * One structure of a draw: what `getDrawData` returns under the FULL profile. Every field beyond
 * {@link StructureStub} is absent from a stub.
 */
export type StructureData = StructureStub & {
  sourceStructureIds?: string[];
  hasDrawFeedProfile?: boolean;
  /** only when `includePositionAssignments` */
  positionAssignments?: PositionAssignment[];
  sourceStructuresComplete?: boolean;
  participantResults?: StructureParticipantResult[];
  seedAssignments?: SeedAssignment[];
  /** hydrated unless `getDrawData` is called with `inContext: false` */
  roundMatchUps?: Record<number, HydratedMatchUp[]>;
  roundProfile?: RoundProfile;
  /** the tally report, when this structure was tallied for this read */
  report?: unknown[];
};

/** Per-draw metadata of a draw stub: what `getEventData` returns per draw under `drawsProfile: STUBS`. */
export type DrawStub = Pick<DrawDefinition, 'matchUpFormat' | 'updatedAt' | 'drawName' | 'drawType' | 'drawId'> & {
  /** the draw's DISPLAY extension value */
  display?: unknown;
  drawGenerated?: boolean;
  drawCompleted?: boolean;
  /** only when `usePublishState` */
  drawPublished?: boolean;
};

/** `getDrawData(...).drawInfo`; a {@link DrawStub} plus the facts that need assembled structures. */
export type DrawInfo = DrawStub & {
  participantPlacements?: boolean;
  drawActive?: boolean;
};

/**
 * One draw in `getEventData(...).eventData.drawsData`. Under the FULL profile it carries `structures`,
 * `drawActive` and `participantPlacements`; under STUBS each entry is a {@link DrawStub}, so those are absent.
 */
export type DrawData = DrawInfo & {
  structures?: StructureData[];
};

/** `getDrawData(...)` */
export type DrawDataResult = {
  /** withheld when `usePublishState` is set and the draw is unpublished */
  structures?: StructureData[];
  drawInfo?: DrawInfo;
  error?: ErrorType;
  success?: boolean;
};

/** `getEventData(...).eventData` */
export type EventData = {
  tournamentInfo?: TournamentInfo;
  venuesData: VenueData[];
  eventInfo: EventInfo;
  /** absent when `usePublishState` is set and the event is unpublished */
  drawsData?: DrawData[];
};

/** `getEventData(...)` */
export type EventDataResult = {
  /** omitted only when the caller's `participantsVersion` matches the current participant set */
  participants?: HydratedParticipant[];
  /** present only when a version was supplied or `withParticipantsVersion` was set */
  participantsVersion?: string;
  eventData?: EventData;
  context?: { [key: string]: unknown };
  error?: ErrorType;
  success?: boolean;
};

/** One court in `competitionScheduleMatchUps(...).courtsData`: the hydrated court and the matchUps on it. */
export interface CourtData extends Omit<Court, 'surfaceCategory'> {
  /** attributes a hydrated court carries beyond `Court`, e.g. converted extensions */
  [key: string]: unknown;
  /** the court's own value; `''` when the court declares none */
  surfaceCategory?: SurfaceCategoryUnion | '';
  matchUps: HydratedMatchUp[];
  venueId: string;
}

/** An empty grid cell of a schedule row: the slot it stands for, and the grid booking that blocks it. */
export type ScheduleGridCell = {
  schedule: { courtOrder: number; venueId?: string; courtId: string };
  isBlocked?: boolean;
  booking?: Booking;
};

/**
 * One row of the court grid (`withCourtGridRows`). Keys other than `rowId` are `${courtPrefix}${courtIndex}`,
 * each holding the matchUp scheduled in that cell or an empty {@link ScheduleGridCell}.
 */
export type ScheduleRow = {
  rowId: string;
  [cellKey: string]: string | HydratedMatchUp | ScheduleGridCell;
};

/** `competitionScheduleMatchUps(...)` */
export type CompetitionScheduleMatchUpsResult = {
  /** absent when `hydrateParticipants` is set */
  mappedParticipants?: { [key: string]: HydratedParticipant };
  completedMatchUps?: HydratedMatchUp[];
  /** all incomplete matchUps for the filter date */
  dateMatchUps?: HydratedMatchUp[];
  courtsData?: CourtData[];
  groupInfo?: GroupInfo;
  venues?: Venue[];
  /** with `withCourtGridRows` */
  courtPrefix?: string;
  /** with `withCourtGridRows` */
  rows?: ScheduleRow[];
  error?: ErrorType;
  success?: boolean;
};
