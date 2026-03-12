---
title: Scale Engine Overview
---

The **ScaleEngine** is a stateful engine for computing, persisting, and aggregating ranking points and ratings across tournaments. It combines the [Ranking Governor](/docs/governors/ranking-governor) (ranking points computation, aggregation, and write-back) with ratings functions (dynamic ratings, rating calculations) into a single engine that manages all participant competitive metrics.

## When to Use ScaleEngine vs rankingGovernor

| Use Case                                                   | Recommended         |
| ---------------------------------------------------------- | ------------------- |
| Compute ranking points for a tournament                    | **ScaleEngine**     |
| Persist ranking points to participant records              | **ScaleEngine**     |
| Generate multi-tournament ranking lists                    | **ScaleEngine**     |
| Get per-participant point breakdowns                       | **ScaleEngine**     |
| Compute quality win bonuses                                | **ScaleEngine**     |
| Generate dynamic ratings                                   | **ScaleEngine**     |
| Stateless point computation with explicit tournamentRecord | **rankingGovernor** |
| Custom pipeline orchestration                              | **rankingGovernor** |
| Profile selection without full tournament context          | **rankingGovernor** |

## Key Capabilities

- **Policy-driven point calculation** — [Ranking policies](/docs/policies/rankingPolicy) define position points, per-win points, bonuses, and quality win profiles
- **Specificity scoring** — Award profiles are selected by counting populated scope fields; more constrained profiles automatically win over catch-all profiles
- **CategoryScope matching** — Profiles match against gender, age category, ball type, wheelchair class, rating type, and more
- **Quality win bonuses** — Bonus points for defeating ranked opponents, with configurable ranking snapshot strategies
- **Multi-tournament aggregation** — Best-of-N counting buckets, rolling time windows, per-level caps, and tiebreakers
- **Write-back mutation** — Persist computed points as [scale items](/docs/concepts/scaleItems) retrievable for future tournaments
- **Doubles attribution** — Full-to-each or split-even point distribution from pair to individual participants
- **FIC/multi-structure support** — Feed-in consolation draws produce distinct finishing positions; participants get their best finish across structures
- **Dynamic ratings** — Generate and update participant ratings based on match outcomes

## Basic Usage

```js
import { scaleEngine } from 'tods-competition-factory';

// Load a tournament with completed matchUps
scaleEngine.setState(tournamentRecord);

// Compute ranking points using a policy
const { personPoints, success } = scaleEngine.getTournamentPoints({
  policyDefinitions: rankingPolicy,
  level: 3,
});

// Persist points to participant scaleItems
const result = scaleEngine.applyTournamentRankingPoints({
  policyDefinitions: rankingPolicy,
  scaleName: 'NATIONAL_RANKING',
  level: 3,
});

// Aggregate across multiple tournaments
import { generateRankingList } from 'tods-competition-factory';

const rankingList = generateRankingList({
  pointAwards: allTournamentAwards, // collected from multiple tournaments
  aggregationRules: {
    countingBuckets: [
      {
        bucketName: 'Singles',
        eventTypes: ['SINGLES'],
        pointComponents: ['positionPoints', 'perWinPoints'],
        bestOfCount: 6,
      },
      {
        bucketName: 'Doubles',
        eventTypes: ['DOUBLES'],
        pointComponents: ['positionPoints', 'perWinPoints'],
        bestOfCount: 2,
      },
      { bucketName: 'Quality Wins', pointComponents: ['qualityWinPoints'], bestOfCount: 0 },
    ],
    rollingPeriodDays: 365,
    tiebreakCriteria: ['highestSingleResult', 'mostWins'],
  },
  asOfDate: '2025-12-31',
});
```

## Architecture

The ScaleEngine follows the Competition Factory pattern where **governors** provide pure functions and **engines** provide stateful facades:

```text
+------------------------------+
|         ScaleEngine           |  Stateful facade (setState, methods)
|  (rankings + ratings)         |
+---------------+--------------+
|               |              |
| rankingGovernor  ratingsGovernor |  Pure function modules
|  (points, QW,    (dynamic     |
|   aggregation,    ratings,    |
|   write-back)     calculations)|
+---------------+--------------+
|    CODES Tournament Record    |  Standard data model
|   (participants, scaleItems,  |
|    matchUps, policies)        |
+------------------------------+
```

The engine holds tournament state via `setState()`. All ranking methods access participant data, match results, and finishing positions through the factory's `getParticipants({ withRankingProfile: true })` pipeline.

## Ranking Points Pipeline

The core pipeline for computing tournament ranking points:

1. **Policy resolution** — Find attached or provided [ranking policy](/docs/policies/rankingPolicy)
2. **Participant hydration** — `getParticipants({ withRankingProfile: true })` provides `structureParticipation` with [`finishingPositionRange`](/docs/concepts/finishing-positions), `winCount`, draw metadata
3. **Profile selection** — [getAwardProfile](/docs/scale-engine/ranking-points-pipeline#profile-selection) matches each participation against `awardProfiles` using specificity scoring
4. **Position points** — `finishingPositionRanges[accessor]` resolved via [`Math.max(finishingPositionRange)`](/docs/concepts/finishing-positions#accessor)
5. **Per-win points** — Accumulated from `pointsPerWin` or level-keyed `perWinPoints`, subject to `maxCountableMatches`
6. **Bonus points** — Champion/finalist bonus from `bonusPoints` config
7. **Quality win points** — Bonus for beating ranked opponents (see [Quality Win Points](/docs/scale-engine/quality-win-points))
8. **Doubles attribution** — Pair points distributed to individuals

See [Ranking Points Pipeline](/docs/scale-engine/ranking-points-pipeline) for detailed documentation.

## Related Documentation

- **[Core API Reference](./scale-engine-api)** — Complete method reference
- **[Ranking Points Pipeline](./ranking-points-pipeline)** — Profile selection, position points, per-win, bonuses
- **[Quality Win Points](./quality-win-points)** — Quality win bonus system
- **[Multi-Tournament Aggregation](./aggregation)** — Counting buckets, rolling windows, tiebreakers
- **[Ranking Policy](/docs/policies/rankingPolicy)** — Policy structure reference
- **[Ranking Governor](/docs/governors/ranking-governor)** — Stateless ranking functions
- **[Scale Items](/docs/concepts/scaleItems)** — Rankings, ratings, and seedings storage
