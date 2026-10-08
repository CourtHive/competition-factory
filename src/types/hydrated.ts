import { Court, MatchUp, Participant, Side, Venue } from './tournamentTypes';

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

export interface HydratedMatchUp extends MatchUp {
  [key: string | number]: any;
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
}

export type HydratedParticipant = {
  individualParticipants?: HydratedParticipant[];
  [key: string | number]: any;
} & Participant;

export type HydratedSide = Side & {
  participant?: HydratedParticipant;
  [key: string | number]: any;
};
