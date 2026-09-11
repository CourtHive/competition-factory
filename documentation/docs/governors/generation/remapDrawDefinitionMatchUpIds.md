---
title: remap matchUpIds
---

# remapDrawDefinitionMatchUpIds

Remap specific matchUpIds on a fully generated draw definition using targeted location fingerprints. This is the recommended approach for preserving external matchUp IDs when importing draws from other tournament management systems.

## The Problem

When converting draws from external tournament management platforms (UTR, TennisLink, TP, etc.) into the TODS/CODES data format, each matchUp already has an ID assigned by the source system. These IDs are important to preserve because:

- **External references** — scoring apps, public-facing brackets, and reporting systems reference matchUps by their original IDs
- **Data synchronization** — ongoing sync between systems requires stable ID mappings
- **Audit trail** — preserving the original ID maintains traceability to the source system

A wholesale mapping approach (building the TODS structure by hand and inserting IDs directly) is fragile because it requires exact knowledge of the internal structure layout, draw position assignments, bye placement, and cross-reference wiring. Any mismatch produces an invalid draw.

## The Solution

The safer approach is to let the factory generate the draw through its normal pipeline — which handles all the structural complexity, bye placement, link wiring, and cross-references — then remap the matchUpIds afterward using location fingerprints.

```text
Source System                Factory Generation              Remap
┌───────────┐    extract     ┌──────────────────┐   target   ┌────────────────┐
│ External  │───matchUps────▶│ generateDraw     │──matchUp──▶│ remap IDs by   │
│ Draw Data │   + metadata   │ Definition()     │   Ids      │ round/position │
└───────────┘                └──────────────────┘            └────────────────┘
                             normal pipeline:                preserves external
                             structures, links,              IDs while factory
                             byes, seeding                   handles structure
```

## Usage

### Standalone Function

```js
import { tournamentEngine } from 'tods-competition-factory';
const { remapDrawDefinitionMatchUpIds } = tournamentEngine;

const result = remapDrawDefinitionMatchUpIds({
  drawDefinition,
  targetMatchUpIds: [
    { matchUpId: 'ext-101', roundNumber: 1, roundPosition: 1 },
    { matchUpId: 'ext-102', roundNumber: 1, roundPosition: 2 },
    { matchUpId: 'ext-201', roundNumber: 2, roundPosition: 1 },
    { matchUpId: 'ext-final', roundNumber: 3, roundPosition: 1 },
  ],
});

console.log(result.remappedCount); // 4
```

### Via generateDrawDefinition

Pass `targetMatchUpIds` directly — the remap runs automatically at the end of the generation pipeline:

```js
const { drawDefinition } = engine.generateDrawDefinition({
  drawSize: 16,
  eventId,
  targetMatchUpIds: [
    { matchUpId: 'ext-101', roundNumber: 1, roundPosition: 1 },
    { matchUpId: 'ext-102', roundNumber: 1, roundPosition: 2 },
    // ... remaining targets
  ],
});
```

## TargetMatchUpId

Each target identifies a matchUp by its location within the draw:

```ts
type TargetMatchUpId = {
  matchUpId: string; // the external ID to assign
  roundNumber: number; // round within the structure (1-based)
  roundPosition: number; // position within the round (1-based, left to right)

  // Structure targeting (use one of these for multi-structure draws):
  stage?: string; // 'MAIN' | 'CONSOLATION' | 'QUALIFYING' | 'VOLUNTARY_CONSOLATION'
  stageSequence?: number; // 1, 2, etc. (distinguishes multiple structures in same stage)
  exitProfile?: string; // '0', '0-1', '0-1-2', etc. (for playoff/compass structures)
  structureId?: string; // direct structure targeting by known ID
};
```

### Matching Rules

Targets are matched against matchUps in order of specificity:

1. `roundNumber` and `roundPosition` are **always required** and must match exactly
2. If `structureId` is specified, the matchUp must be in that structure (or its parent for round-robin groups)
3. If `exitProfile` is specified, the structure must have that exit profile (computed from the draw's link topology)
4. If `stage` is specified, the structure's stage must match
5. If `stageSequence` is specified, it must also match
6. If none of the optional fields are specified, the target matches the **first** structure where `roundNumber` and `roundPosition` match

### Partial Targeting

You don't need to target every matchUp. Untargeted matchUps keep their generated IDs. This is useful when importing partial data or when only some matchUps have external IDs.

## Multi-Structure Draws

### Consolation Draws (FMLC, Curtis, etc.)

Use `stage` to distinguish MAIN from CONSOLATION matchUps:

```js
const targetMatchUpIds = [
  // Main draw matchUps
  { matchUpId: 'ext-main-r1p1', roundNumber: 1, roundPosition: 1, stage: 'MAIN' },
  { matchUpId: 'ext-main-r1p2', roundNumber: 1, roundPosition: 2, stage: 'MAIN' },

  // Consolation matchUps
  { matchUpId: 'ext-con-r1p1', roundNumber: 1, roundPosition: 1, stage: 'CONSOLATION' },
  { matchUpId: 'ext-con-r1p2', roundNumber: 1, roundPosition: 2, stage: 'CONSOLATION' },
];
```

### Compass and Playoff Draws

Use `exitProfile` to target specific structures in the playoff topology. Exit profiles are stable fingerprints derived from the link structure:

| Exit Profile | Structure   | Description                   |
| ------------ | ----------- | ----------------------------- |
| `'0'`        | East (Main) | Primary elimination structure |
| `'0-1'`      | West        | Losers from round 1 of Main   |
| `'0-2'`      | North       | Losers from round 2 of Main   |
| `'0-3'`      | Northeast   | Losers from round 3 of Main   |
| `'0-1-1'`    | South       | Losers from round 1 of West   |
| `'0-1-2'`    | Southwest   | Losers from round 2 of West   |
| `'0-1-1-1'`  | Southeast   | Losers from round 1 of South  |
| `'0-2-1'`    | Northwest   | Losers from round 1 of North  |

```js
const targetMatchUpIds = [
  // Main (East) structure
  { matchUpId: 'east-r1p1', roundNumber: 1, roundPosition: 1, exitProfile: '0' },

  // West structure (losers from East R1)
  { matchUpId: 'west-r1p1', roundNumber: 1, roundPosition: 1, exitProfile: '0-1' },

  // South structure (losers from West R1)
  { matchUpId: 'south-r1p1', roundNumber: 1, roundPosition: 1, exitProfile: '0-1-1' },
];
```

See [Exit Profiles](/docs/concepts/exit-profiles) for a full explanation of how profiles are computed.

### Round Robin with Playoffs

For round-robin structures (`structureType: CONTAINER`), matchUps live on child group structures. The `stage` and `stageSequence` of the parent container are used for matching:

```js
const targetMatchUpIds = [
  // Group stage matchUps (stage: MAIN, stageSequence: 1)
  { matchUpId: 'grp-r1p1', roundNumber: 1, roundPosition: 1, stage: 'MAIN', stageSequence: 1 },

  // Playoff matchUps from group winners (stage: PLAY_OFF)
  { matchUpId: 'playoff-r1p1', roundNumber: 1, roundPosition: 1, stage: 'PLAY_OFF' },
];
```

## Cross-Reference Updates

When a matchUpId is remapped, all `winnerMatchUpId` and `loserMatchUpId` references across the draw are automatically updated to reflect the new ID. This ensures the progression chain remains consistent.

For example, if semi-final matchUp `old-sf1` has `winnerMatchUpId: 'old-final'`, and you remap the final to `ext-final`, the semi-final's `winnerMatchUpId` is updated to `ext-final`.

## Import Workflow Example

A typical workflow for importing a draw from an external system:

```js
import { tournamentEngine, mocksEngine } from 'tods-competition-factory';

// 1. Create tournament and event with participants from external data
//    (participants, entries, event metadata)

// 2. Build targetMatchUpIds from the external draw's matchUp data
const targetMatchUpIds = externalMatchUps.map((ext) => ({
  matchUpId: ext.id,
  roundNumber: ext.round,
  roundPosition: ext.position,
  stage: ext.isConsolation ? 'CONSOLATION' : 'MAIN',
}));

// 3. Generate the draw — factory handles structure, byes, links, seeding
const { drawDefinition } = engine.generateDrawDefinition({
  drawType: mapExternalDrawType(externalDraw.type),
  drawSize: externalDraw.size,
  targetMatchUpIds,
  eventId,
});

// 4. The draw now has factory-correct structure with external matchUpIds preserved
// 5. Scores and results can be applied using the original external IDs
```

## Return Value

```ts
{
  success: boolean;
  remappedCount: number;  // how many matchUpIds were changed
  error?: ErrorType;      // MISSING_DRAW_DEFINITION or INVALID_VALUES
}
```

## Related

- [generateDrawDefinition](/docs/governors/generation/generateDrawDefinition) — primary draw generation method
- [Exit Profiles](/docs/concepts/exit-profiles) — structure fingerprinting in multi-structure draws
- [Draw Types](/docs/concepts/draw-types) — all supported draw type configurations
