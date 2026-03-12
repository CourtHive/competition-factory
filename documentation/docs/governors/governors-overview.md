---
title: Governors Overview
---

## What Are Governors?

**Governors** are functional modules that organize the Competition Factory's operations into logical domains of responsibility. Each governor provides a collection of related methods for working with tournament data - from generating draws and scheduling matchUps to querying results and publishing information.

### Why Governors Exist

The governor architecture provides:

**Separation of Concerns**: Related functionality grouped together (e.g., all scheduling methods in Schedule Governor)

**Modular Imports**: Import only the governors needed for specific use cases

**Clear API Organization**: Easy discovery of methods by functional area

**Custom Engine Construction**: Build engines with only required governors ([Custom Engines](/docs/engines/custom-engines))

**Maintainability**: Isolated functional areas simplify testing and updates

### Governors vs Engines

**Governors** are collections of methods organized by domain (scheduling, publishing, scoring, etc.).

**[Engines](/docs/engines/state-engines)** are stateful wrappers around governors that:

- Manage tournament record state
- Handle subscriptions and notifications
- Provide middleware hooks
- Execute governor methods against managed state

```js
import { tournamentEngine } from 'tods-competition-factory';
import { scheduleGovernor, publishingGovernor } from 'tods-competition-factory';

// Engine approach (stateful, convenient)
tournamentEngine.setState(tournamentRecord);
tournamentEngine.scheduleMatchUps({ scheduleDate, matchUpIds });

// Governor approach (stateless, functional)
scheduleGovernor.scheduleMatchUps({
  tournamentRecord,
  scheduleDate,
  matchUpIds,
});
```

**Most applications use engines** for convenience. Governors are used for custom engines or specialized processing.

---

## Governor Categories

The Competition Factory includes 16 governors organized into functional areas:

### Tournament Operations

**[Tournament Governor](./tournament-governor)** - Tournament-level operations

- Create, modify, and delete tournaments
- Tournament metadata and properties
- Tournament-level extensions and time items
- Tournament validation

**[Competition Governor](./competition-governor)** - Multi-tournament operations

- Work across multiple tournaments
- Competition-wide participant management
- Cross-tournament queries and reports
- Aggregate statistics

### Draw Management

**[Generation Governor](./generation-governor)** - Draw and structure generation

- Create elimination, round robin, and compass draws
- Generate playoff structures
- Feed-in consolation structures
- Automated structure configuration

**[Draws Governor](./draws-governor)** - Draw manipulation and modification

- Modify existing draw structures
- Add/remove participants from draws
- Position swaps and manual adjustments
- Draw validation and integrity checks

### Event Management

**[Event Governor](./event-governor)** - Event lifecycle and draw definitions

- Create and configure events
- Add/remove draw definitions
- Event extensions and display settings
- Event deletion and archival

**[Entries Governor](./entries-governor)** - Entry management

- Add/remove event entries
- Entry status management (direct acceptance, qualifier, wildcard)
- Alternate and lucky loser handling
- Entry validation

### Participant Operations

**[Participant Governor](./participant-governor)** - Participant lifecycle

- Add individual participants, pairs, teams
- Modify participant information
- Scale items (rankings, ratings, seeding)
- Participant extensions and representatives

### Rankings & Ratings

**[Ranking Governor](./ranking-governor)** - Ranking points and aggregation

- Compute tournament ranking points from [ranking policies](/docs/policies/rankingPolicy)
- Quality win bonus calculation
- Multi-tournament ranking list generation
- Persist ranking points to participant records
- Per-participant point breakdowns
- Composed into the [Scale Engine](/docs/scale-engine/scale-engine-overview)

### MatchUp Management

**[MatchUp Governor](./matchup-governor)** - MatchUp operations

- Advance participants through draws
- Set matchUp outcomes and scores
- MatchUp status management
- Walkover, retirement, default handling

**[Score Governor](./score-governor)** - Score validation and manipulation

- Parse and validate score strings
- Generate score strings from score objects
- Check set completion
- Score analysis and statistics

**[MatchUp Format Governor](./matchup-format-governor)** - Format handling

- Parse matchUp format codes
- Stringify matchUp format objects
- Validate format configurations
- Format comparison and analysis

