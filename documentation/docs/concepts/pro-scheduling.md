---
title: Pro Scheduling
---

## Overview

**Pro Scheduling** refers to the grid-based scheduling system used by professional tennis tournaments (ITF, ATP, WTA, national federations) to create predictable, broadcast-friendly match schedules. Unlike adaptive Garman scheduling which optimally fills available court time, pro scheduling assigns matches to fixed slots in a grid format.

This approach is preferred by professional tournaments because it:

- Supports "Follow By" scheduling for stadium courts
- Facilitates logistics (player transport, media availability)
- Creates a professional viewing experience with structured order of play

## Grid-Based Scheduling

### The Grid Concept

A scheduling grid consists of:

- **Courts**: Multiple courts each with their own schedule
- **Match assignments**: One match assigned to each grid cell (time × court)

Example grid layout:

```text
Time    | Court 1        | Court 2        | Court 3
--------|----------------|----------------|----------------
10:00   | Match A        | Match D        | Match G
12:00   | Match B        | Match E        | Match H
14:00   | Match C        | Match F        | Match I
16:00   | Match J        | Match K        | Match L
18:00   | Match M        | Match N        | Match O (NB 19:00)
```

### Time Slot Configuration

Grid scheduling uses fixed intervals rather than continuous scheduling:

```js
// Define time grid for a venue
const timeGrid = {
  startTime: '10:00',
  endTime: '20:00',
  slotDuration: 120, // 2-hour slots
  slotInterval: 120, // Slots start every 2 hours
};

// This creates slots at: 10:00, 12:00, 14:00, 16:00, 18:00, 20:00
```

### Grid Scheduling vs. Garman Scheduling

| Aspect                | Grid Scheduling                     | Garman Scheduling                   |
| --------------------- | ----------------------------------- | ----------------------------------- |
| **Start Times**       | Fixed slots (10:00, 12:00, etc.)    | Optimized based on match duration   |
| **Court Utilization** | May have gaps between matches       | Maximizes court usage               |
| **Predictability**    | High - known start times            | Lower - depends on previous matches |
| **Use Case**          | Professional tournaments, TV events | Club tournaments, multi-day events  |
| **Player Experience** | Predictable, easier logistics       | Variable, more flexible             |
| **Broadcast**         | TV-friendly with known windows      | Difficult for live broadcast        |

---

## Follow By Scheduling

**"Follow By"** (also called **"Not Before"** or **"To Follow"**) is a scheduling method where a match is scheduled to start after a previous match completes, rather than at a fixed time. This is primarily used for **stadium courts** and **featured matches**.

### How Follow By Works

Instead of assigning a specific start time, a match is designated to "follow" another match:

```text
Centre Court:
- 13:00:  Match A (Men's Semifinals - Smith vs. Jones)
- Follow: Match B (Women's Semifinals - Garcia vs. Wilson)
- Follow: Match C (Mixed Doubles Finals - Team 1 vs. Team 2)
```

In this example:

- Match A starts at 13:00 (fixed time)
- Match B starts when Match A completes (follow)
- Match C starts when Match B completes (follow)

### Benefits of Follow By

1. **Continuous Stadium Programming**: No gaps in stadium schedule
2. **Flexible Timing**: Accommodates variable match durations
3. **Maximize Attendance**: Spectators stay for multiple matches
4. **Broadcast Continuity**: TV coverage remains uninterrupted
5. **VIP Experience**: Premium ticket holders see guaranteed content

### Follow By with Not Before Time

A hybrid approach combines follow-by with a minimum start time:

```text
Centre Court:
- 10:00:  Match A (QF #1)
- Follow: Match B (QF #2)
- NB 14:00, Follow: Match C (SF #1 - winner of A vs. winner of B)
```

Match C:

- Cannot start before 14:00 (Not Before time)
- Follows completion of Match B
- Provides minimum time for lunch break, player rest, broadcast scheduling

### ITF Follow By Implementation

The ITF (International Tennis Federation) and many national federations use a standardized follow-by system:

