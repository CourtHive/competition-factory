---
title: Event System & Validation
---

The AvailabilityEngine provides two complementary feedback mechanisms: an **event subscription system** for reacting to state changes in real-time, and a **validation pipeline** for verifying plan state consistency.

## Event Subscription

### subscribe

```ts
subscribe(listener: (event: EngineEvent) => void): () => void
```

Register a listener for engine events. Returns an unsubscribe function.

```js
const unsubscribe = engine.subscribe((event) => {
  switch (event.type) {
    case 'STATE_CHANGED':
      console.log('State changed:', event.payload.reason);
      break;
    case 'BLOCKS_CHANGED':
      renderTimeline(event.payload.mutations);
      break;
    case 'CONFLICTS_CHANGED':
      showConflictOverlays(event.payload.conflicts);
      break;
    case 'AVAILABILITY_CHANGED':
      updateTimelineWindow();
      break;
    case 'PLAN_CHANGED':
      refreshSchedulingProfile();
      break;
  }
});
```

### EngineEvent Interface

```ts
interface EngineEvent {
  type: EngineEventType;
  payload: any;
}
```

### Event Types

| Event Type             | Payload                           | Emitted When                                                                     |
| ---------------------- | --------------------------------- | -------------------------------------------------------------------------------- |
| `STATE_CHANGED`        | `{ reason: string }`              | Any state change — init, block mutations, plan changes, tournament record update |
| `BLOCKS_CHANGED`       | `{ mutations: BlockMutation[] }`  | Blocks added, updated, or removed                                                |
| `CONFLICTS_CHANGED`    | `{ conflicts: EngineConflict[] }` | Conflicts detected after a mutation                                              |
| `AVAILABILITY_CHANGED` | `{}`                              | Court or venue availability window changed                                       |
| `PLAN_CHANGED`         | `{}`                              | Plan items added, removed, updated, or moved                                     |

**`STATE_CHANGED` reasons:**

| Reason                        | Trigger                                                           |
| ----------------------------- | ----------------------------------------------------------------- |
| `'INIT'`                      | `init()` completed                                                |
| `'TOURNAMENT_RECORD_UPDATED'` | `updateTournamentRecord()` called                                 |
| `'BLOCKS_MUTATED'`            | Any block CRUD operation                                          |
| _(from plan methods)_         | `addPlanItem`, `removePlanItem`, `updatePlanItem`, `movePlanItem` |

:::note
Event handlers are called **synchronously**. A failing handler will not break the engine — errors are caught and logged to `console.error` — but long-running handlers will block the mutation return. Keep handlers fast and delegate heavy work (like DOM updates) to the next microtask.
:::

---

## Conflict Evaluators

Conflict evaluators are pluggable functions that inspect block mutations and report conflicts. They run during every block CRUD operation (`applyBlock`, `moveBlock`, `resizeBlock`).

### ConflictEvaluator Interface

```ts
interface ConflictEvaluator {
  id: string;
  description: string;
  evaluate: (ctx: EngineContext, mutations: BlockMutation[]) => EngineConflict[];
}
```

### EngineConflict Interface

```ts
interface EngineConflict {
  code: string;
  message: string;
  severity: ConflictSeverity; // 'ERROR' | 'WARN' | 'INFO'
  timeRange: TimeRange;
  courts: CourtRef[];
  relatedMatches?: string[];
}
```

### Severity Behavior

| Severity | Behavior                                                                  |
| -------- | ------------------------------------------------------------------------- |
| `ERROR`  | Mutation is **rejected** — appears in `result.rejected`                   |
| `WARN`   | Mutation is **applied** but the warning is included in `result.conflicts` |
| `INFO`   | Mutation is **applied** with informational note in `result.conflicts`     |

### Built-in Evaluators

| Evaluator                    | ID                   | Description                                                           |
| ---------------------------- | -------------------- | --------------------------------------------------------------------- |
| `courtOverlapEvaluator`      | `COURT_OVERLAP`      | Detects when blocks overlap on the same court                         |
| `dayBoundaryEvaluator`       | `DAY_BOUNDARY`       | Detects blocks that extend beyond the day's availability window       |
| `blockDurationEvaluator`     | `BLOCK_DURATION`     | Validates block duration against minimum/maximum thresholds           |
| `matchWindowEvaluator`       | `MATCH_WINDOW`       | Checks that scheduled match blocks fit within available windows       |
| `adjacentBlockEvaluator`     | `ADJACENT_BLOCK`     | Warns about blocks with no gap between them (back-to-back scheduling) |
| `lightingEvaluator`          | `LIGHTING`           | Warns when blocks extend past sunset on courts without lights         |
| `maintenanceWindowEvaluator` | `MAINTENANCE_WINDOW` | Validates maintenance blocks against venue maintenance policies       |

### Registering Evaluators

Pass evaluators during initialization:

```js
import { AvailabilityEngine, availability } from 'tods-competition-factory';
const { defaultEvaluators } = availability;

const engine = new AvailabilityEngine();
engine.init(tournamentRecord, {
  conflictEvaluators: defaultEvaluators,
});
```

Or pick specific evaluators:

```js
import { availability } from 'tods-competition-factory';
const { blockDurationEvaluator, courtOverlapEvaluator, dayBoundaryEvaluator } = availability;

engine.init(tournamentRecord, {
  conflictEvaluators: [courtOverlapEvaluator, dayBoundaryEvaluator, blockDurationEvaluator],
});
```

