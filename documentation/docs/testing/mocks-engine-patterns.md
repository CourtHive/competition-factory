---
title: Advanced Patterns & Best Practices
---

# Advanced Patterns & Best Practices

This guide covers common testing patterns, best practices, and advanced techniques for using the mocksEngine effectively.

## Test Organization

### Shared Tournament Setup

Create reusable tournament setups:

```js
import { mocksEngine } from 'tods-competition-factory';
import { describe, beforeEach, it, expect } from 'vitest';

describe('Tournament Scheduling', () => {
  beforeEach(() => {
    // Use setState: true for convenience - no need to call setState in each test
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 16 }],
      venueProfiles: [{ courtsCount: 4 }],
      setState: true, // Auto-loads into tournamentEngine
    });
  });

  it('can schedule matches', () => {
    // Tournament already loaded - can use engine methods directly
    const { matchUps } = tournamentEngine.allCompetitionMatchUps({
      inContext: true, // Fully hydrated matchUps for scheduling
      nextMatchUps: true,
    });
    // Test scheduling logic...
  });

  it('detects scheduling conflicts', () => {
    // Tournament already loaded
    const { matchUps } = tournamentEngine.allCompetitionMatchUps({
      inContext: true, // Required for conflict detection
      nextMatchUps: true,
    });
    const { rowIssues } = tournamentEngine.proConflicts({ matchUps });
    // Test conflict detection...
  });
});
```

### Factory Functions

Create factory functions for common scenarios:

```js
// test/helpers/tournamentFactory.js
export function createTournamentWithScheduling(options = {}) {
  const defaults = {
    drawProfiles: [{ drawSize: 16 }],
    venueProfiles: [{ courtsCount: 4 }],
    startDate: '2024-06-01',
  };

  return mocksEngine.generateTournamentRecord({
    ...defaults,
    ...options,
  });
}

export function createDoublesAndSinglesTournament() {
  return mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 64 },
    drawProfiles: [
      { drawSize: 32, eventType: 'SINGLES' },
      { drawSize: 16, eventType: 'DOUBLES' },
    ],
  });
}

// In tests:
import { createTournamentWithScheduling } from './helpers/tournamentFactory';

test('scheduling test', () => {
  const { tournamentRecord } = createTournamentWithScheduling({
    drawProfiles: [{ drawSize: 32 }],
  });
  // ...
});
```

## Testing Draw Structures

### Complete Draw Generation

Test a complete draw with qualifying structure. Note that qualifying is a stage within the draw, not a separate draw:

```js
test('generates complete championship draw with qualifying', () => {
  const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
    participantsProfile: {
      participantsCount: 128,
      sex: 'FEMALE',
      category: { categoryName: 'Open', ratingType: 'WTN' },
      scaleAllParticipants: true,
    },
    drawProfiles: [
      {
        drawSize: 64,
        drawName: "Women's Singles Championship",
        seedsCount: 16,
        qualifiersCount: 8, // 8 positions for qualifiers
        qualifyingProfiles: [
          {
            roundTarget: 1, // Qualifiers enter round 1 of main draw
            structureProfiles: [
              {
                stageSequence: 1,
                drawSize: 16, // 16 players compete for 8 spots
                seedsCount: 4,
              },
            ],
          },
        ],
        completionGoal: 40, // Complete 40 matchUps total
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const qualifyingMatches = matchUps.filter((m) => m.stage === 'QUALIFYING');
  const mainDrawMatches = matchUps.filter((m) => m.stage === 'MAIN');

  expect(qualifyingMatches.length).toBe(8); // 16 players = 8 matches
  expect(mainDrawMatches.length).toBe(63); // 64-draw = 63 matches
  expect(drawIds.length).toBe(1); // Single draw with qualifying stage
});
```

### Testing Playoff Structures

```js
test('generates playoffs for positions', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 16,
        withPlayoffs: {
          roundProfiles: [{ 4: 1 }], // Playoffs from round 4
          playoffPositions: [3, 4], // 3rd/4th place playoff
          playoffAttributes: {
            '0-4': { name: 'Bronze Medal Match', abbreviation: 'BM' },
          },
        },
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);
  const { drawDefinition } = tournamentEngine.getEvent();

  const playoffStructures = drawDefinition.structures.filter((s) => s.stage === 'PLAY_OFF');

  expect(playoffStructures.length).toBeGreaterThan(0);
});
```

