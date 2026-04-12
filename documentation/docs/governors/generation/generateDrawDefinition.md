---
title: generateDrawDefinition
---

# generateDrawDefinition

`generateDrawDefinition()` is the primary method for creating complete draw structures. It handles the full lifecycle: validating entries, deriving draw parameters, generating structures and links, seeding, positioning participants, and optionally adding qualifying, consolation, and playoff structures — all in a single call.

## Basic Usage

```js
const { drawDefinition, success } = engine.generateDrawDefinition({
  tournamentRecord, // implicitly provided by engine state
  event, // implicitly provided when using eventId
  eventId: 'event-uuid',
  drawSize: 32,
  drawType: SINGLE_ELIMINATION,
  automated: true, // place participants automatically
});
```

## Parameters

### Required (when calling via engine)

| Parameter | Type     | Description                                                                                    |
| --------- | -------- | ---------------------------------------------------------------------------------------------- |
| `eventId` | `string` | Event to generate the draw for. The engine resolves `tournamentRecord` and `event` from state. |

### Draw Structure

| Parameter       | Type             | Default               | Description                                                              |
| --------------- | ---------------- | --------------------- | ------------------------------------------------------------------------ |
| `drawSize`      | `number`         | derived from entries  | Number of positions in the first-round structure                         |
| `drawType`      | `DrawTypeUnion`  | `SINGLE_ELIMINATION`  | Type of draw to generate (see [Draw Types](/docs/concepts/draw-types))   |
| `drawName`      | `string`         | derived from drawType | Custom name for the draw                                                 |
| `drawId`        | `string`         | auto-generated        | Explicit draw ID                                                         |
| `matchUpType`   | `EventTypeUnion` | from event            | `SINGLES`, `DOUBLES`, or `TEAM`                                          |
| `matchUpFormat` | `string`         | from policy/event     | Default [matchUpFormatCode](/docs/codes/matchup-format) for all matchUps |
| `roundsCount`   | `number`         | —                     | For AD_HOC draws, number of rounds to pre-generate                       |
| `structureName` | `string`         | —                     | Custom name for the main structure                                       |

### Entries and Seeding

| Parameter              | Type                       | Default     | Description                                                                              |
| ---------------------- | -------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| `drawEntries`          | `Entry[]`                  | from event  | Entries for the draw; defaults to `event.entries`                                        |
| `automated`            | `boolean \| { seedsOnly }` | `false`     | Auto-place participants. `{ seedsOnly: true }` places only seeds and adjacent byes.      |
| `seedsCount`           | `number`                   | from policy | Number of seeds to generate                                                              |
| `seedingProfile`       | `SeedingProfile`           | —           | `{ positioning: CLUSTER \| SEPARATE \| WATERFALL }` and optional `groupSeedingThreshold` |
| `considerEventEntries` | `boolean`                  | `true`      | Use `event.entries` when `drawEntries` not provided                                      |
| `placeByes`            | `boolean`                  | `true`      | Automatically place byes                                                                 |
| `enforceGender`        | `boolean`                  | —           | Validate participant gender against event                                                |

### Qualifying

| Parameter               | Type      | Description                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `qualifyingProfiles`    | `any[]`   | Array of qualifying structure configurations: `[{ roundTarget, structureProfiles: [{ drawSize, seedsCount, qualifyingPositions }] }]`                                                                                                                                                                                                                           |
| `qualifyingPlaceholder` | `boolean` | Generate a placeholder qualifying structure when qualifiers count is set but no profiles provided                                                                                                                                                                                                                                                               |
| `qualifyingOnly`        | `boolean` | Generate only qualifying structures with a MAIN placeholder. When combined with `drawEntries` containing `entryStage: QUALIFYING` entries and `qualifyingProfiles`, creates populated qualifying structures and an empty MAIN structure. The MAIN can be generated later by calling `generateDrawDefinition` again with a `drawSize` and the existing `drawId`. |

### Consolation and Voluntary Consolation

| Parameter              | Type                                                       | Description                                                      |
| ---------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| `voluntaryConsolation` | `{ structureName?, structureAbbreviation?, structureId? }` | Add a voluntary consolation structure (requires `drawSize >= 4`) |

### Playoffs and Complex Topologies

