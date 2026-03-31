---
title: Getting Started with mocksEngine
---

# Getting Started with mocksEngine

This guide will help you start using the mocksEngine to generate test data quickly and efficiently.

## Installation

The mocksEngine is included in the `tods-competition-factory` package:

```bash
npm install tods-competition-factory
```

## Basic Import

```js
import { mocksEngine } from 'tods-competition-factory';
// or
import mocksEngine from 'tods-competition-factory/mocksEngine';
```

## Your First Tournament

The simplest way to generate a tournament:

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord();
```

This creates a tournament with:

- **32 participants** (default)
- **No draws** (just participants)
- **Start and end dates**
- **Unique tournament ID**

### Inspecting the Result

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord();

console.log(tournamentRecord);
/*
{
  tournamentId: '...',
  tournamentName: 'Generated Tournament',
  startDate: '...',
  endDate: '...',
  participants: [...],  // 32 INDIVIDUAL participants
  isMock: true
}
*/
```

## Adding a Draw

To create a tournament with a draw structure:

```js
const { tournamentRecord, drawIds, eventIds } = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 16 }],
});
```

This creates:

- A **singles event** (default)
- A **single elimination draw** with 16 positions)
- **16 participants** entered in the draw
- All **matchUps** ready to be scheduled/completed

### Working with the Generated Draw

```js
import tournamentEngine from 'tods-competition-factory';

const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 16 }],
});

// Load into tournamentEngine
tournamentEngine.setState(tournamentRecord);

// Get all matchUps
const { matchUps } = tournamentEngine.allTournamentMatchUps();
console.log(`Generated ${matchUps.length} matchUps`); // 15 matchUps for 16-draw SE
```

### Convenience: Auto-Loading with setState

You can automatically load the tournament into the engine during generation:

```js
const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 16 }],
  setState: true, // Automatically calls tournamentEngine.setState(tournamentRecord)
});

// Tournament is already loaded - can immediately use engine methods
const { matchUps } = tournamentEngine.allTournamentMatchUps();
console.log(`Generated ${matchUps.length} matchUps`);
```

This is equivalent to:

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 16 }],
});
tournamentEngine.setState(tournamentRecord);
```

## Multiple Draws

Generate a tournament with multiple draws:

```js
const { tournamentRecord, drawIds, eventIds } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    { drawSize: 32, eventType: 'SINGLES' },
    { drawSize: 16, eventType: 'DOUBLES' },
  ],
});

console.log(`Generated ${eventIds.length} events`); // 2
console.log(`Generated ${drawIds.length} draws`); // 2
```

Each draw creates a separate event with appropriate participants.

## Specifying Participants

Control the number and type of participants:

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  participantsProfile: {
    participantsCount: 100,
    sex: 'FEMALE',
  },
  drawProfiles: [{ drawSize: 32 }],
});
```

This creates:

- **100 FEMALE participants** in the tournament
- **32 entered** in the draw (with DIRECT_ACCEPTANCE)
- **68 remaining** as potential alternates or for other draws

## Adding Venues and Courts

Generate tournament infrastructure:

```js
const { tournamentRecord, venueIds } = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 16 }],
  venueProfiles: [
    {
      venueName: 'Main Stadium',
      courtsCount: 8,
    },
  ],
});
```

## Completing Matches

Generate a tournament with completed matches:

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
      ],
    },
  ],
});
```

Or complete all matches automatically:

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    {
      drawSize: 16,
    },
  ],
  completeAllMatchUps: true,
});
```

## Common Patterns

### Testing Specific Draw Types

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    {
      drawSize: 16,
      drawType: 'ROUND_ROBIN',
    },
  ],
});
```

### Testing with Prefixed IDs

For easier debugging and test readability:

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    {
      drawSize: 8,
      idPrefix: 'match', // matchUpIds will be match-1-1, match-1-2, etc.
    },
  ],
});
```

### Setting Tournament Dates

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  startDate: '2024-06-01',
  endDate: '2024-06-07',
  drawProfiles: [{ drawSize: 32 }],
});
```

## Understanding MatchUp Hydration

When retrieving matchUps from the engine, you can control how much data is included using the `inContext` parameter.

### Basic MatchUp Data

Without context, matchUps contain only the core data structure:

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 16 }],
  setState: true,
});

// Get basic matchUps (not hydrated)
const { matchUps } = tournamentEngine.allTournamentMatchUps();

console.log(matchUps[0]);
// Contains: matchUpId, roundNumber, sides with participantIds, etc.
// Missing: event details, draw context, participant details, etc.
```

### Fully Hydrated MatchUps with inContext

