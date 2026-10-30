---
title: The scheduling pipeline
---

Automated scheduling places matchUps in time and on courts. Two pipelines do it and they compose: the **timed**
pipeline (`scheduleProfileRounds`) gives each matchUp a date and a time; the **grid** pipeline (`scheduleProfileGrid`)
gives each matchUp a court and an order on a day's court grid. A third, `scheduleMatchUps`, times an explicit list of
matchUps on one date. All three share one core: the dependency graph, the participant reachability model, the timing
rules, recovery, daily limits, person requests and the order rule. This page states the rules a second
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
`roundSegment` (`segmentNumber` of `segmentsCount`, by round position). A round's own `periodLength` is not read: the
call's sizes every venue's periods. A round
robin's rounds are profiled on the round robin's containing structure: they cover every group it contains.

**The call** takes `scheduleDates` (the profile's dates to schedule; all of them when absent), `clearScheduleDates`,
`courtIds` (a court filter), `periodLength` (minutes per scheduling period; when absent, the smaller of 30 and a
venue's `T` plus recovery, so a short format is not given periods longer than itself) and `dryRun`. A completed
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

**Its own minutes** (CA 2026-10-25): a matchUp already timed on the date holds its participants for its own average
(from its format) plus its own recovery, once, whatever venues the date profiles; a matchUp the plan places holds them
for its round's average, the same figure its recovery is checked with. No figure from its venue or another round
lengthens or shortens it (the engine used the greatest average of any venue profiled on the date). A matchUp about to be
scheduled raises no not-before time from where it was timed before, which may be another date: the matchUps it feeds
wait only for where it is placed now.

**Transit between venues** (CA 2026-10-25). When a participant's consecutive matchUps on a date are at different
venues, the later may not start before the earlier's play ends plus the **greater** of its recovery (or type-change
recovery) and the transit from the earlier's venue to the later's: recovery counts toward transit. Either order is
checked: a matchUp placed before another already timed at another venue must also leave the transit before it. Transit
holds participants, never courts. The minutes from one venue to another are, in order: the minutes stated for that
direction (a pair stated once applies both ways; a one-way value only its way); none when the two venues share a
`facilityId` (one physical place); else the scheduling policy's `defaultTimes.transitMinutes` (the default policy
states 30). With no policy stating it there is no transit, and a matchUp with no venue, or two matchUps at the same
venue, take none. Minutes are whole. A record states the pairs once each in `scheduling.venueTransits`
(`{ venueIds, minutes, oneWay?, sanctioned? }`; a sanctioned value is a floor the minutes never go below), pruned when a
venue is deleted; where linked records state one pair differently, the greater applies. The planning view carries this
as `transit` (`defaultMinutes`, `pairs` by direction, `facilityIds`).

### 3.5 Daily limits

A participant's **day load** is every matchUp they are certain to play on the date, plus, per draw, the longest
**chain** of matchUps they can only potentially play there: a run of matchUps each of which can feed the next. Two
potential matchUps where neither feeds the other are alternatives (a winner path and a loser path) and do not add
(CA, 2026-10-16). Draws add. A matchUp dated on the date counts whether or not it is timed (CA 2026-10-28). A
participant's load counts the date's matchUps only: a matchUp on an earlier date, or a
completed matchUp with no date, does not count against today, but a participant reachable from an earlier date's
feeder counts as a potential of today's matchUps.

The limits are counted by matchUpType and in `TOTAL`. Each matchUp is checked against the limits of its own tournament
(the tournament's `scheduling.dailyLimits`, else the scheduling policy's `defaultDailyLimits`; none when neither is
set), with the participant's override from the policy's `matchUpDailyLimits` on top, key by key. A limit of 0 is no
limit. A matchUp is **over the limit** when adding it takes any certain or potential participant's load past a limit.

### 3.6 Person requests

