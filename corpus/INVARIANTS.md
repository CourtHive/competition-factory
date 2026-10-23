# Corpus vocabulary: invariants and properties

A scenario names what was checked on it. The names are an enum in `corpus.schema.json`, so a
scenario cannot claim a check this document does not define, and a consumer cannot be asked to
implement one. Each definition below is quoted from the harness that implements it in TypeScript
(`src/tests/testHarness/exitPropagation/invariants.ts` and `properties.ts`); the harness is the
authority and this file follows it. Adding a name means adding it in all three places.

## Invariants

An invariant is a statement about ONE state. It must hold on `initial.record` and on the state
after every step.

### `PARTICIPANT_DUPLICATED_IN_STRUCTURE`

Within one structure, no `participantId` occupies two `positionAssignments`.

> "PARTICIPANT_DUPLICATED_IN_STRUCTURE is the residue signature of an advancement that ran twice —
> the shape a non-idempotent cascade leaves behind."

Checked per structure, recursively through nested `structures`. Reported with the `structureId`
and both `drawPosition` values.

### `BYE_POSITION_WITH_PARTICIPANT`

No `positionAssignment` carries both `bye: true` and a `participantId`.

> "A participant cannot simultaneously be a BYE."

## Properties

A property is a statement about a mutation and its inverse, which no single-state check can
express. The harness formulates each so that a legitimate refusal is not a violation:

> "Each is formulated so a legitimate REFUSAL is not a violation. The engine is entitled to decline
> a clear (PROPAGATED_EXITS_DOWNSTREAM, CANNOT_CHANGE_WINNING_SIDE); what it is not entitled to do
> is accept one and leave residue behind."

A property is checked by the writer when the scenario is generated; the scenario records that it
was. A consumer re-checks it by replaying the step pair the property describes.

### `DO_UNDO_IDENTITY`

> "DO_UNDO_IDENTITY — applying an outcome and then clearing it must restore the prior draw."

The residue detector: a cascade that writes N matchUps forward and unwinds N-1 of them leaves a
draw that passes every single-state check. Compared on the harness's projection of the DRAW
(`projectDraw` in `transitions.ts`) with the volatile keys stripped, quoting its own list:

> "Keys whose values change on every write and carry no semantics for these properties."
> `['updatedAt', 'createdAt', 'timeStamp', 'timestamp']`

So the whole-record canonical hash is NOT the test: a clock stamp moves it on every write, and
that is noise, not residue. A consumer evaluating this property re-implements the projection:
the draw definition, keys sorted, those four keys removed at every depth.

### `IDEMPOTENT_REAPPLY`

> "IDEMPOTENT_REAPPLY — applying the identical outcome twice must not write twice."

The canonical hash after the first application and after the second must be equal, and the second
application must not be refused for a reason the first was not.

### `MONOTONIC_DECISION`

> "MONOTONIC_DECISION — scoring a fresh matchUp must not un-decide a REAL one."

A matchUp holding a participant or a winner before the step still holds it after, unless the step
targeted that matchUp. Placeholder decisions (a pending propagated exit with no participant) are
not REAL for this purpose; see the harness comment for the 2026-09-21 reclassification.

### `GRAMMAR_ROUND_TRIP`

For a matchUpFormat code `c`: `stringify(parse(c)) === c`. The code is canonical: parsing it and
printing it back yields the same bytes. A valid code that does not round-trip is not wrong, it is
non-canonical (a redundant modifier the printer drops), and the scenario records what `stringify`
produced instead. Defined here, not in the exit-propagation harness, because the grammar has no
draw; `src/tests/testHarness/corpus/grammarSource.ts` is the authority.

## Scheduling step properties

A scheduling step property is a statement about the matchUps ONE scheduling call placed, read against the record after
the call. The authority is `src/tests/testHarness/scheduling/schedulingProperties.ts`; the plan is
`Mentat/planning/SCHEDULING_PIPELINE_VNEXT.md` § 5.

