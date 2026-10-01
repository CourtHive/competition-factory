---
title: The outcome pipeline
---

Every result a matchUp receives travels one path: `setMatchUpStatus` validates and orchestrates,
`setMatchUpState` decides, `attemptToSetMatchUpStatus` routes, and `modifyMatchUpScore` is the one
place `matchUp.score` and `matchUp.matchUpStatus` are written. What that write causes, direction of
the winner and loser and propagation of an exit, is the rest of the pipeline. This page states the
rules a second implementation has to reproduce: the inputs, every refusal by its error code, the
routes, what a write does, the side effects in order, and the guarantees. Where a rule is not yet
pinned by a corpus scenario it is marked **UNPINNED**; where the engine's behaviour is a question
rather than a decision it is marked **OPEN**.

First version, 2026-10-01, written from the source and from the golden corpus's measurements. The
pipeline is 6,548 lines across twelve files; 281 test files touch it; the corpus records 50,559
`setMatchUpStatus` steps and has observed eighteen distinct refusal codes from it.

```text
setMatchUpStatus                 validate params, resolve the draw, read policy, derive score strings
  └─ setMatchUpState             guards, participants, downstream dependencies, dispatch
       ├─ noDownstreamDependencies ──┐
       ├─ winningSideWithDownstream ─┤─▶ attemptToSetMatchUpStatus / attemptToModifyScore
       └─ applyMatchUpValues ────────┘        └─▶ modifyMatchUpScore        (the only score write)
                                                     └─▶ direction, exit propagation, tally
  └─ progressExitStatus (≤10 levels) · reconcileStaleExitOrigins · settleDraw
```

## 1. The inputs

An **outcome** carries at most `score`, `matchUpStatus`, `winningSide` and `matchUpStatusCodes`, and
optionally a `matchUpFormat`. The call also takes `matchUpId`, a draw (`drawId` or `drawDefinition`),
a `schedule` to apply once accepted, `notes`, and the flags below.

**Score strings are derived, never accepted.** When `score.sets` is present, empty sets are dropped
and `scoreStringSide1` / `scoreStringSide2` are regenerated from the sets under the matchUp's
effective format. A caller's strings are discarded. `score.sets` is the single source of truth.

**Three flags, three precedence rules**, and they differ on purpose:

| flag                        | precedence                           | an explicit `false`         |
| --------------------------- | ------------------------------------ | --------------------------- |
| `allowChangePropagation`    | param `\|\|` policy `\|\|` undefined | falls through to the policy |
| `propagateExitStatus`       | param `\|\|` policy `\|\|` undefined | falls through to the policy |
| `propagateRetirementAsExit` | param `??` policy `??` **false**     | wins, from either source    |

The third is `??` because turning retirement propagation OFF is the point of the setting; a retiree
is out of a match, not out of the event, unless the policy says so. **UNPINNED**: no corpus scenario
yet sets a flag explicitly against a policy that says the opposite.

**A `matchUpFormat` on the call is validated before anything runs and persisted only once the outcome
is accepted.** It used to be written first, so a refused outcome left a new format behind.

## 2. The refusals, in the order they are checked

A refused call returns one `ErrorType` with a `code` and changes nothing (§ 6). The checks run in
this order; the first that fails is the answer.