A `DO_NOT_SCHEDULE` request on a date blocks a placement whose projected window (start to start plus the matchUp's own
average minutes, its round's; CA 2026-10-25) overlaps the request's window at all. The people checked are the matchUp's individual
participants (a pair's two individuals) and, by default, its potential participants'.

### 3.7 Played order

A matchUp is never placed at or before a matchUp it depends on, and never after a matchUp that depends on it. This was
the **played** order (CA, 2026-10-22): only a COMPLETED, RETIRED or DEFAULTED matchUp with a score imposed anything. It
now binds **plans as well as history** (CA, 2026-10-30): every matchUp but a BYE orders the matchUps linked to it,
walkovers, defaults and double exits included, however far downstream the link runs. The comparison is scheduled against
scheduled: an earlier date, or the same date with both times set and at or before. A same-day placement with no time, or
a matchUp with no date, proves nothing. The profile scheduler asks it of each slot it offers (§ 4, step 4.2) and then
once of its whole plan (§ 4, step 5); every schedule write refuses it with `ANACHRONISM`, and `plannedOrder: false` on a
write keeps the played order only (see [schedule governor: schedule order](../governors/schedule-governor.md)). The
facts it reads (`playedOrderFacts`) are present for any draw with a placed matchUp, played or not.

### 3.8 The clock

Every time the scheduler reads or writes is a **wall-clock time at the venue**: hours and minutes, with no date and no
time zone. The scheduler never converts between zones, and every comparison it makes is on one scheduling day. The
canonical form is `HH:MM` (00–23, 00–59), and every write validates through it and stores it (§ 9.9). The 23:59
cap, which § 9.8 decides to replace, is how the engine reads today. The rules are pinned by the `kernel.time.*`
conformance cases.

1. **A time.** A string is a time when it is `H:MM` or `HH:MM`, optionally with seconds (`HH:MM:SS`, a fraction
   allowed), with hours at most 23, minutes and seconds at most 59; or a 12-hour time, `h:mm AM` or `h:mm PM`, hours 1
   to 12; or an ISO date-time (rule 3). Nothing before or after it is allowed. Anything else (`24:00`, `23:60`,
   `-1:00`, `8:5`, `08:00Z`, `" 8:00"`, `13:30 PM`, `12`, `noon`, the empty string) is not a time.
2. **Tidying.** A time is written as `HH:MM`: `8:00` → `08:00`, `08:00:00` → `08:00`, `8:30 PM` → `20:30`,
   `12:15 AM` → `00:15`.
3. **A date-time's time.** An ISO date-time, zoned or not, contributes the time after its `T`
   (`2026-03-02T09:15:30.000Z` → `09:15`); the zone is not applied. A date-time whose date is not a calendar day
   (rule 7) is not a time. A date and time separated by a space is not read
   as a time.
4. **Minutes past midnight.** A time's hours × 60 + minutes, read from its tidied form, and zero for anything that is
   not a time.
5. **From minutes.** Minutes past midnight are written as `HH:MM`, the hours wrapping at 24: 1440 is `00:00`, 1500 is
   `01:00`.
6. **Within the day.** A time plus minutes stays on the scheduling day: a result at or past midnight is **`23:59`**,
   the end of the day, and a negative one is `00:00`. Anything that is not a time counts as `00:00`. A recovery that
   would end after midnight ends at 23:59 on its own day and **carries into the next date** (§ 9.8): the matchUps timed
   on the day before, stored there or placed there by the same plan, whose own average and recovery minutes end after
   midnight book their participants from `00:00` to the minute recovery ends, and the matchUps they feed may not start
   before it. A matchUp at 23:00 of 90 minutes with a 60-minute recovery holds its participants until 01:30. A court **booking** that would end past midnight holds its court to 23:59 on its own day and from `00:00`
   on the next date for the minutes that remain: a matchUp booked at 23:30 for 90 minutes holds the court until 01:00
   of the next date (§ 9.8). A booking's end used to wrap, ending at 01:00 of its own day, before it started.
7. **A calendar day.** The date part, `YYYY-MM-DD`, of an ISO date or date-time, and a real day on the (proleptic
   Gregorian) calendar: `2026-02-30` and `2026-04-31` are not dates, `2028-02-29` is. A date-time is one whose time
   is a time (rule 1): its date is read as written, the zone not applied. Nothing else is a date: a date and time
   separated by a space (`2026-03-02 09:15`), an ISO week date (`2026-W10`), an ordinal date (`2026-061`), the basic
   format (`20260302`) and a month (`2026-03`) are not read. Two values are on the same day when both have a date
   part and the date parts are equal; the time and any zone designator are ignored, and the runtime's zone never
   enters. A value with no date part is on no day. Every same-day test the scheduler makes (profile dates, stored
   scheduled dates, court availability dates, person requests) reads it so, and a profile date given as a date-time is
   stored as its day.
8. **Garman slots** are computed in minutes on the scheduling day (§ 4, step 2) and written back as `HH:MM`.
9. **Not-before times** are compared as text. That orders them correctly only because every not-before time the
   scheduler writes is a tidied `HH:MM`.

### 3.9 Court bookings

A matchUp already timed on the date holds a court; the venue's slots (§ 4 step 2) are computed around what is held.
Rules decided 2026-10-25 (debate-ruled, CA-reviewed):

1. **Its own minutes.** A timed matchUp holds a court for its own average minutes, resolved as § 3.3 resolves them: the
   record's timing, else the scheduling policy, else a timed format's own minutes. A timed matchUp with no format takes
   the event's timing, else the default policy's average (90). It never takes the minutes of the round being placed.
   Recovery holds participants (§ 3.4), never the court.
2. **A BYE holds nothing.** A BYE is never played: whatever schedule it carries, it holds no court, adds nothing to a
   participant's day (§ 3.5) and raises no not-before time. The lines of a TEAM dual that is a BYE are BYEs too, and no
   scheduler places them (since 7.23.0; a placement already made is not touched).
3. **No venue.** A timed matchUp with no venue is at the tournament's only venue with courts on the date, when there is
   exactly one; otherwise it holds no court. Its participants are held either way.
4. **A venue but no court.** A timed matchUp at a venue with no court holds one court of that venue for its minutes:
   capacity is the rule, which court is not part of the result. When no court is free for its whole length it still
   holds one. When no court's free time ends around it (it runs past every court's close), it holds none and is
   reported in `unbookedMatchUpIds[date][venueId]` rather than dropped silently.
5. **A booking reads a schedule and a status, nothing else.** A malformed matchUp elsewhere in the view (draw positions
   that are not valid) changes no booking; it used to switch every booking off, so the date read as free. A booking
   that cannot be read stops the run with its error rather than leaving every court free.

## 4. The timed pipeline: `scheduleProfileRounds`

The call runs in three stages: a **view**, everything the decisions below read, resolved once from the records; a
**plan**, made from the view alone; and the **writes**. The view is plain data (the hydrated matchUps, the dependency
graph, reachability, the profile resolved to rounds and minutes, each date's available courts, every event's timing,
the minutes of matchUps already timed on a planned date, transit between venues, and the stored facts of every draw
anyone has played in), so a
plan can be reproduced from a view without the records: a view written as JSON and read back plans the same.

Dates are taken in order. On each date:

1. **What is already there.** The matchUps already timed on the date are booked first, with their own minutes, so they
   hold their participants for recovery and count toward daily loads. A BYE's schedule is never cleared here: an
   operator's placement on a seat that became a BYE is preserved.
2. **Per venue,** the profiled rounds are taken in `sortOrder` (then profile order) and resolved to their matchUps in
   matchUp order, skipping BYEs, completed matchUps, and matchUps already timed. A matchUp dated on the date without
   a time is not already timed: it is timed like any other, one already on the court grid (a court or a court order)
   included, and the conflicts its time makes there are reported (§ 7). It is never dropped (CA 2026-10-28). A
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
   rounds form a single group), and `L` is the call's `periodLength` (§ 1). Further (decided 2026-10-25):
   - `C` at a period is the mean of the courts available at the starts of periods 1..P (period 0 takes the courts
     available at the opening), so a court that opens later adds slots gradually rather than as though it had been open
     all day; a court is available at a period's start when it is free for `T` minutes from it;
   - period 0 starts at the earliest time, on or after the start of the day, when some court has a free stretch of at
     least `T`: bookings before it (practice, maintenance, matchUps already timed) delay the opening;
   - a period adds nothing when no court is available; after a period with none it adds the courts newly available (an
     opening, or a reopening after a closure); otherwise it adds the change in `TM`;
   - the day runs from the courts' earliest opening to their latest closing on the date, unless the call bounds it.
