---
title: Policy Governor
---

```js
import { policyGovernor } from 'tods-competition-factory';
```

The **policyGovernor** manages policy definitions that control tournament behavior, including seeding, scoring, avoidance rules, and position actions. Policies can be attached at tournament, event, or draw levels with hierarchical inheritance.

**Policy Types Include:**

- `POLICY_TYPE_SEEDING` - Seeding placement rules
- `POLICY_TYPE_SCORING` - Scoring and completion requirements
- `POLICY_TYPE_AVOIDANCE` - Participant separation rules
- `POLICY_TYPE_POSITION_ACTIONS` - Available position actions
- `POLICY_TYPE_SCORING_USTA` - USTA-specific scoring rules
- `POLICY_TYPE_SCHEDULING` - Scheduling constraints

See [Policies Documentation](/docs/concepts/policies) for detailed policy specifications.

---

## attachPolicies

Attaches policy definitions to tournaments, events, or draws. Policies control various aspects of tournament behavior and are inherited hierarchically (draw policies override event policies, which override tournament policies). See examples in [Attach Default Policy](../concepts/scheduling-policy.mdx#attach-default-policy), [Combined with Scheduling Policy](../concepts/scheduling-profile.mdx#combined-with-scheduling-policy), [Privacy by Default](../concepts/publishing/publishing-participants.md#privacy-by-default), [Policy Configuration](../concepts/actions.mdx#policy-configuration), [Policy Configuration](../concepts/actions.mdx#policy-configuration), and 1 more.

**Purpose:** Apply competition rules and behavioral policies to tournament structures. Enables customization of seeding algorithms, scoring requirements, participant separation rules, and available administrative actions.

**When to Use:**

- Setting tournament-wide default policies
- Applying event-specific scoring rules
- Configuring draw-level seeding policies
- Establishing avoidance policies (e.g., same country/club)
- Controlling available position actions for tournament staff
- Applying federation-specific rules (ITF, USTA, etc.)

**Parameters:**

```ts
{
  policyDefinitions: PolicyDefinitions;   // Required - policies to attach
  tournamentRecords?: TournamentRecords;  // Apply to multiple tournaments
  tournamentRecord?: Tournament;          // Apply to single tournament
  event?: Event;                          // Apply to specific event
  drawDefinition?: DrawDefinition;        // Apply to specific draw
  tournamentId?: string;                  // Tournament ID for notifications
  eventId?: string;                       // Event ID (alternative to event object)
  drawId?: string;                        // Draw ID (alternative to drawDefinition object)
  allowReplacement?: boolean;             // Allow replacing existing policies (default: false)
}

// PolicyDefinitions structure
type PolicyDefinitions = {
  [policyType: string]: {
    policyName?: string;                  // Optional policy name/description
    [key: string]: any;                   // Policy-specific configuration
  };
};
```

**Returns:**

```ts
{
  success: boolean;
  applied?: string[];                     // Array of applied policy types
  error?: ErrorType;                      // EXISTING_POLICY_TYPE, INVALID_VALUES, etc.
}
```

**Examples:**

```js
import { tournamentEngine } from 'tods-competition-factory';
import { policyConstants } from 'tods-competition-factory';
const { POLICY_TYPE_SCORING, POLICY_TYPE_SEEDING } = policyConstants;

tournamentEngine.setState(tournamentRecord);

// Attach tournament-level policy
const seedingPolicy = {
  [POLICY_TYPE_SEEDING]: {
    policyName: 'ITF Seeding',
    seedingProfile: 'ITF',
  },
};

let result = tournamentEngine.attachPolicies({
  policyDefinitions: seedingPolicy,
});
console.log(result.applied); // ['seeding']

// Attach event-specific policy
const scoringPolicy = {
  [POLICY_TYPE_SCORING]: {
    policyName: 'USTA Scoring',
    requireParticipantsForScoring: true, // Require participants present
    requireAllPositionsAssigned: false,
  },
};

result = tournamentEngine.attachPolicies({
  policyDefinitions: scoringPolicy,
  eventId: 'event-1',
});

// Attach draw-specific policy (overrides event/tournament policies)
const avoidancePolicy = {
  [POLICY_TYPE_AVOIDANCE]: {
    policyName: 'Country Avoidance',
    policyAttributes: [
      {
        key: 'person.nationalityCode', // Path to attribute to check
        value: true, // Avoid matching values
      },
    ],
  },
};

result = tournamentEngine.attachPolicies({
  policyDefinitions: avoidancePolicy,
  drawId: 'draw-1',
});

// Replace existing policy
result = tournamentEngine.attachPolicies({
  policyDefinitions: seedingPolicy,
  allowReplacement: true, // Allows updating existing policy
});

// Attach multiple policies at once
const multiplePolicies = {
  [POLICY_TYPE_SEEDING]: {
    policyName: 'Custom Seeding',
    seedingProfile: 'WATERFALL',
  },
  [POLICY_TYPE_SCORING]: {
    policyName: 'Custom Scoring',
    requireParticipantsForScoring: false,
  },
};

result = tournamentEngine.attachPolicies({
  policyDefinitions: multiplePolicies,
});
console.log(result.applied); // ['seeding', 'scoring']

// Apply to all tournaments in competition
import { competitionEngine } from 'tods-competition-factory';

competitionEngine.setState(tournamentRecords);
result = competitionEngine.attachPolicies({
  tournamentRecords,
  policyDefinitions: seedingPolicy,
});

// Error handling
result = tournamentEngine.attachPolicies({
  policyDefinitions: seedingPolicy, // Already attached
});
console.log(result.error); // EXISTING_POLICY_TYPE

result = tournamentEngine.attachPolicies({
  policyDefinitions: {
    [POLICY_TYPE_SEEDING]: { policyName: 'Invalid' }, // Missing required attributes
  },
});
console.log(result.error); // INVALID_VALUES
```

**Notes:**

- Policies are stored in APPLIED_POLICIES extension
- Lower-level policies override higher-level (draw > event > tournament)
- `allowReplacement: true` required to update existing policy of same type
- Policy definitions must include at least one attribute beyond `policyName`
- Invalid policy structures return INVALID_VALUES error
- Attempting to attach existing policy without `allowReplacement` returns EXISTING_POLICY_TYPE
- Policy changes at draw level trigger draw modification notifications
- See [Policy Documentation](/docs/concepts/policies) for specific policy schemas
- Common policy types defined in `@Constants/policyConstants`

---

## findPolicy

Finds and returns a specific policy type from the hierarchical policy structure (draw → event → tournament), returning the most specific policy found.

**Purpose:** Retrieve active policy configuration for a specific policy type, respecting the hierarchical override system. Essential for understanding which rules are currently in effect.

**When to Use:**

- Checking active policy configuration before operations
- Validating policy settings for specific contexts
- Debugging policy inheritance and overrides
- Building UI that displays current policy settings
- Verifying policy application in tests

**Parameters:**

```ts
{
  policyType: string;                     // Required - type of policy to find
  tournamentRecord?: Tournament;          // Tournament to search
  tournamentId?: string;                  // Tournament ID (alternative)
  event?: Event;                          // Event to search
  eventId?: string;                       // Event ID (alternative)
  drawDefinition?: DrawDefinition;        // Draw to search
  drawId?: string;                        // Draw ID (alternative)
  structure?: Structure;                  // Structure to search
}
```

**Returns:**

```ts
{
  policy?: PolicyDefinition;              // Found policy object
  error?: ErrorType;                      // POLICY_NOT_FOUND if not found
}
```

**Hierarchy Resolution:**
The method searches in order: structure → draw → event → tournament, returning the first match found (most specific policy wins).

**Examples:**

```js
import { tournamentEngine } from 'tods-competition-factory';
import { policyConstants } from 'tods-competition-factory';
const { POLICY_TYPE_SEEDING } = policyConstants;

tournamentEngine.setState(tournamentRecord);

// Find tournament-level policy
const { policy } = tournamentEngine.findPolicy({
  policyType: POLICY_TYPE_SEEDING,
});

console.log(policy);
// {
//   policyName: 'ITF Seeding',
//   seedingProfile: 'ITF'
// }

// Find event-specific policy (may override tournament policy)
const { policy } = tournamentEngine.findPolicy({
  policyType: POLICY_TYPE_SCORING,
  eventId: 'event-1',
});

// Find draw-specific policy (highest priority)
const { policy } = tournamentEngine.findPolicy({
  policyType: POLICY_TYPE_AVOIDANCE,
  eventId: 'event-1',
  drawId: 'draw-1',
});

// Policy not found
const { policy, error } = tournamentEngine.findPolicy({
  policyType: 'NONEXISTENT_POLICY',
});
console.log(error); // POLICY_NOT_FOUND

// Check for policy existence before using
const { policy: scoringPolicy } = tournamentEngine.findPolicy({
  policyType: POLICY_TYPE_SCORING,
  drawId: 'draw-1',
});

if (scoringPolicy) {
  console.log(`Scoring policy active: ${scoringPolicy.policyName}`);
  if (scoringPolicy.requireParticipantsForScoring) {
    console.log('Participants must be present to record scores');
  }
}

// Hierarchical override example
// Tournament has seeding policy A
tournamentEngine.attachPolicies({
  policyDefinitions: {
    [POLICY_TYPE_SEEDING]: { policyName: 'Tournament Default', seedingProfile: 'WATERFALL' },
  },
});

// Event has seeding policy B
tournamentEngine.attachPolicies({
  policyDefinitions: {
    [POLICY_TYPE_SEEDING]: { policyName: 'Event Override', seedingProfile: 'ITF' },
  },
  eventId: 'event-1',
});

// Find policy at event level returns event policy (not tournament)
const { policy } = tournamentEngine.findPolicy({
  policyType: POLICY_TYPE_SEEDING,
  eventId: 'event-1',
});
console.log(policy.policyName); // "Event Override"

// Find policy at tournament level returns tournament policy
const { policy: tournamentPolicy } = tournamentEngine.findPolicy({
  policyType: POLICY_TYPE_SEEDING,
});
console.log(tournamentPolicy.policyName); // "Tournament Default"
```

**Notes:**

- Returns the most specific policy (draw overrides event, event overrides tournament)
- Searches upward in hierarchy: structure → draw → event → tournament
- Returns POLICY_NOT_FOUND error if policy type not found at any level
- Use `getAppliedPolicies()` to retrieve all policies at a specific level
- Policy object is deep-copied to prevent external modifications
- Useful for pre-flight checks before operations that depend on policies
- Does not search across multiple tournaments (tournament-scoped)

---

## removePolicy

Removes a specific policy type from tournaments, events, or draws. If removing the last policy from an element, the entire APPLIED_POLICIES extension is removed.

**Purpose:** Remove policy definitions to restore default behavior or remove outdated policies. Allows selective policy removal while preserving other policies.

**When to Use:**

- Removing event-specific policies to fall back to tournament defaults
- Cleaning up test policies after tests
- Reverting to system defaults
- Removing outdated or incorrect policies
- Preparing elements for new policy attachments
- Bulk policy removal across multiple tournaments

**Parameters:**

```ts
{
  policyType: string;                     // Required - type of policy to remove
  tournamentRecords?: TournamentRecords;  // Remove from multiple tournaments
  tournamentRecord?: Tournament;          // Remove from single tournament
  event?: Event;                          // Remove from specific event
  eventId?: string;                       // Event ID (alternative)
  drawDefinition?: DrawDefinition;        // Remove from specific draw
  drawId?: string;                        // Draw ID (alternative)
  tournamentId?: string;                  // Tournament ID for context
}
```

**Returns:**

```ts
{
  success: boolean;
  error?: ErrorType;                      // POLICY_NOT_FOUND if policy doesn't exist
}
```

**Examples:**

```js
import { tournamentEngine } from 'tods-competition-factory';
import { policyConstants } from 'tods-competition-factory';
const { POLICY_TYPE_SCORING, POLICY_TYPE_SEEDING } = policyConstants;

tournamentEngine.setState(tournamentRecord);

// Remove policy from tournament
let result = tournamentEngine.removePolicy({
  policyType: POLICY_TYPE_SEEDING,
});
console.log(result.success); // true

// Remove policy from event
result = tournamentEngine.removePolicy({
  policyType: POLICY_TYPE_SCORING,
  eventId: 'event-1',
});

// Remove policy from draw
result = tournamentEngine.removePolicy({
  policyType: POLICY_TYPE_AVOIDANCE,
  drawId: 'draw-1',
});

// Error when policy doesn't exist
result = tournamentEngine.removePolicy({
  policyType: 'NONEXISTENT_POLICY',
});
console.log(result.error); // POLICY_NOT_FOUND

// Remove from all tournaments in competition
import { competitionEngine } from 'tods-competition-factory';

competitionEngine.setState(tournamentRecords);
result = competitionEngine.removePolicy({
  tournamentRecords,
  policyType: POLICY_TYPE_SEEDING,
});

// Hierarchical removal - remove event override, fall back to tournament policy
// 1. Attach tournament policy
tournamentEngine.attachPolicies({
  policyDefinitions: {
    [POLICY_TYPE_SEEDING]: { policyName: 'Tournament Default', seedingProfile: 'WATERFALL' },
  },
});

// 2. Attach event override
tournamentEngine.attachPolicies({
  policyDefinitions: {
    [POLICY_TYPE_SEEDING]: { policyName: 'Event Override', seedingProfile: 'ITF' },
  },
  eventId: 'event-1',
});

// 3. Remove event override - tournament policy now applies to event
tournamentEngine.removePolicy({
  policyType: POLICY_TYPE_SEEDING,
  eventId: 'event-1',
});

// Now findPolicy returns tournament-level policy
const { policy } = tournamentEngine.findPolicy({
  policyType: POLICY_TYPE_SEEDING,
  eventId: 'event-1',
});
console.log(policy.policyName); // "Tournament Default"

// Cleanup pattern for tests
afterEach(() => {
  tournamentEngine.removePolicy({ policyType: POLICY_TYPE_SEEDING });
  tournamentEngine.removePolicy({ policyType: POLICY_TYPE_SCORING });
  tournamentEngine.removePolicy({ policyType: POLICY_TYPE_AVOIDANCE });
});

// Remove all policies from event (one at a time)
const policyTypes = [POLICY_TYPE_SEEDING, POLICY_TYPE_SCORING, POLICY_TYPE_AVOIDANCE, POLICY_TYPE_POSITION_ACTIONS];

policyTypes.forEach((policyType) => {
  const result = tournamentEngine.removePolicy({
    policyType,
    eventId: 'event-1',
  });
  if (result.success) {
    console.log(`Removed ${policyType}`);
  }
});
```

**Notes:**

- Removes policy only from specified level (does not cascade)
- If last policy removed, entire APPLIED_POLICIES extension is deleted
- Returns POLICY_NOT_FOUND if policy type doesn't exist at specified level
- Does not affect policies at other levels (e.g., removing from event doesn't affect tournament policy)
- Removing event policy causes fallback to tournament policy (if exists)
- Removing draw policy causes fallback to event/tournament policy
- Use `attachPolicies` with `allowReplacement: true` to replace rather than remove+add
- No undo functionality - policies must be re-attached if removed in error
- Tournament ID parameter used for context but doesn't limit scope
- Safe to call on non-existent policies in cleanup code (check return value)

---

## getPolicyDefinitions

Returns all policy definitions from the APPLIED_POLICIES extension, providing both the tournament-level policies and those applied at event or draw level.

```js
const { policyDefinitions } = engine.getPolicyDefinitions({
  drawId, // optional - include draw-level policies
  eventId, // optional - include event-level policies
});

console.log(policyDefinitions);
// {
//   [SEEDING_POLICY]: { ... },
//   [SCORING_POLICY]: { ... },
//   [DRAWS_POLICY]: { ... }
// }
```

**Returns:**

```ts
{
  policyDefinitions?: {
    [policyType: string]: PolicyDefinition;
  };
}
```

**Notes:**

- Returns hierarchical merge: tournament < event < draw
- Draw-level policies override event-level, which override tournament-level
- Only returns policies that exist in APPLIED_POLICIES extension
- Use `getAppliedPolicies` for runtime-applied policies including defaults

---

## getAppliedPolicies

Returns all policies that are actively applied, including both attached policies (from APPLIED_POLICIES extension) and default policies.

```js
const { appliedPolicies } = engine.getAppliedPolicies({
  drawId, // optional - include draw-specific policies
  eventId, // optional - include event-specific policies
});

// Check specific policy
if (appliedPolicies?.[SEEDING_POLICY]) {
  console.log('Seeding policy is active');
}
```

**Returns:**

```ts
{
  appliedPolicies?: {
    [policyType: string]: PolicyDefinition;
  };
}
```

**Difference from getPolicyDefinitions:**

- `getAppliedPolicies` includes DEFAULT policies (e.g., default scoring rules)
- `getPolicyDefinitions` returns ONLY explicitly attached policies
- Use `getAppliedPolicies` to understand actual runtime behavior
- Use `getPolicyDefinitions` to see what was explicitly configured

---
