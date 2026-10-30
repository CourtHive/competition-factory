---
title: MatchUp Actions Policy
---

The **MatchUp Actions Policy** (`POLICY_TYPE_MATCHUP_ACTIONS`) controls which actions are available for matchUps within tournament structures. This policy determines scoring permissions, scheduling capabilities, participant substitution rules, and team position assignments based on matchUp state, structure configuration, and participant attributes.

**Policy Type:** `matchUpActions`

**When to Use:**

- Controlling scoring and status changes for matchUps
- Managing participant substitutions in team events
- Enforcing gender/category restrictions for team assignments
- Setting process codes for substitutions
- Enabling/disabling specific matchUp actions per structure
- Controlling scheduling permissions

---

## SCORE status-scope metadata

When `matchUpActions()` offers a `SCORE` action, the action includes
`disabledMatchUpStatuses: MatchUpStatusUnion[]` beside `type` and `payload`:

```ts
{
  type: 'SCORE',
  disabledMatchUpStatuses: ['CHALLENGED'],
  payload: { /* existing scoring mutation parameters */ },
}
```

The factory derives this list from the status-scope registry and the same checker
used by mutation validation, with the draw type and explicit tie-rubber/Decider
context. Deciders are identified through draw links. Only registered scoped
statuses can appear; the list is sorted and is `[]` when none are restricted.

This predicts **scope refusals only**. An unlisted status may still be refused for
an invalid score, missing participants, downstream dependencies or another rule.
The metadata does not change whether SCORE is offered and is not a mutation
parameter. No SCORE action means no scoring permission; omitted metadata means
an older producer supplied no scope information.

Hosts pass this list to score-entry controls to withhold scoped statuses before
submission. The engine remains authoritative when the outcome is submitted.

## Policy Structure

```ts
{
  matchUpActions: {
    policyName?: string;                    // Optional policy identifier

    // Selective enablement for structures
    enabledStructures?: Array<{
      stages?: string[];                    // ['QUALIFYING', 'MAIN', 'CONSOLATION']
      stageSequences?: number[];            // [1, 2, 3] - which sequence numbers
      enabledActions?: string[];            // Specific actions to enable (empty = all)
      disabledActions?: string[];           // Specific actions to disable
    }>;

    // Participant validation rules
    participants?: {
      enforceCategory?: boolean;            // Validate category compatibility
      enforceGender?: boolean;              // Validate gender compatibility
    };

    // Process codes for actions
    processCodes?: {
      substitution?: string[];              // Process codes applied to substitutions
    };

    // Substitution behavior
    substituteAfterCompleted?: boolean;     // Allow substitution after completion
    substituteWithoutScore?: boolean;       // Allow substitution when no score present
  }
}
```

---

## Available MatchUp Actions

The following actions can be controlled by this policy:

### Core MatchUp Actions

| Action             | Constant         | Method                          | Description                                         |
| ------------------ | ---------------- | ------------------------------- | --------------------------------------------------- |
| **SCHEDULE**       | `SCHEDULE`       | `addMatchUpScheduleItems`       | Schedule matchUp (set date/time/court)              |
| **SCHEDULE_DATE**  | `SCHEDULE_DATE`  | `addMatchUpScheduleItems`       | Set the scheduled date, within `bounds`             |
| **SCHEDULE_TIME**  | `SCHEDULE_TIME`  | `addMatchUpScheduleItems`       | Set the scheduled time, within `bounds`             |
| **CLEAR_SCHEDULE** | `CLEAR_SCHEDULE` | `addMatchUpScheduleItems`       | Clear the date, time, venue and court               |
| **SCHEDULE_LOCK**  | `SCHEDULE_LOCK`  | `setMatchUpScheduleLock`        | Lock the placement, or unlock it (`scheduleLocked`) |
| **STATUS**         | `STATUS`         | UI/Engine                       | Change matchUp status (COMPLETED, DEFAULTED, etc.)  |
| **SCORE**          | `SCORE`          | `setMatchUpStatus`              | Enter or modify score                               |
| **EXIT**           | `EXIT`           | `setMatchUpStatus`              | Walkover/default before the opponent arrives        |
| **START**          | `START`          | `addMatchUpScheduleItems`       | Record the start time, within `bounds`              |
| **END**            | `END`            | `addMatchUpScheduleItems`       | Record the end time, within `bounds`                |
| **REFEREE**        | `REFEREE`        | `addMatchUpOfficial`            | Assign an official to the matchUp                   |
| **CHECK_IN**       | `CHECK_IN`       | `toggleParticipantCheckInState` | Check a participant in or out for the matchUp       |
| **SCOREKEEPER**    | `SCOREKEEPER`    | `assignMatchUpScorekeeper`      | Nominate a scorekeeper                              |
| **PENALTY**        | `PENALTY`        | `addPenalty`                    | Add penalty during matchUp                          |

