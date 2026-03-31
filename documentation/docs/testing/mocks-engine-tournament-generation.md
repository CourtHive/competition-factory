---
title: Tournament Generation
---

# Tournament Generation

The `generateTournamentRecord` method is the primary tool for creating complete tournament structures for testing. It can generate everything from simple tournaments to complex multi-event, multi-venue competitions.

## Basic Syntax

```js
const {
  tournamentRecord, // The complete tournament object
  eventIds, // Array of generated event IDs
  drawIds, // Array of generated draw IDs
  venueIds, // Array of generated venue IDs
} = mocksEngine.generateTournamentRecord(options);
```

## Complete Options Reference

```typescript
interface GenerateTournamentRecordOptions {
  // Tournament Properties
  startDate?: string; // ISO date string (default: today)
  endDate?: string; // ISO date string (default: startDate + 6 days)
  tournamentAttributes?: object; // Additional tournament properties
  tournamentExtensions?: array; // Extensions to attach to tournament
  tournamentId?: string; // Override generated ID

  // Convenience
  setState?: boolean; // Auto-load into tournamentEngine (default: false)

  // Participants
  participantsProfile?: {
    // See Participant Generation docs
    participantsCount?: number; // Default: 32
    participantType?: string; // 'INDIVIDUAL', 'PAIR', 'TEAM'
    sex?: string; // 'MALE', 'FEMALE'
    // ... see participantsProfile section
  };

  // Draws
  drawProfiles?: array; // Array of draw configurations
  eventProfiles?: array; // Array of event configurations

  // Venues
  venueProfiles?: array; // Array of venue configurations

  // Scheduling
  schedulingProfile?: array; // Scheduling directives
  autoSchedule?: boolean; // Auto-schedule using profile

  // Match Completion
  completeAllMatchUps?: boolean; // Complete all generated matchUps
  randomWinningSide?: boolean; // Random winners (default: false = side 1 wins)
  matchUpStatusProfile?: object; // Control matchUp status distribution

  // IDs
  uuids?: array; // Pre-defined UUIDs for entities

  // Deterministic generation
  nonRandom?: number; // Seed for deterministic PRNG (replaces Math.random)

  // Policies
  policyDefinitions?: object; // Attach policy definitions
}
```

## Tournament Properties

:::note Sex vs Gender
In the [CODES](/docs/data-standards#codes) data model:

- **Persons have `sex`** - A biological attribute (MALE/FEMALE) stored in `person.sex`
- **Events have `gender`** - A competition category attribute (MALE/FEMALE/MIXED/ANY) stored in `event.gender`

Use `participantsProfile.sex` to generate participants with specific person sex attributes. Use `event.gender` or `drawProfile.gender` to categorize the competition.
:::

### Basic Properties

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  startDate: '2024-06-01',
  endDate: '2024-06-07',
  tournamentAttributes: {
    tournamentName: 'Summer Championships',
    tournamentRank: 'GOLD',
    indoorOutdoor: 'OUTDOOR',
  },
});
```

### Custom Tournament ID

```js
const tournamentId = 'my-custom-id';
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  tournamentId,
  drawProfiles: [{ drawSize: 16 }],
});

console.log(tournamentRecord.tournamentId); // 'my-custom-id'
```

### Auto-Loading with setState

For convenience, automatically load the generated tournament into the engine:

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 16 }],
  setState: true, // Automatically calls tournamentEngine.setState(tournamentRecord)
});

// Tournament is already loaded - no need to call setState manually
const { matchUps } = tournamentEngine.allTournamentMatchUps();
```

This is especially useful in test setup where you want to immediately work with the tournament:

```js
beforeEach(() => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
    venueProfiles: [{ courtsCount: 8 }],
    setState: true, // Ready to use tournamentEngine immediately
  });
});

test('can schedule matches', () => {
  // tournamentEngine already has the tournament loaded
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  // ... test scheduling
});
```

