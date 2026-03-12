---
title: Automated Scheduling
---

## Overview

Automated scheduling uses the Garman formula to efficiently assign match start times while respecting court availability, player recovery requirements, and daily match limits. The system processes matches in intelligent blocks to maximize court utilization and minimize scheduling conflicts.

## Basic Usage

Once the `schedulingProfile`, `matchUpFormatTiming` and `dailyLimits` have been defined, automated assignment of **scheduleTimes** to `matchUps` is straightforward.

```js
engine.scheduleProfileRounds({
  scheduleDates, // optional array of dates to be scheduled
  periodLength: 30, // optional - scheduling block size in minutes (default: 30)
});
```

## Period Length: Scheduling Block Size

The `periodLength` parameter (default: 30 minutes) defines the granularity of time blocks used by the Garman scheduling algorithm. This is a critical parameter that affects how matches are grouped and scheduled.

### What Period Length Does

**Time Block Granularity**: Divides the available court time into uniform blocks. For example:

- `periodLength: 30` creates blocks at 9:00, 9:30, 10:00, 10:30, etc.
- `periodLength: 15` creates blocks at 9:00, 9:15, 9:30, 9:45, 10:00, etc.

**Match Grouping**: Matches are grouped by their duration relative to period length:

- Matches with similar durations (when divided by periodLength) are scheduled together in blocks
- Example: With `periodLength: 30`, a 90-minute match (90/30 = 3 blocks) and an 85-minute match (rounded to 3 blocks) can be scheduled in the same time slot across different courts

**Resource Optimization**:

- Smaller period lengths (15 minutes) provide finer control but more complexity
- Larger period lengths (60 minutes) are simpler but may waste court time
- Standard 30 minutes balances efficiency and precision

### Choosing the Right Period Length

**Use 15-minute blocks when:**

- Short format matches (fast4, no-ad, match tiebreaks)
- Very limited court availability requiring maximum efficiency
- Professional tournaments with tight TV scheduling windows

**Use 30-minute blocks when (RECOMMENDED):**

- Standard tournament formats (best of 3 sets)
- Typical club or regional tournaments
- Good balance of scheduling precision and algorithm performance

**Use 60-minute blocks when:**

- Long format matches (best of 5 sets)
- Championship events with extended match durations
- Fewer courts and matches, less need for fine-grained optimization

### Examples

```js
// Fast4 tournament - use 15-minute blocks for short matches
engine.scheduleMatchUps({
  scheduleDate: '2024-06-15',
  matchUpIds,
  periodLength: 15, // Finer granularity for 30-40 minute matches
  averageMatchUpMinutes: 35,
});

// Standard club tournament - use default 30-minute blocks
engine.scheduleProfileRounds({
  periodLength: 30, // Most common - good for 60-90 minute matches
});

// Championship event - use 60-minute blocks
engine.scheduleMatchUps({
  scheduleDate: '2024-06-15',
  matchUpIds,
  periodLength: 60, // Coarser blocks for 2-3 hour matches
  averageMatchUpMinutes: 150,
});
```

### Impact on Scheduling Results

**Efficiency**: Smaller period lengths can achieve ~5-10% better court utilization in tournaments with mixed match durations

**Performance**: Larger period lengths reduce algorithm complexity:

- 15 minutes: More computational work, detailed optimization
- 30 minutes: Optimal balance for most scenarios
- 60 minutes: Faster processing, acceptable for homogeneous schedules

**Precision**: Period length affects start time precision:

- 15 minutes: Matches can start at :00, :15, :30, :45
- 30 minutes: Matches can start at :00, :30
- 60 minutes: Matches can start at :00 only

### Pseudocode

The highest level auto-scheduling method is `engine.scheduleProfileRounds`.

1. Validate and filter `schedulingProfile` dates by specified `scheduleDates`
2. Construct [`matchUpDependencies`](../governors/query-governor#getmatchupdependencies) to ensure matchUps are scheduled before their dependents
3. Get an array of **inContext** `matchUps` for all relevant `tournamentRecords`
4. Retrieve `matchUpDailyLimits` and `personRequests`
5. Sort `scheduleDates` and for each iterate through all venues
6. Construct hash tables of `matchUpNotBeforeTimes` and `matchUpPotentialParticipantIds`
7. Ensure `rounds` specified for `scheduleDate` are sorted as specified
8. Generate ordered array of `matchUpIds` derived from specified `rounds`
9. Build up a mapping of `matchUpIds` to `recoveryMinutes` so that `matchUps` with equivalent `averageMatchUpMinutes`

   can be block scheduled while still considering varying `recoveryMinutes`

10. Group ordered `matchUpIds` by **averageMatchUpMinutes|periodLength**
11. Loop through groups of `matchUpIds` ...
12. Calculate available scheduleTimes, considering court availability, already scheduled matchUps, and `remainingScheduleTimes` from previous iteration
13. Construct per-participant hash tables of `matchUps` played and `timeAfterRecovery`
14. Filter out `matchUps` which are not appropriate for scheduling
15. Filter out `matchUps` which include participants who have reached daily limits
16. Loop through available `scheduleTimes` and build up mapping of `matchUpIds` to `scheduleTimes`
    - Defer scheduling of matchUps where `timeAfterRecovery` has not been reached
    - Defer scheduling of matchUps where `personRequests` include `{ requestType: DO_NOT_SCHEDULE }` conflicts
17. Group `matchUpIds` by **eventId|drawId|structureId** and assign `scheduleTimes` to `matchUps`
18. Return array of `remainingScheduleTimes` from current iteration to seed next iteration of virtualCourtBookings
