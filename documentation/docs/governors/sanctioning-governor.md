---
title: Sanctioning Governor
---

```js
import { sanctioningGovernor } from 'tods-competition-factory';
```

The **sanctioningGovernor** re-exports all sanctioning mutation and query functions for use outside the sanctioning engine. While the `sanctioningEngine` provides a complete stateful API, the governor exports individual functions that can be called directly with a `sanctioningRecord` parameter.

For full engine documentation including state management, executionQueue, and workflow examples, see [Sanctioning Engine](../engines/sanctioning-engine.md).

---

## Mutations

### createSanctioningRecord

Creates a new `SanctioningRecord` in `DRAFT` status.

```ts
{
  governingBodyId: string;
  applicant: Applicant;
  proposal: TournamentProposal;
  sanctioningLevel?: string;
  sanctioningPolicy?: string;
}
```

**Returns:** `{ success, sanctioningRecord }`

---

### updateProposal

Updates proposal fields on a record in editable status (`DRAFT` or `MODIFICATION_REQUESTED`).

```ts
{
  sanctioningRecord: SanctioningRecord;
  updates: Partial<TournamentProposal>;
}
```

---

### addEventProposal / removeEventProposal / updateEventProposal

CRUD operations for event proposals within a sanctioning record.

```ts
// Add
{
  sanctioningRecord;
  eventProposal: EventProposal;
}
// Returns: { success, eventProposalId }

// Remove
{
  sanctioningRecord;
  eventProposalId: string;
}

// Update
{
  sanctioningRecord;
  eventProposalId: string;
  updates: Partial<EventProposal>;
}
```

---

### submitApplication

Transitions `DRAFT` → `SUBMITTED`. Validates endorsement if required by policy. Snapshots the policy version.

```ts
{ sanctioningRecord; sanctioningPolicy?: SanctioningPolicy; submittedBy?: string }
```

---

### reviewApplication

Transitions `SUBMITTED` → `UNDER_REVIEW`.

```ts
{ sanctioningRecord; reviewer?: Reviewer }
```

---

### approveApplication

Transitions `UNDER_REVIEW` or `CONDITIONALLY_APPROVED` → `APPROVED`.

```ts
{ sanctioningRecord; approvedBy?: string; reason?: string }
```

---

### conditionallyApprove

Transitions `UNDER_REVIEW` → `CONDITIONALLY_APPROVED` with conditions.

```ts
{ sanctioningRecord; conditions: Array<{ description: string }>; approvedBy?: string }
```

---

### meetCondition

Marks a condition as met. Returns `{ allConditionsMet: boolean }`.

```ts
{ sanctioningRecord; conditionId: string; metNotes?: string }
```

---

### rejectApplication

Transitions to `REJECTED` (terminal).

```ts
{ sanctioningRecord; rejectedBy?: string; reason?: string }
```

---

### withdrawApplication

Transitions to `WITHDRAWN` (terminal). Available from `DRAFT`, `SUBMITTED`, `CONDITIONALLY_APPROVED`, `APPROVED`, `MODIFICATION_REQUESTED`.

```ts
{ sanctioningRecord; withdrawnBy?: string; reason?: string }
```

---

### requestModification

Transitions to `MODIFICATION_REQUESTED`, making the proposal editable again.

```ts
{ sanctioningRecord; requestedBy?: string; note?: string }
```

---

### requestEndorsement / endorseApplication / declineEndorsement

Endorsement sub-workflow.

```ts
// Request
{ sanctioningRecord; endorserId: string; endorserName?: string; endorserContact?: PersonReference }

// Endorse
{ sanctioningRecord; endorserNotes?: string; conditions?: string[] }

// Decline
{ sanctioningRecord; declineReason?: string }
```

---

### addReviewNote

Adds a review note to the record.

```ts
{ sanctioningRecord; note: string; reviewerId?: string; reviewerName?: string }
```

**Returns:** `{ success, noteId }`

---

### openProposalRegistration

Opens (or adjusts) public registration on a proposal **before** a `tournamentRecord` exists. Assigns a `tournamentId` to the proposal (minting one if absent) so a public site can render a registration page against a not-yet-activated proposal, and gives each proposed event a stable `eventId`. Merges any supplied `registrationProfile` fields and ensures `entriesOpen` is set (opening now when no explicit value is present). Gated only against terminal statuses (`REJECTED`, `WITHDRAWN`, `CLOSED`); stricter workflow/policy is enforced by the consuming service.

