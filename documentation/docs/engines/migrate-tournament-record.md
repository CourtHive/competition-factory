---
title: migrateTournamentRecord
---

One-shot helper that walks an entire `tournamentRecord` and promotes every legacy `extensions[]` envelope and schedule `timeItems[]` entry the **CODES** initiative has promoted to first-class attributes. The output is a record shaped for the v5.0.0 default (`schemaWriteMode: 'native'`).

```ts
import { migrateTournamentRecord } from 'tods-competition-factory';

const { tournamentRecord: legacy } = await loadLegacyRecord();
const { promoted, totalPromoted } = migrateTournamentRecord({ tournamentRecord: legacy });
// legacy is mutated in place — same reference, post-migration shape
// promoted: { events: 4, matchUpScheduleTimeItems: 124, ... }
```

## When to call it

You only need this once per record, at the seam where a legacy v4 (or older) record enters a v5 codebase. After the call the record is native-shaped and reads through `firstClassOrExtension` / dedicated query methods will find values in their new home.

Common seams:

- **Import / ingestion paths** — a legacy export, a federation feed, a backup restore. Run migration before handing the record to the engine.
- **Storage upgrade scripts** — walk the historical record store once, write back the migrated shape.
- **Mode transitions** — if a server flips `schemaWriteMode` from `legacy` to `native`, migrate previously-saved records before the new mode reads them.

## What it promotes

The walker visits the tournament record, every event, every draw definition, every structure (with its `positionAssignments`), every matchUp, every venue, every court. At each element it lifts:

| Source shape                                                             | New home                                                  | Phase |
| ------------------------------------------------------------------------ | --------------------------------------------------------- | ----- |
| `positionAssignment.extensions[{name: 'tally'}].value`                   | `positionAssignment.tally`                                | 1     |
| `positionAssignment.extensions[{name: 'subOrder'}].value`                | `positionAssignment.subOrder`                             | 1     |
| `matchUp.timeItems[{itemType: SCHEDULED_DATE}].itemValue`                | `matchUp.schedule.scheduledDate`                          | 2     |
| `matchUp.timeItems[{itemType: SCHEDULED_TIME}].itemValue`                | `matchUp.schedule.scheduledTime`                          | 2     |
| `matchUp.timeItems[{itemType: ASSIGN_COURT}].itemValue`                  | `matchUp.schedule.courtId`                                | 2     |
| `matchUp.timeItems[{itemType: ASSIGN_VENUE}].itemValue`                  | `matchUp.schedule.venueId`                                | 2     |
| `matchUp.timeItems[{itemType: COURT_ORDER}].itemValue`                   | `matchUp.schedule.courtOrder`                             | 2     |
| `matchUp.timeItems[{itemType: COURT_ANNOTATION}].itemValue`              | `matchUp.schedule.courtAnnotation`                        | 2     |
| `matchUp.timeItems[{itemType: ALLOCATE_COURTS}].itemValue`               | `matchUp.schedule.allocatedCourts`                        | 2     |
| `matchUp.timeItems[{itemType: TIME_MODIFIERS}].itemValue`                | `matchUp.schedule.timeModifiers`                          | 2     |
| `matchUp.timeItems[{itemType: HOME_PARTICIPANT_ID}].itemValue`           | `matchUp.schedule.homeParticipantId`                      | 2     |
| `matchUp.timeItems[{itemType: ASSIGN_OFFICIAL}].itemValue`               | `matchUp.schedule.official`                               | 2     |
| `event.extensions[{name: 'flightProfile'}].value`                        | `event.flightProfile`                                     | 3     |
| `drawDefinition.extensions[{name: 'lineUps'}].value`                     | `drawDefinition.lineUps`                                  | 3     |
| 8 promoted flat-scalar extensions (DRAFT_STATE, DISABLE_AUTO_CALC, etc.) | matching first-class attribute                            | 4     |
| `tournamentRecord.extensions[{name: 'SCHEDULING_PROFILE'}].value`        | `tournamentRecord.scheduling.profile`                     | 5     |
| `tournamentRecord.extensions[{name: 'SCHEDULE_LIMITS'}].value`           | `tournamentRecord.scheduling.dailyLimits`                 | 5     |
| `tournamentRecord.extensions[{name: 'SCHEDULE_TIMING'}].value`           | `tournamentRecord.scheduling.timing`                      | 5     |
| `tournamentRecord.extensions[{name: 'LINKED_TOURNAMENTS'}]`              | `tournamentRecord.linkedTournamentIds` (shape-translated) | 7     |

For lifecycle timeItems (`START_TIME` / `STOP_TIME` / `RESUME_TIME` / `END_TIME`) — these are **not** promoted; they remain an ordered history that `matchUpDuration()` walks.

## `clearLegacy` flag

```ts
type MigrateTournamentRecordArgs = {
  tournamentRecord: Tournament;
  clearLegacy?: boolean; // default: true
};
```

| Value            | Behavior                                                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `true` (default) | After promoting an entry, the legacy extension / timeItem is **removed**. Output is purely native-shaped.                                                                                                                                  |
| `false`          | Promoted values are copied to their new home; legacy entries are kept. Useful when you want to migrate readers but defer dropping the legacy envelope (e.g., to keep an in-flight `schemaWriteMode: 'dual'` deployment safe to roll back). |

Existing first-class values are never overwritten — the helper only fills `element[attribute] === undefined`. Running migration twice is a no-op on the second pass.

## Result shape

```ts
type MigrationResult = {
  promoted: {
    tournament: number;
    events: number;
    entries: number;
    drawDefinitions: number;
    structures: number;
    positionAssignments: number;
    matchUps: number;
    matchUpScheduleTimeItems: number;
    venues: number;
    courts: number;
  };
  totalPromoted: number; // sum across all categories
  success: true;
  // ResultType base — error?: ErrorType if input was invalid
};
```

The `promoted` counts are diagnostic — they tell you "the record actually had data in this shape". A migration that returns `totalPromoted: 0` is a record that was already native (or had nothing to lift).

## Errors

| `error.code`                | When                                                            |
| --------------------------- | --------------------------------------------------------------- |
| `MISSING_TOURNAMENT_RECORD` | The `tournamentRecord` argument was missing or wasn't an object |

The walker is defensive: missing intermediate collections (`events`, `extensions`, `timeItems`) are treated as empty rather than throwing. Records with partial structure migrate as far as they can.

## See also

- The [4.x to 5.0.0 migration guide](../migration-5.0.0) — full context on the CODES schema initiative and the typed engine default.
- [`schemaWriteMode`](../migration-5.0.0#engine-write-mode-flags) — the engine flag this helper coordinates with.
- [`getTally`](./get-tally) — example of a mode-agnostic reader that works against both pre- and post-migration shapes.
