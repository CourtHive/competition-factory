---
title: Exit Profiles
---

## Overview

An **exit profile** is a string that encodes the path a participant took through a draw's linked structures before arriving at their current structure. Exit profiles are the mechanism by which the factory traces how participants flow between structures — from a main draw through consolation rounds, playoff brackets, or compass directions.

Exit profiles are computed by `getExitProfiles()` and are used internally to:

- Build [finishing position](./finishing-positions.md) ranges across multi-structure draws
- Name structures in playoff and compass-style draws
- Determine which playoff structures to generate for a given exit path
- Map positions between source and target structures

## Format

An exit profile is a hyphen-separated string of round numbers representing the chain of link traversals from the initial structure of a stage:

```text
"0"          → the initial structure itself
"0-1"        → reached via losers from round 1 of the initial structure
"0-2"        → reached via losers from round 2 of the initial structure
"0-1-1"      → reached via losers from round 1 of the "0-1" structure
"0-1-1-1"    → one more level deep
```

The first segment is always `"0"` (the root). Each subsequent segment is the source round number from the parent structure's link.

## Example: Compass Draw

A COMPASS draw with 32 players produces 8 structures. Their exit profiles map directly to compass directions:

| Exit Profile | Structure   | How participants arrive   |
| ------------ | ----------- | ------------------------- |
| `0`          | East (Main) | Direct entry              |
| `0-1`        | West        | Round 1 losers from East  |
| `0-2`        | North       | Round 2 losers from East  |
| `0-3`        | Northeast   | Round 3 losers from East  |
| `0-1-1`      | South       | Round 1 losers from West  |
| `0-1-2`      | Southwest   | Round 2 losers from West  |
| `0-2-1`      | Northwest   | Round 1 losers from North |
| `0-1-1-1`    | Southeast   | Round 1 losers from South |

The `COMPASS_ATTRIBUTES` constant maps these exit profiles to structure names and abbreviations.

## Example: Feed-In Championship

In a feed-in championship, the main structure feeds losers from each round into a consolation structure. The exit profiles look different because the consolation is a single structure receiving multiple feed rounds:

```text
Main:         exitProfile = "0"
Consolation:  exitProfiles = ["0-1", "0-2", "0-3", ...]
```

A consolation structure can have **multiple exit profiles** — one for each round that feeds into it. This is how the system knows that a single consolation structure receives participants from rounds 1, 2, and 3 of the main draw.

## How Exit Profiles Are Built

The `getExitProfiles()` function in `src/query/drawDefinition/getExitProfile.ts` builds exit profiles by:

1. **Grouping structures by stage** — MAIN, QUALIFYING, CONSOLATION, PLAY_OFF, etc.
2. **Finding the initial structure** for each stage (the one with `stageSequence === 1`)
3. **Recursively traversing links** from each initial structure, building the exit profile string as it goes

```ts
// Simplified traversal logic
function addExitProfiles({ structureId, exitProfile, stage }) {
  exitProfiles[structureId].push(exitProfile);

  // Follow all outgoing links from this structure
  for (const link of relevantLinks) {
    addExitProfiles({
      structureId: link.target.structureId,
      exitProfile: `${exitProfile}-${link.source.roundNumber}`,
      stage: targetStructure.stage,
    });
  }
}
```

The initial structure of CONSOLATION and PLAY_OFF stages does **not** record the `"0"` exit profile for itself (line 49). This is because these structures are always reached via links from another stage — their `"0"` would be meaningless.

## Exit Profiles and Structure Generation

When generating multi-structure draws like COMPASS or PLAYOFF, the `generatePlayoffStructures()` function uses exit profiles to:

- **Name structures**: The `playoffAttributes` map is keyed by exit profile (e.g., `COMPASS_ATTRIBUTES['0-1']` gives `{ name: 'West', abbreviation: 'W' }`)
- **Control depth**: The `exitProfileLimit` parameter can restrict which exit profiles generate structures
- **Track finishing positions**: Each child structure's `finishingPositionOffset` is computed from its position in the exit profile tree

## Stages and Exit Profiles

Exit profiles interact with [stages](./draw-types.md#stages-organizing-structures) in an important way:

- **MAIN** structures get exit profiles starting from `"0"`
- **PLAY_OFF** and **CONSOLATION** structures skip the `"0"` profile for their initial structure, since they're reached through links
- **QUALIFYING** structures have their own independent exit profile tree

In draws like COMPASS and OLYMPIC, the root structure (East) has `stage: MAIN` while all secondary structures have `stage: PLAY_OFF`. Exit profiles are still built correctly because the traversal follows links regardless of stage boundaries.

## API

### `getExitProfiles({ drawDefinition })`

Returns a map of structure IDs to their exit profile arrays:

```ts
const { exitProfiles } = getExitProfiles({ drawDefinition });
// exitProfiles = {
//   'struct-east-id': ['0'],
//   'struct-west-id': ['0-1'],
//   'struct-north-id': ['0-2'],
//   ...
// }
```

### Related

- **[Finishing Positions](./finishing-positions.md)** — How exit profiles feed into finishing position calculations
- **[Draw Types](./draw-types.md)** — Pre-defined draw types and their structure topologies
