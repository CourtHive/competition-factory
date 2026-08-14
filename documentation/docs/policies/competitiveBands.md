---
title: Competitive Bands Policy
---

The **Competitive Bands Policy** (`POLICY_TYPE_COMPETITIVE_BANDS`) defines thresholds for categorizing match competitiveness based on score spreads. This enables statistical analysis of match competitiveness and helps identify close vs. one-sided matches.

**Policy Type:** `competitiveBands`

The policy carries **two independent axes**. Keeping them straight is the difference between reading these numbers correctly and misreading them:

| Axis                         | Policy block   | Scalar       | Domain            | Bands                    | Answers                                          |
| ---------------------------- | -------------- | ------------ | ----------------- | ------------------------ | ------------------------------------------------ |
| **Realized** competitiveness | `profileBands` | score spread | unsigned, 0–100   | exactly 3, named in code | "how close was the match that was played?"       |
| **Signed exposure**          | `deltaBands`   | rating delta | signed, unbounded | N, named in policy       | "did this player play up, or down, and how far?" |

They are orthogonal. `deltaBands` is **not** a widening of the three realized bands: adding it moves no Competitive Ratio and changes no existing output. See [Signed Exposure](#signed-exposure--deltabands) below.

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
    deltaBands?: Array<{           // Optional — the SIGNED EXPOSURE axis
      key: string;                 // Band name; policy-defined, not a factory enum
      max?: number;                // Upper bound in rating units, XOR maxPct
      maxPct?: number;             // Upper bound as a percent of the scale's range
    }>;                            // Ordered; the FINAL entry omits its bound
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

The factory provides `POLICY_COMPETITIVE_BANDS_DEFAULT` on the `fixtures.policies` catalog:

```js
import { fixtures } from 'tods-competition-factory';

const { POLICY_COMPETITIVE_BANDS_DEFAULT } = fixtures.policies;

// {
//   competitiveBands: {
//     policyName: 'Competitive Bands Default',
//     profileBands: {
//       DECISIVE: 20,     // Score spread ≤ 20% = decisive win
//       ROUTINE: 50       // Score spread ≤ 50% = routine match
//     },
//     deltaBands: [       // the signed exposure axis — see below
//       { key: 'ANCHOR',  maxPct: -10.3 },
//       { key: 'DOWN',    maxPct: -1.3 },
//       { key: 'EVEN',    maxPct: 1.3 },
//       { key: 'UP',      maxPct: 10.3 },
//       { key: 'STRETCH' },
//     ],
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
import { tournamentEngine, fixtures } from 'tods-competition-factory';

const { POLICY_COMPETITIVE_BANDS_DEFAULT } = fixtures.policies;

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

## Bulk Enrichment Without Full Context Hydration

For analytics that only need competitiveness bucketing (donut charts, summary stats, downloadable reports), `allTournamentMatchUps`, `allEventMatchUps`, and `allDrawMatchUps` accept `contextProfile: { withCompetitiveness: true }` together with `inContext: false`. This attaches `competitiveProfile` to each completed matchUp without paying the per-matchUp cost of `addMatchUpContext` hydration (participant resolution, exit profiles, round naming, schedule joins, etc.).

```js
const { matchUps } = tournamentEngine.allTournamentMatchUps({
  contextProfile: { withCompetitiveness: true },
  inContext: false,
});

// Each completed matchUp now has matchUp.competitiveProfile attached:
//   { competitiveness: 'DECISIVE' | 'ROUTINE' | 'COMPETITIVE', spread: number, ... }
```

The same flag works on `allEventMatchUps({ eventId, ... })` and `allDrawMatchUps({ drawId, ... })`.

### Behavior

- The competitive-bands policy is resolved with the standard three-tier lookup: explicit `policyDefinitions` argument → `getAppliedPolicies` (event → draw → tournament scope) → `POLICY_COMPETITIVE_BANDS_DEFAULT` fixture.
- Each matchUp is **shallow-copied** before `competitiveProfile` is attached, so the underlying `drawDefinition.matchUps` is never mutated.
- MatchUps with no `winningSide` (incomplete, BYEs, walkovers without a recorded winner) are returned untouched.
- MatchUps that already carry `competitiveProfile` (from an earlier `inContext: true` pass) are passed through as-is.

### When to use this vs. `inContext: true`

| Need                                                                          | Recommended call                                                                 |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Competitive-band counts only (e.g., overview donut, league-wide histogram)    | `inContext: false` + `contextProfile: { withCompetitiveness: true }`             |
| Per-participant competitive stats (`getParticipantStats`, `getMatchUpsStats`) | `inContext: false` + `contextProfile: { withCompetitiveness: true }` is enough   |
| Anything that joins on participants, schedule, exit profiles, or rounds       | `inContext: true` (full hydration; competitiveProfile is attached automatically) |

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

## Signed Exposure — `deltaBands`

`profileBands` answers "how close was the match?". `deltaBands` answers a different question: **"did this player play up, or down, and how far?"** That question needs a _signed_ scalar — a rating delta oriented against a perspective — where realized competitiveness is deliberately unsigned (a four-point gap is equally uncompetitive whichever side it favours).

Adding `deltaBands` to a policy changes nothing about the three realized bands. No existing caller's output moves.

### An ordered boundary list

`deltaBands` is a list, not a fixed shape. **N entries produce N bands**, and the final entry omits its bound to catch the remainder:

```js
import { POLICY_TYPE_COMPETITIVE_BANDS } from 'tods-competition-factory';

const policy = {
  [POLICY_TYPE_COMPETITIVE_BANDS]: {
    profileBands: { DECISIVE: 20, ROUTINE: 50 },
    deltaBands: [
      { key: 'ANCHOR', max: -4 },
      { key: 'DOWN', max: -0.5 },
      { key: 'EVEN', max: 0.5 },
      { key: 'UP', max: 4 },
      { key: 'STRETCH' }, // open upper bound — catches the remainder
    ],
  },
};
```

Resolution walks the list in order and returns the first band whose `max` the signed delta **does not exceed** (the upper edge is inclusive, matching `profileBands`). A federation wanting three signed bands, or nine, or an asymmetric split, expresses that entirely in policy — no factory change.

Band **keys are policy-defined strings**. The default set (`ANCHOR` / `DOWN` / `EVEN` / `UP` / `STRETCH`) is exported as plain constants for convenience, but nothing in the resolver knows those names, and a custom vocabulary is a first-class case.

### Boundary units — `max` XOR `maxPct`

A boundary is expressed one of two ways, never both:

| Form     | Meaning                                | Use when                                                            |
| -------- | -------------------------------------- | ------------------------------------------------------------------- |
| `max`    | absolute rating units                  | the federation means a specific number of rating points             |
| `maxPct` | percent of the scale's range magnitude | the policy should behave sensibly across scales (the portable form) |

`maxPct` resolves to `(maxPct / 100) * Math.abs(range[1] - range[0])` using the scale's `range` from `ratingsParameters`. The same policy therefore adapts:

| Scale | `range`     | Magnitude | `maxPct: 10` resolves to |
| ----- | ----------- | --------- | ------------------------ |
| WTN   | `[40, 1]`   | 39        | 3.9                      |
| UTR   | `[1, 16]`   | 15        | 1.5                      |
| ELO   | `[0, 3000]` | 3000      | 300                      |

Three things are **validation errors**, not tolerated shapes — each would otherwise produce plausible-looking but wrong bands:

- declaring both `max` and `maxPct` on one entry (`INVALID_POLICY_DEFINITION`)
- a `maxPct` boundary against a scale with no `range`, or with no `scaleName` supplied — there is no silent fallback to absolute units
- boundaries that do not ascend, or a final entry that carries a bound (which would leave deltas past it with no band)

### Orientation lives in the factory

Sign orientation is derived from `ratingsParameters[scaleName].ascending`, so callers never hand-roll it:

```text
signedDelta = ascending ? (ownRating - oppRating) : (oppRating - ownRating)
```

`ascending: true` means a **lower** value is stronger (WTN, BWF ranking). The result is always oriented so that **positive means the tougher opponent**:

```js
import { tools } from 'tods-competition-factory';

tools.signedRatingDelta({ ownRating: 10, oppRating: 12, scaleName: 'WTN' }); // → { signedDelta: -2 }  playing down
tools.signedRatingDelta({ ownRating: 10, oppRating: 12, scaleName: 'UTR' }); // → { signedDelta: 2 }   playing up
```

A scale absent from `ratingsParameters` **errors** unless an explicit `ascending` is passed. Guessing the direction would invert the meaning of every band, so it is refused rather than assumed.

### Reading it per matchUp

The signed axis engages on `getMatchUpCompetitiveProfile` only when a `scaleName` is supplied — which is exactly why existing callers see no change:

```js
const result = tournamentEngine.getMatchUpCompetitiveProfile({
  policyDefinitions: POLICY_COMPETITIVE_BANDS_DEFAULT,
  participantId, // perspective; defaults to side 1
  scaleName: 'WTN',
  matchUp,
});
// → {
//     success: true,
//     competitiveness: 'COMPETITIVE',  // realized — unchanged
//     pctSpread: 58,                   // realized — unchanged
//     perspectiveSideNumber: 1,
//     signedDelta: -5,
//     deltaBand: 'ANCHOR',
//   }
```

`predictMatchUpCompetitiveBands` gains the same two fields additively. Its `delta` remains the **absolute** delta it has always returned:

```js
tournamentEngine.predictMatchUpCompetitiveBands({
  policyDefinitions: POLICY_COMPETITIVE_BANDS_DEFAULT,
  side1Rating: 4.5,
  side2Rating: 5,
  scaleName: 'UTR',
});
// → { competitive: …, decisive: …, routine: …, delta: 0.5, signedDelta: 0.5, deltaBand: 'UP' }
```

### Reading it per participant — `getCompetitiveProfile`

`getCompetitiveProfile` aggregates **both axes** over a matchUp array. It is **pure**: no storage access, no tournamentRecord, no engine state. TMX runs it offline against IndexedDB state to draw an in-card fingerprint bar; a server runs the identical function over a whole corpus. One implementation, so the two cannot drift.

```js
const profile = tournamentEngine.getCompetitiveProfile({
  policyDefinitions: POLICY_COMPETITIVE_BANDS_DEFAULT,
  scaleName: 'WTN',
  participantId,
  matchUps, // the caller decides what is in scope
});
// → {
//     success: true,
//     participantId,
//     matchUpsCount: 6,
//     realized: {
//       counts: { DECISIVE: 2, ROUTINE: 2, COMPETITIVE: 1 },
//       ratios: { DECISIVE: 40, ROUTINE: 40, COMPETITIVE: 20 },
//       completed: 5,
//     },
//     exposure: {
//       counts: { ANCHOR: 1, DOWN: 1, EVEN: 1, UP: 1, STRETCH: 1 },
//       ratios: { ANCHOR: 20, DOWN: 20, EVEN: 20, UP: 20, STRETCH: 20 },
//       meanSignedDelta: 0,
//       deltaBandsApplied: true,
//       unrated: 1,
//       rated: 5,
//     },
//   }
```

Behaviour worth knowing:

- **Realized counts only completed matchUps** — a score spread needs a result. `realized.completed` reports how many that was.
- **Exposure counts every matchUp with ratings on both sides**, result or not: who you were drawn against is known before the match is played.
- **`rated` / `unrated` are reported** so a bar rendered from `ratios` can never quietly imply coverage it does not have. A missing rating is missing data, not an error.
- **`exposure.counts` is zero-filled** for every band the policy declares, so a five-segment bar has five segments even for a participant who has never played up.
- **A pair is the MEAN of its individual ratings**, not the sum — the boundaries are in single-player units, so a summed pair delta would be systematically ~2× and land in the wrong band.
- Pass `singlesForDoubles: true` to read individuals' SINGLES ratings in a doubles matchUp.

### No `deltaBands` means no bands

If the resolved policy declares no `deltaBands`, the signed APIs return the **delta with no band** — never a guessed default. This is deliberately asymmetric with `profileBands`, which does fall back to the shipped 20/50 thresholds:

- the realized thresholds are long-standing and load-bearing for existing consumers;
- the default delta boundaries are an **explicitly arbitrary** cut (see below), so stamping band labels derived from them onto everyone's data would assert something that has not been established.

Opting in is one import: `fixtures.policies.POLICY_COMPETITIVE_BANDS_DEFAULT`.

### About the shipped default

The default is **symmetric as a convenience, not as a claim.** Playing up two levels and playing down two levels are unlikely to be developmentally equivalent, and the ordered list expresses asymmetry freely (`+2` / `-4`) — but there is no evidence for any particular asymmetry, and shipping an invented one would put an unevidenced judgement into everyone's numbers. Asymmetry is a federation policy choice.

`10.3%` of WTN's 39-point range is ≈ ±4 WTN, the cut used in the ITA college-tennis corpus analysis, where it sat near the 90th percentile of observed `|delta|`. That is an arbitrary cut, restated here so it is not mistaken for a finding.

### Using the resolver directly

For code that already holds a signed delta (an ingest pipeline, a projection job), the resolver is exported on `tools`:

```js
import { tools } from 'tods-competition-factory';

tools.resolveDeltaBand(-5, deltaBands, 'WTN'); // → { band: 'ANCHOR' }
tools.resolveDeltaBoundaries(deltaBands, 'WTN'); // → { boundaries: [{ key: 'ANCHOR', max: -4.017 }, …] }
```

`resolveDeltaBoundaries` validates and converts **once**; prefer it when walking many matchUps rather than re-resolving per row.

---

## Notes

- **Default thresholds** (20%, 50%) are based on typical tennis match distributions
- **Walkover matches** are excluded from competitive analysis
- **Retired matches** are classified based on completed score
- **Tiebreaks** are included in spread calculations (fractional games)
- Thresholds are percentages (0-100 scale)
- Policy affects analytics only - does not impact match progression
- Used by `getMatchUpCompetitiveProfile`, `getMatchUpsStats`, `getParticipantStats`, `getCompetitiveProfile`
- Can be attached at tournament, event, or draw level
- More decisive matches (lower spread) suggest better seeding or skill gaps
- `deltaBands` is a **second axis**, not a widening of the three realized bands; enabling it moves no Competitive Ratio
