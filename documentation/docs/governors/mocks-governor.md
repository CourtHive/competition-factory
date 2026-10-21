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
fs.writeFileSync('fixtures/edge-case.codes.json', JSON.stringify(testFixture));
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
- `completeAllMatchUps`, `randomWinningSide` and `matchUpStatusProfile` apply to every draw when passed at the top level, to the draws of one event when set on its `eventProfile`, or to one draw when set on its `drawProfile`. The innermost value wins: drawProfile, then eventProfile, then top level; see [Complete One Draw](../testing/mocks-engine-tournament-generation.md#complete-one-draw)
- An AD_HOC drawProfile with `roundsCount` above 1 and `completeAllMatchUps` is generated round by round: each round is paired, then completed, so later rounds pair on results. Every round is paired unless the drawProfile sets `automated: false`, which leaves the rounds empty
- A `venueProfile`'s `courtIds` is a pool the call consumes, one id per court: reusing the same profile object gives the second venue generated court ids. Pass a fresh array to each call that needs the same ids
- See full docs for extensive configuration options

**Note:** This is the primary method for creating test tournaments. For comprehensive examples and all configuration options, see the [mocksEngine Getting Started](../testing/mocks-engine-getting-started.md) guide.

### Unknown Options

`generateTournamentRecord` and `modifyTournamentRecord` refuse an option they do not read, at the top level and
inside `participantsProfile`, `scenarioProfile`, `leagueProfiles`, `venueProfiles`, `eventProfiles` and every
`drawProfiles` entry (an event's own `drawProfiles` included). A misspelled or misplaced option used to be ignored
silently; refused, it names itself, and nothing is generated or written:

```js
const result = mocksGovernor.generateTournamentRecord({
  drawProfiles: [{ drawSize: 8 }, { drawSize: 8, mathcUpType: 'DOUBLES' }],
});
// result.error -> INVALID_VALUES
// result.context.option -> 'drawProfiles[1].mathcUpType'
```

The params an engine adds to every method call (`activeTournamentId`, `tournamentRecords`, `tournamentId`, and the
loaded `tournamentRecord`) are not the caller's options and are accepted. Objects nested inside a profile (for
example a drawProfile's `outcomes` or a scenario's `called`) are not checked key by key.

A policy that `attachPolicies` refuses, at the top level, on an eventProfile or on a drawProfile, refuses the
generation in the same way; it used to be dropped while generation succeeded. A policy type whose value is
`undefined` is absent. Pass a policy under its policy type: a bare policy body such as `POLICY_SANCTIONING_USTA` is
refused as `policyDefinitions`, and attaches as `{ sanctioning: POLICY_SANCTIONING_USTA }`:

```js
const result = mocksGovernor.generateTournamentRecord({ policyDefinitions: { draws: {} } });
// result.error -> INVALID_VALUES (a policy with no values)
// result.context.option -> 'policyDefinitions.draws'
```

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

### All or Nothing

A refusal leaves the record exactly as it was passed: the same objects, with the same contents, and a
`uuids` pool you passed is consumed only when the call succeeds. So a corrected call can simply be made
again on the same record.

To keep what was written before a refusal instead, pass `keepPartial: true`. The error result then
reports what the record gained as `retained`:

```js
const result = mocksGovernor.modifyTournamentRecord({
  tournamentRecord,
  drawProfiles: [{ drawSize: 4 }, { drawSize: 4, drawType: 'NOT_A_DRAW_TYPE' }],
  keepPartial: true,
});
// result.error -> UNRECOGNIZED_DRAW_TYPE
// result.retained -> { participantIds: [...], eventIds: [...], drawIds: [...], venueIds: [] }
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
      venues: [/* ... */],
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

## completeDrawMatchUps

Complete matchUps within a draw, with optional filters for targeting specific stages and rounds.

### Complete All MatchUps

```js
const {
  drawIds: [drawId],
  tournamentRecord,
} = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 16 }],
});

const event = tournamentRecord.events[0];
const drawDefinition = event.drawDefinitions[0];

const result = mocksEngine.completeDrawMatchUps({
  tournamentRecord,
  drawDefinition,
  event,
  completeAllMatchUps: '6-3 6-4', // score string or `true` for random scores
});

