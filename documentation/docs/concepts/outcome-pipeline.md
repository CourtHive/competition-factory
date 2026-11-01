---
title: The outcome pipeline
---

Every result a matchUp receives travels one path: `setMatchUpStatus` validates and orchestrates,
`setMatchUpState` decides, `attemptToSetMatchUpStatus` routes, and `modifyMatchUpScore` is the one
place `matchUp.score` and `matchUp.matchUpStatus` are written. What that write causes, direction of
the winner and loser and propagation of an exit, is the rest of the pipeline. This page states the
rules a second implementation has to reproduce: the inputs, every refusal by its error code, the
routes, what a write does, the side effects in order, and the guarantees. Where the engine's
behaviour is a question rather than a decision it is marked **OPEN**.

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

**Three flags, one precedence rule: the policy governs, both ways** (CA, 2026-10-01).

| flag                        | precedence                       | absent both |
| --------------------------- | -------------------------------- | ----------- |
| `allowChangePropagation`    | policy `??` param `??` undefined | not allowed |
| `propagateExitStatus`       | policy `??` param `??` undefined | no          |
| `propagateRetirementAsExit` | policy `??` param `??` **false** | no          |

An applied scoring policy that **speaks** on a flag, `true` or `false`, wins over anything on the
call; the call decides only where the policy is **silent**. So under a policy that propagates
retirement as an exit, a tournament director passing `false` is overruled, and under a policy that
forbids it, a director passing `true` is overruled too: _"if a governance policy is someone who
retires can no longer continue playing, a tournament director under that policy shouldn't be able to
allow a participant to continue in the draw."_ `POLICY_SCORING_DEFAULT` is silent on all three, so a
provider that attaches it leaves the decision to the call. Until 2026-10-01 the call won on
`propagateRetirementAsExit` and a truthy call won on the other two (`||`), so a caller could
override its federation's rule; the three authored scenarios `authored/outcome-pipeline/flags-*`
pin the new contract from both directions.

**A `matchUpFormat` on the call is validated before anything runs and persisted only once the outcome
is accepted.** It used to be written first, so a refused outcome left a new format behind.

## 2. The refusals, in the order they are checked

A refused call returns one `ErrorType` with a `code` and changes nothing (§ 6); its `context`, when
present, is an object, and a sentence for a person goes in `info` (two row-9 refusals returned the
sentence AS `context` until the authored scenarios refused to record them, 2026-10-01). The checks run in
this order; the first that fails is the answer. **Two corrections from S2a (2026-10-01), measured by
running v2 differentially against v1:** the TEAM clause of row 5 (`AWAITING_RESULT`) is asked after
row 10, and the participants clause of row 6 (§ 2.1) after row 11; and row 9's second condition
judges the stored score under the **stored** format while its third judges the incoming score under
the format the call would apply, so a call that carries a new `matchUpFormat` can be refused under
the old one.