```js
// ITF-style scheduling
const scheduleProfile = {
  venues: [
    {
      venueId: 'centre-court',
      venueName: 'Centre Court',
      rounds: [
        {
          matchUpId: 'match-1',
          scheduledTime: '11:00',
          courtId: 'centre-court-1',
        },
        {
          matchUpId: 'match-2',
          followMatchUpId: 'match-1', // Follows match-1
          courtId: 'centre-court-1',
        },
        {
          matchUpId: 'match-3',
          followMatchUpId: 'match-2', // Follows match-2
          notBeforeTime: '16:00', // But not before 4 PM
          courtId: 'centre-court-1',
        },
      ],
    },
  ],
};
```

### Follow By for TV Programming

Professional tournaments coordinate with broadcasters:

```text
Stadium Court Schedule (for TV):
- 12:00 NB:  Match 1 (Men's Feature - broadcast window starts)
- Follow:     Match 2 (Women's Feature)
- NB 16:00:  Match 3 (Men's Semifinals - primetime window)
- Follow:     Match 4 (Women's Semifinals)
- NB 19:00:  Match 5 (Finals - evening broadcast)
```

This ensures:

- Broadcast windows are filled with content
- No extended dead air if matches finish early
- Flexibility if matches run long
- Multiple matches for ticket holders

---

## Implementing Pro Scheduling

### Basic Grid Scheduling

```js
import { tournamentEngine } from 'tods-competition-factory';

// Define grid parameters
const gridConfig = {
  venueId: 'main-venue-id',
  date: '2024-03-20',
  timeSlots: ['10:00', '12:00', '14:00', '16:00', '18:00'],
  courts: ['court-1', 'court-2', 'court-3', 'court-4'],
};

// Assign matches to grid
const matchAssignments = [
  // Court 1
  { matchUpId: 'match-1', courtId: 'court-1', scheduledTime: '10:00' },
  { matchUpId: 'match-2', courtId: 'court-1', scheduledTime: '12:00' },
  { matchUpId: 'match-3', courtId: 'court-1', scheduledTime: '14:00' },

  // Court 2
  { matchUpId: 'match-4', courtId: 'court-2', scheduledTime: '10:00' },
  { matchUpId: 'match-5', courtId: 'court-2', scheduledTime: '12:00' },

  // etc...
];

// Apply grid schedule
matchAssignments.forEach(({ matchUpId, courtId, scheduledTime }) => {
  tournamentEngine.assignMatchUpCourt({ matchUpId, courtId });
  tournamentEngine.addMatchUpScheduledTime({
    matchUpId,
    scheduledTime,
    scheduledDate: gridConfig.date,
  });
});
```

### Follow By Implementation

```js
// Stadium court with follow-by scheduling
const stadiumSchedule = [
  {
    matchUpId: 'sf-match-1',
    courtId: 'centre-court',
    scheduledTime: '13:00',
    scheduledDate: '2024-03-23',
  },
  {
    matchUpId: 'sf-match-2',
    courtId: 'centre-court',
    scheduledDate: '2024-03-23',
    // No scheduledTime - will follow sf-match-1
    extensions: [
      {
        name: 'followMatchUp',
        value: { matchUpId: 'sf-match-1' },
      },
    ],
  },
  {
    matchUpId: 'final-match',
    courtId: 'centre-court',
    scheduledDate: '2024-03-24',
    scheduledTime: '15:00', // Not Before 3 PM
    extensions: [
      {
        name: 'followMatchUp',
        value: {
          matchUpId: 'sf-match-2',
          notBeforeTime: '15:00',
        },
      },
    ],
  },
];

// Apply follow-by schedule
stadiumSchedule.forEach((schedule) => {
  const { matchUpId, courtId, scheduledDate, scheduledTime, extensions } = schedule;

  // Assign court
  tournamentEngine.assignMatchUpCourt({ matchUpId, courtId });

  // Add date
  tournamentEngine.addMatchUpScheduledDate({ matchUpId, scheduledDate });

  // Add time if specified (for first match or not-before matches)
  if (scheduledTime) {
    tournamentEngine.addMatchUpScheduledTime({ matchUpId, scheduledTime, scheduledDate });
  }

  // Add follow-by extension
  if (extensions) {
    extensions.forEach((extension) => {
      tournamentEngine.addExtension({ matchUpId, extension });
    });
  }
});
```

