---
title: Publishing Governor
---

The **Publishing Governor** provides methods for controlling the public visibility of tournament information through publish state management. These methods work in conjunction with [Time Items](../concepts/timeItems) to track what's published and when.

```js
import { publishingGovernor } from 'tods-competition-factory';
```

:::tip
See **[Publishing Concepts](../concepts/publishing/publishing-overview)** for comprehensive coverage of publishing workflows, rationale, and best practices.
:::

## getPublishState

Returns publishing details for tournament, event(s), and/or draws, enabling queries about current publish state before making changes. See examples: [Queryable Publish State](../concepts/publishing/publishing-overview.md#queryable-publish-state), [Queryable Publish State](../concepts/publishing/publishing-overview.md#queryable-publish-state).

### Return All Publish State

```js
const { publishState } = engine.getPublishState();

// Tournament-level state
const participantsPublished = publishState.tournament.participants.published;
const orderOfPlayPublished = publishState.tournament.orderOfPlay.published;

// Event-level state (accessed by eventId)
const eventState = publishState['eventId'].status;
const {
  published, // boolean - is event published?
  publishedDrawIds, // array of published draw IDs
  drawDetails, // granular stage/structure details
} = eventState;
```

### Query Specific Event

```js
const { publishState } = engine.getPublishState({ eventId });
const eventPublished = publishState.status.published;
const publishedDraws = publishState.status.publishedDrawIds;
```

### Query Specific Draw

```js
const { publishState } = engine.getPublishState({ drawId });
const drawPublished = publishState.status.published;

// When only specific stages or structures are published
const drawPublishDetail = publishState.status.drawDetail;
// Example structure: { stages: ['MAIN'], structures: { [structureId]: { roundLimit: 2 } } }
```

### Embargo Status

When embargoes are present, the return includes an `embargoes` array summarizing all active and expired embargoes across the tournament:

```js
const { publishState } = engine.getPublishState();

// publishState.embargoes is present when any embargoes exist
publishState.embargoes?.forEach(({ type, id, embargo, embargoActive }) => {
  console.log(`${type} ${id ?? ''}: ${embargo} (active: ${embargoActive})`);
});
```

Each entry in the `embargoes` array:

| Field           | Type    | Description                                                                                    |
| --------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `type`          | string  | `'draw'`, `'stage'`, `'structure'`, `'scheduledRound'`, `'orderOfPlay'`, or `'participants'`   |
| `id`            | string? | Identifier for the element. Absent for tournament-level types (`orderOfPlay`, `participants`). |
| `embargo`       | string  | ISO 8601 timestamp                                                                             |
| `embargoActive` | boolean | `true` if the embargo is still in the future                                                   |

:::note
`getPublishState` intentionally **ignores** embargo timestamps when determining publish status. This is for admin/reporting use — embargoed elements appear as "published" so admin UIs can display their configuration correctly. See [Embargo: Admin vs Public Behavior](../concepts/publishing/publishing-embargo#admin-vs-public-behavior) for details.
:::

**Use Cases**:

- Verify current state before publishing
- Display publish status in admin UI
- Determine if re-publishing is needed
- Query embargo status and expiry times
- Build admin dashboards showing upcoming embargo releases

**See**: [Embargo](../concepts/publishing/publishing-embargo) for comprehensive embargo documentation.

---

## bulkUpdatePublishedEventIds

Updates which events are marked as published across multiple events simultaneously. Used for bulk publish state management.

```js
const result = engine.bulkUpdatePublishedEventIds({
  tournamentRecord, // required
  publishedEventIds, // array of eventIds to mark as published
});
```

**Returns:**

```ts
{
  success: boolean;
  updatedCount?: number;
}
```

**Purpose:** Efficiently update publish status for multiple events at once, typically during tournament-wide publish operations.

---

## getAllEventData

Returns comprehensive data for all events in a tournament, formatted for public display.

```js
const { eventsData, tournamentInfo, venuesData } = engine.getAllEventData({
  tournamentRecord, // required
  policyDefinitions, // optional - privacy policies to apply
});

// eventsData structure
eventsData.forEach((event) => {
  console.log(event.eventInfo); // Event details
  console.log(event.scheduleTiming); // Timing information
  event.drawsData.forEach((draw) => {
    console.log(draw.drawInfo);
    console.log(draw.matchUps); // Categorized matchUps
  });
});
```

**Returns:**

```ts
{
  eventsData: Array<{
    eventInfo: EventInfo;
    scheduleTiming: any;
    drawsData: Array<{
      drawInfo: DrawInfo;
      matchUps: {
        abandonedMatchUps: MatchUp[];
        completedMatchUps: MatchUp[];
        upcomingMatchUps: MatchUp[];
        pendingMatchUps: MatchUp[];
      };
    }>;
  }>;
  tournamentInfo: TournamentInfo;
  venuesData: Venue[];
}
```

**Purpose:** Get complete tournament data formatted for public websites, scoreboards, or apps.

---

## getCourtInfo

Returns detailed information about a specific court, including availability and bookings.

```js
const { courtInfo } = engine.getCourtInfo({
  courtId, // required
  tournamentRecord, // required
});

console.log(courtInfo.courtName);
console.log(courtInfo.dateAvailability);
```

**Returns:**

```ts
{
  courtInfo: {
    courtId: string;
    courtName: string;
    venueId: string;
    dateAvailability?: DateAvailability[];
    // ... other court properties
  };
}
```

**Purpose:** Get complete court details for scheduling interfaces or public venue information.

---

## getDrawData

Returns comprehensive draw data including structures, matchUps, and participant assignments, formatted for display.

```js
const { drawInfo, structures } = engine.getDrawData({
  drawDefinition, // required
  tournamentRecord, // required
  event, // required
  usePublishState, // optional boolean - respect publish state
  includePositionAssignments, // optional boolean - include draw positions
  policyDefinitions, // optional - privacy policies
  inContext, // optional boolean - add context to matchUps
});
```

**Returns:**

```ts
{
  drawInfo: {
    drawId: string;
    drawName: string;
    drawType: string;
    // ... other draw properties
  }
  structures: Array<{
    structureId: string;
    structureName: string;
    matchUps: MatchUp[];
    roundMatchUps: { [roundNumber: string]: MatchUp[] };
    positionAssignments?: PositionAssignment[];
    // ... other structure data
  }>;
  success: boolean;
}
```

**Purpose:** Primary method for getting formatted draw data for display in brackets, schedules, or results pages.

**When to Use:**

- Building bracket displays
- Generating draw sheets
- Exporting draw data
- Public-facing draw views

**Notes:**

- Respects publish state when `usePublishState: true`
- Applies privacy policies to participant data
- Returns only published structures/rounds when appropriate
- Enforces [embargo](../concepts/publishing/publishing-embargo) timestamps — embargoed structures are filtered out until the embargo passes
- Used internally by `getEventData`

---

## getEventData

Returns comprehensive event data including all draws, participants, and matchUps, formatted for public display.

```js
const { eventData, participants } = engine.getEventData({
  eventId, // required (or event object)
  tournamentRecord, // required
  usePublishState, // optional boolean - respect publish state
  hydrateParticipants, // optional boolean - add full participant details
  includePositionAssignments, // optional boolean - include draw positions
  participantsProfile, // optional - control participant data included
  policyDefinitions, // optional - privacy policies
  contextProfile, // optional - control matchUp context
  allParticipantResults, // optional boolean - include all results
});
```

**Returns:**

```ts
{
  eventData: {
    eventInfo: EventInfo;
    drawsData: Array<{
      drawInfo: DrawInfo;
      structures: Structure[];
    }>;
    tournamentInfo?: TournamentInfo;
    venuesData?: Venue[];
  };
  participants?: HydratedParticipant[];
  success: boolean;
}
```

**Purpose:** Primary method for generating complete event data payloads for websites, apps, and scoreboards.

**Use Cases:**

- Publishing event data to public APIs
- Generating event pages
- Creating scoreboard displays
- Exporting event data

**Publish State Integration:**

- When `usePublishState: true`, only returns published draws/structures
- Respects round limits and stage restrictions
- Enforces [embargo](../concepts/publishing/publishing-embargo) timestamps at draw, stage, and structure levels — embargoed content is hidden until the embargo passes
- Applies privacy policies

**Notes:**

- Most commonly used method for public data generation
- Automatically called by `publishEvent` to generate payload
- Respects all display and privacy extensions
- Returns hydrated participants with complete details when requested

---

## getEventPublishStatus

Returns detailed publish status for a specific event.

```js
const { eventPublishStatus } = engine.getEventPublishStatus({
  eventId, // required
  tournamentRecord, // required
  event, // optional - event object if already loaded
});

console.log(eventPublishStatus.published); // boolean
console.log(eventPublishStatus.publishedDrawIds); // array of draw IDs
console.log(eventPublishStatus.drawDetails); // granular details
```

**Returns:**

```ts
{
  eventPublishStatus: {
    published: boolean;
    publishedDrawIds?: string[];
    drawDetails?: {
      [drawId: string]: {
        stages?: string[];
        structures?: {
          [structureId: string]: {
            roundLimit?: number;
            published?: boolean;
          };
        };
      };
    };
  };
}
```

**Purpose:** Query precise publish state for an event to determine what's visible.

---

## getTournamentPublishStatus

Returns publish status for tournament-level items (participants, order of play).

```js
const { publishStatus } = engine.getTournamentPublishStatus({
  tournamentRecord, // required
});

console.log(publishStatus.participants.published); // boolean
console.log(publishStatus.participants.publishedAt); // ISO timestamp
console.log(publishStatus.orderOfPlay.published); // boolean
```

**Returns:**

```ts
{
  publishStatus: {
    participants: {
      published: boolean;
      publishedAt?: string;
    };
    orderOfPlay: {
      published: boolean;
      publishedAt?: string;
    };
  };
}
```

**Purpose:** Check if tournament-wide items like participants and order of play are published.

---

## getVenueData

Returns formatted venue data for public display.

```js
const { venueData } = engine.getVenueData({
  venueId, // required
  tournamentRecord, // required
});

console.log(venueData.venueName);
console.log(venueData.courts); // Array of court objects
console.log(venueData.venueAddress);
```

**Returns:**

```ts
{
  venueData: {
    venueId: string;
    venueName: string;
    venueAbbreviation?: string;
    courts: Court[];
    venueAddress?: Address;
    // ... other venue properties
  };
}
```

**Purpose:** Get complete venue information for public display, maps, or venue guides.

---

## publishEvent

Publishes event draws and structures with fine-grained control over visibility. Generates optimized `eventData` payload and triggers `PUBLISH_EVENT` subscription notifications. See examples in [Publishing All Draws](../concepts/publishing/publishing-events.md#publishing-all-draws).

**Key Features**:

- Publishes entire events or specific draws (flights)
- Stage-level control (MAIN, QUALIFYING, CONSOLATION)
- Structure and round-level granularity
- Embargo support for scheduled publication
- Privacy policy application
- Subscription notification with prepared payload

```js
const { eventData } = engine.publishEvent({
  eventId, // required - event to publish

  // Draw selection (choose one approach)
  drawIdsToAdd, // array - publish specific draws
  drawIdsToRemove, // array - unpublish specific draws
  drawDetails, // object - granular control (see below)

  // Data preparation
  eventDataParams, // optional - params for getEventData (not persisted)
  policyDefinitions, // optional - privacy policies to apply

  // State management
  removePriorValues, // optional boolean - clear previous timeItems
});
```

### Publishing Patterns

#### Publish All Draws in Event

```js
engine.publishEvent({ eventId });
```

#### Publish Specific Draws (Flights)

```js
// Shorthand
engine.publishEvent({
  eventId,
  drawIdsToAdd: ['drawId1', 'drawId2'],
});

// Remove draws from publication
engine.publishEvent({
  eventId,
  drawIdsToRemove: ['drawId3'],
});
```

#### Publish by Stage

```js
import { stageConstants } from 'tods-competition-factory';

engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: {
      stagesToAdd: [stageConstants.QUALIFYING],
      publishingDetail: { published: true },
    },
  },
});
```

#### Round-by-Round Publishing

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

// Expand to include more rounds
engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: {
      structureDetails: {
        [structureId]: {
          roundLimit: 3, // Now shows rounds 1-3
          published: true,
        },
      },
    },
  },
});
```

#### Scheduled Rounds (Per-Round Schedule Control)

Use `scheduledRounds` within `structureDetails` for fine-grained control over which rounds' matchUps appear in the schedule. This is separate from `roundLimit` bracket filtering (which only applies to AD_HOC draws).

```js
// Embargo round 2 schedule, explicitly hide round 3; round 1 unlisted → passes through
engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: {
      structureDetails: {
        [structureId]: {
          published: true,
          roundLimit: 3, // bracket ceiling (AD_HOC only)
          scheduledRounds: {
            2: { published: true, embargo: '2024-06-16T08:00:00Z' },
            3: { published: false },
            // round 1 not listed → passes through normally
          },
        },
      },
    },
  },
});
```

**Behavior:**

- `roundLimit` always acts as a ceiling for the schedule (all draw types)
- `scheduledRounds` is an **override map** — only rounds with an explicit entry are affected; unlisted rounds pass through normally
- `{ published: false }` explicitly hides the round (matchUps removed from results)
- `{ published: true, embargo: FUTURE }` returns the matchUp **without schedule data** (schedule stripped) until the embargo passes
- When `scheduledRounds` is absent, all rounds up to `roundLimit` appear in the schedule

**Note:** `roundLimit` only filters the bracket (draw data) for AD_HOC draw types. For elimination draws, the bracket always shows all rounds.

#### Publishing with Embargo

Embargo allows content to be marked as published but **hidden from public queries** until a specified time. The embargo field accepts an ISO 8601 timestamp string. Embargoes can be applied at draw, stage, and structure levels.

```js
const embargoTime = new Date('2024-06-15T10:00:00Z').toISOString();

