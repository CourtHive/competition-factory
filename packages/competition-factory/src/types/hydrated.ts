import type { ErrorType } from '@Constants/errorConditionConstants';
import type { ScheduleConflict, StructureParticipation, Substitution } from './factoryTypes';
import {
  Category,
  Court,
  DisciplineUnion,
  DrawTypeUnion,
  Entry,
  EventTypeUnion,
  GenderUnion,
  IndoorOutdoorUnion,
  HydratedMatchUpSchedule,
  MatchUp,
  MatchUpSchedule,
  Participant,
  Person,
  SeedingBasisUnion,
  SexUnion,
  Side,
  TimeItem,
  StageTypeUnion,
  TeamPresentation,
  Venue,
} from './tournamentTypes';

/**
 * A court as `getVenuesAndCourts` and the scheduling queries return it: a copy of the stored court with its venue's id,
 * and with its availability narrowed by the venue's (and, with `ignoreDisabled`, by the dates it is disabled).
 */
export type HydratedCourt = {
  // Always present on a hydrated court: getInContextCourt attaches the parent venue's id, and
  // addCourt writes it on every stored court. Declared as REQUIRED here so callers can pass it
  // where a string is expected; the stored `Court.venueId` stays optional.
  venueId: string;

  /** with `convertExtensions`: a stored extension, copied as an attribute: `_` + the extension's name, holding its value */
  [extension: `_${string}`]: unknown;
} & Court;

/** A venue as `getVenuesAndCourts` returns it: a copy of the stored venue */
export type HydratedVenue = {
  /** with `convertExtensions`: a stored extension, copied as an attribute: `_` + the extension's name, holding its value */
  [extension: `_${string}`]: unknown;
} & Venue;

/**
 * A matchUp as the queries return it with `inContext: true`: the stored matchUp plus the context hydration adds.
 *
 * Every key hydration adds is declared. Keys a caller passes through `context` are copied onto every matchUp as well;
 * they are the caller's own and are not declared here, so read them through a type of your own. A stored extension is
 * copied as an attribute named `_` + its name, holding its value.
 */
export interface HydratedMatchUp extends MatchUp {
  // Hydration adds parent-context pointers — strictly typed as `string`
  // (required) on hydrated matchUps so consumers don't have to thread
  // optional-chain guards. Raw `MatchUp` doesn't declare these because the
  // on-disk shape doesn't store the parent relationship.
  structureId: string;
  drawId: string;
  eventId: string;
  tournamentId: string;
  // Set on a tieMatchUp only: the matchUpId of its TEAM matchUp. A tieMatchUp also carries `collectionId` (stored)
  // and its TEAM matchUp's structureId, roundNumber and drawPositions, and the tie-inclusive getters return it beside
  // that TEAM matchUp. Read such a list through `teamLevelMatchUps` before counting or ranging it.
  matchUpTieId?: string;
  sides?: HydratedSide[];
  schedule?: HydratedMatchUpSchedule;
  tieMatchUps?: HydratedMatchUp[];

  /** the round's abbreviated name, from the round naming policy */
  abbreviatedRoundName?: string;
  /** both sides' participants are checked in; set when both sides have a participant */
  allParticipantsCheckedIn?: boolean;
  /** the participants checked in for this matchUp; set when both sides have a participant */
  checkedInParticipantIds?: string[];
  /** the event's category, overlaid by the collection's category for a tieMatchUp */
  category?: Category;
  /** set when `contextProfile.withCompetitiveness` is given: the result of `getMatchUpCompetitiveProfile` */
  competitiveProfile?: HydratedCompetitiveProfile;
  /** a round robin group's matchUp: the structureId of the CONTAINER structure; `structureId` is the group's */
  containerStructureId?: string;
  discipline?: DisciplineUnion;
  drawName?: string;
  /** the drawPositions that can reach this matchUp, by round position */
  drawPositionsRange?: HydratedDrawPositionsRange;
  drawType?: DrawTypeUnion;
  /** the number of flights (or draws) in the matchUp's event */
  eventDrawsCount?: number;
  eventName?: string;
  eventType?: EventTypeUnion;
  /** the round's sides are ordered as a feed round's */
  feedRound?: boolean;
  /** the collection's gender for a tieMatchUp, else the event's */
  gender?: GenderUnion;
  /** the round reserves a drawPosition for a fed participant */
  hasFedDrawPosition?: boolean;
  /** true on every hydrated matchUp */
  hasContext?: boolean;
  /**
   * The event's (else the tournament's) indoorOutdoor. The key is spelled `indoorOutDoor`; the stored attribute is
   * `indoorOutdoor`.
   */
  indoorOutDoor?: IndoorOutdoorUnion;
  /** set when `contextProfile.inferGender` is given and both sides' participants have the same sex */
  inferredGender?: SexUnion;
  isRoundRobin?: boolean;
  preFeedRound?: boolean;
  /** both sides have a participant, there is no winner yet and scoring is active */
  readyToScore?: boolean;
  roundFactor?: number;
  roundOffset?: number;
  /** the round of play across linked structures; `false` for a qualifying matchUp or when it cannot be derived */
  roundOfPlay?: number | false;
  stage?: StageTypeUnion;
  stageSequence?: number;
  structureName?: string;
  /** the tournament's team presentation, narrowed to the TEAM participants of this matchUp */
  teamPresentation?: TeamPresentation;

