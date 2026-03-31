import type { SanctioningStatus } from '@Types/sanctioningTypes';
import type { ErrorType } from './errorConditionConstants';

// ---------------------------------------------------------------------------
// Status Constants
// ---------------------------------------------------------------------------

export const DRAFT = 'DRAFT';
export const SUBMITTED = 'SUBMITTED';
export const UNDER_REVIEW = 'UNDER_REVIEW';
export const APPROVED = 'APPROVED';
export const CONDITIONALLY_APPROVED = 'CONDITIONALLY_APPROVED';
export const REJECTED = 'REJECTED';
export const WITHDRAWN = 'WITHDRAWN';
export const MODIFICATION_REQUESTED = 'MODIFICATION_REQUESTED';
export const ACTIVE = 'ACTIVE';
export const POST_EVENT = 'POST_EVENT';
export const CLOSED = 'CLOSED';
export const ISSUES_FLAGGED = 'ISSUES_FLAGGED';

// ---------------------------------------------------------------------------
// Valid Status Transitions
// ---------------------------------------------------------------------------

export const VALID_STATUS_TRANSITIONS: Record<SanctioningStatus, SanctioningStatus[]> = {
  DRAFT: [SUBMITTED, WITHDRAWN],
  SUBMITTED: [UNDER_REVIEW, WITHDRAWN],
  UNDER_REVIEW: [APPROVED, CONDITIONALLY_APPROVED, REJECTED, MODIFICATION_REQUESTED],
  APPROVED: [ACTIVE, MODIFICATION_REQUESTED, WITHDRAWN],
  CONDITIONALLY_APPROVED: [APPROVED, REJECTED, WITHDRAWN],
  REJECTED: [],
  WITHDRAWN: [],
  MODIFICATION_REQUESTED: [SUBMITTED, WITHDRAWN],
  ACTIVE: [POST_EVENT],
  POST_EVENT: [CLOSED, ISSUES_FLAGGED],
  CLOSED: [],
  ISSUES_FLAGGED: [CLOSED],
};

// Terminal states — no further transitions allowed
export const TERMINAL_STATUSES: SanctioningStatus[] = [REJECTED, WITHDRAWN, CLOSED];

// States that represent an editable proposal
export const EDITABLE_STATUSES: SanctioningStatus[] = [DRAFT, MODIFICATION_REQUESTED];

// States where amendments can be proposed (post-approval)
export const AMENDABLE_STATUSES: SanctioningStatus[] = [APPROVED, ACTIVE];

// ---------------------------------------------------------------------------
// Error Constants
// ---------------------------------------------------------------------------

export const MISSING_SANCTIONING_RECORD: ErrorType = {
  message: 'Missing sanctioningRecord',
  code: 'ERR_MISSING_SANCTIONING_RECORD',
};

export const INVALID_SANCTIONING_RECORD: ErrorType = {
  message: 'Invalid sanctioningRecord',
  code: 'ERR_INVALID_SANCTIONING_RECORD',
};

export const SANCTIONING_RECORD_NOT_FOUND: ErrorType = {
  message: 'SanctioningRecord not found',
  code: 'ERR_NOT_FOUND_SANCTIONING_RECORD',
};

export const SANCTIONING_RECORD_EXISTS: ErrorType = {
  message: 'SanctioningRecord already exists',
  code: 'ERR_EXISTING_SANCTIONING_RECORD',
};

export const MISSING_SANCTIONING_ID: ErrorType = {
  message: 'Missing sanctioningId',
  code: 'ERR_MISSING_SANCTIONING_ID',
};

export const INVALID_STATUS_TRANSITION: ErrorType = {
  message: 'Invalid status transition',
  code: 'ERR_INVALID_STATUS_TRANSITION',
};

export const MISSING_PROPOSAL: ErrorType = {
  message: 'Missing proposal',
  code: 'ERR_MISSING_PROPOSAL',
};

export const INVALID_PROPOSAL: ErrorType = {
  message: 'Invalid proposal',
  code: 'ERR_INVALID_PROPOSAL',
};

export const MISSING_EVENT_PROPOSAL: ErrorType = {
  message: 'Missing event proposal',
  code: 'ERR_MISSING_EVENT_PROPOSAL',
};

export const EVENT_PROPOSAL_NOT_FOUND: ErrorType = {
  message: 'Event proposal not found',
  code: 'ERR_NOT_FOUND_EVENT_PROPOSAL',
};

export const PROPOSAL_NOT_EDITABLE: ErrorType = {
  message: 'Proposal is not editable in current status',
  code: 'ERR_PROPOSAL_NOT_EDITABLE',
};

export const ENDORSEMENT_REQUIRED: ErrorType = {
  message: 'Endorsement is required before submission',
  code: 'ERR_ENDORSEMENT_REQUIRED',
};

export const MISSING_ENDORSEMENT: ErrorType = {
  message: 'Missing endorsement',
  code: 'ERR_MISSING_ENDORSEMENT',
};

export const MISSING_SANCTIONING_POLICY: ErrorType = {
  message: 'Missing sanctioning policy',
  code: 'ERR_MISSING_SANCTIONING_POLICY',
};

export const CONDITION_NOT_FOUND: ErrorType = {
  message: 'Condition not found',
  code: 'ERR_NOT_FOUND_CONDITION',
};

export const AMENDMENT_NOT_FOUND: ErrorType = {
  message: 'Amendment not found',
  code: 'ERR_NOT_FOUND_AMENDMENT',
};

export const AMENDMENT_NOT_ALLOWED: ErrorType = {
  message: 'Amendments not allowed in current status',
  code: 'ERR_AMENDMENT_NOT_ALLOWED',
};

export const CHANGE_WINDOW_CLOSED: ErrorType = {
  message: 'Change window has closed; modifications not permitted',
  code: 'ERR_CHANGE_WINDOW_CLOSED',
};

export const COMPLIANCE_NOT_APPLICABLE: ErrorType = {
  message: 'Compliance tracking not applicable in current status',
  code: 'ERR_COMPLIANCE_NOT_APPLICABLE',
};

export const OUTSTANDING_COMPLIANCE: ErrorType = {
  message: 'Outstanding compliance items from prior sanctioning must be resolved',
  code: 'ERR_OUTSTANDING_COMPLIANCE',
};

// ---------------------------------------------------------------------------
// Notification Topics
// ---------------------------------------------------------------------------

export const SANCTIONING_CREATED = 'sanctioningCreated';
export const SANCTIONING_UPDATED = 'sanctioningUpdated';
export const SANCTIONING_STATUS_CHANGE = 'sanctioningStatusChange';
export const SANCTIONING_SUBMITTED = 'sanctioningSubmitted';
export const SANCTIONING_APPROVED = 'sanctioningApproved';
export const SANCTIONING_REJECTED = 'sanctioningRejected';
export const SANCTIONING_ACTIVATED = 'sanctioningActivated';

// ---------------------------------------------------------------------------
// Aggregate Export
// ---------------------------------------------------------------------------

export const sanctioningConstants = {
  DRAFT,
  SUBMITTED,
  UNDER_REVIEW,
  APPROVED,
  CONDITIONALLY_APPROVED,
  REJECTED,
  WITHDRAWN,
  MODIFICATION_REQUESTED,
  ACTIVE,
  POST_EVENT,
  CLOSED,
  ISSUES_FLAGGED,
  VALID_STATUS_TRANSITIONS,
  TERMINAL_STATUSES,
  EDITABLE_STATUSES,
  AMENDABLE_STATUSES,
} as const;
