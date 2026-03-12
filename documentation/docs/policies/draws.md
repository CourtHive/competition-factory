---
title: Draws Policy
---

The **Draws Policy** (`POLICY_TYPE_DRAWS`) controls draw type coercion rules, including minimum participant requirements for specific draw types. This policy helps prevent inappropriate draw type selection based on participant count.

**Policy Type:** `draws`

**When to Use:**

- Setting minimum participants for Round Robin with Playoffs
- Preventing automatic draw type coercion
- Enforcing draw type requirements per federation rules
- Customizing draw type selection logic

---

## Policy Structure

```ts
{
  draws: {
    policyName?: string;                    // Optional policy identifier

    // Draw type coercion rules
    drawTypeCoercion?: boolean | {
      [drawType: string]: number;           // Minimum participants for each draw type
    };
  }
}
```

**Attributes:**

- **drawTypeCoercion**: Controls automatic draw type adjustments
  - `false` - Disables all draw type coercion
  - `true` - Enables default coercion rules (default behavior)
  - `Object` - Custom minimum participant counts per draw type

---

## Default Policy

```js
import { POLICY_DRAWS_DEFAULT } from 'tods-competition-factory';

// Default: Empty policy (coercion enabled with system defaults)
// {
//   draws: {
//     // drawTypeCoercion: true (default - not specified)
//   }
// }
```

---

## Basic Examples

### Disable All Coercion

```js
import { POLICY_TYPE_DRAWS } from 'tods-competition-factory';

// Prevent any automatic draw type changes
const noCoercionPolicy = {
  [POLICY_TYPE_DRAWS]: {
    policyName: 'No Coercion',
    drawTypeCoercion: false, // No automatic adjustments
  },
};

tournamentEngine.attachPolicies({
  policyDefinitions: noCoercionPolicy,
});

// Draw type will be exactly as specified, even if inappropriate
```

### Set Minimum Participants for Round Robin with Playoff

```js
// Require at least 5 participants for Round Robin with Playoff
const roundRobinMinimumPolicy = {
  [POLICY_TYPE_DRAWS]: {
    policyName: 'Round Robin Minimum',
    drawTypeCoercion: {
      ROUND_ROBIN_WITH_PLAYOFF: 5, // Min 5 participants
    },
  },
};

tournamentEngine.attachPolicies({
  policyDefinitions: roundRobinMinimumPolicy,
});

// Attempt to create ROUND_ROBIN_WITH_PLAYOFF with 4 participants
const result = tournamentEngine.generateDrawDefinition({
  drawType: 'ROUND_ROBIN_WITH_PLAYOFF',
  drawSize: 4, // Below minimum
  eventId: 'event-1',
});

// Result: Draw type may be coerced to simpler Round Robin
```

---

## Draw Type Coercion Examples

### Custom Minimums for Multiple Draw Types

```js
const customDrawMinimumsPolicy = {
  [POLICY_TYPE_DRAWS]: {
    policyName: 'Custom Draw Minimums',
    drawTypeCoercion: {
      ROUND_ROBIN_WITH_PLAYOFF: 5, // Min 5 for RR with playoff
      COMPASS: 8, // Min 8 for compass draw
      MODIFIED_FEED_IN_CHAMPIONSHIP: 8, // Min 8 for modified feed-in
    },
  },
};

tournamentEngine.attachPolicies({
  policyDefinitions: customDrawMinimumsPolicy,
});

// Below-minimum requests will be coerced to simpler draw types
```

### Federation-Specific Rules

```js
// ITF: Prefer Round Robin with Playoff for smaller groups
const itfDrawPolicy = {
  [POLICY_TYPE_DRAWS]: {
    policyName: 'ITF Draw Policy',
    drawTypeCoercion: {
      ROUND_ROBIN_WITH_PLAYOFF: 4, // Allow RR+playoff with as few as 4
    },
  },
};

// USTA: Require more participants for complex draws
const ustaDrawPolicy = {
  [POLICY_TYPE_DRAWS]: {
    policyName: 'USTA Draw Policy',
    drawTypeCoercion: {
      ROUND_ROBIN_WITH_PLAYOFF: 6, // Minimum 6 participants
      COMPASS: 16, // Full compass draw only
    },
  },
};
```

---

## Real-World Examples

### Club Tournament (Flexible)

```js
// Club tournaments often have small draws - be flexible
const clubDrawPolicy = {
  [POLICY_TYPE_DRAWS]: {
    policyName: 'Club Flexibility',
    drawTypeCoercion: {
      ROUND_ROBIN_WITH_PLAYOFF: 3, // Allow very small RR+playoff
    },
  },
};
```

### Professional Event (Strict)

```js
// Professional events require proper draw sizes
const professionalDrawPolicy = {
  [POLICY_TYPE_DRAWS]: {
    policyName: 'Professional Standards',
    drawTypeCoercion: {
      ROUND_ROBIN_WITH_PLAYOFF: 8, // Full groups required
      COMPASS: 16, // Full compass only
      MODIFIED_FEED_IN_CHAMPIONSHIP: 16, // Full feed-in only
    },
  },
};
```

### Development/Testing (No Coercion)

