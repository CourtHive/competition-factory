import { Extension, Participant, TimeItem } from './tournamentTypes';
import { DocumentReference } from './sanctioningTypes';

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

export const ConflictTypeEnum = {
  /** The official is themselves entered in the tournament. */
  SAME_PERSON: 'SAME_PERSON',
  /** The official has declared a relationship with an entered participant. */
  DECLARED_RELATIONSHIP: 'DECLARED_RELATIONSHIP',
  /** The official shares a nationality with an entered participant. */
  NATIONALITY: 'NATIONALITY',
  /** The official has declared an affiliation with an entered participant's organisation. */
  ORGANISATION: 'ORGANISATION',
  /**
   * The official shares a GROUP participant with an entered participant — a relationship expressed
   * inside the tournamentRecord rather than in an external registry. A GROUP containing a coach and
   * the players they coach IS the declaration, and it is scoped to the tournament where it applies.
   *
   * GROUP is a general grouping primitive (squads, attribute-derived groupings), so a bare shared
   * grouping is an inferred association, not a declared one — hence the default severity is WARN.
   * A GROUP carrying a `participantRole` is an explicitly-authored relationship and can be escalated
   * per-role via `ConflictRule.roleSeverity`.
   */
  SHARED_GROUPING: 'SHARED_GROUPING',
} as const;

export type ConflictType = (typeof ConflictTypeEnum)[keyof typeof ConflictTypeEnum];

/**
 * BLOCK refuses the assignment; WARN surfaces the conflict and allows an
 * authorized user to proceed. Which rule carries which severity is a policy
 * decision, not a factory one — federations disagree, most sharply on
 * NATIONALITY (disqualifying at ITF-level international events, unworkable at
 * national ones where every official shares the players' nationality).
 */
export const ConflictSeverityEnum = {
  BLOCK: 'BLOCK',
  WARN: 'WARN',
} as const;

export type ConflictSeverity = (typeof ConflictSeverityEnum)[keyof typeof ConflictSeverityEnum];

/**
 * A relationship the official has declared. Self-declaration is how federations
 * actually administer conflicts of interest — the factory cannot infer that an
 * official coaches a player, so the declaration is the record of it.
 */
export interface OfficialConflictDeclaration {
  declarationId: string;
  /** The related person. Matched against participants' `person.personId`. */
  personId?: string;
  /** A specific participant, when the relationship is to an entry rather than a person. */
  participantId?: string;
  /** An organisation (club, academy, school) the official is affiliated with. */
  organisationId?: string;
  /** Free-form nature of the relationship, e.g. 'FAMILY', 'COACH', 'ACADEMY'. */
  relationship?: string;
  declaredAt?: string;
  declaredBy?: string;
  notes?: string;
  extensions?: Extension[];
}

/** One detected conflict between an official and an entered participant. */
export interface OfficialConflict {
  conflictType: ConflictType;
  severity: ConflictSeverity;
  personId?: string;
  participantId?: string;
  participantName?: string;
  organisationId?: string;
  relationship?: string;
  nationalityCode?: string;
  declarationId?: string;
  /** SHARED_GROUPING only — the GROUP participant that links official and participant. */
  groupParticipantId?: string;
  groupName?: string;
  /** The GROUP's own `participantRole`, when it carries one. */
  groupRole?: string;
  reason: string;
}

/** Per-rule configuration within a conflict-of-interest policy. */
export interface ConflictRule {
  enabled: boolean;
  severity: ConflictSeverity;
  /**
   * SHARED_GROUPING only: severity override keyed by the GROUP participant's own `participantRole`.
   * A grouping with no role, or a role absent from this map, falls back to `severity`.
   *
   * This is what separates an explicitly-authored relationship group (`participantRole: 'COACH'`)
   * from an incidental one — e.g. `{ COACH: 'BLOCK' }` blocks coach groupings while other shared
   * groupings merely warn.
   */
  roleSeverity?: Record<string, ConflictSeverity>;
}

/**
 * The inputs that configure a conflict-of-interest evaluation.
 *
 * Every route able to evaluate conflicts accepts this set and forwards it WHOLE to
 * `getOfficialConflicts` via `conflictInputsFrom()`. Hand-listing the fields per route is what allowed
 * `assignOfficial` and `addMatchUpOfficial` to disagree about the same conflict. Add a new input here and
 * to `CONFLICT_INPUT_KEYS`; every route inherits it, and a conformance test proves they do.
 *
 * `participants` is intentionally excluded — it is route-specific (supplied by the caller on one route,
 * derived from the matchUp's sides on the other).
 */
export interface ConflictEvaluationInputs {
  policyDefinitions?: { [key: string]: any };
  /** Durable registry declarations (courthive-ams). */
  officialRecord?: OfficialRecord;
  /** The official's participantId in this tournament — enables SHARED_GROUPING. */
  officialParticipantId?: string;
  /** The tournament's GROUP participants — the tournament-scoped declaration source. */
  groupParticipants?: Participant[];
  /** The official's own nationality — required for the NATIONALITY rule. */
  nationalityCode?: string;
  /** Organisations the official is affiliated with, beyond any declared ones. */
  organisationIds?: string[];
}

export interface ConflictOfInterestPolicy {
  policyName?: string;
  conflictRules: Partial<Record<ConflictType, ConflictRule>>;
}

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
  /** Optional: absent on records created before conflict declarations existed. */
  conflictDeclarations?: OfficialConflictDeclaration[];
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
