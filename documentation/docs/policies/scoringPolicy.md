---
title: Scoring Policy
---

The **Scoring Policy** (`POLICY_TYPE_SCORING`) controls scoring requirements, format restrictions, deletion permissions, and change propagation behaviors. This policy ensures data integrity and enforces tournament-specific scoring rules.

**Policy Type:** `scoring`

**When to Use:**

- Enforcing participant presence requirements for scoring
- Controlling when draws/structures can be deleted
- Restricting available matchUp formats
- Requiring all positions assigned before scoring
- Defining matchUpStatus code interpretations
- Managing score change propagation
- Setting default matchUp formats

---

## Policy Structure

```ts
{
  scoring: {
    policyName?: string;                               // Optional policy identifier

    // Default format for all matchUps
    defaultMatchUpFormat?: string;                     // e.g., 'SET3-S:6/TB7'

    // Deletion permissions when scores exist
    allowDeletionWithScoresPresent?: {
      drawDefinitions: boolean;                        // Allow draw deletion (default: false)
      structures: boolean;                             // Allow structure deletion (default: false)
    };

    // Scoring requirements
    requireParticipantsForScoring?: boolean;           // Both participants must be present (default: false)
    requireAllPositionsAssigned?: boolean | undefined; // All positions assigned before scoring (default: undefined = true)

    // Change propagation
    allowChangePropagation?: boolean;                  // Propagate winningSide changes downstream (default: false)
    propagateExitStatus?: boolean;                     // Propagate exit status (WALKOVER/DEFAULTED) into the consolation (default: false)

    // Stage-specific requirements
    stage?: {
      [stageName: string]: {
        stageSequence?: {
          [sequence: number]: {
            requireAllPositionsAssigned?: boolean;     // Override for specific stage/sequence
          };
        };
      };
    };

    // Available matchUp formats
    matchUpFormats?: Array<{
      matchUpFormat: string;                           // Format code
      description?: string;                            // Human-readable description
      categoryNames?: string[];                        // Applicable categories
      categoryTypes?: string[];                        // Applicable category types
    }>;

    // Status code refinements
    matchUpStatusCodes?: {
      [status: string]: Array<{
        matchUpStatusCode: string;                     // Code identifier
        matchUpStatusCodeDisplay: string;              // Display text
        label: string;                                 // User-facing label
        description?: string;                          // Detailed explanation
      }>;
    };

    // Process codes for specific scenarios
    processCodes?: {
      incompleteAssignmentsOnDefault?: string[];       // Codes applied on default (e.g., ['RANKING.IGNORE'])
    };
  }
}
```

---

## Default Scoring Policy

```js
import { POLICY_SCORING_DEFAULT } from 'tods-competition-factory';

// Defaults:
// {
//   scoring: {
//     defaultMatchUpFormat: 'SET3-S:6/TB7',          // Standard format
//     allowDeletionWithScoresPresent: {
//       drawDefinitions: false,                       // Cannot delete draws with scores
//       structures: false                             // Cannot delete structures with scores
//     },
//     requireParticipantsForScoring: false,           // Participants not required
//     requireAllPositionsAssigned: undefined,         // Defaults to true for MAIN stage
//     allowChangePropagation: false,                  // No automatic propagation
//     stage: {
//       MAIN: {
//         stageSequence: {
//           1: { requireAllPositionsAssigned: true }  // Main draw must be complete
//         }
//       }
//     },
//     matchUpFormats: [],                             // No format restrictions
//     matchUpStatusCodes: {                           // Empty status codes
//       ABANDONED: [],
//       CANCELLED: [],
//       DEFAULTED: [],
//       INCOMPLETE: [],
//       RETIRED: [],
//       WALKOVER: []
//     },
//     processCodes: {
//       incompleteAssignmentsOnDefault: ['RANKING.IGNORE']
//     }
//   }
// }
```

---

## Basic Examples

### Default Matchup Format