Before 2026-10-30 the `SCHEDULE` action named `setMatchUpStatus`, and `START`, `END` and `REFEREE` carried no method.
`SCHEDULE_METHOD` (`setMatchUpStatus`) is deprecated as misnamed; `SCORE_METHOD` is the same value.

### Scheduling and staffing actions

`SCHEDULE_DATE`, `SCHEDULE_TIME`, `CLEAR_SCHEDULE`, `SCHEDULE_LOCK`, `START`, `END`, `REFEREE`, `CHECK_IN` and
`SCOREKEEPER` follow the matchUp's state (since 2026-10-30). Each is offered only where its write would be accepted,
and each can be switched off with `enabledActions` / `disabledActions`.

| MatchUp                                                     | Offered                                                                                        |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| still to be played                                          | all of them; check-in, scorekeeper, start and end need a participant (start and end need both) |
| COMPLETED or RETIRED                                        | `REFEREE`, `SCHEDULE_DATE`, `SCHEDULE_TIME`, `START`, `END`                                    |
| a walkover, default, double exit, cancellation, dead rubber | `REFEREE`, `SCHEDULE_DATE`, `SCHEDULE_TIME`: no start or end                                   |
| a carried or produced exit, a BYE                           | none of them, not even an official                                                             |

- A locked placement is not offered `SCHEDULE_DATE`, `SCHEDULE_TIME` or `CLEAR_SCHEDULE`. `SCHEDULE_LOCK` is offered
  where a lock would mean something (a placement, not yet decided); its `scheduleLocked` says which way it goes, and
  its `payload.lock` is `null` to unlock or `{}` to lock (the caller adds `lockedAt`).
- `CLEAR_SCHEDULE` is offered only when there is a placement to clear.
- `SCHEDULE_DATE` and `SCHEDULE_TIME` carry `bounds` from
  [`getMatchUpScheduleBounds`](../governors/schedule-governor.md#getmatchupschedulebounds) (`earliestDate`, `latestDate`,
  `scheduledAfter`, `scheduledBefore`), and `START` and `END` carry `recordedAfter` and `recordedBefore`. A picker
  limited to them offers only what the write accepts.
- The payloads leave the value to the caller: `schedule: { scheduledDate: undefined }`, `participantId: undefined`.

### Team Event Actions

| Action                  | Constant              | Method                          | Description                            |
| ----------------------- | --------------------- | ------------------------------- | -------------------------------------- |
| **SUBSTITUTION**        | `SUBSTITUTION`        | `substituteParticipant`         | Substitute participant in team matchUp |
| **REMOVE_SUBSTITUTION** | `REMOVE_SUBSTITUTION` | Reverse substitution            | Remove substitution                    |
| **REPLACE_PARTICIPANT** | `REPLACE_PARTICIPANT` | Team position change            | Replace team position participant      |
| **REMOVE_PARTICIPANT**  | `REMOVE_PARTICIPANT`  | `removeTieMatchUpParticipantId` | Remove participant from team position  |

### Team Collection Position Actions