console.log(result.completedCount); // 15
console.log(result.remainingCount); // 0: nothing left to play (BYEs and double exits are settled)
```

### Stage Filter

Complete only matchUps within a specific stage (`MAIN`, `CONSOLATION`, `QUALIFYING`):

```js
mocksEngine.completeDrawMatchUps({
  tournamentRecord,
  drawDefinition,
  event,
  stage: 'MAIN',
  completeAllMatchUps: '6-1 6-1',
});
```

### Round Filter

Complete only matchUps in a specific round:

```js
mocksEngine.completeDrawMatchUps({
  tournamentRecord,
  drawDefinition,
  event,
  roundNumber: 1,
  completeAllMatchUps: '6-3 6-4',
});
```

### Structure Filter

Complete only the matchUps of named structures. Omitted, every structure is completed.

```js
mocksEngine.completeDrawMatchUps({
  tournamentRecord,
  drawDefinition,
  event,
  structureIds: [eastStructureId],
  completeAllMatchUps: true,
});
```

For a round robin, the **container's** `structureId` completes every group, and a **group's** (child)
`structureId` completes that group only; its siblings are left exactly as they were. A matchUp ended
as `DOUBLE_WALKOVER` or `DOUBLE_DEFAULT` is never overwritten. An unknown id matches nothing.

### Combined Filters

Filters can be combined for precise targeting:

```js
// Complete only round 1 of the MAIN stage
mocksEngine.completeDrawMatchUps({
  tournamentRecord,
  drawDefinition,
  event,
  stage: 'MAIN',
  roundNumber: 1,
  completeAllMatchUps: '6-3 6-4',
});
```

### Complete Options

| Parameter              | Type              | Description                                                                         |
| ---------------------- | ----------------- | ----------------------------------------------------------------------------------- |
| `tournamentRecord`     | object            | **Required** — tournament record                                                    |
| `drawDefinition`       | object            | **Required** — draw definition (direct reference from tournamentRecord, not a copy) |
| `event`                | object            | Event containing the draw                                                           |
| `completeAllMatchUps`  | boolean \| string | `true` for random scores, or a score string like `'6-3 6-4'`                        |
| `completionGoal`       | number            | Stop after completing this many matchUps                                            |
| `stage`                | string            | Filter: only complete matchUps in this stage                                        |
| `stageSequence`        | number            | Filter: for multi-sequence qualifying                                               |
| `roundNumber`          | number            | Filter: only complete matchUps in this round                                        |
| `structureIds`         | string[]          | Filter: only these structures; a round-robin group id selects that group only       |
| `randomWinningSide`    | boolean           | Randomize winning side                                                              |
| `matchUpStatusProfile` | object            | Status distribution (see [Outcome Generation](../testing/mocks-engine-outcomes.md)) |

**Note:** The `drawDefinition` must be a direct reference from `tournamentRecord.events[n].drawDefinitions[n]`, not a copy returned by engine query methods like `getEvent()`.

---

## removeMatchUpOutcome

Remove a matchUp outcome, resetting it to `TO_BE_PLAYED`. This is a convenience wrapper that calls `setMatchUpStatus` with the `toBePlayed` fixture.

### Remove Basic Usage

```js
const result = mocksEngine.removeMatchUpOutcome({
  tournamentRecord,
  drawId,
  matchUpId,
});

expect(result.success).toBe(true);
```

### Remove Complete Options

```js
mocksEngine.removeMatchUpOutcome({
  tournamentRecord, // Required — tournament record
  drawId, // Required (unless drawDefinition provided) — resolves drawDefinition
  matchUpId, // Required — matchUp to reset
  drawDefinition, // Optional — direct reference (resolved from drawId if omitted)
  event, // Optional — resolved from drawId if omitted
});
```

### Remove Purpose

- **Score reversal testing** — triggers `removeDirectedParticipants` and consolation cleanup paths
- **Test setup** — remove outcomes to create partially-completed draws
- **Self-documenting** — clearer intent than manually constructing `toBePlayed` outcome objects

### Example: Partial Reset

```js
const {
  drawIds: [drawId],
  tournamentRecord,
} = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 4 }],
  completeAllMatchUps: true,
});

// Remove final, then semi-final
const matchUps = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps;

mocksEngine.removeMatchUpOutcome({
  tournamentRecord,
  drawId,
  matchUpId: finalMatchUpId,
});

mocksEngine.removeMatchUpOutcome({
  tournamentRecord,
  drawId,
  matchUpId: semiMatchUpId,
});
```

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