### Tournament Extensions

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  tournamentExtensions: [
    {
      name: 'customData',
      value: { region: 'Southwest', tier: 1 },
    },
  ],
});
```

## Using drawProfiles

Draw profiles define the structure of draws within events. Each profile creates a separate event with a single draw.

:::tip Scoped Participant Generation
Each `drawProfile` can include its own `participantsProfile` to generate participants specifically for that draw, overriding or extending the tournament-level `participantsProfile`. This is useful when you need different participant demographics for different events.
:::

### Basic Draw

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    { drawSize: 32 }, // Creates 32-draw single elimination singles event
  ],
});
```

### Multiple Draws

```js
const { tournamentRecord, drawIds, eventIds } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    { drawSize: 32, eventType: 'SINGLES' },
    { drawSize: 16, eventType: 'DOUBLES' },
    { drawSize: 8, eventType: 'SINGLES', drawType: 'ROUND_ROBIN' },
  ],
});

console.log(eventIds.length); // 3 events
console.log(drawIds.length); // 3 draws
```

### Draw Types

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    { drawSize: 16, drawType: 'SINGLE_ELIMINATION' }, // Default
    { drawSize: 16, drawType: 'ROUND_ROBIN' },
    { drawSize: 16, drawType: 'COMPASS' },
    { drawSize: 16, drawType: 'FEED_IN_CHAMPIONSHIP' },
    { drawSize: 16, drawType: 'FIRST_MATCH_LOSER_CONSOLATION' },
    { drawSize: 16, drawType: 'ROUND_ROBIN_WITH_PLAYOFF' },
  ],
});
```

### Event Types

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    { drawSize: 32, eventType: 'SINGLES' }, // Default
    { drawSize: 16, eventType: 'DOUBLES' },
    { drawSize: 4, eventType: 'TEAM' },
  ],
});
```

### Seeding

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    {
      drawSize: 32,
      seedsCount: 8, // Top 8 participants will be seeded
    },
  ],
});
```

### BYEs

Create draws with fewer participants than positions:

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    {
      drawSize: 32,
      participantsCount: 28, // Creates 4 BYEs
    },
  ],
});
```

### MatchUp Format

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    {
      drawSize: 16,
      matchUpFormat: 'SET3-S:6/TB7',
    },
  ],
});
```

### Unique Participants

Force generation of unique participants for each draw:

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    { drawSize: 16, uniqueParticipants: true },
    { drawSize: 16, uniqueParticipants: true },
  ],
});
// Each draw will have completely different participants
```

### Draw-Specific Participant Profiles

Each `drawProfile` can include its own `participantsProfile` to generate participants with specific demographics:

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    {
      drawSize: 32,
      eventType: 'SINGLES',
      gender: 'FEMALE', // Event gender category
      participantsProfile: {
        sex: 'FEMALE', // Person sex - generates female participants
        category: {
          categoryName: 'U18',
          ageCategoryCode: 'U18',
        },
        scaleAllParticipants: true, // All get ratings
      },
    },
    {
      drawSize: 16,
      eventType: 'DOUBLES',
      gender: 'MALE', // Event gender category
      participantsProfile: {
        sex: 'MALE', // Person sex - generates male participants
        nationalityCodes: ['USA', 'CAN', 'MEX'], // North American players
      },
    },
  ],
});
```

This creates two separate participant pools - one for each event. Draw-level `participantsProfile` properties override tournament-level settings:

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  // Tournament-level (applies to all draws by default)
  participantsProfile: {
    participantsCount: 100,
    sex: 'FEMALE',
  },
  drawProfiles: [
    {
      drawSize: 32,
      // Uses tournament-level participantsProfile (FEMALE)
    },
    {
      drawSize: 16,
      participantsProfile: {
        sex: 'MALE', // Overrides tournament-level to create MALE participants
      },
    },
  ],
});
```

### Preventing Draw Generation

Create events without generating the draw structure:

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    {
      drawSize: 32,
      generate: false, // Creates event with entries, but no draw
    },
  ],
});
```

## Using eventProfiles

Event profiles allow more complex event configurations with multiple draws per event.

:::tip Event-Level Participant Profiles
Like `drawProfile`, each `eventProfile` can include its own `participantsProfile` to generate participants specifically for that event. This applies to all draws within the event unless a draw overrides it with its own `participantsProfile`.
:::

### Basic Event Profile

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  eventProfiles: [
    {
      eventName: 'U18 Singles',
      eventType: 'SINGLES',
      category: { ageCategoryCode: 'U18' },
      drawProfiles: [{ drawSize: 32 }],
    },
  ],
});
```