```js
import { POLICY_TYPE_SCORING } from 'tods-competition-factory';

// Set tournament-wide default format
const defaultFormatPolicy = {
  [POLICY_TYPE_SCORING]: {
    policyName: 'Standard Scoring',
    defaultMatchUpFormat: 'SET3-S:6/TB7', // All matchUps use this by default
  },
};

tournamentEngine.attachPolicies({
  policyDefinitions: defaultFormatPolicy,
});

// Override for specific event (e.g., short format for juniors)
const shortFormatPolicy = {
  [POLICY_TYPE_SCORING]: {
    policyName: 'Junior Scoring',
    defaultMatchUpFormat: 'SET3-S:4/TB7', // Short sets
  },
};

tournamentEngine.attachPolicies({
  policyDefinitions: shortFormatPolicy,
  eventId: 'junior-event-id',
});
```

### Require Participants for Scoring

```js
// Both participants must be present before scoring
const participantRequirementPolicy = {
  [POLICY_TYPE_SCORING]: {
    policyName: 'Participant Required',
    requireParticipantsForScoring: true, // Cannot score without both participants
  },
};

tournamentEngine.attachPolicies({
  policyDefinitions: participantRequirementPolicy,
});

// Attempting to score without participants will fail
const result = tournamentEngine.setMatchUpStatus({
  matchUpId: 'match-1',
  outcome: { winningSide: 1 },
});

if (result.error === 'MISSING_PARTICIPANTS') {
  console.error('Both participants must be assigned before scoring');
}
```

### Allow Early Scoring (Consolation)

```js
// Allow scoring in consolation before all positions filled
const flexibleScoringPolicy = {
  [POLICY_TYPE_SCORING]: {
    policyName: 'Flexible Consolation Scoring',
    requireAllPositionsAssigned: false, // Can score as positions fill
  },
};

tournamentEngine.attachPolicies({
  policyDefinitions: flexibleScoringPolicy,
  eventId: 'event-id',
});

// Main draw still requires all positions (via stage-specific rule)
// Consolation/playoff draws can score immediately
```

---

## Deletion Protection

### Prevent Draw Deletion with Scores

```js
const deletionProtectionPolicy = {
  [POLICY_TYPE_SCORING]: {
    policyName: 'Deletion Protection',
    allowDeletionWithScoresPresent: {
      drawDefinitions: false, // Cannot delete draws with any scores
      structures: false, // Cannot delete structures with any scores
    },
  },
};

tournamentEngine.attachPolicies({
  policyDefinitions: deletionProtectionPolicy,
});

// Attempt to delete draw with scores
const result = tournamentEngine.deleteDrawDefinitions({
  eventId: 'event-1',
  drawIds: ['draw-1'],
});

if (result.error === 'SCORES_PRESENT') {
  console.error('Cannot delete draw - scores have been entered');
}

// Force deletion (override policy)
const forceResult = tournamentEngine.deleteDrawDefinitions({
  eventId: 'event-1',
  drawIds: ['draw-1'],
  force: true, // Bypasses policy check
});
```

### Allow Deletion (Testing/Development)

```js
// Allow deletion even with scores (for development/testing)
const flexibleDeletionPolicy = {
  [POLICY_TYPE_SCORING]: {
    policyName: 'Flexible Deletion',
    allowDeletionWithScoresPresent: {
      drawDefinitions: true, // Can delete draws with scores
      structures: true, // Can delete structures with scores
    },
  },
};

// Use cautiously - can lead to data loss!
```

---

## Format Restrictions

### Limit Available Formats (USTA Example)

