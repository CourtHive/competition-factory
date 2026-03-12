---
title: Schedule Governor
---

The **Schedule Governor** provides methods for assigning dates, times, venues, and courts to tournament matchUps. It supports manual assignment, automated scheduling, and hybrid approaches for tournaments ranging from simple club events to complex multi-day professional circuits.

```js
import { scheduleGovernor } from 'tods-competition-factory';
```

:::tip
See **[Scheduling Overview](../concepts/scheduling-overview)**, **[Automated Scheduling](../concepts/automated-scheduling)**, **[Pro Scheduling](../concepts/pro-scheduling)**, and **[Scheduling Policy](../policies/scheduling)** for comprehensive scheduling concepts.
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

Assigns a scheduled time to a matchUp.

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
engine.addSchedulingProfileRound({
  scheduleDate, // required - date string
  venueId, // required
  drawId, // required
  structureId, // required
  roundNumber, // required
});
```

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
  averageMatchUpMinutes, // optional - average match duration (default: 90)
  recoveryMinutes, // optional - recovery time between matches (default: 0)

  // Time constraints
  startTime, // optional - schedule start time (HH:mm)
  endTime, // optional - schedule end time (HH:mm)

  // Limits and policies
  matchUpDailyLimits, // optional - SINGLES, DOUBLES, total limits
  checkPotentialRequestConflicts, // optional boolean (default: true)

  // Execution control
  dryRun, // optional boolean - preview without changes
});
```

#### Period Length: Scheduling Block Size

The `periodLength` parameter controls the granularity of scheduling blocks:

- **15 minutes**: Fine-grained scheduling for short-format matches
- **30 minutes** (default): Standard scheduling for most tournaments
- **60 minutes**: Coarse scheduling for long-format matches

Smaller period lengths provide more precise start times but may reduce court utilization. Larger periods improve grouping but reduce precision.

**See**: [Automated Scheduling - Period Length](../concepts/automated-scheduling#period-length-scheduling-block-size) for detailed explanation.

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

**See**: [Automated Scheduling Concepts](../concepts/automated-scheduling) for algorithm details.

---

### scheduleProfileRounds

Auto-schedules all rounds specified in a scheduling profile across multiple days and venues. Uses a pre-defined profile that maps rounds to specific dates and venues.

```js
engine.scheduleProfileRounds({
  // Scheduling parameters
  periodLength, // optional - scheduling block size (default: 30)

  // Date selection
  scheduleDates, // optional - specific dates to schedule
  clearScheduleDates, // optional - boolean or array of dates to clear first

  // Execution control
  dryRun, // optional boolean - preview without changes
  pro, // optional boolean - use grid scheduling instead of Garman
  checkPotentialRequestConflicts, // optional boolean (default: true)
});
```

**Returns**:

```js
{
  (scheduledDates, // array - dates where matchUps were scheduled
    scheduledMatchUpIds, // array - matchUpIds that were scheduled
    noTimeMatchUpIds, // array - matchUps that couldn't fit
    overLimitMatchUpIds, // array - matchUps exceeding participant limits
    requestConflicts); // array - participant request conflicts
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

```js
engine.scheduleProfileRounds({
  clearScheduleDates: true, // Clear all dates
  periodLength: 30,
});

// Or clear specific dates
engine.scheduleProfileRounds({
  clearScheduleDates: ['2024-06-15', '2024-06-16'],
  scheduleDates: ['2024-06-15', '2024-06-16'],
  periodLength: 30,
});
```

**Dry Run Preview**:

```js
const result = engine.scheduleProfileRounds({
  dryRun: true,
});

console.log('Would schedule:', result.scheduledMatchUpIds.length, 'matchUps');
console.log('Request conflicts:', result.requestConflicts);
```

**Professional Grid Scheduling**:

```js
engine.scheduleProfileRounds({
  pro: true, // Use grid scheduling
  periodLength: 30,
});
```

:::note
SINGLES and DOUBLES matchUps are scheduled automatically. TEAM matchUps require manual court allocation using `allocateTeamMatchUpCourts()`.
:::

**See**: [Scheduling Profile](../concepts/scheduling-profile) and [Pro Scheduling](../concepts/pro-scheduling) for details.

---

## Bulk Operations

### bulkScheduleMatchUps

Schedules multiple matchUps at once with provided scheduling details.

```js
engine.bulkScheduleMatchUps({
  schedule, // required - array of schedule objects
});
```

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
});
```

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
  dryRun, // boolean - indicates if this was a dry run
} = engine.bulkRescheduleMatchUps({
  matchUpIds, // required - array of matchUpIds to reschedule
  scheduleChange: {
    daysChange: number, // number of days +/- to shift
    minutesChange: number, // number of minutes +/- to shift
  },
  dryRun, // optional boolean - preview without changes
});
```

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

Returns matchUps that are ready to be scheduled.

```js
const { matchUps } = engine.getMatchUpsToSchedule({
  eventId, // optional
  drawId, // optional
});
```

---

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

### getSchedulingProfile

Returns the current scheduling profile.

```js
const { schedulingProfile } = engine.getSchedulingProfile();
```

---

### getSchedulingProfileIssues

Validates scheduling profile and returns any issues.

```js
const { issues } = engine.getSchedulingProfileIssues({
  schedulingProfile, // optional - validate specific profile
});
```

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

Updates format timing parameters for scheduling.

```js
engine.modifyMatchUpFormatTiming({
  matchUpFormat, // required
  averageMinutes, // optional - average duration
  recoveryMinutes, // optional - recovery time
});
```

---

### proAutoSchedule

Professional auto-scheduling with grid-based court assignment.

```js
engine.proAutoSchedule({
  scheduleDate, // required
  venueIds, // optional
});
```

---

### proConflicts

Detects scheduling conflicts in pro grid scheduling.

```js
const { conflicts } = engine.proConflicts({
  scheduleDate, // required
});
```

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

Reorders upcoming matchUps on a court, affecting their order of play.

```js
engine.reorderUpcomingMatchUps({
  matchUpContextIds, // required - array of matchUp context objects
  firstToLast, // optional boolean - direction of reorder
});
```

**Example**:

```js
const matchUpContextIds = [
  { tournamentId: 't1', drawId: 'd1', matchUpId: 'm1' },
  { tournamentId: 't1', drawId: 'd1', matchUpId: 'm2' },
  { tournamentId: 't1', drawId: 'd1', matchUpId: 'm3' },
];