3. **Slot by slot.** Each slot is offered to the venue's remaining matchUps in profile order; the first that passes the
   gate is placed there. A venue's pass places at most as many matchUps as it has courts **available on the date**
   (within `courtIds`; CA 2026-10-25). The engine placed one more, and counted every court of the venue; within one venue
   this changes nothing, since a slot no matchUp takes goes to the back of the venue's slots, but across venues sharing
   participants the turns decide which venue reaches a participant first. A slot no matchUp takes is
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
nothing. The call records an audit of what it did on the tournament. When it times a matchUp already on a date's court
grid, the grid's conflicts that name it are reported per date in `proConflicts` (a dry run reports none).

## 5. The grid pipeline: `scheduleProfileGrid`

Per date, the profiled rounds of every venue are resolved to their matchUps (a round on a round robin covers its
groups), skipping BYEs, completed matchUps and matchUps already on a court or a
court order. The date's grid is its courts by rows; matchUps already timed are walked earliest first, so they land on
earlier rows.

**Each date is planned from its own view,** read from the records as the dates before it left them, so a placement on
an earlier date is seen by a later one: the date's grid (its courts by rows, the cells already taken and the free cells
on the call's courts), the matchUps to place, the dependency graph and the reachability over them and the matchUps
already on the grid, the courts' closures, and the limits. The date's plan reads nothing else
(`kernel.scheduling.grid@1`): each placement is a matchUp and the cell it takes (its court, venue and court order).

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
absent), within `startTime` and `endTime` when given. It shares the core (§ 3) and the slot arithmetic (§ 4, step 2);
it differs from the timed pipeline in what it is given (a list, not a profile), in how its minutes are resolved, and in
running one pass over one pool of slots rather than venue by venue.

