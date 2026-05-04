---
title: Competitive Bands Policy
---

The **Competitive Bands Policy** (`POLICY_TYPE_COMPETITIVE_BANDS`) defines thresholds for categorizing match competitiveness based on score spreads. This enables statistical analysis of match competitiveness and helps identify close vs. one-sided matches.

**Policy Type:** `competitiveBands`

**When to Use:**

- Analyzing match competitiveness patterns
- Generating competitive profile reports
- Identifying dominant vs. competitive performances
- Statistical analysis of tournament quality
- Evaluating player performance under pressure

---

## Policy Structure

```ts
{
  competitiveBands: {
    policyName?: string;           // Optional policy identifier
    profileBands: {
      DECISIVE: number;            // Threshold for decisive matches (%)
      ROUTINE: number;             // Threshold for routine matches (%)
      // Matches above ROUTINE threshold are considered COMPETITIVE
    };
    predictionModel?: {            // Optional — used by predictMatchUpCompetitiveBands
      competitiveAnchors: Array<{ delta: number; probability: number }>;
      decisiveAnchors: Array<{ delta: number; probability: number }>;
    };
  }
}
```

**Score Spread Categories:**

- **DECISIVE**: One-sided matches with score spreads ≤ DECISIVE threshold
- **ROUTINE**: Normal competitive matches with spreads ≤ ROUTINE threshold
- **COMPETITIVE**: Very close matches with spreads > ROUTINE threshold

---

## Default Policy

The factory provides `POLICY_COMPETITIVE_BANDS_DEFAULT`:

```js
import { POLICY_COMPETITIVE_BANDS_DEFAULT } from 'tods-competition-factory';

// Default thresholds:
// {
//   competitiveBands: {
//     policyName: 'Competitive Bands Default',
//     profileBands: {
//       DECISIVE: 20,     // Score spread ≤ 20% = decisive win
//       ROUTINE: 50       // Score spread ≤ 50% = routine match
//     }
//   }
// }
```

**Example Score Classifications:**

```js
// Set score: 6-0 (opponent won 0 of 6 games = 0%)
// Spread: 0% → DECISIVE

// Set score: 6-1 (opponent won 1 of 7 games = 14%)
// Spread: 14% → DECISIVE

// Set score: 6-2 (opponent won 2 of 8 games = 25%)
// Spread: 25% → ROUTINE

// Set score: 6-4 (opponent won 4 of 10 games = 40%)
// Spread: 40% → ROUTINE

// Set score: 7-5 (opponent won 5 of 12 games = 42%)
// Spread: 42% → ROUTINE

// Set score: 7-6 (opponent won 6 of 13 games = 46%)
// Spread: 46% → ROUTINE

// Set score: 7-6(8) (tiebreak 10-8, total games won: 6.5/13.5 = 48%)
// Spread: 48% → ROUTINE

// Match that goes to 3rd set tiebreak
// Spread: >50% → COMPETITIVE
```

---

## Basic Examples

### Attach Default Policy

```js
import { tournamentEngine } from 'tods-competition-factory';
import { POLICY_COMPETITIVE_BANDS_DEFAULT } from 'tods-competition-factory';

tournamentEngine.setState(tournamentRecord);

// Attach default competitive bands
const result = tournamentEngine.attachPolicies({
  policyDefinitions: POLICY_COMPETITIVE_BANDS_DEFAULT,
});
```

### Custom Competitive Bands

```js
import { POLICY_TYPE_COMPETITIVE_BANDS } from 'tods-competition-factory';

// Stricter definition of "decisive"
const strictBands = {
  [POLICY_TYPE_COMPETITIVE_BANDS]: {
    policyName: 'Strict Competitive Bands',
    profileBands: {
      DECISIVE: 10, // Only bagels/breadsticks are decisive
      ROUTINE: 40, // Tighter definition of routine
    },
  },
};

tournamentEngine.attachPolicies({
  policyDefinitions: strictBands,
});
```

### Looser Competitive Bands

```js
// More lenient definition (fewer "competitive" matches)
const looseBands = {
  [POLICY_TYPE_COMPETITIVE_BANDS]: {
    policyName: 'Loose Competitive Bands',
    profileBands: {
      DECISIVE: 30, // More matches classified as decisive
      ROUTINE: 60, // Fewer matches classified as competitive
    },
  },
};
```

---

## Using Competitive Bands

### Get Match Competitive Profile

