---
title: Core API Reference
---

Complete method reference for the `ScaleEngine`. The ScaleEngine exposes all methods from the [Ranking Governor](/docs/governors/ranking-governor) plus rating functions, accessible through the stateful engine pattern.

:::info
The ScaleEngine shares the `syncEngine` singleton. Call `scaleEngine.setState(tournamentRecord)` before invoking methods, or pass `policyDefinitions` explicitly when tournament policies aren't attached.
:::

## Ranking Points Methods

### getTournamentPoints

```ts
getTournamentPoints(params?: {
  policyDefinitions?: PolicyDefinitions;
  participantFilters?: ParticipantFilters;
  level?: number;
}): {
  success: boolean;
  personPoints: Record<string, PointAward[]>;
  pairPoints: Record<string, PointAward[]>;
  teamPoints: Record<string, PointAward[]>;
  participantsWithOutcomes: Participant[];
}
```

Computes ranking points for all participants in the loaded tournament. This is the core computation method.

```js
scaleEngine.setState(tournamentRecord);
const result = scaleEngine.getTournamentPoints({
  policyDefinitions: rankingPolicy,
  level: 3,
});

// Iterate personPoints
for (const [personId, awards] of Object.entries(result.personPoints)) {
  const total = awards.reduce((sum, a) => sum + (a.points || 0) + (a.qualityWinPoints || 0), 0);
  console.log(`${personId}: ${total} points`);
}
```

**Parameters:**

| Parameter | Type | Description |
| --- | --- | --- |
| `policyDefinitions` | `PolicyDefinitions` | Ranking policy. Falls back to tournament-attached policy if not provided |
| `participantFilters` | `ParticipantFilters` | Filter which participants to process |
| `level` | `number` | Tournament level (used for level-keyed point values) |

**Returns:** `personPoints` keyed by `personId`, `pairPoints` keyed by pair `participantId`, `teamPoints` keyed by team `participantId`. Each value is an array of `PointAward` objects.

See [Ranking Points Pipeline](/docs/scale-engine/ranking-points-pipeline) for how points are computed.

---

### getEventRankingPoints

```ts
getEventRankingPoints(params: {
  policyDefinitions?: PolicyDefinitions;
  eventId: string;
  level?: number;
}): {
  success: boolean;
  eventAwards: EventAward[];
  eventName: string;
  eventType: string;
  isDoubles: boolean;
}
```

Returns ranking points scoped to a single event as a flat, sorted array of participant awards. This is a convenience method that wraps `getTournamentPoints` for event-level display.

```js
scaleEngine.setState(tournamentRecord);
const result = scaleEngine.getEventRankingPoints({
  policyDefinitions: rankingPolicy,
  eventId: 'event-abc',
  level: 3,
});

for (const award of result.eventAwards) {
  console.log(`${award.participantName}: ${award.points}pts (pos: ${award.positionPoints}, wins: ${award.perWinPoints}, bonus: ${award.bonusPoints})`);
}
```

**Parameters:**

| Parameter | Type | Description |
| --- | --- | --- |
| `policyDefinitions` | `PolicyDefinitions` | Ranking policy (must include `POLICY_TYPE_RANKING_POINTS`) |
| `eventId` | `string` | Event to scope results to |
| `level` | `number` | Tournament level for level-keyed point values |

**Returns:** `eventAwards` is a flat array sorted by points descending, then by participant name. Each award includes `participantId`, `participantName`, `personId`, `points`, `positionPoints`, `perWinPoints`, `bonusPoints`, `winCount`, `rangeAccessor`, `drawId`, `drawType`, and `eventType`. The response also includes `eventName`, `eventType`, and `isDoubles` for display purposes.

**Difference from `getTournamentPoints`:** While `getTournamentPoints` returns points keyed by `personId`/`participantId` across the entire tournament, `getEventRankingPoints` filters to a single event and returns a display-ready flat array with resolved participant names.

---

### applyTournamentRankingPoints

```ts
applyTournamentRankingPoints(params: {
  policyDefinitions?: PolicyDefinitions;
  participantFilters?: ParticipantFilters;
  scaleName?: string;      // default: 'RANKING_POINTS'
  level?: number;
  removePriorValues?: boolean;
}): {
  success: boolean;
  personPoints: Record<string, PointAward[]>;
  pairPoints: Record<string, PointAward[]>;
  teamPoints: Record<string, PointAward[]>;
  modificationsApplied: number;
}
```

Computes ranking points and persists them as [scale items](/docs/concepts/scaleItems) on participant records. This enables multi-tournament workflows where one tournament's points are available for quality win lookups in subsequent tournaments.

```js
scaleEngine.setState(tournamentRecord);

const result = scaleEngine.applyTournamentRankingPoints({
  policyDefinitions: rankingPolicy,
  scaleName: 'USTA_JUNIOR',
  level: 2,
  removePriorValues: true,
});

// Points are now persisted and retrievable
const { scaleItem } = scaleEngine.getParticipantScaleItem({
  participantId: 'player-123',
  scaleAttributes: {
    scaleType: 'RANKING',
    scaleName: 'USTA_JUNIOR',
    eventType: 'SINGLES',
  },
});
// scaleItem.scaleValue = { points: 500, awards: [...] }
```

**Parameters:**

| Parameter | Type | Description |
| --- | --- | --- |
| `policyDefinitions` | `PolicyDefinitions` | Ranking policy |
| `participantFilters` | `ParticipantFilters` | Filter which participants to process |
| `scaleName` | `string` | Name for the scale item (default: `'RANKING_POINTS'`) |
| `level` | `number` | Tournament level |
| `removePriorValues` | `boolean` | Remove existing scale items with the same scaleName before writing |