### Recursive Playoff Structures (COMPASS-like Topologies)

The `withPlayoffs` parameter supports recursive nesting via `roundPlayoffs`. This enables building multi-level playoff trees — such as a full COMPASS draw — in a single `generateTournamentRecord` call:

```js
test('generates full COMPASS topology via recursive withPlayoffs', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        drawName: 'East',
        withPlayoffs: {
          roundProfiles: [{ 1: 1 }, { 2: 1 }, { 3: 1 }],
          playoffAttributes: {
            '0-1': { name: 'West', abbreviation: 'W' },
            '0-2': { name: 'North', abbreviation: 'N' },
            '0-3': { name: 'Northeast', abbreviation: 'NE' },
          },
          roundPlayoffs: {
            1: {
              // Sub-playoffs from West's losers
              roundProfiles: [{ 1: 1 }, { 2: 1 }],
              playoffAttributes: {
                '0-1': { name: 'South', abbreviation: 'S' },
                '0-2': { name: 'Southwest', abbreviation: 'SW' },
              },
              roundPlayoffs: {
                1: {
                  // Sub-playoffs from South's losers
                  roundProfiles: [{ 1: 1 }],
                  playoffAttributes: {
                    '0-1': { name: 'Southeast', abbreviation: 'SE' },
                  },
                },
              },
            },
            2: {
              // Sub-playoffs from North's losers
              roundProfiles: [{ 1: 1 }],
              playoffAttributes: {
                '0-1': { name: 'Northwest', abbreviation: 'NW' },
              },
            },
          },
        },
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);
  const { drawDefinition } = tournamentEngine.getEvent();

  // Full COMPASS: 8 structures, 7 LOSER links, 72 matchUps
  expect(drawDefinition.structures.length).toBe(8);
  expect(drawDefinition.links.length).toBe(7);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  expect(matchUps.length).toBe(72);
});
```

