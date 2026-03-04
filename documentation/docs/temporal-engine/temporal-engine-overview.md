---
title: Temporal Engine Overview
---

The **TemporalEngine** is a pure JavaScript state machine that models court availability as continuous time-based capacity streams. Rather than tracking when courts are _available_, it tracks when they are _unavailable_ — blocks paint unavailable time onto courts, and availability rails and capacity curves are derived on demand. The engine is UI-agnostic, fully testable, and operates as a standalone class (not attached to the factory engine pattern).

## When to Use TemporalEngine vs scheduleGovernor

| Use Case                                        | Recommended          |
| ----------------------------------------------- | -------------------- |
| Interactive visual scheduling (timeline editor) | **TemporalEngine**   |
| Real-time availability queries                  | **TemporalEngine**   |
| What-if simulation (preview before commit)      | **TemporalEngine**   |
| Capacity analysis and utilization stats         | **TemporalEngine**   |
| Conflict detection with pluggable evaluators    | **TemporalEngine**   |
| Plan management (round assignment to days)      | **TemporalEngine**   |
| Automated Garman scheduling                     | **scheduleGovernor** |
| Bulk matchUp time assignment                    | **scheduleGovernor** |
| Scheduling policy enforcement                   | **scheduleGovernor** |

## Key Capabilities

- **Inverted paradigm** — Blocks represent unavailable time; available time is whatever remains
- **Immutable mutations** — All block operations return a `MutationResult` with applied/rejected mutations and conflicts
- **Derived state** — Rails (non-overlapping segments) and capacity curves are computed on demand, never stored
- **Event-driven subscriptions** — Subscribe to `STATE_CHANGED`, `BLOCKS_CHANGED`, `CONFLICTS_CHANGED`, `AVAILABILITY_CHANGED`, and `PLAN_CHANGED` events
- **Pluggable conflict evaluators** — Register built-in or custom evaluators for overlap detection, day boundary checks, lighting, maintenance windows, and more
- **Multi-phase validation pipeline** — PRECHECK → INTEGRITY → ORDERING → CAPACITY pipeline validates plan state
- **What-if simulation** — Preview mutations on a disposable snapshot without affecting real state
- **[CODES](/docs/data-standards#codes) bridge** — Bidirectional translation between engine blocks/rails and CODES tournament record structures
- **Court scheduling summaries** — Query scheduled, available, and blocked minutes per court across the full tournament
- **DST-safe date iteration** — Tournament day generation handles Daylight Saving Time boundaries correctly, avoiding duplicate or missing days when clocks change
- **Availability hierarchy** — Court-day → court-default → venue-day → venue-default → global-default → engine config fallback
- **Standalone class** — Instantiate directly with `new TemporalEngine()`, no factory integration required

## Basic Usage

```js
import { TemporalEngine } from 'tods-competition-factory';

// Create and initialize
const engine = new TemporalEngine();
engine.init(tournamentRecord, {
  dayStartTime: '08:00',
  dayEndTime: '20:00',
  slotMinutes: 15,
});

// Paint a maintenance block on two courts
const result = engine.applyBlock({
  courts: [court1Ref, court2Ref],
  timeRange: { start: '2026-06-15T12:00:00', end: '2026-06-15T13:00:00' },
  type: 'MAINTENANCE',
  reason: 'Lunch break',
});

// Query derived state
const timelines = engine.getDayTimeline('2026-06-15');
const capacity = engine.getCapacityCurve('2026-06-15');
const rail = engine.getCourtRail('2026-06-15', court1Ref);
```

## Architecture

The TemporalEngine follows a three-layer architecture where blocks are the only canonical state and everything else is derived:

```text
┌──────────────────────────────────┐
│        TemporalEngine            │  Standalone class / facade
│  (block CRUD, plans, events,     │
│   availability, simulation)      │
├──────────────────────────────────┤
│      temporalGovernor            │  Pure algorithm modules
│  (railDerivation, capacityCurve, │
│   collisionDetection, bridge,    │
│   conflictEvaluators,            │
│   validationPipeline, planState, │
│   timeGranularity)               │
├──────────────────────────────────┤
│    CODES Tournament Record       │  Standard data model
└──────────────────────────────────┘
```

:::note
Unlike the `ScoringEngine` which wraps `scoreGovernor` functions inside the factory engine pattern, the `TemporalEngine` is a **standalone class**. You instantiate it directly with `new TemporalEngine()` and pass a tournament record via `init()`. It does not register with the competition factory's engine infrastructure.
:::

## Constructor & Initialization

The `TemporalEngine` has no constructor parameters. All configuration is passed through `init()`:

```ts
const engine = new TemporalEngine();
engine.init(tournamentRecord, config);
```

The `EngineConfig` interface:

```ts
interface EngineConfig {
  tournamentId: TournamentId; // Defaults to tournamentRecord.tournamentId
  dayStartTime: string; // 'HH:MM' — default '06:00'
  dayEndTime: string; // 'HH:MM' — default '23:00'
  slotMinutes: number; // Rendering granularity — default 15
  granularityMinutes?: number; // Canonical time granularity (overrides slotMinutes)
  typePrecedence: BlockType[]; // Priority order for resolving overlapping blocks
  conflictEvaluators?: ConflictEvaluator[]; // Pluggable conflict evaluators
}
```

**Default `typePrecedence`:**

```text
HARD_BLOCK → LOCKED → MAINTENANCE → BLOCKED → PRACTICE → RESERVED → SOFT_BLOCK → AVAILABLE → UNSPECIFIED
```

During `init()`, the engine:

1. Merges provided config with defaults
2. Resolves canonical granularity (`granularityMinutes` → `slotMinutes` → `15`)
3. Clears all plan state (plans do not survive re-init)
4. Loads blocks from the tournament record's venue/court `dateAvailability` and `bookings`
5. Emits a `STATE_CHANGED` event with reason `'INIT'`

## Related Documentation

- **[Core API Reference](./temporal-engine-api)** — Complete method reference
- **[Event System & Validation](./event-system-and-validation)** — Events, conflict evaluators, and validation pipeline
- **[Block Types & Algorithms](./block-types-and-algorithms)** — Block types, rail derivation, capacity curves, collision detection
- **[UI Integration Scenarios](./ui-integration-scenarios)** — Building UIs with the temporal grid and scheduling profile
- **[Scheduling Overview](/docs/concepts/scheduling-overview)** — Scheduling concepts
- **[Venues & Courts](/docs/concepts/venues-courts)** — Venue and court data structures
- **[Schedule Governor](/docs/governors/schedule-governor)** — Automated scheduling functions
