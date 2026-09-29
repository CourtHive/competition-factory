---
title: Progression Policy
---

The **Progression Policy** (`POLICY_TYPE_PROGRESSION`) controls automated behaviors related to participant progression through tournament structures, including qualifier placement, double-exit BYE propagation, and qualifier replacement rules.

**Policy Type:** `progression`

**When to Use:**

- Automatically placing qualifiers into main draws
- Controlling BYE propagation in double-exit scenarios
- Managing qualifier replacement when matchUp outcomes change
- Automating participant flow between structures
- Enforcing federation-specific progression rules

---

## Policy Structure

```ts
{
  progression: {
    policyName?: string;                    // Optional policy identifier
    doubleExitPropagateBye?: boolean;       // a double exit produces a BYE, not an exit (default: true)
    autoPlaceQualifiers?: boolean;          // Auto-place qualifiers (default: false)
    autoReplaceQualifiers?: boolean;        // Replace if winningSide changes (default: false)
    autoRemoveQualifiers?: boolean;         // Remove if winningSide cleared (default: false)
  }
}
```

**Attributes:**

- **doubleExitPropagateBye**: A double exit (`DOUBLE_WALKOVER`, `DOUBLE_DEFAULT`) removes both competitors, so nobody will arrive in the position its loser would have taken in a connected structure. When `true` — the default — that position becomes a BYE. When `false` it receives a produced `WALKOVER` or `DEFAULTED` instead. Set it to `false` if you award ranking points by `matchUpStatus` and need a first-round walkover told apart from a BYE.

- **autoPlaceQualifiers**: When `true`, qualifiers are randomly assigned to qualifier positions in the main draw when qualifying completes.

- **autoReplaceQualifiers**: When `true`, placed qualifiers will be replaced in target structures if the qualifying matchUp's `winningSide` is changed.

- **autoRemoveQualifiers**: When `true`, placed qualifiers will be removed from target structures if the qualifying matchUp's `winningSide` is removed.

---

## Default Policy

```js
import { fixtures } from 'tods-competition-factory';
const { POLICY_PROGRESSION_DEFAULT } = fixtures.policies;

// Defaults:
// {
//   progression: {
//     doubleExitPropagateBye: true,     // A double exit produces a BYE
//     autoPlaceQualifiers: false,       // Manual qualifier placement
//     autoReplaceQualifiers: false,     // Manual replacement
//     autoRemoveQualifiers: false       // Manual removal
//   }
// }
```

---

## Double-Exit BYE Propagation

### BYE Propagation (default: true)

```js
// When a first-round matchUp is a DOUBLE_WALKOVER or DOUBLE_DEFAULT:
// neither competitor advances, and neither is a loser who can be fed into a connected structure
// the position that loser would have taken becomes a BYE, and its opponent advances through it

const byePropagationPolicy = {
  [POLICY_TYPE_PROGRESSION]: {
    policyName: 'BYE Propagation',
    doubleExitPropagateBye: true, // Default
  },
};
```

Within the structure where the double exit happened nothing changes: the next matchUp still receives a
produced `WALKOVER` or `DEFAULTED`, and whoever arrives opposite it is awarded it. The policy governs
only the position in the CONNECTED structure.

### Produced Exits (doubleExitPropagateBye: false)

```js
// When a first-round matchUp is a DOUBLE_WALKOVER or DOUBLE_DEFAULT:
// the position its loser would have taken receives a produced WALKOVER or DEFAULTED instead of a BYE
// (may award ranking points, depending on the provider's rules)

const producedExitPolicy = {
  [POLICY_TYPE_PROGRESSION]: {
    policyName: 'Produced Exits',
    doubleExitPropagateBye: false,
  },
};

tournamentEngine.attachPolicies({
  policyDefinitions: producedExitPolicy,
});
```

**When to turn it off:**

- You award ranking points by `matchUpStatus` and a produced walkover must count where a BYE would not
- Your published results must show that a position was vacated by a walkover rather than by a BYE

---

## Automatic Qualifier Placement

### Manual Placement (default: false)

```js
// Default: tournament directors manually place qualifiers
const manualPlacement = {
  [POLICY_TYPE_PROGRESSION]: {
    autoPlaceQualifiers: false, // Default
  },
};

// Manual placement workflow:
// 1. Qualifying completes
// 2. TD reviews qualifiers
// 3. TD manually assigns qualifiers to main draw positions
```

### Automatic Placement (autoPlaceQualifiers: true)

```js
// Qualifiers automatically placed when qualifying completes
const autoPlacement = {
  [POLICY_TYPE_PROGRESSION]: {
    policyName: 'Auto Qualifier Placement',
    autoPlaceQualifiers: true, // Automatic random assignment
  },
};

tournamentEngine.attachPolicies({
  policyDefinitions: autoPlacement,
});

// Automatic workflow:
// 1. Qualifying completes
// 2. Qualifiers automatically assigned to available qualifier positions
// 3. Random distribution among available qualifier slots
```

**Use Cases:**

