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
        byPlayedMinutes?: Array<{                 // Recovery banded by measured duration
          upTo?: number;                          // Band ceiling; omit for the catch-all
          minutes: number;
        }>;
      }>;
      overnightTimes?: Array<{                    // Rest across a day boundary
        categoryNames?: string[];
        categoryTypes?: string[];                 // 12 hours is a JUNIOR rule
        minutes: {
          default: number;                        // 0 means "no rule"
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
const { matchUpDailyLimits } = tournamentEngine.getMatchUpDailyLimits();

console.log(matchUpDailyLimits);
// { SINGLES: 2, DOUBLES: 2, total: 3 }   — when a scheduling policy is attached
// undefined                              — when none is
```

The method returns the **tournament-wide** limits and takes no `participantId`; per-participant
overrides live in the policy's `matchUpDailyLimits` array and are applied by the scheduler, not
returned here. In a multi-tournament context it accepts an optional `tournamentId`.

:::caution `undefined` means "no limit configured" — do not substitute your own

`getMatchUpDailyLimits` resolves `tournamentDailyLimits || policy.defaultDailyLimits` and **does not
fall back to `POLICY_SCHEDULING_DEFAULT`**. A tournament with no scheduling policy attached therefore
gets `undefined`, not `{ SINGLES: 2, DOUBLES: 2, total: 3 }` — even though that is what the fixture
would have supplied.

**This is deliberate, and it is an asymmetry with its own sibling.** `getMatchUpFormatTiming` _does_
substitute the fixture, so the same unpoliced tournament gets real per-format averages and recovery
times while getting no daily limits at all.

The distinction is between an estimate and a rule. An average match duration is a **guess at a
quantity** — substituting one makes a schedule approximately right instead of flatly wrong. A daily
limit is a **constraint** — substituting one would make the scheduler refuse to place a
participant's third matchUp, enforcing a rule the tournament never adopted. A default is not a
detection.

So a consumer must render "no limit configured" rather than defaulting to 3. TMX's Inspector rest
rows do this correctly: they report the ordinal ("match #3 today") and omit the limit clause entirely
when none is configured.

The same contract governs [`overnightMinutes`](#overnight-recovery).
:::

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

### Evaluate Against a Policy That Is Not Attached

`policyDefinitions` substitutes a scheduling policy for whatever is attached to the tournamentRecord, so a caller can ask "what would this tournament look like under a different policy" without mutating it. A supplied policy wins; omitted, resolution is exactly as before.

```js
const timing = tournamentEngine.getMatchUpFormatTiming({
  matchUpFormat: 'SET3-S:6/TB7',
  eventType: 'DOUBLES',
  policyDefinitions: strictJuniorSchedulingPolicy, // not attached to the record
});
```

This is what the [Participant Recovery Time](/docs/governors/report-governor#participant-recovery-time-report) and [Participant Experience](/docs/governors/report-governor#participant-experience-report) reports use to evaluate a completed tournament against a policy other than the one it ran under.

---

## Overnight Recovery

`defaultTimes.overnightTimes` sets the minimum rest between the **last matchUp of one day and the first of the next**. It differs from `recoveryTimes` in two ways that matter:

1. **It is not per-format.** An overnight rule is a property of the day boundary, not of what was played — the USTA _Friend at Court_ states it as a flat 12 hours for junior divisions regardless of format. So there is no `matchUpFormat` axis.
2. **It is category-dependent.** The 12-hour figure is a _junior_ rule; adult play carries no equivalent constraint. That is why the default policy pairs a JUNIOR entry with an unconstrained catch-all rather than stating one flat figure.

```js
defaultTimes: {
  overnightTimes: [
    { categoryTypes: ['JUNIOR'], minutes: { default: 720 } }, // 12 hours
    { minutes: { default: 0 } },                              // everyone else: no rule
  ],
}
```

Precedence mirrors recovery: event scheduling extension → tournament scheduling → the attached or supplied policy → the caller's default.

:::caution Absent means "no rule", not zero
Where nothing is configured, `getMatchUpFormatTiming` returns `overnightMinutes: undefined`. A consumer must report that as _unconstrained_ rather than substituting a figure of its own — the same contract `getMatchUpDailyLimits` already has. Reports built on it flag nothing for a category with no rule, which is the correct outcome, not a gap.
:::

## Duration-Banded Recovery

Some sanctioning bodies scale rest by how long the previous matchUp **actually ran** rather than by its format. The long-standing USTA table gives 30 minutes after a match under an hour, an hour after one to one-and-a-half, and ninety minutes beyond that. Expressed as an ordered band list on a recovery-times entry:

```js
recoveryTimes: [
  {
    categoryTypes: ['JUNIOR'],
    minutes: { default: 60 },
    byPlayedMinutes: [
      { upTo: 60, minutes: 30 },
      { upTo: 90, minutes: 60 },
      { minutes: 90 }, // catch-all — no `upTo`
    ],
  },
];
```

Bands may be authored in any order; the catch-all always sorts last. A matched band overrides the flat `minutes` figure, and `getMatchUpFormatTiming` reports `recoveryFromPlayedMinutes: true` when it did.

:::info Opt-in on both sides
A band applies only when the policy authors `byPlayedMinutes` **and** the caller supplies a `playedMinutes` it actually measured.

Applied to an _estimated_ duration the banding is circular: the estimate is `averageMinutes`, drawn from the very policy being consulted, so the band would be selected by the number the policy already predicted.

No scheduler call site supplies `playedMinutes`, and none can — recovery is resolved once per matchUpFormat cohort and fanned out to every matchUp in it, one level coarser than the per-instance quantity a band needs. **Scheduling behaviour is therefore unchanged by construction rather than behind a feature flag.** The report layer is the intended consumer, where every duration is retrospective and its provenance is known per row.
:::

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
// - 12 hours overnight recovery for juniors; no overnight rule for adults
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
