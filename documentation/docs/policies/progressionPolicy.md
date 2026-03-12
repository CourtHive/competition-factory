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
    doubleExitPropagateBye?: boolean;       // BYE instead of WALKOVER (default: false)
    autoPlaceQualifiers?: boolean;          // Auto-place qualifiers (default: false)
    autoReplaceQualifiers?: boolean;        // Replace if winningSide changes (default: false)
    autoRemoveQualifiers?: boolean;         // Remove if winningSide cleared (default: false)
  }
}
```

**Attributes:**

- **doubleExitPropagateBye**: When `true`, a BYE propagates to loser position instead of producing a WALKOVER in double-exit structures. Significant for providers who don't award ranking points for first-round walkovers.
  
- **autoPlaceQualifiers**: When `true`, qualifiers are randomly assigned to qualifier positions in the main draw when qualifying completes.
  
- **autoReplaceQualifiers**: When `true`, placed qualifiers will be replaced in target structures if the qualifying matchUp's `winningSide` is changed.
  
- **autoRemoveQualifiers**: When `true`, placed qualifiers will be removed from target structures if the qualifying matchUp's `winningSide` is removed.

---

## Default Policy

```js
import { POLICY_PROGRESSION_DEFAULT } from 'tods-competition-factory';

// Defaults:
// {
//   progression: {
//     doubleExitPropagateBye: false,    // Produce walkovers (standard)
//     autoPlaceQualifiers: false,       // Manual qualifier placement
//     autoReplaceQualifiers: false,     // Manual replacement
//     autoRemoveQualifiers: false       // Manual removal
//   }
// }
```

---

## Double-Exit BYE Propagation

### Standard Behavior (default: false)

```js
// When a participant withdraws before their first match in a double-exit structure:
// Opponent gets a WALKOVER win → advances
// Loser bracket receives a WALKOVER (may award ranking points)

const standardPolicy = {
  [POLICY_TYPE_PROGRESSION]: {
    policyName: 'Standard Progression',
    doubleExitPropagateBye: false  // Default
  }
};
```

### BYE Propagation (doubleExitPropagateBye: true)

```js
// When a participant withdraws before their first match:
// Opponent gets a BYE → advances
// Loser bracket receives a BYE (no ranking points)

const byePropagationPolicy = {
  [POLICY_TYPE_PROGRESSION]: {
    policyName: 'BYE Propagation',
    doubleExitPropagateBye: true  // BYE instead of WALKOVER
  }
};

tournamentEngine.attachPolicies({
  policyDefinitions: byePropagationPolicy
});
```

**Use Cases:**

- ITF events where first-round walkovers don't award ranking points
- Tournaments wanting consistent BYE handling
- Federations with specific walkover policies

---

## Automatic Qualifier Placement

### Manual Placement (default: false)

```js
// Default: tournament directors manually place qualifiers
const manualPlacement = {
  [POLICY_TYPE_PROGRESSION]: {
    autoPlaceQualifiers: false  // Default
  }
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
    autoPlaceQualifiers: true  // Automatic random assignment
  }
};

tournamentEngine.attachPolicies({
  policyDefinitions: autoPlacement
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
    autoPlaceQualifiers: true,      // Enable automatic placement
    autoReplaceQualifiers: true     // Replace if outcome changes
  }
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
    autoRemoveQualifiers: true      // Remove if winningSide cleared
  }
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
    autoPlaceQualifiers: true,      // Auto-place when qualifying completes
    autoReplaceQualifiers: true,    // Replace if winningSide changes
    autoRemoveQualifiers: true      // Remove if winningSide cleared
  }
};

tournamentEngine.attachPolicies({
  policyDefinitions: fullAutomation
});
```

---

## Real-World Examples

### ITF Event With BYE Propagation

```js
import { POLICY_TYPE_PROGRESSION } from 'tods-competition-factory';

// ITF rules: first-round walkovers don't award ranking points
const itfProgressionPolicy = {
  [POLICY_TYPE_PROGRESSION]: {
    policyName: 'ITF Progression',
    doubleExitPropagateBye: true,   // Use BYEs instead of walkovers
    autoPlaceQualifiers: false      // Manual qualifier placement (ITF standard)
  }
};

tournamentEngine.attachPolicies({
  policyDefinitions: itfProgressionPolicy
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
    autoRemoveQualifiers: true
  }
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
    doubleExitPropagateBye: false,      // Standard walkovers
    autoPlaceQualifiers: false,         // Manual placement
    autoReplaceQualifiers: false,       // Manual replacement
    autoRemoveQualifiers: false         // Manual removal
  }
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
      autoReplaceQualifiers: true
    }
  },
  eventId: 'singles-event-id'
});

tournamentEngine.attachPolicies({
  policyDefinitions: {
    [POLICY_TYPE_PROGRESSION]: {
      autoPlaceQualifiers: false  // Manual for doubles
    }
  },
  eventId: 'doubles-event-id'
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