- Streamlined tournament operations
- Events with many qualifiers
- Automated tournament management systems
- Consistency in qualifier placement

---

## Qualifier Replacement and Removal

### Replacement on winningSide Change

```js
const replacementPolicy = {
  [POLICY_TYPE_PROGRESSION]: {
    policyName: 'Auto Replacement',
    autoPlaceQualifiers: true, // Enable automatic placement
    autoReplaceQualifiers: true, // Replace if outcome changes
  },
};

// Scenario:
// 1. Qualifier A wins final qualifying matchUp → placed in main draw
// 2. Referee changes winningSide to Qualifier B → A removed, B placed
// 3. Main draw automatically updated
```

### Removal on winningSide Cleared

```js
const removalPolicy = {
  [POLICY_TYPE_PROGRESSION]: {
    policyName: 'Auto Removal',
    autoPlaceQualifiers: true,
    autoRemoveQualifiers: true, // Remove if winningSide cleared
  },
};

// Scenario:
// 1. Qualifier A placed in main draw
// 2. Referee clears winningSide from qualifying matchUp
// 3. Qualifier A automatically removed from main draw
```

### Combined Replacement and Removal

```js
const fullAutomation = {
  [POLICY_TYPE_PROGRESSION]: {
    policyName: 'Full Qualifier Automation',
    autoPlaceQualifiers: true, // Auto-place when qualifying completes
    autoReplaceQualifiers: true, // Replace if winningSide changes
    autoRemoveQualifiers: true, // Remove if winningSide cleared
  },
};

tournamentEngine.attachPolicies({
  policyDefinitions: fullAutomation,
});
```

---

## Real-World Examples

### ITF Event With BYE Propagation

```js
import { policyConstants } from 'tods-competition-factory';
const { POLICY_TYPE_PROGRESSION } = policyConstants;

// ITF rules: first-round walkovers don't award ranking points
const itfProgressionPolicy = {
  [POLICY_TYPE_PROGRESSION]: {
    policyName: 'ITF Progression',
    doubleExitPropagateBye: true, // Use BYEs instead of walkovers
    autoPlaceQualifiers: false, // Manual qualifier placement (ITF standard)
  },
};

tournamentEngine.attachPolicies({
  policyDefinitions: itfProgressionPolicy,
});
```

### Automated Tournament System

```js
// Fully automated progression for online tournament platform
const automatedProgressionPolicy = {
  [POLICY_TYPE_PROGRESSION]: {
    policyName: 'Fully Automated Progression',
    doubleExitPropagateBye: false,
    autoPlaceQualifiers: true,
    autoReplaceQualifiers: true,
    autoRemoveQualifiers: true,
  },
};

// Benefits:
// - No manual intervention needed
// - Real-time updates as qualifying completes
// - Automatic corrections if results change
// - Consistent behavior across all events
```

### Conservative Manual Control

```js
// Tournament director maintains full control
const manualControlPolicy = {
  [POLICY_TYPE_PROGRESSION]: {
    policyName: 'Manual Control',
    doubleExitPropagateBye: false, // Standard walkovers
    autoPlaceQualifiers: false, // Manual placement
    autoReplaceQualifiers: false, // Manual replacement
    autoRemoveQualifiers: false, // Manual removal
  },
};

// Use when:
// - Special considerations for qualifier placement
// - Seeding adjustments needed
// - Complex multi-event scenarios
// - TD preference for manual control
```

---

## Policy Application

### Event-Level Progression

```js
// Different progression rules for different events
tournamentEngine.attachPolicies({
  policyDefinitions: {
    [POLICY_TYPE_PROGRESSION]: {
      autoPlaceQualifiers: true,
      autoReplaceQualifiers: true,
    },
  },
  eventId: 'singles-event-id',
});

tournamentEngine.attachPolicies({
  policyDefinitions: {
    [POLICY_TYPE_PROGRESSION]: {
      autoPlaceQualifiers: false, // Manual for doubles
    },
  },
  eventId: 'doubles-event-id',
});
```

---

## Notes

- **Default behavior**: All automation features disabled for maximum control
- **doubleExitPropagateBye**: Only affects double-exit structures (e.g., double-elimination, Curtis Consolation)
- **autoPlaceQualifiers**: Requires qualifier positions defined in main draw
- **autoReplaceQualifiers**: Only works when `autoPlaceQualifiers: true`
- **autoRemoveQualifiers**: Only works when `autoPlaceQualifiers: true`
- Policies affect progression between linked structures
- Tournament-level policy applies to all events unless overridden
- Event-level policy overrides tournament-level settings
- Automatic placement is random among available qualifier positions
- BYE vs. WALKOVER distinction important for ranking points
- Qualifier replacement preserves draw integrity
- Manual control allows for special seeding considerations

---

## Related Concepts

- [Draw Structures](/docs/concepts/draw-types) - Understanding structure types
- [Draw Types](/docs/concepts/draw-types#pre-defined-draw-types) - Double-exit and qualifying scenarios
