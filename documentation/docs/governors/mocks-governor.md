---
title: Mocks Governor
---

The **Mocks Governor** provides methods for anonymizing and modifying tournament records, and for synthesising tournaments and participants. Methods that play out or set up a real draw (`completeDrawMatchUps`, `generateOutcome`, `generateOutcomeFromScoreString`) have moved to the [Simulation Governor](./simulation-governor.md). For generating tournaments, participants, and outcomes, see the comprehensive [mocksEngine documentation](../testing/mocks-engine-overview.md).

## anonymizeTournamentRecord

Replaces the personal and identifying data in a tournament record with generated data. The structure, results and schedule stay as they were.

**The record is rewritten in place.** It is also returned as `tournamentRecord`. To keep the original, pass a copy, for example `structuredClone(tournamentRecord)`. Never run it through a stateful engine or an `executionQueue` against a live record, because it would anonymize the record that engine holds.

### Anonymization Purpose

- **Privacy compliance**: remove personal data before sharing tournament data
- **Test data creation**: build realistic test data from production tournaments
- **Debugging**: share a production record for a support investigation

### Anonymization Basic Usage

```js
const { tournamentRecord: anonymized } = mocksGovernor.anonymizeTournamentRecord({
  tournamentRecord: structuredClone(original), // the copy is rewritten; `original` is untouched
});
```

### Anonymization Complete Options

```js
const result = mocksGovernor.anonymizeTournamentRecord({
  tournamentRecord, // required: rewritten in place and returned as result.tournamentRecord

  tournamentId, // optional: the new tournamentId (default: generated)
  tournamentName, // optional: the new name (default: 'Anonymized: <date>')
  parentOrganisation, // optional: a mock organisation to attach (default: parentOrganisation is removed)

  personIds: [], // optional: used in order for the replacement persons of INDIVIDUAL participants

  keepExtensions: [], // optional: extension names to keep beside the internal ones; true keeps every extension
  anonymizeParticipantNames: true, // optional: false keeps participant and person names

  random, // optional: the source for every generated id, name and address
});
```

Through `mocksEngine`, `nonRandom: <seed>` supplies `random`. Two runs with the same seed on the same record produce the same result, apart from `createdAt`.

### What Gets Replaced

**Ids.** Every id the record defines gets a new value: the tournament, participants, persons, events, draws, structures (nested ones too), matchUps (including tieMatchUps and tournament-level `matchUps`), venues (including `subVenues`) and courts. Every reference to one of these ids is remapped as well, at any depth and in any field. That includes:

- entries, position and seed assignments, and lineUps
- structure links
- matchUp schedules and timeItems (court and venue assignments)
- scheduling and flight profiles
- `individualParticipantIds`
- presence logs
- extension values, including objects keyed by an id

`participant.personId` follows its replaced person.

**Names.** These are replaced with generated names:

- persons and individual participant names
- pair names, rebuilt from the members' new names
- team and group names
- event names (`Event <n> <category>`)
- venue names and abbreviations (`Venue #<n>`, `V<n>`)
- court names (`V<n>C<m>`)
- the tournament name

**Persons.** Each person is replaced by a generated person of the same sex. The new person keeps the original birth year and gets a generated address only if the original had one. Everything else on the original person is dropped: contacts, other names, external ids, `tennisId` and the rest.

### What Gets Cleared

- **Everywhere, at any depth**: `notes`, `contacts`, `onlineResources` and every `*OtherIds` attribute (`tournamentOtherIds`, `participantOtherIds`, `personOtherIds`, `venueOtherIds`, `eventOtherIds`, `drawOtherIds`)
- **Tournament**: `linkedTournamentIds`, `parentOrganisationId`, `parentOrganisation` (unless one is passed), `tournamentSeriesId`, `registrationProfile`, `formalName`, `promotionalName`, `cancellationReason`, `sanction`, `sanctions`
- **Venues**: `addresses`, `facilityId`, `parentOrganisationId`
- **Courts**: `latitude`, `longitude`
- **Events**: `tennisOfficialIds`, `registrationProfile`, `cancellationReason`, `sanction`
- **Participants**: `participantOtherName`, unless `anonymizeParticipantNames: false`
- **Presence logs**: the attester (`attributedTo`) and its `notes`
- **Extensions**: every non-internal extension unless it is named in `keepExtensions`. The `linkedTournamentsIds` and `mutationLocks` internal extensions are always dropped, because they name real tournaments and carry live lock tokens.

