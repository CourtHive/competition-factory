---
title: Format Wizard — suggestFormatPlans
---

The **Format Wizard engine** (`tournamentEngine.suggestFormatPlans`) takes a participant pool, TD constraints, and optional governance caps, and returns a ranked table of plan candidates. It is the deterministic decision engine behind the level-based format wizard described in Dave Fish's _"Need For a Rating System"_ (2011).

**Entry point:** `tournamentEngine.suggestFormatPlans({ participants, constraints, governance, predictionModel?, tournamentRecord? })`

**Scope:** Singles only. Gender / category segregation is the caller's responsibility — filter `participants` upstream and run the engine again to compare segregated plans.

---

## Inputs

```ts
type WizardParticipant = {
  participantId: string;
  rating: number;
  category?: string;
  gender?: string;
};

type WizardConstraints = {
  courts: number; // available courts
  days: number; // tournament length in days
  hoursPerDay?: number; // playing hours per day (default 8)
  avgMinutes?: number; // overrides matchUpFormat-derived avg (default 90)
  matchUpFormat?: string; // for future timing integration
  targetMatchesPerPlayer?: number; // ranking target — plans below it flagged BELOW_FLOOR
  targetCompetitivePct?: number; // 0..1 target for the COMPETITIVE band
  voluntaryConsolation?: boolean; // when true, every recommendation also emits a "_VC" twin
  consolationAppetite?: 'NONE' | 'LIGHT' | 'FULL';
  allowMixedGender?: boolean; // governance flag
  allowCollapsedCategories?: boolean;
};

type WizardGovernance = {
  allowedDrawTypes?: string[]; // hard whitelist
  allowedMatchUpFormats?: string[];
};
```

---

## Pipeline

1. **Distribution stats** — pure stats over participant ratings (mean, median, stddev, IQR, histogram, gaps).
2. **Flighting strategies** — generates candidate flightings, capped by pool size to avoid the "9 flights for 32 players" trap:
   - `EQUAL_COUNT` (k = 2/3/4/6)
   - `EQUAL_BAND` (0.5 / 1.0 rating-unit bands)
   - `NATURAL_CLUSTER` (cuts at the largest rating gaps)
   - `STAGGERED_SINGLE` (one flight, all participants — always emitted, exempt from the cap because it feeds the connected `FEED_IN` archetype)

   The cap by pool size: `≤8 → 1`, `≤16 → 2`, `≤32 → 4`, `≤64 → 6`, `>64 → 8`. The minimum flight size is **4** participants — small flights are filtered out.

3. **Structure catalog** — for each flight size, returns eligible structures filtered by `consolationAppetite` and `allowedDrawTypes`. Catalog kinds:
   - `SINGLE_ELIMINATION`, `FIRST_MATCH_LOSER_CONSOLATION`, `FIRST_ROUND_LOSER_CONSOLATION`, `DOUBLE_ELIMINATION`
   - `COMPASS` (size 7-8 and 13-16)
   - `ROUND_ROBIN` (single group ≤ 8) and `ROUND_ROBIN_WITH_PLAYOFF` (multi-group)
   - `SWISS` (3/5/7 rounds)
   - `DRAW_MATIC` (3/5 rounds — pairing-balanced)
   - `LUCKY_DRAW` (non-power-of-two only)
   - `ADAPTIVE` (cascading consolation Lucky Draw)
   - `FEED_IN` — connected-bracket archetype (the "French staggered system"). One flight, multi-tier entry. Only emitted for **single-flight** plans (it IS the cross-tier bracket). Variants:
     - `FEED_IN_<N>_TIERS` — bare feed-in, no consolation
     - `FIC_SF` (size ≥ 8) — feed-in championship to semifinals
     - `FIC_QF` (size ≥ 12) — feed-in championship to quarterfinals
     - `FIC_R16` / `FIC` / `MFIC` (size ≥ 16) — feed-in championship to round-of-16, full feed-in championship, modified feed-in championship

4. **Voluntary consolation** — when `constraints.voluntaryConsolation === true`, every recommendation is emitted twice: once bare, once with a `_VC` variant. The structural floor (`minMatchesPerPlayer`) is unchanged because VC is opt-in; only `totalMatches` grows by the expected sign-up volume (~50% of the flight, rounded up to the next power of two for the VC bracket). The card UI surfaces this with a `+VC` tag.