The `roundPlayoffs` field maps a source round number to a child `WithPlayoffsArgs` object. Each child can itself contain `roundPlayoffs`, enabling arbitrarily deep trees. See [Custom Playoff Topologies](/docs/concepts/draw-types#custom-playoff-topologies) and the [withPlayoffs API reference](/docs/governors/generation-governor#withplayoffs) for the full type definition and more examples.

## Testing Scheduling Scenarios

### Auto-Scheduling with Conflict Detection

```js
test('detects participant conflicts in scheduling', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 32 },
    drawProfiles: [
      { drawSize: 16, eventType: 'SINGLES', idPrefix: 'singles' },
      { drawSize: 8, eventType: 'DOUBLES', idPrefix: 'doubles' },
    ],
    venueProfiles: [{ courtsCount: 5 }],
  });

  tournamentEngine.setState(tournamentRecord);

  // Schedule all matches
  let { matchUps } = tournamentEngine.allCompetitionMatchUps({
    inContext: true,
    nextMatchUps: true,
  });

  const result = tournamentEngine.proAutoSchedule({
    scheduledDate: '2024-06-01',
    matchUps,
  });

  expect(result.success).toBe(true);

  // Verify no conflicts
  ({ matchUps } = tournamentEngine.allCompetitionMatchUps({
    inContext: true,
    nextMatchUps: true,
    matchUpFilters: { scheduledDate: '2024-06-01' },
  }));

  const { rowIssues } = tournamentEngine.proConflicts({ matchUps });
  const conflicts = Object.values(rowIssues)
    .flat()
    .filter((issue) => issue.issue === 'CONFLICT');

  expect(conflicts.length).toBe(0);
});
```

### Time-based Scheduling

```js
test('schedules matches with time slots', () => {
  const { tournamentRecord, venueIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16 }],
    venueProfiles: [
      {
        courtsCount: 4,
        startTime: '08:00',
        endTime: '20:00',
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();

  matchUps.slice(0, 4).forEach((matchUp, index) => {
    const scheduledTime = `${8 + index * 2}:00`;

    tournamentEngine.addMatchUpScheduleItems({
      matchUpId: matchUp.matchUpId,
      drawId: matchUp.drawId,
      schedule: {
        scheduledDate: '2024-06-01',
        scheduledTime,
      },
    });
  });

  const { dateMatchUps } = tournamentEngine.competitionScheduleMatchUps({
    matchUpFilters: { scheduledDate: '2024-06-01' },
  });

  expect(dateMatchUps.length).toBe(4);
  expect(dateMatchUps[0].schedule.scheduledTime).toBeDefined();
});
```

## Testing Match Completion

### Progressive Completion

Test draw advancement through rounds:

```js
test('advances draw through rounds', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, idPrefix: 'match' }],
  });

  tournamentEngine.setState(tournamentRecord);

  // Complete first round
  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  const firstRoundMatches = matchUps.filter((m) => m.roundNumber === 1);

  firstRoundMatches.forEach((matchUp) => {
    const { outcome } = mocksEngine.generateOutcome({
      matchUpFormat: matchUp.matchUpFormat,
      winningSide: 1,
    });

    tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      drawId: matchUp.drawId,
      outcome,
    });
  });

  // Verify second round is ready
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  const secondRoundMatches = matchUps.filter((m) => m.roundNumber === 2);

  expect(secondRoundMatches.every((m) => m.sides.every((s) => s.participantId))).toBe(true);
});
```

### Different Match Outcomes

Test various outcome scenarios:

```js
test('handles various match outcomes', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 8,
        outcomes: [
          { roundNumber: 1, roundPosition: 1, matchUpStatus: 'COMPLETED', scoreString: '6-4 6-2', winningSide: 1 },
          { roundNumber: 1, roundPosition: 2, matchUpStatus: 'RETIRED', winningSide: 1 },
          { roundNumber: 1, roundPosition: 3, matchUpStatus: 'WALKOVER', winningSide: 2 },
          { roundNumber: 1, roundPosition: 4, matchUpStatus: 'DEFAULTED', winningSide: 1 },
        ],
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);
  const { completedMatchUps } = tournamentEngine.tournamentMatchUps();

  expect(completedMatchUps.length).toBe(4);
  expect(completedMatchUps.map((m) => m.matchUpStatus).sort()).toEqual([
    'COMPLETED',
    'DEFAULTED',
    'RETIRED',
    'WALKOVER',
  ]);
});
```

## Testing Participant Scenarios

### Entry Status Testing

```js
test('manages alternates and direct acceptances', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 50 },
    drawProfiles: [
      {
        drawSize: 32,
        // 32 get DIRECT_ACCEPTANCE, 18 remain as potential alternates
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const { participants } = tournamentEngine.getParticipants();
  const { event } = tournamentEngine.getEvent();
  const { entries } = event;

  const directAcceptance = entries.filter((e) => e.entryStatus === 'DIRECT_ACCEPTANCE');
  const remaining = participants.length - directAcceptance.length;

  expect(directAcceptance.length).toBe(32);
  expect(remaining).toBe(18);
});
```

### Seeding Tests

```js
test('seeds participants by rating', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: {
      participantsCount: 64,
      category: { categoryName: 'Open', ratingType: 'WTN' },
      scaleAllParticipants: true,
    },
    drawProfiles: [
      {
        drawSize: 32,
        seedsCount: 8,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const { seedAssignments } = tournamentEngine.getEvent();
  expect(Object.keys(seedAssignments).length).toBe(8);

  // Verify top seeds are in expected positions
  const { positionAssignments } = tournamentEngine.getPositionAssignments();
  const topSeedPosition = positionAssignments.find((pa) => pa.seedNumber === 1);

  expect(topSeedPosition.drawPosition).toBe(1);
});
```

## Testing Team Events

### Team Creation from Attributes

```js
test('creates teams from participant attributes', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: {
      participantsCount: 64,
      teamKey: 'person.addresses[0].state', // Group by state
      addressProps: {
        statesProfile: {
          CA: 16,
          TX: 16,
          NY: 16,
          FL: 16,
        },
      },
    },
    drawProfiles: [
      {
        drawSize: 4,
        eventType: 'TEAM',
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: ['TEAM'] },
  });

  expect(participants.length).toBe(4);
  participants.forEach((team) => {
    expect(team.individualParticipantIds.length).toBeGreaterThan(0);
  });
});
```

## Understanding inContext: Hydrated vs Basic MatchUps

A critical concept when working with matchUps is the difference between basic and fully hydrated matchUps.

### Basic MatchUps (inContext: false or omitted)

```js
const { matchUps } = tournamentEngine.allTournamentMatchUps();

// Basic matchUp contains:
{
  matchUpId: 'abc-123',
  roundNumber: 1,
  roundPosition: 1,
  sides: [
    { participantId: 'player-1' },  // Only ID, not full participant
    { participantId: 'player-2' }
  ],
  // Missing: event details, participant details, venue info, etc.
}
```

### Fully Hydrated MatchUps (inContext: true)

```js
const { matchUps } = tournamentEngine.allTournamentMatchUps({
  inContext: true,  // Fully hydrate with contextual data
});

// Hydrated matchUp contains everything from basic, PLUS:
{
  // ... basic fields ...

  // Event context
  eventName: 'Singles Championship',
  eventType: 'SINGLES',
  gender: 'FEMALE',
  category: { categoryName: 'U18' },

  // Draw context
  drawName: 'Main Draw',
  drawType: 'SINGLE_ELIMINATION',
  stage: 'MAIN',
  structureName: 'Main',
  roundName: 'Round of 16',

  // Full participant details
  sides: [
    {
      participantId: 'player-1',
      participant: {
        participantName: 'Jane Doe',
        person: {
          standardGivenName: 'Jane',
          standardFamilyName: 'Doe',
          nationalityCode: 'USA',
          // ... full person details
        },
        // ... rankings, ratings, etc.
      }
    },
    // ... side 2 with full details
  ],

  // Scheduling context (if scheduled)
  schedule: {
    venueId: 'venue-1',
    venueName: 'Main Stadium',
    venueAbbreviation: 'MS',
    courtId: 'court-1',
    courtName: 'Center Court',
    scheduledDate: '2024-06-01',
    scheduledTime: '10:00',
  },

  // Potential participants for future rounds
  potentialParticipants: [[...], [...]],

  // Dependency information
  winnerTo: { /* next matchUp info */ },
  loserTo: { /* consolation matchUp info */ },
}
```

### When inContext is REQUIRED

Certain operations require `inContext: true`:

#### 1. Scheduling Operations

```js
// ❌ WRONG: Will fail or produce incorrect results
const { matchUps } = tournamentEngine.allCompetitionMatchUps();
tournamentEngine.proAutoSchedule({ matchUps, scheduledDate: '2024-06-01' });

// ✅ CORRECT: Scheduling needs participant context
const { matchUps } = tournamentEngine.allCompetitionMatchUps({
  inContext: true,
  nextMatchUps: true, // Also needed for dependency info
});
tournamentEngine.proAutoSchedule({ matchUps, scheduledDate: '2024-06-01' });
```

#### 2. Conflict Detection

```js
// ❌ WRONG: Can't detect participant conflicts without context
const { matchUps } = tournamentEngine.allCompetitionMatchUps();
const { rowIssues } = tournamentEngine.proConflicts({ matchUps });

// ✅ CORRECT: Needs participant details to detect conflicts
const { matchUps } = tournamentEngine.allCompetitionMatchUps({
  inContext: true,
  nextMatchUps: true,
});
const { rowIssues } = tournamentEngine.proConflicts({ matchUps });
```

#### 3. Display/Reporting

```js
// ❌ WRONG: Can't display names, only IDs
const { matchUps } = tournamentEngine.allTournamentMatchUps();
console.log(matchUps[0].sides[0].participantId); // Just an ID

// ✅ CORRECT: Has full names and details for display
const { matchUps } = tournamentEngine.allTournamentMatchUps({
  inContext: true,
});
console.log(matchUps[0].sides[0].participant.participantName); // "Jane Doe"
```

### Performance Considerations

```js
// For large datasets, consider performance tradeoff
test('performance-critical operation', () => {
  // ❌ SLOW: Hydrating 1000+ matchUps is expensive
  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    inContext: true,
  });

  // Just checking IDs
  const matchUpIds = matchUps.map((m) => m.matchUpId);

  // ✅ FASTER: Only get what you need
  const { matchUps: basicMatchUps } = tournamentEngine.allTournamentMatchUps();
  const matchUpIds = basicMatchUps.map((m) => m.matchUpId);

  // ✅ BEST: Get full context only when needed
  const matchUpId = basicMatchUps[0].matchUpId;
  const { matchUp } = tournamentEngine.findMatchUp({
    matchUpId,
    inContext: true, // Hydrate just this one
  });
});
```

### Best Practice Pattern

```js
test('efficient matchUp operations', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
    setState: true,
  });

  // Phase 1: Find what you need (fast, no hydration)
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const firstRoundMatches = matchUps.filter((m) => m.roundNumber === 1);

  // Phase 2: Get full details only for what you're using
  const { matchUps: hydratedMatches } = tournamentEngine.allTournamentMatchUps({
    inContext: true,
    matchUpFilters: {
      roundNumbers: [1], // Only hydrate first round
    },
  });

  // Now work with fully hydrated matchUps
  hydratedMatches.forEach((matchUp) => {
    console.log(`${matchUp.sides[0].participant.participantName} vs ${matchUp.sides[1].participant.participantName}`);
  });
});
```

## Debugging Patterns

### Use ID Prefixes

Make debugging easier with meaningful prefixes:

```js
test('debug with prefixes', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: {
      participantsCount: 32,
      idPrefix: 'player',
    },
    drawProfiles: [
      {
        drawSize: 16,
        idPrefix: 'match',
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allTournamentMatchUps();

  // Console output will show: match-1-1, match-1-2, etc.
  console.log(matchUps[0].matchUpId);
  // And: player-I-0, player-I-1, etc.
  console.log(matchUps[0].sides[0].participantId);
});
```

### DevContext for Detailed Errors

```js
test('with devContext for debugging', () => {
  mocksEngine.devContext(true);

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16 }],
  });

  tournamentEngine.devContext(true).setState(tournamentRecord);

  // Now get detailed error messages for any issues
  const result = tournamentEngine.setMatchUpStatus({
    matchUpId: 'invalid-id',
    outcome: {},
  });

  // Detailed error information available
  expect(result.error).toBeDefined();
});
```

## Integration Testing

### Full Tournament Lifecycle

```js
test('complete tournament lifecycle', () => {
  // 1. Generate tournament
  const { tournamentRecord, eventIds, venueIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    venueProfiles: [{ courtsCount: 3 }],
  });

  // 2. Load into engine
  tournamentEngine.setState(tournamentRecord);

  // 3. Schedule matches
  const { matchUps } = tournamentEngine.allCompetitionMatchUps({
    inContext: true,
    nextMatchUps: true,
  });

  const scheduleResult = tournamentEngine.proAutoSchedule({
    scheduledDate: '2024-06-01',
    matchUps,
  });
  expect(scheduleResult.success).toBe(true);

  // 4. Complete first round
  const { matchUps: scheduled } = tournamentEngine.allTournamentMatchUps();
  const firstRound = scheduled.filter((m) => m.roundNumber === 1);

  firstRound.forEach((matchUp) => {
    const { outcome } = mocksEngine.generateOutcome();
    tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      drawId: matchUp.drawId,
      outcome,
    });
  });

  // 5. Verify progression
  const { upcomingMatchUps } = tournamentEngine.tournamentMatchUps();
  const secondRoundReady = upcomingMatchUps.filter((m) => m.roundNumber === 2 && m.sides.every((s) => s.participantId));

  expect(secondRoundReady.length).toBeGreaterThan(0);

  // 6. Export and verify
  const { tournamentRecord: final } = tournamentEngine.getTournament();
  expect(final.events[0].drawDefinitions[0].structures[0].matchUps).toBeDefined();
});
```

## Best Practices Summary

1. **Use setState: true**: Auto-load tournaments into engine for convenience
2. **Use inContext: true**: When you need full participant details, scheduling, or conflict detection
3. **Understand Performance**: Use `inContext: false` for large datasets, true only when needed
4. **Reuse Tournament Structures**: Generate once, test multiple scenarios
5. **Use Factory Functions**: Create helper functions for common setups
6. **Add ID Prefixes**: Make debugging easier with meaningful IDs
7. **Enable DevContext**: Get detailed errors during development
8. **Test Edge Cases**: Use matchUpStatusProfile for various outcomes
9. **Minimize Generation**: Don't regenerate unnecessarily in loops
10. **Fixed Values for Snapshots**: Use fixed dates/IDs for snapshot testing
11. **Test Complete Flows**: Integrate generation with engine operations
12. **Organize Tests Logically**: Group related tests, use shared setup
13. **Document Complex Scenarios**: Add comments explaining non-obvious test setups
14. **Phase Your Operations**: Get basic data first, hydrate only what you need

## Next Steps

- **[Tournament Generation](./mocks-engine-tournament-generation.md)** - Complete tournament generation options
- **[Participant Generation](./mocks-engine-participants.md)** - Types and demographics
- **[Outcome Generation](./mocks-engine-outcomes.md)** - Match results and scores