### Scheduling

**[Schedule Governor](./schedule-governor)** - Scheduling operations

- Manual schedule assignment (date, time, venue, court)
- Automated scheduling (Garman formula, grid scheduling)
- Bulk scheduling operations
- Schedule clearing and modifications

**[Venue Governor](./venue-governor)** - Venue and court management

- Create and modify venues
- Add/remove courts
- Court availability and bookings
- Venue extensions and metadata

### Publishing & Queries

**[Publishing Governor](./publishing-governor)** - Publish state management

- Publish/unpublish events and draws
- Publish order of play
- Publish seeding and participants
- Granular visibility control (stages, structures, rounds)

**[Query Governor](./query-governor)** - Data retrieval

- Get tournament matchUps
- Competition schedule queries
- Event data for visualization
- Participant queries with filtering

**[Report Governor](./report-governor)** - Reporting and analytics

- Participation reports
- Draw reports
- Scheduling reports
- Statistical analysis

### Configuration

**[Policy Governor](./policy-governor)** - Policy management

- Attach policies to tournaments, events, draws
- Remove policies
- Policy validation
- Policy inheritance

### Testing & Utilities

**[Mocks Governor](./mocks-governor)** - Test data generation

- Generate complete tournament records
- Create participants with realistic data
- Generate matchUp outcomes
- Modify existing tournaments for testing

---

## Common Use Cases by Governor

### Create a Tournament

**Use**: [Tournament Governor](./tournament-governor) + [Generation Governor](./generation-governor)

```js
// Create tournament
const tournament = tournamentEngine.newTournamentRecord({ ... });

// Add participants
tournamentEngine.addParticipants({ participants });

// Generate draw
tournamentEngine.generateDrawDefinition({
  eventId,
  drawSize: 32,
  seedsCount: 8
});
```

#### Schedule MatchUps

**Use**: [Venue Governor](./venue-governor) + [Schedule Governor](./schedule-governor)

```js
// Setup venues
tournamentEngine.addVenue({ venue });
tournamentEngine.addCourt({ venueId, court });

// Define availability
tournamentEngine.modifyCourt({
  courtId,
  modifications: { dateAvailability: [...] }
});

// Schedule
tournamentEngine.scheduleMatchUps({
  scheduleDate: '2024-06-15',
  matchUpIds
});
```

#### Record Scores and Advance Participants

**Use**: [MatchUp Governor](./matchup-governor) + [Score Governor](./score-governor)

```js
// Set outcome
tournamentEngine.setMatchUpStatus({
  matchUpId,
  drawId,
  outcome: {
    winningSide: 1,
    score: {
      sets: [
        { side1Score: 6, side2Score: 4, winningSide: 1 },
        { side1Score: 6, side2Score: 2, winningSide: 1 },
      ],
    },
  },
});
```

#### Publish Draws and Schedules

**Use**: [Publishing Governor](./publishing-governor)

```js
// Publish event
tournamentEngine.publishEvent({ eventId });

// Publish order of play
tournamentEngine.publishOrderOfPlay({
  scheduledDates: ['2024-06-15'],
});

// Publish seeding
tournamentEngine.publishEventSeeding({ eventId });
```

#### Query Tournament Data

**Use**: [Query Governor](./query-governor)

```js
// Get event data for display
const { eventData } = tournamentEngine.getEventData({
  eventId,
  usePublishState: true,
});

// Get competition schedule
const { dateMatchUps } = tournamentEngine.competitionScheduleMatchUps({
  usePublishState: true,
});

// Get all matchUps
const { matchUps } = tournamentEngine.allTournamentMatchUps();
```

#### Apply Policies

**Use**: [Policy Governor](./policy-governor)

```js
import { policyConstants } from 'tods-competition-factory';

// Attach scheduling policy
tournamentEngine.attachPolicy({
  policyType: policyConstants.POLICY_TYPE_SCHEDULING,
  policyDefinition: { ... }
});

// Attach seeding policy
tournamentEngine.attachPolicy({
  eventId,
  policyType: policyConstants.POLICY_TYPE_SEEDING,
  policyDefinition: { ... }
});
```

---

## Governor Method Patterns

