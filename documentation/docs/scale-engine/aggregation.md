---
title: Multi-Tournament Aggregation
---

The aggregation layer combines point awards from multiple tournaments into ranking lists. It operates as pure computation — no tournament state is accessed. The consumer is responsible for collecting `PointAward[]` from multiple `getTournamentPoints` calls and passing them to `generateRankingList`.

## Aggregation Pipeline

```text
  PointAward[] (from multiple tournaments)
       |
  1. Category Filter     ageCategoryCodes, genders, eventTypes
       |
  2. Rolling Period       Exclude awards older than rollingPeriodDays
       |
  3. Group by Person      Collect all awards per personId
       |
  4. Bucket Processing    Per counting bucket:
       |                    - Filter by eventTypes + pointComponents
       +-> Sort descending  - Sort by computed value
       +-> Level cap        - Apply maxResultsPerLevel
       +-> Mandatory select - Apply mandatoryRules (if any)
       +-> Best-of-N        - Fill remaining slots via bestOfCount
       +-> Sum              - Bucket total
       |
  5. Total Points         Sum across all buckets
       |
  6. Minimum Check        meetsMinimum if countingResults >= minCountableResults
       |
  7. Sort + Tiebreak      Sort descending, apply tiebreakCriteria
       |
  8. Assign Ranks         1-based, tied ranks for equal positions
       |
       v
  RankingListEntry[]
```

## Typical Pipeline

```js
import { generateRankingList } from 'tods-competition-factory';

// Step 1: Collect awards from multiple tournaments
const allAwards = [];

for (const tournamentRecord of seasonTournaments) {
  scaleEngine.setState(tournamentRecord);
  const { personPoints } = scaleEngine.getTournamentPoints({
    policyDefinitions: rankingPolicy,
    level: tournamentRecord.level,
  });

  for (const [personId, awards] of Object.entries(personPoints)) {
    allAwards.push(...awards.map((a) => ({ ...a, personId })));
  }
}

// Step 2: Generate ranking list
const rankingList = generateRankingList({
  pointAwards: allAwards,
  aggregationRules,
  asOfDate: '2025-12-31',
});
```

## Counting Buckets

Counting buckets define how awards are grouped and counted. Each bucket filters awards by `eventTypes` and extracts point values from `pointComponents`:

Valid `pointComponents` are `positionPoints`, `perWinPoints`, `bonusPoints`,
`qualityWinPoints`, and `points`. The last is the award's own pre-summed total rather
than a fifth granular component — it is what a bucket sums when the policy names no
`pointComponents` at all (the default is `['points', 'qualityWinPoints']`). That pair
does not double-count, because a quality-win bonus is emitted as its **own** award
carrying `qualityWinPoints` and no `points`. Do not mix `'points'` with the granular
components in one bucket, though: there it would count the same award's total twice.

```js
aggregationRules: {
  countingBuckets: [
    {
      bucketName: 'Singles',
      eventTypes: ['SINGLES'],
      pointComponents: ['positionPoints', 'perWinPoints', 'bonusPoints'],
      bestOfCount: 6,                    // best 6 results count
      maxResultsPerLevel: { 7: 2 },     // max 2 level-7 results
    },
    {
      bucketName: 'Doubles',
      eventTypes: ['DOUBLES'],
      pointComponents: ['positionPoints', 'perWinPoints', 'bonusPoints'],
      bestOfCount: 2,                    // best 2 results count
    },
    {
      bucketName: 'Quality Wins',
      pointComponents: ['qualityWinPoints'],
      bestOfCount: 0,                    // 0 = count ALL (no limit)
    },
  ],
}
```

### Point Components

The `pointComponents` array specifies which fields on each award to sum for the bucket value:

| Component            | Source                                     |
| -------------------- | ------------------------------------------ |
| `'positionPoints'`   | Finishing position points                  |
| `'perWinPoints'`     | Per-win points                             |
| `'bonusPoints'`      | Champion/finalist bonus                    |
| `'qualityWinPoints'` | Quality win bonus                          |
| `'linePoints'`       | Team line position points                  |
| `'points'`           | Combined total (position + perWin + bonus) |

### bestOfCount

- `0` — Count all results (no limit)
- `N > 0` — Count only the best N results; remaining are dropped

### maxResultsPerLevel

Limits how many results from a specific tournament level count toward the bucket:

```js
maxResultsPerLevel: { 7: 2, 6: 3 }
// At most 2 level-7 results and 3 level-6 results count
```

Results exceeding the level cap are moved to `droppedResults`.

### mandatoryRules