// Draw-level embargo — entire draw hidden until embargo passes
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

// Stage-level embargo — qualifying visible, main embargoed
engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: {
      publishingDetail: { published: true },
      stageDetails: {
        QUALIFYING: { published: true },
        MAIN: { published: true, embargo: embargoTime },
      },
    },
  },
});

// Structure-level embargo — specific structure hidden
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

Embargoed content is automatically visible once the system clock passes the embargo timestamp — no second mutation needed.

**Affected queries**: [`getEventData`](/docs/governors/query-governor#geteventdata), [`getDrawData`](#getdrawdata), [`competitionScheduleMatchUps`](/docs/governors/query-governor#competitionschedulematchups) (when `usePublishState: true`).

**Admin visibility**: [`getPublishState`](#getpublishstate) ignores embargoes and reports full publish configuration including embargo metadata.

**See**: [Embargo](../concepts/publishing/publishing-embargo) for comprehensive embargo documentation including workflows and admin vs public behavior.

#### Publishing with Privacy Policies

```js
import { policyConstants } from 'tods-competition-factory';

const privacyPolicy = {
  participant: {
    contacts: false,
    addresses: false,
    individualParticipants: {
      contacts: false,
      addresses: false,
    },
  },
};

const { eventData } = engine.publishEvent({
  eventId,
  policyDefinitions: {
    [policyConstants.POLICY_TYPE_PARTICIPANT]: privacyPolicy,
  },
});
```

#### Customizing Event Data Payload

:::important
Event data parameters are **not persisted** in publish state. Client applications must pass their own parameters when querying with `usePublishState: true`.
:::

```js
// Server-side publishing
const { eventData } = engine.publishEvent({
  eventId,
  eventDataParams: {
    allParticipantResults: true,
    participantsProfile: {
      withISO2: true,
      withIOC: true,
    },
  },
});

// Client must pass same params when querying
const { eventData: clientData } = engine.getEventData({
  eventId,
  usePublishState: true,
  allParticipantResults: true,
  participantsProfile: { withISO2: true, withIOC: true },
});
```

**See**: [Publishing Concepts](../concepts/publishing/publishing-data-subscriptions) for details on eventData structure.

---

## publishEventSeeding

Publishes event seeding information separately from draw structures, enabling flexible control over when seeding becomes publicly visible. See examples: [Publishing Seeding](../concepts/publishing/publishing-seeding.md#publishing-seeding), [Publishing Seeding](../concepts/publishing/publishing-seeding.md#publishing-seeding), [Coordinated Event and Seeding Release](../concepts/publishing/publishing-workflows.md#coordinated-event-and-seeding-release).

**Why Separate Seeding Publication**:

- Prevent participants from knowing seeded positions before draws finalized
- Announce seeded players separately from draw structure
- Update seeding without re-publishing entire draw
- Different scales for different stages

```js
engine.publishEventSeeding({
  eventId, // required

  // Scale selection
  seedingScaleNames, // optional - array of scale names
  stageSeedingScaleNames, // optional - { MAIN: 'scale1', QUALIFYING: 'scale2' }

  // Draw selection
  drawIds, // optional - publish specific draws only

  // State management
  removePriorValues, // optional boolean - clear previous timeItems
});
```

### Examples

#### Publish All Seeding

```js
engine.publishEventSeeding({ eventId });
```

#### Publish Specific Scales

```js
engine.publishEventSeeding({
  eventId,
  seedingScaleNames: ['U18', 'WTN'],
});
```

#### Different Scales per Stage

```js
engine.publishEventSeeding({
  eventId,
  stageSeedingScaleNames: {
    MAIN: 'U18',
    QUALIFYING: 'U18Q',
  },
});
```

#### Publish Specific Flights

```js
engine.publishEventSeeding({
  eventId,
  drawIds: ['flight1', 'flight2'],
});
```

---

## publishOrderOfPlay

Publishes scheduled matchUps (Order of Play), controlling visibility of which matches are scheduled for which courts and times. See examples in [Publishing Scheduled MatchUps](../concepts/publishing/publishing-order-of-play.md#publishing-scheduled-matchups).

**Why Order of Play Publishing**:

- Prepare schedules internally before announcing
- Make scheduling changes before public release
- Coordinate releases with media partners
- Publish each day's schedule separately

```js
engine.publishOrderOfPlay({
  scheduledDates, // optional - array of dates to publish
  eventIds, // optional - array of events to publish
  embargo, // optional - ISO 8601 timestamp; schedule hidden until this time
  removePriorValues, // optional boolean - clear previous timeItems
});
```

### Examples

#### Publish All Scheduled MatchUps

```js
engine.publishOrderOfPlay();
```

#### Publish Specific Dates

```js
engine.publishOrderOfPlay({
  scheduledDates: ['2024-06-15', '2024-06-16'],
});
```

#### Publish Specific Events

```js
engine.publishOrderOfPlay({
  eventIds: ['singles-main', 'doubles-main'],
});
```

#### Daily Publication

```js
// Each morning, publish that day's schedule
const today = new Date().toISOString().split('T')[0];

engine.publishOrderOfPlay({
  scheduledDates: [today],
  removePriorValues: false, // Keep previous days published
});
```

#### Publish with Embargo

```js
// Schedule becomes visible after 6pm the evening before
engine.publishOrderOfPlay({
  scheduledDates: ['2024-06-15'],
  embargo: '2024-06-14T18:00:00Z',
});
```

When embargoed, [`competitionScheduleMatchUps`](/docs/governors/query-governor#competitionschedulematchups) with `usePublishState: true` returns empty `dateMatchUps` until the embargo passes.

**See**: [Embargo](../concepts/publishing/publishing-embargo) for comprehensive embargo documentation.

#### Replace All Previous Publications

```js
engine.publishOrderOfPlay({
  scheduledDates: ['2024-06-15'],
  eventIds: ['singles-main'],
  removePriorValues: true, // Clear all previous
});
```

**Query Published Schedules**:

```js
const { dateMatchUps } = engine.competitionScheduleMatchUps({
  usePublishState: true, // Only returns published matchUps
});
```

**See**: [Query Governor - competitionScheduleMatchUps](/docs/governors/query-governor#competitionschedulematchups)

---

## publishParticipants

Publishes the tournament participant list, controlling when participant information becomes publicly visible. See examples: [Why Participant Publishing?](../concepts/publishing/publishing-participants.md#why-participant-publishing), [Why Participant Publishing?](../concepts/publishing/publishing-participants.md#why-participant-publishing).

**Why Participant Publishing**:

- Accept entries internally before announcing participant list
- Control when participant information becomes public
- Coordinate announcements with promotional campaigns
- Staged announcements (wildcards separate from direct acceptances)

```js
engine.publishParticipants({
  embargo, // optional - ISO 8601 timestamp; participant list hidden until this time
  removePriorValues, // optional boolean - clear previous timeItems
});
```

### Examples

#### Publish Participants

```js
engine.publishParticipants();
```

#### Publish with Embargo

```js
// Participant list visible after 9am on June 10th
engine.publishParticipants({
  embargo: '2024-06-10T09:00:00Z',
});
```

**See**: [Embargo](../concepts/publishing/publishing-embargo) for comprehensive embargo documentation.

#### Replace Previous Publication

```js
engine.publishParticipants({
  removePriorValues: true,
});
```

---

## setEventDisplay

Sets display configuration for event data, controlling which attributes are visible for specific draws and dates. See examples: [Display Settings](../concepts/publishing/publishing-participants.md#display-settings).

```js
engine.setEventDisplay({
  eventId, // required
  displaySettings, // required - display configuration object
  removePriorValues, // optional boolean - clear previous settings
});
```

**Purpose:** Fine-grained control over data visibility in published events, for privacy compliance and progressive disclosure.

---

## unPublishEvent

Removes event from public visibility. Triggers `UNPUBLISH_EVENT` subscription notification. See examples: [Unpublishing Events](../concepts/publishing/publishing-events.md#unpublishing-events).

```js
engine.unPublishEvent({
  eventId, // required
  removePriorValues, // optional boolean, defaults to true
});
```

### Examples

```js
// Unpublish event (removes timeItems)
engine.unPublishEvent({ eventId });

// Unpublish without removing timeItems
engine.unPublishEvent({
  eventId,
  removePriorValues: false,
});
```

**Use Cases**:

- Draw corrections needed before re-publishing
- Event cancelled or postponed
- Major scheduling changes requiring republication
- Remove from public site while maintaining internal data

---

## unPublishEventSeeding

Removes seeding information from public visibility. See examples: [Unpublishing Seeding](../concepts/publishing/publishing-seeding.md#unpublishing-seeding).

```js
engine.unPublishEventSeeding({
  eventId, // required
  stages, // optional - array of stages to unpublish
  removePriorValues, // optional boolean, defaults to true
});
```

### Examples

#### Unpublish All Seeding

```js
engine.unPublishEventSeeding({ eventId });
```

#### Unpublish Specific Stages

```js
engine.unPublishEventSeeding({
  eventId,
  stages: [stageConstants.MAIN, stageConstants.QUALIFYING],
});
```

**Use Cases**:

- Seeding corrections needed
- Change seeding methodology
- Remove seeding before draw changes

---

## unPublishOrderOfPlay

Removes Order of Play from public visibility. See examples: [Unpublishing Order of Play](../concepts/publishing/publishing-order-of-play.md#unpublishing-order-of-play).

```js
engine.unPublishOrderOfPlay({
  removePriorValues, // optional boolean, defaults to true
});
```

### Examples

```js
// Unpublish all schedules
engine.unPublishOrderOfPlay();

// Keep timeItems
engine.unPublishOrderOfPlay({
  removePriorValues: false,
});
```

**Use Cases**:

- Major scheduling changes
- Venue changes affecting schedule
- Weather delays requiring reschedule
- Remove from public pending updates

---

## unPublishParticipants

Removes participant list from public visibility. See examples: [Unpublishing Participants](../concepts/publishing/publishing-participants.md#unpublishing-participants).

```js
engine.unPublishParticipants({
  removePriorValues, // optional boolean, defaults to true
});
```

### Examples

```js
// Unpublish participants
engine.unPublishParticipants();
```

**Use Cases**:

- Entry deadline extended
- Major withdrawals requiring list update
- Corrections to participant information

---

## Integration Patterns

### Subscription-Based Publishing

```js
import { topicConstants } from 'tods-competition-factory';

const subscriptions = {
  [topicConstants.PUBLISH_EVENT]: async (payload) => {
    const { eventData, eventId } = payload;
    // Update public website
    await fetch('https://public-site.com/api/events', {
      method: 'POST',
      body: JSON.stringify(eventData),
    });
  },

  [topicConstants.PUBLISH_ORDER_OF_PLAY]: async (payload) => {
    const { dateMatchUps } = payload;
    // Update schedule displays
    await updateScheduleDisplay(dateMatchUps);
  },

  [topicConstants.UNPUBLISH_EVENT]: async (payload) => {
    const { eventId } = payload;
    // Remove from public site
    await removeFromPublicSite(eventId);
  },
};

engine.devContext({ subscriptions });
```

### Database Synchronization

```js
[topicConstants.PUBLISH_ORDER_OF_PLAY]: async (payload) => {
  const { dateMatchUps } = payload;
  await database.updatePublishedSchedule(dateMatchUps);
  cache.invalidate('schedules');
}
```

### Cache Management

```js
[topicConstants.UNPUBLISH_EVENT]: (payload) => {
  const { eventId } = payload;
  cache.invalidate(`event:${eventId}`);
  cache.invalidate('published-events-list');
}
```

---

## Related Documentation

- **[Publishing Concepts](../concepts/publishing/publishing-overview)** - Comprehensive workflows and best practices
- **[Embargo](../concepts/publishing/publishing-embargo)** - Time-based visibility control for published content
- **[Time Items](../concepts/timeItems)** - How publish state is stored
- **[Subscriptions](/docs/engines/subscriptions)** - Notification system
- **[Query Governor](/docs/governors/query-governor)** - Methods using publish state with embargo enforcement
- **[Policies](../concepts/policies)** - Privacy and display policies
