---
title: Core API Reference
---

Complete method reference for the `TemporalEngine` class.

:::info
The TemporalEngine uses **ISO 8601 datetime strings** (e.g., `'2026-06-15T08:00:00'`) for block time ranges, **`YYYY-MM-DD`** strings for day IDs, and **`HH:MM`** strings for time-of-day values (availability windows, plan times).
:::

## Lifecycle

### init

```ts
init(tournamentRecord: any, config?: Partial<EngineConfig>): void
```

Initialize the engine with a tournament record and optional configuration. Merges config with defaults, loads blocks from the tournament record's venue/court structures, and emits `STATE_CHANGED`.

```js
const engine = new TemporalEngine();
engine.init(tournamentRecord, {
  dayStartTime: '08:00',
  dayEndTime: '20:00',
  slotMinutes: 15,
  conflictEvaluators: defaultEvaluators,
});
```

### updateTournamentRecord

```ts
updateTournamentRecord(tournamentRecord: any): void
```

Replace the tournament record and reload all blocks from it. Clears existing block state and re-imports from the new record. Emits `STATE_CHANGED` with reason `'TOURNAMENT_RECORD_UPDATED'`.

```js
// After external changes to the tournament
engine.updateTournamentRecord(updatedRecord);
```

### getConfig

```ts
getConfig(): EngineConfig
```

Returns a shallow copy of the current engine configuration.

### getResolvedGranularityMinutes

```ts
getResolvedGranularityMinutes(): number
```

Returns the resolved canonical granularity in minutes. Resolution order: `granularityMinutes` → `slotMinutes` → `15`.

---

## Block CRUD

### applyBlock

```ts
applyBlock(opts: ApplyBlockOptions): MutationResult
```

Create blocks on one or more courts for a time range. Blocks are clamped to each court's availability window. Unique block IDs are generated automatically.

```js
const result = engine.applyBlock({
  courts: [court1Ref, court2Ref],
  timeRange: { start: '2026-06-15T09:00:00', end: '2026-06-15T10:30:00' },
  type: 'MAINTENANCE',
  reason: 'Court resurfacing',
  hardSoft: 'HARD',
  source: 'USER',
});

if (result.conflicts.length > 0) {
  console.warn('Conflicts:', result.conflicts);
}
```

**`ApplyBlockOptions`:**

```ts
interface ApplyBlockOptions {
  courts: CourtRef[];          // Target courts
  timeRange: TimeRange;        // { start: string, end: string } — ISO 8601
  type: BlockType;             // Block type (e.g., 'MAINTENANCE', 'PRACTICE')
  reason?: string;             // Human-readable reason
  hardSoft?: BlockHardness;    // 'HARD' | 'SOFT'
  source?: BlockSource;        // 'USER' | 'TEMPLATE' | 'RULE' | 'SYSTEM'
}
```

### moveBlock

```ts
moveBlock(opts: MoveBlockOptions): MutationResult
```

Move an existing block to a new time range and optionally a new court. The block is clamped to the target court's availability window.

```js
const result = engine.moveBlock({
  blockId: 'block-42',
  newTimeRange: { start: '2026-06-15T14:00:00', end: '2026-06-15T15:30:00' },
  newCourt: court3Ref, // optional — move to a different court
});
```

**`MoveBlockOptions`:**

```ts
interface MoveBlockOptions {
  blockId: BlockId;
  newTimeRange: TimeRange;
  newCourt?: CourtRef;        // If omitted, stays on current court
}
```

### resizeBlock

```ts
resizeBlock(opts: ResizeBlockOptions): MutationResult
```

Resize an existing block's time range. Clamped to the court's availability window.

```js
engine.resizeBlock({
  blockId: 'block-42',
  newTimeRange: { start: '2026-06-15T14:00:00', end: '2026-06-15T16:00:00' },
});
```

**`ResizeBlockOptions`:**

```ts
interface ResizeBlockOptions {
  blockId: BlockId;
  newTimeRange: TimeRange;
}
```

### removeBlock

```ts
removeBlock(blockId: BlockId): MutationResult
```

Remove a block by ID.

```js
engine.removeBlock('block-42');
```

### applyTemplate

```ts
applyTemplate(opts: ApplyTemplateOptions): MutationResult
```

Apply a registered template to create blocks across a scope of venues, courts, and days.

**`ApplyTemplateOptions`:**

