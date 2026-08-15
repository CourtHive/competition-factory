import { getOfficialConflicts } from '@Query/officiating/getOfficialConflicts';
import { getParticipants } from '@Query/participants/getParticipants';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';

// Constants
import { MISSING_TOURNAMENT_RECORD, MISSING_MATCHUP_ID } from '@Constants/errorConditionConstants';
import { MISSING_CONFLICT_SOURCE } from '@Constants/officiatingConstants';
import { GROUP } from '@Constants/participantConstants';
import { POLICY_TYPE_OFFICIATING_CONFLICT } from '@Constants/policyConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { DrawDefinition, Event, Participant, Tournament } from '@Types/tournamentTypes';
import type { OfficialConflict, OfficialRecord } from '@Types/officiatingTypes';

type GetMatchUpOfficialConflictsArgs = {
  policyDefinitions?: { [key: string]: any };
  /** Durable registry declarations. OPTIONAL when `officialParticipantId` is supplied. */
  officialRecord?: OfficialRecord;
  /** The official's participantId in this tournament — enables the SHARED_GROUPING rule. */
  officialParticipantId?: string;
  drawDefinition: DrawDefinition;
  tournamentRecord: Tournament;
  organisationIds?: string[];
  nationalityCode?: string;
  matchUpId: string;
  event?: Event;
};

type GetMatchUpOfficialConflictsResult = {
  error?: any;
  success?: boolean;
  conflicts?: OfficialConflict[];
  blocked?: boolean;
  /** The participants the check was evaluated against — the sides of this
   *  matchUp, expanded to the individuals within any PAIR/TEAM side. */
  checkedParticipants?: Participant[];
};

/**
 * Resolve the participants of a single matchUp and evaluate an official against
 * them.
 *
 * This is the per-matchUp counterpart to `getOfficialConflicts`, which takes an
 * arbitrary participant list and is normally handed a whole tournament's field.
 * Scoping to one matchUp is the sharper check — a chair umpire who shares a
 * nationality with someone in a different quarter of the draw is not a conflict
 * for *this* assignment.
 *
 * Only participants actually assigned to the matchUp's sides are evaluated.
 * Potential participants (those who could still advance into it) are NOT
 * considered: an unresolved side has no official yet in practice, and treating
 * every possible opponent as a conflict would block most early-round assignments.
 */
export function getMatchUpOfficialConflicts({
  officialParticipantId,
  policyDefinitions,
  tournamentRecord,
  organisationIds,
  nationalityCode,
  drawDefinition,
  officialRecord,
  matchUpId,
  event,
}: GetMatchUpOfficialConflictsArgs): GetMatchUpOfficialConflictsResult {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!matchUpId) return { error: MISSING_MATCHUP_ID };
  // Either declaration source is sufficient: a registry record, or the official's participantId
  // (which unlocks tournament-scoped GROUP relationships).
  if (!officialRecord && !officialParticipantId) return { error: MISSING_CONFLICT_SOURCE };

  // No conflict policy ⇒ nothing to evaluate; skip resolving participants.
  if (!policyDefinitions?.[POLICY_TYPE_OFFICIATING_CONFLICT]) {
    return { ...SUCCESS, conflicts: [], blocked: false, checkedParticipants: [] };
  }

  const tournamentParticipants = getParticipants({ tournamentRecord }).participants ?? [];

  // `inContext` is required: a raw drawDefinition matchUp carries only
  // `drawPosition` on its sides — participantIds are resolved from the
  // structure's positionAssignments during hydration.
  const result = findDrawMatchUp({
    tournamentParticipants,
    inContext: true,
    drawDefinition,
    matchUpId,
    event,
  });
  if (result.error) return { error: result.error };

  const sideParticipantIds: string[] = (result.matchUp?.sides ?? [])
    .map((side: any) => side?.participantId)
    .filter(Boolean);

  const participantMap = new Map(tournamentParticipants.map((participant) => [participant.participantId, participant]));

  // Expand PAIR/TEAM sides to the individuals within them: a conflict is with a
  // person, and the side participant of a doubles pair is not a person.
  const checkedParticipants: Participant[] = [];
  const seen = new Set<string>();
  const include = (participantId?: string) => {
    if (!participantId || seen.has(participantId)) return;
    const participant = participantMap.get(participantId);
    if (!participant) return;
    seen.add(participantId);
    checkedParticipants.push(participant);
    for (const individualParticipantId of participant.individualParticipantIds ?? []) include(individualParticipantId);
  };
  for (const participantId of sideParticipantIds) include(participantId);

  // GROUP participants are the tournament-scoped declaration source: a GROUP containing the official
  // and a competitor IS the relationship. Passed whole; the query resolves the official's memberships.
  const groupParticipants = tournamentParticipants.filter((participant) => participant.participantType === GROUP);

  const conflictResult = getOfficialConflicts({
    participants: checkedParticipants,
    officialParticipantId,
    groupParticipants,
    policyDefinitions,
    organisationIds,
    nationalityCode,
    officialRecord,
  });
  if (conflictResult.error) return { error: conflictResult.error };

  return { ...SUCCESS, conflicts: conflictResult.conflicts, blocked: conflictResult.blocked, checkedParticipants };
}
