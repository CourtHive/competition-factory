import type { CertificationStatus, EvaluationStatus, AssignmentStatus } from '@Types/officiatingTypes';
import type { ErrorType } from './errorConditionConstants';

// ---------------------------------------------------------------------------
// Certification Status Constants
// ---------------------------------------------------------------------------

export const CERT_ACTIVE = 'ACTIVE';
export const CERT_EXPIRED = 'EXPIRED';
export const CERT_SUSPENDED = 'SUSPENDED';
export const CERT_REVOKED = 'REVOKED';
export const CERT_PENDING_RENEWAL = 'PENDING_RENEWAL';

// ---------------------------------------------------------------------------
// Evaluation Status Constants
// ---------------------------------------------------------------------------

export const EVAL_DRAFT = 'DRAFT';
export const EVAL_SUBMITTED = 'SUBMITTED';
export const EVAL_REVIEWED = 'REVIEWED';
export const EVAL_APPROVED = 'APPROVED';
export const EVAL_REJECTED = 'REJECTED';

// ---------------------------------------------------------------------------
// Assignment Status Constants
// ---------------------------------------------------------------------------

export const ASSIGN_PROPOSED = 'PROPOSED';
export const ASSIGN_CONFIRMED = 'CONFIRMED';
export const ASSIGN_DECLINED = 'DECLINED';
export const ASSIGN_CANCELLED = 'CANCELLED';
export const ASSIGN_COMPLETED = 'COMPLETED';

// ---------------------------------------------------------------------------
// Valid Status Transitions
// ---------------------------------------------------------------------------

export const VALID_CERTIFICATION_TRANSITIONS: Record<CertificationStatus, CertificationStatus[]> = {
  ACTIVE: [CERT_EXPIRED, CERT_SUSPENDED, CERT_REVOKED, CERT_PENDING_RENEWAL],
  EXPIRED: [CERT_ACTIVE, CERT_PENDING_RENEWAL],
  SUSPENDED: [CERT_ACTIVE, CERT_REVOKED],
  REVOKED: [],
  PENDING_RENEWAL: [CERT_ACTIVE, CERT_EXPIRED],
};

export const VALID_EVALUATION_TRANSITIONS: Record<EvaluationStatus, EvaluationStatus[]> = {
  DRAFT: [EVAL_SUBMITTED],
  SUBMITTED: [EVAL_REVIEWED, EVAL_REJECTED],
  REVIEWED: [EVAL_APPROVED, EVAL_REJECTED],
  APPROVED: [],
  REJECTED: [EVAL_DRAFT],
};

export const VALID_ASSIGNMENT_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  PROPOSED: [ASSIGN_CONFIRMED, ASSIGN_DECLINED, ASSIGN_CANCELLED],
  CONFIRMED: [ASSIGN_CANCELLED, ASSIGN_COMPLETED],
  DECLINED: [],
  CANCELLED: [],
  COMPLETED: [],
};

// Terminal states
export const CERTIFICATION_TERMINAL: CertificationStatus[] = [CERT_REVOKED];
export const EVALUATION_TERMINAL: EvaluationStatus[] = [EVAL_APPROVED];
export const ASSIGNMENT_TERMINAL: AssignmentStatus[] = [ASSIGN_DECLINED, ASSIGN_CANCELLED, ASSIGN_COMPLETED];

// Editable states
export const EVALUATION_EDITABLE: EvaluationStatus[] = [EVAL_DRAFT, EVAL_REJECTED];

// ---------------------------------------------------------------------------
// Evaluation Scale Options
// ---------------------------------------------------------------------------

