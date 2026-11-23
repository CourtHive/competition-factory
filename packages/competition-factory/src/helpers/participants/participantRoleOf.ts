// constants and types
import type { ParticipantRoleUnion } from '@Types/tournamentTypes';
import { COMPETITOR } from '@Constants/participantRoleValues';

/**
 * The role a participant plays, as every role-based filter and decision in the factory reads it.
 *
 * An absent `participantRole` resolves to COMPETITOR. CODES requires only `participantId` on a
 * participant, so a hand-built or imported record can carry players with no role at all, and records
 * written before roles existed do the same. `participantType` says what a participant IS;
 * `participantRole` says what they DO, and a participant with no role written is a player, never a
 * person with no part to play.
 *
 * This is a READ-time default: the record is never rewritten. `getTournamentInconsistencies` reports
 * the participants it applies to (`PARTICIPANT_ROLE_MISSING`, info).
 *
 * Only a MISSING role is defaulted. A value that is not a ParticipantRoleEnum member (e.g. "PLAYER")
 * is returned as-is, so it matches no role filter: defaulting it would count a misspelt staff role as
 * a player. Those are reported as `PARTICIPANT_ROLE_INVALID` (warning).
 *
 * Route every `participantRole` comparison through this so the default cannot drift between sites.
 * Code that must distinguish "explicitly set" from "absent" (write-time validation, an explicitly
 * authored GROUP relationship) reads `participant.participantRole` directly, on purpose.
 */
export function participantRoleOf(participant?: { participantRole?: ParticipantRoleUnion }): ParticipantRoleUnion {
  return participant?.participantRole ?? COMPETITOR;
}

export function isCompetitorRole(participant?: { participantRole?: ParticipantRoleUnion }): boolean {
  return participantRoleOf(participant) === COMPETITOR;
}
