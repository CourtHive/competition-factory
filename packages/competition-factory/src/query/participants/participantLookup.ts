// constants and types
import { PAIR } from '@Constants/participantConstants';
import type { ParticipantLookup } from '@Types/hydrationCacheTypes';

export type { ParticipantLookup } from '@Types/hydrationCacheTypes';

/**
 * The key for one or two DISTINCT string ids, whatever their order; undefined for anything else, which a caller
 * answers by scanning. Two equal ids never name a pair (`intersection` de-duplicates before comparing lengths).
 */
export function pairMembersKey(participantIds: unknown): string | undefined {
  if (!Array.isArray(participantIds)) return undefined;
  const [first, second] = participantIds;
  if (typeof first !== 'string') return undefined;
  if (participantIds.length === 1) return JSON.stringify([first]);
  if (participantIds.length !== 2 || typeof second !== 'string' || first === second) return undefined;
  return JSON.stringify(first < second ? [first, second] : [second, first]);
}

/**
 * Undefined when the list is not one a keyed lookup can answer for as a scan would: an entry that is not an object
 * (a scan throws on it, when it reaches it) or a `participantId` that is neither a string nor absent. The caller
 * then scans, as before.
 */
export function buildParticipantLookup(participants: unknown): ParticipantLookup | undefined {
  if (!Array.isArray(participants)) return undefined;

  const firstById: ParticipantLookup['firstById'] = new Map();
  const pairsByMembers: ParticipantLookup['pairsByMembers'] = new Map();

  for (const participant of participants) {
    if (!participant || typeof participant !== 'object') return undefined;
    const { participantId, participantType, individualParticipantIds } = participant;
    if (participantId !== undefined && typeof participantId !== 'string') return undefined;
    if (!firstById.has(participantId)) firstById.set(participantId, participant);

    const key = participantType === PAIR ? pairMembersKey(individualParticipantIds) : undefined;
    if (key) {
      const pairs = pairsByMembers.get(key);
      if (pairs) pairs.push(participant);
      else pairsByMembers.set(key, [participant]);
    }
  }

  return { firstById, pairsByMembers };
}