---

## Grid Configuration Strategies

### Standard Grid

Fixed 2-hour slots for predictability:

```js

**API Reference:** [addExtension](/docs/governors/tournament-governor#addextension)

{
  slots: ['10:00', '12:00', '14:00', '16:00', '18:00', '20:00'],
  slotDuration: 120  // 2 hours per slot
}
```

### Compressed Grid

Tighter slots for high-volume days (qualifying, early rounds):

```js
{
  slots: ['09:00', '10:30', '12:00', '13:30', '15:00', '16:30', '18:00'],
  slotDuration: 90  // 1.5 hours per slot
}
```

### Primetime Grid

Optimized for evening viewing:

```js
{
  slots: ['11:00', '14:00', '17:00', '19:00'],
  slotDuration: 180,  // 3 hours for featured matches
  courts: ['centre-court', 'court-1']  // Fewer courts, more focus
}
```

### Mixed Grid

Different slots for different court types:

```js
{
  outlierCourts: {
    slots: ['10:00', '12:00', '14:00', '16:00'],
    slotDuration: 120
  },
  stadiumCourts: {
    slots: ['11:00', '14:00', '18:00'],
    slotDuration: 180,
    followByEnabled: true
  }
}
```

---

## Pro Scheduling Workflow

### Step 1: Define Court Tiers

Categorize courts by importance and usage:

```js
const courtTiers = {
  premium: ['centre-court', 'court-1'], // TV courts, follow-by
  feature: ['court-2', 'court-3', 'court-4'], // Regular grid slots
  outlier: ['court-5', 'court-6', 'court-7', 'court-8'], // Compressed grid
};
```

### Step 2: Create Time Grids

Define slots for each tier:

```js
const timeGrids = {
  premium: {
    slots: ['11:00', '14:00', '18:00'],
    followBy: true,
    notBeforeTimes: true,
  },
  feature: {
    slots: ['10:00', '12:00', '14:00', '16:00', '18:00'],
    followBy: false,
  },
  outlier: {
    slots: ['10:00', '11:30', '13:00', '14:30', '16:00', '17:30'],
    followBy: false,
  },
};
```

### Step 3: Assign Matches to Grid

Prioritize match assignments:

1. **Featured matches** → Premium courts (centre court)
2. **Seeded player matches** → Feature courts
3. **Remaining matches** → Outlier courts

```js
// Priority assignment
const assignments = [];

// 1. Finals/semifinals on centre court with follow-by
featuredMatches.forEach((matchUpId, index) => {
  assignments.push({
    matchUpId,
    courtId: 'centre-court',
    scheduledTime: index === 0 ? '14:00' : null,
    followMatchUpId: index > 0 ? featuredMatches[index - 1] : null,
  });
});

// 2. Seeded matches on feature courts
seededMatches.forEach((matchUpId, index) => {
  const courtIndex = index % courtTiers.feature.length;
  const slotIndex = Math.floor(index / courtTiers.feature.length);

  assignments.push({
    matchUpId,
    courtId: courtTiers.feature[courtIndex],
    scheduledTime: timeGrids.feature.slots[slotIndex],
  });
});

// 3. Remaining matches on outlier courts
remainingMatches.forEach((matchUpId, index) => {
  const courtIndex = index % courtTiers.outlier.length;
  const slotIndex = Math.floor(index / courtTiers.outlier.length);

  assignments.push({
    matchUpId,
    courtId: courtTiers.outlier[courtIndex],
    scheduledTime: timeGrids.outlier.slots[slotIndex],
  });
});
```

### Step 4: Validate and Adjust

Check for conflicts and constraints:

```js
// Validate schedule
const validation = validateProSchedule(assignments, {
  checkRecoveryTimes: true,
  checkDailyLimits: true,
  checkCourtAvailability: true,
});

if (validation.conflicts.length > 0) {
  // Adjust assignments to resolve conflicts
  resolveScheduleConflicts(assignments, validation.conflicts);
}
```

---

## Best Practices

### Grid Scheduling

