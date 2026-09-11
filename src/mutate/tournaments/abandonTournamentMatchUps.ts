import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { findEvent } from '@Acquire/findEvent';

// constants and types
import { ABANDONED, completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { TEAM } from '@Constants/matchUpTypes';

/**
 * Predicate: is this in-context matchUp one we should abandon?
 *
 * The core gate is the derived `readyToScore` flag (set in addMatchUpContext as
 * `scoringActive && hasParticipants && hasNoWinner`): both sides hold real
 * participants (BYEs excluded), the matchUp has no winningSide, and its
 * structure is active. TEAM containers and tie collection matchUps are out of
 * scope for v1. When `requireNoScore` is true (the default) matchUps that
 * already carry a partial score are left untouched.
 */
function isAbandonable({ matchUp, eventIdSet, drawIdSet, requireNoScore }) {
  if (!matchUp.readyToScore) return false;
  // readyToScore stays true for an ABANDONED matchUp (no winner, still has
  // participants), so exclude already-terminal statuses to stay idempotent and
  // to never re-touch CANCELLED/ABANDONED/etc.
  if (completedMatchUpStatuses.includes(matchUp.matchUpStatus)) return false;
  if (matchUp.matchUpType === TEAM || matchUp.collectionId) return false;
  if (eventIdSet && !eventIdSet.has(matchUp.eventId)) return false;
  if (drawIdSet && !drawIdSet.has(matchUp.drawId)) return false;
  if (requireNoScore && checkScoreHasValue({ matchUp })) return false;
  return true;
}

/**
 * Bulk "end the tournament": set every still-playable matchUp to ABANDONED.
 *
 * Intended for tournaments whose draws cannot be completed (e.g. rain): rather
 * than leaving unplayed matchUps as TO_BE_PLAYED, a director marks them
 * ABANDONED in one call. Selection is driven by the derived `readyToScore`
 * state — a matchUp with assigned participants on both sides, no winningSide,
 * and an active structure — so BYEs, completed/walkover/retired matchUps, and
 * empty downstream rounds (no participants yet) are never touched.
 *
 * ABANDONED is a non-directing matchUpStatus: it advances no participant, so
 * the candidate set computed up front stays valid while statuses are applied.
 *
 * This mutates matchUps only — it does NOT change event or tournament status.
 *
 * @param tournamentRecord - required.
 * @param eventIds - optional; restrict to these events.
 * @param drawIds - optional; restrict to these draws.
 * @param requireNoScore - default true. When true, in-progress matchUps that
 *   already have a partial score are left untouched (strict "players, no
 *   score"). Set false to also abandon started-but-unfinished matchUps.
 * @returns { abandoned, matchUpIds } — count and ids of matchUps set ABANDONED.
 */
export function abandonTournamentMatchUps(params) {
  const { tournamentRecord, eventIds, drawIds, requireNoScore = true } = params ?? {};
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const eventIdSet = Array.isArray(eventIds) && eventIds.length ? new Set(eventIds) : undefined;
  const drawIdSet = Array.isArray(drawIds) && drawIds.length ? new Set(drawIds) : undefined;

  const { matchUps = [], error } = allTournamentMatchUps({ tournamentRecord });
  if (error) return { error };

  const candidates = matchUps.filter((matchUp) => isAbandonable({ matchUp, eventIdSet, drawIdSet, requireNoScore }));

  const eventCache = {};
  const matchUpIds: string[] = [];

  for (const candidate of candidates) {
    const { eventId, drawId, matchUpId } = candidate;
    if (!(eventId in eventCache)) eventCache[eventId] = findEvent({ tournamentRecord, eventId }).event;
    const event = eventCache[eventId];
    const drawDefinition = event?.drawDefinitions?.find((definition) => definition.drawId === drawId);
    if (!drawDefinition) continue;

    const result = setMatchUpStatus({
      outcome: { matchUpStatus: ABANDONED },
      tournamentRecord,
      drawDefinition,
      matchUpId,
      event,
      drawId,
    });
    if (result.error) return { ...result, abandoned: matchUpIds.length, matchUpIds };
    matchUpIds.push(matchUpId);
  }

  return { ...SUCCESS, abandoned: matchUpIds.length, matchUpIds };
}
