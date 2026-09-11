---
title: Events and Draws
---

Event publishing controls visibility of draw structures, matchUps, and results.

## Publishing All Draws

Publish all draws within an event:

```js
const { eventData } = engine.publishEvent({ eventId });

// eventData contains formatted payload for public display
// publishState updated with timeItem
// Subscribers notified via PUBLISH_EVENT topic
```

**API Reference:** [publishEvent](/docs/governors/publishing-governor#publishevent)

## Publishing Specific Draws

Publish only selected draws (useful for flights):

```js
// Shorthand for publishing specific drawIds
engine.publishEvent({
  eventId,
  drawIdsToAdd: ['drawId1', 'drawId2'],
});

// Remove draws from published set
engine.publishEvent({
  eventId,
  drawIdsToRemove: ['drawId3'],
});
```

**API Reference:** [publishEvent](/docs/governors/publishing-governor#publishevent)

## Publishing by Stage

Publish only specific stages within a draw:

```js
import { drawDefinitionConstants } from 'tods-competition-factory';
const { QUALIFYING, MAIN } = stageConstants;

// Publish only qualifying stage
engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: {
      stagesToAdd: [QUALIFYING],
    },
  },
});

// Publish MAIN and QUALIFYING
engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: {
      stagesToAdd: [MAIN, QUALIFYING],
      publishingDetail: { published: true },
    },
  },
});
```

**API Reference:** [publishEvent](/docs/governors/publishing-governor#publishevent)

## Round-by-Round Publishing

Control visibility round-by-round for progressive disclosure:

```js
// Publish only first round of a structure
engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: {
      structureDetails: {
        [structureId]: {
          roundLimit: 1,
          published: true,
        },
      },
    },
  },
});

// Expand to include more rounds as they complete
engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: {
      structureDetails: {
        [structureId]: {
          roundLimit: 2, // Now show rounds 1 and 2
          published: true,
        },
      },
    },
  },
});
```

**API Reference:** [publishEvent](/docs/governors/publishing-governor#publishevent)

## Publishing with Embargo

Schedule future publication with embargo timestamps. The data is stored as `published: true` immediately but remains **hidden from public queries** until the embargo time passes. See [Embargo and Scheduled Rounds](./publishing-embargo) for full details.

```js
const embargoTime = new Date('2024-06-15T10:00:00Z').toISOString();

// Draw-level embargo
engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: {
      publishingDetail: {
        published: true,
        embargo: embargoTime,
      },
    },
  },
});

// Stage-level embargo (e.g. embargo qualifying, show main immediately)
engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: {
      publishingDetail: { published: true },
      stageDetails: {
        QUALIFYING: { published: true, embargo: embargoTime },
        MAIN: { published: true },
      },
    },
  },
});

// Structure-level embargo
engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: {
      publishingDetail: { published: true },
      structureDetails: {
        [structureId]: { published: true, embargo: embargoTime },
      },
    },
  },
});
```

**API Reference:** [publishEvent](/docs/governors/publishing-governor#publishevent)

## Unpublishing Events

Remove events from public visibility:

```js
engine.unPublishEvent({
  eventId,
  removePriorValues: true, // Remove timeItems (default)
});
```

**API Reference:** [unPublishEvent](/docs/governors/publishing-governor#unpublishevent)
