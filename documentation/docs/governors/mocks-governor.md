---
title: Mocks Governor
---

The **Mocks Governor** provides methods for anonymizing and modifying tournament records. For generating tournaments, participants, and outcomes, see the comprehensive [mocksEngine documentation](../testing/mocks-engine-overview.md).

## anonymizeTournamentRecord

Replace personal information in a tournament record with generated mock data while preserving tournament structure.

### Anonymization Purpose

- **Privacy compliance** - Remove PII before sharing tournament data
- **Test data creation** - Create realistic test data from production tournaments
- **Public examples** - Share tournament structures without exposing participant identities
- **Debugging** - Anonymize production data for support investigations

### Anonymization Basic Usage

```js
const anonymizedRecord = mocksGovernor.anonymizeTournamentRecord({
  tournamentRecord, // Original tournament with real participant data
});
```

### Anonymization Complete Options

```js
const anonymizedRecord = mocksGovernor.anonymizeTournamentRecord({
  tournamentRecord, // Required - tournament to anonymize

  // Optional - Override tournament identification
  tournamentId, // New UUID for tournament (default: generates new)
  tournamentName, // New name (default: generates name)

  // Optional - Controlled mock person generation
  personIds: [], // Array of UUIDs to use for replacement persons
  // If not provided, new UUIDs are generated

  // Optional - Extension handling
  keepExtensions: [], // Array of extension names to preserve
  // Use true to keep ALL extensions
  // Use [] or false to remove all except internal extensions

  // Optional - Name anonymization control
  anonymizeParticipantNames: true, // Whether to replace participant names
  // true = replace with mock names (default)
  // false = preserve original names
});
```

### What Gets Anonymized

**Person information:**

- `person.personId` - New UUID generated (or from personIds array)
- `person.standardFamilyName` - Mock last name
- `person.standardGivenName` - Mock first name
- `person.nationalityCode` - Randomized

**What's preserved:**

- Tournament structure (events, draws, matchUps)
- Match results (scores, outcomes, winners)
- Seedings and rankings (numerical values)
- Scheduling and venues
- All IDs and references (updated consistently)

### Example: Anonymize Production Data

```js
import { tournamentEngine, mocksGovernor } from 'tods-competition-factory';

// Load production tournament
const productionTournament = await fetchTournamentData();
tournamentEngine.setState(productionTournament);

// Anonymize for public sharing
const anonymized = mocksGovernor.anonymizeTournamentRecord({
  tournamentRecord: productionTournament,
  tournamentName: 'Example Tournament 2024',
});

// Now safe to share - all personal info replaced
console.log(anonymized.participants[0].person.standardFamilyName); // 'Smith' (mocked)
```

### Example: Create Test Fixture from Real Data

```js
// Start with real tournament that had interesting edge case
const realTournament = loadRealTournamentWithEdgeCase();

// Anonymize and save as test fixture
const testFixture = mocksGovernor.anonymizeTournamentRecord({
  tournamentRecord: realTournament,
  tournamentId: 'edge-case-test-fixture',
  tournamentName: 'Edge Case Test',
});

// Save for future tests
fs.writeFileSync('fixtures/edge-case.tods.json', JSON.stringify(testFixture));
```

### Example: Preserve Specific Extensions

```js
// Tournament with custom extensions
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 16 }],
});

// Add custom extensions to participants
tournamentRecord.participants.forEach((participant) => {
  participant.extensions = [
    { name: 'level', value: 'advanced' },
    { name: 'club', value: 'Tennis Club A' },
    { name: 'membershipId', value: '12345' },
  ];
});

// Anonymize but keep 'level' extension
const anonymized = mocksGovernor.anonymizeTournamentRecord({
  tournamentRecord,
  keepExtensions: ['level'], // Only 'level' preserved, 'club' and 'membershipId' removed
});

// Result: 'level' extensions intact, all others removed (except internal extensions)
```

### Example: Preserve Names but Replace IDs

```js
// When you want to preserve participant names but still anonymize IDs
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 8 }],
});

const anonymized = mocksGovernor.anonymizeTournamentRecord({
  tournamentRecord,
  anonymizeParticipantNames: false, // Keep original names
});

// Result: All IDs changed, but participant names remain the same
// Useful for testing while maintaining recognizable names
```

### Anonymization Notes

- **Deterministic generation:** Using the same `personIds` array produces the same mock names
- **Referential integrity:** All participantIds and personIds are updated consistently throughout the tournament
- **CODES compliance:** Anonymized record is valid CODES schema
- **Non-destructive:** Original tournament record is not modified

---

## generateEventWithDraw

Generates a complete event with participants and a populated draw. See [mocksEngine documentation](../testing/mocks-engine-getting-started.md) for comprehensive details.