1. **Consistent Intervals**: Use standard slot intervals (90, 120, or 180 minutes)
2. **Court Capacity**: Don't over-schedule courts (leave buffer time)
3. **Player Logistics**: Consider travel time between courts for back-to-back matches
4. **Backup Courts**: Have indoor courts available for weather delays

### Follow By Scheduling Tips

1. **Limit Chain Length**: Maximum 3-4 matches in a follow-by chain
2. **Not Before Times**: Use for meal breaks, broadcast windows
3. **Warm-up Courts**: Ensure warm-up facilities for "on-deck" players

### Professional Standards

1. **Order of Play**: Publish official order of play 16-24 hours in advance
2. **Schedule Updates**: Real-time updates as matches complete
3. **Player Notifications**: Alert players when they're "on deck" (next match)
4. **Broadcast Coordination**: Coordinate with TV producers on featured matches
5. **Contingency Planning**: Have backup plans for rain delays, extended matches

---

## ITF and National Federation Standards

### ITF Pro Circuit

- **Grid Slots**: 10:00, 12:00, 14:00, 16:00 for outlier courts
- **Centre Court**: Follow-by scheduling with Not Before times
- **Finals**: Typically Not Before 14:00 or 15:00 on finals day
- **Qualifying**: Compressed grid (90-minute slots)

### ATP/WTA Standards

- **Stadium Courts**: Predominantly follow-by with primetime Not Before
- **Day Session**: 11:00 or 12:00 start for first match
- **Night Session**: 19:00 or 20:00 Not Before for evening session
- **TV Windows**: Coordinate with broadcast partners

### National Championships

- **Weekend Finals**: Not Before times for spectator-friendly scheduling
- **Multiple Events**: Grid scheduling for efficient court use
- **Youth Events**: Compressed grids with shorter slot durations

---

## Conflict Detection and Prevention

### Double Booking Prevention

When manually scheduling matchUps to specific court slots, the system can automatically prevent double-booking conflicts. This validation ensures that no two matchUps are assigned to the same `{ courtId, courtOrder, scheduledDate }` combination.

#### How It Works

When calling `addMatchUpScheduleItems()` with `proConflictDetection: true` (default), the system:

1. Checks all existing matchUps in the tournament
2. Identifies any matchUp already scheduled to the target court slot
3. Returns an error if a conflict is detected
4. Allows the operation if the slot is available

```js
// Attempt to schedule a matchUp
const result = engine.addMatchUpScheduleItems({
  matchUpId: 'match-123',
  drawId: 'draw-456',
  schedule: {
    courtId: 'court-1',
    courtOrder: '2',
    scheduledDate: '2024-03-20',
  },
  proConflictDetection: true, // Default - validate no conflicts
});

// Handle double booking error
if (result.error?.code === 'ERR_SCHEDULE_CONFLICT_DOUBLE_BOOKING') {
  console.error('Court slot already occupied');
  // Suggest alternative: different court or different time
}
```

#### Performance Considerations

For large tournaments (1000+ matchUps), conflict detection adds processing overhead by querying all tournament matchUps. Consider disabling when:

- **Client-side validation exists**: UI already prevents conflicts before submission
- **Bulk operations**: Scheduling hundreds of matchUps at once
- **Multi-user environments**: Optimistic UI updates with server-side rollback
- **Automated scheduling**: Using algorithms that guarantee no conflicts

```js
// High-performance bulk scheduling
matchAssignments.forEach(({ matchUpId, schedule }) => {
  engine.addMatchUpScheduleItems({
    matchUpId,
    drawId: 'draw-456',
    schedule,
    proConflictDetection: false, // Skip validation for speed
    disableNotice: true, // Batch notifications
  });
});
```

#### When to Keep Detection Enabled

Keep `proConflictDetection: true` (default) when:

- **Interactive scheduling**: Tournament directors manually dragging/dropping matches
- **Single-user applications**: No concurrent scheduling conflicts possible
- **Critical operations**: Scheduling that must not fail silently
- **Small tournaments**: Performance impact negligible (fewer than 500 matchUps)
- **No client validation**: Server is the source of truth

### Using proConflicts() for Analysis

