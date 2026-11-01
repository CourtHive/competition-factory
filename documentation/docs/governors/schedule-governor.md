---
title: Schedule Governor
---

:::warning Governor API transition at 8.0.0

Some methods on this page are candidates for removal from production engine exports at the 8.0.0 boundary. Their implementation references have moved: [`getMatchUpsToSchedule`](/docs/implementation/scheduling/getMatchUpsToSchedule), [`validateScheduleScenario`](/docs/implementation/validation/validateScheduleScenario). Existing 7.x routes remain available; final decisions and external-integrator confirmations are tracked in the [transition index](/docs/implementation/engine-api-transition-8).

:::

The **Schedule Governor** provides methods for assigning dates, times, venues, and courts to tournament matchUps. It supports manual assignment, automated scheduling, and hybrid approaches for tournaments ranging from simple club events to complex multi-day professional circuits.

```js
import { scheduleGovernor } from 'tods-competition-factory';
```

:::tip
See **[Scheduling Overview](../concepts/scheduling-overview.mdx)**, **[Automated Scheduling](../concepts/automated-scheduling.md)**, **[Pro Scheduling](../concepts/pro-scheduling.md)**, and **[Scheduling Policy](../policies/scheduling.md)** for comprehensive scheduling concepts.
:::

## Manual Scheduling Methods

### addCourtGridBooking

Adds a booking to the court grid for pro scheduling.

```js
engine.addCourtGridBooking({
  courtId, // required
  startTime, // required - time string (HH:mm)
  endTime, // required - time string (HH:mm)
  bookingType, // required - type of booking
  date, // required - date string (YYYY-MM-DD)
});
```

---

### addMatchUpScheduledDate

Assigns a scheduled date to a matchUp.

```js
engine.addMatchUpScheduledDate({
  matchUpId, // required
  drawId, // required
  scheduledDate, // required - ISO date string (YYYY-MM-DD)
  disableNotice, // optional boolean - suppress notifications
});
```

A day the matchUp's event does not play (see [Event playing days](#event-playing-days)) is written, and the result
carries an `EVENT_DATE_INACTIVE` warning: `{ code, message, matchUpId, eventId, scheduledDate, reason }`. It is never
a refusal.

**Example**:

```js
engine.addMatchUpScheduledDate({
  matchUpId: 'match-123',
  drawId: 'draw-456',
  scheduledDate: '2024-06-15',
});
```

---

### addMatchUpScheduledTime

Assigns a scheduled time to a matchUp. A date-time (`2026-10-02T09:00`) gives a matchUp with no `scheduledDate` that
date; one naming another day than the matchUp's `scheduledDate` is refused with `INVALID_DATE`. To move a matchUp to
another day, write its `scheduledDate`. When the date-time gives the matchUp a day its event does not play, the
result carries the same `EVENT_DATE_INACTIVE` warning as `addMatchUpScheduledDate`.

```js
engine.addMatchUpScheduledTime({
  matchUpId, // required
  drawId, // required
  scheduledTime, // required - time string (HH:mm)
  disableNotice, // optional boolean - suppress notifications
});
```

**Example**:

```js
engine.addMatchUpScheduledTime({
  matchUpId: 'match-123',
  drawId: 'draw-456',
  scheduledTime: '14:30',
});
```

---

### addSchedulingProfileRound

Adds a round to an existing scheduling profile.

```js
const { warnings } = engine.addSchedulingProfileRound({
  scheduleDate, // required - date string
  venueId, // required
  round, // required - { tournamentId, eventId, drawId, structureId, roundNumber }
});
```

