/*
 * The basis on which `resolveHomeParticipantId` names (or declines to name) a matchUp's home participant.
 * Precedence is the order below: the first signal that singles out exactly one side wins.
 */
export const EXPLICIT = 'EXPLICIT'; // matchUp.schedule.homeParticipantId, written by setMatchUpHomeParticipantId
export const VENUE = 'VENUE'; // the matchUp's venue is in exactly one side's TEAM homeVenueIds
export const HOST_ORGANISATION = 'HOST_ORGANISATION'; // the owner issued an id (participantOtherIds) to exactly one side
export const NONE = 'NONE'; // no signal, or both sides match: there is no home participant

export const homeParticipantConstants = {
  EXPLICIT,
  VENUE,
  HOST_ORGANISATION,
  NONE,
} as const;

export type HomeParticipantBasis = (typeof homeParticipantConstants)[keyof typeof homeParticipantConstants];
