---
title: What's New in 7.0.0
---

Version 7.0.0 of the Competition Factory ships **four areas of breaking change** — exit propagation, time-zone conversion, two queries that now refuse an absent argument, and one constant rename — and one headline feature: the **LADDER draw type**, a continuous challenge-driven competition with an enforced `CHALLENGED` status, an attestation gate on self-reported results, `RANK` or `RATING` ordering, and eighteen new engine methods to drive it.

For upgrade mechanics — the six breaking-change rows and the exact steps to adopt them — see the [6.x to 7.0.0 migration guide](./migration-7.0.0).

For the full per-commit changelog see [CHANGELOG.md](https://github.com/CourtHive/competition-factory/blob/master/CHANGELOG.md).

## The headline changes

Four changes break the surface and need consumer attention. All are covered in detail in the [migration guide](./migration-7.0.0).

### 1. Exit propagation is idempotent, atomic, and correct

`WALKOVER` and `DEFAULTED` statuses cascade through a draw, placing BYEs and advancing participants ahead of a match that will never be played. 7.0.0 corrects a cluster of defects in that cascade, found by a new test harness and an at-scale sweep. Two of the fixes change behaviour a caller could have been relying on.

**Re-applying the same double exit now does nothing.** Previously the second call re-ran the cascade, read its own earlier work as a _second_ source exiting into the same target, escalated the produced `WALKOVER` to a `DOUBLE_WALKOVER`, and cascaded a round further. Both calls reported success, so a client retry or a double-click corrupted the draw progressively and silently.

**A rejected mutation leaves the draw unchanged.** `setMatchUpStatus` now validates a bare `{ winningSide }` outcome _before_ any removal runs, so a refused call leaves the draw byte-identical. Previously such an outcome skipped the early participant check — it carries no `matchUpStatus` — and was caught only after the existing result had already been unwound. A rejected call could therefore destroy a recorded result.

The rest correct wrong answers rather than change a contract: a topology proxy that awarded a walkover to the side holding nobody, a cross-structure winner that fell through silently and never reached the Decider, an unwind that asked a field the cascade had already overwritten, a source-structure `drawPosition` handed to a target in another structure, and an unguarded `participantId === undefined` that matched the first empty slot rather than nothing.

→ [Exit Propagation](./concepts/exit-propagation), [migration §2](./migration-7.0.0#2-re-applying-a-double-exit-is-now-idempotent), [migration §3](./migration-7.0.0#3-a-rejected-mutation-leaves-the-draw-unchanged).

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

→ [migration §4](./migration-7.0.0#4-time-zone-conversions-refuse-rather-than-throw-or-guess), [tools.zonedDateTime](./tools/tools-api#toolszoneddatetime).

### 3. Two queries refuse an absent object param instead of answering

`checkMatchUpIsComplete` takes a matchUp **object**; `getParticipantResults` takes an **array** of in-context matchUps. Neither takes an id — and `paramsMiddleware` resolves `drawId` into a `drawDefinition` but does not resolve `matchUpId` into a matchUp or gather matchUps. So the engine-idiomatic call supplied nothing, and both answered anyway:

```js
// before 7.0.0 — both wrong, neither says so
tournamentEngine.checkMatchUpIsComplete({ matchUpId, drawId }); // false, for a COMPLETED matchUp
tournamentEngine.getParticipantResults({ drawId }); // {}, for a fully-played draw
```

Both now return `ERR_MISSING_MATCHUP` / `ERR_MISSING_MATCHUPS`. It was worth breaking because `checkMatchUpIsComplete` returns a **boolean a caller branches on** — no error to notice, no `undefined` to guard, and the wrong answer is the safe-looking one.

An **empty** array is still a valid question with an empty answer; the guard is on the argument being absent, not empty.

`getParticipantResults` also refuses a **stored** (non-hydrated) matchUp that claims a winner. Results are attributed through `sides[].participantId`, and until 7.0.0 the helper that reads a side returned the literal string `'foo'` when `sides` was absent — so a round robin tallied from stored matchUps returned results keyed `foo` rather than failing. That sentinel, and the two `console.log` calls beside it, are gone.

→ [migration §5](./migration-7.0.0#5-two-queries-refuse-an-absent-object-param-instead-of-answering).

### 4. `participantsRequiredMatchUpStatuses` — a spelling fix

The exported constant was misspelled `particicipantsRequiredMatchUpStatuses` (an extra `ici`) since it was introduced. Rename the import; the value, the type and the semantics are identical. No deprecated alias is provided, and a survey of the CourtHive ecosystem found no consumer importing the old name.

→ [migration §1](./migration-7.0.0#1-participantsrequiredmatchupstatuses--a-spelling-fix).

## The headline feature — the LADDER draw type

A **ladder** is a continuous, challenge-driven competition. Participants occupy an ordered **standing**, a participant may **challenge** someone above them, and the result rearranges the standing. There are no rounds, no bracket, no fixed field, and often no end date.

`LADDER` shares the `AD_HOC` _structure shape_ — matchUps carry neither `roundPosition` nor `drawPosition` — but not its meaning: an `AD_HOC` draw's `positionAssignments` are a roster, while a ladder's **are the standing** and `drawPosition` reads as **rank**, where 1 is the top. `isAdHocType('LADDER')` is therefore `true`; ask `isLadder` wherever the difference matters.

The full walkthrough is the [Ladder concepts page](./concepts/draw-types/ladder). What follows is what is new about it.

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

→ [The challenge](./concepts/draw-types/ladder#the-challenge).

### `CHALLENGED` is the first matchUpStatus whose context is enforced

`CHALLENGED` is valid only in a `LADDER` drawType; `setMatchUpStatus` returns `ERR_MATCHUP_STATUS_OUT_OF_SCOPE` anywhere else. The mechanism is general — `matchUpStatusScopes` declares where a status may be used and `getMatchUpStatusScopeViolation` enforces it — rather than an `if` in one setter. `DEAD_RUBBER`, meaningful only inside a team tie, is the obvious second adopter and is declared but deliberately left inactive, since enforcing it could reject data that is legal today.

`CHALLENGED` joins `validMatchUpStatuses`, `participantsRequiredMatchUpStatuses`, `nonDirectingMatchUpStatuses` and **`upcomingMatchUpStatuses`**. That last one widens the meaning of "upcoming" from _will happen_ to _is expected to happen_, since a challenge may be declined or expire — a deliberate trade, because a challenge missing from every upcoming-match view is invisible to exactly the people who must act on it.

→ [Scope enforcement](./concepts/draw-types/ladder#challenged-is-scoped-to-ladder-and-the-scope-is-enforced).

### An attestation gate on self-reported results

A ladder result is reported by the people who played it, so movement is gated on an **attested** result in code rather than in a comment. `POLICY_LADDER`'s `resultValidation` decides what counts: `PEER` (the opponent confirms), `OPERATOR` (an official does), or `EITHER`. A submitted result that has been **disputed** is blocked from moving the standing.

→ [Reporting a result](./concepts/draw-types/ladder#reporting-a-result).

### Declines, silence and no-shows are one mechanism

Declining a challenge, ignoring one until it expires, and accepting then not turning up are treated as a single **lapse**, not three separate rules — from the challenger's side they are the same offence, being unavailable to the people below you, and clubs already treat them that way. A unified `lapsePolicy` decides the consequence.

Because consequences are evaluated when a challenge **resolves** rather than by a periodic sweep, a participant nobody challenges never lapses. An operator removal escape hatch exists for exactly that case.

→ [Lapses](./concepts/draw-types/ladder#lapses), [Removing someone by hand](./concepts/draw-types/ladder#removing-someone-by-hand).

### Ordering is `RANK` or `RATING`, and direction is read rather than assumed

Under `RANK` (the default) the standing is `positionAssignments`, mutated by the movement rules — `SWAP` or `INSERTION`, which are genuinely different competitions. Under `RATING` the standing is derived from each participant's rating, `positionAssignments` becomes a projection, and movement does nothing because the ordering already _is_ the scale.

`ratingsParameters[ratingType].ascending` decides which end is the top: `WTN`, `BWF` and `USAR` are lower-is-better, while `UTR`, `ELO`, `DUPR` and `PSA` are higher-is-better. Hardcoding "higher wins" would invert an entire WTN ladder and raise no error. An unrated participant sorts **last** — absent is not "best" — and an unknown `ratingType` returns the stored order with no `ratingValue` rather than presenting a misconfiguration as a working ladder.

Every rank change is mirrored to a dated `ScaleItem` as a **side effect** of the position mutation, never as a separate call a caller might skip, so "where was I in March" is an ordinary scale lookup rather than a second store.

→ [Ordering](./concepts/draw-types/ladder#ordering-rank-or-rating), [Movement](./concepts/draw-types/ladder#movement), [History](./concepts/draw-types/ladder#history).

### What the factory deliberately does not do

**It does not fetch ratings.** UTR, WTN and DUPR are other people's systems with their own credentials and terms; retrieving values belongs in an operator's ingest adapter, not in a competition engine. A rating-ordered ladder therefore runs either **dynamically** — the factory computes ratings from ladder results via the same `generateDynamicRatings` machinery DrawMatic uses, seeded from each participant's published rating — or from an operator's **bulk refresh**.

Dispute _resolution_ is not built: a disputed result is blocked from moving the standing, but nothing resolves it yet.

→ [Not yet built](./concepts/draw-types/ladder#not-yet-built).

## Other 7.0.0 additions

- **`SQUASH` and `BADMINTON` join the discipline vocabulary** — `DisciplineUnion` accepts any string, so both values already validated; what they lacked was membership of the **curated** set that drives autocomplete, normalization and near-match typo defense. They belong there because the [matchUpFormat grammar](./codes/matchup-format) already parses and round-trips both sports' scoring, and a discipline the engine can score should not be a stranger to the vocabulary.
- **The four calendar intents are named and documented** — `tools.plainDate` (which calendar day), `tools.plainTime` (what time on the clock), `tools.zonedDateTime` (which moment at a venue) and an absolute instant. Only the third depends on a zone, and mixing the first two without an explicit conversion produces a figure wrong by the venue's UTC offset. `plainDate`, `plainTime` and `zonedDateTime` are new published exports; `tools.dateTime` is supported and unchanged. See [Four questions, not one](./concepts/date-time-handling#four-questions-not-one).
- **The Temporal status is corrected** — Temporal reached Stage 4 in March 2026, is part of ES2026, and ships unflagged in Node 26, Chrome/Edge 144, Firefox 139 and Deno 2.7. Safari remains the gap, so it is not yet Baseline. See [Temporal API](./concepts/date-time-handling#temporal-api).
- **`PositionAssignment.byeFromPropagation`** — a new optional boolean recording that a BYE was placed by an exit cascade rather than by draw generation or by hand. It replaces a topology inference (`feedRound || roundNumber === 1`) with a first-class fact, and is visible in stored records and anything that round-trips `positionAssignments`. See [BYE provenance](./concepts/exit-propagation#bye-provenance-byefrompropagation).
- **An exit-propagation test harness** — a cross-product matrix, relational property suites (do/undo, idempotence, monotonicity), two agreement oracles, and a quarantine registry enforced in both directions so a fixed failure fails the run until its entry is removed. An at-scale randomized sweep with delta-debugging runs on demand. It exists because `isActiveDownstream` was at 100% branch coverage when it shipped 444 spurious refusals. See [Exit Propagation Harness](./testing/exit-propagation-harness).

## Upgrading checklist

1. **Read [the migration guide](./migration-7.0.0)** for the six breaking-change rows.
2. **Rename `particicipantsRequiredMatchUpStatuses`** to `participantsRequiredMatchUpStatuses` at every import site.
3. **Handle the error return** from `wallClockToUTC`, `utcToWallClock` and `toEmbargoUTC`, and branch on `undefined` from `getTimeZoneOffsetMinutes`. Remove any `try`/`catch` that was there to catch a throw.
4. **Delete compensating logic** that re-read or repaired state after a `setMatchUpStatus` error — a rejected call no longer alters the draw. Note the error code for the bare-`{ winningSide }` case moved from `ERR_MISSING_ASSIGNMENTS` to `ERR_INVALID_MATCHUP_STATUS`; match on behaviour rather than on that code.
5. **Stop relying on re-application as repair.** Re-sending an identical double exit no longer nudges a draw whose advancement is missing. Detect that state with `getDrawInconsistencies` and repair it deliberately.
6. **Add cases for `CHALLENGED` and for `SQUASH` / `BADMINTON`** if you `switch` exhaustively over `MatchUpStatusEnum` or `DisciplineEnum` with no `default`.
7. **Pass objects, not ids, to `checkMatchUpIsComplete` and `getParticipantResults`** — resolve with `findMatchUp` / `allDrawMatchUps` first. Both now refuse an absent argument rather than answering `false` / empty.
8. **Check any branch on `isAdHocType`** — it now includes `LADDER`. Use `isLadder` where a roster and a standing must be told apart.
9. **Adopt the ladder at your own pace** — the draw type and its eighteen engine methods are purely additive; no action is required to keep existing code working.

## Where to go from here

| If you want…                                          | Read                                                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| The full upgrade walkthrough                          | [6.x to 7.0.0 migration](./migration-7.0.0)                                                  |
| To run a continuous challenge-driven competition      | [Ladder](./concepts/draw-types/ladder)                                                       |
| To understand how a walkover travels through a draw   | [Exit Propagation](./concepts/exit-propagation)                                              |
| To contribute to the propagation code                 | [Exit Propagation Harness](./testing/exit-propagation-harness)                               |
| To pick the right date or time utility                | [Four questions, not one](./concepts/date-time-handling#four-questions-not-one)              |
| Zoned conversion that refuses rather than guesses     | [tools.zonedDateTime](./tools/tools-api#toolszoneddatetime)                                  |
| The previous major's feature tour                     | [What's New in 6.0.0](./whats-new-6.0.0)                                                     |