5. **Plan scoring** — composite weighted sum:
   - **Competitive** (60%): predicted COMPETITIVE band % from `predictDrawCompetitiveBands`, optionally distance-from-target if `targetCompetitivePct` supplied.
   - **Floor** (20%): `min(1, minMatchesPerPlayer / targetMatchesPerPlayer)`. Plans at or above target score full marks; plans below score linearly toward zero. Going above target is not penalized.
   - **Court utilization** (15%): closer to 1.0 is best; under-utilization counts at face value, over-capacity is penalized.
   - **Withdrawal risk** (5%): `1 - max(withdrawalRiskFactor)` across structures.

6. **Rank** — plans sorted by score descending, `rank` field assigned.

---

## Match-count semantics

`minMatchesPerPlayer` is the **structural guarantee** — the count every player gets when the bracket runs to completion (i.e., absent withdrawals). It is always an integer.

Withdrawal risk is exposed separately via `withdrawalRiskFactor` (0–1) — round-robin and Swiss are zero; consolation-bearing structures range up to 0.3 for compass and adaptive draws. The wizard surfaces this as a `WITHDRAWAL_RISK` warning chip when the factor crosses the 0.2 threshold; it does not fudge a fractional discount into the match-count number.

---

## Output

```ts
type RankedPlan = {
  rank: number;                   // 1 = best
  score: number;                  // 0..1
  strategy: 'EQUAL_COUNT' | 'EQUAL_BAND' | 'NATURAL_CLUSTER' | 'STAGGERED_SINGLE';
  variant?: string;
  flightStructures: Array<{
    flight: { label, participantIds, ratings };
    structure: {
      kind,
      variantId?,
      minMatchesPerPlayer,        // integer; structural guarantee
      withdrawalRiskFactor,       // 0..1
      voluntaryConsolation?,      // when true, this is a "+VC" twin
      totalMatches,
      ...
    };
    predictedBands: { competitive, decisive, routine };
  }>;
  aggregate: {
    competitive: number; decisive: number; routine: number;
    totalMatches: number;
    minMatchesPerPlayer: number;
    courtHoursRequired: number;
    courtHoursAvailable: number;
    courtUtilization: number;
  };
  warnings: Array<'BELOW_FLOOR' | 'OVER_CAPACITY' | 'WITHDRAWAL_RISK' | 'MIXED_GENDER_VARIANT' | 'COLLAPSED_CATEGORY'>;
};
```

---

## Example

```js
import { tournamentEngine } from 'tods-competition-factory';

const participants = [
  { participantId: 'p1', rating: 5.5 },
  { participantId: 'p2', rating: 5.4 },
  // ... 14 more
];

const result = tournamentEngine.suggestFormatPlans({
  participants,
  constraints: {
    courts: 4,
    days: 2,
    hoursPerDay: 8,
    targetMatchesPerPlayer: 3,
    targetCompetitivePct: 0.65,
    consolationAppetite: 'LIGHT',
    voluntaryConsolation: false,
  },
  governance: {
    allowedDrawTypes: ['SINGLE_ELIMINATION', 'ROUND_ROBIN', 'SWISS', 'FEED_IN'],
  },
});

console.log(result.distribution); // RatingDistributionStats
console.log(result.plans.slice(0, 5)); // top 5 ranked plans
```

---

## Related

- **`predictMatchUpCompetitiveBands` / `predictDrawCompetitiveBands`** — the band-distribution predictor consumed by step 5. See the [Competitive Bands Policy](../../policies/competitiveBands.md) page for the prediction model and policy controls.
- **[Distribution Visualization](./distribution.md)** — the rating-distribution donut/histogram component used alongside the engine output in the wizard UI.
- **[Example Table](./example.md)** — a worked example showing the full ranked plan table for a sample participant pool.
- **Format Wizard UI** (TMX) — the deterministic engine here is consumed by a tournament-context page (beta-flagged); UI rendering, the "Under consideration" lane, the per-event scoping, and "Apply Plan" mutations are documented in TMX, not factory.
