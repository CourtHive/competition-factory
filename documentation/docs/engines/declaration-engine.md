---
title: Declaration Engine
---

## Overview

A **declaration-style engine** manages a keyed collection of aggregate **records** — each identified by a stable id (typically a `personId`-scoped record id) — that move through **lifecycle state machines** and are mutated through a **directive queue**. Unlike the tournament engine, a declaration engine keeps its own state store and is **not** part of the tournament-record mutation path.

The factory already ships two such engines:

- **`officiatingEngine`** — official records with certification / evaluation / assignment lifecycles.
- **`sanctioningEngine`** — sanctioning records with a 12-state application lifecycle.

These two were originally hand-copied from each other. The **Declaration Engine toolkit** (`src/functions/declaration/`) factors their shared machinery into four reusable, population-agnostic primitives, so both engines — and future ones (e.g. a player availability / registration engine) — build on one foundation.

:::note No breaking changes
This is an internal consolidation. The public surfaces of `officiatingEngine` and `sanctioningEngine` — every method name, result shape, and error `code`/`context` — are unchanged. Behavior is preserved byte-for-byte, verified by the existing engine test suites.
:::

## The toolkit

| Primitive                 | Responsibility                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createRecordStore`       | An in-memory keyed-record store: `records` map, an "active record" pointer, and a small method registry. Each engine gets its **own** store — state is never shared between engines. |
| `registerCreatedRecord`   | The create-register-activate step: validate a domain builder's result, reject a duplicate id, persist, and set the new record active.                                                |
| `transitionRecordStatus`  | A generic finite-state-machine step over a keyed sub-collection: validate the transition against a machine definition, append `statusHistory`, and set the new status.               |
| `executeDeclarationQueue` | The directive / pipe / rollback pipeline: run an array of `{ method, params, pipe }` directives against the engine, snapshotting for rollback-on-error.                              |

## The injection principle (what and why)

Each domain has its **own vocabulary**: an official record is keyed by `officialRecordId`, a sanctioning record by `sanctioningId`; a bad assignment transition emits `INVALID_OFFICIATING_STATUS_TRANSITION`, not a generic error. If the shared primitives emitted their own generic errors and field names, every consuming domain's observable output would change — breaking callers and tests.

The toolkit avoids this by **injection**: the generic primitive never names a domain concept inline. The id field name, the state-machine definition, and every domain error object are passed in by the consumer. The primitive attaches the shared structure (e.g. the `{ fromStatus, toStatus, validTargets }` context on an invalid transition); the consumer supplies the identity. The result is that officiating reproduces its exact errors while a future player engine supplies its own — from the same code.

### `transitionRecordStatus`

```ts
transitionRecordStatus({
  record,                 // the aggregate holding the sub-collection
  collectionKey,          // 'assignments' | 'certifications' | 'evaluations'
  idKey,                  // 'assignmentId' | ...
  entityId,
  toStatus,
  machineDef,             // Record<Status, Status[]> adjacency map (e.g. VALID_ASSIGNMENT_TRANSITIONS)
  resultKey,              // 'assignment' — the key the result is returned under
  errors: {               // INJECTED per-domain error objects
    missingRecord,
    notFound,
    invalidTransition,
  },
  preTransition?,         // optional domain guard, e.g. "policy scores present before SUBMITTED"
  transitionedBy?,
  reason?,
});
```

With injection, the three officiating transition functions collapse to one call each:

```ts
export function transitionAssignmentStatus({ officialRecord, assignmentId, toStatus, transitionedBy, reason }) {
  return transitionRecordStatus({
    record: officialRecord,
    collectionKey: 'assignments',
    idKey: 'assignmentId',
    entityId: assignmentId,
    toStatus,
    transitionedBy,
    reason,
    machineDef: VALID_ASSIGNMENT_TRANSITIONS,
    resultKey: 'assignment',
    errors: {
      missingRecord: MISSING_OFFICIAL_RECORD,
      notFound: ASSIGNMENT_NOT_FOUND,
      invalidTransition: INVALID_OFFICIATING_STATUS_TRANSITION,
    },
  });
}
```

A domain-specific pre-condition (officiating's "required scores must be present before an evaluation is submitted") is expressed as an injected `preTransition` hook rather than forked into the primitive.

### `executeDeclarationQueue`

The queue is population-agnostic given the engine's method surface and its store accessors:

```ts
executionQueue: (directives, rollbackOnError) =>
  executeDeclarationQueue({
    engine,
    directives,
    rollbackOnError,
    getRecords: getOfficialRecords, // snapshot for rollback
    setRecords: setOfficialRecords, // restore on error
  }),