```js
import { POLICY_SCORING_USTA } from 'tods-competition-factory';

// USTA policy includes approved formats only
const ustaPolicy = {
  [POLICY_TYPE_SCORING]: {
    policyName: 'USTA Scoring',
    defaultMatchUpFormat: 'SET3-S:6/TB7',
    matchUpFormats: [
      {
        matchUpFormat: 'SET3-S:6/TB7',
        description: 'Best of 3 tiebreak sets',
      },
      {
        matchUpFormat: 'SET3-S:6/TB7-F:TB10',
        description: 'Two tiebreak sets, 10-point match tiebreak at one set all',
      },
      {
        matchUpFormat: 'SET1-S:6/TB7',
        description: 'One standard tiebreak set',
      },
      {
        matchUpFormat: 'SET3-S:4/TB7',
        description: 'Best of 3 sets to 4',
      },
      {
        matchUpFormat: 'SET1-S:4/TB5@3',
        description: 'One short set to 4, 5-point tiebreak at 3',
      },
      {
        matchUpFormat: 'SET1-S:8/TB7',
        description: '8 game pro-set',
      },
      {
        matchUpFormat: 'SET1-S:TB10',
        description: 'One 10-point tiebreak game',
      },
      {
        matchUpFormat: 'SET1-S:T20',
        description: 'Timed 20 minute game',
      },
      // ... 19 total approved formats
    ],
  },
};

tournamentEngine.attachPolicies({
  policyDefinitions: ustaPolicy,
});

// UI can retrieve allowed formats
const { policy } = tournamentEngine.findPolicy({
  policyType: POLICY_TYPE_SCORING,
});

console.log(policy.matchUpFormats);
// Display in format selector dropdown
```

### Category-Specific Formats

```js
const categoryFormatsPolicy = {
  [POLICY_TYPE_SCORING]: {
    matchUpFormats: [
      {
        matchUpFormat: 'SET3-S:6/TB7',
        description: 'Standard format',
        categoryTypes: ['ADULT'],
        categoryNames: [],
      },
      {
        matchUpFormat: 'SET3-S:4/TB7',
        description: 'Short sets',
        categoryTypes: ['JUNIOR'],
        categoryNames: ['U10', 'U12', 'U14'],
      },
      {
        matchUpFormat: 'SET1-S:TB10',
        description: 'Super tiebreak',
        categoryTypes: ['JUNIOR'],
        categoryNames: ['U8', 'U10'],
      },
    ],
  },
};

// Format selector shows only applicable formats per category
```

---

## Stage-Specific Requirements

### Main Draw vs. Consolation

```js
const stageSpecificPolicy = {
  [POLICY_TYPE_SCORING]: {
    policyName: 'Stage-Specific Scoring',
    requireAllPositionsAssigned: false, // Default: flexible
    stage: {
      MAIN: {
        stageSequence: {
          1: {
            requireAllPositionsAssigned: true, // Main draw: all positions required
          },
        },
      },
      // CONSOLATION, PLAY_OFF stages use default (false)
    },
  },
};

// Main draw: Cannot score until draw is complete
// Consolation: Can score as positions are filled
// Compass/Playoff: Can score as positions are filled
```

---

## MatchUp Status Codes

### USTA Status Codes (Comprehensive)

