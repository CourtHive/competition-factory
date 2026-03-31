---
title: mocksEngine Overview
---

# mocksEngine Overview

The **mocksEngine** is a powerful testing utility within the Competition Factory that generates realistic tournament data, participants, match outcomes, and complete tournament scenarios. It's designed to make testing comprehensive, repeatable, and efficient.

## Why mocksEngine?

Testing tennis tournament software requires complex data structures representing:

- Tournaments with multiple events
- Singles, doubles, and team competitions
- Draw structures (elimination, round robin, compass, etc.)
- Singles, Doubles and Team participants
- Match outcomes with valid scoring
- Venue and court scheduling
- Entry statuses, seedings, and rankings

Creating this data manually for each test is time-consuming and error-prone. The mocksEngine automates this process, allowing you to:

- **Generate complete tournaments instantly** with customizable parameters
- **Create consistent test data** across your test suite
- **Test edge cases easily** by generating specific scenarios
- **Maintain test readability** by removing boilerplate setup code
- **Ensure data validity** with built-in [CODES](/docs/data-standards#codes) schema compliance

## Key Capabilities

- **Deterministic Generation** — Use `nonRandom` seed for reproducible tournaments (same participants, draw positions, and scores every time)

### 1. Tournament Generation

Generate complete tournament records with events, draws, participants, and venues:

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 32 }],
  venueProfiles: [{ courtsCount: 8 }],
});
```

### 2. Participant Generation

Create participants with sex, rankings, and pairings:

```js
const { participants } = mocksEngine.generateParticipants({
  participantsCount: 64,
  participantType: 'INDIVIDUAL',
  sex: 'FEMALE',
});
```

### 3. Outcome Generation

Generate match outcomes with realistic scores:

```js
const { outcome } = mocksEngine.generateOutcome({
  matchUpFormat: 'SET3-S:6/TB7',
  winningSide: 1,
});
```

### 4. Scenario Completion

Complete specific matches or entire draws with outcomes:

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    {
      drawSize: 16,
      completeAllMatchUps: true,
    },
  ],
});
```

## Integration with Factory Engines

The mocksEngine works seamlessly with other factory engines:

```js
import { mocksEngine } from 'tods-competition-factory';
import tournamentEngine from 'tods-competition-factory';

// Generate tournament
const { tournamentRecord } = mocksEngine.generateTournamentRecord();

// Load into tournamentEngine for manipulation
tournamentEngine.setState(tournamentRecord);

// Now use tournamentEngine methods
const { matchUps } = tournamentEngine.allTournamentMatchUps();
```

### Convenience Features

**Auto-loading with `setState: true`:**

```js
// Automatically load into engine
mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 16 }],
  setState: true, // No need to call setState manually
});

// Tournament is already loaded
const { matchUps } = tournamentEngine.allTournamentMatchUps();
```

**Fully hydrated matchUps with `inContext: true`:**

```js
// Get matchUps with full participant details, event context, and more
const { matchUps } = tournamentEngine.allTournamentMatchUps({
  inContext: true, // Returns fully hydrated matchUps
});

// Now includes participant names, event details, venue info, etc.
console.log(matchUps[0].sides[0].participant.participantName);
console.log(matchUps[0].eventName);
console.log(matchUps[0].drawName);
```

## Test Coverage

The mocksEngine is extensively used across the factory's test suite, covering:

- **Extensive draw types** (Single Elimination, Round Robin, Compass, Feed-in, etc.)
- **All event types** (Singles, Doubles, Team)
- **Complex scenarios** (flights, qualifying, playoffs, consolations)
- **Scheduling logic** (court assignments, time slots, conflicts)
- **Scoring variations** (complex scenarios including timed and tiebreak sets)

## Quick Example

Here's a complete test scenario demonstrating mocksEngine power:

```js
import { mocksEngine } from 'tods-competition-factory';
import tournamentEngine from 'tods-competition-factory';
import { expect, test } from 'vitest';

test('generate and manipulate tournament', () => {
  // Generate tournament with singles and doubles draws
  const { tournamentRecord, eventIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawSize: 32, eventType: 'SINGLES' },
      { drawSize: 16, eventType: 'DOUBLES' },
    ],
    venueProfiles: [{ courtsCount: 6 }],
  });

  // Load into engine
  tournamentEngine.setState(tournamentRecord);

  // Get all matchUps
  const { matchUps } = tournamentEngine.allTournamentMatchUps();

  // Verify structure
  expect(eventIds).toHaveLength(2);
  expect(matchUps.length).toBeGreaterThan(0);

  // Schedule a match
  const matchUp = matchUps[0];
  tournamentEngine.addMatchUpScheduleItems({
    matchUpId: matchUp.matchUpId,
    drawId: matchUp.drawId,
    schedule: { scheduledDate: '2024-01-15' },
  });

  // Complete with outcome
  const { outcome } = mocksEngine.generateOutcome({
    matchUpFormat: matchUp.matchUpFormat,
  });

  tournamentEngine.setMatchUpStatus({
    matchUpId: matchUp.matchUpId,
    drawId: matchUp.drawId,
    outcome,
  });

  // Verify completion
  const result = tournamentEngine.tournamentMatchUps();
  expect(result.completedMatchUps.length).toEqual(1);
});
```

## Documentation Structure

This mocksEngine documentation is organized into the following sections:

- **[Getting Started](./mocks-engine-getting-started.md)** - Basic usage and simple examples
- **[Tournament Generation](./mocks-engine-tournament-generation.md)** - Complete tournament creation
- **[Participant Generation](./mocks-engine-participants.md)** - Individual, pair and team participants
- **[Outcome Generation](./mocks-engine-outcomes.md)** - Generating match results and scores
- **[Advanced Patterns](./mocks-engine-patterns.md)** - Common testing patterns and techniques

## Next Steps

Continue to [Getting Started](./mocks-engine-getting-started.md) to begin using the mocksEngine in your tests.