The `proConflicts()` method provides comprehensive conflict analysis across all scheduled matchUps, detecting:

- **Court double-bookings**: Multiple matchUps on same court slot
- **Participant conflicts**: Same player scheduled in multiple matches simultaneously
- **Match order conflicts**: Dependent matches scheduled in wrong order
- **Recovery time violations**: Insufficient rest between consecutive matches

```js
// Get all scheduled matchUps
const { matchUps } = engine.allCompetitionMatchUps({
  matchUpFilters: { scheduledDate: '2024-03-20' },
  withCourtGridRows: true,
  nextMatchUps: true,
  inContext: true,
});

// Analyze for conflicts
const { courtIssues, rowIssues } = engine.proConflicts({
  matchUps,
  tournamentRecords, // Optional for multi-tournament analysis
});

// Check for double bookings
Object.entries(courtIssues).forEach(([courtId, issues]) => {
  const doubleBookings = issues.filter((issue) => issue.issueType === 'courtDoubleBooking');
  if (doubleBookings.length > 0) {
    console.warn(`Court ${courtId} has double bookings:`, doubleBookings);
  }
});

// Check for participant conflicts
rowIssues.forEach((row, rowIndex) => {
  const participantConflicts = row.filter((issue) => issue.issueType === 'participantConflict');
  if (participantConflicts.length > 0) {
    console.warn(`Row ${rowIndex + 1} has participant conflicts:`, participantConflicts);
  }
});
```

#### Conflict Types

| Conflict Type            | Severity | Description                                                |
| ------------------------ | -------- | ---------------------------------------------------------- |
| `courtDoubleBooking`     | ERROR    | Two matchUps assigned to same court slot                   |
| `participantConflict`    | CONFLICT | Same player in multiple matches on same row (simultaneous) |
| `matchUpConflict`        | ERROR    | Dependent match scheduled before prerequisite              |
| `participantWarning`     | WARNING  | Player has back-to-back matches (potential recovery issue) |
| `insufficientGapWarning` | ISSUE    | Multiple rounds between dependent matches                  |

#### Conflict Resolution Workflow

```js

**API Reference:** [allCompetitionMatchUps](/docs/governors/matchup-governor#allcompetitionmatchups)

// 1. Schedule matches
scheduleMatchesToGrid(matchAssignments);

// 2. Analyze for conflicts
const { courtIssues, rowIssues } = engine.proConflicts({ matchUps });

// 3. Identify conflicts requiring resolution
const criticalConflicts = Object.values(rowIssues)
  .flat()
  .filter((issue) => ['ERROR', 'CONFLICT'].includes(issue.issue));

// 4. Resolve conflicts
criticalConflicts.forEach((conflict) => {
  if (conflict.issueType === 'courtDoubleBooking') {
    // Move one match to different court or time
    const affectedMatchUpIds = [conflict.matchUpId, ...conflict.issueIds];
    resolveDoubleBooking(affectedMatchUpIds);
  } else if (conflict.issueType === 'participantConflict') {
    // Move matches to different rows
    rescheduleConflictingMatches(conflict.matchUpId, conflict.issueIds);
  } else if (conflict.issueType === 'matchUpConflict') {
    // Reorder matches to respect dependencies
    adjustMatchOrder(conflict.matchUpId, conflict.issueIds);
  }
});

// 5. Re-analyze to confirm resolution
const recheck = engine.proConflicts({ matchUps: getUpdatedMatchUps() });
if (Object.values(recheck.rowIssues).flat().length === 0) {
  console.log('All conflicts resolved');
}
```

### Automatically Resolving Participant Conflicts with proColumnResolve()

Where the workflow above resolves conflicts by hand, `proColumnResolve()` resolves cross-column participant conflicts automatically **without moving any match off its court or changing its clock time**. It re-lays the grid vertically — reassigning `courtOrder` and inserting blank rows — so colliding matchUps land on different rows.

It folds both `participantConflict` and `potentialParticipantConflict` (winner-advancement collisions) into each matchUp's deep dependency participant set, anchors completed matchUps at the top of each column (in play order), keeps in-progress beneath them, orders the to-be-played tail by `scheduledTime`, and preserves progression (every source in a strictly earlier row than the match it feeds).