export const EVALUATION_SCALE_OPTIONS = [
  { value: 1, label: 'Unsatisfactory' },
  { value: 2, label: 'Below Average' },
  { value: 3, label: 'Average' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Excellent' },
] as const;

// ---------------------------------------------------------------------------
// Error Constants
// ---------------------------------------------------------------------------

export const MISSING_OFFICIAL_RECORD: ErrorType = {
  message: 'Missing officialRecord',
  code: 'ERR_MISSING_OFFICIAL_RECORD',
};

export const OFFICIAL_RECORD_NOT_FOUND: ErrorType = {
  message: 'OfficialRecord not found',
  code: 'ERR_NOT_FOUND_OFFICIAL_RECORD',
};

export const OFFICIAL_RECORD_EXISTS: ErrorType = {
  message: 'OfficialRecord already exists',
  code: 'ERR_EXISTING_OFFICIAL_RECORD',
};

export const MISSING_OFFICIAL_RECORD_ID: ErrorType = {
  message: 'Missing officialRecordId',
  code: 'ERR_MISSING_OFFICIAL_RECORD_ID',
};

export const CERTIFICATION_NOT_FOUND: ErrorType = {
  message: 'Certification not found',
  code: 'ERR_NOT_FOUND_CERTIFICATION',
};

export const CERTIFICATION_EXPIRED: ErrorType = {
  message: 'Certification has expired',
  code: 'ERR_CERTIFICATION_EXPIRED',
};

export const EVALUATION_NOT_FOUND: ErrorType = {
  message: 'Evaluation not found',
  code: 'ERR_NOT_FOUND_EVALUATION',
};

export const EVALUATION_NOT_EDITABLE: ErrorType = {
  message: 'Evaluation is not editable in current status',
  code: 'ERR_EVALUATION_NOT_EDITABLE',
};

export const ASSIGNMENT_NOT_FOUND: ErrorType = {
  message: 'Assignment not found',
  code: 'ERR_NOT_FOUND_ASSIGNMENT',
};

export const OFFICIAL_NOT_ELIGIBLE: ErrorType = {
  message: 'Official does not meet eligibility requirements',
  code: 'ERR_OFFICIAL_NOT_ELIGIBLE',
};

export const INVALID_EVALUATION_SCORES: ErrorType = {
  message: 'Evaluation scores do not satisfy policy requirements',
  code: 'ERR_INVALID_EVALUATION_SCORES',
};

export const INVALID_OFFICIATING_STATUS_TRANSITION: ErrorType = {
  message: 'Invalid status transition',
  code: 'ERR_INVALID_OFFICIATING_STATUS_TRANSITION',
};

export const SUSPENSION_NOT_FOUND: ErrorType = {
  message: 'Suspension not found',
  code: 'ERR_NOT_FOUND_SUSPENSION',
};

export const CERTIFICATION_REQUIREMENT_NOT_FOUND: ErrorType = {
  message: 'Certification requirement not found',
  code: 'ERR_NOT_FOUND_CERTIFICATION_REQUIREMENT',
};

export const MISSING_EVALUATION_POLICY: ErrorType = {
  message: 'Missing evaluation policy',
  code: 'ERR_MISSING_EVALUATION_POLICY',
};

// ---------------------------------------------------------------------------
// Notification Topics
// ---------------------------------------------------------------------------

export const CERTIFICATION_ADDED = 'certificationAdded';
export const CERTIFICATION_MODIFIED = 'certificationModified';
export const CERTIFICATION_REMOVED = 'certificationRemoved';
export const EVALUATION_ADDED = 'evaluationAdded';
export const EVALUATION_STATUS_CHANGE = 'evaluationStatusChange';
export const OFFICIAL_ASSIGNED = 'officialAssigned';
export const ASSIGNMENT_STATUS_CHANGE = 'assignmentStatusChange';

// ---------------------------------------------------------------------------
// Aggregate Export
// ---------------------------------------------------------------------------

export const officiatingConstants = {
  CERT_ACTIVE,
  CERT_EXPIRED,
  CERT_SUSPENDED,
  CERT_REVOKED,
  CERT_PENDING_RENEWAL,
  EVAL_DRAFT,
  EVAL_SUBMITTED,
  EVAL_REVIEWED,
  EVAL_APPROVED,
  EVAL_REJECTED,
  ASSIGN_PROPOSED,
  ASSIGN_CONFIRMED,
  ASSIGN_DECLINED,
  ASSIGN_CANCELLED,
  ASSIGN_COMPLETED,
  VALID_CERTIFICATION_TRANSITIONS,
  VALID_EVALUATION_TRANSITIONS,
  VALID_ASSIGNMENT_TRANSITIONS,
  CERTIFICATION_TERMINAL,
  EVALUATION_TERMINAL,
  ASSIGNMENT_TERMINAL,
  EVALUATION_EDITABLE,
  EVALUATION_SCALE_OPTIONS,
} as const;
