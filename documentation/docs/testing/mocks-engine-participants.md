---
title: Participant Generation
---

import BrowserOnly from '@docusaurus/BrowserOnly';
import MockParticipantsDemo from '../components/MockParticipantsDemo';

# Participant Generation

The mocksEngine generates individual, pair and team participants with demographics, rankings, and ratings. Participants can be created standalone or as part of tournament generation.

<BrowserOnly>{() => <MockParticipantsDemo />}</BrowserOnly>

:::note Sex vs Gender
In the [CODES](/docs/data-standards#codes) data model:

- **Persons have `sex`** - A biological attribute (MALE/FEMALE) stored in the `person` object
- **Events have `gender`** - A competition category attribute (MALE/FEMALE/MIXED/etc.) stored in the event object

When generating participants, use the `sex` parameter to specify the sex of the person objects. When creating events, use the `gender` parameter to specify the event category.
:::

## generateParticipants

Generate participants independently of tournaments:

```js
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 64,
  participantType: 'INDIVIDUAL',
});
```

## Participant Types

### Individual Participants

```js
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 32,
  participantType: 'INDIVIDUAL', // Default
});
```

Each participant includes:

- **participantId**: Unique identifier
- **participantName**: Full name
- **person**: Person object with sex and location detail
- **participantType**: 'INDIVIDUAL'

### Pair Participants (Doubles)

```js
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 16, // Creates 16 pairs
  participantType: 'PAIR',
  matchUpType: 'DOUBLES', // Forces PAIR generation
});
```

Or let matchUpType determine type:

```js
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 16,
  matchUpType: 'DOUBLES', // Automatically creates PAIRs
});
```

### Team Participants

```js
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 8,
  participantType: 'TEAM',
});
```

### In-Context Expansion

Expand pair and team participants to include full individual participant objects:

```js
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 16,
  participantType: 'PAIR',
  inContext: true, // Includes individualParticipants array with full objects
});

// Each PAIR now includes:
participants[0].individualParticipantIds; // ['id1', 'id2']
participants[0].individualParticipants; // [{ full participant object }, { full participant object }]
```

## Demographics

### Sex

Generate participants with a specific sex. The `sex` parameter sets the `person.sex` property for individual participants:

```js
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 32,
  sex: 'FEMALE', // Sets person.sex = 'FEMALE' for all participants
});

// Result:
participants[0].person.sex; // 'FEMALE'
```

Mixed sex (default):

```js
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 100,
  // sex not specified - generates mixed MALE/FEMALE participants
});
```

Note: For pairs (doubles), all individuals within a pair will have the same sex:

```js
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 16,
  participantType: 'PAIR',
  sex: 'MALE', // Creates male-male pairs (not mixed pairs)
});
```

For PAIR participants:

```js
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 16,
  participantType: 'PAIR',
  sex: 'MALE', // Creates male-male pairs
});
```

### Names

Participants are generated with realistic first and last names from a built-in database.

#### Custom Person Data

Provide custom person data:

```js
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 10,
  personData: [
    { firstName: 'Serena', lastName: 'Williams', sex: 'FEMALE' },
    { firstName: 'Roger', lastName: 'Federer', sex: 'MALE' },
    // ... more persons
  ],
});
```

Participants will use provided names first, then generate additional names as needed.

### Nationality

#### Random Nationalities

```js
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 64,
  nationalityCodesCount: 20, // Randomly select 20 different countries
  nationalityCodeType: 'ISO', // or 'IOC'
});
```

#### Specific Nationalities

```js
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 32,
  nationalityCodes: ['USA', 'CAN', 'MEX', 'GBR', 'FRA'],
});
```

### Addresses

All participants are generated with addresses (city, state, postalCode) by default using random mock data. Use `addressProps` to control the distribution:

```js
// Control count of unique address values
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 64,
  addressProps: {
    citiesCount: 20, // Number of unique cities
    statesCount: 10, // Number of unique states
    postalCodesCount: 30, // Number of unique postal codes
  },
});

// Without addressProps, random addresses are still generated
const { participants: defaultAddresses } = mocksEngine.generateParticipants({
  participantsCount: 50,
  // No addressProps - addresses automatically included
});
```

#### Address Profiles

Control specific address distributions:

```js
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 100,
  addressProps: {
    citiesProfile: {
      'New York': 30, // 30 participants from New York
      'Los Angeles': 25,
      Chicago: 15,
      Miami: 10,
    },
    statesProfile: {
      CA: 40, // 40 participants from California
      NY: 30,
      FL: 20,
    },
    postalCodesProfile: {
      10001: 15, // 15 participants with this postal code
      90210: 10,
    },
  },
});
```

## Rankings and Ratings

### Single Category with Rankings

```js
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 64,
  category: {
    categoryName: 'U18',
    ageCategoryCode: 'U18',
  },
  consideredDate: '2024-06-01', // For age calculation
  rankingRange: [1, 500], // Assign rankings between 1-500
});
```

### Multiple Categories

Assign multiple rankings/ratings per participant:

```js
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 64,
  categories: [
    {
      categoryName: 'U18',
      ageCategoryCode: 'U18',
      ratingType: 'WTN',
    },
    {
      categoryName: 'U16',
      ageCategoryCode: 'U16',
      ratingType: 'UTR',
    },
  ],
});
```

### Rating Scales

Generate participants with specific rating types:

```js
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 64,
  category: {
    categoryName: 'Open',
    ratingType: 'WTN', // World Tennis Number
  },
  scaleAllParticipants: true, // Give all participants a rating
});
```

Default behavior assigns ratings to ~25% of participants unless `scaleAllParticipants` is true.

#### Control Scaled Participant Count

```js
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 100,
  category: { categoryName: 'Open' },
  scaledParticipantsCount: 50, // Exactly 50 participants get ratings
});
```

## IDs and Prefixes

### Custom Participant IDs

```js
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 32,
  idPrefix: 'player',
});

// Results in IDs like: player-I-0, player-I-1, etc.
// (I = Individual, P = Pair, T = Team)
```

### Pre-defined UUIDs

Use specific UUIDs for participants:

```js
import { UUIDS } from '@Tools/UUID';

const participantIds = UUIDS(10); // Generate array of 10 UUIDs

const { participants } = mocksEngine.generateParticipants({
  participantsCount: 10,
  uuids: participantIds, // Use these specific IDs
});
```

### Pre-defined Person IDs

```js
import { UUID } from '@Tools/UUID';

const personIds = [UUID(), UUID(), UUID()];

const { participants } = mocksEngine.generateParticipants({
  participantsCount: 10,
  personIds, // First 3 persons get these IDs
});
```

## Extensions

Add custom extensions to all generated participants:

```js
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 32,
  personExtensions: [
    {
      name: 'customRating',
      value: { source: 'internal', version: '2.0' },
    },
  ],
});
```

## Advanced Options

### Values Instance Limit

Control uniqueness of generated values:

```js
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 100,
  valuesInstanceLimit: 5, // Max 5 participants can share any value
});
```

## Integration with Tournaments

### Within Tournament Generation

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  participantsProfile: {
    participantsCount: 128,
    sex: 'FEMALE',
    category: {
      categoryName: 'U18',
      ageCategoryCode: 'U18',
    },
    addressProps: {
      citiesCount: 30,
    },
    nationalityCodesCount: 20,
  },
  drawProfiles: [{ drawSize: 64 }],
});
```

### Adding to Existing Tournament

```js
import tournamentEngine from 'tods-competition-factory';

