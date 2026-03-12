---
title: Scheduling Policy
---

The **Scheduling Policy** (`POLICY_TYPE_SCHEDULING`) controls scheduling behavior including average match times, recovery times between matches, and daily match limits per player. This policy enables intelligent scheduling that respects player rest requirements and venue capacity constraints.

**Policy Type:** `scheduling`

**When to Use:**

- Configuring tournament-wide scheduling defaults
- Setting format-specific match duration estimates
- Enforcing recovery times based on match format and category
- Limiting matches per player per day (preventing over-scheduling)
- Customizing scheduling for different age groups or wheelchair events

---

## Policy Structure

```ts
{
  scheduling: {
    policyName?: string;                          // Optional policy identifier

    // Prevent venue/court modifications when matchUps are scheduled
    allowModificationWhenMatchUpsScheduled?: {
      courts: boolean;                            // Allow court changes (default: false)
      venues: boolean;                            // Allow venue changes (default: false)
    };

    // Default times when no format-specific times exist
    defaultTimes?: {
      averageTimes: Array<{
        categoryNames?: string[];                 // e.g., ['U12', 'U14']
        categoryTypes?: string[];                 // e.g., ['ADULT', 'JUNIOR', 'WHEELCHAIR']
        minutes: {
          default: number;                        // Default duration
          SINGLES?: number;                       // Singles-specific override
          DOUBLES?: number;                       // Doubles-specific override
          TEAM?: number;                          // Team-specific override
        };
      }>;
      recoveryTimes: Array<{
        categoryNames?: string[];
        categoryTypes?: string[];
        minutes: {
          default: number;                        // Default recovery time
          SINGLES?: number;
          DOUBLES?: number;
          TEAM?: number;
        };
      }>;
    };

    // Default daily limits (overridable per participant)
    defaultDailyLimits?: {
      SINGLES?: number;                           // Max singles matches per day
      DOUBLES?: number;                           // Max doubles matches per day
      TEAM?: number;                              // Max team matches per day
      total?: number;                             // Max total matches per day
    };

    // Format-specific average match times
    matchUpAverageTimes?: Array<{
      matchUpFormatCodes: string[];               // e.g., ['SET3-S:6/TB7']
      averageTimes: Array<{
        categoryNames?: string[];                 // Target categories
        categoryTypes?: string[];                 // Target category types
        minutes: {
          default: number;
          SINGLES?: number;
          DOUBLES?: number;
        };
      }>;
    }>;

    // Format-specific recovery times
    matchUpRecoveryTimes?: Array<{
      matchUpFormatCodes: string[];
      recoveryTimes: Array<{
        categoryNames?: string[];
        categoryTypes?: string[];
        minutes: {
          default: number;
          SINGLES?: number;
          DOUBLES?: number;
        };
      }>;
    }>;

    // Participant-specific daily limits
    matchUpDailyLimits?: Array<{
      participantId: string;
      SINGLES?: number;
      DOUBLES?: number;
      total?: number;
    }>;
  }
}
```

---

## Basic Examples

### Attach Default Scheduling Policy

```js
import { tournamentEngine } from 'tods-competition-factory';
import { POLICY_SCHEDULING_DEFAULT } from 'tods-competition-factory';

tournamentEngine.setState(tournamentRecord);

// Attach default scheduling policy to tournament
const result = tournamentEngine.attachPolicies({
  policyDefinitions: POLICY_SCHEDULING_DEFAULT,
});

// Default includes:
// - 90 minutes average for standard matches
// - 60 minutes recovery for singles, 30 for doubles
// - 2 singles + 2 doubles max per day (3 total)
// - Specific times for common formats (pro sets, short sets, tiebreaks)
```

### Custom Scheduling Policy

```js
import { POLICY_TYPE_SCHEDULING } from 'tods-competition-factory';

const customSchedulingPolicy = {
  [POLICY_TYPE_SCHEDULING]: {
    policyName: 'Youth Tournament Scheduling',

    // Shorter match times for youth
    defaultTimes: {
      averageTimes: [
        {
          categoryNames: ['U10', 'U12'],
          minutes: { default: 45, DOUBLES: 40 },
        },
        {
          categoryNames: ['U14', 'U16'],
          minutes: { default: 60, DOUBLES: 50 },
        },
      ],

      // Longer recovery for youth
      recoveryTimes: [
        {
          categoryNames: ['U10', 'U12', 'U14'],
          minutes: { default: 60 },
        },
      ],
    },

    // Stricter daily limits for youth
    defaultDailyLimits: {
      SINGLES: 1,
      DOUBLES: 1,
      total: 2,
    },
  },
};

tournamentEngine.attachPolicies({
  policyDefinitions: customSchedulingPolicy,
});
```