  // set by `nextMatchUps: true`
  /** where the winner goes next: an elimination structure's matchUp */
  winnerTo?: HydratedUpcomingMatchUp;
  /** where the loser goes next: past a BYE, the next matchUp to be played */
  loserTo?: HydratedUpcomingMatchUp;
  /** a round robin matchUp: each side's matchUp in the group's next round */
  sidesTo?: HydratedSideTo[];
  /** one list per feeding matchUp: the participants who may arrive here from it */
  potentialParticipants?: HydratedPotentialParticipant[][];

  /** a stored extension, copied as an attribute: `_` + the extension's name, holding its value */
  [extension: `_${string}`]: unknown;
}

/** `HydratedMatchUp.winnerTo` / `loserTo` */
type HydratedUpcomingMatchUp = {
  matchUpId: string;
  structureId: string;
  schedule?: HydratedMatchUpSchedule;
  roundNumber?: number;
  roundPosition?: number;
  structureName?: string;
};

/** `HydratedMatchUp.sidesTo` */
type HydratedSideTo = {
  matchUpId?: string;
  roundNumber: number;
  schedule?: HydratedMatchUpSchedule;
  sideNumber: number;
  structureName?: string;
};

/**
 * `HydratedMatchUp.potentialParticipants`: a side's participant, or `{ participantId }`, or `{ qualifier: true }`, or
 * `{ bye: true, tbd: true }` for the BYE a first-matchUp consolation may yet receive
 */
type HydratedPotentialParticipant = Partial<HydratedParticipant> & {
  qualifier?: boolean;
  bye?: boolean;
  tbd?: boolean;
};

/** `HydratedMatchUp.drawPositionsRange`: what reaches the matchUp, as range strings */
type HydratedDrawPositionsRange = {
  firstRoundDrawPositionsRange: string;
  firstRoundOffsetDrawPositionsRange: string;
  possibleDrawPositions: number[];
  drawPositionsRange: string;
};

/** `HydratedMatchUp.competitiveProfile`: a profile, or the error that prevented one */
type HydratedCompetitiveProfile = {
  perspectiveSideNumber?: number;
  competitiveness?: string;
  signedDelta?: number;
  deltaBand?: string;
  pctSpread?: number;
  success?: boolean;
  error?: ErrorType;
  info?: string;
};

/**
 * A participant as the queries return it: the stored participant plus the context hydration adds.
 *
 * Every key hydration adds is declared. Most are present only when the query was asked for them (`withEvents`,
 * `withDraws`, `withMatchUps`, `withOpponents`, `withStatistics`, `withScheduleItems`, `withPotentialMatchUps`,
 * `withScaleValues`, `withSignInStatus`, `withIOC`/`withISO2`, `withIndividualParticipants`, `withGroupings`, …), so
 * they are optional. A stored extension is copied as an attribute named `_` + its name, holding its value.
 */
export interface HydratedParticipant extends Participant {
  /** the participant's person, with the country attributes `withIOC` / `withISO2` add */
  person?: HydratedPerson;
  /** a PAIR, TEAM or GROUP: its individual participants, hydrated */
  individualParticipants?: HydratedParticipant[];

