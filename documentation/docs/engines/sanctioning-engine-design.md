# Sanctioning Engine — Design & Implementation Plan

## 1. Overview

The Sanctioning Engine is a **state engine** that manages the lifecycle of a **sanctioning application** — the propositional object that defines what a tournament organizer intends to run, subject to approval by a governing body. The approved sanctioning object becomes the seed from which a `tournamentRecord` is generated, carrying forward all constraints (allowed categories, matchUpFormats, drawTypes, draw sizes, officials requirements, etc.) as enforceable policy.

The engine follows the same architectural pattern as the existing factory engines (sync/async/executionQueue), but instead of mutating a `tournamentRecord`, it mutates a **`SanctioningRecord`** — a purpose-built JSON document with its own schema, state machine, and validation rules.

---

## 2. Research Summary

### 2.1 Cross-Sport Sanctioning Patterns

Research across tennis (ITF, ATP, WTA, USTA, LTA, Tennis Australia, FFT), badminton (BWF), squash (PSA), table tennis (ITTF/WTT), pickleball (USA Pickleball), swimming (USA Swimming/USMS), athletics (USATF/World Athletics), disc golf (PDGA), and golf (PGA) reveals universal patterns:

**Universal application elements:**
1. Organizer identification and credentials (SafeSport, certifications)
2. Venue/facility details (court specs, capacity, safety)
3. Event classification/level (tier/category the event falls into)
4. Financial information (prize money, entry fees, sanction fees, insurance)
5. Calendar placement (dates, geographic conflict avoidance)
6. Officials plan (referee/umpire assignments, certification levels)
7. National federation endorsement (nearly universal intermediary requirement)
8. Safety and medical plans
9. Insurance coverage (naming governing body as additionally insured)

**Universal workflow states:**
```
DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED | CONDITIONALLY_APPROVED | REJECTED | WITHDRAWN
  APPROVED → MODIFICATION_REQUESTED → RE_APPROVED
  APPROVED → EVENT_CONDUCTED → POST_EVENT_REPORTING → COMPLIANCE_VERIFIED | ISSUES_FLAGGED
  CONDITIONALLY_APPROVED → CONDITIONS_MET → APPROVED
  REJECTED → (reapply at same or lower level)
```

**Key sanctioning constraints on tournament operations:**
- Minimum standards (draw sizes, prize money floors, court specs, medical)
- Personnel requirements (certified officials, licensed referees)
- Software mandates (approved tournament management systems)
- Results reporting deadlines (24h to 14 days depending on sport)
- Scheduling constraints (proximity rules, calendar exclusivity, mandatory events)
- Anti-corruption/integrity program compliance

**Sanctioning-to-ranking connection:**
- Tournament level directly determines ranking points table
- Points scale by draw size, round reached, and competition level
- Existing factory `AwardProfile` / `AwardProfileScope` already models this via `levels`, `drawSizes`, `stages`, `category`

### 2.2 Tennis-Specific Insights

**ITF sanctioning flow:**
1. Organizer contacts National Association
2. National Association endorses application
3. Application submitted to ITF (16-21 weeks before tournament week depending on level)
4. ITF reviews — grants, refuses, grants with conditions, or downgrades
5. Tournament appears on ITF calendar
6. Post-event: results reporting, financial reconciliation, compliance review

**Level-driven requirements (ITF example):**
| Level | Prize Money | Draw Size | Winner Points | Qualifying |
|-------|-----------|-----------|---------------|------------|
| M15/W15 | $15,000 | 32S/16Q | 15 | Max = main draw size |
| M25/W35 | $25,000/$35,000 | 32S/16Q | 35 | Not allowed if main ≤ 16 |
| W50 | $50,000 | 32S/16Q | 50 | Enhanced hospitality |
| W75 | $75,000 | 32S/16Q | 75 | Enhanced hospitality |
| W100 | $100,000 | 32S/16Q | 100 | Enhanced hospitality |

**USTA levels (1-7):**
- Level determines: minimum participants, facility requirements, official certifications, whether TD and Referee can be the same person
- Applications via "Serve Tennis" platform
- Primary deadline: September 30; late applications on bi-monthly basis

**Calendar coordination:**
- Centralized calendars prevent geographic/temporal conflicts
- Higher-tier events take priority
- Pipeline transparency lets applicants see pending applications

---

## 3. Architecture

### 3.1 Core Concept: SanctioningRecord

The `SanctioningRecord` is the central document. It is **not** a `tournamentRecord` — it is a **proposal** that, when approved, seeds the creation of a `tournamentRecord`. It accumulates data progressively through a multi-step workflow and carries validation state at each step.

```typescript
interface SanctioningRecord {
  sanctioningId: string;
  status: SanctioningStatus;
  version: number;                        // incremented on each mutation

  // Temporal
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  reviewedAt?: string;
  approvedAt?: string;

  // Who
  applicant: Applicant;                   // organizer/club/academy
  endorser?: Endorser;                    // national federation / regional body
  reviewer?: Reviewer;                    // governing body reviewer

  // What — the proposed tournament
  proposal: TournamentProposal;

  // Governance
  governingBodyId: string;                // which body sanctions this
  sanctioningLevel?: string;              // level applied for (maps to policy)
  sanctioningPolicy?: string;             // policy name to validate against

  // Workflow
  conditions?: Condition[];               // conditions for conditional approval
  reviewNotes?: ReviewNote[];             // reviewer feedback
  modifications?: Modification[];         // change history

  // Extensions for org-specific fields
  extensions?: Extension[];
  timeItems?: TimeItem[];
}
```

### 3.2 TournamentProposal

The proposal mirrors relevant `Tournament` and `Event` fields but is **propositional** — it describes intent, not operational state:

```typescript
interface TournamentProposal {
  // Identity
  tournamentName: string;
  formalName?: string;
  promotionalName?: string;

  // Classification
  tournamentLevel?: TournamentLevelUnion;  // existing enum: CLUB..INTERNATIONAL
  sanctioningTier?: string;               // org-specific tier (e.g., "W50", "Level 3", "Grade 4")
  discipline?: DisciplineUnion;           // TENNIS, BEACH_TENNIS, WHEELCHAIR_TENNIS

  // When & Where
  proposedStartDate: string;
  proposedEndDate: string;
  hostCountryCode?: CountryCodeUnion;
  venues?: VenueProposal[];
  indoorOutdoor?: IndoorOutdoorUnion;
  surfaceCategory?: SurfaceCategoryUnion;
  localTimeZone?: string;

  // Events — the core of what's being sanctioned
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
  registrationProfile?: RegistrationProfile;  // reuse existing type

  // Calendar
  calendarSection?: string;               // geographic region / section
  calendarConflictCheck?: boolean;         // request conflict analysis

  extensions?: Extension[];
}
```

### 3.3 EventProposal

