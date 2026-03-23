---
title: DrawMatic
---

## Overview

**DrawMatic** is a probabilistic pairing algorithm for [Ad Hoc (Flex Rounds)](./ad-hoc) draws. It generates fair, balanced matchup pairings for round-based events where participants are paired fresh each round — as opposed to bracket draws where the draw structure determines matchups.

DrawMatic is ideal for social events, training sessions, level-based play, and any scenario where:

- Participants should play opponents of similar skill
- No one should play the same opponent twice (if avoidable)
- Teammates should not be paired against each other
- Ratings should evolve dynamically based on match results

## How It Works

### 1. Pairing Algorithm

For each round, DrawMatic:

1. **Collects participant ratings** — from seeded ratings (`adHocRatings`) or scale values (WTN, UTR, ELO, etc.)
2. **Calculates dynamic ratings** — if enabled, updates ratings from prior round results
3. **Builds value objects** — every possible pairing gets a "cost" score:
   - Base cost = squared difference in ratings (closer ratings = lower cost)
   - +100 for each previous encounter between the pair (`encounterValue`)
   - +100 if participants are on the same team (`sameTeamValue`)
4. **Generates candidate solutions** — up to 4000 iterations of probabilistic candidate generation
5. **Selects best candidate** — the one with the lowest maximum delta (most balanced pairings)

### 2. Dynamic Ratings

When `dynamicRatings: true`, DrawMatic calculates new ratings after each round based on match results. Ratings are stored as `{scaleName}.DYNAMIC` scale values (e.g., `WTN.DYNAMIC`).

The dynamic rating system:

- Processes completed matchups from the previous round
- Applies an ELO-style calculation via `calculateNewRatings()`
- Returns `modifiedScaleValues` mapping participantId to new rating
- These ratings feed into the next round's pairing algorithm

### 3. Team Avoidance

When tournament participants include TEAM-type participants, DrawMatic automatically detects team memberships and penalizes same-team pairings. The penalty (`sameTeamValue`, default 100) makes same-team matchups less desirable but doesn't make them impossible — if no other options exist, teammates can still be paired.

## API

### `engine.drawMatic(params)`

Main entry point. Generates one or more rounds of pairings.

```typescript
const result = engine.drawMatic({
  // Required
  drawId: string,

  // Optional - round generation
  roundsCount: number,           // Number of rounds to generate (default: 1)
  participantIds: string[],      // Specific participants to include

  // Optional - rating configuration
  scaleName: string,             // Rating system: 'WTN', 'UTR', 'ELO', etc.
  scaleAccessor: string,         // Property path to extract numeric value
  dynamicRatings: boolean,       // Calculate ratings from prior results (default: false)
  refreshDynamic: boolean,       // Recalculate from scratch vs. incremental
  adHocRatings: Record<string, number>, // Seed ratings by participantId

  // Optional - pairing controls
  encounterValue: number,        // Penalty for repeat matchups (default: 100)
  sameTeamValue: number,         // Penalty for same-team pairings (default: 100)
  salted: number | boolean,      // Randomization factor (default: 0.5)
  restrictEntryStatus: boolean,  // Only pair STRUCTURE_SELECTED entries

  // Optional - algorithm tuning
  maxIterations: number,         // Override default 4000 iteration limit
});
```

**Returns:**

```typescript
{
  matchUps: MatchUp[],           // Generated matchups ready for addAdHocMatchUps
  roundResults: [{
    modifiedScaleValues: Record<string, number>,  // Updated ratings (if dynamicRatings)
    participantIdPairings: string[][],            // The generated pairings
    roundNumber: number,
    matchUpsCount: number,
    iterations: number,          // Algorithm iterations used
    candidatesCount: number,     // Candidates evaluated
    maxDelta: number,            // Largest rating gap in pairings
    maxDiff: number,             // Largest value differential
  }]
}
```

### Related Methods

| Method                   | Purpose                                                    |
| ------------------------ | ---------------------------------------------------------- |
| `generateDrawMaticRound` | Generate a single round (called internally by `drawMatic`) |
| `addAdHocMatchUps`       | Persist generated matchups to draw structure               |
| `deleteAdHocMatchUps`    | Remove matchups from structure                             |
| `generateAdHocMatchUps`  | Create empty matchup shells (manual pairing)               |
| `generateAdHocRounds`    | Create empty rounds without DrawMatic                      |
| `shiftAdHocRounds`       | Reorder rounds                                             |
| `swapAdHocRounds`        | Swap round matchups                                        |
| `adHocPositionSwap`      | Swap participants within a matchup                         |
| `addDynamicRatings`      | Persist dynamic rating updates                             |

## Draw Creation

DrawMatic draws are created as `AD_HOC` draw type. When creating via `generateDrawDefinition`:

```typescript
// Automated: DrawMatic generates pairings
engine.generateDrawDefinition({
  drawType: 'AD_HOC',
  automated: true,
  roundsCount: 3,
  drawMatic: {
    dynamicRatings: true,
    scaleName: 'WTN',
  },
  eventId,
});

// Manual: empty rounds, pair participants by hand
engine.generateDrawDefinition({
  drawType: 'AD_HOC',
  automated: false,
  roundsCount: 1,
  eventId,
});
```

## Round-by-Round Workflow

Typical usage pattern for iterative round generation:

