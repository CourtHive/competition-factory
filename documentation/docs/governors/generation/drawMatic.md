---
title: drawMatic
---

# drawMatic

DrawMatic is a probabilistic pairing engine for [AD_HOC](/docs/concepts/draw-types/ad-hoc) draws. It generates fair, balanced matchUp pairings round-by-round, with opponent avoidance, team-member avoidance, and optional rating-driven level-based play. For a deep dive into the algorithm, scoring analytics, and pressure scores, see the [DrawMatic concept page](/docs/concepts/draw-types/drawmatic).

## When to Use DrawMatic

DrawMatic is designed for events where participants are paired fresh each round rather than following a bracket:

- **Social and recreational events** — round-robin-style play without a fixed bracket
- **D3 college tennis** — teams arrive and depart on different days; rosters change between rounds
- **Training sessions** — coach wants to control skill-level matching
- **Level-based play** — participants paired by rating with dynamic adjustments after each round
- **Flex-round formats** — any scenario where the number of rounds isn't known in advance

## Creating a DrawMatic Draw

DrawMatic operates on `AD_HOC` draw types. There are two creation paths:

### Automated (DrawMatic generates pairings during draw creation)

```js
const { drawDefinition } = engine.generateDrawDefinition({
  drawType: 'AD_HOC',
  automated: true,
  roundsCount: 3,
  drawMatic: {
    dynamicRatings: true,
    scaleName: 'WTN',
    scaleAccessor: 'wtnRating',
  },
  eventId,
});
```

This generates a draw with 3 pre-paired rounds in one call. Useful when all participants and ratings are known up front.

### Manual (empty rounds, pair later)

```js
// 1. Generate an empty AD_HOC draw
const { drawDefinition } = engine.generateDrawDefinition({
  drawType: 'AD_HOC',
  automated: false,
  eventId,
});

// 2. Add the draw to the tournament
engine.addDrawDefinition({ eventId, drawDefinition });

// 3. Generate pairings on demand
const result = engine.drawMatic({
  drawId: drawDefinition.drawId,
  roundsCount: 1,
  dynamicRatings: true,
  scaleName: 'WTN',
});

// 4. Add the generated matchUps to the draw
engine.addAdHocMatchUps({
  drawId: drawDefinition.drawId,
  matchUps: result.matchUps,
});
```

This is the typical workflow for interactive events where rounds are generated one at a time.

## API Reference

### `engine.drawMatic(params)`

Generates one or more rounds of pairings for an existing AD_HOC draw.

#### Parameters

| Parameter        | Type             | Required | Default        | Description                                                          |
| ---------------- | ---------------- | -------- | -------------- | -------------------------------------------------------------------- |
| `drawId`         | `string`         | Yes      | —              | Draw to generate pairings for                                        |
| `roundsCount`    | `number`         | Yes      | —              | Number of rounds to generate (max: participants - 1)                 |
| `participantIds` | `string[]`       | No       | all entries    | Restrict which participants appear in generated rounds               |
| `structureId`    | `string`         | No       | auto-detected  | Target structure (defaults to latest AD_HOC structure with matchUps) |
| `matchUpIds`     | `string[]`       | No       | auto-generated | Pre-assigned UUIDs for generated matchUps                            |
| `eventType`      | `EventTypeUnion` | No       | from event     | Override event type (e.g., force SINGLES ratings in DOUBLES events)  |

#### Rating Configuration

| Parameter                  | Type                     | Default | Description                                                                     |
| -------------------------- | ------------------------ | ------- | ------------------------------------------------------------------------------- |
| `scaleName`                | `string`                 | —       | Rating system to use: `'WTN'`, `'UTR'`, `'ELO'`, or any custom scale            |
| `scaleAccessor`            | `string`                 | —       | Property path to extract numeric value from scale objects (e.g., `'wtnRating'`) |
| `dynamicRatings`           | `boolean`                | `false` | Calculate updated ratings from prior round results                              |
| `refreshDynamic`           | `boolean`                | `false` | Recalculate dynamic ratings from scratch instead of incrementally               |
| `adHocRatings`             | `Record<string, number>` | —       | Seed ratings by participantId (overrides scale values)                          |
| `updateParticipantRatings` | `boolean`                | `false` | Persist `modifiedScaleValues` to participant records                            |

#### Pairing Controls

| Parameter             | Type                | Default | Description                                                      |
| --------------------- | ------------------- | ------- | ---------------------------------------------------------------- |
| `encounterValue`      | `number`            | `100`   | Cost penalty for repeat matchUps (higher = stronger avoidance)   |
| `sameTeamValue`       | `number`            | `100`   | Cost penalty for same-team pairings                              |
| `salted`              | `number \| boolean` | `0.5`   | Randomization factor for candidate selection (0 = deterministic) |
| `minimizeDelta`       | `boolean`           | `false` | Force minimum rating gap in pairings (good for first rounds)     |
| `restrictEntryStatus` | `boolean`           | `false` | Only pair participants with `STRUCTURE_SELECTED` entry status    |
| `restrictRoundsCount` | `boolean`           | `true`  | Enforce maximum rounds limit                                     |
| `enableDoubleRobin`   | `boolean`           | `false` | Allow rounds up to `(participants - 1) * 2`                      |

