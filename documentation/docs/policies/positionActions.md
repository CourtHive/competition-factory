---
title: Position Actions Policy
---

The **Position Actions Policy** (`POLICY_TYPE_POSITION_ACTIONS`) controls which actions are available for draw positions within tournament structures. This policy determines whether participants can be added, removed, swapped, seeded, or otherwise modified at specific draw positions based on structure stage, sequence, and current state.

**Policy Type:** `positionActions`

**When to Use:**

- Controlling which positions can be modified in qualifying vs main draws
- Restricting participant movement after matches have started
- Enabling/disabling seeding operations
- Allowing or preventing swap operations between positions
- Managing alternate and qualifier placement
- Controlling consolation draw participant management

---

## Policy Structure

```ts
{
  positionActions: {
    policyName?: string;                    // Optional policy identifier

    // Selective enablement for structures
    enabledStructures?: false | Array<{
      stages?: string[];                    // ['QUALIFYING', 'MAIN', 'CONSOLATION']
      stageSequences?: number[];            // [1, 2, 3] - which sequence numbers
      structureTypes?: string[];            // Structure type filters
      enabledActions?: string[];            // Specific actions to enable (empty = all)
      disabledActions?: string[];           // Specific actions to disable
      feedProfiles?: any[];                 // Feed-in structure filters
    }>;

    // Complete disablement for structures
    disabledStructures?: Array<{
      stages?: string[];                    // Stages to disable
      stageSequences?: number[];            // Sequences to disable
      structureTypes?: string[];            // Structure types to disable
    }>;

    // Additional capabilities
    otherFlightEntries?: boolean;           // Allow alternates from other flights
    disableRoundRestrictions?: boolean;     // Allow qualifiers in any round
    activePositionOverrides?: string[];     // Actions allowed even when positions are active
  }
}
```

---

## Available Position Actions

The following actions can be controlled by this policy:

### Participant Assignment Actions

| Action        | Constant                 | Method                              | Description                                |
| ------------- | ------------------------ | ----------------------------------- | ------------------------------------------ |
| **ASSIGN**    | `ASSIGN_PARTICIPANT`     | `assignDrawPosition`                | Assign a participant to an empty position  |
| **REMOVE**    | `REMOVE_ASSIGNMENT`      | `removeDrawPositionAssignment`      | Remove a participant from a position       |
| **WITHDRAW**  | `WITHDRAW_PARTICIPANT`   | `withdrawParticipantAtDrawPosition` | Withdraw a participant (preserves history) |
| **SWAP**      | `SWAP_PARTICIPANTS`      | `swapDrawPositionAssignments`       | Swap two participants' positions           |
| **BYE**       | `ASSIGN_BYE`             | `assignDrawPositionBye`             | Assign a BYE to a position                 |
| **ALTERNATE** | `ALTERNATE_PARTICIPANT`  | `alternateDrawPositionAssignment`   | Assign an alternate to a position          |
| **LUCKY**     | `LUCKY_PARTICIPANT`      | `luckyLoserDrawPositionAssignment`  | Assign a lucky loser to a position         |
| **QUALIFIER** | `QUALIFYING_PARTICIPANT` | `qualifierDrawPositionAssignment`   | Assign a qualifier to a position           |

### Seeding Actions

| Action          | Constant      | Method                    | Description                       |
| --------------- | ------------- | ------------------------- | --------------------------------- |
| **SEED_VALUE**  | `SEED_VALUE`  | `modifySeedAssignment`    | Add or modify seed value/number   |
| **REMOVE_SEED** | `REMOVE_SEED` | `removeSeededParticipant` | Remove seeding from a participant |

### Participant Metadata Actions

| Action       | Constant       | Method                       | Description                     |
| ------------ | -------------- | ---------------------------- | ------------------------------- |
| **NICKNAME** | `ADD_NICKNAME` | `modifyParticipantOtherName` | Add/modify participant nickname |
| **PENALTY**  | `ADD_PENALTY`  | `addPenalty`                 | Add penalty to a participant    |

