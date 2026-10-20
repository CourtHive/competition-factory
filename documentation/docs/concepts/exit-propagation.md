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

Three properties follow from what provenance _is_ — a record of where each side came from:

- **An arrival records no `matchUpStatus`.** A participant who won their previous matchUp — by playing
  it, or because the opponent walked over or defaulted — arrives and waits; nothing was decided on
  their side here, so the entry carries the origin alone:
  `{ previousMatchUpStatus: 'DEFAULTED', sourceMatchUpId: '…' }`. Only a side on which something was
  decided records a `matchUpStatus`: an exit carried over a loser link (the loser of that DEFAULTED,
  whose opponent wins by default), an exit a double exit produced (nobody arrives; the exit stands
  pending), or a BYE. Without this, the winner of a DEFAULTED and its loser carried the same entry into
  their next matchUps, and a reader asking "does this side carry an exit?" could not tell them apart.

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
- **A convergence a correction dissolves settles as the kept exit alone would leave it.** Re-entering
  an exit as a played win for the same winner withdraws the loser's carried exit, and a double exit it
  had converged into falls back to the other exit. The withdrawn side's reason code goes with its exit;
  the kept side's stays. A kept produced exit that reached the matchUp **past a BYE**, with nobody yet
  in the seat it would be awarded to, lands pending as it does on the direct path (no winner until
  somebody arrives); one that came straight down its link keeps its award to that seat. And a
  participant who has already passed a BYE, carrying no exit of their own, takes the exit that BYE
  holds with them, whichever reached the seat first: the BYE stays, the exit travels (census policy-off
  20466254, 20488568, 20500008 and 20520641 — COMPASS, OLYMPIC and CURTIS_CONSOLATION).
- **A re-score that keeps the winner rewrites what that winner's arrival says.** A winner who reached a
  produced exit records how they won the matchUp they came from. Correcting that matchUp to another
  result for the same winner (a default to a played win, say) rewrites the record, so it reads what
  entering the played win directly would have written (census 20500008, COMPASS 16/16).
- **A flip rewrites it too.** Under `allowChangePropagation`, a correction to the other winner puts the new winner in
  the old winner's seat onward, and the arrival record there now reads the new result: a walkover won by one side
  corrected to a retirement won by the other reads RETIRED (census intgate, SINGLE_ELIMINATION 16/16 9100138:
  `anArrivalTellsTheTruthAfterAFlipOrAPendingExit`).

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
that exit's winner. Nor does it take back an award already standing there: a carried exit awarded to
the side nobody had reached stays awarded when the empty position reaches that side, as it is when the
empty position arrives first, and the loser it sent on stays where it went (census run-17 baseline,
COMPASS under `doubleExitPropagateBye: false`).

An award kept this way names a seat, not a side. In a fed round a lone position sits on its
bracket side and two positions sort by drawPosition, so the empty position's arrival can move the
participant already there to the other side; the award moves with the seat. Before this it stayed on
its old side and named the participant who had walked over, whose win was then read as never
advanced (census run 18, FEED_IN_CHAMPIONSHIP, CURTIS_CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION and
DOUBLE_ELIMINATION: WINNER_NOT_ADVANCED, and a result refused after it had written when the
reservation behind that seat was later withdrawn).

The same holds for every fact written before the positions it describes. A carrier arriving past a
BYE beside a lone position records its exit for the seat it takes, in the frame the matchUp is still
in, so that the re-keying of the arrival carries it there; written in the new frame, it overwrote the
lone position's own exit and was then moved onto that position's side, so the carrier won the matchUp
on the walkover it had brought (census run 18, FEED_IN_CHAMPIONSHIP 8/5 under
`doubleExitPropagateBye: false`: WINNING_SIDE_ADVANCEMENT_MISMATCH). And a removal clears the side the
removed position held in the frame the record is in after the position has gone: read in the frame
before, a produced exit leaving with its position was kept as the survivor's, the matchUp stayed a
pending exit, and the seat the exit had awarded stayed in the next round (census run 18,
FIRST_MATCH_LOSER_CONSOLATION 16/11: ADVANCED_FROM_UNDECIDED).

The side a removed position held is read before the removal takes anything. A lone position's side
is read through the feeder that delivered it, and the removal walks the rounds in order, releasing
that feeder first; read afterwards, the side came back empty and the removal dropped the exit standing
on the other side as well (census run 18, MODIFIED_FEED_IN_CHAMPIONSHIP 32/27 under
`allowChangePropagation`: a produced walkover lost from a matchUp its arrival then passed undecided,
ADVANCED_FROM_UNDECIDED).

### A pending exit's reservation goes with it

Since 7.9.0. A pending produced exit can advance an empty seat ahead of it — a reservation for the
arrival it awaits. When the exit is withdrawn the reservation is released with it, even once a BYE has
taken the seat, and a BYE-held opponent who was owed that seat goes on as soon as it is free. A
standing reservation is not disturbed by a double exit re-entered beside it. Pinned by the named tests
of census seeds 20178071, 20163074 and 20139307 (FEED_IN_CHAMPIONSHIP and FIRST_MATCH_LOSER_CONSOLATION
8/7 and 8/8).

Since 7.10.0 two more cases hold. **A reservation goes with its exit past a BYE it crossed**: a
reservation advanced through a BYE into a matchUp still holding a pending exit (an exit status and no
winner yet) is released from that matchUp too when its exit is withdrawn; the pending exit itself
stands for whoever arrives (census 20278127, FIRST_MATCH_LOSER_CONSOLATION 16/16,
`doubleExitPropagateBye: false`). And **an ineligible loser's BYE survives the opponent's arrival**:
in FIRST_MATCH_LOSER_CONSOLATION the BYE placed for a round-2 loser who already holds a win (and so
cannot be fed) is a decision about a decided matchUp, and is no longer withdrawn when that loser's
opponent arrives afterwards and takes the walkover (census 9700053 and 9700084, the early-exit arm).

A produced exit can also be replaced rather than withdrawn: when its double exit dissolves and a carrier passes a BYE
into the matchUp, the carrier's own exit takes the produced exit's place there. That exit is awarded to the seat nobody
has reached, and an award to an empty seat advances nobody, so the reservation the produced exit made is released just
as a withdrawal releases it (census run 18, COMPASS 32/30, 20715025: `South|3|1` kept the reservation and the carrier,
going on past a BYE later, met it there).

### An exit that meets a BYE leaves a BYE behind

Since 7.5.0. An exit carried or produced into a matchUp whose other side is a BYE moves on with the
BYE's advancement; the matchUp it leaves reads `BYE`, not `WALKOVER` or `DEFAULTED` beside a BYE
and nobody.

Since 7.7.0 the reverse holds too. When that BYE is withdrawn — the double exit that placed it is
re-scored, say — the exit comes to rest where the BYE was, pending, and the copy it carried further on
is withdrawn. A relayed copy keeps its origin's id, so it stands only while every matchUp it passed
still holds a BYE. That includes a `FIRST_MATCHUP` consolation reservation withdrawn when the mutation settles: the
relays are asked again once it has gone, so the copy beyond its seat goes too (census run 18,
FIRST_MATCH_LOSER_CONSOLATION 32/32 under `allowChangePropagation`: a first-round winner flipped by a walkover took
the reservation in `Consolation|2|1` back, and the DEFAULTED relayed past it into `3|1` stood until the next arrival
there cleared it).

Since 7.9.0 two more cases hold. **A decided holder is still the BYE it holds**: an exit label standing
beside a BYE with nobody present is settled to `BYE` when the mutation settles, whether or not a winner
was recorded on it and under either `doubleExitPropagateBye` setting — a BYE is never won. And **a lone
BYE is never on the exit's side**: when a BYE is taken back from a matchUp holding it alone beside a
produced or carried exit, the position it held is read as the exit's opposite, because an exit owns no
position — so the exit survives the removal even where the structure can no longer place the position
and the BYE's own arrival record is gone (census 20209866, FIRST_MATCH_LOSER_CONSOLATION 8/7).

