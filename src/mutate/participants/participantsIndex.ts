import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { Participant } from '@Types/tournamentTypes';

/**
 * A record's participants indexed for a batch of additions (addParticipants), kept current as each is added, so that
 * adding k participants to a pool of N reads the pool once rather than k times. Each answer is the one a scan of
 * `tournamentRecord.participants` would give; where the index cannot promise that, it says so and the caller scans.
 */
export type ParticipantsIndex = {
  ids: Set<string>;
  individualIds: Set<string>;
  /** each participant's position in the record, so a scan's record order can be kept */
  positions: Map<string, number>;
  /** the first PAIR in record order with each pair of distinct individualParticipantIds, keyed by them sorted */
  pairs: Map<string, Participant>;
  /** a PAIR with more than two distinct individualParticipantIds: matching against it needs the scan */
  irregularPairs: boolean;
};

/** the key of two distinct ids, or undefined when the ids are not exactly two distinct ones */
export function pairKey(individualParticipantIds?: string[]): string | undefined {
  const distinct = [...new Set(individualParticipantIds ?? [])];
  if (distinct.length !== 2) return undefined;
  return distinct.sort().join('|');
}

/** the index of a record's participants, or undefined when the record repeats a participantId (scans then decide) */
export function indexParticipants(participants: Participant[]): ParticipantsIndex | undefined {
  const index: ParticipantsIndex = {
    individualIds: new Set(),
    positions: new Map(),
    irregularPairs: false,
    pairs: new Map(),
    ids: new Set(),
  };
  for (const participant of participants) {
    if (index.ids.has(participant.participantId)) return undefined;
    indexParticipant(index, participant, index.positions.size);
  }
  return index;
}

/** adds a participant just appended to the record */
export function indexParticipant(index: ParticipantsIndex, participant: Participant, position: number) {
  const { participantId, participantType, individualParticipantIds } = participant;
  index.ids.add(participantId);
  index.positions.set(participantId, position);
  if (participantType === INDIVIDUAL) index.individualIds.add(participantId);
  if (participantType !== PAIR) return;
  const distinct = new Set(individualParticipantIds ?? []);
  if (distinct.size > 2) index.irregularPairs = true;
  const key = pairKey(individualParticipantIds);
  if (key && !index.pairs.has(key)) index.pairs.set(key, participant);
}
