import type { Extension, TimeItem } from './tournamentTypes';
import type { DocumentReference } from './sanctioningTypes';

// ---------------------------------------------------------------------------
// Status & State Machine
// ---------------------------------------------------------------------------

export const CertificationStatusEnum = {
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  SUSPENDED: 'SUSPENDED',
  REVOKED: 'REVOKED',
  PENDING_RENEWAL: 'PENDING_RENEWAL',
} as const;

export type CertificationStatus = (typeof CertificationStatusEnum)[keyof typeof CertificationStatusEnum];

export const EvaluationStatusEnum = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  REVIEWED: 'REVIEWED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

export type EvaluationStatus = (typeof EvaluationStatusEnum)[keyof typeof EvaluationStatusEnum];

export const AssignmentStatusEnum = {
  PROPOSED: 'PROPOSED',
  CONFIRMED: 'CONFIRMED',
  DECLINED: 'DECLINED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
} as const;

export type AssignmentStatus = (typeof AssignmentStatusEnum)[keyof typeof AssignmentStatusEnum];

export const OfficialRoleSubtypeEnum = {
  CHAIR_UMPIRE: 'CHAIR_UMPIRE',
  LINE_UMPIRE: 'LINE_UMPIRE',
  REFEREE: 'REFEREE',
  CHIEF_UMPIRE: 'CHIEF_UMPIRE',
  DEPUTY_REFEREE: 'DEPUTY_REFEREE',
  REVIEW_OFFICIAL: 'REVIEW_OFFICIAL',
  COURT_SUPERVISOR: 'COURT_SUPERVISOR',
} as const;

export type OfficialRoleSubtype = (typeof OfficialRoleSubtypeEnum)[keyof typeof OfficialRoleSubtypeEnum];

export const CertificationFamilyEnum = {
  UMPIRE: 'UMPIRE',
  REFEREE: 'REFEREE',
  CHIEF_UMPIRE: 'CHIEF_UMPIRE',
  REVIEW_OFFICIAL: 'REVIEW_OFFICIAL',
} as const;

export type CertificationFamily = (typeof CertificationFamilyEnum)[keyof typeof CertificationFamilyEnum];

export const CertificationLevelEnum = {
  WHITE_BADGE: 'WHITE_BADGE',
  BRONZE_BADGE: 'BRONZE_BADGE',
  SILVER_BADGE: 'SILVER_BADGE',
  GOLD_BADGE: 'GOLD_BADGE',
} as const;

export type CertificationLevel = (typeof CertificationLevelEnum)[keyof typeof CertificationLevelEnum];

export const ScoringTypeEnum = {
  NUMERIC: 'NUMERIC',
  SCALE: 'SCALE',
  CHECKLIST: 'CHECKLIST',
  TEXT: 'TEXT',
} as const;

export type ScoringType = (typeof ScoringTypeEnum)[keyof typeof ScoringTypeEnum];

export const ScoringMethodEnum = {
  WEIGHTED_AVERAGE: 'WEIGHTED_AVERAGE',
  SIMPLE_AVERAGE: 'SIMPLE_AVERAGE',
  SUM: 'SUM',
} as const;

export type ScoringMethod = (typeof ScoringMethodEnum)[keyof typeof ScoringMethodEnum];

// ---------------------------------------------------------------------------
// Status Transition (shared shape for all officiating workflows)
// ---------------------------------------------------------------------------