**A BYE records no arrival by result.** A matchUp holding an exit may record where its other side will come from
before anybody arrives. Once the matchUp becomes a BYE, whoever wins that feeder advances through it, so that origin
goes; a BYE claim on the side stays (census run 18, COMPASS 16/16, 20672521: `South|2|1` kept `South|1|2`'s origin after
both of `South|1|1`'s seats became BYEs, where entering either double exit first records nothing on that side).

**A carrier a propagated BYE displaces takes their exit with them.** A double exit's loser target can be a seat a carrier
already holds, sent there by an exit that has since converged into the double exit. The BYE takes the seat, and the
exit the carrier recorded on that side of the matchUp leaves with them; only a BYE claim stays. Left behind, the BYE
matchUp read as holding two carries, the carrier opposite was never carried past the BYE, and the matchUp they went on
to read TO_BE_PLAYED over their exit (census run 18, OLYMPIC and COMPASS 32 under `doubleExitPropagateBye: false`,
20711322 and seven more). The convergence the BYE matchUp held then settles to the carry that stays, and a carry the
cascade has already taken past the BYE into a matchUp it decided is not replayed there: met a second time, it read as
an exit already standing and the two converged (census run 17, OLYMPIC 16/16, 20738091).

### Two held exits meet past their own BYEs

CA, 2026-10-11 (P54). A held exit is one standing beside a BYE with nobody in it, waiting to be sent on. When the two
feeders of a matchUp are both holders, their exits meet there (RULE 4) and the double exit produces onward. A
holder's own BYE position can already stand in that matchUp, advanced there while its seat was empty. Two rules keep
that BYE from deciding anything:

- **A BYE the other holder left is not one this exit passes.** The exit behind that BYE is coming to the same seat
  (the BYE stays; the exit travels), so the first exit lands there pending rather than being carried through into the
  next round.
- **The target is read again once the holder's BYE has gone.** With both positions present a side is read as the
  lower drawPosition ([drawPositions](./draw-positions.md)); when the arriving holder's BYE is taken out, the position
  that stays reads its own side and carries its entry with it. The arriving exit's side, who stands opposite it and
  whether that opponent is awarded the exit are all read from the target as the release left it: a participant who
  stands there wins the exit at once, as on any arrival.

The two exits then converge into a double exit with an origin recorded on each side, and its produced exit waits in
the next round with no position of its own, whichever of the two arrived first.

The same holds one round on. A holder's BYE that already stands alone in the matchUp its produced exit is sent to is
not an opponent there: the exit is not awarded to it and the BYE is not moved on again. It is taken back, and the exit
waits there pending for whoever arrives on the other side (census run 18, DOUBLE_ELIMINATION 16/14: the BYE in
`Backdraw|4|1` went on through `Backdraw|5|1` into the Backdraw final, and the Main final's loser across the link into
the decider, while `Backdraw|3|2` had still to be played).

The same holds when it is a participant, not an exit, that arrives opposite the holder's BYE. The holder's exit is gone
(its double exit dissolved), the participant goes on past the BYE, and the BYE position standing one round on is taken
back out first: a matchUp receives one position from each feeder (census run 18, COMPASS 32/30, 20715025: `South|3|1`
held both of `South|2|2`'s positions, TWO_POSITIONS_FROM_ONE_FEEDER).

### A held exit goes on to a seat awaiting its arrival

A held exit is sent on once the matchUp it feeds can be played, and that includes a matchUp whose
other feeder is an exit already awarded to a seat nobody has reached yet: whoever reaches that seat
is delivered, so the held exit goes on and waits for them, pending. Before this such a feeder was
read as finished, the exit stayed beside its BYE, and the matchUp read TO_BE_PLAYED when the exit
came last but held the pending exit when it came first (census run 17, COMPASS and OLYMPIC 32 under
`doubleExitPropagateBye: false`).

More generally, a held exit goes on at once, pending, whenever the matchUp it feeds can still receive an
opponent: its other feeder is still to be played, or is an exit awarded to a seat nobody has reached. CA,
2026-09-24: a produced walkover that meets a BYE "SHOULD then propagate" while the opponent's feeder is
pending. This holds whichever arrived first, the exit or the BYE beside it, and whether the exit is sent on as
it arrives or when the mutation settles; until census S6 the settle held it back until the other side was
decided, so the same results left a pending exit in one order and a TO_BE_PLAYED matchUp with the exit held
behind a BYE in another (census s14, COMPASS 32/27, 20521366: `North|2|1`; across every order of the results
that pin these shapes, three end states became one). Under `doubleExitPropagateBye: false` a double exit's
loser seat receives the produced exit and never a BYE, in either order of the two exits that converged there;
the BYE opposite stays, and the exit travels on. An entry left on a side that is itself a BYE is no held
exit: its carrier went home when the BYE took the seat (census run-17 Class B, COMPASS 32/27, 20641116:
entered last, the probe left `Southwest|2|1` TO_BE_PLAYED with the exit held back; entered first, the loser
seat became a BYE; both now leave the pending walkover).

A correction that re-derives a double exit to the exit it kept applies the same rule as the direct path: a
kept exit that reached the matchUp relayed past a BYE lands pending, unless somebody already stands on the
seat it would be awarded to. Awarded instead to the empty seat, it was taken by a loser arriving there with an
exit of their own, who should have converged with it, and the seat their win would have fed became a BYE
nobody could fill (the same seed, `East|1|13` corrected from a double walkover to a walkover).

### A carry past a BYE a holder takes back comes back with it

CA's rule "the BYE stays; the exit travels" lets a holder's BYE position stand one round on until the exit it holds
is sent there. Meanwhile a participant carrying an exit can meet that BYE and pass it (RULE 1). When the holder's
exit is sent on and its BYE is taken back, whoever passed that BYE comes back with it, as with any BYE released from
a matchUp. A matchUp onward that their carry alone decided, for a seat nobody occupies yet, is released with them:
it was no result of its own. An award to a seat somebody holds is left alone, since they may have gone on from it;
that is the withdrawn exit's own release.

### A carried exit is corrected at its origin

Since 7.5.0. A carried or produced exit is not a result anybody recorded at the matchUp it reached,
so it cannot be re-scored there, flipped, relabelled as a played match or cleared: a direct call
that would change it is refused with `CANNOT_CHANGE_OUTCOME`, and `matchUpActions` offers neither
`SCORE` nor `CLEAR_SCORE` on it. Clear or re-score the exit's origin, and the exit is re-derived. A
relabel at the origin, which keeps the winner and changes what the result says about the loser, is
covered in [the outcome pipeline § 5](./outcome-pipeline.md#5-the-side-effects-in-order), rule 2.

### A relabel out of a convergence, and back into one

Since 7.7.0. A relabel keeps the winner and changes what the result says about the loser. Where the
loser's carried exit had **converged** with another exit (a double exit, nobody winning), relabelling
the origin as a played result withdraws only that origin's entry; the matchUp re-derives to the kept
exit, and what the double exit had produced downstream is withdrawn:

- **the kept exit was carried** by another loser — that carrier is directed on again, as if their
  exit had arrived alone;
- **the kept exit was produced** by a double exit — the relabelled loser, now simply a participant
  standing opposite a pending produced exit, wins it and goes on (RULE 2), which is the state forward
  play reaches when the origin is entered as a played result from the start.

The reverse holds too. A loser who won a produced exit on arrival and is then relabelled as exiting at
the origin has that win **taken back** — it was the cascade's award, not a result a director recorded —
and the exit is carried in, converging as it would have had it been entered first. A result the loser
then **earned** onward stands, and the relabel itself is now refused: see the next section. The three states (exit first; played then relabelled; exit, played, exit again) are pinned
equal on status, winner, positions and occupants.

Since 7.9.0 a relabel also withdraws a carry that had passed a pending produced exit, and a double
exit re-derived to a single one stops producing at once rather than on the next write.

### A recorded result downstream fixes the kind of a correction

CA, 2026-10-11 (P52): _a result someone recorded in the consolation implies something was really played,
and it shouldn't be removed; the person who recorded it simply didn't realise the wrong player had been
advanced. Changing the upstream match to a different KIND of outcome is invalid; simply changing the
winning side is not._

- **The kind** of an outcome is whether it carries an exit downstream under the draw's settings: WALKOVER
  and DEFAULTED do, RETIRED only under `propagateRetirementAsExit`; any other decided result is played. With
  `propagateExitStatus` off nothing is carried, every outcome is the same kind, and nothing here applies.
- **A recorded result** is one a director entered, played or not (a recorded double walkover counts), as
  opposed to what the cascade derived (a carried exit, or the award it gives whoever arrives at a pending
  exit). It counts in the matchUp the loser stands in, onward from there in a structure their loss there
  fed, and — when the outcome being corrected is a carried exit — onward from the matchUp that exit decided.
- **Refused, over an untouched draw** (`CANNOT_CHANGE_OUTCOME`, row 22 of the outcome pipeline): a correction
  from an exit to a played result or the reverse, by a winner change or a status-only correction alike,
  once the loser's path holds a recorded result.
- **One structure on.** Where the loser's loss carried their exit into a matchUp it decided for whoever
  stood opposite, a result that winner then recorded onward counts as recorded on the loser's path. Census
  20496362 (OLYMPIC 16/16): Italo's walkover carried into `South|1|2` was Uhura's award, and Uhura then beat
  Nicole in `South|2|1`. Re-entering `East|1|7` as a played win is refused; before, it withdrew the carry
  and left Uhura in a recorded result over an undecided matchUp.
- **A bare win is played.** A correction naming the same winner with no status and no score records
  COMPLETED, so a walkover re-entered that way changes its kind, and the guard reads it so.
- **Accepted**: a winner change that keeps the kind — the recorded result becomes the new loser's — and any
  correction where nothing downstream is recorded. Then the carried exit is re-derived from the corrected
  result, for the new loser of a winner change as for a status-only correction: an exit that is now one is
  carried, one that no longer is is withdrawn, and the draw is the one forward play reaches.

### An exit arriving at a seat already decided for it is carried past

CA, 2026-10-11 (P51 group 2): a participant carrying an exit into a matchUp that another exit has already
decided for the seat awaiting them is carried past it. Two exits meeting would ordinarily converge (RULE 4),
but where a result somebody recorded stands below that matchUp, the convergence would take it back. So the
arrival takes the seat the decided exit was awaiting, goes on to that matchUp's winner matchUp, and carries
their own exit on from there, as past a BYE (RULE 1). The decided matchUp and the results below it stand.
Where nothing recorded stands below, the two exits converge as before. Census 20496362 (OLYMPIC 16/16,
`allowChangePropagation`): America's walkover arriving at `West|1|4`, decided by Italo's walkover, was
refused after the draw had been written.

The carry past comes back with its origin. Re-entering the carrier's own exit as a played result
withdraws their carry from where it was written, the winner matchUp they went on to, not from the
decided matchUp they passed; the draw is then the one the played result entered first leaves (in the
same seed, `West|2|2` returns to a match to be played and its walkover's winner is released onward).

### Two carried exits converge over what they carried

CA, 2026-10-11 (census F2, P51). A carried exit decides the matchUp it reaches for the seat still awaiting its
opponent (RULE 2), and its carrier goes on as that matchUp's loser, carrying the exit into the next structure
and beyond. When the awaited participant then arrives carrying an exit of their own, the two exits meet (RULE 4):
the matchUp becomes a double exit, and what the first exit carried onward is re-derived.

Whether anything downstream blocks that convergence is asked the way a clear asks it (CA, 2026-09-25: only
**genuinely active** downstream blocks, never **advanced active**), with one difference: a carried exit downstream
is inert **even when its loser carried it on further**. Only a result somebody recorded below the meeting blocks it.
Until 2026-10-11 a carry that went one hop further read as a played match, and the second walkover, a main-draw
result, was refused although nobody had played anything below it.

The result is the draw that recording the two exits in the other order leaves. A convergence recorded after the first exit's carrier
was already sent on as that matchUp's loser takes that loss back: a double exit has no loser, so the carrier leaves the
loser seat and the seat is served as a double exit's loser target is (census run-17 baseline, COMPASS 16/13 under
`doubleExitPropagateBye: false`). A CLEAR of either exit's origin
keeps the stricter reading: an origin whose carried walkover an unrelated arrival has since won is not clearable.

### A withdrawn exit releases the seat it won

Since 7.5.0. A carried exit awards its seat to whoever stands opposite, and that winner may advance.
When the origin is re-scored and the exit withdrawn, the advancement is released, including where
the next matchUp was itself decided by an exit carried in on the other side. The seat is emptied
and the exit there stands pending the next arrival.

The release follows the award across its own winner link. In DOUBLE_ELIMINATION the Backdraw final's
winner goes on into the Main structure; when the exit that decided the Backdraw final for them is
withdrawn, they are taken back out of the seat the link gave them too, so the re-derived winner can
take it (census 20506968, DOUBLE_ELIMINATION 8/6).

A BYE in the Backdraw final follows the link too. A BYE there carries the other finalist into the
Main structure, and when it is taken back (a double exit corrected, its loser arriving for the seat)
the finalist it carried is taken back out of the Main final with it (census run-17 baseline,
DOUBLE_ELIMINATION 8/5). A Backdraw finalist in the Main final under the Main position of a semi-final
that now has no result came across the link, not by advancing within Main, and is taken back the same
way (DOUBLE_ELIMINATION 8/4).

It also takes back the BYE the award placed. A matchUp won over a carried exit has that exit as its
loser, and where the loser link leads to another structure the seat there becomes a BYE nobody can
fill. When the withdrawal leaves that matchUp undecided, its loser is a participant again, and the
BYE goes unless another exit still claims it (census run-17 baseline, COMPASS 16/13 under
`doubleExitPropagateBye: false`).

A BYE claimed further on goes the same way. A double exit's produced exit can decide a matchUp a round
on, and the BYE claimed for that matchUp's loser stands on the double exit's account. When the double
exit is re-derived to a single exit, the exit it produced is withdrawn and so is that BYE. Only the
BYE at the re-derived matchUp's own loser seat stays, because its losing side is still the produced
exit (census run-17 baseline, COMPASS 16/13 and 16/14 under `doubleExitPropagateBye: false`).

A seat that becomes a BYE keeps nothing it was awarded. When a correction takes a fed loser back out and the seat they
held becomes the BYE nobody can fill, an advancement a produced exit gave that seat is taken back first, and the BYE
lands in the fed matchUp beside the exit it now holds; a BYE is never won. Before this the BYE was placed a round on,
where the award had carried the seat, in front of the seat owed to the other feeder (census run 18,
MODIFIED_FEED_IN_CHAMPIONSHIP 32/29 under `doubleExitPropagateBye: false`: `Main|2|1` re-scored as a double default
left `Consolation|3|4` a BYE).

### A loser who is nobody holds no seat

A matchUp an exit decided for an empty seat has nobody on its losing side. When that matchUp becomes a
double exit, the loser it had sent on is taken back, and there is no participant to take. Before this
the removal looked for a participant with no id, which matched every BYE and open seat in the loser
structure: each BYE's advancement there was released while the BYEs themselves stood, and an unfilled
seed slot was dropped (census run 17, COMPASS 32/30 under `doubleExitPropagateBye: false`: the BYE two
BYEs had sent on into `South|3|1` was taken back).

### A clear takes back only the side it cleared

Clearing a position takes back what that position's side carried, and nothing from the other side.
When the cleared position was never in the matchUp and nothing was removed from it, the matchUp
can only lose what stood on the side holding no position. The side holding a position keeps its
carried exit, and the matchUp re-derives to the pending exit that carry gives it. Before this, an
unknown side was cleared as both: a relabel through a DOUBLE_ELIMINATION Backdraw dropped a carried
`WALKOVER` from the occupied side, and the produced exit that arrived next was awarded to the
participant carrying it (census 20490105, DOUBLE_ELIMINATION 16/13).

### The decider holds the final's finalists

In DOUBLE_ELIMINATION the decider is seated from the final as it stands: its first seat holds the
final's winner and its second the final's loser, or nobody when the final was an exit with no
loser to seat. A participant left there from an earlier result of the final is replaced, so a
corrected final seats its decider without refusing (census 20477784, DOUBLE_ELIMINATION 8/4).

### A carry comes home with its carrier

Since 7.9.0. A loser carrying an exit into a seat beside a BYE is advanced past it, and the carry is
written where they land — including past a BYE that arrives after them, and past consecutive BYEs.
When the BYE that advanced them is withdrawn, its double exit re-scored as a played result, the
carrier comes back and the carry comes with them: it is merged onto the matchUp they return to and
that matchUp re-derives to the pending state their arrival would have written, so whoever arrives
next meets an exit, not an ordinary opponent, and two carried exits meeting there converge by the
rule above. Only a participant's own carry travels this way: a double exit's produced exit stays
where the double exit put it, and a carry whose origin is itself being relabelled as a played result
is withdrawn, not re-seated. Before this a carry that stood **pending** a round on was lost on the
pull-back and its carrier won a match they had walked over (census 20057285,
FIRST_ROUND_LOSER_CONSOLATION 8/8); a carry that had **decided** its onward matchUp already came
home. This holds however far the carrier went: a carrier who passed more than one BYE is taken back out of every
round those BYEs moved them through, and the carry comes home from wherever it was written. Before this, a carry written
two BYEs on stayed there, decided over an empty seat, and decided the matchUp against whoever arrived (census de
9300487, DOUBLE_ELIMINATION 16/13: a default carried past two Backdraw BYEs stayed in `Backdraw|3|1` and was charged to
a participant who never defaulted).

Since 7.10.0 two more cases hold. **A carry past a BYE in a structure's last round survives the
BYE's withdrawal**: there is nowhere further for the carrier to land, so the carried exit is recorded
beside the BYE, and when the BYE is withdrawn the matchUp re-derives to the exit the carrier holds
rather than becoming an ordinary match (census 20318646, COMPASS 8/8 — the South final). Both arrival
orders, carrier first or BYE first, now reach the same state. Since A1 (2026-10-17) the carry is recorded beside the
BYE in every round, not only the last ([below](#rules-settled-by-the-census-in-a1-2026-10-17)). And **a carry written past a late BYE
names the exit's origin**, as every other hop does, not the BYE matchUp it passed, so a convergence it
later dissolves still re-advances its winner (census 20267598, FEED_IN_CHAMPIONSHIP_TO_SF 16/15).

**A carrier passing a BYE onto a side a dissolved double exit decided brings its own exit.** Two
carriers can converge in a matchUp whose produced exit then decides the next one for the participant
opposite. When one of them is replaced by a BYE, the convergence dissolves and the other passes the BYE
onto the side that double exit had decided. That side now records the carrier's own exit, naming its
origin, as it does when the BYE comes first. Before this it kept only the dissolved double exit's
record, which was then withdrawn, and the matchUp went back to TO_BE_PLAYED with a defaulted participant
in it (census run 17, OLYMPIC 16/16 under `doubleExitPropagateBye: false`).

The same holds when the matchUp the carrier lands in is held by a BYE or by a double exit rather
than decided by one: the side the carrier takes records the carrier's own exit, replacing the record
a dissolved double exit left there. The carrier's origin is read from the stored draw, not from the
view the cascade started with, so a carrier crossing two BYEs in one cascade still names the
matchUp they exited. Before this the South final went back to TO_BE_PLAYED when the late entry came
last, and to a walkover when it came first (census run 17, OLYMPIC 32 with 29 and 30 participants,
under `doubleExitPropagateBye: false`).

**A carried exit stands only where its carrier stands.** A participant's own walkover or default is
written in the loser seat they land in and in each matchUp they are carried into past a BYE, always
beside them. When a BYE they passed is replaced — a double exit relabelled as a played result, its
loser taking the BYE's seat — they come home, and a copy left where they no longer stand is
withdrawn when the mutation settles, with whatever it had decided. Before this the copy stayed and
decided that matchUp for whoever arrived next (census run 18, FEED_IN_CHAMPIONSHIP_TO_SF and
MODIFIED_FEED_IN_CHAMPIONSHIP 16/14: a result refused after it had written, and two positions sent on
by one matchUp).

**A converging exit's carrier leaves with the carry only where nothing was played.** When the exit
that sent a carrier over its loser link converges, the carrier is taken back out of the loser seat.
If they went on from the seat, they are released carry and all, and an award the carry made does not
make their position active, where every one of these holds: the seat's matchUp has no score and is a
BYE or an exit, and every matchUp they went on to has no score and is a BYE, undecided, or decided by
an exit carried into it. Otherwise, where they went on or where the seat's matchUp was decided by
anything but exits, the position is cleared, and the clear still refuses an active position
(`ERR_ACTIVE_DRAW_POSITION`). A carrier who went no further from a seat that only exits decided is
released in place: they leave the seat, and the seat's award to them goes. No entry reaches the
clear's refusal today. The release is reached only where the converging exit met a carried one, and
a carried exit decides every matchUp its carrier reaches and is changed only at its origin, so the
carrier goes on only past BYEs (census A1 wave 5, COMPASS 32/27 21155795 and 32/30 21063079:
`aCarrierPastAByeIsReleasedWhenItsExitConverges`, `aCarrierWhoWentOnOnlyAsACarrierIsReleasedWithTheCarry`).

**A seat emptied for the winner holds no carry.** When a played win is re-entered as a walkover or
default the other way, the old winner is taken out of the rounds they reached, and the seat each removal
empties is the one the new winner takes next. A single exit decides nothing there: the exit is the new
loser's, and it goes with them. Only a double exit, which sends nobody, records a produced exit on that
seat. Before this, the empty seat was stamped with the new loser's exit as though they had been carried
into it. On a BYE the stamp stood beside the new winner and went past the BYE with them. It then either
converged with the exit waiting there into a double exit nobody had entered, or, once the copy was
withdrawn as stranded, took the new winner's advancement back with it (census S8, FEED_IN_CHAMPIONSHIP
16/11 and COMPASS 32/27: `aSeatEmptiedForTheWinnerHoldsNoCarry`).

**A produced exit supersedes a stale relay on its own side.** A produced exit relayed past a BYE
waits, on the side its path arrives at, in a matchUp no position has reached yet. When a loser takes
that BYE's seat and the matchUp they meet there produces its own exit, it travels the same path onto
the same side: it replaces the relay, which came the same way, rather than meeting it. Only an exit
standing on the OTHER side converges with it. The draw then equals the one forward play leaves, with
the loser's result entered first. Before this the two were read as a convergence, a double exit that
produced onward over a matchUp nobody had played (census run 18, FEED_IN_CHAMPIONSHIP_TO_SF 16/13).

### An arrival carrying an exit converges with a pending exit

Since 7.5.0. A loser carrying a `WALKOVER` or `DEFAULTED` can reach a matchUp that already holds a
pending exit, a carried one or one a director recorded before the opponent arrived. The arrival is
placed and nothing is awarded to it: the two exits converge into a double exit by the rule above.
The participant who exited never takes the exit standing there. Since 7.7.0 this includes a carrier
advanced in past a BYE: the convergence stands, rather than reverting to `TO_BE_PLAYED`.

Since 7.9.0 a convergence written by an arrival produces onward exactly as one written by a carried
exit does; a seat held open for an occupant who is leaving is read before the arrival; a held exit
that meets a seat a carrier was awarded converges there, and the converged matchUp serves its loser
link; and a double exit landing in a consolation target withdraws the stale advances its earlier
state had left standing there, so its re-derived winner goes on.

Since 7.10.0 **an exit carried on from a convergence names no stale winner**. With
`doubleExitPropagateBye: false` a double exit produces an exit over its loser link; where that exit
meets one already standing, the target converges and carries an exit onward. The onward matchUp is
awarded by RULE 2 (the side without the exit wins), never to the side the exit came in on, so the
participant who arrives there takes it (census 20346401, 20349817 and 20352232 — DOUBLE_ELIMINATION
8/8, COMPASS 16/11, FIRST_MATCH_LOSER_CONSOLATION 16/13).

A position advanced past a BYE that arrives opposite a carrier converges by the same rule rather
than being awarded the seat (census 20460396, DOUBLE_ELIMINATION 16/14). Whether the occupant carries
an exit is read from the side the advancement actually reaches, not the side the caller named
(census 20522496, DOUBLE_ELIMINATION 8/7).

### Either origin of a converged double exit clears to the kept origin's draw

Since 7.5.0. When two exits have converged into a double exit and nothing downstream is active,
either origin can be cleared, and the draw afterwards is the draw the kept origin alone would have
produced: the double exit and whatever it produced downstream are unwound, and the kept origin's
carried exit is replayed forward.

### Rules settled by the census in S6 (2026-10-15)

Each held across every entry order of the census history that exposed it, under `doubleExitPropagateBye: false`
unless stated.

- **A loser seat already holding a BYE is settled, and nothing is produced onto it.** A produced walkover awarded to an
  empty seat claims the BYE its loser would have taken; when a carrier later converges that matchUp, the double exit's
  loser seat is that BYE. Owing the seat the produced exit instead was measured and rejected: it opened census seeds
  and a new order dependence (COMPASS 32/30, 20694910). The BYE a matchUp claimed while it was a single exit, and alone,
  is taken back when a correction makes it a double exit, and its loser seat receives the produced exit.
- **A withdrawn origin leaves the kept exit its own label.** A mixed convergence is stored as a DOUBLE_WALKOVER; once
  the walkover side is withdrawn, the double default's produced exit is a DEFAULTED, as direct entry writes it
  (COMPASS 32/27, 20521366).
- **A carry's own exit relabels the matchUp whose entry it replaces**, and **a participant brought home past a BYE
  takes only their own carry**: the carry whose source matchUp they played in (COMPASS and OLYMPIC 32, 20715025,
  20779675, 20865978).
- **A carrier is not carried past a holder's BYE when the draw settles**: a BYE the other holder left is not one an
  exit passes, as for a held exit (FEED_IN_CHAMPIONSHIP 16/14, 20833621, a refusal after a write).
- **An unwind does not walk on through a result it leaves standing**; **a holder's BYE leaves every round it reached**;
  **a dissolved convergence takes back the BYEs it claimed onward, and a re-derived one keeps the BYE claims of others**;
  **a relabel into an exit takes back an award over a carried exit too**; **a convergence produces onto a seat an exit
  has awarded**; **a loser-link award survives the withdrawal of its seat's BYE**; and **a removal walks on only
  through a real partner** (a hole is not a drawPosition, [drawPositions](./draw-positions.md) § 5). Census s13, s14,
  s16 and run 19 residuals; each pinned by a named test.

### Rules settled by the census in S7 (2026-10-15)

Read from census run 20, under `doubleExitPropagateBye: false`; each pinned by a named test.

- **An unwind walks on through a result a dissolved convergence produced.** "A result it leaves standing" is one whose
  exits all come from origins the unwind keeps. An exit produced by a convergence that holds one of the withdrawn
  origins is not such a result, even before the walk has reached the convergence itself: re-scoring the origin dissolves
  the convergence, and what it produced goes too (DOUBLE_ELIMINATION 8, 20994634 and 20932043:
  `anUnwindWalksOnThroughADissolvedConvergence`).
- **A BYE claim survives the exit withdrawn beside it.** One side of a matchUp can hold both an exit an origin sent there
  and a claim on the BYE the seat now is (a matchUp whose loser is nobody). Withdrawing the exit leaves the claim, so the
  BYE is taken back when the claimant later gains a real loser (COMPASS 16/13, 20964176:
  `aByeClaimSurvivesTheExitWithdrawnBesideIt`).

### Rules settled by the census in S8 (2026-10-16)

Read from the S8 closing re-sweep, which replayed the stored schedules of runs 13–20 at one ref. Each seed had passed in
its own run and failed at that ref; each was bisected by replay to the commit that exposed it, and each rule is pinned
by a named test that fails without it.

- **A removal walks through a hole into the matchUp it feeds.** A lone position's partner is a hole. The removal walks
  on only into the next-round matchUp its own matchUp feeds, so a carry that passed a lone BYE comes back with the BYE;
  it does not walk into any other matchUp holding a hole (COMPASS 32/27 20611808, FEED_IN_CHAMPIONSHIP_TO_SF 8/7
  20650915: `aRemovalWalksThroughAHoleIntoTheMatchUpItFeeds`).
- **A relabel withdraws its carry from every BYE-held matchUp it reached.** A carry passing BYEs in consecutive rounds
  is recorded on each of them; a relabel to a played result takes it back from all of them, not the first (two
  FEED_IN_CHAMPIONSHIP consolation stalls, 20544709 and 20576342:
  `aRelabelWithdrawsTheCarryFromEveryByeHeldMatchUp`).
- **A seat emptied for the winner holds no carry** (above; FEED_IN_CHAMPIONSHIP 16/11 20532286, COMPASS 32/27
  20585407: `aSeatEmptiedForTheWinnerHoldsNoCarry`).
- **An unwind takes back what it sent on through a result it leaves standing.** S7's stop at a result whose exits come
  only from kept origins still holds, but a participant the unwind is taking back who was sent on through that result
  is taken back too. Across a link the participant is followed, not the drawPosition (DOUBLE_ELIMINATION 8/6 20590443,
  and 20701264 into the Decider: `anUnwindTakesBackWhatItSentOnThroughAStandingResult`).
- **A withdrawn arrival leaves the award its exit made.** A settle re-reads a matchUp's winner only when it withdraws
  an exit entry; withdrawing an arrival record alone leaves the award (CURTIS_CONSOLATION 16/13 20669990:
  `aWithdrawnArrivalLeavesTheAwardItsExitMade`).
- **A pending exit awaiting an arrival can still deliver.** A held exit sent on as a pending walkover, whose other seat
  holds neither a participant nor a BYE, is a feeder that can still deliver someone, not a dead end; the result no
  longer depends on whether a later walkover is entered first or last (OLYMPIC 32/30 20609643:
  `aPendingExitAwaitingAnArrivalCanDeliver`).
- **A Decider holds nobody until its final is decided.** When the Main final is left with no winner, both Decider seats
  are cleared; a final decided for a seat its winner has not reached keeps the seats its links made
  (DOUBLE_ELIMINATION 8/5 20722665: `aDeciderHoldsNobodyUntilItsFinalIsDecided`).
- **A carrier under a stale double exit is not awarded.** An occupant carrying an exit is not awarded a produced exit
  on a matchUp that still reads a double exit from an earlier pass of the same mutation (OLYMPIC 32/30 20625776:
  `aCarrierUnderAStaleDoubleExitIsNotAwarded`).
- **A dissolved convergence owes its loser seat the BYE again.** Under `doubleExitPropagateBye: false` a convergence
  takes back the BYE its single exit claimed and its loser seat holds the produced exit. When the convergence dissolves
  back into a single exit over a loser link, with its winner standing, the produced exit is withdrawn and the BYE is
  placed again, because the losing side is still the produced exit and can never send a loser. A walkover corrected
  to a played result leaves the draw that the played result alone leaves (COMPASS 8/8 20853116:
  `aDissolvedConvergenceOwesItsLoserSeatTheByeAgain`).
- **A produced convergence crosses the link it reaches.** A convergence the settle produces onward can advance a
  participant through BYEs to the source round of a WINNER link, opposite a BYE; they cross the link as one advanced
  there by any other route does, because the crossing is asked again after the production and not only before it
  (DOUBLE_ELIMINATION 16/11 21138954: `aProducedConvergenceCrossesTheLinkItReaches`).
- **An exit re-delivered into its own seat is not sent on.** A double exit that re-settles (one side's carried exit
  becoming a produced one) propagates again. Where its produced exit, passed on through a BYE, reaches the matchUp its
  first pass left pending with that same exit on the arrival side, nothing new has arrived: the pending exit stays
  pending and is not advanced from as though decided. A double walkover corrected to a default leaves the draw that
  the default alone leaves (DOUBLE_ELIMINATION 16/11 21030358: `anExitReDeliveredIntoItsOwnSeatIsNotSentOn`).
- **A double exit's own position leaves every round it reached.** A participant arriving opposite a double exit's
  produced exit is advanced at once, past any BYE beyond; when their own exit then converges the matchUp, the
  position is taken back from every round it went on to, a double exit there included, since a double exit
  advances nobody. When that leaves a single produced exit, it awards no empty seat and stands pending, as forward
  play lands it. A double default corrected to a walkover leaves the draw that the walkover alone leaves
  (FEED_IN_CHAMPIONSHIP 16/11 21123326: `aDoubleExitsOwnPositionLeavesEveryRoundItReached`).
- **A loser seat holding a BYE is not converged.** A convergence whose loser seat already holds a BYE leaves that
  matchUp a BYE, even when the matchUp also holds a pending exit and nobody else: the BYE is the record of the loser
  who will never arrive, and the pending exit passes through it. A BYE placed in a seat a convergence had produced into
  therefore reaches the draw the same results reach with the BYE placed first (COMPASS 32/31 20551581:
  `aLoserSeatHoldingAByeIsNotConverged`).
- **A result past a convergence's BYE fixes the kind.** A convergence has nobody to lose, so it claims a BYE for its
  loser seat; what it decided includes that BYE, and a result recorded by the participant the BYE passed on is a
  result on the loser's path. Re-entering one of the converged exits as a played result is refused
  (`CANNOT_CHANGE_OUTCOME`) over an untouched draw; before, the BYE's withdrawal took that participant back out and left
  their result standing on an undecided matchUp. With nothing recorded past the BYE the correction is accepted
  (COMPASS 32/27 21027128, under `allowChangePropagation`: `aResultPastAConvergencesByeFixesTheKind`).
- **An exit re-entered as the other exit relabels its carry, even after its winner played on.** A walkover
  re-entered as a default for the same winner (or the reverse) relabels the exit its loser carries, on every route,
  including the one taken once that winner has played on. The draw is the one the new exit entered directly reaches
  (COMPASS 16/14 6141627: `aRelabelledExitPastAPlayedWinnerRelabelsItsCarry`).
- **A BYE origin waits for its feeder to deliver.** A double exit's produced exit records an origin for the other side
  of the matchUp it reaches, read from the paired feeder. A feeder reading `BYE` beside a seat that holds neither a
  participant nor a BYE has delivered nothing: whoever reaches that seat goes on through the BYE, so the side is not
  decided and records no origin, whether the BYE was placed before the double exit or after it
  (FIRST_MATCH_LOSER_CONSOLATION 8/7 20498521, `propagateExitStatus: false`, default `doubleExitPropagateBye`:
  `aByeOriginWaitsForItsFeederToDeliver`).
- **A Decider is not a loser seat a BYE can fill.** The Decider is the one target that the Main final's winner link and
  loser link both feed, and `reconcileDecider` writes both of its seats from the final. A final won against an exit has
  no loser, and the Decider is a `DEAD_RUBBER` holding the champion, under either policy and in every entry order.
  Before, the BYE owed to the final's loser seat was placed in the Decider, in the seat the champion was owed, in some
  entry orders only (census R11, DOUBLE_ELIMINATION 8/5 21037067, `propagateExitStatus: true`:
  `aFinalWonWithNoLoserLeavesItsDeciderADeadRubberInEveryOrder`).

### Rules settled by the census in A1 (2026-10-17)

Read from the A1 do-undo triage: a probe applied to the scheduled draw and then cleared must leave the draw it found.
In each case the scheduled draw is the one forward play reaches from the standing results; each rule is pinned by a
named test that fails without it.

- **A cleared loser seat leaves no award behind.** A loser sent into a seat opposite a produced exit is awarded it on
  arrival. When the result that sent them is re-scored or cleared, their seat empties and the produced exit stands
  pending again, on the seat's own matchUp and on one reached past a BYE. The advance the award made leaves with the
  occupant, as direct entry of the exit alone leaves it; an exit that keeps its award keeps its advance, and that
  reservation goes with the exit when the exit is withdrawn. A carried exit, or a produced one that came straight down its
  loser link, keeps its award, as direct entry writes it; and a source that becomes a double exit leaves the seat to its
  own cascade, which places the BYE (CURTIS_CONSOLATION 32/27 9000062, DOUBLE_ELIMINATION 8/4 20537779:
  `aClearedLoserSeatLeavesNoAwardBehind`).
- **A seat's occupant takes their award's advance with them** (A1 int2). The release of a leaving occupant asks of the
  produced exit beside them whether its award stands with the seat empty (`awardStands`), and keeps the advance in the
  next round only then: read before the award was withdrawn, the award looked like the exit's own advance and stayed
  (FEED_IN_CHAMPIONSHIP_TO_SF 16/11 21041635: `aWithdrawnAwardTakesBackTheAdvanceItMade`; 116 census rows).
- **A Main final's exit came over its winner link.** A produced exit in a DOUBLE_ELIMINATION Main final is not one
  that arrived over a loser link, though a walk from its source's loser target leads back to it through the Backdraw's
  winner links: a double exit converging with it there, once cleared, leaves it awarding no empty seat (DE 8/5
  21033335: `aMainFinalsExitCameOverItsWinnerLink`).
- **A final decided during the settle seats its champion at once.** When a held exit is sent into a final and the
  final is decided by it, the champion crosses into the decider within the same call (the link advancement is asked
  again after the settle), not on the next (DE 8/5 21037067: `aFinalDecidedByAHeldExitSeatsItsChampionAtOnce`).
- **A released position takes its BYE origin with it; a removed position, its arrival.** The BYE origin a released
  position recorded for its feeder goes with the release, as its arrival does (COMPASS 8/8 21031039:
  `aReleasedPositionTakesItsByeOriginWithIt`); and a position taken out of every later round by a cleared first-round
  result takes the arrival each of those rounds recorded (SINGLE_ELIMINATION 16/14 21137642:
  `aRemovedPositionTakesItsArrivalWithIt`).
- **A standing result keeps what it sent over its loser link.** Unwinding a double exit visits a matchUp onward only
  for what the double exit sent through it; when that matchUp's own result stands, its loser target is not reset, so
  the carry it sent there stays (COMPASS 16/14 21027146 under `doubleExitPropagateBye: false`:
  `aStandingResultKeepsWhatItSentOverItsLoserLink`).
- **A released position takes its arrival with it.** A position released from a round it had won its way into leaves
  no record of that arrival: the feeder named there is undecided again and sent nobody (FIRST_MATCH_LOSER_CONSOLATION
  16/13 20483283 under `allowChangePropagation`: `aReleasedPositionTakesItsArrivalWithIt`).
- **A BYE origin goes with the exit opposite it.** The BYE origin a produced exit writes opposite itself on meeting a
  BYE is withdrawn with that exit, so a BYE matchUp reads as it did before the exit arrived (FEED_IN_CHAMPIONSHIP 16/11
  20532286: `aByeOriginLivesAsLongAsTheExitOppositeIt`).
- **A seat emptied further on leaves no award behind.** A loser taken back is released from every placement their
  loss led to, a link further on as well as in the structure they were fed into; a produced exit awarded to a seat
  they no longer hold stands pending again, and its reservation in the next round stays, as the seat the loser was fed
  into already did (COMPASS 32/30 20733408 under `doubleExitPropagateBye: false`:
  `aSeatEmptiedFurtherOnLeavesNoAwardBehind`).
- **An exit that has delivered nobody is no origin.** A single exit delivers its winner only once someone holds the
  winning seat. Pending, or awarded to a seat still awaiting its arrival, it records no arrival on the side it feeds,
  as a BYE matchUp awaiting its other side records no BYE origin (COMPASS 32/31 20551581 under
  `doubleExitPropagateBye: false`: `anExitThatDeliveredNobodyIsNoOrigin`).
- **A dissolved convergence keeps an award that came down its loser link.** A convergence a correction dissolves
  settles as the kept exit alone would leave it, and that includes the award: a produced exit that came straight down
  its loser link keeps its award to the seat still awaiting its arrival, and reserves that seat in the next round, as
  entering the same results once each does in any order. Only an exit relayed past a BYE stands pending (COMPASS 32/31
  20551581 under `doubleExitPropagateBye: false`: `aDissolvedConvergenceKeepsItsLoserLinkAward`).
- **The seat left opposite a BYE goes on.** A BYE advances the drawPosition opposite it when it lands, occupied or
  not, and two BYEs meeting send one BYE on. When one of the two is withdrawn, the empty seat now opposite the BYE that
  stays goes on into the next matchUp, where it has room, as it would have had that BYE landed alone; a position that
  entered the round from an earlier one is a reservation, and is not moved (COMPASS 32/30 20694910 under
  `doubleExitPropagateBye: false`: `theSeatLeftOppositeAByeGoesOn`).
- **A reason is attributed by where it came from, not by what it says.** `sideStatusCodes` holds the scoring
  policy's reason per side (`{ 2: 'DM' }`), split from the positional `matchUpStatusCodes` a client submits. A
  propagation or convergence write stores the array `deriveStatusCodes` builds from provenance, where a side that
  exited with no recorded reason shows the bare outcome code (`['DEF']`, `['WO']`), or re-stores the matchUp's own
  array, which may be such a display. Either array is display only and is not split: the write keeps the reasons the matchUp already holds and the source's own side-keyed reason, on the side
  it arrived at. The source's positional array is read for display only, never as a reason. Before this, a double
  default reached in one entry order stored `{ 1: 'DEF', 2: 'DEF' }` and in the other stored nothing. A client's array
  is split as before, and no code is reserved by value (FIRST_MATCH_LOSER_CONSOLATION 32:
  `aDerivedOutcomeCodeIsNeverASideReason`).

- **What forward play sends on from a result is sent on from a re-derived one.** A removal re-derives the matchUp it
  vacates (a cleared BYE or double exit puts it back to the exit it held) and used to stop there. It is now asked of
  the settled draw (`settleForwardConsequences`), and answered by the forward primitive: a decided matchUp's winner
  goes on into its next matchUp; its losing participant is directed over its loser link, the exit carried on as a
  direction carries it; and a pending exit holding one lone empty seat makes its reservation. An empty seat goes on, or
  is reserved, only for an exit that came straight down its origin's link, never one relayed past a BYE, and only from
  the round it entered the structure in, since an award to an empty seat advances nobody. A FIRST_MATCHUP link is asked
  only of a loser it feeds (COMPASS 32 20503744, OLYMPIC 32/29 9100068:
  `aDissolvedConvergenceAdvancesTheReDerivedAward`, `aWithdrawnByeSendsTheReDerivedLoserOn`).
- **A cleared seat's loser link is served from the matchUp as it re-derived.** The removal took back whatever the
  matchUp had sent over a loser link into another structure, before asking what the re-derived matchUp sends. A
  re-derived exit whose loser is nobody keeps the BYE at its loser seat, a loser already standing where the link leads
  stays there, and a BYE another live double exit still claims stays as well (COMPASS 32/30 20694910 and 20485116:
  `aClearedSeatKeepsTheByeItsReDerivedExitHolds`, `aClearedSeatKeepsTheLoserItsReDerivedResultDirected`; COMPASS 16,
  built by hand: `aClearedSeatKeepsTheByeALiveDoubleExitClaims`).
- **A BYE origin goes when its feeder stops delivering.** A BYE matchUp delivers once both its seats are filled, a BYE
  in one and a participant in the other, and only then is the `{ BYE, BYE }` origin it gives the side it feeds true.
  When that participant leaves again (a result clearing whose loser had been sent there), their position stays advanced
  past the BYE, so no release reaches the matchUp holding the origin; the origin goes with the delivery, and the draw is
  the one in which the participant never arrived (FIRST_ROUND_LOSER_CONSOLATION 16/14 21029590:
  `aByeOriginGoesWhenItsFeederSeatEmpties`; 9 census rows on three draw types).
- **A carry past a BYE the forward settle puts back is carried again.** A direction the forward settle makes can
  re-form a double exit whose loser seat takes its BYE again, in front of a carrier whose carry past it a removal had
  taken back. The carry past a late BYE is asked again once the forward settle has written, so the carrier's exit
  stands in the matchUp beyond as forward play writes it (COMPASS 32/32 21097909:
  `aCarryPastAByeTheSettleReplacesIsCarriedAgain`).
- **A carrier arriving at the seat an exit awaits converges with it** (A1 wave 3). A single exit awarded to a seat
  nobody has reached is waiting for whoever arrives there. When the arrival is a participant carrying their own walkover
  or default past a BYE, two exits meet, and the matchUp is the double exit their convergence makes, as it is when the
  carrier's exit was recorded first and the other arrived after. The convergence then produces onward and serves its
  loser link as any convergence does: what the single exit had sent on is withdrawn, and the first carrier, sent over
  the loser link as that exit's loser, comes back, since a double exit has no loser. Before this the carrier took the
  award and won on the exit they had brought, and which of the two draws a schedule reached depended on its order
  (COMPASS 32/27 21028022, 25 census rows: `aCarrierArrivingAtTheSeatAnExitAwaitsConverges`; COMPASS 16/16 20672521:
  `aByeRecordsNoArrivalByResult`; DOUBLE_ELIMINATION 8/5 20722665, where re-entering a double default now returns the
  draw the same results reach entered once: `aDeciderHoldsNobodyUntilItsFinalIsDecided`).
- **A carrier sent into a BYE matchUp records its carry there** (A1 wave 3). A carrier a late BYE sends on, into a
  matchUp a BYE already holds, writes their exit beside that BYE, as the carry rule above states for every matchUp a
  carry passes. Before this the second BYE matchUp recorded nothing, so when its BYE went, the exit coming back stood
  alone and awarded the carrier a match they had walked over (COMPASS 32/27 21137946, 8 census rows:
  `aCarrierPassingIntoAByeMatchUpRecordsItsCarry`).
- **A seat a BYE carried into a round goes on past the next BYE** (A1 wave 3). The settle pass that sends on the seat
  left opposite a BYE (above) treats a position that entered the round from an earlier one as a reservation, and does
  not move it. A position a BYE carried in, empty opposite that BYE in the earlier round, is not a reservation: the BYE
  there advanced it, and the BYE here advances it again, as forward play does in every order (MODIFIED_FEED_IN_CHAMPIONSHIP
  32/27 21029862, FEED_IN_CHAMPIONSHIP_TO_SF 32 21072304, 4 census rows: `aSeatAByeCarriedInGoesOnPastTheNextBye`).
- **A passer comes back when the holder's BYE goes, even beside a held seat** (A1 wave 3). A carrier who passed a BYE
  that a BYE holder had left in the next round goes back with that BYE when the holder's exit is sent on, and the exit
  meets their carry there. The matchUp they had decided onward keeps its award where the seat opposite is held: its
  occupant may have gone on, and the convergence's produced exit awards them the same seat. Before this the carrier
  stayed onward, beside the produced exit, and the matchUp read as an undecided walkover holding two participants
  (FEED_IN_CHAMPIONSHIP_TO_SF 16/14 21089693, CURTIS_CONSOLATION 16 21143807, MODIFIED_FEED_IN_CHAMPIONSHIP 16
  21046667 under `allowChangePropagation`: `aPasserComesBackWhenTheHoldersByeGoes`).
- **An award taken back takes back the BYE it sent over its loser link** (A1 wave 4). A produced exit awarded to the
  participant who arrives opposite it has nobody for a loser, so its loser seat gets a BYE, which the award claims.
  When that participant leaves again, over either link, the award goes and the exit stands pending; a pending exit
  sends nothing over its loser link, so the BYE goes with the award, as it does when a double exit is unwound. Before
  this the loser seat stayed a BYE that no rebuild of the standing results places (COMPASS 32/27 21081040 and 16/14
  21086952 under `doubleExitPropagateBye: false`, 7 census rows: `anUndoneAwardTakesBackItsLoserSeatBye`).
- **A BYE matchUp's loser seat keeps its BYE** (A1 wave 4). A BYE matchUp's loser is a BYE, so the ordinary BYE cascade
  gives its loser seat a BYE that no double exit claims. A double exit's cascade that reaches a BYE standing unclaimed
  in the loser seat of a matchUp that holds a BYE records no claim on it, since the BYE predates the cascade; and
  unwinding a double exit keeps a loser-seat BYE while the matchUp feeding it still holds a BYE. Before this a double
  exit cleared beside a BYE matchUp took that BYE's loser seat with it (COMPASS 16/15 21036395 and 32/27 21060039, 5
  census rows: `aByeMatchUpsLoserSeatKeepsItsBye`). An unclaimed BYE fed by a matchUp with no BYE is still claimed:
  FIRST_MATCH_LOSER's BYE for a loser who has already won a match stands for a reason a later result can take away,
  and the exit that makes the loser nobody is then the BYE's only lasting reason. Skipping that claim let the unwind of
  one exit clear the seat while another exit still owed it its BYE, and the consolation stalled (FIRST_MATCH_LOSER_CONSOLATION
  8/8 9000230, all three arms: `aFirstMatchLoserByeIsClaimedByTheExitThatOwesIt`).
- **A carrier a BYE displaces leaves no carry in any round** (A1 wave 4). A carrier's carry is written in the seat
  they land in and in each matchUp a BYE sends them into. When a propagated BYE takes their seat, the carry is
  withdrawn from every matchUp their position reached, not only the furthest. Before this a BYE-vs-BYE matchUp could
  keep an entry naming a feeder that had become a BYE, in some entry orders and not others (COMPASS 32/31 21079296, 6
  census rows: `aDisplacedCarrierLeavesNoCarryInAnyRound`).
- **An exit carried past a BYE converges with a pending exit beyond it** (A1 wave 4). When a convergence's produced exit
  is carried past a BYE into a matchUp that nobody has reached and that already holds a pending exit on its other
  side, the two exits meet there and the matchUp converges, as it does when the pending exit is the one to arrive
  second. Before this a convergence re-formed by a clear left that matchUp a single WALKOVER (COMPASS 32/29 21129718,
  2 census rows: `aCarryPastAByeMeetsAPendingExit`).
- **A dissolved convergence keeps the BYE its single exit sends, and only the claims a single exit makes** (A1 wave 4).
  Unwinding a double exit that had converged with an awarded single exit re-derives the matchUp to that exit, which
  has nobody for a loser and sends its loser seat a BYE, as forward play does (COMPASS 32/27 21034527:
  `aDissolvedConvergenceSendsItsSingleExitsBye`). A single exit records no claim on a BYE that others already claim,
  because forward play claims only a seat it fills. So when a convergence dissolves to a single exit, its claim on a
  BYE that others still claim is withdrawn, and the BYE stays theirs (COMPASS 32/31 21055187 under
  `doubleExitPropagateBye: false`: `aDissolvedConvergenceLeavesASharedByeClaim`).
- **A carry past a convergence's BYE is written on the first entry** (A1 wave 5). A convergence the settle produces
  serves its loser link, and the BYE it places there can stand in front of a carrier. That carry is written in the
  same call, not when the same outcome is entered a second time. Before this the matchUp beyond the BYE stayed
  TO_BE_PLAYED under the carrier until a second, identical entry wrote it (COMPASS 32, 6 census rows, e.g. 32/27
  21138626: `aCarryPastAConvergencesByeIsCarriedOnTheFirstEntry`).
- **A carrier who went on only as a carrier is released with the carry** (A1 wave 5). When the exit that sent a carrier
  over its loser link converges, the carrier no longer lost anything and leaves the loser seat. If they had gone on
  from that seat past a BYE, or out of a matchUp only exits decided, into matchUps where nothing was played and only
  carried exits decided anything, the release takes the whole carry back and the seat is served as a double exit's
  loser seat. Before this the release refused the position as active, because an award made by the opponent's carried
  exit had reached it, and the director's call was refused ERR_ACTIVE_DRAW_POSITION after the draw had moved (COMPASS
  32/27 21155795 and 32/30 21063079, 4 census rows: `aCarrierPastAByeIsReleasedWhenItsExitConverges`). A carrier who
  went on by a played result is cleared, and refused, as before.
- **A BYE origin goes with the carry a BYE displaces** (A1 wave 5). When a propagated BYE takes a carrier's seat, the
  carry is withdrawn from every matchUp the seat reached, and a BYE origin written opposite that carry goes with it,
  as it does when a double exit is unwound. Before this the origin stood opposite no exit (COMPASS 32/30 21063079:
  `aByeOriginGoesWithTheCarryItStoodOpposite`).
- **A carry entry is written in each matchUp it is carried into past a BYE, in any round and in either entry order.**
  A participant carrying their own walkover or default into a seat beside a BYE goes through it, and the BYE matchUp
  records their carry beside the BYE, whether the carrier was seated first and the BYE arrived after them or the BYE
  stood there first. Before this the BYE-first order recorded the carry only in a structure's last round, so the same
  results entered in the two orders left two draws (COMPASS 32, census A1: `Southwest|1|2` and `Southeast|1|1`).
  Withdrawing the copy instead, once the carry is recorded where the carrier landed, was measured and rejected: a
  pull-back reads the BYE matchUp's copy to find the carry it takes home. Such a copy is not a held exit once its
  carrier's seat has gone to a BYE because a correction made the carrier's origin a double exit; only that double exit's
  produced exit is sent on from there (COMPASS 32/27 20521366: `theWholeDrawIsTheSameInEveryOrder`). Pinned by
  `aCarryPastAnEarlierRoundByeIsRecordedInEitherOrder`.

### Rules settled by census Phase B (2026-10-20)

- **A seat fed by a BYE matchUp keeps its BYE when its last claim goes.** A BYE matchUp's loser is a BYE, so the seat
  it feeds across a link holds a BYE for that reason. Such a seat's BYE can also carry a double exit's claim, placed
  before the feeder became a BYE matchUp. When that double exit dissolved and its claim was withdrawn, the BYE was cleared
  with it, though the feeder still held its BYE. Withdrawing a claim now keeps the BYE while the seat's feeder holds one,
  as unwinding a double exit already did (COMPASS 32/32 30007402 under `doubleExitPropagateBye: false`:
  `aSeatFedByAByeMatchUpKeepsItsByeWhenItsLastClaimGoes`).
- **A relabel reaches the carry on a BYE-held matchUp.** An exit re-entered as the other exit, the winner unchanged
  (WALKOVER and DEFAULTED, either way), relabels its loser's carry. A carry can stop on a matchUp that reads BYE because a
  double exit elsewhere claimed its other seat, and the relabel, which looks for the loser's standing matchUp and passes
  over a BYE, left that entry's label as it was. When the claim later went and the BYE with it, the matchUp was decided
  by the old label. The relabel now rewrites the label on every BYE-held matchUp where the loser's carry is recorded,
  and only the label: the BYE is never re-derived, and the entry's BYE claims stay (CURTIS_CONSOLATION 8/6 30009232
  under `doubleExitPropagateBye: false`: `aRelabelReachesTheCarryOnAByeHeldMatchUp`).

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
