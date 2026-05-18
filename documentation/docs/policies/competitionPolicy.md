---
title: Competition Policy
---

The **Competition Policy** (`POLICY_TYPE_COMPETITION`) configures a three-track rating system for multi-round competitions such as DrawMatic and Swiss events. It controls how participants are rated, paired, and ranked across rounds.

**Policy Type:** `competition`

**When to Use:**

- Running multi-round competitions with dynamic pairing (DrawMatic, Swiss)
- Tracking participant form across rounds independently of frozen baseline ratings
- Measuring overperformance via cumulative pressure ratings
- Configuring victory conditions and tiebreak hierarchies
- Controlling whether rating updates happen per matchUp or per round

---

## Design Principles

Three ideas drive the competition policy design:

1. **Pair dynamically, evaluate statically.** Dynamic form ratings determine who plays whom; frozen baseline ratings determine what was expected. This separation means a participant's evaluation is never contaminated by the pairing algorithm.

2. **No feedback loop.** Pressure rating accumulates against baseline expectations that never change. A strong start does not inflate future expectations, preserving the meaning of overperformance across all rounds.

3. **Policy-driven granularity.** Whether ratings update after each matchUp or after each round is a policy choice, not a code branch. The same processing function handles both modes.

### Core Invariant

> Dynamic ratings affect opportunity, never evaluation.

Pairing uses the dynamic form rating so that in-form participants face tougher opponents. But expected output for pressure calculation always derives from baseline ratings. This ensures that a participant who consistently beats expectation is rewarded, regardless of how the pairing algorithm adapted.

---

## Policy Structure

```ts
{
  competition: {
    policyName?: string;                         // Optional human-readable identifier

    ratingPolicy: {
      baselineRating: {
        source: BaselineRatingSource;            // 'SCALE' | 'SEEDING' | 'MANUAL'
        scaleName?: string;                      // Name of the scale to use (when source is 'SCALE')
        frozenDuringEvent: true;                 // Always true — baselines never change mid-event
      };

      dynamicFormRating: {
        enabled: boolean;                        // Whether dynamic form rating updates are active
        initializeFrom: 'BASELINE';              // Always initialized from the baseline rating
        kFactor: number;                         // Elo K-factor controlling update magnitude
        logisticScale: number;                   // Logistic curve scale (typically 400)
      };

      pressureRating?: {
        enabled: boolean;                        // Whether pressure rating tracking is active
        expectationSource: 'BASELINE_ONLY';      // Expectations always derived from baseline
        actualOutputMethod: ActualOutputMethod;  // 'POINT_SHARE' | 'WEIGHTED'
        weights?: {
          pointShare: number;                    // Weight for pointsWon / totalPoints
          pointDifferential?: number;            // Weight for normalized differential
          contextFactor?: number;                // Future extension point
        };
      };

      ratingAggregation?: RatingAggregation;     // 'AVERAGE' | 'MIN' | 'MAX' | 'SUM'
    };

    pairingPolicy: {
      method: PairingMethod;                     // 'DRAW_MATIC' | 'SWISS' | 'LEVEL_BASED'
      ratingSource: RatingSource;                // 'DYNAMIC_FORM' | 'BASELINE'
      laneSize?: number;                         // Number of participants per lane (DrawMatic)
      avoidRepeatOpponents: boolean;             // Prevent rematches when possible
      sameTeamValue?: number;                    // Penalty for same-team pairings (DrawMatic)
    };

    victoryPolicy: {
      primaryRanking: PrimaryRanking;            // 'PRESSURE_RATING' | 'DYNAMIC_FORM_RATING' | 'WINS' | 'POINTS'
      tiebreakOrder?: CompetitionTiebreak[];     // Ordered list of tiebreak methods
    };

    processingGranularity: ProcessingGranularity; // 'PER_MATCHUP' | 'PER_ROUND'
  }
}
```

### Type Reference

