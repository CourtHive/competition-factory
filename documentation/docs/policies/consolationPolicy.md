---
title: Voluntary Consolation Policy
---

The **Voluntary Consolation Policy** (`POLICY_TYPE_VOLUNTARY_CONSOLATION`) controls eligibility for voluntary consolation draws based on participant performance in the main draw. This allows tournament directors to set criteria for which players can opt into consolation events.

**Policy Type:** `voluntaryConsolation`

**When to Use:**

- Limiting consolation entry to early-round losers
- Preventing strong players from dominating consolation
- Setting maximum wins before consolation ineligibility
- Limiting how many matchUps a participant has played
- Ensuring competitive balance in consolation draws

---

## Policy Structure

```ts
{
  voluntaryConsolation: {
    policyName?: string;               // Optional policy identifier
    winsLimit?: number;                // Most main-draw wins an eligible participant may have (1 or more)
    matchUpsLimit?: number;            // Most main-draw matchUps an eligible participant may have played
    requireLoss?: boolean;             // Default true: only participants who have lost
    requirePlay?: boolean;             // Default true: only participants who have played
    excludedMatchUpStatuses?: string[]; // matchUps with these statuses are not counted
    includeEventParticipants?: boolean; // consider event entries rather than draw entries
    allEntries?: boolean;              // consider every entry, placed in the draw or not
    finishingRoundLimit?: number;      // see the caution below
  }
}
```

**Attributes:**

- **winsLimit**: the most main-draw wins an eligible participant may have. It is tested for truthiness, so `0` is
  **no limit**, not "no wins". To admit only participants with no wins, use `matchUpsLimit: 1`: with the default
  `requireLoss`, that is the first-round losers.
- **matchUpsLimit**: the most main-draw matchUps an eligible participant may have played.
- **requireLoss** / **requirePlay**: both default to `true`, so a participant still in the draw, or one who has not
  played, is not eligible.

:::caution finishingRoundLimit
`finishingRound` counts back from the final (final = 1, semifinal = 2, …), and `finishingRoundLimit` **excludes** every
matchUp whose `finishingRound` is at or above the limit, which in a large draw is the early rounds. `finishingRoundLimit:
1` therefore excludes every matchUp, and no one is eligible. It is not a "lost in round N" rule; use `matchUpsLimit` or
`winsLimit` for that.
:::

---

## Basic Examples

### Limit to First-Round Losers

```js
import { policyConstants } from 'tods-competition-factory';
const { POLICY_TYPE_VOLUNTARY_CONSOLATION } = policyConstants;

// Only first-round losers: played one matchUp, and lost it
const firstRoundOnlyPolicy = {
  [POLICY_TYPE_VOLUNTARY_CONSOLATION]: {
    policyName: 'First Round Losers Only',
    matchUpsLimit: 1,
  },
};

// attach to the MAIN draw: eligibility is read from the draw being lost in
tournamentEngine.attachPolicies({
  policyDefinitions: firstRoundOnlyPolicy,
  drawId: 'main-draw-id',
});
```

### Limit to Early-Round Losers

```js
// Losers with at most one win: lost in round 1 or round 2
const earlyLosersPolicy = {
  [POLICY_TYPE_VOLUNTARY_CONSOLATION]: {
    policyName: 'Early Round Losers',
    winsLimit: 1,
  },
};
```

---

## Retrieving Eligible Participants

```js
// Get list of participants eligible for voluntary consolation
const { eligibleParticipants } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
  drawId: 'main-draw-id',
});

eligibleParticipants.forEach((participant) => {
  console.log(participant.participantName);
});

// Parameters passed directly override the attached policy
const { eligibleParticipants: earlyLosers } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
  drawId: 'main-draw-id',
  winsLimit: 1,
});
```

---

## Real-World Examples

### 32-Draw With 16-Player Consolation

```js
// Attach the policy to the main draw
tournamentEngine.attachPolicies({
  policyDefinitions: {
    [POLICY_TYPE_VOLUNTARY_CONSOLATION]: {
      matchUpsLimit: 1, // first-round losers only
    },
  },
  drawId: 'main-draw-id',
});

// After the first round completes
const { eligibleParticipants } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
  drawId: 'main-draw-id',
});

console.log(eligibleParticipants.length); // 16: the first-round losers
```

### Different Pools From One Main Draw

The policy is read from the main draw, so two pools from the same draw are two calls with different parameters:

```js
// First-round losers (16 in a completed 32 draw)
const { eligibleParticipants: firstRound } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
  drawId: 'main-draw-id',
  matchUpsLimit: 1,
});

// Losers with at most one win: rounds 1 and 2 (24 once round 2 is complete)
const { eligibleParticipants: firstTwoRounds } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
  drawId: 'main-draw-id',
  winsLimit: 1,
});
```

---

## Policy Application

### Drawing From Eligible Pool

```js
// Get eligible participants
const { eligibleParticipants } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
  drawId: 'main-draw-id',
});

// Generate consolation draw with eligible participants
const participantIds = eligibleParticipants.map((p) => p.participantId);

const { drawDefinition: consolationDraw } = tournamentEngine.generateDrawDefinition({
  drawSize: participantIds.length,
  drawType: SINGLE_ELIMINATION,
  eventId: 'consolation-event-id',
  seedingProfile: WATERFALL,
  automated: true,
  participants: eligibleParticipants,
});
```

---

## Notes

- Policy is checked when calling `getEligibleVoluntaryConsolationParticipants`
- **winsLimit**: Counts only completed wins in main draw; `0` means no limit
- **matchUpsLimit**: Counts main-draw matchUps played
- Participants not yet eliminated are excluded (still active in main draw)
- Participants already in consolation draw are excluded
- Walkover matches count as wins for the winner
- Retired matches count as wins for the winner
- Every limit is optional - omit for no restriction
- Policy can be overridden by passing parameters directly to eligibility method
- Typically attached at draw level (main draw)
- Used during consolation draw generation to determine eligible pool

---

## Related Methods

- `getEligibleVoluntaryConsolationParticipants` - Query eligible participants
- `generateDrawDefinition` - Create consolation draws with eligibility filters
- See [Draw Types](/docs/concepts/draw-types#pre-defined-draw-types) for consolation draw generation
