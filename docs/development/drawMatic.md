# DrawMatic

DrawMatic is a probabilistic pairing algorithm for **AD_HOC** (flex rounds) draws. It generates fair, balanced matchup pairings for round-based events where participants are paired fresh each round — as opposed to bracket draws where the draw structure determines matchups.

## Overview

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

## Source Files

```text
factory/src/assemblies/generators/drawDefinitions/drawTypes/adHoc/drawMatic/
├── drawMatic.ts                    # Main orchestrator
├── generateDrawMaticRound.ts       # Single-round generation
├── generateCandidate.ts            # Probabilistic candidate generator
├── getEncounters.ts                # Previous encounter tracking
├── getPairings.ts                  # Pairing evaluation
├── getPairingsData.ts              # Pairing data structures
├── getParticipantIds.ts            # Entry filtering
├── getParticipantPairingValues.ts  # Value-sorted opponent lists
├── getSideRatings.ts               # Rating extraction (SINGLES/DOUBLES)
└── getAdHocRatings.ts              # Rating lookup (dynamic + seeded)
```
