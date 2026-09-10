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

### A rejected mutation does not alter the draw

If `setMatchUpStatus` returns an error, the draw is unchanged. In particular, a rejected call cannot
destroy a result that was already recorded — including a pending propagated exit.

If you are writing a client, this means an error response needs no compensating action. It does
**not** mean every rejection is a no-op for your UI: the request was refused, and the reason in the
error is worth surfacing.

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