```js
const { matchUps } = engine.allCompetitionMatchUps({
  matchUpFilters: { scheduledDate: '2024-03-20' },
  nextMatchUps: true,
  inContext: true,
});

const { resolved, unresolvable } = engine.proColumnResolve({
  scheduledDate: '2024-03-20',
  matchUps,
});

// `resolved` lists every courtOrder change: { matchUpId, courtId, from, to }
// `unresolvable` lists what spacing cannot fix, each with a reason:
//   - 'chronology'       a feeder scheduled at a LATER time than the match it feeds
//   - 'orderingDeadlock' a same-column ordering cycle broken to make progress
```

Because every normally-placed row is conflict-free by construction, re-running `proConflicts()` on the result is the canonical confirmation. Court and `scheduledTime` are invariant — only `courtOrder` moves. See [proColumnResolve](/docs/governors/schedule-governor#procolumnresolve) in the Schedule Governor reference.

### Preventing Conflicts During Scheduling

#### Strategy 1: Pre-validate Before Assignment

```js
function canScheduleToSlot(courtId, courtOrder, scheduledDate, matchUpId) {
  const { matchUps } = engine.allCompetitionMatchUps({
    matchUpFilters: { scheduledDate },
  });

  const occupied = matchUps.some(
    (m) =>
      m.matchUpId !== matchUpId &&
      m.schedule?.courtId === courtId &&
      m.schedule?.courtOrder === courtOrder &&
      m.schedule?.scheduledDate === scheduledDate,
  );

  return !occupied;
}

// Use before scheduling
if (canScheduleToSlot('court-1', 2, '2024-03-20', 'match-123')) {
  engine.addMatchUpScheduleItems({
    matchUpId: 'match-123',
    schedule: { courtId: 'court-1', courtOrder: '2', scheduledDate: '2024-03-20' },
  });
}
```

#### Strategy 2: Find Available Slots

```js

**API Reference:** [allCompetitionMatchUps](/docs/governors/matchup-governor#allcompetitionmatchups)

function findAvailableSlot(courtIds, courtOrder, scheduledDate) {
  const { matchUps } = engine.allCompetitionMatchUps({
    matchUpFilters: { scheduledDate },
  });

  const occupiedCourts = new Set(
    matchUps.filter((m) => m.schedule?.courtOrder === courtOrder).map((m) => m.schedule?.courtId),
  );

  return courtIds.find((courtId) => !occupiedCourts.has(courtId));
}

// Use to avoid conflicts
const availableCourtId = findAvailableSlot(['court-1', 'court-2', 'court-3'], 2, '2024-03-20');

if (availableCourtId) {
  engine.addMatchUpScheduleItems({
    matchUpId: 'match-123',
    schedule: { courtId: availableCourtId, courtOrder: '2', scheduledDate: '2024-03-20' },
  });
}
```

#### Strategy 3: Automated Conflict-Free Scheduling

```js

**API Reference:** [allCompetitionMatchUps](/docs/governors/matchup-governor#allcompetitionmatchups)

// Use proAutoSchedule for conflict-free initial schedule
const { matchUps } = engine.allCompetitionMatchUps({
  nextMatchUps: true,
  inContext: true,
});

const result = engine.proAutoSchedule({
  scheduledDate: '2024-03-20',
  matchUps,
  venueIds: ['venue-1'], // Optional
});

// Result includes conflict-free schedule
console.log(`Scheduled ${result.scheduled.length} matchUps without conflicts`);
```

---

## Related Documentation

- **[Scheduling Overview](./scheduling-overview)** - Understanding scheduling workflows
- **[Automated Scheduling](./automated-scheduling)** - Garman formula and algorithm details
- **[Scheduling Profile](./scheduling-profile)** - Multi-day schedule configuration
- **[Scheduling Policy](./scheduling-policy)** - Recovery times and daily limits
- **[Schedule Governor](/docs/governors/schedule-governor)** - API reference for scheduling methods
- **[matchUp Governor](/docs/governors/matchup-governor)** - addMatchUpScheduleItems reference
