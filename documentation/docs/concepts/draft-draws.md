---
title: Draft Draws
---

## Overview

**Draft Draws** introduce participant agency into draw positioning. After seeds are placed in a standard elimination draw, remaining (unseeded) participants are given the opportunity to nominate their preferred draw positions. Preferences are resolved tier-by-tier, with higher-priority tiers getting first choice. The result is a draw where participants have influence over their placement while the tournament director retains full control and visibility through a transparency report.

This concept applies to **any elimination-style draw type** — it is not a separate draw type but rather a positioning workflow that layers on top of existing draw generation.

:::info
Draft positioning uses the factory's `seedsOnly` automation mode, which places only seeds and seed-related byes during draw generation. All other positions remain open for the draft process.
:::

## Concepts

### Tiers

Unseeded participants are divided into **tiers** that determine preference priority. Tier 1 participants have their preferences resolved first, then Tier 2, and so on. This mirrors ranking priority — higher-ranked participants get better odds of receiving their preferred position.

- **Configurable count**: The tournament director sets the number of tiers (default: 3)
- **Even distribution**: Participants are distributed as evenly as possible across tiers, with earlier tiers receiving extra participants when the count doesn't divide evenly
- **Sequential resolution**: Each tier is fully resolved before the next tier begins, so later tiers only see positions that remain unassigned

### Preferences

Each participant submits an ordered list of preferred draw positions. The number of preferences allowed is configurable (default: 3).

- Preferences must reference valid unassigned draw positions
- Preferences are trimmed to the configured maximum
- Participants who submit no preferences are placed randomly after preference holders in their tier

### Resolution

When the draft is resolved, the factory processes tiers sequentially. Within each tier:

1. **Preference holders** are resolved using the existing `resolveDrawPositions` algorithm, which handles contention (multiple participants wanting the same position) through random selection among contenders
2. **Non-preference participants** are randomly assigned to remaining open positions
3. The working assignment state is updated so the next tier sees an accurate picture of available positions

### Transparency Report

Every resolution produces a transparency report that records, for each participant:

- Their submitted preferences
- Their assigned draw position
- Which preference they received (1st, 2nd, 3rd choice, or `null` for random placement)

When `applyResults` is `true`, the transparency report is also stored on the draft state extension for permanent audit.

### Status Lifecycle

The draft progresses through these statuses:

| Status                   | Meaning                                        |
| ------------------------ | ---------------------------------------------- |
| `SEEDS_PLACED`           | Draft initialized, ready to accept preferences |
| `COLLECTING_PREFERENCES` | At least one preference has been submitted     |
| `COMPLETE`               | Draft has been resolved and positions assigned |

## Data Storage

Draft state is stored as an extension on the draw definition with the name `draftState`. The extension value contains:

```typescript
{
  status: 'SEEDS_PLACED' | 'COLLECTING_PREFERENCES' | 'COMPLETE';
  structureId: string;
  preferencesCount: number;           // max preferences per participant
  tiers: Array<{
    participantIds: string[];
    resolved: boolean;
  }>;
  preferences: Record<string, number[]>;  // participantId → ordered draw positions
  unassignedDrawPositions: number[];
  resolvedAt?: string;                // ISO timestamp, set on completion
  transparencyReport?: Array<{        // set on completion
    participantId: string;
    preferences: number[];
    assignedPosition: number;
    preferenceMatch: number | null;   // 1-indexed (1st, 2nd, 3rd) or null
  }>;
}
```

## API

### Generating a Seeds-Only Draw

Draft positioning requires a draw generated with `automated: { seedsOnly: true }`, which places seeds and seed-related byes but leaves all other positions open:

```js
const { drawDefinition } = engine.generateDrawDefinition({
  drawType: SINGLE_ELIMINATION,
  automated: { seedsOnly: true },
  drawSize: 32,
  eventId,
});
engine.addDrawDefinition({ eventId, drawDefinition });
```

