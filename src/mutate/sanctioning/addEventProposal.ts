import { UUID } from '@Tools/UUID';

// Constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  EDITABLE_STATUSES,
  MISSING_SANCTIONING_RECORD,
  MISSING_EVENT_PROPOSAL,
  PROPOSAL_NOT_EDITABLE,
} from '@Constants/sanctioningConstants';

// Types
import type { SanctioningRecord, EventProposal } from '@Types/sanctioningTypes';

type AddEventProposalArgs = {
  sanctioningRecord: SanctioningRecord;
  eventProposal: EventProposal;
};

export function addEventProposal({ sanctioningRecord, eventProposal }: AddEventProposalArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };
  if (!eventProposal) return { error: MISSING_EVENT_PROPOSAL };
  if (!eventProposal.eventName) return { error: INVALID_VALUES, context: { message: 'Missing eventName' } };
  if (!eventProposal.eventType) return { error: INVALID_VALUES, context: { message: 'Missing eventType' } };

  if (!EDITABLE_STATUSES.includes(sanctioningRecord.status)) {
    return { error: PROPOSAL_NOT_EDITABLE, context: { status: sanctioningRecord.status } };
  }

  const newEvent: EventProposal = {
    ...eventProposal,
    eventProposalId: eventProposal.eventProposalId || UUID(),
  };

  sanctioningRecord.proposal.events.push(newEvent);
  sanctioningRecord.updatedAt = new Date().toISOString();
  sanctioningRecord.version += 1;

  return { ...SUCCESS, eventProposalId: newEvent.eventProposalId };
}