A round whose event does not play on `scheduleDate` (see [Event playing days](#event-playing-days)) is added, and the
result carries an `EVENT_DATE_INACTIVE` warning: `{ code, message, eventId, scheduledDate, reason, roundKey }`.
`getSchedulingProfileIssues` reports such rounds for as long as they stay profiled.

---

### assignMatchUpVenue

Assigns a venue to a matchUp.

```js
engine.assignMatchUpVenue({
  matchUpId, // required
  drawId, // required
  venueId, // required
  disableNotice, // optional boolean - suppress notifications
});
```

**Example**:

```js
engine.assignMatchUpVenue({
  matchUpId: 'match-123',
  drawId: 'draw-456',
  venueId: 'venue-789',
});
```

---

### assignMatchUpCourt

Assigns a specific court to a matchUp.

```js
engine.assignMatchUpCourt({
  matchUpId, // required
  drawId, // required
  courtId, // required
  courtDayDate, // optional - date string for multi-day scheduling
  disableNotice, // optional boolean - suppress notifications
});
```

**Example**:

```js
engine.assignMatchUpCourt({
  matchUpId: 'match-123',
  drawId: 'draw-456',
  courtId: 'court-1',
  courtDayDate: '2024-06-15',
});
```

---

### assignMatchUpScorekeeper

Nominates a tournament participant as the official **scorekeeper** of a matchUp.
The nominee must be an `INDIVIDUAL` participant in the tournament; unlike an
official there is no role restriction — a competitor may also be nominated to
keep score. Stored the same way as court/official assignments (a
`SCHEDULE.ASSIGNMENT.SCOREKEEPER` first-class value surfaced as
`matchUp.schedule.scorekeeper`). Not cleared by rescheduling.

```js
engine.assignMatchUpScorekeeper({
  matchUpId, // required
  drawId, // required
  participantId, // required - an INDIVIDUAL participant in the tournament
  disableNotice, // optional boolean - suppress notifications
});
```

Clear a nomination with `removeMatchUpScorekeeper`:

```js
engine.removeMatchUpScorekeeper({ matchUpId, drawId });
```

A participant may instead (or additionally) be approved to keep score for **any**
matchUp by carrying the `SCOREKEEPER` role in `participantRoleResponsibilities`
(set via `modifyParticipant`), which is filterable via `getParticipants`:

```js
engine.modifyParticipant({
  participant: { participantId, participantRoleResponsibilities: ['SCOREKEEPER'] },
});
```

---

### assignMatchUpTimekeeper

Assigns a tournament participant as the **timekeeper** of a matchUp — relevant
for timed `matchUpFormat`s (e.g. INTENNSE bolt/serve clocks). Same participant
rule and storage as the scorekeeper (a `SCHEDULE.ASSIGNMENT.TIMEKEEPER`
first-class value surfaced as `matchUp.schedule.timekeeper`). Not cleared by
rescheduling. The `TIMEKEEPER` role is also available as a
`participantRoleResponsibility`.

```js
engine.assignMatchUpTimekeeper({
  matchUpId, // required
  drawId, // required
  participantId, // required - an INDIVIDUAL participant in the tournament
  disableNotice, // optional boolean - suppress notifications
});

engine.removeMatchUpTimekeeper({ matchUpId, drawId });
```

---

### setMatchUpScheduleLock

Pins a matchUp's **placement** so bulk and automated scheduling cannot move it —
the marquee match that must keep centre court at 19:00 while the rest of the day
is rebuilt around it. Stored first-class as `matchUp.schedule.lock`. Presence of
the object is the lock; `attributes` narrows it to specific placement fields.

Guards placement only: `startTime` / `stopTime` / `resumeTime` / `endTime` stay
writable so a pinned matchUp can still be played. Every placement mutation
accepts `overrideScheduleLock: true` for callers that have confirmed the move
with the operator; an override moves the placement but never removes the lock.
The lock goes inert (it is not deleted) once the matchUp completes, or while it
has no placement to guard.

See [Schedule Locks](../concepts/schedule-locks.mdx) for the full model.

```js
engine.setMatchUpScheduleLock({
  matchUpId, // required
  drawId, // required
  lock, // required - a ScheduleLock object, or null to unlock
  disableNotice, // optional boolean - suppress notifications
});

// pin only the clock time; the court stays free to move
engine.setMatchUpScheduleLock({ matchUpId, drawId, lock: { attributes: ['scheduledTime'] } });

// unlock
engine.setMatchUpScheduleLock({ matchUpId, drawId, lock: null });
```

---

## Automated Scheduling Methods

### scheduleMatchUps

Auto-schedules matchUps on a given date using the Garman formula for optimal court utilization. Intelligently assigns courts and times based on court availability, match duration estimates, recovery times, and participant daily limits.

```js
engine.scheduleMatchUps({
  scheduleDate, // required - ISO date string (YYYY-MM-DD)
  matchUpIds, // required - array of matchUpIds to schedule

  // Venue selection
  venueIds, // optional - defaults to all venues

  // Scheduling parameters
  periodLength, // optional - scheduling block size in minutes (default: 30)
  averageMatchUpMinutes, // optional - average match duration (see "Timing" below)
  recoveryMinutes, // optional - recovery time between matches (see "Timing" below)

  // Time constraints
  startTime, // optional - schedule start time (HH:mm)
  endTime, // optional - schedule end time (HH:mm)

  // Limits and policies
  matchUpDailyLimits, // optional - SINGLES, DOUBLES, total limits
  checkPotentialRequestConflicts, // optional boolean (default: true)
  allowInactiveEventDates, // optional boolean (default: false) - time matchUps on days their event does not play, and warn

  // Execution control
  dryRun, // optional boolean - preview without changes
});
```

**Event playing days**: a matchUp is never placed on a day its own event does not play (see
[Event playing days](#event-playing-days)); skipping is per event, so on one day an event may be skipped while another
is scheduled. What was skipped is reported in `eventDateSkippedMatchUpIds`, `{ [date]: [{ matchUpId, eventId, reason }] }`,
present only when something was skipped. `allowInactiveEventDates: true` places such matchUps instead, and the result's
`warnings` carry one `EVENT_DATE_INACTIVE` per such placement. A skipped matchUp is also listed in `noTimeMatchUpIds`.

#### Timing: where the minutes come from

Minutes stated in the call (`averageMatchUpMinutes`, `recoveryMinutes`, `recoveryMinutesMap`) always win. When the call
states none, `scheduleMatchUps` looks for a timing in the tournament or the matchUp's event: an attached scheduling
policy, the tournament's `scheduling.timing`, or the event's schedule timing. Each matchUp's recovery then comes from its
own format and event (as `getMatchUpFormatTiming` resolves it), and the time slots are sized by the greatest average
among the matchUps. With no timing stated anywhere, the defaults are 90 minutes and no recovery, as before.

#### Period Length: Scheduling Block Size

The `periodLength` parameter controls the granularity of scheduling blocks:

- **15 minutes**: Fine-grained scheduling for short-format matches
- **30 minutes** (default): Standard scheduling for most tournaments
- **60 minutes**: Coarse scheduling for long-format matches

Smaller period lengths provide more precise start times but may reduce court utilization. Larger periods improve grouping but reduce precision.

**See**: [Automated Scheduling - Period Length](../concepts/automated-scheduling.md#period-length-scheduling-block-size) for detailed explanation.

#### scheduleMatchUps Examples

**Basic Scheduling**:

```js
engine.scheduleMatchUps({
  scheduleDate: '2024-06-15',
  matchUpIds: ['match-1', 'match-2', 'match-3'],
});
```

**Custom Parameters**:

```js
engine.scheduleMatchUps({
  scheduleDate: '2024-06-15',
  matchUpIds,
  venueIds: ['venue-1'],
  periodLength: 30,
  averageMatchUpMinutes: 90,
  recoveryMinutes: 60,
  startTime: '08:00',
  endTime: '18:00',
  matchUpDailyLimits: {
    SINGLES: 2,
    DOUBLES: 1,
    total: 2,
  },
});
```

**Dry Run Preview**:

```js
const result = engine.scheduleMatchUps({
  scheduleDate: '2024-06-15',
  matchUpIds,
  dryRun: true, // Preview without making changes
});

console.log('Would schedule:', result.scheduledMatchUpIds);
console.log('Would not fit:', result.noTimeMatchUpIds);
```

**See**: [Automated Scheduling Concepts](../concepts/automated-scheduling.md) for algorithm details.

---

### scheduleProfileRounds

Auto-schedules all rounds specified in a scheduling profile across multiple days and venues. Uses a pre-defined profile that maps rounds to specific dates and venues.

```js
engine.scheduleProfileRounds({
  // Scheduling parameters
  periodLength, // optional - scheduling block size (default: 30)

  // Date selection
  scheduleDates, // optional - specific dates to schedule
  clearScheduleDates, // optional - true clears every scheduled matchUp in the tournament; an array clears those dates

  // Court selection
  courtIds, // optional array - restrict scheduling to only these courts

  // Execution control
  dryRun, // optional boolean - preview without changes
  pro, // DEPRECATED - see below
  checkPotentialRequestConflicts, // optional boolean (default: true)
  allowInactiveEventDates, // optional boolean (default: false) - schedule rounds on days their event does not play, and warn

  // Daily-limit accounting (apply to already-scheduled matchUps that contribute
  // to per-participant per-day counters)
  excludeNoDateCompleted, // optional boolean (default: true) - skip COMPLETED/BYE
  // matchUps that carry no scheduledDate
  excludePriorDates, // optional boolean (default: true) - skip matchUps whose
  // scheduledDate is strictly before the date being scheduled
});
```

**Daily-limit accounting with `excludeNoDateCompleted` / `excludePriorDates`**:

The Day Plan defines what is being scheduled today. When the scheduler reconciles already-scheduled matchUps against the per-participant daily limits in the scheduling policy, historical or orphan matchUps should not consume today's budget:

- `excludeNoDateCompleted` (default `true`) drops `COMPLETED` and `BYE` matchUps that carry no `scheduledDate`. These represent finished play that was never anchored to a specific day; counting them would block legitimate scheduling for the day in question.
- `excludePriorDates` (default `true`) drops matchUps whose `scheduledDate` is strictly before the date being scheduled. This is a defensive filter: in normal flow same-day filtering already excludes them, but the flag guarantees historical records never leak into a future day's counters.

**Event playing days**: a matchUp is never placed on a day its own event does not play (see
[Event playing days](#event-playing-days)); skipping is per event, so on one day an event may be skipped while another
is scheduled. What was skipped is reported in `eventDateSkippedMatchUpIds`, `{ [date]: [{ matchUpId, eventId, reason }] }`,
present only when something was skipped. `allowInactiveEventDates: true` places such matchUps instead, and the result's
`warnings` carry one `EVENT_DATE_INACTIVE` per such placement. A skipped matchUp is not listed in `noTimeMatchUpIds`; a dry run reports the same skips.

Set either flag to `false` to restore the pre-defaults legacy semantics where every matchUp in the already-scheduled set consumes its participants' daily-limit budget regardless of status or date.

**Court filtering with `courtIds`**:

When `courtIds` is provided, the scheduler only considers those courts as available capacity. Useful when an operator wants auto-scheduling to operate against a subset of courts (e.g. when some courts are reserved for other purposes, or when scheduling is being applied per-court). Passing an empty array means "no courts are available" — the scheduler will run but place no matchUps. Omitting the parameter (the default) considers all enabled courts at the profile's venues.

The filter constrains capacity; `scheduleProfileRounds` assigns no court (court grid positions are placed by `scheduleProfileGrid`).

**Returns**:

```js
{
  (scheduledDates, // array - dates where matchUps were scheduled
    scheduledMatchUpIds, // array - matchUpIds that were scheduled
    noTimeMatchUpIds, // array - matchUps that couldn't fit
    overLimitMatchUpIds, // array - matchUps exceeding participant limits
    requestConflicts); // by date - { [date]: [{ request, scheduleTimes, matchUpIds }] }, one per request broken
}
```

#### scheduleProfileRounds Examples

**Schedule All Profile Dates**:

```js
const result = engine.scheduleProfileRounds({
  periodLength: 30,
});

console.log('Scheduled dates:', result.scheduledDates);
console.log('No time for:', result.noTimeMatchUpIds.length, 'matchUps');
```

**Schedule Specific Dates**:

```js
engine.scheduleProfileRounds({
  scheduleDates: ['2024-06-15', '2024-06-16'],
  periodLength: 30,
});
```

**Clear and Reschedule**:

`clearScheduleDates: true` clears the schedule of **every** scheduled matchUp in the tournament records — on every
date, in every event, whether or not the scheduling profile mentions it — before scheduling. To rebuild only some
dates, pass those dates as an array: only matchUps scheduled on them are cleared. In both forms completed matchUps
and [locked](../concepts/schedule-locks.mdx) matchUps keep their schedules.

```js
// Clear everything, then schedule the whole profile
engine.scheduleProfileRounds({
  clearScheduleDates: true,
  periodLength: 30,
});

// Rebuild only 2024-06-16; every other date is left as it is
engine.scheduleProfileRounds({
  clearScheduleDates: ['2024-06-16'],
  scheduleDates: ['2024-06-16'],
  periodLength: 30,
});
```

Clearing a date that is not also in `scheduleDates` leaves it cleared and unscheduled.

**Dry Run Preview**:

```js
const result = engine.scheduleProfileRounds({
  dryRun: true,
});

console.log('Would schedule:', result.scheduledMatchUpIds.length, 'matchUps');
console.log('Request conflicts:', result.requestConflicts);
```

**`pro: true` is removed** (deprecated since 7.15.0, removed 2026-10-28): the flag is accepted and ignored until the
next major, and every call takes the profile scheduler. Court grid positions (`courtOrder`) are placed by
[`scheduleProfileGrid`](#scheduleprofilegrid), which can run after `scheduleProfileRounds`.

:::note
SINGLES and DOUBLES matchUps are scheduled automatically. TEAM matchUps require manual court allocation using `allocateTeamMatchUpCourts()`.
:::

**See**: [Scheduling Profile](../concepts/scheduling-profile.mdx) and [Pro Scheduling](../concepts/pro-scheduling.md) for details.

---

### scheduleProfileGrid

Profile-driven grid scheduling. Uses the scheduling profile to determine which rounds go on which dates at which venues, then places matchUps onto court grid positions (`courtOrder`) **without assigning times**. Used when an operator wants to manually assign times after the grid placement step.

```js
engine.scheduleProfileGrid({
  scheduleDates, // optional - specific dates to schedule
  clearScheduleDates, // optional - as for scheduleProfileRounds; clears dates and times too, not only grid positions
  scheduleCompletedMatchUps, // deprecated, ignored: completed matchUps are never placed
  matchUpDailyLimits, // optional - { SINGLES, DOUBLES, total } per-participant daily limits;
  // omitted: the tournament's limits, enforced; {}: none enforced, over-limit placements warned
  minCourtGridRows, // optional number - rows per court (default: 10)
  courtIds, // optional array - restrict placement to only these courts
  allowInactiveEventDates, // optional boolean (default: false) - place matchUps on days their event does not play, and warn
});
```

**Event playing days**: a matchUp is never placed on a day its own event does not play (see
[Event playing days](#event-playing-days)); skipping is per event, so on one day an event may be skipped while another
is scheduled. What was skipped is reported in `eventDateSkippedMatchUpIds`, `{ [date]: [{ matchUpId, eventId, reason }] }`,
present only when something was skipped. `allowInactiveEventDates: true` places such matchUps instead, and the result's
`warnings` carry one `EVENT_DATE_INACTIVE` per such placement. A skipped matchUp is not listed in `notScheduledMatchUpIds`.

When `courtIds` is provided, only courts in the set are considered as placement targets at each venue. Passing an empty array places nothing. Omitting the parameter places onto all courts at the profile's venues (the default).

**Completed matchUps**: By default the pro scheduler excludes matchUps that already carry a terminal status (`COMPLETED`, `RETIRED`, `WALKOVER`, `DEFAULTED`, etc.) from the placement pool — these don't need a court slot and would otherwise occupy grid rows, pushing newly-placed matchUps down. `scheduleCompletedMatchUps` no longer changes this (CA 2026-10-23: completed matchUps are excluded from re-scheduling); it is ignored and will be removed at the next major. A venue in the profile with no courts keeps its rounds; their matchUps are not placed on other venues' courts and are reported in `notScheduledMatchUpIds`.

**Daily limits**: the grid applies the limits `scheduleProfileRounds` applies, so the two schedulers agree.

- **Omitted** (the default): the limits are resolved as the timed pipeline resolves them (the scheduling policy's, the tournament's `scheduling.dailyLimits`, and each participant's override) and enforced.
- **`{}`**: the caller opts out. Nothing is refused for a limit, and a placement that would take a participant over the resolved limits is made and reported in `dailyLimitWarningMatchUpIds`.
- **Limits given**: those limits are enforced.

An enforced limit refuses a matchUp whose entered participants or winner-advancement potentials would push any single participant past the per-day cap for the matchUp type or for the daily `total`. Counters are seeded from matchUps already on the grid for the date so subsequent runs see total daily load. Refused matchUps are reported in `overLimitMatchUpIds`, NOT in `notScheduledMatchUpIds`.

**Returns**:

```js
{
  scheduledDates,         // array - dates where matchUps were placed
  scheduledMatchUpIds,    // record<date, matchUpIds[]> - matchUps placed per date
  notScheduledMatchUpIds, // record<date, matchUpIds[]> - matchUps that didn't fit per date
  overLimitMatchUpIds,    // record<date, matchUpIds[]> - matchUps rejected by daily limits
  dailyLimitWarningMatchUpIds, // record<date, matchUpIds[]> - placed over a limit the call waived ({})
  eventDateSkippedMatchUpIds, // record<date, { matchUpId, eventId, reason }[]> - present when any
  warnings, // present when any - EVENT_DATE_INACTIVE per placement made with allowInactiveEventDates
}
```

---

## Bulk Operations

### bulkScheduleMatchUps

Schedules multiple matchUps at once with provided scheduling details, across every tournament in state.

```js
const {
  scheduled, // number of matchUps scheduled
  lockedMatchUpIds, // present when any - schedule-locked matchUps that were skipped
  skippedMatchUpIds, // present when any - BYE or completed matchUps that were skipped
  notFoundMatchUpIds, // present when any - requested matchUpIds no tournament in state holds
  warnings, // present when any
} = engine.bulkScheduleMatchUps({
  matchUpDetails, // array of { matchUpId, schedule, tournamentId? } - each with its own schedule
  // or
  matchUpContextIds, // array of { tournamentId, matchUpId } - all given the same `schedule`
  schedule, // required with matchUpContextIds

  scheduleCompletedMatchUps, // optional boolean - default false: completed matchUps are skipped
  scheduleByeMatchUps, // optional boolean - default false: BYE matchUps are skipped
  overrideScheduleLock, // optional boolean
  removePriorValues, // optional boolean
  plannedOrder, // optional boolean - default true; false: only a played matchUp orders (see Schedule order)
});
```

A detail's `tournamentId` is optional: when it is absent the tournament holding `matchUpId` is used. Nothing
requested is dropped in silence: a skipped BYE or completed matchUp is named in `skippedMatchUpIds`, and a
`matchUpId` that no tournament in state holds (or a detail naming a tournament that is not in state) in
`notFoundMatchUpIds`.

---

### bulkScheduleTournamentMatchUps

Efficiently schedules multiple matchUps with identical or varying schedule details.

```js
engine.bulkScheduleTournamentMatchUps({
  // When all matchUps have same schedule
  matchUpIds, // array of matchUpIds
  schedule, // schedule object { scheduledDate, scheduledTime, venueId, courtId }

  // When matchUps have different schedules
  matchUpDetails, // array of { matchUpId, schedule }

  // Validation and control
  checkChronology, // optional boolean - warn on scheduling errors
  errorOnAnachronism, // optional boolean - throw error on chronological errors
  removePriorValues, // optional boolean - clear existing scheduling timeItems
  plannedOrder, // optional boolean - default true; false: only a played matchUp orders (see Schedule order)
});
```

Returns `scheduled` and, when any, `lockedMatchUpIds`, `skippedMatchUpIds` (BYE or completed, unless
`scheduleByeMatchUps` / `scheduleCompletedMatchUps`) and `notFoundMatchUpIds` (requested ids the tournament does
not hold), as [`bulkScheduleMatchUps`](#bulkschedulematchups) does.

#### bulkScheduleTournamentMatchUps Examples

**Same Schedule for All**:

```js
const schedule = {
  scheduledDate: '2024-06-15',
  scheduledTime: '08:00',
  venueId: 'venue-1',
};

engine.bulkScheduleTournamentMatchUps({
  matchUpIds: ['match-1', 'match-2', 'match-3'],
  schedule,
});
```

**Different Schedules**:

```js
const matchUpDetails = [
  {
    matchUpId: 'match-1',
    schedule: {
      scheduledDate: '2024-06-15',
      scheduledTime: '08:00',
      venueId: 'venue-1',
      courtId: 'court-1',
    },
  },
  {
    matchUpId: 'match-2',
    schedule: {
      scheduledDate: '2024-06-15',
      scheduledTime: '09:30',
      venueId: 'venue-1',
      courtId: 'court-2',
    },
  },
];

engine.bulkScheduleTournamentMatchUps({
  matchUpDetails,
  checkChronology: true,
  errorOnAnachronism: true,
});
```

**Replace All Schedules**:

```js
engine.bulkScheduleTournamentMatchUps({
  matchUpIds,
  schedule,
  removePriorValues: true, // Clear previous scheduling
});
```

---

### bulkRescheduleMatchUps

Shifts scheduled matchUps by a specified number of days and/or minutes. Useful for weather delays or venue changes.

```js
const {
  rescheduled, // array of inContext matchUps that were rescheduled
  notRescheduled, // array of inContext matchUps that were NOT rescheduled
  allRescheduled, // boolean - true if all matchUps rescheduled
  lockedMatchUpIds, // matchUpIds skipped because a schedule lock pins them (present when any were)
  warnings, // present when any - each write's warnings, e.g. EVENT_DATE_INACTIVE for a matchUp moved onto a day its event does not play
  dryRun, // boolean - indicates if this was a dry run
} = engine.bulkRescheduleMatchUps({
  matchUpIds, // required - array of matchUpIds to reschedule
  scheduleChange: {
    daysChange: number, // number of days +/- to shift
    minutesChange: number, // number of minutes +/- to shift
  },
  overrideScheduleLock, // optional boolean - move locked matchUps too (the locks stay)
  dryRun, // optional boolean - preview without changes
});
```

Only scheduled matchUps that are not completed are considered. A matchUp is **not rescheduled**, and is
reported in `notRescheduled` with its schedule untouched, when either change would take it out of bounds:

- a `daysChange` that lands before the tournament `startDate` or after its `endDate`;
- a `minutesChange` that takes its `scheduledTime` out of its own day: before `00:00`, or to `24:00` and
  beyond (23:00 + 60 minutes is refused, as 23:00 + 61 is; the time never rolls over to another date).

The two are judged separately and either one refuses the matchUp, so a `daysChange` past `endDate` is not
rescued by a `minutesChange` given alongside it.

A `daysChange` moves the matchUp off its old day's grid: its `courtOrder` and `courtId` are removed, and its
`venueId` with them when it came with a court, as for any
[date change](#grid-position-is-cleared-on-a-date-change). A `minutesChange` alone keeps them.

A matchUp whose [schedule lock](../concepts/schedule-locks.mdx) pins what the shift would change is skipped, left
as it is, and reported in both `notRescheduled` and `lockedMatchUpIds`; a dry run reports it the same way. A shift
of a whole block therefore leaves a locked matchUp where it was, and a matchUp moved onto its court and time is a
court double booking that `proConflicts` reports. Pass `overrideScheduleLock: true` once the operator has confirmed
moving pinned matchUps as well.

#### bulkRescheduleMatchUps Examples

**Delay by One Day**:

```js
const result = engine.bulkRescheduleMatchUps({
  matchUpIds: ['match-1', 'match-2'],
  scheduleChange: {
    daysChange: 1, // Move forward one day
  },
});

console.log('Rescheduled:', result.rescheduled.length);
console.log('Failed:', result.notRescheduled.length);
```

**Shift Start Times**:

```js
engine.bulkRescheduleMatchUps({
  matchUpIds,
  scheduleChange: {
    minutesChange: 30, // Start 30 minutes later
  },
});
```

**Weather Delay**:

```js
// Rain delay - move all to next day, 2 hours earlier start
engine.bulkRescheduleMatchUps({
  matchUpIds,
  scheduleChange: {
    daysChange: 1,
    minutesChange: -120, // 2 hours earlier
  },
});
```

**Dry Run Preview**:

```js
const result = engine.bulkRescheduleMatchUps({
  matchUpIds,
  scheduleChange: { daysChange: 1 },
  dryRun: true,
});

console.log('Would reschedule:', result.rescheduled.length);
console.log('Would fail:', result.notRescheduled.length);
```

---

### bulkUpdatePublishedEventIds

Returns filtered array of publishedEventIds from all eventIds included in a bulk matchUp status update. Useful for determining which events need re-publishing after bulk scoring.

```js
const { publishedEventIds } = engine.bulkUpdatePublishedEventIds({
  outcomes, // array of matchUp outcomes
});

// Re-publish affected events
publishedEventIds.forEach((eventId) => {
  engine.publishEvent({ eventId });
});
```

**Use Case**: After bulk scoring at end of day, identify and republish only the affected published events rather than all events.

---

### bulkUpdateCourtAssignments

Updates court assignments for multiple matchUps at once.

```js
engine.bulkUpdateCourtAssignments({
  courtAssignments, // required - array of {matchUpId, courtId}
});
```

---

## Clearing and Removing Schedules

### clearMatchUpSchedule

Clears schedule information from a specific matchUp.

```js
engine.clearMatchUpSchedule({
  matchUpId, // required
  drawId, // optional - optimizes lookup, triggers draw modification notice
  scheduleAttributes, // optional - array of specific attributes to clear
});
```

#### clearMatchUpSchedule Examples

**Clear All Schedule Attributes**:

```js
engine.clearMatchUpSchedule({
  matchUpId: 'match-123',
  drawId: 'draw-456',
});
```

**Clear Specific Attributes**:

```js
import { scheduleConstants } from 'tods-competition-factory';

engine.clearMatchUpSchedule({
  matchUpId: 'match-123',
  scheduleAttributes: [scheduleConstants.SCHEDULED_TIME, scheduleConstants.SCHEDULED_DATE],
});
```

---

### clearScheduledMatchUps

Clears schedules from multiple matchUps based on criteria.

```js
engine.clearScheduledMatchUps({
  scheduledDates, // optional - array of dates to clear
  venueIds, // optional - array of venueIds to clear
  scheduleAttributes, // optional - which attributes to clear
  ignoreMatchUpStatuses, // optional - matchUp statuses to skip
});
```

#### clearScheduledMatchUps Examples

**Clear Specific Date**:

```js
engine.clearScheduledMatchUps({
  scheduledDates: ['2024-06-15'],
});
```

**Clear Specific Venue**:

```js
engine.clearScheduledMatchUps({
  venueIds: ['venue-1'],
});
```

**Clear Only Times (Keep Dates)**:

```js
import { scheduleConstants } from 'tods-competition-factory';

engine.clearScheduledMatchUps({
  scheduledDates: ['2024-06-15'],
  scheduleAttributes: [scheduleConstants.SCHEDULED_TIME],
});
```

**Skip Completed MatchUps**:

```js
import { matchUpStatusConstants } from 'tods-competition-factory';

engine.clearScheduledMatchUps({
  scheduledDates: ['2024-06-15'],
  ignoreMatchUpStatuses: [
    matchUpStatusConstants.COMPLETED,
    matchUpStatusConstants.RETIRED,
    matchUpStatusConstants.DEFAULTED,
  ],
});
```

---

### calculateScheduleTimes

Calculates scheduling times based on match duration and court availability.

```js
const { times } = engine.calculateScheduleTimes({
  scheduleDate, // required
  matchUpIds, // required
  venueIds, // optional
});
```

---

### isScheduleLocked

Whether a matchUp's placement is pinned by a director. Accepts the matchUp
either way round — `{ matchUpId, drawId }` when only ids are in hand, or
`{ matchUp }` when it isn't (the cheap form: a table rendering hundreds of rows
should not resolve each one by id).

Returns the lock alongside the verdict so a caller can show _why_ a matchUp is
pinned without a second lookup. `scheduleLocked` is `false` — with `lock` still
returned — when a lock exists but is inert: the matchUp completed, or there is
no placement left to guard. See [Schedule Locks](../concepts/schedule-locks.mdx).

```js
engine.isScheduleLocked({ matchUpId, drawId });
// → { success: true, scheduleLocked: true, lock: { reason: 'featured' } }

engine.isScheduleLocked({ matchUp });
engine.isScheduleLocked({ matchUp, attributes: ['courtId'] }); // narrow to one placement field
```

`scheduleGovernor.matchUpScheduleLocked({ matchUp })` is the bare predicate
behind it — a plain boolean with no result envelope, used by the factory's own
enforcement. Consumers should prefer `isScheduleLocked`.

---

### courtGridRows

Returns court grid data for pro scheduling visualization.

```js
const { rows } = engine.courtGridRows({
  scheduleDate, // required
});
```

---

### findMatchUpFormatTiming

Finds format timing for a specific matchUp format.

```js
const { timing } = engine.findMatchUpFormatTiming({
  matchUpFormat, // required
});
```

---

### findVenue

Finds a venue by ID with full details.

```js
const { venue } = engine.findVenue({
  venueId, // required
});
```

---

### generateBookings

Generates booking objects for scheduled matchUps.

```js
const { bookings } = engine.generateBookings({
  scheduleDate, // required
});
```

---

### generateVirtualCourts

Creates virtual courts for scheduling simulation.

```js
const { courts } = engine.generateVirtualCourts({
  venueId, // required
  courtsCount, // required
});
```

---

### getMatchUpsToSchedule

**8.0.0 engine-removal candidate.** This 7.x route remains available pending review. The full reference has moved to [`getMatchUpsToSchedule`](/docs/implementation/scheduling/getMatchUpsToSchedule). Package-export status is a separate decision.

### getPersonRequests

Returns scheduling requests for persons (officials, participants).

```js
const { requests } = engine.getPersonRequests({
  personId, // optional - filter by person
});
```

---

### getProfileRounds

Returns rounds from a scheduling profile.

```js
const { rounds } = engine.getProfileRounds({
  scheduleDate, // optional - filter by date
});
```

---

### getScheduledRoundsDetails

Returns detailed information about scheduled rounds.

```js
const { details } = engine.getScheduledRoundsDetails();
```

---

Since 7.7.0 a round that cannot be detailed is listed in an additive `roundErrors` array and its position
in the rounds holds `undefined`, so the other rounds still schedule.

### getSchedulingProfile

Returns the current scheduling profile. A stored profile that names a venue, event or draw no longer in the record is
returned repaired, with the count of `modifications` and the `issues`, and is never saved: the profile schedulers
refuse it with `SCHEDULING_PROFILE_REPAIR_REQUIRED` until the repaired profile is saved with `setSchedulingProfile`.

```js
const { schedulingProfile, modifications, issues } = engine.getSchedulingProfile();
```

---

### getSchedulingProfileIssues

Validates scheduling profile and returns any issues.

```js
const { profileIssues, roundIndexShouldBeAfter, eventDateIssues } = engine.getSchedulingProfileIssues({
  scheduleDates, // optional - only these profile dates
});
```

`eventDateIssues` lists, per profile date, the profiled rounds whose event does not play on that date (see
[Event playing days](#event-playing-days)): `{ [scheduleDate]: [{ roundKey, eventId, reason }] }`. It covers profiles
saved before the event's dates said so, and rounds made stale by a later date edit.

---

## Schedule Modifications

### matchUpScheduleChange

Swaps the schedule details of two scheduled matchUps. Useful for manual adjustments in schedule grid interfaces.

```js
engine.matchUpScheduleChange({
  courtDayDate, // required - date string
  sourceMatchUpContextIds, // required - source matchUp context
  targetMatchUpContextIds, // required - target matchUp context
  sourceCourtId, // optional - source court
  targetCourtId, // optional - target court
});
```

**Example**:

```js
engine.matchUpScheduleChange({
  courtDayDate: '2024-06-15',
  sourceMatchUpContextIds: {
    tournamentId: 'tournament-1',
    drawId: 'draw-1',
    matchUpId: 'match-1',
  },
  targetMatchUpContextIds: {
    tournamentId: 'tournament-1',
    drawId: 'draw-1',
    matchUpId: 'match-2',
  },
  sourceCourtId: 'court-1',
  targetCourtId: 'court-2',
});
```

**Use Case**: Drag-and-drop schedule interfaces where matchUps are swapped between time slots or courts.

---

### modifyMatchUpFormatTiming

Updates the scheduling timing (average and recovery times) for a `matchUpFormat`, at the tournament level or, with an
`eventId`, on that event.

```js
engine.modifyMatchUpFormatTiming({
  matchUpFormat, // required
  averageTimes, // optional - [{ categoryNames?, categoryTypes?, minutes: { default, ... } }]
  recoveryTimes, // optional - same shape as averageTimes
  eventId, // optional - write the event's timing instead of the tournament's
  tournamentId, // optional - only this tournament record
});
```

With an `eventId`, only the record that holds the event is written; an event no loaded record holds is refused with
`EVENT_NOT_FOUND` and nothing is written. A tournament-level change sends `modifyTournamentDetail`, an event-level change
`modifyEvent`.

---

### proAutoSchedule

Professional auto-scheduling with grid-based court assignment.

```js
engine.proAutoSchedule({
  scheduledDate, // required
  matchUps, // required - { inContext: true, nextMatchUps: true }
  courtIds, // optional
  allowInactiveEventDates, // optional boolean (default: false) - place matchUps on a day their event does not play, and warn
});
```

**Event playing days**: a matchUp is never placed on a day its own event does not play (see
[Event playing days](#event-playing-days)); skipping is per event, so on one day an event may be skipped while another
is scheduled. What was skipped is reported in `eventDateSkippedMatchUpIds`, `{ [date]: [{ matchUpId, eventId, reason }] }`,
present only when something was skipped. `allowInactiveEventDates: true` places such matchUps instead, and the result's
`warnings` carry one `EVENT_DATE_INACTIVE` per such placement. A skipped matchUp is also listed in `notScheduled`.

A completed matchUp is never placed (CA 2026-10-23): passed one, the write skips it and it is reported not scheduled.
`scheduleCompletedMatchUps` is accepted and ignored until the next major.

---

### proConflicts

Detects scheduling conflicts in pro grid scheduling: the grid's rows are `courtOrder`, its columns courts.

```js
const { courtIssues, rowIssues } = engine.proConflicts({
  matchUps, // required — the day's court-placed matchUps, { inContext: true, nextMatchUps: true }
  useDeepDependencies, // optional — also check dependencies beyond adjacent rows
});
```

`courtIssues` is keyed by `courtId`, `rowIssues` by row index; each issue is
`{ matchUpId, issue, issueType, issueIds }`, where `issue` is the severity (`SCHEDULE_ERROR`,
`SCHEDULE_CONFLICT`, `SCHEDULE_ISSUE`, `SCHEDULE_WARNING`) and `issueIds` names the matchUps it is with:
for a participant issue, only the matchUps that matchUp's own participants clash with.
A matchUp carries one issue, the first and most severe found. The `issueType`s are `scheduleConstants`:

- `CONFLICT_PARTICIPANTS`, `CONFLICT_POTENTIAL_PARTICIPANTS` — the same participant, or one who may
  advance there, in two matchUps of one row;
- `CONFLICT_MATCHUP_ORDER` — a matchUp in the same row as, or earlier than, a matchUp that feeds it;
- `CONFLICT_COURT_DOUBLE_BOOKING` — two matchUps in the same court and `courtOrder`;
- in adjacent rows, `CONFLICT_PARTICIPANTS`, `CONFLICT_POTENTIAL_PARTICIPANTS` and `CONFLICT_MATCHUP_ORDER` are
  a `SCHEDULE_WARNING` (back to back), and only when the time between the two matchUps is short of the
  participants' recovery: the earlier matchUp's finish plus its recovery minutes falls after the later
  matchUp begins. The finish is the earlier matchUp's `endTime`, else its `scoredTime`, else its
  `startTime`, `calledAt` or `scheduledTime` plus its average minutes; the later matchUp begins at its
  `startTime`, else its `calledAt`, else its `scheduledTime`. Average and recovery minutes come from the
  scheduling policy, with the singles ↔ doubles figure when the type changes. `calledAt` and `scoredTime` are
  UTC instants and are read only when the tournament's time zone is known (`localTimeZone`, or the venues'
  address zones). Without times the warning stands. A source on the same court as the matchUp it feeds is
  not warned of: the court plays them in order;
- `CONFLICT_BYE_SCHEDULED`, `CONFLICT_EXIT_SCHEDULED` — a court held by a matchUp that will never be
  played (see below);
- `CONFLICT_POSITION_LINK` — with `useDeepDependencies`, a matchUp whose position-linked source is
  not on the grid;
- `CONFLICT_COURT_TIME_ORDER` — a court's times out of step with its order of play: a later
  `courtOrder` at a time equal to or earlier than the matchUp before it. A `SCHEDULE_WARNING`, the
  lowest severity, so it never stands in front of another issue on the same matchUp. A matchUp that
  uses no court time (`WALKOVER`, `DOUBLE_WALKOVER`, `CANCELLED`, `DEAD_RUBBER`, a BYE, or an exit
  the cascade produced) is left out, so the matchUp a director puts on a walkover's court at the same
  time is not reported. `DEFAULTED`, `DOUBLE_DEFAULT` and `ABANDONED` still count: each can come after
  play has begun. Nothing schedules by this warning; `proAutoSchedule` does not read `proConflicts`.

---

### proColumnResolve

Court-preserving, `scheduledTime`-preserving conflict resolver. Where `proAutoSchedule` may reassign courts, `proColumnResolve` re-lays the grid **vertically only**: a matchUp never changes its `courtId` or its `scheduledTime` — only its `courtOrder` (row) changes, and blank rows are inserted to space colliding matchUps onto different rows.

It removes cross-column participant collisions — the same participant, or the same **potential** participant (winner advancement), appearing in two cells of the same row — by folding both `CONFLICT_PARTICIPANTS` and `CONFLICT_POTENTIAL_PARTICIPANTS` into each matchUp's deep dependency participant set.

Per-column ordering: completed matchUps are anchored at the top (in play order), in-progress beneath them, and to-be-played below in `scheduledTime` order (which also repairs a director's time-inversions). Every dependency source is placed in a strictly earlier row than the match it feeds.

```js
const { resolved, unresolvable } = engine.proColumnResolve({
  scheduledDate, // required
  matchUps, // required — { inContext: true, nextMatchUps: true }
  courtIds, // optional — restrict to specific courts
});
```

Returns:

- `resolved` — matchUps whose `courtOrder` changed: `{ matchUpId, courtId, from, to }`
- `unresolvable` — matchUps that cannot be deconflicted by spacing, each with a `reason`:
  - `chronology` — a director scheduled a feeder at a **later** clock time than the match it feeds (physically impossible; times are never changed)
  - `orderingDeadlock` — a same-column ordering cycle that had to be broken to make progress

Confirm the result by re-running `proConflicts` — every normally-placed row is conflict-free by construction.

---

### publicFindCourt

Finds a court with privacy policies applied for public APIs.

```js
const { court } = engine.publicFindCourt({
  courtId, // required
  policyDefinitions, // optional
});
```

---

### removeCourtGridBooking

Removes a booking from the court grid.

```js
engine.removeCourtGridBooking({
  bookingId, // required
});
```

---

### removeEventMatchUpFormatTiming

Removes custom format timing for an event.

```js
engine.removeEventMatchUpFormatTiming({
  eventId, // required
});
```

---

### reorderUpcomingMatchUps

Reorders a time-ordered list of upcoming matchUps by rotating their `scheduledTime`s: with `firstToLast` the
first matchUp takes the last one's time and each other matchUp the time of the one before it; without it, the
rotation runs the other way. Only `scheduledTime` moves; `courtOrder`, court and venue are left as they are.

```js
engine.reorderUpcomingMatchUps({
  matchUpsContextIds, // required - array of { tournamentId, drawId, matchUpId, schedule } in time order
  firstToLast, // optional boolean - direction of reorder
  overrideScheduleLock, // optional boolean - rotate locked times too (the locks stay)
});
```

Every matchUp is resolved before any time is written: if one cannot be (unknown draw or matchUp, invalid time)
the call returns `MODIFICATIONS_FAILED` and nothing is changed. If a [schedule lock](../concepts/schedule-locks.mdx)
pins the time of any of them, the call returns `SCHEDULE_LOCKED` with `context.lockedMatchUpIds` and nothing is
changed: the rotation moves every time in the list, so it is not applied in part.

**Example**:

```js
const matchUpsContextIds = [
  { tournamentId: 't1', drawId: 'd1', matchUpId: 'm1', schedule: { scheduledTime: '10:00' } },
  { tournamentId: 't1', drawId: 'd1', matchUpId: 'm2', schedule: { scheduledTime: '11:00' } },
  { tournamentId: 't1', drawId: 'd1', matchUpId: 'm3', schedule: { scheduledTime: '12:00' } },
];

engine.reorderUpcomingMatchUps({
  matchUpsContextIds,
  firstToLast: true, // m1 → 12:00, m2 → 10:00, m3 → 11:00
});
```

---

### removeMatchUpCourtAssignment

Removes court assignment from a matchUp while preserving other schedule details.

```js
engine.removeMatchUpCourtAssignment({
  tournamentId, // optional - for multi-tournament scenarios
  courtDayDate, // required - date string
  matchUpId, // required
  drawId, // required
});
```

**Example**:

```js
engine.removeMatchUpCourtAssignment({
  courtDayDate: '2024-06-15',
  matchUpId: 'match-123',
  drawId: 'draw-456',
});
```

**Use Case**: Remove court assignment while keeping date/time (e.g., court becomes unavailable, need to reassign).

---

## Team Match Scheduling

### allocateTeamMatchUpCourts

Allocates courts to individual matchUps within a TEAM matchUp (tie). Used for team competitions where multiple singles/doubles matches occur simultaneously.

```js
engine.allocateTeamMatchUpCourts({
  matchUpId, // required - team matchUp ID
  drawId, // required
  courtIds, // required - array of courtIds to allocate
  removePriorValues, // optional boolean - clear previous allocations
});
```

**Example**:

```js
// Team match with 4 singles and 2 doubles
engine.allocateTeamMatchUpCourts({
  matchUpId: 'team-match-1',
  drawId: 'draw-456',
  courtIds: ['court-1', 'court-2', 'court-3', 'court-4'],
});
```

**Use Case**: Davis Cup or Fed Cup style ties where multiple matches play simultaneously on different courts.

---

## Scheduling Profile Management

### setSchedulingProfile

Stores a scheduling profile that defines which rounds are scheduled on which dates and venues. Used by `scheduleProfileRounds()`.

```js
engine.setSchedulingProfile({
  schedulingProfile, // required - profile object
});
```

**Profile Structure**:

```js
const schedulingProfile = [
  {
    scheduleDate: '2024-06-15',
    venues: [
      {
        venueId: 'venue-1',
        rounds: [
          {
            drawId: 'draw-1',
            structureId: 'structure-1',
            roundNumber: 1,
          },
          {
            drawId: 'draw-2',
            structureId: 'structure-2',
            roundNumber: 1,
          },
        ],
      },
    ],
  },
  {
    scheduleDate: '2024-06-16',
    venues: [
      {
        venueId: 'venue-1',
        rounds: [
          {
            drawId: 'draw-1',
            structureId: 'structure-1',
            roundNumber: 2,
          },
        ],
      },
    ],
  },
];

engine.setSchedulingProfile({ schedulingProfile });
```

**See**: [Scheduling Profile Concepts](../concepts/scheduling-profile.mdx) for detailed profile structure and creation.

---

## Schedule Scenario Methods

Named alternate ("contingency") scheduling plans stored first-class on `tournamentRecord.scheduling.scenarios`. See **[Schedule Scenarios](../concepts/schedule-scenarios.mdx)** for the full concept.

### addScheduleScenario

Creates an alternate scheduling plan. `scenarioName` is required; `scenarioId` is generated when omitted. The scenario is validated before it is stored.

```js
const { scenarioId } = engine.addScheduleScenario({
  scenario: {
    scenarioName, // required
    scheduledDates, // optional - ISO 'YYYY-MM-DD' dates the plan re-plans
    placements, // ScenarioPlacement[] — a bulkScheduleMatchUps matchUpDetails payload
  },
});
```

---

### getScheduleScenarios / getScheduleScenario

Reads stored scenarios.

```js
engine.getScheduleScenarios(); // → { scenarios: ScheduleScenario[] }
engine.getScheduleScenario({ scenarioId }); // → { scenario } | { error }
```

---

### updateScheduleScenario

Merges `updates` over an existing scenario (preserving `scenarioId`) and re-validates.

```js
engine.updateScheduleScenario({
  scenarioId, // required
  updates, // Partial<ScheduleScenario>
});
```

---

### removeScheduleScenario

```js
engine.removeScheduleScenario({ scenarioId });
```

---

### applyScheduleScenario

Commits a scenario's placements as the official schedule via `bulkScheduleMatchUps`. **Skips completed matchUps** by default; `removePriorValues` defaults to `true`. The scenario is left in place after commit.

```js
const result = engine.applyScheduleScenario({
  scenarioId, // required
  removePriorValues, // optional - default true
  scheduleCompletedMatchUps, // optional - default false
});
// → { success: true, applied: <matchUps scheduled>, ... }
```

---

### validateScheduleScenario

**8.0.0 engine-removal candidate.** This 7.x route remains available pending review. The full reference has moved to [`validateScheduleScenario`](/docs/implementation/validation/validateScheduleScenario). Package-export status is a separate decision.

### getScenarioScheduleProjection

The unofficial "Plan mode" overlay — the official schedule with a scenario's placements laid on top, without writing to any matchUp. Cells are tagged `official` / `planned`; conflicts come from `mergeFacilitySchedule`.

```js
const { scheduleCells, grid, conflicts, plannedMatchUpIds, skippedCompletedMatchUpIds } =
  engine.getScenarioScheduleProjection({
    scenarioId, // required
    venueIds, // optional - restrict to these venues
  });
```

---

### getScheduleScenarioStatus

Reconciles a scenario against current state so a client can alert when a plan is out of date and preview what a commit would do.

```js
engine.getScheduleScenarioStatus({ scenarioId });
// → { outOfDate, currentHash, basedOnHash, completedMatchUpIds, missingMatchUpIds, applicableMatchUpIds }
```

---

### getScenarioScheduleView

Grid-ready projection for a client "Plan mode" — returns the same shape as `competitionScheduleMatchUps` (`dateMatchUps` / `rows` / `courtsData` / `courtPrefix`) with the scenario's placements laid on top, so the client renders the plan through its existing grid path. The overlay is applied to a **throwaway deep copy**; the real records / engine state are never mutated.

```js
const view = engine.getScenarioScheduleView({
  scenarioId, // required
  matchUpFilters, // e.g. { scheduledDate }
  withCourtGridRows, // default true
  minCourtGridRows,
});
// → { dateMatchUps, rows, courtsData, courtPrefix, plannedMatchUpIds, skippedCompletedMatchUpIds, ... }
```

---

### rebaseScheduleScenario

Re-anchors a scenario's drift baseline (`basedOnHash`) to the official schedule as it stands now — the explicit "I've reconciled, this plan is current" action.

```js
engine.rebaseScheduleScenario({ scenarioId });
```

---

### setMatchUpDailyLimits

Sets daily limits for participant matchUp participation.

```js
engine.setMatchUpDailyLimits({
  dailyLimits, // required - limits object
});
```

**Example**:

```js
engine.setMatchUpDailyLimits({
  dailyLimits: {
    SINGLES: 2,
    DOUBLES: 1,
    total: 2,
  },
});
```

---

### setMatchUpHomeParticipantId

Designates a home participant for a matchUp (for home/away displays).

```js
engine.setMatchUpHomeParticipantId({
  matchUpId, // required
  drawId, // required
  participantId, // required
});
```

---

### toggleParticipantCheckInState

Toggles participant check-in status for scheduling.

```js
engine.toggleParticipantCheckInState({
  participantId, // required
});
```

---

### validateSchedulingProfile

Validates a scheduling profile for errors or conflicts.

```js
const { valid, errors } = engine.validateSchedulingProfile({
  schedulingProfile, // required
});
```

---

## addMatchUpScheduleItems

Adds multiple schedule attributes to a matchUp in a single call. This is the method used internally by `setMatchUpStatus` when a `schedule` object is provided, and is the most efficient way to set date, time, court, and venue together.

```js
engine.addMatchUpScheduleItems({
  matchUpId, // required — target matchUp
  drawId, // required — resolved to drawDefinition by engine
  schedule: {
    // required — schedule attributes to set
    scheduledDate, // optional — 'YYYY-MM-DD'
    scheduledTime, // optional — 'HH:mm' or ISO datetime
    startTime, // optional — actual start time
    endTime, // optional — actual end time
    resumeTime, // optional — resume after suspension
    stopTime, // optional — suspension time
    courtId, // optional — assigned court
    venueId, // optional — assigned venue
    courtOrder, // optional — order on court
    homeParticipantId, // optional — home team participant
    calledAt, // optional — ISO instant; call to court. `null` clears
    courtIds, // optional — for TEAM matchUps, allocate courts
    allocatedCourts, // optional — alias for courtIds; accepts the read-side shape
  },
  removePriorValues, // optional boolean — clear existing schedule timeItems first
  checkChronology, // optional boolean — defaults to true; warn on time ordering (see Schedule order below)
  errorOnAnachronism, // optional boolean — return error on chronological violations
  plannedOrder, // optional boolean — default true; false: only a played matchUp orders (see Schedule order below)
  errorOnUnknownAttributes, // optional boolean — error instead of warning on attributes that will not be written
  proConflictDetection, // optional boolean — detect pro scheduling conflicts
  disableNotice, // optional boolean — suppress modification notices
});
```

### Schedule order: a matchUp is never placed at or before a matchUp it depends on

Every write that moves a matchUp's `scheduledDate` or `scheduledTime` (this method, `addMatchUpScheduledTime`,
`addMatchUpScheduledDate`, `bulkScheduleMatchUps`, `bulkRescheduleMatchUps` and the schedulers) is refused with
`ANACHRONISM`, writing nothing, when it would place the matchUp **at or before a matchUp it depends on**, or **after a
matchUp that depends on it**.

This began as the _played_ order (only a played matchUp imposed anything). Since 2026-10-30 it binds **plans as well as
history**: an impossible order is impossible whether or not the earlier matchUp has been played.

- **Imposes order**: every matchUp but a BYE. Walkovers, defaults and double exits order like any other matchUp.
- **Depends on**: winner and loser links, feed-in, qualifying to main, round robin group to playoff, however far
  downstream: a quarterfinal is not placed after a dated final because the semifinal between them is not yet dated.
  AD_HOC rounds and the rounds of a round robin carry no links and impose no order.
- **Before**: scheduled against scheduled. An earlier date; or the same date, both times set, at or before. A same-day
  placement without a time, or a matchUp without a date, proves nothing. Recorded start and end times are judged
  separately (below).
- Only a write that **moves** the matchUp is asked: a court, a court order, an official, or writing back an unchanged
  schedule is never refused, even when the stored order is already wrong.
- `checkChronology: false` does not waive it (that switch only turns off the `ANACHRONISM` _warning_ for a same-day
  placement without times, which the order cannot judge). Bulk writes are judged on the state the whole batch leaves,
  and refused whole, before any of it is written; a batch on a draw with nothing yet placed is judged against itself.
- `plannedOrder: false` (on `addMatchUpScheduleItems`, `bulkScheduleMatchUps` and `bulkScheduleTournamentMatchUps`)
  keeps the played order only: an unplayed matchUp imposes nothing, as before 2026-10-30. It exists for a caller whose own
  placements (a drag on a schedule grid, say) are not yet held to the planned order.

The refusal's `context.blockingMatchUps` names each blocking matchUp (`relation: 'source'`, `'playedSource'` or
`'dependent'`), with its date, time, status and round, so a client can say which matchUp stands in the way.
[`getMatchUpScheduleBounds`](#getmatchupschedulebounds) answers the same question before the write: where the matchUp
may go.

```js
const result = engine.addMatchUpScheduleItems({ matchUpId: finalId, drawId, schedule: { scheduledTime: '09:00' } });
// semifinal placed at 10:00 → result.error === ANACHRONISM; result.context.blockingMatchUps[0].relation === 'source'
```

### Recorded times of linked matchUps

The recorded `startTime` and `endTime` of matchUps linked as above may not conflict: a source must have **ended by the
time its dependent started**, and must have started first. A source may end the very minute its dependent starts. An
end that falls after a dependent's _scheduled_ time is fine: only recorded times are compared.

- A recorded time is read on the matchUp's scheduled date; an end past midnight falls on the next day, as
  `addMatchUpEndTime` records it. A matchUp with no scheduled date proves nothing.
- Asked of every `startTime` or `endTime` write (this method, `bulkScheduleMatchUps`, `addMatchUpStartTime`,
  `addMatchUpEndTime`), with the start and end of one write judged together, before anything is written. A schedule
  given to `setMatchUpStatus` with an outcome is judged before the outcome lands, so a refusal leaves the score unset.
- Writing back a stored value is never refused, though an older engine may have stored a conflict.

The refusal is `ANACHRONISM`, with `context.blockingMatchUps` naming each conflicting matchUp's `startTime` and
`endTime`. A completed matchUp's times stay editable after the fact (`scheduleCompletedMatchUps` on the bulk writes).

### getMatchUpScheduleBounds

Where a matchUp may be scheduled, and when its recorded times may fall, without breaking the order of the matchUps
linked to it. A client limits its date and time pickers to these; the writes refuse what falls outside them. The bounds
read the same neighbours the writes judge, so the two agree. `matchUpActions` attaches them to its `SCHEDULE_DATE`,
`SCHEDULE_TIME`, `START` and `END` actions as `bounds`.

```js
const { bounds } = engine.getMatchUpScheduleBounds({
  matchUpId, // required
  drawId, // required — resolved to drawDefinition by engine
  plannedOrder, // optional boolean — default true; false bounds by played matchUps only, as the writes' option
});

const {
  earliestDate, // the tournament's start, or the latest dated source's date
  latestDate, // the tournament's end, or the earliest dated dependent's date
  scheduledAfter, // { date, time, inclusive: false } — on earliestDate, a scheduledTime must come after it
  scheduledBefore, // { date, time, inclusive: false } — on latestDate, a scheduledTime must come before it
  recordedAfter, // { date, time, inclusive } — a recorded start or end may not come before it
  recordedBefore, // { date, time, inclusive } — a recorded start or end may not come after it
  orderedBy, // [{ matchUpId, relation: 'source' | 'dependent', scheduledDate, scheduledTime, startTime, endTime, roundNumber }]
} = bounds;
```

A date between `earliestDate` and `latestDate` is accepted; on a boundary date a placement with no time proves nothing
and is accepted too, while a time must fall strictly inside `scheduledAfter` / `scheduledBefore`.

### `calledAt`

`calledAt` is an **actual-play** attribute and sits with `startTime` / `stopTime` /
`resumeTime` / `endTime` — none of which a [schedule lock](#setmatchupschedulelock)
guards, so a pinned matchUp can still be called to court, started, suspended and
completed.

Its `undefined` handling differs from `setMatchUpCalledAt`
**deliberately**. Called directly, that method reads `undefined` as _clear_. Here an
omitted key destructures to `undefined` too, so honouring that reading would make
every partial schedule write silently wipe a call-to-court:

```js
engine.addMatchUpScheduleItems({ matchUpId, drawId, schedule: { calledAt: isoInstant } });

// later, a re-time that says nothing about calledAt — the call survives
engine.addMatchUpScheduleItems({ matchUpId, drawId, schedule: { scheduledTime: '15:00' } });

// explicit clear
engine.addMatchUpScheduleItems({ matchUpId, drawId, schedule: { calledAt: null } });
```

### Attributes that will not be written are reported

The method writes the attributes it recognises and, before 6.32.0, silently ignored
everything else while still returning `{ success: true }`. Two real attributes were
lost that way — `allocatedCourts` (see below) and `calledAt`.

Incoming keys are now sorted three ways:

| bucket            | attributes                                                                                                                                                                                                                 | behaviour              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **written**       | `scheduledDate`, `scheduledTime`, `startTime`, `stopTime`, `resumeTime`, `endTime`, `calledAt`, `courtId`, `courtIds`, `allocatedCourts`, `venueId`, `courtOrder`, `courtAnnotation`, `timeModifiers`, `homeParticipantId` | applied                |
| **derived**       | `isoDateString`, `milliseconds`, `time`, `venueName`, `venueAbbreviation`, `courtName`, `averageMinutes`, `recoveryMinutes`, `timeAfterRecovery`, `typeChangeRecoveryMinutes`, `typeChangeTimeAfterRecovery`, `endDate`    | ignored silently       |
| **anything else** | `lock`, `official`, `scorekeeper`, `timekeeper`, `scoredTime`, misspellings                                                                                                                                                | returned in `warnings` |

The **derived** bucket exists so that read-modify-write keeps working: a hydrated
schedule carries a dozen keys the caller cannot omit and cannot influence, and
warning about those would make every round-trip noisy.

```js
const { warnings } = engine.addMatchUpScheduleItems({
  matchUpId,
  drawId,
  schedule: { scheduledDate, official: personId },
});
// warnings → [{ code: 'UNWRITABLE_SCHEDULE_ATTRIBUTES', attributes: ['official'] }]
```

`lock` is in the reported bucket on purpose — silently discarding a director's pin is
the worst of these to discover later. Assign officials through the
[officiating governor](./officiating-governor.md) and pin with
[`setMatchUpScheduleLock`](#setmatchupschedulelock).

Warnings rather than errors, because callers round-trip locked and scored matchUps
today. Pass `errorOnUnknownAttributes: true` to make it a hard error instead — the
same escalation `errorOnAnachronism` provides for chronology:

```js
const result = engine.addMatchUpScheduleItems({
  matchUpId,
  drawId,
  errorOnUnknownAttributes: true,
  schedule: { scheduledDate, nonsense: true },
});
// result.error → UNWRITABLE_SCHEDULE_ATTRIBUTES; nothing is written
```

### Court allocation: `courtIds` in, `allocatedCourts` out

A TEAM matchUp's court allocation is **written** as bare `courtIds` and **read back** as
`schedule.allocatedCourts` — court objects (`{ courtId, venueId }`, hydrated with `courtName` /
`venueName`). Because the write path originally destructured only `courtIds`, a schedule object read
off one matchUp and applied to another silently carried no allocation: the unrecognised key was
ignored, with no error and no warning.

`allocatedCourts` is now accepted as an alias, in either shape:

```js
engine.addMatchUpScheduleItems({ matchUpId, drawId, schedule: { allocatedCourts: [courtIdA, courtIdB] } });
engine.addMatchUpScheduleItems({ matchUpId, drawId, schedule: { ...anotherMatchUp.schedule } }); // round-trips
```

An explicit `courtIds` wins when a caller supplies both. A non-array `allocatedCourts` is ignored
rather than treated as an error, since it cannot have come from a read.

### Grid position is cleared on a date change

`courtOrder` and `courtId` describe a matchUp's position on **one specific day's**
schedule grid. When a call changes `scheduledDate` to a different day and does
**not** supply an explicit `courtOrder`/`courtId`/`venueId` in the same `schedule`
object, the engine removes them so the matchUp does not inherit the prior day's row
on its new day.

- **The venue goes with the court** (CA 2026-10-27). A matchUp that had a court
  loses its `venueId` too: it came with the court. A matchUp placed at a venue
  without a court (as `scheduleProfileRounds` and `scheduleMatchUps` place one)
  keeps its `venueId`: it is where the match is played, and a moved matchUp keeps
  holding a court of that venue (see
  [court bookings](../concepts/scheduling-pipeline.md#39-court-bookings)).
- The attributes are removed from `matchUp.schedule`, not written as empty values.
- A date-only re-date (e.g. `schedule: { scheduledDate, scheduledTime }`) returns
  the matchUp to the unplaced pool for the new day — it keeps its date and time but
  is no longer pinned to a court or row.
- Re-applying the **same** date leaves the existing grid position untouched.
- Supplying an explicit `courtOrder` (and/or `courtId`/`venueId`) alongside the new
  date is honored verbatim — a deliberate "move to a new day and row" is respected.

This also governs `bulkScheduleMatchUps`, which delegates to
`addMatchUpScheduleItems` per matchUp, and the `daysChange` of `bulkRescheduleMatchUps`. The lower-level `addMatchUpScheduledDate`
primitive does **not** clear grid position; use `addMatchUpScheduleItems` (the path
TMX and integrations use) for date changes.

### Assigning a BYE preserves scheduling

A tournament director may schedule an entire event and then swap participants around,
placing byes temporarily or permanently. The engine therefore **never discards scheduling
on its own**: a matchUp that becomes a BYE keeps its court, courtOrder and times.

`assignDrawPositionBye` (and `setMatchUpStatus` with `matchUpStatus: 'BYE'`) accepts
`preserveScheduling`:

| value       | behaviour                                                                                                                                                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `true`      | keep the placement                                                                                                                                                                                                                                                                      |
| `false`     | release `allocatedCourts`, `courtId`, `venueId`, `courtAnnotation`, `courtOrder`, `scheduledDate`, `scheduledTime`, `timeModifiers` — on both `matchUp.schedule` and legacy `timeItems`. Actual-play timestamps (`startTime` / `stopTime` / `resumeTime` / `endTime`) are never touched |
| `undefined` | preserve — **except** on an operator position-action against a matchUp that already holds scheduling, which returns `MATCHUP_HAS_SCHEDULING`                                                                                                                                            |

```js
engine.assignDrawPositionBye({ drawId, structureId, drawPosition, isPositionAction: true });
// → { error: MATCHUP_HAS_SCHEDULING } when that drawPosition's matchUp holds a court or a time

engine.assignDrawPositionBye({ drawId, structureId, drawPosition, preserveScheduling: false });
// → { success: true }, court released
```

The refusal is deliberately scoped to `isPositionAction` — the flag the engine's own
`positionActions` payload carries, i.e. an action an operator chose. Engine-internal callers
(`directLoser` while a score is being entered, `doubleExitAdvancement`, `positionSwap`, draw
generation, and this function's own BYE cascade) never receive it and take the preserving
default, so entering a score can never hard-fail because the draw happened to be scheduled.
An explicit `preserveScheduling: false` propagates through the cascade: one operator decision
covers every matchUp that BYE reaches.

### A BYE that holds a court is shown, not hidden

BYE matchUps are excluded from `competitionScheduleMatchUps` by default. Pass
**`courtByeMatchUps: true`** to include the ones holding a `courtId`, so they occupy a cell on
the schedule grid. `proConflicts` annotates them `CONFLICT_BYE_SCHEDULED` at `SCHEDULE_WARNING`
severity — a real double-booking or participant conflict on the same matchUp still outranks it.

This is what keeps a preserved placement honest. Before it, a byed matchUp kept its court and
disappeared from every schedule surface at once: the slot read as free, the next matchUp was
dropped onto it, and `proConflicts` reported a `courtDoubleBooking` naming a partner that had no
cell to click through to (production, 2026-08-22). Making the occupant visible — rather than
deleting the director's placement — is the fix.

Byes holding only a date/time occupy no cell and are not included; the WARNING tracks court
occupancy specifically.

### A produced exit holding a court is treated the same way

An exit the cascade produces — a `WALKOVER` or `DEFAULTED` stamped onto a side by an upstream double
exit, with nobody arriving to contest it — will never be played either, and its placement is
preserved for the same reason. Since 7.5.0 it is shown the same way: `courtByeMatchUps: true`
includes a court-holding produced exit beside the byes, and `proConflicts` annotates it
`CONFLICT_EXIT_SCHEDULED` at `SCHEDULE_WARNING` — a code of its own, so a client can offer
"release" against a walkover and "re-seat" against a BYE. A walkover a director recorded between
two participants is not in this set: that is the director's own act.

### The mutation that preserved a placement says so

`setMatchUpStatus` returns, on success, a `warnings` array when the call left a BYE or a produced
exit holding a court or a time:

```js
{
  success: true,
  warnings: [{ code: 'SCHEDULE_PRESERVED_ON_EXIT', matchUpIds: ['...', '...'] }],
}
```

The draw is right — the placement was preserved — but the client that just made the mutation is the
one that can offer "release these slots?", which maps to the same `preserveScheduling: false` the
operator's BYE action takes. The read-side flags above tell a scheduler view; the payload tells the
scorer. Only matchUps that became unplayable in that call are named, so a BYE reported when it was
placed is not repeated on every later score. `executionQueue` passes the field through unchanged.

---

## setMatchUpCalledAt

Sets or clears `matchUp.schedule.calledAt` — the ISO instant captured when a tournament director deliberately places a matchUp on the TMX active strip, signalling that it is imminent.

```js
engine.setMatchUpCalledAt({
  matchUpId, // required
  drawId, // required
  calledAt, // ISO timestamp; `null` or `undefined` CLEARS the previous value
  disableNotice, // optional boolean
});
```

Called directly, `undefined` reads as **clear**. That differs deliberately from [`addMatchUpScheduleItems`](#calledat), where an omitted key must not wipe a call to court.

### A `calledAt` before the tournament starts is refused

Calling a match to court is a physical act at the venue, so it cannot happen before the venue opens. `addMatchUpScheduledDate` already refuses a `scheduledDate` outside the tournament's range; a `calledAt` predating `startDate` is the same class of impossibility and was previously accepted without complaint.

**The check needs a time zone to be correct.** `startDate` is a bare venue-local calendar day while `calledAt` is a UTC instant, and comparing them without a zone compares two different things. In Sydney (UTC+10) a 09:00 call on opening day is 23:00 UTC on the **previous** day, so a naive UTC-day comparison would reject a perfectly legitimate call — the opposite of the failure being fixed, and worse, because it blocks the running desk.

So the venue's zone resolves the instant to its real local day, via the same `localTimeZone` the rest of the venue time frame already depends on.

**Without a resolvable zone the guard weakens rather than guesses.** Many tournaments carry neither a `localTimeZone` nor a venue address, and there is then no exact answer to "which local day was that?" — only a bound. The furthest-ahead zone in use is UTC+14 (Kiritimati), so local midnight opening the tournament can be no earlier than `startDate 00:00 UTC − 14h`:

- an instant before that bound is before the start in **every** zone that exists, and is refused;
- an instant after it is opening day **somewhere**, and is admitted.

That is the most the check can soundly say without a zone. It is deliberately weaker than the zoned form — an evening-before call in New York is caught only when the tournament names its zone — because refusing a real call stops play, which is by far the worse of the two failures.

`endDate` is **not** guarded. A match called near midnight on the final day legitimately runs past it, and the last day's play routinely spills over; there is no equivalent impossibility on that side.

---

## Auto-captured `scoredTime`

`matchUp.schedule.scoredTime` is a first-class ISO-8601 timestamp that the engine
captures **automatically** the first time a matchUp becomes scored — that is, when
a score with value, a `winningSide`, or a completed `matchUpStatus` is applied via
`setMatchUpStatus`. No caller action is required.

Behavior:

- **Captured once.** The first scored mutation stamps the timestamp; later score
  corrections preserve the original value (it records when the result first
  entered the system, not the latest edit).
- **Cleared on removal.** If the score is removed (the matchUp is reset to
  `TO_BE_PLAYED`), `scoredTime` is deleted, so a subsequent re-score gets a fresh
  stamp.
- **Proxy for completion time.** It is a lightweight stand-in for "when did this
  match actually finish" when no explicit `END_TIME` time-item was recorded —
  useful for analytics on tournament-director behaviour (how promptly results are
  entered). An actual `endTime`, when present, supersedes it.
- **No legacy mirror.** Like `calledAt`, `scoredTime` is a CODES-native schedule
  attribute with no legacy time-item equivalent — it is always read from and
  written to `matchUp.schedule.scoredTime`.

This is engine-generated state, not an input: it is treated as read-only by
consumers and reflects the engine's own capture, not a value supplied by the
caller.

---

## `timeModifiers` are suppressed once a matchUp's start is settled

A `FOLLOWED_BY` or `AFTER_REST` / `NOT_BEFORE` annotation is a promise about **when a
matchUp may begin**. Once that question is settled the annotation is not merely
redundant — on a published order of play it is misinformation, telling a player and a
referee that a match is waiting on something that has already happened.

From **6.32.0**, hydration omits `schedule.timeModifiers` once either of two local
signals says the start is settled:

- **Called to court** — `schedule.calledAt` is present. A match that has been called
  _is_ on court; "followed by" is moot for it whatever else on that court did or did
  not finish.
- **Any score at all** — a single game is enough, and the partial case is the one that
  matters: that is the state a live match sits in for an hour while the annotation
  goes on claiming it has not begun. A completed status settles it too, walkovers
  included.

### Suppressed, never cleared

The stored value is untouched. That is what makes the behaviour reversible without a
rule of its own:

```js
engine.addMatchUpScheduleItems({ matchUpId, drawId, schedule: { timeModifiers: ['FOLLOWED_BY'] } });

engine.setMatchUpStatus({ matchUpId, drawId, outcome }); // any score
engine.findMatchUp({ matchUpId, inContext: true }).matchUp.schedule.timeModifiers; // undefined

engine.setMatchUpStatus({ matchUpId, drawId, outcome: { score: undefined, winningSide: undefined } });
engine.findMatchUp({ matchUpId, inContext: true }).matchUp.schedule.timeModifiers; // ['FOLLOWED_BY']
```

Consequences worth knowing:

- **Read-side only.** The write path reads storage directly, so adding and removing
  modifiers still operates on the real value — a UI that renders annotation controls
  from a _hydrated_ matchUp will show none on a settled matchUp, which is intended.
- **Subscribers get it for free.** Score entry and `setMatchUpCalledAt` already emit
  notices, and subscribers receive matchUps through hydration, so no new notice type
  and no new mutation are involved.
- **Publishing inherits it.** Embargo and `scheduleVisibilityFilters` are applied to
  the hydrated schedule, downstream of this.
- **The record still carries the value.** A TODS export will contain a
  `timeModifiers` entry that no longer displays anywhere. That is the price of not
  destroying an operator's stated intent.

---

## Readiness and rest queries

Two read-only queries answer, for **one** matchUp, what conflict reporting answers for a whole day.
Both were built in TMX behind a relocation seam and moved here in 7.x, so the payload shapes are
unchanged from the client analyses they replace.

### getMatchUpReadiness

Can this placement happen at the time it is scheduled for? Anchored on the matchUp's own
`scheduledTime`; declines to evaluate when there is not one.

```js
const { readiness } = tournamentEngine.getMatchUpReadiness({ matchUpId });
```

| parameter   | type              | notes                                                           |
| ----------- | ----------------- | --------------------------------------------------------------- |
| `matchUpId` | string            | **required**                                                    |
| `matchUps`  | HydratedMatchUp[] | optional; supply hydrated matchUps to avoid a second resolution |

Returns `{ readiness }`, either `{ evaluated: false, reason }` — `unknownMatchUp`, `bye`,
`completed`, `notScheduled`, `noTime` — or `{ evaluated: true, findings }`. Each finding carries a
`kind` of `overlap`, `dependency`, `recovery` or `undetermined`, a `severity`, the participants and
matchUps involved, and a `notBefore` clock when the blocker can be projected. Findings are ordered
strongest-first.

Since 7.7.0 a `dependency` finding also carries `readyAt`: the court-free `notBefore` plus the winner's
recovery, omitted when recovery is zero ("finishes ~15:30 → ready ~16:30"). An overlap is dated by when
the neighbour actually went on (`startTime`, then `scheduledTime`), and a neighbour nobody played (a
`WALKOVER` or `DOUBLE_WALKOVER`) projects no recovery window. The payload types are exported by name —
`ReadinessResult`, `ReadinessFinding` — so a consumer can type against them.

### getParticipantRest

How long has each individual in this matchUp actually had off, and is it enough?

```js
const { rest } = tournamentEngine.getParticipantRest({ matchUpId, asOf: new Date().toISOString() });
```

| parameter          | type              | notes                                                                      |
| ------------------ | ----------------- | -------------------------------------------------------------------------- |
| `matchUpId`        | string            | **required**                                                               |
| `asOf`             | ISO string        | **required** — the factory holds no clock; the caller supplies the instant |
| `scheduledDate`    | `YYYY-MM-DD`      | the day to measure; defaults to the matchUp's own                          |
| `timeZone`         | IANA zone         | defaults to the tournament's `localTimeZone`; DST-correct                  |
| `utcOffsetMinutes` | number            | fixed-offset fallback when no zone is available                            |
| `matchUps`         | HydratedMatchUp[] | optional; as above                                                         |

Returns `{ rest }`, either `{ evaluated: false, reason }` — adding `noAsOf` and `noDay` to the list
above — or `{ evaluated: true, asOf, scheduledDate, rows }`, one row per individual, ordered
worst-first. Every row names the ladder rung its anchor came from, so an inferred figure never reads
as a measured one.

Since 7.7.0 the result adds one `pendingUpstream` row per undecided side, built from the feeder that
decides it: `onCourt`, a projected `readyAt`, a `pending:<feederMatchUpId>` source and an all-zero
load, so a UI can show who is still to come. Both sides undecided gives two rows. `nameFor` returns a
doubles entrant's own name rather than the pair's. `RestResult` and `RestRow` are exported by name.

`getParticipantRest` answers one matchUp. To answer many, which a schedule does once per card, use
`getParticipantsRest`; a single call is answered as a batch of one, so the two cannot disagree.

### getParticipantsRest

Participant rest for many matchUps in one call. `rests[i]` answers `requests[i]` exactly as
`getParticipantRest` answers that request alone.

```js
const asOf = new Date().toISOString();
const { rests } = tournamentEngine.getParticipantsRest({
  requests: [
    { matchUpId: 'm1', asOf },
    { matchUpId: 'm2', asOf, scheduledDate: '2026-09-12' },
  ],
});
```

| parameter          | type                                    | notes                                                        |
| ------------------ | --------------------------------------- | ------------------------------------------------------------ |
| `requests`         | `{ matchUpId, asOf, scheduledDate? }[]` | **required**; each request carries its own instant and day   |
| `timeZone`         | IANA zone                               | defaults to the tournament's `localTimeZone`; DST-correct    |
| `utcOffsetMinutes` | number                                  | fixed-offset fallback when no zone is available              |
| `matchUps`         | HydratedMatchUp[]                       | optional; resolved from the record once per call when absent |

Returns `{ rests }`, one `RestResult` per request, in request order. Results are aligned with the
requests rather than keyed by matchUpId, so one matchUp asked about on two days gets two answers. A
request with no `matchUpId` refuses the whole call with `MISSING_MATCHUP_ID` and
`context.requestIndex`. There is no implicit "every matchUp": the caller names what it wants, because
different cards need different days and instants (a past day is measured as of that day, today as of now).

Why a batch: everything that does not depend on which matchUp is asked about is built once per call.
Each matchUp's times are normalized once (rather than once per answer), the timing rules and daily
limits are read once, and the day's begun matchUps are grouped by individual once per distinct
`(scheduledDate, asOf)`. Asking about every matchUp of a 63-matchUp draw costs 189 zoned conversions
batched against 6,048 asked one by one; the gap grows with the size of the draw.

Rest counts up, so a result describes its `asOf` and nothing later: a caller repainting rest on a timer
asks again with the new instant rather than keeping an earlier answer.

## Event playing days

An event plays on a calendar day when the day lies in the tournament's range and in the event's range, is one
of the tournament's `activeDates` (else one of its `weekdays`), and is one of the event's `activeDates` (else one
of its `weekdays`). `setEventDates` writes the event's range, `activeDates` and `weekdays`;
`setTournamentDates` writes the tournament's.

- `activeDates` win over `weekdays` at both levels when both are set.
- An empty array means **unset**, never "no days".
- The weekday is that of the calendar day, read in UTC, so no time zone moves it.
- An event range that does not intersect the tournament range (a stale range, left behind when the tournament
  moved) is **ignored**, and the tournament range applies. `getEventInconsistencies` reports such an event as
  `EVENT_DATES_OUTSIDE_TOURNAMENT` (a warning).

When a day is not a playing day, the first rule that fails is the `reason`:

| reason                     | the day                                            |
| -------------------------- | -------------------------------------------------- |
| `INVALID_DATE`             | is not a `YYYY-MM-DD` calendar day                 |
| `OUTSIDE_TOURNAMENT_DATES` | lies outside the tournament's `startDate..endDate` |
| `OUTSIDE_EVENT_DATES`      | lies outside the event's `startDate..endDate`      |
| `TOURNAMENT_INACTIVE_DATE` | is not one of the tournament's `activeDates`       |
| `TOURNAMENT_WEEKDAY`       | falls on a weekday the tournament does not play    |
| `EVENT_INACTIVE_DATE`      | is not one of the event's `activeDates`            |
| `EVENT_WEEKDAY`            | falls on a weekday the event does not play         |

`getRounds({ scheduleDate })` excludes the rounds of events that do not play on `scheduleDate`, and each round
of an event whose own dates narrow the tournament's carries that event's `playingDates`.
`tournamentInfo.eventInfo` (`getTournamentInfo`), `getEventData`'s `eventInfo` and `getAllEventData` carry
`playingDates` under the same condition, so an unconstrained event adds nothing to a public payload.

### getEventPlayingDates

An event's playing days, enumerated over the tournament range. `constrained` is `true` when the event's own
range, `activeDates` or `weekdays` narrow the days the tournament plays.

```js
const { playingDates, constrained } = tournamentEngine.getEventPlayingDates({
  eventId, // required
});
// weekdays: ['SAT', 'SUN'] on a Fri 13 .. Mon 16 tournament
// → { playingDates: ['2026-11-14', '2026-11-15'], constrained: true }
```

### getEventDateIssues

The scheduled matchUps whose event does not play on their scheduled day. A matchUp's day is its
`scheduledDate`, else the date part of its `scheduledTime`. It is derived each time it is asked, so a misplaced
matchUp stays reported whoever placed it and whenever the event's dates changed.

```js
const { eventDateIssues } = competitionEngine.getEventDateIssues({
  scheduledDate, // optional - only matchUps scheduled on this day
  matchUpIds, // optional - only these matchUps
  eventIds, // optional - only these events' matchUps
});
// [{ matchUpId, eventId, tournamentId, scheduledDate, reason }]
```

---

## Related Documentation

- **[Scheduling Overview](../concepts/scheduling-overview.mdx)** - Core scheduling concepts
- **[Automated Scheduling](../concepts/automated-scheduling.md)** - Algorithm details and Garman formula
- **[Pro Scheduling](../concepts/pro-scheduling.md)** - Grid scheduling for professional tournaments
- **[Scheduling Profile](../concepts/scheduling-profile.mdx)** - Multi-day scheduling profiles
- **[Scheduling Conflicts](../concepts/scheduling-conflicts.mdx)** - Conflict detection and resolution
- **[Scheduling Policy](../policies/scheduling.md)** - Policy configuration
- **[Venues and Courts](../concepts/venues-courts.md)** - Venue setup and court availability
- **[Time Items](../concepts/timeItems.md)** - How schedules are stored