```

## Building a new declaration engine

A new engine (for example, a player declarations engine) composes the toolkit and supplies only its domain vocabulary:

```ts
// 1. a store, keyed by the domain id, with the domain not-found error
const store = createRecordStore({ idKey: 'declarationId', notFoundError: DECLARATION_NOT_FOUND });

// 2. a create wrapper that rejects duplicates and activates the new record
createDeclaration: (params) =>
  registerCreatedRecord({
    result: buildDeclaration(params),
    recordKey: 'declaration',
    idKey: 'declarationId',
    getRecord: store.getRecord,
    setRecord: store.setRecord,
    setActiveId: store.setActiveId,
    existsError: DECLARATION_EXISTS,
  }),

// 3. lifecycle transitions over the domain's own machine definition
// 4. a shared executionQueue via executeDeclarationQueue(...)
```

Everything population-specific — the record shape, the state machines, the error constants — stays in the consuming engine. The toolkit owns the mechanics that were previously copied.

## Player availability (Phase 1)

The first consumer of the declarations tier is **player availability** — a person's self-declared, per-day willingness to be scheduled. Factory owns two pure pieces of this: the payload types and a translation helper. It deliberately does **not** own the availability record's persistence or a dedicated engine instance — that lives in the declarations service (off the tournament-record path).

### Payload

```ts
// src/types/declarationTypes.ts
type DayState = 'AVAILABLE' | 'IF_NEEDED' | 'UNAVAILABLE'; // absent from `days` = NOT_SET

type AvailabilityPayload = {
  span: { from: string; to: string }; // rolling window, 'YYYY-MM-DD'
  days: { [date: string]: DayState }; // sparse per-day map
  timeAway?: { from: string; to: string; reason?: string }[]; // date ranges forcing UNAVAILABLE
  currentThroughWeek?: string; // advisory "up to date as of" nudge
};
```

Per-day, no times, in v1 — matching the reference collection UX. Time-of-day windows are a later extension gated on the factory timezone work.

### `translateAvailabilityToPersonRequests`

A pure function (no engine, no persistence) mapping a person's availability to the scheduler's existing negative vocabulary, windowed to a tournament's scheduled dates:

```ts
import { translateAvailabilityToPersonRequests } from 'tods-competition-factory';

const { requests, ifNeededDates } = translateAvailabilityToPersonRequests({
  availability, // AvailabilityPayload
  dates, // the tournament's scheduled dates, 'YYYY-MM-DD'[]
});
// requests → apply via executionQueue([{ method: 'addPersonRequests', params: { personId, requests } }])
```

The three positive day-states translate as:

| DayState              | Scheduler effect                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `UNAVAILABLE`         | A whole-day (`00:00`–`23:59`) `DO_NOT_SCHEDULE` personRequest — honored by `checkRequestConflicts` |
| `IF_NEEDED`           | Advisory only — returned in `ifNeededDates`, never a request (no scheduler enforcement in v1)      |
| `AVAILABLE`/`NOT_SET` | No constraint                                                                                      |

A day inside any `timeAway` range is a hard `UNAVAILABLE` override, regardless of its explicit `days` state. Only dates present in the `dates` window produce output, so the same cross-tournament availability declaration windows cleanly to whichever tournament pulls it. This "translate first" path reuses the scheduler's first-class `DO_NOT_SCHEDULE` input and adds **zero** new engine surface.

## Related

- **[Custom Engines](./custom-engines)** — assembling engine facades from factory functions
- **[Time Items](../concepts/timeItems)** — the temporal records used by scheduling lifecycles
- **[Factory Errors](./factory-errors)** — the result-envelope + error-object convention the injected errors follow
