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

| #   | code                                       | condition                                                                                                                                                                                                                                                                                                                                                                                                                                | where                                                                                                                  |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | `ERR_MISSING_MATCHUP_ID`                   | no `matchUpId`                                                                                                                                                                                                                                                                                                                                                                                                                           | `setMatchUpStatus`                                                                                                     |
| 2   | `ERR_MISSING_DRAWDEF`                      | no draw could be resolved from `drawId` / `drawDefinition`                                                                                                                                                                                                                                                                                                                                                                               | `setMatchUpStatus`                                                                                                     |
| 3   | `ERR_INVALID_WINNING_SIDE`                 | `winningSide` present and not 1 or 2; **0 is refused** (CA, 2026-10-01: there is never a `winningSide: 0`); a set's own `winningSide` likewise                                                                                                                                                                                                                                                                                           | `setMatchUpStatus`                                                                                                     |
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

## 7.1 Two implementations (S2)

`src/mutate/matchUps/outcome/` is the clean-room re-implementation of this page, written from it and
from the corpus. S2a (2026-10-01) re-implements § 2 as one pure function, `refuseOutcome(request,
view)`, over a read-only view of the draw; routing is `engine.outcomePipeline('v1' | 'v2' |
'differential')`, v1 by default. Under `differential` v2 decides, v1 runs, and a disagreement throws
`OutcomePipelineDivergence` naming the matchUp and both answers; a refusal v1 raises from a write
or from a § 3 route (rows 16 to 19, `ERR_UNRECOGNIZED_MATCHUP_STATUS`, § 3's fallthrough) is
deferred to S2b, not a divergence. `OUTCOME_PIPELINE=differential vitest run` is the gate.

## 8. What the corpus pins

|                                   |                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setMatchUpStatus` steps recorded | 50,559 (recorded tests, matrix, census, route flips, fixtures)                                                                                                                                                                                                                                                                                                  |
| refusal codes observed            | 18 (§ 2), none declared in the entry file                                                                                                                                                                                                                                                                                                                       |
| `setMatchUpState`                 | exported as an engine method, eleven declared codes, **no caller** in the corpus: an internal that leaked onto the surface. **OPEN**: remove it from the governor, or document it                                                                                                                                                                               |
| `bulkMatchUpStatusUpdate`         | 1 recorded step; its two declared codes pinned by `authored/outcome-pipeline/bulk-update-refusals`: `ERR_MISSING_VALUE` for no `outcomes`, `ERR_MISSING_TOURNAMENT` for an unknown `tournamentId`                                                                                                                                                               |
| real-record do/undo               | 7 of 11 probed fixtures restore the draw projection; 4 do not (§ 4)                                                                                                                                                                                                                                                                                             |
| authored scenarios                | 7 (`pnpm corpus:authored`), one per rule above that the recorded sources did not reach: the flag precedence (§ 1), rows 5, 9, 10 and 14 of § 2 with every condition of row 9, the swap (§ 3), the double-exit no-op (§ 6), the bulk refusals. Each asserts the result code of every step and, where a flag's effect is the claim, the state the patches rebuild |

## 9. Open questions — decided 2026-10-01 (CA)

1. A clear **keeps normalising**: TO_BE_PLAYED and an empty score object are the canonical cleared
   state. It **keeps a matchUp-level `matchUpFormat`**: the format is a property of the match, not of
   its result. (§ 4; landed.)
2. Where `ERR_FORCED` comes from on this path is still untraced. (§ 2, row 19)
3. `setMatchUpState` **leaves the governor**; its internal callers keep it. (§ 8; its own PR)
4. The flags: **the policy governs, both ways.** (§ 1, landed with this revision)

## Related

- [exit propagation](./exit-propagation.md): what propagates, provenance, the guarantees on
  cascades.
- [drawPositions](./draw-positions.md): the rules direction relies on.
- `corpus/INVARIANTS.md` and `corpus/README.md`: the properties and the scenarios that pin this page.