| Action                    | Method                           | Description                                     |
| ------------------------- | -------------------------------- | ----------------------------------------------- |
| **Assign Team Position**  | `assignTieMatchUpParticipantId`  | Assign individual to team collection position   |
| **Replace Team Position** | `replaceTieMatchUpParticipantId` | Replace individual in team collection position  |
| **Remove Team Position**  | `removeTieMatchUpParticipantId`  | Remove individual from team collection position |

---

## Default Policy

```js
import { fixtures } from 'tods-competition-factory';
const { POLICY_MATCHUP_ACTIONS_DEFAULT } = fixtures.policies;

// Default policy:
// - All actions enabled for all structures
// - Gender enforcement enabled
// - Category enforcement enabled
// - Substitution process codes applied
// - No substitution after completion
// - No substitution without score
{
  matchUpActions: {
    policyName: 'matchUpActionsDefault',

    enabledStructures: [{
      stages: [],                           // All stages
      stageSequences: [],                   // All sequences
      enabledActions: [],                   // All actions enabled
      disabledActions: []                   // No actions disabled
    }],

    participants: {
      enforceCategory: true,                // Validate category compatibility
      enforceGender: true                   // Validate gender compatibility
    },

    processCodes: {
      substitution: [
        'RANKING.IGNORE',                   // Ignore for ranking purposes
        'RATING.IGNORE'                     // Ignore for rating purposes
      ]
    },

    substituteAfterCompleted: false,        // No substitution after completion
    substituteWithoutScore: false           // Require score for substitution
  }
}
```

---

## Basic Examples

### Enable All MatchUp Actions

```js
import { policyConstants } from 'tods-competition-factory';
const { POLICY_TYPE_MATCHUP_ACTIONS } = policyConstants;

// Allow all matchUp actions without restrictions
const openPolicy = {
  [POLICY_TYPE_MATCHUP_ACTIONS]: {
    policyName: 'Open MatchUp Actions',
    enabledStructures: [
      {
        stages: [],
        stageSequences: [],
        enabledActions: [], // Empty = all enabled
      },
    ],
    participants: {
      enforceCategory: false,
      enforceGender: false,
    },
  },
};

tournamentEngine.attachPolicies({
  policyDefinitions: openPolicy,
});
```

### Restrict to Scheduling Only

```js
// Only allow scheduling - no scoring or status changes
const scheduleOnlyPolicy = {
  [POLICY_TYPE_MATCHUP_ACTIONS]: {
    policyName: 'Schedule Only',
    enabledStructures: [
      {
        stages: [],
        stageSequences: [],
        enabledActions: ['SCHEDULE'], // Only scheduling enabled
      },
    ],
  },
};
```

### Allow Post-Match Substitution

```js
// Enable substitution even after matchUp is completed
const flexibleSubstitutionPolicy = {
  [POLICY_TYPE_MATCHUP_ACTIONS]: {
    policyName: 'Flexible Substitution',
    participants: {
      enforceCategory: true,
      enforceGender: true,
    },
    substituteAfterCompleted: true, // Allow after completion
    substituteWithoutScore: true, // Allow even without score
  },
};
```

---

## Advanced Examples

### Stage-Specific Action Control

```js
// Different actions for different stages
const stageSpecificPolicy = {
  [POLICY_TYPE_MATCHUP_ACTIONS]: {
    policyName: 'Stage Specific MatchUps',
    enabledStructures: [
      {
        // QUALIFYING: Full control
        stages: ['QUALIFYING'],
        stageSequences: [1],
        enabledActions: [], // All actions
      },
      {
        // MAIN: Restrict certain actions
        stages: ['MAIN'],
        stageSequences: [1],
        disabledActions: ['SUBSTITUTION'], // No substitutions in main
      },
      {
        // CONSOLATION: Flexible
        stages: ['CONSOLATION'],
        stageSequences: [],
        enabledActions: [], // All actions including substitution
      },
    ],
  },
};
```

### Team Event with Gender Enforcement