They are properties and not invariants on purpose. A stored record may hold a timed BYE (`byeSchedulingPreservation`
keeps an operator's placement when a seat becomes a BYE) or two matchUps an operator put inside one participant's
recovery. Neither is a scheduler's doing, and a single-state rule would fail every scenario that starts from such a
record. What a scheduler must not do is create either.

**Placed** means: timed after the call (a date and a time), and not at that same date and time before it. A matchUp the
call only cleared is not placed. The rules are asked of the calls that decide placements (`scheduleProfileRounds`,
`scheduleMatchUps`, `scheduleProfileGrid`, `proAutoSchedule`); the bulk and reschedule mutations write the dates and
times their caller states, so what they place is the caller's decision.

**Minutes** are the matchUp's average and recovery minutes under the record's timing rules (`getMatchUpFormatTiming`:
the format, the event's category, the attached scheduling policy, or the default policy fixture when none is
attached). A call that states its own minutes is judged by them: `scheduleMatchUps` takes `averageMatchUpMinutes`
(default 90) and `recoveryMinutes` (default 0, or per matchUp from `recoveryMinutesMap`). A matchUp is **free** at its
start plus its average minutes plus its recovery minutes, or its type-change recovery minutes when the next matchUp is
of the other matchUpType.

**Participants** are certain participants only: those in the matchUp's sides, a pair counting as its individuals.
Potential participants are pinned by authored scenarios, not by these rules.

### `SCHEDULE_NO_BYE_PLACED`

No placed matchUp is a BYE.

### `SCHEDULE_SOURCES_FIRST`

A placed matchUp starts no earlier than every timed matchUp upstream of it is free, through any number of rounds and
across winner and loser links. A source on a later date is always a violation; a source on an earlier date never is.
Asked in both directions: placing a source after its already-timed dependent is the same fault.

### `SCHEDULE_RECOVERY_RESPECTED`

On one date, for each certain participant of a placed matchUp, the later of any two matchUps they are certain to play
starts no earlier than the earlier one is free. BYEs and double exits are not played and hold nobody.

### `SCHEDULE_DAILY_LIMITS_RESPECTED`

A placement never takes a certain participant over a daily limit on its date: SINGLES, DOUBLES or total, counting the
matchUps they are certain to play there. The limits are the tournament's (`scheduling.dailyLimits`, else the
scheduling policy's `defaultDailyLimits`; none when neither is set), with the participant's override from the policy's
`matchUpDailyLimits` on top, key by key. A limit of 0 is no limit. A participant already over before the call is a
violation only if the call adds to it.

## Scheduling report properties

What a scheduling call's deferral report (its step's `result.value`; `src/tests/testHarness/scheduling/schedulingReport.ts`)
must say about the records before and after it. The authority is
`src/tests/testHarness/scheduling/schedulingReportProperties.ts`. A call made with `dryRun` reports placements it does not
write, by design, and is not asked.

### `SCHEDULE_ACCOUNTED`

For a call that schedules from the scheduling profile: every matchUp of a profiled round, on a date the call schedules
(the profile's dates, narrowed to the call's `scheduleDates` when it names any), that could be scheduled (not a BYE, not
completed, not a TEAM dual: its tie matchUps are what is scheduled) and is unplaced after the call appears in the report
under some reason (`notScheduledMatchUpIds`, `noTimeMatchUpIds`, `overLimitMatchUpIds`, `dependencyDeferredMatchUpIds`,
`recoveryTimeDeferredMatchUpIds`, `requestConflicts`). Placed means timed, or (the grid scheduler, which places by row and
sets no time) given a date and a court order. A round's
matchUps are those of its draw and round number, in its structure or a structure it contains, limited to its
`matchUpIds` when it lists any, and to its `roundSegment` (by round position) when it has one.

### `SCHEDULE_REPORT_TRUE`

The report's `scheduledMatchUpIds` are the matchUps the call placed: every placed matchUp is reported, and every reported
matchUp the record holds is stored on the date it is reported under. A report covering several tournaments is checked
against each record for the matchUps that record holds.

### `SCHEDULE_RERUN_STABLE`

A scheduling call identical to the step before it places nothing: no matchUp is timed, or moved, by the repeat.