#### Algorithm Tuning

| Parameter          | Type      | Default | Description                                                                         |
| ------------------ | --------- | ------- | ----------------------------------------------------------------------------------- |
| `maxIterations`    | `number`  | `5000`  | Maximum candidate solutions to evaluate                                             |
| `generateMatchUps` | `boolean` | `true`  | When `false`, returns only `participantIdPairings` without creating matchUp objects |

#### Return Value

```ts
{
  matchUps: MatchUp[];              // Generated matchUps ready for addAdHocMatchUps
  roundResults: [{
    modifiedScaleValues: Record<string, number>;  // Updated ratings (if dynamicRatings)
    participantIdPairings: string[][];            // The generated pairings
    roundNumber: number;
    matchUpsCount: number;
    iterations: number;             // Algorithm iterations used
    candidatesCount: number;        // Candidates evaluated
    maxDelta: number;               // Largest rating gap in selected pairings
    maxDiff: number;                // Largest value differential
  }];
}
```

## Round-by-Round Workflow

The typical interactive workflow:

```js
// Round 1: generate pairings
const r1 = engine.drawMatic({
  drawId,
  roundsCount: 1,
  dynamicRatings: true,
  scaleName: 'WTN',
});

// Add matchUps to the draw
engine.addAdHocMatchUps({ drawId, matchUps: r1.matchUps });

// Persist dynamic ratings
for (const rr of r1.roundResults ?? []) {
  if (rr.modifiedScaleValues) {
    engine.addDynamicRatings({
      modifiedScaleValues: rr.modifiedScaleValues,
      replacePriorValues: true,
    });
  }
}

// ... score round 1 matchUps ...

// Round 2: ratings auto-update from completed matchUps
const r2 = engine.drawMatic({
  drawId,
  roundsCount: 1,
  dynamicRatings: true,
  scaleName: 'WTN',
});

engine.addAdHocMatchUps({ drawId, matchUps: r2.matchUps });

// Continue as needed...
```

## Dynamic Ratings

When `dynamicRatings: true`, DrawMatic calculates updated ratings after each round:

1. Completed matchUps from the previous round are processed
2. An ELO-style calculation produces new ratings
3. Ratings are stored as `{scaleName}.DYNAMIC` scale values (e.g., `WTN.DYNAMIC`)
4. These feed into the next round's pairing algorithm

Use `refreshDynamic: true` to recalculate from scratch (ignoring previously persisted dynamic values). This is useful if matchUp results were corrected after ratings were generated.

## Participant Management

### Flexible Rosters

The `participantIds` parameter controls which participants appear in each round. This enables:

- **Late arrivals** — add new participants in later rounds
- **Early departures** — exclude participants who have left
- **Partial rounds** — generate pairings for a subset of participants

```js
// Round 1: full roster
engine.drawMatic({ drawId, roundsCount: 1, participantIds: allParticipants });

// Round 2: two players departed, one arrived
engine.drawMatic({ drawId, roundsCount: 1, participantIds: updatedRoster });
```

### Odd Numbers

When the participant count is odd, one participant receives a bye each round. The algorithm distributes byes to minimize repeat byes across rounds.

## Related Methods

| Method                   | Purpose                                                             |
| ------------------------ | ------------------------------------------------------------------- |
| `generateDrawMaticRound` | Low-level single-round generator (called internally by `drawMatic`) |
| `addAdHocMatchUps`       | Persist generated matchUps to draw structure                        |
| `deleteAdHocMatchUps`    | Remove matchUps from a structure                                    |
| `generateAdHocMatchUps`  | Create empty matchUp shells for manual pairing                      |
| `generateAdHocRounds`    | Create empty rounds without DrawMatic pairing                       |
| `shiftAdHocRounds`       | Reorder rounds within a structure                                   |
| `swapAdHocRounds`        | Swap matchUps between rounds                                        |
| `adHocPositionSwap`      | Swap participants within a matchUp                                  |
| `addDynamicRatings`      | Persist dynamic rating updates to participant records               |

## Analytics

DrawMatic-generated events support two post-play analytics:

- **Pressure Scores (PS#)** — per-participant quality-of-performance metric that accounts for opponent strength. See [Pressure Scores](/docs/concepts/draw-types/drawmatic#pressure-score-ps).
- **Predictive Accuracy (Profile)** — measures how well ratings predicted match outcomes, classifying each matchUp as COMPETITIVE, ROUTINE, or DECISIVE. See [Predictive Accuracy](/docs/concepts/draw-types/drawmatic#predictive-accuracy-profile).

## Related

- [DrawMatic Concept Page](/docs/concepts/draw-types/drawmatic) — algorithm details, pressure scores, predictive accuracy
- [AD_HOC Draw Type](/docs/concepts/draw-types/ad-hoc) — the draw type that DrawMatic operates on
- [generateDrawDefinition](/docs/governors/generation/generateDrawDefinition) — creating DrawMatic draws via the generation pipeline
- [Generation Governor](/docs/governors/generation-governor) — all generation methods