```js
// Strict gender enforcement for team events
const genderedTeamPolicy = {
  [POLICY_TYPE_MATCHUP_ACTIONS]: {
    policyName: 'Gendered Team Event',
    participants: {
      enforceCategory: true, // Must match event category
      enforceGender: true, // Must match event gender
    },
    processCodes: {
      substitution: ['RANKING.IGNORE', 'RATING.IGNORE'],
    },
  },
};

// This prevents:
// - Assigning FEMALE participant to MALE singles position
// - Assigning MALE participant to FEMALE doubles position
// - Cross-category assignments
```

#### Mixed doubles pairing

When `enforceGender` is active and a collection matchUp's gender is `MIXED`, gender
enforcement also applies to the **second member** of each pair. Once one participant
has been assigned to a side, `matchUpActions` offers only opposite-gender participants
for that side's remaining slot, and `assignTieMatchUpParticipant` rejects a same-gender
second member with `INVALID_PARTICIPANT` ("Mixed doubles pair requires one participant
of each gender"). A `MIXED` collection therefore always resolves to one participant of
each gender per side.

### Flexible Club Team Event

```js
// Relaxed rules for club team events
const clubTeamPolicy = {
  [POLICY_TYPE_MATCHUP_ACTIONS]: {
    policyName: 'Club Team Flexibility',
    participants: {
      enforceCategory: false, // Allow mixed categories
      enforceGender: false, // Allow mixed gender assignments
    },
    substituteAfterCompleted: true, // Fix mistakes after completion
    substituteWithoutScore: true, // Allow early substitutions
    processCodes: {
      substitution: ['CLUB.SUBSTITUTE'],
    },
  },
};
```

### Live Scoring Only

```js
// Only allow score entry and penalties (live scoring scenario)
const liveScoringPolicy = {
  [POLICY_TYPE_MATCHUP_ACTIONS]: {
    policyName: 'Live Scoring',
    enabledStructures: [
      {
        stages: [],
        stageSequences: [],
        enabledActions: [
          'SCORE', // Score entry
          'STATUS', // Status changes
          'PENALTY', // Penalty assessment
          'START', // Mark start time
          'END', // Mark end time
        ],
      },
    ],
  },
};
```

### Disable All Actions (View Only)

```js
// Completely disable matchUp modifications
const viewOnlyPolicy = {
  [POLICY_TYPE_MATCHUP_ACTIONS]: {
    policyName: 'View Only',
    enabledStructures: [
      {
        stages: [],
        stageSequences: [],
        enabledActions: [], // Will return empty validActions
      },
    ],
  },
};
```

---

## Real-World Examples

### Professional Tournament

```js
// Professional tournament with strict controls
const proTournamentPolicy = {
  [POLICY_TYPE_MATCHUP_ACTIONS]: {
    policyName: 'Professional Tournament',
    enabledStructures: [
      {
        stages: ['MAIN'],
        stageSequences: [1],
        enabledActions: ['SCORE', 'STATUS', 'PENALTY', 'SCHEDULE', 'REFEREE', 'START', 'END'],
        disabledActions: ['SUBSTITUTION'], // No substitutions in pro singles
      },
    ],
    participants: {
      enforceCategory: true,
      enforceGender: true,
    },
    substituteAfterCompleted: false,
    substituteWithoutScore: false,
  },
};
```

### College Team Tennis

```js
// NCAA/College team tennis with substitution rules
const collegeTeamPolicy = {
  [POLICY_TYPE_MATCHUP_ACTIONS]: {
    policyName: 'College Team Tennis',
    enabledStructures: [
      {
        stages: [],
        stageSequences: [],
        enabledActions: [], // All actions enabled
      },
    ],
    participants: {
      enforceCategory: true, // Must be college category
      enforceGender: true, // Enforce gender for positions
    },
    processCodes: {
      substitution: ['NCAA.SUBSTITUTE', 'RANKING.IGNORE', 'RATING.IGNORE'],
    },
    substituteAfterCompleted: false, // NCAA rules: no sub after completion
    substituteWithoutScore: true, // Can substitute before scoring
  },
};
```

### USTA League

```js
// USTA League with flexible substitution
const ustaLeaguePolicy = {
  [POLICY_TYPE_MATCHUP_ACTIONS]: {
    policyName: 'USTA League',
    enabledStructures: [
      {
        stages: [],
        stageSequences: [],
        enabledActions: [],
      },
    ],
    participants: {
      enforceCategory: true, // Must match NTRP level
      enforceGender: true, // Enforce gender for positions
    },
    processCodes: {
      substitution: ['USTA.LEAGUE.SUBSTITUTE', 'RANKING.IGNORE'],
    },
    substituteAfterCompleted: false, // Standard rule
    substituteWithoutScore: true, // Allow early withdrawal substitution
  },
};
```

### Club Social Event

```js
// Relaxed club event with flexible rules
const clubSocialPolicy = {
  [POLICY_TYPE_MATCHUP_ACTIONS]: {
    policyName: 'Club Social',
    enabledStructures: [
      {
        stages: [],
        stageSequences: [],
        enabledActions: [], // All actions
      },
    ],
    participants: {
      enforceCategory: false, // Allow mixed skill levels
      enforceGender: false, // Allow any gender combinations
    },
    substituteAfterCompleted: true, // Fix mistakes
    substituteWithoutScore: true, // Flexible substitution
    processCodes: {
      substitution: ['SOCIAL.EVENT'],
    },
  },
};
```

---

## Understanding MatchUp States

MatchUp actions availability depends on matchUp state:

### Unplayed MatchUp (TO_BE_PLAYED)

**Available Actions:**

- `SCHEDULE` - Set court/time
- `REFEREE` - Assign referee
- `STATUS` - Change status (e.g., to DEFAULTED)
- `PENALTY` - Add penalties

**Not Available:**

- `SCORE` - No participants or not ready to score
- `START` / `END` - Cannot start unassigned matchUp

### One Participant, the Other Not Yet Arrived

A participant has advanced and their opponent has not; in between, the present participant falls ill, is
injured, or is defaulted for conduct. USTA records such a walkover or default without waiting for the
match (CA, 2026-10-04).

**Available Actions:**

- `EXIT` - Record a `WALKOVER` or `DEFAULTED` against the participant already there. The payload names
  `exitingParticipantId`, `exitingSideNumber` and the `matchUpStatuses` offered, and its
  `outcome.winningSide` already awards the EMPTY side; supply `outcome.matchUpStatus` (and optionally
  `matchUpStatusCodes`) and call `setMatchUpStatus`. Whoever later arrives takes the walkover and advances.

Offered exactly where the engine accepts it, and independent of `propagateExitStatus`, which decides only
whether the exit is carried into the loser's next matchUp. Not offered on an AD_HOC matchUp (its sides
are assigned, never arrived at), beside a BYE, or where the empty seat is claimed by nobody. Once
recorded, it is removed with `CLEAR_SCORE`.