### What Is Retained By Design

- dates: tournament, event and draw dates, schedules and timeItem dates
- ratings and rankings stored in timeItems, and seedings
- scores, outcomes and matchUp statuses
- each person's birth year and sex, and each participant's `representing` country
- the tournament's `hostCountryCode`, `localTimeZone`, level, category and surface
- draw names and event abbreviations
- internal extensions (scheduling profile, flight profile, lineUps, tallies and so on), with their ids remapped
- ids that point outside the record, for example a `decidedByPersonId` naming a person who is not a participant. Only ids the record defines can be remapped.

An id is remapped only where it is the whole string. An id inside a longer string, such as a URL or a composite key, stays as it was. That is why free-text and web-address attributes are cleared rather than rewritten.

### Example: Anonymize a Record for Support

```js
tournamentEngine.setState(productionTournament);
const { tournamentRecord: live } = tournamentEngine.getTournament();

const { tournamentRecord: anonymized } = mocksGovernor.anonymizeTournamentRecord({
  tournamentRecord: structuredClone(live),
  tournamentName: 'Support case 1234',
});

console.log(anonymized.participants[0].person.standardFamilyName); // a generated name
```

### Example: Preserve Specific Extensions

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 16 }],
});

tournamentRecord.participants.forEach((participant) => {
  participant.extensions = [
    { name: 'level', value: 'advanced' },
    { name: 'club', value: 'Tennis Club A' },
  ];
});

mocksGovernor.anonymizeTournamentRecord({
  tournamentRecord,
  keepExtensions: ['level'], // 'level' is kept, 'club' is removed (internal extensions are kept)
});
```

### Example: Preserve Names but Replace Ids

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 8 }],
});

mocksGovernor.anonymizeTournamentRecord({
  tournamentRecord,
  anonymizeParticipantNames: false, // participant names and participantOtherName are kept
});
```

### Anonymization Notes

- **In place**: the record passed in is the record returned. Copy it first to keep the original.
- **Referential integrity**: every reference to an id the record defines resolves in the result, and the factory's integrity checks report the same findings as they did on the original.
- **Deterministic under a seed**: pass `random`, or `nonRandom` through `mocksEngine`.
- **Linear cost**: one pass assigns the new ids and one walk over the record remaps them.

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

**Deprecated here; removed from the mocks governor at 8.0.0.** Moved to the [Simulation Governor](./simulation-governor.md#generateoutcome); the engine method name is unchanged.

---

## generateOutcomeFromScoreString

**Deprecated here; removed from the mocks governor at 8.0.0.** Moved to the [Simulation Governor](./simulation-governor.md#generateoutcomefromscorestring); the engine method name is unchanged.

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
- A draw is completed in this order, whether its profile is a `drawProfile` or one of an `eventProfile`'s `drawProfiles`: its `completionGoal` (the first N matchUps), then its `outcomes`, then every matchUp left when `completeAllMatchUps` is set. A `completionGoal` wins over `completeAllMatchUps`: exactly N are completed
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

In `modifyTournamentRecord`, an eventProfile that targets an **existing** event attaches its `policyDefinitions` to
that event, before any new draws are generated. A policy type the event already holds is replaced, but only while
nothing has happened under it: once any of the event's matchUps has a result (a score, a winning side, a completed
status such as a walkover, or play in progress), replacing it would lose the record of the policy those results were
produced under, so the call is refused with `EXISTING_POLICY_TYPE` and the record is left unchanged. A policy type the
event does not hold yet is attached either way.

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

  // also return `methods`: the engine calls that make these modifications, replayable onto the record as passed
  // (see "The Method List" in the tournament generation guide)
  recordMethods: true,

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

**Deprecated here; removed from the mocks governor at 8.0.0.** Moved to the [Simulation Governor](./simulation-governor.md#completedrawmatchups); the engine method name is unchanged.

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