Real-world ranking systems (ATP, WTA) require that results from certain tournament levels always count toward a player's ranking, even if those results are worse than results from lower-tier events. The `mandatoryRules` array on a counting bucket enforces this:

```js
{
  bucketName: 'Singles',
  eventTypes: ['SINGLES'],
  pointComponents: ['positionPoints', 'perWinPoints', 'bonusPoints'],
  bestOfCount: 19,
  mandatoryRules: [
    { ruleName: 'Grand Slams', levels: [1] },           // all GS results count
    { ruleName: 'WTA 1000 Combined', levels: [3], bestOfCount: 6 }, // best 6 of L3
  ],
}
```

Each `MandatoryRule` has:

| Field         | Description                                                                          |
| ------------- | ------------------------------------------------------------------------------------ |
| `ruleName`    | Optional label for debugging/display                                                 |
| `levels`      | Tournament levels whose results are mandatory                                        |
| `bestOfCount` | If set, only the best N results from these levels are mandatory; otherwise all count |

**Algorithm:**

1. After scoring and sorting, `maxResultsPerLevel` caps are applied first.
2. For each mandatory rule, matching results are selected (best N if `bestOfCount` is set, otherwise all).
3. Mandatory results fill counting slots first.
4. Remaining `bestOfCount` slots are filled with the best non-mandatory results.
5. If mandatory results exceed `bestOfCount`, all mandatory results still count — mandatory rules take priority.

**Example:** A player with bestOfCount=4 and a Grand Slam mandatory rule who has 3 optional results at 500, 400, 300 points and 1 Grand Slam result at 10 points:

- Without mandatory: best 4 would be impossible (only 4 total), all count = 1210
- With mandatory: GS 10pts counts + best 3 optional (500+400+300) = 1210

The difference becomes clear when there are more results than slots — the mandatory result displaces a higher-scoring optional result that would otherwise count.

## Without Counting Buckets

When no `countingBuckets` are defined, all awards are treated as a single group. The value for each award is `points + qualityWinPoints`. Global `bestOfCount` and `maxResultsPerLevel` from `aggregationRules` apply:

```js
aggregationRules: {
  bestOfCount: 10,              // best 10 results overall
  maxResultsPerLevel: { 7: 3 }, // max 3 level-7 results
}
```

## Rolling Period

Filter awards by date to implement rolling ranking windows:

```js
aggregationRules: {
  rollingPeriodDays: 365, // only awards from the last 365 days
}
```

Awards are filtered by their `endDate` field. Awards without an `endDate` are always included. The cutoff is calculated from `asOfDate`:

```js
generateRankingList({
  pointAwards: allAwards,
  aggregationRules: { rollingPeriodDays: 365 },
  asOfDate: '2025-12-31', // only awards ending after 2024-12-31
});
```

## Category Filter

Filter awards before aggregation by category, gender, or event type:

```js
generateRankingList({
  pointAwards: allAwards,
  categoryFilter: {
    ageCategoryCodes: ['U18'],
    genders: ['MALE'],
    eventTypes: ['SINGLES'],
  },
});
```

## Minimum Countable Results

Flag entries that don't have enough results to be considered for official ranking:

```js
aggregationRules: {
  minCountableResults: 3,
}
```

Entries below the threshold have `meetsMinimum: false` but are still included in the output with their points and rank.

## Tiebreakers

When two entries have the same `totalPoints`, tiebreak criteria are applied in order:

```js
aggregationRules: {
  tiebreakCriteria: ['highestSingleResult', 'mostCountingResults', 'mostWins'],
}
```

| Criterion               | Resolution                                               |
| ----------------------- | -------------------------------------------------------- |
| `'highestSingleResult'` | Highest individual `points` value among counting results |
| `'mostCountingResults'` | More counting results wins                               |
| `'mostWins'`            | More total `winCount` across counting results wins       |

Tied entries that remain unresolved after all criteria share the same rank.

## RankingListEntry Output

```ts
{
  personId: string;
  totalPoints: number;
  rank: number;                    // 1-based, tied for equal positions
  meetsMinimum: boolean;           // false if below minCountableResults
  countingResults: PointAward[];   // results that count toward total
  droppedResults: PointAward[];    // results excluded by bestOfCount or level cap
  bucketTotals?: Record<string, number>;  // per-bucket totals keyed by bucketName
  bucketBreakdown?: [{             // present when countingBuckets are used
    bucketName: string;
    countingResults: PointAward[];
    droppedResults: PointAward[];
    bucketTotal: number;
  }];
}
```

