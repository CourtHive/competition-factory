---
title: The scheduling pipeline
---

Automated scheduling places matchUps in time and on courts. Two pipelines do it and they compose: the **timed**
pipeline (`scheduleProfileRounds`) gives each matchUp a date and a time; the **grid** pipeline (`scheduleProfileGrid`)
gives each matchUp a court and an order on a day's court grid. A third, `scheduleMatchUps`, times an explicit list of
matchUps on one date. All three share one core: the dependency graph, the participant reachability model, the timing
rules, recovery, daily limits, person requests and the played-order rule. This page states the rules a second
implementation has to reproduce: the inputs, the core, each pipeline's order of decisions, what is written, what is
reported, and the guarantees. Where the engine's behaviour is a question rather than a decision it is marked **OPEN**.

First version, 2026-10-23, written from the source and from the golden corpus
(`Mentat/planning/SCHEDULING_PIPELINE_VNEXT.md` § 6). The corpus pins it with authored scenarios
(`authored/scheduling/*`), a 288-cell scale matrix (`pnpm corpus:scheduling-scale`), and seven scheduling properties
checked on every scheduling call the test suite makes (`SCHEDULING_PROPERTIES=<file> pnpm vitest run`).

```text
scheduleProfileRounds (timed)          scheduleProfileGrid (grid)            scheduleMatchUps (direct)
  per date, per venue:                   per date:                              one date, listed matchUps:
    profiled rounds → Garman slots         profiled rounds → court-grid rows      Garman slots → place
    slot by slot: gate → place             row by row: rules → place
  writes date, time, venue               writes date, court, courtOrder         writes time (date in it), venue
          └──────────────── shared core: graph · reachability · timing · recovery · limits · requests · played order
```

## 1. The inputs

**The scheduling profile** lists, per date, the venues in play and, per venue, the rounds to schedule there in order.
A round names a tournament, event, draw, structure and round number; it may narrow itself to `matchUpIds`, or to a
`roundSegment` (`segmentNumber` of `segmentsCount`, by round position), and may carry its own `periodLength`. A round
robin's rounds are profiled on the round robin's containing structure: they cover every group it contains.

