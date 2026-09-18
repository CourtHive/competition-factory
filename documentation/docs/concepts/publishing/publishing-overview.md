---
title: Overview
---

## Overview

**Publishing** is the mechanism for controlling what tournament information is made publicly available and when. It provides fine-grained control over the visibility of draws, seeding, schedules, and participant data, while maintaining a complete internal record for tournament operations.

### Why Publishing Exists

Tournament organizers often need to control information release:

**Competitive Integrity**:

- Withhold seeding until draws are complete to prevent gaming
- Delay draw publication until all entries are finalized
- Embargo certain rounds until earlier rounds complete

**Operational Flexibility**:

- Prepare draws internally before public release
- Schedule matchUps without immediately making them visible
- Make corrections before information becomes public

**Privacy Protection**:

- Control which participant information is publicly visible
- Apply privacy policies to protect sensitive data
- Manage participant opt-outs and preferences

**Media Management**:

- Coordinate releases with media partners
- Stage information rollout for maximum engagement
- Control timing of seeding and draw announcements

### How Publishing Works

Publishing operates through **publish state management** tracked via [Time Items](../timeItems.md):

1. **Internal Operations**: Tournament staff work with complete data
2. **Publish Actions**: Administrators explicitly publish specific elements
3. **State Tracking**: Time items record what's published and when
4. **Filtered Queries**: Public-facing queries use `usePublishState: true` to filter data
5. **Notifications**: [Subscriptions](/docs/engines/subscriptions) notify systems when publishing changes

This architecture enables full operational capability internally while controlling external visibility precisely.

## Publish State Management

The factory tracks publish state for multiple tournament elements:

### Queryable Publish State

```js
const { publishState } = engine.getPublishState();

// Tournament-level state
const participantsPublished = publishState.tournament.participants.published;
const orderOfPlayPublished = publishState.tournament.orderOfPlay.published;

// Event-level state (accessed by eventId)
const eventState = publishState['eventId'].status;
const { published, publishedDrawIds, drawDetails } = eventState;

// Draw-level state
const drawState = engine.getPublishState({ drawId }).publishState;
const drawPublished = drawState.status.published;
const drawDetail = drawState.status.drawDetail; // stage/structure granularity
```

### State Granularity

Publishing can be controlled at multiple levels:

**Tournament Level**:

- Participant list visibility
- Order of Play (scheduled matchUps)

**Event Level**:

- All draws within an event
- Individual draws (flights) within an event
- Event seeding information

**Draw Level**:

- Entire draw structure
- Specific stages (MAIN, QUALIFYING, CONSOLATION)
- Individual structures within draws

**Structure Level**:

- Specific structures within multi-structure draws
- Round-by-round visibility (progressive release)

## Publishing Topics

| Topic                  | Description                                                | Concept Page                                                 |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ |
| Events and Draws       | Publish draws with stage, structure, and round granularity | [Publishing Events](./publishing-events.md)                  |
| Seeding                | Control seeding visibility separately from draws           | [Publishing Seeding](./publishing-seeding.md)                |
| Order of Play          | Publish scheduled matchUps by date and event               | [Publishing Order of Play](./publishing-order-of-play.md)    |
| Participants           | Control participant list visibility and privacy            | [Publishing Participants](./publishing-participants.md)      |
| Embargo                | Time-based visibility gates and scheduled rounds           | [Embargo and Scheduled Rounds](./publishing-embargo.md)      |
| Data and Subscriptions | Prepared payloads and notification integration             | [Data and Subscriptions](./publishing-data-subscriptions.md) |
| Workflows              | Common patterns and best practices                         | [Workflows and Best Practices](./publishing-workflows.md)    |

## Related Documentation

- **[Publishing Governor](/docs/governors/publishing-governor)** - Complete API reference for all publishing methods
- **[Query Governor](/docs/governors/query-governor)** - Methods using publish state
- **[Time Items](../timeItems.md)** - How publish state is stored