**Refusals.** No `matchUpIds` (or not a list): `MISSING_MATCHUP_IDS`; no records: `MISSING_TOURNAMENT_RECORDS`. A
`scheduleDate` that is not a date: `INVALID_DATE`. An `averageMatchUpMinutes`, `recoveryMinutes` or `periodLength`
that is not a number: `INVALID_VALUES`.

1. **The matchUps.** The listed matchUps, in the order listed, that are not already timed on the date at the venues
   of rule 3, have no winner, are not BYE, DEFAULTED, COMPLETED, ABANDONED, RETIRED or WALKOVER, and have no BYE side
   (a line of a BYE dual). A listed id not found is dropped. A listed matchUp dated on the date without a time is not
   already there: it is timed, one already on the court grid included, and counts toward its participants' loads when
   it is taken (CA 2026-10-28). Only a matchUp timed on the date holds a court (rule 3).
   A listed matchUp dated on another day is scheduled on that day: the call never moves it to its own date, and reports
   it in `noTimeMatchUpIds` (CA 2026-10-28). No matchUp changes day through `scheduleMatchUps`.
2. **The minutes** (§ 3.3, rule 1, and Q1, CA 2026-10-22). Minutes the call states win: `averageMatchUpMinutes`
   (default 90), `recoveryMinutes` (default 0) and `recoveryMinutesMap` (a recovery per matchUpId). When the call
   states none, and the tournament or a matchUp's event states timing (an attached scheduling policy,
   `scheduling.timing`, or the timing extension), each such matchUp's recovery is its own format's and event's, and the
   average is the **greatest** average among them; the matchUps already timed on the date count. When nothing states
   timing: 90 minutes and no recovery.