The **NICKNAME** action sets `participantOtherName` on the participant. When present, this value is used as the display name in draw structures. Clearing the value (passing `undefined` or empty string) removes the nickname and reverts to the standard `participantName`. See [modifyParticipantOtherName](/docs/governors/participant-governor#modifyparticipantothername) for the API.

### Doubles/Pairs Actions

| Action          | Constant                 | Method                 | Description                      |
| --------------- | ------------------------ | ---------------------- | -------------------------------- |
| **MODIFY_PAIR** | `MODIFY_PAIR_ASSIGNMENT` | `modifyPairAssignment` | Modify individual in a pair/team |

---

## Default Policy

```js
import { POLICY_POSITION_ACTIONS_DEFAULT } from 'tods-competition-factory';

// Default policy:
// - All actions enabled for QUALIFYING and MAIN stage 1
// - Limited actions (SEED_VALUE, ADD_NICKNAME, ADD_PENALTY, QUALIFYING_PARTICIPANT) for other stages
{
  positionActions: {
    policyName: 'positionActionsDefault',

    enabledStructures: [
      {
        stages: ['QUALIFYING', 'MAIN'],      // First stage of QUALIFYING and MAIN
        stageSequences: [1],
        enabledActions: [],                   // All actions enabled
        disabledActions: []
      },
      {
        stages: [],                           // All other stages
        stageSequences: [],                   // All sequences
        enabledActions: [
          'ADD_NICKNAME',
          'ADD_PENALTY',
          'QUALIFYING_PARTICIPANT',
          'SEED_VALUE'
        ],
        disabledActions: []
      }
    ],

    disabledStructures: [],
    otherFlightEntries: false,
    activePositionOverrides: []
  }
}
```

---

## Built-in Policy Variations

### 1. Default Policy

```js
import { POLICY_POSITION_ACTIONS_DEFAULT } from 'tods-competition-factory';

// Standard behavior - actions enabled for main structures, limited for consolations
tournamentEngine.attachPolicies({
  policyDefinitions: POLICY_POSITION_ACTIONS_DEFAULT,
});
```

### 2. No Movement Policy

```js
import { POLICY_POSITION_ACTIONS_NO_MOVEMENT } from 'tods-competition-factory';

// Only allow seeding and metadata changes - no participant movement
// Useful for: Locked draws, seeding-only phases
{
  positionActions: {
    policyName: 'positionActionsNoMovement',
    enabledStructures: [{
      stages: [],
      stageSequences: [],
      enabledActions: ['SEED_VALUE', 'ADD_NICKNAME', 'ADD_PENALTY'],
      disabledActions: []
    }]
  }
}
```

### 3. Disabled Policy

```js
import { POLICY_POSITION_ACTIONS_DISABLED } from 'tods-competition-factory';

// Completely disable all position actions
// Useful for: Published draws, live tournaments
{
  positionActions: {
    policyName: 'positionActionsDisabled',
    enabledStructures: false  // Disables all actions
  }
}
```

### 4. Unrestricted Policy

```js
import { POLICY_POSITION_ACTIONS_UNRESTRICTED } from 'tods-competition-factory';

// Allow all actions everywhere, even when positions are active
// Useful for: Testing, emergency modifications, flexible club tournaments
{
  positionActions: {
    policyName: 'positionActionsUnrestricted',
    enabledStructures: [],                  // Empty = all structures
    otherFlightEntries: true,               // Allow cross-flight alternates
    disableRoundRestrictions: true,         // Qualifiers can go anywhere
    activePositionOverrides: [
      'SEED_VALUE',
      'REMOVE_SEED'
    ]
  }
}
```

---

## Basic Examples

### Disable All Position Actions

```js
import { POLICY_TYPE_POSITION_ACTIONS } from 'tods-competition-factory';

// Completely lock down draw - no position changes allowed
const lockedDrawPolicy = {
  [POLICY_TYPE_POSITION_ACTIONS]: {
    policyName: 'Locked Draw',
    enabledStructures: false,
  },
};

tournamentEngine.attachPolicies({
  policyDefinitions: lockedDrawPolicy,
});

// All positionActions queries will return empty validActions
const { validActions } = tournamentEngine.positionActions({
  drawPosition: 1,
  structureId,
  drawId,
});
// validActions = []
```

### Enable Only Seeding Operations

```js
// Allow only seeding - useful when finalizing seeds before publishing
const seedingOnlyPolicy = {
  [POLICY_TYPE_POSITION_ACTIONS]: {
    policyName: 'Seeding Only',
    enabledStructures: [
      {
        stages: ['MAIN'],
        stageSequences: [1],
        enabledActions: ['SEED_VALUE', 'REMOVE_SEED'],
      },
    ],
  },
};
```

### Enable Actions for Specific Stage

```js
// Enable all actions only in consolation structures
const consolationPolicy = {
  [POLICY_TYPE_POSITION_ACTIONS]: {
    policyName: 'Consolation Only',
    enabledStructures: [
      {
        stages: ['CONSOLATION'],
        stageSequences: [], // All sequences
        enabledActions: [], // All actions
      },
    ],
  },
};
```

---

## Advanced Examples

### Stage-Specific Action Control

```js
// Different action sets for different stages
const stageSpecificPolicy = {
  [POLICY_TYPE_POSITION_ACTIONS]: {
    policyName: 'Stage Specific',
    enabledStructures: [
      {
        // QUALIFYING: Full control
        stages: ['QUALIFYING'],
        stageSequences: [1],
        enabledActions: [], // All actions enabled
      },
      {
        // MAIN: Limited to non-movement actions
        stages: ['MAIN'],
        stageSequences: [1],
        enabledActions: ['SEED_VALUE', 'REMOVE_SEED', 'ADD_NICKNAME', 'ADD_PENALTY'],
      },
      {
        // CONSOLATION: Only metadata
        stages: ['CONSOLATION'],
        stageSequences: [],
        enabledActions: ['ADD_NICKNAME', 'ADD_PENALTY'],
      },
    ],
  },
};
```

### Disable Specific Actions

```js
// Enable most actions but specifically disable swapping
const noSwapPolicy = {
  [POLICY_TYPE_POSITION_ACTIONS]: {
    policyName: 'No Swapping',
    enabledStructures: [
      {
        stages: ['MAIN'],
        stageSequences: [1],
        enabledActions: [], // All actions initially
        disabledActions: [
          'SWAP_PARTICIPANTS', // Specifically disable swapping
          'MODIFY_PAIR_ASSIGNMENT', // And pair modifications
        ],
      },
    ],
  },
};
```

### Active Position Overrides

```js
// Allow seeding even after matches have been played
const liveSeeding Policy = {
  [POLICY_TYPE_POSITION_ACTIONS]: {
    policyName: 'Live Seeding',
    enabledStructures: [{
      stages: ['MAIN'],
      stageSequences: [1],
      enabledActions: ['SEED_VALUE', 'REMOVE_SEED']
    }],
    // These actions work even when drawPositions are active (have completed matches)
    activePositionOverrides: ['SEED_VALUE', 'REMOVE_SEED']
  }
};

// Now seeding can be modified after first round completes
```

### Multiple Stage Sequences

```js
// Different policies for qualification rounds vs main qualifying
const multiQualifyingPolicy = {
  [POLICY_TYPE_POSITION_ACTIONS]: {
    policyName: 'Multi-Stage Qualifying',
    enabledStructures: [
      {
        stages: ['QUALIFYING'],
        stageSequences: [1], // First qualifying round
        enabledActions: [], // All actions
      },
      {
        stages: ['QUALIFYING'],
        stageSequences: [2, 3], // Later qualifying rounds
        enabledActions: [
          'ADD_NICKNAME',
          'ADD_PENALTY',
          'QUALIFYING_PARTICIPANT', // Can still place qualifiers
        ],
      },
    ],
  },
};
```

---

## Real-World Examples

### Professional Tournament (Strict Control)

```js
// Professional tournament with published draws - very restrictive
const proTournamentPolicy = {
  [POLICY_TYPE_POSITION_ACTIONS]: {
    policyName: 'Professional Tournament',
    enabledStructures: [
      {
        // Main draw: Only metadata and penalties
        stages: ['MAIN'],
        stageSequences: [1],
        enabledActions: [
          'ADD_NICKNAME',
          'ADD_PENALTY',
          'ALTERNATE_PARTICIPANT', // Can add alternates for withdrawals
          'WITHDRAW_PARTICIPANT', // Can process withdrawals
        ],
      },
      {
        // Qualifying: Full control before main draw
        stages: ['QUALIFYING'],
        stageSequences: [1],
        enabledActions: [], // All actions before main draw starts
      },
    ],
    otherFlightEntries: false,
    disableRoundRestrictions: false,
  },
};
```

### Club Tournament (Flexible)

```js
// Flexible club tournament - allow modifications as needed
const clubPolicy = {
  [POLICY_TYPE_POSITION_ACTIONS]: {
    policyName: 'Club Flexibility',
    enabledStructures: [], // All structures enabled
    otherFlightEntries: true, // Can pull from any flight
    disableRoundRestrictions: true, // Flexible qualifier placement
    activePositionOverrides: [
      'SWAP_PARTICIPANTS', // Can fix mistakes after play starts
      'ASSIGN_PARTICIPANT',
      'REMOVE_ASSIGNMENT',
    ],
  },
};
```

### Draw Construction Phase

```js
// Maximum flexibility during draw construction
const constructionPolicy = {
  [POLICY_TYPE_POSITION_ACTIONS]: {
    policyName: 'Draw Construction',
    enabledStructures: [
      {
        stages: [],
        stageSequences: [],
        enabledActions: [
          'ASSIGN_PARTICIPANT',
          'REMOVE_ASSIGNMENT',
          'SWAP_PARTICIPANTS',
          'ASSIGN_BYE',
          'SEED_VALUE',
          'REMOVE_SEED',
        ],
      },
    ],
    otherFlightEntries: false,
    disableRoundRestrictions: false,
  },
};
```

### Live Tournament (Locked)

```js
// Tournament in progress - lock down all positions
const livePolicy = {
  [POLICY_TYPE_POSITION_ACTIONS]: {
    policyName: 'Live Tournament',
    enabledStructures: [
      {
        stages: [],
        stageSequences: [],
        enabledActions: [
          'ADD_NICKNAME', // Commentary team can add nicknames
          'ADD_PENALTY', // Referees can add penalties
        ],
      },
    ],
  },
};
```

---

## Understanding Position States

Position actions are automatically restricted based on position state:

### Active Draw Positions

**Definition:** Positions where the participant has completed at least one match.

**Default Restrictions:**

- Cannot remove participant
- Cannot swap participant
- Cannot withdraw participant
- Cannot assign BYE

**Allowed Actions (by default):**

- `ADD_NICKNAME`
- `ADD_PENALTY`

**Override:** Use `activePositionOverrides` to enable specific actions even when position is active.

```js
// Enable seeding even for active positions
activePositionOverrides: ['SEED_VALUE', 'REMOVE_SEED'];
```

### Inactive Draw Positions

**Definition:** Positions where participant has not yet played, or empty positions.

**Behavior:** All policy-enabled actions are available.

### BYE Positions

**Definition:** Positions assigned to BYE.

**Restrictions:**

- Cannot withdraw (BYE can't withdraw)
- Can remove BYE assignment
- Can replace with participant

---

## Using positionActions

```js
// Get available actions for a specific draw position
const {
  validActions, // Array of available actions
  isActiveDrawPosition, // Boolean - has participant played?
  hasPositionAssigned, // Boolean - is position filled?
  isDrawPosition, // Boolean - is valid draw position?
  isByePosition, // Boolean - is position a BYE?
} = tournamentEngine.positionActions({
  policyDefinitions, // Optional - override default policy
  drawPosition: 3, // Required - position to query
  structureId, // Required - structure identifier
  drawId, // Required - draw identifier
});

// Each validAction contains:
const {
  type, // Action type constant (e.g., 'SWAP')
  method, // Engine method name to execute action
  payload, // Parameters for method
  participant, // Current participant (if any)
  availableParticipants, // Participants available for this action
  willDisableLinks, // Boolean - will this affect linked structures?
} = validAction;
```

---

## Executing Position Actions

```js
// 1. Get available actions
const { validActions } = tournamentEngine.positionActions({
  drawPosition: 5,
  structureId,
  drawId,
});

// 2. Find desired action
const swapAction = validActions.find((action) => action.type === 'SWAP');

// 3. Execute using method and payload
if (swapAction) {
  const { method, payload } = swapAction;

  // Add required parameters
  payload.swapDrawPositions = [5, 9];

  // Execute
  const result = tournamentEngine[method](payload);
  expect(result.success).toEqual(true);
}
```

---

## Policy Evaluation Logic

Position actions policy evaluation follows this precedence:

1. **enabledStructures = false** → No actions available (highest priority)
2. **disabledStructures match** → No actions available for matching structures
3. **enabledStructures match** → Actions determined by enabledActions/disabledActions
4. **No match** → No actions available (default deny)
5. **Active position check** → Further restrict unless in activePositionOverrides
6. **BYE position check** → Remove withdraw action
7. **Structure completion check** → May disable placement actions

---

## Common Scenarios

### Scenario 1: Tournament Not Started

```js
// No matches played - all policy actions available
positionActions({ drawPosition: 1, structureId, drawId });
// → Returns all enabled actions (seeding, swap, assign, etc.)
```

### Scenario 2: First Round Complete

```js
// First round finished - active positions restricted
positionActions({ drawPosition: 1, structureId, drawId });
// → Returns: ['ADD_NICKNAME', 'ADD_PENALTY']
// (position 1 participant has played - is active)

positionActions({ drawPosition: 17, structureId, drawId });
// → Returns all enabled actions
// (position 17 hasn't played yet - is inactive)
```

### Scenario 3: Consolation Structure

```js
// Consolation structures typically have limited actions (default policy)
positionActions({
  drawPosition: 1,
  structureId: consolationStructureId,
  drawId,
});
// → Returns: ['ADD_NICKNAME', 'ADD_PENALTY', 'QUALIFYING_PARTICIPANT']
```

### Scenario 4: BYE Position

```js
// BYE positions can't be withdrawn, but can be replaced
positionActions({ drawPosition: 2, structureId, drawId });
// isByePosition: true
// validActions: excludes 'WITHDRAW_PARTICIPANT'
// includes: 'REMOVE_ASSIGNMENT', 'ASSIGN_PARTICIPANT'
```

---

## Testing Position Actions

### Test 1: Verify Default Policy Behavior

```js
import { expect, it } from 'vitest';
import { mocksEngine, tournamentEngine } from 'tods-competition-factory';

it('default policy allows all actions in main draw stage 1', () => {
  const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
  });

  tournamentEngine.setState(tournamentRecord);
  const [drawId] = drawIds;

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  const { validActions } = tournamentEngine.positionActions({
    drawPosition: 1,
    structureId,
    drawId,
  });

  const actionTypes = validActions.map((a) => a.type);

  // Main draw stage 1 should have extensive actions
  expect(actionTypes).toContain('SWAP');
  expect(actionTypes).toContain('SEED_VALUE');
  expect(actionTypes).toContain('REMOVE');
  expect(actionTypes).toContain('WITHDRAW');
  expect(actionTypes).toContain('BYE');
});
```

### Test 2: Verify Active Position Restrictions

```js
it('restricts actions for active draw positions', () => {
  const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 16,
        participantsCount: 16,
        outcomes: [
          {
            roundNumber: 1,
            roundPosition: 1,
            winningSide: 1,
            scoreString: '6-0 6-0',
          },
        ],
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);
  const [drawId] = drawIds;

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  // Position 1 participant has completed a match
  const { validActions, isActiveDrawPosition } = tournamentEngine.positionActions({
    drawPosition: 1,
    structureId,
    drawId,
  });

  expect(isActiveDrawPosition).toEqual(true);

  const actionTypes = validActions.map((a) => a.type);

  // Active positions only allow metadata actions
  expect(actionTypes).toContain('NICKNAME');
  expect(actionTypes).toContain('PENALTY');
  expect(actionTypes).not.toContain('SWAP');
  expect(actionTypes).not.toContain('REMOVE');
});
```

### Test 3: Verify Custom Policy

```js
import { POLICY_TYPE_POSITION_ACTIONS } from 'tods-competition-factory';

it('respects custom policy definitions', () => {
  const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
  });

  tournamentEngine.setState(tournamentRecord);
  const [drawId] = drawIds;

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  // Custom policy: only seeding allowed
  const seedingOnlyPolicy = {
    [POLICY_TYPE_POSITION_ACTIONS]: {
      enabledStructures: [
        {
          stages: [],
          stageSequences: [],
          enabledActions: ['SEED_VALUE', 'REMOVE_SEED'],
        },
      ],
    },
  };

  const { validActions } = tournamentEngine.positionActions({
    policyDefinitions: seedingOnlyPolicy,
    drawPosition: 1,
    structureId,
    drawId,
  });

  const actionTypes = validActions.map((a) => a.type);

  expect(actionTypes).toEqual(['SEED_VALUE']);
  expect(actionTypes).not.toContain('SWAP');
  expect(actionTypes).not.toContain('REMOVE');
});
```

### Test 4: Verify Disabled Policy

```js
import { POLICY_POSITION_ACTIONS_DISABLED } from 'tods-competition-factory';

it('disabled policy returns no actions', () => {
  const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
  });

  tournamentEngine.setState(tournamentRecord);
  const [drawId] = drawIds;

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  const { validActions } = tournamentEngine.positionActions({
    policyDefinitions: POLICY_POSITION_ACTIONS_DISABLED,
    drawPosition: 1,
    structureId,
    drawId,
  });

  expect(validActions).toEqual([]);
});
```

---

## Notes

- **Default Behavior**: Permissive for MAIN/QUALIFYING stage 1, restrictive for consolations
- **Empty Arrays**: `stages: []` or `stageSequences: []` means "applies to all"
- **Empty enabledActions**: `enabledActions: []` means "all actions enabled"
- **Active Positions**: Automatically restricted to metadata actions only (unless overridden)
- **BYE Positions**: Cannot withdraw, but can remove or replace
- **Structure Completion**: Source structures must be complete before fed positions can be filled
- **Policy Precedence**: Specified policyDefinitions override attached policies
- **Event/Draw Policies**: Can attach policies at tournament, event, or draw level
- **Linked Structures**: Some actions may disable links to consolation/playoff structures

---

## Related Methods

- `tournamentEngine.positionActions()` - Query available actions
- `tournamentEngine.assignDrawPosition()` - Execute ASSIGN action
- `tournamentEngine.removeDrawPositionAssignment()` - Execute REMOVE action
- `tournamentEngine.swapDrawPositionAssignments()` - Execute SWAP action
- `tournamentEngine.withdrawParticipantAtDrawPosition()` - Execute WITHDRAW action
- `tournamentEngine.modifySeedAssignment()` - Execute SEED_VALUE action
- `tournamentEngine.addPenalty()` - Execute PENALTY action

---

## Related Concepts

- [Actions](/docs/concepts/actions) - Understanding the actions system
- [Draw Types](/docs/concepts/draw-types) - Understanding draw structures
- [Policies](/docs/concepts/policies) - Policy system overview
