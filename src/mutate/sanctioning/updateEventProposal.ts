// Constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  EDITABLE_STATUSES,
  MISSING_SANCTIONING_RECORD,
  EVENT_PROPOSAL_NOT_FOUND,
  PROPOSAL_NOT_EDITABLE,
} from '@Constants/sanctioningConstants';

// Types
import type { SanctioningRecord, EventProposal } from '@Types/sanctioningTypes';

type UpdateEventProposalArgs = {
  sanctioningRecord: SanctioningRecord;
  eventProposalId: string;
  updates: Partial<EventProposal>;
};

export function updateEventProposal({ sanctioningRecord, eventProposalId, updates }: UpdateEventProposalArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };
  if (!eventProposalId) return { error: INVALID_VALUES, context: { message: 'Missing eventProposalId' } };
  if (!updates || typeof updates !== 'object')
    return { error: INVALID_VALUES, context: { message: 'Missing updates' } };

  if (!EDITABLE_STATUSES.includes(sanctioningRecord.status)) {
    return { error: PROPOSAL_NOT_EDITABLE, context: { status: sanctioningRecord.status } };
  }

  const event = sanctioningRecord.proposal.events.find((e) => e.eventProposalId === eventProposalId);
  if (!event) return { error: EVENT_PROPOSAL_NOT_FOUND, context: { eventProposalId } };

  // Prevent overwriting the ID
  const { eventProposalId: _ignored, ...safeUpdates } = updates;
  Object.assign(event, safeUpdates);

  sanctioningRecord.updatedAt = new Date().toISOString();
  sanctioningRecord.version += 1;

  return { ...SUCCESS };
}