```js
// Testing environment - allow any draw configuration
const testingDrawPolicy = {
  [POLICY_TYPE_DRAWS]: {
    policyName: 'Testing Policy',
    drawTypeCoercion: false, // No restrictions
  },
};

// Useful for:
// - Unit testing edge cases
// - Demonstrating draw structures
// - Debugging draw generation logic
```

---

## Draw Type Minimum Recommendations

Based on draw structure requirements:

| Draw Type                     | Recommended Minimum | Notes                             |
| ----------------------------- | ------------------- | --------------------------------- |
| SINGLE_ELIMINATION            | 2                   | Any number works                  |
| DOUBLE_ELIMINATION            | 4                   | 2 players not meaningful          |
| ROUND_ROBIN                   | 2                   | Any number works                  |
| ROUND_ROBIN_WITH_PLAYOFF      | 4-6                 | Need enough for groups + playoff  |
| COMPASS                       | 8                   | Requires proper bracket structure |
| FEED_IN                       | 4                   | Need losers to feed               |
| MODIFIED_FEED_IN_CHAMPIONSHIP | 8                   | Complex structure                 |
| CURTIS_CONSOLATION            | 8                   | Proper consolation brackets       |

---

## Policy Behavior

### When Coercion is Disabled (false)

```js
drawTypeCoercion: false;

// Behavior:
// - System uses exact draw type specified
// - No automatic adjustments
// - May result in invalid/awkward draws
// - Tournament director has full control
```

### When Coercion is Enabled (true or object)

```js
drawTypeCoercion: true; // OR
drawTypeCoercion: {
  ROUND_ROBIN_WITH_PLAYOFF: 5;
}

// Behavior:
// - System checks participant count
// - Compares against minimums
// - Automatically adjusts to simpler draw type if needed
// - Ensures draw structure integrity
```

---

## Common Scenarios

### Scenario 1: Small Draw Size

```js
// Policy requires minimum 5 for RR+playoff
drawTypeCoercion: {
  ROUND_ROBIN_WITH_PLAYOFF: 5;
}

// Request: ROUND_ROBIN_WITH_PLAYOFF with 4 participants
tournamentEngine.generateDrawDefinition({
  drawType: 'ROUND_ROBIN_WITH_PLAYOFF',
  drawSize: 4,
  eventId: 'event-1',
});

// Result: Coerced to ROUND_ROBIN (simpler)
// Reason: 4 < 5 minimum
```

### Scenario 2: Exact Minimum

```js
// Policy requires minimum 5
drawTypeCoercion: {
  ROUND_ROBIN_WITH_PLAYOFF: 5;
}

// Request: ROUND_ROBIN_WITH_PLAYOFF with 5 participants
tournamentEngine.generateDrawDefinition({
  drawType: 'ROUND_ROBIN_WITH_PLAYOFF',
  drawSize: 5,
  eventId: 'event-1',
});

// Result: ROUND_ROBIN_WITH_PLAYOFF as requested
// Reason: 5 >= 5 minimum
```

### Scenario 3: Coercion Disabled

```js
// No coercion
drawTypeCoercion: false;

// Request: ROUND_ROBIN_WITH_PLAYOFF with 2 participants
tournamentEngine.generateDrawDefinition({
  drawType: 'ROUND_ROBIN_WITH_PLAYOFF',
  drawSize: 2,
  eventId: 'event-1',
});

// Result: ROUND_ROBIN_WITH_PLAYOFF as requested (even though impractical)
// Reason: Coercion disabled
```

---

## Event-Specific Draw Policies

```js
// Tournament-wide: Be strict
tournamentEngine.attachPolicies({
  policyDefinitions: {
    [POLICY_TYPE_DRAWS]: {
      drawTypeCoercion: {
        ROUND_ROBIN_WITH_PLAYOFF: 8,
      },
    },
  },
});

// Consolation event: Be flexible
tournamentEngine.attachPolicies({
  policyDefinitions: {
    [POLICY_TYPE_DRAWS]: {
      drawTypeCoercion: {
        ROUND_ROBIN_WITH_PLAYOFF: 4, // Smaller groups OK
      },
    },
  },
  eventId: 'consolation-event-id',
});
```

---

## Notes

- **Default behavior**: Coercion enabled with system defaults
- **false disables all coercion**: Exact draw types used
- **Object sets custom minimums**: Per draw type control
- Only specified draw types in object are affected
- Draw types not in policy use system defaults
- Coercion happens during draw generation
- No error thrown - draw type silently adjusted
- Tournament directors should be notified of coercion
- Policy applies at generation time, not retroactively
- Event-level policy overrides tournament policy
- Useful for preventing inappropriate draw selections
- Testing/development often uses `drawTypeCoercion: false`

---

## Related Concepts

- [Draw Types](/docs/concepts/draw-types) - Understanding draw structures
- [Draw Types](/docs/concepts/draw-types#pre-defined-draw-types) - Round Robin and complex group structures

---

## Draw Type Constants

```js
import {
  SINGLE_ELIMINATION,
  DOUBLE_ELIMINATION,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  COMPASS,
  FEED_IN,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  CURTIS_CONSOLATION,
} from 'tods-competition-factory';

// Use constants in policy configuration
const policy = {
  [POLICY_TYPE_DRAWS]: {
    drawTypeCoercion: {
      [ROUND_ROBIN_WITH_PLAYOFF]: 5,
      [COMPASS]: 8,
    },
  },
};
```
