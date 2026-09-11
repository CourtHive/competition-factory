---
title: Workflows and Best Practices
---

## Common Workflows

### Progressive Draw Publication

Gradually release draw information as tournament progresses:

```js
// Day 1: Publish first round only
engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: {
      structureDetails: {
        [structureId]: { roundLimit: 1, published: true },
      },
    },
  },
});

// Day 2: Expand to show rounds 1-2
engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: {
      structureDetails: {
        [structureId]: { roundLimit: 2, published: true },
      },
    },
  },
});

// Day 3: Publish entire draw
engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: { publishingDetail: { published: true } },
  },
});
```

**API Reference:** [publishEvent](/docs/governors/publishing-governor#publishevent)

### Multi-Stage Publication

Publish qualifying first, main draw later:

```js
import { drawDefinitionConstants } from 'tods-competition-factory';

// Publish qualifying only
engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: {
      stagesToAdd: [stageConstants.QUALIFYING],
    },
  },
});

// Later: add main draw
engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: {
      stagesToAdd: [stageConstants.MAIN],
    },
  },
});
```

**API Reference:** [publishEvent](/docs/governors/publishing-governor#publishevent)

### Daily Order of Play

Publish each day's schedule separately:

```js
// Each morning, publish that day's schedule
const today = new Date().toISOString().split('T')[0];

engine.publishOrderOfPlay({
  scheduledDates: [today],
  removePriorValues: false, // Keep previous days published
});
```

**API Reference:** [publishOrderOfPlay](/docs/governors/publishing-governor#publishorderofplay)

### Coordinated Event and Seeding Release

Separate seeding announcement from draw publication:

```js
// Step 1: Announce seeded players
engine.publishEventSeeding({ eventId });
// Subscription notification sent
// Public site shows seeded players without draw

// Step 2: Later, publish draw
engine.publishEvent({ eventId });
// Subscription notification sent
// Public site shows complete draw with seeding
```

**API Reference:** [publishEventSeeding](/docs/governors/publishing-governor#publisheventseeding), [publishEvent](/docs/governors/publishing-governor#publishevent)

## Querying with Publish State

Methods that respect publish state when `usePublishState: true`:

### Event Data

```js
const { eventData } = engine.getEventData({
  eventId,
  usePublishState: true, // Filter to published draws/structures only
});
```

**API Reference:** [getEventData](/docs/governors/query-governor#geteventdata)

### Competition Schedule

```js
const { dateMatchUps } = engine.competitionScheduleMatchUps({
  usePublishState: true, // Only published dates and events
});
```

**API Reference:** [competitionScheduleMatchUps](/docs/governors/query-governor#competitionschedulematchups)

### Participants

```js
const { participants } = engine.getParticipants({
  usePublishState: true, // Respect privacy policies
  policyDefinitions: privacyPolicy,
});
```

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

## Best Practices

### Clear Separation

Maintain clear separation between internal and public-facing queries:

```js
// Internal operations - full data access
const { matchUps } = engine.allTournamentMatchUps();

// Public displays - filtered data
const { matchUps: publicMatchUps } = engine.allTournamentMatchUps({
  usePublishState: true,
});
```

**API Reference:** [allTournamentMatchUps](/docs/governors/query-governor#alltournamentmatchups)

### Test Publish State

Verify filtering works before going live:

```js
// Publish event
engine.publishEvent({ eventId });

// Query what public will see
const { eventData } = engine.getEventData({
  eventId,
  usePublishState: true,
});

// Verify expected structures/rounds visible
assert(eventData.drawsData.length === expectedCount);
```

**API Reference:** [publishEvent](/docs/governors/publishing-governor#publishevent), [getEventData](/docs/governors/query-governor#geteventdata)

### Atomic Publications

Use `removePriorValues: true` for clean state transitions:

```js
// Replace previous publication completely
engine.publishOrderOfPlay({
  scheduledDates: newDates,
  removePriorValues: true, // Clean slate
});
```

**API Reference:** [publishOrderOfPlay](/docs/governors/publishing-governor#publishorderofplay)
