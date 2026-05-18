---
title: tieFormat Governor
---

```js
import { tieFormatGovernor } from 'tods-competition-factory';
```

The **tieFormatGovernor** manages the creation, modification, validation, and storage optimisation of `tieFormat` objects, which define the structure and scoring rules for TEAM matchUps.

## Introduction to tieFormats

In team competitions a single "tie" (or "dual match") consists of multiple individual matchUps — singles, doubles, and potentially mixed doubles — played between two teams. A `tieFormat` describes:

1. **What is played** — the collections of singles and doubles matchUps (`collectionDefinitions`)
2. **How value is assigned** — per-matchUp value, per-set value, per-collection value, or per-collection-position value profiles
3. **What it takes to win** — a `winCriteria` object specifying either a `valueGoal` (first to _n_) or `aggregateValue` (total score)
4. **Optional groupings** — `collectionGroups` that bundle collections for group-level value thresholds (e.g. Laver Cup day scoring)

### Structure

```js
const tieFormat = {
  tieFormatId: 'uuid', // optional — present when centrally stored
  tieFormatName: 'My Format', // optional — human-readable label
  winCriteria: {
    valueGoal: 5, // OR aggregateValue: true
  },
  collectionDefinitions: [
    {
      collectionId: 'singles-id',
      collectionName: 'Singles',
      matchUpType: 'SINGLES',
      matchUpCount: 6,
      matchUpValue: 1, // one of: matchUpValue, setValue, scoreValue, collectionValue, collectionValueProfiles
      matchUpFormat: 'SET3-S:6/TB7',
      gender: 'MALE', // optional
      category: {}, // optional
      collectionGroupNumber: 1, // optional — links to a collectionGroup
    },
    // ...more collections
  ],
  collectionGroups: [
    // optional
    { groupNumber: 1, groupName: 'Day 1', groupValue: 3 },
  ],
};
```

### Hierarchical Resolution

A `tieFormat` can be attached at four levels within a tournament record:

| Level              | Property                   | Purpose                                                     |
| ------------------ | -------------------------- | ----------------------------------------------------------- |
| **Event**          | `event.tieFormat`          | Default for all draws in the event                          |
| **DrawDefinition** | `drawDefinition.tieFormat` | Overrides event default for one draw                        |
| **Structure**      | `structure.tieFormat`      | Overrides draw default for one structure (e.g. consolation) |
| **MatchUp**        | `matchUp.tieFormat`        | Overrides all ancestors for one specific matchUp            |

When the factory resolves the active tieFormat for a matchUp it walks **matchUp → structure → draw → event**, returning the first one found. This means you only need to attach a tieFormat at a lower level when it _differs_ from the ancestor default — for instance, shortening formats for rain-delayed matches.

### Centralised Storage with `tieFormatId`

Rather than duplicating identical tieFormat objects on every draw, structure, and matchUp, the factory supports **centralised storage**:

- Unique tieFormat objects are stored in `event.tieFormats[]` (an array on the event).
- Each entry has a `tieFormatId` (UUID).
- Draws, structures, and matchUps reference them via a `tieFormatId` property instead of an inline `tieFormat`.

