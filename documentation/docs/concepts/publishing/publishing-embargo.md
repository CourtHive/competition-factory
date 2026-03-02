---
title: Embargo and Scheduled Rounds
---

## Embargo

**Embargo** is a time-based visibility gate that extends the publishing system. When an embargo timestamp is set on any publishable element, the element is stored as `published: true` but remains **hidden from public-facing queries** until the embargo time passes. No additional mutation or cron job is needed — visibility changes automatically when the system clock passes the embargo timestamp.

### Why Embargo?

Embargoes solve a common tournament operations challenge: the need to **prepare and finalize** publish state ahead of time while controlling **exactly when** the public sees the data.

**Common scenarios:**

- **Media coordination**: Schedule draw release for a specific press conference time
- **Staged rollout**: Publish qualifying draws immediately, embargo main draw until the next morning
- **Schedule preparation**: Finalize the order of play internally and set it to go live at a specific hour
- **Participant announcements**: Coordinate participant list release with marketing campaigns

### How Embargo Works

Embargo adds an optional `embargo` field (ISO 8601 timestamp string) to the `PublishingDetail` type used across the publishing system:

```ts
type ScheduledRoundDetail = {
  published?: boolean;
  embargo?: string; // ISO 8601 timestamp
};

type PublishingDetail = {
  scheduledRounds?: { [roundNumber: number]: ScheduledRoundDetail };
  roundLimit?: number; // only applicable to structureDetails
  published?: boolean;
  embargo?: string; // ISO 8601 timestamp — content hidden until this time
};
```

The enforcement logic is:

1. If `published` is `false`, the element is **hidden** (embargo is irrelevant)
2. If `published` is `true` and there is **no embargo** (or the embargo is not a valid ISO date), the element is **visible** (backward compatible)
3. If `published` is `true` and the embargo is a **future** timestamp, the element is **hidden**
4. If `published` is `true` and the embargo is a **past** timestamp, the element is **visible**

### Embargo Levels

Embargoes can be applied at every level of the publish hierarchy:

#### Draw-Level Embargo

Hides an entire draw from public queries until the embargo passes.

```js
engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: {
      publishingDetail: {
        published: true,
        embargo: '2024-06-15T10:00:00Z',
      },
    },
  },
});
```

