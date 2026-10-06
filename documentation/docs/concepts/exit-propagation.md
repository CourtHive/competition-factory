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
see in the resulting data. It is distinct from [exit profiles](./exit-profiles.md), which describe the
_path_ a participant took between structures rather than the _status_ that travelled with them.

## The pending propagated exit

Two pending shapes exist, and they differ in whether a `winningSide` is recorded before anyone arrives.

**A carried exit.** With `propagateExitStatus` on, a `WALKOVER` or `DEFAULTED` follows the loser into
the matchUp they are fed to. The exiting participant is present; their opponent may not be. The engine
records the exit and points `winningSide` at the opponent's side, **even when that side is still
empty**: the outcome is already known, and whoever arrives there wins it.

```js
// A carried exit, opponent not yet arrived
{
  matchUpStatus: 'WALKOVER',
  winningSide: 1,                 // side 1 is an empty feed slot
  sides: [
    { sideNumber: 1 },            // no participantId yet
    { sideNumber: 2, participantId: '...' },  // the participant who carried the exit in
  ],
}
```

**A produced exit.** A double exit sends nobody forward, so the matchUp it feeds receives a produced
`WALKOVER` (or `DEFAULTED`) with **no `winningSide`** while the opponent has not arrived. The award is
made when they do. CA, 2026-09-20: _"that is unnecessary if the winningSide will display the
checkmark once a participant arrives... so, you don't need to keep it."_ The one exception is an
opponent who is already in place: the winner is then read off their side at once, because no arrival
is still coming to resolve it.

A BYE that carries a produced exit on does not change how it lands. CA, 2026-10-03: a produced exit
advanced past a BYE is still a produced exit, so it lands pending, as it would without the BYE. A
seat that a feed link has reserved for a participant who has not arrived yet is not an opponent in
place, even though it already holds a drawPosition.

```js
// A produced exit, opponent not yet arrived
{
  matchUpStatus: 'WALKOVER',
  winningSide: undefined,         // awarded when a participant arrives
  sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
}
```

Two consequences worth knowing:

- **A `winningSide` does not imply a winner is present**, and an exit does not imply a
  `winningSide`. Code that reads `winningSide` and dereferences the participant on that side must
  tolerate both. `isActiveMatchUp` and `isActiveDownstream` distinguish a pending exit from a resolved
  one for this reason.
- **The matchUp is not finished.** It is waiting, and it will change again without any further
  action from the caller.

Both shapes are measured by the outcome pipeline's differential mode on every exit the suite enters
(`src/mutate/matchUps/outcome/`).

## `propagateExitStatus`

Whether an exit status travels into the consolation structure at all is a scoring-policy decision.

| Setting                                        | Behaviour                                                            |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| `propagateExitStatus: false` (factory default) | the loser is directed normally; the exit status does not follow them |
| `propagateExitStatus: true`                    | the exit status is carried into the target structure                 |

It can be set on the scoring policy or passed per call to `setMatchUpStatus`. Since 7.5.0 a policy
that sets the flag, `true` or `false`, wins over the call; the call decides only where the policy is
silent (`policy ?? param`). The USTA scoring policy enables it; the factory default policy is silent
on it, so it is off unless the call turns it on.

