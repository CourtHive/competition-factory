import { transitionStatus } from './transitionStatus';

// Constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  MISSING_SANCTIONING_RECORD,
  COMPLIANCE_NOT_APPLICABLE,
  POST_EVENT,
  CLOSED,
  ISSUES_FLAGGED,
} from '@Constants/sanctioningConstants';

// Types
import type { SanctioningRecord } from '@Types/sanctioningTypes';

const MISSING_ITEM_ID = 'Missing itemId';

// ---------------------------------------------------------------------------
// Transition to POST_EVENT
// ---------------------------------------------------------------------------

type TransitionToPostEventArgs = {
  sanctioningRecord: SanctioningRecord;
  transitionedBy?: string;
};

export function transitionToPostEvent({ sanctioningRecord, transitionedBy }: TransitionToPostEventArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };

  return transitionStatus({
    sanctioningRecord,
    toStatus: POST_EVENT,
    transitionedBy,
    reason: 'Tournament completed; entering post-event compliance phase',
  });
}

// ---------------------------------------------------------------------------
// Submit Compliance Item
// ---------------------------------------------------------------------------

type SubmitComplianceItemArgs = {
  sanctioningRecord: SanctioningRecord;
  itemId: string;
  value?: any;
};

export function submitComplianceItem({ sanctioningRecord, itemId, value }: SubmitComplianceItemArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };
  if (!sanctioningRecord.compliance) return { error: COMPLIANCE_NOT_APPLICABLE };
  if (!itemId) return { error: INVALID_VALUES, context: { message: MISSING_ITEM_ID } };

  const item = sanctioningRecord.compliance.items.find((i) => i.itemId === itemId);
  if (!item) return { error: INVALID_VALUES, context: { message: `Item not found: ${itemId}` } };

  // Guard against backward transitions
  if (item.status === 'VERIFIED' || item.status === 'WAIVED') {
    return { error: INVALID_VALUES, context: { message: `Item already ${item.status}; cannot resubmit` } };
  }

  item.status = 'SUBMITTED';
  item.submittedAt = new Date().toISOString();
  if (value !== undefined) item.value = value;

  updateComplianceStatus(sanctioningRecord);
  sanctioningRecord.updatedAt = new Date().toISOString();
  sanctioningRecord.version += 1;

  return { ...SUCCESS };
}

// ---------------------------------------------------------------------------
// Verify Compliance Item
// ---------------------------------------------------------------------------

type VerifyComplianceItemArgs = {
  sanctioningRecord: SanctioningRecord;
  itemId: string;
};

export function verifyComplianceItem({ sanctioningRecord, itemId }: VerifyComplianceItemArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };
  if (!sanctioningRecord.compliance) return { error: COMPLIANCE_NOT_APPLICABLE };
  if (!itemId) return { error: INVALID_VALUES, context: { message: MISSING_ITEM_ID } };

  const item = sanctioningRecord.compliance.items.find((i) => i.itemId === itemId);
  if (!item) return { error: INVALID_VALUES, context: { message: `Item not found: ${itemId}` } };

  item.status = 'VERIFIED';
  item.verifiedAt = new Date().toISOString();

  updateComplianceStatus(sanctioningRecord);
  sanctioningRecord.updatedAt = new Date().toISOString();
  sanctioningRecord.version += 1;

  const allVerified = sanctioningRecord.compliance.items
    .filter((i) => i.required)
    .every((i) => i.status === 'VERIFIED' || i.status === 'WAIVED');

  return { ...SUCCESS, allCompliant: allVerified };
}

// ---------------------------------------------------------------------------
// Waive Compliance Item
// ---------------------------------------------------------------------------

type WaiveComplianceItemArgs = {
  sanctioningRecord: SanctioningRecord;
  itemId: string;
  reason?: string;
};