### Initializing a Draft

After the draw is added, initialize the draft to set up tiers and prepare for preference collection:

```js
const result = engine.initializeDraft({
  drawId,
  tierCount: 3, // optional, default: 3
  preferencesCount: 3, // optional, default: 3
});
// result: { success, draftState, unassignedDrawPositions, tiers }
```

| Parameter          | Type      | Default | Description                                               |
| ------------------ | --------- | ------- | --------------------------------------------------------- |
| `drawId`           | `string`  | —       | Target draw definition                                    |
| `structureId`      | `string`  | auto    | Target structure (auto-resolved if single MAIN structure) |
| `tierCount`        | `number`  | `3`     | Number of priority tiers                                  |
| `preferencesCount` | `number`  | `3`     | Maximum preferences per participant                       |
| `force`            | `boolean` | `false` | Allow re-initialization of an active draft                |

Re-initialization with `force: true` replaces the existing draft state. This is useful when the tournament director wants to adjust tier count or preferences count after initial setup. Previously submitted preferences are discarded.

### Submitting Preferences

Record a participant's ranked draw position preferences:

```js
engine.setDrawPositionPreferences({
  drawId,
  participantId: 'participant-uuid',
  preferences: [5, 12, 3], // ordered: 1st choice = position 5, etc.
});
```

| Parameter       | Type       | Description                              |
| --------------- | ---------- | ---------------------------------------- |
| `drawId`        | `string`   | Target draw definition                   |
| `participantId` | `string`   | The participant submitting preferences   |
| `preferences`   | `number[]` | Ordered list of preferred draw positions |

Validation rules:

- The participant must belong to a tier in the active draft
- All positions must be valid unassigned draw positions
- Preferences exceeding `preferencesCount` are silently trimmed
- The draft must not be in `COMPLETE` status

### Querying Draft State

Retrieve the current draft state with computed summary statistics:

```js
const { draftState, summary } = engine.getDraftState({ drawId });
```

The `summary` object contains:

| Property                  | Type       | Description                                     |
| ------------------------- | ---------- | ----------------------------------------------- |
| `status`                  | `string`   | Current draft status                            |
| `totalParticipants`       | `number`   | Total participants across all tiers             |
| `preferencesSubmitted`    | `number`   | Count of participants who submitted preferences |
| `preferencesOutstanding`  | `number`   | Participants who have not yet submitted         |
| `tiersTotal`              | `number`   | Number of tiers                                 |
| `tiersResolved`           | `number`   | Number of tiers already resolved                |
| `unassignedDrawPositions` | `number[]` | Available draw positions                        |
| `preferencesCount`        | `number`   | Max preferences per participant                 |

### Resolving the Draft

Resolve all tiers and optionally apply the results to the draw:

```js
// Preview mode — compute resolutions without modifying the draw
const preview = engine.resolveDraftPositions({
  drawId,
  applyResults: false,
});
// preview: { success, drawPositionResolutions, tierReports, transparencyReport }

// Apply mode — assign participants to their resolved positions
const result = engine.resolveDraftPositions({ drawId });
// result: { success, drawPositionResolutions, tierReports, transparencyReport }
```

| Parameter      | Type      | Default | Description                                      |
| -------------- | --------- | ------- | ------------------------------------------------ |
| `drawId`       | `string`  | —       | Target draw definition                           |
| `applyResults` | `boolean` | `true`  | Whether to assign positions and mark as complete |

The return value includes:

| Property                  | Type                     | Description                                                                   |
| ------------------------- | ------------------------ | ----------------------------------------------------------------------------- |
| `drawPositionResolutions` | `Record<number, string>` | Map of draw position → participantId                                          |
| `tierReports`             | `array`                  | Per-tier resolution details                                                   |
| `transparencyReport`      | `array`                  | Per-participant audit trail (see [Transparency Report](#transparency-report)) |

When `applyResults` is `true`, each resolution calls `assignDrawPosition` to place the participant, the draft status is set to `COMPLETE`, and the transparency report is persisted on the extension.

### Resetting a Draw with a Draft

`resetDrawDefinition` automatically removes the `draftState` extension along with position actions. This means resetting a draw effectively cancels any in-progress draft:

```js
engine.resetDrawDefinition({ drawId });
// Draft extension is removed; draw returns to initial state
```

## Complete Workflow Example

```js
import { tournamentEngine, drawDefinitionConstants } from 'tods-competition-factory';

const { SINGLE_ELIMINATION } = drawDefinitionConstants;

// 1. Generate a seeds-only draw
const { drawDefinition } = tournamentEngine.generateDrawDefinition({
  drawType: SINGLE_ELIMINATION,
  automated: { seedsOnly: true },
  drawSize: 32,
  eventId,
});
tournamentEngine.addDrawDefinition({ eventId, drawDefinition });

const drawId = drawDefinition.drawId;

// 2. Initialize the draft with 3 tiers, 3 preferences max
const { tiers, unassignedDrawPositions } = tournamentEngine.initializeDraft({
  drawId,
  tierCount: 3,
  preferencesCount: 3,
});

console.log(`${tiers.length} tiers created`);
console.log(`${unassignedDrawPositions.length} positions available for nomination`);

// 3. Collect preferences from participants
// (In practice, this happens over time as participants submit choices)
for (const tier of tiers) {
  for (const participantId of tier.participantIds) {
    // Each participant picks from available positions
    const picks = unassignedDrawPositions.slice(0, 3);
    tournamentEngine.setDrawPositionPreferences({
      drawId,
      participantId,
      preferences: picks,
    });
  }
}

// 4. Preview the resolution before committing
const preview = tournamentEngine.resolveDraftPositions({
  drawId,
  applyResults: false,
});

for (const entry of preview.transparencyReport) {
  const pref = entry.preferenceMatch
    ? `${entry.preferenceMatch}${ordinalSuffix(entry.preferenceMatch)} choice`
    : 'random';
  console.log(`${entry.participantId} → position ${entry.assignedPosition} (${pref})`);
}

// 5. Apply the resolution
const result = tournamentEngine.resolveDraftPositions({ drawId });
console.log(result.success ? 'Draft resolved!' : result.error);

function ordinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
```

## Design Decisions

### Why Tiers?

Without tiers, all participants compete equally for contested positions. Tiers provide a natural analog to ranking priority — higher-ranked unseeded participants get better placement odds, which is fairer and closer to how traditional seeding already works.

### Why Not Modify `resolveDrawPositions`?

The existing `resolveDrawPositions` function works correctly for single-invocation use cases. Rather than adding tier-awareness to that core algorithm, `resolveDraftPositions` wraps it with iterative tier processing and pre-filters preferences against the current assignment state between each tier. This keeps the existing function focused and avoids breaking changes.

### Preview Before Commit

The `applyResults: false` parameter enables tournament directors to review resolution outcomes before making them permanent. Since the resolution involves randomness (for contested positions and no-preference participants), the preview shows one possible outcome. The actual resolution when `applyResults: true` may differ due to re-randomization.

### Extension Storage

Draft state is stored as an extension rather than as a first-class property on the draw definition. This follows the factory's established pattern for feature-specific state (e.g., position actions, flight profiles) and avoids schema changes to the core data model.

## Related

- [Draws Overview](./draws-overview) — Draw generation and management
- [Draw Types](./draw-types) — Available draw types
- [Draw Links](./draw-links) — Linked structure architecture
- [Extensions](/docs/concepts/extensions) — CODES extension pattern
- [Generation Governor](/docs/governors/generation-governor) — API reference for draw generation
- [Draws Governor](/docs/governors/draws-governor) — API reference for draw mutations and queries