| Parameter           | Type                | Description                                                                                                                                                                                                     |
| ------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `withPlayoffs`      | `WithPlayoffsArgs`  | Add playoff structures linked to the main structure via LOSER links. Supports arbitrary recursive nesting for COMPASS-like topologies. See [Recursive Playoff Generation](#recursive-playoff-generation) below. |
| `playoffAttributes` | `PlayoffAttributes` | Map of `exitProfile` or `finishingPositionRange` to `{ name, abbreviation }` for naming generated structures                                                                                                    |

### ID Management

| Parameter          | Type                | Description                                                                                                                                                                          |
| ------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `idPrefix`         | `string`            | Deterministic ID generation: all IDs become `{prefix}-{context}` instead of random UUIDs                                                                                             |
| `uuids`            | `string[]`          | Pool of pre-generated UUIDs consumed via `pop()` for matchUpIds, structureIds, and other entities. **Order-dependent and shared** — see [ID Assignment](#id-assignment) for details. |
| `targetMatchUpIds` | `TargetMatchUpId[]` | Post-generation remap of specific matchUpIds by location fingerprint. See [Targeted MatchUp ID Assignment](#targeted-matchup-id-assignment) below.                                   |

### Policies and Options

| Parameter                | Type                | Description                                                                             |
| ------------------------ | ------------------- | --------------------------------------------------------------------------------------- |
| `policyDefinitions`      | `PolicyDefinitions` | Seeding, avoidance, or other policies                                                   |
| `enforceMinimumDrawSize` | `boolean`           | Default `true`. Set to `false` to allow multi-structure draws with only 2 participants. |
| `drawTypeCoercion`       | `boolean`           | Coerce multi-structure draw types to `SINGLE_ELIMINATION` when `drawSize: 2`            |
| `ignoreStageSpace`       | `boolean`           | Ignore wildcards count etc. when validating entries                                     |
| `staggeredEntry`         | `boolean`           | Accept non-power-of-2 draw sizes; generates feed arms for extra positions               |
| `isMock`                 | `boolean`           | Mark generated entities as mock data                                                    |

### TEAM Events

| Parameter            | Type        | Description                                                       |
| -------------------- | ----------- | ----------------------------------------------------------------- |
| `tieFormat`          | `TieFormat` | `{ collectionDefinitions, winCriteria }` for team/dual matchUps   |
| `tieFormatName`      | `string`    | Named tie format preset                                           |
| `hydrateCollections` | `boolean`   | Propagate event `category` and `gender` to collection definitions |

## Return Value

```ts
{
  drawDefinition: DrawDefinition;     // The fully generated draw
  structureId: string;                // Main structure ID
  existingDrawDefinition: boolean;    // true if draw already existed
  qualifyingConflicts?: any[];        // Conflicts during qualifying generation
  positioningReports?: any[];         // Details of automated positioning decisions
  conflicts?: any[];                  // General generation conflicts
  success: boolean;
}
```

## Generation Pipeline

When called, `generateDrawDefinition` executes this pipeline:

1. **Validate and derive** — resolve draw size, type, policies, seeding profile from params and event context
2. **Resolve scoring format** — determine `matchUpFormat` and `tieFormat` from params, policies, or event defaults
3. **Generate or fetch existing** — create the base draw definition with structures, links, entries, and optionally seed and position participants
4. **Qualifying generation** — add qualifying structures and links if `qualifyingProfiles` specified
5. **Voluntary consolation** — add voluntary consolation structure if requested and `drawSize >= 4`
6. **Recursive playoff generation** — process `withPlayoffs` to add playoff/COMPASS structures (see below)
7. **Hydrate round names** — apply round naming policy if configured
8. **Remap matchUp IDs** — apply `targetMatchUpIds` if provided (see below)

## Recursive Playoff Generation

The `withPlayoffs` parameter enables building complex multi-structure topologies (COMPASS, OLYMPIC, or custom) in a single call. It supports arbitrary nesting through the `roundPlayoffs` field.

### How It Works

1. `addPlayoffStructures()` creates playoff structures for the specified `roundProfiles` against the source structure
2. New LOSER links are detected by diffing `drawDefinition.links` before and after the call
3. For each entry in `roundPlayoffs`, the matching link's target `structureId` is found
4. The process recurses into the child `WithPlayoffsArgs` using that target structure

### Simple Example — 3rd/4th Place Match

```js
const { drawDefinition } = engine.generateDrawDefinition({
  drawSize: 16,
  eventId,
  withPlayoffs: {
    roundProfiles: [{ 4: 1 }], // losers from semifinal (round 4) → 1-round playoff
    playoffAttributes: {
      '0-4': { name: 'Bronze Medal Match', abbreviation: 'BM' },
    },
  },
});
// Result: 2 structures (Main + Bronze), 1 LOSER link
```

### Full COMPASS Example — 8 Structures

```js
const { drawDefinition } = engine.generateDrawDefinition({
  drawSize: 32,
  drawType: SINGLE_ELIMINATION,
  drawName: 'East',
  eventId,
  withPlayoffs: {
    roundProfiles: [{ 1: 1 }, { 2: 1 }, { 3: 1 }],
    playoffAttributes: {
      '0-1': { name: 'West', abbreviation: 'W' },
      '0-2': { name: 'North', abbreviation: 'N' },
      '0-3': { name: 'Northeast', abbreviation: 'NE' },
    },
    roundPlayoffs: {
      1: {
        roundProfiles: [{ 1: 1 }, { 2: 1 }],
        playoffAttributes: {
          '0-1': { name: 'South', abbreviation: 'S' },
          '0-2': { name: 'Southwest', abbreviation: 'SW' },
        },
        roundPlayoffs: {
          1: {
            roundProfiles: [{ 1: 1 }],
            playoffAttributes: {
              '0-1': { name: 'Southeast', abbreviation: 'SE' },
            },
          },
        },
      },
      2: {
        roundProfiles: [{ 1: 1 }],
        playoffAttributes: {
          '0-1': { name: 'Northwest', abbreviation: 'NW' },
        },
      },
    },
  },
});
// Result: 8 structures, 7 LOSER links, 72 matchUps
```

Partial topologies work the same way — simply omit branches you don't need.

## ID Assignment

### uuids (Pool-Based)

The `uuids` parameter provides a shared pool of IDs consumed via `pop()` (LIFO) during generation. IDs are used for:

- **structureIds** — consumed first for each structure
- **matchUpIds** — consumed as matchUps are built round-by-round
- **drawIds, courtIds, eventIds** — in specific generation contexts

Because consumption order depends on draw type and structure count, `uuids` is not suitable for targeting specific matchUps. Use `targetMatchUpIds` instead.

### idPrefix (Deterministic)

With `idPrefix`, all IDs are generated deterministically:

- MatchUps: `{prefix}-{roundNumber}-{roundPosition}`
- Structures: `{prefix}-{structureName}-{suffix}`

Useful for testing and reproducibility, but IDs are synthetic — not suitable for preserving external IDs.

### targetMatchUpIds (Targeted) {#targeted-matchup-id-assignment}

The `targetMatchUpIds` parameter remaps specific matchUpIds **after** the draw is fully generated. Each target specifies:

```ts
type TargetMatchUpId = {
  matchUpId: string; // the ID to assign
  roundNumber: number; // required — which round
  roundPosition: number; // required — which position within the round
  stage?: string; // optional — 'MAIN', 'CONSOLATION', 'QUALIFYING', etc.
  stageSequence?: number; // optional — 1, 2, etc.
  exitProfile?: string; // optional — '0', '0-1', '0-1-2', etc. (see Exit Profiles)
  structureId?: string; // optional — target a known structure directly
};
```

This is the recommended approach for **preserving external matchUp IDs** when importing draws from other tournament management systems. See [remapDrawDefinitionMatchUpIds](/docs/governors/generation/remapDrawDefinitionMatchUpIds) for the standalone function and detailed use cases.

**Example:**

```js
const { drawDefinition } = engine.generateDrawDefinition({
  drawSize: 8,
  eventId,
  targetMatchUpIds: [
    { matchUpId: 'ext-101', roundNumber: 1, roundPosition: 1 },
    { matchUpId: 'ext-102', roundNumber: 1, roundPosition: 2 },
    { matchUpId: 'ext-201', roundNumber: 2, roundPosition: 1 },
    { matchUpId: 'ext-final', roundNumber: 3, roundPosition: 1 },
  ],
});
// Targeted matchUps get external IDs; untargeted matchUps get generated UUIDs
```

## Related

- [Draw Types](/docs/concepts/draw-types) — all supported draw type configurations
- [Exit Profiles](/docs/concepts/exit-profiles) — how structures are fingerprinted in multi-structure draws
- [remapDrawDefinitionMatchUpIds](/docs/governors/generation/remapDrawDefinitionMatchUpIds) — standalone post-generation ID remapping
- [Policies](/docs/concepts/policies) — seeding, avoidance, and positioning policies
- [Flights](/docs/concepts/events/flights) — splitting entries across multiple draws
