---
title: Lucky Draw
---

## Overview

A **Lucky Draw** is an elimination-style draw that supports any participant count, not just powers of 2. Unlike standard elimination draws that use byes to pad to a power-of-2 draw size, lucky draws create rounds with non-power-of-2 matchUp counts and use a "lucky loser" mechanism to balance rounds when an odd number of winners is produced.

In the factory, this draw type is represented by the constant `LUCKY_DRAW`.

:::info
When a lucky draw is generated with a power-of-2 participant count, it falls back to a standard elimination tree since no lucky loser mechanism is needed.
:::

## Structure

A lucky draw for 11 participants produces rounds with the following matchUp counts:

```text
Round 1: 6 matchUps (12 participants, but only 11 available -- 1 gets a bye equivalent)
Round 2: 3 matchUps
Round 3: 2 matchUps
Round 4: 1 matchUp (Final)
```

Key structural differences from standard elimination:

- **No connecting lines between rounds.** Unlike elimination draws where specific matchUp winners feed into specific next-round matchUps, lucky draws do not have fixed advancement paths between rounds.
- **Non-power-of-2 matchUp counts.** Rounds can have odd numbers of matchUps (e.g., 3, 5, 7).
- **Pre-feed rounds.** When a round has an odd number of matchUps, it produces an odd number of winners. This is one too many for a standard halving to work, so one loser from that round is selected to advance -- the "lucky loser."

## Pre-Feed Rounds and Lucky Loser Selection

A **pre-feed round** is a round with an odd number of matchUps (and thus an odd number of winners). After a pre-feed round completes, the next round needs one additional participant to fill its draw positions. That participant is selected from the losers of the pre-feed round.

### Selection Criteria

The lucky loser is selected based on **margin of defeat** -- the participant who lost by the narrowest margin has the highest priority for advancement. The system ranks eligible losers but does **not** auto-select; the tournament director makes the final selection.

Margin calculation uses the most granular available score data, prioritized as:

1. **Point ratio** -- from `side1PointScore`/`side2PointScore` (timed or points-based formats)
2. **Game ratio** -- from `side1Score`/`side2Score` (standard game-based sets)
3. **Set ratio** -- from set win counts (fallback when neither games nor points are available)

The margin value ranges from 0 to 1:

- Values approaching **1** indicate the most competitive match (narrowest loss).
- Values approaching **0** indicate a one-sided match.
- **NaN** is returned for walkovers and defaults, making those participants ineligible for lucky selection.

### Per-Round vs Cumulative Margin

By default, margin is calculated based only on the matchUp in which the participant lost. The `cumulativeMargin` option considers all prior rounds' matchUps for each participant, which can be useful in formats where consistency across rounds should factor into the selection.

The `getLuckyDrawRoundStatus` method accepts a `cumulativeMargin` boolean parameter to toggle between these modes.

## API

### Generating a Lucky Draw

```js
const { drawDefinition } = engine.generateDrawDefinition({
  drawSize: 11,
  drawType: 'LUCKY_DRAW',
});
```

### Checking Round Status

Use `getLuckyDrawRoundStatus` to determine which rounds need a lucky loser selection and to get the ranked list of eligible losers:

```js
const { rounds } = engine.getLuckyDrawRoundStatus({ drawId });
const preFeedRound = rounds.find((r) => r.needsLuckySelection);
// preFeedRound.eligibleLosers is sorted by margin (narrowest loss first)
```

The returned `rounds` array contains objects with the following properties:

| Property                   | Type      | Description                                                                                  |
| -------------------------- | --------- | -------------------------------------------------------------------------------------------- |
| `roundNumber`              | `number`  | The round number                                                                             |
| `matchUpsCount`            | `number`  | Total matchUps in this round                                                                 |
| `completedCount`           | `number`  | Number of completed matchUps                                                                 |
| `isComplete`               | `boolean` | Whether all matchUps in the round are complete                                               |
| `isPreFeedRound`           | `boolean` | Whether this round has an odd number of matchUps (not final round)                           |
| `needsLuckySelection`      | `boolean` | Whether this round is complete, is a pre-feed round, and the next round has an open position |
| `nextRoundHasOpenPosition` | `boolean` | Whether the subsequent round has an unfilled draw position                                   |
| `eligibleLosers`           | `array`   | Ranked list of losers (only present when `needsLuckySelection` is true)                      |

Each entry in `eligibleLosers` contains:

| Property           | Type     | Description                                                               |
| ------------------ | -------- | ------------------------------------------------------------------------- |
| `participantId`    | `string` | The losing participant's ID                                               |
| `participantName`  | `string` | The losing participant's name                                             |
| `matchUpId`        | `string` | The matchUp in which they lost                                            |
| `scoreString`      | `string` | The score of the matchUp                                                  |
| `margin`           | `number` | Margin of defeat (0-1, higher = closer match; NaN for walkovers/defaults) |
| `gameDifferential` | `number` | Difference in games won between winner and loser                          |
| `setsWonByLoser`   | `number` | Number of sets won by the losing participant                              |

### Advancing a Lucky Loser

After reviewing the eligible losers, advance the selected participant:

```js
engine.luckyDrawAdvancement({
  drawId,
  participantId: preFeedRound.eligibleLosers[0].participantId,
  roundNumber: preFeedRound.roundNumber,
});
```

The `luckyDrawAdvancement` method:

- Validates that the draw is a lucky draw.
- Verifies the specified round is a pre-feed round that needs selection.
- Confirms the participant is an eligible loser from that round.
- Places the participant into the open draw position in the next round.

An optional `selectionBasis` parameter (`'MARGIN'`, `'RANDOM'`, or `'MANUAL'`) can be provided for telemetry purposes.

### Calculating Match Margin

The `calculateMatchUpMargin` method returns detailed margin data for any matchUp:

```js
const {
  margin, // Unified 0-1 value (points > games > sets priority)
  pointRatio, // Loser points / total points (NaN if no point data)
  gameRatio, // Loser games / total games (NaN if no game data)
  setRatio, // Loser sets / total sets decided
  gameDifferential, // Winner games - loser games
  setsWonByLoser,
  setsWonByWinner,
} = engine.calculateMatchUpMargin({ matchUpId });
```

## Complete Workflow Example

```js
// 1. Generate a lucky draw for 11 participants
engine.generateDrawDefinition({
  drawSize: 11,
  drawType: 'LUCKY_DRAW',
  eventId,
  drawName: 'Main Draw',
});

// 2. After Round 1 completes (6 matchUps, odd count = pre-feed round),
//    check which round needs a lucky selection
const { rounds } = engine.getLuckyDrawRoundStatus({ drawId });
const preFeedRound = rounds.find((r) => r.needsLuckySelection);

if (preFeedRound) {
  console.log('Eligible losers (ranked by margin):');
  for (const loser of preFeedRound.eligibleLosers) {
    console.log(`  ${loser.participantName}: margin=${loser.margin}, score=${loser.scoreString}`);
  }

  // 3. Tournament director selects a lucky loser (here, the one with narrowest margin)
  const selected = preFeedRound.eligibleLosers[0];
  engine.luckyDrawAdvancement({
    drawId,
    participantId: selected.participantId,
    roundNumber: preFeedRound.roundNumber,
  });
}
```

## Related

- [Draw Types Overview](../draw-types) -- List of all pre-defined draw types
- [Single Elimination](./single-elimination) -- Standard power-of-2 knockout draw
- [Draw Links](../draw-links) -- How structures connect in multi-structure draws
- [Generation Governor](/docs/governors/generation-governor) -- API reference for `generateDrawDefinition`
