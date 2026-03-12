---
title: Scale Items
---

## Overview

**Scale Items** capture participant competitive metrics: rankings, ratings, and seedings. These values help determine participant placement in draws, seeding positions, and competitive levels. Scale items are implemented as [Time Items](./timeItems), allowing participants to maintain historical values with effective dates.

### Key Concepts

**Scale Types**: RANKING, RATING, SEEDING
**Scale Names**: Organization-specific identifiers (WTN, UTR, NTRP, etc.)
**Event Types**: SINGLES, DOUBLES, TEAM
**Scale Dates**: Effective date for the scale value
**Time Items**: Scale items are stored as time items with temporal validity
**Accessors**: Path notation for accessing nested scale values

:::tip
The [Scale Engine](/docs/scale-engine/scale-engine-overview) can automatically compute and persist ranking point scale items from tournament results using [ranking policies](/docs/policies/rankingPolicy). See [applyTournamentRankingPoints](/docs/scale-engine/scale-engine-api#applytournamentrankingpoints).
:::

## Scale Types

### RANKING

Ordinal position in a competitive hierarchy (lower numbers = better):

```js
const rankingItem = {
  scaleType: 'RANKING',
  scaleValue: 42, // 42nd in the ranking
  scaleName: 'ATP',
  eventType: 'SINGLES',
  scaleDate: '2024-06-15',
};

tournamentEngine.setParticipantScaleItem({
  participantId: 'player-123',
  scaleItem: rankingItem,
});
```

**Common Ranking Systems:**

- ATP / WTA Singles/Doubles Rankings
- ITF Junior Rankings
- National Rankings
- Regional Rankings

### RATING

Numerical assessment of playing ability (can be any numeric range):

```js

**API Reference:** [setParticipantScaleItem](/docs/governors/participant-governor#setparticipantscaleitem)

const ratingItem = {
  scaleType: 'RATING',
  scaleValue: 8.3, // WTN rating (1.0-16.0 scale)
  scaleName: 'WTN',
  eventType: 'SINGLES',
  scaleDate: '2024-06-15',
};

tournamentEngine.setParticipantScaleItem({
  participantId: 'player-123',
  scaleItem: ratingItem,
});
```

**Common Rating Systems:**

- WTN (World Tennis Number): 1.0-16.0
- UTR (Universal Tennis Rating): 1.0-16.0
- NTRP (National Tennis Rating Program): 1.5-7.0
- LTA Rating: Various scales

### SEEDING

Tournament-specific competitive ordering:

```js

**API Reference:** [setParticipantScaleItem](/docs/governors/participant-governor#setparticipantscaleitem)

const seedingItem = {
  scaleType: 'SEEDING',
  scaleValue: 1, // Seed number (1 = top seed)
  scaleName: 'Tournament Seeding',
  eventType: 'SINGLES',
  scaleDate: '2024-06-15',
};

tournamentEngine.setParticipantScaleItem({
  participantId: 'player-123',
  scaleItem: seedingItem,
});
```

Seeding values determine draw placement and are typically generated from rankings or ratings.

## Scale Item Structure

### Basic Structure

```typescript

**API Reference:** [setParticipantScaleItem](/docs/governors/participant-governor#setparticipantscaleitem)

type ScaleItem = {
  scaleType: 'RANKING' | 'RATING' | 'SEEDING';
  scaleValue: number | object; // Numeric value or complex object
  scaleName: string; // Identifier for the scale system
  eventType: 'SINGLES' | 'DOUBLES' | 'TEAM';
  scaleDate: string; // ISO date (YYYY-MM-DD)

  // Optional attributes
  scaleAttributes?: {
    accessor?: string; // Path to nested value
    [key: string]: any; // Additional metadata
  };
};
```

### Simple Numeric Values

Most scale items use simple numeric values:

```js
// ATP Ranking
{
  scaleType: 'RANKING',
  scaleValue: 7,
  scaleName: 'ATP',
  eventType: 'SINGLES',
  scaleDate: '2024-06-15'
}

// UTR Rating
{
  scaleType: 'RATING',
  scaleValue: 12.5,
  scaleName: 'UTR',
  eventType: 'SINGLES',
  scaleDate: '2024-06-15'
}
```

### Complex Object Values

Scale values can be objects with multiple attributes:

```js
// NTRP with additional metadata
const complexScaleItem = {
  scaleType: 'RATING',
  scaleValue: {
    ntrpRating: 4.5,
    ratingYear: '2024',
    ustaRatingType: 'C', // Computer-generated
    district: 'SoCal',
  },
  scaleName: 'NTRP',
  eventType: 'DOUBLES',
  scaleDate: '2024-01-01',
};

// Use accessor to specify which attribute is the primary value
const scaleAttributes = {
  scaleType: 'RATING',
  scaleName: 'NTRP',
  eventType: 'DOUBLES',
  accessor: 'ntrpRating', // Points to the numeric rating value
};
```

**See:** [Accessors](./accessors) for detailed accessor documentation.

## Setting Scale Items

### Single Scale Item

Set one scale item for a participant:

```js
tournamentEngine.setParticipantScaleItem({
  participantId: 'player-123',
  scaleItem: {
    scaleType: 'RATING',
    scaleValue: 8.3,
    scaleName: 'WTN',
    eventType: 'SINGLES',
    scaleDate: '2024-06-15',
  },
});
```

### Multiple Scale Items

Set multiple scale items at once:

```js

**API Reference:** [setParticipantScaleItem](/docs/governors/participant-governor#setparticipantscaleitem)

tournamentEngine.setParticipantScaleItems({
  participantId: 'player-123',
  scaleItems: [
    {
      scaleType: 'RATING',
      scaleValue: 8.3,
      scaleName: 'WTN',
      eventType: 'SINGLES',
      scaleDate: '2024-06-15',
    },
    {
      scaleType: 'RATING',
      scaleValue: 7.8,
      scaleName: 'WTN',
      eventType: 'DOUBLES',
      scaleDate: '2024-06-15',
    },
    {
      scaleType: 'RANKING',
      scaleValue: 142,
      scaleName: 'ATP',
      eventType: 'SINGLES',
      scaleDate: '2024-06-15',
    },
  ],
});
```

### Bulk Setting for Multiple Participants

Set scale items for many participants efficiently:

```js

**API Reference:** [setParticipantScaleItems](/docs/governors/participant-governor#setparticipantscaleitems)

const participantScaleItems = [
  {
    participantId: 'player-1',
    scaleItems: [
      { scaleType: 'RATING', scaleValue: 10.2, scaleName: 'WTN', eventType: 'SINGLES', scaleDate: '2024-06-15' },
    ],
  },
  {
    participantId: 'player-2',
    scaleItems: [
      { scaleType: 'RATING', scaleValue: 9.8, scaleName: 'WTN', eventType: 'SINGLES', scaleDate: '2024-06-15' },
    ],
  },
];

participantScaleItems.forEach(({ participantId, scaleItems }) => {
  tournamentEngine.setParticipantScaleItems({ participantId, scaleItems });
});
```

## Retrieving Scale Items

### Get Specific Scale Item

Retrieve the most recent scale item matching specific criteria:

```js

**API Reference:** [setParticipantScaleItems](/docs/governors/participant-governor#setparticipantscaleitems)

const { scaleItem } = tournamentEngine.getParticipantScaleItem({
  participantId: 'player-123',
  scaleAttributes: {
    scaleType: 'RATING',
    scaleName: 'WTN',
    eventType: 'SINGLES',
  },
});

// Returns the scale item with the latest scaleDate
console.log(scaleItem.scaleValue); // 8.3
console.log(scaleItem.scaleDate); // '2024-06-15'
```

**Important:** When multiple scale items match the criteria, the one with the **latest scaleDate** is returned.

### Get All Scale Items

Retrieve all scale items for a participant:

```js

**API Reference:** [getParticipantScaleItem](/docs/governors/query-governor#getparticipantscaleitem)

const { participant } = tournamentEngine.getParticipant({
  participantId: 'player-123',
});

// Scale items stored as time items
participant.timeItems?.forEach((timeItem) => {
  if (timeItem.itemType === 'SCALE') {
    console.log(`${timeItem.itemSubTypes}: ${timeItem.itemValue}`);
  }
});
```

### Filter by Scale Type

Get all ratings, rankings, or seedings:

```js
const { participant } = tournamentEngine.getParticipant({
  participantId: 'player-123',
});

const ratings = participant.timeItems?.filter(
  (item) => item.itemType === 'SCALE' && item.itemSubTypes?.includes('RATING'),
);

const rankings = participant.timeItems?.filter(
  (item) => item.itemType === 'SCALE' && item.itemSubTypes?.includes('RANKING'),
);
```

## Time Items Integration

Scale items are stored as [Time Items](./timeItems), providing temporal validity:

```js
// Scale item as time item
{
  itemType: 'SCALE',
  itemSubTypes: ['RATING', 'SINGLES', 'WTN'],
  itemValue: 8.3,
  itemDate: '2024-06-15',
  createdAt: '2024-06-15T10:30:00Z'
}
```

### Historical Values

Maintain history of participant ratings/rankings:

```js
// Set rating from January
tournamentEngine.setParticipantScaleItem({
  participantId: 'player-123',
  scaleItem: {
    scaleType: 'RATING',
    scaleValue: 7.8,
    scaleName: 'WTN',
    eventType: 'SINGLES',
    scaleDate: '2024-01-15',
  },
});

// Set updated rating from June
tournamentEngine.setParticipantScaleItem({
  participantId: 'player-123',
  scaleItem: {
    scaleType: 'RATING',
    scaleValue: 8.3,
    scaleName: 'WTN',
    eventType: 'SINGLES',
    scaleDate: '2024-06-15',
  },
});

// getParticipantScaleItem returns the June value (latest)
const { scaleItem } = tournamentEngine.getParticipantScaleItem({
  participantId: 'player-123',
  scaleAttributes: {
    scaleType: 'RATING',
    scaleName: 'WTN',
    eventType: 'SINGLES',
  },
});

console.log(scaleItem.scaleValue); // 8.3 (latest)
```

## Generating Seeding Scale Items

Seeding determines participant placement within draw structures. The Competition Factory provides three approaches for generating seeding scale items:

1. **Client-Implemented Seeding** - Full control over seed order determination
2. **Factory getScaledEntries()** - Helper method for sorting entries by scale values
3. **Factory autoSeeding()** - Automatic seeding generation and assignment

### Client-Implemented Seeding

Organizations often have proprietary methods for determining seed order, especially for:

- **Doubles/Team events** - Combining individual ratings
- **Multiple rating systems** - Prioritizing which scale to use
- **Confidence bands** - Grouping participants by rating confidence
- **Custom rules** - Organization-specific seeding policies

**Pattern:**

1. Retrieve entries and determine seeds count
2. Implement custom logic to sort/order participants
3. Generate seeding scale items from sorted list
4. Save scale items to participants

**Example (from TMX):**

```js

**API Reference:** [getParticipantScaleItem](/docs/governors/query-governor#getparticipantscaleitem)

// Step 1: Get entries and seeds count
const { seedsCount, stageEntries } = tournamentEngine.getEntriesAndSeedsCount({
  policyDefinitions: POLICY_SEEDING,
  eventId,
  stage,
});

// Step 2: Implement custom sorting logic
// Group participants by rating confidence bands (high, medium, low)
const bandedParticipants = { high: [], medium: [], low: [] };
for (const participant of entries) {
  const rating = participant.ratings?.wtn;
  const confidence = rating?.confidence ?? 100;
  const band = getConfidenceBand(confidence); // 'high', 'medium', or 'low'
  bandedParticipants[band].push(participant);
}

// Sort within each confidence band, then concatenate
const scaledEntries = [
  ...bandedParticipants.high.sort((a, b) => a.ratings.wtn.rating - b.ratings.wtn.rating),
  ...bandedParticipants.medium.sort((a, b) => a.ratings.wtn.rating - b.ratings.wtn.rating),
  ...bandedParticipants.low.sort((a, b) => a.ratings.wtn.rating - b.ratings.wtn.rating),
].slice(0, seedsCount);

// Step 3: Generate seeding scale items
const scaleAttributes = {
  scaleType: 'SEEDING',
  scaleName: eventId,
  eventType: 'SINGLES',
};

const { scaleItemsWithParticipantIds } = tournamentEngine.generateSeedingScaleItems({
  scaleAttributes,
  scaledEntries, // Pre-sorted by client
  stageEntries,
  seedsCount,
  scaleName: eventId,
});

// Step 4: Save to participants
scaleItemsWithParticipantIds.forEach(({ participantId, scaleItems }) => {
  tournamentEngine.setParticipantScaleItems({ participantId, scaleItems });
});
```

**Key Points:**

- **Seed order determination is client responsibility** - The factory doesn't know how to interpret proprietary rating systems
- **generateSeedingScaleItems() assigns seed numbers** - Based on the order of participants in `scaledEntries`
- **First participant in array = Seed 1** - The array order determines seeding

### Using Factory getScaledEntries()

For simpler cases where standard sorting by a scale value is sufficient, use `getScaledEntries()`:

```js

**API Reference:** [generateSeedingScaleItems](/docs/governors/generation-governor#generateseedingscaleitems)

**API Reference:** [setParticipantScaleItems](/docs/governors/participant-governor#setparticipantscaleitems)

// Step 1: Get scaled entries sorted by scale value
const { scaledEntries } = tournamentEngine.getScaledEntries({
  eventId,
  stage,
  scaleAttributes: {
    scaleType: 'RATING',
    scaleName: 'WTN',
    eventType: 'SINGLES',
    accessor: 'wtnRating',
  },
  sortDescending: true, // highest rating first
});

// Step 2: Get seeds count
const { seedsCount } = tournamentEngine.getEntriesAndSeedsCount({
  policyDefinitions: POLICY_SEEDING,
  eventId,
  stage,
});

// Step 3: Take top N entries and generate seeding
const topEntries = scaledEntries.slice(0, seedsCount);

const { scaleItemsWithParticipantIds } = tournamentEngine.generateSeedingScaleItems({
  scaleAttributes: {
    scaleType: 'SEEDING',
    scaleName: eventId,
    eventType: 'SINGLES',
  },
  scaledEntries: topEntries,
  seedsCount,
  scaleName: eventId,
});

// Step 4: Save to participants
scaleItemsWithParticipantIds.forEach(({ participantId, scaleItems }) => {
  tournamentEngine.setParticipantScaleItems({ participantId, scaleItems });
});
```

**See:** [queryGovernor.getScaledEntries](/docs/governors/query-governor#getscaledentries) for complete documentation.

### Using Factory autoSeeding()

For fully automated seeding generation and assignment:

```js

**API Reference:** [getScaledEntries](/docs/governors/query-governor#getscaledentries)

**API Reference:** [getEntriesAndSeedsCount](/docs/governors/query-governor#getentriesandseedscount)

**API Reference:** [generateSeedingScaleItems](/docs/governors/generation-governor#generateseedingscaleitems)

**API Reference:** [setParticipantScaleItems](/docs/governors/participant-governor#setparticipantscaleitems)

// Automatically generate and assign seeding based on WTN ratings
const result = tournamentEngine.autoSeeding({
  eventId: 'singles-main',
  policyDefinitions: {
    seeding: {
      seedingProfile: 'WTN',
      scaleAttributes: {
        scaleType: 'RATING',
        scaleName: 'WTN',
        eventType: 'SINGLES',
      },
    },
  },
});

// Seeds automatically generated and assigned to participants
```

**Limitations:**

- Uses default sorting (ascending/descending based on scaleType)
- No support for custom sorting logic (confidence bands, multiple scales, etc.)
- Best for simple single-scale seeding scenarios

**See:** [Auto Seeding](/docs/governors/draws-governor#autoseeding) for complete documentation.

## Scale Attributes

**Scale attributes** define criteria for retrieving or matching scale items:

```typescript

**API Reference:** [autoSeeding](/docs/governors/draws-governor#autoseeding)

type ScaleAttributes = {
  scaleType: 'RANKING' | 'RATING' | 'SEEDING';
  scaleName: string;
  eventType: 'SINGLES' | 'DOUBLES' | 'TEAM';
  accessor?: string; // For complex scaleValue objects
  scaleDate?: string; // Optional date constraint
};
```

### Basic Matching

```js
const scaleAttributes = {
  scaleType: 'RATING',
  scaleName: 'WTN',
  eventType: 'SINGLES',
};

// Finds the most recent WTN singles rating
const { scaleItem } = tournamentEngine.getParticipantScaleItem({
  participantId: 'player-123',
  scaleAttributes,
});
```

### With Accessor

When scale values are objects, use accessor to specify the value location:

```js

**API Reference:** [getParticipantScaleItem](/docs/governors/query-governor#getparticipantscaleitem)

const scaleAttributes = {
  scaleType: 'RATING',
  scaleName: 'NTRP',
  eventType: 'DOUBLES',
  accessor: 'ntrpRating', // Extract this property from scaleValue object
};

const { scaleItem } = tournamentEngine.getParticipantScaleItem({
  participantId: 'player-123',
  scaleAttributes,
});

// scaleItem.scaleValue = { ntrpRating: 4.5, ratingYear: '2024', ... }
// Accessor 'ntrpRating' extracts 4.5 as the comparison value
```

**See:** [Accessors](./accessors) for comprehensive accessor documentation.

## Practical Examples

### Tournament Entry with Ratings

```js

**API Reference:** [getParticipantScaleItem](/docs/governors/query-governor#getparticipantscaleitem)

// Add participants with ratings
const participants = [
  {
    participantId: 'player-1',
    person: {
      standardGivenName: 'Roger',
      standardFamilyName: 'Federer',
    },
  },
  {
    participantId: 'player-2',
    person: {
      standardGivenName: 'Rafael',
      standardFamilyName: 'Nadal',
    },
  },
];

tournamentEngine.addParticipants({ participants });

// Set ratings
tournamentEngine.setParticipantScaleItem({
  participantId: 'player-1',
  scaleItem: {
    scaleType: 'RATING',
    scaleValue: 10.5,
    scaleName: 'WTN',
    eventType: 'SINGLES',
    scaleDate: '2024-06-15',
  },
});

tournamentEngine.setParticipantScaleItem({
  participantId: 'player-2',
  scaleItem: {
    scaleType: 'RATING',
    scaleValue: 10.3,
    scaleName: 'WTN',
    eventType: 'SINGLES',
    scaleDate: '2024-06-15',
  },
});
```

### Seeding from Rankings

```js

**API Reference:** [addParticipants](/docs/governors/participant-governor#addparticipants)

**API Reference:** [setParticipantScaleItem](/docs/governors/participant-governor#setparticipantscaleitem)

// Set ATP rankings
const rankings = [
  { participantId: 'player-1', ranking: 1 },
  { participantId: 'player-2', ranking: 2 },
  { participantId: 'player-3', ranking: 5 },
  { participantId: 'player-4', ranking: 8 },
];

rankings.forEach(({ participantId, ranking }) => {
  tournamentEngine.setParticipantScaleItem({
    participantId,
    scaleItem: {
      scaleType: 'RANKING',
      scaleValue: ranking,
      scaleName: 'ATP',
      eventType: 'SINGLES',
      scaleDate: '2024-06-15',
    },
  });
});

// Auto-seed from rankings
tournamentEngine.autoSeeding({
  eventId: 'singles-main',
  policyDefinitions: {
    seeding: {
      scaleAttributes: {
        scaleType: 'RANKING',
        scaleName: 'ATP',
        eventType: 'SINGLES',
      },
    },
  },
});
```

### Multiple Rating Systems

Maintain ratings in different systems:

```js

**API Reference:** [setParticipantScaleItem](/docs/governors/participant-governor#setparticipantscaleitem)

**API Reference:** [autoSeeding](/docs/governors/draws-governor#autoseeding)

const multipleRatings = [
  {
    scaleType: 'RATING',
    scaleValue: 10.2,
    scaleName: 'WTN',
    eventType: 'SINGLES',
    scaleDate: '2024-06-15',
  },
  {
    scaleType: 'RATING',
    scaleValue: 11.5,
    scaleName: 'UTR',
    eventType: 'SINGLES',
    scaleDate: '2024-06-15',
  },
  {
    scaleType: 'RATING',
    scaleValue: 5.0,
    scaleName: 'NTRP',
    eventType: 'SINGLES',
    scaleDate: '2024-06-15',
  },
];

tournamentEngine.setParticipantScaleItems({
  participantId: 'player-123',
  scaleItems: multipleRatings,
});

// Retrieve specific rating
const { scaleItem: wtn } = tournamentEngine.getParticipantScaleItem({
  participantId: 'player-123',
  scaleAttributes: {
    scaleType: 'RATING',
    scaleName: 'WTN',
    eventType: 'SINGLES',
  },
});

const { scaleItem: utr } = tournamentEngine.getParticipantScaleItem({
  participantId: 'player-123',
  scaleAttributes: {
    scaleType: 'RATING',
    scaleName: 'UTR',
    eventType: 'SINGLES',
  },
});
```

### Singles and Doubles Ratings

Participants can have different ratings for each event type:

```js

**API Reference:** [setParticipantScaleItems](/docs/governors/participant-governor#setparticipantscaleitems)

**API Reference:** [getParticipantScaleItem](/docs/governors/query-governor#getparticipantscaleitem)

tournamentEngine.setParticipantScaleItems({
  participantId: 'player-123',
  scaleItems: [
    {
      scaleType: 'RATING',
      scaleValue: 9.2,
      scaleName: 'WTN',
      eventType: 'SINGLES',
      scaleDate: '2024-06-15',
    },
    {
      scaleType: 'RATING',
      scaleValue: 8.7, // Different rating for doubles
      scaleName: 'WTN',
      eventType: 'DOUBLES',
      scaleDate: '2024-06-15',
    },
  ],
});
```

## Best Practices

### Date Format Requirements

**CRITICAL:** Scale dates **MUST** use ISO 8601 date format (`YYYY-MM-DD`). The factory will not function correctly with other date formats:

```js

**API Reference:** [setParticipantScaleItems](/docs/governors/participant-governor#setparticipantscaleitems)

// ✓ CORRECT - ISO 8601 format (YYYY-MM-DD)
const scaleDate = '2024-06-15';

// ✗ WRONG - These formats will cause errors
const badDate1 = '06/15/2024'; // US format - not supported
const badDate2 = '15-06-2024'; // European format - not supported
const badDate3 = '15/06/2024'; // Slash format - not supported
const badDate4 = '2024.06.15'; // Dot format - not supported
```

**Date Format Specification:**

- **Required format**: `YYYY-MM-DD`
- **Year**: 4 digits (e.g., `2024`)
- **Month**: 2 digits, zero-padded (e.g., `01` for January, `12` for December)
- **Day**: 2 digits, zero-padded (e.g., `01`, `15`, `31`)
- **Separator**: hyphen (`-`) only

### Scale Name Consistency

Use consistent scale names across your tournament:

```js
// Define constants for scale names
const SCALE_NAMES = {
  WTN: 'WTN',
  UTR: 'UTR',
  NTRP: 'NTRP',
  ATP: 'ATP',
  WTA: 'WTA',
};

// Use consistently
const scaleItem = {
  scaleType: 'RATING',
  scaleValue: 8.3,
  scaleName: SCALE_NAMES.WTN, // ✓ Good
  eventType: 'SINGLES',
  scaleDate: '2024-06-15',
};
```

### Event Type Alignment

Ensure scale items match the event they're used for:

```js
// For singles event, use singles ratings
tournamentEngine.autoSeeding({
  eventId: 'singles-event',
  policyDefinitions: {
    seeding: {
      scaleAttributes: {
        scaleType: 'RATING',
        scaleName: 'WTN',
        eventType: 'SINGLES', // ✓ Matches event type
      },
    },
  },
});
```

### Complex Values with Accessors

When using object scale values, always provide accessor for operations:

```js

**API Reference:** [autoSeeding](/docs/governors/draws-governor#autoseeding)

// Complex scale value
const scaleItem = {
  scaleType: 'RATING',
  scaleValue: {
    rating: 4.5,
    year: '2024',
    type: 'C',
  },
  scaleName: 'NTRP',
  eventType: 'SINGLES',
  scaleDate: '2024-06-15',
};

// Always provide accessor for retrieval and seeding
const scaleAttributes = {
  scaleType: 'RATING',
  scaleName: 'NTRP',
  eventType: 'SINGLES',
  accessor: 'rating', // ✓ Specifies which property is the numeric value
};
```

## Related Documentation

- **[Accessors](./accessors)** - Accessing nested scale values
- **[Time Items](./timeItems)** - Temporal data storage
- **[Participants](./participants)** - Participant data management
- **[Auto Seeding](/docs/governors/draws-governor#autoseeding)** - Automatic seeding generation
- **[Participant Governor](/docs/governors/participant-governor)** - Scale item methods