```typescript
interface EventProposal {
  eventName: string;
  eventType: EventTypeUnion;              // SINGLES, DOUBLES, TEAM, HYBRID
  gender?: GenderUnion;
  category?: Category;                    // reuse existing Category type

  // Draw constraints
  drawType?: DrawTypeUnion;               // proposed draw structure
  allowedDrawTypes?: DrawTypeUnion[];      // or a set of allowed types
  drawSize?: number;                      // proposed main draw size
  qualifyingDrawSize?: number;

  // Format
  matchUpFormat?: string;                 // matchUpFormatCode
  allowedMatchUpFormats?: string[];        // or a set of allowed formats
  tieFormat?: TieFormat;

  // Surface / conditions (can differ from tournament-level)
  indoorOutdoor?: IndoorOutdoorUnion;
  surfaceCategory?: SurfaceCategoryUnion;

  // Financial
  prizeMoney?: PrizeMoney[];

  // Wheelchair
  wheelchairClass?: WheelchairClassUnion;

  extensions?: Extension[];
}
```

### 3.4 State Machine

```
                    ┌──────────┐
                    │  DRAFT   │
                    └────┬─────┘
                         │ submit()
                    ┌────▼─────┐
              ┌─────│SUBMITTED │─────┐
              │     └────┬─────┘     │
              │          │ review()  │ withdraw()
              │     ┌────▼─────┐     │
              │     │ UNDER    │     │
              │     │ REVIEW   │     │
              │     └──┬───┬───┘     │
              │   approve()│ │reject()│
              │        │   │   │     │
     ┌────────▼──┐  ┌──▼───▼┐ ┌▼─────▼───┐
     │CONDITIONALLY│ │APPROVED│ │REJECTED/ │
     │ APPROVED  │  │       │ │WITHDRAWN │
     └─────┬─────┘  └───┬───┘ └──────────┘
           │             │
    meetConditions()     │ requestModification()
           │        ┌────▼──────┐
           └───────►│MODIFICATION│
                    │ REQUESTED  │
                    └─────┬──────┘
                          │ resubmit()
                    ┌─────▼──────┐
                    │ UNDER      │
                    │ REVIEW     │──► (cycle back to approve/reject)
                    └────────────┘

  Post-approval (approved record only):
    APPROVED → ACTIVE (tournament created from sanctioning)
    ACTIVE → POST_EVENT (tournament completed, awaiting report)
    POST_EVENT → CLOSED (compliance verified)
    POST_EVENT → ISSUES_FLAGGED (compliance issues found)
```

```typescript
type SanctioningStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'CONDITIONALLY_APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'MODIFICATION_REQUESTED'
  | 'ACTIVE'                  // tournament created from this sanctioning
  | 'POST_EVENT'              // tournament completed, awaiting compliance
  | 'CLOSED'                  // fully resolved
  | 'ISSUES_FLAGGED';         // compliance problems detected
```

### 3.5 Sanctioning Policy

A new policy type `POLICY_TYPE_SANCTIONING` defines what a governing body requires at each sanctioning tier. This is the **rules engine** that validates proposals against requirements:

```typescript
interface SanctioningPolicy {
  policyName: string;
  governingBodyId: string;

  // Tier definitions — what tiers exist and their constraints
  tiers: SanctioningTier[];

  // Calendar rules
  calendarRules?: CalendarRules;

  // Personnel requirements
  personnelRules?: PersonnelRules;

  // Global constraints
  requireEndorsement?: boolean;           // must have national federation endorsement
  requireInsurance?: boolean;
  requireSafetyPlan?: boolean;
  requireMedicalPlan?: boolean;
  requireAntiCorruption?: boolean;
  requireSafeguarding?: boolean;

  // Application timing
  minimumLeadWeeks?: number;              // how far ahead must application be submitted

  // Post-event
  resultsDeadlineDays?: number;           // days after event to submit results
  requirePostEventReport?: boolean;
}

interface SanctioningTier {
  tierName: string;                       // e.g., "W50", "Level 3", "Grade 4", "B-Tier"
  tierLevel: number;                      // numeric ordering (higher = more prestigious)

  // What events can be in this tier
  allowedEventTypes?: EventTypeUnion[];
  allowedCategories?: Category[];         // age/rating restrictions
  allowedGenders?: GenderUnion[];
  allowedDisciplines?: DisciplineUnion[];

  // Draw constraints per tier
  allowedDrawTypes?: DrawTypeUnion[];
  allowedDrawSizes?: number[];            // e.g., [16, 32, 64, 128]
  maxQualifyingDrawSize?: number;         // relative to main draw
  qualifyingAllowed?: boolean;

  // Format constraints
  allowedMatchUpFormats?: string[];       // matchUpFormatCodes

  // Financial constraints
  minimumPrizeMoney?: number;
  maximumPrizeMoney?: number;
  currencyCode?: string;
  sanctionFeePercent?: number;            // BWF model: % of prize fund
  sanctionFeeFixed?: number;              // fixed fee model

  // Facility constraints
  minimumCourts?: number;
  requireBackdrops?: boolean;
  requireScoreboards?: boolean;

  // Personnel
  minimumOfficials?: number;
  officialCertificationLevel?: string;
  tdRefereeSameAllowed?: boolean;         // USTA: not allowed at Level 5+

  // Participant minimums
  minimumParticipants?: number;           // USTA: varies by level

  // Ranking points (links to existing AwardProfile system)
  rankingPointsProfile?: string;          // reference to AwardProfile name

  // Progression requirements (PDGA model: must have history at lower tier)
  prerequisiteTiers?: string[];
  prerequisiteEventCount?: number;

  // Lead time
  minimumLeadWeeks?: number;              // override global

  extensions?: Extension[];
}

interface CalendarRules {
  proximityRadiusKm?: number;             // min distance between same-tier events
  proximityWeeks?: number;                // min weeks between same-tier events in region
  blackoutDates?: string[];               // dates when no events allowed
  mandatoryWeeks?: string[];              // weeks reserved for mandatory events
  maxEventsPerWeek?: number;              // per region/section
  calendarSections?: CalendarSection[];   // geographic divisions
}

interface CalendarSection {
  sectionId: string;
  sectionName: string;
  countyCodes?: string[];                 // countries in this section
  regionCodes?: string[];                 // sub-national regions
}

interface PersonnelRules {
  roles: PersonnelRole[];
}

interface PersonnelRole {
  roleName: string;                       // "Tournament Director", "Referee", "Chair Umpire"
  required: boolean;
  minimumCount?: number;
  certificationRequired?: string;
  safeguardingRequired?: boolean;
}
```

### 3.6 Engine Structure

Following the existing factory engine pattern:

```
src/
  assemblies/
    engines/
      sanctioning/                        // NEW — sanctioning engine
        index.ts                          // engine factory & API
        executionQueue.ts                 // directive execution
        stateProvider.ts                  // sanctioning state management
        stateMachine.ts                   // status transitions & guards

  mutate/
    sanctioning/                          // NEW — sanctioning mutations
      createSanctioningRecord.ts
      updateProposal.ts
      addEventProposal.ts
      removeEventProposal.ts
      updateEventProposal.ts
      submitApplication.ts
      withdrawApplication.ts
      addCondition.ts
      meetCondition.ts
      addReviewNote.ts
      requestModification.ts
      approveApplication.ts
      conditionallyApprove.ts
      rejectApplication.ts
      activateFromSanctioning.ts          // creates tournamentRecord from approved sanctioning
      flagComplianceIssue.ts
      closeApplication.ts

  query/
    sanctioning/                          // NEW — sanctioning queries
      getSanctioningRecord.ts
      getSanctioningRecords.ts
      getProposalValidation.ts            // validate proposal against policy
      getCalendarConflicts.ts             // check calendar conflicts
      getEligibleTiers.ts                 // which tiers is this proposal eligible for
      getCompleteness.ts                  // how complete is the application
      getMissingRequirements.ts           // what's still needed
      getStatusHistory.ts                 // audit trail
      getAvailableTransitions.ts          // what state transitions are valid now

  validators/
    sanctioning/                          // NEW — sanctioning validation
      validateProposal.ts                 // validate against policy
      validateEventProposal.ts
      validateStatusTransition.ts         // guard state transitions
      validateCalendarPlacement.ts
      validatePersonnel.ts
      validateFinancials.ts

  assemblies/
    governors/
      sanctioningGovernor/                // NEW — business rule enforcement
        index.ts
        query.ts
        mutate.ts

  constants/
    sanctioningConstants.ts               // NEW — statuses, transitions, error codes

  types/
    sanctioningTypes.ts                   // NEW — all sanctioning types

  fixtures/
    policies/
      POLICY_SANCTIONING_ITF.ts           // NEW — ITF sanctioning policy
      POLICY_SANCTIONING_USTA.ts          // NEW — USTA sanctioning policy
      POLICY_SANCTIONING_LTA.ts           // NEW — LTA sanctioning policy
      POLICY_SANCTIONING_GENERIC.ts       // NEW — generic/minimal policy
```

### 3.7 Sanctioning → TournamentRecord Bridge

When a sanctioning application is approved and activated, the engine generates a `tournamentRecord` with constraints baked in:

```typescript
// activateFromSanctioning.ts
function activateFromSanctioning({ sanctioningRecord }) {
  // 1. Validate sanctioning is APPROVED
  // 2. Generate tournamentRecord from proposal:
  //    - tournamentName, dates, venue, surface, indoorOutdoor
  //    - tournamentLevel from sanctioning tier
  //    - tournamentCategories from approved event categories
  //    - parentOrganisation from governing body
  //    - registrationProfile from proposal
  //    - processCodes: ['SANCTIONED', sanctioningId]
  // 3. Attach sanctioning policy as tournament policy:
  //    - Restrict allowedDrawTypes per event
  //    - Restrict matchUpFormats per event
  //    - Restrict categories
  //    - Set draw size constraints
  // 4. Create events from EventProposals
  // 5. Store sanctioningId as extension on tournamentRecord
  // 6. Update sanctioning status to ACTIVE
  // 7. Return { tournamentRecord, sanctioningRecord }
}
```

The attached policy ensures TMX (or any client using the factory) **cannot** deviate from the sanctioned parameters. For example:
- `allowedDrawTypes` on each event prevents unauthorized draw structures
- A scoring policy restricts `matchUpFormat` to approved formats
- Category constraints prevent adding unsanctioned age groups

---

## 4. Implementation Phases

### Phase 1: Foundation (Types, Constants, State Machine)

**Goal:** Define the type system and state machine, no mutations yet.

**Files:**
- `src/types/sanctioningTypes.ts` — all interfaces
- `src/constants/sanctioningConstants.ts` — statuses, transitions, error codes
- `src/constants/policyConstants.ts` — add `POLICY_TYPE_SANCTIONING`
- `src/validators/sanctioning/validateStatusTransition.ts` — state machine guards

**Verification:** Type-check passes. State transition tests confirm valid/invalid transitions.

### Phase 2: Core Engine & Basic Mutations

**Goal:** Create, read, update sanctioning records. No policy validation yet.

**Files:**
- `src/assemblies/engines/sanctioning/index.ts`
- `src/assemblies/engines/sanctioning/stateProvider.ts`
- `src/assemblies/engines/sanctioning/stateMachine.ts`
- `src/assemblies/engines/sanctioning/executionQueue.ts`
- `src/mutate/sanctioning/createSanctioningRecord.ts`
- `src/mutate/sanctioning/updateProposal.ts`
- `src/mutate/sanctioning/addEventProposal.ts`
- `src/mutate/sanctioning/removeEventProposal.ts`
- `src/mutate/sanctioning/updateEventProposal.ts`
- `src/query/sanctioning/getSanctioningRecord.ts`
- `src/query/sanctioning/getSanctioningRecords.ts`
- `src/query/sanctioning/getAvailableTransitions.ts`

**Verification:** Can create a sanctioning record, add event proposals, read it back. ExecutionQueue works for sanctioning directives.

### Phase 3: Workflow Transitions

**Goal:** Submit, review, approve, reject, withdraw, modify cycle.

**Files:**
- `src/mutate/sanctioning/submitApplication.ts`
- `src/mutate/sanctioning/withdrawApplication.ts`
- `src/mutate/sanctioning/approveApplication.ts`
- `src/mutate/sanctioning/conditionallyApprove.ts`
- `src/mutate/sanctioning/rejectApplication.ts`
- `src/mutate/sanctioning/requestModification.ts`
- `src/mutate/sanctioning/addCondition.ts`
- `src/mutate/sanctioning/meetCondition.ts`
- `src/mutate/sanctioning/addReviewNote.ts`
- `src/query/sanctioning/getStatusHistory.ts`

**Verification:** Full workflow cycle tests — DRAFT through APPROVED, DRAFT through REJECTED, conditional approval with condition resolution, modification request cycle.

### Phase 4: Policy Validation Engine

**Goal:** Validate proposals against sanctioning policies. This is the "brain" of the engine.

**Files:**
- `src/fixtures/policies/POLICY_SANCTIONING_GENERIC.ts`
- `src/fixtures/policies/POLICY_SANCTIONING_ITF.ts`
- `src/validators/sanctioning/validateProposal.ts`
- `src/validators/sanctioning/validateEventProposal.ts`
- `src/validators/sanctioning/validateFinancials.ts`
- `src/validators/sanctioning/validatePersonnel.ts`
- `src/query/sanctioning/getProposalValidation.ts`
- `src/query/sanctioning/getEligibleTiers.ts`
- `src/query/sanctioning/getCompleteness.ts`
- `src/query/sanctioning/getMissingRequirements.ts`

**Verification:** Policy validation correctly identifies: tier eligibility, missing requirements, format violations, draw size violations, prize money violations. Completeness scoring works. Eligible tier resolution works.

### Phase 5: Calendar Conflict Detection

**Goal:** Detect scheduling conflicts based on calendar rules.

**Files:**
- `src/validators/sanctioning/validateCalendarPlacement.ts`
- `src/query/sanctioning/getCalendarConflicts.ts`

**Verification:** Calendar conflict detection finds: geographic proximity violations, same-week conflicts, blackout date violations, mandatory week conflicts.

### Phase 6: TournamentRecord Generation