```typescript
// 1. Generate a round
const result = engine.drawMatic({
  drawId,
  dynamicRatings: true,
  scaleName: 'WTN',
  participantIds,
});

// 2. Add matchups to the draw
engine.addAdHocMatchUps({
  drawId,
  structureId,
  matchUps: result.matchUps,
});

// 3. Persist dynamic ratings (if present)
for (const roundResult of result.roundResults ?? []) {
  if (roundResult.modifiedScaleValues) {
    engine.addDynamicRatings({
      modifiedScaleValues: roundResult.modifiedScaleValues,
      replacePriorValues: true,
    });
  }
}

// 4. Score matchups...

// 5. Generate next round (ratings auto-update from completed matchups)
const nextResult = engine.drawMatic({ drawId, dynamicRatings: true, scaleName: 'WTN' });
```

## Configuration Parameters

### encounterValue (default: 100)

Controls how strongly the algorithm avoids repeat matchups. Higher values make repeats less likely. Set to 0 to allow free re-matching.

### sameTeamValue (default: 100)

Controls how strongly the algorithm avoids same-team pairings. Set to 0 to ignore team composition.

### salted (default: 0.5)

Adds randomization to candidate selection. When multiple candidates have similar quality scores, salting determines how randomly the final candidate is chosen. Set to 0 for deterministic selection, higher values for more variety.

### maxIterations (default: 4000)

Maximum number of candidate solutions to evaluate. Higher values may find better pairings but take longer. The algorithm stops early if an optimal solution is found.

## Constraints

- Maximum 31 rounds per draw (algorithm complexity limit)
- Minimum 2 participants required
- DOUBLES events: partner ratings are summed for pairing calculations
- Round count cannot exceed participants - 1 (everyone must have an opponent)

## Pressure Score (PS#)

After rounds are played, **pressure scores** provide a per-participant measure of quality of performance that accounts for opponent strength. In TMX, these appear as the **PS#** column in the Stats table.

Pressure scores are calculated when `pressureRating: true` is passed to `getEventData` or `tallyParticipantResults`. They complement the standard win/loss tally by answering: _how well did each participant perform relative to the strength of their opponents?_

### How Pressure Score Works

For each completed SINGLES matchUp where both participants have ratings:

1. **Rating conversion**: Both participants' ratings (WTN, UTR, ELO, etc.) are converted to the ELO scale.
2. **Games weighting**: Each side's games-won count is multiplied by the opponent's converted rating, with an adjustment for rating differential:
   - The **lower-rated** player receives a bonus proportional to the rating gap, reflecting the greater difficulty of winning games against a stronger opponent.
   - The bonus is scaled by the higher-rated player's position within the ELO range, so it diminishes at the extremes.
3. **Pressure score**: Each side's weighted value is divided by the combined total, producing a value between 0 and 1. A score above 0.5 means that participant won a larger share of quality-adjusted games in that matchUp.
4. **Rating variation**: The difference between opponent and participant ratings, normalized by the ELO range maximum. Positive values indicate the opponent was stronger; negative values indicate the opponent was weaker.

### What the Values Mean

- **`pressureScores`** (PS#): Per-matchUp quality-of-performance values (0–1). Averaged across all matchUps in an event, this indicates how effectively a participant converted games against opponents of varying skill. Two participants with identical win records can be separated by pressure score if one beat stronger opponents or won more convincingly.
- **`ratingVariation`**: Per-matchUp strength-of-schedule indicators. Participants who faced tougher opponents will have higher average variation.

### Usage

```js
// Via getEventData (the typical path for TMX Stats table)
const { eventData } = tournamentEngine.getEventData({
  pressureRating: true,
  eventId,
});

// Or via tallyParticipantResults directly
const { participantResults } = tournamentEngine.tallyParticipantResults({
  matchUps: structureMatchUps,
  pressureRating: true,
  matchUpFormat,
});

// Each participant result includes:
// participantResults[participantId].pressureScores  → [0.52, 0.61, 0.45]
// participantResults[participantId].ratingVariation  → [0.03, -0.01, 0.05]
```

### Requirements

- Both participants in a matchUp must have SINGLES ratings. If either lacks a rating, pressure scores are not calculated for that matchUp.
- Any supported rating type works as input — ratings are converted to ELO internally via `getConvertedRating`.

## Predictive Accuracy (Profile)

A related analytic is **predictive accuracy**, which measures how well participant ratings predicted actual match outcomes. In TMX, this appears as the **Profile** column on the matchUps page, classifying each matchUp as:

- **COMPETITIVE** — the outcome was close relative to the rating gap
- **ROUTINE** — the higher-rated participant won as expected
- **DECISIVE** — the result was lopsided

This is calculated via `getPredictiveAccuracy`, which compares pre-match rating differences against actual score margins. It helps tournament directors evaluate whether ratings are well-calibrated and whether matchUps are being generated at appropriate skill levels.

```js
const { accuracy } = tournamentEngine.getPredictiveAccuracy({
  scaleName: 'WTN',
  matchUpType: 'SINGLES',
  eventId,
});
```

Where pressure scores evaluate _individual performance quality_, predictive accuracy evaluates _rating system quality_ — together they give a complete picture of how well the DrawMatic pairing algorithm is working.

## Related

- [Ad Hoc (Flex Rounds)](./ad-hoc) -- The draw type that DrawMatic operates on
- [Draw Types Overview](../draw-types) -- List of all pre-defined draw types
- [Generation Governor](/docs/governors/generation-governor) -- API reference for draw generation
