---
title: Events & Categories
sidebar_position: 3
---

# Events and Categories in TMX

The Events tab in TMX provides tools for creating and managing tournament events with flexible category configurations including age, gender, rating, and custom categories. This demonstrates usage of the [Event Governor](../governors/event-governor.md) and [Competition Governor](../governors/competition-governor.md).

:::info Screenshots Coming Soon
This page will be updated with screenshots showing the TMX events management interface.
:::

## Overview

Event management in TMX includes:

- **Event Creation** - Single or multiple events with categories
- **Category Configuration** - Age groups, gender categories, rating ranges
- **Entry Management** - Assigning participants to events
- **Draw Size Configuration** - Setting draw sizes and structures
- **Flight Configuration** - Creating flights within events
- **Publishing Settings** - Control visibility and public access

## Factory Methods Used

### Creating Events

```js
// Create single event
tournamentEngine.addEvent({
  event: {
    eventName: "Men's Singles",
    eventType: 'SINGLES',
    gender: 'MALE',
    category: {
      categoryName: 'U18',
      ageCategoryCode: 'U18',
    },
  },
});

// Create multiple events
tournamentEngine.addEvents({
  events: [
    { eventName: "Men's Singles", eventType: 'SINGLES', gender: 'MALE' },
    { eventName: "Women's Singles", eventType: 'SINGLES', gender: 'FEMALE' },
    { eventName: 'Mixed Doubles', eventType: 'DOUBLES', gender: 'MIXED' },
  ],
});
```

### Managing Event Details

```js
// Update event
tournamentEngine.modifyEvent({
  eventId,
  event: {
    eventName: "Men's Open Singles",
    startDate: '2024-06-15',
    endDate: '2024-06-16',
  },
});

// Delete event
tournamentEngine.deleteEvents({
  eventIds: [eventId],
});
```

### Entry Management

```js
// Add entries to event
tournamentEngine.addEventEntries({
  eventId,
  participantIds: [id1, id2, id3],
  entryStatus: 'DIRECT_ACCEPTANCE',
  entryStage: 'MAIN',
});

// Remove entries
tournamentEngine.destroyEventEntries({
  eventId,
  participantIds: [id1],
});
```

## Key Features

### Event Types

TMX supports all factory event types:

- **SINGLES** - Individual competition
- **DOUBLES** - Team of 2 players
- **TEAM** - Multi-player teams
- **SINGLES_AND_DOUBLES** - Combined events

### Category System

#### Age Categories

```js
{
  category: {
    categoryName: 'Under 18',
    ageCategoryCode: 'U18',
    ageMin: 0,
    ageMax: 18,
    ballType: 'YELLOW'
  }
}
```

#### Rating Categories

```js
{
  category: {
    categoryName: 'Open',
    ratingType: 'WTN',
    ratingMin: 20,
    ratingMax: 40
  }
}
```

#### Gender Categories

- MALE
- FEMALE
- MIXED
- ANY

#### Combined Categories

```js
{
  category: {
    categoryName: 'Women\'s U16',
    ageCategoryCode: 'U16',
    ageMax: 16
  },
  gender: 'FEMALE'
}
```

### Flight Profile Configuration

TMX uses [Flight Profiles](../concepts/events/flights.mdx) for sophisticated event structures:

```js
// Single flight
tournamentEngine.setEventFlightProfile({
  eventId,
  flightProfile: {
    flights: [{ flightNumber: 1, drawSize: 16 }],
  },
});

// Multiple flights with rating ranges
tournamentEngine.setEventFlightProfile({
  eventId,
  flightProfile: {
    flights: [
      {
        flightNumber: 1,
        drawSize: 16,
        flightName: 'Gold Flight',
        ratingMin: 30,
        ratingMax: 40,
      },
      {
        flightNumber: 2,
        drawSize: 16,
        flightName: 'Silver Flight',
        ratingMin: 20,
        ratingMax: 30,
      },
    ],
  },
});
```

### Draw Definition Configuration

```js
// Set draw type and size
tournamentEngine.addDrawDefinition({
  eventId,
  drawSize: 32,
  drawType: 'SINGLE_ELIMINATION',
  seedingProfile: 'WATERFALL',
});
```

## UI Components