// Generate participants separately
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 32,
  sex: 'MALE',
});

// Add to tournament
tournamentEngine.newTournamentRecord();
tournamentEngine.addParticipants({ participants });
```

## Team Participants Generation

### From Individual Participant Attributes

Create team participants based on attributes of individuals:

```js
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 64,
  participantType: 'INDIVIDUAL',
  addressProps: {
    statesProfile: {
      CA: 20,
      TX: 20,
      NY: 24,
    },
  },
});

// Later, create teams from state attribute
tournamentEngine.setState({ participants });
tournamentEngine.createTeamsFromParticipantAttributes({
  participantAttribute: 'person.addresses[0].state',
  uuids: [
    /* team IDs */
  ],
});
```

Or specify `teamKey` in `participantsProfile`:

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  participantsProfile: {
    participantsCount: 64,
    teamKey: 'person.addresses[0].state', // Create teams by state
    // Note: addresses are generated by default, no need to specify addressProps
  },
  drawProfiles: [
    {
      drawSize: 8,
      eventType: 'TEAM',
    },
  ],
});
```

:::tip Default Address Generation
Participants are automatically generated with addresses (city, state, postalCode) by default. You only need to specify `addressProps` if you want to control the distribution of addresses or use specific values. This makes `teamKey: 'person.addresses[0].state'` work out of the box.
:::

## Common Patterns

### Testing with Specific Demographics

```js
// All female participants from specific countries
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 64,
  sex: 'FEMALE',
  nationalityCodes: ['USA', 'CAN', 'GBR', 'AUS'],
  addressProps: {
    citiesCount: 20,
  },
});
```

