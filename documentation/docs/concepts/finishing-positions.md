---
title: Finishing Positions
---

## Overview

Every matchUp in a draw carries a **`finishingPositionRange`** — a pair of numeric ranges that describe the possible finishing positions for the winner and loser of that matchUp. This value is the bridge between draw structure (where a participant finished) and ranking point calculation (how many points they earn).

```ts
type MatchUpFinishingPositionRange = {
  winner: number[]; // [minPosition, maxPosition]
  loser: number[]; // [minPosition, maxPosition]
};
```

For example, in a 32-draw single elimination:

| Round        | Winner Range | Loser Range | Meaning                                      |
| ------------ | ------------ | ----------- | -------------------------------------------- |
| Final        | `[1, 1]`     | `[2, 2]`    | Champion vs. runner-up                       |
| Semifinal    | `[1, 2]`     | `[3, 4]`    | Winner goes to final; loser finishes 3rd-4th |
| Quarterfinal | `[1, 4]`     | `[5, 8]`    | Winner advances; loser finishes 5th-8th      |
| Round of 16  | `[1, 8]`     | `[9, 16]`   | Winner advances; loser finishes 9th-16th     |
| Round of 32  | `[1, 16]`    | `[17, 32]`  | Winner advances; loser finishes 17th-32nd    |

The winner range narrows as the participant advances through the draw — a champion's final `finishingPositionRange` is `[1, 1]`, meaning they definitively finished 1st.

## How Finishing Positions Are Computed

Finishing positions are computed during draw generation by the `addFinishingRounds()` function. The algorithm works backwards from the final round:

1. **Final round**: The winner finishes at position 1, the loser at position 2
2. **Each earlier round**: Positions are calculated based on how many matchUps remain and the structure size
3. **Offsets**: Multi-structure draws apply a `finishingPositionOffset` to shift positions for consolation or playoff structures

The key inputs are:

| Parameter                 | Purpose                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| `finishingPositionOffset` | Shifts all positions by this amount (used for consolation structures) |
| `positionsFed`            | Number of positions fed into the structure from a linked structure    |
| `roundsCount`             | Total number of rounds in the structure                               |

## Draw Type Variations

### Single Elimination

The simplest case. Each round produces a clear loser range:

```text
32-draw:
  R1 losers:  [17, 32]  →  accessor 32
  R2 losers:  [9, 16]   →  accessor 16
  QF losers:  [5, 8]    →  accessor 8
  SF losers:  [3, 4]    →  accessor 4
  Finalist:   [2, 2]    →  accessor 2
  Champion:   [1, 1]    →  accessor 1
```

:::tip
Without a 3rd-place playoff, both semifinal losers get `finishingPositionRange: [3, 4]` with accessor `4`. Key `3` in a ranking policy is only reached when a 3-4 playoff produces a definitive 3rd-place finisher with range `[3, 3]`.
:::

### Feed-In Championship (FIC)

FIC draws have a main structure and a consolation structure. The consolation structure receives `finishingPositionOffset = baseDrawSize` so its positions don't overlap with the main draw:

```text
32-draw FIC (16-player base main):
  Main draw positions:        1–16
  Consolation positions:      17–32 (offset by 16)

Consolation accessors:
  Consolation R1 losers: accessor 32
  Consolation R2 losers: accessor 24
  Consolation SF losers: accessor 20 (or similar, depending on feeds)
  Consolation finalist:  accessor 18
  Consolation champion:  accessor 17
```

Because each consolation tier receives a distinct `finishingPositionOffset`, all accessors across the entire draw are unique. This means ranking policies can assign different point values to every finishing tier without ambiguity.

### Round Robin

In Round Robin structures, `finishingPositionRange` is less meaningful because all participants in a group play each other. Both `winner` and `loser` have identical ranges spanning the full group:

```text
4-player group: winner=[1,4], loser=[1,4]
```

Final standings in Round Robin are determined by [tally results](/docs/policies/roundRobinTallyPolicy) rather than `finishingPositionRange`. When Round Robin groups feed into playoff structures via [POSITION links](./draw-links), the playoff structure computes its own `finishingPositionRange` independently.

### Compass Draw

Each direction (East, West, South, North, etc.) is an independent elimination structure with its own `finishingPositionRange`. Positions are local to each quadrant.