### Ready to Score

**Conditions:**

- Both participants assigned OR
- Both drawPositions filled with participants
- Not already completed
- Not a BYE matchUp

**Available Actions:**

- All scheduling actions PLUS
- `SCORE` - Enter score
- `STATUS` - Change status
- `START` / `END` - Mark start/end times

### Completed MatchUp

**Available Actions:**

- `SCORE` - Modify score (unless restricted)
- `PENALTY` - Add penalties
- `REFEREE`, `SCHEDULE_DATE`, `SCHEDULE_TIME`, `START`, `END` - correct the date, time, official and recorded times
  (no clear, lock, check-in or scorekeeper)

**Restricted Actions:**

- `SUBSTITUTION` - Blocked by `substituteAfterCompleted: false`

### BYE MatchUp

**Behavior:** Returns `isByeMatchUp: true` with empty `validActions`

---

## Using matchUpActions

```js
// Get available actions for a specific matchUp
const {
  validActions, // Array of available actions
  isByeMatchUp, // Boolean - is this a BYE matchUp?
  structureIsComplete, // Boolean - is structure complete?
  isDoubleExit, // Boolean - double walkover/default?
} = tournamentEngine.matchUpActions({
  policyDefinitions, // Optional - override default policy
  matchUpId, // Required - matchUp identifier
  drawId, // Optional - improves performance
  sideNumber, // Optional - for team position actions
  participantId, // Optional - for participant-specific actions
  enforceGender, // Optional - override policy gender enforcement
  restrictAdHocRoundParticipants, // Deprecated, no effect - ad hoc rounds never offer a participant already in the round
});

// Each validAction contains:
const {
  type, // Action type constant (e.g., 'SCORE')
  method, // Engine method name (if applicable)
  payload, // Parameters for method
  info, // Additional information
} = validAction;
```

