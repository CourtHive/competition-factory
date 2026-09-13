---
title: Exit Propagation
---

## Overview

An **exit** is a matchUp that ended without being played out: `WALKOVER`, `DEFAULTED` or `RETIRED`.
A **double exit** is one where _both_ sides are out — `DOUBLE_WALKOVER` or `DOUBLE_DEFAULT` — so no
participant advances from it at all.

Recording an exit is not a local edit. It sets off a cascade: a winner may need advancing, a loser
may need feeding into a consolation structure, a BYE may need placing where nobody will arrive, and
each of those can in turn produce another exit further down the draw. **Exit propagation** is that
cascade.

This page describes what the engine guarantees while propagating, and the shapes a consumer will
see in the resulting data. It is distinct from [exit profiles](./exit-profiles), which describe the
_path_ a participant took between structures rather than the _status_ that travelled with them.

## The pending propagated exit

The shape most likely to surprise a consumer is a matchUp that is an exit, carries a `winningSide`,
and has **no participant on that winning side**.

That is not corruption. When a double exit occurs, the matchUp it feeds cannot yet be resolved: the
opponent has not arrived from the earlier round. The engine records the outcome that is already
known — the exit — and points `winningSide` at the still-empty slot that will receive whoever falls
through. When that participant arrives, the exit resolves onto them automatically.

```js
// A pending propagated exit
{
  matchUpStatus: 'WALKOVER',
  winningSide: 1,                 // side 1 is an empty feed slot
  sides: [
    { sideNumber: 1 },            // no participantId yet
    { sideNumber: 2, participantId: '...' },
  ],
}
```

Two consequences worth knowing:

- **A `winningSide` does not imply a winner is present.** Code that reads `winningSide` and
  dereferences the participant on that side must tolerate its absence. `isActiveMatchUp` and
  `isActiveDownstream` both distinguish a pending exit from a resolved one for this reason.
- **The matchUp is not finished.** It is waiting, and it will change again without any further
  action from the caller.

A _scored_ exit always has a participant on its winning side, so an exit whose winning side is
unoccupied can only be a pending propagated one.

## `propagateExitStatus`

Whether an exit status travels into the consolation structure at all is a scoring-policy decision.

| Setting                                        | Behaviour                                                            |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| `propagateExitStatus: false` (factory default) | the loser is directed normally; the exit status does not follow them |
| `propagateExitStatus: true`                    | the exit status is carried into the target structure                 |

It can be set on the scoring policy or passed per call to `setMatchUpStatus`. The USTA scoring
policy enables it; the factory default does not.

When it is on, `checkParticipants` relaxes its usual requirement so that a `WALKOVER`, `DEFAULTED`
or `DOUBLE_WALKOVER` may sit on a matchUp holding only one participant — which is exactly the
pending shape described above.

## BYE provenance: `byeFromPropagation`

When a double exit means nobody can arrive in a downstream slot, the cascade places a **BYE** there.
Unwinding that double exit later has to remove the BYEs the cascade placed — and only those.

`PositionAssignment.byeFromPropagation` records which BYEs those are.

```js
{
  drawPosition: 1,
  bye: true,
  byeFromPropagation: true,   // placed by an exit cascade, not by draw generation or by hand
}
```

It is a boolean and nothing more: it deliberately does **not** store the matchUpId that caused it,
because a stored reference can dangle once the source is removed and nothing consumes it.

The flag is first-class rather than an extension because `removeExtensions: true` is a supported
option on `getState` and `getTournament` — an extension marker would be destroyed by a routine deep
copy, and silently, which would return removal to the topology guess it replaced. It is cleared
wherever `bye` is cleared, in the same statement, and a BYE arriving at that drawPosition by any
other route clears any marker left behind rather than inheriting it.

Consumers do not normally need to read it. It is documented because it is visible in stored
tournament records and in anything that round-trips `positionAssignments`.

## Exit provenance: `sideExitProvenance`

When propagation produces an exit in a downstream matchUp, each side of that matchUp gets there for a
reason — one side because an upstream double exit delivered nobody, the other because of whatever
happened in its own feeder. `matchUp.sideExitProvenance` records those reasons, keyed by side.

```js
{
  1: { matchUpStatus: 'WALKOVER',  previousMatchUpStatus: 'DOUBLE_WALKOVER', sourceMatchUpId: '…' },
  2: { matchUpStatus: 'DEFAULTED', previousMatchUpStatus: 'DOUBLE_DEFAULT',  sourceMatchUpId: '…' },
}
```

`previousMatchUpStatus` is the upstream status that caused it; `matchUpStatus` is what this side was
given as a result; `sourceMatchUpId` identifies the matchUp whose exit produced the entry.

Two properties follow from what provenance _is_ — a record of where each side came from:

- **An entry is never `TO_BE_PLAYED`.** A side that has not been decided has no origin, so it gets no
  entry rather than one naming a status that is not an outcome. This matters because readers test the
  mere _presence_ of provenance to ask whether an exit was produced by propagation.
- **Origins accumulate.** One side's origin can become known before the other's — the second feeder
  may not have been played yet — so a write that knows only its own side adds to the record instead
  of replacing it.

