---
title: Voluntary Consolation Policy
---

The **Voluntary Consolation Policy** (`POLICY_TYPE_VOLUNTARY_CONSOLATION`) controls eligibility for voluntary consolation draws based on participant performance in the main draw. This allows tournament directors to set criteria for which players can opt into consolation events.

**Policy Type:** `voluntaryConsolation`

**When to Use:**

- Limiting consolation entry to early-round losers
- Preventing strong players from dominating consolation
- Setting maximum wins before consolation ineligibility  
- Defining finishing round limits for consolation entry
- Ensuring competitive balance in consolation draws

---

## Policy Structure

```ts
{
  voluntaryConsolation: {
    policyName?: string;             // Optional policy identifier
    winsLimit?: number;              // Max wins in main draw before ineligible
    finishingRoundLimit?: number;    // Min finishing round for eligibility
  }
}
```

**Attributes:**

- **winsLimit**: Maximum number of wins a participant can have in the main draw and still be eligible for consolation. Default: no limit.
- **finishingRoundLimit**: Minimum `finishingRound` value required for eligibility. Participants who advance beyond this round are ineligible. Default: no limit.

---

## Basic Examples

### Limit to First-Round Losers

```js
import { POLICY_TYPE_VOLUNTARY_CONSOLATION } from 'tods-competition-factory';

// Only first-round losers can enter consolation
const firstRoundOnlyPolicy = {
  [POLICY_TYPE_VOLUNTARY_CONSOLATION]: {
    policyName: 'First Round Losers Only',
    winsLimit: 0,              // No wins allowed
    finishingRoundLimit: 1      // Must lose in round 1
  }
};

tournamentEngine.attachPolicies({
  policyDefinitions: firstRoundOnlyPolicy,
  drawId: 'main-draw-id'
});
```

### Limit to Early-Round Losers

```js
// Players who win 1 or fewer matches can enter
const earlyLosersPolicy = {
  [POLICY_TYPE_VOLUNTARY_CONSOLATION]: {
    policyName: 'Early Round Losers',
    winsLimit: 1,               // Maximum 1 win
    finishingRoundLimit: 2      // Lost in round 1 or 2
  }
};
```

### No Winners Allowed

```js
// Only players with zero wins
const noWinnersPolicy = {
  [POLICY_TYPE_VOLUNTARY_CONSOLATION]: {
    policyName: 'No Winners',
    winsLimit: 0
    // finishingRoundLimit not specified - any round OK as long as no wins
  }
};
```

---

## Retrieving Eligible Participants

```js
// Get list of participants eligible for voluntary consolation
const { eligibleParticipants } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
  drawId: 'main-draw-id'
});

console.log(eligibleParticipants.length); // e.g., 16
eligibleParticipants.forEach(participant => {
  console.log(`${participant.participantName}: ${participant.matchUpsWon} wins`);
});

// With custom policy parameters (override attached policy)
const { eligibleParticipants } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
  drawId: 'main-draw-id',
  winsLimit: 1,
  finishingRoundLimit: 2
});
```

---

## Real-World Examples

### 32-Draw With 16-Player Consolation

```js
// Generate main draw
const { drawDefinition } = tournamentEngine.generateDrawDefinition({
  drawSize: 32,
  drawType: SINGLE_ELIMINATION,
  eventId: 'event-1'
});

// Attach voluntary consolation policy
tournamentEngine.attachPolicies({
  policyDefinitions: {
    [POLICY_TYPE_VOLUNTARY_CONSOLATION]: {
      winsLimit: 0,           // First-round losers only
      finishingRoundLimit: 1
    }
  },
  drawId: drawDefinition.drawId
});

// After first round completes, get eligible participants
const { eligibleParticipants } = 
  tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    drawId: drawDefinition.drawId
  });

// Should return 16 first-round losers
console.log(eligibleParticipants.length); // 16
```

### Progressive Consolation Eligibility

```js
// Different consolation stages for different losers
const policies = {
  // Feed consolation: first-round losers
  feedConsolation: {
    [POLICY_TYPE_VOLUNTARY_CONSOLATION]: {
      policyName: 'Feed Consolation',
      winsLimit: 0,
      finishingRoundLimit: 1
    }
  },
  
  // Playoff consolation: second-round losers
  playoffConsolation: {
    [POLICY_TYPE_VOLUNTARY_CONSOLATION]: {
      policyName: 'Playoff Consolation',
      winsLimit: 1,
      finishingRoundLimit: 2
    }
  }
};

// Attach to different consolation structures
tournamentEngine.attachPolicies({
  policyDefinitions: policies.feedConsolation,
  drawId: 'feed-consolation-draw-id'
});

tournamentEngine.attachPolicies({
  policyDefinitions: policies.playoffConsolation,
  drawId: 'playoff-consolation-draw-id'
});
```

---

## Policy Application

### Drawing From Eligible Pool

```js
// Get eligible participants
const { eligibleParticipants } = 
  tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    drawId: 'main-draw-id'
  });

// Generate consolation draw with eligible participants
const participantIds = eligibleParticipants.map(p => p.participantId);

const { drawDefinition: consolationDraw } = 
  tournamentEngine.generateDrawDefinition({
    drawSize: participantIds.length,
    drawType: SINGLE_ELIMINATION,
    eventId: 'consolation-event-id',
    seedingProfile: WATERFALL,
    automated: true,
    participants: eligibleParticipants
  });
```

---

## Notes

- Policy is checked when calling `getEligibleVoluntaryConsolationParticipants`
- **winsLimit**: Counts only completed wins in main draw  
- **finishingRoundLimit**: Based on `finishingRound` attribute of matchUps
- Participants not yet eliminated are excluded (still active in main draw)
- Participants already in consolation draw are excluded
- Walkover matches count as wins for the winner
- Retired matches count as wins for the winner
- Both parameters are optional - omit for no restriction
- Policy can be overridden by passing parameters directly to eligibility method
- Typically attached at draw level (main draw)
- Used during consolation draw generation to determine eligible pool

---

## Related Methods

- `getEligibleVoluntaryConsolationParticipants` - Query eligible participants
- `generateDrawDefinition` - Create consolation draws with eligibility filters
- See [Draw Types](/docs/concepts/draw-types#pre-defined-draw-types) for consolation draw generation