**The call** takes `scheduleDates` (the profile's dates to schedule; all of them when absent), `clearScheduleDates`,
`courtIds` (a court filter), `periodLength` (minutes per scheduling period, default 30) and `dryRun`. A completed
matchUp is never scheduled again, and there is no override (CA 2026-10-23): `scheduleCompletedMatchUps` is accepted
and ignored by the schedulers until the next major. mocksEngine, auto-scheduling a generated tournament, schedules it
first and applies its results after, as a real tournament is played.

**`clearScheduleDates`.** `true` clears every scheduled matchUp that is not finished, in every tournament loaded, on
every date, profiled or not; a schedule lock survives. An array clears only the matchUps scheduled on the dates it
lists. The clear happens before any placement.

**What the record supplies:** courts and their availability per date (with bookings), the scheduling policy (timing and
daily limits) or its default, the tournament's own daily limits, person requests, and every matchUp's existing schedule
and lock.

## 2. Refusals

- No valid date remains after narrowing the profile's dates by `scheduleDates`: `NO_VALID_DATES`.
- An empty profile is not refused: the call succeeds and places nothing.
- Before scheduling, the profile is validated against the tournament. A profile that names a venue, an event or a draw
  no longer in the record needs repair: the call is refused with
  `SCHEDULING_PROFILE_REPAIR_REQUIRED` and writes nothing. Its `context` offers the repaired profile
  (`repairedSchedulingProfile`, without those rounds), with `modifications` and `issues`; saving it with
  `setSchedulingProfile` is the repair. A round profiled at more than one venue on a date is reported in
  `schedulingProfileIssues`.
- A venue with no courts (none added yet, or all removed) is still a venue (CA 2026-10-23): its rounds are kept and
  place nothing. The timed pipeline reports their matchUps in `noTimeMatchUpIds`; the grid does not offer them to the
  date's other courts and reports them in `notScheduledMatchUpIds`.
- Reading the profile never saves a repair: `getSchedulingProfile` returns the repaired profile with its
  `modifications` and leaves the stored one as it is. A query runs on one side only (client or server), so a save there
  would part the two records. The mutations that remove a venue, event or draw (or a venue's courts) repair the profile
  as part of their own write.
- A profile that orders a round before a round it depends on is not refused and not reported by the scheduler (the
  query `getSchedulingProfileIssues` reports such rounds, with the matchUps each `shouldBeAfter`). The gate's dependency
  rule (§ 4, step 4.3) still places the rounds in dependency order.

**OPEN:** the remaining parameter refusals (`INVALID_VALUES` for a malformed `courtIds` or `periodLength`) are not yet
pinned by the corpus.

## 3. The shared core

### 3.1 The dependency graph

A matchUp **depends on** every matchUp upstream of it: through winner links, loser links (consolation and feed-in),
qualifying-to-main links (a qualifier position depends on the qualifying round that fills it) and round robin group to
playoff links. The relation is transitive: a final depends on every matchUp of its draw that can feed it. AD_HOC rounds
and the rounds of a round robin carry no links and impose no order on each other.

### 3.2 Participant reachability

For each matchUp, who might play it, across all dates:

- **certain**: in the matchUp's sides;
- **potential**: can still reach it through a source matchUp not yet decided. A feeder's winner path and loser path
  are alternatives for its participants, never both;
- **out**: lost a completed feeder and has no route to it (a completed feeder sends only its winner on and only its
  loser to the consolation).

**Near** potentials are those one matchUp away: the participants of a matchUp's direct, undecided sources.

### 3.3 Timing

Each matchUp has an **average** duration, a **recovery** time and a **type-change recovery** time (used when the next
matchUp a participant plays is of the other matchUpType). They are resolved from:

1. minutes the call states (`scheduleMatchUps` only: `averageMatchUpMinutes`, `recoveryMinutes`, `recoveryMinutesMap`);
2. otherwise the event's schedule timing, the tournament's `scheduling.timing`, or the attached scheduling policy,
   by the matchUp's format and its event's category;
3. otherwise the default scheduling policy (`POLICY_SCHEDULING_DEFAULT`): a standard SET3-S:6/TB7 singles averages 90
   minutes and recovers 60.

A **timed format** carries its own average when no rule names it: a whole-match cap (`-M:T60`) is the average outright;
otherwise best-of × set minutes, with the final set's minutes substituted when the code gives them (`SET3-S:T15-F:T10`
is 40). The floor, when nothing applies, is 90 minutes and no recovery.

`scheduleMatchUps` with no timing stated anywhere (no call minutes, no policy, no timing on the event or tournament)
uses 90 minutes and no recovery, as it always has.

### 3.4 Recovery

A participant is **free** after a matchUp at its start plus its average plus its recovery (or its type-change recovery
for a following matchUp of the other type). On one date, a matchUp is placed only where every participant it holds is
free: its certain participants, and its near potentials (a participant one matchUp away is booked as a potential;
participants further away are not, by design, 2026-10-16). A matchUp already timed on the date holds its participants
whether or not the profile is scheduling it, completed or not, for its own minutes. A recorded `endTime` replaces the
average in the free time.

### 3.5 Daily limits

A participant's **day load** is every matchUp they are certain to play on the date, plus, per draw, the longest
**chain** of matchUps they can only potentially play there: a run of matchUps each of which can feed the next. Two
potential matchUps where neither feeds the other are alternatives (a winner path and a loser path) and do not add
(CA, 2026-10-16). Draws add. A participant's load counts the date's matchUps only: a matchUp on an earlier date, or a
completed matchUp with no date, does not count against today, but a participant reachable from an earlier date's
feeder counts as a potential of today's matchUps.

The limits are counted by matchUpType and in `TOTAL`. Each matchUp is checked against the limits of its own tournament
(the tournament's `scheduling.dailyLimits`, else the scheduling policy's `defaultDailyLimits`; none when neither is
set), with the participant's override from the policy's `matchUpDailyLimits` on top, key by key. A limit of 0 is no
limit. A matchUp is **over the limit** when adding it takes any certain or potential participant's load past a limit.

### 3.6 Person requests

A `DO_NOT_SCHEDULE` request on a date blocks a placement whose projected window (start to start plus the round's
greatest average minutes) overlaps the request's window at all. The people checked are the matchUp's individual
participants (a pair's two individuals) and, by default, its potential participants'.

### 3.7 Played order

A matchUp is never placed at or before a **played** matchUp it depends on, and a played matchUp is never placed after a
matchUp that depends on it (CA, 2026-10-22). **Played** is COMPLETED, RETIRED or DEFAULTED with a score; a walkover,
a double walkover or default, a cancelled or abandoned matchUp, a dead rubber, a BYE, and a matchUp IN_PROGRESS or
SUSPENDED impose nothing. The comparison is scheduled against scheduled: an earlier date, or the same date with both
times set and at or before. A same-day placement with no time, or a played matchUp with no date, proves nothing. The
profile scheduler asks it of each slot it offers (§ 4, step 4.2) and then once of its whole plan (§ 4, step 5); every
schedule write refuses it with `ANACHRONISM` (see [schedule governor: played order](../governors/schedule-governor.md)).

### 3.8 The clock

Every time the scheduler reads or writes is a **wall-clock time at the venue**: hours and minutes, with no date and no
time zone. The scheduler never converts between zones, and every comparison it makes is on one scheduling day. The
canonical form is `HH:MM` (00–23, 00–59); the rules below are what the engine reads today, including the readings
that are wider than the canonical form (OPEN, § 9.9). They are pinned by the `kernel.time.*` conformance cases.

1. **A time.** A string is a time when, with anything after a `Z` dropped and split on `:`, it has at least two parts,
   each beginning with an integer (leading whitespace and a sign allowed, trailing characters ignored), with hours at
   most 23 and minutes at most 60. Anything else (`24:00`, `12`, `noon`, `08:xx`, the empty string) is not a time.
2. **Tidying.** A time is written as its first two parts, each padded to two characters when it has only one, and
   otherwise kept as it is: `8:00` → `08:00`, `8:5` → `08:05`, `08:00:00` → `08:00`; but `08:00Z`, ` 8:00` and
   `08:30 PM` are kept verbatim, since their parts are already two characters or more.
3. **A date-time's time.** A full ISO date-time contributes the time after its `T` (`2026-03-02T09:15:30.000Z` →
   `09:15`). A date and time separated by a space is not read as a time.
4. **Minutes past midnight.** A time's hours × 60 + minutes, read from its tidied form, and zero for anything that is
   not a time. So `23:60` is 1440 and `-1:00` is −60.
5. **From minutes.** Minutes past midnight are written as `HH:MM`, the hours wrapping at 24: 1440 is `00:00`, 1500 is
   `01:00`.
6. **Within the day.** A time plus minutes stays on the scheduling day: a result at or past midnight is **`23:59`**,
   the end of the day, and a negative one is `00:00`. A recovery that would end after midnight therefore ends at
   23:59, and the next day starts clean (§ 9.8). Anything that is not a time counts as `00:00`. A court **booking's**
   end is the exception: it is computed by wrapping, so a matchUp booked at 23:30 for 90 minutes ends at `01:00`, before
   it starts on that court's day.
7. **A calendar day.** The date part, `YYYY-MM-DD`, of an ISO date or date-time; two days are the same when their date
   parts are. A month and day in range are accepted without checking the calendar (`2026-02-30`).
8. **Garman slots** are computed in minutes on the scheduling day (§ 4, step 2) and written back as `HH:MM`.
9. **Not-before times** are compared as text. That orders them correctly only because every not-before time the
   scheduler writes is a tidied `HH:MM`.

## 4. The timed pipeline: `scheduleProfileRounds`

The call runs in three stages: a **view**, everything the decisions below read, resolved once from the records; a
**plan**, made from the view alone; and the **writes**. The view is plain data (the hydrated matchUps, the dependency
graph, reachability, the profile resolved to rounds and minutes, each date's available courts, every event's timing,
the minutes of matchUps already timed on a planned date, and the stored facts of every draw anyone has played in), so a
plan can be reproduced from a view without the records: a view written as JSON and read back plans the same.

Dates are taken in order. On each date:

1. **What is already there.** The matchUps already timed on the date are booked first, with their own minutes, so they
   hold their participants for recovery and count toward daily loads. A BYE's schedule is never cleared here: an
   operator's placement on a seat that became a BYE is preserved.
2. **Per venue,** the profiled rounds are taken in `sortOrder` (then profile order) and resolved to their matchUps in
   matchUp order, skipping BYEs, completed matchUps, and matchUps already timed. A
   matchUp belongs to the first venue that profiles it on the date. A `roundSegment` applies only when the round has a
   power-of-two count of matchUps, the segment count is a power of two smaller than it, and the round lists no
   `matchUpIds`. Each round's matchUps take the minutes of the round's **first** matchUp's format (**OPEN**, C7: a round
   of mixed formats is timed by its first). A round none of whose matchUps has a format cannot be timed: nothing of
   it is placed, and its matchUps not yet timed are reported in `noFormatMatchUpIds`. The venue's **slots** are its
   Garman times: with `C` courts available, average minutes `T` and period length `L`, the matchUps expected by period
   `P` are `TM = ((L × C) / T) × (P − 1) + C`, **rounded to the nearest match**, and a period's slots are the difference
   from the period before, computed over each court's availability and bookings. Periods number from 0 at the venue's
   opening, which takes `C`; period 1 adds none. This is Brian Garman's own numbering and rounding ("The Revised Garman
   System", 2009-10: 10 courts of 90-minute matches total 10, 10, 13, 17, 20, … 77, 80 over 23 half-hour periods). `T` is the **greatest** average among the venue's rounds on the date (the
   rounds form a single group), and `L` is the call's `periodLength`.
