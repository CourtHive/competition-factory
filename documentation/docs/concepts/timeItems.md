---
title: Time Items
---

## Overview

**Time Items** are temporal records that capture attributes which change over time on any [CODES](/docs/data-standards#codes) document element. They provide a complete audit trail of changes, enabling historical reconstruction and duration calculations.

### Key Concepts

**Temporal Data**: Values that change over time with timestamps  
**Audit Trail**: Complete history of value changes  
**Hierarchical Types**: Dot-notation for organized categorization  
**Item Values**: Any JSON-serializable data  
**Date Tracking**: Both item date and creation timestamp

### Primary Use Cases

**Participant Data**:

- Rankings and ratings (with effective dates)
- Registration status changes
- Sign-in timestamps
- Payment status tracking
- Penalties and warnings

**MatchUp Scheduling**:

- Court assignments and changes
- Start/stop/resume/end times
- Official assignments
- Venue changes
- Schedule modifications

**Event Management**:

- External data retrieval timestamps
- Configuration changes
- Status transitions

## Time Item Structure

### Complete Type Definition

```typescript
type TimeItem = {
  itemType: string; // Hierarchical type using dot notation
  itemValue: any; // The actual data value
  itemDate: string; // ISO 8601 date when value is effective
  createdAt: string; // ISO 8601 timestamp when item was created
  itemSubTypes?: string[]; // Optional array of type fragments
};
```

### Property Descriptions

**itemType** (required)  
Hierarchical string using dot notation to categorize the time item. Enables matching on type fragments for internal operations.

Format: `CATEGORY.SUBCATEGORY.DETAIL`

Examples:

- `'SCALE.RANKING.SINGLES.WTN'` - WTN singles ranking
- `'SCHEDULE.TIME.START'` - Match start time
- `'RETRIEVAL.RANKING.SINGLES.U18'` - External data fetch timestamp

**itemValue** (required)  
The actual data being tracked. Can be any JSON-serializable value: number, string, boolean, object, array.

Examples:

- `13.20` - Rating value
- `'2024-06-15T14:30:00Z'` - Timestamp
- `{ courtId: 'court-5', venueName: 'Stadium' }` - Complex object

**itemDate** (required)  
ISO 8601 date string (`YYYY-MM-DD`) or datetime string indicating when the value becomes effective. For rankings/ratings, this is the effective date. For events, this is when the event occurred.

**createdAt** (required)  
ISO 8601 datetime string (`YYYY-MM-DDTHH:mm:ssZ`) indicating when the time item was created in the system. Auto-generated during creation.

**itemSubTypes** (optional)  
Array of strings providing additional type categorization. Used for organizing related items or adding metadata.

### Dot Notation Hierarchy

The factory uses dot notation in `itemType` to create a hierarchical structure that enables flexible querying and type matching:

#### Example itemTypes

**Scheduling**:

```js
'SCHEDULE.ASSIGNMENT.VENUE'; // Venue assignment
'SCHEDULE.ASSIGNMENT.COURT'; // Court assignment
'SCHEDULE.ALLOCATION.COURTS'; // Team event court allocation
'SCHEDULE.ASSIGNMENT.OFFICIAL'; // Official assignment
'SCHEDULE.COURT.ORDER'; // Order of play position
'SCHEDULE.DATE'; // Scheduled date
'SCHEDULE.TIME.SCHEDULED'; // Scheduled time
'SCHEDULE.TIME.START'; // Actual start time
'SCHEDULE.TIME.STOP'; // Stop/interruption time
'SCHEDULE.TIME.RESUME'; // Resume after interruption
'SCHEDULE.TIME.END'; // Match completion time
```

**Scale Items** (Rankings/Ratings):

```js
'SCALE.RANKING.SINGLES.ATP'; // ATP singles ranking
'SCALE.RATING.SINGLES.WTN'; // WTN singles rating
'SCALE.SEEDING.SINGLES'; // Tournament seeding
```

**Data Retrieval**:

```js
'RETRIEVAL.RANKING.SINGLES.U18'; // External ranking fetch timestamp
'RETRIEVAL.RATING.DOUBLES.WTA'; // External rating fetch timestamp
```

**Participant Status**:

```js
'REGISTRATION.STATUS'; // Registration status change
'SIGNIN.TIMESTAMP'; // Check-in timestamp
'PAYMENT.STATUS'; // Payment status change
'PENALTY.ASSESSMENT'; // Penalty applied
```

## Factory Internal Usage

In most cases, time items are created and managed automatically by the Competition Factory engines. Understanding these patterns helps when integrating with the factory or debugging temporal data.

### Participant Time Items

Time items on participants track temporal attributes throughout the tournament lifecycle:

**Scale Items** - Rankings, ratings, and seedings:

```js
// Automatically created when setting participant scale items
{
  itemType: 'SCALE.RATING.SINGLES.WTN',
  itemValue: 8.3,
  itemDate: '2024-06-15',  // Effective date
  createdAt: '2024-06-10T09:00:00Z'
}
```

**See:** [Scale Items](./scaleItems) for complete scale item documentation.

**Registration & Status**:

```js
// Registration status changes
{
  itemType: 'REGISTRATION.STATUS',
  itemValue: 'CONFIRMED',
  itemDate: '2024-06-01',
  createdAt: '2024-06-01T10:30:00Z'
}

// Check-in timestamp
{
  itemType: 'SIGNIN.TIMESTAMP',
  itemValue: '2024-06-15T08:45:00Z',
  itemDate: '2024-06-15',
  createdAt: '2024-06-15T08:45:00Z'
}
```

### MatchUp Time Items

Time items on matchUps capture scheduling lifecycle and changes:

**Court and Venue Assignments**:

```js
// Initial court assignment
{
  itemType: 'SCHEDULE.ASSIGNMENT.COURT',
  itemValue: 'court-5',
  itemDate: '2024-06-15',
  createdAt: '2024-06-14T16:00:00Z'
}

// Court reassignment (e.g., due to rain)
{
  itemType: 'SCHEDULE.ASSIGNMENT.COURT',
  itemValue: 'court-2',  // New court
  itemDate: '2024-06-15',
  createdAt: '2024-06-15T11:30:00Z'  // Later creation time
}
```

**Match Timing**:

```js
// Scheduled start
{
  itemType: 'SCHEDULE.TIME.SCHEDULED',
  itemValue: '2024-06-15T14:00:00Z',
  itemDate: '2024-06-15',
  createdAt: '2024-06-14T16:00:00Z'
}

// Actual start (may differ from scheduled)
{
  itemType: 'SCHEDULE.TIME.START',
  itemValue: '2024-06-15T14:05:00Z',
  itemDate: '2024-06-15',
  createdAt: '2024-06-15T14:05:00Z'
}

// Interruption (rain delay)
{
  itemType: 'SCHEDULE.TIME.STOP',
  itemValue: '2024-06-15T14:45:00Z',
  itemDate: '2024-06-15',
  createdAt: '2024-06-15T14:45:00Z'
}

// Resume after delay
{
  itemType: 'SCHEDULE.TIME.RESUME',
  itemValue: '2024-06-15T15:30:00Z',
  itemDate: '2024-06-15',
  createdAt: '2024-06-15T15:30:00Z'
}

// Match completion
{
  itemType: 'SCHEDULE.TIME.END',
  itemValue: '2024-06-15T16:15:00Z',
  itemDate: '2024-06-15',
  createdAt: '2024-06-15T16:15:00Z'
}
```

**Duration Calculation Example**:

```js
// Calculate match duration from time items
const startItem = matchUp.timeItems?.find((ti) => ti.itemType === 'SCHEDULE.TIME.START');
const stopItems = matchUp.timeItems?.filter((ti) => ti.itemType === 'SCHEDULE.TIME.STOP');
const resumeItems = matchUp.timeItems?.filter((ti) => ti.itemType === 'SCHEDULE.TIME.RESUME');
const endItem = matchUp.timeItems?.find((ti) => ti.itemType === 'SCHEDULE.TIME.END');

// Calculate total playing time excluding interruptions
let totalMinutes = 0;
// ... duration calculation logic
```

**Schedule Context Extraction**:

When matchUps are retrieved with context (`inContext: true`), time items are automatically extracted and added to the `matchUp.schedule` object:

```js
const { matchUps } = tournamentEngine.allTournamentMatchUps({
  inContext: true,
});

// Schedule data extracted from time items
matchUps[0].schedule = {
  scheduledDate: '2024-06-15',
  scheduledTime: '14:00',
  courtId: 'court-5',
  venueId: 'venue-1',
  startTime: '2024-06-15T14:05:00Z',
  endTime: '2024-06-15T16:15:00Z',
};
```

### Event Time Items

Time items on events track data retrieval and configuration:

**External Data Retrieval Timestamps**:

```js

**API Reference:** [allTournamentMatchUps](/docs/governors/query-governor#alltournamentmatchups)

{
  itemType: 'RETRIEVAL.RANKING.SINGLES.U18',
  itemValue: '2024-06-10T09:00:00Z',  // When data was fetched
  itemDate: '2024-06-10',
  createdAt: '2024-06-10T09:00:00Z'
}
```

This allows queries like "when were rankings last updated?" for display in client applications.

## Custom Use Cases

### Adding Time Items

Add time items to tournament elements for custom tracking:

**Add to Event**:

```js
const timeItem = {
  itemType: 'RETRIEVAL.RANKING.SINGLES.U18',
  itemValue: new Date().toISOString(),
  itemDate: new Date().toISOString().split('T')[0],
  createdAt: new Date().toISOString(),
};

tournamentEngine.addTimeItem({
  eventId: 'singles-u18',
  timeItem,
});
```

**Add to Participant**:

```js
const timeItem = {
  itemType: 'CUSTOM.CHECK_IN',
  itemValue: { location: 'Gate A', verified: true },
  itemDate: '2024-06-15',
  createdAt: new Date().toISOString(),
};

tournamentEngine.addTimeItem({
  participantId: 'player-123',
  timeItem,
});
```

**Add to MatchUp**:

```js
const timeItem = {
  itemType: 'CUSTOM.BROADCAST',
  itemValue: { channel: 'ESPN', startTime: '14:00' },
  itemDate: '2024-06-15',
  createdAt: new Date().toISOString(),
};

tournamentEngine.addTimeItem({
  matchUpId: 'match-456',
  drawId: 'draw-789',
  timeItem,
});
```

### Retrieving Time Items

Query time items from tournament elements:

**Get Specific Time Item Type**:

```js
const { timeItem, message } = tournamentEngine.getTimeItem({
  itemType: 'RETRIEVAL.RANKING.SINGLES.U18',
  eventId: 'singles-u18',
});

if (timeItem) {
  console.log(`Last ranking update: ${timeItem.itemValue}`);
}
```

**Get All Time Items**:

```js

**API Reference:** [getTimeItem](/docs/governors/query-governor#gettimeitem)

const { participant } = tournamentEngine.getParticipant({
  participantId: 'player-123',
});

// Access all time items
participant.timeItems?.forEach((item) => {
  console.log(`${item.itemType}: ${item.itemValue} (${item.itemDate})`);
});
```

**Filter Time Items by Type Pattern**:

```js
// Get all scale-related time items
const scaleItems = participant.timeItems?.filter((item) => item.itemType.startsWith('SCALE.'));

// Get all schedule-related time items
const scheduleItems = matchUp.timeItems?.filter((item) => item.itemType.startsWith('SCHEDULE.'));
```

## Practical Examples

### External Ranking Integration

Track when rankings were last fetched from external service:

```js
// Fetch rankings from external API
async function updateRankings(eventId) {
  const rankings = await fetchFromExternalAPI();

  // Update participant rankings
  rankings.forEach(({ participantId, ranking }) => {
    tournamentEngine.setParticipantScaleItem({
      participantId,
      scaleItem: {
        scaleType: 'RANKING',
        scaleValue: ranking,
        scaleName: 'ATP',
        eventType: 'SINGLES',
        scaleDate: new Date().toISOString().split('T')[0],
      },
    });
  });

  // Record retrieval timestamp
  tournamentEngine.addTimeItem({
    eventId,
    timeItem: {
      itemType: 'RETRIEVAL.RANKING.SINGLES.ATP',
      itemValue: new Date().toISOString(),
      itemDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
    },
  });
}

// Check if rankings need update
const { timeItem } = tournamentEngine.getTimeItem({
  eventId: 'singles-main',
  itemType: 'RETRIEVAL.RANKING.SINGLES.ATP',
});

const lastUpdate = timeItem ? new Date(timeItem.itemValue) : null;
const hoursSinceUpdate = lastUpdate ? (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60) : Infinity;

if (hoursSinceUpdate > 24) {
  await updateRankings('singles-main');
}
```

### Match Duration Tracking

Calculate match duration including interruptions:

```js

**API Reference:** [setParticipantScaleItem](/docs/governors/participant-governor#setparticipantscaleitem)

**API Reference:** [getTimeItem](/docs/governors/query-governor#gettimeitem)

function getMatchDuration(matchUp) {
  const timeItems = matchUp.timeItems || [];

  const start = timeItems.find((ti) => ti.itemType === 'SCHEDULE.TIME.START');
  const end = timeItems.find((ti) => ti.itemType === 'SCHEDULE.TIME.END');

  if (!start || !end) return null;

  const stops = timeItems.filter((ti) => ti.itemType === 'SCHEDULE.TIME.STOP');
  const resumes = timeItems.filter((ti) => ti.itemType === 'SCHEDULE.TIME.RESUME');

  // Calculate total elapsed time
  let totalMs = new Date(end.itemValue) - new Date(start.itemValue);

  // Subtract interruption periods
  stops.forEach((stop, index) => {
    const resume = resumes[index];
    if (resume) {
      const interruptionMs = new Date(resume.itemValue) - new Date(stop.itemValue);
      totalMs -= interruptionMs;
    }
  });

  return {
    totalMinutes: Math.round(totalMs / (1000 * 60)),
    interruptions: stops.length,
    startTime: start.itemValue,
    endTime: end.itemValue,
  };
}
```

### Audit Trail

Maintain complete history of court assignments:

```js
function getCourtAssignmentHistory(matchUp) {
  const courtAssignments = matchUp.timeItems
    ?.filter((ti) => ti.itemType === 'SCHEDULE.ASSIGNMENT.COURT')
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((ti) => ({
      courtId: ti.itemValue,
      assignedAt: ti.createdAt,
      effectiveDate: ti.itemDate,
    }));

  return courtAssignments || [];
}

// Example output:
// [
//   { courtId: 'court-5', assignedAt: '2024-06-14T16:00:00Z', effectiveDate: '2024-06-15' },
//   { courtId: 'court-2', assignedAt: '2024-06-15T11:30:00Z', effectiveDate: '2024-06-15' }
// ]
```

## Best Practices

### Date Format Consistency

**CRITICAL**: Always use ISO 8601 format for `itemDate` and `createdAt`:

```js
// ✓ CORRECT
const timeItem = {
  itemType: 'CUSTOM.EVENT',
  itemValue: someValue,
  itemDate: '2024-06-15', // YYYY-MM-DD
  createdAt: '2024-06-15T10:30:00Z', // ISO 8601 datetime
};

// ✗ WRONG
const badTimeItem = {
  itemDate: '06/15/2024', // Invalid format
  createdAt: new Date().toString(), // Non-ISO format
};
```

### Hierarchical Type Naming

Use consistent dot-notation hierarchy for custom types:

```js
// ✓ GOOD - Clear hierarchy
'CUSTOM.BROADCAST.ASSIGNMENT';
'CUSTOM.MEDIA.REQUEST';
'CUSTOM.FACILITY.ACCESS';

// ✗ AVOID - Flat or inconsistent
'CUSTOM_BROADCAST_ASSIGNMENT';
'broadcast.custom';
'CustomBroadcast';
```

### Value Consistency

Keep `itemValue` types consistent for the same `itemType`:

```js
// ✓ GOOD - Consistent value type
{ itemType: 'SCHEDULE.TIME.START', itemValue: '2024-06-15T14:00:00Z' }
{ itemType: 'SCHEDULE.TIME.START', itemValue: '2024-06-15T15:00:00Z' }

// ✗ AVOID - Inconsistent value types
{ itemType: 'SCHEDULE.TIME.START', itemValue: '2024-06-15T14:00:00Z' }
{ itemType: 'SCHEDULE.TIME.START', itemValue: 1718463600000 }  // Unix timestamp
```

## Related Documentation

- **[Scale Items](./scaleItems)** - Rankings, ratings, and seedings (stored as time items)
- **[Extensions](./extensions)** - Alternative for non-temporal custom data
- **[MatchUp Overview](./matchup-overview)** - MatchUp scheduling and timing
- **[Participants](./participants)** - Participant data management
