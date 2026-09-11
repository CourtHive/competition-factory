import { addNotice, getPayloads } from '@Global/state/globalState';

// constants and types
import { MODIFY_PARTICIPANTS } from '@Constants/topicConstants';
import { Participant } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

type ModifyParticipantsNoticeArgs = {
  tournamentId?: string;
  participants: (Participant | undefined)[];
};

/**
 * Dispatch MODIFY_PARTICIPANTS for a batch of changed participants.
 *
 * Keyed by `tournamentId` and union-merged (by `participantId`, latest wins) with
 * any MODIFY_PARTICIPANTS already buffered for the same tournament this mutation
 * cycle. This yields a single deduped notice per tournament per cycle — a
 * participant touched by several mutations in one executionQueue is delivered
 * once, not repeatedly — while keeping the payload shape `{ tournamentId,
 * participants }` unchanged (non-breaking for existing subscribers).
 *
 * `addNotice` marks the record modified even without a subscriber, so a
 * participant change always sets `mutationStatus` (persistence). When no
 * subscription exists, `getPayloads` returns nothing and the union is trivial.
 */
export function modifyParticipantsNotice({ tournamentId, participants }: ModifyParticipantsNoticeArgs) {
  if (!participants?.length) return { ...SUCCESS };

  const byId = new Map<string, Participant>();
  const buffered = getPayloads({ topic: MODIFY_PARTICIPANTS }).find(
    (payload) => payload?.tournamentId === tournamentId,
  );
  for (const participant of buffered?.participants ?? []) {
    if (participant?.participantId) byId.set(participant.participantId, participant);
  }
  for (const participant of participants) {
    if (participant?.participantId) byId.set(participant.participantId, participant);
  }

  addNotice({
    topic: MODIFY_PARTICIPANTS,
    key: tournamentId,
    payload: { tournamentId, participants: [...byId.values()] },
  });

  return { ...SUCCESS };
}