3. **Slot by slot.** Each slot is offered to the venue's remaining matchUps in profile order; the first that passes the
   gate is placed there. A venue places at most as many matchUps per pass as it has courts; a slot no matchUp takes is
   retried in a later pass, up to 10 attempts. Venues alternate pass by pass until every venue is complete or the
   passes run out (bounded by the day's slots).
4. **The gate,** in order; the first failure defers the matchUp for this slot, recorded under its reason:
   1. a participant would go over a daily limit (§ 3.5): `overLimitMatchUpIds`. A participant's day only gains matchUps
      as slots are filled, so the matchUp stays over the limit for the rest of the date: it leaves the date's list and
      is reported once (one `overLimitMatchUpDetails` entry, at the first slot it was offered), not under
      `noTimeMatchUpIds`;
   2. the slot is at or before a played matchUp it depends on, or at or after a played matchUp that depends on it
      (§ 3.7): `playedOrderDeferredMatchUpIds`, with the first such slot and the played matchUps that refused it. The
      slot stays free for the next matchUp, and a matchUp still unplaced at the end of the date is reported under this
      reason alone;
   3. a matchUp it feeds is already placed earlier than this one would be free: not placed here;
   4. a matchUp it depends on, among the date's matchUps, is not yet placed: `dependencyDeferredMatchUpIds`;
   5. a participant is not yet free (§ 3.4), or the matchUp's not-before time (its sources' free time) is later:
      `recoveryTimeDeferredMatchUpIds`;
   6. a person request blocks it (§ 3.6): `requestConflicts`.

   A matchUp that passes is booked: its participants' loads and free times are updated for the rest of the date.