**API Reference:** [publishEvent](/docs/governors/publishing-governor#publishevent)

#### Stage-Level Embargo

Hides a specific stage (e.g. QUALIFYING, MAIN) while other stages remain visible.

```js
engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: {
      publishingDetail: { published: true },
      stageDetails: {
        QUALIFYING: { published: true }, // visible immediately
        MAIN: { published: true, embargo: '2024-06-16T08:00:00Z' }, // hidden until 8am
      },
    },
  },
});
```

**API Reference:** [publishEvent](/docs/governors/publishing-governor#publishevent)

#### Structure-Level Embargo

Hides a specific structure within a draw.

```js
engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: {
      publishingDetail: { published: true },
      structureDetails: {
        [structureId]: { published: true, embargo: '2024-06-15T14:00:00Z' },
      },
    },
  },
});
```

**API Reference:** [publishEvent](/docs/governors/publishing-governor#publishevent)

#### Order of Play Embargo

Hides the published schedule until the embargo passes.

```js
engine.publishOrderOfPlay({
  scheduledDates: ['2024-06-15'],
  embargo: '2024-06-14T18:00:00Z', // schedule visible after 6pm the day before
});
```

When embargoed, `competitionScheduleMatchUps({ usePublishState: true })` returns empty `dateMatchUps`.

**API Reference:** [publishOrderOfPlay](/docs/governors/publishing-governor#publishorderofplay), [competitionScheduleMatchUps](/docs/governors/query-governor#competitionschedulematchups)

#### Participants Embargo

Hides the participant list until the embargo passes.

```js
engine.publishParticipants({
  embargo: '2024-06-10T09:00:00Z',
});
```

**API Reference:** [publishParticipants](/docs/governors/publishing-governor#publishparticipants)

### Admin vs Public Behavior

Embargo enforcement applies only to **public-facing query paths** — methods called with `usePublishState: true`:

| Method                                                                                      | Embargo enforced?                  | Notes                                                  |
| ------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------ |
| [`getEventData`](/docs/governors/query-governor#geteventdata)                               | Yes (when `usePublishState: true`) | Filters draws, stages, structures                      |
| [`competitionScheduleMatchUps`](/docs/governors/query-governor#competitionschedulematchups) | Yes (when `usePublishState: true`) | Filters orderOfPlay and matchUps                       |
| [`getDrawData`](/docs/governors/publishing-governor#getdrawdata)                            | Yes (when `usePublishState: true`) | Filters structures                                     |
| [`getPublishState`](/docs/governors/publishing-governor#getpublishstate)                    | **No**                             | Reports full publish config including embargo metadata |

**`getPublishState`** is the **admin/reporting** function. It intentionally **ignores** embargo timestamps so that admin clients (like TMX) can see:

- Which elements are published
- Which have active embargoes
- When each embargo expires

This is essential for admin UIs — an organizer who sets a future embargo needs to see the element as "published (embargoed until X)" rather than "unpublished."

### Querying Embargo Status

`getPublishState()` returns an `embargoes` array when any embargoes exist:

```js
const { publishState } = engine.getPublishState();

// publishState.embargoes is an array when embargoes are present
publishState.embargoes?.forEach(({ type, id, embargo, embargoActive }) => {
  console.log(`${type} ${id ?? ''}: embargo ${embargo}, active: ${embargoActive}`);
});

// Example embargoes array:
// [
//   { type: 'draw', id: 'drawId1', embargo: '2024-06-15T10:00:00Z', embargoActive: true },
//   { type: 'stage', id: 'drawId1:QUALIFYING', embargo: '2024-06-14T08:00:00Z', embargoActive: false },
//   { type: 'structure', id: 'structureId1', embargo: '2024-06-15T14:00:00Z', embargoActive: true },
//   { type: 'scheduledRound', id: 'structureId1:round2', embargo: '2024-06-16T08:00:00Z', embargoActive: true },
//   { type: 'orderOfPlay', embargo: '2024-06-14T18:00:00Z', embargoActive: true },
//   { type: 'participants', embargo: '2024-06-10T09:00:00Z', embargoActive: false },
// ]
```

**API Reference:** [getPublishState](/docs/governors/publishing-governor#getpublishstate)

Each entry contains:

| Field           | Type    | Description                                                                                                |
| --------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| `type`          | string  | `'draw'`, `'stage'`, `'structure'`, `'scheduledRound'`, `'orderOfPlay'`, or `'participants'`               |
| `id`            | string? | Identifier (drawId, `drawId:stage`, structureId, `structureId:roundN`). Absent for tournament-level types. |
| `embargo`       | string  | ISO 8601 timestamp                                                                                         |
| `embargoActive` | boolean | `true` if the embargo is still in the future                                                               |

### Embargo Validation

The factory **enforces** that all embargo values include a timezone indicator — either a `Z` suffix (UTC) or an explicit offset like `+05:30` or `-04:00`. A bare datetime string like `'2025-06-20T12:00:00'` (no timezone) is **rejected** with an `INVALID_EMBARGO` error.

This validation is applied in all publishing methods that accept embargo values:

- `publishEvent` — validates embargo in `publishingDetail`, `stageDetails`, `structureDetails`, and `scheduledRounds`
- `publishOrderOfPlay` — validates the top-level `embargo` parameter
- `publishParticipants` — validates the top-level `embargo` parameter

```js
// ✓ Valid embargo values
'2024-06-15T10:00:00Z'; // UTC (Z suffix)
'2024-06-15T10:00:00+05:30'; // Explicit positive offset
'2024-06-15T06:00:00-04:00'; // Explicit negative offset

// ✗ Invalid — rejected with INVALID_EMBARGO error
'2024-06-15T10:00:00'; // No timezone indicator
'2024-06-15'; // Date only
'June 15, 2024'; // Non-ISO format
```

**Why this matters:** A bare `'2024-06-15T10:00:00'` is interpreted differently depending on the runtime's local timezone. A client in EST setting an embargo would have that embargo interpreted 5 hours earlier by a server running in UTC. Requiring timezone context makes embargo behavior identical regardless of where the code executes.

#### Validating embargo values directly

The `isValidEmbargoDate` utility function is available for pre-validating embargo strings before passing them to publishing methods:

```js
import { tools } from 'tods-competition-factory';

tools.dateTime.isValidEmbargoDate('2024-06-15T10:00:00Z'); // true
tools.dateTime.isValidEmbargoDate('2024-06-15T10:00:00'); // false
```

#### Converting wall-clock time to UTC embargo strings

When a tournament operates in a specific timezone (set via `localTimeZone` on the tournament record), use `toEmbargoUTC` to convert a local wall-clock time to a valid UTC embargo string:

```js
import { tools } from 'tods-competition-factory';

// Convert "8:00 AM Eastern" on June 15 to a UTC embargo string
const embargo = tools.timeZone.toEmbargoUTC('2024-06-15', '08:00', 'America/New_York');
// Result: '2024-06-15T12:00:00.000Z' (EDT is UTC-4 in June)

// Use the result directly in publishEvent
engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: {
      publishingDetail: { published: true, embargo },
    },
  },
});
```

See [Date and Time Handling](/docs/concepts/date-time-handling) for the complete timezone utility reference.

### Embargo Expiry

Embargoes are evaluated at query time — there is no background process. When the system clock passes the embargo timestamp, the content automatically becomes visible on the next query. This means:

- **No cron jobs needed** — visibility is always current
- **No second mutation needed** — the embargo is self-resolving
- **Time zone safety** — all embargo values are validated to include timezone context, ensuring consistent behavior across clients and servers regardless of their local timezone

### Embargo Workflow Example

A typical tournament workflow using embargoes:

```js
import { stageConstants } from 'tods-competition-factory';

// 1. Monday: Publish qualifying draw immediately, embargo main draw until Wednesday 9am
engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: {
      publishingDetail: { published: true },
      stageDetails: {
        [stageConstants.QUALIFYING]: { published: true },
        [stageConstants.MAIN]: { published: true, embargo: '2024-06-12T09:00:00Z' },
      },
    },
  },
});

// 2. Monday: Schedule ready — embargo until Tuesday evening
engine.publishOrderOfPlay({
  scheduledDates: ['2024-06-11', '2024-06-12'],
  embargo: '2024-06-10T18:00:00Z',
});

// 3. Admin UI checks status
const { publishState } = engine.getPublishState();
// publishState.embargoes shows both active embargoes with their expiry times

// 4. No further action needed — embargoes resolve automatically
```

## Scheduled Rounds

**Scheduled Rounds** provide per-round control over which rounds' matchUps appear in the published schedule. This works in conjunction with `roundLimit` and embargo to enable progressive schedule disclosure.

### roundLimit Behavior

`roundLimit` behaves differently depending on draw type:

- **AD_HOC draws**: `roundLimit` filters both the bracket (draw data in `getEventData`) and the schedule (`competitionScheduleMatchUps`)
- **Non-AD_HOC draws** (elimination, round robin, etc.): `roundLimit` filters the **schedule only**. The bracket always shows all rounds because future rounds in elimination draws represent the structure, not yet-generated matchUps.

### Per-Round Schedule Control

Use `scheduledRounds` within `structureDetails` for granular overrides. `scheduledRounds` is an **override map** — rounds **not listed** pass through normally; only rounds with an explicit entry are affected:

```js
engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: {
      structureDetails: {
        [structureId]: {
          published: true,
          roundLimit: 3, // schedule ceiling: rounds 1-3
          scheduledRounds: {
            2: { published: true, embargo: '2024-06-16T08:00:00Z' }, // round 2 embargoed
            3: { published: false }, // round 3 explicitly hidden
            // round 1 not listed → passes through normally
          },
        },
      },
    },
  },
});
```

### Interaction Rules

1. **`roundLimit` is always the ceiling** — rounds above `roundLimit` never appear in the schedule, regardless of `scheduledRounds`
2. **`scheduledRounds` is an override map** — only rounds with an explicit entry are affected; unlisted rounds pass through normally
3. **`{ published: false }`** — explicitly hides the round (matchUps removed from results)
4. **`{ published: true, embargo: ... }`** — embargoed rounds are **returned without schedule data** (the matchUp remains in results but `schedule` is stripped) until the embargo passes, then returned normally with full schedule
5. **When `scheduledRounds` is absent** — all rounds up to `roundLimit` appear in the schedule (backward compatible)

### Schedule Stripping for Embargoed Rounds

When a round is embargoed via `scheduledRounds`, the matchUps for that round are **not hidden** — they remain in `dateMatchUps` but with their `schedule` property set to `undefined`. This means:

- The matchUp is visible (participants, round number, etc. are accessible)
- Schedule details (court assignment, scheduled time, etc.) are withheld until the embargo passes
- Once the embargo passes, full schedule data is included automatically

### Scheduled Rounds Workflow

```js
// Step 1: Create 3 AD_HOC rounds, schedule all matchUps
// Step 2: Publish bracket with roundLimit 2, round 2 explicitly hidden for now
engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: {
      structureDetails: {
        [structureId]: {
          published: true,
          roundLimit: 2,
          scheduledRounds: { 2: { published: false } },
          // round 1 unlisted → passes through normally
        },
      },
    },
  },
});

// Step 3: Change round 2 to embargoed (matchUp visible, schedule stripped until embargo)
engine.publishEvent({
  eventId,
  removePriorValues: true,
  drawDetails: {
    [drawId]: {
      structureDetails: {
        [structureId]: {
          published: true,
          roundLimit: 2,
          scheduledRounds: {
            2: { published: true, embargo: '2024-06-16T08:00:00Z' },
          },
          // round 1 unlisted → passes through normally
        },
      },
    },
  },
});

// Step 4: Embargo passes → round 2 automatically includes full schedule data
```