```js
import { POLICY_SCORING_USTA } from 'tods-competition-factory';

// USTA policy includes detailed status codes:
const ustaStatusCodes = {
  [POLICY_TYPE_SCORING]: {
    matchUpStatusCodes: {
      WALKOVER: [
        {
          matchUpStatusCode: 'W1',
          matchUpStatusCodeDisplay: 'Wo [inj]',
          label: 'Injury',
        },
        {
          matchUpStatusCode: 'W2',
          matchUpStatusCodeDisplay: 'Wo [ill]',
          label: 'Illness',
        },
        {
          matchUpStatusCode: 'W3',
          matchUpStatusCodeDisplay: 'Wo [pc]',
          label: 'Personal circumstance',
        },
        {
          matchUpStatusCode: 'W4',
          matchUpStatusCodeDisplay: 'Wo [Tae]',
          label: 'Tournament Administrative Error',
        },
        {
          matchUpStatusCode: 'WOWO',
          matchUpStatusCodeDisplay: 'Wo/Wo',
          label: 'Double walkover',
        },
      ],
      RETIRED: [
        {
          matchUpStatusCode: 'RJ',
          matchUpStatusCodeDisplay: 'Ret [inj]',
          label: 'Injury',
        },
        {
          matchUpStatusCode: 'RI',
          matchUpStatusCodeDisplay: 'Ret [ill]',
          label: 'Illness',
        },
        {
          matchUpStatusCode: 'RC',
          matchUpStatusCodeDisplay: 'Ret [pc]',
          label: 'Personal circumstance',
        },
        {
          matchUpStatusCode: 'RU',
          matchUpStatusCodeDisplay: 'Ret [elg]',
          label: 'Ret. (eligible)',
          description: 'Player remains eligible for consolations, playoffs, doubles',
        },
      ],
      DEFAULTED: [
        {
          matchUpStatusCode: 'DQ',
          matchUpStatusCodeDisplay: 'Def [dq]',
          label: 'Disqualification (ineligibility)',
          description: 'Disqualification for cause or ineligibility',
        },
        {
          matchUpStatusCode: 'DM',
          matchUpStatusCodeDisplay: 'Def [cond]',
          label: 'Misconduct',
          description: 'Misconduct before or between matches',
        },
        {
          matchUpStatusCode: 'D4',
          matchUpStatusCodeDisplay: 'Def [refsl]',
          label: 'Refusal to start match',
        },
        {
          matchUpStatusCode: 'D6',
          matchUpStatusCodeDisplay: 'Def [ns]',
          label: 'Not showing up',
        },
        {
          matchUpStatusCode: 'D7',
          matchUpStatusCodeDisplay: 'Score + Def [late]',
          label: 'Lateness for match',
        },
        {
          matchUpStatusCode: 'DD',
          matchUpStatusCodeDisplay: 'Def/Def',
          label: 'Double default',
        },
        {
          matchUpStatusCode: 'DP',
          matchUpStatusCodeDisplay: 'Def [pps]',
          label: 'Default (Point Penalty System)',
        },
      ],
      ABANDONED: [
        {
          matchUpStatusCode: 'OA',
          matchUpStatusCodeDisplay: 'Abandoned',
          label: 'Abandoned match',
        },
      ],
      CANCELLED: [
        {
          matchUpStatusCode: 'OC',
          matchUpStatusCodeDisplay: 'Unplayed or Cancelled',
          label: 'Cancelled match',
        },
      ],
      INCOMPLETE: [
        {
          matchUpStatusCode: 'OI',
          matchUpStatusCodeDisplay: 'Incomplete',
          label: 'Incomplete match',
        },
      ],
    },
  },
};

// UI displays status code selector
tournamentEngine.attachPolicies({
  policyDefinitions: POLICY_SCORING_USTA,
});

const { policy } = tournamentEngine.findPolicy({
  policyType: POLICY_TYPE_SCORING,
});

// Build dropdown for walkover reasons
policy.matchUpStatusCodes.WALKOVER.forEach((code) => {
  console.log(`${code.matchUpStatusCode}: ${code.label}`);
});
// W1: Injury
// W2: Illness
// W3: Personal circumstance
// etc.
```

---

## Change Propagation

### Automatic Propagation (Use Cautiously)

```js
const propagationPolicy = {
  [POLICY_TYPE_SCORING]: {
    policyName: 'Auto Propagation',
    allowChangePropagation: true, // Changes propagate downstream
  },
};

// Scenario:
// 1. Score match: Player A wins
// 2. Player A placed in next round
// 3. Change winningSide to Player B
// 4. With propagation: Player B automatically moved to next round
// 5. Without propagation: Manual repositioning required

// WARNING: Can cause unexpected changes in large structures
// Recommended: Keep false for manual control
```

### Exit-Status Propagation

`propagateExitStatus` controls whether an exit (`WALKOVER` / `DEFAULTED`) applied to a
matchUp is propagated into the consolation — placing the exiting participant into their
consolation matchUp with the carried exit status rather than as an ordinary loser.

```js
const propagationPolicy = {
  [POLICY_TYPE_SCORING]: {
    policyName: 'Propagate Exits',
    propagateExitStatus: true, // exits flow into the consolation by default
  },
};

// Resolution precedence (mirrors allowChangePropagation):
//   setMatchUpStatus({ ..., propagateExitStatus: true })  → always propagates (override)
//   otherwise the scoring policy's propagateExitStatus is used
//   POLICY_SCORING_DEFAULT: false   POLICY_SCORING_USTA: true
// An explicit params boolean `false` defers to the policy (it does not force-off).
```

---

## Real-World Examples

