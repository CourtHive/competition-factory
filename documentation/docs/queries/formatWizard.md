---
title: Format Wizard — suggestFormatPlans
---

The **Format Wizard engine** (`tournamentEngine.suggestFormatPlans`) takes a participant pool, TD constraints, and optional governance caps, and returns a ranked table of plan candidates. It is the deterministic, LLM-free decision engine behind the level-based format wizard described in Dave Fish's _"Need For a Rating System"_ (2011).

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
  minMatchesFloor?: number; // soft preference, plans below floor flagged
  targetCompetitivePct?: number; // 0..1 target for the COMPETITIVE band
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
2. **Flighting strategies** — generates candidate flightings:
   - `EQUAL_COUNT` (k = 2/3/4/8)
   - `EQUAL_BAND` (0.5 / 1.0 rating-unit bands)
   - `NATURAL_CLUSTER` (cuts at the largest rating gaps)
   - `STAGGERED_SINGLE` (one flight, all participants)
3. **Structure catalog** — for each flight size, returns eligible structures filtered by `consolationAppetite` and `allowedDrawTypes`. Catalog kinds:
   - `SINGLE_ELIMINATION`, `FIRST_MATCH_LOSER_CONSOLATION`, `FIRST_ROUND_LOSER_CONSOLATION`, `DOUBLE_ELIMINATION`
   - `COMPASS` (size 7-8 and 13-16)
   - `ROUND_ROBIN` (single group ≤ 8) and `ROUND_ROBIN_WITH_PLAYOFF` (multi-group)
   - `SWISS` (3/5/7 rounds)
   - `DRAW_MATIC` (3/5 rounds — pairing-balanced)
   - `LUCKY_DRAW` (non-power-of-two only)
   - `ADAPTIVE` (cascading consolation Lucky Draw)
   - `STAGGERED_FRENCH`
4. **Plan scoring** — composite weighted sum:
   - **Competitive** (60%): predicted COMPETITIVE band % from `predictDrawCompetitiveBands`, optionally distance-from-target if `targetCompetitivePct` supplied.
   - **Floor** (20%): `effectiveMinMatchesPerPlayer / minMatchesFloor`, capped at 1.
   - **Court utilization** (15%): closer to 1.0 is best; under-utilization counts at face value, over-capacity is penalized.
   - **Withdrawal risk** (5%): `1 - max(withdrawalRiskFactor)` across structures.
5. **Rank** — plans sorted by score descending, `rank` field assigned.

---

## Withdrawal-risk discount

Each catalog entry declares a `withdrawalRiskFactor` (0–1) reflecting empirical observations that consolation-bearing structures suffer attrition (compass and adaptive draws have the highest factors at 0.3; round-robin and Swiss are zero). The engine reports both:

- `minMatchesPerPlayer` — the structural guarantee (assuming everyone plays)
- `effectiveMinMatchesPerPlayer` — discounted for typical attrition

The `floor` metric in scoring uses the **effective** number, so a 4-match guarantee on Compass scores lower than a 4-match guarantee on Round Robin.

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
    structure: { kind, variantId?, minMatchesPerPlayer, effectiveMinMatchesPerPlayer, totalMatches, withdrawalRiskFactor, ... };
    predictedBands: { competitive, decisive, routine };
  }>;
  aggregate: {
    competitive: number; decisive: number; routine: number;
    totalMatches: number;
    minMatchesPerPlayer: number;
    effectiveMinMatchesPerPlayer: number;
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
    minMatchesFloor: 3,
    targetCompetitivePct: 0.65,
    consolationAppetite: 'LIGHT',
  },
  governance: {
    allowedDrawTypes: ['SINGLE_ELIMINATION', 'ROUND_ROBIN', 'SWISS'],
  },
});

console.log(result.distribution); // RatingDistributionStats
console.log(result.plans.slice(0, 5)); // top 5 ranked plans
```

---

## Related

- **`predictMatchUpCompetitiveBands` / `predictDrawCompetitiveBands`** — the band-distribution predictor consumed by Step 4. See the [Competitive Bands Policy](../policies/competitiveBands.md) page for the prediction model and policy controls.
- **Format Wizard UI** (TMX) — the deterministic engine here is consumed by a tournament-level modal; UI rendering and "Apply Plan" mutations are documented in TMX, not factory.