---

## Executing MatchUp Actions

### Example 1: Scoring a MatchUp

```js
// 1. Get available actions
const { validActions } = tournamentEngine.matchUpActions({
  matchUpId: 'match-123',
  drawId: 'draw-abc',
});

// 2. Find score action
const scoreAction = validActions.find((action) => action.type === 'SCORE');

if (scoreAction) {
  const { method, payload } = scoreAction;

  // 3. Add outcome
  payload.outcome = {
    scoreStringSide1: '6-4 6-3',
    scoreStringSide2: '',
    winningSide: 1,
  };

  // 4. Execute
  const result = tournamentEngine[method](payload);
  expect(result.success).toEqual(true);
}
```

### Example 2: Team Position Assignment

```js
// Get actions for a collection matchUp with sideNumber
const { validActions } = tournamentEngine.matchUpActions({
  matchUpId: 'team-match-123',
  sideNumber: 1, // Side 1 actions
  drawId,
});

// Find assign action
const assignAction = validActions.find((action) => action.method === 'assignTieMatchUpParticipantId');

if (assignAction) {
  const { method, payload, availableParticipants } = assignAction;

  // Select participant from available list
  payload.participantId = availableParticipants[0].participantId;

  // Execute assignment
  const result = tournamentEngine[method](payload);
  expect(result.success).toEqual(true);
}
```

### Example 3: Substitution

```js
// Substitute participant in team matchUp
const { validActions } = tournamentEngine.matchUpActions({
  matchUpId: 'team-match-456',
  drawId,
});

const substitutionAction = validActions.find((action) => action.type === 'SUBSTITUTION');

if (substitutionAction) {
  const { method, payload, availableParticipants } = substitutionAction;

  payload.substituteParticipantId = availableParticipants[0].participantId;
  payload.existingParticipantId = 'participant-to-replace';

  const result = tournamentEngine[method](payload);
  expect(result.success).toEqual(true);
}
```

---

## Gender and Category Enforcement

### enforceGender

When `enforceGender: true`:

```js
// MALE event - only MALE participants can be assigned
// FEMALE event - only FEMALE participants can be assigned
// ANY/MIXED event - any gender allowed

// Example: Prevents this error
const result = tournamentEngine.assignTieMatchUpParticipantId({
  participantId: femaleParticipantId, // FEMALE
  matchUpId: maleSinglesMatchUpId, // MALE collection
  drawId,
});
// Returns error: INVALID_PARTICIPANT_TYPE
```

### enforceCategory

When `enforceCategory: true`:

```js
// Validates collectionDefinition.category against event.category

// Example: U18 team event
// - Can only assign U18 participants to U18 collection positions
// - Cannot assign U16 participants (different category)
// - Cannot assign OPEN participants (different category)
```

### Disabling Enforcement

```js
// Disable for flexibility (club events, mixed tournaments)
const flexiblePolicy = {
  [POLICY_TYPE_MATCHUP_ACTIONS]: {
    participants: {
      enforceCategory: false, // Allow cross-category
      enforceGender: false, // Allow cross-gender
    },
  },
};

// OR override per query
const { validActions } = tournamentEngine.matchUpActions({
  enforceGender: false, // Override policy for this query
  matchUpId,
  drawId,
});
```

