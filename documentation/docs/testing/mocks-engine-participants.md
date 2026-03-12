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
