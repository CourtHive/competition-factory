---
title: Ranking Governor
---

```js
import { rankingGovernor } from 'tods-competition-factory';
```

The **rankingGovernor** provides ranking points computation, quality win calculation, multi-tournament aggregation, and write-back functions. It groups all ranking-related operations and is composed into the [Scale Engine](/docs/scale-engine/scale-engine-overview) alongside the ratings governor.

:::info
Most applications use the **[Scale Engine](/docs/scale-engine/scale-engine-overview)** for convenience. The rankingGovernor is useful for stateless processing, custom engines, or when you need to pass `tournamentRecord` explicitly.
:::

---

## Query Methods

### getTournamentPoints

Computes ranking points for all participants in a tournament based on a [ranking policy](/docs/policies/rankingPolicy).

```js
const result = rankingGovernor.getTournamentPoints({
  tournamentRecord,
  policyDefinitions: rankingPolicy,
  level: 3,
});

// result.personPoints: Record<personId, PointAward[]>
// result.pairPoints: Record<participantId, PointAward[]>
// result.teamPoints: Record<participantId, PointAward[]>
```

**Purpose:** Core computation function. Iterates participants with outcomes, selects award profiles via specificity scoring, resolves position points, per-win points, bonus points, quality win points, and doubles attribution.

See [Ranking Points Pipeline](/docs/scale-engine/ranking-points-pipeline) for detailed documentation.

---

### getEventRankingPoints

Returns ranking points scoped to a single event as a flat array of participant awards, sorted by points descending.

```js
const result = rankingGovernor.getEventRankingPoints({
  tournamentRecord,
  policyDefinitions: rankingPolicy,
  eventId: 'event-abc',
  level: 3,
});

// result.eventAwards: sorted array of enriched PointAward objects
// result.eventName: string
// result.eventType: 'SINGLES' | 'DOUBLES' | 'TEAM'
// result.isDoubles: boolean
```

**Purpose:** Convenience wrapper around `getTournamentPoints` oriented toward event-level display. Filters awards to only those from draws in the specified event, enriches each award with `participantId` and `participantName`, and returns a flat sorted array ready for table rendering. Handles SINGLES person points, DOUBLES pair points (with attribution), and TEAM points.

| Parameter           | Type                | Description                                                |
| ------------------- | ------------------- | ---------------------------------------------------------- |
| `tournamentRecord`  | `Tournament`        | Tournament record                                          |
| `policyDefinitions` | `PolicyDefinitions` | Ranking policy (must include `POLICY_TYPE_RANKING_POINTS`) |
| `eventId`           | `string`            | Event to scope results to                                  |
| `level`             | `number`            | Optional tournament level for level-keyed point values     |

**Returns:**

| Property      | Type           | Description                                                                                                                                                                                           |
| ------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eventAwards` | `EventAward[]` | Sorted array of awards with `participantId`, `participantName`, `personId`, `points`, `positionPoints`, `perWinPoints`, `bonusPoints`, `winCount`, `rangeAccessor`, `drawId`, `drawType`, `eventType` |
| `eventName`   | `string`       | Name of the event                                                                                                                                                                                     |
| `eventType`   | `string`       | Event type (`SINGLES`, `DOUBLES`, `TEAM`)                                                                                                                                                             |
| `isDoubles`   | `boolean`      | Whether event is doubles                                                                                                                                                                              |

Also available on `tournamentEngine` and `scaleEngine`.

---

### getAwardProfile

Selects the best-matching award profile for a participation using specificity scoring.

```js
const { awardProfile } = rankingGovernor.getAwardProfile({
  awardProfiles,
  participation,
  eventType: 'SINGLES',
  drawType: 'SINGLE_ELIMINATION',
  drawSize: 32,
  category: { ageCategoryCode: 'U18' },
  gender: 'MALE',
  level: 3,
});
```

**Purpose:** Deterministic profile selection. Counts populated scope fields to score each profile; highest score wins. Explicit `priority` overrides scoring.

See [Profile Selection](/docs/scale-engine/ranking-points-pipeline#profile-selection) for scoring rules.

---

### getAwardPoints

Resolves a position value object into numeric points. The `accessor` is derived from [`finishingPositionRange`](/docs/concepts/finishing-positions#accessor).

```js
const { awardPoints, requireWin } = rankingGovernor.getAwardPoints({
  valueObj: finishingPositionRanges[accessor],
  level: 3,
  drawSize: 32,
  flightNumber: 1,
});
```

**Purpose:** Handles level-keyed values (`{ level: { 1: 1000, 2: 500 } }`), draw size thresholds (`[{ threshold: 16, value: 800 }]`), flight lookups, and `won`/`lost` accessors.

---

### getQualityWinPoints

Computes quality win bonus points for a participant's won matchUps.

```js
const { qualityWinPoints, qualityWins } = rankingGovernor.getQualityWinPoints({
  qualityWinProfiles,
  wonMatchUpIds,
  mappedMatchUps,
  participantSideMap,
  tournamentParticipants,
  tournamentStartDate: '2025-06-01',
});
```

**Purpose:** Looks up opponent rankings from scale items, matches against ranking ranges, applies per-tournament caps.

See [Quality Win Points](/docs/scale-engine/quality-win-points) for detailed documentation.

---

### generateRankingList

Aggregates point awards from multiple tournaments into a sorted ranking list.

```js
const rankingList = rankingGovernor.generateRankingList({
  pointAwards: allAwards,
  aggregationRules: {
    countingBuckets: [
      {
        bucketName: 'Singles',
        eventTypes: ['SINGLES'],
        pointComponents: ['positionPoints', 'perWinPoints'],
        bestOfCount: 6,
      },
    ],
    rollingPeriodDays: 365,
    tiebreakCriteria: ['highestSingleResult'],
  },
  asOfDate: '2025-12-31',
});

