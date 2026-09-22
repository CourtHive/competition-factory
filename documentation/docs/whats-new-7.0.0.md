---
title: What's New in 7.0.0
---

# Provenance

7.0.0 is about a single idea: **a competition record should be able to say why it is in the state it
is in.**

Most of what changed follows from that, and most of it is behaviour you already expected. Two changes
ask something of you; the rest is the engine answering questions it previously could not.

The headline feature is unrelated and additive: the **LADDER draw type**, a continuous
challenge-driven competition with an enforced `CHALLENGED` status, an attestation gate on
self-reported results, `RANK` or `RATING` ordering, and eighteen new engine methods to drive it.

- **Upgrading?** Start at [what you must act on](#what-you-must-act-on) — it is a short list.
- **Upgrade mechanics** in detail: the [6.x to 7.0.0 migration guide](./migration-7.0.0.md).
- **Every commit**: [CHANGELOG.md](https://github.com/CourtHive/competition-factory/blob/master/CHANGELOG.md).

## Why provenance

[TODS](https://itftennis.atlassian.net/wiki/spaces/TODS/overview) describes a tournament that **has
happened**. It is a results standard, and an excellent one: it can express who played whom, what the
score was, and how a draw was structured, with enough precision to exchange records between systems.

A tournament in progress is a different thing. It is an operation. A director corrects a mistyped
score at nine in the evening and that correction has to travel — through a consolation that is
already playing, past a BYE that was placed because of the result being corrected, into a slot that
was reserved for somebody who is now eligible again. The question that matters operationally is not
_what is the state_ but **why is it this state, and what happens to it when the reason changes**.

TODS has no vocabulary for that, so implementations put it in `extensions` — untyped bags hanging off
the record, each system inventing its own shape, none of it exchangeable and none of it validated.

CODES is CourtHive's superset of TODS, and 7.0.0 is where the operational half stops being an
extension and becomes part of the standard. Check-in and sign-in become
[first-class attestations](#presence-becomes-first-class). Why an exit sits on a side becomes
[`sideExitProvenance`](#provenance-you-can-read), carrying the identity of the matchUp that produced
it. A BYE placed by a cascade is distinguishable from one placed by draw generation. Scheduling
attributes, delegated outcomes and check-in attribution all move out of bags and into typed fields.

## Pressing into the edges

Provenance is not only a storage question. Once a record can say why it is in a state, you can ask
whether it is still _right_ — and that is where the bulk of this release went.

Two edges in particular:

**Double-exit propagation.** A `DOUBLE_WALKOVER` or `DOUBLE_DEFAULT` advances nobody, so the engine
must decide what reaches the next round, what reaches the consolation, and what happens where two of
them meet. The rules were mostly right and the edges were not, and the edges are where real
tournaments live.

**Undoability.** A result can be corrected, and the correction has to leave the draw where it would
have been had the correction been the original entry. That sounds obvious and is surprisingly hard:
a cascade that writes several matchUps forward must take back exactly what it placed and nothing a
different cascade placed. 7.0.0 makes that hold across every draw type the engine generates, with one
characterised exception in the compass family, and it is enforced by a sweep rather than by
inspection.

Most of the resulting changes are technically breaking and practically invisible: a BYE is never the
winning side, a person cannot be on both sides of a matchUp, removing a result takes back the exits
it produced. You were entitled to expect all of those already.

## How we know

Three things made this release measurable rather than argued.

**Probes over assertions.** Every defect closed here was reproduced before it was diagnosed — a draw
built, driven through a sequence of results, and its state compared against what the same outcomes
reach by another route. A defect that cannot be reproduced on demand is not understood well enough to
fix.

**Confluence sweeps.** A 192-cell harness drives every draw type down two routes to the same outcome
— entering a result directly, and reaching it through a correction — then compares the draws. Its
counts are asserted **exactly, in both directions**, so an improvement fails the build until the
baseline is lowered and a regression cannot hide in the noise.

**Integrity detectors that can see the failure.** `getDrawInconsistencies` gained
`BYE_ADVANCEMENT_MISSING` and `PROPAGATED_EXIT_LOST` because two whole defect classes were
structurally invisible to it: every existing check started from a `winningSide` or an exit status,
and a BYE has no winner while an erased exit has neither.

## Provenance you can read

Three fields carry the operational "why" that used to live in extensions or in inference.

**`matchUp.sideExitProvenance`** — per side, keyed by `sideNumber`: the upstream status that caused
an exit, the status this side was given, and **`sourceMatchUpId`**, the identity of the matchUp whose
exit produced it. Identity is what makes an unwind possible: when a result is corrected, the cascade
can withdraw exactly what it placed and leave what a different cascade placed. It also carries
`byeClaims` — the matchUps whose double exit claims a BYE on that side, because two of them can claim
the same one and only the survivor's claim should keep it.

**`positionAssignment.byeFromPropagation`** — a BYE placed by a cascade, distinguishable from one
placed by draw generation or by hand. It replaced a topology inference (`feedRound || roundNumber === 1`)
that could not tell the two apart and therefore over-cleared on unwind.

**`matchUp.matchUpStatusCodes` is now typed.** It was published as `any[]` while holding four
different element shapes across two unrelated tenants — scoring reason codes and propagation
provenance. It is now a discriminable union, with the provenance tenant **deprecated** in favour of
`sideExitProvenance`. See [§24](./migration-7.0.0.md#24-4948-matchupstatuscodes-is-typed-and-its-provenance-tenant-is-deprecated).

Read **provenance**, not status, when the question is _"did an exit reach here?"_ — a `matchUpStatus`
cannot tell you which side it belongs to, and a BYE-held matchUp keeps its `BYE` status by design.

## Presence becomes first-class

Check-in and sign-in were `timeItems` — an ordered log of untyped items, with the participant id
smuggled into `itemValue`. They are now `PresenceAttestation` collections: `matchUp.checkIns[]` for
presenting at a match, `participant.presence[]` for arriving at the tournament. Deliberately one
model, because they are the same statement at different scope.

Being first-class buys attribution: who attested, when it happened as distinct from when it was
recorded, and an attestation id. A `DECLARED` attribution can name somebody who is **not in the
record** — a minor's parent at the desk — which is also why the attester is never emitted in bulk.

If you read `checkedInParticipantIds` or `allParticipantsCheckedIn`, nothing changes; hydration still
attaches both, and the reader folds whichever surface a record holds.

## The surface changes in detail

These are the changes that alter a published contract rather than correcting behaviour. Each is
covered in full in the [migration guide](./migration-7.0.0.md); what follows is why each one moved.

### 1. Exit propagation is idempotent, atomic, and correct

`WALKOVER` and `DEFAULTED` statuses cascade through a draw, placing BYEs and advancing participants ahead of a match that will never be played. 7.0.0 corrects a cluster of defects in that cascade, found by a new test harness and an at-scale sweep. Two of the fixes change behaviour a caller could have been relying on.

**Re-applying the same double exit now does nothing.** Previously the second call re-ran the cascade, read its own earlier work as a _second_ source exiting into the same target, escalated the produced `WALKOVER` to a `DOUBLE_WALKOVER`, and cascaded a round further. Both calls reported success, so a client retry or a double-click corrupted the draw progressively and silently.

**A rejected mutation no longer destroys a recorded result.** `setMatchUpStatus` now validates a bare `{ winningSide }` outcome _before_ any removal runs. Previously such an outcome skipped the early participant check — it carries no `matchUpStatus` — and was caught only after the existing result had already been unwound, so a rejected call could destroy a recorded result.

For the general case, pass `rollbackOnError: true` and a refused mutation leaves the draw byte-identical, discarding the queued notices with it. That is not new in 7.0.0, and it is worth stating plainly that it is **opt-in**: without the flag a refusal raised deep in a cascade can still return an error over a partially changed draw. `executionQueue` snapshots for the whole queue, so TMX and competition-factory-server already have this on every mutation; a consumer calling `setMatchUpStatus` directly should pass it. See [Exit Propagation](./concepts/exit-propagation.md#a-rejected-mutation-does-not-alter-the-draw-when-you-ask-for-that).

The rest correct wrong answers rather than change a contract: a topology proxy that awarded a walkover to the side holding nobody, a cross-structure winner that fell through silently and never reached the Decider, an unwind that asked a field the cascade had already overwritten, a source-structure `drawPosition` handed to a target in another structure, and an unguarded `participantId === undefined` that matched the first empty slot rather than nothing.

A second round of cascade fixes landed after that list and two of them are visible in stored records. **`DOUBLE_DEFAULT` now takes the same propagation branches as `DOUBLE_WALKOVER`** — three sites asked "is this a double exit" by testing `=== DOUBLE_WALKOVER`, so a default took the wrong branch at each. And **which double exit a convergence becomes no longer depends on the order the two results were entered**: it is derived from both sides' origins, where it used to be read from whichever arrived last. Both are described in [migration §11](./migration-7.0.0.md#the-matchupstatus-of-a-convergence-can-change-too).

The remaining cascade work is a refusal the engine raises mid-cascade for a placement it should not have attempted. Those are being closed one root cause at a time and are tracked by the randomized sweep rather than by a contract change.

→ [Exit Propagation](./concepts/exit-propagation.md), [migration §2](./migration-7.0.0.md#2-re-applying-a-double-exit-is-now-idempotent), [migration §3](./migration-7.0.0.md#3-a-rejected-bare--winningside--no-longer-unwinds-the-existing-result).

### 2. Time-zone conversions refuse rather than throw or guess

The zoned calendar intent had two implementations — a published `timeZone.ts` and an internal `zonedTime.ts` that carried every live conversion in the repo. On valid input they were measured to be numerically identical: 420,480 wall clocks across 12 zones and every day of 2026, plus all 418 IANA zones from 1970 onward, produced zero disagreements. DST was never the difference.

The difference was failure handling, and each was fail-open on a different axis. `timeZone.ts` **threw an uncaught `RangeError`** from functions typed `string | { error }`, and omitting the zone returned the _host machine's_ offset — so the same published call answered differently on a New York server and a London one. `zonedTime.ts` never threw, but silently substituted the caller's offset for an unrecognised zone.

`zonedDateTime` is now the single implementation and `timeZone` is an adapter over it with no arithmetic of its own. Three inputs get three answers, and never a substituted number:

| Input             | Result                                                   |
| ----------------- | -------------------------------------------------------- |
| zone absent       | the caller's `utcOffsetMinutes`, with `source: 'offset'` |
| zone unrecognised | refused — `{ error: INVALID_TIME_ZONE }`                 |
| zone recognised   | resolved per instant, with `source: 'zone'`              |

`getTimeZoneOffsetMinutes` also changes shape, from `number` to `number | undefined` — the one change in this area that alters a published **type**, so a TypeScript consumer sees it at compile time rather than at runtime.

→ [migration §4](./migration-7.0.0.md#4-time-zone-conversions-refuse-rather-than-throw-or-guess), [tools.zonedDateTime](./tools/tools-api.md#toolszoneddatetime).

### 3. Two queries refuse an absent object param instead of answering

`checkMatchUpIsComplete` takes a matchUp **object**; `getParticipantResults` takes an **array** of in-context matchUps. Neither takes an id — and `paramsMiddleware` resolves `drawId` into a `drawDefinition` but does not resolve `matchUpId` into a matchUp or gather matchUps. So the engine-idiomatic call supplied nothing, and both answered anyway:

```js
// before 7.0.0 — both wrong, neither says so
tournamentEngine.checkMatchUpIsComplete({ matchUpId, drawId }); // false, for a COMPLETED matchUp
tournamentEngine.getParticipantResults({ drawId }); // {}, for a fully-played draw
```

Both now return `ERR_MISSING_MATCHUP` / `ERR_MISSING_MATCHUPS`. It was worth breaking because `checkMatchUpIsComplete` returns a **boolean a caller branches on** — no error to notice, no `undefined` to guard, and the wrong answer is the safe-looking one.

An **empty** array is still a valid question with an empty answer; the guard is on the argument being absent, not empty.

`getParticipantResults` also refuses any **stored** (non-hydrated) matchUp — one carrying no `sides` at all. Results are attributed through `sides[].participantId`, and until 7.0.0 the helper that reads a side returned the literal string `'foo'` when `sides` was absent — so a round robin tallied from stored matchUps returned results keyed `foo` rather than failing. That sentinel, and the two `console.log` calls beside it, are gone.

→ [migration §5](./migration-7.0.0.md#5-two-queries-refuse-an-absent-object-param-instead-of-answering).

### 4. `participantsRequiredMatchUpStatuses` — a spelling fix

The exported constant was misspelled `particicipantsRequiredMatchUpStatuses` (an extra `ici`) since it was introduced. Rename the import; the value, the type and the semantics are identical. No deprecated alias is provided, and a survey of the CourtHive ecosystem found no consumer importing the old name.

→ [migration §1](./migration-7.0.0.md#1-participantsrequiredmatchupstatuses--a-spelling-fix).

## The headline feature — the LADDER draw type

A **ladder** is a continuous, challenge-driven competition. Participants occupy an ordered **standing**, a participant may **challenge** someone above them, and the result rearranges the standing. There are no rounds, no bracket, no fixed field, and often no end date.

`LADDER` shares the `AD_HOC` _structure shape_ — matchUps carry neither `roundPosition` nor `drawPosition` — but not its meaning: an `AD_HOC` draw's `positionAssignments` are a roster, while a ladder's **are the standing** and `drawPosition` reads as **rank**, where 1 is the top. `isAdHocType('LADDER')` is therefore `true`; ask `isLadder` wherever the difference matters.

The full walkthrough is the [Ladder concepts page](./concepts/draw-types/ladder.md). What follows is what is new about it.

### Driving a ladder

`drawType: LADDER` generates a structure with no matchUps and no positionAssignments — every matchUp is created by a challenge, and every position is a rank that `addLadderParticipant` assigns. The lifecycle is on the engine as eighteen methods, and each resolves the ladder from `drawId` alone:

```js
tournamentEngine.addLadderParticipant({ participantId, addedAt, drawId });

const { matchUpId } = tournamentEngine.issueChallenge({
  challengerParticipantId,
  defenderParticipantId,
  issuedAt,
  drawId,
});

tournamentEngine.acceptChallenge({ matchUpId, respondedAt, drawId });
tournamentEngine.submitResult({ participantId, outcome: { winningSide: 1 }, submittedAt, matchUpId, drawId });
tournamentEngine.confirmResult({ participantId, confirmedAt, matchUpId, drawId });
tournamentEngine.applyLadderMovement({ trigger: 'RESULT', appliedAt, matchUpId, drawId });

const standing = tournamentEngine.getLadderStanding({ drawId });
// [{ position: 1, participantId: 'p9' }, …]
```

Three internal helpers are deliberately **not** on the engine. `mirrorStandingToScale` must stay a side effect of the position mutation, or a caller could move a standing without writing its history; `applyLapseConsequence` is invoked by `declineChallenge` _after_ the lapse is counted, so calling it directly would apply a penalty nothing counted.

### The challenge is the only fixture a participant creates

Everything else in the factory arrives from a draw. Eligibility is consequently enforced when the challenge is **issued** rather than when a draw is generated — nothing upstream decided these two would meet. A downward challenge, a self-challenge, a participant not seated on the ladder, a challenge outside the policy's range, and any drawType that is not `LADDER` are all refused.

Expiry is **derived, never stored**, so a challenge nobody looked at does not sit in the record claiming to be pending.

→ [The challenge](./concepts/draw-types/ladder.md#the-challenge).

### `CHALLENGED` is the first matchUpStatus whose context is enforced

`CHALLENGED` is valid only in a `LADDER` drawType; `setMatchUpStatus` returns `ERR_MATCHUP_STATUS_OUT_OF_SCOPE` anywhere else. The mechanism is general — `matchUpStatusScopes` declares where a status may be used and `getMatchUpStatusScopeViolation` enforces it — rather than an `if` in one setter. `DEAD_RUBBER`, meaningful only inside a team tie, is the obvious second adopter and is declared but deliberately left inactive, since enforcing it could reject data that is legal today.

`CHALLENGED` joins `validMatchUpStatuses`, `participantsRequiredMatchUpStatuses`, `nonDirectingMatchUpStatuses` and **`upcomingMatchUpStatuses`**. That last one widens the meaning of "upcoming" from _will happen_ to _is expected to happen_, since a challenge may be declined or expire — a deliberate trade, because a challenge missing from every upcoming-match view is invisible to exactly the people who must act on it.

→ [Scope enforcement](./concepts/draw-types/ladder.md#challenged-is-scoped-to-ladder-and-the-scope-is-enforced).

### An attestation gate on self-reported results

A ladder result is reported by the people who played it, so movement is gated on an **attested** result in code rather than in a comment. `POLICY_LADDER`'s `resultValidation` decides what counts: `PEER` (the opponent confirms), `OPERATOR` (an official does), or `EITHER`. A submitted result that has been **disputed** is blocked from moving the standing.

→ [Reporting a result](./concepts/draw-types/ladder.md#reporting-a-result).

### Declines, silence and no-shows are one mechanism

Declining a challenge, ignoring one until it expires, and accepting then not turning up are treated as a single **lapse**, not three separate rules — from the challenger's side they are the same offence, being unavailable to the people below you, and clubs already treat them that way. A unified `lapsePolicy` decides the consequence.

Because consequences are evaluated when a challenge **resolves** rather than by a periodic sweep, a participant nobody challenges never lapses. An operator removal escape hatch exists for exactly that case.

→ [Lapses](./concepts/draw-types/ladder.md#lapses), [Removing someone by hand](./concepts/draw-types/ladder.md#removing-someone-by-hand).

### Ordering is `RANK` or `RATING`, and direction is read rather than assumed

Under `RANK` (the default) the standing is `positionAssignments`, mutated by the movement rules — `SWAP` or `INSERTION`, which are genuinely different competitions. Under `RATING` the standing is derived from each participant's rating, `positionAssignments` becomes a projection, and movement does nothing because the ordering already _is_ the scale.

`ratingsParameters[ratingType].ascending` decides which end is the top: `WTN`, `BWF` and `USAR` are lower-is-better, while `UTR`, `ELO`, `DUPR` and `PSA` are higher-is-better. Hardcoding "higher wins" would invert an entire WTN ladder and raise no error. An unrated participant sorts **last** — absent is not "best" — and an unknown `ratingType` returns the stored order with no `ratingValue` rather than presenting a misconfiguration as a working ladder.

Every rank change is mirrored to a dated `ScaleItem` as a **side effect** of the position mutation, never as a separate call a caller might skip, so "where was I in March" is an ordinary scale lookup rather than a second store.

→ [Ordering](./concepts/draw-types/ladder.md#ordering-rank-or-rating), [Movement](./concepts/draw-types/ladder.md#movement), [History](./concepts/draw-types/ladder.md#history).

### What the factory deliberately does not do

**It does not fetch ratings.** UTR, WTN and DUPR are other people's systems with their own credentials and terms; retrieving values belongs in an operator's ingest adapter, not in a competition engine. A rating-ordered ladder therefore runs either **dynamically** — the factory computes ratings from ladder results via the same `generateDynamicRatings` machinery DrawMatic uses, seeded from each participant's published rating — or from an operator's **bulk refresh**.

Dispute _resolution_ is not built: a disputed result is blocked from moving the standing, but nothing resolves it yet.

→ [Not yet built](./concepts/draw-types/ladder.md#not-yet-built).

## Other 7.0.0 additions

- **`SQUASH` and `BADMINTON` join the discipline vocabulary** — `DisciplineUnion` accepts any string, so both values already validated; what they lacked was membership of the **curated** set that drives autocomplete, normalization and near-match typo defense. They belong there because the [matchUpFormat grammar](./codes/matchup-format.mdx) already parses and round-trips both sports' scoring, and a discipline the engine can score should not be a stranger to the vocabulary.
- **The four calendar intents are named and documented** — `tools.plainDate` (which calendar day), `tools.plainTime` (what time on the clock), `tools.zonedDateTime` (which moment at a venue) and an absolute instant. Only the third depends on a zone, and mixing the first two without an explicit conversion produces a figure wrong by the venue's UTC offset. `plainDate`, `plainTime` and `zonedDateTime` are new published exports; `tools.dateTime` is supported and unchanged. See [Four questions, not one](./concepts/date-time-handling.md#four-questions-not-one).
- **The Temporal status is corrected** — Temporal reached Stage 4 in March 2026, is part of ES2026, and ships unflagged in Node 26, Chrome/Edge 144, Firefox 139 and Deno 2.7. Safari remains the gap, so it is not yet Baseline. See [Temporal API](./concepts/date-time-handling.md#temporal-api).
- **`PositionAssignment.byeFromPropagation`** — a new optional boolean recording that a BYE was placed by an exit cascade rather than by draw generation or by hand. It replaces a topology inference (`feedRound || roundNumber === 1`) with a first-class fact, and is visible in stored records and anything that round-trips `positionAssignments`. See [BYE provenance](./concepts/exit-propagation.md#bye-provenance-byefrompropagation).
- **`matchUp.sideExitProvenance`** — a new optional per-side record of WHY an exit sits on a side: the upstream status that caused it, the status this side was given, and the id of the matchUp whose exit produced it. It gives propagation provenance its own home, keyed by `sideNumber`, instead of leaving it positional inside `matchUpStatusCodes` beside two unrelated element shapes. Purely additive; `matchUpStatusCodes` is still written. See [Exit provenance](./concepts/exit-propagation.md#exit-provenance-sideexitprovenance).
- **Exit codes stop being relabelled as walkovers** — a normalization in the propagation path mapped every object-shaped `matchUpStatusCodes` element to the walkover code `WO`. Measured over randomized scenarios, **44% of what it rewrote was not a walkover**: 13 BYEs and 9 defaults out of 50. Each element now resolves to its own outcome code, and a BYE contributes none rather than becoming a walkover. Values you read from `matchUpStatusCodes` can therefore differ — see [migration §12](./migration-7.0.0.md#12-non-breaking-additions-worth-knowing).
- **`addFinishingRounds` refuses an absent `matchUps` array** instead of returning `[]` — which mattered because the natural call shape is an assignment, so an empty return silently replaced the caller's list. It mutates in place and returns the same reference, so valid usage is unchanged. See [migration §7](./migration-7.0.0.md#7-addfinishingrounds-refuses-an-absent-matchups-array).
- **`buildDrawHierarchy` is removed** — a D3-era draw-rendering tree with no consumer anywhere in the ecosystem (measured across 1,809 source files in seven repos) and no documentation. Its implementation and tests are preserved verbatim outside this repository, so restoring it would be a copy rather than a rewrite — [open an issue](https://github.com/CourtHive/competition-factory/issues) if you need it. See [migration §6](./migration-7.0.0.md#6-builddrawhierarchy-is-removed).
- **An exit-propagation test harness** — a cross-product matrix, relational property suites (do/undo, idempotence, monotonicity), two agreement oracles, and a quarantine registry enforced in both directions so a fixed failure fails the run until its entry is removed. An at-scale randomized sweep with delta-debugging runs on demand. It exists because `isActiveDownstream` was at 100% branch coverage when it shipped 444 spurious refusals. See [Exit Propagation Harness](./testing/exit-propagation-harness.md).

## What you must act on

**Two changes ask something of you.** The rest of this list is narrow — several items touch no
consumer anywhere in the CourtHive ecosystem, measured across seven repositories.

1. **A produced exit has no `winningSide` until an opponent arrives.** This is the one most likely to
   affect you. A `WALKOVER` propagated into the next round used to carry a `winningSide` computed
   from drawPosition ordering — on matchUps holding nobody at all. It no longer does, so a naive
   `if (matchUp.winningSide)` renders nothing where it once rendered a winner. Test the pending state
   with `isAnyExit(matchUp.matchUpStatus) && !matchUp.winningSide`, and read `sideExitProvenance` for
   which side exited. See [§20](./migration-7.0.0.md#20-a-produced-exit-has-no-winningside-until-someone-arrives).
2. **A PAIR or TEAM is no longer a valid check-in subject.** `checkInParticipant` and
   `checkOutParticipant` now return `ERR_INVALID_ATTESTATION_SUBJECT` when given a side rather than
   one of its members — because a desk checking in the pair and a desk checking in both players
   stored different state for one physical fact. Reading is unchanged: a side still derives as
   checked in when all its members are. See [§14.2](./migration-7.0.0.md#142-a-pair-or-team-is-no-longer-a-valid-subject).
3. **Read [the migration guide](./migration-7.0.0.md)** for the full detail behind every item here.
4. **Rename `particicipantsRequiredMatchUpStatuses`** to `participantsRequiredMatchUpStatuses` at every import site.
5. **Handle the error return** from `wallClockToUTC`, `utcToWallClock` and `toEmbargoUTC`, and branch on `undefined` from `getTimeZoneOffsetMinutes`. Remove any `try`/`catch` that was there to catch a throw.
6. **Delete compensating logic** that re-read or repaired state after a `setMatchUpStatus` error — a rejected call no longer alters the draw. Note the error code for the bare-`{ winningSide }` case moved from `ERR_MISSING_ASSIGNMENTS` to `ERR_INVALID_MATCHUP_STATUS`; match on behaviour rather than on that code.
7. **Stop relying on re-application as repair.** Re-sending an identical double exit no longer nudges a draw whose advancement is missing. Detect that state with `getDrawInconsistencies` and repair it deliberately.
8. **Add cases for `CHALLENGED` and for `SQUASH` / `BADMINTON`** if you `switch` exhaustively over `MatchUpStatusEnum` or `DisciplineEnum` with no `default`.
9. **Pass objects, not ids, to `checkMatchUpIsComplete` and `getParticipantResults`** — resolve with `findMatchUp` / `allDrawMatchUps` first. Both now refuse an absent argument rather than answering `false` / empty.
10. **Check any branch on `isAdHocType`** — it now includes `LADDER`. Use `isLadder` where the
    difference matters. **Both are newly published on `drawsGovernor`** (`engine.isAdHocType({ drawType })`,
    `engine.isLadder({ drawType })`); neither was reachable before 7.0.0, so this step is newly
    followable rather than newly relevant.
11. **Adopt the ladder at your own pace** — the draw type and its eighteen engine methods are purely additive; no action is required to keep existing code working.

## Where to go from here

| If you want…                                        | Read                                                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| The full upgrade walkthrough                        | [6.x to 7.0.0 migration](./migration-7.0.0.md)                                     |
| To run a continuous challenge-driven competition    | [Ladder](./concepts/draw-types/ladder.md)                                          |
| To understand how a walkover travels through a draw | [Exit Propagation](./concepts/exit-propagation.md)                                 |
| To contribute to the propagation code               | [Exit Propagation Harness](./testing/exit-propagation-harness.md)                  |
| To pick the right date or time utility              | [Four questions, not one](./concepts/date-time-handling.md#four-questions-not-one) |
| Zoned conversion that refuses rather than guesses   | [tools.zonedDateTime](./tools/tools-api.md#toolszoneddatetime)                     |
| The previous major's feature tour                   | [What's New in 6.0.0](./whats-new-6.0.0.md)                                        |