```ts
{ sanctioningRecord; tournamentId?: string; registrationProfile?: Partial<RegistrationProfile> }
```

**Returns:** `{ success, tournamentId, registrationProfile }`

---

### activateFromSanctioning

Generates a `tournamentRecord` from an `APPROVED` sanctioning record and transitions to `ACTIVE`. Reuses the `tournamentId` and per-event `eventId`s already assigned by [`openProposalRegistration`](#openproposalregistration) — so registrations collected before activation remain valid — otherwise mints new ids.

```ts
{ sanctioningRecord; sanctioningPolicy?: SanctioningPolicy }
```

**Returns:** `{ success, tournamentRecord }`

---

### proposeAmendment

Proposes changes to an `APPROVED` or `ACTIVE` record. Minor amendments are auto-approved; substantial amendments require review.

```ts
{ sanctioningRecord; changes: ProposalChange[]; sanctioningPolicy?: SanctioningPolicy; proposedBy?: string }
```

**Returns:** `{ success, amendmentId, severity, autoApproved }`

---

### reviewAmendment

Approves or rejects a proposed amendment. Approved amendments apply their changes to the proposal.

```ts
{ sanctioningRecord; amendmentId: string; approved: boolean; reviewerNotes?: string }
```

---

### transitionToPostEvent

Transitions `ACTIVE` → `POST_EVENT`.

```ts
{ sanctioningRecord; transitionedBy?: string }
```

---

### submitComplianceItem / verifyComplianceItem / waiveComplianceItem

Compliance item lifecycle management.

```ts
// Submit
{ sanctioningRecord; itemId: string; value?: any }

// Verify
{ sanctioningRecord; itemId: string }
// Returns: { success, allCompliant: boolean }

// Waive
{ sanctioningRecord; itemId: string; reason?: string }
```

---

### flagComplianceIssues

Transitions `POST_EVENT` → `ISSUES_FLAGGED`.

```ts
{ sanctioningRecord; transitionedBy?: string; reason?: string }
```

---

### closeApplication

Transitions to `CLOSED` (terminal).

```ts
{ sanctioningRecord; closedBy?: string; reason?: string }
```

---

## Queries

### querySanctioningRecord

Returns a deep copy of the sanctioning record.

```ts
{
  sanctioningRecord;
}
```

---

### getAvailableTransitions

Returns valid status transitions for the record's current status.

```ts
{
  sanctioningRecord;
}
```

**Returns:** `{ success, availableTransitions: SanctioningStatus[] }`

---

### getStatusHistory

Returns the full status transition history.

```ts
{
  sanctioningRecord;
}
```

**Returns:** `{ success, statusHistory: StatusTransition[] }`

---

### getCompleteness

Returns a completeness score (0-100%) with missing fields.

```ts
{ sanctioningRecord; sanctioningPolicy?: SanctioningPolicy }
```

**Returns:** `{ success, completeness: { score, totalFields, completedFields, missingFields } }`

---

### getEligibleTiers

Returns which policy tiers the proposal qualifies for.

```ts
{
  proposal: TournamentProposal;
  sanctioningPolicy: SanctioningPolicy;
}
```

**Returns:** `{ success, eligibleTiers, tierEligibilities }`

---

### getCalendarConflicts

Detects scheduling conflicts using injected calendar context.

```ts
{
  sanctioningRecord;
  calendarContext: CalendarContext;
}
```

**Returns:** `{ success, conflicts, errors, warnings, hasConflicts }`

Conflict types: `PROXIMITY`, `SAME_WEEK`, `BLACKOUT`, `MAX_EVENTS_PER_WEEK`

---

### validateProposal

Validates proposal against policy and optional tier constraints.

```ts
{ proposal: TournamentProposal; sanctioningPolicy: SanctioningPolicy; sanctioningTier?: string }
```

**Returns:** `{ success, valid, issues, errors, warnings }`

Checks: insurance, safety plan, medical plan, anti-corruption, safeguarding, lead time, prize money, courts, event types, draw types, draw sizes, match formats, genders, qualifying, personnel.

---

### validateStatusTransition

Validates whether a status transition is allowed.

```ts
{
  fromStatus: SanctioningStatus;
  toStatus: SanctioningStatus;
}
```

**Returns:** `{ success, valid }` or `{ error }` with valid targets in context.