**A known limit, since the field is visible in stored records.** On a consolation convergence the
stored entry can be present for only one of the two sides; the entries that _are_ there are correct.
Completing it is the work of making `matchUpStatusCodes` a projection of this field rather than a
parallel record — see [migration §11](/docs/migration-7.0.0#11-non-breaking-additions-worth-knowing).
Read the field per side and treat a missing side as unknown rather than as absent-of-exit.

### Why not `matchUpStatusCodes`

Because that array already holds three unrelated element shapes — the scoring policy's code
vocabulary, this provenance, and codes wrapped as `{ code }` — and provenance was **positional**
inside it: a side was an array _index_, padded with `''`. That made an entry impossible to address,
impossible to attribute to the exit that produced it, and easy for any reader assuming a string to
flatten. Keying by `sideNumber` removes the padding and the ambiguity together.

### Why this one carries a matchUpId when `byeFromPropagation` refuses to

The BYE marker is a boolean on purpose: a stored reference can dangle once its source is removed, and
nothing needed the identity. Provenance is the opposite case — unwinding one exit while another
still stands requires knowing _which_ entry belongs to the exit being removed, and that is precisely
what a boolean cannot say.

The dangling risk is answered by symmetry rather than by omission: provenance is cleared at every
site that blanks `matchUpStatusCodes`, and that clear is deliberately **not** gated on the schema
write mode. The write mode decides whether the field is written; it must never decide whether stale
state is removed.

Consumers do not normally need to read it. It is documented because it is visible in stored
tournament records.

## Guarantees

These hold as of 7.0.0 and are enforced by the
[exit-propagation harness](/docs/testing/exit-propagation-harness).

### Re-applying the same double exit does nothing

Asking for the state a matchUp is already in is _satisfied_, not repeated. Sending the identical
double-exit outcome twice returns success and writes nothing the second time.

This matters because it did not always hold: the second call used to re-run the cascade, which then
read its own earlier work as a _second_ source exiting into the same target, escalated the produced
`WALKOVER` to a `DOUBLE_WALKOVER`, and cascaded a round further — with both calls reporting success.
A client retry or a double-click corrupted the draw progressively and silently.

A genuine _change_ still propagates. `DOUBLE_WALKOVER` to `DOUBLE_DEFAULT` is a change, not a
repeat.

### A rejected mutation does not alter the draw when you ask for that

A rejected call cannot destroy a result that was already recorded, including a pending propagated
exit. The specific defect behind this guarantee is closed: a bare `{ winningSide }` outcome is now
validated _before_ any removal runs, where it used to skip the early participant check and be caught
only after the existing result had been unwound.

**The general guarantee is opt-in, and this is worth being precise about.** Pass
`rollbackOnError: true` and a refused mutation leaves the draw byte-identical: the engine snapshots
before the call and restores on error, and the queued notices are discarded with it, so subscribers
are not told about changes that were undone. Measured over a 600-seed randomized sweep, every case
where the default call returned an error _after_ changing the draw left it unchanged with the flag —
45 of 45.

Without the flag, a mid-cascade refusal can still return an error over a partially changed draw. The
remaining cases are position-assignment refusals raised deep in the cascade and they are being
closed one root cause at a time, but the honest statement today is that atomicity is something you
request rather than something every path provides.

`executionQueue` snapshots for the whole queue, so TMX and competition-factory-server — which pass
`rollbackOnError: true` on every mutation — already have this. A consumer calling `setMatchUpStatus`
directly should pass it.

If you are writing a client, an error response with the flag needs no compensating action. It does
**not** mean every rejection is a no-op for your UI: the request was refused, and the reason in the
error is worth surfacing.

### Which double exit a convergence becomes does not depend on entry order

Two exits can converge on one matchUp — each side arriving because its own feeder produced nobody.
The matchUp becomes a double exit, and **which** one is derived from both sides' origins, not from
whichever result was entered last.

- both sides originating in a default → `DOUBLE_DEFAULT`
- any other combination, including a default meeting a walkover → `DOUBLE_WALKOVER`

A mixture takes the weaker claim deliberately. A default is a referee's ruling against a named
player; in a mixed convergence one side merely failed to appear, and the collapsed status is a single
field shared by both sides — so it states only what is true of both. The per-side origins are kept
separately in [`sideExitProvenance`](#exit-provenance-sideexitprovenance).

This did not always hold. The flavour used to be read from the arriving source alone, which made the
stored `matchUpStatus` a function of the order an operator entered the two results: measured across
eight draw types, entering the same two outcomes the other way round produced a different record in
28 of 32 combinations.

### What a double exit produces downstream keeps its flavour

A `DOUBLE_WALKOVER` produces a `WALKOVER` in the matchUp it feeds; a `DOUBLE_DEFAULT` produces a
`DEFAULTED`. A mixed convergence is a `DOUBLE_WALKOVER` by the rule above, so it produces a
`WALKOVER` — and that walkover is not attributable to any one upstream participant, which is the
point of choosing the weaker label.

### Nothing to do is success, not failure

Several situations look like a failure to place a participant but are simply an absence of one. The
clearest is a pending propagated exit whose losing side is an empty feed slot: there is no loser to
direct into the consolation _yet_, and one will be directed when the slot fills. These return
success.

## Statuses that do not propagate

- **`RETIRED`** is an exit for the purpose of activity checks, but it is **not** carried into a
  consolation structure — a retirement is a completed match with a winner, so the loser is directed
  normally.
- **`BYE`** is not an exit. It is an absence of an opponent, and it propagates by advancing the
  participant who has no one to play.

## Related

- [Exit Profiles](./exit-profiles) — the path a participant took between structures
- [Finishing Positions](./finishing-positions) — how positions are derived across linked structures
- [Draw Links](./draw-links) — how losers reach a target structure
- [Exit-propagation harness](/docs/testing/exit-propagation-harness) — how these guarantees are tested