| #   | code                                       | condition                                                                                                                                                                                                                                                                                                                                                                                                                                | where                                                                                                                  |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | `ERR_MISSING_MATCHUP_ID`                   | no `matchUpId`                                                                                                                                                                                                                                                                                                                                                                                                                           | `setMatchUpStatus`                                                                                                     |
| 2   | `ERR_MISSING_DRAWDEF`                      | no draw could be resolved from `drawId` / `drawDefinition`                                                                                                                                                                                                                                                                                                                                                                               | `setMatchUpStatus`                                                                                                     |
| 3   | `ERR_INVALID_WINNING_SIDE`                 | `winningSide` present and not 1 or 2                                                                                                                                                                                                                                                                                                                                                                                                     | `setMatchUpStatus`                                                                                                     |
| 4   | `ERR_UNRECOGNIZED_MATCHUP_FORMAT`          | the call's `matchUpFormat` does not parse                                                                                                                                                                                                                                                                                                                                                                                                | `checkMatchUpFormatApplication`                                                                                        |
| 5   | `ERR_INVALID_VALUES`                       | `matchUpStatus` is one of CANCELLED, INCOMPLETE, ABANDONED, TO_BE_PLAYED with a `winningSide`; or a TEAM dual with AWAITING_RESULT                                                                                                                                                                                                                                                                                                       | `validateMatchUpStateInputs`, `setMatchUpState`                                                                        |
| 6   | `ERR_INVALID_MATCHUP_STATUS`               | `matchUpStatus` is not a known status; or a directing outcome on a matchUp without two participants (§ 2.1); or no route accepts it (§ 3)                                                                                                                                                                                                                                                                                                | `validateMatchUpStateInputs`, `checkParticipants`, `attemptToSetMatchUpStatus`                                         |
| 7   | `ERR_MATCHUP_STATUS_OUT_OF_SCOPE`          | the status exists but means nothing in this draw type (CHALLENGED outside a LADDER)                                                                                                                                                                                                                                                                                                                                                      | `getMatchUpStatusScopeViolation`                                                                                       |
| 8   | `ERR_NOT_FOUND_MATCHUP`                    | `matchUpId` is not in the draw                                                                                                                                                                                                                                                                                                                                                                                                           | `resolveMatchUpAndContext`                                                                                             |
| 9   | `ERR_INCOMPATIBLE_MATCHUP_STATUS`          | BYE with a winningSide (existing or requested); a live status (IN_PROGRESS, SUSPENDED) on a COMPLETED matchUp whose score is a valid win and the call carries no new result; a live status with a `winningSide` or a score that decides a winner under the incoming format; a non-directing or double-exit status without `winningSide` while downstream is active; a `winningSide` equal to the current one with a non-directing status | `resolveMatchUpAndContext`, `checkCompletedRevertGuard`, `checkImpliedCompletionGuard`, `checkDownstreamCompatibility` |
| 10  | `ERR_PROPAGATED_EXITS_DOWNSTREAM`          | a clear (TO_BE_PLAYED, empty strings, no winner) that would leave a propagated exit standing downstream                                                                                                                                                                                                                                                                                                                                  | `hasPropagatedExitDownstream`                                                                                          |
| 11  | `ERR_INVALID_SCORE`                        | the score is not valid under the format (sets, tiebreaks, a 7-5 after 6-5 is valid, a 7-6 needs a tiebreak); skipped for TEAM duals and with `disableScoreValidation`                                                                                                                                                                                                                                                                    | `validateScore`                                                                                                        |
| 12  | `ERR_CANNOT_CHANGE_FEED_ELIGIBILITY`       | the loser of the linked round has already been directed under the previous outcome                                                                                                                                                                                                                                                                                                                                                       | `feedEligibilityChange`                                                                                                |
| 13  | `ERR_UNCHANGED_CANNOT_CHANGE_OUTCOME`      | a line of a dual that holds a double exit, with the dual's downstream active; or changing a double exit that has propagated                                                                                                                                                                                                                                                                                                              | `resolveAndApplyOutcome`, `winningSideWithDownstreamDependencies`                                                      |
| 14  | `ERR_UNCHANGED_CANNOT_CHANGE_WINNING_SIDE` | changing the winner of a matchUp whose winner has been played on, without `allowChangePropagation`                                                                                                                                                                                                                                                                                                                                       | `winningSideWithDownstreamDependencies`                                                                                |
| 15  | `ERR_NO_VALID_ACTIONS`                     | downstream is active, the matchUp has propagated, the call names no winner and no directing status, and auto-calc is on                                                                                                                                                                                                                                                                                                                  | `resolveAndApplyOutcome`                                                                                               |
| 16  | `ERR_INVALID_TIME`                         | the `schedule` carries a time that does not parse (validated before the write, applied after)                                                                                                                                                                                                                                                                                                                                            | `addMatchUpScheduleItems` with `validateOnly`                                                                          |
| 17  | `ERR_ACTIVE_DRAW_POSITION`                 | a direction would move a participant off a position already played on                                                                                                                                                                                                                                                                                                                                                                    | `reconcileFedLoserEligibility`, BYE and qualifier assignment                                                           |
| 18  | `ERR_MUTATION_LOCKED`                      | the tournament holds a mutation lock whose scope covers the method                                                                                                                                                                                                                                                                                                                                                                       | engine, before the pipeline                                                                                            |
| 19  | `ERR_FORCED`                               | **OPEN**: observed by the corpus from a `setMatchUpStatus` step; its origin is outside the twelve files and not yet traced                                                                                                                                                                                                                                                                                                               |                                                                                                                        |

Of the eighteen codes the corpus has observed from `setMatchUpStatus`, none is declared by
`setMatchUpStatus.ts` itself: every refusal is raised by a helper. A reader of the entry file alone
sees no refusal at all. That is why the catalogue above is by condition, not by file.

### 2.1 Who may receive a directing outcome

A directing outcome (a winner, or COMPLETED, RETIRED, WALKOVER, DEFAULTED, a double exit) requires
two participants, with one family of exceptions and one rule inside it:

- **The waiver.** WALKOVER, DEFAULTED, DOUBLE_WALKOVER or DOUBLE_DEFAULT on a matchUp holding ONE
  participant is accepted when it is the cascade's own write (`propagatingExit`), or when the call
  names no winner, or when the winner it names is **awardable**.
- **Awardable** means the winning side is not the participant already present (a walkover over an
  opponent nobody knows yet would be two winners of one matchUp), is not a BYE, and is not a
  **phantom**: a drawPosition whose assignment exists and holds nobody. An unfilled feed slot, no
  drawPosition at all, is awardable; so is a QUALIFIER placeholder.
- **A BYE is never the winning side.** The participant advances through the BYE and their carried
  exit occurs where they land. This was decided in two places before it was written here.
- A policy may switch the requirement off: `requireParticipantsForScoring: false`.

## 3. The routes

`attemptToSetMatchUpStatus` chooses exactly one route, in this order:

| route                                | when                                                                              | does                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| unrecognized                         | status is neither directing nor non-directing                                     | refuse `ERR_UNRECOGNIZED_MATCHUP_STATUS`                       |
| already in the requested double exit | same double exit requested, no winner                                             | **success, no-op** (§ 6)                                       |
| only modify score                    | a TEAM line; or a winner exists and the status is directing and not a double exit | write the score                                                |
| completed → double exit              | a winner exists and a double exit is requested                                    | remove the directed participants, then advance the double exit |
| existing winner                      | a winner exists                                                                   | remove the directed participants, re-evaluate                  |
| non-directing                        | status is non-directing                                                           | clear the score (CANCELLED and WALKOVER remove it)             |
| BYE                                  | status is BYE                                                                     | the BYE path                                                   |
| not directing                        |                                                                                   | refuse `ERR_UNRECOGNIZED_MATCHUP_STATUS`                       |
| double exit                          |                                                                                   | clear the score, then advance the double exit                  |
| team round robin                     | a dual in a round-robin container                                                 | write the score                                                |
| propagating                          | `propagateExitStatus`                                                             | write the score                                                |
| fallthrough                          |                                                                                   | refuse `ERR_INVALID_MATCHUP_STATUS`                            |

Before any route, `resolveAndApplyOutcome` dispatches on two facts: whether **downstream is active**
(something later depends on this result) and whether this matchUp **has propagated** (it holds a
winner or a double exit). A matchUp that has never sent anything downstream cannot invalidate
anything there, so a first entry always takes the propagating branch. With both true, a named winner
goes to `winningSideWithDownstreamDependencies`; a directing status or disabled auto-calc goes to
`applyMatchUpValues`; anything else is `ERR_NO_VALID_ACTIONS`.

**`allowChangePropagation` with a different winner on a matchUp that has one** swaps winner and
loser everywhere they have gone (`swapWinnerLoser`), rather than refusing.

## 4. What a write does

`modifyMatchUpScore` → `applyScoreAndStatus` is the only place `score` and `matchUpStatus` change.

1. **A walkover, or a removal, blanks the result with the `toBePlayed` fixture**: `matchUpStatus:
TO_BE_PLAYED`, `score` with empty `scoreStringSide1` / `scoreStringSide2` and `sets: undefined`,
   `winningSide: undefined`, `matchUpStatusCodes: []`, **and `matchUpFormat: undefined`**. The
   requested status is then written over the blank. Exit provenance survives the blank when the
   written status is an exit, and BYE claims survive it on a BYE; everything else in
   `sideExitProvenance` goes.
2. **Otherwise the given `score` replaces the old one**, then `matchUpStatus`, `matchUpFormat` (only
   if given) and `matchUpStatusCodes` are written.
3. **Status codes are split at this boundary**: the positional array a client sends (`['', 'DM']`)
   becomes `sideStatusCodes` keyed by side, with the exiting side taken from `winningSide`, not from
   the index.
4. **`scoredTime`** is stamped on `schedule` the first time the matchUp becomes scored (a score with
   value, a winner, or a completed status), kept through corrections, and deleted when the result is
   removed. It is first-class in NATIVE and has no timeItem mirror.
5. **The schedule the call carried is applied after the outcome is accepted**, and was validated
   before it, so a refusal cannot land on a draw this call has just changed.