### Draw with Qualifying Structure

:::important Qualifying as a Stage
In CODES, **qualifying is a stage within a draw**, not a separate draw. A drawDefinition describes how participants move between structures (QUALIFYING → MAIN). Use `qualifyingProfiles` to create qualifying structures within a single draw.

Do **NOT** create separate draws with `stage: 'QUALIFYING'` - this violates the CODES structure where draws describe participant progression between stages.
:::

Use `qualifyingProfiles` to create qualifying structures within a single draw:

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    {
      drawSize: 32,
      drawName: 'Singles Championship',
      qualifiersCount: 8, // 8 positions for qualifiers in main draw
      qualifyingProfiles: [
        {
          roundTarget: 1, // Which round of main draw qualifiers enter
          structureProfiles: [
            {
              stageSequence: 1,
              drawSize: 16, // 16 players compete for 8 qualifying spots
              seedsCount: 4,
            },
          ],
        },
      ],
    },
  ],
});
```

### Multiple Draws in One Event

For truly separate competitions (not qualifying):

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  eventProfiles: [
    {
      eventName: 'Championships',
      eventType: 'SINGLES',
      drawProfiles: [
        { drawSize: 32, drawName: 'U18 Draw' },
        { drawSize: 16, drawName: 'U16 Draw' },
      ],
    },
  ],
});
```

### Event Properties

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  eventProfiles: [
    {
      eventName: "Women's Doubles",
      eventType: 'DOUBLES',
      gender: 'FEMALE',
      category: {
        ageCategoryCode: 'OPEN',
        categoryName: 'Open',
      },
      matchUpFormat: 'SET3-S:6/TB7-F:TB10',
      surfaceCategory: 'CLAY',
      ballType: 'REGULAR_DUTY',
      drawProfiles: [{ drawSize: 16 }],
    },
  ],
});
```

### Event Extensions

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  eventProfiles: [
    {
      eventName: 'Singles',
      eventExtensions: [
        {
          name: 'prizeMoney',
          value: { currency: 'USD', total: 50000 },
        },
      ],
      drawProfiles: [{ drawSize: 32 }],
    },
  ],
});
```

### Event-Level Participant Profiles

Each `eventProfile` can include a `participantsProfile` that applies to all draws within that event:

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  eventProfiles: [
    {
      eventName: "Women's Championship",
      eventType: 'SINGLES',
      gender: 'FEMALE',
      // Event-level participantsProfile
      participantsProfile: {
        sex: 'FEMALE',
        participantsCount: 128,
        category: {
          categoryName: 'Open',
          ratingType: 'WTN',
        },
        scaleAllParticipants: true,
      },
      drawProfiles: [
        {
          drawSize: 64,
          drawName: 'Singles Championship',
          qualifiersCount: 16, // 16 qualifying positions
          qualifyingProfiles: [
            {
              roundTarget: 1,
              structureProfiles: [
                {
                  stageSequence: 1,
                  drawSize: 32, // 32 players compete for 16 spots
                  seedsCount: 8,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});
```

### Participant Profile Hierarchy

The participant generation follows this priority order:

1. **Draw-level** `participantsProfile` (highest priority)
2. **Event-level** `participantsProfile`
3. **Tournament-level** `participantsProfile` (lowest priority)

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  // Tournament-level (default for all)
  participantsProfile: {
    participantsCount: 200,
    nationalityCodes: ['USA', 'CAN'],
  },
  eventProfiles: [
    {
      eventName: 'International Singles',
      // Event-level (overrides tournament-level for this event)
      participantsProfile: {
        nationalityCodes: ['GBR', 'FRA', 'ESP'], // Overrides tournament-level
        sex: 'FEMALE', // Adds to tournament-level
      },
      drawProfiles: [
        {
          drawSize: 32,
          // Uses event-level participantsProfile
        },
        {
          drawSize: 16,
          // Draw-level (overrides both)
          participantsProfile: {
            nationalityCodes: ['JPN', 'CHN', 'KOR'], // Asian players only
          },
        },
      ],
    },
  ],
});
```

### Event with Playoff Structures

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    {
      drawSize: 16,
      drawType: 'SINGLE_ELIMINATION',
      withPlayoffs: {
        roundProfiles: [{ 3: 1 }, { 4: 1 }], // Create playoffs from rounds 3 and 4
        playoffPositions: [3, 4], // For 3rd/4th place
        playoffAttributes: {
          '0-3': { name: 'Bronze', abbreviation: 'B' },
          '0-4': { name: 'Gold', abbreviation: 'G' },
        },
      },
    },
  ],
});
```

## Completing MatchUps

### Complete All Matches

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 16 }],
  completeAllMatchUps: true,
  randomWinningSide: true, // Random winners, otherwise side 1 always wins
});
```

### Complete Specific Matches

Using `outcomes` in draw profiles:

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    {
      drawSize: 16,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 1,
          scoreString: '6-4 6-2',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 2,
          scoreString: '7-6(3) 3-6 6-3',
          winningSide: 2,
        },
      ],
    },
  ],
});
```

### Complete by Draw Positions

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    {
      drawSize: 16,
      outcomes: [
        {
          drawPositions: [1, 2], // Match between positions 1 and 2
          scoreString: '6-4 6-2',
          winningSide: 1,
        },
      ],
    },
  ],
});
```

