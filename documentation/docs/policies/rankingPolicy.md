---
title: Ranking Policy
---

A **Ranking Policy** defines how points are awarded to participants for their tournament performance. It is attached to a tournament or event using the standard [policy system](/docs/concepts/policies) under the key `POLICY_TYPE_RANKING_POINTS`.

```js
import { POLICY_TYPE_RANKING_POINTS } from 'tods-competition-factory';

const policyDefinitions = {
  [POLICY_TYPE_RANKING_POINTS]: {
    awardProfiles: [...],
    qualityWinProfiles: [...],
    doublesAttribution: 'fullToEach',
    requireWinForPoints: false,
    requireWinFirstRound: true,
  },
};

// Attach to tournament
tournamentEngine.attachPolicies({ policyDefinitions });

// Or pass directly
scaleEngine.getTournamentPoints({ policyDefinitions, level: 3 });
```

## Policy Structure

```ts
{
  awardProfiles: AwardProfile[];           // How points are awarded per draw/event
  qualityWinProfiles?: QualityWinProfile[]; // Bonus for beating ranked opponents
  doublesAttribution?: string;              // 'fullToEach' | 'splitEven'
  requireWinForPoints?: boolean;            // Global: must win to earn position points
  requireWinFirstRound?: boolean;           // Global: R1 losers need a win for points
}
```

## Award Profiles

