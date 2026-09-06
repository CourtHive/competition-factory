---
title: Avoidance Policies
---

## Overview

**Avoidance Policies** prevent participants with shared attributes (nationality, club, region, etc.) from meeting in early rounds of elimination draws, or ensure they're evenly distributed across round robin brackets. Avoidance helps create fairer, more competitive draws by separating players with common characteristics.

### Key Concepts

**Avoidance**: Separating participants with matching attributes across draw sections  
**Accessors**: Dot-notation paths to participant attributes (see [Accessors](/docs/concepts/accessors))  
**Rounds to Separate**: Number of rounds to keep matching participants apart  
**Policy Attributes**: Array of accessors defining which participant data to match  
**Single Round Avoidance**: Prevent first-round matchups between grouped players  
**Multiple Round Avoidance**: Maximize separation throughout the draw

Avoidance can be applied to [Seed Blocks](./seedingPolicy#seedingprofilepositioning) as well as unseeded players, though Seeded players may only be moved to other positions valid for the Seed Block within which they are placed.

## Avoidance Strategies

### Single Round Avoidance

**Goal**: Prevent grouped players from meeting in the first round only.

**roundsToSeparate**: `1`

**Implementation**: Random placement followed by iterative shuffling to minimize first-round conflicts. In some cases, it's specifically forbidden to maximize separation beyond the first round.

```js
const firstRoundAvoidance = {
  avoidance: {
    policyName: 'First Round Nationality',
    roundsToSeparate: 1,
    policyAttributes: [{ key: 'person.nationalityCode' }],
  },
};
```

**Use Cases:**

- Large draws with many players from same groups
- When draw seeding takes priority over avoidance
- Events with time constraints on draw generation

### Multiple Round Avoidance

**Goal**: Place players as far apart in the draw structure as possible.

**roundsToSeparate**: `2+` or `undefined` (maximum)

**Implementation**: Divides draw into sections based on group sizes, distributing players evenly across sections. Processes largest groups first, with shuffling to accommodate smaller groups.

```js
const maxSeparation = {
  avoidance: {
    policyName: 'Maximum Nationality Separation',
    roundsToSeparate: undefined, // Maximum possible separation
    policyAttributes: [{ key: 'person.nationalityCode' }],
  },
};
```

**Use Cases:**

- ITF/ATP/WTA events with nationality restrictions
- National championships with regional distribution
- Events where player distribution quality is critical

### Target Divisions

Alternative to `roundsToSeparate` - specify desired number of draw sections:

```js
const divisionBased = {
  avoidance: {
    policyName: 'Division-Based Avoidance',
    targetDivisions: 4, // Divide draw into 4 sections
    policyAttributes: [{ key: 'person.nationalityCode' }],
  },
};
```

The system calculates `roundsToSeparate` based on draw size and target divisions.

## Policy Structure

### Complete Avoidance Policy

```typescript
type AvoidancePolicy = {
  avoidance: {
    policyName?: string; // Optional identifier
    roundsToSeparate?: number; // Rounds to separate (undefined = max)
    targetDivisions?: number; // Alternative to roundsToSeparate
    policyAttributes: Array<{
      key?: string; // Accessor path
      directive?: string; // For relationships (pairParticipants, etc.)
      significantCharacters?: number; // Partial matching
      includeIds?: string[]; // Restrict to specific participants
    }>;
  };
};
```

### Basic Usage

```js
const AVOIDANCE_COUNTRY = {
  avoidance: {
    policyName: 'Nationality Code',
    roundsToSeparate: undefined, // Maximum separation
    policyAttributes: [{ key: 'person.nationalityCode' }, { key: 'individualParticipants.person.nationalityCode' }],
  },
};

const { drawDefinition } = tournamentEngine.generateDrawDefinition({
  policyDefinitions: AVOIDANCE_COUNTRY,
  automated: true,
  drawSize: 32,
  eventId: 'singles-main',
});
```

### Policy Properties

**policyName** (optional)  
Identifier for the policy. Useful when multiple policies are attached or for debugging.

**roundsToSeparate** (optional)  
Number of rounds to keep matching participants apart:

- `1`: First round only
- `2`, `3`, etc.: Specific number of rounds
- `undefined`: Maximum possible separation (default)

**targetDivisions** (optional)  
Alternative to `roundsToSeparate`. Specifies number of draw sections. System calculates separation based on draw size.

**policyAttributes** (required)  
Array of accessor objects defining which participant attributes to match. Each object must have either `key` (accessor) or `directive` (relationship).

## Understanding Accessors in Avoidance Policies

**policyAttributes** is an array of [accessor](/docs/concepts/accessors) objects that specify which participant attributes to match for avoidance. Accessors use dot notation to navigate nested participant data structures.

### How Accessors Work

Accessors are path strings that extract values from participant objects:

```js
// INDIVIDUAL participant structure
{
  participantId: 'player-1',
  participantType: 'INDIVIDUAL',
  person: {
    nationalityCode: 'USA',
    club: 'Tennis Club America'
  }
}

// Accessor to nationality
{ key: 'person.nationalityCode' }
// Extracts: 'USA'

// Accessor to club
{ key: 'person.club' }
// Extracts: 'Tennis Club America'
```

### Multiple Accessor Paths

Participant attributes may be located in different places depending on participant type (INDIVIDUAL vs PAIR):

```js
// For INDIVIDUAL participants
{
  person: {
    nationalityCode: 'FRA';
  }
}

// For PAIR participants
{
  individualParticipants: [{ person: { nationalityCode: 'GBR' } }, { person: { nationalityCode: 'AUS' } }];
}

// Policy handles both structures
const policyAttributes = [
  { key: 'person.nationalityCode' }, // For INDIVIDUAL
  { key: 'individualParticipants.person.nationalityCode' }, // For PAIR
];
```

When processing PAIR participants, the accessor `individualParticipants.person.nationalityCode` extracts both nationality codes (`['GBR', 'AUS']`), allowing the system to avoid matching pairs that share any nationality.

### Accessor Attributes

#### key (required)

The dot-notation path to the participant attribute:

```js
{
  key: 'person.nationalityCode';
}
{
  key: 'person.addresses.city';
}
{
  key: 'individualParticipants.person.club';
}
```

**See:** [Accessors](/docs/concepts/accessors) for complete accessor syntax documentation.

#### significantCharacters (optional)

Limits comparison to first N characters of the extracted value:

```js
// Avoid participants from same country region
policyAttributes: [
  {
    key: 'person.nationalityCode',
    significantCharacters: 2, // 'USA-CA' and 'USA-NY' both match on 'US'
  },
];

// Full comparison (default)
policyAttributes: [
  {
    key: 'person.nationalityCode', // 'USA-CA' != 'USA-NY'
  },
];
```

This is useful for hierarchical codes where partial matching is desired (regions, districts, postal codes).

## Policy Directives vs Accessors

### Directives for Relationship Avoidance

INDIVIDUAL participants may be members of PAIR, TEAM, and GROUP participants. Since these relationships aren't stored as simple attributes, they use **directives** instead of **key** accessors:

```js
// Avoid matching doubles partners in singles draw
const pairAvoidancePolicy = {
  roundsToSeparate: undefined,
  policyName: 'Doubles Partner Avoidance',
  policyAttributes: [{ directive: 'pairParticipants' }],
};

// Avoid matching teammates in singles draw
const teamAvoidancePolicy = {
  roundsToSeparate: 2,
  policyName: 'Team Member Avoidance',
  policyAttributes: [{ directive: 'teamParticipants' }],
};
```

Before avoidance processing, these context attributes are added to INDIVIDUAL participants:

- `pairParticipantIds` - IDs of pairs this player is part of
- `teamParticipantIds` - IDs of teams this player is part of
- `groupParticipantIds` - IDs of groups this player is part of

### includeIds Filtering

Restrict avoidance to specific participants:

```js
policyAttributes: [
  {
    key: 'person.nationalityCode',
    includeIds: ['player-1', 'player-2', 'player-3'],
  },
];
// Only these three participants are considered for nationality avoidance
```

### Extension-Based Avoidance

Custom attributes stored as [extensions](/docs/concepts/extensions) can be used for avoidance. Extensions are automatically converted to underscore-prefixed attributes before processing:

```js
// Participant with custom region extension
{
  participantId: 'player-1',
  person: { standardFamilyName: 'Smith' },
  extensions: [
    {
      name: 'region',
      value: 'Northern California'
    }
  ]
}

// Avoidance policy using extension
policyAttributes: [
  { key: '_region' }  // Extensions become underscore-prefixed attributes
]

// After processing, participant has:
// { ..., _region: 'Northern California' }
```

## Practical Examples

### Nationality Avoidance

Prevent same-country matchups in early rounds:

```js
const nationalityAvoidance = {
  avoidance: {
    policyName: 'Nationality Code',
    roundsToSeparate: 3, // Separate for 3 rounds
    policyAttributes: [{ key: 'person.nationalityCode' }, { key: 'individualParticipants.person.nationalityCode' }],
  },
};

tournamentEngine.generateDrawDefinition({
  eventId: 'singles-main',
  drawSize: 32,
  automated: true,
  policyDefinitions: nationalityAvoidance,
});
```

### Club/Organization Avoidance

Separate players from same club or organization:

```js
const clubAvoidance = {
  avoidance: {
    policyName: 'Club Separation',
    roundsToSeparate: 2,
    policyAttributes: [
      { key: 'person.organisation.organisationName' },
      { key: 'individualParticipants.person.organisation.organisationName' },
    ],
  },
};
```

### Regional Avoidance with Partial Matching

Use `significantCharacters` for hierarchical codes:

```js
// Postal codes: '94301', '94305', '10001', '10002'
const regionalAvoidance = {
  avoidance: {
    policyName: 'Regional Separation',
    roundsToSeparate: 1,
    policyAttributes: [
      {
        key: 'person.addresses.postalCode',
        significantCharacters: 3, // Match on first 3 digits
      },
    ],
  },
};
// '94301' and '94305' match on '943'
// '10001' and '10002' match on '100'
```

### Combined Avoidance Policies

Apply multiple avoidance criteria:

```js
const multipleAvoidance = {
  avoidance: {
    policyName: 'Combined Avoidance',
    roundsToSeparate: 2,
    policyAttributes: [
      // Nationality avoidance
      { key: 'person.nationalityCode' },
      { key: 'individualParticipants.person.nationalityCode' },

      // Club avoidance
      { key: 'person.organisation.organisationName' },
      { key: 'individualParticipants.person.organisation.organisationName' },

      // Doubles partner avoidance
      { directive: 'pairParticipants' },
    ],
  },
};
```

Players matching on ANY of these criteria will be separated.

### Custom Extension Avoidance

Use tournament-specific groupings:

```js
// Players have custom 'academy' extension
const academyAvoidance = {
  avoidance: {
    policyName: 'Academy Separation',
    roundsToSeparate: undefined, // Maximum separation
    policyAttributes: [
      { key: '_academy' }, // Extension-based accessor
    ],
  },
};

// Before generating draw, add extensions
participants.forEach((participant) => {
  tournamentEngine.addParticipantExtension({
    participantId: participant.participantId,
    extension: {
      name: 'academy',
      value: participant.trainingAcademy,
    },
  });
});

tournamentEngine.generateDrawDefinition({
  eventId: 'singles-main',
  policyDefinitions: academyAvoidance,
});
```

## Playoff avoidance is synthesised, not configured

Playoff draws fed by round-robin groups get an avoidance policy **automatically**. `positionUnseededParticipants` builds it from each entry's `groupingValue` whenever the stage is `PLAY_OFF`, with no `policyDefinitions` required.

So _"no first-round pair holds two participants from the same group"_ is a guarantee the engine makes, not a coincidence of the draw.

## Residual conflicts are reported

Automated positioning tries candidate arrangements and swaps participants to resolve conflicts. It cannot always succeed — four groups landing as A1-A2, B1-B2, C1-C2, D1-D2 leave no conflict-free first round to reach.

The candidate applied is the lowest-conflict one generated, but "lowest" can still be non-zero when the repair loop runs out of options. When that happens `automatedPositioning` reports what is left under `conflicts.unseededConflicts` rather than returning a bare success:

```js
const { conflicts } = engine.automatedPositioning({ drawId, structureId });

if (conflicts?.unseededConflicts) {
  // the draw was positioned, but the avoidance guarantee could not be met in full
}
```

An absent `conflicts.unseededConflicts` means the arrangement satisfied the policy. A same-group opening match previously shipped as `{ success: true, conflicts: {} }` with no way for a caller to notice, which left an intermittent test failure as the only available symptom.

## Related Documentation

- **[Accessors](/docs/concepts/accessors)** - Complete accessor syntax and usage
- **[Participants](/docs/concepts/participants)** - Participant data structures
- **[Extensions](/docs/concepts/extensions)** - Custom participant attributes
- **[Seeding Policy](./seedingPolicy)** - Seed blocks and positioning patterns
- **[Generation Governor](/docs/governors/generation-governor#generatedrawdefinition)** - Draw generation with policies