### Match Status Variations

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    {
      drawSize: 16,
      outcomes: [
        { roundNumber: 1, roundPosition: 1, matchUpStatus: 'COMPLETED', winningSide: 1 },
        { roundNumber: 1, roundPosition: 2, matchUpStatus: 'RETIRED', winningSide: 1 },
        { roundNumber: 1, roundPosition: 3, matchUpStatus: 'WALKOVER', winningSide: 2 },
        { roundNumber: 1, roundPosition: 4, matchUpStatus: 'DEFAULTED', winningSide: 1 },
      ],
    },
  ],
});
```

### Completion Goal

Complete a specific number of matches:

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    {
      drawSize: 32,
      completionGoal: 10, // Complete first 10 matchUps
    },
  ],
});
```

### Match Status Distribution

Control the distribution of match statuses across completed matches:

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 16 }],
  completeAllMatchUps: true,
  matchUpStatusProfile: {
    COMPLETED: 80, // 80% completed normally
    RETIRED: 10, // 10% retirements
    WALKOVER: 5, // 5% walkovers
    DEFAULTED: 5, // 5% defaults
  },
});
```

## ID Prefixes

### Match ID Prefixes

Create readable matchUp IDs for easier debugging:

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    {
      drawSize: 8,
      idPrefix: 'match',
    },
  ],
});

// MatchUp IDs will be: match-1-1, match-1-2, match-1-3, match-1-4
//                      match-2-1, match-2-2
//                      match-3-1
```

### Participant ID Prefixes

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  participantsProfile: {
    participantsCount: 32,
    idPrefix: 'player',
  },
  drawProfiles: [{ drawSize: 16 }],
});

// Participant IDs will be: player-I-0, player-I-1, etc. (I = Individual)
```

## Policy Definitions

Attach policies to tournaments, events, or specific draws. Like `participantsProfile`, policies can be scoped at multiple levels.

:::note Policy Definition Hierarchy
**policyDefinitions** can be specified at three levels with the following priority:

1. **Draw-level** (within drawProfile) - highest priority, applies only to that draw
2. **Event-level** (within eventProfile) - applies to all draws in that event
3. **Tournament-level** (root level) - applies to all draws unless overridden

This allows you to specify different policies for different events or draws within the same tournament.
:::

### Tournament-Level Policies

Policies applied at the tournament level affect all events and draws:

```js
import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';

const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  policyDefinitions: POLICY_SCHEDULING_DEFAULT,
  drawProfiles: [{ drawSize: 16 }],
});
```

### Event-Level Policies

Policies applied to an event affect all draws within that event:

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  eventProfiles: [
    {
      eventName: 'Singles',
      policyDefinitions: {
        scoring: {
          /* scoring policy */
        },
        avoidance: {
          /* avoidance policy */
        },
      },
      drawProfiles: [{ drawSize: 32 }],
    },
  ],
});
```