export function waiveComplianceItem({ sanctioningRecord, itemId, reason }: WaiveComplianceItemArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };
  if (!sanctioningRecord.compliance) return { error: COMPLIANCE_NOT_APPLICABLE };
  if (!itemId) return { error: INVALID_VALUES, context: { message: MISSING_ITEM_ID } };

  const item = sanctioningRecord.compliance.items.find((i) => i.itemId === itemId);
  if (!item) return { error: INVALID_VALUES, context: { message: `Item not found: ${itemId}` } };

  item.status = 'WAIVED';
  if (reason) {
    item.extensions ??= [];
    item.extensions.push({ name: 'waiveReason', value: reason });
  }

  updateComplianceStatus(sanctioningRecord);
  sanctioningRecord.updatedAt = new Date().toISOString();
  sanctioningRecord.version += 1;

  return { ...SUCCESS };
}

// ---------------------------------------------------------------------------
// Flag Compliance Issues
// ---------------------------------------------------------------------------

type FlagComplianceIssuesArgs = {
  sanctioningRecord: SanctioningRecord;
  transitionedBy?: string;
  reason?: string;
};

export function flagComplianceIssues({ sanctioningRecord, transitionedBy, reason }: FlagComplianceIssuesArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };

  return transitionStatus({
    sanctioningRecord,
    toStatus: ISSUES_FLAGGED,
    transitionedBy,
    reason: reason ?? 'Compliance issues flagged',
  });
}

// ---------------------------------------------------------------------------
// Close Application
// ---------------------------------------------------------------------------

type CloseApplicationArgs = {
  sanctioningRecord: SanctioningRecord;
  closedBy?: string;
  reason?: string;
};

export function closeApplication({ sanctioningRecord, closedBy, reason }: CloseApplicationArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };

  const result = transitionStatus({
    sanctioningRecord,
    toStatus: CLOSED,
    transitionedBy: closedBy,
    reason: reason ?? 'Application closed',
  });
  if (result.error) return result;

  if (sanctioningRecord.compliance) {
    sanctioningRecord.compliance.status = 'COMPLIANT';
    sanctioningRecord.compliance.completedAt = sanctioningRecord.updatedAt;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Check Compliance Deadlines
// ---------------------------------------------------------------------------

type CheckComplianceDeadlinesArgs = {
  sanctioningRecord: SanctioningRecord;
  asOfDate?: string; // ISO date string; defaults to now
};

export function checkComplianceDeadlines({ sanctioningRecord, asOfDate }: CheckComplianceDeadlinesArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };
  if (!sanctioningRecord.compliance) return { error: COMPLIANCE_NOT_APPLICABLE };

  const now = asOfDate ? new Date(asOfDate) : new Date();
  let overdueCount = 0;

  for (const item of sanctioningRecord.compliance.items) {
    if (item.status === 'PENDING' && item.deadline) {
      const deadline = new Date(item.deadline);
      if (deadline < now) {
        item.status = 'OVERDUE';
        overdueCount++;
      }
    }
  }

  if (overdueCount > 0) {
    updateComplianceStatus(sanctioningRecord);
    sanctioningRecord.updatedAt = new Date().toISOString();
    sanctioningRecord.version += 1;
  }

  return { ...SUCCESS, overdueCount };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function updateComplianceStatus(record: SanctioningRecord) {
  if (!record.compliance) return;

  const items = record.compliance.items;
  const requiredItems = items.filter((i) => i.required);

  const allDone = requiredItems.every((i) => i.status === 'VERIFIED' || i.status === 'WAIVED');
  const anyOverdue = items.some((i) => i.status === 'OVERDUE');
  const anySubmitted = items.some((i) => i.status === 'SUBMITTED' || i.status === 'VERIFIED' || i.status === 'WAIVED');

  if (allDone) {
    record.compliance.status = 'COMPLIANT';
  } else if (anyOverdue) {
    record.compliance.status = 'ISSUES_FLAGGED';
  } else if (anySubmitted) {
    record.compliance.status = 'IN_PROGRESS';
  } else {
    record.compliance.status = 'PENDING';
  }
}