| #   | code                                       | condition                                                                                                                                                                                                                                                                                                                                                                                                                                 | where                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `ERR_MISSING_MATCHUP_ID`                   | no `matchUpId`                                                                                                                                                                                                                                                                                                                                                                                                                            | `setMatchUpStatus`                                                                                                                                                                                                                                                 |
| 2   | `ERR_MISSING_DRAWDEF`                      | no draw could be resolved from `drawId` / `drawDefinition`                                                                                                                                                                                                                                                                                                                                                                                | `setMatchUpStatus`                                                                                                                                                                                                                                                 |
| 3   | `ERR_INVALID_WINNING_SIDE`                 | `winningSide` present and not 1 or 2; **0 is refused** (CA, 2026-10-01: there is never a `winningSide: 0`); a set's own `winningSide` likewise                                                                                                                                                                                                                                                                                            | `setMatchUpStatus`                                                                                                                                                                                                                                                 |
| 23  | `ERR_INVALID_VALUES`                       | `notes` present and not a string. Checked here, between rows 3 and 4: notes are written last, onto the matchUp, after the score, so `addNotes` refusing them there was an error over a written result (2026-10-22). Numbered 23 so the existing rows keep their numbers                                                                                                                                                                   | `setMatchUpStatus`                                                                                                                                                                                                                                                 |
| 4   | `ERR_UNRECOGNIZED_MATCHUP_FORMAT`          | the call's `matchUpFormat` is not well-formed (does not parse), or is well-formed but refused for new use (a tiebreak below `setTo − 1`, an aggregate of standard sets; scoring engine spec § 16 decision 19, CA 2026-10-18) AND differs from the format the matchUp plays under (matchUp, structure, draw, event): a score sent back with the stored format is not a new use                                                             | `checkMatchUpFormatApplication`                                                                                                                                                                                                                                    |
| 5   | `ERR_INVALID_VALUES`                       | `matchUpStatus` is one of CANCELLED, INCOMPLETE, ABANDONED, TO_BE_PLAYED with a `winningSide`; or a TEAM dual with AWAITING_RESULT                                                                                                                                                                                                                                                                                                        | `validateMatchUpStateInputs`, `setMatchUpState`                                                                                                                                                                                                                    |
| 6   | `ERR_INVALID_MATCHUP_STATUS`               | `matchUpStatus` is not a known status; or a directing outcome on a matchUp without two participants (§ 2.1); or no route accepts it (§ 3)                                                                                                                                                                                                                                                                                                 | `validateMatchUpStateInputs`, `checkParticipants`, `attemptToSetMatchUpStatus`                                                                                                                                                                                     |
| 7   | `ERR_MATCHUP_STATUS_OUT_OF_SCOPE`          | the status exists but means nothing here: CHALLENGED outside a LADDER; DEAD_RUBBER on a matchUp that is neither a rubber of a team tie nor in a DOUBLE_ELIMINATION Decider (found by its links). The matchUp half needs the matchUp, so it applies once found and refuses nothing before                                                                                                                                                  | `getMatchUpStatusScopeViolation`                                                                                                                                                                                                                                   |
| 8   | `ERR_NOT_FOUND_MATCHUP`                    | `matchUpId` is not in the draw                                                                                                                                                                                                                                                                                                                                                                                                            | `resolveMatchUpAndContext`                                                                                                                                                                                                                                         |
| 9   | `ERR_INCOMPATIBLE_MATCHUP_STATUS`          | BYE with a winningSide (existing or requested); a live status (IN_PROGRESS, SUSPENDED) on a COMPLETED matchUp whose score is a valid win and the call carries no new result; a live status with a `winningSide` or a score that decides a winner under the incoming format; a non-directing or double-exit status without `winningSide` while downstream is active; a `winningSide` equal to the current one with a non-directing status  | `resolveMatchUpAndContext`, `checkCompletedRevertGuard`, `checkImpliedCompletionGuard`, `checkDownstreamCompatibility` The result carries `activeDownstream` and `winningSide` beside `error`, as v1's `checkDownstreamCompatibility` returns them (no `context`). |
| 20  | `ERR_UNCHANGED_CANNOT_CHANGE_OUTCOME`      | a direct write that would change a matchUp holding a carried or produced exit: a re-score, another winner, a relabel to a played result, or a clear (CA, 2026-10-03). The correction is made at the exit's origin. Checked here, between rows 9 and 10; numbered 20 so the existing rows keep their numbers                                                                                                                               | `rewritesCarriedExit`                                                                                                                                                                                                                                              |
| 21  | `ERR_INVALID_VALUES`                       | a WINNER or LOSER link with no `source.roundNumber`, a malformed draw (CA, 2026-10-06: an error, not a crash). Checked between rows 20 and 10, for the matchUp's own targets, any structure downstream of it, and (2026-10-22) **any such link in the draw**: a settle pass asks matchUps the call never reached, and met one only after the cascade had written. With none, no `positionTargets` error can arise later in the call (§ 6) | `positionTargets`, `getActiveDownstream`                                                                                                                                                                                                                           |
| 10  | `ERR_PROPAGATED_EXITS_DOWNSTREAM`          | a clear (TO_BE_PLAYED, empty strings, no winner) that would leave a propagated exit standing downstream                                                                                                                                                                                                                                                                                                                                   | `hasPropagatedExitDownstream`                                                                                                                                                                                                                                      |
| 11  | `ERR_INVALID_SCORE`                        | the score is not valid under the format (sets, tiebreaks, a 7-5 after 6-5 is valid, a 7-6 needs a tiebreak); skipped for TEAM duals and with `disableScoreValidation`                                                                                                                                                                                                                                                                     | `validateScore`                                                                                                                                                                                                                                                    |
| 22  | `ERR_UNCHANGED_CANNOT_CHANGE_OUTCOME`      | a correction that changes the KIND of a decided outcome — an exit carried downstream (WALKOVER, DEFAULTED, RETIRED under `propagateRetirementAsExit`) to a played result or the reverse, by a winner change or by a status-only correction — once the loser's path holds a result a director recorded, played or not (P52, CA 2026-10-11). Checked just before row 12; numbered 22 so the existing rows keep their numbers                | `correctionKindChange`                                                                                                                                                                                                                                             |
| 12  | `ERR_CANNOT_CHANGE_FEED_ELIGIBILITY`       | the loser of the linked round has already been directed under the previous outcome, or the `FIRST_MATCHUP` reservation the previous outcome placed has been played on                                                                                                                                                                                                                                                                     | `feedEligibilityChange`                                                                                                                                                                                                                                            |
| 16  | `ERR_INVALID_TIME`                         | the `schedule` carries a time that does not parse (validated before the write, applied after; asked after row 12 and before the dispatch, rows 26 and 13 to 15, where v1 asks it)                                                                                                                                                                                                                                                         | `addMatchUpScheduleItems` with `validateOnly`                                                                                                                                                                                                                      |
| 25  | `ERR_INVALID_DATE`                         | the `schedule` carries a date, or a date-time's date, outside the tournament or off the calendar (#5774; validated before the write, so the outcome does not land)                                                                                                                                                                                                                                                                        | `addMatchUpScheduleItems` with `validateOnly`                                                                                                                                                                                                                      |
| 27  | `ANACHRONISM`                              | the `schedule` carries a recorded time out of played order with a linked matchUp (an end time given with the outcome is judged before the outcome lands, #5979; validated before the write, so the outcome does not land)                                                                                                                                                                                                                 | `addMatchUpScheduleItems` with `validateOnly`                                                                                                                                                                                                                      |
| 24  | `ERR_MISSING_DRAW_POSITIONS`               | a winner (or, under `propagateExitStatus`, an exit) for a matchUp stored without `drawPositions` that has sent nothing, is not a line of a dual and is not ad hoc: there is nobody to direct (2026-10-22: was raised by `directParticipants` after the score was written). Checked after row 16                                                                                                                                           | `missingDrawPositionsRefusal`                                                                                                                                                                                                                                      |
| 26  | `ERR_ACTIVE_DRAW_POSITION`                 | a swap (`allowChangePropagation`) over a `FIRST_MATCHUP` link that would place a loser on, or take one off, a fed seat that has played on (v1's `fedLoserPlacementRefusal` and `relabelledPathFeedRefusal`, asked before the swap writes). Decided by v2 since S4, on its structural index                                                                                                                                                | `fedLoserPlacementRefusal`, `relabelledPathFeedRefusal`                                                                                                                                                                                                            |
| 13  | `ERR_UNCHANGED_CANNOT_CHANGE_OUTCOME`      | a line of a dual that holds a double exit, with the dual's downstream active; or changing a double exit that has propagated                                                                                                                                                                                                                                                                                                               | `resolveAndApplyOutcome`, `winningSideWithDownstreamDependencies` The context names the stored matchUp beside `winningSide`, as v1's `winningSideWithDownstreamDependencies` does.                                                                                 |
| 14  | `ERR_UNCHANGED_CANNOT_CHANGE_WINNING_SIDE` | changing the winner of a matchUp whose winner has been played on, without `allowChangePropagation`                                                                                                                                                                                                                                                                                                                                        | `winningSideWithDownstreamDependencies` The context names the stored matchUp beside `winningSide`, as v1's `winningSideWithDownstreamDependencies` does.                                                                                                           |
| 15  | `ERR_NO_VALID_ACTIONS`                     | downstream is active, the matchUp has propagated, the call names no winner and no directing status, and auto-calc is on                                                                                                                                                                                                                                                                                                                   | `resolveAndApplyOutcome`                                                                                                                                                                                                                                           |
| 17  | `ERR_ACTIVE_DRAW_POSITION`                 | a direction would move a participant off a position already played on (a swap's, decided earlier: row 26)                                                                                                                                                                                                                                                                                                                                 | `reconcileFedLoserEligibility`, BYE and qualifier assignment                                                                                                                                                                                                       |
| 18  | `ERR_MUTATION_LOCKED`                      | the tournament holds a mutation lock whose scope covers the method: asked by the engine before the method runs (`executeMethod`), so neither pipeline is reached; nothing inside `setMatchUpStatus` asks a lock                                                                                                                                                                                                                           | engine, before the pipeline                                                                                                                                                                                                                                        |
| 19  | `ERR_FORCED`                               | not an engine code: the failure the error-path tests force on a cascade write (`cascadeWriteErrorsReachTheCaller`, `reconcileDeciderReturnsItsError`, `aWinnerAcrossALinkIsSeatedOnce`), which the corpus records from their steps (traced 2026-10-31). It stands for a write failing inside the cascade, which v2 does not plan: apply-stage                                                                                             |                                                                                                                                                                                                                                                                    |

Of the eighteen codes the corpus has observed from `setMatchUpStatus`, none is declared by
`setMatchUpStatus.ts` itself: every refusal is raised by a helper. A reader of the entry file alone
sees no refusal at all. That is why the catalogue above is by condition, not by file.

### 2.1 Who may receive a directing outcome

A directing outcome (a winner, or COMPLETED, RETIRED, WALKOVER, DEFAULTED, a double exit) requires
two participants, with one family of exceptions and one rule inside it:

- **The waiver.** WALKOVER, DEFAULTED, DOUBLE_WALKOVER or DOUBLE_DEFAULT on a matchUp holding ONE
  participant is accepted when it is the cascade's own write (`propagatingExit`), or when the call
  names no winner, or when the winner it names is **awardable**. A DOUBLE exit is waived only as the
  cascade's own write: entered directly it needs both seats reached, because a double exit is one
  exit per seat (CA, 2026-10-04). Entered beside a seat nobody has reached, the arrival there would
  meet a double exit already standing, a third entity in a matchUp that holds two.
- **Awardable** means the winning side is not the participant already present (a walkover over an
  opponent nobody knows yet would be two winners of one matchUp), is not a BYE, and is not a
  **phantom**: a drawPosition whose assignment exists and holds nobody. An unfilled feed slot, no
  drawPosition at all, is awardable; so is a QUALIFIER placeholder.
- **A BYE is never the winning side.** The participant advances through the BYE and their carried
  exit occurs where they land. This was decided in two places before it was written here.
- A policy may switch the requirement off: `requireParticipantsForScoring: false`.
- **No request flag is involved.** The waiver is how a director records a walkover or default before
  the second opponent arrives (CA, 2026-10-04): _"propagateExitStatus shouldn't have anything to do with
  this ability"_. `propagateExitStatus` decides only whether the exit is then carried into the loser's
  next matchUp. `matchUpActions` offers it as `EXIT`.

## 3. The routes

`attemptToSetMatchUpStatus` chooses exactly one route, in this order:

| route                                | when                                                                              | does                                                           | v2                         |
| ------------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------- |
| unrecognized                         | status is neither directing nor non-directing                                     | refuse `ERR_UNRECOGNIZED_MATCHUP_STATUS`                       | `refused`                  |
| already in the requested double exit | same double exit requested, no winner                                             | **success, no-op** (§ 6)                                       | `noop`                     |
| only modify score                    | a TEAM line; or a winner exists and the status is directing and not a double exit | write the score                                                | `only-score`               |
| completed → double exit              | a winner exists and a double exit is requested                                    | remove the directed participants, then advance the double exit | `completed-to-double-exit` |
| existing winner                      | a winner exists                                                                   | remove the directed participants, re-evaluate                  | `existing-winner-removed`  |
| non-directing                        | status is non-directing                                                           | clear the score (CANCELLED and WALKOVER remove it)             | `clear`                    |
| BYE                                  | status is BYE                                                                     | the BYE path                                                   | `bye`                      |
| not directing                        |                                                                                   | refuse `ERR_UNRECOGNIZED_MATCHUP_STATUS`                       | `refused`                  |
| double exit                          |                                                                                   | clear the score, then advance the double exit                  | `double-exit`              |
| team round robin                     | a dual in a round-robin container                                                 | write the score                                                | `team-round-robin`         |
| propagating                          | `propagateExitStatus`                                                             | write the score                                                | `propagating`              |
| fallthrough                          |                                                                                   | refuse `ERR_INVALID_MATCHUP_STATUS`                            | `refused`                  |

Before any route, `resolveAndApplyOutcome` dispatches on two facts: whether **downstream is active**
(something later depends on this result) and whether this matchUp **has propagated** (it holds a
winner or a double exit). A matchUp that has never sent anything downstream cannot invalidate
anything there, so a first entry always takes the propagating branch. With both true, a named winner
goes to `winningSideWithDownstreamDependencies`; a directing status or disabled auto-calc goes to
`applyMatchUpValues`; anything else is `ERR_NO_VALID_ACTIONS`.

**A clear of a BYE changes nothing**, and is asked before the dispatch: a request with no winner, no
score with value and no status but `TO_BE_PLAYED`, made of a matchUp stored as a `BYE`, succeeds as
`noop` and still applies its schedule. A BYE has no result to clear, and **a `TO_BE_PLAYED` matchUp with
a BYE side never occurs** (CA, 2026-10-24; punch-list P26). Until then the clear was accepted and wrote
`TO_BE_PLAYED` against nobody: four seeds of census window sched-w1, on both arms. v1 and v2 ask the one
predicate (`clearsABye`); the harness invariant `TO_BE_PLAYED_BESIDE_BYE` checks the shape at every
census step (`aClearedByeStaysABye.test.ts`). The lines of a BYE dual are not that shape: the dual is the
BYE, and its lines stay TO_BE_PLAYED, as they are generated (CA, 2026-10-24).

**The route v2 names** (`Route`, `src/mutate/matchUps/outcome/types.ts`) is the table's last column for
a call that reaches `attemptToSetMatchUpStatus`; `refused` is any of its three refusals. The dispatch
names six more:

- `swap`: `allowChangePropagation` with a different winner on a matchUp that has one (below).
- `winner`: the propagating branch with a winner named, an exit under `propagateExitStatus`, or a
  CANCELLED or ABANDONED line that changes its dual's winner: `attemptToSetWinningSide`.
- `line-score`: a line rescored with a winner while its dual loses the winner it had.
- `remove-directed`: a score with no winner, or a winner taken away with no score: the directed
  participants are taken back.
- `clear-score`: nothing else matched; the score is removed.
- `apply-values`: downstream is active and this matchUp has propagated, with a winner, a directing
  status or auto-calc disabled (`applyMatchUpValues`); also a drawn result in a rotating-partner or
  combined-point round robin with nothing active downstream.

**A matchUp in play downstream is active** (CA, 2026-10-18, P57): _"downstream matchUps e.g. "the
match it feeds" should be considered active and a source matchUp (a matchUp earler in the dependency
chain) should not be able to be re-scored as unfinished! a downstream matchUp AWAITING_RESULT should
be considered an active matchUp also"_. `isActiveDownstream` counts a winner or loser target as active
when it has a decided result, as before, **or** when it is in play: its status is IN_PROGRESS,
SUSPENDED, AWAITING_RESULT or INCOMPLETE, or its score has a value. A BYE or an exit is not judged by
play; its activity remains a question of provenance. So with the final in play, re-scoring a
completed semifinal as unfinished is refused the way it is when the final is COMPLETED: IN_PROGRESS,
AWAITING_RESULT or a clear is row 9 (`ERR_INCOMPATIBLE_MATCHUP_STATUS`), a score with no status and
no winner is row 15 (`ERR_NO_VALID_ACTIONS`), and another winner is row 14. A correction that keeps
the winner is still accepted, and `allowChangePropagation` still swaps. Both implementations read
the one query (`getTargetsDownstream`), so v1 and v2 change together. Before 2026-10-18 the re-score
was accepted through `noDownstreamDependencies`, which took the advanced participant back out of the
final and left it TO_BE_PLAYED with no score (`inPlayDownstreamIsActive.test.ts`).

**`allowChangePropagation` with a different winner on a matchUp that has one** swaps winner and
loser everywhere they have gone (`swapWinnerLoser`), rather than refusing.

## 4. What a write does

`modifyMatchUpScore` → `applyScoreAndStatus` is the only place `score` and `matchUpStatus` change.

1. **A walkover, or a removal, blanks the result with the `toBePlayed` fixture**: `matchUpStatus:
TO_BE_PLAYED`, `score` with empty `scoreStringSide1` / `scoreStringSide2` and `sets: undefined`,
   `winningSide: undefined`, `matchUpStatusCodes: []`, **and `matchUpFormat: undefined`**, though
   since 7.5.0 a matchUp-level `matchUpFormat` is carried across the blank (below). The
   requested status is then written over the blank. Exit provenance survives the blank when the
   written status is an exit, and BYE claims survive it on a BYE; everything else in
   `sideExitProvenance` goes.
2. **Otherwise the given `score` replaces the old one**, then `matchUpStatus`, `matchUpFormat` (only
   if given) and `matchUpStatusCodes` are written.
3. **Status codes are split at this boundary**: the positional array a client sends (`['', 'DM']`)
   becomes `sideStatusCodes` keyed by side, with the exiting side taken from `winningSide`, not from
   the index. **Only a client's array is split** (census A1 residue F1b, 2026-10-18). An engine write
   whose array is not client input (a propagation in `progressExitStatus`; the convergence reconcile and the
   forward writes in `doubleExitAdvancement`, which re-store the target's own, possibly derived,
   array; the unwinds in `removeDoubleExit`) passes `derivedStatusCodes`, naming the matchUp it
   describes. Its array is stored as given. It keeps the reasons the matchUp already holds, plus
   the real reason it carries for the arriving side, on the sides that exited: both sides of a double
   exit, the losing side of a single exit. A bare `WO` or `DEF` that the projection wrote is never a
   reason. The choice is made by origin, not by value: a client's `['WO']` is still split as its
   reason. v2 plans only the requested matchUp's own write, from client input, and compares
   `matchUpStatusCodes` as display; it plans no `sideStatusCodes` and no propagation write, so there
   is nothing to mirror there.
4. **`scoredTime`** is stamped on `schedule` the first time the matchUp becomes scored (a score with
   value, a winner, or a completed status), kept through corrections, and deleted when the result is
   removed. One exception: a DOUBLE_ELIMINATION decider made a DEAD_RUBBER was not played, so it is
   never stamped and keeps no stamp from a result it held before. A rubber of a team tie is not the
   exception; its DEAD_RUBBER is stamped like an ABANDONED line (CA, 2026-10-24). It is first-class
   in NATIVE and has no timeItem mirror.
5. **The schedule the call carried is applied after the outcome is accepted**, and was validated
   before it, so a refusal cannot land on a draw this call has just changed. v2 plans it (S7) where it lands
   on the matchUp alone, a date, a time, a court, a venue or a court order: v1's own writer is run on a copy of the
   matchUp, and the schedule it leaves is written (`setMatchUpSchedule`) before the result, so `scoredTime` is stamped
   onto it as v1 stamps it. A schedule v1 refuses, or one carrying another attribute (start, stop, resume and end times,
   officials), stays v1's.

**Decided 2026-10-01 (CA), found by the corpus on real records:** rule 1 means a clear
**normalises rather than restores**. On a record whose matchUp had no `matchUpStatus` and no
`score`, a score-then-clear leaves `matchUpStatus: "TO_BE_PLAYED"` and an explicit score object;
measured on 4 of 11 probed fixtures. That stays: TO_BE_PLAYED and an empty score object are the
canonical cleared state, and a reader never sees an undefined status. **A clear keeps a
matchUp-level `matchUpFormat`**: the format is a property of the match, not of its result. The
blank fixture still carries `matchUpFormat: undefined`, because it is the unwound-matchUp shape, and
`applyScoreAndStatus` now carries the existing format across it the way it carries exit provenance;
a call that brings a new format still writes the new one. Pinned by
`clearKeepsMatchUpFormat.test.ts`.

**A double exit entered over a completed result** (CA, 2026-10-02). A `DOUBLE_DEFAULT` keeps the score
the matchUp had, finished or not, unless the call brings one: both players can be defaulted after
the last ball (post-match misconduct at the net, for example), and the score is the record of what
was played. The reason belongs in a penalty, `addPenalty` with each player's `participantId` and the
`matchUpId`. A `DOUBLE_WALKOVER` says the match was not played, so it blanks the score; one entered
over a completed result is taken at its word, and correcting a mistaken one is the director's re-entry.
Neither has a winner. Pinned by `authored/outcome-pipeline/double-exit-over-a-completed-result`.

## 5. The side effects, in order

After the write, and only on success:

1. **Direction.** A winner is advanced to the winner target; the loser is directed along the loser
   link, if the structure has one. A changed result first **removes** what the previous one directed
   (`removeDirectedParticipants`), and that is where `ERR_ACTIVE_DRAW_POSITION` can arise. A loser taken
   back leaves every seat their loss reached, a link further on included, and no exit stays awarded to
   a seat so emptied (census A1, `aSeatEmptiedFurtherOnLeavesNoAwardBehind`).
   **A first-match loser feed** (the link's condition `FIRST_MATCHUP`) takes the loser only if the match they lost
   was their first played: no win of their own in the source structure. For a swap (`allowChangePropagation`
   with a different winner) the wins counted are those in the rounds **before** the swapped one. A swap rewrites
   the advancing drawPosition in every later matchUp, so the new loser loses their later wins with it; counted,
   those wins would keep out a loser whose first match this was (census w1 9000582 and nine more FMLC seeds,
   `aSwapCountsOnlyTheRoundsBeforeIt`; v1's `reconcileFedLoserEligibility`).
   **A winner directed across a link is seated once** (2026-10-22). A winner who already holds a seat in
   the target matchUp is left there and nothing is written: a direction can arrive twice in one call (a
   DOUBLE_ELIMINATION Decider seated from the Main final, then the same winner re-advanced by a correction
   below), and the second used to reach for the other seat and be refused. A placement across a link that
   fails otherwise, and a winner with no position to take, are not returned: the direction runs after the
   result is written, and a refusal there would leave that write behind. For a Decider, `reconcileDeciders`
   seats it from the final that stands (step 5). Over the suite and the frozen census windows the only
   placement failures reached were the already-seated case (census de 9304558 with
   `doubleExitPropagateBye: false`, census F2 20477784). Pinned by `aWinnerAcrossALinkIsSeatedOnce.test.ts`.
2. **Exit propagation.** WALKOVER, DEFAULTED and (by policy) RETIRED carry into the consolation the
   loser is fed to; a double exit produces exits downstream. The rules are on
   [exit propagation](./exit-propagation.md) and are not repeated here. `progressExitStatus` iterates
   through up to **ten levels** of consolation (COMPASS feeds consolation into consolation); a
   failsafe, not a limit anyone has reached. A **relabel** keeps the winner the matchUp already has
   and changes what it says about the loser (CA, 2026-10-02). Re-entered as a WALKOVER or DEFAULTED,
   it carries the exit to the matchUp the loser already stands in; re-entered as COMPLETED, it
   withdraws the exit it carried there. Where that matchUp already has a result a director recorded, or
   the winner of the carried exit has played on from it (counting past any BYEs they were advanced
   through), the correction is refused before anything is written (row 22, P52): a recorded result
   downstream fixes whether the origin's outcome is an exit or a played result. The same holds one
   structure on: where the loser's loss carried their exit into a matchUp it decided for whoever stood
   opposite, a result that winner has recorded onward counts too (census 20496362). A correction that
   names the same winner with no status and no score is a played result (COMPLETED), as the write
   records it, so re-entering a walkover as a bare win changes its kind. An exit carried into a
   matchUp that another exit already decided for the seat awaiting the loser, with a result recorded
   below it, is **carried past** that matchUp as past a BYE: the loser takes the seat, goes on to its
   winner matchUp, and carries the exit on from there (P51 group 2, CA 2026-10-11). A **winner change**
   (a flip) relabels the old loser's place onto the new loser, and their carried exit is re-derived
   from the corrected result in the same way, so a corrected draw is the one forward play reaches. Both apply whether or not the relabelled matchUp's own winner has
   played on since. Where the carried exit had converged with another, only this origin's entry is
   withdrawn and the matchUp re-derives to the kept exit (its carrier directed on, or — a produced
   exit — won by the relabelled loser, who goes on; a produced exit relayed past a BYE, with nobody in the
   seat it would be awarded to, stays pending, and the withdrawn side's reason code goes with its exit). Where
   the kept exit is awarded to the other side than the award that stood, the old winner's advancement is released
   with it (census S4, DOUBLE_ELIMINATION 20617910); a pending exit stays pending. A double exit re-derived to a single
   one keeps only its winner's position in the next round: its carrier, now the loser, is released from it (census S4,
   COMPASS 20586104, `doubleExitPropagateBye: false`); from a structure's last round that release crosses the link, as a
   winner's does (DOUBLE_ELIMINATION 20622028). A BYE matchUp left holding only the BYE-status entry a convergence
   recorded beside it is a plain BYE again. A loser who had won a produced exit on
   arrival has that award taken back when the origin becomes an exit again, so the exit converges as
   it would have at first entry (7.7.0; [exit propagation](./exit-propagation.md#a-relabel-out-of-a-convergence-and-back-into-one)).
3. **Round robin tally** is recomputed when the matchUp is in a group (`updateTallyIfNeeded`).
4. **Stale exit origins are reconciled** once removals, directions and propagation have all settled:
   a carried exit whose origin no longer describes an exit is corrected. The reconciliation is asked of
   the draw **as it stands at that point**, read afresh, never of a view of the draw taken earlier in the
   call: such a view describes the draw as the direction left it, before propagation wrote. Steps 4 and
   5 run only when the call was accepted (§ 6). Until 2026-10-11 the reconciliation read a deep copy
   carried in the call's context: what it wrote was lost, and the next call repaired the origin, a
   refused call included (census family F2).
5. **The draw is settled**: held exits are released (`settleHeldExits`), including to a participant
   who already passed the BYE holding them and carries no exit of their own (only an exit whose
   origin is still a double exit travels this way); the drawPosition opposite a lone BYE, a
   participant or an empty seat the structure placed there, goes on where its next matchUp has room
   (`reconcileByeAdvancements`; census A1, `theSeatLeftOppositeAByeGoesOn`); and a final that feeds a
   decider settles whether the decider is needed (`reconcileDeciders`) when a final's winner changed,
   or when the cascade moved a decider while the final's winner stayed put (7.8.0). A mutation OF the
   decider never triggers it, so a decider played anyway keeps its result; in a TEAM draw a line of the
   decider's dual is a mutation of the decider (7.8.0). See
   [Double Elimination](./draw-types/double-elimination.mdx#the-decider).
   **Last, no matchUp left without a result keeps its `scoredTime`** (`reconcileScoredTimes`). It is
   asked after every settle step, because they can take a result away: `settleHeldExits` turns an exit
   holder into a BYE, and the forward settle and the link passes release what was placed. Until
   2026-10-24 it was asked before them, so the stamp outlived the result until the next call, whatever
   that call was: 19 calls over the exitPropagation, drawDefinitions and matchUps suites ended that way
   (13 BYEs, 6 TO_BE_PLAYED), and none does now (`aResultTheSettleRemovesTakesItsScoredTime.test.ts`).
   A result is what § 4 counts as one, so a decider played and then made a DEAD_RUBBER loses its stamp,
   and a team rubber made a DEAD_RUBBER keeps it.
6. **Notifications** (MODIFY_MATCHUP and the draw's topics) are emitted; the factory extension's
   `timeStamp` is written by the engine after the call.

   **An entity's `updatedAt` is stamped once per call** (F2 (i), CA 2026-10-19): the call's captured instant, or the
   previous stamp + 1 ms when that is already as late, however many notices the call raises for it. An
   `executionQueue` is one call. Until 2026-10-24 v1 stamped at each notice, so one first-round score moved the draw's
   stamp on by 2 ms (`oneStampPerEntityPerCall.test.ts`). A state provider without the optional
   `getCapturedStamps`/`setCapturedStamps` hooks keeps no ledger and stamps at each notice, as before.

   **The touched entities** are the matchUps the call writes, the draw, the top-level structure holding each matchUp
   written (a round robin's container, the dual's structure for a line), and any structure whose position
   assignments change (a loser fed across a link). A matchUp notice stamped every top-level structure until
   2026-10-24, so a CURTIS main score stamped its Play Off. A matchUp that no top-level structure holds still stamps
   every structure.

### 5.1 Settlement dependencies (S6)

v2 owns a call only when no settle pass has work on the draw its ops leave (`settleWork.ts`, F5 (a)). Each row is a
pass at its `observePass` site, in v1's order, with what v2 asks. **Exact** is the pass's own detector run on the working
view; **scope** is true whenever the pass could have work. The last two columns are filled as S6 makes a pass plannable:
what must hold for the pass to write nothing, and what a write of it would invalidate for the passes after it.

| pass                               | v2 asks                                                                                    | writes nothing when (S6)                                                                                               | a write invalidates                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `settleExitOrigins`                | scope: a result on a matchUp that was a double exit, but the call's own; and stale origins | no matchUp but the call's was a double exit the ops change (`settleRederivedDoubleExits` skips the call's), none stale | every pass below: it re-derives and replays carries |
| `reconcileConsolationReservations` | exact: `findReservationWork`                                                               |                                                                                                                        |                                                     |
| `reconcileStaleExitOrigins`        | exact: `hasStaleExitOrigins`                                                               | a cleared double exit's produced exit is withdrawn with its origin, so nothing names it                                |                                                     |
| `reconcileCarriesPastByes`         | exact: `findOwedCarry`                                                                     |                                                                                                                        |                                                     |
| `settleHeldExits`                  | exact: `hasHeldExitWork`                                                                   |                                                                                                                        |                                                     |
| `reconcileByeAdvancements`         | exact: `findOwedByeAdvance`                                                                |                                                                                                                        |                                                     |
| `reconcileMissedLinkAdvancements`  | exact: `findMissedLinkAdvancements`                                                        |                                                                                                                        |                                                     |
| `reconcileProvenanceSides`         | exact: `findMisplacedProvenance`                                                           |                                                                                                                        |                                                     |
| `reconcileDeciders`                | exact for the trigger: a final's winner changes, or a decider moves                        |                                                                                                                        |                                                     |
| `settleForwardConsequences`        | exact: `hasForwardWork`                                                                    |                                                                                                                        |                                                     |
| `reconcileLinkAdvancements`        | exact: `getUnearnedLinkAdvancements`                                                       |                                                                                                                        |                                                     |
| `reconcileScoredTimes`             | exact: a `scoredTime` on a matchUp holding no result                                       |                                                                                                                        |                                                     |

A double exit or an exit carried across a loser link that the plan does not hold as ops puts every pass in reach.

## 6. Guarantees

- **A refusal changes nothing** (`ERROR_IMPLIES_NO_MUTATION`). The checks in § 2 run above every
  write; the two that used to run late (participants on a bare winner, feed eligibility) were moved
  up after each was measured leaving a destroyed previous result behind a refusal. **Nothing of § 5
  after propagation runs on a refused call**: no reconciliation, no settling, no `scoredTime`
  clean-up. A refusal must not repair, as a side effect, what an earlier call left; that repair is the
  next accepted call's to make (2026-10-11: the settle step ran after a refusal and was the refused
  call's only write in 55 of 92 census refusals after a write).
- **A settle step has no failure to report** (outcome v2 executor plan, Phase C prerequisite 2;
  CA, 2026-10-22: "The pipeline needs to work without rollback"). Steps 4 and 5 run after the cascade
  has written, so an error found there could not be refused without leaving those writes behind, and
  no caller rollback is relied on. A settle step's inner calls must therefore be unable to fail, and
  where one could, the failure is checked before the call's first write. Today:
  - `reconcileLinkAdvancements` cannot fail by construction. `releaseLinkedWinnerAdvancement` returns
    nothing or `releaseAdvancedDrawPosition`'s success and declares no `error`; the pass holds its
    result in a type that admits none, so a release that one day declares an error does not compile.
  - `reconcileScoredTimes` cannot fail by construction. Its notice's only error is a missing matchUp,
    which the pass's guard keeps from reaching it (`settlePassesCannotFail.test.ts`).
  - `reconcileMissedLinkAdvancements` **returns** the error of the direction it makes, and the call is
    refused on it (CA, 2026-10-24). `directWinner` can return one there: a target matchUp with no free slot
    (`ERR_EXISTING_POSITION_ASSIGNMENT`), or one from the advance it makes onward. It is known only once the
    cascade has written, and whether a placement will fail depends on `yieldSquattingPropagatedBye`, which
    can itself write before it decides, so no pure check can be asked for it in advance. It was dropped
    until 2026-10-24; it was never reached with an error over the suite and the frozen census windows
    (2026-10-22), nor over ~97,000 census schedules (settle telemetry, 2026-10-24). A refusal here is an
    error after a write, accepted because it is not reached; v2 plans it before its first write
    (`aSettlePassReportsWhatItCannotDo.test.ts`).
- **A settle loop that reaches its bound with work left refuses the call** with `SETTLE_BOUND_REACHED`,
  naming the loop (F9 (i), CA 2026-10-19 and 2026-10-24). The bounded loops are `propagateExitFrom`,
  `sendHeldExitsOn`, `produceStrandedConvergences`, `crossLinksThroughByes` and `reconcileLinkAdvancements`;
  their limits are `SETTLE_PASS_LIMITS`. Each asks once more whether work is left before refusing, so a draw
  needing exactly its limit is not refused. None was reached on ~97,000 census schedules; like the dropped
  error above, a refusal at a bound is an error after a write, accepted because it is not reached, and v2
  plans it before its first write (`aSettleLoopAtItsBoundRefuses.test.ts`). **The one exception is the
  forward settle** (`settleForwardConsequences`): it is a repair loop that a record missing many winner
  advancements reaches, so it keeps its success with a `FORWARD_SETTLE_EXHAUSTED` warning naming the matchUp
  still owed, and the next call settles the rest (CA, 2026-10-24).

  Measured 2026-10-22 over the suite and the frozen census windows w1, w2 and de: the release was reached
  4 times and the notice 3,922 times, never with an error.

  **What can no longer fail, and why** (2026-10-22, CA: an error found after a write is made impossible by
  construction where that can be shown, and is otherwise handed to v2 as a planned refusal):

  - **No `positionTargets` error after the first write.** Its only error is a malformed round link
    (§ 2 row 21), and row 21 now asks every WINNER and LOSER link in the draw, not only those the
    matchUp's targets and its downstream walk reach. Nothing that sets an outcome writes a link, so a
    draw that passes row 21 has none for the rest of the call. That closes the `positionTargets`
    refusals in `settleRederivedDoubleExits`, `reconcileStaleExitOrigins` (whose only error it was),
    `reconcileDecider`, `settleForwardConsequences`, `settleHeldExits`, `propagateUnfillableLoserBye`,
    and `swapWinnerLoser`'s `getDownstreamStructureIds` after its relabel. Measured on `dev` 01ce40e544
    before the change: a malformed link the walk did not reach was met by `settleHeldExits` after the
    score had been written in 57 cells of a scan over five draw types
    (`refusedBeforeTheFirstWrite.test.ts`).
  - **No `addNotes` error.** `notes` are validated before the first write (§ 2 row 23).
  - **No `MISSING_DRAW_POSITIONS` from `directParticipants`.** A matchUp with no `drawPositions`, given a
    winner on the route that reaches it, is refused before the score is written (§ 2 row 24).
  - **A TEAM dual writes nothing before its refusals.** Its auto-calc flag and its sides' lineUps were
    written by `handleTeamAutoCalc` above every refusal that followed (row 5's `AWAITING_RESULT`, row 6,
    row 16); they are now decided there and written once those refusals have been asked.

  **Handed to v2** (each is a cascade write whose failure depends on the draw as the cascade leaves it,
  so v1 cannot ask it before the first write; reached in the suite only by fault injection, and never
  with an error in the frozen census windows w1, w2 and de, default and `doubleExitPropagateBye: false`,
  2026-10-22): `propagateExitFrom` (`progressExitStatus`'s placements); the apply-stage refusals inside
  `setMatchUpState` after its first write (`noDownstreamDependencies`, `removeDoubleExit`,
  `attemptToSetWinningSide`'s `removeDirectedParticipants` and `directParticipants`, `attemptToModifyScore`'s
  `MISSING_ASSIGNMENTS` on a line of a dual under manual scoring, `updateTieMatchUpScore`,
  `relabelWithoutDirection`, `swapWinnerLoser`'s writes after its relabel); and in the settle steps,
  `settleRederivedDoubleExits` (its `propagateUnfillableLoserBye`, `directWinner` and carry),
  `oweDissolvedConvergencesTheirByes`, `reconcileConsolationReservations`, `reconcileCarriesPastByes`
  (both calls), `settleHeldExits`, `reconcileByeAdvancements`, `reconcileDeciders` and
  `settleForwardConsequences`. They still return their error; none is relied on to be rolled back.
  Every one of them reaches `v2.compare` before `setMatchUpStatus` returns it (outcome v2 executor plan,
  Phase C prerequisite 3), so under `differential` a refusal v2 did not plan is a divergence (§ 7.1:
  the comparison writes back what it captured before v1 ran; v2 itself plans every refusal before its
  first op, so it has nothing to undo). Until 2026-10-24 the refusals out of `settleDraw`,
  `settleForwardConsequences` and the carry asked after it returned without the comparison
  (`aLateRefusalIsCompared.test.ts`).

- **A refused call stores none of a draw's missing edges** (CA, 2026-10-18: "no, a refused call does
  not store a draw's missing edges. v1 should no longer do so."). A draw stored without
  `winnerMatchUpId` / `loserMatchUpId` (an older record, a file the factory did not produce) is given
  them once, before anything is decided, because the cascade decides on the stored ids. What that write
  touches (the edges, `finishingPositionRange`, `finishingRound`) is held before it and written back on
  any error the call returns: directly, inside `bulkMatchUpStatusUpdate` or `executionQueue`, with or
  without `rollbackOnError`, and on the async engine. A call that succeeds keeps them, and the draw
  stores its edges from then on. v2 refuses before the write is made. Pinned by
  `storedEdgesAreNotRequired.test.ts`. A successful call that repairs them announces the draw once,
  with one `MODIFY_DRAW_DEFINITION` and no `MODIFY_MATCHUP` for a matchUp whose only change is an
  edge (CA, 2026-10-18; `anEdgeRepairAnnouncesItsDraw.test.ts`).
- **What one step hands the next is the draw itself.** A context passed between steps carries
  references to the stored matchUps, never copies: the engine's deep-copy setting governs what is
  RETURNED to a caller, never what a mutation reads or writes.
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
  `MONOTONIC_DECISION`) are stated in the corpus vocabulary (`corpus/INVARIANTS.md`) and measured on
  the generated fixtures in the matrix and census. These are intended invariants, not a universal proof.
  On real records, see § 8 (real-record do/undo) and the clear that normalises in § 4.

## 7. Write mode

In NATIVE mode (the default since 5.0.0), schedule stamps such as `scoredTime` use first-class
`matchUp.schedule` attributes. LEGACY uses the corresponding timeItems; BRIDGE writes both via
`setFirstClassOrTimeItem`. Result, status and scoring codes remain first-class.

This storage mapping is not evidence that exit behavior is identical across modes. Provenance writes
are mode-gated and propagation decisions read provenance; a NATIVE census result must not be reported
as LEGACY/BRIDGE validation. Cross-mode compatibility requires its own fixtures and replay evidence.
See [harness measurement limits](../testing/exit-propagation-harness.md#measurement-limits).

## 7.1 Two implementations (S2)

`src/mutate/matchUps/outcome/` is the clean-room re-implementation of this page, written from it and
from the corpus. It works over a read-only view of the draw: `refuseOutcome(request, view)` is § 2
as one pure function, `chooseRoute` is § 3, `planWrite` is § 4 and `planDirection` is § 5's
direction and exit propagation. v1 is the pipeline as written across `setMatchUpState` and the
matchUpGovernor routes, and it is still the only one that writes.

The mode is process-wide, set with
[`engine.outcomePipeline(mode)`](../engines/engine-methods.md#outcomepipeline) and read with
[`engine.getOutcomePipeline()`](../engines/engine-methods.md#getoutcomepipeline); no argument
restores `v1`, and an unknown mode is `INVALID_VALUES`.

- **`v1`** (the default): nothing is built and nothing is decided by v2.
- **`v2`**: v2 decides the refusals. A refusal it raises is the call's result and v1 is not asked.
  An outcome it accepts is planned (§ 7.2); a call whose complete plan is a shape v2 owns is written
  by v2 (`outcome/apply.ts`: the plan's ops folded into the stored draw by the one reducer, then
  v1's own notices for what was written) and v1 is not asked; every other call is handed to v1
  whole, which routes and writes as under `v1`. Since S2 v2 owns the **local** write: the
  matchUp's own result (an in-progress, suspended or corrected live score, a format change with
  it, a cleared live score, or the same result submitted again, which changes nothing but stamps),
  with no winner before or after, no exit, nothing directed, no tally and no settle work. It leaves the record, the notices and the result v1 leaves for the same call
  (`ownedLocalWrites.test.ts`, under a fixed clock); an owned call takes no hydration, and its
  `updateInContextMatchUp` is built only for a subscriber, after the call has succeeded. Since S3
  v2 also owns the **first direction**: a result naming a winner, not an exit, whose winner goes
  into the next matchUp of the same structure (holding no exit or result) and whose loser, if
  a link takes them, arrives on a free seat carrying nothing, with no settle work after. A loser
  placed opposite a BYE goes on through it at once, as v1 sends them (`advanceIntoWinnerMatchUp`):
  their position joins the next matchUp of that structure, or occupies it there when it was advanced
  structurally while their seat stood empty, and that matchUp is announced. Only a clean next matchUp
  is planned (`TO_BE_PLAYED`, no BYE, exit, carry, provenance or result, no earlier advance of the
  BYE's position to replace, and no FIRST_MATCHUP reservation it would then raise). A winner whose
  next matchUp holds a BYE (a consolation seat a reservation filled) goes on past it the same way,
  under the same conditions. An ad hoc matchUp's winner directs nothing, and its structure's tally is
  planned when it holds one round (a Swiss's later rounds stay v1's). A result in a lucky draw's
  pre-feed round (a round of odd size) directs nothing either: v1 advances no one from it, the
  advancement being chosen afterwards (`luckyDrawAdvancement`). An FMLC loser fed into the
  consolation's round 2 is included (the seat `positionTargets` reports is the one `directLoser`
  takes). A loser that feed keeps out (they have won before) is
  owned too: their seat takes a propagated BYE and its matchUp becomes a BYE, as `directLoser` places
  it, or nothing is written when a reservation made the seat a BYE already; a BYE that would meet
  somebody in the other seat stays v1's. A seeded loser stays v1's: v1 carries the seed into the
  structure they are placed in (`propagateLoserSeed`), which is not yet an op. It writes
  v1's notices for it (the next matchUp's `modifyMatchUp` named `assignMatchUpDrawPosition`, a
  `modifyPositionAssignments` for the structure the loser is placed in) and returns v1's direction
  `context` (`ownedDirectionWrites.test.ts`). Under `v2` the mutations suite has about 10,000 calls
  v2 writes as a direction. A **final** is owned the same way: a winner with no next matchUp and no
  winner link out of the structure (a qualifying final places its winner in the main draw, and stays
  v1's), whose loser, if a link takes them, arrives as a plain placement. A **`FIRST_MATCHUP`
  reservation** the winner's arrival makes is owned with it: when the next matchUp then holds two
  positions, no BYE and no result, and every first-round matchUp feeding it has a scored win (this
  call's among them), its loser will have won and may not enter the consolation, so the seat the
  link feeds is a BYE (marked `byeFromPropagation`) and its matchUp a BYE, as v1's
  `propagateConsolationBye` writes them, with v1's notices (`modifyPositionAssignments` for the
  consolation, its matchUp's `modifyMatchUp` named `setMatchUpStatusBye`). A seat already a BYE needs
  nothing. A reservation that would meet somebody (the consolation matchUp's other seat held, or
  this call's own loser placed in it), a seat holding a participant or provenance, a stale
  reservation to withdraw, and a BYE-only target beside a playoff link stay v1's. The first
  **corrections** are owned too (S4). A new played score beneath an active downstream that keeps its
  winner (`apply-values`) writes the matchUp's values and re-directs nothing. A decided result
  cleared while its downstream is untouched (`remove-directed`), where all it directed is the
  winner's position in a clean next matchUp of the same structure, takes the position back out, with
  that matchUp's score; a loser the result placed across a link is taken back out with it when they
  still hold the seat the link fed, in a matchUp they have not played (no result, exit, provenance or
  BYE beside them): the seat is emptied and their seed entry there goes, and, when the call names a
  status, the matchUp's codes are re-derived from its provenance, as v1's `removeDirectedLoser`
  writes them (`[]` where it stored none, which announces the matchUp). A `FIRST_MATCHUP` link, whose
  removal may take a BYE back, stays v1's. So does a winner cleared in a structure that feeds its
  playoffs by finishing position (`WIN_RATIO`): v1 answers it with the playoff structures it reaches
  (`connectedStructures`, from `checkConnectedStructures`), a read of the whole structure. The same
  winner entered again while nothing downstream is active (the
  `winner` route) is directed once more by v1, whose placements find the winner and the loser where
  the first entry put them; v2 writes the matchUp's own result and places nobody. That is planned
  when the stored result is a played `COMPLETED` one, the winner stands in a clean next matchUp of
  the same structure (or the matchUp is a final), and the loser, if a link takes them, holds the seat
  it feeds in a matchUp with no result or exit. A draw holding `FIRST_MATCHUP` links is not itself a
  reason to abstain, for the re-entry or a clear: a reservation the call would leave standing, or one to
  withdraw, is the consolation reservation pass's work, and its has-work predicate abstains the call
  (`settle`); a BYE-only target beside a playoff link, whose BYE v1 takes back with the removal, stays
  v1's.
  A **changed winner** while nothing downstream is active (the `winner` route, the other side) is v1's
  removal and then a first direction (`removeDirectedParticipants`, then `directParticipants`), and is owned
  where both halves are clean: what the old result directed is taken back as a clear would take it, and the
  new winner goes into the same next matchUp (one write: the old winner's position out, with that matchUp's
  score, and the new one in), and the new loser onto the seat the old one leaves, carrying nothing and not
  seeded. The old loser's matchUp is announced first, as v1 announces it, then the result and the
  placements. A loser's matchUp has its codes re-derived only when the call names a status, as v1's
  `removeDirectedLoser` re-derives them (its `sourceMatchUpStatus`), for a clear and a changed winner alike.
  A **swap** (`allowChangePropagation` with the other side winning) is a relabel, v1's
  `swapWinnerLoser`: in the source structure the two positions are exchanged in every later round
  that holds either (each announced as `swapWinnerLoser`, before the score), a decided matchUp's
  winner carried across the re-sort, and nothing is placed or removed. It is owned when the result is a
  played one before and after, and no matchUp on the path holds an exit or exit provenance. Downstream,
  in each structure downstream of the matchUp (its structure's links from its round on, then every
  link out of each structure reached, as v1's `getDownstreamStructureIds` walks them), the two
  participants' seats change identity (`relabelPosition`), every result there kept; a structure
  upstream (a consolation's Main, COMPASS's East beside West) is not touched. Owned when no link
  walked carries a condition, but the source structure's own `FIRST_MATCHUP` feeds, and those only
  where the flip leaves every feed's eligibility as it was (the new loser of the flipped matchUp may
  enter exactly when the old one held the fed seat, and no later loss on the path changes, v1's
  `relabelledPathFeedChanges`), so v1's `reconcileFedLoserEligibility` writes nothing; and no loser link feeds the
  structure from a downstream one (an origin, whose re-entries v1 exchanges by origin positions); a
  winner link back into it (`DOUBLE_ELIMINATION`'s Backdraw champion re-entering the Main final on
  their own position) is covered by the path.
  The first **exits** are owned too (S5). A single `WALKOVER`, `DEFAULTED` or `RETIRED` entered with a
  winner on a matchUp holding no result, whose loser carries nothing on, is directed by v1 as a played
  result (`directParticipants`), so v2 plans it as a first direction with the exit's status, score and
  codes on the matchUp. Nothing is carried when `propagateExitStatus` is off, or on with no loser link,
  or for a retirement the policy does not propagate (`propagateRetirementAsExit`): `directLoser` then
  places the loser plainly and sets nothing for `propagateExitFrom`, and an arrival records no
  provenance in a target outside the exit cascade (`assignMatchUpDrawPosition`'s
  `participatesInExitCascade` gate). The settle passes are asked as they are for a played result; only an
  exit v1 propagates (a double exit, or a single exit carried across a loser link) still puts every pass
  in reach, unless the plan holds the carry as ops (below). A `DEFAULTED` under a scoring policy naming `processCodes.incompleteAssignmentsOnDefault`
  stays v1's: v1 may write those codes onto the matchUp (`modifyMatchUpScore`), which is not an op. A
  **carried exit** is owned one level deep: a `WALKOVER` or `DEFAULTED` (or a retirement under
  `propagateRetirementAsExit`, carried as a `WALKOVER`) that follows its loser across the link onto a free
  seat with nobody and no BYE opposite, in a matchUp holding no result, exit, codes or provenance, which
  does not link its own loser on. v1's `progressExitStatus` takes RULE 2 there: the loser's matchUp is
  written the carried status, awarded to the side nobody has reached, its codes `[]` and a `WALKOVER`'s
  score blanked, and the carrier's side given the carried entry (`mergeSideExitProvenance`); nobody
  advances from the empty side. Where a participant stands opposite (RULE 3) they are awarded the exit and
  go on: their position joins the next matchUp of that structure, planned only where it is `TO_BE_PLAYED`
  with no result, BYE or provenance and a seat to take, and announced as v1's `directWinner` announces it.
  Where a BYE stands opposite (RULE 1) the carrier passes it into the next matchUp of that structure,
  planned only where that matchUp is clean (as a plain loser's pass through a BYE is) and holds no codes or
  provenance: the BYE matchUp stays a BYE and records the carry beside its BYE on the carrier's side,
  announced by itself (`progressExitStatus`), and the exit lands beyond it by RULE 2 or 3.
  Where what lies beyond that BYE is no clean matchUp (S6 tail, the BYE passage), v1 re-propagates the exit onto the
  nearest later matchUp of the structure holding the carrier (`findAdvancementMatchUp`), RULE 1 again wherever that is
  a BYE-held matchUp: each BYE matchUp passed records the carry beside its BYE on the carrier's side, announced by
  itself, the source and status those of the matchUp the carrier lost, until the passage reaches a clean matchUp, where
  the exit lands by RULE 2 or 3 as above, or the structure's last round, where there is nowhere further and the carry
  stops (nothing more is written). Planned where every BYE-held matchUp passed already holds the carrier's position
  (advanced structurally while their seat was empty) opposite a BYE, and the passage ends in the
  last round or in a clean matchUp; a BYE whose winner crosses a link (DOUBLE_ELIMINATION's Backdraw final) is v1's,
  and a TEAM dual's passage is v1's (v1 ensures the dual's sides on each BYE matchUp it passes).
  It is announced as a score write, its in-context matchUp to a subscriber
  included, and the call's result carries no propagation context. A matchUp that links its loser on
  (COMPASS, OLYMPIC, PLAYOFF) makes the carrier, its loser, carry the exit again (`propagateExitFrom`'s loop):
  v2 plans the loop level by level from the draw as the call found it, each level's seat and matchUp clean as
  the first must be (no link condition; a BYE opposite passed by RULE 1 into the clean matchUp beyond it, which records
  the carry beside its BYE as at the first level), the carrier placed and the exit written with the
  landing they lost as its origin, a level's BYE passage planned as the first level's. The walk is bounded by v1's own
  `SETTLE_PASS_LIMITS.exitLevels`, counted as v1's loop counts it: one iteration for each landing written and one for
  each BYE passed; a chain that reaches it is v1's, which refuses there (`SETTLE_BOUND_REACHED`, F9 (i)), so v2 never
  plans the bound. A **double exit** in a round robin group sends nobody on (`doubleExitAdvancement`
  returns at once in a container): its result and the group's tally are planned, and the settle passes are asked as
  for a played result. A **double exit** elsewhere is owned where its produced exit lands pending: entered on a matchUp holding no
  result, in a structure it links nothing out of, it produces a `WALKOVER` (or a `DEFAULTED` from a
  `DOUBLE_DEFAULT`) in the next matchUp on the side it feeds, written with no winner, its codes `[]`, a
  `WALKOVER`'s score blanked and the fed side given its origin (`buildSideExitProvenance`, v1's builder).
  Planned where that next matchUp is to be played with no result, BYE, exit, codes or provenance, links no
  loser on (a seat nobody can fill takes a BYE, `propagateUnfillableLoserBye`), nobody stands on the side it
  would be awarded to, and the matchUp beside this one is still to be played. Where the winner of the matchUp
  beside this one already stands there (a played result or a single exit that delivered them), the produced exit
  is theirs at once: written with their side as winner, their origin recorded beside this one's, and they go on
  into a clean next matchUp, announced, as v1's `doubleExitAdvancement` announces it, with no event or
  tournament (`announcesContext: false`). In a feed round (as many matchUps as the round before it, a position
  fed from another structure on side 1) the double exit feeds side 2, and where the fed seat holds a position nobody
  has reached yet the produced exit stands pending for whoever arrives there while v1 advances that empty position
  into the next matchUp ahead of them (a reservation), announced the same way; a fed seat already filled stays v1's. A **convergence** (RULE 4) is owned
  where a carried exit lands on the seat a carried exit standing there was awarded to: the matchUp becomes
  the double exit (`collapseDoubleExitStatus`: two defaults a `DOUBLE_DEFAULT`, anything else a
  `DOUBLE_WALKOVER`, whose score is blanked), its award taken away and the arriving side's entry merged beside
  the standing one; then that double exit produces onward as one entered there would, pending, with the
  reservation beside a fed seat. Planned where the landing holds that single exit and no score value, links no
  loser on, and the produced exit lands clean. The same rule holds at every level of the carry's walk, not only the
  first (S6 tail): a carrier crossing a deeper loser link onto a seat a carried exit standing there was awarded to meets
  it there, written as above with the landing they lost as the arriving entry's origin, and the walk ends (a double
  exit has no loser to carry on). In a structure's last round the double exit produces nothing
  (`doubleExitAdvancement` finds no winner target). Its codes are v1's projection of the landing's provenance before
  the arrival (`deriveStatusCodes`): a side whose standing exit a double exit delivered shows its outcome code. Stays
  v1's: a landing whose award's position has already gone on into the matchUp it would produce into (v1 takes it back
  out as the convergence unseats it). A landing that links its own loser on (S6 tail) is owned where the double exit's
  BYEs plan as the BYE walk places them (below): from the landing's own loser seat and from the seat its produced exit
  leaves unfillable, at the first level or a deeper one. A carrier standing on a seat that BYE takes is displaced with
  their carry (`withdrawDisplacedCarry`): the seat's carried entry withdrawn, and a BYE origin opposite it, the matchUp
  they had landed in made a BYE and its `scoredTime` taken by `reconcileScoredTimes`, which announces it after every other
  write; where that matchUp links its loser on, the BYE it becomes sends a BYE on and the carry they took further is
  displaced the same way. Planned where the displaced carrier's landing holds their carry alone (a single exit awarded to
  the empty side opposite, no score or codes); any other occupant of such a seat is v1's. A double exit whose produced exit meets a pending one a double exit beside it
  produced there **converges** with it: the matchUp becomes the double exit (`collapseDoubleExitStatus`), with no
  winner, codes `[]`, a `DOUBLE_WALKOVER`'s score blanked and the arriving side's origin beside the standing one, and it
  produces on as one entered there would (`advanceConvergedWinner`); planned with nobody there and the exit produced onward landing clean (or none, from a final). With loser links (under
  `doubleExitPropagateBye`; off, the landing's BYE gives way to a produced exit, `serveConvergedLoserLink`: v1's), this
  matchUp's own loser seat takes its BYE first, with all it sends on; the landing's loser seat, a BYE since the first exit
  was produced there, is left as it is; and the onward matchUp's loser seat, which its produced exit leaves unfillable,
  takes a BYE with its chain before that exit is written. A **double exit with loser links** is owned where its produced exit lands pending,
  or is awarded at once to the winner of the matchUp beside it, who goes on as above: nobody
  loses the double exit, so the seat its link feeds takes a propagated BYE and that matchUp a BYE, and the position
  opposite (empty, or the participant standing there) is advanced through it into the next matchUp (`advanceWinner`,
  announced with no event, the matchUp it joins written with no score); nobody
  will lose the produced exit's matchUp either, so the seat ITS link feeds takes a BYE too, announced with no event
  (`propagateUnfillableLoserBye`), its structure's assignments announced with no event unless another placement there
  named one (the notice buffer keeps an earlier event, `preserveNoticeIdentity`). Each BYE goes on as v1's
  `assignDrawPositionBye` sends it: the position opposite it goes on into the next matchUp where there is one, and, a
  BYE matchUp's loser being the BYE, a matchUp that links its loser on puts a BYE on that seat too, with no event, level
  by level (COMPASS, OLYMPIC, CURTIS), the structures' assignments announced deepest first. A BYE opposite the double exit's own seat (the paired feeder a BYE)
  makes a double BYE: that matchUp, a BYE already, is left as it stands; the seat's position already stands a round on
  (the BYE opposite advanced it), so the matchUp there becomes a BYE, announced with its event, and the one other position
  it holds (a fed seat nobody has reached) goes on into a clean matchUp, as the winner standing in the produced exit's
  matchUp, delivered by that BYE, is awarded the exit with the BYE recorded as their origin; where it holds no other
  position (its other feeder still to be played) it becomes a BYE and nothing goes on yet. A double BYE in a final goes
  nowhere: v1 writes that matchUp, a BYE already, as a BYE again (announced with no event at a deeper level). Where the
  next matchUp is a BYE the position had passed through (a BYE opposite it, a feed round's fed BYE included: S6 tail),
  the double BYE goes on from there as from the first (S6). A matchUp the double BYE makes a BYE in its structure's last
  round sends the position beside it nowhere (S6 tail). Each level is a first-round
  seat, free behind no condition, in a clean matchUp: alone, or opposite a BYE, a double BYE there too, planned as the
  first one is but announced with no event (S6), the walk bounded by `SETTLE_PASS_LIMITS.exitLevels` (F9). A level whose
  seat holds a BYE already takes nothing, and the chain ends there (S6 tail). Under `doubleExitPropagateBye: false`
  the loser seat shows the produced exit instead: the loser matchUp is written the double exit's flavour awarded to the
  side opposite the seat, its codes `[]`, a `WALKOVER`'s score blanked and the seat's side given the
  origin (`conditionallyAdvanceDrawPosition`), with no `scoredTime`; its structure is stamped, and the position
  opposite is advanced into the next matchUp, announced with no event or tournament: a participant standing there goes
  on, an empty position goes ahead of the arrival it awaits. Planned in a first round that is not fed, no BYE opposite
  the seat. A loser matchUp that links its own loser on (COMPASS, OLYMPIC) leaves that seat to nobody: before the exit
  is written there, the seat takes a BYE with no event, with all it sends on, as the BYEs below go on. Where a BYE
  stands opposite the seat (its matchUp a BYE already), v1 records the exit on the BYE matchUp, on the seat's side, its
  score removed, and carries it on into the matchUp the seat's position already stands in, where it lands pending with
  its origin on that side (`stampExitOnByeHeldLoserTarget`, `carryExitOnward`); both written with neither the tournament
  nor the event (`setMatchUpResult.announcesContext: false`), planned where nobody stands on the other side there and its
  feeder is still to be played. Otherwise outside a feed round, for links with no condition, free seats with no BYE beside them (a BYE there makes a
  double BYE, below), clean matchUps, and each matchUp touched once, but where the unfillable seat's matchUp is the one the first BYE
  advanced a position into (FIRST_MATCH_LOSER_CONSOLATION): that position goes on again through the second BYE; a
  participant standing opposite the unfillable seat goes on through its BYE the same way (S6). Where the own seat's double BYE
  has made the unfillable seat's matchUp a BYE, the position opposite gone on (FIRST_MATCH_LOSER_CONSOLATION), the
  unfillable seat makes a double BYE there too: the matchUp stands, and the one its position went on into becomes a
  BYE, announced with no event (S6). A BYE already standing opposite the unfillable seat (another double exit's, or the
  draw's) makes a double BYE there the same way; and where the own seat's BYE sent its position on through a BYE standing
  in the next matchUp, the unfillable seat's BYE sends its own position into the matchUp beyond as that chain leaves it,
  the two meeting there (S6 tail, FEED_IN_CHAMPIONSHIP and its kin).
  Where those shapes do not plan, the seats are placed by **the BYE walk** (S6 tail): v1's `assignDrawPositionBye`
  recursion, run on a copy of the draw as the call found it. A seat given a BYE makes the furthest matchUp of its
  structure holding its position a BYE (`setMatchUpStatusBYE`); the position beside it there goes on into the next
  matchUp of the structure (`advanceDrawPosition` → `advanceWinner`), and beside a BYE there it goes on again; a BYE
  matchUp whose other side is a BYE sends a BYE to the seat its loser link feeds in another structure's first round;
  and a BYE matchUp past its position's first round holding no other position sends its BYE to its loser seat
  (`assignByeToLoserTarget`). The own seat is walked first, with the event named; the seat the produced exit leaves
  unfillable is walked on the draw the first walk leaves, with no event; a placement reached through an advance names no
  event (v1's recursion drops it there), one reached through a loser target names its caller's. The structures'
  assignments are announced deepest first, the matchUps in the order written. The walk is planned where every matchUp it
  writes holds no result, score, codes or provenance, no participant is displaced, no seat it reaches is fed or behind a
  link condition (the unfillable seat behind `FIRST_MATCHUP` excepted), no winner link is crossed, and no advance turns a
  matchUp to be played into a BYE. It serves the convergence's own seat the same way. A BYE's position sent on
  into a next matchUp that is a BYE already, its other side the BYE alone, goes into it and on through it into a clean
  matchUp beyond (S6), each announced as `advanceWinner` with no event. The
  unfillable seat takes its BYE behind a `FIRST_MATCHUP` link too, as v1 places it (`advanceByeToLoserMatchUp` asks no
  condition); this matchUp's own `FIRST_MATCHUP` feed stays v1's. v1 writes it through
  `modifyMatchUpScore`, not `setMatchUpState`, so it takes no `scoredTime`. Stay v1's: a double exit with a loser link beside a BYE or into a feed round; a carry past a BYE into anything but a clean matchUp or a BYE passage (above); a
  present opponent, for a carried or a produced exit, with nowhere clean to go on to; a convergence but RULE 4's clean one; a
  correction to or from an exit (but the clean clear below); and an exit whose target holds a BYE, an exit or a result
  (`exit`, `cascade`).

  The first **unwind** is owned too (S6). A **double exit cleared** (the `clear-score` route) is v1's `removeDoubleExit`
  and then the clear's own write. It is owned where all the double exit sent on is its produced exit, still pending, in
  a structure whose only links out are loser links with no condition: the next matchUp holds that exit alone (no winner,
  positions, score or codes, and this matchUp's origin, on the side it fed, as its only provenance), and every matchUp
  beyond it on the winner's path to the final is to be played with no positions, result, codes or provenance. v1 walks
  that whole path, not just the produced exit (`conditionallyRemoveDrawPosition` → `removeDoubleExit`, level by level),
  and writes each matchUp back to be played: codes `[]`, its score blanked, through `modifyMatchUpScore` (no
  `scoredTime` rule), and the produced exit's origin withdrawn (`setSideExitProvenance`). Past the produced exit's
  matchUp v1's walk passes on neither the tournament nor the event, so those writes are announced without them
  (`announcesContext: false`). At each level it also visits the seat the loser link feeds (`removeDirectedBye`, under
  `doubleExitPropagateBye`). The two seats the double exit gave BYEs (its own loser seat and the one its produced exit
  left unfillable) have them withdrawn (`withdrawBye`). Each BYE's matchUp is to be played again (`clearMatchUpBye`), and
  a position the BYE sent on is taken back out of the next matchUp. These are announced as v1's `clearDrawPosition`
  announces them, `removeDrawPosition-<the BYE's position>`, with neither event nor tournament. A seat further on holds
  nothing yet, and the visit only announces and stamps its structure (CURTIS's Play Off). The order is v1's recursion:
  deepest first, each level's seat before its matchUp, the call's own seat last, and the clear's own write after all of
  it. Where the produced exit had been **awarded** at once to the winner of the matchUp beside this one, who went on
  into the next matchUp and stands there alone, the unwind takes the award back: the produced exit's matchUp is to be
  played with its winner removed and all its provenance gone (the awardee's arrival entry with this origin), and the
  awardee's position comes back out of the next matchUp as v1's walk writes that matchUp back to be played; the awardee
  stays where they arrived. A **WINNER link out of the structure** (DOUBLE_ELIMINATION's Main to its Decider) does not
  change the unwind: v1's walk crosses it from the final, takes back a participant the final had sent across (nobody,
  the final being undecided) and writes the matchUp there back to be played as it writes the path, its structural
  positions standing, with neither event nor tournament; and the final's loser seat in that structure is visited (its
  assignments announced with no event) (S6 tail). A BYE the double exit placed behind a **`FIRST_MATCHUP`** link (the
  seat its produced exit left unfillable, `advanceByeToLoserMatchUp` asking no condition) is withdrawn as any BYE it
  placed; a seat further on behind one may hold a standing reservation and stays v1's. The next matchUp a withdrawn
  BYE's opposite position stands in is read as the deeper withdrawal leaves it (v1 withdraws the produced exit's BYE
  before the double exit's own, and the two meet in FIRST_MATCH_LOSER_CONSOLATION's second consolation round); where
  the position taken back out leaves that matchUp with no position, v1 **releases** it (`releaseAdvancedDrawPosition`,
  with neither event nor tournament) rather than clearing it: FIRST_ROUND_LOSER_CONSOLATION, and the matchUp a double
  BYE had sent its position on into two rounds on (S6 tail). Stay v1's: a cleared double exit in a feed round; behind
  a loser link with any other condition; whose produced exit was awarded to a winner who has gone further or does not
  stand alone; whose BYE went on across a further loser link (COMPASS, OLYMPIC); whose
  a final that has sent its winner across its link; or with anything played beyond it.

  A produced exit that **converged** with the paired matchUp's (two adjacent double exits in one round: the next
  matchUp a double exit by convergence, two origins, nobody there, producing on in turn) is dissolved as v1 dissolves
  it (S6 tail): the converged matchUp is not written back to be played but **re-derived** to the kept origin's pending
  exit (`getUnwoundState` under `pairedPreviousDoubleExit`: the status its retained provenance derives, a mixed pair
  keeping the other's label; no winner; the score kept; codes re-derived, none kept), and what it produced onward is
  taken back as any produced exit's is, the next matchUp reset where that origin was its only one and re-derived in
  turn where another stands beside it, to the first matchUp reset or a final re-derived (`convergedChain`); the path
  beyond is the plain unwind's. Each re-derived matchUp is written on the unwind (the first level's with the call's
  event and tournament, a deeper one's without, as its in-context notice shows) and again, as it stands, after the
  call's own write, under `settleRederivedDoubleExit` (v1's settle pass), with the event and tournament at every depth:
  that later notice is its `modifyMatchUp`. Its loser seat keeps the BYE the convergence placed (its pending exit still
  sends nobody: v1 withdraws the claim and P39 claims it back, no notice); the BYE the reset matchUp's exit left
  unfillable is withdrawn as the produced exit's is in the plain unwind. The two paired double exits' own seats are
  adjacent, a **double BYE**: withdrawing the call's own, the other BYE's position is taken back out of the next
  matchUp, which is to be played again, and what that matchUp, a BYE until then, had sent on is released out of the
  matchUp beyond (`releaseAdvancedDrawPosition`, no event or tournament); then, after the call's own write, the standing
  BYE advances the freed seat into the next matchUp (`reconcileByeAdvancements`, announced `advanceWinner` with the
  event). Stay v1's: a next matchUp kept a BYE by another standing BYE, through which the advance goes on
  (FIRST_MATCH_LOSER_CONSOLATION); the convergence given a winner (the winner then lands beside the re-derived pending
  exit and is awarded it); and the dissolution under `doubleExitPropagateBye: false` (the consolation convergence of the
  two carries re-derived the same way).

  A produced exit **awarded to a participant who came through the paired matchUp's BYE** (the double exit beside the
  draw's BYE: the BYE matchUp's position arrives opposite the exit, wins it, and goes on; the produced exit records the
  BYE-origin pair opposite itself, `{ matchUpStatus: BYE, previousMatchUpStatus: BYE }` naming the BYE matchUp) is
  unwound as the awarded plain one: the awardee's position back out of the next round, the matchUp written back to be
  played holding them alone, both entries withdrawn (S6 tail). Its own loser seat stands beside the BYE matchUp's BYE
  loser, a double BYE whose own position the double BYE had sent on: withdrawing it, the next matchUp keeps that position
  as the freed seat it now is and is to be played again (`removeDrawPosition-<seat>`, no event or tournament), and what it
  had sent on as a BYE is released out of the matchUp beyond; no advance follows. The reset matchUp's unfillable BYE is
  withdrawn as in the plain unwind, its next matchUp read without the position the own seat's release takes out of it.
  Stay v1's: FIRST_MATCH_LOSER_CONSOLATION (the BYE matchUp's loser seat behind `FIRST_MATCHUP`), and the given winner.

  A **final's** double exit (or the one matchUp of a one-round structure) produced nothing: cleared or given a winner, its
  unwind is the own loser seat's withdrawal alone, where a link feeds one (FEED_IN_CHAMPIONSHIP's consolation final seat;
  under `doubleExitPropagateBye: false` the carry there, taken back as the branch), and the call's own write; given a
  winner, the loser lands on the freed seat as plainly (S6 tail). A final whose winner link leads on into another
  structure (DOUBLE_ELIMINATION's Decider, fed by both the final's links) stays v1's.

  A consolation double exit whose produced exit lands in a **feed round** (FEED_IN_CHAMPIONSHIP: the next matchUp holds
  the fed seat's structural position, which v1 reserves on into the round beyond) is unwound as the plain one once the
  exit stands pending beside that seat (S6 tail): the feed path is written back to be played with its structural fed
  positions standing, the reservation taken back out of the next round, the produced exit's origin withdrawn. On any
  path, the position the level before sent ahead (the awardee's, the reservation) comes back out of the matchUp holding
  it, and another position standing there (a feed round's own fed seat, an opponent arrived from the other half) stays,
  as v1 leaves it. Stay v1's: the exit awarded to the loser fed beside it, and the given winner.

  A **final's double exit entered** (or the one matchUp of a one-round structure) produces nothing (`doubleExitAdvancement`
  finds no winner target): the call's own write, and the own loser seat's BYE with its chain where a link feeds one
  (`doubleExitSeats` with no produced exit's matchUp), as v1's `handleLoserMatchUp` places it; the settle predicates
  read such a call as propagating nothing, as a group's (S6 tail). Stay v1's: a final whose winner link leads on
  (DOUBLE_ELIMINATION's Decider), and the final under `doubleExitPropagateBye: false` (the carry its loser seat takes).

  Under **`doubleExitPropagateBye: false`** the seat a level's loser link feeds shows no BYE: the double exit carries its
  exit there (awarded to whoever stands or arrives opposite), and a further level's seat holds nothing of this unwind's.
  v1 visits the matchUp holding the seat all the same (`conditionallyRemoveDrawPosition`, the loser branch of
  `removeDoubleExit`) and walks on from it as it walks the main path, over winner and loser links alike: the position
  its result sent on is taken back out of every later round holding it (`removeDirectedWinner`,
  `removeSubsequentRoundsParticipant`), its winner path is followed to its final and across the final's winner link, then
  the seat its own loser link feeds, and each matchUp reached is written back to be played, deepest first, the visited
  matchUp last. The first level's matchUp is written with the call's event and tournament (v1 passes its arguments
  on there), the rest without; the carried exit's origin is withdrawn with the first write. A matchUp the branch reaches
  twice (DOUBLE_ELIMINATION: the Backdraw's final sends its winner across to the Main final, which the main path has
  already written) is written twice, and its notices take their place from the last write, the in-context one from the
  last score write. The structures of the matchUps written are stamped, as v1's notice for each stamps them. Owned where
  the first level's matchUp holds the carried exit alone (its one origin, on the fed side; a winner opposite or none;
  scoreless) and every other matchUp reached holds nothing (to be played, or a BYE this unwind withdraws, with no winner,
  score, codes or provenance; structural positions and the position taken back stand), the position taken back going
  no further than the matchUps written. A double exit **given a winner** under the policy is owned the same way, the
  loser placed on their seat in the matchUp the branch wrote back. Stay v1's: a carry that met a BYE or another exit
  there (a convergence), a participant sent across a winner link, a BYE placed behind one of the branch's own loser links
  (the carry's award with nobody for a loser sends one on through the BYE chain beyond: COMPASS, OLYMPIC), and the
  produced exit awarded (S6 tail).

  A **single exit cleared** (a WALKOVER, DEFAULTED or RETIRED on the `remove-directed` route, back to be played) that
  carried nothing on is the removal of a played result: v1 takes it back through the same `removeDirectedParticipants`,
  with the same writes and notices (the winner's position out of the next matchUp, the loser out of the seat their link
  fed, codes `[]`, the score blanked), so it takes the removal's shape and its checks. Stay v1's: an exit carried across
  the loser link (provenance or a carried status in the target), a BYE gone through beside the loser, and side
  provenance on the matchUp itself.

  A **single exit corrected** on the `winner` route is owned the same way. A stored WALKOVER, DEFAULTED or RETIRED, or
  a played result, may be re-entered, relabelled (a WALKOVER as a DEFAULTED, an exit as a played result, or the
  reverse) or given to the other side, as long as neither the stored result nor the new one carries anything on. v1
  directs such an exit as it directs a played result, so the call takes S4's re-entered and changed-winner shapes. A
  status that changes is refreshed on the arrivals the first entry sent on (`refreshArrivals`), and an arrival records
  that status only beside a double exit's produced exit, where the target carries an exit and the call is v1's. Stay
  v1's: a loser the new exit carries across their link, a stored exit that carried (provenance or a carried status in a
  target), and a DEFAULTED under `incompleteAssignmentsOnDefault`.

  A **double exit given a winner** (the `winner` route, a single exit or a played result) is v1's unwind followed by a
  first direction: v1 takes back what the double exit sent on as its clear does (`removeDoubleExit`, the path to the
  final written back to be played), then writes the result and directs it as a played result, so the winner arrives in
  the next matchUp the unwind has just left to be played. It is owned where that unwind is the plain one: the produced
  exit pending (not awarded), and its seats as the clear's unwind takes them back. Beside loser links the unwind
  withdraws the BYEs the double exit placed (its own loser seat and the one its produced exit left unfillable), as the
  clear does, and the direction then places the loser on their own seat, where the BYE stood: a plain arrival, carrying
  nothing, unseeded, behind a link with no condition. The notices follow v1's buffer: each matchUp at its last emission,
  so the next matchUp comes after the call's own result, named for the winner's arrival (`assignMatchUpDrawPosition`),
  while the in-context notices keep the order of the last score write of each matchUp; each structure's assignments are
  announced once, where the call first touches them (the seat the unwind visits), with the event and tournament of the
  loser's placement there (CURTIS: the Play Off's visit first, then the consolation's). Stay v1's: a produced exit
  already awarded, a loser the new result would carry, a BYE that had gone on further than the next matchUp (FMLC's
  second round), and every seat shape the clear leaves to v1.

  A **double exit asked for again** (the `noop` route: the status it already holds, and no winner) is satisfied, not
  repeated: v1 writes, stamps and announces nothing, whatever score the call carries, and returns success
  (`attemptToSetMatchUpStatus`'s `alreadyInRequestedDoubleExit`). v2 plans it as no ops, whatever the double exit sent
  on (BYEs on loser seats, a produced exit awarded on).

  A **result turned into a double exit** (the `completed-to-double-exit` route: a played result, a WALKOVER or a
  DEFAULTED entered again as a DOUBLE_WALKOVER or DOUBLE_DEFAULT) is v1's `removeDirectedParticipants` followed by a
  fresh double exit: the winner's position comes out of the next matchUp and the loser out of the seat their link fed,
  then the double exit is written and produces as on a matchUp holding no result. v2 composes the two plans it already
  has. S4's removal is planned on the draw as the call found it; the removal and the matchUp left with no result are then
  folded into the working view (§ 3.2), which is read again as a view of its own on the call's one hydration
  (`RebuildView`: the structural index re-indexed where the ops touched it), and S5's double exit is planned there. The
  write is the route's: a DOUBLE_WALKOVER blanks the score, a DOUBLE_DEFAULT keeps it (CA, 2026-10-02). The next
  matchUp is announced at the produced exit's score write (`modifyMatchUpScore`, with its event), not as the removal;
  a loser's matchUp recoded and then given a BYE, at the BYE (`setMatchUpStatusBye`); and each in-context notice at the
  matchUp's first score write. Stay v1's: a result in a group (its tally), in a WIN_RATIO structure, or carrying side
  provenance or an exit; a removal S4 leaves to v1 (a FIRST_MATCHUP link, a winner gone on, a loser who has played on or
  carried their exit across the link); and a double exit S5 leaves to v1 on the draw the removal leaves.

  A **played result relabelled an exit its loser carries** (the same winner, under `propagateExitStatus`) directs
  nothing again: the winner already stands in the next matchUp and the loser on the seat their link fed. v1 carries the
  exit to the loser where they stand, as a fresh entry carries it: the loser's matchUp is written the carried status,
  awarded to the side opposite, with the carry's provenance (S5's `carriedOps`), and its structure is stamped by that
  matchUp's notice, though nobody is placed in it. Planned on a fresh carry's terms, the seat held by the loser rather
  than free (`relabelCarryReason`). Stay v1's: the other side given the exit (its new loser carrying it), an exit
  withdrawn by a relabel (F2), and a carry meeting an exit already there.

  The reverse, an **exit its loser carried relabelled a played result** for the same winner (F2), takes the carry back:
  v1 writes the result, and the loser's matchUp is to be played again, with no winner, its carry provenance gone, its
  score as it was and its `scoredTime` taken by the `reconcileScoredTimes` pass, under whose name it is announced
  (`announcedAs`; that pass announces no in-context matchUp). Planned where the carry is all that matchUp holds: this
  matchUp's provenance alone, nobody awarded it and gone on, and no loser link out of it (`withdrawnReason`). Stay v1's: a
  withdrawal the carry converged in (the matchUp re-derives to the exit kept), and a carry the loser took further.

  A **single exit relabelled where its winner already stands** (the `apply-values` route: the same winner, the
  winner's downstream active) is written as the route writes a played result (`applyMatchUpValues`: a WALKOVER's
  score blanked, `scoredTime` kept), and nothing is directed again. Under `propagateExitStatus`, with a loser link, the
  carry follows the label where the loser stands, as v1's `relabelWithoutDirection` settles it: a played result
  relabelled an exit carries it onto the loser's matchUp as a fresh carry lands (the opponent standing there awarded
  it and sent on, as above); an exit relabelled a played result takes the carry back (the loser's matchUp to be
  played, announced `reconcileScoredTimes`), and the opponent it had been awarded to comes back out of the matchUp
  they went on into (`releaseAdvancedDrawPosition`, with the event); one exit relabelled the other rewrites the carry
  where it stands (its status and the carrier's entry, the awardee re-announced where they stand); and the same exit
  entered again writes the matchUp alone, the carry as it was (on the `winner` route too). Planned where the loser's
  matchUp holds nothing, or this matchUp's carry alone (`loserMatchUpCarryHeld`: awarded to the side opposite the
  carrier, this matchUp's entry its only provenance, no loser link out of it, nothing played on from it) and the
  awardee stands in a clean next matchUp or nowhere yet. **A swap over an exit** (the other side winning, with
  `allowChangePropagation`) is the swap above with the exit's write, and the same carry rule on the seat the old loser
  held, relabelled to the new loser: a played result swapped to an exit carries it there, one exit swapped to the
  other rewrites the carry where it stands, the same exit swapped to the other side leaves it (the entry is the
  seat's), and with no propagation the relabel and the write alone. Stay v1's: a carry the awardee or the carrier has
  played on from, a carry that converged or was carried past, a loser kept out of a feed, a DEFAULTED under
  `incompleteAssignmentsOnDefault`, a swap away from a carried exit (its withdrawal from the seat the new loser takes),
  and a swap whose seat holds anything but this matchUp's own carry.

- **`differential`**: v2 plans the whole call before v1 runs, then checks v1's result against it,
  and a disagreement throws `OutcomePipelineDivergence` naming the matchUp and both answers. The
  plan covers the refusal, the route, the write on the matchUp, the winner's direction, the
  loser's destination (including the propagated BYE for a loser an FMLC feed keeps out), the exit
  a loser carries, the exit a double exit produces, two exits converging, the swap, a decider's
  settlement, TEAM auto-calc and the direction of a dual its lines decide, and an exit that meets a
  BYE (none may be left labelled an exit beside it). A refusal v1 raises at the apply stage, where
  v2 does not reach (`APPLY_STAGE_CODES`: an active, assigned or occupied drawPosition, `ERR_FORCED`, and the status and assignment checks a write makes), is recorded as
  deferred rather than a divergence; so is a step v2 does not yet plan, such as a relabel whose
  loser stands past a BYE, or an exit carried into a swap. `getDifferentialTally()` counts compared
  and deferred decisions by route.

`OUTCOME_PIPELINE=differential vitest run` is the gate. It runs in CI for pull requests into `master`
and on `master` itself — every checkpoint — and nowhere else, so a test added since the last checkpoint
has never run under it until then: run `OUTCOME_PIPELINE=differential TZ=UTC npx vitest run` locally
before opening one (a plain green suite predicts nothing about it). Since 7.9.0 the view reads a
BYE-holder occupant's carry where it was written, a round on, so a withdrawn BYE's convergence is
planned as v1 writes it; and the exit-beside-a-BYE invariant holds under either `doubleExitPropagateBye`
setting. An exit arriving at a BYE in its structure's last round meets the exit held beside the BYE that fed
it, and v2 plans the two converging, as v1's settle step converges them (census run-17 baseline, DOUBLE_ELIMINATION
8/5 under `doubleExitPropagateBye: false`).

**A carry past a BYE is recorded beside the BYE, in every round and in either entry order** (F2, census A1,
2026-10-17). A participant carrying their own walkover or default into a seat beside a BYE goes through it, and v1
writes their carry entry (the exit and the matchUp it came from) on the side of the BYE matchUp they passed, as well as
where they land. It does so whether the carrier was seated first and the BYE arrived after them, or the BYE stood there
first; before this, the BYE-first order wrote the entry only in a structure's last round, so the same results entered in
the two orders left two draws. v2 reads that entry on the BYE matchUp as an exit standing there, as it reads any carried
entry, and plans a convergence with it when an arriving exit meets it. A BYE matchUp written before this, BYE first
and outside the last round, holds only the BYE claim; for it v2 still reads the carry where the carrier landed, a round
on. One carry counts once: an entry where the carrier landed that names an origin the BYE matchUp already records is
not read a second time. An entry left beside a BYE whose carrier's seat has since gone to a BYE, because a correction
made the carrier's origin a double exit, is not a held exit, and the settle step does not send it on; only that double
exit's produced exit travels from there.

**What a divergence leaves behind: nothing.** An error changes nothing (2026-10-18; a refused call
stores none of a draw's missing edges either, § 6), and a divergence is an error raised after v1 has
written: v2 plans and never writes, v1 runs and writes, and only then does the comparison throw. So
before v1 runs, differential mode captures what the call can touch (the tournament record, the draw
and the event), the notice buffer and the mutation flag, and before the divergence leaves
`setMatchUpStatus` it writes them back into the same objects. The record is then exactly as it was
before the call, on every path:

- with or without `rollbackOnError`, directly or inside `executionQueue`, and on the async engine;
- the result is `{ error }` carrying the divergence message, and nothing is notified;
- the record is not stamped as modified (a state provider without the optional
  `setMutationStatus` has its flag cleared instead, as a rollback clears it);
- under `devContext` the divergence is rethrown, over the same unchanged record.

Pinned by `divergenceLeavesBehind.test.ts`. The capture is taken only in `differential` mode;
`v1` and `v2` take none. A divergence is still a failing signal, not a result to build on: the
suite's rethrowing provider fails the test, and the exit-propagation census records it as
`NO_EXCEPTION_ESCAPES`. Inside a `bulkMatchUpStatusUpdate`, the outcomes applied before the one
that diverged stay written unless the call asked for `rollbackOnError`, the same as for any refusal
a later outcome meets (§ 8).

**A TEAM line** is owned in two shapes (S7): a line's result that leaves its dual undecided, and one that decides it.
The line's result is any first result with a winner: scored, a winner alone (no score), or a single exit (WALKOVER,
DEFAULTED, RETIRED with its score), each counted for its winner in the dual's tally. A line's double exit
(DOUBLE_WALKOVER, DOUBLE_DEFAULT) is written as it stands (`only-score`): it counts for neither side, the dual is tallied
without it, and nothing is produced or carried (a line's targets are its dual's; v1's `doubleExitAdvancement` does not
run for it). v1 writes the line (as
any result: `modifyMatchUpScore`, its `scoredTime`), then `updateTieMatchUpScore` writes the dual:

1. it ensures the dual's side line-ups;
2. it copies the resolved tieFormat onto the dual;
3. it tallies the dual's score from its lines;
4. it derives the dual's status: COMPLETED with a winner, else IN_PROGRESS where `isActiveMatchUp` reads it active, else
   TO_BE_PLAYED.

v2 plans the line's write and the dual's (`setMatchUpResult` with `dualTally`, no `scoredTime`):

- the projected score and status;
- the sides `ensuredDualSides` gives (the rule `ensureSideLineUps` writes by, one function) and the copied tieFormat, each
  only where it changes the stored value. On a dual's first line both change, and the dual goes from TO_BE_PLAYED to
  IN_PROGRESS; a record that stored no tieFormat of its own takes it on the same way.

Both are announced as v1 announces them: each matchUp's `modifyMatchUp` and its in-context notice, the line's first. The
call returns the dual's write as `tieMatchUpResult`, as v1's `directParticipants` does. A line directs nothing of its
own: its targets are its dual's.

**A line played on a dual already decided** (the remaining lines of a COMPLETED dual) is written the same way: the line,
then the dual's tally, the dual staying COMPLETED and keeping its winner. Nothing is directed or carried again, since
the dual's winner does not change; the next dual is left as it is, played or not. A dual walked over with its lines
already at the value goal's edge is written the same way when a line takes it there (COMPLETED, its winner kept).

**A line that decides its dual** makes the dual's own call: v1's `directParticipants` writes the projected winner and
score onto the dual (COMPLETED) and directs the dual as any winner is directed. v2 plans that call as it plans any call,
from a view of the dual taken on the line's own index (no hydration): routed, written and directed by the same
functions a singles result is (`decidedDualCall`). Its write is the dual's tally (no status codes, no `scoredTime`, as
`updateTieMatchUpScore` writes it). Once the winner's position has joined the next dual, the winning team's line-up is
carried onto its side there (`setSideLineUp`, v1's `propagateLineUp`):

- the line-up the decided dual's winning side holds, without substitutions (`removeLineUpSubstitutions`, which regroups
  each player's assignments);
- on the side v1 reckons by roundPosition: a feed round's advancing team, or one advanced by position, is side 2.

The next dual is announced by `directWinner`, and the call's `tieMatchUpResult` carries the dual's winner. A final
carries nothing on.

Where a loser link sends the losing team on (a consolation, a compass direction), the loser is placed as any loser is,
and the losing team's line-up is carried onto its side of the dual it lands in (`setSideLineUp`, v1's
`propagateLoserLineUp`):

- the line-up the decided dual's losing side held before the line's write, every assignment kept (the winner's drops
  any that names no participant), without substitutions;
- on side `2 - (roundPosition % 2)` of a first-round dual, by the decided dual's roundPosition; on side 1 of a later
  round's.

That dual is announced by `directLoser`. A loser kept out of a first-match feed (a BYE takes the seat) carries nothing.
A loser seated opposite a BYE carries its line-up onto the BYE matchUp as above and goes on through it into the dual
beyond, whose side takes the team's line-up as the draw holds it (`setSideLineUp`, v1's `updateSideLineUp` at the
loser's assignment), on the side holding the loser's drawPosition, announced `updateSidLineUp` before the BYE matchUp's
`directLoser`. A team the draw holds no line-up for takes none there, as v1 writes it.

**A dual's own call given a winner** (scored or not, or a single exit) is written and directed as any winner is
(`directParticipants`): the result with its status codes and `scoredTime`, the winner placed in the next dual (announced
`assignMatchUpDrawPosition`). Before the result v1 writes the dual's sides (`ensureSideLineUps`): `setMatchUpResult`
carries them as `ensuredSides`, where they change, and the call returns no `tieMatchUpResult`. Nothing is carried from
the dual: its winner's next dual takes no line-up. Where a loser link places the losing team, its assignment writes the
team's line-up as the draw holds it on its side of each dual it reaches (`setSideLineUp`, `updateSideLineUp`, announced
`updateSidLineUp`): past a BYE the dual beyond first, then the BYE matchUp. The loser's own dual is announced with no
event (`assignTeamLineUp` hands `updateSideLineUp` none).

**A dual's own exit carried across its loser link** (`propagateExitStatus`) is written on the dual the losing team
reaches as any carried exit is, by that dual's own call (`setMatchUpState`), whose `ensureSideLineUps` first writes its
sides with the team arrived: the carried `setMatchUpResult` takes them as `ensuredSides`. That write comes after the
team's line-up is written there, so the dual is announced as the carried result is (`modifyMatchUpScore`, with its
event). Planned where both the reached dual's sides hold their drawPositions; a carry that goes on past the dual it
reaches (its own loser link, as COMPASS's West), through a BYE, or onto a DOUBLE_ELIMINATION losers' dual its arrival
half places (hydrated unnumbered, read numbered by v1 after the arrival) stays v1's.

**A dual's own double exit** (DOUBLE_WALKOVER or DOUBLE_DEFAULT, on a dual still to be played) is written and advanced
as any double exit is (`doubleExitAdvancement`): the exit it produces in the next dual, awarded to the side opposite or
waiting for it, and the BYEs on the seats its loser links feed. Its sides are written first, as for a winner
(`ensuredSides`). A double exit over a dual in progress stays v1's (§ 7.1's exit rules).

**A dual's own call on a dual already decided** (by its lines or by its own call) is planned as any decided matchUp's
is: its winner entered again stands where it stood, a changed winner is re-directed. Its sides are written first
(`ensuredSides`). A winner's assignment writes the team's line-up, as the draw holds it, on its side of the next dual
wherever that dual already sides its drawPosition (`assignTeamLineUp` → `updateSideLineUp`, a `setSideLineUp` announced
`updateSidLineUp` with no event): so a winner entered again replaces the line-up its deciding line carried there, and a
first entry writes none. A changed winner over a dual's own single exit stays v1's (`settle`).

**A line's result removed, or a line cleared** (`remove-directed`, `clear-score`), **or corrected** (`winner` over a
stored winner, either side), is written as a first result is: the line rewritten, then the dual's tally re-read from its remaining lines, where the dual's winner does not change (a dual
still undecided, or decided by its other lines) and the dual still holds a line's result. The line directs nothing, so
nothing is taken back from the next dual, and a correction is neither a re-entered nor a changed winner. v1 clears it through `removeDirectedParticipants`, which returns no
`tieMatchUpResult`, and neither does v2 (`dualTally.unreturned`).

**A dual's own call that disables or enables auto-calc** writes `disableAutoCalc` on the dual, or removes it, as v1's
`handleTeamAutoCalc` does (through `setFirstClassOrExtension`, a field of the dual's `setMatchUpResult`). Enabling also
takes the winner and score the dual's lines project (`generateTieMatchUpScore`), whatever winner the call names.

Stay v1's:

- a dual's own call that enables auto-calc whose lines project no winner, a dual's exit carried on past the dual it
  reaches, through a BYE or onto a losers' dual half placed, a call on a dual holding no winner that is neither to be
  played nor in progress (a double exit), and a dual's own double exit once a line is played;
- a decided dual whose losing side held no line-up: v1 carries nothing, and the sides the loser's assignment wrote
  (`updateSideLineUp`, from the draw's line-ups) stand;
- a removal or correction that un-decides its dual through the removal or correction route, a line played on a dual
  decided by its own exit (WALKOVER, DEFAULTED, RETIRED: the dual's exit taken back, `exitReason`), and a line that is
  itself an exit un-deciding its dual (`exitReason`);
- a removal that leaves the dual holding no line's result: `updateTieMatchUpScore` removes the dual's score, and its
  tieFormat where it equals the inherited one;
- auto-calc off;
- a REPORTED score source (v1 returns before any tally).

**A line that un-decides its dual** (S7, the `line-score` route: a decided dual whose lines, with this one in place,
project no winner) is planned as v1 writes it (`scoreModification`): the dual's direction taken back first
(`removeDirectedParticipants` through the line: the winner's position out of the next dual, announced first), then the
line, then the dual's tally. The dual's part is the dual's own removal, planned from a view of the dual whose request is
its projected score with no winner (`undecidedDualCall`, routed `remove-directed`, vetted as any removal), and it returns
no `tieMatchUpResult` (`dualTally.unreturned`).

**A dual in a round robin, and a line of one** (S7), take their group's tally, as v1's `updateTallyIfNeeded` writes it
from the dual's score write: the group's duals alone (`matchUpTypes: [TEAM]`), tallied under the one dual tally format
(`DUAL_TALLY_FORMAT`), with the dual's result in place. A line runs no tally of its own: its group is its dual's, read off
the dual, since a line is hydrated in the container with no group (hydration OPEN-14, which is not changed); the dual is
tallied with the line's result in place among its lines, its score as hydration reads it (`annotateScoreSets`: a
tiebreak-only set read 1-0). A line that decides its dual hands the dual's own plan the same group.

## 7.2 The plan as ops (S1)

v2 states a call's writes as **ops**, a closed vocabulary folded by one reducer (`outcome/ops.ts`) into a stored-shape
draw. The overlay, the `differential` shadow apply and, from S2, apply itself all use the same reducer, so what a plan
says and what lands are one thing. The reducer decides nothing and refuses nothing.

| op                        | what it writes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setMatchUpResult`        | the matchUp's status, winner, score (as the call gave it, or blanked), a new format, status codes, and `schedule.scoredTime` by v1's rule: captured the first time the matchUp is scored, kept on corrections, removed with the score; left as it is where v1 writes the result outside `setMatchUpState` (`stampsScoredTime: false`: a double exit's produced exit); a TEAM dual's own call first writes the sides `ensureSideLineUps` gives (`ensuredSides`), as does a dual's exit carried onto the dual its losing team reaches; a dual's own call that disables or enables auto-calc writes or removes `disableAutoCalc`; a TEAM line's write of its dual (`dualTally`) is returned as `tieMatchUpResult` but for a removal (`unreturned`)                                                                                                                                                                                                                                                                                                           |
| `setMatchUpDrawPositions` | the positions placed in a matchUp, as v1 stores them: numbers, ascending (a winner's position joining the next matchUp, or taken back out of it: `removedDrawPosition`, whose result goes with the participant, as `removeSubsequentRoundsParticipant` takes it; with `placedDrawPosition` too when one write replaces a changed winner; `advancesThroughBye` for a position a double exit's BYE sends on, announced as `advanceWinner` and written with no score, as `assignDrawPositionBye` writes it (with `announcesEvent` where the advance is `reconcileByeAdvancements`' settle write, which names the event: a seat an unwind freed beside a standing BYE, S6 tail); `releasedDrawPosition` for a position taken back out of the matchUp it was sent on into, announced as `releaseAdvancedDrawPosition`, the score left as it is: a participant awarded a carried exit when a relabel withdraws the carry (with the event), or the position a withdrawn BYE had advanced that now leaves the matchUp empty (`announcesContext: false`, S6 tail)) |
| `assignPosition`          | a participant on a structure's stored assignment for a drawPosition (a loser fed across a link)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `exchangeDrawPositions`   | a swap's relabel in a later round of its structure: the old winner's and the old loser's positions exchanged and sorted, a decided matchUp's winner carried across the re-sort with its score and side facts (v1's `exchangeMatchUpPositions`, the same function)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `relabelPosition`         | a swap's relabel downstream: a seat's occupant changes identity (the old winner's becomes the old loser's and the reverse), nothing else, announced and stamped by nothing, as v1's `swapWinnerLoser` writes it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `clearPosition`           | a structure's stored assignment for a drawPosition emptied, and the participant's seed entry there removed (a loser taken back out of the structure a link placed them in)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `setMatchUpStatusCodes`   | a matchUp's status codes, re-derived from its provenance (the matchUp a loser is taken back out of)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `mergeSideExitProvenance` | a side's exit provenance merged into what a matchUp carries, through v1's `mergeSideExitProvenance` (a carried exit's entry on the side its carrier arrived at)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `setSideExitProvenance`   | a matchUp's exit provenance replaced by what an unwind leaves, through v1's `setSideExitProvenance`: absent, the field is removed (a cleared double exit's produced exit, its origin withdrawn)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `withdrawBye`             | an unwind's `removeDirectedBye` at a seat: the stored assignment's BYE and its propagation marker removed, where one stands; the structure's assignments announced with neither event nor tournament either way                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `clearMatchUpBye`         | the matchUp a withdrawn BYE stood in, to be played again, announced as `removeDrawPosition-<drawPosition>` with neither event nor tournament                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `assignBye`               | a BYE on a structure's stored assignment for a drawPosition, marked `byeFromPropagation` (a `FIRST_MATCHUP` reservation; a double exit's loser seats, `announcesEvent: false` for one its produced exit leaves unfillable)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `setMatchUpBye`           | the reserved seat's matchUp a BYE, its score and winner removed (v1's `setMatchUpStatusBYE`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `setSideLineUp`           | a team's line-up on its side of the dual it is directed into, as v1 writes it (the winning team's by `propagateLineUp`, the losing team's by `propagateLoserLineUp` and, its draw line-up where its assignment lands, on the loser's dual and past a BYE the dual beyond, and a winner entered again on the next dual, by `updateSideLineUp`, each announced by its writer, the loser's own dual with no event where v1 names none): the dual's sides made, numbered 1 and 2 in order, keeping what each held, and the line-up set on this one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `setMatchUpSchedule`      | the matchUp's whole stored `schedule` after the call's schedule is written, as v1's `addMatchUpScheduleItems` leaves it on a copy of the matchUp (S7: a date, a time, a court, a venue or a court order; any other attribute, or a schedule v1 refuses, stays v1's), written before the result so `scoredTime` is stamped onto it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `setOrderOfFinish`        | a TEAM dual's line's place in its collection's finishing order (`orderOfFinish`), or its removal: planned for each line whose number a line's write changes, after that line's result and before the dual's, as v1's `modifyMatchUpScore` writes it. A line played to a result (COMPLETED, RETIRED, or DEFAULTED with a scored value) that had no number finishes after the others, never past the lines that can still count; a line that stops counting loses its number and the later lines move up; a score edit or a winner corrected keeps it (v1 takes a corrected result off with its number kept, `keepsFinishingOrder`); announced as `modifyMatchUpScore`                                                                                                                                                                                                                                                                                                                                                                                      |
| `setParticipantResults`   | a round robin group's, or a one-round ad hoc structure's, tallies on its position assignments, after the call (`writeAssignmentResults`, v1's own writer); for ad hoc the assignments are first rebuilt, one per participant its matchUps hold, as `updateTallyIfNeeded` rebuilds them; the tally stamps every top-level structure, as v1's does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `stampUpdatedAt`          | one `updatedAt` per touched entity per call (F2 (i)): the call's captured instant, or the previous stamp + 1 ms when that is already as late                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

`planOutcome` returns a complete plan only when every write the call makes is an op; otherwise it **abstains**, naming
the first reason, and the call is v1's whole (fail-closed). S1 holds two shapes: the **local** write (the matchUp's own
result, no winner before or after) and the **first direction** (a played result naming a winner where none stood, whose
only consequence is the winner's position in the next matchUp of the same structure). The reasons are the work list of
the slices that follow:

| reason         | the call                                                                                                                                                                 | taken on by                                                                                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `team`         | is a dual or one of its lines, but a line's first result leaving its dual undecided (S7)                                                                                 | S7                                                                                                                                                                                                                                                                       |
| `schedule`     | carries a schedule                                                                                                                                                       | a later slice (§ 3.5.8 of the executor plan)                                                                                                                                                                                                                             |
| `notes`        | carries notes                                                                                                                                                            | a later slice                                                                                                                                                                                                                                                            |
| `status-codes` | carries the client's positional status codes, split into side codes at the write                                                                                         | S2                                                                                                                                                                                                                                                                       |
| `exit`         | has an exit status before or after, other than a single exit entered with a winner on a clean matchUp that carries nothing on, or carries it one level onto a clean seat | S5; the clean clears of a double or single exit, the clean single-exit corrections, a clean double exit given a winner, a double exit asked for again, a clean result turned into a double exit, a same-winner relabel its loser carries, or whose carry it withdraws S6 |
| `winner`       | takes away or changes a winner already stored, so what it directed is taken back                                                                                         | S4                                                                                                                                                                                                                                                                       |
| `loser`        | has a loser link, so the loser goes somewhere                                                                                                                            | S3                                                                                                                                                                                                                                                                       |
| `link`         | sends its winner into another structure                                                                                                                                  | S3                                                                                                                                                                                                                                                                       |
| `cascade`      | sends its winner to a matchUp holding a BYE, an exit or a result, so the winner goes on or meets it                                                                      | S5                                                                                                                                                                                                                                                                       |
| `route`        | takes a route, or reaches a status, that S1 does not plan as ops                                                                                                         | S2                                                                                                                                                                                                                                                                       |
| `provenance`   | is on a matchUp holding side-exit provenance the score write may clear or rescue                                                                                         | S5                                                                                                                                                                                                                                                                       |
| `tallied`      | is in a round-robin, ad hoc or lucky structure, whose tally the write updates                                                                                            | S3                                                                                                                                                                                                                                                                       |
| `no-record`    | is on a draw the tournament record's events do not hold, so there is nothing to fold the plan into                                                                       | none: a shadow needs the record                                                                                                                                                                                                                                          |
| `edges`        | is on a draw that stores no winner and loser edges, which v1 writes first (`ensureGoesTo`)                                                                               | S2 (`setEdges`)                                                                                                                                                                                                                                                          |
| `clock`        | is made outside an engine call, with no captured instant, so the timestamps a write takes cannot be reproduced                                                           | none: production calls go through the engine                                                                                                                                                                                                                             |
| `settle`       | leaves a settle pass work on the working view (S2's has-work predicates, `settleWork.ts`), leftover state included                                                       | none: S2 owns only a call no pass has work for                                                                                                                                                                                                                           |
| `write-mode`   | is made in LEGACY or BRIDGE write mode, where v1 writes `scoredTime` as a timeItem, which the reducer does not                                                           | a later slice (F6: BRIDGE in with its evidence)                                                                                                                                                                                                                          |
| `competition`  | names a winner where a per-matchUp competition policy applies: v1 updates ratings on the result (`processCompetitionMatchUp`)                                            | a later slice                                                                                                                                                                                                                                                            |

**In `differential`**, a complete plan is folded into the record as it stood before v1 ran and compared with the record
v1 wrote, every `updatedAt` by value: v1 stamps each touched entity once per call, as v2 does (F2 (i), § 5 step 6).
Until 2026-10-24 stamps were normalised there (structures left out, the draw and matchUps by presence), because v1
stamped at each notice and every top-level structure on each.

**The working view** (`outcome/overlay.ts`; executor plan § 3.2) is the draw as a plan's ops will leave it, read
without writing the record: what S2's has-work predicates for the settle passes read, where v1 reads the draw it has
written. A matchUp or structure an op writes gets a stored-shape working copy, the ops are folded into the copies by
the same reducer as the shadow apply, and the matchUps an op wrote, with those whose sides read a reassigned
drawPosition, are derived again from the copies by indexing again the top-level structures that hold them (below),
a TEAM draw included since S7. Each replaces its entry in v2's copy of the view's draw.

**The view oracle** checks it in `differential`: after every complete plan, the working view, folded before v1 wrote,
is compared field by field (sides, status, winner, score, drawPositions, `finishingPositionRange`, `feedRound` and
`hasFedDrawPosition`, the edges and the exit records: what v2 reads) with one hydration of the shadow-applied record.
Until the view moved onto the index it also compared `schedule`, `drawPositionsRange`, `preFeedRound`, `roundFactor`
and `readyToScore`, which nothing in v2 reads; `schedule.scoredTime` is read from the stored matchUps. A difference is a
divergence keyed `view:<field>`. Measured 2026-10-24 over the exitPropagation and matchUps suites: 9,184 views
compared, none different; with re-derivation removed, 103 exitPropagation files fail. The oracle's own reads (the
shadow's hydration, a hydrated working view's projection, and the index oracle's hydration below) are test
instrumentation: `verify:hydrations` keeps them out of `differential`'s ceiling and reports them apart (2,184 over its
census, when TEAM working views were still projected). Under `v2`, a hydrated working view's projection is the
pipeline's own work and counts; since S7 a TEAM view is indexed, not hydrated.

**The structural index** (`buildStructuralIndex`, `src/query/matchUps/structuralIndex.ts`; executor plan § 3.1.1, CA
2026-10-24: v2 decides on stored data and a structural index, never on a hydration) is one entry per matchUp in the
hydrated shape, carrying only what the outcome logic reads. A probe of every read v2's view, planners and settle
predicates make found that set to be the stored matchUp, its structure and round-robin container, the round profile's
`feedRound` and `hasFedDrawPosition`, the inherited `matchUpType` and `matchUpFormat`, and its sides' `sideNumber`,
`drawPosition`, `participantId`, `bye` and `qualifier`. A side's `participant` is read only as a presence test, so the
index carries `{ participantId }` for a participant the tournament holds, as hydration carries the record. No participant
record, round name, schedule detail or policy is read. The sides and the round profile come from the functions
hydration calls (`buildMatchUpSides`, `getRoundMatchUps`), and a tiebreak-only or timed set is annotated as hydration
annotates it, so the two derive each field once.

A TEAM draw is indexed for the outcome view (S7; `buildStructuralIndex({ team: true })`, asked by the view and the
working view only, so the other callers of the index still hydrate a TEAM draw). A dual is indexed as any matchUp, and
its lines are nested in it (`tieMatchUps`) and listed beside it, each built through its dual as hydration builds it:
the dual's drawPositions, round number and finishing positions; the collection's `matchUpType` and format (the line's
own tieFormat, else the dual's resolved one); `BYE` where the dual is one, over the `TO_BE_PLAYED` a line is stored as;
sides from the dual's line-ups (`getCollectionAssignment`); and, in a round robin, the container as the line's
structure with no container of its own, as hydration places it. A dual carries no `matchUpFormat`.

**The view decides on the index.** `buildOutcomeView` builds it, not a hydration, and the working view and the settle
predicates read it, a TEAM draw included since S7. So under `v2` a call costs v1's hydrations and nothing more
(`verify:hydrations`, every arm, TEAM included), and a call v2 refuses takes none. An index entry shares nested objects
(`score`, `sideExitProvenance`) with the stored matchUp, so the view is read before the call writes, never after.

**The index oracle** holds it to the hydration in `differential`: before v1 writes, the view's index of the draw as the
call found it is compared, field by field, with one hydration of the same draw taken for the purpose, after the view's
own step on a draw stored without its edges. A difference is a divergence keyed `index:<field>`. Measured 2026-10-24 over the
mutations suite: 66,154 calls, 1,873,656 entries compared, none different; 15,940 calls on TEAM draws were then tallied
as deferred. Since S7 a TEAM draw is compared too, `collectionPosition` and each dual's nested lines (`tieMatchUps.<field>`)
included: `verify:team-arms` under `differential`, 1,528 tests, none different. Measured against a full in-context hydration (median of 15): SINGLE_ELIMINATION 32 to 256 at 11–13%,
FEED_IN_CHAMPIONSHIP 64, ROUND_ROBIN 32, DOUBLE_ELIMINATION 64 and COMPASS 64 at 11–13%, linear in the draw.

**v1's settle passes ask the index first** (`matchUpStatus/indexPrecheck.ts`; the v1 win CA agreed 2026-10-24). Most
of v1's settle passes hydrate the whole draw on every call only to run a detector that usually finds nothing, and a
pass whose detector finds nothing writes nothing. So a pass first asks its own detector of the structural index, built
with what the pass hydrates with (the draw alone), and returns without hydrating when it finds no work; a TEAM draw
is indexed too since S7 (`team: true`). Measured on `verify:hydrations`' TEAM arm under `v1`: 1,767 hydrations over
228 calls before, 234 after (worst call 10 to 3). In `differential` the detector is asked of a hydration too, and a
disagreement is a divergence keyed `precheck:<pass>`, raised when the call is compared and the call restored: the index
oracle sees the draw as the call found it, this one each state a settle pass meets after the call's writes. Passes
move one at a time, each with its `verify:hydrations` v1 ceiling lowered. `reconcileByeAdvancements` first: about one
hydration a call fewer on every census arm (matrix BYE: DOUBLE_WALKOVER 1,735 → 1,536); over the mutations suite under
`differential`, no disagreement. `settleHeldExits` second, asking `hasHeldExitWork` (the predicate v2's has-work check
already uses) with the pass's own `getMatchUpsMap`, so no map is built twice: its three sub-passes each hydrated, and
the census arms fall 32–45% (matrix BYE: DOUBLE_WALKOVER 1,536 → 945; deep BYE: the route 2,636 → 1,442, 6.6 → 3.6 a
call). A detector forced idle is caught: 230 exit-propagation tests fail on `precheck:settleHeldExits`. `settleForwardConsequences`
third, asking `hasForwardWork`: about one hydration a call fewer again (deep BYE: the route 1,442 → 1,066, 2.7 a call);
forced idle, 100 tests fail on `precheck:settleForwardConsequences`. `reconcileLinkAdvancements` fourth, asking
`getUnearnedLinkAdvancements`: deep BYE: the route 1,066 → 756 (1.9 a call). The pass acts rarely, so a v1 test pins
it: a qualifier's main-draw seat is released when its qualifying final is cleared, and a detector forced idle leaves
the participant seated. `reconcileStaleExitOrigins` fifth, asking `hasStaleExitOrigins` of the
index: the pass already skipped its hydration unless stored data showed a candidate, and now skips it when the
candidate's links show nothing stale (deep BYE: the route 756 → 616, 1.5 a call); forced idle, 32 exit-propagation
tests fail under v1. `reconcileProvenanceSides` sixth, asking `findMisplacedProvenance` after the same
stored-data candidate check (matrix BYE: WALKOVER propagated 870 → 668); forced idle, 4 mutation tests fail under v1.
`reconcileCarriesPastByes` seventh, asking `findOwedCarry` once before its loop, after its cheap check for a BYE
matchUp recording a carried exit (matrix BYE: WALKOVER propagated 668 → 466); forced idle, 29 mutation tests fail
under v1. `reconcileMissedLinkAdvancements` eighth, asking `findMissedLinkAdvancements` (deep BYE:
the route 582 → 534, 1.3 a call); forced idle, 4 mutation tests fail under v1. `reconcileConsolationReservations` ninth, asking
`findReservationWork` (the fed seats whose `FIRST_MATCHUP` reservation the pass would place or withdraw); v2's has-work
predicate asks the same detector, exact where it was scope (any result in a round such a link reads); forced idle, 20
mutation tests fail under v1.

## 8. What the corpus pins

|                                   |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setMatchUpStatus` steps recorded | 50,559 (recorded tests, matrix, census, route flips, fixtures)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| refusal codes observed            | 18 (§ 2), none declared in the entry file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `setMatchUpState`                 | exported as an engine method, eleven declared codes, **no caller** in the corpus: an internal that leaked onto the surface. **Deprecated** on the engine surface in 7.5.0 and removed at the next major; its internal callers keep it, and consumers call `setMatchUpStatus`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `bulkMatchUpStatusUpdate`         | 1 recorded step; its declared codes pinned by `authored/outcome-pipeline/bulk-update-refusals`: `ERR_MISSING_VALUE` for no `outcomes`, `ERR_MISSING_TOURNAMENT` for an unknown `tournamentId`, `ERR_MISSING_EVENT_ID` for an outcome without an `eventId`. Every outcome is located (tournament, event, draw, matchUp) before any is applied, so an outcome naming something not there is refused with its `outcomeIndex` in `context` and nothing is written; it used to be skipped while the call reported success (2026-10-18). A refusal `setMatchUpStatus` raises for a later outcome still leaves the earlier ones written unless the call asked for `rollbackOnError`. It forwards every per-call `setMatchUpStatus` option (the three flags of § 1 among them), set on the call or on one outcome, so a bulk entry follows the same rules as a single one |
| real-record do/undo               | 9 of 11 probed fixtures restore the draw projection; 2 do not (§ 4). The same under `v1`, `v2` and `differential` (2026-10-26)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| authored scenarios                | 13 (`pnpm corpus:authored`), one per rule above that the recorded sources did not reach: the flag precedence (§ 1, three scenarios), rows 5, 9, 10 and 14 of § 2 with every condition of row 9, the swap (§ 3), a double exit entered over a completed result (§ 4), the FMLC loser kept out and a decider's settlement (§ 5), the double-exit no-op (§ 6), two double exits converging, a TEAM dual handed back to auto-calc, the bulk refusals. Each asserts the result code of every step and, where a flag's effect is the claim, the state the patches rebuild                                                                                                                                                                                                                                                                                               |

## 9. Open questions — decided 2026-10-01 (CA)

1. A clear **keeps normalising**: TO_BE_PLAYED and an empty score object are the canonical cleared
   state. It **keeps a matchUp-level `matchUpFormat`**: the format is a property of the match, not of
   its result. (§ 4; landed.)
2. `ERR_FORCED` is traced (2026-10-31): the error-path tests' forced cascade-write failure, not an engine code.
   (§ 2, row 19)
3. `setMatchUpState` **leaves the governor**; its internal callers keep it. (§ 8; deprecated in 7.5.0,
   removed at the next major)
4. The flags: **the policy governs, both ways.** (§ 1, landed with this revision)

## Related

- [exit propagation](./exit-propagation.md): what propagates, provenance, the guarantees on
  cascades.
- [drawPositions](./draw-positions.md): the rules direction relies on.
- `corpus/INVARIANTS.md` and `corpus/README.md`: the properties and the scenarios that pin this page.