### Testing Seeding with Rankings

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  participantsProfile: {
    participantsCount: 64,
    category: {
      categoryName: 'Open',
      ratingType: 'WTN',
    },
    scaleAllParticipants: true, // All get ratings for seeding
  },
  drawProfiles: [
    {
      drawSize: 32,
      seedsCount: 8, // Top 8 by rating will be seeded
    },
  ],
});
```

### Mixed Doubles from Singles Participants

```js
const { tournamentRecord, eventIds } = mocksEngine.generateTournamentRecord({
  participantsProfile: {
    participantsCount: 64,
    // Mixed sex for mixed doubles
  },
  drawProfiles: [
    { drawSize: 32, eventType: 'SINGLES' },
    { drawSize: 16, eventType: 'DOUBLES' }, // Creates pairs from individuals
  ],
});
```

### Testing with Debuggable IDs

```js
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 16,
  idPrefix: 'TEST',
  participantType: 'PAIR',
});

// IDs will be: TEST-P-0, TEST-P-1, etc.
// Making console output easier to read during debugging
```

## Participant Structure

### Individual Participant

```js
{
  participantId: 'abc-123',
  participantRole: 'COMPETITOR',
  participantType: 'INDIVIDUAL',
  participantName: 'John Doe',
  person: {
    personId: 'xyz-789',
    standardGivenName: 'John',
    standardFamilyName: 'Doe',
    firstName: 'John',  // May include middle name
    lastName: 'Doe',
    sex: 'MALE',
    nationalityCode: 'USA',
    addresses: [{
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
      countryCode: 'USA',
    }],
  },
  timeItems: [{
    itemType: 'SCALE.RATING.SINGLES.WTN',
    itemValue: {
      wtnRating: 14.5,
      confidence: 80,
    },
  }],
}
```

### Pair Participant

```js
{
  participantId: 'pair-123',
  participantType: 'PAIR',
  participantName: 'Doe/Smith',
  individualParticipantIds: ['abc-123', 'def-456'],
  // With inContext: true
  individualParticipants: [
    { /* full individual participant object */ },
    { /* full individual participant object */ },
  ],
}
```

## Pre-built participants (ingest pipelines)

`mocksEngine.generateTournamentRecord` accepts a top-level `participants` array. When supplied, factory uses the caller's participant pool as the entry source instead of synthesizing fresh mocks. This was added for ingest pipelines (e.g. `courthive-ingest`'s federation adapters) where stable provider-issued IDs need to survive through the canonical TODS shape that mocksEngine produces.

### When to use

Use preset participants when you already have a Participant[] list with stable IDs from an upstream source and want factory to lay down the canonical draw shape around them:

- Federation HTML / CSV ingest where each player has a provider-issued ID.
- Migrating real tournament data into TODS where the IDs come from a legacy system.
- Property tests that need named participants for assertion clarity.

For pure test fixtures with arbitrary mock data, use `participantsProfile` as before — synthesis is fine and often preferable.

### Minimal example

```js
const participants = [
  {
    participantId: 'CZE1045200',
    participantType: 'INDIVIDUAL',
    participantRole: 'COMPETITOR',
    participantName: 'Černovický Jakub',
    person: { personId: 'CZE1045200', sex: 'MALE', nationalityCode: 'CZE' },
  },
  // ...32 total
];

const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
  tournamentName: 'Real Federation Data',
  participants,
  eventProfiles: [
    {
      eventName: 'Singles',
      eventType: 'SINGLES',
      gender: 'MALE',
      drawProfiles: [
        {
          drawSize: 32,
          participantsCount: 32,
          automated: false, // leave positionAssignments empty for manual placement
          idPrefix: 'main', // deterministic matchUpId: 'main-1-1', 'main-2-1', etc.
        },
      ],
    },
  ],
  setState: true,
});
```

### Behavior contract

When `participants` is a non-empty array:

- Factory calls `addParticipants` directly with your list.
- The synthesis path is fully suppressed: `addTournamentParticipants`, `generateEventParticipants`, and per-draw `uniqueDrawParticipants` generation are all skipped.
- `participantsProfile` synthesis fields (`participantsCount`, `participantType`, `sex`, etc.) are ignored — your pool is authoritative.
- Event-level filters still apply when selecting from your pool: `gender`, `eventType` (SINGLES → INDIVIDUAL, DOUBLES → PAIR, etc.), `participantType`. Supply participants that satisfy those filters, or the draw will run short on entries.
- For DOUBLES events, supply pre-formed PAIR participants in the list (see [Participant Types](#participant-types)).
- **Multiple events spanning different genders in one call are supported.** A single `generateTournamentRecord({ participants })` may define, for example, Boys Singles, Girls Singles, Boys Doubles, and Girls Doubles together: each event selects only its matching-gender participants (PAIRs are matched by their constituents), and participants consumed by one event are not reused by another. A gendered event selects by `event.gender`, not pool order, so a Boys event picks the males even if females appear first in the pool.

### End-to-end ingest pattern

The full pattern — generate canonical shape, then infill positions and outcomes from parsed source data:

```js
import { mocksEngine, tournamentEngine } from 'tods-competition-factory';