### USTA Tournament

```js
import { POLICY_SCORING_USTA } from 'tods-competition-factory';

// Use complete USTA policy
tournamentEngine.attachPolicies({
  policyDefinitions: POLICY_SCORING_USTA,
});

// Includes:
// - 19 approved matchUp formats
// - Comprehensive status codes (W1-W5, RJ-RU, DQ-DP, etc.)
// - Flexible consolation scoring
// - Standard format default
// - Main draw position requirement
```

### ITF Junior Event

```js
const itfJuniorPolicy = {
  [POLICY_TYPE_SCORING]: {
    policyName: 'ITF Junior Scoring',
    defaultMatchUpFormat: 'SET3-S:6/TB7',
    requireAllPositionsAssigned: false,
    stage: {
      MAIN: {
        stageSequence: {
          1: { requireAllPositionsAssigned: true },
        },
      },
    },
    matchUpFormats: [
      {
        matchUpFormat: 'SET3-S:6/TB7',
        description: 'Best of 3 sets',
      },
      {
        matchUpFormat: 'SET3-S:6/TB7-F:TB10',
        description: 'Match tiebreak final set',
      },
      {
        matchUpFormat: 'SET1-S:6/TB7',
        description: 'One set (qualifying)',
      },
    ],
    allowDeletionWithScoresPresent: {
      drawDefinitions: false,
      structures: false,
    },
  },
};
```

### Club Tournament (Flexible)

```js
const clubPolicy = {
  [POLICY_TYPE_SCORING]: {
    policyName: 'Club Scoring',
    defaultMatchUpFormat: 'SET1-S:8/TB7', // Pro set default
    requireParticipantsForScoring: false,
    requireAllPositionsAssigned: false, // Very flexible
    allowDeletionWithScoresPresent: {
      drawDefinitions: true, // Allow corrections
      structures: true,
    },
    matchUpFormats: [
      { matchUpFormat: 'SET1-S:8/TB7', description: '8-game pro set' },
      { matchUpFormat: 'SET1-S:6/TB7', description: 'One set' },
      { matchUpFormat: 'SET1-S:TB10', description: 'Super tiebreak' },
      { matchUpFormat: 'SET3-S:6/TB7', description: 'Best of 3' },
    ],
  },
};
```

---

## Process Codes

### Incomplete Assignments on Default

```js
const processCodePolicy = {
  [POLICY_TYPE_SCORING]: {
    processCodes: {
      incompleteAssignmentsOnDefault: ['RANKING.IGNORE'],
    },
  },
};

// When a player defaults before completing all assignments:
// - Apply RANKING.IGNORE code
// - Affects ranking point calculation
// - Used by federations for ranking integrity
```

---

## Notes

- **requireAllPositionsAssigned**: `undefined` defaults to `true` for MAIN stage
- **Stage-specific overrides**: More specific than global setting
- **Format restrictions**: Empty array = no restrictions (all formats allowed)
- **Status codes**: Used for detailed match outcome tracking
- **Deletion protection**: Prevents accidental data loss
- **Change propagation**: Disabled by default for safety
- **USTA policy**: Most comprehensive example (19 formats, 30+ status codes)
- Format restrictions enforced in UI, not in engine (validation only)
- Status codes stored with matchUp for reporting
- Process codes affect ranking calculations
- Tournament-level policy applies unless overridden by event
- Draw-level policy overrides event policy

---

## Related Methods

- `findPolicy({ policyType: POLICY_TYPE_SCORING })` - Retrieve active policy
- `setMatchUpStatus` - Respects requireParticipantsForScoring
- `deleteDrawDefinitions` - Respects allowDeletionWithScoresPresent
- `removeStructure` - Respects allowDeletionWithScoresPresent

---

## Federation Policies

**Available Presets:**

- `POLICY_SCORING_DEFAULT` - Basic policy
- `POLICY_SCORING_USTA` - Complete USTA policy with 19 formats and comprehensive status codes

**Custom Federations:**
Create federation-specific policies following USTA pattern:

- Define approved formats
- Define status codes
- Set stage requirements
- Configure deletion rules