---

## Process Codes for Substitutions

Process codes are applied to matchUps when substitutions occur:

```js
processCodes: {
  substitution: [
    'RANKING.IGNORE', // Don't use result for ranking calculations
    'RATING.IGNORE', // Don't use result for rating calculations
    'CUSTOM.CODE', // Custom process code
  ];
}
```

**Usage:**

- Marking results that shouldn't affect rankings
- Identifying substituted matchUps for reporting
- Custom processing logic for specific scenarios
- Federation-specific rule enforcement

**Access:**

```js
const { matchUp } = tournamentEngine.findMatchUp({ matchUpId, drawId });
const processCodes = matchUp.processCodes;
// ['RANKING.IGNORE', 'RATING.IGNORE']
```

---

## Testing MatchUp Actions

### Test 1: Verify Default Actions

```js
import { expect, it } from 'vitest';
import { mocksEngine, tournamentEngine } from 'tods-competition-factory';

it('returns correct actions for unplayed matchUp', () => {
  const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 16,
        participantsCount: 16,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);
  const [drawId] = drawIds;

  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
  const unplayedMatchUp = matchUps.find((m) => m.matchUpStatus === 'TO_BE_PLAYED');

  const { validActions } = tournamentEngine.matchUpActions({
    matchUpId: unplayedMatchUp.matchUpId,
    drawId,
  });

  const actionTypes = validActions.map((a) => a.type);

  expect(actionTypes).toContain('SCHEDULE');
  expect(actionTypes).toContain('REFEREE');
  expect(actionTypes).toContain('STATUS');
});
```

### Test 2: Verify Scoring Availability

```js
it('enables scoring for ready matchUps', () => {
  const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 16,
        participantsCount: 16,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);
  const [drawId] = drawIds;

  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
  const readyMatchUp = matchUps.find(
    (m) => m.matchUpStatus === 'TO_BE_PLAYED' && m.sides?.every((s) => s.participantId),
  );

  const { validActions } = tournamentEngine.matchUpActions({
    matchUpId: readyMatchUp.matchUpId,
    drawId,
  });

  const actionTypes = validActions.map((a) => a.type);

  expect(actionTypes).toContain('SCORE');
  expect(actionTypes).toContain('START');
  expect(actionTypes).toContain('END');
});
```

### Test 3: Verify BYE MatchUp

```js
it('returns isByeMatchUp for BYE matchUps', () => {
  const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 16,
        participantsCount: 14, // Creates BYEs
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);
  const [drawId] = drawIds;

  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
  const byeMatchUp = matchUps.find((m) => m.matchUpStatus === 'BYE');

  const { isByeMatchUp, validActions } = tournamentEngine.matchUpActions({
    matchUpId: byeMatchUp.matchUpId,
    drawId,
  });

  expect(isByeMatchUp).toEqual(true);
  expect(validActions).toEqual([]);
});
```

### Test 4: Verify Gender Enforcement

```js
import { policyConstants } from 'tods-competition-factory';
const { POLICY_TYPE_MATCHUP_ACTIONS } = policyConstants;

it('enforces gender restrictions', () => {
  // Create team event with gendered positions
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: {
      participantsCount: 20,
      sex: 'MIXED',
    },
  });

  tournamentEngine.setState(tournamentRecord);

  const genderPolicy = {
    [POLICY_TYPE_MATCHUP_ACTIONS]: {
      participants: {
        enforceGender: true,
      },
    },
  };

  tournamentEngine.attachPolicies({
    policyDefinitions: genderPolicy,
  });

  // Attempt to assign FEMALE participant to MALE position should fail
  // (Implementation depends on team event structure)
});
```

### Test 5: Verify Custom Policy