TMX uses these [courthive-components](https://courthive.github.io/courthive-components/):

- **EventsList** - Display all events with categories
- **EventForm** - Create/edit events
- **CategoryEditor** - Configure event categories
- **FlightProfileEditor** - Configure flights ([see in docs](../concepts/events/flights.mdx))
- **EntriesManager** - Assign participants to events
- **DrawConfiguration** - Set draw parameters

## Common Workflows

### Creating a Standard Event

```js
// 1. Define event
const event = {
  eventName: "Men's Open",
  eventType: 'SINGLES',
  gender: 'MALE',
  category: {
    categoryName: 'Open',
    ageCategoryCode: 'OPEN',
  },
};

// 2. Add event
const { event: createdEvent } = tournamentEngine.addEvent({ event });
const eventId = createdEvent.eventId;

// 3. Add participants
const { participants } = tournamentEngine.getParticipants({
  participantFilters: {
    participantTypes: ['INDIVIDUAL'],
    sex: 'MALE',
  },
});

const participantIds = participants.map((p) => p.participantId);

tournamentEngine.addEventEntries({
  eventId,
  participantIds,
  entryStatus: 'DIRECT_ACCEPTANCE',
});

// 4. Configure draw
tournamentEngine.addDrawDefinition({
  eventId,
  drawSize: 32,
  drawType: 'SINGLE_ELIMINATION',
  seedingProfile: 'WATERFALL',
});
```

### Creating Multiple Age Group Events

```js
const ageCategories = [
  { code: 'U10', max: 10 },
  { code: 'U12', max: 12 },
  { code: 'U14', max: 14 },
  { code: 'U16', max: 16 },
  { code: 'U18', max: 18 },
];

const events = ageCategories.flatMap((cat) => [
  {
    eventName: `Boys ${cat.code}`,
    eventType: 'SINGLES',
    gender: 'MALE',
    category: {
      categoryName: cat.code,
      ageCategoryCode: cat.code,
      ageMax: cat.max,
    },
  },
  {
    eventName: `Girls ${cat.code}`,
    eventType: 'SINGLES',
    gender: 'FEMALE',
    category: {
      categoryName: cat.code,
      ageCategoryCode: cat.code,
      ageMax: cat.max,
    },
  },
]);

tournamentEngine.addEvents({ events });
```

### Auto-Assignment by Category

```js
// Get all participants
const { participants } = tournamentEngine.getParticipants();

// Get all events
const { events } = tournamentEngine.getEvents();

// Auto-assign to matching categories
events.forEach((event) => {
  const matchingParticipants = participants.filter((p) => {
    // Match gender
    if (event.gender !== 'ANY' && p.person.sex !== event.gender) {
      return false;
    }

    // Match age category
    if (event.category?.ageMax) {
      const age = calculateAge(p.person.birthDate);
      if (age > event.category.ageMax) return false;
    }

    return true;
  });

  if (matchingParticipants.length > 0) {
    tournamentEngine.addEventEntries({
      eventId: event.eventId,
      participantIds: matchingParticipants.map((p) => p.participantId),
      entryStatus: 'DIRECT_ACCEPTANCE',
    });
  }
});
```

## Entry Status Management

TMX handles various entry statuses:

```js
// Direct acceptance (main draw)
tournamentEngine.addEventEntries({
  eventId,
  participantIds,
  entryStatus: 'DIRECT_ACCEPTANCE',
  entryStage: 'MAIN',
});

// Alternate entries
tournamentEngine.addEventEntries({
  eventId,
  participantIds,
  entryStatus: 'ALTERNATE',
  entryStage: 'MAIN',
});

// Qualifying entries
tournamentEngine.addEventEntries({
  eventId,
  participantIds,
  entryStatus: 'DIRECT_ACCEPTANCE',
  entryStage: 'QUALIFYING',
});
```

## Publishing Configuration

```js
// Set event publishing state
tournamentEngine.setEventPublishState({
  eventId,
  published: true,
});

// Configure what to publish
tournamentEngine.setEventPublishingDetail({
  eventId,
  publishingDetail: {
    published: {
      draws: true,
      entries: true,
      results: true,
      schedule: false,
    },
  },
});
```

## Best Practices

### Event Planning

- Create events before adding entries
- Use consistent naming conventions
- Configure categories before assignment
- Set draw sizes based on expected entries

### Category Configuration

- Use standard age category codes (U10, U12, U14, etc.)
- Set appropriate rating ranges for flights
- Consider ball type for age categories
- Use gender filtering appropriately

### Entry Management Best Practices

- Validate participant eligibility before assignment
- Use appropriate entry status
- Handle wait lists with ALTERNATE status
- Track entry stage (MAIN, QUALIFYING, CONSOLATION)

### Performance

- Create multiple events at once with addEvents
- Batch participant assignments
- Query events once and filter in UI
- Cache event configurations

## Related Documentation

- [Event Governor](../governors/event-governor.md) - All event-related methods
- [Competition Governor](../governors/competition-governor.md) - Tournament-level operations
- [Entries Concepts](../concepts/events/entries.mdx) - Entry management details
- [Flight Profile](../concepts/events/flights.mdx) - Advanced flight configuration
- [Categories](../concepts/events/categories.mdx) - Category system details

## Next Steps

Once events are configured with entries, proceed to [Draws](./draws.md) to generate draw structures and position participants.
