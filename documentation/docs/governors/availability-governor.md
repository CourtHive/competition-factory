---
title: Availability Governor
---

```js
import { availabilityGovernor } from 'tods-competition-factory';
// or, with the AvailabilityEngine: the `availability` namespace re-exports every module below
import { availability } from 'tods-competition-factory';
```

The **availabilityGovernor** is the pure utility layer under the [Availability Engine](../availability-engine/availability-engine-overview.md):
the algorithms and translations the engine is built from, exported so they can be used without an engine instance. It
holds no state and mutates nothing except where a function is explicitly a writer (`applyAvailabilityToTournamentRecord`).

Court availability works in the **inverted paradigm**: a court is available unless a block says otherwise, and
overlapping blocks resolve to non-overlapping segments by type precedence. See
[Block Types and Algorithms](../availability-engine/block-types-and-algorithms.md) for the model; this page maps each
module's exports to where they are described.

Most applications use the [`AvailabilityEngine`](../availability-engine/availability-engine-api.md), which calls these
for you.

---

## Types and constants

`BLOCK_TYPES` (also a top-level export) and the engine's types: blocks, rail segments, timelines, capacity points, plan
items, conflicts. → [Block Types](../availability-engine/block-types-and-algorithms.md#block-types),
[Block Interface](../availability-engine/block-types-and-algorithms.md#block-interface)

---

## Rail derivation

Converts overlapping blocks into non-overlapping **rail segments** with a sweep line, resolving each segment's status by
type precedence.

| export                                                                                   | what it does                                                  |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `deriveRailSegments`                                                                     | the sweep: blocks to non-overlapping segments for a court-day |
| `mergeAdjacentSegments`                                                                  | joins neighbouring segments with the same status              |
| `validateSegments`                                                                       | checks a rail is ordered, non-overlapping and within its day  |
| `resolveStatus`                                                                          | the winning status among overlapping block types              |
| `buildEdges`, `sortEdges`                                                                | the sweep's edge list                                         |
| `clampToDayRange`, `buildDayRange`, `extractDay`                                         | day bounds                                                    |
| `rangesOverlap`, `overlappingRange`, `diffMinutes`                                       | interval arithmetic                                           |
| `courtKey`, `courtDayKey`, `venueKey`, `venueDayKey`, `resolveCourtId`, `resolveVenueId` | the keys rails and timelines are indexed by                   |

→ [Rail Derivation Algorithm](../availability-engine/block-types-and-algorithms.md#rail-derivation-algorithm),
[Rail Derivation Functions](../availability-engine/block-types-and-algorithms.md#rail-derivation-functions)

---

## Capacity curves

Time series of how many courts are available, soft-blocked or hard-blocked at each point of a day.

| export                                      | what it does                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `generateCapacityCurve(day, timelines)`     | the curve for one day, from the venues' day timelines                                        |
| `calculateCapacityStats`                    | peak, minimum and average availability (with their times), total court-hours and utilization |
| `filterCapacityCurve`                       | the curve within a time range                                                                |
| `sampleCapacityCurve`                       | the curve at a fixed interval                                                                |
| `compareCapacityCurves(baseline, modified)` | the per-time differences between two curves, e.g. before and after a change                  |

→ [Capacity Curves](../availability-engine/block-types-and-algorithms.md#capacity-curves)

---

## Collision detection

Collision-aware clamping for drag-to-create, so a new block stops at its neighbours instead of overlapping them.

| export                                                                                 | what it does                                               |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `clampDragToCollisions`                                                                | clamps a dragged range against the court's existing blocks |
| `intervalsOverlap`, `timeInsideBlock`, `findBlocksContainingTime`, `sortBlocksByStart` | the checks it is built from                                |

→ [Collision Detection](../availability-engine/block-types-and-algorithms.md#collision-detection),
[clampDragToCollisions](../availability-engine/block-types-and-algorithms.md#clampdragtocollisions)

---

## Conflict evaluators

Pluggable checks that inspect a proposed block mutation and return conflicts with a severity.

| export                                                                                                                                                                         | what it does                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `defaultEvaluators`                                                                                                                                                            | the built-in set, as passed to `AvailabilityEngine.init`                               |
| `courtOverlapEvaluator`, `matchWindowEvaluator`, `adjacentBlockEvaluator`, `lightingEvaluator`, `blockDurationEvaluator`, `dayBoundaryEvaluator`, `maintenanceWindowEvaluator` | the built-in evaluators, usable individually                                           |
| `EvaluatorRegistry`                                                                                                                                                            | a registry of evaluators: `register`, `unregister`, `get`, `getAll`, `clear`           |
| `createFollowByEvaluator`                                                                                                                                                      | a **placeholder** for player-rest and follow-by conflicts: it returns no conflicts yet |
| `groupConflictsBySeverity`, `getHighestSeverity`, `formatConflicts`                                                                                                            | summarising a set of conflicts                                                         |

→ [Conflict Evaluators](../availability-engine/event-system-and-validation.md#conflict-evaluators),
[Built-in Evaluators](../availability-engine/event-system-and-validation.md#built-in-evaluators),
[Custom Evaluator Example](../availability-engine/event-system-and-validation.md#custom-evaluator-example)

---

## Time granularity

The one authority for snapping and converting times, in place of ad hoc slot lengths.

| export                                      | what it does                                     |
| ------------------------------------------- | ------------------------------------------------ |
| `snapToGranularity`, `snapIsoToGranularity` | snap minutes, or an ISO time, to the granularity |
| `hhmmToMinutes`, `minutesToHhmm`            | `'HH:MM'` and minutes since midnight             |

→ [Time Granularity](../availability-engine/block-types-and-algorithms.md#time-granularity)

---

## Plan state

| export                    | what it does                                                                                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `computePlanItemId(item)` | the id of a scheduling plan item, from its key fields: `day\|venueId\|eventId[\|drawId]\|R{roundNumber}`. Two items with the same key fields share an id, which is what makes adding one replace the other |

→ [Plan State](../availability-engine/availability-engine-api.md#plan-state)

---

## Validation pipeline

| export                  | what it does                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `runValidationPipeline` | validates a scheduling plan against engine state in ordered phases, collecting rule results with severity and fix actions |

→ [Validation Pipeline](../availability-engine/event-system-and-validation.md#validation-pipeline)

---

## CODES bridge

The only place availability structures meet CODES (TODS) structures.

| export                                                        | what it does                                         |
| ------------------------------------------------------------- | ---------------------------------------------------- |
| `railsToDateAvailability`                                     | rails to a court's CODES `dateAvailability`          |
| `todsAvailabilityToBlocks`                                    | CODES availability to blocks                         |
| `applyAvailabilityToTournamentRecord`                         | writes derived availability into a tournament record |
| `buildSchedulingProfileFromUISelections`                      | a scheduling profile from plan selections            |
| `validateSchedulingProfileFormat`, `validateDateAvailability` | shape checks for both                                |
| `mergeOverlappingAvailability`, `calculateCourtHours`         | utilities                                            |

→ [CODES Bridge](../availability-engine/block-types-and-algorithms.md#codes-bridge)

---

## Related

- [Availability Engine overview](../availability-engine/availability-engine-overview.md)
- [Availability Engine API](../availability-engine/availability-engine-api.md)
- [UI integration scenarios](../availability-engine/ui-integration-scenarios.md)
