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

| Change                                                                                            | Who is affected                                                             | Action required   |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------- |
| `particicipantsRequiredMatchUpStatuses` renamed to `participantsRequiredMatchUpStatuses`          | Anyone importing that constant by name                                      | Rename the import |
| Re-applying an identical double exit is now a no-op                                               | Callers relying on re-application to re-run propagation                     | See §2            |
| A rejected bare `{ winningSide }` no longer unwinds the existing result                           | Callers matching on `ERR_MISSING_ASSIGNMENTS` for this case                 | See §3            |
| `timeZone` conversions return an error instead of throwing or guessing                            | Anyone calling `wallClockToUTC`, `utcToWallClock`, `toEmbargoUTC`           | See §4            |
| `getTimeZoneOffsetMinutes` now returns `number \| undefined`                                      | Anyone reading a zone offset                                                | See §4            |
| `checkMatchUpIsComplete` / `getParticipantResults` refuse an absent object param                  | Callers passing `matchUpId` / `drawId` and reading the result               | See §5            |
| `getParticipantResults` refuses any matchUp carrying no `sides`                                   | Callers passing STORED (non-hydrated) matchUps                              | See §5            |
| `buildDrawHierarchy` is removed                                                                   | Anyone calling it (no consumer was found in any CourtHive repo)             | See §6            |
| `addFinishingRounds` refuses an absent `matchUps` array                                           | Callers relying on the empty-array return                                   | See §7            |
| `validateTieFormat` enforces `collectionId` by default                                            | Anyone validating a hand-written or published tieFormat directly            | See §8            |
| `pressureRating` is typed `boolean`, not `string`                                                 | TypeScript callers of `tallyParticipantResults` / `getParticipantResults`   | See §9            |
| Three request-shape fields gain real types (`positioning`, `finishingPositionNaming`, `schedule`) | TypeScript callers passing these loosely                                    | See §11           |
| The SEEDING policy is typed, and two `stage` fields become `StageTypeUnion`                       | TypeScript callers with a wrong-typed seeding-policy field                  | See §11           |
| `modifyParticipantOtherName` clears on `''` and no longer overwrites on `undefined`               | Anyone calling it to set, clear, or unset `participantOtherName`            | See §13           |
| A produced exit no longer overwrites `matchUpStatus: BYE` — the BYE stays a BYE                   | Anyone reading `matchUpStatus` to detect an exit at a BYE-held matchUp      | See §19           |
| A produced exit carries NO `winningSide` until a participant actually arrives                     | Any UI or caller reading `winningSide` to render a produced walkover        | See §20           |
| A load-bearing outcome can no longer be re-scored while a dependent result stands                 | Anyone correcting a result that has already propagated into a decided match | See §21           |

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
that fails part-way through a propagation cascade can still return an error over changed state.
Callers that need all-or-nothing should go through `executionQueue` with `rollbackOnError: true`,
which snapshots and restores; that is what TMX and competition-factory-server do on every mutation.
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

