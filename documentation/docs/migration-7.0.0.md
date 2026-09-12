---
title: Migration 6.x to 7.0.0
---

Version 7.0.0 of the Competition Factory is a **major** release driven by breaking changes in four
areas — exit propagation, time-zone conversion, tieFormat validation, and one constant rename. The headline _feature_, the
[LADDER draw type](./whats-new-7.0.0#the-headline-feature--the-ladder-draw-type), is purely additive
and requires no migration.

This document is for **consumers** of the factory (TMX, courthive-components, the server, downstream
tools). It catalogues the breaking changes in 7.0.0 and the exact steps to adopt them. For the
feature tour and the full list of 7.0.0 additions, see [What's New in 7.0.0](./whats-new-7.0.0).

## Breaking changes at a glance

| Change                                                                                   | Who is affected                                                           | Action required   |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------- |
| `particicipantsRequiredMatchUpStatuses` renamed to `participantsRequiredMatchUpStatuses` | Anyone importing that constant by name                                    | Rename the import |
| Re-applying an identical double exit is now a no-op                                      | Callers relying on re-application to re-run propagation                   | See §2            |
| A rejected bare `{ winningSide }` no longer unwinds the existing result                  | Callers matching on `ERR_MISSING_ASSIGNMENTS` for this case               | See §3            |
| `timeZone` conversions return an error instead of throwing or guessing                   | Anyone calling `wallClockToUTC`, `utcToWallClock`, `toEmbargoUTC`         | See §4            |
| `getTimeZoneOffsetMinutes` now returns `number \| undefined`                             | Anyone reading a zone offset                                              | See §4            |
| `checkMatchUpIsComplete` / `getParticipantResults` refuse an absent object param         | Callers passing `matchUpId` / `drawId` and reading the result             | See §5            |
| `getParticipantResults` refuses any matchUp carrying no `sides`                          | Callers passing STORED (non-hydrated) matchUps                            | See §5            |
| `buildDrawHierarchy` is removed                                                          | Anyone calling it (no consumer was found in any CourtHive repo)           | See §6            |
| `addFinishingRounds` refuses an absent `matchUps` array                                  | Callers relying on the empty-array return                                 | See §7            |
| `validateTieFormat` enforces `collectionId` by default                                   | Anyone validating a hand-written or published tieFormat directly          | See §8            |
| `pressureRating` is typed `boolean`, not `string`                                        | TypeScript callers of `tallyParticipantResults` / `getParticipantResults` | See §9            |

## 1. `participantsRequiredMatchUpStatuses` — a spelling fix

_Shipped in [#4782](https://github.com/CourtHive/competition-factory/pull/4782)._

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

_Shipped in [#4782](https://github.com/CourtHive/competition-factory/pull/4782)._

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
`DROPPED_PROGRESSION`.

## 3. A rejected bare `{ winningSide }` no longer unwinds the existing result

_Shipped in [#4782](https://github.com/CourtHive/competition-factory/pull/4782)._

`setMatchUpStatus` now validates a bare `{ winningSide }` outcome **before** any removal runs.
Previously such an outcome skipped the early participant check — it carries no `matchUpStatus` — and
was caught later, after `removeDoubleExit` or `removeDirectedParticipants` had already unwound the
existing result. A rejected call could therefore **destroy a recorded result**: a pending propagated
exit could be left `TO_BE_PLAYED` by a request that returned an error.

The only interface change is the error _code_ for this case, which moved from
`ERR_MISSING_ASSIGNMENTS` to `ERR_INVALID_MATCHUP_STATUS` — the rejection now comes from the
participant check rather than from the later score-modification guard. Match on behaviour rather
than on that specific code.

:::note This fix is scoped to that one outcome shape
It does **not** mean every rejected mutation leaves the draw untouched. A direct `setMatchUpStatus`
that fails part-way through a propagation cascade can still return an error over changed state —
measured on 2026-09-11 at 78 of 600 randomized scenarios. Callers that need all-or-nothing should
go through `executionQueue` with `rollbackOnError: true`, which snapshots and restores; that is what
TMX and competition-factory-server do on every mutation.
:::

## 4. Time-zone conversions refuse rather than throw or guess

_Shipped in [#4783](https://github.com/CourtHive/competition-factory/pull/4783)._

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

## 5. Two queries refuse an absent object param instead of answering

_Shipped in [#4796](https://github.com/CourtHive/competition-factory/pull/4796), [#4797](https://github.com/CourtHive/competition-factory/pull/4797), [#4799](https://github.com/CourtHive/competition-factory/pull/4799)._

`checkMatchUpIsComplete` takes a **matchUp object**; `getParticipantResults` takes an **array of
in-context matchUps**. Neither takes an id.

`paramsMiddleware` resolves `drawId` into a `drawDefinition` and stops there — it does not resolve
`matchUpId` into a matchUp, and it does not gather matchUps. So the engine-idiomatic call supplied
no object at all, and both functions answered anyway:

```js
// BEFORE 7.0.0 — both of these are wrong, and neither says so
tournamentEngine.checkMatchUpIsComplete({ matchUpId, drawId }); // false, for a COMPLETED matchUp
tournamentEngine.getParticipantResults({ drawId }); // { participantResults: {} }, for a played draw
```

Both now return an error — `ERR_MISSING_MATCHUP` and `ERR_MISSING_MATCHUPS`.

`checkMatchUpIsComplete` additionally requires the object to carry a `matchUpId`, which is what
distinguishes a matchUp from an arbitrary object. It does **not** require a hydrated matchUp —
`matchUpStatus` and `winningSide` are both on the stored record.

### Why this was worth breaking

`checkMatchUpIsComplete` returns a **boolean that callers branch on**. There was no error to notice
and no `undefined` to guard, and the wrong answer — `false`, "not complete" — is the one that looks
safe. It would be believed.

### What to do about the refusal

**Pass the object.** If you hold only ids, resolve them first:

```diff
- const complete = tournamentEngine.checkMatchUpIsComplete({ matchUpId, drawId });
+ const { matchUp } = tournamentEngine.findMatchUp({ matchUpId, drawId });
+ const complete = tournamentEngine.checkMatchUpIsComplete({ matchUp });

- const { participantResults } = tournamentEngine.getParticipantResults({ drawId });
+ const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
+ const { participantResults } = tournamentEngine.getParticipantResults({ matchUps });
```

An **empty** array is still a valid question with an empty answer. The guard is on the argument being
absent, not on it being empty, so a draw with no matchUps tallies to nothing exactly as before.

### Stored matchUps are refused too, and this one replaces a fabricated participant

`getParticipantResults` attributes every result through `sides[].participantId`. A **stored** matchUp
has `drawPositions` and no participant sides, so there is nothing to attribute to.

Until 7.0.0 the helper that reads a side returned the **literal string `'foo'`** when `sides` was
absent — and `'foo'` is a participantId as far as everything downstream is concerned. A round robin
tallied from stored matchUps therefore returned results keyed `foo` rather than failing:

```js
getParticipantResults({ matchUps: inContextMatchUps }); // { 'p1': {…}, 'p2': {…}, 'p3': {…}, 'p4': {…} }
getParticipantResults({ matchUps: storedMatchUps }); // BEFORE: { 'foo': {…} }   AFTER: { error: INVALID_MATCHUP }
```

Two `console.log` calls shipped alongside it. Both are gone.

The check requires **every** matchUp to carry both sides, played or not, and it requires **both**
indices because the winner is read from index 0 and the loser from index 1.

It is not scoped to `winningSide`, and that matters. Both code paths read `sides[].participantId` — a
decided matchUp through `getSideId`, an undecided one through `processScore` — so scoping to the
decided path left the same input with two different failure modes separated only by how far the draw
had progressed:

```js
getParticipantResults({ matchUps: storedMatchUps }); // draw played     -> { error: INVALID_MATCHUP }
getParticipantResults({ matchUps: storedMatchUps }); // not yet played  -> uncaught TypeError
```

A matchUp that legitimately has no participants yet still carries its sides — an unplayed in-context
matchUp has `sides` with `drawPosition` and no `participantId`, and tallies to nothing exactly as
before. What is refused is a matchUp with no sides at all, which only a stored record has.

The refusal is **all-or-nothing**: one unusable matchUp refuses the whole call rather than being
skipped. Skipping would return a tally silently missing matches, which is the failure this exists to
prevent rather than a milder form of it. An **empty** array remains a valid question with an empty
answer.

**What to do:** pass in-context matchUps — `allDrawMatchUps`, `allStructureMatchUps`,
`allTournamentMatchUps` all return them. If you were reading a `foo` key out of the result, that was
never a participant.

### Two behaviours that did NOT change

`checkMatchUpIsComplete` still returns `true`, the `winningSide` (`1` | `2`), **or `undefined`** — it
was never a clean boolean, and the `undefined` is load-bearing: `tallyParticipantResults`
distinguishes "not complete" from "no answer" with `?? matchUp.matchUpType === TEAM`. Normalising it
to `false` would silently drop incomplete TEAM matchUps from the round-robin tally.

And because the refusal is an **object**, it is **truthy**. Do not call `checkMatchUpIsComplete`
inside a `.filter()` or `.every()` over an array that can hold a falsy entry without guarding the
entry first — a refusal would read as "complete". Every caller inside the factory guards.

## 6. `buildDrawHierarchy` is removed

_Shipped in [#4801](https://github.com/CourtHive/competition-factory/pull/4801)._

`buildDrawHierarchy` turned a flat `matchUps` array into a nested parent/children tree, and its
companion `collapseHierarchy` toggled `children` / `_children` on a node — the shape early **D3**
expected for a collapsible tree layout. It is how TMX rendered draw structures years ago.

It is removed rather than deprecated because **nothing consumed it**. Measured across
`scoringVisualizations`, `epixodic`, TMX, `courthive-public`, `courthive-components`,
`CourtHive.com` and `courthive-arena` — 1,809 source files, of which 310 reference the factory — the
sweep returned zero matches. The factory's own documentation never mentioned it, and inside the
factory the only references were type plumbing and the governor export: there was no internal caller.

`collapseHierarchy` went with it. It was exported from the same module but never published through a
governor, so it was never part of the engine surface.

### What to do about the removal

**If you were calling it, you have a renderer we could not find, and we would like to know.** The
implementation and its full test suite are preserved verbatim at
`Mentat/deprecated/factory/buildDrawHierarchy/`, so restoring it is a copy rather than an
archaeology exercise.

Before restoring, consider whether you want _that_ shape. It is a 2018-era D3 contract; a renderer
written today is more likely to want `getRoundMatchUps` or the draw's own structure/link graph.

## 7. `addFinishingRounds` refuses an absent `matchUps` array

_Shipped in [#4802](https://github.com/CourtHive/competition-factory/pull/4802)._

`addFinishingRounds` stamps `finishingRound` and `finishingPositionRange` onto matchUps. It takes a
**matchUps array**, not a `drawId` — `paramsMiddleware` resolves `drawId` into a `drawDefinition` and
stops there; it does not gather matchUps.

Given nothing usable it returned `[]`. That is worse here than in §5, because the shape a caller
naturally writes is an assignment:

```js
// BEFORE 7.0.0 — silently replaces your matchUps with an empty array
matchUps = tournamentEngine.addFinishingRounds({ drawId });
```

It now returns `{ error: MISSING_MATCHUPS }`.

### What to do about it

Nothing, for the normal usage. **This function mutates its matchUps in place and returns the same
array reference**, so the return value carries no information the caller does not already hold:

```js
tournamentEngine.addFinishingRounds({ matchUps }); // matchUps are stamped; the return is the same array
```

If you assign from it, branch on the error, or drop the assignment — either is correct.

Valid input behaves exactly as before. An **empty** array is valid and stamps nothing.

## 8. `validateTieFormat` enforces `collectionId` by default

_Shipped in [#4825](https://github.com/CourtHive/competition-factory/pull/4825)._

`validateTieFormat` used to report an id-less tieFormat **valid**, so a consumer validating directly
got a false all-clear — while every generated line carried `collectionId: null`, could not be
attributed to its collection, and the tie never scored. The detector existed and was switched off.

It now enforces. A published `fixtures.tieFormats.*` object carries no collectionIds — it cannot,
since a `collectionId` identifies a collection _instance_ within a record — so validating one
directly, or passing one to an API that validates at the door such as `generateEventsFromTieFormat`,
is now refused with `ERR_INVALID_TIE_FORMAT`.

### What changed for draw generation: nothing

`generateDrawDefinition` and `addEvent` still accept a published fixture untouched. They mint the
ids internally, and validation now runs **after** that mint rather than before it.

### Minting, and why you must supply the UUIDs

`mintCollectionIds` is published on the tieFormat governor:

```js
const uuids = tools.UUIDS(tieFormat.collectionDefinitions.length);
tournamentEngine.mintCollectionIds({ tieFormat, uuids });
```

**Supply `uuids` whenever the same mutation runs in more than one place.** A client that executes
against a server and then re-applies the same methods locally will otherwise mint a different
`collectionId` on each side for the same collection, and the two copies of the record diverge
silently. Generate the pool once, send it with the mutation, and both executions mint identically.
Omitting `uuids` still mints — that is the pre-7.0.0 behaviour — but only do so where the call runs
exactly once.

If a supplied pool runs out, the result is `ERR_INSUFFICIENT_UUIDS` rather than a freshly minted id,
so a shortfall surfaces as a conflict instead of becoming a permanent mismatch.

### Validating before the ids exist

Pass `checkCollectionIds: false` where validation legitimately runs before the mint — that is what
the factory's own pre-mint call sites do.

## 9. `pressureRating` is a boolean

_Shipped in [#4825](https://github.com/CourtHive/competition-factory/pull/4825)._

`tallyParticipantResults` and `getParticipantResults` declared `pressureRating?: string` while every
caller passed a boolean and the only use is `if (pressureRating)`. The declaration was wrong, not the
usage. It is now `boolean`.

Runtime behaviour is unchanged — a truthy string behaved identically. Only TypeScript callers who
declared the value as a `string` need to change, and only in their own types.

## 10. `usePublishState` honours discrete structure publishing

_Shipped in [#4827](https://github.com/CourtHive/competition-factory/pull/4827)._

`getDrawData({ usePublishState: true })` now **omits** a structure whose publishing detail says it is
not published, or that is embargoed. It previously returned every structure of a published draw
regardless — the filter ended in `|| true`, so the `isVisiblyPublished` call it contained could never
affect the result and discrete structure publishing was not honoured at all.

A structure with **no** publishing detail is unaffected: it is still returned. That is the legacy
shape — publish status predates discrete structure publishing — and it is now pinned by a test.

### What to expect

A consumer reading publish-state-filtered draw data may see **fewer** structures than before, for
draws where a structure was explicitly unpublished or embargoed. That is the intended behaviour
arriving for the first time, not a loss: those structures were being served despite being marked
hidden.

An unpublished **draw** is unchanged — it returned no structures before and returns none now.

## 11. Non-breaking additions worth knowing

`plainDate`, `plainTime` and `zonedDateTime` are new published exports, completing the calendar
intent set. `zonedTime` was never published, so its rename is not a breaking change.

The `LADDER` drawType is generatable and its lifecycle is on the engine as eighteen new methods —
`issueChallenge`, `acceptChallenge`, `declineChallenge`, `submitResult`, `confirmResult`,
`disputeResult`, `applyLadderMovement`, `addLadderParticipant`, `removeLadderParticipant`,
`refreshLadderRatings`, and eight `get*` queries. All are additive; see
[What's New in 7.0.0](./whats-new-7.0.0#driving-a-ladder).

`PositionAssignment.byeFromPropagation` is a new optional boolean recording that a BYE was placed by
an exit cascade rather than by draw generation or by hand. It is visible in stored tournament
records and in anything that round-trips `positionAssignments`. See
[Exit Propagation](/docs/concepts/exit-propagation#bye-provenance-byefrompropagation).

`matchUp.sideExitProvenance` is a new optional per-side record of why an exit sits on a side —
`previousMatchUpStatus` (the upstream status that caused it), `matchUpStatus` (what this side was
given), and `sourceMatchUpId`. It is keyed by `sideNumber`. Propagation provenance previously lived
positionally inside `matchUpStatusCodes`, beside two unrelated element shapes; it still does, so this
is purely additive. It is visible in stored tournament records. See
[Exit provenance](/docs/concepts/exit-propagation#exit-provenance-sideexitprovenance).

### `matchUpStatusCodes` values can change: exits are no longer relabelled as walkovers

This one is additive in **shape** but visible in **values**, so it is called out rather than left in
the list below.

A normalization in the propagation path mapped every object-shaped element of `matchUpStatusCodes` to
the walkover code `WO`. Measured across randomized scenarios, of the 50 provenance elements that
reached it, **13 were BYEs and 9 were defaults** — 44% of what it rewrote was not a walkover, and the
rewritten value was persisted.

Each element now resolves to its own outcome code: a default yields `DEF`, a retirement `RET`, and a
BYE contributes **no code** rather than becoming a walkover.

**What to do:** if you read `matchUpStatusCodes` and branch on `WO`, re-check those branches. A
matchUp whose code array previously read `['WO', 'DM']` may now read `['DEF', 'DM']` — the second
element is unchanged; the first now tells the truth about the upstream exit. Nothing about the
`matchUpStatus` itself changed.

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