export interface OfficiatingStatusTransition {
  fromStatus: string;
  toStatus: string;
  transitionedAt: string;
  transitionedBy?: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Certification
// ---------------------------------------------------------------------------

export interface OfficialCertification {
  certificationId: string;
  personId: string;
  organisationId: string;
  certificationFamily: string;
  certificationLevel?: string;
  status: CertificationStatus;
  validFrom?: string;
  validUntil?: string;
  requirements?: CertificationRequirementResult[];
  documentReferences?: DocumentReference[];
  notes?: string;
  statusHistory?: OfficiatingStatusTransition[];
  extensions?: Extension[];
  timeItems?: TimeItem[];
}

export interface CertificationRequirementResult {
  requirementId: string;
  description?: string;
  met: boolean;
  metAt?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Certification Requirements (policy definitions)
// ---------------------------------------------------------------------------

export interface CertificationRequirement {
  requirementId: string;
  certificationFamily: string;
  certificationLevel: string;
  organisationId: string;
  description?: string;
  requirements: RequirementItem[];
  prerequisiteLevels?: string[];
  minimumAssignments?: number;
  minimumEvaluationScore?: number;
  validityPeriodMonths?: number;
  extensions?: Extension[];
}

export interface RequirementItem {
  itemId: string;
  description: string;
  required: boolean;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export interface OfficialEvaluation {
  evaluationId: string;
  evaluatorPersonId: string;
  subjectPersonId: string;
  tournamentId?: string;
  tournamentName?: string;
  matchUpId?: string;
  evaluationDate: string;
  overallRating: number;
  status: EvaluationStatus;
  policyName?: string;
  scores: EvaluationScore[];
  comments?: string;
  documentReference?: DocumentReference;
  statusHistory?: OfficiatingStatusTransition[];
  extensions?: Extension[];
  timeItems?: TimeItem[];
}

export interface EvaluationScore {
  criterionId: string;
  sectionId: string;
  value: number | boolean | string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Evaluation Policy (structured template definition)
// ---------------------------------------------------------------------------

export interface EvaluationPolicy {
  policyName: string;
  policyVersion: string;
  organisationId: string;
  officialRoleSubtype: string;
  sections: EvaluationSection[];
  scoringMethod: ScoringMethod;
  passingThreshold?: number;
  extensions?: Extension[];
}

export interface EvaluationSection {
  sectionId: string;
  sectionName: string;
  weight?: number;
  criteria: EvaluationCriterion[];
}

export interface EvaluationCriterion {
  criterionId: string;
  criterionName: string;
  description?: string;
  scoringType: ScoringType;
  scaleOptions?: ScaleOption[];
  numericRange?: { min: number; max: number };
  required: boolean;
  weight?: number;
}

export interface ScaleOption {
  value: number;
  label: string;
}

// ---------------------------------------------------------------------------
// Evaluation Form Field (derived from policy for UI rendering)
// ---------------------------------------------------------------------------

export interface EvaluationFormField {
  fieldId: string;
  sectionId: string;
  sectionName: string;
  criterionId: string;
  criterionName: string;
  description?: string;
  scoringType: ScoringType;
  scaleOptions?: ScaleOption[];
  numericRange?: { min: number; max: number };
  required: boolean;
  weight?: number;
  sectionWeight?: number;
}

// ---------------------------------------------------------------------------
// Official Assignment
// ---------------------------------------------------------------------------

export interface OfficialAssignment {
  assignmentId: string;
  personId: string;
  tournamentId: string;
  roleSubtype: string;
  status: AssignmentStatus;
  assignedDate: string;
  startDate?: string;
  endDate?: string;
  assignedBy?: string;
  notes?: string;
  statusHistory?: OfficiatingStatusTransition[];
  extensions?: Extension[];
  timeItems?: TimeItem[];
}

// ---------------------------------------------------------------------------
// Official Suspension
// ---------------------------------------------------------------------------

export interface OfficialSuspension {
  suspensionId: string;
  personId: string;
  organisationId?: string;
  suspensionType?: string;
  suspensionNotes?: string;
  suspendedFrom?: string;
  suspendedUntil?: string;
  extensions?: Extension[];
}

// ---------------------------------------------------------------------------
// Official Record (top-level aggregate)
// ---------------------------------------------------------------------------

export interface OfficialRecord {
  officialRecordId: string;
  personId: string;
  organisationId?: string;
  certifications: OfficialCertification[];
  evaluations: OfficialEvaluation[];
  assignments: OfficialAssignment[];
  suspensions: OfficialSuspension[];
  certificationRequirements: CertificationRequirement[];
  evaluationPolicies: EvaluationPolicy[];
  createdAt: string;
  updatedAt: string;
  extensions?: Extension[];
  timeItems?: TimeItem[];
}

// ---------------------------------------------------------------------------
// Engine Types
// ---------------------------------------------------------------------------

export type OfficialRecords = {
  [officialRecordId: string]: OfficialRecord;
};

export type OfficiatingDirective = {
  pipe?: { [key: string]: boolean };
  params?: { [key: string]: any };
  method: string;
};

export type OfficiatingDirectives = OfficiatingDirective[];