```ts
interface ApplyTemplateOptions {
  templateId: TemplateId;
  scope?: {
    venues?: VenueId[];
    courts?: CourtRef[];
    days?: DayId[];
  };
}
```

### importScheduledMatchUps

```ts
importScheduledMatchUps(matchUps: Array<{
  matchUpId: string;
  courtId: string;
  venueId: string;
  date: string;
  startTime: string;
  durationMinutes: number;
}>): MutationResult
```

Import factory-scheduled matchUps as visual `SCHEDULED` blocks. First removes all existing `SCHEDULED` + `SYSTEM` blocks (bypassing conflict checks), then creates new blocks through the normal mutation pipeline.

```js
// After running automated scheduling
const scheduled = matchUps
  .filter((m) => m.schedule)
  .map((m) => ({
    matchUpId: m.matchUpId,
    courtId: m.schedule.courtId,
    venueId: m.schedule.venueId,
    date: m.schedule.scheduledDate,
    startTime: m.schedule.scheduledTime,
    durationMinutes: m.schedule.averageMinutes || 60,
  }));

engine.importScheduledMatchUps(scheduled);
```

**`MutationResult`:**

```ts
interface MutationResult {
  applied: BlockMutation[];      // Mutations that were applied
  rejected: BlockMutation[];     // Mutations rejected by conflict evaluators
  warnings: EngineWarning[];     // Non-blocking warnings
  conflicts: EngineConflict[];   // Detected conflicts (may include WARN/INFO severity)
}
```

---

## Court & Venue Availability

### getCourtAvailability

```ts
getCourtAvailability(court: CourtRef, day: DayId): CourtDayAvailability
```

Resolve the effective availability window for a court on a day. Uses a layered cascade:

```
court + day  →  court DEFAULT  →  (intersect with)  venue + day  →  venue DEFAULT  →  GLOBAL DEFAULT  →  engine config
```

When both court-level and venue-level availability exist, the engine returns their **intersection** (the tighter window).

```js
const avail = engine.getCourtAvailability(courtRef, '2026-06-15');
// { startTime: '08:00', endTime: '20:00' }
```

### setCourtAvailability

```ts
setCourtAvailability(court: CourtRef, day: DayId, avail: CourtDayAvailability): void
```

Set availability for a specific court on a specific day. Emits `AVAILABILITY_CHANGED`.

```js
engine.setCourtAvailability(courtRef, '2026-06-15', {
  startTime: '10:00',
  endTime: '18:00',
});
```

### setCourtAvailabilityAllDays

```ts
setCourtAvailabilityAllDays(court: CourtRef, avail: CourtDayAvailability): void
```

Set default availability for a court across all days. Used as fallback when no day-specific availability is set. Emits `AVAILABILITY_CHANGED`.

### setAllCourtsDefaultAvailability

```ts
setAllCourtsDefaultAvailability(avail: CourtDayAvailability): void
```

Set global default availability for all courts. Lowest priority in the cascade. Emits `AVAILABILITY_CHANGED`.

### getVenueAvailability

```ts
getVenueAvailability(
  tournamentId: TournamentId,
  venueId: VenueId,
  day?: DayId,
): CourtDayAvailability | null
```

Get venue-level availability. Checks day-specific first, then DEFAULT. Returns `null` if no venue-level availability is set.

### setVenueDefaultAvailability

```ts
setVenueDefaultAvailability(
  tournamentId: TournamentId,
  venueId: VenueId,
  avail: CourtDayAvailability,
): void
```

Set default venue-level availability (all days unless overridden). Emits `AVAILABILITY_CHANGED`.

### setVenueDayAvailability

```ts
setVenueDayAvailability(
  tournamentId: TournamentId,
  venueId: VenueId,
  day: DayId,
  avail: CourtDayAvailability,
): void
```

Set venue-level availability for a specific day. Emits `AVAILABILITY_CHANGED`.

**`CourtDayAvailability`:**

```ts
interface CourtDayAvailability {
  startTime: string;   // 'HH:MM'
  endTime: string;     // 'HH:MM'
}
```

---

## Timeline Queries

### getTournamentDays

```ts
getTournamentDays(): DayId[]
```

Returns an array of `'YYYY-MM-DD'` strings from the tournament's `startDate` to `endDate`.

:::note DST-safe
This method handles Daylight Saving Time boundaries correctly. Dates are parsed as local midnight and formatted using local date components, avoiding the UTC-vs-local mismatch that can produce duplicate or missing days when clocks spring forward or fall back.
:::

