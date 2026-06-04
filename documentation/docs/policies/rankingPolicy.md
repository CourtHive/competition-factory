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
  doublesAttribution?: string;              // 'fullToEach' | 'splitEven' | 'teamOnly'
  requireWinForPoints?: boolean;            // Global: must win to earn position points
  requireWinFirstRound?: boolean;           // Global: R1 losers need a win for points
  pointsAuthority?: PointsAuthority;        // Issuing authority (ATP, WTA, ITF, …)
}
```

## Points Authority

`pointsAuthority` declares which body issues the points awarded under a policy.
Every `PointAward` emitted from the policy carries this value, so downstream
consumers — most importantly federated rank lists like Tennis Europe's, which
mix ATP + ITF + TE-internal points into one list — can scope and weight by
source without re-joining to policy metadata.

The vocabulary is a closed enum exported from `@Constants/pointsAuthorityConstants`:

```ts
import {
  ATP,
  WTA,
  ITF,
  ITF_JUNIOR,
  ITF_WHEELCHAIR,
  TENNIS_EUROPE,
  USTA,
  LTA,
  FFT,
  DTB,
  PPA,
  BWF,
  UTR,
  UNSPECIFIED,
  POINTS_AUTHORITIES,
  type PointsAuthority,
} from 'tods-competition-factory';
```

The field is **optional** — policies that don't declare it produce awards with
`pointsAuthority: undefined`, and downstream consumers (e.g. courthive-rankings)
default such rows to `'UNSPECIFIED'`. The published CourtHive fixtures declare:

| Policy                             | `pointsAuthority` |
| ---------------------------------- | ----------------- |
| `POLICY_RANKING_POINTS_ATP`        | `ATP`             |
| `POLICY_RANKING_POINTS_WTA`        | `WTA`             |
| `POLICY_RANKING_POINTS_ITF_WTT`    | `ITF`             |
| `POLICY_RANKING_POINTS_ITF_JUNIOR` | `ITF_JUNIOR`      |
| `POLICY_RANKING_POINTS_BASIC`      | _(unset)_         |

The vocabulary intentionally aligns with `TierClassification.system` so a
tournament's tier-system (`'ATP'`, `'ITF_JUNIOR'`, `'PPA'`, …) lines up with
the authority of the points it awards.

### Per-AwardProfile override

`AwardProfile.pointsAuthority` is the per-profile override that makes
federated rank lists possible. When set, it stamps every award the
profile matches with its own authority — overriding the policy-level
`pointsAuthority` for that profile only. Resolution rule at award time:

```ts
award.pointsAuthority = matchedProfile.pointsAuthority ?? policy.pointsAuthority;
```

The Tennis Europe production rank list aggregates points from three
issuing authorities into a single weekly list. With per-profile authority,
the entire list is one policy:

```ts
const POLICY_RANKING_POINTS_TE_HYBRID = {
  [POLICY_TYPE_RANKING_POINTS]: {
    policyName: 'Tennis Europe Hybrid 2026',
    pointsAuthority: TENNIS_EUROPE, // default for any profile
    awardProfiles: [
      {
        profileName: 'TE Circuit (16U/18U)',
        // matches TE-circuit events; no authority override → TENNIS_EUROPE
        finishingPositionRanges: {
          /* TE point values */
        },
      },
      {
        profileName: 'ITF Junior crossover',
        pointsAuthority: ITF_JUNIOR, // override for ITF events
        levels: [
          /* ITF Jr levels */
        ],
        finishingPositionRanges: {
          /* ITF point values */
        },
      },
      {
        profileName: 'ATP crossover',
        pointsAuthority: ATP, // override for ATP events
        levels: [
          /* ATP levels */
        ],
        finishingPositionRanges: {
          /* ATP point values */
        },
      },
    ],
  },
};
```

Every award emitted under this policy carries the issuing authority of
whichever profile matched its draw — so courthive-rankings can scope,
filter, and weight by source authority directly, without splitting the
rank list across three separate policies.

A working reference fixture lives at
[`src/tests/fixtures/policies/POLICY_RANKING_POINTS_HYBRID_EXAMPLE.ts`](https://github.com/CourtHive/competition-factory/blob/master/src/tests/fixtures/policies/POLICY_RANKING_POINTS_HYBRID_EXAMPLE.ts).
It models the three-bucket pattern observed in Tennis Europe's production
rank list (TE-circuit + ITF Junior crossover + ATP crossover). Point
values in that fixture are placeholders — copy the file, calibrate the
ranges against the actual federation rulebook, and adjust the scoping
(levels, drawSizes, eventTypes) to match the federation's event taxonomy.

The override applies to every award shape emitted from `getTournamentPoints`:
main awards, doubles-split individual awards (via spread), team
line-points awards, and quality-win bonus awards. Quality-win bonuses
inherit the matched profile's authority for the same draw (so a player
who won an ITF crossover event gets ITF-stamped quality wins, even
under a TE-Hybrid policy).

### Why a separate field from `policyName`?

`policyName` identifies a specific published rulebook
(`'PIF ATP Rankings 2026'`); `pointsAuthority` identifies the issuing body.
Two policies for ATP can coexist (e.g. a 2025 and 2026 version) but both
share `pointsAuthority: ATP`. Filtering by authority — "include every ATP
award in the rolling window, regardless of which annual policy was in effect"
— is impossible from `policyName` alone.

### Authority weighting at aggregation time

The authority weight a federated rank list applies (e.g. Tennis Europe weights
ITF at `1.0` and TENNIS_EUROPE at `1.0`, while a USTA-internal list might weight
external authorities at `0.5`) is **not** part of the policy. It belongs to the
consuming rank list and is applied at aggregation time, downstream of the
factory. See the [`courthive-rankings`](https://github.com/CourtHive/courthive-rankings)
`AggregateArgs.authorityWeights` and `AggregateArgs.authorityFilter` inputs.

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

Declares the **ranking entity** for doubles events — whether the pair
participant owns the award (and individual rankings ignore the doubles
result), or each individual owns the award (and the pair is bookkeeping
for who played together).

```js
{
  doublesAttribution: 'fullToEach';
} // each individual gets the full team value (ATP/WTA convention)
{
  doublesAttribution: 'splitEven';
} // each individual gets half the team value
{
  doublesAttribution: 'teamOnly';
} // the pair owns the award; individuals get nothing from doubles
```

When not specified, the behavior matches `'teamOnly'` — the pair record
holds the award and individuals are unaffected.

Concretely:

| Mode           | `personPoints`                         | `pairPoints`       |
| -------------- | -------------------------------------- | ------------------ |
| `'fullToEach'` | one entry per individual at full value | empty              |
| `'splitEven'`  | one entry per individual at half value | empty              |
| `'teamOnly'`   | empty                                  | one entry per pair |
| _(undefined)_  | empty                                  | one entry per pair |

The two halves of the output map (`personPoints`, `pairPoints`) are
mutually exclusive for any given doubles draw — exactly one of them
holds the award. This makes downstream aggregation (federated rank
lists, individual rankings, team-only ladders) a simple matter of
reading the right map without having to reconcile pair-vs-individual
attribution at consume time.

Every shipped pro-tennis policy (ATP, WTA, ITF Junior, ITF WTT, BASIC)
declares `'fullToEach'` — the dominant convention across pro and amateur
tennis is that each doubles partner's individual ranking gets the full
team result. `'splitEven'` is supported for federations that treat the
team's tournament outcome as a single pot shared between partners.
`'teamOnly'` (and the legacy default) is for club / pair-tour formats
where the pair is itself the ranking entity (recurring partnerships,
team ladders, etc.).

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
| ITF Junior  | 1 = Grand Slam, 2 = J500, 5 = J100, 9 = J30               |
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
  POLICY_RANKING_POINTS_ITF_JUNIOR,
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

| Fixture                            | Levels                    | Period   | Best-of                  | Notes                                                   |
| ---------------------------------- | ------------------------- | -------- | ------------------------ | ------------------------------------------------------- |
| `POLICY_RANKING_POINTS_BASIC`      | None (level-independent)  | —        | —                        | Simple position-based points, no level required         |
| `POLICY_RANKING_POINTS_ATP`        | 15 (Grand Slam → ITF M15) | 52 weeks | Singles: 19, Doubles: 18 | Mandatory counting rules, qualifying points             |
| `POLICY_RANKING_POINTS_WTA`        | 11 (Grand Slam → ITF W15) | 52 weeks | Singles: 18, Doubles: 12 | Draw size threshold arrays                              |
| `POLICY_RANKING_POINTS_ITF_WTT`    | 4 ($25K+H → $15K)         | 52 weeks | 14                       | Qualifying-only system (post-2020, no main draw points) |
| `POLICY_RANKING_POINTS_ITF_JUNIOR` | 9 (Grand Slam → J30)      | —        | —                        | ITF Junior Circuit with qualifying and consolation      |

These fixtures can be used as-is for preview/backoffice ranking point calculations, or as starting points for custom policies.

### Federation policies served via CFS

As of factory 4.0.0, federation-specific ranking policies (USTA Junior 2025/2026, Tennis Europe, LTA, Tennis Canada, Tennis Australia, ČTS) are no longer bundled. They live in CFS-served storage and reach the embedded factory engine via the [`policyRegistry`](/docs/concepts/policies#registry-served-query-time) at runtime:

```js
import { policyRegistry, scaleEngine } from 'tods-competition-factory';