Each `awardProfile` defines point values for a specific scope (draw type, level, category, etc.). When computing points, the [Scale Engine](/docs/scale-engine/scale-engine-overview) selects the best-matching profile using [specificity scoring](/docs/scale-engine/ranking-points-pipeline#profile-selection).

### Minimal Profile

```js
awardProfiles: [
  {
    finishingPositionRanges: {
      1: { value: 100 },
      2: { value: 75 },
      4: { value: 50 },
      8: { value: 25 },
    },
  },
];
```

### Full Profile

```js
{
  // Identity
  profileName: 'Elimination L1-3',     // For debugging/audit (shown in devContext)

  // Scope — determines when this profile applies
  eventTypes: ['SINGLES'],              // SINGLES, DOUBLES, TEAM
  drawTypes: ['SINGLE_ELIMINATION', 'FEED_IN_CHAMPIONSHIP'],
  drawSizes: [32, 64],                 // exact draw sizes
  maxDrawSize: 128,                    // or a maximum
  levels: [1, 2, 3],                   // tournament levels
  maxLevel: 5,                         // or a maximum
  stages: ['MAIN'],                    // MAIN, QUALIFYING, CONSOLATION
  flights: [1],                        // flight numbers
  maxFlightNumber: 2,                  // or a maximum
  dateRanges: [{ startDate: '2025-01-01', endDate: '2025-12-31' }],
  participationOrder: 1,               // 1 = first structure entry

  // Category scope
  category: {
    ageCategoryCodes: ['U18'],
    genders: ['MALE'],
    categoryNames: ['Junior'],
    categoryTypes: ['AGE'],
    ratingTypes: ['WTN'],
    ballTypes: ['GREEN'],
    wheelchairClasses: ['QUAD'],
    subTypes: ['ADVANCED'],
  },

  // Priority override (bypasses specificity scoring)
  priority: 10,

  // Position points (key = Math.max(finishingPositionRange), see Finishing Positions concept)
  finishingPositionRanges: {
    1: { level: { 1: 3000, 2: 1650, 3: 990 } },
    2: { level: { 1: 2400, 2: 1320, 3: 792 } },
    4: { level: { 1: 1800, 2: 990, 3: 594 } },
    8: { level: { 1: 1200, 2: 660, 3: 396 } },
    16: { level: { 1: 600, 2: 330, 3: 198 } },
    32: { level: { 1: 300, 2: 165, 3: 99 } },
  },

  // Per-win points
  perWinPoints: {
    level: { 1: 300, 2: 225, 3: 150 },
  },
  // or flat:
  pointsPerWin: 60,

  // Max countable matches (per participant per draw)
  maxCountableMatches: 5,
  // or level-keyed:
  // maxCountableMatches: { level: { 3: 5, 4: 4 } },

  // Bonus points (champion/finalist)
  bonusPoints: [
    { finishingPositions: [1], value: { level: { 6: 50, 7: 25 } } },
    { finishingPositions: [2], value: { level: { 6: 30, 7: 15 } } },
  ],

  // Win requirements
  requireWinForPoints: false,
  requireWinFirstRound: true,
}
```

## Position Value Resolution

The keys in `finishingPositionRanges` are [accessors](/docs/concepts/finishing-positions#accessor) — each key equals `Math.max(finishingPositionRange)` for the corresponding draw round. See [Finishing Positions](/docs/concepts/finishing-positions) for how these values are computed from draw structures.

Values in `finishingPositionRanges` can be expressed in several forms:

### Simple Value

```js
{ 1: { value: 1000 } }
// or just a number:
{ 1: 1000 }
```

### Position Level-Keyed

```js
{ 1: { level: { 1: 3000, 2: 1650, 3: 990 } } }
```

The `level` parameter passed to `getTournamentPoints` selects the value.

### Draw Size Threshold

```js
{ 1: [
  { threshold: 16, value: 500 },
  { threshold: 32, value: 800 },
  { threshold: 64, value: 1000 },
] }
```

The highest threshold `<= drawSize` is used.

### Flight-Specific

```js
{ 1: { flights: { 1: 1000, 2: 500 } } }
```

### Won/Lost Accessors

```js
{ 4: { won: 400, lost: 200 } }
```

Points differ based on whether the participant won a match at that finishing position (useful for consolation draws).

## Per-Win Points

Per-win points are awarded for each match won, typically as an alternative to position points (when no `finishingPositionRanges` key matches the accessor).

### Flat Value

```js
{
  pointsPerWin: 60;
}
```

### Per-Win Level-Keyed

```js
{
  perWinPoints: {
    level: { 1: 300, 2: 225, 3: 150 }
  }
}
```

### With Participation Order

```js
{
  perWinPoints: [
    { participationOrders: [1], level: { 1: 300, 2: 225 } }, // main draw
    { participationOrders: [2], level: { 1: 100, 2: 75 } }, // consolation
  ];
}
```

### Team Line Points

For team events, per-win values can vary by line position:

```js
{
  perWinPoints: {
    level: {
      1: { line: [300, 275, 250, 225, 200, 175], limit: 6 }
    }
  }
}
```

The `line` array is indexed by `collectionPosition - 1`. The `limit` property means only the first N lines earn points.

## Quality Win Profiles

Quality win profiles define bonus points for defeating ranked opponents:

```js
qualityWinProfiles: [
  {
    rankingScaleName: 'NATIONAL_RANKING',
    rankingSnapshot: 'tournamentStart',
    unrankedOpponentBehavior: 'noBonus',
    includeWalkovers: false,
    maxBonusPerTournament: 500,
    rankingRanges: [
      { rankRange: [1, 10], value: 225 },
      { rankRange: [11, 25], value: 203 },
      { rankRange: [26, 50], value: 169 },
    ],
  },
];
```

See [Quality Win Points](/docs/scale-engine/quality-win-points) for detailed documentation.

## Doubles Attribution

Controls how pair points flow to individual participant records:

```js
{
  doublesAttribution: 'fullToEach';
} // each individual gets 100%
{
  doublesAttribution: 'splitEven';
} // each individual gets 50%
```

When not specified, points remain only on the pair record.

## Specificity Scoring

When multiple profiles match a participation, the one with the most populated scope fields wins. For example:

```js
awardProfiles: [
  // Score 0: no scope constraints (catch-all)
  { finishingPositionRanges: { 1: { value: 100 } } },

  // Score 3: drawTypes + levels + maxDrawSize
  { drawTypes: ['ROUND_ROBIN'], levels: [3, 4, 5], maxDrawSize: 16, perWinPoints: { level: { 3: 225 } } },
];
```

The Round Robin profile (score 3) wins over the catch-all (score 0) for RR draws at levels 3-5.

To force a specific profile regardless of scoring, use `priority`:

```js
{ priority: 10, drawTypes: ['ROUND_ROBIN'], ... }
```

See [Profile Selection](/docs/scale-engine/ranking-points-pipeline#profile-selection) for the complete scoring rules.

## Complete Examples

### Simple Club Ranking

```js
const clubPolicy = {
  [POLICY_TYPE_RANKING_POINTS]: {
    awardProfiles: [
      {
        finishingPositionRanges: {
          1: { value: 100 },
          2: { value: 75 },
          4: { value: 50 },
          8: { value: 25 },
        },
        pointsPerWin: 10,
      },
    ],
  },
};
```

### USTA-Style Multi-Profile

```js
const ustaPolicy = {
  [POLICY_TYPE_RANKING_POINTS]: {
    requireWinFirstRound: true,
    doublesAttribution: 'fullToEach',
    awardProfiles: [
      // Elimination draws L1-3
      {
        profileName: 'Elimination L1-3',
        drawTypes: ['SINGLE_ELIMINATION', 'FEED_IN_CHAMPIONSHIP', 'COMPASS'],
        levels: [1, 2, 3],
        finishingPositionRanges: {
          1: { level: { 1: 3000, 2: 1650, 3: 990 } },
          2: { level: { 1: 2400, 2: 1320, 3: 792 } },
          4: { level: { 1: 1800, 2: 990, 3: 594 } },
          8: { level: { 1: 1200, 2: 660, 3: 396 } },
          16: { level: { 1: 600, 2: 330, 3: 198 } },
          32: { level: { 1: 300, 2: 165, 3: 99 } },
        },
      },
      // Round Robin L3-5 (per-win only)
      {
        profileName: 'Round Robin L3-5',
        drawTypes: ['ROUND_ROBIN'],
        levels: [3, 4, 5],
        maxCountableMatches: 5,
        perWinPoints: { level: { 3: 225, 4: 150, 5: 75 } },
      },
    ],
    qualityWinProfiles: [
      {
        rankingScaleName: 'USTA_JUNIOR',
        rankingSnapshot: 'tournamentStart',
        unrankedOpponentBehavior: 'noBonus',
        rankingRanges: [
          { rankRange: [1, 10], value: 225 },
          { rankRange: [11, 25], value: 203 },
          { rankRange: [26, 50], value: 169 },
          { rankRange: [51, 100], value: 101 },
        ],
      },
    ],
  },
};
```

### FIC Draw Policy

Feed-in consolation draws produce distinct accessor values. Map all possible positions:

```js
{
  drawTypes: ['FEED_IN_CHAMPIONSHIP'],
  finishingPositionRanges: {
    1: { value: 1000 },
    2: { value: 700 },
    3: { value: 500 },  // consolation champion
    4: { value: 400 },
    6: { value: 300 },
    8: { value: 200 },
    12: { value: 150 },
    16: { value: 100 },
    24: { value: 75 },
    32: { value: 50 },
  },
}
```

:::tip
For a 32-draw FIC, the possible accessor values are `1, 2, 3, 4, 6, 8, 12, 16, 24, 32`. Participants automatically receive the best position across main and consolation structures.
:::

## Aggregation Rules

When using [generateRankingList](/docs/scale-engine/aggregation) across multiple tournaments, define aggregation behavior:

```js
aggregationRules: {
  countingBuckets: [
    { bucketName: 'Singles', eventTypes: ['SINGLES'],
      pointComponents: ['positionPoints', 'perWinPoints', 'bonusPoints'],
      bestOfCount: 6 },
    { bucketName: 'Doubles', eventTypes: ['DOUBLES'],
      pointComponents: ['positionPoints', 'perWinPoints', 'bonusPoints'],
      bestOfCount: 2 },
    { bucketName: 'Quality Wins',
      pointComponents: ['qualityWinPoints'],
      bestOfCount: 0 },
  ],
  rollingPeriodDays: 365,
  minCountableResults: 3,
  tiebreakCriteria: ['highestSingleResult', 'mostWins'],
}
```

See [Multi-Tournament Aggregation](/docs/scale-engine/aggregation) for detailed documentation.

## Qualifying Profiles

Qualifying stages use a normalized position convention that differs from main draw positions. See [Qualifying Position Normalization](/docs/scale-engine/ranking-points-pipeline#qualifying-position-normalization) for how the pipeline transforms raw qualifying positions.

When writing qualifying profiles, use the `stages: ['QUALIFYING']` scope and define `finishingPositionRanges` with normalized keys:

```js
{
  profileName: 'Qualifying Singles',
  stages: ['QUALIFYING'],
  eventTypes: ['SINGLES'],
  levels: [1, 2, 3, 4],
  finishingPositionRanges: {
    1: { level: { 1: 4, 2: 3, 3: 3, 4: 2 } },  // Qualifier (won through)
    2: 1,                                          // Final round loser
  },
}
```

:::info
Qualifying profiles only produce points when the tournament has a qualifying draw structure. A main-draw-only tournament (even with a level set) will produce zero qualifying awards. This is expected behavior — see the ITF WTT policy for an example of a qualifying-only ranking system.
:::

## Tournament Level

The `level` parameter is a numeric tier (1, 2, 3, ...) that selects point values from level-keyed profiles. Higher-tier tournaments (lower level numbers) typically award more points.

Level is **not** the same as `tournamentLevel` in the TODS schema (which describes geographic scope: CLUB, NATIONAL, INTERNATIONAL, etc.). The ranking policy `level` is a tier within a specific ranking system:

| System      | Level examples                                            |
| ----------- | --------------------------------------------------------- |
| ATP         | 1 = Grand Slam, 2 = ATP Finals, 8 = ATP 250, 15 = ITF M15 |
| WTA         | 1 = Grand Slam, 2 = WTA Finals, 5 = WTA 250, 11 = ITF W15 |
| ITF WTT     | 1 = $25K+H, 2 = $25K, 3 = $15K+H, 4 = $15K                |
| USTA Junior | 1 = National Championships, 7 = Intermediate              |

Policies that require a level will produce **no awards** when called without one (all profiles specify `levels` or `maxLevel`, so no profile matches). The Basic policy has no level-keyed values and produces points regardless of whether a level is passed.

## Built-in Policy Fixtures

The factory ships with five ranking policy fixtures covering major professional, junior, and basic systems. Import them from `fixtures.policies`:

```js
import { fixtures } from 'tods-competition-factory';

const {
  POLICY_RANKING_POINTS_BASIC,
  POLICY_RANKING_POINTS_ATP,
  POLICY_RANKING_POINTS_WTA,
  POLICY_RANKING_POINTS_ITF_WTT,
  POLICY_RANKING_POINTS_USTA_JUNIOR,
} = fixtures.policies;

// Basic policy — no level needed
const basic = scaleEngine.getEventRankingPoints({
  policyDefinitions: POLICY_RANKING_POINTS_BASIC,
  eventId: 'event-abc',
});

// Level-requiring policies
const atp = scaleEngine.getEventRankingPoints({
  policyDefinitions: POLICY_RANKING_POINTS_ATP,
  eventId: 'event-abc',
  level: 1,
});
```

| Fixture                             | Levels                       | Period   | Best-of                  | Notes                                                   |
| ----------------------------------- | ---------------------------- | -------- | ------------------------ | ------------------------------------------------------- |
| `POLICY_RANKING_POINTS_BASIC`       | None (level-independent)     | —        | —                        | Simple position-based points, no level required         |
| `POLICY_RANKING_POINTS_ATP`         | 15 (Grand Slam → ITF M15)    | 52 weeks | Singles: 19, Doubles: 18 | Mandatory counting rules, qualifying points             |
| `POLICY_RANKING_POINTS_WTA`         | 11 (Grand Slam → ITF W15)    | 52 weeks | Singles: 18, Doubles: 12 | Draw size threshold arrays                              |
| `POLICY_RANKING_POINTS_ITF_WTT`     | 4 ($25K+H → $15K)            | 52 weeks | 14                       | Qualifying-only system (post-2020, no main draw points) |
| `POLICY_RANKING_POINTS_USTA_JUNIOR` | 7 (Nationals → Intermediate) | —        | —                        | 8 age categories, per-win with maxCountableMatches      |

These fixtures can be used as-is for preview/backoffice ranking point calculations, or as starting points for custom policies.

## Related Documentation

- **[Scale Engine Overview](/docs/scale-engine/scale-engine-overview)** — Engine that processes ranking policies
- **[Ranking Points Pipeline](/docs/scale-engine/ranking-points-pipeline)** — How profiles are selected and points computed
- **[Quality Win Points](/docs/scale-engine/quality-win-points)** — Quality win bonus system
- **[Multi-Tournament Aggregation](/docs/scale-engine/aggregation)** — Counting buckets, rolling windows, tiebreakers
- **[Ranking Governor](/docs/governors/ranking-governor)** — Governor method reference
- **[Scale Items](/docs/concepts/scaleItems)** — How points are stored on participants
- **[Policies Overview](/docs/concepts/policies)** — How policies work in the factory