  // an individual's groupings (`withGroupings`, and always in a participantMap)
  /** the GROUP participants listing this individual */
  groupParticipantIds?: string[];
  /** the PAIR participants listing this individual */
  pairParticipantIds?: string[];
  /** the TEAM participants listing this individual */
  teamParticipantIds?: string[];
  /** the GROUP participants listing this individual */
  groups?: HydratedParticipantMembership[];
  /** the TEAM participants listing this individual */
  teams?: HydratedParticipantMembership[];

  // `withScaleValues`: the latest value of each scale, by event type (see `getScaleValues`)
  rankings?: HydratedScales;
  ratings?: HydratedScales;
  /** with `withSeeding`, also the draws' seedings, each with the drawId as its `scaleName` */
  seedings?: HydratedSeedings;

  /** `withSignInStatus`: the latest recorded presence state is SIGNED_IN */
  signedIn?: boolean;

  // a matchUp side's participant: its entry in the draw (else the event)
  entryStatus?: Entry['entryStatus'];
  entryStage?: Entry['entryStage'];
  /** a matchUp side's participant: its position was filled by a lucky loser's advancement */
  luckyAdvancement?: boolean;
  /** the participants a position or matchUp action offers: the entry position, by which they are sorted */
  entryPosition?: number;

  /** `withEvents`: the participant's entry in each event */
  events?: HydratedParticipantEvent[];
  /** `withDraws`: the participant's entry in each draw */
  draws?: HydratedParticipantDraw[];
  /** `withMatchUps`: the participant's part in each matchUp */
  matchUps?: HydratedParticipantMatchUp[];
  /** `withOpponents`: each participant faced, with the matchUp */
  opponents?: HydratedParticipantOpponent[];
  /** `withPotentialMatchUps` or `scheduleAnalysis`: the matchUps the participant may yet reach */
  potentialMatchUps?: HydratedParticipantPotentialMatchUp[];
  /** `withStatistics`: win ratios, overall and by matchUp type */
  statistics?: HydratedParticipantStatistic[];
  /** `withScheduleItems` or `scheduleAnalysis`: the scheduled matchUps, played and potential */
  scheduleItems?: HydratedScheduleItem[];
  /** `scheduleAnalysis`: the pairs of the participant's matchUps scheduled too close together */
  scheduleConflicts?: ScheduleConflict[];

  /** a stored extension, copied as an attribute: `_` + the extension's name, holding its value */
  [extension: `_${string}`]: unknown;
}

/** `HydratedParticipant.person`: with `withIOC` / `withISO2`, the codes and name of its nationality's country */
type HydratedPerson = Person & {
  iocNationalityCode?: string;
  iso2NationalityCode?: string;
  countryName?: string;
};

/** `HydratedParticipant.groups` / `teams`: a grouping that lists the individual */
type HydratedParticipantMembership = {
  participantRoleResponsibilities?: string[];
  participantOtherName?: string;
  participantName?: string;
  participantId: string;
  teamId?: string;
};

/** `HydratedParticipant.rankings` / `ratings`: by event type, one entry per scale name, in no set order */
type HydratedScales = {
  [eventType in EventTypeUnion]?: HydratedScaleValue[];
};

/** the latest value of one scale */
type HydratedScaleValue = {
  scaleName: string;
  scaleValue: TimeItem['itemValue'];
  scaleDate?: string;
};

/** `HydratedParticipant.seedings`: a scale value, or a draw's seeding (whose `scaleName` is the drawId) */
type HydratedSeedings = {
  [eventType in EventTypeUnion]?: (HydratedScaleValue | HydratedDrawSeeding)[];
};

type HydratedDrawSeeding = {
  scaleName: string;
  seedNumber?: number;
  seedValue?: number | string;
};

/** an entry's seeding, by stage */
type HydratedSeedAssignments = {
  [stage: string]: { seedNumber?: number; seedValue?: number | string };
};

/** `HydratedParticipant.events` */
type HydratedParticipantEvent = {
  eventId: string;
  entryPosition?: number;
  entryStatus?: Entry['entryStatus'];
  entryStage?: Entry['entryStage'];
  /** the ranking for the event's category, from the participant's scale values */
  ranking?: HydratedScaleValue['scaleValue'];
  /** `withSeeding` */
  seedAssignments?: HydratedSeedAssignments;
  /** `withSeeding` */
  seedValue?: number | string;
  /** a PAIR's individual: the other individual */
  partnerParticipantIds?: string[];

  /** with `convertExtensions`: an entry extension, copied as an attribute: `_` + its name, holding its value */
  [extension: `_${string}`]: unknown;
};