**Scale item structure:** Each participant receives one scale item per `eventType`, with `scaleValue: { points, awards }` where `points` is the total and `awards` is the full `PointAward[]` breakdown.

---

### getAwardProfile

```ts
getAwardProfile(params: {
  awardProfiles: AwardProfile[];
  participation: StructureParticipation;
  eventType?: string;
  drawType?: string;
  drawSize?: number;
  category?: Category;
  gender?: string;
  wheelchairClass?: string;
  level?: number;
  startDate?: string;
  endDate?: string;
}): { awardProfile?: AwardProfile }
```

Selects the best-matching award profile using [specificity scoring](/docs/scale-engine/ranking-points-pipeline#profile-selection). Generally called internally by `getTournamentPoints`, but available for inspection and debugging.

---

### getAwardPoints

```ts
getAwardPoints(params: {
  valueObj: PositionValue;
  level?: number;
  drawSize?: number;
  flightNumber?: number;
  flights?: FlightConfig;
  participantWon?: boolean;
}): { awardPoints: number; requireWin?: boolean }
```

Resolves a position value object into numeric points. Handles level-keyed values, draw size thresholds, flight lookups, and won/lost accessors.

---

## Aggregation Methods

### generateRankingList

```ts
generateRankingList(params: {
  pointAwards: PointAward[];
  aggregationRules?: AggregationRules;
  categoryFilter?: CategoryFilter;
  asOfDate?: string;
}): RankingListEntry[]
```

Aggregates point awards from multiple tournaments into a sorted ranking list. This is a pure computation function — it does not access tournament state.

```js
import { generateRankingList } from 'tods-competition-factory';

const rankingList = generateRankingList({
  pointAwards: allAwards, // collected from multiple getTournamentPoints calls
  aggregationRules: {
    countingBuckets: [
      { bucketName: 'Singles', eventTypes: ['SINGLES'], pointComponents: ['positionPoints', 'perWinPoints', 'bonusPoints'], bestOfCount: 6 },
      { bucketName: 'Doubles', eventTypes: ['DOUBLES'], pointComponents: ['positionPoints', 'perWinPoints', 'bonusPoints'], bestOfCount: 2 },
      { bucketName: 'Quality Wins', pointComponents: ['qualityWinPoints'], bestOfCount: 0 },
    ],
    rollingPeriodDays: 365,
    minCountableResults: 3,
    tiebreakCriteria: ['highestSingleResult', 'mostWins'],
  },
  asOfDate: '2025-12-31',
});

for (const entry of rankingList) {
  console.log(`#${entry.rank} ${entry.personId}: ${entry.totalPoints}pts (${entry.countingResults.length} counting)`);
}
```

See [Multi-Tournament Aggregation](/docs/scale-engine/aggregation) for detailed documentation.

---

### getParticipantPoints

```ts
getParticipantPoints(params: {
  pointAwards: PointAward[];
  personId: string;
  aggregationRules?: AggregationRules;
}): {
  buckets: BucketBreakdown[];
  totalPoints: number;
}
```

Returns a per-participant breakdown showing which results count and which are dropped, organized by bucket.

```js
import { getParticipantPoints } from 'tods-competition-factory';

const { buckets, totalPoints } = getParticipantPoints({
  pointAwards: allAwards,
  personId: 'player-abc',
  aggregationRules: {
    countingBuckets: [
      { bucketName: 'Singles', eventTypes: ['SINGLES'], pointComponents: ['positionPoints', 'perWinPoints'], bestOfCount: 6 },
    ],
  },
});

for (const bucket of buckets) {
  console.log(`${bucket.bucketName}: ${bucket.bucketTotal}pts (${bucket.countingResults.length} counting, ${bucket.droppedResults.length} dropped)`);
}
```

---

## Quality Win Methods

### getQualityWinPoints

```ts
getQualityWinPoints(params: {
  qualityWinProfiles: QualityWinProfile[];
  wonMatchUpIds: string[];
  mappedMatchUps: Record<string, MatchUp>;
  participantSideMap: Record<string, number>;
  tournamentParticipants: Participant[];
  tournamentStartDate?: string;
  participantId?: string;
  level?: number;
}): {
  qualityWinPoints: number;
  qualityWins: QualityWin[];
}
```

Computes quality win bonus points for a participant's won matchUps. Generally called internally by `getTournamentPoints`.

See [Quality Win Points](/docs/scale-engine/quality-win-points) for detailed documentation.

---

## Rating Methods

### generateDynamicRatings

Generates dynamic ratings for all participants based on match outcomes using configurable algorithms.

### calculateNewRatings

Calculates updated ratings for two participants based on a match outcome.

---

## Related Documentation

- **[Scale Engine Overview](./scale-engine-overview)** — Introduction and architecture
- **[Ranking Points Pipeline](./ranking-points-pipeline)** — How points are computed
- **[Quality Win Points](./quality-win-points)** — Quality win bonus system
- **[Multi-Tournament Aggregation](./aggregation)** — Counting buckets and ranking lists
- **[Ranking Governor](/docs/governors/ranking-governor)** — Stateless function reference
- **[Ranking Policy](/docs/policies/rankingPolicy)** — Policy structure guide
- **[Scale Items](/docs/concepts/scaleItems)** — Rankings, ratings, and seedings
