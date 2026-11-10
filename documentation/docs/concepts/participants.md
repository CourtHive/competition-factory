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
  participantRole: 'COMPETITOR' | 'OFFICIAL' | 'DIRECTOR'; // see Participant Roles below
  participantOtherName?: string; // Nickname / display name
  person: {
    personId: string;
    standardFamilyName?: string; // Required unless participantOtherName or participantName is provided
    standardGivenName?: string; // Required unless participantOtherName or participantName is provided
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

:::note
`standardFamilyName` and `standardGivenName` are required **unless** `participantOtherName` or `participantName` is provided. This supports scenarios such as ITF draw imports where structured person name fields may be unavailable. When person names are incomplete, `participantOtherName` is used as the display name.
:::

**Examples:**

```js
// Standard participant with full person name
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

// Participant with nickname only (no structured person name)
const nicknameParticipant = {
  participantType: 'INDIVIDUAL',
  participantRole: 'COMPETITOR',
  participantOtherName: 'RF',
  person: { personId: 'person-789' },
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
| **PHYSIO**         | Physiotherapist                                                                           |
| **TRAINER**        | Athletic trainer                                                                          |
| **SCOREKEEPER**    | Records the score of a matchUp                                                            |
| **TIMEKEEPER**     | Manages match timing: warm-up, changeovers, shot clock                                    |
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

**API Reference:** [addParticipant](/docs/governors/participant-governor#addparticipant)

```js
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

#### Participants Without Structured Names

When importing from external sources (e.g., ITF official draws), structured person name fields may not be available. In these cases, provide `participantOtherName` or `participantName` instead:

```js
// Using participantOtherName as display name
const { participant } = tournamentEngine.addParticipant({
  participant: {
    participantType: 'INDIVIDUAL',
    participantRole: 'COMPETITOR',
    participantOtherName: 'Player Display Name',
    person: { personId: 'person-xyz' },
  },
});

// Using participantName directly
const { participant: p2 } = tournamentEngine.addParticipant({
  participant: {
    participantType: 'INDIVIDUAL',
    participantRole: 'COMPETITOR',
    participantName: 'Player Display Name',
    person: { personId: 'person-abc' },
  },
});
```

When person name fields are incomplete, `participantName` is automatically set from `participantOtherName`. For pair participants, the pair name falls back through `standardFamilyName` → `participantOtherName` → `participantName` for each individual component.

### Creating Pairs Automatically

The Competition Factory can automatically create PAIR participants from individuals:

**API Reference:** [addParticipant](/docs/governors/participant-governor#addparticipant)

```js
// When assigning individuals to a DOUBLES matchUp, pairs are created automatically
tournamentEngine.assignTieMatchUpParticipantId({
  participantId: 'player-1', // Individual
  tieMatchUpId: 'doubles-matchup-id',
  drawId: 'team-draw',
});
// System automatically creates a PAIR participant if needed
```

### Adding Teams

**API Reference:** [assignTieMatchUpParticipantId](/docs/governors/matchup-governor#assigntiematchupparticipantid)

```js
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

**API Reference:** [addParticipant](/docs/governors/participant-governor#addparticipant)

```js
const { participants } = tournamentEngine.getParticipants({
  participantFilters: {
    participantTypes: ['INDIVIDUAL'],
    participantRoles: ['COMPETITOR'],
  },
});
```

### With Context (Hydration)

Add contextual information like events, matchUps, and statistics:

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

```js
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

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

```js
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

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

```js
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

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

```js
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

**API Reference:** [getParticipantMembership](/docs/governors/query-governor#getparticipantmembership)

```js
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

## Contact Information

Contacts live on `participant.contacts` and on `participant.person.contacts`, and are written through
`modifyParticipant`. The array is **replaced**, not merged — editing one contact means reading the
existing array, changing it, and sending the whole thing back. Sending only the contact you edited
deletes the others; omitting `contacts` entirely leaves them untouched, and `[]` clears them.

**API Reference:** [modifyParticipant](/docs/governors/participant-governor#modifyparticipant)

```js
tournamentEngine.modifyParticipant({
  participant: {
    participantId: 'player-123',
    person: {
      contacts: [
        { name: 'Ana Rivas', mobileTelephone: '+33 6 00 00 00 00', relationship: 'GUARDIAN' },
        { name: 'own mobile', mobileTelephone: '+33 6 11 11 11 11', relationship: 'SELF', isPublic: true },
      ],
    },
  },
});
```

### relationship

`Contact.relationship` says **whose number this is**. A minor's contact is routinely a parent, a guardian
or a travelling chaperone, and without it "Ana Rivas, +33…" is ambiguous between the competitor's own
mobile and somebody else's — the distinction that decides who a director may ring at 9pm.

| Value         | Meaning                                   |
| ------------- | ----------------------------------------- |
| **SELF**      | The person's own contact                  |
| **PARENT**    | A parent                                  |
| **GUARDIAN**  | A legal guardian                          |
| **CHAPERONE** | A travelling chaperone or team supervisor |
| **EMERGENCY** | An emergency contact                      |
| **OTHER**     | Any relationship not covered above        |

`relationship` is optional; a contact without one is accepted unchanged.

A parent or guardian is an attribute of a person's contact details — **not a Participant**. Modelling
them as participants would make them draw-enterable, count them among the tournament's competitors, and
give them a ranking identity, because those paths gate on `participantType`.

### isPublic

`Contact.isPublic` records consent on the **contact** — "this contact may be shared publicly". It is not
a promise about any particular surface. `getTournamentInfo` publishes only contacts explicitly marked
`isPublic === true`, and only for staff roles; absent and `false` both withhold.

### Contacts for a grouping

`Participant.contactParticipantIds` designates which members hold contact information for a TEAM or
GROUP — "who do I call about this group". It is a **pointer** to members, not details copied onto the
grouping: a copy is a snapshot that goes stale on a rename or a number change.

```js
tournamentEngine.modifyParticipant({
  participant: {
    participantId: 'group-123',
    contactParticipantIds: ['player-123'],
  },
});
```

Every id must appear in the grouping's `individualParticipantIds`. A pointer to a non-member is stale
rather than authoritative, so it is rejected on write with `INVALID_PARTICIPANT_IDS` instead of being
tolerated and filtered on every read. Membership is validated against the state the participant will
have **after** the call, so "add these members and make one of them the contact" works as a single
mutation. Deleting a participant prunes them from both `individualParticipantIds` and
`contactParticipantIds`.

## Privacy and Data Protection

Use Participant Policies to control which participant data is exposed:

**API Reference:** [checkInParticipant](/docs/governors/matchup-governor#checkinparticipant)

**API Reference:** [checkOutParticipant](/docs/governors/matchup-governor#checkoutparticipant)

**API Reference:** [toggleParticipantCheckInState](/docs/governors/matchup-governor#toggleparticipantcheckinstate)

```js
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

- **[Participant Context](./participant-context.md)** - Understanding hydration and contextual data
- **[Draw Generation](./draws-overview.mdx)** - How participants are assigned to draws
- **[Participant Policy](/docs/policies/participantPolicy)** - Configuring privacy and data filters
- **[Query Governor](/docs/governors/query-governor#getparticipants)** - Complete API reference
- **[Participant Governor](/docs/governors/participant-governor)** - Participant management methods

## TEAM branding

A TEAM participant carries portable CODES identity colors and its administrator's preferred display.
Team providers supply this data with team details; importing teams into a tournament does not require
recreating their display configuration. The imported participant is a snapshot usable offline.

```json
{
  "teamColors": {
    "palette": [
      { "colorId": "navy", "value": "#13294B", "name": "Navy", "group": "Primary" },
      { "colorId": "white", "value": "#FFFFFF", "name": "White", "group": "Primary" },
      { "colorId": "gold", "value": "#E8B923", "name": "Gold", "group": "Accent" }
    ],
    "display": {
      "roles": {
        "team.surface": "navy",
        "team.text": "white",
        "team.accent": "gold",
        "score.surface": "gold",
        "score.text": "navy"
      }
    }
  }
}
```

### Palette and default display contract

Each palette entry requires a unique stable `colorId` and opaque `#RRGGBB` value. IDs are 1–64 ASCII
letters/digits, dots, colons, underscores or hyphens, starting with a letter/digit. Optional `name` and
`group` labels are nonblank, at most 100 characters, and trimmed on write. Hex values normalize to
uppercase. Duplicate hex values and descriptive groups are valid; group labels never select styling.
The palette must be nonempty. CODES imposes no fixed color-count ceiling.

`display` is optional. Its `roles` may assign any subset of `team.surface`, `team.text`, `team.accent`,
`score.surface` and `score.text`. Every assigned value references an existing palette `colorId`.
Palette reordering preserves display identity. Removing a referenced entry requires removing or
reassigning its roles in the same atomic write. Unassigned roles use renderer/theme defaults.
A renderer declares the roles its layout supports; these roles are preferences, not arbitrary CSS.

`teamColors` is TEAM-only. Closed objects reject unknown fields/roles, malformed hex values, duplicate
IDs and dangling default references. Add/modify participant methods validate before writes or notices.
For updates, omission, `undefined` and `null` leave the field alone; `{}` clears it; a nonempty object
replaces the entire palette/default display. The command `{}` is never stored as branding.
The structural schema and semantic write validator complement one another: unique IDs and palette
reference membership are semantic constraints.

### Tournament presentation overrides

Tournament directors store optional `teamPresentation` in the tournament's DISPLAY extension, separately
from imported TEAM defaults. All-team roles accept opaque hex values or `{ theme: true }`; TEAM-specific exceptions
also accept that team's palette IDs. For example:

```json
{
  "name": "display",
  "value": {
    "teamPresentation": {
      "roles": { "score.surface": "#13294B", "score.text": "#FFFFFF" },
      "teams": { "team-alpha": { "roles": { "team.accent": "gold", "team.surface": { "theme": true } } } }
    }
  }
}
```

Resolve each role from renderer/theme fallback, then team default, then all-team override, then
TEAM-specific exception. Omission inherits; `{ theme: true }` explicitly uses the renderer/theme fallback. Reset
removes the override. Overrides are keyed by participantId and remain stable through side swaps.
Refreshing provider details updates team defaults while preserving tournament presentation settings.
No tournament mutation writes back to provider identity data. Use `addTournamentExtension` through
the normal mutation path to persist presentation; the generic extension mechanism stores its value,
and presentation consumers validate its supported role shape.

### Hydration and rendering boundaries

TEAM identities and permitted palettes hydrate onto parent sides and `side.teamParticipant` on
singles/doubles tie lines, including unassigned lines. Participant privacy still applies; consumers
must not recover withheld palette data from raw records. Hydrated matchUps expose `teamPresentation`
with all-team roles and exceptions only for TEAM identities exposed on that matchUp's sides.

Clean scorecards keep plain headers and theme-semantic state indicators. Branded scorecards may use
team roles on match-line names; arena layouts may use independently colored team and score surfaces.
Foreground contrast is resolved against the actual consumer's theme/surface without changing stored
brand values. Names and visible outcome/serve cues remain meaningful without color. Existing explicit
composition `sideColors` map/callback semantics remain available to callers.

Relay branding transports named role values before consumer-local contrast resolution. Unselected
palette metadata does not cross that wire. [CODES decisions](/docs/concepts/team-presentation) describe
provider ownership, tournament inheritance and consumer responsibilities together.