5. **The guard, then the write.** Once every date is planned, the whole plan is judged against the played order
   (§ 3.7) together, on the state it leaves, before anything is written. A plan the gate made passes it. One that does
   not is refused whole with `ANACHRONISM`, every offending placement in `context.refusals`, and nothing is written:
   the guard is a planner defect's last stop, not a reason a TD meets. Then each placement is given its date, its
   time (HH:MM) and its venue.

Dates named in `clearScheduleDates` are planned on a working copy of the records cleared first, so the plan sees them
empty and a refusal leaves them as they were; they are cleared on the records only when the plan is written. What
remains unplaced on a date is reported in `noTimeMatchUpIds` for that date, beside whatever reasons it collected. A dry
run plans exactly as a run does (clearing on the copy included), so it reports what the run would write, and writes
nothing. The call records an audit of what it did on the tournament.

## 5. The grid pipeline: `scheduleProfileGrid`

Per date, the profiled rounds of every venue are resolved to their matchUps (a round on a round robin covers its
groups), skipping BYEs, completed matchUps and matchUps already on a court or a
court order. The date's grid is its courts by rows; matchUps already timed are walked earliest first, so they land on
earlier rows.

Row by row, each remaining matchUp is placed on the row's first open court unless:

- a matchUp it depends on, or one that depends on it, is already on the row;
- a matchUp it depends on is still unplaced;
- a matchUp that depends on it is on the previous row;
- a participant who can play it is already on the row (unless the two are alternatives for them);
- a participant would go over a daily limit (§ 3.5): reported over the limit. The grid applies the limits the timed
  pipeline resolves (CA 2026-10-23); a call given `matchUpDailyLimits` applies those instead, and one given `{}` opts
  out: the matchUp is placed and reported in `dailyLimitWarningMatchUpIds`;