### Event-Specific Scheduling Override

```js
// Tournament-wide policy
tournamentEngine.attachPolicies({
  policyDefinitions: {
    [POLICY_TYPE_SCHEDULING]: {
      defaultDailyLimits: { SINGLES: 2, DOUBLES: 2, total: 3 },
    },
  },
});

// Override for specific event (e.g., championship event with more rest)
tournamentEngine.attachPolicies({
  policyDefinitions: {
    [POLICY_TYPE_SCHEDULING]: {
      policyName: 'Championship Scheduling',
      defaultDailyLimits: { SINGLES: 1, DOUBLES: 1, total: 1 },
      matchUpRecoveryTimes: [
        {
          matchUpFormatCodes: ['SET3-S:6/TB7'],
          recoveryTimes: [
            {
              categoryNames: [],
              minutes: { default: 120 }, // 2 hours recovery
            },
          ],
        },
      ],
    },
  },
  eventId: 'championship-event-id',
});
```

---

## Format-Specific Timing

### Define Custom Format Times

```js
const schedulingPolicy = {
  [POLICY_TYPE_SCHEDULING]: {
    policyName: 'Custom Format Timing',

    matchUpAverageTimes: [
      {
        // Fast4 format
        matchUpFormatCodes: ['SET1-S:4/TB5@3'],
        averageTimes: [
          {
            categoryNames: [],
            minutes: { default: 25, DOUBLES: 20 },
          },
        ],
      },
      {
        // Pro set to 8
        matchUpFormatCodes: ['SET1-S:8/TB7', 'SET1-S:8/TB7@7'],
        averageTimes: [
          {
            categoryTypes: ['ADULT'],
            minutes: { default: 45, DOUBLES: 40 },
          },
          {
            categoryTypes: ['JUNIOR'],
            minutes: { default: 40, DOUBLES: 35 },
          },
        ],
      },
      {
        // Timed sets (20 minutes)
        matchUpFormatCodes: ['SET1-S:T20'],
        averageTimes: [
          {
            categoryNames: [],
            minutes: { default: 25 }, // 20 min + 5 min buffer
          },
        ],
      },
    ],

    matchUpRecoveryTimes: [
      {
        matchUpFormatCodes: ['SET1-S:4/TB5@3', 'SET1-S:T20'],
        recoveryTimes: [
          {
            categoryNames: [],
            minutes: { default: 15 }, // Short recovery for short formats
          },
        ],
      },
    ],
  },
};
```

---

## Category-Based Scheduling

### Wheelchair Event Scheduling

```js
const wheelchairSchedulingPolicy = {
  [POLICY_TYPE_SCHEDULING]: {
    policyName: 'Wheelchair Scheduling',

    // Wheelchair matches typically take longer
    matchUpAverageTimes: [
      {
        matchUpFormatCodes: ['SET3-S:6/TB7'],
        averageTimes: [
          {
            categoryTypes: ['WHEELCHAIR'],
            minutes: { default: 120, DOUBLES: 100 }, // 20-30 min longer
          },
        ],
      },
    ],

    // Standard recovery times
    matchUpRecoveryTimes: [
      {
        matchUpFormatCodes: ['SET3-S:6/TB7'],
        recoveryTimes: [
          {
            categoryTypes: ['WHEELCHAIR'],
            minutes: { default: 60, DOUBLES: 30 },
          },
        ],
      },
    ],
  },
};
```

### Age Group Variations

```js
const ageGroupSchedulingPolicy = {
  [POLICY_TYPE_SCHEDULING]: {
    policyName: 'Age Group Scheduling',

    matchUpAverageTimes: [
      {
        matchUpFormatCodes: ['SET3-S:6/TB7'],
        averageTimes: [
          {
            categoryNames: ['U10', 'U12'],
            minutes: { default: 60 },
          },
          {
            categoryNames: ['U14', 'U16'],
            minutes: { default: 75 },
          },
          {
            categoryNames: ['U18'],
            minutes: { default: 90 },
          },
          {
            categoryTypes: ['ADULT'],
            minutes: { default: 90 },
          },
        ],
      },
    ],
  },
};
```

---

## Daily Limits

### Tournament-Wide Daily Limits