```ts
type BaselineRatingSource = 'SCALE' | 'SEEDING' | 'MANUAL';
type ActualOutputMethod = 'POINT_SHARE' | 'WEIGHTED';
type PairingMethod = 'DRAW_MATIC' | 'SWISS' | 'LEVEL_BASED';
type RatingSource = 'DYNAMIC_FORM' | 'BASELINE';
type ProcessingGranularity = 'PER_MATCHUP' | 'PER_ROUND';
type RatingAggregation = 'AVERAGE' | 'MIN' | 'MAX' | 'SUM';
type PrimaryRanking = 'PRESSURE_RATING' | 'DYNAMIC_FORM_RATING' | 'WINS' | 'POINTS';

type CompetitionTiebreak =
  | 'HEAD_TO_HEAD'
  | 'HEAD_TO_HEAD_PRESSURE'
  | 'POINT_DIFFERENTIAL'
  | 'STRENGTH_OF_OPPOSITION'
  | 'DYNAMIC_FORM_RATING'
  | 'PRESSURE_RATING'
  | 'BUCHHOLZ'
  | 'SONNEBORN_BERGER';
```

---

## Rating Tracks

The competition policy maintains three independent rating tracks per participant. Each track serves a distinct purpose and has clear rules about when and how it changes.

### Baseline Rating

The baseline rating is the participant's pre-competition strength estimate. It is **frozen for the entire event** (`frozenDuringEvent: true`).

- **Source:** Loaded from a participant scale (`SCALE`), seeding position (`SEEDING`), or supplied directly (`MANUAL`).
- **Purpose:** Defines the expected output in every matchUp. When participant A (baseline 1500) plays participant B (baseline 1200), the expected score for A is computed from these frozen values.
- **Immutability:** The baseline never changes during the event. This is the foundation of the no-feedback-loop guarantee.

### Dynamic Form Rating

The dynamic form rating tracks in-competition momentum. It starts equal to the baseline and updates after each processed matchUp using an Elo-style formula.

- **Initialization:** `initializeFrom: 'BASELINE'` -- begins at the baseline value.
- **Update formula:** `newRating = oldRating + kFactor * (actualOutput - expectedDynamic)`, where `expectedDynamic` is the logistic expectation between the two participants' current dynamic ratings.
- **kFactor:** Controls sensitivity. Higher values mean faster reaction to recent results. The preset fixtures use `24`.
- **logisticScale:** The denominator in the logistic function. Standard value is `400`, matching traditional Elo scaling.
- **Purpose:** Drives pairing. Participants on a hot streak see their dynamic rating rise, leading to tougher pairings in subsequent rounds.

The logistic expectation function:

```text
E = 1 / (1 + 10^((ratingB - ratingA) / scale))
```

### Pressure Rating

The pressure rating is a cumulative measure of overperformance against baseline expectations. It starts at zero and accumulates `actualOutput - expectedBaseline` after each matchUp.

- **expectationSource:** Always `'BASELINE_ONLY'`. The expected output is computed from the frozen baseline ratings of both participants.
- **actualOutputMethod:** Determines how the actual result is quantified:
  - `POINT_SHARE`: `pointsWon / totalPoints` (simple proportion)
  - `WEIGHTED`: Weighted combination of point share, normalized point differential, and a context factor (future extension)
- **Cumulative:** Pressure rating only accumulates. A participant who beats baseline expectation in every round will have a steadily rising pressure rating, regardless of how their dynamic form rating shifts.
- **Enabled optionally:** The `pressureRating` block is optional. Standard competitions may omit it entirely.

When `actualOutputMethod` is `WEIGHTED`, the actual output is:

```text
output = (w1 * pointShare + w2 * normalizedDifferential + w3 * contextFactor) / totalWeight
```

Where `normalizedDifferential = (pointsWon - pointsLost) / totalPoints` and `contextFactor` is reserved for future use (currently `0`).

If no score data is available (total points is zero), actual output defaults to `0.5`.

---

## Processing Granularity

The `processingGranularity` field controls when rating updates are applied:

| Value         | Behavior                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PER_MATCHUP` | Ratings update immediately after each matchUp is scored. A participant's dynamic form rating may change between their first and second matchUp within the same round (if applicable). |
| `PER_ROUND`   | Ratings update after all matchUps in a round are complete. All matchUps in a round use the same dynamic form ratings for expectation calculations.                                    |

`PER_ROUND` is the more common choice for Swiss and DrawMatic competitions, where all pairings in a round are determined simultaneously. `PER_MATCHUP` is useful when matchUps complete asynchronously and subsequent pairings depend on live results.

---

## Pairing Policy

The `pairingPolicy` block controls how participants are matched each round.

### Methods

| Method        | Description                                                                                                                                                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRAW_MATIC`  | Lane-based pairing. Participants are sorted by the chosen `ratingSource` and divided into lanes of `laneSize`. Pairings are drawn within or across adjacent lanes. Supports `sameTeamValue` penalty to discourage intra-team matchups. |
| `SWISS`       | Standard Swiss-system pairing. Participants with equal scores are paired together, using rating to break ties within score groups.                                                                                                     |
| `LEVEL_BASED` | Participants are paired within rating bands. Simpler than DrawMatic, without the lane structure.                                                                                                                                       |

### Configuration

- **ratingSource:** Which rating track drives pairing. `DYNAMIC_FORM` uses the mutable form rating (recommended). `BASELINE` uses the frozen rating (static pairing).
- **avoidRepeatOpponents:** When `true`, the pairing algorithm avoids rematches from earlier rounds.
- **sameTeamValue:** A numeric penalty applied when two participants from the same team would be paired. Higher values make same-team pairings less likely. Only relevant for `DRAW_MATIC`.
- **laneSize:** The number of participants per lane in `DRAW_MATIC` pairing.

---

## Victory Policy

The `victoryPolicy` block determines the leaderboard ranking.

### Primary Ranking

| Value                 | Leaderboard sorted by      |
| --------------------- | -------------------------- |
| `WINS`                | Total match wins           |
| `POINTS`              | Total points scored        |
| `PRESSURE_RATING`     | Cumulative overperformance |
| `DYNAMIC_FORM_RATING` | Current form rating        |

### Tiebreak Order

When participants are tied on the primary ranking, the `tiebreakOrder` array defines the sequence of tiebreak methods applied:

| Tiebreak                 | Description                                                       |
| ------------------------ | ----------------------------------------------------------------- |
| `HEAD_TO_HEAD`           | Direct result between tied participants                           |
| `HEAD_TO_HEAD_PRESSURE`  | Pressure rating differential in head-to-head matchUps             |
| `POINT_DIFFERENTIAL`     | `totalPointsWon - totalPointsLost`                                |
| `STRENGTH_OF_OPPOSITION` | Average baseline rating of opponents faced                        |
| `DYNAMIC_FORM_RATING`    | Current dynamic form rating                                       |
| `PRESSURE_RATING`        | Cumulative pressure rating                                        |
| `BUCHHOLZ`               | Sum of opponents' scores (Swiss tiebreak)                         |
| `SONNEBORN_BERGER`       | Sum of beaten opponents' scores + half of drawn opponents' scores |

---

## Preset Fixtures

Three preset policies are provided as starting points.

### POLICY_COMPETITION_STANDARD

Standard DrawMatic competition. No pressure tracking. Rankings based on wins with point differential as primary tiebreak.

```ts
import { POLICY_COMPETITION_STANDARD } from 'tods-competition-factory';
```

| Setting         | Value                                                       |
| --------------- | ----------------------------------------------------------- |
| Pairing         | `DRAW_MATIC`, `DYNAMIC_FORM` source                         |
| Primary ranking | `WINS`                                                      |
| Tiebreaks       | `POINT_DIFFERENTIAL`, `HEAD_TO_HEAD`, `DYNAMIC_FORM_RATING` |
| Pressure        | Disabled                                                    |
| Granularity     | `PER_ROUND`                                                 |
| kFactor / scale | 24 / 400                                                    |

### POLICY_COMPETITION_PRESSURE

DrawMatic competition with full pressure tracking. Rankings based on cumulative overperformance.

```ts
import { POLICY_COMPETITION_PRESSURE } from 'tods-competition-factory';
```