**Goal:** Generate a constrained `tournamentRecord` from an approved sanctioning.

**Files:**
- `src/mutate/sanctioning/activateFromSanctioning.ts`
- `src/mutate/sanctioning/closeApplication.ts`
- `src/mutate/sanctioning/flagComplianceIssue.ts`
- Governor integration: `src/assemblies/governors/sanctioningGovernor/`

**Verification:** Generated `tournamentRecord` has correct: events, categories, allowed draw types, allowed formats, tournament level, parent organisation. Policy constraints are enforceable in TMX.

### Phase 7: Additional Policies & Refinement

**Goal:** Sport-specific policies, USTA/LTA/Tennis Australia examples.

**Files:**
- `src/fixtures/policies/POLICY_SANCTIONING_USTA.ts`
- `src/fixtures/policies/POLICY_SANCTIONING_LTA.ts`
- Additional sport-specific policies as needed

**Verification:** Sport-specific policies correctly validate against their respective governing body rules.

### Phase 8: Server & Client Integration

**Goal:** Integrate with competition-factory-server and TMX.

**Scope (outside factory, noted for planning):**
- Server: sanctioning record storage, API endpoints, WebSocket events
- TMX: sanctioning workflow UI (multi-step form, status dashboard)
- Admin client: reviewer interface for governing body staff

---

## 5. Key Design Decisions

### 5.1 Separate Document, Not a Tournament Extension

The sanctioning record is its own first-class document rather than an extension on a tournament record because:
- It has its own lifecycle (can exist before any tournament)
- It has its own state machine (DRAFT → APPROVED → ACTIVE)
- Multiple sanctioning records might feed into one tournament (multi-sanctioned events)
- Rejected sanctioning records should be queryable without a tournament

### 5.2 Policy-Driven Validation

Rather than hard-coding rules for ITF/USTA/LTA, all requirements are expressed as **policy documents**. This means:
- New governing bodies can define their own rules without code changes
- Existing policies can be versioned and updated
- The engine is sport-agnostic — a pickleball federation can use the same engine with different policies

### 5.3 Progressive Disclosure / Completeness Model

The engine doesn't force all fields at creation. Instead:
- `getCompleteness()` returns a score (0-100%) and missing fields
- `getMissingRequirements()` returns what's needed for the current tier
- `submitApplication()` validates against the policy and blocks if critical fields are missing
- This supports a multi-step wizard UI in TMX

### 5.4 Extension Points

For org-specific needs beyond the schema:
- `extensions` on every major object (reusing factory pattern)
- `timeItems` for temporal metadata (deadlines, dates, milestones)
- Custom policy fields via `extensions` on `SanctioningTier`

### 5.5 Audit Trail

Every state transition is recorded:
- `modifications[]` on the sanctioning record captures change history
- `reviewNotes[]` captures reviewer feedback
- `timeItems` capture temporal milestones (submitted, reviewed, approved)
- Version number increments on each mutation

---

## 6. Relationship to Existing Factory Systems

| Existing System | Sanctioning Intersection |
|----------------|--------------------------|
| **Category** | EventProposal reuses `Category` type for age/rating restrictions |
| **matchUpFormatCode** | Policies define `allowedMatchUpFormats` per tier; validated using existing parser |
| **DrawType** | Policies define `allowedDrawTypes` per tier; carried to event `allowedDrawTypes` |
| **TournamentLevel** | Maps from sanctioning tier to existing `TournamentLevelUnion` |
| **RankingPoints / AwardProfile** | Sanctioning tier links to `rankingPointsProfile` for points allocation |
| **RegistrationProfile** | Reused directly in `TournamentProposal` |
| **Extension / TimeItem** | Reused for extensibility throughout sanctioning schema |
| **Policy system** | New `POLICY_TYPE_SANCTIONING` integrates with existing `attachPolicies` mechanism |
| **executionQueue** | Sanctioning engine supports the same directive/pipe pattern |

---

## 7. Open Questions — Research & Recommendations

### 7.1 Multi-Organisation Sanctioning

**Question:** Should a tournament be able to reference multiple sanctioning records?

**Research findings:**

Real-world dual/multi-sanctioning takes three distinct forms:

1. **Hierarchical (ITF + National Federation):** Not true dual-sanctioning. The national federation is the intermediary — it endorses and submits to the ITF. One application flows upward. The national sanction is the primary instrument; ITF points flow through a memorandum of understanding. USTA Level 1-3 tournaments that carry ITF ranking points operate under an MOU where USTA regulations take precedence except where they conflict with ITF tour regulations.

2. **Parallel tours (ATP + WTA combined events):** Indian Wells, Miami, Madrid, Rome etc. carry **separate sanctions from each tour**. The tournament owner negotiates a Tournament Agreement with each tour independently. Each tour maintains independent ranking, regulatory, and sanctioning frameworks. These are effectively two tournaments sharing a venue and brand.

3. **Cross-organisation (USA Swimming + USMS):** Two separate sanctions are required, both held by the host organization. Swimmers declare which organization they represent for the entire competition. Results are split and reported separately. Insurance coverage is separate.

**Recommendation: Yes — multiple sanctioning records per tournament, linked via extension.**

The factory already has the `LINKED_TOURNAMENTS` extension pattern (`mutate/tournaments/tournamentLinks.ts`) for cross-document references, and `tournamentOtherIds` for external identifiers. Apply the same pattern:

```typescript
// On SanctioningRecord:
interface SanctioningRecord {
  // ... existing fields ...
  linkedSanctioningIds?: string[];        // other sanctions for same tournament
  sanctioningRelationship?: 'PRIMARY' | 'SECONDARY' | 'INDEPENDENT';
}

// On Tournament (via extension):
{
  name: 'sanctioningIds',
  value: ['sanc-itf-001', 'sanc-usta-001']  // multiple sanctions
}
```