When you specify `inContext: true`, matchUps are **fully hydrated** with contextualized data:

```js
const { matchUps } = tournamentEngine.allTournamentMatchUps({
  inContext: true, // Returns fully hydrated matchUps
});

console.log(matchUps[0]);
/*
Now includes:
- eventName, eventType, gender, category
- drawName, drawType, stage
- structureName, roundName
- venueAbbreviation, courtName
- participant objects with full details (not just IDs)
- potentialParticipants for future rounds
- schedule conflicts and warnings
- And much more contextual information
*/
```

### When to Use inContext

Use `inContext: true` when you need:

- **Full participant details** (names, rankings, demographics)
- **Event and draw context** (event names, draw types, stages)
- **Scheduling information** (venue names, court details)
- **Conflict detection** (requires participant context)
- **Display or reporting** (need full details for UI)

### Common Pattern: Context for Scheduling

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 16 }],
  venueProfiles: [{ courtsCount: 4 }],
  setState: true,
});

// Get hydrated matchUps for scheduling (requires context)
const { matchUps } = tournamentEngine.allCompetitionMatchUps({
  inContext: true, // Fully hydrated
  nextMatchUps: true, // Include dependency information
});

// Now can use proAutoSchedule which needs participant context
const result = tournamentEngine.proAutoSchedule({
  scheduledDate: '2024-06-01',
  matchUps,
});
```

## Integration with Test Frameworks

### Vitest Example

```js
import { mocksEngine } from 'tods-competition-factory';
import tournamentEngine from 'tods-competition-factory';
import { expect, it, describe } from 'vitest';

describe('Competition Management', () => {
  it('can schedule a match', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 16 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const matchUp = matchUps[0];

    const result = tournamentEngine.addMatchUpScheduleItems({
      matchUpId: matchUp.matchUpId,
      drawId: matchUp.drawId,
      schedule: { scheduledDate: '2024-06-01' },
    });

    expect(result.success).toBe(true);
  });
});
```

## devContext Mode

Enable detailed error reporting during testing:

```js
mocksEngine.devContext(true).generateTournamentRecord({
  drawProfiles: [{ drawSize: 16 }],
});
```

This provides more detailed error messages and validation during generation.

## Common Use Cases

### 1. Testing Draw Generation Logic

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    {
      drawSize: 32,
      drawType: 'COMPASS',
      seedsCount: 8,
    },
  ],
});
```

### 2. Testing Scheduling Logic

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 16 }],
  venueProfiles: [{ courtsCount: 4 }],
});

tournamentEngine.setState(tournamentRecord);

// Test auto-scheduling
const { matchUps } = tournamentEngine.allCompetitionMatchUps({
  inContext: true,
  nextMatchUps: true,
});

const result = tournamentEngine.proAutoSchedule({
  scheduledDate: '2024-06-01',
  matchUps,
});
```

### 3. Testing Scoring Logic

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    {
      drawSize: 8,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 1,
          matchUpStatus: 'RETIRED',
          winningSide: 1,
        },
      ],
    },
  ],
});
```

## Deterministic Generation with nonRandom

Pass a numeric `nonRandom` value to seed a deterministic PRNG that replaces all random decisions during generation. The same seed always produces identical results; different seeds produce different but equally reproducible results.

```js
// Same seed always produces identical tournament
const result1 = mocksEngine.generateTournamentRecord({
  nonRandom: 42,
  drawProfiles: [{ drawSize: 16 }],
});
const result2 = mocksEngine.generateTournamentRecord({
  nonRandom: 42,
  drawProfiles: [{ drawSize: 16 }],
});
// result1 and result2 have identical participants, draw positions, and structure
```

This is especially useful for snapshot testing and debugging — see [Deterministic Generation](./mocks-engine-tournament-generation.md#deterministic-generation) for full details.

## Next Steps

- **[Tournament Generation](./mocks-engine-tournament-generation.md)** - Learn about all tournament generation options
- **[Participant Generation](./mocks-engine-participants.md)** - Create participants
- **[Outcome Generation](./mocks-engine-outcomes.md)** - Generate various match outcomes
- **[Advanced Patterns](./mocks-engine-patterns.md)** - Best practices and testing patterns

## Tips

1. **Start simple**: Begin with basic tournaments and add complexity as needed
2. **Use prefixes**: Add `idPrefix` to make debugging easier
3. **Generate once**: Create reusable tournament structures in test setup
4. **Combine approaches**: Use generation for structure, manual setup for specific scenarios
5. **Leverage defaults**: Many parameters have sensible defaults - only override what you need