```js
const days = engine.getTournamentDays();
// ['2026-06-15', '2026-06-16', '2026-06-17', ...]
```

### getDayTimeline

```ts
getDayTimeline(day: DayId): VenueDayTimeline[]
```

Returns the complete timeline for a day — all venues, all courts. Groups courts by venue, then derives a `CourtRail` for each court.

```js
const timelines = engine.getDayTimeline('2026-06-15');
for (const venue of timelines) {
  for (const rail of venue.rails) {
    console.log(rail.court.courtId, rail.segments.length, 'segments');
  }
}
```

### getVenueTimeline

```ts
getVenueTimeline(day: DayId, venueId: VenueId): VenueDayTimeline | null
```

Returns the timeline for a specific venue on a day.

### getCourtRail

```ts
getCourtRail(day: DayId, court: CourtRef): CourtRail | null
```

Returns the derived rail (non-overlapping `RailSegment[]`) for a specific court on a day.

```js
const rail = engine.getCourtRail('2026-06-15', courtRef);
for (const seg of rail.segments) {
  console.log(`${seg.start} – ${seg.end}: ${seg.status}`);
}
```

### getCapacityCurve

```ts
getCapacityCurve(day: DayId): CapacityCurve
```

Returns the capacity curve — a time-series of available/blocked court counts for a day.

```js
const curve = engine.getCapacityCurve('2026-06-15');
for (const pt of curve.points) {
  console.log(`${pt.time}: ${pt.courtsAvailable} available`);
}
```

### getVisibleTimeRange

```ts
getVisibleTimeRange(day: DayId, courtRefs?: CourtRef[]): {
  startTime: string;
  endTime: string;
}
```

Returns the union (earliest start, latest end) of court availability across given courts, or all courts if none specified. Useful for configuring timeline viewport bounds.

### getCourtSchedulingSummary

```ts
getCourtSchedulingSummary(court: CourtRef): CourtSchedulingSummary
```

Returns a scheduling summary for a court across all tournament days. Iterates every rail segment in the court's availability window and classifies time into three buckets: scheduled, available, or blocked.

```js
const summary = engine.getCourtSchedulingSummary(courtRef);
console.log(`Scheduled: ${summary.scheduledMinutes} min`);
console.log(`Available: ${summary.availableMinutes} min`);
console.log(`Blocked:   ${summary.blockedMinutes} min`);
```

**Classification rules:**

| Segment status | Bucket |
|----------------|--------|
| `SCHEDULED`, `LOCKED` | `scheduledMinutes` |
| `AVAILABLE` | `availableMinutes` |
| All others (`MAINTENANCE`, `PRACTICE`, `BLOCKED`, `CLOSED`, `SOFT_BLOCK`, `HARD_BLOCK`, `RESERVED`) | `blockedMinutes` |

**`CourtSchedulingSummary`:**

```ts
interface CourtSchedulingSummary {
  scheduledMinutes: number;   // SCHEDULED + LOCKED segments
  availableMinutes: number;   // AVAILABLE segments (unblocked, unscheduled)
  blockedMinutes: number;     // All other block types
}
```

### getDayBlocks

```ts
getDayBlocks(day: DayId): Block[]
```

Returns all blocks that start on a specific day across all courts.

### getAllBlocks

```ts
getAllBlocks(): Block[]
```

Returns all blocks across all days.

---

## Plan State

Plan state tracks which tournament rounds are assigned to which days and venues — used by the scheduling profile builder.

### addPlanItem

```ts
addPlanItem(item: Omit<PlanItem, 'planItemId'>): PlanItem
```

Add a plan item to a day's plan. The `planItemId` is computed automatically. If an item with the same computed ID already exists, it is replaced. Emits `PLAN_CHANGED` and `STATE_CHANGED`.

```js
const item = engine.addPlanItem({
  day: '2026-06-15',
  venueId: 'venue-1',
  eventId: 'event-ms',
  drawId: 'draw-1',
  roundNumber: 1,
  matchUpType: 'SINGLES',
  estimatedDurationMinutes: 90,
});
```

### removePlanItem

```ts
removePlanItem(planItemId: string): boolean
```

Remove a plan item by ID. Returns `true` if found and removed. Empty day plans are cleaned up automatically. Emits `PLAN_CHANGED` and `STATE_CHANGED`.

### updatePlanItem