### Custom Evaluator Example

```js
const noWeekendMatchesEvaluator = {
  id: 'NO_WEEKEND_MATCHES',
  description: 'Prevents scheduling matches on weekends',
  evaluate: (ctx, mutations) => {
    const conflicts = [];
    for (const mut of mutations) {
      if (mut.kind !== 'ADD_BLOCK' || mut.block.type !== 'SCHEDULED') continue;
      const date = new Date(mut.block.start);
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        conflicts.push({
          code: 'NO_WEEKEND_MATCHES',
          message: `Match scheduled on ${dayOfWeek === 0 ? 'Sunday' : 'Saturday'}`,
          severity: 'ERROR',
          timeRange: { start: mut.block.start, end: mut.block.end },
          courts: [mut.block.court],
        });
      }
    }
    return conflicts;
  },
};
```

### Utility Functions

```ts
// Group conflicts by severity level
groupConflictsBySeverity(conflicts: EngineConflict[]): {
  errors: EngineConflict[];
  warnings: EngineConflict[];
  info: EngineConflict[];
}

// Get the highest severity in a set of conflicts
getHighestSeverity(conflicts: EngineConflict[]): 'ERROR' | 'WARN' | 'INFO' | null

// Format conflicts as human-readable strings
formatConflicts(conflicts: EngineConflict[]): string[]
```

---

## Validation Pipeline

The validation pipeline validates **plan state** (round assignments to days/venues) — not block mutations (those use conflict evaluators). It runs a series of rule checks across four phases, stopping on errors.

:::note
The validation pipeline operates on plan state created via `addPlanItem()`, `updatePlanItem()`, and `movePlanItem()`. It does **not** validate block CRUD operations — that is the job of [conflict evaluators](#conflict-evaluators).
:::

### Phases

| Phase       | Purpose                                                                                | Error Behavior                 |
| ----------- | -------------------------------------------------------------------------------------- | ------------------------------ |
| `PRECHECK`  | Validates preconditions — are all referenced entities (events, draws, venues) present? | Stops pipeline if errors found |
| `INTEGRITY` | Checks structural correctness — duplicate assignments, missing required fields         | Stops pipeline if errors found |
| `ORDERING`  | Validates round ordering constraints — earlier rounds before later rounds              | Continues to next phase        |
| `CAPACITY`  | Checks whether day capacity can accommodate planned rounds                             | Always runs (final phase)      |

### Running the Pipeline

```ts
import { availability } from 'tods-competition-factory';
const { runValidationPipeline } = availability;

const result = runValidationPipeline({
  engine, // AvailabilityEngine instance
  day: '2026-06-15', // Optional: validate specific day only
  phases: ['PRECHECK', 'INTEGRITY', 'ORDERING', 'CAPACITY'], // Optional: default all
});

console.log('Issues:', result.results.length);
console.log('Index:', result.issueIndex);
```

### ValidationPipelineParams

```ts
interface ValidationPipelineParams {
  engine: AvailabilityEngine;
  day?: DayId; // Filter to specific day
  phases?: ValidationPhase[]; // Subset of phases to run
}
```

### RuleResult Interface

```ts
interface RuleResult {
  ruleId: string;
  phase: ValidationPhase; // 'PRECHECK' | 'INTEGRITY' | 'ORDERING' | 'CAPACITY'
  severity: ValidationSeverity; // 'ERROR' | 'WARN' | 'INFO'
  message: string;
  context?: {
    day?: string;
    venueId?: string;
    planItemId?: string;
  };
  fixAction?: FixAction;
}
```

### ValidationPipelineResult

```ts
interface ValidationPipelineResult {
  results: RuleResult[];
  issueIndex: IssueIndex; // Map<string, RuleResult[]> — indexed for fast lookup
}
```

### Fix Actions

Some rule results include a `fixAction` that describes a corrective action:

```ts
interface FixAction {
  type: string; // e.g., 'JUMP_TO_ITEM', 'MOVE_ITEM_AFTER', 'OPEN_TEMPORAL_GRID'
  description: string;
  payload?: any;
}
```

**Common fix action types:**

| Type                 | Description                                             |
| -------------------- | ------------------------------------------------------- |
| `JUMP_TO_ITEM`       | Navigate to the offending plan item                     |
| `MOVE_ITEM_AFTER`    | Reorder a plan item to fix a precedence violation       |
| `MOVE_ITEM_BEFORE`   | Reorder a plan item to fix a precedence violation       |
| `OPEN_TEMPORAL_GRID` | Open the temporal grid to resolve an availability issue |

```js
// Example: applying a fix action
for (const result of pipelineResult.results) {
  if (result.fixAction?.type === 'MOVE_ITEM_AFTER') {
    const { planItemId, targetPlanItemId } = result.fixAction.payload;
    // Reorder items in the profile to fix ordering constraint
  }
}
```

---

## Related Documentation

- **[Overview](./availability-engine-overview)** — Introduction and architecture
- **[Core API Reference](./availability-engine-api)** — Complete method reference
- **[Block Types & Algorithms](./block-types-and-algorithms)** — Block types, rail derivation, collision detection
- **[UI Integration Scenarios](./ui-integration-scenarios)** — Building UIs with engine data