**If you were calling it, you have a renderer we could not find, and we would like to know** —
[open an issue](https://github.com/CourtHive/competition-factory/issues). The implementation and its
full test suite are preserved verbatim outside this repository, so restoring it is a copy rather than
an archaeology exercise.

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

_Shipped in [#4825](https://github.com/CourtHive/competition-factory/pull/4825)._

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

## 11. Three request-shape fields gain real types

_Shipped in [#4839](https://github.com/CourtHive/competition-factory/pull/4839)._

The factory types its **domain** data rigorously — `EventTypeUnion`, `DrawTypeUnion` and friends are
closed unions, value-exported, and guarded against drift. That rigour historically stopped at the
function boundary: request shapes reached for `any` and for bare `string` even where a closed union
for that exact field already existed. Three of those are now typed. **No runtime behaviour changes** —
every value that worked before still works; only the compile-time contract narrows.

A new CI gate, `pnpm check:request-shapes`, keeps the rest from decaying further and enumerates the
debt that remains.

### `SeedingProfile.positioning` is now `SeedingProfileUnion`

```diff
- positioning?: string;
+ positioning?: SeedingProfileUnion;   // 'ADJACENT' | 'CLUSTER' | 'SEPARATE' | 'WATERFALL'
```

`SeedingProfileEnum` also **gains `ADJACENT`**, which it had been missing. `ADJACENT` is a synonym
for `CLUSTER` and has always been honoured at runtime (`generateBlockPattern`, `getContainerBlocks`);
it was exported as a constant and from `drawDefinitionConstants`, but not as an enum member. Adding
it means the closed union accepts every value the factory actually acts on.

Note that this field is the **seeding** pattern. It is unrelated to `PositioningProfileEnum`
(`DRAW` / `RANDOM` / `TOP_DOWN` / `BOTTOM_UP` / `LOSS_POSITION` / `WATERFALL`), which governs a
different concern despite the overlapping name.

#### What to do about `positioning`

Nothing, if you pass one of the four values. A TypeScript build that passes any other string will now
fail — that string was already ignored by the seeding logic, so the failure is the type catching
something that never worked.

### `WithPlayoffsArgs.finishingPositionNaming` is now `NamingEntry`

```diff
- finishingPositionNaming?: any;
+ finishingPositionNaming?: NamingEntry;
```

`NamingEntry` is `{ [finishingPositionRange: string]: { name: string; abbreviation: string; structureId?: string } }`
— exactly what `generatePlayoffStructures` and `addPlayoffStructures` have always asserted
internally. It is now declared in the public types and re-exported from its original module, so
consumers can name it.

#### What to do about `finishingPositionNaming`

Ensure each entry carries both `name` and `abbreviation`. An entry supplying only one of them
compiled before and produced a structure with an `undefined` name.

### `ScheduledMatchUpArgs.schedule` is now `MatchUpSchedule`

```diff
- schedule?: any;
+ schedule?: MatchUpSchedule;
```

Affects `matchUpCourtOrder`, `matchUpTimeModifiers`, `matchUpAssignedVenueId`, `scheduledMatchUpDate`
and `getHomeParticipantId`. `MatchUpSchedule` is the already-published shape of `matchUp.schedule`,
which is where every caller sources the value. No consumer in the CourtHive ecosystem calls any of
these five functions — measured across 17 repos on 2026-09-12.

#### What to do about `schedule`

In practice, nothing. `MatchUpSchedule` carries an `[key: string]: any` index signature, so extra keys
are still accepted and excess-property checking does not fire. What the type now rejects is a
**non-object** — `schedule: 'someString'` or `schedule: 42` — which never worked at runtime either.
This is the mildest of the three changes; it is listed because it is still a signature change.

### The SEEDING policy is typed — known fields enforced, unknown fields still accepted

`PolicyDefinitions` types every policy as `{ [key: string]: any }`, so the SEEDING policy's shape was
never declared — even though `validateAndDeriveDrawValues` reads `seedingProfile.drawTypes`, a field
the factory's own `SeedingProfile` type does not have. The factory read a field its own type did not
declare, which is why downstream consumers hand-wrote mirrors of the shape.

`SeedingPolicy`, `PolicySeedingProfile` and `SeedsCountThreshold` are now declared and exported, and
`PolicyDefinitions` narrows its `seeding` key to `SeedingPolicy` **by intersection**:

```ts
export type PolicyDefinitions = {
  [key in ValidPolicyTypes]?: { [key: string]: any };
} & {
  [POLICY_TYPE_SEEDING]?: SeedingPolicy;
};
```

That intersection is deliberate and is what keeps this safe. Because the first arm keeps its
`{ [key: string]: any }` index signature:

- a policy carrying **extra or provider-specific fields still compiles** — excess-property checking
  does not fire, so a custom seeding policy is not broken;
- the fields the factory **does** declare are now type-checked, so
  `seedingProfile: { positioning: 'TOP_DOWN' }` is rejected — `TOP_DOWN` belongs to
  `PositioningProfileEnum`, which has nothing to do with seeding.

One consequence worth stating plainly: **a misspelled field is NOT caught** through
`PolicyDefinitions`, precisely because unknown keys remain legal. To get that check, annotate the
policy itself — `satisfies SeedingPolicy` — which is what the factory's own `POLICY_SEEDING_*`
fixtures now do.

#### What to do about seeding policies

Nothing, unless a declared field carries the wrong type. Every stock policy shape — including the
per-drawType override form — was compiled against the new type unchanged.

### Two `stage` fields become `StageTypeUnion`

`StructureProfile.stage` / `.rootStage` (returned by `getStructureGroups`) and `PointAward.stage`
(produced by the ranking-points engine) were `string`. Both are **results** the factory produces, and
both are populated from `structure.stage`, which is already `StageTypeUnion` — so the declared type
was simply wider than anything the factory ever put there.

#### What to do about `stage`

Nothing. Reading a narrower type where you expected `string` is safe. Only code that **writes** a
non-stage string back into one of these result objects is affected.

### The new gate: `pnpm check:request-shapes`

Wired into `verify:generated`, so it runs on every PR. Two rules over request shapes (exported types
named `*Args`, plus the `*Profile` sub-objects they nest):

1. **no bare `any`** — an index signature to `any` is the deliberate open-map idiom and is exempt;
2. **no bare `string`** where a closed union already types a field of that name elsewhere.

The union registry is **derived**, not hand-listed, so a new enum is covered automatically and a
field name claimed by two different unions is dropped rather than arbitrated. Fields that cannot be
typed today live in `scripts/verify/requestShapes.allow.json` with a one-line reason each, and an
allowlist entry that matches nothing fails the run — so the debt is counted, not hidden.

This affects consumers only in that a future major will type more of these fields. Nothing in the
allowlist changes behaviour in 7.0.0.

## 11a. [#4847](https://github.com/CourtHive/competition-factory/pull/4847) carries no breaking change

Listed only because `verify:migration-coverage` requires every commit it reads as breaking to appear
here, and this one is a false positive with an instructive cause.

[#4847](https://github.com/CourtHive/competition-factory/pull/4847) adds a test file and a
documentation section — `census.test.ts`, inert unless `CENSUS=1`. It changes no runtime code and no
public surface.

It reads as breaking because its **squash commit body absorbed other PRs' `BREAKING CHANGE:`
footers**. The PR was opened against `dev`; `dev` was then deleted as a side effect of the first
`dev`→`master` checkpoint merge (the repo had `delete_branch_on_merge` enabled, and the checkpoint PR
has `dev` as its head branch). GitHub retargets open PRs whose base branch is deleted, so #4847's
base silently became `master`, its commit list expanded from one commit to every commit on the branch
not yet on `master`, and the squash concatenated all of their bodies — footers included.

The breaking changes those footers describe are real and are documented above, at
[§11](#11-three-request-shape-fields-gain-real-types) and elsewhere; none of them belongs to #4847.

Both repository settings were corrected on 2026-09-13 — `allow_merge_commit: true` so a checkpoint
merges as a merge commit, and `delete_branch_on_merge: false` so `dev` survives one. No action is
required of consumers.

## 11b. A retirement no longer carries into the consolation by default

_Shipped in [#4852](https://github.com/CourtHive/competition-factory/pull/4852)._

**A retiree is out of a MATCH, not out of the EVENT, unless the governing policy says so.**

Previously, with `propagateExitStatus: true`, a `RETIRED` result carried a `WALKOVER` into the
retiring player's consolation matchUp — the opponent won it before an opponent even existed. The
engine was answering a rules question on a federation's behalf.

That is now the scoring-policy setting `propagateRetirementAsExit`, defaulting to `false`:

| value                   | the retiring player's consolation matchUp                            |
| ----------------------- | -------------------------------------------------------------------- |
| `false` _(new default)_ | left `TO_BE_PLAYED` — an ordinary loser, who may still play          |
| `true`                  | a `WALKOVER` to the opponent — the retiree's participation has ended |

Placement is unchanged: the retiring player is directed to the linked structure either way, exactly
as any other loser is. Only what happens to them **on arrival** differs.

**Who is affected.** Only callers passing `propagateExitStatus: true` (or setting it in policy) AND
relying on a retirement carrying onward. With `propagateExitStatus` off — the factory default —
nothing changes. `POLICY_SCORING_USTA` sets `propagateRetirementAsExit: true` explicitly, so its
observable behaviour is unchanged.

**To restore the old behaviour**, set it in your scoring policy:

```js
policyDefinitions: {
  [POLICY_TYPE_SCORING]: { propagateExitStatus: true, propagateRetirementAsExit: true },
}
```

or pass `propagateRetirementAsExit: true` per call. An explicit `false` wins from either source —
unlike `propagateExitStatus`, which resolves as `param || policy || undefined` and so cannot express
one.

## 11c. Removing a result now takes back the exits it produced

_Shipped in [#4855](https://github.com/CourtHive/competition-factory/pull/4855)._

The companion to [11b](#11b-a-retirement-no-longer-carries-into-the-consolation-by-default): once a
governing policy decides that a retirement propagates, a tournament director must be able to
**un-decide** it.

Previously an exit that propagated into a consolation was never taken back. Two consequences:

1. **The clear was refused.** Measured across 5 loser-linked draw types × `RETIRED` / `WALKOVER` /
   `DEFAULTED`, entering the outcome succeeded in 15 of 15 cases and clearing it failed in 15 of 15
   with `ERR_PROPAGATED_EXITS_DOWNSTREAM`. This was never retirement-specific — a walkover and a
   default were refused identically.
2. **A re-score left a phantom.** Re-scoring a walkover to a completed result left the consolation
   matchUp `WALKOVER` with a `winningSide`, its provenance naming a source that was no longer an
   exit, while its occupant had been swapped for the new loser. The next participant to arrive won a
   walkover nobody had played. `getDrawInconsistencies` did not report it.

Both are now correct: `setMatchUpStatus` withdraws every exit the matchUp produced, following
`sideExitProvenance.sourceMatchUpId` to a fixpoint — so a COMPASS chain three structures deep unwinds
in one operation — and releases any advancement those exits had granted.

**Who is affected.** Only callers using `propagateExitStatus` (or a policy that sets it, such as
`POLICY_SCORING_USTA`). With exit propagation off — the factory default — nothing propagates, so
nothing is withdrawn and behaviour is unchanged.

**What changes for a caller who does use it:**

| before                                                                       | after                                                            |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| clearing the source of a propagated exit → `ERR_PROPAGATED_EXITS_DOWNSTREAM` | succeeds, and the draw returns to its prior state                |
| re-scoring it → the old produced exit survived                               | the old produced exit is withdrawn before the new one is written |

One refusal is preserved but **reports a different code**. Where the consolation matchUp holds a
second participant arriving from an unrelated matchUp, the clear is still refused — that exit does
not rest on the matchUp being cleared alone — but it now surfaces as
`ERR_INCOMPATIBLE_MATCHUP_STATUS` rather than `ERR_PROPAGATED_EXITS_DOWNSTREAM`. If you branch on
that code, match on both. `matchUpActions` withholds `CLEAR_SCORE` in either case, so an interface
driven by the action rather than by the error needs no change.

**There is no flag to restore the old behaviour**, deliberately. The previous state was not a policy
choice a federation could reasonably want: it left a walkover attributed to a match that no longer
recorded one, and awarded it to whoever happened to arrive next.

## 11d. An exit cannot be awarded to a drawPosition nobody holds

_Shipped in [#4858](https://github.com/CourtHive/competition-factory/pull/4858)._

`checkParticipants` waives the two-participant requirement for a one-sided exit, because the
propagation cascade needs it: a carried exit is awarded to the side **without** the exit, and that
side is empty until the opponent arrives. The waiver tested `propagateExitStatus` — a request flag
any caller can set — so a **directly entered** `WALKOVER` or `DEFAULTED` could be awarded to a
drawPosition whose `positionAssignment` held nobody, and the draw recorded a walkover won by no one.

The rule is now about **which kind of empty** the winning side is:

| winning side                                                             | awardable                                                                                                                                                                              |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| holds a participant, a bye or a qualifier                                | yes — **but see [11i](#11i-a-directly-entered-exit-is-never-awarded-to-the-player-who-is-there)**: a participant is awardable only once their opponent has arrived, and a bye never is |
| holds **no `drawPosition`** — an unfilled feed slot awaiting its arrival | yes                                                                                                                                                                                    |
| holds a `drawPosition` whose assignment is present and **vacant**        | **no** — `ERR_INVALID_MATCHUP_STATUS`                                                                                                                                                  |

**Who is affected.** Only callers using `propagateExitStatus` (or a policy that sets it, such as
`POLICY_SCORING_USTA`) AND submitting an exit whose `winningSide` names a claimed-but-empty seat.
With exit propagation off, the identical call was already refused, so nothing changes. Exits written
by the cascade itself are unaffected — `progressExitStatus` now identifies itself explicitly rather
than relying on the flag.

**If you hit this**, the outcome you want is almost certainly the same exit awarded to the side that
holds the participant. There is deliberately no flag to restore the old behaviour: the previous state
had no reading, and the engine already refused a bare `{ winningSide }` on the same slot.

**Unchanged, and deliberately so:** an exit whose winning side is a **BYE** is still accepted.
Whether a player can lose a walkover to an opponent who does not exist is a rules question, of the
same kind as [11b](#11b-a-retirement-no-longer-carries-into-the-consolation-by-default), and it is
not decided here.

> **CORRECTED — see [11e](#11e-a-bye-can-never-be-the-winning-side).** The paragraph above is wrong
> and shipped in #4858. It is not a rules question: the engine had already decided it, and the
> alternative it names is a bug class, not a policy. The BYE case is refused as of #4862.

## 11e. A BYE can never be the winning side

_Shipped in [#4862](https://github.com/CourtHive/competition-factory/pull/4862)._

Completes [11d](#11d-an-exit-cannot-be-awarded-to-a-drawposition-nobody-holds), which carved out a
`BYE` on the winning side and gave a bad reason for it.

A `WALKOVER` or `DEFAULTED` whose `winningSide` names a **bye** is now refused with
`ERR_INVALID_MATCHUP_STATUS`, exactly as one naming a claimed-but-vacant drawPosition is.

**This is not a new rule.** The engine states it in two places already:

- `getExitWinningSide` — _"A BYE draw position can never be the winning side […] this guard exists so
  a future caller that forgets to filter cannot resurrect the 'advance the empty/BYE side' bug
  class."_
- `progressExitStatus` — when the opponent is a bye the participant **advances through it**; the
  matchUp stays a `BYE` and the exit is re-propagated onto wherever they landed. Explicitly _"NOT a
  WALKOVER"_.

So the propagation cascade never produces this state. Only a direct `setMatchUpStatus` call could,
and the entry point now agrees with the cascade.

**Who is affected.** Only a caller that directly records an exit on a matchUp containing a bye AND
names the bye as the winner.

> **CORRECTED — see [11i](#11i-a-directly-entered-exit-is-never-awarded-to-the-player-who-is-there).**
> This section originally continued: _"Recording the same exit for the player who is actually there is
> unaffected and still accepted — a director can still record that the present player did not play."_
> That is no longer true, in either of its two readings. On a matchUp containing a **bye** no
> `winningSide` is accepted at all, in either direction. On a **half-filled** matchUp the exit may
> still be recorded, but only awarded to the side still to arrive.

**There is no flag to restore it.** A player cannot lose to an opponent who does not exist; the
previous behaviour had no reading a governing body could adopt.

## 11f. [#4890](https://github.com/CourtHive/competition-factory/pull/4890) a person can never be on both sides of a matchUp

`addEventEntryPairs` deliberately permits PAIR entries that share an individual — it rejects only an
_exact duplicate_ pair, and even that is overridable with `allowDuplicateParticipantIdPairs`. That is
what makes flexible AD_HOC doubles possible, where one person partners several others over an
evening.

Nothing downstream checked the consequence, so generation scheduled participants against themselves.
Measured over four PAIRs across four individuals (`[A,B] [A,C] [B,D] [C,D]`, every person in exactly
two pairs): the `ROUND_ROBIN` drawType and the `ROUND_ROBIN` pairing shape each produced **4 conflicts
in 6 matchUps**, and DrawMatic produced **2 in 2**.

Five call sites now refuse, all returning `SHARED_INDIVIDUAL_PARTICIPANT`
(`ERR_SHARED_INDIVIDUAL_PARTICIPANT`):

| Call                                                                | Behaviour                                                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `generateDrawDefinition` with a round-robin `drawType`              | refuses when any two entrants share an individual, listing every offending pair in `context.conflictingPairs` |
| `generateAdHocRounds` with `pairingProfile: { shape: ROUND_ROBIN }` | the same refusal for the pairing shape                                                                        |
| `generateDrawMaticRound`                                            | never selects such a pairing — it is excluded from the candidate pool                                         |
| `generateAdHocMatchUps`                                             | refuses an explicit `participantIdPairings` entry that conflicts                                              |
| `assignMatchUpSideParticipant`                                      | refuses an assignment opposite a PAIR/TEAM the participant belongs to                                         |

### Why a round robin refuses rather than skipping the meeting

A round robin is every-entrant-meets-every-other. Two entrants sharing an individual can never meet,
so the format is not partially unsatisfiable — it is impossible. The request is refused rather than
silently reduced to the meetings that happen to be legal, which is the same stance
`generateRoundRobinPairings` already took for an unsatisfiable `roundsCount`.

### Why DrawMatic excludes rather than penalizes

A penalty cannot prevent this. `generateCandidate` minimizes and always emits its best _available_
candidate, so a weight at any magnitude makes a conflict unlikely, never impossible — and with
overlapping pairs there are rounds in which every candidate conflicts. The pairing pool already
excluded self (`id !== participantId`); a PAIR sharing an individual is that same disqualification
partially applied, so it is excluded in the same place. This is distinct from `sameTeamValue`, which
remains a weight because pairing teammates against each other is a _preference_, not an
impossibility.

### What to change

Nothing, if your PAIR entries do not overlap. If they do, either stop generating a round robin over
them — a round robin cannot express that field — or drive the event with AD_HOC rounds, which pair
only legal opponents.

Callers that inspected generated matchUps to filter out self-matches can drop that code.

### Not covered

**TEAM lineUps.** A tie draws its competitors from lineUps, so two TEAM participants can share a
person even when their rosters do not overlap. That check is not part of this change.

**Elimination draws are unaffected.** An elimination bracket may never pair two overlapping entrants,
so refusing there would be a broader policy decision and is not taken here.

## 11g. [#4891](https://github.com/CourtHive/competition-factory/pull/4891) draw entries for a bracketed draw cannot share an individual

[11f](#11f-4890-a-person-can-never-be-on-both-sides-of-a-matchup) stopped the engine _pairing_ two
entrants who share an individual. This stops the field being assembled that way in the first place,
which is where the problem is easier to see and cheaper to fix.

In a bracketed draw the entries are a **committed field**: any two entrants may be drawn against
each other, whether in round one or in the final. So two entries sharing an individual are a latent
matchUp with one person on both sides, regardless of where the bracket happens to place them.

Two call sites now refuse, both returning `SHARED_INDIVIDUAL_PARTICIPANT`:

| Call                     | Refuses when                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `generateDrawDefinition` | the entries the draw will contain include two that share an individual                                |
| `addDrawEntries`         | an added PAIR shares an individual with an existing entry, **or** with another entry in the same call |

`generateDrawDefinition` judges the entries the draw will actually hold — `drawEntries` when you
supply them, otherwise the event entries — so selecting a non-overlapping subset with `drawEntries`
generates normally even when the event as a whole contains overlaps.

Both report **every** offending pair in `context.conflictingPairs`, not the first, so the whole
problem is visible in one refusal. One PAIR can appear in more than one conflicting pair: `[A,C]`
added alongside `[A,B]` and `[C,D]` conflicts with both.

### AD_HOC types are exempt, deliberately

`AD_HOC`, `LADDER` and `SWISS` — everything `isAdHocType` recognises — still accept overlapping
entries. Their entries are a **roster**, not a field: nothing says any two of them will meet, and
generation decides the pairings, which 11f already constrains. This is what makes flexible doubles
work, where one person partners several others over an evening.

The distinction is the whole design: a bracket commits to every possible meeting up front, so it is
checked at entry; an AD_HOC draw commits to nothing, so it is checked at pairing.

### What to change

Nothing for singles — two distinct individuals never share, and the same participant entered twice
was already a `DUPLICATE_ENTRY`.

For doubles, if you build a bracketed draw from a pool of pairs that overlap, either enter only
non-overlapping pairs, pass the subset you want via `drawEntries`, or use an AD_HOC draw.

Callers of `addDrawEntries` should note it now takes `tournamentRecord` — supplied automatically on
the engine, but an internal caller constructing the params by hand must pass it, since the guard
resolves each entry's individuals from the tournament's participants.

## 11h. [#4903](https://github.com/CourtHive/competition-factory/pull/4903) a person can play in only one matchUp per round

11f stopped one person appearing on **both sides** of a matchUp. It did not stop the same person being
scheduled in **two matchUps of the same round** — and 11g deliberately leaves AD_HOC entries free to
overlap, so rotating-partner doubles reach exactly that case.

Measured on `dev` before this change: 8 disjoint PAIRs plus a ninth, `0/2`, entered into the AD_HOC
draw. DrawMatic scheduled individuals 0 and 2 in **two matchUps each, in 3 of 6 rounds**.

| Call                                   | Behaviour                                                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drawMatic` / `generateDrawMaticRound` | a round occupies individuals, not entries: a PAIR sharing an individual with an entrant already in the round is not scheduled. The round can therefore hold fewer matchUps than entries ÷ 2 |
| `generateSwissRound`                   | refuses entrants that share an individual with `SHARED_INDIVIDUAL_PARTICIPANT`, every offending pair in `context.conflictingPairs`                                                          |
| `assignMatchUpSideParticipant`         | refuses a participant — or a PAIR/TEAM sharing one of its individuals — already in another matchUp of the round, with `EXISTING_ROUND_PARTICIPANT` (`ERR_EXISTING_ROUND_PARTICIPANT`)       |
| `matchUpActions` on an ad hoc matchUp  | never offers a participant sharing an individual with the opposing side or with anyone already in the round. `restrictAdHocRoundParticipants` is deprecated and has no effect               |

### Why DrawMatic now prefers larger candidates

Once some pairings exclude others, candidates differ in size. A candidate's value is the sum of its
pairings' values, so a smaller candidate sums fewer and would always look cheapest — DrawMatic would
drift toward rounds with people sitting out. Candidates that schedule more matchUps are now preferred
before value. When every candidate is the same size, which is every field without overlapping
entrants, selection is exactly as before.

### Why Swiss refuses

Swiss promises every entrant a pairing each round (bar one bye) and ranks each by its own record.
Entrants sharing an individual can neither meet nor play in the same round, so the promise cannot be
kept. As with the round-robin shape in 11f, the request is refused rather than quietly generated
short. SWISS draws still _accept_ overlapping entries (11g); it is round generation that refuses.

### Why assignment refuses, and the round option is gone

Before this change `assignMatchUpSideParticipant` accepted a participant already playing elsewhere in the
round, and `restrictAdHocRoundParticipants: false` offered exactly those participants. A person cannot
play two matchUps at once, so both are now refused: assignment returns `EXISTING_ROUND_PARTICIPANT`,
and the option no longer loosens what `matchUpActions` offers — it would only list assignments that
fail. The parameter is still accepted so existing callers compile.

The matchUp being assigned is excluded from the check: its opposing side is the both-sides question
(11f), and the side being assigned is being replaced, which frees that participant's individuals.

### What to change for overlapping doubles

If your doubles entries do not overlap, the only change is manual assignment: a participant already in
an ad hoc round can no longer be placed in it again, and `restrictAdHocRoundParticipants: false` no
longer offers one. If entries do overlap, also expect DrawMatic rounds that sit some entrants out, and
move any Swiss draw over those entrants to AD_HOC with DrawMatic.

## 11i. A directly-entered exit is never awarded to the player who is there

_Shipped in [#4910](https://github.com/CourtHive/competition-factory/pull/4910) and
[#4909](https://github.com/CourtHive/competition-factory/pull/4909)._

Completes [11d](#11d-an-exit-cannot-be-awarded-to-a-drawposition-nobody-holds) and
[11e](#11e-a-bye-can-never-be-the-winning-side), whose closing paragraphs are now wrong: both said
that recording the exit for the participant who is present was unaffected.

Two rules, both refused with `ERR_INVALID_MATCHUP_STATUS`:

| entry                                                                                              | before                              | now                                                                                                                                   |
| -------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `{ matchUpStatus: WALKOVER \| DEFAULTED, winningSide: <the empty side> }` on a half-filled matchUp | accepted with `propagateExitStatus` | **accepted** — unchanged. This is the designed pending exit: the participant who is there has withdrawn, and whoever arrives advances |
| the same, `winningSide` naming **the participant who is there**, opponent still to arrive          | accepted with `propagateExitStatus` | **refused**                                                                                                                           |
| the same on a matchUp whose other side is a **BYE**, `winningSide` naming the player               | accepted                            | **refused**                                                                                                                           |

**Why the second row cannot stand.** It is a walkover against an opponent nobody knows yet, and the
engine has no reading of it: the arrival path makes whoever arrives the winner of a pending exit,
because the designed shape is the first row. Accepted, it produced two winners of one matchUp — both
advanced, and the entered winner never reached the loser structure. Measured as a two-step
`DROPPED_PROGRESSION` on DOUBLE_ELIMINATION.

**Why the third row cannot stand.** A matchUp containing a bye takes no `winningSide` at all: the bye
always advances its opponent. A walkover entered **before** a bye arrives is a different thing and is
unaffected — the player and their walkover are advanced through the bye and the exit occurs where
they land (`progressExitStatus` RULE 1), never on the bye matchUp.

**Who is affected.** Only callers using `propagateExitStatus` (or a policy that sets it, such as
`POLICY_SCORING_USTA`) that record an exit on a matchUp with one participant. With the flag off, both
entries were already refused — this removes a divergence rather than adding a restriction. Exits
written by the cascade are unaffected: it identifies itself with `propagatingExit`.

**If you hit this**, the outcome you want is the exit awarded to the side still to arrive (row one),
or — where the opponent is a bye — nothing to record here at all.

## 11j. A winning-side flip can be refused by a first-match consolation

_Shipped in [#4910](https://github.com/CourtHive/competition-factory/pull/4910)._

`allowChangePropagation` lets a caller change the winner of a decided matchUp and carry the change
downstream. A `FIRST_MATCHUP` loser link makes entry conditional on the ARRIVING participant — a loser
feeds the consolation only on zero prior scored wins — so a flip can change **who is eligible**, not
merely who lost.

Where the new loser is ineligible, the consolation results the departing loser recorded there cannot
be inherited by anyone. Before, the flip was applied and the reconciliation then stripped those
results, or returned an error over an already-mutated draw. Now the question is asked **first**:

- the departing loser's consolation drawPosition is **active** — they, or the participant paired with
  them, have played on → the flip is refused with `ERR_ACTIVE_DRAW_POSITION`, over an untouched draw;
- nothing is played there → the flip proceeds and the slot reverts to the bye `directLoser` would have
  placed, as before.

**Who is affected.** Callers sending `allowChangePropagation` on `FIRST_MATCH_LOSER_CONSOLATION`
draws. `allowChangePropagation` does not override this refusal; it is what routes the call to the
swap in the first place.

**Interface note.** Unlike [11c](#11c-removing-a-result-now-takes-back-the-exits-it-produced), where
`matchUpActions` withholds `CLEAR_SCORE`, the action is still **offered** here — the refusal is
reached at submit time. An interface that only reads the offered actions will show the flip as
available and then surface the error.

**If you hit this**, clear the consolation result first and then flip; that sequence is accepted and
reaches the same state.

## 11k. A consolation loser who played on through a bye keeps their upstream result

_Shipped in [#4909](https://github.com/CourtHive/competition-factory/pull/4909)._

`isActiveDownstream` treated every `FIRST_MATCHUP` bye matchUp as inert. That is right when the fed
slot itself is the bye — the loser was withheld, so nobody went anywhere from it. It is wrong when
the fed loser is **present** and the bye is their opponent: they advanced through it and played on.

Before, clearing or re-scoring the Main result was accepted, and it removed that participant from the
consolation while the match they had played there still stood, over a drawPosition holding nobody.
Now such a result is active downstream, so the call is refused with
`ERR_INCOMPATIBLE_MATCHUP_STATUS`.

**Who is affected.** Callers clearing or re-scoring a matchUp whose loser fed a `FIRST_MATCHUP`
consolation and advanced through a bye there. To make the change, clear the consolation results from
the latest round back first.

**Unaffected:** a bye matchUp whose fed slot holds nobody is still inert, so a first entry of a
result upstream of one behaves exactly as before.

## 12. Non-breaking additions worth knowing

`plainDate`, `plainTime` and `zonedDateTime` are new published exports, completing the calendar
intent set. `zonedTime` was never published, so its rename is not a breaking change.

The `LADDER` drawType is generatable and its lifecycle is on the engine as eighteen new methods —
`issueChallenge`, `acceptChallenge`, `declineChallenge`, `submitResult`, `confirmResult`,
`disputeResult`, `applyLadderMovement`, `addLadderParticipant`, `removeLadderParticipant`,
`refreshLadderRatings`, seven `get*` queries and the `isChallengeInRange` predicate. All are
additive; see
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
element is unchanged; the first now tells the truth about the upstream exit.

### `drawPositions` is never an array of nothing but holes

_Shipped in #4898._

Not a breaking change — the shape it settles to is the shape generation has always written — but it
is the answer to a question consumers do ask, so it is stated here rather than left implicit.

A matchUp's `drawPositions` is **positional**: the index carries the side. Taking a position out
therefore leaves a HOLE rather than compacting the array, because closing the gap would move the
surviving position onto the other side and every reader that derives a side from the order would
then resolve the wrong participant. `[undefined, 5]` keeps 5 on side 2, and that is deliberate.

An array of nothing BUT holes — `[undefined]`, `[undefined, undefined]`, serialised as `[null]` /
`[null, null]` — holds no side open, because there is no survivor for it to hold the side open
beside. Four writers could produce one; all four now settle it to `[]`.

**The published shape.** `[]` is dropped during hydration, so an inContext matchUp holding no
position carries **no `drawPositions` key at all**. That is already what every unplayed downstream
matchUp looks like and always has been: on a freshly generated 16 draw it is 7 of 15 matchUps
(SINGLE_ELIMINATION), 11 of 31 (DOUBLE_ELIMINATION), 10 of 28 (FEED_IN_CHAMPIONSHIP_TO_SF) and 12
of 32 (COMPASS). What changes is only that a matchUp emptied LATER — by a cleared position, a
released advancement or a winner/loser flip — now looks the same as one that was never reached,
instead of carrying `[null, null]`.

**What to do:** nothing, if you already guard. `matchUp.drawPositions?.[n]`, `?? []` and
`|| []` all behave as before. If you read `matchUp.drawPositions` unguarded, that was already
unsafe on any unplayed matchUp — this does not make it newly unsafe, it makes the existing hazard
easier to hit. **`sides` is unaffected and is always length 2**, so nothing needs `drawPositions`
to decide how many sides a matchUp has.

One idiom is worth re-reading, because it changes from "false" to "vacuously true":
`drawPositions.every(predicate)` over an empty array returns `true`, so a matchUp holding no
position satisfies every such filter. If you partition matchUps with `.every()` — into halves of a
mirrored draw, or into page segments — filter on a non-empty array first.

### A lone `drawPositions` entry resolves by ROLE, not by how the array is spelled

_Shipped in [#4900](https://github.com/CourtHive/competition-factory/pull/4900) and
[#4907](https://github.com/CourtHive/competition-factory/pull/4907)._

Side resolution no longer depends on which of the three spellings a writer happened to leave behind:
`[5]`, `[5, undefined]` and `[undefined, 5]` are one case, and all three hydrate identically. What
decides the side is the ROLE the position plays — on a feed round, **fed** positions are side 1 and a
position that played its way here from the prior round of the same structure is side 2.

**This changes published data.** Measured across two frozen 600-seed windows on both propagation
arms: **277 live feed-round matchUps had put their lone drawPosition on side 2** where the rule says
side 1, purely because a writer had compacted the array. Those participants now hydrate on the other
side. A consumer that renders from `sides` sees the correction automatically; one that derives a side
by indexing `drawPositions` sees it only if it filters holes out first.

The full rule set — the positional binding, fed vs advanced, the one exception in
DOUBLE_ELIMINATION's Main final, and why an absent key is the ordinary shape of an unplayed matchUp
— is published at [drawPositions](/docs/concepts/draw-positions).

**A flip now re-sides what it moves.** Where a winner change re-sorts a later matchUp's positions so
that its winner changes side, `winningSide`, the score (reversed), `matchUpStatusCodes` and
`sideExitProvenance` all follow the winner. A stored post-flip matchUp can therefore differ from 6.x
in those four fields while describing the same result.

### The `matchUpStatus` of a convergence can change too

An earlier revision of this section said nothing about `matchUpStatus` changed. That was true when it
was written and is no longer: the status half has since been corrected as well, so the two halves of
such a record finally agree.

Where two exits converge on one matchUp, which double exit it becomes is now derived from **both**
sides' origins rather than from whichever result was entered last:

- both sides originating in a default → `DOUBLE_DEFAULT`
- any other combination, including a default meeting a walkover → `DOUBLE_WALKOVER`

Two consequences are visible to a consumer. A convergence of two defaults that previously read
`DOUBLE_WALKOVER` now reads `DOUBLE_DEFAULT` — and, via `producedExitStatus`, feeds a `DEFAULTED`
rather than a `WALKOVER` downstream. And the stored value no longer depends on the order the two
results were entered: measured across eight draw types, entering the same pair the other way round
previously produced a different record in 28 of 32 combinations.

**What to do:** if you branch on `DOUBLE_WALKOVER` by equality, prefer asking whether the status is a
double exit at all — `[DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(status)`. Three sites inside the
factory made exactly that mistake and took the wrong branch for a `DOUBLE_DEFAULT`; the same shape is
likely in consumer code that predates `DOUBLE_DEFAULT`.

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

See [Ladder](./concepts/draw-types/ladder.md). `isAdHocType` now returns `true` for `LADDER` — a ladder
shares the `AD_HOC` structure shape — so any code branching on it will include ladders. Use
`isLadder` where the difference matters: an `AD_HOC` draw's `positionAssignments` are a roster, a
ladder's are an ordered standing.

**Both are newly published on `drawsGovernor`, and were not reachable before 7.0.0.** Earlier drafts
of this guide named them anyway, which made the advice unfollowable — corrected here rather than left
as a footnote, because a migration step nobody can take is worse than no step at all:

```js
engine.isAdHocType({ drawType }); // AD_HOC | SWISS | LADDER
engine.isLadder({ drawType }); // LADDER only
```

Do not reach for the similarly-named `isAdHoc({ structure })` instead: it takes a **structure** and
inspects its matchUps for bracket geometry, and knows nothing about `drawType`.

### `DisciplineEnum` gains `SQUASH` and `BADMINTON`

Same exhaustiveness note as above. The `matchUpFormat` grammar already parsed and round-tripped both
sports' scoring; they were simply missing from the curated vocabulary that drives autocomplete and
typo defense.

### `matchUp.hasFedDrawPosition`, and what `participantFed` now means

_Shipped in #4928._

An inContext matchUp gains `hasFedDrawPosition`: whether the round holds a drawPosition **reserved**
for a participant fed in from elsewhere. It is additive, and the reason it exists is that
`feedRound` was being asked two questions and can only answer one of them.

`feedRound` says a position arriving from elsewhere takes `{ sideNumber: 1 }`, leaving the prior
round's advancer on side 2. It is inferred from `matchUpsCount` equality with the prior round,
because a round pairing an arrival with an advancer does not halve — and as a side-ordering answer
that is right everywhere. `hasFedDrawPosition` narrows it by one condition: no `WINNER` link targets
the round.

The rounds that differ are `DOUBLE_ELIMINATION`'s Main final, at every draw size, and nothing else —
measured over 20 draw types × 9 draw sizes. That structure's Main is generated as a feed-in of
`drawSize + 1` with `linkFedFinishingRoundNumbers: [1]`; link-fed positions are subtracted from the
local allocation, so the extra matchUp exists and the extra drawPosition does not, and the Backdraw
winner returns at whichever Main drawPosition they already held. See
[drawPositions § 4a](/docs/concepts/draw-positions#4a-the-one-exception-double_eliminations-main-final).

**The visible consequence: `side.participantFed` and `side.participantAdvanced` no longer appear on a
`DOUBLE_ELIMINATION` Main final.** They mark the SLOT, not the participant — `participantFed` is true
of an empty fed side that is still waiting — and they are now derived from `hasFedDrawPosition` rather
than from `feedRound`, so a Main final, which reserves nothing, is marked neither. Every genuine feed
round is marked exactly as before.

**What to do:** if you branch on `participantFed` to decide whether a position can still be fed into a
matchUp, nothing changes except that `DOUBLE_ELIMINATION` Main finals stop giving a false yes. If you
branch on it to decide which side an arrival takes, read `feedRound` instead — that is the fact you
wanted, and it is unchanged.

**One rendering consequence, measured across the ecosystem.** The only consumer of these marks is
`courthive-components`' `renderParticipant`, which shows a participant's drawPosition number when
`matchUp.roundNumber === initialRoundNumber || side.participantFed || isRoundRobin`. On a
`DOUBLE_ELIMINATION` Main final that number will now be hidden rather than shown, unless the
composition sets `allDrawPositions`. That is consistent with the rule the code states — the side in
question holds the returning Backdraw winner, who **advanced** to a position they already held rather
than being fed — but it is a visible change and is called out here rather than left to be found.

## 13. `modifyParticipantOtherName` honours the clear contract

Two published methods wrote `participantOtherName`, and they disagreed about what the input meant.

| Input                 | `modifyParticipant`        | `modifyParticipantOtherName` before 7.0.0 | Both, from 7.0.0           |
| --------------------- | -------------------------- | ----------------------------------------- | -------------------------- |
| `''`                  | clears, deleting the key   | stored a falsy `''`                       | clears, deleting the key   |
| absent or `undefined` | leaves the value untouched | **overwrote it with `undefined`**         | leaves the value untouched |
| a non-string          | ignored                    | stored as given                           | ignored                    |

So the same intent produced different stored state depending on which method a caller reached for,
and a field could only be properly cleared through one of them. Storing `''` is the outcome the
contract exists to prevent: readers are meant to see an absent field rather than a falsy one each of
them has to special-case.

### What to do

**If you called it with no `participantOtherName` in order to clear the field**, pass `''` instead.
This is the change most likely to reach you, because the old call reads as harmless:

```js
// Before 7.0.0 this erased the stored value. From 7.0.0 it does nothing.
engine.modifyParticipantOtherName({ participantId });

// Clear it explicitly.
engine.modifyParticipantOtherName({ participantId, participantOtherName: '' });
```

**If you passed the whole participant through and let a missing field fall through as `undefined`**,
that field is now preserved rather than erased — which is almost certainly what you wanted, and is
the same rule `modifyParticipant` has always followed for `person` fields.

**If you relied on storing `''`** as a sentinel distinct from absence, there is no longer a way to
express it, deliberately. Read an absent `participantOtherName` as "none".

**If you passed a non-string**, it is now ignored rather than stored. Nothing in the ecosystem did.

### Why this was worth breaking

The two methods had drifted apart silently, and nothing failed as a result — which is what made it
worth fixing rather than documenting. `isClearRequest` now lives in its own module and both methods
import it, so the rule has one definition rather than one definition and one re-implementation. The
test suite asserts the two methods agree on identical input.

See [#4926](https://github.com/CourtHive/competition-factory/pull/4926).

## 14. [#4933](https://github.com/CourtHive/competition-factory/pull/4933) check-in becomes a first-class attestation

Per-matchUp check-in moves out of `matchUp.timeItems[]` and onto a first-class
`matchUp.checkIns[]` collection of `PresenceAttestation` objects. Three things change for callers.

### 14.1 The storage surface

```diff
- matchUp.timeItems: [{ itemType: 'CHECK_IN', itemValue: '<participantId>', createdAt: '…' }]
+ matchUp.checkIns:  [{ attestationId, participantId, state: 'CHECKED_IN',
+                       occurredAt, recordedAt, attributedTo? }]
```

**If you read `checkedInParticipantIds` or `allParticipantsCheckedIn`, nothing changes.** Those are
still attached to every in-context matchUp by hydration, and `getCheckedInParticipantIds` now folds
whichever surface the record holds. Only code reading `matchUp.timeItems` for `CHECK_IN` / `CHECK_OUT`
directly is affected — no consumer in the CourtHive ecosystem did.

Promoted to a **collection** rather than a scalar deliberately. Check-in is an ordered log folded per
participant, so the last-write-wins helper (`setFirstClassOrTimeItem`, which strips the timeItems it
replaces) would have destroyed the history — the same way `SCHEDULE.ASSIGNMENT.OFFICIAL` lost its
assignment history and took `officialType` with it.

### 14.2 A PAIR or TEAM is no longer a valid subject

`checkInParticipant` and `checkOutParticipant` now return **`ERR_INVALID_ATTESTATION_SUBJECT`** when
the `participantId` names a side rather than one of its members.

```diff
- checkInParticipant({ participantId: pairParticipantId, matchUpId, drawId })
+ checkInParticipant({ participantId: individualParticipantId, matchUpId, drawId })
```

Before 7.0.0 both were accepted and nothing reconciled them, so a desk that checked in the pair and a
desk that checked in both players stored different state for one physical fact. Reading is unchanged:
`getCheckedInParticipantIds` still derives a side as checked in when all its members are, and all its
members as checked in when the side is.

A consequence worth noting: checking out a PAIR used to cascade a `CHECK_OUT` to each member as well as
the side — three stored facts for one action. There is now one fact per person.

### 14.3 New optional arguments

| argument        | purpose                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attributedTo`  | who **attested** the presence — never who is present. A `PARTICIPANT`, a `PERSON`, a `DECLARED` name/telephone for somebody not in the record (a minor's parent), a `DEVICE` (kiosk), or `SYSTEM` |
| `occurredAt`    | ISO — when the check-in **happened**, as opposed to when this instance wrote it. Defaults to now                                                                                                  |
| `attestationId` | mint at the origin to make a replayed mutation idempotent across a disconnected sync                                                                                                              |
| `notes`         | free text                                                                                                                                                                                         |

`attributedTo.relationship` reuses `ContactRelationshipUnion` (`SELF | PARENT | GUARDIAN | CHAPERONE |
EMERGENCY | OTHER`) rather than minting a second vocabulary for the same distinction. A parent or
guardian remains an attribute of contact details and is **not** a Participant.

⚠️ **`attributedTo` cannot be represented by a timeItem** — a timeItem has one `itemValue`. Under
`schemaWriteMode: 'legacy'` an attributed check-in is therefore **refused** with
`ERR_UNSUPPORTED_IN_LEGACY_MODE` rather than written with the attester silently dropped. Under
`'bridge'` the first-class collection carries the attester and the legacy mirror does not.

### 14.4 Migrating stored records

`migrateTournamentRecord` promotes the whole ordered log and reports it as `promoted.matchUpCheckIns`.
It is idempotent, and it does **not** synthesise an attester for a promoted entry — nobody recorded one,
and an absent attester is honest where an invented one is not.

Records needing no migration read correctly anyway: `getCheckedInParticipantIds` falls back to the
legacy timeItems when `checkIns` is absent.

## 15. [#4933](https://github.com/CourtHive/competition-factory/pull/4933) sign-in becomes a first-class attestation, and gains an as-of-date query

Tournament arrival moves out of `participant.timeItems[]` onto `participant.presence[]`, the same
`PresenceAttestation` shape as §14. The two facts are deliberately one model — arrival at the
tournament and presenting for a match are the same statement about a different scope.

### 15.1 What does not change

`getParticipantSignInStatus` and the hydrated `participant.signedIn` still return the **latest**
recorded state and are unaffected. They now fold whichever surface the record holds, so a record
written before 7.0.0 answers identically with no migration.

`getParticipantSignInStatus` keeps its **tri-state** return: `undefined` when nothing was ever
recorded, `false` when a departure was recorded, `'SIGNED_IN'` when present. Those are different
facts — a person nobody has ever seen is not a person who signed out and went home.

### 15.2 What is new

```ts
engine.getParticipantPresenceHistory({ participantId });
// → { presence: PresenceAttestation[] }   ordered oldest-first, frame-free

engine.getParticipantSignedInOnDate({ participantId, date: '2026-09-18', timeZone? });
// → { signedIn, entries, timeZone, zoneSource }

engine.getParticipantsStillSignedInOnDate({ date: '2026-09-18', timeZone? });
// → { participantIds, timeZone, zoneSource }
```

**Why an as-of-date query is needed at all.** Nothing signs anybody out at the end of a day, so the
latest-value readers report a Thursday volunteer as `SIGNED_IN` on Sunday. The history is faithful;
it is a history of a thing whose end nobody records. Reading it as of a date is what makes "here
today" mean what it says.

`signedIn` is **the last recorded action on that day**, not "signed in at any point": somebody who
signed in at 09:00 and out at 17:00 was not present at 18:00. A day with no entry is `false` and
means _"not signed in on this date"_ — never _"signed out"_. Render it accordingly.

### 15.3 Time zones — read `zoneSource` before trusting the day

A calendar day is only meaningful in a zone. `01:00Z` on the 18th is `21:00` on the **17th** in New
York, so a UTC day boundary files an evening sign-in under the wrong day.

| `zoneSource` | meaning                                            |
| ------------ | -------------------------------------------------- |
| `supplied`   | you passed `timeZone`                              |
| `tournament` | `tournamentRecord.localTimeZone`                   |
| `venue`      | inferred from a single distinct venue address zone |
| `none`       | **no zone resolved — instants were read in UTC**   |

`none` is reported rather than hidden. A client that owns a venue time frame should prefer
`getParticipantPresenceHistory` and apply its own framing, because only the client knows what to fall
back to when the record names no zone. Setting `localTimeZone` is what upgrades the answer from
"a day, somewhere" to "the day, here".

### 15.4 Behaviour to be aware of

- `modifyParticipantsSignInStatus` gains `attributedTo` and `notes`; `occurredAt` is unchanged but no
  longer overwrites the ordering key, because `occurredAt` and `recordedAt` are now separate fields.
- Signing in when **already** signed in remains a no-op — the pre-7.0.0 `duplicateValues: false`
  semantics are preserved, so the log records state changes rather than repeated assertions.
- A bulk sign-in stamps **one** instant across the batch rather than one clock reading per participant.
- Under `schemaWriteMode: 'legacy'` an attributed sign-in is refused with
  `ERR_UNSUPPORTED_IN_LEGACY_MODE`, exactly as check-in is.
- `migrateTournamentRecord` promotes the log and reports `promoted.participantPresence`. Unlike
  check-in, this runs against real data routinely: `SIGN_IN_STATUS` appears extensively in archived
  records going back to 2023.

## 16. [#4934](https://github.com/CourtHive/competition-factory/pull/4934) the presence ATTESTER is never emitted in bulk

A companion rule to §14 and §15, and the reason `attributedTo` can be stored at all.

A `DECLARED` attribution carries a name, telephone and email for somebody who is **not in the record**
— a minor's parent at the desk. No privacy policy describes them, and no `isPublic` flag covers them.

So `attributedTo` is removed from every BULK emission, unconditionally:

| surface                                                                                                       | `attributedTo`                              |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `getParticipants` → `participants`, `participantMap`, `individualParticipants`                                | **removed**                                 |
| any hydrated matchUp (`allTournamentMatchUps`, `findMatchUp`, …) → `checkIns`, `sides[].participant.presence` | **removed**                                 |
| `anonymizeTournamentRecord`                                                                                   | **removed**, and the subject id is remapped |
| **`getParticipantPresenceHistory`**                                                                           | **returned in full**                        |

Everything else on the attestation survives — who was present, when, and whether they left. Only the
attester is withheld.

**Why not a privacy-policy attribute.** `getParticipants` is fail-open by construction — no policy
supplied means the source is returned unfiltered — and the public participants route supplies none. A
protection that depends on every public caller remembering a flag is one that gets missed once, and
once is enough for a phone number.

### What to do

Read attribution through `getParticipantPresenceHistory`, which a caller has to ask for by name and a
server can gate on permissions:

```diff
- const { participants } = engine.getParticipants({});
- const attester = participants[0].presence?.[0]?.attributedTo;   // now undefined
+ const { presence } = engine.getParticipantPresenceHistory({ participantId });
+ const attester = presence?.[0]?.attributedTo;
```

A test asserting that an attester was **stored** must read the stored record rather than a hydrated
matchUp — asserting it through `findMatchUp` now asserts this privacy behaviour by accident, and
would go green again the day it regressed.

## 17. [#4936](https://github.com/CourtHive/competition-factory/pull/4936) presence expectation becomes part of sanctioning

Purely additive — nothing existing changes shape or behaviour. `POLICY_TYPE_SANCTIONING` gains an
optional `presence` key, and this is its **first real consumer**: until now the policy type was read
by nothing but a types test.

### The ambiguity it removes

`0 of 2 checked in` has two opposite meanings and the record cannot tell them apart:

- **"Nobody has arrived yet"** — at a desk that runs check-in, the most alarming state there is.
- **"We don't use check-in here"** — at most tournaments, every match, all week, meaning nothing.

### The shape — per role × fact, three-valued (D4h option B)

```ts
presence: {
  COMPETITOR: {
    signIn:       { expectation: 'advisory' },
    matchCheckIn: {
      expectation: 'required',
      attribution: {
        allow: ['PARTICIPANT', 'DECLARED'],
        allowedRelationships: ['SELF'],
        byCategory: [{ ageCategoryCode: 'U10',
                       allowedRelationships: ['SELF', 'PARENT', 'GUARDIAN', 'CHAPERONE'] }],
        onInvalid: 'record',
      },
    },
  },
  OFFICIAL: { signIn: { expectation: 'required' }, matchCheckIn: { expectation: 'notUsed' } },
}
```

Roles are keyed by `ParticipantRoleUnion`, so they resolve directly against
`participant.participantRole`. A participant with **no** role resolves as `COMPETITOR` — an absent
role means a player from an older record, never a person with no part to play.

⚠️ This makes **two role vocabularies** inside one sanctioning policy: `personnelRules.roles[].roleName`
is a free string (`'Tournament Director'`, `'Referee'`). `presence` is the typed one.

### ⚠️ `required` does not mean "block"

It is a **policy value, not a behaviour**. No factory mutation refuses a check-in because presence is
`required`, and none should: a hard block teaches operators to check everybody in at 9am so the
software stops arguing, which destroys the signal the feature exists to produce (D4d).

Surfaces read it and decide:

```ts
engine.getPresenceExpectation({ tournamentRecord, participant, fact: 'matchCheckIn' });
// → { expectation: 'required' | 'advisory' | 'notUsed' | undefined, declared, role }
```

`declared: false` means **nobody answered** — not `notUsed`. A client's own heuristic remains the
best available answer for an undeclared tournament, and most tournaments will be undeclared
indefinitely.

### Attribution validity, and the U10 allowance

```ts
engine.validatePresenceAttribution({ tournamentRecord, event, participant, fact, attributedTo });
// → { valid, reason?, categoryApplied?, declared, onInvalid }
```

A matching `byCategory` entry **replaces** the outer lists rather than merging with them, so a junior
event can be stricter as well as looser. An entry with neither selector never matches — a rule that
applied to everything would silently shadow the rule it was written to refine.

An attester who states **no** relationship is refused when the policy enumerates relationships: a
policy naming who may attest is not satisfied by an attester declining to say which of them they are.

`onInvalid` decides what an invalid attester costs — `'reject'` (refuse the write with
`ERR_INVALID_ATTRIBUTION`), `'warn'`, or `'record'` (**the default**). Recording is the default
because an unexpected attester is still a recorded fact, and refusing by default would teach
operators to leave attribution blank.

### `byCategory` applies to `matchCheckIn` only

Not an omission. Sign-in is **tournament-wide**, and a participant may be entered in several events
with different categories, so there is no single category whose allowance would apply. A federation
wanting a junior-specific sign-in rule should scope it by role, or attach the policy to the event.

### Nothing is added to the shipped fixtures

`POLICY_SANCTIONING_GENERIC` / `_ITF` / `_USTA` are unchanged. What a governing body expects is that
body's decision, not a factory default, and adding a `presence` block to a shipped fixture would
change behaviour for everyone who applies it.

## 18. Check-in attribution is forwarded, and readable

Three gaps in §14–§16, each of which made attribution look supported while being unusable end to end.
All additive.

### 18.1 `toggleParticipantCheckInState` forwards the attestation fields

It accepted none of `attributedTo` / `occurredAt` / `attestationId` / `notes` and forwarded none. It
is also the entry point **every desk client uses** — it is what decides which direction the toggle is
going — so an attester could be supplied, accepted without error, and silently discarded on the only
path actually called.

```diff
  engine.toggleParticipantCheckInState({
    participantId, matchUpId, drawId,
+   attributedTo: { attributionType: 'DECLARED', relationship: 'PARENT', name: 'A. Guardian' },
+   occurredAt: '2026-09-19T09:05:00.000Z',
  });
```

A check-**out** is an attested fact too: somebody vouched that the player left.

### 18.2 `getMatchUpCheckInHistory` — the only read that carries the attester

§16 strips `attributedTo` from every bulk emission. There was no counterpart read for a matchUp, so
check-in attribution was **write-only**: storable and unreadable, leaving a desk no way to see who it
had just recorded. (`getParticipantPresenceHistory` covers participant _sign-in_, not check-in.)

```ts
engine.getMatchUpCheckInHistory({ drawId, matchUpId });
// → { checkIns: PresenceAttestation[] }   attributedTo included
```

A separate named call rather than a flag, for the same reason as its sign-in counterpart: a server can
gate one method on a permission, and a caller has to ask for the attester by name rather than receive
it by accident inside a payload fetched for something else.

### 18.3 A `USER` attribution variant

A desk operator is routinely **not** a Participant and has no CODES `personId`, so neither
`PARTICIPANT` nor `PERSON` can name them — and forcing a client's auth id into `personId` would put
two vocabularies behind one field.

```ts
{ attributionType: 'USER', userId: 'u-42', email?: '…', displayName?: '…' }
```

⚠️ **A client asserting its own operator identity is unverifiable.** A server that authenticates the
request should **overwrite** this with the identity it holds; the client-supplied value exists so an
offline desk still records who was at it.

## 19. A propagated exit no longer overwrites a BYE

_Shipped in `44042278e`, `eba5d813e`, `78b77d88c` and `d86e2f469` on the exit-propagation branch._

**CA's ruling, certified in TMX 2026-09-20:** _"An advancing participant encountering a BYE should
always be advanced; a propagated exit encountering a BYE should be advanced. In both cases the BYE
remains a BYE"_ — _"the `matchUpStatus: BYE` does not change."_

### What changed

When a double exit produced a `WALKOVER` (or `DEFAULTED`) and that exit was carried into a matchUp
holding a draw BYE, the target's `matchUpStatus` was **overwritten** with the produced exit. It is
now left as `BYE`, and the exit is recorded per-side instead.

```js
// BEFORE (<= 6.38.0) — the produced exit overwrote the BYE
consolationR2P1.matchUpStatus; // 'WALKOVER'

// AFTER (7.0.0) — the BYE stays, and the exit is on the side it arrived on
consolationR2P1.matchUpStatus; // 'BYE'
consolationR2P1.sideExitProvenance;
// { 2: { previousMatchUpStatus: 'DOUBLE_DEFAULT', matchUpStatus: 'DEFAULTED', sourceMatchUpId: '…' } }
```

**The advancement is unchanged.** A participant sitting alongside that BYE still advances through it;
only the label on the BYE-held matchUp is different. This was verified on the oldest test covering
it, which has asserted the same onward `drawPosition` since v2.0.0-beta.7 and still does.

### Who is affected

Anyone who reads `matchUpStatus` at a BYE-held matchUp to decide _"did an exit reach here?"_. That
question now has a better answer than it ever had via the status:

```js
// DON'T: a BYE-held matchUp reports BYE whether or not an exit reached it
const exitArrived = matchUp.matchUpStatus === WALKOVER;

// DO: the per-side record says WHICH side exited and WHAT it came from
const exitArrived = !!matchUp.sideExitProvenance;
```

`sideExitProvenance` is keyed by `sideNumber` and carries `sourceMatchUpId`, so it answers a
question the status never could — which side, and from where. The legacy `matchUpStatusCodes`
projection is still written alongside it.

### Why this is a `fix` and not a `feat!`

It was committed as `fix(propagation):` without a `BREAKING CHANGE:` footer, which is why
`verify:migration-coverage` did not require this entry — that gate matches `type(scope)!:` subjects
and `BREAKING CHANGE:` bodies only. **The commit typing was wrong, not the gate.** Recorded here so
the omission is not repeated: a behavioural change visible to a consumer needs the `!`, whatever the
type says.

## 20. A produced exit has no `winningSide` until someone arrives

_Shipped in `426384fe8` and `d86e2f469` on the exit-propagation branch._

### What changed

When a double exit propagated a `WALKOVER` (or `DEFAULTED`) into the next round, the produced exit
was given a `winningSide` **computed from drawPosition ordering** — including on matchUps that held
no participants at all, and on matchUps holding a BYE. That value is no longer written.

```js
// BEFORE (<= 6.38.0) — a winner was pre-computed for a matchUp nobody had reached
producedWalkover.drawPositions; // [2]   — one side is still empty
producedWalkover.winningSide; // 2       — awarded against nobody

// AFTER (7.0.0) — the exit is PENDING until a participant arrives
producedWalkover.matchUpStatus; // 'WALKOVER'
producedWalkover.winningSide; // undefined
```

**A pending exit with no `winningSide` is a state, not an incomplete one.** It resolves on its own
when the opposing participant arrives from the other feeder, and that side is then awarded normally.

### Who is affected

Any UI or caller reading `winningSide` to decide whether a produced walkover is decided. A produced
exit awaiting its opponent now returns `undefined`, so a naive `if (matchUp.winningSide)` renders
nothing where it previously rendered a winner.

Use the status and the per-side record instead — both are true at every stage of the cascade:

```js
// the exit is real and recorded even while the winner is undetermined
const exitPending = isAnyExit(matchUp.matchUpStatus) && !matchUp.winningSide;
const whichSideExited = matchUp.sideExitProvenance; // keyed by sideNumber
```

### Why

A `winningSide` on a matchUp holding no drawPositions asserts a winner over an opponent who does not
exist, and it outlived its justification: once a convergence formed, the award stayed behind
describing a state that was no longer true. The checkmark a client wants to show is correctly driven
by the arrival of a participant, not by drawPosition ordering at the moment the exit was produced.

### Typing note

Like §19, these were committed as `fix(propagation):` with no `BREAKING CHANGE:` footer, so
`verify:migration-coverage` never required an entry. Both were found by auditing the workstream's
`fix`-typed commits for observable field changes rather than by the gate.

## 21. [#4942](https://github.com/CourtHive/competition-factory/pull/4942) a load-bearing outcome cannot be re-scored while a dependent result stands

_Shipped in `1d921a22b`; referenced by [#4942](https://github.com/CourtHive/competition-factory/pull/4942), which the commit itself predates._

### What changed

Re-scoring a matchUp whose propagation is **load-bearing for a result that has already been
decided** is now refused. Previously it was permitted, and it silently un-decided the dependent
match — leaving, in the reported case, a consolation matchUp reading `TO_BE_PLAYED` while still
displaying its `6-3` score.

```js
// Main|2|1 was a DOUBLE_WALKOVER; its exits fed the consolation,
// and Consolation|3|1 has since been PLAYED.
const result = engine.setMatchUpStatus({ matchUpId: mainR2P1, outcome: { winningSide: 2 } });

// BEFORE (<= 6.38.0)
result.success; // true — and Consolation|3|1 became TO_BE_PLAYED, still showing 6-3

// AFTER (7.0.0)
result.success; // undefined
result.error; // CANNOT_CHANGE_OUTCOME
```

**Unwind the dependent results first**, in dependency order — the consolation before the Main round
that feeds it — and the re-score is then permitted.

### `CANNOT_CHANGE_OUTCOME` is a new error

A `DOUBLE_WALKOVER` and a `DOUBLE_DEFAULT` carry **no `winningSide`** — neither side advances — yet
they propagate produced exits, so they are exactly the outcomes this rule refuses. Reporting
`CANNOT_CHANGE_WINNING_SIDE` for one names a field the matchUp does not have, so it has its own
code, for the same reason `CANNOT_CHANGE_FEED_ELIGIBILITY` does:

| situation                                            | error                        |
| ---------------------------------------------------- | ---------------------------- |
| an existing `winningSide` is being changed           | `CANNOT_CHANGE_WINNING_SIDE` |
| the outcome carries no `winningSide` (a double exit) | **`CANNOT_CHANGE_OUTCOME`**  |

Clients keying on `error.code` should accept `ERR_UNCHANGED_CANNOT_CHANGE_OUTCOME` alongside
`ERR_UNCHANGED_CANNOT_CHANGE_WINNING_SIDE`.

### What is NOT affected — first entries

Entering a result for the first time is **always** permitted, whatever has been decided elsewhere. A
matchUp that has never sent anything downstream cannot invalidate anything downstream. Scoring an
untouched `TO_BE_PLAYED` matchUp above a fully played consolation succeeds and propagates exactly as
before.

The two shapes that DO propagate, and are therefore subject to the rule, are a `winningSide` (the
winner advances) and a double exit (the produced exits are carried onward).