// Consumer (CFS, courthive-rankings, etc.) registers at boot, usually
// from a GET /policies/catalog response:
policyRegistry.register({
  policyType: 'rankingPoints',
  name: 'USTA_JUNIOR_2026',
  version: '2026.01',
  definition: /* fetched from CFS */,
});

// Engine resolves by name when policyDefinitions isn't passed:
scaleEngine.getTournamentPoints({
  tournamentRecord,
  policyName: 'USTA_JUNIOR_2026',
  level: 1,
});
```

See [POLICY_DELIVERY](https://github.com/CourtHive/Mentat/blob/main/planning/POLICY_DELIVERY.md) in the orchestration repo for the full architecture and the per-consumer migration paths (TMX, courthive-rankings, courthive-ingest).

## Related Documentation

- **[Scale Engine Overview](/docs/scale-engine/scale-engine-overview)** — Engine that processes ranking policies
- **[Ranking Points Pipeline](/docs/scale-engine/ranking-points-pipeline)** — How profiles are selected and points computed
- **[Quality Win Points](/docs/scale-engine/quality-win-points)** — Quality win bonus system
- **[Multi-Tournament Aggregation](/docs/scale-engine/aggregation)** — Counting buckets, rolling windows, tiebreakers
- **[Ranking Governor](/docs/governors/ranking-governor)** — Governor method reference
- **[Scale Items](/docs/concepts/scaleItems)** — How points are stored on participants
- **[Policies Overview](/docs/concepts/policies)** — How policies work in the factory
