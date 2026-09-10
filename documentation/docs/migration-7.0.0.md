---
title: Migration 6.x to 7.0.0
---

This document is for **consumers** of the factory (TMX, courthive-components, the server, downstream
tools). It catalogues the breaking changes in 7.0.0 and the exact steps to adopt them.

## Breaking changes at a glance

| Change                                                                                   | Who is affected                                                   | Action required   |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------- |
| `particicipantsRequiredMatchUpStatuses` renamed to `participantsRequiredMatchUpStatuses` | Anyone importing that constant by name                            | Rename the import |
| Re-applying an identical double exit is now a no-op                                      | Callers relying on re-application to re-run propagation           | See §2            |
| A rejected `setMatchUpStatus` no longer alters the draw                                  | Callers with compensating logic after an error                    | See §3            |
| `timeZone` conversions return an error instead of throwing or guessing                   | Anyone calling `wallClockToUTC`, `utcToWallClock`, `toEmbargoUTC` | See §4            |
| `getTimeZoneOffsetMinutes` now returns `number \| undefined`                             | Anyone reading a zone offset                                      | See §4            |

## 1. `participantsRequiredMatchUpStatuses` — a spelling fix

The exported constant was misspelled **`particicipantsRequiredMatchUpStatuses`** (an extra `ici`)
since it was introduced. It is a published top-level export, so correcting it is a breaking change
and 7.0.0 is the first opportunity to make it.

```diff
- import { particicipantsRequiredMatchUpStatuses } from 'tods-competition-factory';
+ import { participantsRequiredMatchUpStatuses } from 'tods-competition-factory';
```

### What to do

Rename the import. Nothing else changes — the value, the type and the semantics are identical. The
constant lists the `matchUpStatus` values that require participants to be present on the matchUp,
and it is consumed internally by `setMatchUpState`.

**No deprecated alias is provided.** Keeping one would preserve the misspelling in the public API
indefinitely, which is the thing this release exists to fix. A survey of the CourtHive ecosystem
found no consumer importing the old name, so the practical migration cost is zero.

## 2. Re-applying a double exit is now idempotent

Sending the identical double-exit outcome twice now returns success and writes nothing the second
time. Previously the second call re-ran the propagation cascade — which read its own earlier work as
a _second_ source exiting into the same target, escalated the produced `WALKOVER` to a
`DOUBLE_WALKOVER`, and cascaded a round further. Both calls reported success, so a client retry or a
double-click corrupted the draw progressively and silently.

### What to do about re-application

Nothing, for almost everyone — this removes a corruption path. A genuine _change_ still propagates:
`DOUBLE_WALKOVER` to `DOUBLE_DEFAULT` is a change, not a repeat.

The one behaviour that is gone is **re-application as an accidental repair**. If a draw was somehow
left with the status set but the advancement missing, re-sending the same outcome used to nudge it.
It no longer will. That state is reported by `getDrawInconsistencies` as `WINNER_NOT_ADVANCED` or
`DROPPED_PROGRESSION`; repair it deliberately rather than by sending a duplicate request.

## 3. A rejected mutation leaves the draw unchanged

`setMatchUpStatus` now validates a bare `{ winningSide }` outcome **before** any removal runs. If the
call is refused, the draw is byte-identical to what it was.

Previously such an outcome skipped the early participant check — it carries no `matchUpStatus` — and
was caught later, after `removeDoubleExit` or `removeDirectedParticipants` had already unwound the
existing result. A rejected call could therefore **destroy a recorded result**: a pending propagated
exit could be left `TO_BE_PLAYED` by a request that returned an error.

### What to do about compensating logic

If you have compensating logic that re-reads or repairs state after an error from
`setMatchUpStatus`, it is no longer needed. The error itself is unchanged in kind; what changed is
that it now arrives over untouched data.

Note the error _code_ for this case moved from `ERR_MISSING_ASSIGNMENTS` to
`ERR_INVALID_MATCHUP_STATUS`, since the rejection now comes from the participant check rather than
from the later score-modification guard. Match on behaviour rather than on that specific code.

## 4. Time-zone conversions refuse rather than throw or guess

The zoned calendar intent had two implementations. `timeZone.ts` was published; `zonedTime.ts` was
internal and carried every live conversion in the repo. On valid input the two were numerically
identical — 420,480 wall clocks across 12 zones and every day of 2026, plus all 418 IANA zones from
1970 onward, produced zero disagreements. DST was never the difference.