### Common Parameters

Most governor methods accept:

**Identifiers**:

- `tournamentId` - Tournament identifier
- `eventId` - Event identifier
- `drawId` - Draw definition identifier
- `matchUpId` - MatchUp identifier
- `structureId` - Structure identifier
- `participantId` - Participant identifier

**Flags**:

- `inContext` - Add contextual information to results
- `usePublishState` - Filter by publish state
- `disableNotice` - Suppress notifications
- `dryRun` - Preview without making changes

**Options**:

- `policyDefinitions` - Apply policy configurations
- `removePriorValues` - Clear previous time items
- `returnParticipants` - Include participant data in results

### Return Value Patterns

Governor methods typically return:

```js
{
  success: boolean,     // Operation succeeded
  info: string,         // Informational messages
  error: ErrorObject,   // Error details if failed
  ...results            // Method-specific data
}
```

**Error Handling**:

```js
const result = tournamentEngine.someMethod({ ... });

if (result.error) {
  console.error(result.error.message);
  console.error(result.error.stack);
}
```

### Notifications and Subscriptions

Many governor methods trigger subscription notifications:

```js
import { topicConstants } from 'tods-competition-factory';

tournamentEngine.devContext({
  subscriptions: {
    [topicConstants.PUBLISH_EVENT]: (payload) => {
      // React to event publication
    },
    [topicConstants.MODIFY_MATCHUP]: (payload) => {
      // React to matchUp changes
    },
  },
});
```

**See**: [Subscriptions](/docs/engines/subscriptions) for complete topic list.

---

## Importing Governors

### Import All Governors

```js
import { governors } from 'tods-competition-factory';

const {
  competitionGovernor,
  drawsGovernor,
  entriesGovernor,
  eventGovernor,
  generationGovernor,
  matchUpFormatGovernor,
  matchUpGovernor,
  mocksGovernor,
  participantGovernor,
  policyGovernor,
  publishingGovernor,
  queryGovernor,
  reportGovernor,
  scheduleGovernor,
  scoreGovernor,
  tournamentGovernor,
  venueGovernor,
} = governors;
```

### Import Individual Governors

```js
import { scheduleGovernor, publishingGovernor, matchUpGovernor } from 'tods-competition-factory';
```

### Use in Custom Engines

```js
import { defineEngine } from 'tods-competition-factory';
import {
  tournamentGovernor,
  matchUpGovernor,
  scheduleGovernor
} from 'tods-competition-factory';

const myEngine = defineEngine({
  governors: [
    tournamentGovernor,
    matchUpGovernor,
    scheduleGovernor
  ]
});

myEngine.setState(tournamentRecord);
myEngine.scheduleMatchUps({ ... });
```

**See**: [Custom Engines](/docs/engines/custom-engines) for detailed examples.

---

## Governor Reference

### Competition Management

| Governor                                       | Purpose                            | Key Methods                                                          |
| ---------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------- |
| [Tournament Governor](./tournament-governor)   | Tournament creation and management | `newTournamentRecord`, `setTournamentName`, `addTournamentExtension` |
| [Competition Governor](./competition-governor) | Multi-tournament operations        | `getCompetitionParticipants`, `getCompetitionMatchUps`               |
| [Event Governor](./event-governor)             | Event lifecycle                    | `addEvent`, `deleteDrawDefinitions`, `setEventDisplay`               |
| [Entries Governor](./entries-governor)         | Entry management                   | `addEventEntries`, `removeEventEntries`, `setEntryStatus`            |

### Draw Operations

| Governor                                     | Purpose           | Key Methods                                                                               |
| -------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------- |
| [Generation Governor](./generation-governor) | Draw generation   | `generateDrawDefinition`, `generateQualifyingDrawDefinition`, `generatePlayoffStructures` |
| [Draws Governor](./draws-governor)           | Draw modification | `modifyDrawDefinition`, `addDrawDefinitionExtension`, `swapDrawPositions`                 |

### Participant Management

| Governor                                       | Purpose                | Key Methods                                                       |
| ---------------------------------------------- | ---------------------- | ----------------------------------------------------------------- |
| [Participant Governor](./participant-governor) | Participant operations | `addParticipants`, `modifyParticipant`, `setParticipantScaleItem` |

