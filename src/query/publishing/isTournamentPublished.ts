import { getPublishState } from '@Query/publishing/getPublishState';

/**
 * Whether a tournament is published — the ONE definition of the tournament-level roll-up.
 *
 * True when any event has a published draw, or the order of play is published, or the participant
 * list is published: `getPublishState(...).publishState.tournament.status.published`.
 *
 * Read this rather than re-deriving the condition. Two partial restatements of it existed — the read
 * model's `tournamentRow` counted only order of play and participants, so a tournament whose only
 * published component was a draw was public on the provider calendar and unpublished in the read
 * model. A missing or unreadable record is unpublished: withholding is the safe default.
 */
export function isTournamentPublished(tournamentRecord: any): boolean {
  if (!tournamentRecord) return false;
  return getPublishState({ tournamentRecord })?.publishState?.tournament?.status?.published === true;
}