The difference was failure handling, and each was fail-open on a different axis. `timeZone.ts`
**threw an uncaught `RangeError`** from functions typed `string | { error }` — for an unrecognised
zone, and for seven of eight malformed date/time inputs — and omitting the zone returned the _host
machine's_ offset, so the same published call answered differently on a New York server and a London
one. `zonedTime.ts` never threw, but silently substituted the caller's offset for an unrecognised
zone.

`zonedDateTime` is now the single implementation and `timeZone` is an adapter over it with no
arithmetic of its own. Three inputs now get three answers, and never a substituted number:

| Input             | Result                                                   |
| ----------------- | -------------------------------------------------------- |
| zone absent       | the caller's `utcOffsetMinutes`, with `source: 'offset'` |
| zone unrecognised | refused — `{ error: INVALID_TIME_ZONE }`                 |
| zone recognised   | resolved per instant, with `source: 'zone'`              |

Malformed input is likewise reported rather than thrown: `{ error: INVALID_DATE }` or
`{ error: INVALID_TIME }`.

### `getTimeZoneOffsetMinutes` also changes shape

It now returns `number | undefined` rather than `number`. Previously it **threw** an uncaught
`RangeError` for an unrecognised zone, and returned the _host machine's_ offset when called with no
zone at all. Neither behaviour was documented or tested, so no correct caller can have depended on it.

```diff
- const offset = tools.timeZone.getTimeZoneOffsetMinutes(timeZone);
+ const offset = tools.timeZone.getTimeZoneOffsetMinutes(timeZone);
+ if (offset === undefined) return; // unrecognised or absent zone
```

This is the one change in this section that alters a published **type**, so a TypeScript consumer
sees it at compile time rather than discovering it at runtime.

### What to do about the error return

**Handle the error return.** These functions were always typed as returning `string | { error }`, so
correctly-typed callers already branch on it — but any caller that relied on a `try/catch` around a
throw will no longer see an exception, and any caller that passed an unrecognised zone and received
a plausible-looking number will now receive an error instead.

```diff
- try {
-   const utc = wallClockToUTC(date, time, timeZone);
- } catch (err) { /* unreachable now */ }
+ const utc = wallClockToUTC(date, time, timeZone);
+ if (typeof utc !== 'string') return utc;   // { error: INVALID_TIME_ZONE | INVALID_DATE | INVALID_TIME }
```

`source` is returned rather than logged, so a caller can see which frame it got rather than having
to infer it.

## 5. Non-breaking additions worth knowing

`plainDate`, `plainTime` and `zonedDateTime` are new published exports, completing the calendar
intent set. `zonedTime` was never published, so its rename is not a breaking change.

`PositionAssignment.byeFromPropagation` is a new optional boolean recording that a BYE was placed by
an exit cascade rather than by draw generation or by hand. It is visible in stored tournament
records and in anything that round-trips `positionAssignments`. See
[Exit Propagation](/docs/concepts/exit-propagation#bye-provenance-byefrompropagation).

The remaining additions require no migration. They are listed because a sufficiently exhaustive
TypeScript consumer will notice them.

### `MatchUpStatusEnum` gains `CHALLENGED`

A challenge issued on a `LADDER` draw and not yet answered. If you `switch` over `MatchUpStatusEnum`
with no `default` and rely on exhaustiveness checking, that switch is now non-exhaustive and will
fail to compile until the case is added.

`CHALLENGED` is **scoped**: it is valid only in a `LADDER` drawType, and `setMatchUpStatus` returns
`ERR_MATCHUP_STATUS_OUT_OF_SCOPE` if it is used anywhere else. It is the first status whose context
is enforced rather than conventional — `DEAD_RUBBER`, meaningful only inside a team tie, is still
scoped by convention alone.

It appears in `validMatchUpStatuses`, `participantsRequiredMatchUpStatuses`,
`nonDirectingMatchUpStatuses` and **`upcomingMatchUpStatuses`**. That last one widens the meaning of
"upcoming" from _will happen_ to _is expected to happen_, since a challenge may be declined or
expire — deliberate, because a challenge missing from every upcoming-match view is invisible to the
people who must act on it.

### `LADDER` joins the draw types

See [Ladder](./concepts/draw-types/ladder). `isAdHocType('LADDER')` is `true` — a ladder shares the
`AD_HOC` structure shape — so any code branching on `isAdHocType` will now include ladders. Use
`isLadder` where the difference matters: an `AD_HOC` draw's `positionAssignments` are a roster, a
ladder's are an ordered standing.

### `DisciplineEnum` gains `SQUASH` and `BADMINTON`

Same exhaustiveness note as above. The `matchUpFormat` grammar already parsed and round-tripped both
sports' scoring; they were simply missing from the curated vocabulary that drives autocomplete and
typo defense.
