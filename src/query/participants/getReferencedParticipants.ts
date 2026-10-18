// types
import { DrawDefinition, Event, Participant } from '@Types/tournamentTypes';

type GetReferencedParticipantsArgs = {
  record: DrawDefinition | Event;
  participants: Participant[];
};

/**
 * The participants a query over one draw or one event can read, in their stored order:
 * - every participant whose id appears anywhere in the record, as a value or as a key (entries, position
 *   assignments, sides, lineUps, officials on timeItems, extensions keyed by participantId);
 * - the individuals of those participants;
 * - every group participant (pair, team, group) one of those individuals belongs to, which the individual's
 *   groupings name, with all of that group's individuals: a group in the list is never missing a member, so a
 *   reader that walks a group's members always finds them.
 *
 * Reading the record costs a walk of the record, where building every participant costs a copy of the whole pool.
 */
export function getReferencedParticipants({ participants, record }: GetReferencedParticipantsArgs) {
  const byId = new Map(participants.map((participant) => [participant.participantId, participant]));
  return withGroupings({ participants, participantIds: collectReferencedIds(record, byId), byId });
}

type WithGroupingsArgs = {
  byId?: Map<string, Participant>;
  participantIds: Set<string>;
  participants: Participant[];
};

/**
 * The participants named by `participantIds`, their individuals, and every group one of those individuals belongs to
 * with all of that group's members, in stored order: the set whose built participants read the same as when the
 * whole pool is built.
 */
export function withGroupings({ participants, participantIds, byId }: WithGroupingsArgs) {
  byId ??= new Map(participants.map((participant) => [participant.participantId, participant]));
  const scoped = new Set(participantIds);

  const addIndividuals = (participantId: string) => {
    for (const individualId of byId.get(participantId)?.individualParticipantIds ?? []) {
      if (byId.has(individualId)) scoped.add(individualId);
    }
  };

  for (const participantId of [...scoped]) addIndividuals(participantId);

  const groups = participants.filter(
    ({ participantId, individualParticipantIds }) =>
      !scoped.has(participantId) && individualParticipantIds?.some((individualId) => scoped.has(individualId)),
  );
  for (const { participantId } of groups) {
    scoped.add(participantId);
    addIndividuals(participantId);
  }

  return participants.filter(({ participantId }) => scoped.has(participantId));
}

function collectReferencedIds(record: DrawDefinition | Event, byId: Map<string, Participant>) {
  const found = new Set<string>();
  // a provider's record may be a document instance rather than plain JSON, so each object is walked once
  const visited = new Set<object>();
  const pending: unknown[] = [record];

  while (pending.length) {
    const value = pending.pop();
    if (typeof value === 'string') {
      if (byId.has(value)) found.add(value);
    } else if (!value || typeof value !== 'object' || visited.has(value)) {
      continue;
    } else if (Array.isArray(value)) {
      visited.add(value);
      for (const item of value) pending.push(item);
    } else {
      visited.add(value);
      for (const [key, nested] of Object.entries(value)) {
        if (byId.has(key)) found.add(key);
        pending.push(nested);
      }
    }
  }

  return found;
}