3. **The slots** (§ 4, step 2), over every court of the venues (`venueIds`, else every venue) available on the date,
   from `startTime` and to `endTime` when given, else from the earliest opening to the latest closing of those courts,
   with `T` the average of rule 2 and `L` the call's `periodLength`, **30 when absent**. The courts are held by every
   matchUp of the venues timed on the date, completed or not, each for its own average (§ 3.9 rule 1), and from 00:00
   by a matchUp of the day before whose own minutes run past midnight (§ 3.8 rule 6). The slots form one pool, in time
   order, shared by every venue.
4. **What is already there.** Each matchUp timed on the date counts toward its participants' daily loads, and books its
   participants (§ 3.4) from its time for the average of rule 2 and its recovery. Every matchUp it feeds may not start
   before its participants are free (its not-before time).
5. **Daily limits first.** The matchUps are taken in order; one that would take a participant over a limit (§ 3.5,
   the limits of the matchUp's own tournament and the policy's per-participant ones, with the call's
   `matchUpDailyLimits` as the defaults where a tournament states none; until 2026-10-27 the call's alone) is
   reported in `overLimitMatchUpIds` and leaves the list; each other is counted toward its participants' daily loads.
   Limits are judged once, before any slot, on the list as a whole; a matchUp left unplaced after rule 6 is taken off
   the loads again.
6. **Slot by slot.** Each slot in turn is offered to the remaining matchUps in order; the first that passes the gate is
   placed there, and booked (§ 3.4). A slot no matchUp takes is skipped (`skippedScheduleTimes`), and is not offered
   again; the pass ends when the slots or the matchUps run out. The gate, in order:
   1. a matchUp it depends on, among the listed matchUps and those timed on the date (`allDateMatchUpIds` when the
      call states them), is not yet placed: deferred (`dependencyDeferred`);
   2. a participant is not free in the matchUp's window, or its not-before time is later (§ 3.4, either order: the
      window is its own average and recovery minutes from the slot, so a placement may not run into a participant's
      later matchUp on the date; a participant held by a potential booking in another draw counts; no transit applies,
      as no venue is known yet; until 2026-10-27 the window was the slot's start alone): deferred
      (`recoveryTimeDeferred`);
   3. a person request blocks it (§ 3.6; potential participants checked unless `checkPotentialRequestConflicts` is
      false): not placed here (`requestConflicts`).
7. **The write.** Each placement, tournament by tournament and draw by draw in the order its matchUps were first
   listed, is judged against the played order (§ 3.7) and, unless refused, written as a time with the date in it
   (`YYYY-MM-DDTHH:MM`, stored as its date and `HH:MM`, § 3.8), then its venue when the call names one venue or the
   records hold only one. A refused placement is reported in `noTimeMatchUpIds` and gets no venue. A dry run writes
   nothing and reports what it would place.

What remains unplaced is reported in `noTimeMatchUpIds`, with what it collected on the way. The call also returns
`remainingScheduleTimes` (the slots no matchUp took, for a caller that schedules in batches and passes them back as
`remainingScheduleTimes`), the participant profiles it built, the not-before times, the overnight rest warnings
(§ 9.8), and `proConflicts`: the court grid's conflicts (`proConflicts`) that name a matchUp it timed which was already
on the grid, such as a time against its court order. A dry run reports none.

**OPEN:** rule 5 counts every listed matchUp toward its participants' loads before any is placed, and a matchUp left
unplaced is uncounted after the pass; a matchUp placed late in the list is therefore judged against loads that include
matchUps not yet placed.

## 7. What is reported

Per date, every scheduling call reports what it placed (`scheduledMatchUpIds`) and, per reason, what it left
unplaced. The corpus records this report as the scheduling step's value: matchUpIds only, sorted, per date and reason,
without the attempts the engine made on the way (those trace one implementation's loop, not a rule).

### 7.1 The plan

The timed pipeline's plan (§ 4) is keyed by canonical date (§ 3.8 rule 7), each date planned once. Its **normative**
part, what `kernel.scheduling.plan@2` compares (CA 2026-10-25):

- `placements[date][venueId]`: `{ matchUpId, scheduleTime }` in write order (venue, tournament, draw, profile order);
  `scheduledMatchUpIds[date]`: the same ids, in the same order;
- `matchUpScheduleTimes[matchUpId]`: the time of every matchUp timed on a planned date, stored or placed;
- `unplaced[date][venueId]`: the profiled matchUps no slot took; `unbookedMatchUpIds[date][venueId]`: matchUps timed at
  a venue with no court that no court could hold (§ 3.9 rule 4); `noTimeMatchUpIds[date]`: those, each venue's in
  turn; `noFormatMatchUpIds[date]`: matchUps of profiled rounds with no format;
- **why a matchUp was refused**, each refused matchUp's **first** refusal with its facts:
  `recoveryTimeDeferredMatchUpIds[date][matchUpId]` (`scheduleTime`, `blockingParticipantIds`, `notBeforeTime`),
  `dependencyDeferredMatchUpIds[date][matchUpId]` (`scheduleTime`, `remainingDependencies`),
  `playedOrderDeferredMatchUpIds[date][matchUpId]` (`scheduleTime`, `blockingMatchUps`),
  `overLimitMatchUpIds[date]` with `overLimitMatchUpDetails[date]` (the first attempt per matchUp), and
  `requestConflicts[date]`.

Every planned date has every key, empty when nothing applies. The rest is **informative**: every later refusal of the
same matchUp, `skippedScheduleTimes` (the slots no matchUp took and how often each was offered) and
`scheduleTimesRemaining` (the slots left over). They trace how one implementation's slot loop ran, depend on its retry
bound, and are not compared; `kernel.scheduling.plan@1`, which compared them too, is superseded.

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
8. **Crossing midnight. DECIDED (CA 2026-10-25): crossed only when necessary, backwards compatible.** Built: the
   date-time arithmetic (`kernel.civil.addMinutes@1`); court bookings carried into the next date
   (`kernel.time.endOnTheDay@1`), in every scheduler that builds bookings; and a participant's recovery carried into
   the next date by the profile planner (§ 3.8, rule 6). No corpus scenario moved. The policy's overnight rest
   (`overnightTimes`, category-dependent: 12 hours for JUNIOR in the default policy, none otherwise) is **warned, not
   held** (CA 2026-10-25: a guideline a player may waive). No scheduler moves a placement for it
   (`scheduling.plan.overnight-rest-is-warned-not-held.v1`); every scheduler (the profile planner, `scheduleMatchUps`,
   the grid and the pro scheduler) returns `overnightRestWarnings`, a list per date of the participant, the matchUp
   and its time, the previous matchUp and its end, and the rest found and required, for each date it placed and the
   date after, a dry run included. The rest is counted from the previous day's last end of play: a recorded
   `endTime` (an `endTime` before its start ended after midnight), else the start plus the average minutes. A matchUp
   of the day before still undecided warns for the matchUp its winner or loser goes to, with no `participantId`:
   whoever advances. Only a placement with a time is measured; a court order alone has none. The category is the
   event's stated `categoryType`, else JUNIOR when its `ageCategoryCode` is an under-age code of 18 or less (`U14`,
   `16U`): the same reading every timing lookup now makes, so a U-coded event also takes the JUNIOR recovery times.
   Not yet built: a stored `endDate` after midnight, which bookings do not read (they take a matchUp's average
   minutes), and either carry in the direct scheduler. The rule:
   - **A date with no time is unchanged.** `scheduledDate` alone remains a complete schedule ("on that day, time to be
     set"); with no time there is nothing to add minutes to, so no booking and no recovery follow from it.
   - **`scheduledTime` is unchanged.** It is the start, `HH:MM` on the venue's wall clock, on `scheduledDate`; a start
     never crosses midnight. A legacy `scheduledTime` holding an ISO date-time (written when the matchUp had no
     `scheduledDate`) is read as that date and time, as today.
   - **Date-time arithmetic runs only when a time is present and minutes are added** (an end, a recovery, a booking):
     a calendar date-time, a date and a wall-clock time with no zone on the proleptic Gregorian calendar, in whole
     minutes. A result before midnight is `HH:MM` on the same date, exactly as today; only a result past midnight is
     on the next date (2026-03-02 23:30 plus 90 minutes is 2026-03-03 01:00), and it is stored only where an end is
     stored already, as `endDate`.
   - It is UTC-instant arithmetic (UTC has no daylight saving), so it needs no date library: a date-time can be
     computed as a UTC instant, or as a day count since 1970-01-01 × 1440 plus minutes past midnight. A
     daylight-saving change inside a matchUp is ignored, by definition. Zones apply only at the edges (now, an
     embargo, display), always by an explicit IANA zone on the record, never the host's.
   - A booking or a recovery that ends past midnight carries into the next date; overnight rest is counted from the end
     of play and warned, never held.
   - Nothing carries from a planned date whose schedule the call clears: what was stored there is gone (the court
     bookings now read this as the recovery carry already did, 2026-10-25).
   - **The consequence:** a schedule that never crosses midnight is placed exactly as today; only the placements the
     23:59 cap and the wrapping booking end decided move.
   - **A start after midnight is on the next date** (CA 2026-10-25: _"if it starts past midnight it is technically
     scheduled for the next day"_): a 00:30 start has the next `scheduledDate`. There is no separate session day.
9. **The clock reads more than `HH:MM`** (§ 3.8). **DECIDED (CA 2026-10-25): invalid forms are refused. Built.**
   - **At the write**, a date must be a real calendar date, `YYYY-MM-DD` (`2026-02-30` is refused), and a time must
     convert unambiguously to `HH:MM` (00–23, 00–59), which is what is stored: `8:00`, `08:00:00`, an ISO date-time
     and a 12-hour time (`8:30 PM` is stored as `20:30`) are accepted; `23:60`, `24:00`, `-1:00`, `08:00Z` and
     `" 8:00"` are refused. The writes: a matchUp's scheduled time and date and its schedule items; court and venue
     availability, bookings and a venue's default times; person requests (one request with a date or a time that is
     not one refuses the call); tournament and event dates, which are checked against the calendar and stored as
     sent. A scheduled time given as a date-time stores its time, and its date when the matchUp has none; one naming
     another day than the matchUp's scheduledDate is refused (`INVALID_DATE`), never stored against it (CA 2026-10-28).
     A scheduledDate given beside it in a schedule write is the matchUp's date, and the time is written against it.
   - **At the read**, stored records keep working: the same unambiguous forms are normalised, and anything else reads
     as no time, as a value that is not a time did before. Production holds no such value (below), so the audit that
     would list them is not built.
   - **Measured 2026-10-25** (read-only, every tournament record in production): scheduled times 43,527, all
     canonical; court availability times 8,682 and dates 4,473, all canonical; scheduled dates 66,580 canonical and
     154 empty strings (a cleared date, which already reads as no date); no date out of the calendar. So the refusals
     change no stored schedule, and the empty-string date is the only legacy form the read has to keep reading as
     absent. The match clock's times (start, stop, resume, end) are a different kind of value, instants: 10,395 are
     ISO instants (`…T…Z`) and 746 bare `HH:MM`; they are outside this rule.

## Related

- [Automated scheduling](./automated-scheduling.md) · [Scheduling profile](./scheduling-profile.mdx) ·
  [Pro scheduling](./pro-scheduling.md) · [Scheduling policy](./scheduling-policy.mdx) ·
  [Scheduling conflicts](./scheduling-conflicts.mdx) · [Schedule locks](./schedule-locks.mdx)
- [The outcome pipeline](./outcome-pipeline.md), the model this page follows.