```js
const dailyLimitsPolicy = {
  [POLICY_TYPE_SCHEDULING]: {
    defaultDailyLimits: {
      SINGLES: 2, // Max 2 singles matches per day
      DOUBLES: 2, // Max 2 doubles matches per day
      total: 3, // Max 3 total matches per day (any combination)
    },
  },
};

tournamentEngine.attachPolicies({
  policyDefinitions: dailyLimitsPolicy,
});
```

### Participant-Specific Daily Limits

```js
const participantLimitsPolicy = {
  [POLICY_TYPE_SCHEDULING]: {
    defaultDailyLimits: {
      SINGLES: 2,
      DOUBLES: 2,
      total: 3,
    },

    // Override for specific participants
    matchUpDailyLimits: [
      {
        participantId: 'injured-player-id',
        SINGLES: 1, // Limit to 1 singles match per day
        total: 1, // No doubles while recovering
      },
      {
        participantId: 'seeded-player-id',
        SINGLES: 1, // Protect seeded players
        DOUBLES: 1,
        total: 2,
      },
    ],
  },
};
```

### Retrieving Daily Limits

```js
const { matchUpDailyLimits } = tournamentEngine.getMatchUpDailyLimits({
  participantId: 'player-id',
});

console.log(matchUpDailyLimits);
// { SINGLES: 2, DOUBLES: 2, total: 3 }
```

---

## Retrieving Scheduling Times

### Get Format-Specific Timing

```js
// Get timing for standard format
const { averageMinutes, recoveryMinutes } = tournamentEngine.getMatchUpFormatTiming({
  matchUpFormat: 'SET3-S:6/TB7',
  categoryName: 'U16',
  eventType: 'SINGLES',
});

console.log(averageMinutes); // 75 (based on U16 category)
console.log(recoveryMinutes); // 60 (singles recovery)

// Get timing for doubles
const timing = tournamentEngine.getMatchUpFormatTiming({
  matchUpFormat: 'SET3-S:6/TB7',
  categoryName: 'U16',
  eventType: 'DOUBLES',
});

console.log(timing.averageMinutes); // 75
console.log(timing.recoveryMinutes); // 30 (doubles recovery shorter)
```

### Get Timing with Fallbacks

```js
// If no specific timing found, falls back to default
const timing = tournamentEngine.getMatchUpFormatTiming({
  matchUpFormat: 'SET1-S:6NOAD', // Format not in policy
  eventType: 'SINGLES',
});

console.log(timing.averageMinutes); // 90 (from defaultTimes)
console.log(timing.recoveryMinutes); // 60 (from defaultTimes)
```

---

## Venue Modification Protection

Prevent accidental venue/court changes when matches are already scheduled:

```js
const protectedSchedulingPolicy = {
  [POLICY_TYPE_SCHEDULING]: {
    allowModificationWhenMatchUpsScheduled: {
      courts: false, // Cannot change court assignments
      venues: false, // Cannot change venue assignments
    },
  },
};

tournamentEngine.attachPolicies({
  policyDefinitions: protectedSchedulingPolicy,
});

// Attempt to modify court after scheduling
const result = tournamentEngine.modifyCourt({
  courtId: 'court-1',
  modifications: { courtName: 'Center Court' },
});

// Will fail if matchUps are scheduled on this court
if (result.error) {
  console.error('Cannot modify court - matchUps scheduled');
}
```

---

## Advanced Examples

### Multi-Format Tournament

```js
const multiFormatPolicy = {
  [POLICY_TYPE_SCHEDULING]: {
    policyName: 'Multi-Format Scheduling',

    defaultDailyLimits: {
      SINGLES: 2,
      DOUBLES: 2,
      total: 3,
    },

    matchUpAverageTimes: [
      // Early rounds: Fast4
      {
        matchUpFormatCodes: ['SET1-S:4/TB5@3'],
        averageTimes: [{ categoryNames: [], minutes: { default: 25 } }],
      },
      // Quarterfinals: Short sets
      {
        matchUpFormatCodes: ['SET3-S:4/TB7'],
        averageTimes: [{ categoryNames: [], minutes: { default: 60 } }],
      },
      // Semifinals and Finals: Standard format
      {
        matchUpFormatCodes: ['SET3-S:6/TB7'],
        averageTimes: [{ categoryNames: [], minutes: { default: 90 } }],
      },
    ],

    matchUpRecoveryTimes: [
      {
        matchUpFormatCodes: ['SET1-S:4/TB5@3'],
        recoveryTimes: [{ categoryNames: [], minutes: { default: 15 } }],
      },
      {
        matchUpFormatCodes: ['SET3-S:4/TB7'],
        recoveryTimes: [{ categoryNames: [], minutes: { default: 30 } }],
      },
      {
        matchUpFormatCodes: ['SET3-S:6/TB7'],
        recoveryTimes: [{ categoryNames: [], minutes: { default: 60 } }],
      },
    ],
  },
};
```