| Setting         | Value                                                                   |
| --------------- | ----------------------------------------------------------------------- |
| Pairing         | `DRAW_MATIC`, `DYNAMIC_FORM` source                                     |
| Primary ranking | `PRESSURE_RATING`                                                       |
| Tiebreaks       | `HEAD_TO_HEAD_PRESSURE`, `POINT_DIFFERENTIAL`, `STRENGTH_OF_OPPOSITION` |
| Pressure        | Enabled, `POINT_SHARE` method                                           |
| Granularity     | `PER_MATCHUP`                                                           |
| kFactor / scale | 24 / 400                                                                |

### POLICY_COMPETITION_SWISS

Swiss-system competition with pressure tracking. Rankings based on wins with chess-style tiebreaks.

```ts
import { POLICY_COMPETITION_SWISS } from 'tods-competition-factory';
```

| Setting         | Value                                                             |
| --------------- | ----------------------------------------------------------------- |
| Pairing         | `SWISS`, `DYNAMIC_FORM` source                                    |
| Primary ranking | `WINS`                                                            |
| Tiebreaks       | `BUCHHOLZ`, `SONNEBORN_BERGER`, `HEAD_TO_HEAD`, `PRESSURE_RATING` |
| Pressure        | Enabled, `POINT_SHARE` method                                     |
| Granularity     | `PER_ROUND`                                                       |
| kFactor / scale | 24 / 400                                                          |

---

## Competition State

Competition state is stored as an extension on the draw definition under the key `COMPETITION_STATE`. It tracks per-participant data and per-round metadata.

### Participant State

Each participant entry maintains:

```ts
{
  participantId: string;
  baselineRating: number; // Frozen for the event
  dynamicFormRating: number; // Updated after each processed matchUp
  pressureRating: number; // Cumulative overperformance (starts at 0)
  roundsPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  totalPointsWon: number;
  totalPointsLost: number;
  ratingHistory: Array<{
    roundNumber: number;
    opponentParticipantId: string;
    dynamicFormRatingBefore: number;
    dynamicFormRatingAfter: number;
    pressureDelta: number; // actualOutput - expectedBaseline
    actualOutput: number;
    expectedOutput: number; // From baseline ratings
  }>;
}
```

### Leaderboard Row

The leaderboard provides a ranked view of all participants:

```ts
{
  participantId: string;
  rank: number;
  baselineRating: number;
  dynamicFormRating: number;
  pressureRating: number;
  wins: number;
  losses: number;
  draws: number;
  pointsWon: number;
  pointsLost: number;
}
```

---

## Usage Examples

### Attach a Policy

```ts
import { tournamentEngine, POLICY_COMPETITION_PRESSURE } from 'tods-competition-factory';

tournamentEngine.attachPolicies({
  policyDefinitions: POLICY_COMPETITION_PRESSURE,
});
```

### Process a MatchUp

After scoring a matchUp, call `processCompetitionMatchUp` to update participant states. The function:

1. Retrieves the competition policy from the draw/event/tournament
2. Retrieves the competition state extension from the draw definition
3. Derives point counts from the matchUp score
4. Computes actual output for both participants
5. Computes expected output from baseline ratings (for pressure) and dynamic ratings (for form)
6. Updates dynamic form ratings, pressure ratings, win/loss/draw tallies, and point totals
7. Appends history entries for both participants
8. Persists the updated state as an extension on the draw definition

### Get Leaderboard

The competition state includes an optional `leaderboard` array sorted according to the victory policy. Query it from the draw definition's competition state extension.

---

## Integration with DrawMatic and Swiss

The competition policy does not implement pairing logic directly. Instead, it provides the rating data that pairing algorithms consume:

- **DrawMatic** reads each participant's `dynamicFormRating` (or `baselineRating`, per `ratingSource`) to sort participants into lanes and generate balanced pairings.
- **Swiss** reads the same rating data to break ties within score groups when constructing round pairings.
- **Both** respect `avoidRepeatOpponents` by consulting the `ratingHistory` entries to identify previous opponents.

After pairings are made and matchUps scored, `processCompetitionMatchUp` updates the state that feeds the next round's pairing. The policy is the bridge between the rating engine and the pairing algorithm.