**OPEN (found by the corpus on real records, 2026-10-02):** rule 1 means a clear **normalises rather
than restores**. On a record whose matchUp had no `matchUpStatus` and no `score`, a score-then-clear
leaves `matchUpStatus: "TO_BE_PLAYED"` and an explicit score object; measured on 4 of 11 probed
fixtures, with `DO_UNDO_IDENTITY` (on the harness's volatility-stripped projection) holding on the
other 7. And a clear erases a matchUp-level `matchUpFormat`, because the fixture carries
`matchUpFormat: undefined`. Whether a clear should restore absence, and whether it should keep the
format, are decisions this spec does not make.

## 5. The side effects, in order

After the write, and only on success:

1. **Direction.** A winner is advanced to the winner target; the loser is directed along the loser
   link, if the structure has one. A changed result first **removes** what the previous one directed
   (`removeDirectedParticipants`), and that is where `ERR_ACTIVE_DRAW_POSITION` can arise.
2. **Exit propagation.** WALKOVER, DEFAULTED and (by policy) RETIRED carry into the consolation the
   loser is fed to; a double exit produces exits downstream. The rules are on
   [exit propagation](./exit-propagation.md) and are not repeated here. `progressExitStatus` iterates
   through up to **ten levels** of consolation (COMPASS feeds consolation into consolation); a
   failsafe, not a limit anyone has reached.
3. **Round robin tally** is recomputed when the matchUp is in a group (`updateTallyIfNeeded`).
4. **Stale exit origins are reconciled** once removals, directions and propagation have all settled:
   a carried exit whose origin no longer describes an exit is corrected.
5. **The draw is settled**: held exits are released (`settleHeldExits`), and a final that feeds a
   decider settles whether the decider is needed (`reconcileDeciders`), only when a final's winner
   changed.
6. **Notifications** (MODIFY_MATCHUP and the draw's topics) are emitted; the factory extension's
   `timeStamp` is written by the engine after the call.

## 6. Guarantees

- **A refusal changes nothing** (`ERROR_IMPLIES_NO_MUTATION`). The checks in § 2 run above every
  write; the two that used to run late (participants on a bare winner, feed eligibility) were moved
  up after each was measured leaving a destroyed previous result behind a refusal.
- **Asking for the state a matchUp is already in is satisfied, not repeated.** A second identical
  double exit is a no-op success; without this, the cascade read its own earlier work as a second
  source and escalated a WALKOVER to a DOUBLE_WALKOVER. Scoped to double exits only.
- **A first entry always propagates.** Dispatching on "downstream active" alone refused a
  TO_BE_PLAYED Main matchUp above a played consolation and, routed the other way, silently stopped
  winners advancing in 27 FMLC cells.
- **Score strings never disagree with sets**, because they are not accepted.
- **A completed matchUp with a valid winning score cannot be reverted to a live status without a new
  result**; submit a corrected outcome or clear first.
- The properties the exit-propagation harness checks (`DO_UNDO_IDENTITY`, `IDEMPOTENT_REAPPLY`,
  `MONOTONIC_DECISION`) are stated in the corpus vocabulary (`corpus/INVARIANTS.md`) and hold on
  generated draws across the 600-cell matrix and the census; on real records, see § 4 OPEN.

## 7. Write mode

In NATIVE mode (the default since 5.0.0) `scoredTime` is written on `matchUp.schedule` and nothing
here touches `timeItems`. In LEGACY and BRIDGE modes the pipeline is unchanged; the schedule
attributes it stamps follow `setFirstClassOrTimeItem`. The result, status and codes are first-class
in every mode.

## 8. What the corpus pins

|                                   |                                                                                                                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setMatchUpStatus` steps recorded | 50,559 (recorded tests, matrix, census, route flips, fixtures)                                                                                                                    |
| refusal codes observed            | 18 (§ 2), none declared in the entry file                                                                                                                                         |
| `setMatchUpState`                 | exported as an engine method, eleven declared codes, **no caller** in the corpus: an internal that leaked onto the surface. **OPEN**: remove it from the governor, or document it |
| `bulkMatchUpStatusUpdate`         | 1 step; its two declared codes unobserved. **UNPINNED**                                                                                                                           |
| real-record do/undo               | 7 of 11 probed fixtures restore the draw projection; 4 do not (§ 4)                                                                                                               |

## 9. Open questions

1. Should a clear restore **absence** (no status, no score) rather than write TO_BE_PLAYED and an
   empty score object? And should it keep a matchUp-level `matchUpFormat`? (§ 4)
2. Where does `ERR_FORCED` come from on this path? (§ 2, row 19)
3. Should `setMatchUpState` be an engine method at all? (§ 8)
4. The flags' precedence rules differ (`||` vs `??`); is that the intended contract for all three,
   or should `allowChangePropagation` and `propagateExitStatus` also honour an explicit `false`? (§ 1)

## Related

- [exit propagation](./exit-propagation.md): what propagates, provenance, the guarantees on
  cascades.
- [drawPositions](./draw-positions.md): the rules direction relies on.
- `corpus/INVARIANTS.md` and `corpus/README.md`: the properties and the scenarios that pin this page.
