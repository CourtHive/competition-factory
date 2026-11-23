// constants and types
import { PAIR } from '@Constants/participantConstants';
import { Participant } from '@Types/tournamentTypes';

/**
 * A participant list indexed ONCE, for the reads that otherwise scan it for every matchUp side and every line of
 * every dual (a TEAM draw of 2,550 matchUps scanned 2,560 participants several thousand times per hydration).
 *
 * It answers exactly what the scans it replaces answer, duplicates included:
 * - `firstById`: the FIRST participant in list order holding each `participantId` (`Array.find`), the entry for
 *   `undefined` being the first participant with no id;
 * - `pairsByMembers`: every PAIR participant with exactly these `individualParticipantIds`, in list order, so the
 *   first is the pair `getPairedParticipant` returns and the rest are its `duplicatedPairParticipants`.
 *
 * It is a snapshot of the list it was built from: an added, removed or re-keyed participant is not in it. Build it
 * inside one read and drop it with the read (see hydrationCache.ts); mutations keep scanning the live list.
 */
export type ParticipantLookup = {
  firstById: Map<string | undefined, Participant>;
  pairsByMembers: Map<string, Participant[]>;
};

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
