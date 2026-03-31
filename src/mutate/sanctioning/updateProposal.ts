// Constants
import { EDITABLE_STATUSES, PROPOSAL_NOT_EDITABLE, MISSING_SANCTIONING_RECORD } from '@Constants/sanctioningConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { SanctioningRecord, TournamentProposal } from '@Types/sanctioningTypes';

type UpdateProposalArgs = {
  sanctioningRecord: SanctioningRecord;
  updates: Partial<TournamentProposal>;
};

export function updateProposal({ sanctioningRecord, updates }: UpdateProposalArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };
  if (!updates || typeof updates !== 'object')
    return { error: INVALID_VALUES, context: { message: 'Missing updates' } };

  if (!EDITABLE_STATUSES.includes(sanctioningRecord.status)) {
    return { error: PROPOSAL_NOT_EDITABLE, context: { status: sanctioningRecord.status } };
  }

  // Do not allow overwriting events array via updateProposal — use add/remove/updateEventProposal
  const { events, ...safeUpdates } = updates;

  Object.assign(sanctioningRecord.proposal, safeUpdates);
  sanctioningRecord.updatedAt = new Date().toISOString();
  sanctioningRecord.version += 1;

  return { ...SUCCESS };
}
