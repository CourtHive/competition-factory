---
title: Clocks and Competition Time
sidebar_label: Competition Clock
---

## Overview

Scheduling unfolds over time. A match becomes due, a rest period ends and a publication embargo lifts as a tournament day progresses. The factory reads "now" through a clock it controls, so a test or a demonstration can inspect those transitions at an instant it chooses rather than whatever instant the test happens to run at.

"Now" is three different questions, and the factory answers each from its own source:

| Role                 | Answers                                         | Source in the factory                                   | Examples                                                                                            |
| -------------------- | ----------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Competition time** | What "now" means for a competition decision     | [`setCompetitionClock`](#configuring-the-clocks)        | live matchUp duration, embargoes and publication windows, "today" for eligibility                   |
| **Record time**      | Which instant a mutation writes into the record | [`setClock`](/docs/engines/engine-methods#setclock)     | `timeItem.createdAt`, `schedule.scoredTime`, `extension.createdAt`, a point's `timestamp`           |
| **Operational time** | When something happened in the running system   | not routed through the factory; it stays the real clock | authentication, access-grant expiry, request timeouts, audit receipt, database freshness timestamps |

**Competition time** is the instant the tournament is "at". Advancing it is how a demo moves a tournament day forward.

**Record time** is deterministic when you configure it. A fixed record clock is what makes a mocked tournament, a fixture or a golden corpus regenerate byte for byte.

**Operational time** describes the actual running system, and it is never virtualized. A host keeps authentication tokens, access grants, request timeouts and lock leases, receipt audits and database freshness on the real clock, whatever the competition clock says. A token that expired in real time stays expired in a demo that is paused at 09:00.

## What reads competition time

These factory reads decide something against "now", and they read the competition clock:

- **Live duration.** A matchUp's [duration](#live-matchup-duration) includes the running interval when it has started or resumed and not yet stopped or ended.
- **Embargoes and publication windows.** An [embargo](/docs/concepts/publishing/publishing-embargo) lifts when competition time passes it. Tournament visibility windows are judged the same way, unless the caller passes an explicit `asOf`.
- **"Today" for age categories.** Category age eligibility is judged on the tournament's calendar day at competition time (see [Time zones](#time-zones)). An explicit `consideredDate` wins.
- **Official certification and eligibility.** These are judged on the competition instant's UTC date, since an officiating engine has no tournament in scope.
- **Birth dates.** `modifyParticipant` refuses a `birthDate` later than competition time.
- **Schedule ordering.** When a schedule time has no date and the matchUp has no `scheduledDate`, the competition day is used to order it.

Everything a mutation writes stays on the record clock. So do a few reads that are not competition decisions:

- mutation-lock expiry;
- a report's `generatedAt`;
- the `updatedAt` [ordering stamps](#ordering-stamps-when-time-stands-still-or-runs-backward).

## Configuring the clocks

Both clocks are configured on the engine (or on `tools`) and are **process-wide**: one configuration covers every tournament and every request the process holds. They are run configuration, like `outcomePipeline`, not request state.

| Configuration                         | Record stamps        | Competition reads                |
| ------------------------------------- | -------------------- | -------------------------------- |
| nothing configured (the default)      | wall clock           | wall clock                       |
| `setClock(instant or fn)` only        | the configured clock | the configured clock (inherited) |
| `setCompetitionClock({ nowMs })` only | wall clock           | the provider                     |
| both, bound to one source (a demo)    | the shared source    | the shared source                |

With no competition provider installed, competition time **is** record time: `competitionNow()` returns exactly what `now()` returns. Installing a provider moves only the competition reads.

```js
// a fixture: deterministic stamps, and the tournament "at" a chosen instant
engine.setClock('2026-05-17T08:00:00.000Z');
engine.setCompetitionClock({ nowMs: () => Date.parse('2026-05-17T14:30:00Z') });

// a demo: both roles bound to one controllable source
const demo = { at: Date.parse('2026-05-17T09:00:00Z') };
engine.setClock(() => demo.at);
engine.setCompetitionClock({ nowMs: () => demo.at });

// back to defaults
engine.setCompetitionClock(); // competition time follows setClock again
engine.setClock(); // wall clock
```

The competition provider is **synchronous and numeric**: `{ nowMs(): number }`, epoch milliseconds. Because the process holds only one provider, a server cannot give one tournament a simulated day while another runs live. A demonstration needs its own process.

### One instant per engine call

Each engine call (`invoke`, `executionQueue`, their async twins, `ask`, a dry run, the mocks engine) reads each configured clock **once**, before any method runs. Every read inside that call returns those instants, including nested engine calls and the notification `timeStamp`, so a call never straddles two instants.

A server that supplies its own async global state provider scopes the captured instants per request through optional hooks:

- `getCapturedClock` / `setCapturedClock` for record time
- `getCapturedCompetitionClock` / `setCapturedCompetitionClock` for competition time

A provider without these hooks captures nothing, and nested reads then go to the source each time. They are deliberately not a process-wide fallback: that would hand one request's instant to every request running concurrently with it.

Outside an engine call (a governor or helper called directly), there is nothing to capture into, so every read goes to the source.

### Refusals

A configured clock that cannot produce a real instant is refused. It is never silently replaced by the wall clock, which would stamp a record with a time nobody configured.

| What is wrong                                                                                                | Inside an engine call                                | Outside an engine call |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ---------------------- |
| the source throws                                                                                            | `{ error: INVALID_DATE }` before anything is written | the read throws        |
| it returns something that is not a date (for the provider: not a number, `NaN`, `±Infinity`)                 | `{ error: INVALID_DATE }` before anything is written | the read throws        |
| it returns a **finite number outside the range a `Date` can represent** (beyond ±8.64e15 ms, such as `1e20`) | `{ error: INVALID_DATE }` before anything is written | the read throws        |

The last row matters because a finiteness check alone passes `1e20`, lets a mutation succeed, and then throws on the first `toISOString()`.

Configuration itself is checked when you set it:

- `setClock` refuses an unparseable fixed instant with `INVALID_DATE`, and a value that is not a string, number, `Date` or function with `INVALID_VALUES`.
- `setCompetitionClock` refuses anything without a `nowMs` function with `INVALID_VALUES`.

A fixed instant is copied when it is set. Every `Date` the clocks hand out is a fresh object, so mutating one never moves the clock.

## Live matchUp duration

A matchUp's duration is reported as `schedule.time` (`HH:MM:SS`) and `schedule.milliseconds`. Both appear on hydrated matchUps and in the result of [`getMatchUpScheduleDetails`](/docs/governors/query-governor#getmatchupscheduledetails). The duration totals the intervals between `START_TIME`, `STOP_TIME`, `RESUME_TIME` and `END_TIME` time items. A matchUp that is still in play adds the interval from its last start or resume up to "now".

Time items often carry a bare wall-clock value such as `10:00` with no date, so the factory anchors them to a reference day. The reference day and the "now" it subtracts from come from **one** competition-clock read. Before 7.13.0 the reference day came from the record clock while the subtraction used the competition clock, so a record clock on a different date added whole days to a live match's duration.

```js
engine.setClock('2026-05-10T12:00:00Z'); // record clock a week earlier
engine.setCompetitionClock({ nowMs: () => Date.parse('2026-05-17T12:00:00Z') });

// a matchUp whose only time item is { itemType: START_TIME, itemValue: '10:00' }
const { schedule } = engine.getMatchUpScheduleDetails({ matchUpId, drawId });
// schedule.time === '02:00:00': 10:00 to 12:00 on 2026-05-17, not seven days and two hours
```

Explicit ISO timestamps are used as given. A sparse `END_DATE` still anchors `END_TIME` that many days after `scheduledDate` for a match that crossed midnight, in both native (`schedule`) and legacy (time item) records.

:::note
A bare time is read as process-local wall-clock time on the reference day, which is a UTC calendar date. Hosts running away from UTC that rely on bare times should record explicit ISO timestamps.
:::

## Time zones

Choosing a time source is a separate question from resolving a zone. Time zones never alter the instant a clock returns; they decide which calendar day that instant falls on at the venue.

[`getTournamentTimeZone`](/docs/governors/tournament-governor#gettournamenttimezone) resolves the zone:

1. The tournament's own `localTimeZone`, when set. An invalid zone is an error (`INVALID_TIME_ZONE`).
2. Otherwise a zone inferred from venue addresses, when the valid zones they name all agree (`inferred: true`). Addresses that name no zone, or an invalid one, are ignored. Venues naming different zones are an error (`CONFLICTING_TIME_ZONES`).
3. Otherwise neither a zone nor an error: `{}`.

An error is returned as an error. A read that depends on the local day refuses rather than guessing another day.

A fallback applies **only** in case 3:

- **"Today" for eligibility** uses the UTC date of competition time, which every host agrees on.
- **The `calledAt` guard** falls back to the weakest bound that holds in every zone on earth.

A host that prefers its own zone may substitute it in that case only, never over an error.

## Ordering stamps when time stands still or runs backward

Every mutation stamps `updatedAt` on the drawDefinition, its affected structures and each modified matchUp. These stamps are **strictly increasing**: when the record clock reads the same millisecond as the previous stamp, or an earlier one, the new stamp is the previous stamp plus 1 ms.

```text
record clock fixed at T  →  updatedAt T, T+1ms, T+2ms, …
record clock moved back  →  updatedAt continues from the last stamp, not from the clock
```

Under a frozen or rewound clock, `updatedAt` therefore runs ahead of the clock. It is an ordering value for change detection, caching and "what changed since" queries, not the instant something happened. When you need an event instant, read the time items or `schedule.scoredTime`. Those are record stamps that follow the record clock exactly, so under a rewound clock they can go backward.

## Changing time is not changing history

The clocks decide how the factory reads the record. They never write to it.

- **Advancing time does not manufacture results.** A demo that moves competition time past a match's scheduled start does not start it, score it or complete it. A live duration grows, an embargo lifts, an age category may change, but every score and status still comes from a mutation.
- **Moving time backward does not undo recorded history.** Scores, statuses, time items and `updatedAt` stamps already written stay written. To return a demo to an earlier state, reset the fixture or restore a saved record. Turning the clock back is not enough.

## Demonstrations: what is supported today

What is supported today:

- **Local or offline operation**, with no server participating in the mutation.
- **Read-only simulated views** at a chosen instant.
- **A dedicated demo process** whose client and server are configured with an identical paused instant. That instant must be held unchanged until every pending acknowledgement, retry and local replay has finished. A paused clock that is stepped while a mutation is in flight does not meet this condition.

Running the record clock and the competition clock apart during a live, server-first mutation session is not supported. For a demo, bind both roles to one source.

Planned and not yet available:

- authoritative distributed control of competition time, replayed identically by client and server;
- accelerated playback;
- scripted tournament scenarios.

Host applications wire the clocks into their own engines and release that wiring on their own schedule. This page describes the factory's contract.

## Related Documentation

- **[setClock](/docs/engines/engine-methods#setclock)** and **[setCompetitionClock](/docs/engines/engine-methods#setcompetitionclock)**: engine API
- **[now, competitionNow, setClock, setCompetitionClock](/docs/tools/tools-api#now)**: the same clocks on `tools`
- **[Date and Time Handling](/docs/concepts/date-time-handling)**: calendar days, wall clocks, zones and instants
- **[getTournamentTimeZone](/docs/governors/tournament-governor#gettournamenttimezone)**: zone resolution
- **[Mutation Timestamps](/docs/concepts/matchup-overview#mutation-timestamps)**: `updatedAt`
- **[Embargo and Scheduled Rounds](/docs/concepts/publishing/publishing-embargo)**: visibility at competition time