```ts
updatePlanItem(
  planItemId: string,
  updates: Partial<Pick<PlanItem,
    'notBeforeTime' | 'estimatedDurationMinutes' | 'matchUpType' | 'roundSegment'
  >>,
): PlanItem | null
```

Update mutable fields on an existing plan item. Key fields (`day`, `venueId`, `eventId`, `drawId`, `roundNumber`) cannot be changed — use `movePlanItem` to change the day. Returns the updated item or `null`.

```js
engine.updatePlanItem('2026-06-15|venue-1|event-ms|draw-1|R1', {
  notBeforeTime: '10:00',
  estimatedDurationMinutes: 120,
});
```

### movePlanItem

```ts
movePlanItem(planItemId: string, newDay: DayId): PlanItem | null
```

Move a plan item to a different day. Recomputes the `planItemId` with the new day. Returns the updated item or `null`.

### getDayPlan

```ts
getDayPlan(day: DayId): DayPlan | null
```

Returns the plan for a specific day.

### getAllPlans

```ts
getAllPlans(): DayPlan[]
```

Returns all plans across all days.

**`PlanItem`:**

```ts
interface PlanItem {
  planItemId: string;          // Computed: day|venueId|eventId[|drawId]|R{roundNumber}
  day: DayId;
  venueId: VenueId;
  eventId: string;
  drawId?: string;
  structureId?: string;
  roundNumber: number;
  roundSegment?: { segmentNumber: number; segmentsCount: number };
  matchUpType?: string;
  notBeforeTime?: string;      // 'HH:MM'
  estimatedDurationMinutes?: number;
}
```

**`DayPlan`:**

```ts
interface DayPlan {
  day: DayId;
  items: PlanItem[];
}
```

---

## Templates & Rules

### getTemplates

```ts
getTemplates(): Template[]
```

Returns all registered templates.

### getTemplate

```ts
getTemplate(templateId: TemplateId): Template | null
```

Returns a specific template by ID.

### getRules

```ts
getRules(): Rule[]
```

Returns all registered rules.

### getRule

```ts
getRule(ruleId: RuleId): Rule | null
```

Returns a specific rule by ID.

---

## Simulation

### simulateBlocks

```ts
simulateBlocks(mutations: BlockMutation[], day?: DayId): SimulationResult
```

Simulate mutations without applying them. Creates a disposable snapshot of the engine, applies mutations to it, and returns preview data. The real engine state is untouched — subscribers are not notified.

```js
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

console.log('Preview rails:', preview.previewRails);
console.log('Capacity impact:', preview.capacityImpact);
console.log('Would cause conflicts:', preview.conflicts);
```

**`SimulationResult`:**

```ts
interface SimulationResult {
  previewRails: VenueDayTimeline[];   // Full derived timeline with mutations applied
  capacityImpact?: CapacityCurve;     // Capacity curve reflecting simulated state
  conflicts: EngineConflict[];        // Conflicts the mutations would cause
}
```

---

## Court Metadata

### listCourtMeta

```ts
listCourtMeta(): CourtMeta[]
```

Returns metadata for all courts in the tournament record.

```js
const courts = engine.listCourtMeta();
for (const court of courts) {
  console.log(`${court.name}: ${court.surface}, lights=${court.hasLights}`);
}
```

**`CourtMeta`:**

```ts
interface CourtMeta {
  ref: CourtRef;
  name: string;
  surface: string;
  indoor: boolean;
  hasLights: boolean;
  tags: string[];
  openTime?: string;
  closeTime?: string;
  closedDays?: string[];
  extendedProps?: Record<string, any>;
}
```

---

## Event System

### subscribe

```ts
subscribe(listener: (event: EngineEvent) => void): () => void
```

Subscribe to engine events. Returns an unsubscribe function.

```js
const unsubscribe = engine.subscribe((event) => {
  if (event.type === 'BLOCKS_CHANGED') {
    renderTimeline();
  }
});

// Later: clean up
unsubscribe();
```

See **[Event System & Validation](./event-system-and-validation)** for full event type documentation.

---

## Related Documentation

- **[Overview](./temporal-engine-overview)** — Introduction and architecture
- **[Event System & Validation](./event-system-and-validation)** — Events, conflict evaluators, and validation pipeline
- **[Block Types & Algorithms](./block-types-and-algorithms)** — Block types, rail derivation, capacity curves, collision detection
- **[UI Integration Scenarios](./ui-integration-scenarios)** — Building UIs with engine data