### MatchUp Operations

| Governor                                             | Purpose            | Key Methods                                                     |
| ---------------------------------------------------- | ------------------ | --------------------------------------------------------------- |
| [MatchUp Governor](./matchup-governor)               | MatchUp management | `setMatchUpStatus`, `setMatchUpScore`, `advanceParticipants`    |
| [Score Governor](./score-governor)                   | Score handling     | `parseScoreString`, `generateScoreString`, `checkSetIsComplete` |
| [MatchUp Format Governor](./matchup-format-governor) | Format handling    | `parseMatchUpFormat`, `stringifyMatchUpFormat`                  |

### Scheduling & Venues

| Governor                                 | Purpose               | Key Methods                                                                   |
| ---------------------------------------- | --------------------- | ----------------------------------------------------------------------------- |
| [Schedule Governor](./schedule-governor) | Scheduling operations | `scheduleMatchUps`, `scheduleProfileRounds`, `bulkScheduleTournamentMatchUps` |
| [Venue Governor](./venue-governor)       | Venue management      | `addVenue`, `addCourt`, `modifyCourt`                                         |

### Publishing & Query Reference

| Governor                                     | Purpose        | Key Methods                                                            |
| -------------------------------------------- | -------------- | ---------------------------------------------------------------------- |
| [Publishing Governor](./publishing-governor) | Publish state  | `publishEvent`, `publishOrderOfPlay`, `publishEventSeeding`            |
| [Query Governor](./query-governor)           | Data retrieval | `getEventData`, `competitionScheduleMatchUps`, `allTournamentMatchUps` |
| [Report Governor](./report-governor)         | Reporting      | `participationReport`, `drawReport`, `scheduleReport`                  |

### Configuration Reference

| Governor                             | Purpose           | Key Methods                                          |
| ------------------------------------ | ----------------- | ---------------------------------------------------- |
| [Policy Governor](./policy-governor) | Policy management | `attachPolicy`, `removePolicy`, `getAppliedPolicies` |

### Testing

| Governor                           | Purpose              | Key Methods                                                              |
| ---------------------------------- | -------------------- | ------------------------------------------------------------------------ |
| [Mocks Governor](./mocks-governor) | Test data generation | `generateTournamentRecord`, `generateOutcomes`, `modifyTournamentRecord` |

---

## Best Practices

### Use Engines for Application Code

Engines provide state management and subscriptions. Use them unless you need fine-grained control:

```js
// ✓ GOOD - Use engine for application code
import { tournamentEngine } from 'tods-competition-factory';

tournamentEngine.setState(tournamentRecord);
tournamentEngine.publishEvent({ eventId });
```

### Use Governors for Custom Processing

Use governors directly when building custom engines or specialized processors:

```js
// ✓ GOOD - Use governors for custom processing
import { publishingGovernor, queryGovernor } from 'tods-competition-factory';

function customPublisher(tournamentRecord, eventId) {
  const { eventData } = queryGovernor.getEventData({
    tournamentRecord,
    eventId,
  });

  return publishingGovernor.publishEvent({
    tournamentRecord,
    eventId,
    customParam: 'value',
  });
}
```

### Check Return Values

Always check for errors:

```js
const result = tournamentEngine.setMatchUpStatus({ ... });

if (result.error) {
  console.error('Failed:', result.error.message);
  return;
}

// Proceed with success case
console.log('Success:', result.matchUp);
```

### Use Subscriptions for Side Effects

React to changes via subscriptions rather than polling:

```js
tournamentEngine.devContext({
  subscriptions: {
    [topicConstants.MODIFY_MATCHUP]: (payload) => {
      // Update UI, sync to database, etc.
      updateDisplay(payload.matchUp);
    },
  },
});
```

---

## Related Documentation

- **[State Engines](/docs/engines/state-engines)** - Engine architecture and usage
- **[Custom Engines](/docs/engines/custom-engines)** - Building custom engines with governors
- **[Subscriptions](/docs/engines/subscriptions)** - Notification system
- **[Policies](../concepts/policies)** - Policy system overview
- **[Publishing](../concepts/publishing/publishing-overview)** - Publishing workflows
