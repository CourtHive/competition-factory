// constants and types
import { INDIVIDUAL } from '@Constants/participantConstants';
import type { Participant } from '@Types/tournamentTypes';

/**
 * Resolves a participant to the set of individuals competing as that participant.
 *
 * An INDIVIDUAL resolves to itself; PAIR, TEAM and GROUP resolve to their
 * `individualParticipantIds`. Written against participantType generically rather than against an
 * allowlist so a participant that gains individuals later is covered without a second edit.
 *
 * NOTE: for a TEAM the competing individuals in a tie come from the lineUp, which can differ from
 * the team's roster. This resolves the roster; lineUp-level overlap is a separate question.
 */
export function resolveIndividualParticipantIds(participant?: Participant): string[] {
  if (!participant) return [];
  if (participant.participantType === INDIVIDUAL) return [participant.participantId];
  return participant.individualParticipantIds ?? [];
}

/**
 * The individuals that two participants have in common.
 *
 * A non-empty result means the two cannot meet: someone would be on both sides of the matchUp.
 * Both directions are the same question, so the result is order-independent.
 */
export function getSharedIndividualIds(a?: Participant, b?: Participant): string[] {
  if (!a || !b) return [];
  // the same participant on both sides shares every individual it has, including an INDIVIDUAL
  if (a.participantId === b.participantId) return resolveIndividualParticipantIds(a);
  const bIds = new Set(resolveIndividualParticipantIds(b));
  return resolveIndividualParticipantIds(a).filter((id) => bIds.has(id));
}

/**
 * Convenience predicate over `getSharedIndividualIds` for call sites that only need a boolean.
 */
export function participantsShareIndividual(a?: Participant, b?: Participant): boolean {
  return getSharedIndividualIds(a, b).length > 0;
}

/**
 * Builds a participantId -> individualParticipantIds lookup for a collection of participants.
 * Generation paths hold ids rather than participants, so they resolve through this map.
 */
export function buildIndividualIdsMap(participants?: Participant[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const participant of participants ?? []) {
    map[participant.participantId] = resolveIndividualParticipantIds(participant);
  }
  return map;
}

/**
 * Whether two participantIds share an individual, resolved through a prebuilt map.
 * An id absent from the map contributes no individuals and therefore no conflict.
 */
export function idsShareIndividual(individualIdsMap: Record<string, string[]>, a: string, b: string): boolean {
  if (a === b) return true;
  const bIds = new Set(individualIdsMap[b] ?? []);
  return (individualIdsMap[a] ?? []).some((id) => bIds.has(id));
}