```js
// Get competitive profile for a single match
const { competitiveProfile } = tournamentEngine.getMatchUpCompetitiveProfile({
  matchUpId: 'match-1',
});

console.log(competitiveProfile);
// 'DECISIVE' | 'ROUTINE' | 'COMPETITIVE'
```

### Get Tournament Statistics

```js
// Analyze all matches in tournament
const { competitiveBands } = tournamentEngine.getMatchUpsStats();

console.log(competitiveBands);
// {
//   DECISIVE: { count: 15, pct: 25 },
//   ROUTINE: { count: 35, pct: 58 },
//   COMPETITIVE: { count: 10, pct: 17 }
// }
```

### Get Participant Statistics

```js
// Get competitive profile for specific participant
const { participantStats } = tournamentEngine.getParticipantStats({
  participantId: 'player-1',
  withCompetitiveProfiles: true,
});

console.log(participantStats.competitiveness);
// {
//   decisive: { won: 5, lost: 1, played: 6 },
//   routine: { won: 3, lost: 2, played: 5 },
//   competitive: { won: 2, lost: 1, played: 3 }
// }

console.log(participantStats.decisiveRatio); // 0.429 (6 of 14 matches)
console.log(participantStats.routineRatio); // 0.357
console.log(participantStats.competitiveRatio); // 0.214
```

---

## Real-World Use Cases

### Tournament Quality Analysis

```js
// Analyze competitiveness of tournament
const { matchUpsStats } = tournamentEngine.getMatchUpsStats();

const { DECISIVE, ROUTINE, COMPETITIVE } = matchUpsStats.competitiveBands;

console.log(`Tournament Competitiveness:`);
console.log(`  Decisive matches: ${DECISIVE.count} (${DECISIVE.pct}%)`);
console.log(`  Routine matches: ${ROUTINE.count} (${ROUTINE.pct}%)`);
console.log(`  Competitive matches: ${COMPETITIVE.count} (${COMPETITIVE.pct}%)`);

if (COMPETITIVE.pct > 30) {
  console.log('High-quality, competitive tournament!');
} else if (DECISIVE.pct > 40) {
  console.log('Many one-sided matches - consider better seeding');
}
```

### Seeding Effectiveness

```js
// Analyze if top seeds are dominating (as expected)
const topSeeds = [1, 2, 3, 4];

for (const seedNumber of topSeeds) {
  const participant = getParticipantBySeed(seedNumber);

  const stats = tournamentEngine.getParticipantStats({
    participantId: participant.participantId,
    withCompetitiveProfiles: true,
  });

  const decisivePct = stats.decisiveRatio * 100;

  console.log(`Seed ${seedNumber}: ${decisivePct.toFixed(1)}% decisive wins`);

  if (decisivePct < 30) {
    console.warn(`Seed ${seedNumber} not dominating - possible upset risk`);
  }
}
```

---

## Event-Specific Competitive Bands

Different event types may warrant different thresholds:

```js
// Professional event (expect more competitive matches)
const proBands = {
  [POLICY_TYPE_COMPETITIVE_BANDS]: {
    policyName: 'Professional Competitive Bands',
    profileBands: {
      DECISIVE: 15, // Fewer decisive matches expected
      ROUTINE: 45, // Lower threshold for "competitive"
    },
  },
};

tournamentEngine.attachPolicies({
  policyDefinitions: proBands,
  eventId: 'pro-event-id',
});

// Junior event (expect more lopsided matches)
const juniorBands = {
  [POLICY_TYPE_COMPETITIVE_BANDS]: {
    policyName: 'Junior Competitive Bands',
    profileBands: {
      DECISIVE: 25, // More decisive matches expected
      ROUTINE: 55, // Higher threshold
    },
  },
};

tournamentEngine.attachPolicies({
  policyDefinitions: juniorBands,
  eventId: 'junior-event-id',
});
```

---

## Predictive Use — `predictionModel`

The `profileBands` block describes **retrospective** competitiveness — how completed matches are classified by score spread. The optional `predictionModel` block describes **predictive** competitiveness — how likely a _projected_ matchUp is to land in each band, given the rating delta of the two sides.

The default model is anchored on Dave Fish's 2011 _"Need For a Rating System"_ observations:

- ~70% competitive at delta ≈ 0 (well-matched / ATP-Slam-equivalent depth)
- ~55% competitive at delta ≈ 0.5 (WTA-Slam / ITA-Women's depth)
- ~25% competitive at delta ≈ 1.5 (USTA sectional age-group baseline)

A two-anchor logistic curve is fit through `competitiveAnchors` for the COMPETITIVE band, and through `decisiveAnchors` for the DECISIVE band. ROUTINE is the residual.

```js
// Default prediction model
{
  competitiveAnchors: [
    { delta: 0,   probability: 0.70 },
    { delta: 1.5, probability: 0.25 },
  ],
  decisiveAnchors: [
    { delta: 0,   probability: 0.10 },
    { delta: 1.5, probability: 0.55 },
  ],
}
```

### Example — predict a single matchUp

```js
const result = tournamentEngine.predictMatchUpCompetitiveBands({
  side1Rating: 4.5,
  side2Rating: 5.0,
});
// → { competitive: 0.55, decisive: 0.18, routine: 0.27, delta: 0.5 }
```

### Example — predict an entire draw

```js
const result = tournamentEngine.predictDrawCompetitiveBands({
  ratings: [5.5, 5.4, 5.3, 5.2, 5.1, 5.0, 4.9, 4.8],
  drawType: 'SINGLE_ELIMINATION',
});
// → {
//     competitive: 0.62,
//     decisive: 0.13,
//     routine: 0.25,
//     projectionMode: 'BALANCED_BRACKET',
//     projectedPairs: [[5.5, 4.8], [5.4, 4.9], [5.3, 5.0], [5.2, 5.1]],
//     expectedMatchCount: 4,
//   }
```

### Projection modes

The draw-level predictor projects the matchUps that will play. Three modes are available, auto-resolved from `drawType`:

| Mode               | Auto-mapped from                                                                                                                                                                                              | Pairing                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `BALANCED_BRACKET` | `SINGLE_ELIMINATION`, `DOUBLE_ELIMINATION`, `COMPASS`, `LUCKY_DRAW`, `ADAPTIVE`, `FIRST_MATCH_LOSER_CONSOLATION`, `FIRST_ROUND_LOSER_CONSOLATION`, `FEED_IN_CHAMPIONSHIP_TO_QF`, `FEED_IN_CHAMPIONSHIP_TO_SF` | i-th highest rating vs i-th lowest — mirrors R1 of standard seed placement                          |
| `ROUND_ROBIN`      | `ROUND_ROBIN`, `DOUBLE_ROUND_ROBIN`, `ROUND_ROBIN_WITH_PLAYOFF`                                                                                                                                               | All pairs within each group; uses `groupSize` when supplied                                         |
| `MIN_DELTA`        | `SWISS`                                                                                                                                                                                                       | Adjacent ratings — minimum delta. Suitable for Swiss R1 and DrawMatic-style rating-balanced pairing |

`projectionMode` can also be passed explicitly, overriding the auto-mapping. This is the path for ad-hoc draw types (e.g., DrawMatic) that aren't first-class draw-type constants.

### Custom anchors per audience

```js
// Junior tournament — wider rating spreads tolerated
const juniorPolicy = {
  [POLICY_TYPE_COMPETITIVE_BANDS]: {
    policyName: 'Junior Competitive Bands',
    profileBands: { DECISIVE: 25, ROUTINE: 55 },
    predictionModel: {
      competitiveAnchors: [
        { delta: 0, probability: 0.65 },
        { delta: 2.0, probability: 0.3 },
      ],
      decisiveAnchors: [
        { delta: 0, probability: 0.15 },
        { delta: 2.0, probability: 0.5 },
      ],
    },
  },
};
```

### Scope and limits

- **Singles only.** Doubles ratings (paired/team aggregation) are not currently modeled.
- **Bracket projection is R1-only** for elimination draws and full pairwise for round-robin. Later rounds depend on results that have not happened; full-tournament Monte Carlo simulation is out of scope.
- **The model is statistical, not deterministic.** Output is a probability distribution suitable for ranking candidate plans against one another, not for predicting a specific matchUp's outcome.

---

## Notes

- **Default thresholds** (20%, 50%) are based on typical tennis match distributions
- **Walkover matches** are excluded from competitive analysis
- **Retired matches** are classified based on completed score
- **Tiebreaks** are included in spread calculations (fractional games)
- Thresholds are percentages (0-100 scale)
- Policy affects analytics only - does not impact match progression
- Used by `getMatchUpCompetitiveProfile`, `getMatchUpsStats`, `getParticipantStats`
- Can be attached at tournament, event, or draw level
- More decisive matches (lower spread) suggest better seeding or skill gaps
