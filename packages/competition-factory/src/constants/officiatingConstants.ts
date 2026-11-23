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
// Conflict of Interest
// ---------------------------------------------------------------------------

export const CONFLICT_SAME_PERSON = 'SAME_PERSON';
export const CONFLICT_DECLARED_RELATIONSHIP = 'DECLARED_RELATIONSHIP';
export const CONFLICT_NATIONALITY = 'NATIONALITY';
export const CONFLICT_ORGANISATION = 'ORGANISATION';
export const CONFLICT_SHARED_GROUPING = 'SHARED_GROUPING';

export const CONFLICT_BLOCK = 'BLOCK';
export const CONFLICT_WARN = 'WARN';

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

export const MISSING_OFFICIAL_RECORD = {
  message: 'Missing officialRecord',
  code: 'ERR_MISSING_OFFICIAL_RECORD' as const,
} satisfies ErrorType;

export const OFFICIAL_RECORD_NOT_FOUND = {
  message: 'OfficialRecord not found',
  code: 'ERR_NOT_FOUND_OFFICIAL_RECORD' as const,
} satisfies ErrorType;

export const OFFICIAL_RECORD_EXISTS = {
  message: 'OfficialRecord already exists',
  code: 'ERR_EXISTING_OFFICIAL_RECORD' as const,
} satisfies ErrorType;

export const MISSING_OFFICIAL_RECORD_ID = {
  message: 'Missing officialRecordId',
  code: 'ERR_MISSING_OFFICIAL_RECORD_ID' as const,
} satisfies ErrorType;

export const CERTIFICATION_NOT_FOUND = {
  message: 'Certification not found',
  code: 'ERR_NOT_FOUND_CERTIFICATION' as const,
} satisfies ErrorType;

export const CERTIFICATION_EXPIRED = {
  message: 'Certification has expired',
  code: 'ERR_CERTIFICATION_EXPIRED' as const,
} satisfies ErrorType;

export const EVALUATION_NOT_FOUND = {
  message: 'Evaluation not found',
  code: 'ERR_NOT_FOUND_EVALUATION' as const,
} satisfies ErrorType;

export const EVALUATION_NOT_EDITABLE = {
  message: 'Evaluation is not editable in current status',
  code: 'ERR_EVALUATION_NOT_EDITABLE' as const,
} satisfies ErrorType;

export const ASSIGNMENT_NOT_FOUND = {
  message: 'Assignment not found',
  code: 'ERR_NOT_FOUND_ASSIGNMENT' as const,
} satisfies ErrorType;

export const OFFICIAL_NOT_ELIGIBLE = {
  message: 'Official does not meet eligibility requirements',
  code: 'ERR_OFFICIAL_NOT_ELIGIBLE' as const,
} satisfies ErrorType;

export const INVALID_EVALUATION_SCORES = {
  message: 'Evaluation scores do not satisfy policy requirements',
  code: 'ERR_INVALID_EVALUATION_SCORES' as const,
} satisfies ErrorType;

export const INVALID_OFFICIATING_STATUS_TRANSITION = {
  message: 'Invalid status transition',
  code: 'ERR_INVALID_OFFICIATING_STATUS_TRANSITION' as const,
} satisfies ErrorType;

export const SUSPENSION_NOT_FOUND = {
  message: 'Suspension not found',
  code: 'ERR_NOT_FOUND_SUSPENSION' as const,
} satisfies ErrorType;

export const CERTIFICATION_REQUIREMENT_NOT_FOUND = {
  message: 'Certification requirement not found',
  code: 'ERR_NOT_FOUND_CERTIFICATION_REQUIREMENT' as const,
} satisfies ErrorType;

export const MISSING_EVALUATION_POLICY = {
  message: 'Missing evaluation policy',
  code: 'ERR_MISSING_EVALUATION_POLICY' as const,
} satisfies ErrorType;

export const CONFLICT_DECLARATION_NOT_FOUND = {
  message: 'Conflict declaration not found',
  code: 'ERR_NOT_FOUND_CONFLICT_DECLARATION' as const,
} satisfies ErrorType;

export const MISSING_CONFLICT_SOURCE = {
  message:
    'Missing conflict source — supply an officialRecord and/or the official participant plus tournament groupings',
  code: 'ERR_MISSING_CONFLICT_SOURCE' as const,
} satisfies ErrorType;

export const MISSING_CONFLICT_PARTICIPANTS = {
  message: 'Missing participants — a conflict-of-interest policy was supplied but there is nothing to check against',
  code: 'ERR_MISSING_CONFLICT_PARTICIPANTS' as const,
} satisfies ErrorType;

export const OFFICIAL_CONFLICT_OF_INTEREST = {
  message: 'Official has a blocking conflict of interest',
  code: 'ERR_OFFICIAL_CONFLICT_OF_INTEREST' as const,
} satisfies ErrorType;

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
  CONFLICT_SAME_PERSON,
  CONFLICT_DECLARED_RELATIONSHIP,
  CONFLICT_NATIONALITY,
  CONFLICT_ORGANISATION,
  CONFLICT_SHARED_GROUPING,
  CONFLICT_BLOCK,
  CONFLICT_WARN,
} as const;