// 1. Build pool from parsed source. Include PAIR participants for DOUBLES.
const participants = buildParticipantsFromUpstream(parsedData);

// 2. Generate skeleton via mocksEngine. `automated: false` leaves
//    positionAssignments empty; factory still creates the matchUp graph,
//    winnerMatchUpId chain, and finishingPositionRange ranges.
tournamentEngine.reset();
const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
  tournamentName: parsedData.name,
  startDate: parsedData.startDate,
  endDate: parsedData.endDate,
  participants,
  eventProfiles: [
    {
      eventName: 'Singles',
      eventType: 'SINGLES',
      gender: 'MALE',
      drawProfiles: [
        {
          drawSize: 32,
          participantsCount: 32,
          automated: false,
          idPrefix: 'main',
        },
      ],
    },
  ],
  setState: true,
});

// 3. Inject R1 positions from parsed bracket.
const drawId = drawIds[0];
const drawDef = tournamentRecord.events[0].drawDefinitions[0];
const structureId = drawDef.structures[0].structureId;
for (const parsedR1 of parsedData.round1Matches) {
  const dp1 = parsedR1.roundPosition * 2 - 1;
  const dp2 = parsedR1.roundPosition * 2;
  tournamentEngine.assignDrawPosition({
    drawId,
    structureId,
    drawPosition: dp1,
    participantId: parsedR1.side1Id,
  });
  if (parsedR1.side2Id) {
    tournamentEngine.assignDrawPosition({
      drawId,
      structureId,
      drawPosition: dp2,
      participantId: parsedR1.side2Id,
    });
  } else {
    // explicit BYE — factory auto-advances the opposing side
    tournamentEngine.assignDrawPosition({ drawId, structureId, drawPosition: dp2, bye: true });
  }
}

// 4. Apply completed-match outcomes in round order so factory's advancement
//    chain is walked correctly (winner of R1Pn → drawPosition of R2P⌈n/2⌉).
const matchUps = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps;
const lookup = new Map(matchUps.map((m) => [`${m.roundNumber}-${m.roundPosition}`, m.matchUpId]));
const ordered = parsedData.completedMatches.sort(
  (a, b) => a.roundNumber - b.roundNumber || a.roundPosition - b.roundPosition,
);
for (const m of ordered) {
  const matchUpId = lookup.get(`${m.roundNumber}-${m.roundPosition}`);
  tournamentEngine.setMatchUpStatus({
    drawId,
    matchUpId,
    matchUpStatus: 'COMPLETED',
    outcome: { winningSide: m.winningSide, scoreString: m.scoreString },
  });
}

// 5. Extract the final, populated record.
const finalRecord = tournamentEngine.getState().tournamentRecords[tournamentRecord.tournamentId];
```

### QUALIFYING and play-off structures

mocksEngine doesn't accept `stage: 'QUALIFYING'` on a standalone drawProfile — that flow expects qualifying via `qualifyingProfiles` nested in a MAIN drawProfile (which auto-creates a WINNER link). For ingest pipelines that want QUALIFYING as its own drawDefinition (no auto-link), use a separate drawProfile (factory defaults its `structure.stage` to `MAIN`) and **post-stamp** the stage after generation:

```js
// After generation, before serialization:
const qualDrawDef = tournamentRecord.events[0].drawDefinitions[1]; // 2nd drawProfile
qualDrawDef.structures[0].stage = 'QUALIFYING';
qualDrawDef.drawName = 'Qualifying';
```

The rankings engine's `stages: [MAIN]` filter then naturally excludes the QUALIFYING-stage participants from MAIN award profiles.

### Reference test

See `src/tests/documentation/presetParticipants.test.ts` for the canonical three-test fixture: SINGLES preset, the assignDrawPosition + setMatchUpStatus chain, and DOUBLES PAIR pre-supply.

## Tips

1. **Match participants to draw requirements** - Generate appropriate counts for your draw sizes
2. **Use sex parameter** when generating participants for gender-specific events (events where `event.gender` is MALE or FEMALE)
3. **Leverage addressProps** for testing geographic-based scenarios
4. **Set scaleAllParticipants: true** when all participants need rankings/ratings
5. **Use idPrefix** during development for easier debugging
6. **Pre-define personIds** when testing specific participant scenarios
7. **Control distributions** with profile objects for realistic scenarios

## Next Steps

- **[Tournament Generation](./mocks-engine-tournament-generation.md)** - Integrate participants into tournaments
- **[Advanced Patterns](./mocks-engine-patterns.md)** - Common testing patterns with participants