### Draw-Level Policies

Policies applied to a specific draw override event and tournament-level policies:

```js
import { POLICY_SEEDING_ITF, POLICY_SEEDING_USTA } from '@Fixtures/policies/seeding';

const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  // Tournament-level default
  policyDefinitions: POLICY_SEEDING_USTA,

  drawProfiles: [
    {
      drawSize: 32,
      drawName: 'Professional Draw',
      // Draw-level override
      policyDefinitions: POLICY_SEEDING_ITF, // This draw uses ITF seeding
    },
    {
      drawSize: 16,
      drawName: 'Amateur Draw',
      // Uses tournament-level USTA seeding
    },
  ],
});
```

## Complex Examples

### Multi-Event Tournament with Qualifying

```js
const { tournamentRecord, eventIds } = mocksEngine.generateTournamentRecord({
  startDate: '2024-06-01',
  endDate: '2024-06-14',
  participantsProfile: {
    participantsCount: 128,
    sex: 'MALE',
  },
  eventProfiles: [
    {
      eventName: "Men's Singles",
      eventType: 'SINGLES',
      gender: 'MALE',
      drawProfiles: [
        {
          drawSize: 64,
          drawName: 'Singles Championship',
          seedsCount: 16,
          qualifiersCount: 8, // 8 qualifier positions in main draw
          qualifyingProfiles: [
            {
              roundTarget: 1,
              structureProfiles: [
                {
                  stageSequence: 1,
                  drawSize: 16, // 16 players for 8 qualifying spots
                  seedsCount: 4,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      eventName: "Men's Doubles",
      eventType: 'DOUBLES',
      gender: 'MALE',
      drawProfiles: [
        {
          drawSize: 32,
          seedsCount: 8,
        },
      ],
    },
  ],
  venueProfiles: [
    {
      venueName: 'Championship Courts',
      courtsCount: 12,
    },
  ],
});
```

### Round Robin with Playoffs

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    {
      drawSize: 16,
      drawType: 'ROUND_ROBIN_WITH_PLAYOFF',
      seedsCount: 4,
    },
  ],
  completeAllMatchUps: true,
});
```

### Team Event with Tie Format

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    {
      drawSize: 8,
      eventType: 'TEAM',
      tieFormat: {
        collectionDefinitions: [
          {
            collectionName: 'Singles',
            matchUpType: 'SINGLES',
            matchUpCount: 3,
            matchUpFormat: 'SET3-S:6/TB7',
          },
          {
            collectionName: 'Doubles',
            matchUpType: 'DOUBLES',
            matchUpCount: 1,
            matchUpFormat: 'SET3-S:6/TB7',
          },
        ],
      },
    },
  ],
});
```

### Team Gender Composition Override

