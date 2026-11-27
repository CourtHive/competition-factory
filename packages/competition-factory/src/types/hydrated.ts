import type { ErrorType } from '@Constants/errorConditionConstants';
import type { Substitution } from './factoryTypes';
import {
  Category,
  Court,
  DisciplineUnion,
  DrawTypeUnion,
  EventTypeUnion,
  GenderUnion,
  IndoorOutdoorUnion,
  MatchUp,
  MatchUpSchedule,
  Participant,
  SeedingBasisUnion,
  SexUnion,
  Side,
  StageTypeUnion,
  TeamPresentation,
  Venue,
} from './tournamentTypes';

export type HydratedCourt = {
  [key: string]: any;
  // Always present on a hydrated court: getInContextCourt attaches the parent venue's id, and
  // addCourt writes it on every stored court. Declared as REQUIRED here so callers can pass it
  // where a string is expected; the stored `Court.venueId` stays optional.
  venueId: string;
} & Court;

export type HydratedVenue = {
  [key: string]: any;
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
  schedule?: MatchUpSchedule;
  roundNumber?: number;
  roundPosition?: number;
  structureName?: string;
};

/** `HydratedMatchUp.sidesTo` */
type HydratedSideTo = {
  matchUpId?: string;
  roundNumber: number;
  schedule?: MatchUpSchedule;
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

export type HydratedParticipant = {
  individualParticipants?: HydratedParticipant[];
  [key: string | number]: any;
} & Participant;

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