### Tournament Director Override

Tournament directors can override policy defaults dynamically. These functions add extensions to the tournament record that persist and are read by all scheduling functions:

```js
// Set custom timing for specific format at runtime
// Adds tournament-level extension that affects all subsequent scheduling
tournamentEngine.modifyMatchUpFormatTiming({
  matchUpFormat: 'SET3-S:6/TB7',
  averageTimes: [
    {
      categoryNames: ['U12'],
      minutes: { default: 70, DOUBLES: 60 },
    },
  ],
  recoveryTimes: [
    {
      categoryNames: ['U12'],
      minutes: { default: 45, DOUBLES: 30 },
    },
  ],
});

// Set custom daily limits at runtime
// Adds tournament-level extension enforced during all scheduling operations
tournamentEngine.setMatchUpDailyLimits({
  dailyLimits: { SINGLES: 1, DOUBLES: 1, total: 2 },
});
```

:::tip How Extensions Work

- `modifyMatchUpFormatTiming()` adds an extension that overrides policy timing for specific formats
- `setMatchUpDailyLimits()` adds an extension that enforces daily limits per participant
- Both persist at tournament level until explicitly modified
- Multiple calls to `modifyMatchUpFormatTiming()` merge/override values for the same format
- Multiple calls to `setMatchUpDailyLimits()` completely replace previous limits
- See [MatchUp Governor](/docs/governors/matchup-governor) and [Schedule Governor](/docs/governors/schedule-governor) for full documentation

  :::

---

## Default Scheduling Policy

The factory provides `POLICY_SCHEDULING_DEFAULT` with reasonable defaults:

```js
import { POLICY_SCHEDULING_DEFAULT } from 'tods-competition-factory';

// Defaults include:
// - 90 minutes average for standard matches
// - 60 minutes recovery for singles adults
// - 30 minutes recovery for doubles adults
// - 60 minutes recovery for all juniors
// - 120 minutes for wheelchair matches
// - 2 singles + 2 doubles per day, max 3 total
// - Specific times for 20+ common formats
```

**Format Times Included:**

- Standard sets (SET3-S:6/TB7): 90 minutes
- Short sets (SET3-S:4/TB7): 60 minutes
- Fast4 (SET1-S:4/TB5@3): 20 minutes
- Pro sets (SET1-S:8/TB7): 40 minutes
- Match tiebreaks (SET3-S:6/TB7-F:TB10): 85 minutes
- 10-point tiebreak (SET1-S:TB10): 10 minutes
- Timed sets (SET1-S:T20): 20 minutes

See `src/fixtures/policies/POLICY_SCHEDULING_DEFAULT.ts` for complete details.

---

## Policy Hierarchy

Scheduling policies follow standard policy hierarchy:

1. **Draw-level policy** (most specific)
2. **Event-level policy**
3. **Tournament-level policy**
4. **Default policy** (if no custom policy attached)

**Example:**

```js
// Tournament default: 3 matches per day
tournamentEngine.attachPolicies({
  policyDefinitions: {
    [POLICY_TYPE_SCHEDULING]: {
      defaultDailyLimits: { total: 3 },
    },
  },
});

// Championship event override: 1 match per day
tournamentEngine.attachPolicies({
  policyDefinitions: {
    [POLICY_TYPE_SCHEDULING]: {
      defaultDailyLimits: { total: 1 },
    },
  },
  eventId: 'championship-event-id',
});

// Main draw in championship: uses event policy (1 match per day)
// Consolation draw in championship: uses event policy (1 match per day)
// Other events: use tournament policy (3 matches per day)
```

---

## Notes

- **Average times** should include setup/warmup/changeover time
- **Recovery times** are minimum rest between matches
- **Daily limits** apply per calendar day (tournament timezone)
- **Category matching** is case-sensitive: 'U12' ≠ 'u12'
- **Event type matching** uses exact values: 'SINGLES', 'DOUBLES', 'TEAM'
- **Format matching** requires exact format code strings
- Policies affect scheduling algorithms but don't enforce constraints (use scheduling validation methods)
- Extensions can override policy values per-matchUp
- Wheelchair and junior events have longer recovery times in default policy