- every open court is closed at its time (a time-window court booking).

A matchUp not placed on a row is offered to the next. The placements are written in one bulk write (date, court and
court order; refused whole if it breaks the played order) and the call reports, per date, `scheduledMatchUpIds` (what
the write wrote), `notScheduledMatchUpIds` (everything else, including a matchUp the write skipped as completed, locked
or not found) and `overLimitMatchUpIds`. A date the grid skips (no court in the `courtIds` filter, or a refused write)
reports all its matchUps as not scheduled.

**The two pipelines compose.** Run timed then grid, a matchUp gets a date and time, then a court and an order on that
date, earlier times on earlier rows.

## 6. The direct scheduler: `scheduleMatchUps`

`scheduleMatchUps` times the listed matchUps, in the order listed, on one `scheduleDate`, at the venues given (all when
absent), within `startTime` and `endTime` when given. Its slots are Garman times over the venues' courts, and its gate
is the timed pipeline's: daily limits, sources placed first, recovery and not-before, person requests. The sources it
waits for are the listed matchUps and those already on the date (`allDateMatchUpIds` when stated). It writes each
placement's time with the date in it, then the venue; a placement the played-order check refuses is reported in
`noTimeMatchUpIds` and gets no venue.

## 7. What is reported

Per date, every scheduling call reports what it placed (`scheduledMatchUpIds`) and, per reason, what it left
unplaced. The corpus records this report as the scheduling step's value: matchUpIds only, sorted, per date and reason,
without the attempts the engine made on the way (those trace one implementation's loop, not a rule).

## 8. Guarantees

These are checked on every scheduling call the corpus records and the suite makes (`corpus/INVARIANTS.md`):

| property                          | statement                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `SCHEDULE_NO_BYE_PLACED`          | a call never places a BYE                                                                             |
| `SCHEDULE_SOURCES_FIRST`          | a placed matchUp starts no earlier than every timed matchUp upstream of it is free                    |
| `SCHEDULE_RECOVERY_RESPECTED`     | on a date, the later of two matchUps a participant is certain to play starts once the earlier is free |
| `SCHEDULE_DAILY_LIMITS_RESPECTED` | a placement never takes a certain participant over a daily limit                                      |
| `SCHEDULE_ACCOUNTED`              | every schedulable profiled matchUp left unplaced is reported under a reason                           |
| `SCHEDULE_REPORT_TRUE`            | the reported `scheduledMatchUpIds` are exactly what was placed                                        |
| `SCHEDULE_RERUN_STABLE`           | the same call made again places nothing                                                               |

They are stated over certain participants; potential participants are pinned by the authored scenarios. They apply to
the calls that decide placements; the bulk and reschedule mutations write the times their caller states.

## 9. Open questions

1. ~~The grid reads daily limits only when the call passes `matchUpDailyLimits`.~~ Decided (CA 2026-10-23): it resolves
   them as the timed pipeline does and enforces them; `{}` opts out and warns (§ 5). `SCHEDULE_DAILY_LIMITS_RESPECTED`
   counts court-grid placements too.
2. **The grid places by row order, not time,** for matchUps with no time: `SCHEDULE_SOURCES_FIRST` and recovery are
   asked of timed placements, so a grid run's ordering is pinned only by its row rules. Should the corpus state a
   row-order property?
3. **Recovery books potentials one matchUp away only** (by design, 2026-10-16): a participant two rounds away is not
   held. Daily limits count every potential. Is the asymmetry the rule to keep in vNext?
4. **The parameter refusals** of § 2 other than `NO_VALID_DATES` are not yet pinned by corpus scenarios
   (`authored/scheduling/profile-no-valid-dates`, `empty-profile-places-nothing` and `profile-out-of-order` pin the
   rest of § 2).
5. **C7: a round of mixed formats is timed by its first matchUp's format** (§ 4, step 2). Should each matchUp take its
   own format's minutes?
6. ~~**The first Garman period is counted twice.**~~ Decided (CA 2026-10-24, after research and a debate): the period
   numbering was Garman's own, period 0 at the opening taking `C` and period 1 adding none, as every one of his
   published tables does. The defect was truncation: the tables round each total to the nearest match, and the slots
   truncated it, leaving a period short whenever the fraction passed one half. They now round (§ 4, step 2), so one
   court of 90-minute matchUps in 30-minute periods takes its second matchUp at 11:30, when the first is expected to
   end. Pinned by `scheduling.plan.garman-one-court.v1` (kernel cases) and the published 10-court column in
   `garman.test.ts`.
7. ~~**Request conflicts are reported beside the dates.**~~ Decided (2026-10-24, by two opposed debate agents at CA's
   request; pending CA review): conflicts sit under their date, `{ [date]: [{ request, scheduleTimes, matchUpIds }] }`,
   one entry per request a placement broke. Every reader already assumed date keys (the auto-scheduling audit's count,
   TMX's results drawer, the corpus report) and misread the mixed shape. Each person request also gets its own id: a
   time code had given every request added in one call the same one. Pinned by
   `scheduling.plan.person-request-on-a-placed-side.v1`.
8. **Crossing midnight.** The scheduler works one day at a time and stops at 23:59 (§ 3.8, rule 6). A matchUp at 23:00
   with 90 minutes and a 60-minute recovery holds its participants only until 23:59, so a dependent the next morning
   is not held at all; the policy's overnight times (`overnightTimes`) exist but the scheduler does not read them; and
   a stored `endDate` after midnight is not read when bookings are built, while a booking's own end wraps to the early
   morning of the same day (§ 3.8, rule 6). **Proposed** (not yet a rule):
   - every schedule time is a **calendar date-time**: a date and a wall-clock time at the venue, with no zone, on the
     proleptic Gregorian calendar; arithmetic is in whole minutes, so 2026-03-02 23:30 plus 90 minutes is
     2026-03-03 01:00, and a month or year end rolls over the same way;
   - this is exactly the arithmetic of an instant in UTC (UTC has no daylight saving), so it needs no date library:
     a date-time can be computed as a UTC instant, or as a day count since 1970-01-01 × 1440 plus minutes past
     midnight; a daylight-saving change inside a matchUp is ignored, by definition;
   - zones apply only at the edges (now, an embargo, display), always by an explicit IANA zone on the record, never
     the host's;
   - a booking or a recovery that ends past midnight carries into the next date: its participants are not before that
     time on the next day, and the overnight times apply on top;
   - the wire format does not change: `scheduledDate` and `scheduledTime`, with `endDate` when an end falls on the
     next date.

   Adopting it changes placements after a late matchUp, so the corpus moves where the scale matrix schedules late.
   Should the scheduler cross midnight?

9. **The clock reads more than `HH:MM`** (§ 3.8). `23:60` is a time of 1440 minutes, `-1:00` is −60 minutes, `08:00Z`,
   ` 8:00` and `08:30 PM` are times kept verbatim, and a date and time separated by a space is not a time. Should the
   clock accept only `HH:MM` (00–23, 00–59), refusing the rest at the write?

## Related

- [Automated scheduling](./automated-scheduling.md) · [Scheduling profile](./scheduling-profile.mdx) ·
  [Pro scheduling](./pro-scheduling.md) · [Scheduling policy](./scheduling-policy.mdx) ·
  [Scheduling conflicts](./scheduling-conflicts.mdx) · [Schedule locks](./schedule-locks.mdx)
- [The outcome pipeline](./outcome-pipeline.md), the model this page follows.