engine.reorderUpcomingMatchUps({
  matchUpContextIds,
  firstToLast: true, // Move first to last
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

**See**: [Scheduling Profile Concepts](../concepts/scheduling-profile) for detailed profile structure and creation.

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
  matchUpId,                // required — target matchUp
  drawId,                   // required — resolved to drawDefinition by engine
  schedule: {               // required — schedule attributes to set
    scheduledDate,          // optional — 'YYYY-MM-DD'
    scheduledTime,          // optional — 'HH:mm' or ISO datetime
    startTime,              // optional — actual start time
    endTime,                // optional — actual end time
    resumeTime,             // optional — resume after suspension
    stopTime,               // optional — suspension time
    courtId,                // optional — assigned court
    venueId,                // optional — assigned venue
    courtOrder,             // optional — order on court
    homeParticipantId,      // optional — home team participant
    courtIds,               // optional — for TEAM matchUps, allocate courts
  },
  removePriorValues,        // optional boolean — clear existing schedule timeItems first
  checkChronology,          // optional boolean — defaults to true; validate time ordering
  errorOnAnachronism,       // optional boolean — return error on chronological violations
  proConflictDetection,     // optional boolean — detect pro scheduling conflicts
  disableNotice,            // optional boolean — suppress modification notices
});
```

---

## Related Documentation

- **[Scheduling Overview](../concepts/scheduling-overview)** - Core scheduling concepts
- **[Automated Scheduling](../concepts/automated-scheduling)** - Algorithm details and Garman formula
- **[Pro Scheduling](../concepts/pro-scheduling)** - Grid scheduling for professional tournaments
- **[Scheduling Profile](../concepts/scheduling-profile)** - Multi-day scheduling profiles
- **[Scheduling Conflicts](../concepts/scheduling-conflicts)** - Conflict detection and resolution
- **[Scheduling Policy](../policies/scheduling)** - Policy configuration
- **[Venues and Courts](../concepts/venues-courts)** - Venue setup and court availability
- **[Time Items](../concepts/timeItems)** - How schedules are stored