/** `HydratedParticipant.draws` */
type HydratedParticipantDraw = {
  drawId: string;
  eventId: string;
  entryPosition?: number;
  entryStatus?: Entry['entryStatus'];
  entryStage?: Entry['entryStage'];
  ranking?: HydratedScaleValue['scaleValue'];
  seedAssignments?: HydratedSeedAssignments;
  seedValue?: number | string;
  partnerParticipantIds?: string[];
  /** `withOpponents`: the opponents faced in this draw */
  opponents?: HydratedParticipantOpponent[];
  /** `withRankingProfile`: the best finishing position range reached */
  finishingPositionRange?: number[];
  /** `withRankingProfile`: the participation in each structure, in structure order */
  structureParticipation?: HydratedDrawParticipation[];
};

/** `HydratedParticipantDraw.structureParticipation` */
type HydratedDrawParticipation = StructureParticipation & {
  finishingPositionRange?: number[];
  finishingMatchUpId?: string;
  finishingRound?: number;
  roundNumber?: number;
  participantWon?: boolean;
  /** the order among the structures that are not QUALIFYING */
  participationOrder?: number;
  flightNumber?: number;
};

/** `HydratedParticipant.matchUps`; a TEAM matchUp's entry (`withTeamMatchUps`) has no structure, event or draw */
type HydratedParticipantMatchUp = {
  matchUpId: string;
  matchUpType?: MatchUp['matchUpType'];
  participantWon: boolean;
  sideNumber?: number;
  structureId?: string;
  eventId?: string;
  drawId?: string;
  stage?: StageTypeUnion;
  collectionId?: string;
  /** `withOpponents`: the opponent and, for a PAIR, its individuals */
  opponentParticipantInfo?: { participantId: string; participantType?: Participant['participantType'] }[];
  partnerParticipantIds?: string[];
};

/** `HydratedParticipant.opponents` */
type HydratedParticipantOpponent = {
  participantId: string;
  matchUpId: string;
  eventId: string;
  drawId: string;
};

/** `HydratedParticipant.potentialMatchUps` */
type HydratedParticipantPotentialMatchUp = {
  tournamentId?: string;
  matchUpId: string;
  eventId: string;
  drawId: string;
};

/** `HydratedParticipant.statistics` */
type HydratedParticipantStatistic = {
  statCode: string;
  numerator: number;
  denominator: number;
  statValue: number;
};

/** `HydratedParticipant.scheduleItems`: a matchUp's schedule, with the matchUp it belongs to */
type HydratedScheduleItem = HydratedMatchUpSchedule & {
  matchUpId: string;
  drawId: string;
  structureId: string;
  matchUpStatus?: MatchUp['matchUpStatus'];
  matchUpType?: MatchUp['matchUpType'];
  roundNumber?: number;
  roundPosition?: number;
  checkScoreHasValue: boolean;
  /** a matchUp the participant may yet reach */
  potential?: boolean;
};

export interface HydratedSide extends Side {
  participant?: HydratedParticipant;

  /** the side's draw position; absent on a side with no assigned position */
  drawPosition?: number;
  /** the side's number as displayed: reversed from `sideNumber` where the round orders its sides that way */
  displaySideNumber?: number;
  /** the side holds a BYE */
  bye?: boolean;
  /** the side's position is reserved for a qualifier */
  qualifier?: boolean;
  /** side 1 of a round that reserves a drawPosition for a fed participant: describes the slot, not the participant */
  participantFed?: boolean;
  /** side 2 of a round that reserves a drawPosition for a fed participant: describes the slot, not the participant */
  participantAdvanced?: boolean;
  /** the drawPositions in the source structure that feed this side, as a range string */
  sourceDrawPositionRange?: string;
  /** the side participant's seed, from the structure's seedAssignments */
  seedNumber?: number;
  /** the side participant's seed value; `'~'` when a seed assignment was removed */
  seedValue?: number | string;
  seedingBasis?: SeedingBasisUnion;
  /** a tieMatchUp's side: the TEAM participant whose lineUp supplies the side participant */
  teamParticipant?: HydratedParticipant;
  /** a tieMatchUp's side: the substitutions made at this collection position */
  substitutions?: Substitution[];

  /** a stored extension, copied as an attribute: `_` + the extension's name, holding its value */
  [extension: `_${string}`]: unknown;
}
