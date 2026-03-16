# validatePlayoffGroups

Validates the `playoffGroups` configuration for round-robin-with-playoff draw generation. Called by `processPlayoffGroups` before building playoff structures and links.

## Signature

```ts
function validatePlayoffGroups({
  playoffGroups,
  groupCount,
  groupSize,
}: {
  playoffGroups: PlayoffGroupConfig[];
  groupCount: number;
  groupSize: number;
}): ResultType & {
  valid?: boolean;
  consumptionMap?: { [finishingPosition: number]: number };
  info?: string;
};
```

## Parameters

| Parameter       | Type                   | Description                                          |
| --------------- | ---------------------- | ---------------------------------------------------- |
| `playoffGroups` | `PlayoffGroupConfig[]` | Array of playoff group configurations to validate    |
| `groupCount`    | `number`               | Number of round-robin groups in the source structure |
| `groupSize`     | `number`               | Number of participants per round-robin group         |

### PlayoffGroupConfig

| Field                | Type       | Description                                                                                                    |
| -------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| `finishingPositions` | `number[]` | Which group finishing positions feed this playoff (e.g. `[1]` for group winners)                               |
| `bestOf`             | `number?`  | Total participants to select via cross-group ranking (overrides `groupCount * finishingPositions.length`)      |
| `rankBy`             | `string?`  | Ranking method for cross-group comparison. Currently only `'GEMscore'` is supported (see `GEM_SCORE` constant) |
| `remainder`          | `boolean?` | If `true`, this group takes all participants not claimed by prior `bestOf` groups                              |
| `drawType`           | `string?`  | Draw type for the playoff structure (default: `SINGLE_ELIMINATION`)                                            |
| `structureName`      | `string?`  | Custom name for the generated playoff structure                                                                |
| `structureOptions`   | `object?`  | Options passed to the playoff structure generator (e.g. `{ groupSize: 4 }` for RR playoffs)                    |

## Return Value

On success: `{ valid: true, consumptionMap }` where `consumptionMap` tracks how many participants from each finishing position are consumed.

On failure: `{ valid: false, error, info }` with a descriptive `info` string explaining the validation failure.

## Validation Rules

1. `playoffGroups` must be a non-empty array
2. `groupCount` and `groupSize` must be >= 1
3. Each playoff group must have a non-empty `finishingPositions` array (unless it is a `remainder` group)
4. `finishingPositions` values must be in range `[1, groupSize]`
5. If `bestOf` is specified:
   - Must be a positive number
   - Must be >= `groupCount * finishingPositions.length` (cannot request fewer than guaranteed participants)
   - Must be <= `groupCount * groupSize` (cannot request more than total participants)
6. A `remainder` group must appear after at least one `bestOf` group
7. A `remainder` group must have at least 2 remaining participants
8. `rankBy`, if specified, must be `'GEMscore'` (the `GEM_SCORE` constant)
9. Cross-group consumption: no finishing position can be over-consumed across all playoff groups
10. Total claimed participants cannot exceed `groupCount * groupSize`

## Usage

Called internally by `processPlayoffGroups` when any playoff group uses `bestOf` or `remainder`:

```ts
const hasBestOfOrRemainder = playoffGroups?.some((pg) => pg.bestOf !== undefined || pg.remainder);
if (hasBestOfOrRemainder && groupSize) {
  const validation = validatePlayoffGroups({ playoffGroups, groupCount, groupSize });
  if (!validation.valid) {
    return { error: validation.error };
  }
}
```

## Examples

### Basic: top 4 from 4 groups of 4

```ts
validatePlayoffGroups({
  playoffGroups: [{ finishingPositions: [1], bestOf: 4, rankBy: 'GEMscore' }],
  groupCount: 4,
  groupSize: 4,
});
// => { valid: true, consumptionMap: { 1: 4, 2: 0, 3: 0, 4: 0 } }
```

### Best 8 from position 1 across 3 groups of 4 (selects all 3 winners + best 5 runners-up)

```ts
validatePlayoffGroups({
  playoffGroups: [{ finishingPositions: [1], bestOf: 8, rankBy: 'GEMscore' }],
  groupCount: 3,
  groupSize: 4,
});
// => { valid: true, consumptionMap: { 1: 3, 2: 3, 3: 2, 4: 0 } }
```

### Invalid: bestOf less than guaranteed

```ts
validatePlayoffGroups({
  playoffGroups: [{ finishingPositions: [1], bestOf: 2, rankBy: 'GEMscore' }],
  groupCount: 3,
  groupSize: 4,
});
// => { valid: false, error: INVALID_CONFIGURATION, info: 'bestOf (2) cannot be less than ...' }
```

## Related

- `processPlayoffGroups` in `src/assemblies/generators/drawDefinitions/drawTypes/processPlayoffGroups.ts` — consumer of this validation
- `getBestFinishers` in `src/query/drawDefinition/getBestFinishers.ts` — implements the cross-group ranking selection at positioning time
- `GEM_SCORE` constant in `src/constants/tallyConstants.ts`
