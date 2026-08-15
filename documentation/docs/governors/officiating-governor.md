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
{ officialRecord; tournamentId: string; roleSubtype: string; assignedDate?: string; startDate?: string; endDate?: string;
  // Conflict-of-interest gate (opt-in) — see getOfficialConflicts
  policyDefinitions?: PolicyDefinitions; participants?: Participant[]; nationalityCode?: string; organisationIds?: string[] }
// Returns: { success, assignment, conflicts? }

// Remove
{ officialRecord; assignmentId: string }
```

```ts
// tournament-scoped declarations work on this route too
{ officialRecord; tournamentId; roleSubtype;
  policyDefinitions?; participants?;
  officialParticipantId?; groupParticipants?;   // SHARED_GROUPING inputs
  nationalityCode?; organisationIds? }
```

#### One input set, forwarded whole

Every route that can evaluate a conflict accepts `ConflictEvaluationInputs` and forwards it **whole** via
`conflictInputsFrom()`. Adding a new input means editing `CONFLICT_INPUT_KEYS` once; every route inherits
it.

This is structural, not stylistic. Routes used to hand-list the fields they forwarded, and when the
tournament-scoped inputs (`officialParticipantId` + `groupParticipants`) were added, one route forwarded
them and the other did not — so the same conflict blocked a per-matchUp assignment and passed on the
tournament-level one. A rule that applies or not depending on which route the operator used is worse than
no rule, because it looks enforced. A conformance test now fails, naming the route and the key, if any
route drops an input.

`participants` is deliberately outside the set: it is route-specific (supplied by the caller on
`assignOfficial`, derived from the matchUp's sides on `getMatchUpOfficialConflicts`).

Both assignment routes see the same declarations. Without `officialParticipantId` + `groupParticipants`
this route would see only registry declarations, so a GROUP-expressed conflict would block per-matchUp and
pass here — same feature, two routes, different answers.

Note `officialRecord` **is** required here, unlike `getOfficialConflicts`: `assignOfficial` mutates the
record (it pushes an assignment onto it).

The conflict gate is **opt-in**: with no `policyDefinitions` the assignment behaves exactly as before.
Supply a conflict policy _and_ `participants` and the assignment is checked first — a `BLOCK`-severity
conflict returns `{ error: OFFICIAL_CONFLICT_OF_INTEREST, conflicts }` and records nothing, while
`WARN`-severity conflicts are returned alongside a successful `assignment` so the caller can surface them.

Supplying a policy **without** `participants` is an error (`MISSING_CONFLICT_PARTICIPANTS`), not a silent
pass: a check that could not run must not be indistinguishable from a check that found nothing.

---

### transitionAssignmentStatus

```ts
{ officialRecord; assignmentId: string; toStatus: AssignmentStatus; transitionedBy?: string; reason?: string }
```

---

### addConflictDeclaration / removeConflictDeclaration

Records a relationship the official has declared. Self-declaration is how federations administer conflicts
of interest — the factory cannot infer that an official coaches a player, so the declaration is the record
of it.

```ts
// Add — one of personId, participantId or organisationId is REQUIRED
{ officialRecord; personId?: string; participantId?: string; organisationId?: string;
  relationship?: string; declaredAt?: string; declaredBy?: string; notes?: string }
// Returns: { success, declaration }

// Remove
{ officialRecord; declarationId: string }
```

A declaration that identifies nothing is refused (`INVALID_VALUES`) — it could never match a participant,
so accepting it would create a record that looks like a disclosure while checking nothing.

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
{
  officialRecord;
  evaluationPolicy: EvaluationPolicy;
}
```

---

## Queries

### queryOfficialRecord

```ts
{
  officialRecord;
}
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

---

### getOfficialConflicts

Evaluates an official against a tournament's entered participants and returns every conflict of interest
the supplied policy declares interest in. Pure and side-effect free — the caller supplies the participants,
so the query makes no assumption about where the tournament record lives.

```ts
{ officialRecord; participants?: Participant[]; nationalityCode?: string; organisationIds?: string[];
  policyDefinitions?: PolicyDefinitions }
