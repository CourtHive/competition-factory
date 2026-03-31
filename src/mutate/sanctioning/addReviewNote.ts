import { UUID } from '@Tools/UUID';

// Constants
import { MISSING_SANCTIONING_RECORD } from '@Constants/sanctioningConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { SanctioningRecord, ReviewNote } from '@Types/sanctioningTypes';

type AddReviewNoteArgs = {
  sanctioningRecord: SanctioningRecord;
  note: string;
  reviewerId?: string;
  reviewerName?: string;
};

export function addReviewNote({ sanctioningRecord, note, reviewerId, reviewerName }: AddReviewNoteArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };
  if (!note) return { error: INVALID_VALUES, context: { message: 'Missing note' } };

  sanctioningRecord.reviewNotes ??= [];
  const reviewNote: ReviewNote = {
    noteId: UUID(),
    reviewerId,
    reviewerName,
    note,
    createdAt: new Date().toISOString(),
  };
  sanctioningRecord.reviewNotes.push(reviewNote);

  sanctioningRecord.updatedAt = new Date().toISOString();
  sanctioningRecord.version += 1;

  return { ...SUCCESS, noteId: reviewNote.noteId };
}
