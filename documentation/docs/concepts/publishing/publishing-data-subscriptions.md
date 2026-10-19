---
title: Data and Subscriptions
---

## Data Preparation for Publishing

Publishing methods prepare optimized data payloads for public display.

### Event Data Payload

```js
const { eventData } = engine.publishEvent({
  eventId,
  eventDataParams: {
    allParticipantResults: true, // Calculate results for tallied structures that store none
    refreshResults: true, // Recalculate those results for this projection
    participantsProfile: {
      withISO2: true, // Include country codes
      withIOC: true,
    },
  },
});

// eventData structure optimized for visualization:
// - drawsData: Array of draws with structures
// - matchUps: Organized by rounds for each structure
// - participants: Hydrated participant information
// - venuesData: Venue and court information
// - tournamentInfo: Tournament metadata
```

**API Reference:** [publishEvent](/docs/governors/publishing-governor#publishevent)

:::important
**Event Data Parameters Are Not Persisted**

The `eventDataParams` passed to `publishEvent()` are used to generate the `eventData` payload **for that specific call only**. These parameters are **NOT stored** in the publish state timeItem.

**Client applications must pass their own query parameters:**

```js
// Server-side publishing (generates payload for subscriptions)
engine.publishEvent({
  eventId,
  eventDataParams: { participantsProfile: { withISO2: true } },
});

// Client application querying published data
const { eventData } = engine.getEventData({
  eventId,
  usePublishState: true, // Respects what's published
  participantsProfile: { withISO2: true }, // Must specify params again
});
```

The publish state timeItem controls **filtering** (which draws, structures, rounds are visible) but does not store query customization parameters. Each client application specifies its own data requirements when querying.
:::

**API Reference:** [publishEvent](/docs/governors/publishing-governor#publishevent), [getEventData](/docs/governors/query-governor#geteventdata)

### Prepared Payload Structure

```typescript
{
  eventData: {
    eventInfo: {
      eventId: string;
      eventName: string;
      // ... event metadata
    },
    drawsData: [{
      drawId: string;
      drawName: string;
      structures: [{
        structureId: string;
        structureName: string;
        roundMatchUps: {
          [roundNumber]: matchUp[]
        }
      }]
    }],
    participants: Participant[],
    venuesData: Venue[],
    tournamentInfo: TournamentInfo
  }
}
```

## Subscriptions and Notifications

Publishing actions trigger **subscription notifications** enabling real-time updates to public-facing systems.

### Publishing Topics

```js
import { topicConstants } from 'tods-competition-factory';

const subscriptions = {
  [topicConstants.PUBLISH_EVENT]: (payload) => {
    // Event published - update public website
    const { eventData, eventId } = payload;
    updatePublicSite(eventData);
  },

  [topicConstants.UNPUBLISH_EVENT]: (payload) => {
    // Event unpublished - remove from public website
    const { eventId } = payload;
    removeFromPublicSite(eventId);
  },

  [topicConstants.PUBLISH_EVENT_SEEDING]: (payload) => {
    // Seeding published - update seeding displays
    const { eventId, seedingData } = payload;
    updateSeedingDisplay(seedingData);
  },

  [topicConstants.UNPUBLISH_EVENT_SEEDING]: (payload) => {
    // Seeding unpublished - remove seeding information
    const { eventId } = payload;
    removeSeedingDisplay(eventId);
  },

  [topicConstants.PUBLISH_ORDER_OF_PLAY]: (payload) => {
    // Order of Play published - update schedule displays
    const { dateMatchUps } = payload;
    updateScheduleDisplay(dateMatchUps);
  },

  [topicConstants.UNPUBLISH_ORDER_OF_PLAY]: (payload) => {
    // Order of Play unpublished - remove schedules
    removeScheduleDisplay();
  },
};

engine.devContext({ subscriptions });
```

### Integration Patterns

**Push to Public Website**:

```js
[topicConstants.PUBLISH_EVENT]: async (payload) => {
  const { eventData } = payload;
  await fetch('https://public-site.com/api/events', {
    method: 'POST',
    body: JSON.stringify(eventData)
  });
}
```

**Database Synchronization**:

```js
[topicConstants.PUBLISH_ORDER_OF_PLAY]: async (payload) => {
  const { dateMatchUps } = payload;
  await database.updatePublishedSchedule(dateMatchUps);
}
```

**Cache Invalidation**:

```js
[topicConstants.UNPUBLISH_EVENT]: (payload) => {
  const { eventId } = payload;
  cache.invalidate(`event:${eventId}`);
}
```

### Subscription Error Handling

Handle subscription failures gracefully:

```js
[topicConstants.PUBLISH_EVENT]: async (payload) => {
  try {
    await updatePublicSite(payload.eventData);
  } catch (error) {
    logger.error('Failed to update public site', error);
    // Queue for retry or alert administrators
  }
}
```

Participant-result flags do not calculate elimination standings. Round-robin results refresh group
by group; AD_HOC and LUCKY structures are also eligible. Stored placements can lack tallies, so use
`refreshResults` when fresh eligible results are required. Reports remain structure-local, including
in draws with qualifying/playoff structures. See the [query contract](../../governors/query-governor.md#participant-results-and-refresh).