Compass draws can be generated as a pre-defined `COMPASS` draw type or built as custom topologies using [`withPlayoffs.roundPlayoffs`](/docs/governors/generation-governor#withplayoffs) for full control over which branches exist and their naming. See [Custom Playoff Topologies](/docs/concepts/draw-links#custom-playoff-topologies).

### Qualifying Structures

Qualifying structures use `finishingPositionRange` with special handling:

- Qualifying winners don't receive position `1` (reserved for the main draw champion)
- Instead, their minimum position is set to the qualifying round count
- This prevents qualifying match wins from mapping to main draw finishing positions

## The Accessor: Mapping to Policy Keys {#accessor}

The **accessor** is the critical bridge between `finishingPositionRange` and ranking point policies. It is computed as:

```js
const accessor = Math.max(...finishingPositionRange);
```

This value becomes the key used to look up points in a ranking policy's `finishingPositionRanges` object:

```js
// Ranking policy
finishingPositionRanges: {
  1:  { level: { 1: 3000, 2: 1650, 3: 990 } },  // Champion
  2:  { level: { 1: 2400, 2: 1320, 3: 792 } },  // Runner-up
  4:  { level: { 1: 1800, 2: 990, 3: 594 } },   // SF losers (key 4, not 3!)
  8:  { level: { 1: 1200, 2: 660, 3: 396 } },   // QF losers
  16: { level: { 1: 600,  2: 330, 3: 198 } },   // R16 losers
  32: { level: { 1: 300,  2: 165, 3: 99 } },    // R32 losers
}
```

The `Math.max()` convention means the accessor always corresponds to the **worst possible** finishing position in the range. This is intentional — it ensures participants are awarded points based on the round where they were eliminated, not their best theoretical position.

### Multi-Structure Draws

For draws with multiple structures (FIC, Curtis Consolation, Compass), a participant may have `structureParticipation` entries in more than one structure (e.g., eliminated in main draw R2, then played consolation through to the consolation SF). The ranking points pipeline iterates all entries and takes the **maximum position points** across structures:

```text
Main draw R2 loss:       accessor 24  →  75 pts
Consolation SF finish:   accessor 12  →  150 pts
Final position points:   150 pts (consolation finish is better)
```

This happens automatically — no special policy configuration is needed.

## structureParticipation

When participants are hydrated with `getParticipants({ withRankingProfile: true })`, each participant's `draws` array contains `structureParticipation` entries. Each entry includes:

```ts
{
  structureId: string;
  finishingPositionRange: number[];  // the resolved range (winner or loser, based on outcome)
  participantWon: boolean;
  winCount: number;
  rankingStage: string;             // 'MAIN', 'QUALIFYING', 'CONSOLATION', etc.
  participationOrder: number;       // 1 for primary, 2+ for consolation/playoff
}
```

The `finishingPositionRange` stored in `structureParticipation` is the **resolved** range — it's the winner range if the participant won their last matchUp, or the loser range if they lost. When a participant plays multiple matchUps in the same structure, the **narrowest** range is kept (smallest spread between min and max position).

## playoffFinishingPositionRanges

The `getAvailablePlayoffProfiles` method (available on the [Query Governor](/docs/governors/query-governor#getavailableplayoffprofiles)) returns the available finishing positions for Round Robin playoff structures:

```js
const { playoffFinishingPositionRanges } = engine.getPlayoffFinishingPositionRanges({
  structureId,
  drawId,
});
// Returns:
// [
//   { finishingPosition: 1, finishingPositions: [1,2,3,4], finishingPositionRange: "1-4" },
//   { finishingPosition: 2, finishingPositions: [5,6,7,8], finishingPositionRange: "5-8" },
//   ...
// ]
```

These ranges define how group finishers map to overall draw finishing positions and are used when configuring [playoff structures](./draws-overview#round-robin-with-playoffs).

## Links Between Structures

Draw structures are connected via **links** that control participant flow. The `finishingPositions` field on link sources determines which participants advance:

```js
// Group winners advance to Gold bracket
{
  linkType: 'POSITION',
  source: { structureId: 'rr-group', finishingPositions: [1] },
  target: { structureId: 'gold-bracket', roundNumber: 1 }
}

// Group runners-up advance to Silver bracket
{
  linkType: 'POSITION',
  source: { structureId: 'rr-group', finishingPositions: [2] },
  target: { structureId: 'silver-bracket', roundNumber: 1 }
}
```

See [How Links Work](./draw-links) for full details on link types (WINNER, LOSER, POSITION).

## Related Documentation

- **[Ranking Points Pipeline](/docs/scale-engine/ranking-points-pipeline#position-points)** — How the accessor maps to policy points
- **[Ranking Policy](/docs/policies/rankingPolicy)** — Policy structure with `finishingPositionRanges` configuration
- **[Draw Types](./draw-types)** — Draw structures and links between them
- **[MatchUp Context](./matchup-context)** — How `finishingPositionRange` appears on matchUps
- **[Scale Engine Overview](/docs/scale-engine/scale-engine-overview)** — Full ranking points pipeline
- **[Report Governor](/docs/governors/report-governor)** — Draw reports include `finishingPositionRange`