This dramatically reduces storage for tournaments with many team matchUps sharing the same format. Use [`aggregateTieFormats`](#aggregatetieformats) to deduplicate inline tieFormats into centralised references, and [`removeOrphanedTieFormats`](#removeorphanedtieformats) to clean up entries that are no longer referenced.

### Value Assignment

Each `collectionDefinition` uses exactly one of these scoring mechanisms:

| Property                  | Meaning                                                                 |
| ------------------------- | ----------------------------------------------------------------------- |
| `matchUpValue`            | Fixed value awarded per matchUp win                                     |
| `setValue`                | Value awarded per set win                                               |
| `scoreValue`              | Value awarded per game/point won (typically used with `aggregateValue`) |
| `collectionValue`         | Value awarded for winning the majority of matchUps in the collection    |
| `collectionValueProfiles` | Per-position value array (e.g. `[{ collectionPosition: 1, value: 2 }]`) |

A `collectionGroup` can additionally define a `groupValue` threshold across multiple collections.

See the [tieFormat concepts page](../concepts/tieFormat) for detailed examples and the [type definitions](../types/typedefs#tieformat) for the full type.

---

## addCollectionDefinition

Adds a `collectionDefinition` to the specified target, either `matchUp`, `structure`, `drawDefinition` or `event`.

```js
engine.addCollectionDefinition({
  updateInProgressMatchUps, // defaults to true; in progress matchUps have matchUpStatus: IN_PROGRESS
  collectionDefinition, // will be validated
  tieFormatName, // if not provided, existing tieFormatName will be deleted
  structureId, // optional - if provided only tieFormat on structure will be modified
  matchUpId, // optional - if provided only tieFormat on matchUp will be modified
  eventId, // optional - if provided only tieFormat on event will be modified
  drawId, // required if structureId is specified; if provided without structureId only tieFormat on drawDefinition will be modified
  uuids, // optional - array of UUIDs to use for newly created matchUps
});
```

**Notes:**

- Correctly handles both inline `tieFormat` and centralised `tieFormatId` references
- When the target uses a `tieFormatId`, the centralised entry in `event.tieFormats[]` is updated (or a new entry created if the ID is shared)

---

## addCollectionGroup

```js
engine.addCollectionGroup({
  collectionIds: result.modifiedCollectionIds,
  tieFormatName: 'Swelled',
  groupDefinition,
  structureId, // optional - if provided only tieFormat on structure will be modified
  matchUpId, // optional - if provided only tieFormat on matchUp will be modified
  eventId, // optional - if provided only tieFormat on event will be modified
  drawId, // required if structureId is specified; if provided without structureId only tieFormat on drawDefinition will be modified
});
```

---

## aggregateTieFormats

Deduplicates all tieFormats within a tournament by consolidating identical inline tieFormats into the `event.tieFormats[]` array and replacing them with `tieFormatId` references.

```js
const { addedCount } = engine.aggregateTieFormats();
```

**Returns:**

```ts
{
  success: boolean;
  addedCount: number; // number of unique tieFormats added to event.tieFormats arrays
}
```

**Purpose:** Normalises tieFormat storage by moving duplicate inline tieFormats to the event-level registry and replacing them with `tieFormatId` references. This reduces data duplication and tournament record size.

**When to use:**

- After importing tournament data that may have duplicate tieFormats
- Before exporting tournament data to reduce file size
- After bulk modifications to tieFormats across multiple structures/matchUps
- To optimise tournament record storage

**Notes:**

- Scans all events in the tournament
- Compares tieFormats using `compareTieFormats()` to identify duplicates
- Converts event, drawDefinition, structure, and matchUp-level inline tieFormats to references
- Generates new `tieFormatId` UUIDs for newly aggregated formats
- Only processes TEAM matchUps
- Safe to run multiple times (idempotent)

---

## compareTieFormats

Compares two tieFormat objects to determine if they are functionally equivalent.

```js
const { different } = engine.compareTieFormats({
  considerations, // optional { collectionName?: boolean; collectionOrder?: boolean };
  ancestor: tieFormat1,
  descendant: tieFormat2,
});

if (!different) {
  console.log('TieFormats are equivalent');
}
```

**Returns:**

```ts
{
  different: boolean; // true if tieFormats differ, false if equivalent
}
```

**Parameters:**

- `ancestor` - The reference tieFormat to compare against
- `descendant` - The tieFormat to compare
- `considerations` - Optional comparison options:
  - `collectionName: boolean` - Whether to consider collection names in comparison (default: false)
  - `collectionOrder: boolean` - Whether order of collections matters (default: false)

**Notes:**

- Used internally by `aggregateTieFormats()` to identify duplicates
- Ignores tieFormatName unless specified in considerations
- Ignores collection order unless specified in considerations
- Compares collection definitions, matchUp formats, scoring values, and gender constraints

---

## getTieFormat

Retrieves the tieFormat for a specific matchUp, structure, draw, or event, following the hierarchical resolution order.

```js
const {
  tieFormat, // resolved tieFormat for the matchUp
  matchUp, // the matchUp object
  structure, // the structure object
} = engine.getTieFormat({
  matchUpId, // optional - matchUp to get tieFormat for
  structureId, // optional - structure to get tieFormat for
  drawId, // optional - draw to get tieFormat for
  eventId, // optional - if provided, returns event-level tieFormat only
});
```

**Returns:**

```ts
{
  tieFormat?: TieFormat;
  matchUp?: MatchUp;
  structure?: Structure;
  error?: ErrorType;
}
```

**Resolution hierarchy:**

1. MatchUp-level tieFormat (most specific)
2. Structure-level tieFormat
3. Draw-level tieFormat
4. Event-level tieFormat (least specific)

At each level, both inline `tieFormat` and `tieFormatId` references (resolved against `event.tieFormats[]`) are checked.

**Notes:**

- Only applies to TEAM matchUps
- Returns the first tieFormat found in the hierarchy
- Use `drawId` and `structureId` for performance optimisation

---

## modifyCollectionDefinition

Modifies the `collectionName` and/or `matchUpFormat` for targeted `collectionId` within the `tieFormat` specified by `eventId`, `drawId`, `structureId` or `matchUpId`.

```js
engine.modifyCollectionDefinition({
  collectionName, // optional
  matchUpFormat, // optional
  collectionId, // required
  structureId, // required if modifying tieFormat for a structure
  matchUpId, // required if modifying tieFormat for a matchUp
  eventId, // required if modifying tieFormat for a event
  drawId, // required if modifying tieFormat for a drawDefinition or a structure
  gender, // optional

  // value assignment, only one is allowed to have a value
  collectionValueProfiles, // optional - [{ collectionPosition: 1, value: 2 }] - there must be a value provided for all matchUp positions
  collectionValue, // optional - value awarded for winning more than half of the matchUps in the collection
  matchUpValue, // optional - value awarded for each matchUp won
  scoreValue, // optional - value awarded for each game or point won (points for tiebreak sets)
  setValue, // optional - value awarded for each set won
});
```

---

## modifyTieFormat

Both modifies the `tieFormat` on the target `event`, `drawDefinition`, `structure` or `matchUp` and adds/deletes `tieMatchUps` as necessary.

```js
engine.modifyTieFormat({
  considerations, // optional { collectionName?: boolean; collectionOrder?: boolean };
  modifiedTieFormat, // will be compared to existing tieFormat that is targeted and differences calculated
  tournamentId, // required
  structureId, // required if modifying tieFormat for a structure
  matchUpId, // required if modifying tieFormat for a matchUp
  eventId, // required if modifying tieFormat for a event
  drawId, // required if modifying tieFormat for a drawDefinition or a structure
});
```

---

## orderCollectionDefinitions

Modify the array order of `tieFormat.collectionDefinitions` for an `event`, a `drawDefinition`, `structure`, or `matchUp`.

```js
engine.orderCollectionDefinitions({
  orderMap: { collectionId1: 1, collectionId2: 2 },
  tournamentId, // required
  structureId, // required if modifying tieFormat for a structure
  matchUpId, // required if modifying tieFormat for a matchUp
  eventId, // required if modifying tieFormat for a event
  drawId, // required if modifying tieFormat for a drawDefinition or a structure
});
```

---

## removeCollectionDefinition

```js
engine.removeCollectionDefinition({
  updateInProgressMatchUps, // optional; defaults to true
  tieFormatComparison, // optional; defaults to false; when true will not delete unique collections on unscored matchUps
  tieFormatName, // any time a collectionDefinition is modified a new name must be provided
  tournamentId, // required
  collectionId, // required - id of collectionDefinition to be removed
  structureId, // optional - if removing from tieFormat associated with a specific structure
  matchUpId, // optional - if removing from tieFormat associated with a specific matchUp
  eventId, // optional - if removing from tieFormat associated with an event
  drawId, // required if structureId is specified or if tieFormat associated with drawDefinition is to be modified
});
```

**Notes:**

- Correctly handles both inline `tieFormat` and centralised `tieFormatId` references
- Removes associated `tieMatchUps` and `collectionAssignments` from affected matchUps

---

## removeCollectionGroup

Removes a `collectionGroup` from the `tieFormat` found for the `event`, `drawDefinition`, `structure` or `matchUp`; recalculates `winCriteria`.

```js
engine.removeCollectionGroup({
  updateInProgressMatchUps, // optional - defaults to true
  tieFormatName: 'New tieFormat', // if no name is provided then there will be no name
  collectionGroupNumber: 1,
  tournamentId, // required
  structureId, // optional
  matchUpId, // optional
  eventId, // optional
  drawId, // optional; required if structureId is targeted
});
```

---

## removeOrphanedTieFormats

Removes entries from `event.tieFormats[]` that are no longer referenced by any drawDefinition, structure, or matchUp in the event.

```js
engine.removeOrphanedTieFormats({ eventId });
```

**Purpose:** After resetting or removing tieFormats from individual matchUps or structures, centralised entries may become orphaned. This method scans the event hierarchy for all `tieFormatId` references and removes any `event.tieFormats[]` entries that no longer have references.

**When to use:**

- After calling `resetTieFormat` on matchUps
- After bulk removal of structures or matchUps
- As a cleanup step after tieFormat modifications
- Periodically to keep tournament records lean

**Notes:**

- Scans event, drawDefinitions, structures, and TEAM matchUps for `tieFormatId` references
- Removes the `tieFormats` array entirely if no entries remain
- Safe to run multiple times (idempotent)

---

## tieFormatGenderValidityCheck

Validates that a collection's gender specification is compatible with the reference gender (event or category gender).

```js
const { valid, error, info } = engine.tieFormatGenderValidityCheck({
  referenceGender, // gender of event or category (e.g., 'MALE', 'FEMALE', 'MIXED', 'ANY')
  matchUpType, // 'SINGLES' or 'DOUBLES'
  gender, // gender of the collection being validated
});

if (!valid) {
  console.error(error, info);
}
```

**Returns:**

```ts
{
  valid: boolean;
  error?: ErrorType;  // INVALID_GENDER if validation fails
  info?: string;      // Explanation of validation failure
}
```

**Validation rules:**

1. **Gendered events (MALE/FEMALE):** Collection gender must match reference gender
2. **MIXED events:** Cannot contain MIXED singles (only MIXED doubles); cannot contain `gender: ANY`
3. **ANY gender events:** Cannot contain MIXED singles (only MIXED doubles)

---

## validateCollectionDefinition

Validates that a collectionDefinition is properly formed and compatible with event/category constraints.

```js
const { valid } = engine.validateCollectionDefinition({
  collectionDefinition, // required
  checkCollectionIds, // optional boolean - check that collectionIds are present
  referenceCategory, // optional - category for comparison if eventId is not provided
  referenceGender, // optional - expected gender if eventId is not provided
  checkCategory, // optional boolean - defaults to true
  checkGender, // optional boolean - defaults to true
  eventId, // required only for checking gender
});
```

**Returns:**

```ts
{
  valid: boolean;
  error?: ErrorType;
}
```

**Validation checks:**

- Collection structure is valid (has required fields)
- CollectionIds are present (if `checkCollectionIds: true`)
- Gender compatibility with event/category (if `checkGender: true`)
- Category compatibility (if `checkCategory: true`)
- MatchUp formats are valid
- Scoring values are properly configured
