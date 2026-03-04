---
title: UI Integration Scenarios
---

This page demonstrates how to build real-world UIs on top of the TemporalEngine, drawn from the `temporal-grid` and `scheduling-profile` components in `courthive-components`.

## Architecture Pattern

All UI integrations follow the same data flow:

```text
Tournament Record → TemporalEngine → View Projections → UI Layer
                         ↑                                   │
                         └──── Controller (events/mutations) ┘
```

The **Controller** routes user interactions (clicks, drags, drops) to engine mutation methods, and engine events back to the UI layer. **View Projections** are pure functions that transform engine domain objects (timelines, rails, blocks) into UI-framework-specific data structures.

:::tip
View projections are the key separation layer. The engine knows nothing about vis-timeline, React, or any UI framework. Projections translate `VenueDayTimeline[]` into `TimelineGroup[]` and `TimelineItem[]` (or whatever your framework needs). This makes the engine independently testable and the projections independently testable.
:::

---

## Scenario 1 — Temporal Grid (Interactive Timeline Editor)

The temporal grid is an interactive calendar-style editor that uses [vis-timeline](https://visjs.github.io/vis-timeline/) for visual court availability management. Users can paint blocks, drag/resize them, and see capacity in real time.

### Engine Methods Used

| User Action                         | Engine Method                               | Event Emitted          |
| ----------------------------------- | ------------------------------------------- | ---------------------- |
| Paint a block (drag on empty space) | `applyBlock()`                              | `BLOCKS_CHANGED`       |
| Move a block (drag existing)        | `moveBlock()`                               | `BLOCKS_CHANGED`       |
| Resize a block (drag edge)          | `resizeBlock()`                             | `BLOCKS_CHANGED`       |
| Delete a block                      | `removeBlock()`                             | `BLOCKS_CHANGED`       |
| Change day                          | `getDayTimeline()`, `getVisibleTimeRange()` | _(read-only)_          |
| View capacity chart                 | `getCapacityCurve()`                        | _(read-only)_          |
| Change court hours                  | `setCourtAvailability()`                    | `AVAILABILITY_CHANGED` |
| Import scheduled matches            | `importScheduledMatchUps()`                 | `BLOCKS_CHANGED`       |

### Initialization Pattern

```js
import { TemporalEngine, defaultEvaluators } from 'tods-competition-factory';

// 1. Create and initialize the engine
const engine = new TemporalEngine();
engine.init(tournamentRecord, {
  dayStartTime: '08:00',
  dayEndTime: '20:00',
  slotMinutes: 15,
  conflictEvaluators: defaultEvaluators,
});

// 2. Subscribe to events
const unsubscribe = engine.subscribe((event) => {
  switch (event.type) {
    case 'BLOCKS_CHANGED':
    case 'STATE_CHANGED':
      renderTimeline();
      break;
    case 'AVAILABILITY_CHANGED':
      updateTimelineWindow();
      renderTimeline();
      break;
  }
});

// 3. Build initial view data and render
renderTimeline();
```

### View Projections Pattern

View projections are pure functions that transform engine data into vis-timeline items and groups:

```js
function renderTimeline() {
  const day = getCurrentDay();
  const timelines = engine.getDayTimeline(day);
  const courtMeta = engine.listCourtMeta();
  const blocks = engine.getDayBlocks(day);

  // Pure projection functions — engine data → vis-timeline data
  const groups = buildResourcesFromTimelines(timelines, courtMeta, projectionConfig);
  const segmentItems = buildEventsFromTimelines(timelines, projectionConfig);
  const blockItems = buildBlockEvents(blocks, projectionConfig);

  timeline.setGroups(groups);
  timeline.setItems([...segmentItems, ...blockItems]);
}
```

**Key projection functions:**

| Function                      | Input                               | Output                                   |
| ----------------------------- | ----------------------------------- | ---------------------------------------- |
| `buildResourcesFromTimelines` | `VenueDayTimeline[]`, `CourtMeta[]` | `TimelineGroup[]` (one per court)        |
| `buildEventsFromTimelines`    | `VenueDayTimeline[]`                | `TimelineItem[]` (background segments)   |
| `buildBlockEvents`            | `Block[]`                           | `TimelineItem[]` (draggable range items) |
| `buildConflictEvents`         | `EngineConflict[]`                  | `TimelineItem[]` (overlay items)         |
| `buildCapacityVisualization`  | `CapacityPoint[]`                   | `{ time, value, label }[]`               |

### Paint Mode — Drag-to-Create

In paint mode, the user drags across empty space on a court to create a new block:

```js
function handlePaintDrag(courtRef, anchorTime, cursorTime) {
  // 1. Get existing blocks on this court
  const existingBlocks = engine.getDayBlocks(day).filter((b) => courtRefEquals(b.court, courtRef));

  // 2. Clamp drag to avoid overlapping existing blocks
  const clamped = clampDragToCollisions(anchorTime, cursorTime, existingBlocks);

  // 3. Snap to granularity
  const granularity = engine.getResolvedGranularityMinutes();
  const start = snapToGranularity(clamped.start, granularity);
  const end = snapToGranularity(clamped.end, granularity, 'ceil');

  // 4. Apply the block
  const result = engine.applyBlock({
    courts: [courtRef],
    timeRange: { start: toIso(day, start), end: toIso(day, end) },
    type: currentPaintType, // e.g., 'MAINTENANCE', 'PRACTICE'
    source: 'USER',
  });

  if (result.conflicts.some((c) => c.severity === 'ERROR')) {
    showAlert(result.conflicts);
  }
}
```

### Drag/Resize with Collision Detection

When the user drags or resizes an existing block, the controller validates the move:

```js
function handleBlockMove(blockId, newTimeRange, newCourt) {
  const result = engine.moveBlock({ blockId, newTimeRange, newCourt });

  if (result.conflicts.some((c) => c.severity === 'ERROR')) {
    // Reject the move — revert the visual position
    revertDrag();
    showConflictAlert(result.conflicts);
  }
  // On success, the BLOCKS_CHANGED event triggers a re-render
}
```

### Capacity Visualization

The capacity curve drives a stacked area chart showing court utilization:

```js
const curve = engine.getCapacityCurve('2026-06-15');

// Transform for chart library
const chartData = curve.points.map((pt) => ({
  time: pt.time,
  available: pt.courtsAvailable,
  softBlocked: pt.courtsSoftBlocked,
  hardBlocked: pt.courtsHardBlocked,
}));

// Compute summary statistics
import { calculateCapacityStats } from 'tods-competition-factory';
const stats = calculateCapacityStats(curve);
// { peakAvailable: 8, utilizationPercent: 72.5, ... }
```

### Saving Back to Tournament Record

After editing, write engine state back to the tournament record:

```js
import { applyTemporalAvailabilityToTournamentRecord } from 'tods-competition-factory';

const timelines = engine.getDayTimeline(day);
const updatedRecord = applyTemporalAvailabilityToTournamentRecord({
  tournamentRecord,
  timelines,
  engine,
});
```

---

## Scenario 2 — Scheduling Profile Builder

The scheduling profile builder is a 3-panel UI — date chips, venue lanes, and a round catalog — for drag-and-drop assignment of tournament rounds to days and venues.

:::note
The scheduling profile component does **not** import `TemporalEngine` directly. Instead, it receives a `TemporalAdapter` callback interface that abstracts the engine's availability queries. This keeps the profile component decoupled from the engine.
:::

### TemporalAdapter Interface

```ts
interface TemporalAdapter {
  isDateAvailable: (date: string) => { ok: boolean; reason?: string };
  getDayCapacityMinutes?: (date: string) => number;
}
```

Create a `TemporalAdapter` from an engine instance:

```js
function createTemporalAdapter(engine) {
  return {
    isDateAvailable: (date) => {
      const days = engine.getTournamentDays();
      if (!days.includes(date)) {
        return { ok: false, reason: 'Date outside tournament' };
      }
      const curve = engine.getCapacityCurve(date);
      const hasCapacity = curve.points.some((p) => p.courtsAvailable > 0);
      return hasCapacity ? { ok: true } : { ok: false, reason: 'No court capacity on this day' };
    },
    getDayCapacityMinutes: (date) => {
      const curve = engine.getCapacityCurve(date);
      const stats = calculateCapacityStats(curve);
      return stats.totalCourtHours * 60;
    },
  };
}
```

### Plan State Integration

The scheduling profile translates drag-and-drop actions into engine plan state mutations:

```js
// User drops a round onto a day/venue lane
function handleRoundDrop(round, targetDay, targetVenueId) {
  engine.addPlanItem({
    day: targetDay,
    venueId: targetVenueId,
    eventId: round.eventId,
    drawId: round.drawId,
    roundNumber: round.roundNumber,
    matchUpType: round.matchUpType,
    estimatedDurationMinutes: round.estimatedMinutes,
  });
}

// User drags a round to a different day
function handleRoundMove(planItemId, newDay) {
  engine.movePlanItem(planItemId, newDay);
}

// User sets a "not before" time constraint
function handleSetNotBefore(planItemId, time) {
  engine.updatePlanItem(planItemId, { notBeforeTime: time });
}

// Read plan state for rendering
const dayPlan = engine.getDayPlan('2026-06-15');
for (const item of dayPlan.items) {
  renderRoundCard(item);
}
```

### From Plan to Factory Scheduling Profile

When the user is done building the plan, convert it to a factory scheduling profile:

```js
import { buildSchedulingProfileFromUISelections, validateSchedulingProfileFormat } from 'tods-competition-factory';

// Convert plan items to scheduling selections
const allPlans = engine.getAllPlans();
const selections = allPlans.flatMap((plan) =>
  plan.items.map((item) => ({
    scheduleDate: item.day,
    venueIds: [item.venueId],
    rounds: [
      {
        eventId: item.eventId,
        drawId: item.drawId,
        roundNumber: item.roundNumber,
        matchUpType: item.matchUpType,
      },
    ],
  })),
);

// Build and validate the profile
const profile = buildSchedulingProfileFromUISelections(selections);
const { valid, errors } = validateSchedulingProfileFormat(profile);

if (valid) {
  // Apply to the tournament via factory
  competitionEngine.setSchedulingProfile({ schedulingProfile: profile });
}
```

---

## What-If Simulation

Preview mutations before committing using `simulateBlocks()`:

```js
// User hovers over a potential block placement
const preview = engine.simulateBlocks(
  [
    {
      kind: 'ADD_BLOCK',
      block: {
        id: 'preview-1',
        court: courtRef,
        type: 'MAINTENANCE',
        start: '2026-06-15T12:00:00',
        end: '2026-06-15T13:00:00',
      },
    },
  ],
  '2026-06-15',
);

// Show preview rails with a visual diff
renderPreviewOverlay(preview.previewRails);

// Show capacity impact
if (preview.capacityImpact) {
  import { compareCapacityCurves } from 'tods-competition-factory';
  const currentCurve = engine.getCapacityCurve('2026-06-15');
  const diffs = compareCapacityCurves(currentCurve, preview.capacityImpact);
  renderCapacityDiff(diffs);
}

// Warn about conflicts
if (preview.conflicts.length > 0) {
  showConflictWarning(preview.conflicts);
}
```

The simulation creates a disposable snapshot of the engine — the real state is never modified and subscribers are never notified.

---

## Shadow Scheduling

After running the factory's automated scheduling (via `scheduleGovernor`), import the results as visual blocks:

```js
// 1. Run automated scheduling
competitionEngine.scheduleMatchUps({ schedulingProfile });

// 2. Get scheduled matchUps
const { matchUps } = competitionEngine.allCompetitionMatchUps();
const scheduled = matchUps
  .filter((m) => m.schedule?.scheduledDate && m.schedule?.courtId)
  .map((m) => ({
    matchUpId: m.matchUpId,
    courtId: m.schedule.courtId,
    venueId: m.schedule.venueId,
    date: m.schedule.scheduledDate,
    startTime: m.schedule.scheduledTime,
    durationMinutes: m.schedule.averageMinutes || 60,
  }));

// 3. Import into TemporalEngine as SCHEDULED blocks
const result = engine.importScheduledMatchUps(scheduled);
// The temporal grid now shows scheduled matches alongside availability blocks
```

This creates `SCHEDULED`-type blocks that appear visually in the temporal grid, allowing users to see how automated scheduling interacts with their manually configured availability.

---

## Related Documentation

- **[Overview](./temporal-engine-overview)** — Introduction and architecture
- **[Core API Reference](./temporal-engine-api)** — Complete method reference
- **[Event System & Validation](./event-system-and-validation)** — Events, conflict evaluators, and validation pipeline
- **[Block Types & Algorithms](./block-types-and-algorithms)** — Block types, rail derivation, capacity curves, collision detection
