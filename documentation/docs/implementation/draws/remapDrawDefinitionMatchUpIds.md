---
title: remapDrawDefinitionMatchUpIds
---

# remapDrawDefinitionMatchUpIds

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
/**
 * Remap matchUpIds on a drawDefinition using targeted assignments.
 *
 * Each target specifies a matchUpId to assign and a location fingerprint
 * (roundNumber + roundPosition + optional stage/stageSequence/exitProfile/structureId).
 * MatchUps that don't match any target are left unchanged.
 *
 * Cross-references (winnerMatchUpId, loserMatchUpId) are updated to reflect
 * any remapped IDs. tieMatchUp IDs are also remapped when targeted.
 */
export function remapDrawDefinitionMatchUpIds({
  targetMatchUpIds,
  drawDefinition,
}: RemapArgs): ResultType & { remappedCount?: number };
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `drawsGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/mutate/drawDefinitions/remapDrawDefinitionMatchUpIds.ts` — `remapDrawDefinitionMatchUpIds`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/mutate/drawDefinitions/remapDrawDefinitionMatchUpIds.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Preserved 7.x reference

The passages below preserve the existing governor documentation. **Engine examples describe 7.x availability, not an 8.x replacement.** Source contracts take precedence where an explicitly noted correction applies.

### From governors/generation/remapDrawDefinitionMatchUpIds.md

Remap specific matchUpIds on a fully generated draw definition using targeted location fingerprints. This is the recommended approach for preserving external matchUp IDs when importing draws from other tournament management systems.

## The Problem

When converting draws from external tournament management platforms (UTR, TennisLink, TP, etc.) into the CODES data format, each matchUp already has an ID assigned by the source system. These IDs are important to preserve because:

- **External references** — scoring apps, public-facing brackets, and reporting systems reference matchUps by their original IDs
- **Data synchronization** — ongoing sync between systems requires stable ID mappings
- **Audit trail** — preserving the original ID maintains traceability to the source system

A wholesale mapping approach (building the CODES structure by hand and inserting IDs directly) is fragile because it requires exact knowledge of the internal structure layout, draw position assignments, bye placement, and cross-reference wiring. Any mismatch produces an invalid draw.

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

### 7.x engine route

Destructuring this method from `tournamentEngine` still uses the engine route. It is not a standalone package import or an 8.x migration.

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

## Related documentation

- [governors/generation/generateDrawDefinition.md](/docs/governors/generation/generateDrawDefinition)
- [governors/generation/remapDrawDefinitionMatchUpIds.md](/docs/governors/generation/remapDrawDefinitionMatchUpIds)
- [migration-3.0.0.md](/docs/migration-3.0.0)
