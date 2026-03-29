import type {
  Category,
  CountryCodeUnion,
  DisciplineUnion,
  DrawTypeUnion,
  EventTypeUnion,
  Extension,
  GenderUnion,
  IndoorOutdoorUnion,
  Organisation,
  PrizeMoney,
  RegistrationProfile,
  SurfaceCategoryUnion,
  TieFormat,
  TimeItem,
  TournamentLevelUnion,
  WheelchairClassUnion,
} from './tournamentTypes';

// ---------------------------------------------------------------------------
// Status & State Machine
// ---------------------------------------------------------------------------

export const SanctioningStatusEnum = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  CONDITIONALLY_APPROVED: 'CONDITIONALLY_APPROVED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
  MODIFICATION_REQUESTED: 'MODIFICATION_REQUESTED',
  ACTIVE: 'ACTIVE',
  POST_EVENT: 'POST_EVENT',
  CLOSED: 'CLOSED',
  ISSUES_FLAGGED: 'ISSUES_FLAGGED',
} as const;

export type SanctioningStatus = (typeof SanctioningStatusEnum)[keyof typeof SanctioningStatusEnum];

export const EndorsementStatusEnum = {
  PENDING: 'PENDING',
  ENDORSED: 'ENDORSED',
  DECLINED: 'DECLINED',
  NOT_REQUIRED: 'NOT_REQUIRED',
} as const;

export type EndorsementStatus = (typeof EndorsementStatusEnum)[keyof typeof EndorsementStatusEnum];