By default, `processTieFormat` computes per-team gender counts from the maximum gendered collection requirements. When a tieFormat requires more gendered players than the MAX-per-collection heuristic produces (e.g. collections needing 3 men and 3 women total, but the MAX only detects 2 of each), use `teamGenders` as a floor override:

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    {
      drawSize: 2,
      eventType: 'TEAM',
      teamNames: ['Team Alpha', 'Team Beta'],
      teamGenders: { MALE: 3, FEMALE: 3 }, // Override: at least 3M + 3F per team
      tieFormat: {
        tieFormatName: 'INTENNSE',
        winCriteria: { aggregateValue: true },
        collectionDefinitions: [
          {
            collectionName: "Men's Singles",
            matchUpType: 'SINGLES',
            matchUpCount: 2,
            matchUpFormat: 'SET2XA-S:T10',
            gender: 'MALE',
          },
          {
            collectionName: "Women's Singles",
            matchUpType: 'SINGLES',
            matchUpCount: 2,
            matchUpFormat: 'SET2XA-S:T10',
            gender: 'FEMALE',
          },
          {
            collectionName: "Men's Doubles",
            matchUpType: 'DOUBLES',
            matchUpCount: 1,
            matchUpFormat: 'SET1A-S:T10',
            gender: 'MALE',
          },
          {
            collectionName: "Women's Doubles",
            matchUpType: 'DOUBLES',
            matchUpCount: 1,
            matchUpFormat: 'SET1A-S:T10',
            gender: 'FEMALE',
          },
          {
            collectionName: 'Mixed Doubles',
            matchUpType: 'DOUBLES',
            matchUpCount: 1,
            matchUpFormat: 'SET1A-S:T10',
            gender: 'MIXED',
          },
        ],
      },
    },
  ],
  completeAllMatchUps: true,
});
```

`teamGenders` acts as a **floor** — it only increases gender counts, never decreases them. If `processTieFormat` already computes a higher value for a gender, that value is preserved. The `teamSize` is also adjusted upward if the overridden gender totals exceed it.

## Deterministic Generation

The `nonRandom` parameter seeds a deterministic PRNG that replaces `Math.random` throughout the entire generation chain. This makes every random decision — participant names, IDs, nationalities, ratings, draw position assignments, and match outcomes — fully reproducible.

### Same Seed = Same Results

```js
const result1 = mocksEngine.generateTournamentRecord({
  nonRandom: 42,
  drawProfiles: [{ drawSize: 16, seedsCount: 4 }],
});

const result2 = mocksEngine.generateTournamentRecord({
  nonRandom: 42,
  drawProfiles: [{ drawSize: 16, seedsCount: 4 }],
});

// Identical participants, draw positions, seedings
expect(result1.tournamentRecord.participants.map((p) => p.participantName)).toEqual(
  result2.tournamentRecord.participants.map((p) => p.participantName),
);
```

### Different Seeds = Different Results

```js
const result1 = mocksEngine.generateTournamentRecord({
  nonRandom: 42,
  drawProfiles: [{ drawSize: 16 }],
});

const result2 = mocksEngine.generateTournamentRecord({
  nonRandom: 99,
  drawProfiles: [{ drawSize: 16 }],
});

// Different participants and draw positions
expect(result1.tournamentRecord.participants[0].participantName).not.toEqual(
  result2.tournamentRecord.participants[0].participantName,
);
```

### Deterministic Scores

When combined with `completeAllMatchUps`, scores are also deterministic:

```js
const result1 = mocksEngine.generateTournamentRecord({
  nonRandom: 42,
  drawProfiles: [{ drawSize: 8 }],
  completeAllMatchUps: true,
});

const result2 = mocksEngine.generateTournamentRecord({
  nonRandom: 42,
  drawProfiles: [{ drawSize: 8 }],
  completeAllMatchUps: true,
});

tournamentEngine.setState(result1.tournamentRecord);
const { matchUps: matchUps1 } = tournamentEngine.allTournamentMatchUps();

tournamentEngine.setState(result2.tournamentRecord);
const { matchUps: matchUps2 } = tournamentEngine.allTournamentMatchUps();

// Same scores, same winners
matchUps1.forEach((m, i) => {
  expect(m.score?.scoreStringSide1).toEqual(matchUps2[i].score?.scoreStringSide1);
  expect(m.winningSide).toEqual(matchUps2[i].winningSide);
});
```

:::tip Use nonRandom for snapshot and regression testing
`nonRandom` is ideal for snapshot tests where you need stable output, regression tests where you want to detect behavioral changes, and debugging where you need to reproduce exact tournament state.
:::

## Tips and Best Practices

1. **Start with drawProfiles** for simple scenarios, use **eventProfiles** for complex multi-draw events
2. **Use idPrefix** during development for easier debugging
3. **Set completeAllMatchUps** when testing post-match logic
4. **Use unique participants** when testing cross-event conflicts
5. **Specify matchUpFormat** when testing format-specific logic
6. **Leverage outcomes** to set up specific match scenarios
7. **Use completionGoal** to test partial tournament completion

## Next Steps

- **[Participant Generation](./mocks-engine-participants.md)** - Individual, pairs and teams
- **[Outcome Generation](./mocks-engine-outcomes.md)** - Generating match results
- **[Advanced Patterns](./mocks-engine-patterns.md)** - Best practices and common patterns
