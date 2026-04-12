---
title: Officiating Governor
---

```js
import { officiatingGovernor } from 'tods-competition-factory';
```

The **officiatingGovernor** re-exports all officiating mutation and query functions for use outside the officiating engine. While the `officiatingEngine` provides a complete stateful API, the governor exports individual functions that can be called directly with an `officialRecord` parameter.

For full engine documentation including state management, executionQueue, state machines, and workflow examples, see [Officiating Engine](../engines/officiating-engine.md).

---

## Mutations

### createOfficialRecord

Creates a new `OfficialRecord` with empty arrays for certifications, evaluations, assignments, and suspensions.

```ts
{ personId: string; organisationId?: string; officialRecordId?: string }
```

**Returns:** `{ success, officialRecord }`

---

### addCertification / modifyCertification / removeCertification

CRUD operations for certifications within an official record.

```ts
// Add
{ officialRecord; organisationId: string; certificationFamily: string; certificationLevel?: string; status?: string; validFrom?: string; validUntil?: string }
// Returns: { success, certification }

// Modify
{ officialRecord; certificationId: string; updates: Partial<OfficialCertification> }

// Remove
{ officialRecord; certificationId: string }
```

---

### transitionCertificationStatus

Validates transition against `VALID_CERTIFICATION_TRANSITIONS` and records status history.

```ts
{ officialRecord; certificationId: string; toStatus: CertificationStatus; transitionedBy?: string; reason?: string }
```

**Returns:** `{ success, certification }`

---

### addEvaluation / modifyEvaluation / removeEvaluation

CRUD operations for performance evaluations. Modify is restricted to `DRAFT` or `REJECTED` status.

```ts
// Add
{ officialRecord; evaluatorPersonId: string; overallRating: number; scores?: EvaluationScore[]; policyName?: string; tournamentId?: string; matchUpId?: string; comments?: string }
// Returns: { success, evaluation }

// Modify
{ officialRecord; evaluationId: string; updates: Partial<OfficialEvaluation> }

// Remove
{ officialRecord; evaluationId: string }
```

---

### transitionEvaluationStatus

Validates transition. On `SUBMITTED`, validates required criterion scores against the linked evaluation policy.

```ts
{ officialRecord; evaluationId: string; toStatus: EvaluationStatus; transitionedBy?: string; reason?: string }
```

---

### assignOfficial / removeOfficialAssignment

```ts
// Assign
{ officialRecord; tournamentId: string; roleSubtype: string; assignedDate?: string; startDate?: string; endDate?: string }
// Returns: { success, assignment }

// Remove
{ officialRecord; assignmentId: string }
```

---

### transitionAssignmentStatus

```ts
{ officialRecord; assignmentId: string; toStatus: AssignmentStatus; transitionedBy?: string; reason?: string }
```

---

### addSuspension / removeSuspension

```ts
// Add
{ officialRecord; suspensionType?: string; suspensionNotes?: string; suspendedFrom?: string; suspendedUntil?: string }
// Returns: { success, suspension }

// Remove
{ officialRecord; suspensionId: string }
```

---

### addCertificationRequirement

Defines organisational prerequisites for a certification level. Used by `getOfficialEligibility`.

```ts
{ officialRecord; certificationFamily: string; certificationLevel: string; organisationId: string; requirements: string[]; prerequisiteLevels?: string[]; minimumAssignments?: number; minimumEvaluationScore?: number }
```

---

### addEvaluationPolicy

Attaches an evaluation template (sections, criteria, scoring method) to the official record.

```ts
{ officialRecord; evaluationPolicy: EvaluationPolicy }
```

---

## Queries

### queryOfficialRecord

```ts
{ officialRecord }
```

**Returns:** `{ success, officialRecord }` — the full record structure.

---

### getOfficialCertifications

```ts
{ officialRecord; certificationFamily?: string; certificationLevel?: string; organisationId?: string; activeOnly?: boolean }
```

**Returns:** `{ success, certifications }`

---

### validateCertification

Checks status and date validity for a specific certification.

```ts
{ officialRecord; certificationId: string; asOfDate?: string }
```

**Returns:** `{ success, valid, reasons, certification }`

---

### getEvaluationSummary

Computes average rating from `APPROVED` evaluations.

```ts
{ officialRecord; policyName?: string }
```

**Returns:** `{ success, summary: { evaluationCount, averageRating } }`

---

### getEvaluationTemplate

Converts an evaluation policy into a flat array of `EvaluationFormField` objects for UI rendering.

```ts
{ officialRecord?; policyName?: string; evaluationPolicy?: EvaluationPolicy }
```

**Returns:** `{ success, fields, evaluationPolicy }`

---

### getOfficialEligibility

Checks whether an official meets all requirements for a certification: active cert, no suspensions, minimum assignments, minimum evaluation score, prerequisite levels.

```ts
{ officialRecord; certificationFamily: string; certificationLevel?: string; organisationId?: string; asOfDate?: string }
```

**Returns:** `{ success, eligible, reasons }` — `reasons` is empty when eligible.

---

### getOfficialAssignments

```ts
{ officialRecord; tournamentId?: string; roleSubtype?: string; status?: string }
```

**Returns:** `{ success, assignments }`
