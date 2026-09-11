import { Court, MatchUp, Participant, Side, Venue } from './tournamentTypes';

export type HydratedCourt = {
  [key: string]: any;
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
