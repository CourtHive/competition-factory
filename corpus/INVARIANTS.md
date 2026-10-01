# Corpus vocabulary: invariants and properties

A scenario names what was checked on it. The names are an enum in `corpus.schema.json`, so a
scenario cannot claim a check this document does not define, and a consumer cannot be asked to
implement one. Each definition below is quoted from the harness that implements it in TypeScript
(`src/tests/testHarness/exitPropagation/invariants.ts` and `properties.ts`); the harness is the
authority and this file follows it. Adding a name means adding it in all three places.

## Invariants

An invariant is a statement about ONE state. It must hold on `initial.record` and on the state
after every step.

### `PARTICIPANT_DUPLICATED_IN_STRUCTURE`

Within one structure, no `participantId` occupies two `positionAssignments`.

> "PARTICIPANT_DUPLICATED_IN_STRUCTURE is the residue signature of an advancement that ran twice —
> the shape a non-idempotent cascade leaves behind."

Checked per structure, recursively through nested `structures`. Reported with the `structureId`
and both `drawPosition` values.

### `BYE_POSITION_WITH_PARTICIPANT`

No `positionAssignment` carries both `bye: true` and a `participantId`.

> "A participant cannot simultaneously be a BYE."

## Properties

A property is a statement about a mutation and its inverse, which no single-state check can
express. The harness formulates each so that a legitimate refusal is not a violation:

> "Each is formulated so a legitimate REFUSAL is not a violation. The engine is entitled to decline
> a clear (PROPAGATED_EXITS_DOWNSTREAM, CANNOT_CHANGE_WINNING_SIDE); what it is not entitled to do
> is accept one and leave residue behind."

A property is checked by the writer when the scenario is generated; the scenario records that it
was. A consumer re-checks it by replaying the step pair the property describes.

### `DO_UNDO_IDENTITY`

> "DO_UNDO_IDENTITY — applying an outcome and then clearing it must restore the prior draw."

The residue detector: a cascade that writes N matchUps forward and unwinds N-1 of them leaves a
draw that passes every single-state check. The canonical hash of the draw before the outcome and
after the clear must be equal.

### `IDEMPOTENT_REAPPLY`

> "IDEMPOTENT_REAPPLY — applying the identical outcome twice must not write twice."

The canonical hash after the first application and after the second must be equal, and the second
application must not be refused for a reason the first was not.

### `MONOTONIC_DECISION`

> "MONOTONIC_DECISION — scoring a fresh matchUp must not un-decide a REAL one."

A matchUp holding a participant or a winner before the step still holds it after, unless the step
targeted that matchUp. Placeholder decisions (a pending propagated exit with no participant) are
not REAL for this purpose; see the harness comment for the 2026-09-21 reclassification.