```

**Returns:** `{ success, conflicts, blocked }` — `blocked` is true when any conflict carries `BLOCK` severity.

#### Rules

| Rule                    | Detects                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `SAME_PERSON`           | The official is themselves entered in the tournament.                                          |
| `DECLARED_RELATIONSHIP` | A declaration matches an entered participant by `personId` or `participantId`.                 |
| `NATIONALITY`           | The official's `nationalityCode` matches a participant's nationality (or `representing`).      |
| `ORGANISATION`          | A declared — or supplied — organisation matches a participant's `person.parentOrganisationId`. |

`nationalityCode` must be supplied by the caller: an `OfficialRecord` carries no person detail, so the
official's own nationality cannot be derived from it.

#### Two declaration sources — either is sufficient

`officialRecord` is **optional**. A conflict declaration can come from either:

| source                   | scope                      | supplied as                                   |
| ------------------------ | -------------------------- | --------------------------------------------- |
| registry (courthive-ams) | durable, cross-tournament  | `officialRecord.conflictDeclarations`         |
| tournamentRecord         | transient, this event only | `officialParticipantId` + `groupParticipants` |

Supplying **neither** is an error (`MISSING_CONFLICT_SOURCE`).

The tournament-scoped source exists because expecting officials to keep a global registry current is
unrealistic — and an empty registry would otherwise make every check return "no conflicts", which is
indistinguishable from a check that passed. A tournament assignment is the natural moment to capture a
relationship, so the declaration lives where it is created.

A `GROUP` participant containing the official and one or more competitors **is** the declaration. Create
it with `createGroupParticipant({ groupName, individualParticipantIds, participantRole })`.

#### `participantRole` marks an authored relationship

`SHARED_GROUPING` defaults to `WARN`, because `GROUP` is a general primitive — squads and
attribute-derived groupings are legitimate and would otherwise false-positive. The GROUP's own
`participantRole` distinguishes an authored relationship from an incidental one, and `ConflictRule.roleSeverity`
escalates per role:

```ts
[CONFLICT_SHARED_GROUPING]: {
  enabled: true,
  severity: CONFLICT_WARN,                       // incidental groupings
  roleSeverity: { COACH: 'BLOCK', MEDICAL: 'BLOCK', PHYSIO: 'BLOCK', TRAINER: 'BLOCK' },
}
```

`createGroupParticipant` defaults `participantRole` to `OTHER`, so an unspecified grouping carries `OTHER`,
is absent from `roleSeverity`, and falls through to the base severity.

A rule that is absent from the policy, or present with `enabled: false`, is **not evaluated at all** — a
policy is an allow-list of checks, never a silent partial application.

#### Policies

`POLICY_OFFICIATING_CONFLICT_OF_INTEREST` (default) blocks on `SAME_PERSON` and `DECLARED_RELATIONSHIP`,
warns on `ORGANISATION`, and leaves `NATIONALITY` **disabled**. Shared nationality is disqualifying at
ITF-level international events and meaningless at national ones, where every official necessarily shares
the players' nationality — enabling it by default would make the check noise at most events.

`POLICY_OFFICIATING_CONFLICT_OF_INTEREST_ITF` enables all four rules at `BLOCK`.

---

### getMatchUpOfficialConflicts

The per-matchUp counterpart to `getOfficialConflicts`. Resolves the sides of a single matchUp — expanding
any PAIR/TEAM side to the individuals within it — and evaluates the official against just those
participants.

```ts
{ officialRecord; tournamentRecord; drawDefinition; matchUpId: string; event?: Event;
  nationalityCode?: string; organisationIds?: string[]; policyDefinitions?: PolicyDefinitions }
```

**Returns:** `{ success, conflicts, blocked, checkedParticipants }`

Scoping to one matchUp is the sharper check — a chair umpire who shares a nationality with someone in a
different quarter of the draw is not a conflict for _this_ assignment. Only participants actually assigned
to the matchUp's sides are evaluated; **potential** participants (those who could still advance into it)
are deliberately excluded, since treating every possible opponent as a conflict would block most
early-round assignments.

Note this resolves the matchUp `inContext`: a raw drawDefinition matchUp carries only `drawPosition` on its
sides, and participantIds come from the structure's `positionAssignments` during hydration.

#### Gating `addMatchUpOfficial`

`addMatchUpOfficial` (scheduleGovernor) accepts the same opt-in gate as `assignOfficial`:

```ts
{ matchUpId; participantId; officialType?;
  policyDefinitions?; officialRecord?; nationalityCode?; organisationIds? }
// Returns: { success, conflicts? } | { error: OFFICIAL_CONFLICT_OF_INTEREST, conflicts }
```

With no `policyDefinitions` the behaviour is unchanged. With a policy, an `officialRecord` is **required** —
a policy supplied without one is an error, not a pass. `BLOCK` refuses the assignment and writes nothing;
`WARN` conflicts return alongside the successful assignment.

The two routes cover different scopes and are independent:

| route                                   | scope                                            |
| --------------------------------------- | ------------------------------------------------ |
| `assignOfficial` (officiatingGovernor)  | the official's tournament-level engagement       |
| `addMatchUpOfficial` (scheduleGovernor) | a specific matchUp — `matchUp.schedule.official` |