`bucketTotals` is the summary view of `bucketBreakdown` — the same numbers keyed by
bucket name, for consumers that persist or display totals without the underlying
awards. It is present whenever `bucketBreakdown` is. A bucket the policy left unnamed
is keyed by position (`bucket-0`, `bucket-1`, …) in both views, and two buckets sharing
a name are summed rather than one overwriting the other.

## Awards Exempt From Bucket Limits

A `categoryAggregation` rule carrying `subjectToBucketLimits: false` contributes **on top
of** the bucket's `bestOfCount` cap rather than competing for a slot. Such an award always
counts, is never dropped, and its value is added to the bucket total:

```js
// 500 + 400 + 50(exempt), bestOfCount: 1  ->  totalPoints 550
//   the 500 wins the single slot, the 400 is dropped, the exempt 50 is added on top
```

`generateRankingList` and `getParticipantPoints` both honour this. They did not always
agree — `getParticipantPoints` ignored the flag and under-reported, which is fixed as of
6.37.1 by moving the split into the helper both call.

## Per-Participant Breakdown

Use `getParticipantPoints` to inspect a single participant's counting/dropped breakdown.
It is the per-participant view of exactly the computation `generateRankingList` performs,
so the two agree on totals for the same awards and rules:

```js
import { getParticipantPoints } from 'tods-competition-factory';

const { buckets, totalPoints } = getParticipantPoints({
  pointAwards: allAwards,
  personId: 'player-abc',
  aggregationRules,
});
```

## Ranking Policy Examples

The factory ships with complete ranking policies that demonstrate real-world aggregation configurations. These are located in `src/fixtures/policies/`:

### ATP (`POLICY_RANKING_POINTS_ATP.ts`)

The ATP policy demonstrates:

- **Separate singles/doubles buckets** — Singles best-of-19, Doubles best-of-18
- **Mandatory counting** — Grand Slams (level 1) and ATP 1000 (levels 3, 4) always count in the Singles bucket, even if the results are worse than optional results
- **Rolling 52-week period** — `rollingPeriodDays: 364`
- **No gender/category separation** — ATP is a single-gender tour

```js
// from POLICY_RANKING_POINTS_ATP.ts
countingBuckets: [
  {
    bucketName: 'Singles',
    eventTypes: ['SINGLES'],
    bestOfCount: 19,
    pointComponents: ['positionPoints', 'perWinPoints', 'bonusPoints'],
    mandatoryRules: [
      { ruleName: 'Grand Slams', levels: [1] },
      { ruleName: 'ATP 1000', levels: [3, 4] },
    ],
  },
  {
    bucketName: 'Doubles',
    eventTypes: ['DOUBLES'],
    bestOfCount: 18,
    pointComponents: ['positionPoints', 'perWinPoints', 'bonusPoints'],
  },
],
```

### WTA (`POLICY_RANKING_POINTS_WTA.ts`)

The WTA policy demonstrates:

- **Mandatory counting with `bestOfCount` on a rule** — Grand Slams (level 1) all count; best 6 of the combined WTA 1000 events (level 3) are mandatory via `bestOfCount: 6`
- **Minimum countable results** — `minCountableResults: 3`
- **Tiebreakers** — `highestSingleResult` then `mostCountingResults`

```js
// from POLICY_RANKING_POINTS_WTA.ts
countingBuckets: [
  {
    bucketName: 'Singles',
    eventTypes: ['SINGLES'],
    bestOfCount: 19,
    pointComponents: ['positionPoints', 'perWinPoints', 'bonusPoints'],
    mandatoryRules: [
      { ruleName: 'Grand Slams', levels: [1] },
      { ruleName: 'WTA 1000 Combined', levels: [3], bestOfCount: 6 },
    ],
  },
  {
    bucketName: 'Doubles',
    eventTypes: ['DOUBLES'],
    bestOfCount: 12,
    pointComponents: ['positionPoints', 'perWinPoints', 'bonusPoints'],
  },
],
```

Both policies also include full award profiles (finishing position points, qualifying bonuses, per-win points) for every tournament level in their respective tours. See the source files for the complete definitions.

## Related Documentation

- **[Scale Engine Overview](./scale-engine-overview)** — Introduction and architecture
- **[Core API Reference](./scale-engine-api)** — generateRankingList and getParticipantPoints API
- **[Ranking Points Pipeline](./ranking-points-pipeline)** — How per-tournament points are computed
- **[Quality Win Points](./quality-win-points)** — Quality win bonus system
- **[Ranking Policy](/docs/policies/rankingPolicy)** — Full policy structure including aggregationRules