```js
const { event, participants, drawDefinition } = mocksGovernor.generateEventWithDraw({
  drawSize: 32,
  eventType: 'SINGLES', // or 'DOUBLES'
  drawType: 'SINGLE_ELIMINATION',
});
```

**Quick Reference:**

- Creates event with specified parameters
- Generates required participants
- Creates and populates draw structure
- Positions participants in draw
- See full docs for all options (seeding, matchUpFormat, etc.)

---

## generateOutcome

Generates a complete outcome object for a matchUp. See [mocksEngine documentation](../testing/mocks-engine-outcomes.md) for comprehensive details.

```js
const outcome = mocksGovernor.generateOutcome({
  matchUpStatus: 'COMPLETED',
  winningSide: 1,
  matchUpFormat: 'SET3-S:6/TB7',
});
```

**Quick Reference:**

- Creates valid outcome object with score
- Supports all matchUp statuses (COMPLETED, DEFAULTED, RETIRED, etc.)
- Generates realistic scores based on matchUpFormat
- Can specify winner or generate randomly
- See full docs for score generation options

---

## generateOutcomeFromScoreString

Generates an outcome object from a score string. See [mocksEngine documentation](../testing/mocks-engine-outcomes.md#generateOutcomeFromScoreString) for comprehensive details.

```js
const outcome = mocksGovernor.generateOutcomeFromScoreString({
  scoreString: '6-4 6-3',
  matchUpStatus: 'COMPLETED',
  winningSide: 1,
});
```

**Quick Reference:**

- Parses score strings into structured outcome objects
- Supports various score formats
- Validates score structure
- See full docs for supported score formats

---

## generateParticipants

Generates mock participants with realistic data. See [mocksEngine documentation](../testing/mocks-engine-participants.md) for comprehensive details.

```js
const participants = mocksGovernor.generateParticipants({
  participantsCount: 32,
  participantType: 'INDIVIDUAL', // or 'PAIR', 'TEAM'
  nationalityCodesCount: 5, // optional
});
```

**Quick Reference:**

- Creates participants with mock person data
- Supports INDIVIDUAL, PAIR, and TEAM types
- Generates ratings and rankings
- Assigns nationality codes
- See full docs for all participant generation options

---

## generateTournamentRecord

Generates a complete mock tournament with events, draws, and participants. See [mocksEngine documentation](../testing/mocks-engine-tournament-generation.md) for comprehensive details.

```js
const { tournamentRecord } = mocksGovernor.generateTournamentRecord({
  drawProfiles: [
    { drawSize: 32, eventType: 'SINGLES' },
    { drawSize: 16, eventType: 'DOUBLES' },
  ],
});
```

**Quick Reference:**

- Creates complete tournament structure
- Generates events and draws based on profiles
- Creates participants automatically
- Populates draws with participants
- Assigns seeds and ratings
- Can generate completed matchUps with outcomes
- See full docs for extensive configuration options

**Note:** This is the primary method for creating test tournaments. For comprehensive examples and all configuration options, see the [mocksEngine Getting Started](../testing/mocks-engine-getting-started.md) guide.

---

## modifyTournamentRecord

Add events and draws to an existing tournament record. This is useful for:

- **Incrementally building** complex tournaments in tests
- **Adding draws** to tournaments after initial generation
- **Testing dynamic** tournament modifications
- **Simulating** real-world tournament expansion

### Modification Purpose

Unlike `generateTournamentRecord()` which creates a complete tournament from scratch, `modifyTournamentRecord()` adds to an existing tournament while:

- Reusing existing participants (no duplication)
- Maintaining tournament context (dates, venues, etc.)
- Preserving existing events and draws
- Updating tournament structure incrementally

### Modification Basic Usage

```js
// Start with existing tournament
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 32, eventType: 'SINGLES' }],
});

// Add a doubles draw
mocksGovernor.modifyTournamentRecord({
  tournamentRecord, // Modified in place
  drawProfiles: [{ drawSize: 16, eventType: 'DOUBLES' }],
});

// Tournament now has both singles and doubles events
```

### Modification Complete Options

```js
mocksGovernor.modifyTournamentRecord({
  tournamentRecord, // Required - tournament to modify (modified in place)

  // Add participants (if needed)
  participantsProfile: {
    participantsCount: 16,
    participantType: 'PAIR',
  },

  // Add draws (creates new events)
  drawProfiles: [
    {
      drawSize: 16,
      drawType: 'SINGLE_ELIMINATION',
      eventType: 'DOUBLES',
      completionGoal: 8, // Complete first 8 matchUps
    },
  ],

  // Add draws to existing events
  eventProfiles: [
    {
      eventId: 'existing-event-id', // Target specific event
      // OR
      eventName: 'U18 Singles', // Target by name
      // OR
      eventIndex: 0, // Target by index

      drawProfiles: [{ drawSize: 8, drawType: 'FEED_IN_CHAMPIONSHIP' }],
    },
  ],

  // Add venues (isPrimary designates the tournament's primary venue)
  venueProfiles: [{ courtsCount: 4, venueName: 'Court Complex B', isPrimary: true }],

  // Add scheduling
  schedulingProfile: [
    {
      scheduleDate: '2024-06-02',
      venues: [
        /* ... */
      ],
    },
  ],

  // Match completion options
  completeAllMatchUps: false,
  randomWinningSide: false,

  // IDs for generation
  uuids: [], // Pre-defined UUIDs for new entities
});
```

### Targeting Existing Events

**Three ways to identify events for modification:**

```js
// 1. By eventId
eventProfiles: [
  {
    eventId: 'abc-123-def-456',
    drawProfiles: [{ drawSize: 8 }],
  },
];

// 2. By eventName
eventProfiles: [
  {
    eventName: 'U18 Singles',
    drawProfiles: [{ drawSize: 8 }],
  },
];

// 3. By eventIndex (zero-based)
eventProfiles: [
  {
    eventIndex: 0, // First event
    drawProfiles: [{ drawSize: 8 }],
  },
];
```

### Example: Add Qualifying Draw

```js
import { mocksEngine, mocksGovernor } from 'tods-competition-factory';

// Generate main tournament
const { tournamentRecord, eventIds } = mocksEngine.generateTournamentRecord({
  eventProfiles: [
    {
      eventName: 'Singles',
      drawProfiles: [{ drawSize: 32, drawName: 'Main Draw' }],
    },
  ],
});

// Add qualifying draw to same event
mocksGovernor.modifyTournamentRecord({
  tournamentRecord,
  eventProfiles: [
    {
      eventId: eventIds[0], // Target existing event
      drawProfiles: [
        {
          drawSize: 16,
          drawName: 'Qualifying',
          stage: 'QUALIFYING',
        },
      ],
    },
  ],
});

// Tournament now has Main Draw and Qualifying in same event
```

### Example: Add Doubles to Singles Tournament

```js
// Start with singles-only tournament
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 32, eventType: 'SINGLES' }],
});

// Add doubles event
mocksGovernor.modifyTournamentRecord({
  tournamentRecord,
  participantsProfile: {
    participantsCount: 16,
    participantType: 'PAIR',
  },
  drawProfiles: [{ drawSize: 16, eventType: 'DOUBLES' }],
});

// Tournament now has both singles and doubles
console.log(tournamentRecord.events.length); // 2 events
```

### Example: Progressive Tournament Building

```js
// Build tournament incrementally
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  tournamentName: 'Weekend Tournament',
  startDate: '2024-06-01',
  endDate: '2024-06-02',
});

// Day 1: Add singles
mocksGovernor.modifyTournamentRecord({
  tournamentRecord,
  drawProfiles: [{ drawSize: 16, eventType: 'SINGLES', eventName: 'Saturday Singles' }],
});

// Day 2: Add doubles
mocksGovernor.modifyTournamentRecord({
  tournamentRecord,
  participantsProfile: { participantType: 'PAIR', participantsCount: 8 },
  drawProfiles: [{ drawSize: 8, eventType: 'DOUBLES', eventName: 'Sunday Doubles' }],
});

// Weekend tournament complete with progressive additions
```

### Modification Notes

- **In-place modification:** The supplied `tournamentRecord` is directly modified (not copied)
- **Participant reuse:** Existing participants are used when possible
- **Event creation:** `drawProfiles` creates new events; `eventProfiles` can target existing events
- **No duplication:** Won't create duplicate participants if they already exist
- **Schema compliance:** Modified tournament maintains CODES schema validity

---

## Related Documentation

### mocksEngine Documentation

**For comprehensive testing capabilities, see:**

- **[mocksEngine Overview](../testing/mocks-engine-overview.md)** - Introduction and capabilities
- **[Getting Started](../testing/mocks-engine-getting-started.md)** - Basic usage patterns
- **[Tournament Generation](../testing/mocks-engine-tournament-generation.md)** - Complete `generateTournamentRecord()` documentation
- **[Participant Generation](../testing/mocks-engine-participants.md)** - All participant generation options
- **[Outcome Generation](../testing/mocks-engine-outcomes.md)** - Match outcome and score generation
- **[Advanced Patterns](../testing/mocks-engine-patterns.md)** - Common testing patterns and techniques

### Other Governors

- [Competition Governor](./competition-governor.md)
- [Tournament Governor](./tournament-governor.md)
- [Event Governor](./event-governor.md)
- [Participant Governor](./participant-governor.md)

---
