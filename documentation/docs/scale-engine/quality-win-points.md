---
title: Quality Win Points
---

Quality win points are bonus points awarded for defeating ranked opponents. They are computed after position and per-win points, per participant, per draw.

## How It Works

1. For each participant, identify their won matchUps in the draw
2. For each won matchUp, find the opponent
3. Look up the opponent's ranking from their [scale items](/docs/concepts/scaleItems) (time items with `SCALE.RANKING.{eventType}.{scaleName}`)
4. If the opponent is ranked and falls within a `rankingRange`, award the corresponding bonus points
5. Sum all quality win bonuses, subject to `maxBonusPerTournament` cap

## Quality Win Profile

Quality win behavior is defined in the `qualityWinProfiles` array of a [ranking policy](/docs/policies/rankingPolicy):

```js
qualityWinProfiles: [
  {
    rankingScaleName: 'USTA_JUNIOR',      // which ranking to look up
    rankingSnapshot: 'tournamentStart',    // when to snapshot the ranking
    unrankedOpponentBehavior: 'noBonus',   // what to do if opponent has no ranking
    includeWalkovers: false,               // count walkovers as quality wins?
    maxBonusPerTournament: 500,            // cap total quality win bonus per tournament

    rankingRanges: [
      { rankRange: [1, 10], value: 225 },
      { rankRange: [11, 25], value: 203 },
      { rankRange: [26, 50], value: 169 },
      { rankRange: [51, 75], value: 135 },
      { rankRange: [76, 100], value: 101 },
      { rankRange: [101, 150], value: 68 },
      { rankRange: [151, 250], value: 45 },
      { rankRange: [251, 350], value: 23 },
      { rankRange: [351, 500], value: 11 },
    ],
  },
],
```

## Ranking Snapshot Strategies

The `rankingSnapshot` field controls which point-in-time ranking value is used for the opponent:

| Strategy            | Behavior                                                              |
| ------------------- | --------------------------------------------------------------------- |
| `'tournamentStart'` | Most recent scale item with `scaleDate <= tournamentRecord.startDate` |
| `'latestAvailable'` | Most recent scale item regardless of date                             |
| `'matchDate'`       | Most recent scale item with `scaleDate <= matchUp.endDate`            |

:::tip
Use `'tournamentStart'` (the default) for consistency — all opponents are evaluated against the rankings published before the tournament began. This prevents a player from earning quality win points based on rankings that changed mid-tournament.
:::

## Ranking Source

Opponent rankings are read from participant [scale items](/docs/concepts/scaleItems), which are stored as time items on participant records. Rankings are typically:

- **Imported** by the organizer when setting up a tournament (from the ranking authority)
- **Written** by a prior call to [applyTournamentRankingPoints](/docs/scale-engine/scale-engine-api#applytournamentrankingpoints)

The `rankingScaleName` in the quality win profile must match the `scaleName` used when the ranking was stored.

## Unranked Opponents

When an opponent has no ranking for the specified `rankingScaleName`:

| Setting            | Behavior                                                                    |
| ------------------ | --------------------------------------------------------------------------- |
| `'noBonus'`        | No quality win points awarded (default)                                     |
| `'useDefaultRank'` | Use `defaultRank` value from the profile, then match against ranking ranges |

## Walkovers and Defaults

By default, walkovers (`WALKOVER`) and defaults (`DEFAULTED`) are excluded from quality win calculation. Set `includeWalkovers: true` to count them.

## Quality Win Output

Quality win awards are stored separately in `personPoints`:

```js
{
  qualityWinPoints: 394,     // total quality win bonus for this draw
  qualityWins: [
    {
      matchUpId: 'mu-123',
      opponentParticipantId: 'opp-456',
      opponentRank: 15,
      points: 203,
    },
    {
      matchUpId: 'mu-789',
      opponentParticipantId: 'opp-012',
      opponentRank: 42,
      points: 169,
    },
    // ...additional entries capped at maxBonusPerTournament
  ],
  eventType: 'SINGLES',
  drawId: 'draw-abc',
}
```

## Integration with Aggregation

Quality win points flow into [multi-tournament aggregation](/docs/scale-engine/aggregation) through the `pointComponents` field on counting buckets:

```js
countingBuckets: [
  // Quality wins typically have their own bucket with no bestOfCount cap
  {
    bucketName: 'Quality Wins',
    pointComponents: ['qualityWinPoints'],
    bestOfCount: 0, // count all quality wins
  },
],
```

## Related Documentation

- **[Scale Engine Overview](./scale-engine-overview.md)** — Introduction and architecture
- **[Core API Reference](./scale-engine-api.md)** — Complete method reference
- **[Ranking Points Pipeline](./ranking-points-pipeline.md)** — How position and per-win points work
- **[Multi-Tournament Aggregation](./aggregation.md)** — Counting buckets and ranking lists
- **[Ranking Policy](/docs/policies/rankingPolicy)** — Full policy structure
- **[Scale Items](/docs/concepts/scaleItems)** — How rankings are stored