// rankingList[0] = { personId, totalPoints, rank: 1, ... }
```

**Purpose:** Pure aggregation. Filters, groups, applies counting buckets with maxResultsPerLevel and bestOfCount, computes tiebreakers, assigns ranks.

See [Multi-Tournament Aggregation](/docs/scale-engine/aggregation) for detailed documentation.

---

### getParticipantPoints

Returns a per-participant breakdown of counting and dropped results.

```js
const { buckets, totalPoints } = rankingGovernor.getParticipantPoints({
  pointAwards: allAwards,
  personId: 'player-abc',
  aggregationRules,
});
```

**Purpose:** Inspect which results count toward a participant's ranking and which are dropped.

---

## Mutation Methods

### applyTournamentRankingPoints

Computes ranking points and persists them as [scale items](/docs/concepts/scaleItems) on participant records.

```js
const result = rankingGovernor.applyTournamentRankingPoints({
  tournamentRecord,
  policyDefinitions: rankingPolicy,
  scaleName: 'NATIONAL_RANKING',
  level: 2,
  removePriorValues: true,
});

// result.modificationsApplied: number of scaleItems written
```

**Purpose:** Write-back mutation. Calls `getTournamentPoints`, then writes one scale item per participant per eventType. Enables multi-tournament workflows and quality win lookups in subsequent tournaments.

| Parameter           | Type                | Description                                              |
| ------------------- | ------------------- | -------------------------------------------------------- |
| `tournamentRecord`  | `Tournament`        | Tournament to compute and persist points for             |
| `policyDefinitions` | `PolicyDefinitions` | Ranking policy                                           |
| `scaleName`         | `string`            | Scale item name (default: `'RANKING_POINTS'`)            |
| `level`             | `number`            | Tournament level                                         |
| `removePriorValues` | `boolean`           | Remove existing items with same scaleName before writing |

---

## Relationship to Scale Engine

The rankingGovernor is one of two governors composed into the [Scale Engine](/docs/scale-engine/scale-engine-overview):

```text
ScaleEngine = rankingGovernor + ratingsGovernor
```

All rankingGovernor methods are available as engine methods:

```js
// Governor approach (stateless)
rankingGovernor.getTournamentPoints({ tournamentRecord, ... });

// Engine approach (stateful)
scaleEngine.setState(tournamentRecord);
scaleEngine.getTournamentPoints({ ... });
```

---

## Related Documentation

- **[Scale Engine Overview](/docs/scale-engine/scale-engine-overview)** — Stateful engine wrapping this governor
- **[Scale Engine API](/docs/scale-engine/scale-engine-api)** — Complete method reference
- **[Ranking Points Pipeline](/docs/scale-engine/ranking-points-pipeline)** — How points are computed
- **[Quality Win Points](/docs/scale-engine/quality-win-points)** — Quality win bonus system
- **[Multi-Tournament Aggregation](/docs/scale-engine/aggregation)** — Counting buckets and ranking lists
- **[Ranking Policy](/docs/policies/rankingPolicy)** — Policy structure reference
- **[Scale Items](/docs/concepts/scaleItems)** — How rankings are stored
- **[Governors Overview](/docs/governors/governors-overview)** — All governors
- **[Participant Governor](/docs/governors/participant-governor)** — setParticipantScaleItem, getParticipantScaleItem
