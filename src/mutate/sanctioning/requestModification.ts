import { transitionStatus } from './transitionStatus';

// Constants
import { MISSING_SANCTIONING_RECORD, MODIFICATION_REQUESTED } from '@Constants/sanctioningConstants';
import { UUID } from '@Tools/UUID';

// Types
import type { SanctioningRecord, ReviewNote } from '@Types/sanctioningTypes';

type RequestModificationArgs = {
  sanctioningRecord: SanctioningRecord;
  requestedBy?: string;
  note?: string;
};

export function requestModification({ sanctioningRecord, requestedBy, note }: RequestModificationArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };

  const result = transitionStatus({
    sanctioningRecord,
    toStatus: MODIFICATION_REQUESTED,
    transitionedBy: requestedBy,
    reason: note ?? 'Modifications requested',
  });
  if (result.error) return result;

  if (note) {
    sanctioningRecord.reviewNotes ??= [];
    const reviewNote: ReviewNote = {
      noteId: UUID(),
      reviewerId: requestedBy,
      note,
      createdAt: sanctioningRecord.updatedAt,
    };
    sanctioningRecord.reviewNotes.push(reviewNote);
  }

  return result;
}
