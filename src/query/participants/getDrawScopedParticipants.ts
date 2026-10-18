// types
import { DrawDefinition, Participant } from '@Types/tournamentTypes';

type GetDrawScopedParticipantsArgs = {
  drawDefinition: DrawDefinition;
  participants: Participant[];
};

/**
 * The participants hydrating one draw's matchUps can read, in their stored order:
 * - every participant whose id appears anywhere in the draw, as a value or as a key (entries, position
 *   assignments, sides, lineUps, officials on timeItems, extensions keyed by participantId);
 * - the individuals of those participants;
 * - every group participant (pair, team, group) one of those individuals belongs to, which the individual's
 *   groupings name.
 *
 * Reading the draw costs a walk of the draw, where hydrating every participant costs a copy of the whole pool.
 */
export function getDrawScopedParticipants({ participants, drawDefinition }: GetDrawScopedParticipantsArgs) {
  const byId = new Map(participants.map((participant) => [participant.participantId, participant]));
  const scoped = collectReferencedIds(drawDefinition, byId);

  for (const participantId of [...scoped]) {
    for (const individualId of byId.get(participantId)?.individualParticipantIds ?? []) {
      if (byId.has(individualId)) scoped.add(individualId);
    }
  }

  const groups = participants.filter(
    ({ participantId, individualParticipantIds }) =>
      !scoped.has(participantId) && individualParticipantIds?.some((individualId) => scoped.has(individualId)),
  );
  for (const { participantId } of groups) scoped.add(participantId);

  return participants.filter(({ participantId }) => scoped.has(participantId));
}

function collectReferencedIds(drawDefinition: DrawDefinition, byId: Map<string, Participant>) {
  const found = new Set<string>();
  // a provider's record may be a document instance rather than plain JSON, so each object is walked once
  const visited = new Set<object>();
  const pending: unknown[] = [drawDefinition];

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