export const AmendmentStatusEnum = {
  PROPOSED: 'PROPOSED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

export type AmendmentStatus = (typeof AmendmentStatusEnum)[keyof typeof AmendmentStatusEnum];

export const ComplianceStatusEnum = {
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLIANT: 'COMPLIANT',
  ISSUES_FLAGGED: 'ISSUES_FLAGGED',
} as const;

export type ComplianceStatus = (typeof ComplianceStatusEnum)[keyof typeof ComplianceStatusEnum];

export const ComplianceItemStatusEnum = {
  PENDING: 'PENDING',
  SUBMITTED: 'SUBMITTED',
  VERIFIED: 'VERIFIED',
  OVERDUE: 'OVERDUE',
  WAIVED: 'WAIVED',
} as const;

export type ComplianceItemStatus = (typeof ComplianceItemStatusEnum)[keyof typeof ComplianceItemStatusEnum];

export const SanctioningRelationshipEnum = {
  PRIMARY: 'PRIMARY',
  SECONDARY: 'SECONDARY',
  INDEPENDENT: 'INDEPENDENT',
} as const;

export type SanctioningRelationship =
  (typeof SanctioningRelationshipEnum)[keyof typeof SanctioningRelationshipEnum];

export const AmendmentSeverityEnum = {
  MINOR: 'MINOR',
  SUBSTANTIAL: 'SUBSTANTIAL',
} as const;

export type AmendmentSeverity = (typeof AmendmentSeverityEnum)[keyof typeof AmendmentSeverityEnum];

// ---------------------------------------------------------------------------
// Core Record
// ---------------------------------------------------------------------------

export interface SanctioningRecord {
  sanctioningId: string;
  status: SanctioningStatus;
  version: number;

  // Temporal
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  reviewedAt?: string;
  approvedAt?: string;

  // Who
  applicant: Applicant;
  endorsement?: Endorsement;        // convenience accessor — first endorsement (backward compat)
  endorsements?: Endorsement[];     // full multi-level endorsement chain
  reviewer?: Reviewer;

  // What
  proposal: TournamentProposal;

  // Governance
  governingBodyId: string;
  governingBody?: Organisation;
  sanctioningLevel?: string;

  // Provider (the operator/club that owns this application)
  applicantProviderId?: string;

  // Policy
  sanctioningPolicy?: string;
  policyVersion?: string;
  policySnapshot?: SanctioningPolicy;

  // Multi-organisation
  linkedSanctioningIds?: string[];
  parentSanctioningId?: string;
  sanctioningRelationship?: SanctioningRelationship;

  // Workflow
  conditions?: Condition[];
  reviewNotes?: ReviewNote[];
  amendments?: Amendment[];
  statusHistory?: StatusTransition[];

  // Post-event
  compliance?: ComplianceRecord;

  extensions?: Extension[];
  timeItems?: TimeItem[];
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export interface Applicant {
  organisationId?: string;
  organisationName?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  credentials?: Credential[];
  extensions?: Extension[];
}

export interface Credential {
  credentialType: string;
  credentialId?: string;
  issuedBy?: string;
  issuedDate?: string;
  expirationDate?: string;
  verified?: boolean;
}

export interface Endorsement {
  status: EndorsementStatus;
  endorserId?: string;
  endorserName?: string;
  endorsedAt?: string;
  declinedAt?: string;
  declineReason?: string;
  endorserNotes?: string;
  endorserContact?: PersonReference;
  conditions?: string[];
  endorsementLevel?: number;            // 1 = first required, 2 = second, etc.
  prerequisiteEndorserId?: string;      // must be endorsed before this one can proceed
  extensions?: Extension[];
}

export interface PersonReference {
  personName?: string;
  email?: string;
  phone?: string;
  role?: string;
  certificationLevel?: string;
}

export interface Reviewer {
  reviewerId?: string;
  reviewerName?: string;
  extensions?: Extension[];
}

// ---------------------------------------------------------------------------
// Tournament Proposal
// ---------------------------------------------------------------------------

export interface TournamentProposal {
  tournamentName: string;
  formalName?: string;
  promotionalName?: string;

  // Classification
  tournamentLevel?: TournamentLevelUnion;
  sanctioningTier?: string;
  discipline?: DisciplineUnion;

  // When & Where
  proposedStartDate: string;
  proposedEndDate: string;
  hostCountryCode?: CountryCodeUnion;
  venues?: VenueProposal[];
  indoorOutdoor?: IndoorOutdoorUnion;
  surfaceCategory?: SurfaceCategoryUnion;
  localTimeZone?: string;

  // Events
  events: EventProposal[];

  // Financial
  totalPrizeMoney?: PrizeMoney[];
  entryFees?: EntryFee[];
  sanctionFee?: PrizeMoney;

  // Personnel
  officials?: OfficialProposal[];
  tournamentDirector?: PersonReference;
  referee?: PersonReference;

  // Compliance
  insuranceCertificate?: DocumentReference;
  safetyPlan?: DocumentReference;
  medicalPlan?: DocumentReference;
  antiCorruptionCompliance?: boolean;
  safeguardingCompliance?: boolean;

  // Registration
  registrationProfile?: RegistrationProfile;

  // Calendar
  calendarSection?: string;
  calendarConflictCheck?: boolean;

  extensions?: Extension[];
}

export interface EventProposal {
  eventProposalId?: string;
  eventName: string;
  eventType: EventTypeUnion;
  gender?: GenderUnion;
  category?: Category;

  // Draw constraints
  drawType?: DrawTypeUnion;
  allowedDrawTypes?: DrawTypeUnion[];
  drawSize?: number;
  qualifyingDrawSize?: number;

  // Format
  matchUpFormat?: string;
  allowedMatchUpFormats?: string[];
  tieFormat?: TieFormat;

  // Surface / conditions
  indoorOutdoor?: IndoorOutdoorUnion;
  surfaceCategory?: SurfaceCategoryUnion;

  // Financial
  prizeMoney?: PrizeMoney[];

  // Wheelchair
  wheelchairClass?: WheelchairClassUnion;

  extensions?: Extension[];
}

export interface VenueProposal {
  venueName: string;
  venueId?: string;
  address?: string;
  city?: string;
  state?: string;
  countryCode?: CountryCodeUnion;
  numberOfCourts?: number;
  surfaceCategory?: SurfaceCategoryUnion;
  indoorOutdoor?: IndoorOutdoorUnion;
  coordinates?: Coordinates;
  extensions?: Extension[];
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface EntryFee {
  amount: number;
  currencyCode: string;
  eventType?: EventTypeUnion;
  category?: string;
  extensions?: Extension[];
}

export interface OfficialProposal {
  role: string;
  personName?: string;
  certificationLevel?: string;
  certificationBody?: string;
  extensions?: Extension[];
}

export interface DocumentReference {
  documentType: string;
  documentId?: string;
  documentUrl?: string;
  uploadedAt?: string;
  verified?: boolean;
  extensions?: Extension[];
}

// ---------------------------------------------------------------------------
// Workflow Objects
// ---------------------------------------------------------------------------

export interface Condition {
  conditionId: string;
  description: string;
  met: boolean;
  metAt?: string;
  metNotes?: string;
  createdAt?: string;
  extensions?: Extension[];
}

export interface ReviewNote {
  noteId: string;
  reviewerId?: string;
  reviewerName?: string;
  note: string;
  createdAt: string;
  extensions?: Extension[];
}

export interface StatusTransition {
  fromStatus: SanctioningStatus;
  toStatus: SanctioningStatus;
  transitionedAt: string;
  transitionedBy?: string;
  reason?: string;
}

export interface Amendment {
  amendmentId: string;
  status: AmendmentStatus;
  proposedAt: string;
  resolvedAt?: string;
  proposedBy?: string;
  reviewerNotes?: string;
  changes: ProposalChange[];
  severity: AmendmentSeverity;
  withinTimeline: boolean;
  extensions?: Extension[];
}

export interface ProposalChange {
  field: string;
  previousValue: any;
  proposedValue: any;
  changeType: 'MODIFIED' | 'ADDED' | 'REMOVED';
}

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

export interface ComplianceRecord {
  status: ComplianceStatus;
  items: ComplianceItem[];
  notes?: ReviewNote[];
  completedAt?: string;
}

export const ComplianceItemTypeEnum = {
  RESULTS_SUBMISSION: 'RESULTS_SUBMISSION',
  FINANCIAL_RECONCILIATION: 'FINANCIAL_RECONCILIATION',
  INCIDENT_REPORT: 'INCIDENT_REPORT',
  PRIZE_MONEY_CONFIRMATION: 'PRIZE_MONEY_CONFIRMATION',
  SANCTION_FEE_PAYMENT: 'SANCTION_FEE_PAYMENT',
  SUPERVISOR_REPORT: 'SUPERVISOR_REPORT',
  FACILITY_REPORT: 'FACILITY_REPORT',
  SAFEGUARDING_REPORT: 'SAFEGUARDING_REPORT',
  CUSTOM: 'CUSTOM',
} as const;

export type ComplianceItemType = (typeof ComplianceItemTypeEnum)[keyof typeof ComplianceItemTypeEnum];

export interface ComplianceItem {
  itemId: string;
  itemType: ComplianceItemType;
  description: string;
  required: boolean;
  status: ComplianceItemStatus;
  deadline?: string;
  submittedAt?: string;
  verifiedAt?: string;
  value?: any;
  extensions?: Extension[];
}

// ---------------------------------------------------------------------------
// Sanctioning Policy
// ---------------------------------------------------------------------------

export interface SanctioningPolicy {
  policyName: string;
  policyVersion: string;
  effectiveDate: string;
  supersededDate?: string;
  governingBodyId: string;

  tiers: SanctioningTier[];

  calendarRules?: CalendarRules;
  personnelRules?: PersonnelRules;
  amendmentRules?: AmendmentRules;
  postEventRequirements?: PostEventRequirement[];
  transitionGuards?: TransitionGuard[];

  requireEndorsement?: boolean;
  requiredEndorsementCount?: number;     // default 1 when requireEndorsement is true
  requireInsurance?: boolean;
  requireSafetyPlan?: boolean;
  requireMedicalPlan?: boolean;
  requireAntiCorruption?: boolean;
  requireSafeguarding?: boolean;

  minimumLeadWeeks?: number;
  resultsDeadlineDays?: number;
  requirePostEventReport?: boolean;

  extensions?: Extension[];
}

export interface SanctioningTier {
  tierName: string;
  tierLevel: number;

  allowedEventTypes?: EventTypeUnion[];
  allowedCategories?: Category[];
  allowedGenders?: GenderUnion[];
  allowedDisciplines?: DisciplineUnion[];

  allowedDrawTypes?: DrawTypeUnion[];
  allowedDrawSizes?: number[];
  maxQualifyingDrawSize?: number;
  qualifyingAllowed?: boolean;

  allowedMatchUpFormats?: string[];

  minimumPrizeMoney?: number;
  maximumPrizeMoney?: number;
  currencyCode?: string;
  sanctionFeePercent?: number;
  sanctionFeeFixed?: number;

  minimumCourts?: number;
  requireBackdrops?: boolean;
  requireScoreboards?: boolean;

  minimumOfficials?: number;
  officialCertificationLevel?: string;
  tdRefereeSameAllowed?: boolean;

  minimumParticipants?: number;

  rankingPointsProfile?: string;

  prerequisiteTiers?: string[];
  prerequisiteEventCount?: number;

  minimumLeadWeeks?: number;

  extensions?: Extension[];
}

export interface CalendarRules {
  proximityRadiusKm?: number;
  proximityWeeks?: number;
  blackoutDates?: string[];
  mandatoryWeeks?: string[];
  maxEventsPerWeek?: number;
  calendarSections?: CalendarSection[];
}

export interface CalendarSection {
  sectionId: string;
  sectionName: string;
  countryCodes?: CountryCodeUnion[];
  regionCodes?: string[];
}

export interface CalendarEvent {
  sanctioningId?: string;
  tournamentId?: string;
  tournamentName?: string;
  startDate: string;
  endDate: string;
  sanctioningTier?: string;
  calendarSection?: string;
  countryCode?: CountryCodeUnion;
  coordinates?: Coordinates;
}

export interface CalendarContext {
  existingEvents: CalendarEvent[];
  calendarRules: CalendarRules;
}

export interface PersonnelRules {
  roles: PersonnelRole[];
}

export interface PersonnelRole {
  roleName: string;
  required: boolean;
  minimumCount?: number;
  certificationRequired?: string;
  safeguardingRequired?: boolean;
}

export interface AmendmentRules {
  substantialChangeFields?: string[];
  noChangeWindowWeeks?: number;
  substantialChangeWindowWeeks?: number;
  prizeMoneyIncrease?: 'ALLOWED' | 'REQUIRES_REVIEW' | 'PROHIBITED';
  prizeMoneyDecrease?: 'ALLOWED' | 'REQUIRES_REVIEW' | 'PROHIBITED';
  lateChangePenalty?: boolean;
}

export interface PostEventRequirement {
  itemType: ComplianceItemType;
  description: string;
  required: boolean;
  deadlineDays: number;
  tiers?: string[];
}

export type TransitionGuardType =
  | 'ENDORSEMENT_REQUIRED'
  | 'PROPOSAL_VALID'
  | 'ALL_CONDITIONS_MET'
  | 'COMPLIANCE_COMPLETE'
  | 'CUSTOM';

export interface TransitionGuard {
  from: SanctioningStatus;
  to: SanctioningStatus;
  guard: TransitionGuardType;
  customGuardField?: string;         // dot-path field that must be truthy (for CUSTOM guard)
  message?: string;                  // error message when guard fails
  tiers?: string[];                  // only apply to specific tiers
}

// ---------------------------------------------------------------------------
// Engine Types
// ---------------------------------------------------------------------------

export type SanctioningRecords = {
  [sanctioningId: string]: SanctioningRecord;
};

export type SanctioningDirective = {
  pipe?: { [key: string]: boolean };
  params?: { [key: string]: any };
  method: string;
};

export type SanctioningDirectives = SanctioningDirective[];
