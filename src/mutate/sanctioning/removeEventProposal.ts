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
import type { SanctioningRecord } from '@Types/sanctioningTypes';

type RemoveEventProposalArgs = {
  sanctioningRecord: SanctioningRecord;
  eventProposalId: string;
};

export function removeEventProposal({ sanctioningRecord, eventProposalId }: RemoveEventProposalArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };
  if (!eventProposalId) return { error: INVALID_VALUES, context: { message: 'Missing eventProposalId' } };

  if (!EDITABLE_STATUSES.includes(sanctioningRecord.status)) {
    return { error: PROPOSAL_NOT_EDITABLE, context: { status: sanctioningRecord.status } };
  }

  const index = sanctioningRecord.proposal.events.findIndex((e) => e.eventProposalId === eventProposalId);
  if (index < 0) return { error: EVENT_PROPOSAL_NOT_FOUND, context: { eventProposalId } };

  sanctioningRecord.proposal.events.splice(index, 1);
  sanctioningRecord.updatedAt = new Date().toISOString();
  sanctioningRecord.version += 1;

  return { ...SUCCESS };
}
