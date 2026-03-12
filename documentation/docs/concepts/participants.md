---
title: Participants Overview
---

## Overview

Participants are the core entities in [CODES](/docs/data-standards#codes) that represent players, teams, and other competing units in tournament structures. The Competition Factory provides a flexible, type-agnostic participant system that supports individuals, pairs (doubles), teams, and groups.

### Key Concepts

**Participant Types**: INDIVIDUAL, PAIR, TEAM, GROUP  
**Participant Agnostic**: Draw logic works uniformly across all participant types  
**Individual Participants**: The atomic units that compose pairs, teams, and groups  
**Position Assignments**: How participants are placed in draw structures  
**Hydration**: Adding contextual information to participant objects

## Participant Types

CODES defines four core participant types:

### INDIVIDUAL

The most basic participant type representing a single player or competitor.

```ts
type IndividualParticipant = {
  participantId: string;
  participantType: 'INDIVIDUAL';
  participantRole: 'COMPETITOR' | 'ALTERNATE' | 'OFFICIAL';
  person: {
    personId: string;
    standardFamilyName: string;
    standardGivenName: string;
    nationalityCode?: string;
    sex?: 'MALE' | 'FEMALE';
    birthDate?: string;
  };
  // Optional attributes
  signInStatus?: 'SIGNED_IN' | 'SIGNED_OUT';
  onlineResources?: OnlineResource[];
  timeItems?: TimeItem[]; // Rankings, ratings, seedings
  extensions?: Extension[];
};
```

**Example:**

```js
const player = {
  participantId: 'player-123',
  participantType: 'INDIVIDUAL',
  participantRole: 'COMPETITOR',
  person: {
    personId: 'person-456',
    standardFamilyName: 'Federer',
    standardGivenName: 'Roger',
    nationalityCode: 'SUI',
    sex: 'MALE',
  },
};
```

### PAIR

Represents a doubles partnership, composed of two individual participants.

```ts
type PairParticipant = {
  participantId: string;
  participantType: 'PAIR';
  participantRole: 'COMPETITOR';
  individualParticipantIds: [string, string]; // References to INDIVIDUAL participants
  // Optional attributes
  participantName?: string; // Custom pair name (e.g., "Smith/Jones")
  timeItems?: TimeItem[]; // Pair-specific rankings/ratings
  extensions?: Extension[];
};
```

**Example:**

```js
const doublesPair = {
  participantId: 'pair-789',
  participantType: 'PAIR',
  participantRole: 'COMPETITOR',
  individualParticipantIds: ['player-123', 'player-456'],
  participantName: 'Bryan/Bryan',
};
```

### TEAM

Represents a team of individual participants, used in team competitions.

```ts
type TeamParticipant = {
  participantId: string;
  participantType: 'TEAM';
  participantRole: 'COMPETITOR';
  participantName: string;
  individualParticipantIds: string[]; // Array of team members
  // Optional attributes
  teamName?: string;
  timeItems?: TimeItem[];
  extensions?: Extension[];
};
```

**Example:**

```js
const team = {
  participantId: 'team-abc',
  participantType: 'TEAM',
  participantRole: 'COMPETITOR',
  participantName: 'United States',
  individualParticipantIds: [
    'player-1',
    'player-2',
    'player-3',
    'player-4',
    'player-5',
    'player-6', // Team roster
  ],
};
```

### GROUP

Represents a collection of participants, typically used for organizing or categorizing participants.

```ts
type GroupParticipant = {
  participantId: string;
  participantType: 'GROUP';
  participantRole?: string;
  participantName: string;
  individualParticipantIds: string[];
};
```

## Participant Roles

Participants can have different roles within a tournament:

| Role               | Description                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------- |
| **COMPETITOR**     | Active participant in tournament events (default)                                         |
| **DIRECTOR**       | Tournament Director — responsible for all organizational aspects of the tournament        |
| **SUPERVISOR**     | Tournament Supervisor — on-site authority for rules and regulations (e.g. ITF Supervisor) |
| **OFFICIAL**       | On-court officials: referee, chair umpire, line umpire, etc.                              |
| **CAPTAIN**        | Team captain                                                                              |
| **COACH**          | Player coach                                                                              |
| **ADMINISTRATION** | Administrative staff                                                                      |
| **MEDICAL**        | Medical personnel: doctors, physiotherapists, trainers                                    |
| **MEDIA**          | Press, broadcasters, photographers                                                        |
| **SECURITY**       | Security personnel                                                                        |
| **HOSPITALITY**    | Player lounge, catering, accommodation liaison                                            |
| **STRINGER**       | Racket stringing services                                                                 |
| **TRANSPORT**      | Player transport and logistics                                                            |
| **VOLUNTEER**      | Ball persons, court monitors, general volunteers                                          |
| **OTHER**          | Any role not covered above                                                                |

Use `participantRoleResponsibilities` (a string array on `Participant`) to further specify sub-roles within a category — for example, an `OFFICIAL` with responsibilities `['REFEREE']` or `['CHAIR_UMPIRE']`.

```js
// Adding a tournament director
tournamentEngine.addParticipant({
  participant: {
    participantType: 'INDIVIDUAL',
    participantRole: 'DIRECTOR',
    person: {
      standardFamilyName: 'Johnson',
      standardGivenName: 'Mark',
    },
  },
});

// Adding an official with specific responsibilities
tournamentEngine.addParticipant({
  participant: {
    participantType: 'INDIVIDUAL',
    participantRole: 'OFFICIAL',
    participantRoleResponsibilities: ['REFEREE'],
    person: {
      standardFamilyName: 'Smith',
      standardGivenName: 'Jane',
    },
  },
});
```

## Participant-Agnostic Logic

A fundamental design principle of CODES: **draw logic is participant-agnostic**. The system doesn't differentiate between INDIVIDUAL, PAIR, or TEAM participants when managing draw structures and participant progression.

### How It Works

**Position Assignments** are the universal mechanism:

```js

**API Reference:** [addParticipant](/docs/governors/participant-governor#addparticipant)

// Same structure works for any participant type
positionAssignment = {
  drawPosition: 1,
  participantId: 'any-participant-id', // Could be INDIVIDUAL, PAIR, or TEAM
  bye: false,
};
```

**Match progression logic** is identical:

```text
Winner of Position 1 → Advances to Position 1 of next round
Loser of Position 2 → Feeds to Position 3 of consolation
```

This works whether participants are:

- Individual singles players
- Doubles pairs
- Davis Cup teams

### Benefits

1. **Unified codebase**: One set of algorithms for all tournament types
2. **Flexibility**: Easy to create hybrid tournaments mixing different participant types
3. **Simplicity**: Developers learn one system that works everywhere
4. **Maintainability**: Changes to draw logic automatically apply to all participant types

### Example: Multi-Type Event

```js
const event = {
  eventId: 'mixed-event',
  eventType: 'MIXED', // Can include different participant types
  drawDefinitions: [
    {
      drawId: 'singles-draw',
      entries: individualParticipantEntries, // INDIVIDUAL participants
    },
    {
      drawId: 'doubles-draw',
      entries: pairParticipantEntries, // PAIR participants
    },
  ],
};
```

## Participant Creation

### Adding Individual Participants

```js
const { participant } = tournamentEngine.addParticipant({
  participant: {
    participantType: 'INDIVIDUAL',
    participantRole: 'COMPETITOR',
    person: {
      standardFamilyName: 'Williams',
      standardGivenName: 'Serena',
      nationalityCode: 'USA',
      sex: 'FEMALE',
      birthDate: '1981-09-26',
    },
  },
});
```

### Creating Pairs Automatically

The Competition Factory can automatically create PAIR participants from individuals:

```js

**API Reference:** [addParticipant](/docs/governors/participant-governor#addparticipant)

// When assigning individuals to a DOUBLES matchUp, pairs are created automatically
tournamentEngine.assignTieMatchUpParticipantId({
  participantId: 'player-1', // Individual
  tieMatchUpId: 'doubles-matchup-id',
  drawId: 'team-draw',
});
// System automatically creates a PAIR participant if needed
```

### Adding Teams

```js

**API Reference:** [assignTieMatchUpParticipantId](/docs/governors/matchup-governor#assigntiematchupparticipantid)

const { participant } = tournamentEngine.addParticipant({
  participant: {
    participantType: 'TEAM',
    participantName: 'Spain',
    individualParticipantIds: ['nadal-id', 'alcaraz-id', 'bautista-id', 'lopez-id'],
  },
});
```

## Retrieving Participants

### Basic Retrieval

```js

**API Reference:** [addParticipant](/docs/governors/participant-governor#addparticipant)

const { participants } = tournamentEngine.getParticipants({
  participantFilters: {
    participantTypes: ['INDIVIDUAL'],
    participantRoles: ['COMPETITOR'],
  },
});
```

### With Context (Hydration)

Add contextual information like events, matchUps, and statistics:

```js

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

const { participants } = tournamentEngine.getParticipants({
  withMatchUps: true,           // Include matchUps for each participant
  withStatistics: true,         // Add win/loss statistics
  withOpponents: true,          // Include opponent information
  withIndividualParticipants: true,  // For PAIR/TEAM, include individual details
  withScaleValues: true,        // Include ratings/rankings
  convertExtensions: true       // Convert extensions to _extensionName attributes
});

// Result for a PAIR participant:
{
  participantId: 'pair-123',
  participantType: 'PAIR',
  participantName: 'Smith/Jones',
  individualParticipantIds: ['player-1', 'player-2'],
  individualParticipants: [     // Added by withIndividualParticipants
    { participantId: 'player-1', person: { ... } },
    { participantId: 'player-2', person: { ... } }
  ],
  matchUps: [...],               // Added by withMatchUps
  statistics: {                  // Added by withStatistics
    matchUpsWon: 5,
    matchUpsLost: 2
  }
}
```

### Filtering Participants

```js

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

const participantFilters = {
  // Filter by type
  participantTypes: ['INDIVIDUAL', 'PAIR'],

  // Filter by role
  participantRoles: ['COMPETITOR'],

  // Filter by events
  eventIds: ['event-1', 'event-2'],

  // Filter by entry status
  eventEntryStatuses: ['ACCEPTED', 'ALTERNATE'],

  // Filter by sign-in status
  signInStatus: 'SIGNED_IN',

  // Custom accessor filters
  accessorValues: [{ accessor: 'person.nationalityCode', value: 'USA' }],
};

const { participants } = tournamentEngine.getParticipants({
  participantFilters,
});
```

## Individual Participants Within Groups

When retrieving PAIR, TEAM, or GROUP participants, use `withIndividualParticipants` to expand their composition:

```js

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

const { participants } = tournamentEngine.getParticipants({
  participantFilters: { participantTypes: ['PAIR'] },
  withIndividualParticipants: true,
});

// Each PAIR now includes full individual details:
participants.forEach((pair) => {
  console.log(`Pair: ${pair.participantName}`);
  pair.individualParticipants.forEach((individual) => {
    console.log(`  - ${individual.person.standardGivenName} ${individual.person.standardFamilyName}`);
  });
});
```

## Participant Membership

Find all grouping participants (PAIR, TEAM, GROUP) that include a specific individual:

```js

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

const {
  PAIR: doublesParticipantIds,
  GROUP: groupParticipantIds,
  TEAM: teamParticipantIds,
} = tournamentEngine.getParticipantMembership({
  participantId: 'player-123',
});

console.log(`Player appears in ${doublesParticipantIds.length} pairs`);
console.log(`Player appears in ${teamParticipantIds.length} teams`);
```

## Sign-In Management

Track participant availability for matches:

```js

**API Reference:** [getParticipantMembership](/docs/governors/query-governor#getparticipantmembership)

// Check in a participant
tournamentEngine.checkInParticipant({
  participantId: 'player-123',
  matchUpId: 'matchup-456',
});

// Check out a participant
tournamentEngine.checkOutParticipant({
  participantId: 'player-123',
  matchUpId: 'matchup-456',
});

// Toggle sign-in state
tournamentEngine.toggleParticipantCheckInState({
  participantId: 'player-123',
  matchUpId: 'matchup-456',
});
```

## Privacy and Data Protection

Use Participant Policies to control which participant data is exposed:

```js

**API Reference:** [checkInParticipant](/docs/governors/matchup-governor#checkinparticipant)

**API Reference:** [checkOutParticipant](/docs/governors/matchup-governor#checkoutparticipant)

**API Reference:** [toggleParticipantCheckInState](/docs/governors/matchup-governor#toggleparticipantcheckinstate)

const participantPolicy = {
  participant: {
    // Hide birth dates
    excludeBirthDates: true,
    // Hide specific attributes
    excludeAttributes: ['person.nationalityCode'],
    // Only show initials
    initialsOnly: true,
  },
};

const { participants } = tournamentEngine.getParticipants({
  policyDefinitions: { participant: participantPolicy },
});

// Results respect privacy settings
// { person: { standardFamilyName: 'F.', standardGivenName: 'R.' } }
```

## Related Documentation

- **[Participant Context](./participant-context)** - Understanding hydration and contextual data
- **[Draw Generation](./draws-overview)** - How participants are assigned to draws
- **[Participant Policy](/docs/policies/participantPolicy)** - Configuring privacy and data filters
- **[Query Governor](/docs/governors/query-governor#getparticipants)** - Complete API reference
- **[Participant Governor](/docs/governors/participant-governor)** - Participant management methods