```js
import { policyConstants } from 'tods-competition-factory';
const { POLICY_TYPE_MATCHUP_ACTIONS } = policyConstants;

it('respects custom action restrictions', () => {
  const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 16,
        participantsCount: 16,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);
  const [drawId] = drawIds;

  // Policy: only allow scheduling
  const scheduleOnlyPolicy = {
    [POLICY_TYPE_MATCHUP_ACTIONS]: {
      enabledStructures: [
        {
          stages: [],
          stageSequences: [],
          enabledActions: ['SCHEDULE'],
        },
      ],
    },
  };

  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
  const matchUp = matchUps[0];

  const { validActions } = tournamentEngine.matchUpActions({
    policyDefinitions: scheduleOnlyPolicy,
    matchUpId: matchUp.matchUpId,
    drawId,
  });

  const actionTypes = validActions.map((a) => a.type);

  expect(actionTypes).toEqual(['SCHEDULE']);
  expect(actionTypes).not.toContain('SCORE');
  expect(actionTypes).not.toContain('STATUS');
});
```

---

## Common Scenarios

### Scenario 1: Unscheduled MatchUp

```js
// MatchUp not yet scheduled
matchUpActions({ matchUpId, drawId });
// Returns: ['SCHEDULE', 'REFEREE', 'STATUS']
// Cannot score until scheduled and participants assigned
```

### Scenario 2: Scheduled, Ready to Play

```js
// Both participants assigned, scheduled
matchUpActions({ matchUpId, drawId });
// Returns: ['SCHEDULE', 'REFEREE', 'STATUS', 'SCORE', 'START', 'END', 'PENALTY']
// Can now score the matchUp
```

### Scenario 3: Completed MatchUp

```js
// MatchUp already has score and winningSide
matchUpActions({ matchUpId, drawId });
// Returns: ['SCHEDULE', 'REFEREE', 'SCORE', 'PENALTY']
// Can modify score or add penalties
// (SUBSTITUTION blocked if substituteAfterCompleted: false)
```

### Scenario 4: Team Collection MatchUp

```js
// Team event with collection positions
matchUpActions({
  matchUpId,
  sideNumber: 1, // Query for side 1
  drawId,
});
// Returns actions including team position assignments:
// - Assign team position
// - Replace team position
// - Remove team position
// - Plus standard matchUp actions
```

---

## Notes

- **Default Behavior**: All actions enabled with gender/category enforcement
- **Empty Arrays**: `stages: []` means "applies to all stages"
- **Empty enabledActions**: `enabledActions: []` means "all actions enabled"
- **BYE MatchUps**: Always return empty validActions with `isByeMatchUp: true`
- **Gender Enforcement**: Prevents cross-gender assignments in gendered events
- **Category Enforcement**: Prevents cross-category assignments
- **Process Codes**: Applied automatically to substitutions for tracking
- **Substitution Rules**: Controlled by `substituteAfterCompleted` and `substituteWithoutScore`
- **Policy Precedence**: Specified policyDefinitions override attached policies
- **Team Events**: Additional actions for collection matchUps and tie positions

---

## Related Methods

- `tournamentEngine.matchUpActions()` - Query available actions
- `tournamentEngine.setMatchUpStatus()` - Execute SCORE/STATUS/EXIT/CLEAR_SCORE actions
- `tournamentEngine.addMatchUpScheduleItems()` - Execute SCHEDULE, SCHEDULE_DATE, SCHEDULE_TIME, CLEAR_SCHEDULE, START and END
- `tournamentEngine.addPenalty()` - Execute PENALTY action
- `tournamentEngine.substituteParticipant()` - Execute SUBSTITUTION action
- `tournamentEngine.assignTieMatchUpParticipantId()` - Assign team position
- `tournamentEngine.replaceTieMatchUpParticipantId()` - Replace team position
- `tournamentEngine.removeTieMatchUpParticipantId()` - Remove team position

---

## Related Concepts

- [Actions](/docs/concepts/actions) - Understanding the actions system
- [Policies](/docs/concepts/policies) - Policy system overview
- [Scheduling Overview](/docs/concepts/scheduling-overview) - MatchUp scheduling concepts