**Design rules:**
- Each governing body gets its own `SanctioningRecord` — no combined applications
- A `sanctioningRelationship` field indicates whether this is the primary sanction (hierarchical model), secondary (subordinate to another body's sanction), or independent (parallel model like ATP+WTA)
- The `activateFromSanctioning` bridge should accept multiple sanctioning records when generating a `tournamentRecord`, merging constraints (union of restrictions, intersection of allowed values)
- For the hierarchical model (ITF + national federation), the national federation's sanctioning record carries a `parentSanctioningId` pointing to the ITF record, mirroring the existing `parentOrganisationId` pattern on `Tournament`
- Calendar conflict checking should aggregate across all governing bodies' calendars, not just the primary one

**Impact on plan:** Add `linkedSanctioningIds` and `sanctioningRelationship` to the `SanctioningRecord` type in Phase 1. Extend `activateFromSanctioning` in Phase 6 to accept an array of sanctioning records and merge their constraints.

---

### 7.2 Calendar Service

**Question:** Should calendar conflict detection be server-side only, or should the engine support it with injected calendar data?

**Research findings:**

The factory's existing scheduling system (TemporalEngine, scheduleGovernor) operates on **locally loaded data** — blocks, courts, and time ranges within tournaments that have been `setState`'d into the engine. It has no concept of fetching external calendar data; all data must be present in the engine's state. The server's `calendarStorage` interface handles persistence, but the factory engine itself is storage-agnostic.

Calendar conflict detection for sanctioning requires knowledge of **all sanctioned events across a region and season** — data that no single client or tournament record holds. This is fundamentally a cross-record query.

The USTA "Serve Tennis" platform and BWF's sanctioning portal both handle calendar conflict detection server-side, where the full calendar is available. The ITF similarly maintains a centralized calendar. No sport handles calendar conflicts client-side.

**Recommendation: Hybrid — engine provides the algorithm, server injects the data.**

```typescript
// The engine query accepts injected calendar context:
getCalendarConflicts({
  sanctioningRecord,                      // the proposal being checked
  calendarContext: CalendarContext,        // injected by server or test
})

interface CalendarContext {
  existingEvents: CalendarEvent[];        // all sanctioned events in scope
  calendarRules: CalendarRules;           // from the governing body's policy
}

interface CalendarEvent {
  sanctioningId?: string;
  tournamentId?: string;
  startDate: string;
  endDate: string;
  sanctioningTier?: string;
  calendarSection?: string;
  countryCode?: string;
  coordinates?: { lat: number; lng: number };  // for proximity calculation
}
```

**Design rules:**
- The **algorithm lives in the factory** (pure function, no I/O) — testable without a server
- The **data comes from the caller** — on the server, fetched from `calendarStorage`; in tests, supplied as fixtures
- This follows the factory's existing pattern: the engine never fetches data; it operates on what's given to it
- `validateCalendarPlacement` returns structured conflict results (not just pass/fail): which events conflict, why (proximity, same week, blackout), and severity (hard block vs. advisory warning)
- The server wraps this as an API endpoint: `POST /sanctioning/:id/calendar-check` that fetches context from storage and calls the engine

**Impact on plan:** No structural change. Phase 5 already plans `validateCalendarPlacement` and `getCalendarConflicts`. Add the `CalendarContext` and `CalendarEvent` types to Phase 1. The server integration in Phase 8 provides the data injection layer.

---

### 7.3 Endorsement Workflow

**Question:** Should the endorsement be a sub-workflow within the sanctioning record, or a separate linked document?

**Research findings:**

In the ITF system, the national federation endorsement is **substantive, not a rubber stamp**. The national association is "ultimately responsible for the proper organisation and running" of the tournament. It must be "fully appraised of the proposed Tournament site and organisation" and satisfied that requirements are met before endorsing. A national federation can effectively veto an application by refusing to submit it — tournaments not sanctioned by the relevant national association are not considered for ITF calendar inclusion.

However, the endorsement is **embedded in the application process** rather than tracked as a separate document. The national association submits the application on behalf of the organizer — the submission itself is the endorsement act. There is no separate "endorsement certificate" that exists independently.

USTA sectional endorsement works similarly: sections approve tournament directors and sanction applications, but this is part of the single application flow, not a parallel document.

The factory's existing sub-workflow patterns (qualifying generation within draw generation, entry status transitions within entry management) model nested processes as **inline state within the parent object**, not as separate documents with their own lifecycles.

**Recommendation: Inline sub-workflow on the SanctioningRecord, not a separate document.**

```typescript
interface SanctioningRecord {
  // ... existing fields ...
  endorsement?: Endorsement;
}

interface Endorsement {
  status: 'PENDING' | 'ENDORSED' | 'DECLINED' | 'NOT_REQUIRED';
  endorserId?: string;                    // organisation ID of endorsing body
  endorserName?: string;
  endorsedAt?: string;
  declinedAt?: string;
  declineReason?: string;
  endorserNotes?: string;
  endorserContact?: PersonReference;      // who at the federation handled it
  conditions?: string[];                  // conditions the endorser attached
  extensions?: Extension[];
}
```

**Design rules:**
- Endorsement is a **required step** before `submitApplication()` can transition the record to `SUBMITTED` — unless the policy sets `requireEndorsement: false` (for local/club-level events that don't need federation sign-off)
- The endorsement status is part of the completeness calculation: `getCompleteness()` reports it as a missing requirement when `endorsement.status` is `PENDING`
- `submitApplication()` checks `endorsement.status === 'ENDORSED'` or policy doesn't require it
- If the endorser declines, the applicant can modify the proposal and request endorsement again (endorsement status resets to `PENDING` on proposal modification)
- The endorsement is **not** a separate state machine — it's a gate within the main workflow. This avoids the complexity of coordinating two independent state machines while still capturing the substantive nature of the endorsement step
- For the hierarchical model (national federation → ITF), the national federation's endorsement lives on the ITF-level `SanctioningRecord`, and the national federation may also have its own `SanctioningRecord` with `sanctioningRelationship: 'PRIMARY'`

**Impact on plan:** Add `Endorsement` type to Phase 1. Add endorsement mutations (`requestEndorsement`, `endorseApplication`, `declineEndorsement`) to Phase 3. Add endorsement gate to `submitApplication` validation.

---

### 7.4 Post-Event Compliance

**Question:** How deep should post-event compliance tracking go?

**Research findings:**

Post-event compliance across sports breaks into three categories of increasing structure:

1. **Mandatory reporting with deadlines** (universal): Results submission (24h for World Athletics, 72h for USA Swimming, 14 days for USATT), incident reports (48h for USATF), financial reconciliation (prize money paid out, sanction fees settled).

2. **Structured checklists** (some sports): USATF requires a Post-Event Report Form that must be completed before new sanctions are granted. USA Swimming requires pool measurement forms, record applications, backup result files. ITF requires the Supervisor's report covering all aspects of play.

3. **Financial compliance** (ITF, BWF): ITF requires a security deposit equal to full prize money, returned only after all prizes are paid. BWF sanction fee (10% of prize fund) is due within 3 weeks of tournament end.

The existing factory tracks tournament lifecycle via `tournamentStatus` (`ACTIVE` → `COMPLETED`) and `processCodes` for workflow flags. The `timeItems` system already handles temporal milestones with `createdAt` timestamps. The audit topic system (`AUDIT` in topicConstants) provides change notification.

**Recommendation: Structured checklist with policy-driven items, not just status flags.**

```typescript
interface SanctioningRecord {
  // ... existing fields ...
  compliance?: ComplianceRecord;
}

interface ComplianceRecord {
  status: 'NOT_APPLICABLE' | 'PENDING' | 'IN_PROGRESS' | 'COMPLIANT' | 'ISSUES_FLAGGED';
  items: ComplianceItem[];
  notes?: ReviewNote[];
  completedAt?: string;
}

interface ComplianceItem {
  itemId: string;
  itemType: ComplianceItemType;
  description: string;
  required: boolean;
  status: 'PENDING' | 'SUBMITTED' | 'VERIFIED' | 'OVERDUE' | 'WAIVED';
  deadline?: string;                      // absolute date
  submittedAt?: string;
  verifiedAt?: string;
  value?: any;                            // attached data (e.g., result file reference)
  extensions?: Extension[];
}

type ComplianceItemType =
  | 'RESULTS_SUBMISSION'
  | 'FINANCIAL_RECONCILIATION'
  | 'INCIDENT_REPORT'
  | 'PRIZE_MONEY_CONFIRMATION'
  | 'SANCTION_FEE_PAYMENT'
  | 'SUPERVISOR_REPORT'
  | 'FACILITY_REPORT'
  | 'SAFEGUARDING_REPORT'
  | 'CUSTOM';
```

**Design rules:**
- Compliance items are **generated from the sanctioning policy** when the sanctioning record transitions to `POST_EVENT`. The policy's `postEventRequirements` (new field on `SanctioningPolicy`) defines which items are required for each tier, with deadlines expressed as days-after-event
- Items start as `PENDING` and progress through `SUBMITTED` → `VERIFIED`
- If a deadline passes without submission, the item becomes `OVERDUE`
- The overall `compliance.status` is derived: `COMPLIANT` when all required items are `VERIFIED` or `WAIVED`; `ISSUES_FLAGGED` when any required item is `OVERDUE`
- A `PENDING` compliance record blocks future sanctioning applications from the same applicant (USATF model) — this is enforced by `submitApplication()` checking for unresolved compliance on prior sanctioning records
- Keep the checklist **data-light**: the engine tracks what's due and what's been submitted, but the actual result files, financial documents, etc. are stored externally (referenced by `value` or `extensions`). The engine is not a document store

**New policy fields:**
```typescript
interface SanctioningPolicy {
  // ... existing fields ...
  postEventRequirements?: PostEventRequirement[];
}

interface PostEventRequirement {
  itemType: ComplianceItemType;
  description: string;
  required: boolean;
  deadlineDays: number;                   // days after tournament endDate
  tiers?: string[];                       // applies to specific tiers only (all if omitted)
}
```

**Impact on plan:** Add compliance types to Phase 1. Add `postEventRequirements` to policy schema in Phase 4. Add compliance mutations (`generateComplianceChecklist`, `submitComplianceItem`, `verifyComplianceItem`, `waiveComplianceItem`, `flagComplianceIssue`) to Phase 6. Add prior-compliance gate to `submitApplication` in Phase 3.

---

### 7.5 Policy Versioning

**Question:** Should sanctioning policies be versioned, with records locked to their submission-time version?

**Research findings:**

Every governing body researched versions its regulations annually:
- **ITF**: Published annually (e.g., "2025 WTT Regulations", "2026 WTT Regulations"), effective January 1, with a "Summary of Key Rule Changes" document. Changes shown in underlined text.
- **USTA**: Versioned by year, amendments effective January 1 following adoption. Mid-year conforming changes possible with General Counsel authorization.
- **FIFA/IFAB**: Annual rule changes, typically effective July 1 (season alignment).
- **FIBA**: Published with explicit effective dates, with formal "Transitory Provisions" for handling transitions.

No evidence was found of mid-season retroactive application to already-sanctioned events. The universal pattern is: the rules in effect at the time of sanctioning govern that tournament.

The factory's existing policy system has **no versioning** — policies are attached via `attachPolicies()` and can be replaced with `allowReplacement: true`, but there's no version number, effective date, or audit trail of policy changes.

**Recommendation: Yes — lightweight versioning with snapshot-on-submit.**

```typescript
interface SanctioningPolicy {
  // ... existing fields ...
  policyVersion: string;                  // e.g., "2026.1" or "2026-01-01"
  effectiveDate: string;                  // ISO 8601 — when this version takes effect
  supersededDate?: string;                // when this version was superseded (if ever)
}

interface SanctioningRecord {
  // ... existing fields ...
  policyVersion?: string;                 // locked at submission time
  policySnapshot?: SanctioningPolicy;     // full policy at time of submission
}
```

**Design rules:**
- Policies carry a `policyVersion` and `effectiveDate`. The engine resolves which policy version is current based on `effectiveDate <= now && !supersededDate`
- On `submitApplication()`, the current policy version is recorded on the sanctioning record (`policyVersion` field) and a deep copy of the policy is stored as `policySnapshot`. All subsequent validation for this record uses the snapshot, not the live policy
- This matches real-world practice: the 2026 ITF rules govern a tournament sanctioned under the 2026 rules, even if the 2027 rules are published before the tournament takes place
- The `policySnapshot` is a **read-only reference** — it cannot be mutated. If the applicant wants to be evaluated under a newer policy, they can explicitly opt in via a `resubmitUnderCurrentPolicy()` mutation that updates the snapshot
- For the existing factory policy system (non-sanctioning policies like ranking points, scheduling, etc.), no changes are needed — this versioning is sanctioning-specific. However, the pattern could be generalized later if other policy types need versioning
- Keep it lightweight: don't build a full policy revision history system. One version string and one snapshot per sanctioning record is sufficient

**Impact on plan:** Add `policyVersion`, `effectiveDate`, `supersededDate` to `SanctioningPolicy` and `policyVersion`, `policySnapshot` to `SanctioningRecord` in Phase 1. Implement snapshot-on-submit in Phase 3's `submitApplication`. Policy validation in Phase 4 reads from the snapshot.

---

### 7.6 Tournament Modification Post-Approval

**Question:** Re-enter the workflow, or separate amendment process?

**Research findings:**

Real-world modification handling is remarkably consistent across sports:

- **ITF**: Cannot cancel, postpone, or make substantial changes less than 9 weeks before the tournament. Violations subject to fines up to $5,000, forfeiture of fees, and denial of future applications. The ITF can downgrade a tournament application up to the entry deadline.
- **BWF**: Graduated timeline — prize money can increase anytime but cannot decrease; changes fewer than 15 days before the event for high-level events are referred to the Disciplinary Committee; tournament level cannot change fewer than 90 days before.
- **USTA**: Draw size, formats, and match formats are determined at the time of sanction approval. Play cannot continue past the last sanctioned day without prior written approval. Changes handled through direct communication, not a formal re-application.
- **USATF**: Postponements within the same calendar year are handled by email with no additional fee. Postponements to the next year require cancellation and re-application.

The common pattern: **minor changes are handled as amendments to the existing approval; substantial changes require re-review; and late changes are penalized or prohibited.**

**Recommendation: Amendment sub-workflow on the existing sanctioning record, not re-entry.**

```typescript
interface SanctioningRecord {
  // ... existing fields ...
  amendments?: Amendment[];
}

interface Amendment {
  amendmentId: string;
  status: 'PROPOSED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  proposedAt: string;
  resolvedAt?: string;
  proposedBy?: string;                    // applicant or governing body
  reviewerNotes?: string;

  // What changed — structured diff
  changes: ProposalChange[];

  // Classification
  severity: 'MINOR' | 'SUBSTANTIAL';     // derived from policy rules
  withinTimeline: boolean;                // is this within the allowed modification window
}

interface ProposalChange {
  field: string;                          // dot-path: "proposal.proposedStartDate", "proposal.events[0].drawSize"
  previousValue: any;
  proposedValue: any;
  changeType: 'MODIFIED' | 'ADDED' | 'REMOVED';
}
```

**New policy fields:**
```typescript
interface SanctioningPolicy {
  // ... existing fields ...
  amendmentRules?: AmendmentRules;
}

interface AmendmentRules {
  // What constitutes a substantial change (everything else is minor)
  substantialChangeFields?: string[];     // e.g., ["proposedStartDate", "proposedEndDate", "sanctioningTier", "events.*.drawSize"]

  // Timeline gates
  noChangeWindowWeeks?: number;           // weeks before event when NO changes allowed (ITF: 9)
  substantialChangeWindowWeeks?: number;  // weeks before event when substantial changes require re-review (BWF: 13)

  // Financial
  prizeMoneyIncrease?: 'ALLOWED' | 'REQUIRES_REVIEW' | 'PROHIBITED';
  prizeMoneyDecrease?: 'ALLOWED' | 'REQUIRES_REVIEW' | 'PROHIBITED';  // BWF: prohibited

  // Penalties
  lateChangePenalty?: boolean;            // flag for the governing body's attention
}
```

**Design rules:**
- The sanctioning record stays in `APPROVED` status throughout the amendment process — it doesn't re-enter `UNDER_REVIEW`. Amendments have their own mini-lifecycle (`PROPOSED` → `APPROVED`/`REJECTED`)
- `proposeAmendment()` automatically classifies severity by checking `amendmentRules.substantialChangeFields`. If the changed field is in that list, it's `SUBSTANTIAL`; otherwise `MINOR`
- Minor amendments within the allowed timeline can be **auto-approved** by the engine (no reviewer needed) — policy-configurable
- Substantial amendments always require reviewer approval
- Changes within the `noChangeWindowWeeks` are **blocked entirely** unless overridden by a reviewer with a reason
- When an amendment is approved, the proposal is updated in place and the amendment is recorded in the `amendments[]` history (audit trail)
- The generated `tournamentRecord`'s constraints are updated to reflect the amended proposal (if the tournament already exists)
- This avoids the complexity of re-running the full state machine while still providing governance and audit trail

**Impact on plan:** Add `Amendment`, `ProposalChange`, and `AmendmentRules` types to Phase 1. Add amendment mutations (`proposeAmendment`, `reviewAmendment`, `approveAmendment`, `rejectAmendment`) as a new Phase 3.5 or extension of Phase 3. Add `amendmentRules` to policy schema in Phase 4.

---

## 8. Implementation Gap Analysis

The following gaps exist between the plan and the current implementation. Each gap is described with its impact and a proposed solution.

### Gap 1: Workflow Steps Are Hardcoded

**Current:** All governing bodies share the same state machine: DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → ACTIVE → POST_EVENT → CLOSED. The states and transitions are defined in `sanctioningConstants.ts` as a static map.

**Problem:** Some bodies need additional steps (e.g., technical inspection before approval) while others should allow shortcuts (e.g., Level 7 local events could skip formal review and go directly SUBMITTED → APPROVED).

**Proposed Solution:** Add `workflowOverrides` to `SanctioningPolicy`:

```typescript
interface SanctioningPolicy {
  // ... existing ...
  workflowOverrides?: WorkflowOverrides;
}

interface WorkflowOverrides {
  // Additional transitions allowed for this policy
  additionalTransitions?: Array<{ from: SanctioningStatus; to: SanctioningStatus }>;
  // Transitions to remove (e.g., skip UNDER_REVIEW for low tiers)
  removedTransitions?: Array<{ from: SanctioningStatus; to: SanctioningStatus }>;
  // Custom states inserted into the workflow
  customStates?: Array<{ name: string; after: SanctioningStatus; before: SanctioningStatus }>;
  // Per-tier overrides (e.g., Level 7 has different transitions than Level 1)
  tierWorkflowOverrides?: Record<string, WorkflowOverrides>;
}
```

**Implementation:** Modify `validateStatusTransition()` to accept an optional `SanctioningPolicy` parameter. When provided, merge the policy's `workflowOverrides` with the default `VALID_STATUS_TRANSITIONS` map before checking. The engine's `getAvailableTransitions()` would also accept the policy to return policy-aware transitions.

**Complexity:** Medium. The default state machine stays as-is; overrides are additive.

---

### Gap 2: No Transition Precondition Hooks

**Current:** `submitApplication()` has a hardcoded endorsement check. No other transition has precondition validation beyond the state machine itself.

**Problem:** Policies can't define "what must be true before this transition is allowed." For example:
- ITF W75+: require minimum 8 courts before approval (currently only checked by `validateProposal`, not enforced at transition time)
- USTA Level 1: require minimum 225 participants registered before activation
- BWF: require prize money deposit confirmation before approval

**Proposed Solution:** Add `transitionGuards` to `SanctioningPolicy`:

```typescript
interface SanctioningPolicy {
  // ... existing ...
  transitionGuards?: TransitionGuard[];
}

interface TransitionGuard {
  transition: { from: SanctioningStatus; to: SanctioningStatus };
  guard: 'ENDORSEMENT_REQUIRED' | 'PROPOSAL_VALID' | 'ALL_CONDITIONS_MET' | 'COMPLIANCE_COMPLETE' | 'CUSTOM';
  customGuardField?: string;   // for CUSTOM: dot-path field that must be truthy
  message?: string;            // error message when guard fails
  tiers?: string[];            // only apply to specific tiers
}
```

**Implementation:** `transitionStatus()` receives the policy and evaluates all guards for the attempted transition before allowing it. Built-in guards (`ENDORSEMENT_REQUIRED`, `PROPOSAL_VALID`, etc.) map to existing validation functions. `CUSTOM` guards check a field path on the sanctioning record.

**Complexity:** Medium. Current endorsement check in `submitApplication` becomes a guard; all other transitions gain the same capability.

---

### Gap 3: Single Endorsement Only

**Current:** `SanctioningRecord.endorsement` is a single `Endorsement` object. Only one endorser can sign off.

**Problem:** USTA Level 1 events may need both sectional AND national endorsement. ITF events sanctioned through Tennis Europe need the national federation + Tennis Europe endorsement. The current model can't represent multi-level endorsement chains.

**Proposed Solution:** Change `endorsement` to `endorsements` array:

```typescript
interface SanctioningRecord {
  // ... existing ...
  endorsements?: Endorsement[];  // ordered by endorsement level
}

interface Endorsement {
  // ... existing fields ...
  endorsementLevel?: number;     // 1 = first required, 2 = second, etc.
  prerequisiteEndorserId?: string; // must be endorsed before this one can be requested
}
```

**Implementation:**
- `requestEndorsement()` pushes to the array instead of replacing the single object
- `endorseApplication()` accepts an `endorserId` to identify which endorsement to update
- `submitApplication()` checks that ALL required endorsements (defined by policy) are met
- Policy adds `requiredEndorsements` count or array to specify how many levels are needed
- Backward compatible: single endorsement is just an array of length 1

**Complexity:** Low-Medium. Mostly structural change; the logic is a generalization of what exists.

---

### Gap 4: Personnel Certification Not Validated

**Current:** `validateProposal()` checks that a person EXISTS for required roles (Tournament Director, Referee, Chair Umpire) but does NOT validate their `certificationLevel` against the tier's `officialCertificationLevel` requirement.

**Problem:** A policy tier requiring 'Bronze Badge' officials passes validation even if the referee has no certification or a lower level.

**Proposed Solution:** Extend `findPersonnelForRole()` to check certification:

```typescript
function findPersonnelForRole(proposal: TournamentProposal, role: PersonnelRole): boolean {
  const lowerRole = role.roleName.toLowerCase();
  // ... existing existence checks ...

  // If certification required, verify level
  if (role.certificationRequired) {
    const person = findPerson(proposal, lowerRole);
    if (!person?.certificationLevel) return false;
    // Certification hierarchy: compare levels
    return certificationMeetsRequirement(person.certificationLevel, role.certificationRequired);
  }
  return true;
}
```

**Implementation:** Add a `CERTIFICATION_HIERARCHY` constant (or policy-defined hierarchy) that maps certification names to levels. `certificationMeetsRequirement()` compares the person's level against the required level.

**Complexity:** Low. Requires defining certification hierarchies per governing body (could be in the policy fixture).

---

### Gap 5: Calendar Rules Not Auto-Loaded from Policy

**Current:** `getCalendarConflicts()` requires the caller to inject `calendarContext` including `calendarRules`. The policy's `calendarRules` are not automatically used.

**Problem:** The server endpoint manually constructs `calendarRules: { proximityWeeks: 2, maxEventsPerWeek: 5 }` as hardcoded values instead of reading from the sanctioning record's policy snapshot.

**Proposed Solution:** `getCalendarConflicts()` should fall back to the record's `policySnapshot.calendarRules` when `calendarContext.calendarRules` is not provided:

```typescript
export function getCalendarConflicts({ sanctioningRecord, calendarContext }) {
  const rules = calendarContext.calendarRules
    ?? sanctioningRecord.policySnapshot?.calendarRules
    ?? {};
  // ... use rules ...
}
```

**Implementation:** One-line change in `getCalendarConflicts()`. Server endpoint updated to not hardcode rules.

**Complexity:** Trivial.

---

### Gap 6: No Prior-Compliance Gate on Submission

**Current:** The plan (section 7.4) specifies that unresolved compliance from prior sanctioning records should block new submissions (USATF model). This is NOT implemented.

**Problem:** An applicant with overdue compliance items from a previous event can submit new applications without restriction.

**Proposed Solution:** `submitApplication()` accepts an optional `priorSanctioningRecords` parameter (injected by the server). If any prior record for the same `applicantProviderId` has `compliance.status === 'ISSUES_FLAGGED'` or has OVERDUE items, submission is blocked.

```typescript
export function submitApplication({ sanctioningRecord, sanctioningPolicy, priorRecords }) {
  if (priorRecords?.length) {
    const hasOutstanding = priorRecords.some(r =>
      r.compliance?.status === 'ISSUES_FLAGGED' ||
      r.compliance?.items?.some(i => i.status === 'OVERDUE' && i.required)
    );
    if (hasOutstanding) return { error: OUTSTANDING_COMPLIANCE };
  }
  // ... existing logic ...
}
```

**Implementation:** Add the parameter and check. The server's `executeSanctioningMethod` queries prior records for the same provider before calling `submitApplication`.

**Complexity:** Low. The error constant already exists (`OUTSTANDING_COMPLIANCE`).

---

### Gap 7: Compliance OVERDUE Status Never Set Automatically

**Current:** Compliance items have an `OVERDUE` status in the enum, and `deadline` dates are set when the checklist is generated. But nothing automatically transitions items from `PENDING` to `OVERDUE` when the deadline passes.

**Problem:** The engine is passive — it doesn't know what time it is unless asked. Overdue detection only happens if someone calls `updateComplianceStatus()`, which only runs when an item is submitted/verified/waived.

**Proposed Solution:** Add a `checkComplianceDeadlines()` query that scans items and marks overdue ones:

```typescript
export function checkComplianceDeadlines({ sanctioningRecord }) {
  const now = new Date();
  let changed = false;
  for (const item of sanctioningRecord.compliance?.items ?? []) {
    if (item.status === 'PENDING' && item.deadline && new Date(item.deadline) < now) {
      item.status = 'OVERDUE';
      changed = true;
    }
  }
  if (changed) updateComplianceStatus(sanctioningRecord);
  return { success: true, changed };
}
```

**Implementation:** Add to engine as a query/mutation. The server calls it periodically (via n8n health check) or before returning compliance data. Mentat's health-monitor agent could trigger this daily.

**Complexity:** Low.

---

### Gap 8: No `resubmitUnderCurrentPolicy()` Method

**Current:** Policy is snapshot'd at submission. The plan (section 7.5) mentions a `resubmitUnderCurrentPolicy()` mutation for applicants who want to be evaluated under newer rules. This is not implemented.

**Problem:** If an ITF W50 application was submitted under 2026 rules but the 2027 rules are more favorable (e.g., reduced court requirements), the applicant has no way to opt into the newer policy without withdrawing and resubmitting.

**Proposed Solution:** Add a mutation that clears the snapshot and re-snapshots with a provided policy:

```typescript
export function resubmitUnderCurrentPolicy({ sanctioningRecord, sanctioningPolicy }) {
  // Only allowed in MODIFICATION_REQUESTED or DRAFT status
  sanctioningRecord.policyVersion = sanctioningPolicy.policyVersion;
  sanctioningRecord.policySnapshot = makeDeepCopy(sanctioningPolicy);
  // ... transition to SUBMITTED ...
}
```

**Complexity:** Low. It's a variant of `submitApplication()`.

---

### Summary: Priority Order

| Gap | Severity | Complexity | Recommendation |
|-----|----------|------------|----------------|
| 5. Calendar rules from policy | Low | Trivial | Fix immediately |
| 4. Personnel certification | Medium | Low | Fix next |
| 7. Auto-OVERDUE detection | Medium | Low | Fix next |
| 6. Prior-compliance gate | Medium | Low | Implement with server integration |
| 3. Multi-endorsement | Medium | Low-Medium | Implement when ITF/USTA policies are actively used |
| 2. Transition guards | High | Medium | Implement to unlock policy-driven workflows |
| 1. Workflow overrides | High | Medium | Implement after transition guards |
| 8. Resubmit under new policy | Low | Low | Implement on demand |

---

## 9. File Summary

| Phase | New Files | New Tests |
|-------|----------|-----------|
| 1 - Foundation | 3 | ~10 |
| 2 - Core Engine | 10 | ~25 |
| 3 - Workflow | 10 | ~20 |
| 4 - Policy Validation | 8 | ~30 |
| 5 - Calendar | 2 | ~10 |
| 6 - Tournament Generation | 4 | ~15 |
| 7 - Additional Policies | 2-5 | ~10 |
| 8 - Server/Client | (outside factory) | — |
| **Total** | **~40-43** | **~120** |