The flag does not decide whether an exit may stand on a matchUp holding only one participant.
Since 7.5.0 a `WALKOVER` or `DEFAULTED` can be recorded before the second opponent arrives with the
flag on or off; the flag decides only whether an exit is then carried into the loser's next matchUp.
A direct double exit needs both seats reached; only the cascade's own write may place one beside a
seat nobody has reached. The rules for who may receive the exit are in
[the outcome pipeline § 2.1](./outcome-pipeline.md#21-who-may-receive-a-directing-outcome).

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
- **An origin sits on the matchUp its source feeds, on its seat's side.** Since 7.7.0 an entry naming a
  source in the same structure is written only on that source's own next matchUp, never on a later round
  the same participant had reached, and it is keyed to the side the source's position holds there,
  which roundPosition order does not predict where fed positions interleave with advanced ones. The one
  entry found further on is an exit relayed past BYEs (below). When the occupants change sides as the
  seats fill and empty, the entries move with them.

**A known limit, since the field is visible in stored records.** On a consolation convergence the
stored entry can be present for only one of the two sides; the entries that _are_ there are correct.
Completing it is the work of making `matchUpStatusCodes` a projection of this field rather than a
parallel record — see [migration §12](/docs/migration-7.0.0#12-non-breaking-additions-worth-knowing).
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

These hold as of 7.0.0, or as of the release each states, and are enforced by the
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

`executionQueue` snapshots for the whole queue, so TMX and competition-factory-server — which pass
`rollbackOnError: true` on every mutation — already have this. A consumer calling `setMatchUpStatus`
directly should pass it.

The flag can only restore what an error reports, so the cascade reports every error. Since 7.5.0 any
write the cascade makes that fails, fails the call, and a refusal raised inside the cascade is
returned to the caller rather than dropped behind a success. Before that, a call could report
success over a draw the cascade had left half-written, and `rollbackOnError` had nothing to act on.

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

### A correction lands where the direct entry lands

Enter the wrong outcome, then correct it, and the draw is the one you would have had by entering
the right outcome first — status, winner and seats alike, in every matchUp the mistake could have
touched. Enforced since 7.4.0 by the deep-correction oracle: 1,600 cells across seventeen draw
types, each playing a twelve-step prefix with exits planted along the way, then taking the deepest
exit back and comparing the two routes. The baseline is **zero severe divergences**; the only
cells it does not compare are the four where the engine refuses the correct outcome outright, and
those are recorded rather than counted.

Three rules fell out of making this hold, each a defect that only the order of entry exposed:

- **A seat advanced by its opponent's BYE keeps that advancement when its occupant leaves.** A fed
  seat beside a draw BYE is advanced from generation, before anybody sits on it. The advancement
  never depended on the occupant, so clearing the occupant — a corrected walkover, a position
  action — leaves the seat where it was; it is not torn down and the BYE's seat advanced in its
  place. (This is also why a BYE placed on a seat that is already advanced and alone now feeds
  the loser link its BYE.)
- **Clearing a double exit withdraws the BYE it propagated, all the way.** Removing a
  `DOUBLE_WALKOVER` takes back the BYE it placed on the consolation seat, the BYE's advancement
  into later rounds, and the `byeFromPropagation` marker — whether the double exit was in the
  first round or a later one.
- **A produced exit arrives on the side its seat already holds.** Where fed seat numbers
  interleave with advanced ones, feeder order predicts the wrong side; when the target already
  holds both seats, the seat's own side is read.

### A team dual's double exit is unwound by its lines, or protected from them

Since 7.4.0. In a TEAM event a dual that holds a `DOUBLE_WALKOVER` has propagated like any other.
Scoring one of its lines (tieMatchUps) afterwards takes the dual out of the double exit — so the
produced walkover is withdrawn first, and a team that had been awarded it is taken back out of the
next round. Once that produced walkover has been **played on**, a line of the dual is refused with
`CANNOT_CHANGE_OUTCOME`, exactly as a direct re-score of the dual is: a played result is never
reset by a score entered elsewhere.

### An exit never discards a placement, and says when it kept one

A BYE or a produced exit that lands on a scheduled matchUp keeps that matchUp's court, order and
times — the rule the [schedule governor](/docs/governors/schedule-governor#assigning-a-bye-preserves-scheduling)
states for BYEs, applied to produced exits since 7.5.0. The read side flags both
(`CONFLICT_BYE_SCHEDULED`, `CONFLICT_EXIT_SCHEDULED`), and the `setMatchUpStatus` call that left
them returns `warnings: [{ code: 'SCHEDULE_PRESERVED_ON_EXIT', matchUpIds }]` so the client can
offer to release the slots. Enforced over the drawSize-8 matrix cells with every matchUp scheduled
first: no slot moves under any cascade.

### A produced exit awards no empty seat, on any path

A produced exit is never awarded to a seat that holds a drawPosition but no participant and no BYE,
such as one a BYE advanced forward to wait for a loser fed from another structure. That seat is not
an opponent in place, and the exit stays pending until a participant arrives; an empty position
arriving does not resolve it. 7.5.0 applied this past a BYE; since 7.6.0 it holds on every path
that writes a produced exit. Since 7.7.0 it also holds when a position is cleared out of a matchUp:
a produced exit on the other side stands, pending, rather than being won by the emptied seat. And an
empty position advanced into a matchUp holding a pending exit takes its seat; it is not moved on as
that exit's winner.

### An exit that meets a BYE leaves a BYE behind

Since 7.5.0. An exit carried or produced into a matchUp whose other side is a BYE moves on with the
BYE's advancement; the matchUp it leaves reads `BYE`, not `WALKOVER` or `DEFAULTED` beside a BYE
and nobody.

Since 7.7.0 the reverse holds too. When that BYE is withdrawn — the double exit that placed it is
re-scored, say — the exit comes to rest where the BYE was, pending, and the copy it carried further on
is withdrawn. A relayed copy keeps its origin's id, so it stands only while every matchUp it passed
still holds a BYE.

### A carried exit is corrected at its origin

Since 7.5.0. A carried or produced exit is not a result anybody recorded at the matchUp it reached,
so it cannot be re-scored there, flipped, relabelled as a played match or cleared: a direct call
that would change it is refused with `CANNOT_CHANGE_OUTCOME`, and `matchUpActions` offers neither
`SCORE` nor `CLEAR_SCORE` on it. Clear or re-score the exit's origin, and the exit is re-derived. A
relabel at the origin, which keeps the winner and changes what the result says about the loser, is
covered in [the outcome pipeline § 5](./outcome-pipeline.md#5-the-side-effects-in-order), rule 2.

### A withdrawn exit releases the seat it won

Since 7.5.0. A carried exit awards its seat to whoever stands opposite, and that winner may advance.
When the origin is re-scored and the exit withdrawn, the advancement is released, including where
the next matchUp was itself decided by an exit carried in on the other side. The seat is emptied
and the exit there stands pending the next arrival.

### An arrival carrying an exit converges with a pending exit

Since 7.5.0. A loser carrying a `WALKOVER` or `DEFAULTED` can reach a matchUp that already holds a
pending exit, a carried one or one a director recorded before the opponent arrived. The arrival is
placed and nothing is awarded to it: the two exits converge into a double exit by the rule above.
The participant who exited never takes the exit standing there. Since 7.7.0 this includes a carrier
advanced in past a BYE: the convergence stands, rather than reverting to `TO_BE_PLAYED`.

### Either origin of a converged double exit clears to the kept origin's draw

Since 7.5.0. When two exits have converged into a double exit and nothing downstream is active,
either origin can be cleared, and the draw afterwards is the draw the kept origin alone would have
produced: the double exit and whatever it produced downstream are unwound, and the kept origin's
carried exit is replayed forward.

### Nothing to do is success, not failure

Several situations look like a failure to place a participant but are simply an absence of one. The
clearest is a pending propagated exit whose losing side is an empty feed slot: there is no loser to
direct into the consolation _yet_, and one will be directed when the slot fills. These return
success.

## Statuses that do not propagate

- **`RETIRED`** is an exit for the purpose of activity checks. Whether it is **carried into a
  consolation structure is decided by policy**, not by the engine — see
  `propagateRetirementAsExit` below.

  This paragraph previously stated flatly that a retirement is never carried onward. That was never
  what the code did, and it is not a question the engine should answer: a retirement is a completed
  match with a score and a winner, and whether the retiring player is then treated as unable to
  continue differs by governing body and by event.

### `propagateRetirementAsExit`

A scoring-policy setting, effective only when `propagateExitStatus` is also on.

| value               | effect on the retiring player's consolation matchUp                         |
| ------------------- | --------------------------------------------------------------------------- |
| `true`              | a `WALKOVER` to the opponent — the retiree is treated as unable to continue |
| `false` _(default)_ | left `TO_BE_PLAYED` — the retiree is an ordinary loser who may still play   |

Placement is identical either way: the retiring player is directed to the linked structure in both
cases, as any other loser is. Only what happens to them **on arrival** differs.

This **does** change behaviour for a caller passing `propagateExitStatus: true` under the default
policy: a retirement used to carry onward there. That is the point — it is the one place the engine
was answering a rules question on a federation's behalf. `POLICY_SCORING_USTA` sets it `true`
explicitly, so its observable behaviour is unchanged. A provider with `propagateExitStatus` off —
the factory default — is unaffected either way.

It resolves the way `propagateExitStatus` does, since 7.5.0: `policy ?? param ?? false`. A policy
that sets it, `true` or `false`, wins over the call; the call decides only where the policy is
silent; absent both it is `false`. A tournament director under a policy that ends a retiree's
participation cannot keep that participant in the draw by passing `false` on the call.

The single gate is `validExitToPropagate` in `directLoser.ts`. `progressExitStatus` also names
`RETIRED`, but it runs after the decision to propagate has been taken, so it can only choose the
label the exit carries — it cannot suppress one.

- **`BYE`** is not an exit. It is an absence of an opponent, and it propagates by advancing the
  participant who has no one to play.

## Related

- [Exit Profiles](./exit-profiles.md) — the path a participant took between structures
- [Finishing Positions](./finishing-positions.md) — how positions are derived across linked structures
- [Draw Links](./draw-links.mdx) — how losers reach a target structure
- [Exit-propagation harness](/docs/testing/exit-propagation-harness) — how these guarantees are tested
