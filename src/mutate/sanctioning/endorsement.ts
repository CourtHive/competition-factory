// Constants
import { MISSING_SANCTIONING_RECORD, MISSING_ENDORSEMENT } from '@Constants/sanctioningConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { SanctioningRecord, PersonReference, Endorsement } from '@Types/sanctioningTypes';

// Sync the convenience `endorsement` field with the first entry in the `endorsements` array
function syncEndorsement(record: SanctioningRecord) {
  if (record.endorsements?.length) {
    record.endorsement = record.endorsements[0];
  }
}

function findEndorsement(record: SanctioningRecord, endorserId?: string): Endorsement | undefined {
  if (endorserId && record.endorsements?.length) {
    return record.endorsements.find((e) => e.endorserId === endorserId);
  }
  // Fall back to single endorsement for backward compat
  return record.endorsement ?? record.endorsements?.[0];
}

// ---------------------------------------------------------------------------
// Request Endorsement
// ---------------------------------------------------------------------------

type RequestEndorsementArgs = {
  sanctioningRecord: SanctioningRecord;
  endorserId: string;
  endorserName?: string;
  endorserContact?: PersonReference;
  endorsementLevel?: number;
  prerequisiteEndorserId?: string;
};

export function requestEndorsement({
  sanctioningRecord,
  endorserId,
  endorserName,
  endorserContact,
  endorsementLevel,
  prerequisiteEndorserId,
}: RequestEndorsementArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };
  if (!endorserId) return { error: INVALID_VALUES, context: { message: 'Missing endorserId' } };

  const newEndorsement: Endorsement = {
    status: 'PENDING',
    endorserId,
    endorserName,
    endorserContact,
    endorsementLevel,
    prerequisiteEndorserId,
  };

  sanctioningRecord.endorsements ??= [];

  // Replace existing endorsement for this endorserId, or append
  const existingIdx = sanctioningRecord.endorsements.findIndex((e) => e.endorserId === endorserId);
  if (existingIdx >= 0) {
    sanctioningRecord.endorsements[existingIdx] = newEndorsement;
  } else {
    sanctioningRecord.endorsements.push(newEndorsement);
  }

  syncEndorsement(sanctioningRecord);
  sanctioningRecord.updatedAt = new Date().toISOString();
  sanctioningRecord.version += 1;

  return { ...SUCCESS };
}

// ---------------------------------------------------------------------------
// Endorse Application
// ---------------------------------------------------------------------------

type EndorseApplicationArgs = {
  sanctioningRecord: SanctioningRecord;
  endorserId?: string;
  endorserNotes?: string;
  conditions?: string[];
};

export function endorseApplication({ sanctioningRecord, endorserId, endorserNotes, conditions }: EndorseApplicationArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };

  const endorsement = findEndorsement(sanctioningRecord, endorserId);
  if (!endorsement) return { error: MISSING_ENDORSEMENT };

  endorsement.status = 'ENDORSED';
  endorsement.endorsedAt = new Date().toISOString();
  if (endorserNotes) endorsement.endorserNotes = endorserNotes;
  if (conditions) endorsement.conditions = conditions;

  syncEndorsement(sanctioningRecord);
  sanctioningRecord.updatedAt = new Date().toISOString();
  sanctioningRecord.version += 1;

  return { ...SUCCESS };
}

// ---------------------------------------------------------------------------
// Decline Endorsement
// ---------------------------------------------------------------------------

type DeclineEndorsementArgs = {
  sanctioningRecord: SanctioningRecord;
  endorserId?: string;
  declineReason?: string;
};

export function declineEndorsement({ sanctioningRecord, endorserId, declineReason }: DeclineEndorsementArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };

  const endorsement = findEndorsement(sanctioningRecord, endorserId);
  if (!endorsement) return { error: MISSING_ENDORSEMENT };

  endorsement.status = 'DECLINED';
  endorsement.declinedAt = new Date().toISOString();
  if (declineReason) endorsement.declineReason = declineReason;

  syncEndorsement(sanctioningRecord);
  sanctioningRecord.updatedAt = new Date().toISOString();
  sanctioningRecord.version += 1;

  return { ...SUCCESS };
}
