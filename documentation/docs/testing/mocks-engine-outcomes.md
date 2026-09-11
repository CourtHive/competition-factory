---
title: Outcome Generation
---

# Outcome Generation

The mocksEngine provides powerful tools for generating match outcomes with realistic scores, various match statuses, and controlled randomization.

## generateOutcome

Generate complete match outcomes with scores:

```js
const { outcome } = mocksEngine.generateOutcome({
  matchUpFormat: 'SET3-S:6/TB7',
  winningSide: 1,
});
```

Returns an outcome object with:

- **score**: Complete score structure with sets
- **winningSide**: 1 or 2 (or undefined for DOUBLE_WALKOVER, etc.)
- **matchUpStatus**: 'COMPLETED', 'RETIRED', 'DEFAULTED', etc.

## Basic Usage

### Simple Outcome

```js
const { outcome } = mocksEngine.generateOutcome();

// Returns:
{
  score: {
    sets: [
      { side1Score: 6, side2Score: 3, winningSide: 1 },
      { side1Score: 6, side2Score: 4, winningSide: 1 },
    ],
    scoreStringSide1: '6-3 6-4',
    scoreStringSide2: '3-6 4-6',
  },
  winningSide: 1,
  matchUpStatus: 'COMPLETED',
}
```

### Specify Winner

```js
const { outcome } = mocksEngine.generateOutcome({
  winningSide: 2, // Side 2 wins
});
```

### With MatchUp Format

Generate scores that comply with a specific format:

```js
const { outcome } = mocksEngine.generateOutcome({
  matchUpFormat: 'SET3-S:6/TB7', // Best of 3 sets, games to 6, tiebreak at 7
  winningSide: 1,
});
```

Common formats:

- `SET3-S:6/TB7` - Best of 3 sets, tiebreak at 6-6
- `SET5-S:6/TB7` - Best of 5 sets
- `SET3-S:4/TB7` - Short sets to 4
- `SET1-S:T20` - Timed set (20 minutes)
- `SET3-S:6/TB7-F:TB10` - Final set to 10-point tiebreak

## Match Status Profiles

Control the distribution of match statuses:

### All Completed

```js
const { outcome } = mocksEngine.generateOutcome({
  matchUpStatusProfile: { COMPLETED: 100 },
});
```

### Mixed Statuses

```js
const { outcome } = mocksEngine.generateOutcome({
  matchUpStatusProfile: {
    COMPLETED: 70, // 70% completed normally
    RETIRED: 15, // 15% retirements
    WALKOVER: 10, // 10% walkovers
    DEFAULTED: 5, // 5% defaults
  },
});
```

### Specific Status

```js
// Retirement
const { outcome } = mocksEngine.generateOutcome({
  matchUpStatusProfile: { RETIRED: 100 },
  winningSide: 1,
});

// Walkover
const { outcome } = mocksEngine.generateOutcome({
  matchUpStatusProfile: { WALKOVER: 100 },
  winningSide: 1,
});

// Default
const { outcome } = mocksEngine.generateOutcome({
  matchUpStatusProfile: { DEFAULTED: 100 },
  winningSide: 2,
});
```

### Default with Score

By default, DEFAULTED outcomes have no score. To include scores:

```js
const { outcome } = mocksEngine.generateOutcome({
  matchUpStatusProfile: { DEFAULTED: 100 },
  defaultWithScorePercent: 100, // Always include score with defaults
  winningSide: 1,
});
```

### Double Walkover

```js
const { outcome } = mocksEngine.generateOutcome({
  matchUpStatusProfile: { DOUBLE_WALKOVER: 100 },
});

// Note: winningSide will be undefined
console.log(outcome.winningSide); // undefined
console.log(outcome.matchUpStatus); // 'DOUBLE_WALKOVER'
```

### Suspended/Incomplete

```js
const { outcome } = mocksEngine.generateOutcome({
  matchUpStatusProfile: { SUSPENDED: 100 },
});

// No winningSide for suspended matches
console.log(outcome.winningSide); // undefined
```

## Score Control

### Side Weight

Control how often "deciding sets" are generated:

```js
const { outcome } = mocksEngine.generateOutcome({
  matchUpFormat: 'SET3-S:6/TB7',
  sideWeight: 4, // Default - controls score variation
});
```

Lower `sideWeight` = more three-set matches
Higher `sideWeight` = more straight-set wins

### Timed Sets

Generate outcomes for timed sets:

```js
const { outcome } = mocksEngine.generateOutcome({
  matchUpFormat: 'SET1-S:T20', // 20-minute timed set
  pointsPerMinute: 1.5, // Points scored per minute
});
```

### Aggregate Timed Sets

For formats where the winner is determined by total points across all sets (not by winning individual sets), use the aggregate modifier `A` in the format code:

```js
// 2 timed sets, aggregate scoring — winner has most total points
const { outcome } = mocksEngine.generateOutcome({
  matchUpFormat: 'SET2XA-S:T10', // 2 sets × 10 minutes, aggregate
  matchUpStatusProfile: {},
});

// All sets are always played (no early exit)
expect(outcome.score.sets.length).toBe(2);

// Winner determined by total points, not sets won
const side1Total = outcome.score.sets.reduce((s, set) => s + set.side1Score, 0);
const side2Total = outcome.score.sets.reduce((s, set) => s + set.side2Score, 0);
if (outcome.winningSide === 1) expect(side1Total).toBeGreaterThan(side2Total);
```

Common aggregate timed formats:

- `SET2XA-S:T10` - 2 × 10-minute sets, aggregate scoring (e.g. INTENNSE singles)
- `SET1A-S:T10` - 1 × 10-minute set, aggregate scoring (e.g. INTENNSE doubles)

The `X` modifier means "exactly" — all sets are played regardless of the running score. The `A` modifier triggers aggregate scoring where the winner is the side with the highest total points across all sets.

## generateOutcomeFromScoreString {#generateOutcomeFromScoreString}

Create outcomes from score strings:

```js
const { outcome } = mocksEngine.generateOutcomeFromScoreString({
  scoreString: '6-1 6-2',
  winningSide: 1,
});
```

### Score String Format

Scores are always from the winner's perspective:

```js
// Side 1 wins
const { outcome } = mocksEngine.generateOutcomeFromScoreString({
  scoreString: '6-4 3-6 7-5',
  winningSide: 1,
});

// Side 2 wins the same match (flipped perspective)
const { outcome2 } = mocksEngine.generateOutcomeFromScoreString({
  scoreString: '4-6 6-3 5-7', // Same match, side 2 perspective
  winningSide: 2,
});
```

### With Tiebreaks

```js
const { outcome } = mocksEngine.generateOutcomeFromScoreString({
  scoreString: '7-6(3) 6-4',
  winningSide: 1,
});

// Result includes tiebreak details in sets
outcome.score.sets[0].side1TiebreakScore; // 7
outcome.score.sets[0].side2TiebreakScore; // 3
```

### With Match Status

```js
const { outcome } = mocksEngine.generateOutcomeFromScoreString({
  scoreString: '6-3 4-2',
  matchUpStatus: 'RETIRED',
  winningSide: 1,
});
```

### No Winner Specified

When winningSide is omitted, it's inferred from the score:

```js
const { outcome } = mocksEngine.generateOutcomeFromScoreString({
  scoreString: '6-4 6-3',
  // winningSide inferred as 1
});
```

## Applying Outcomes

### Direct Application

```js
import { tournamentEngine } from 'tods-competition-factory';

const { outcome } = mocksEngine.generateOutcome({
  matchUpFormat: 'SET3-S:6/TB7',
  winningSide: 1,
});

tournamentEngine.devContext(true).setMatchUpStatus({
  matchUpId: 'match-123',
  drawId: 'draw-456',
  outcome,
});
```

### During Tournament Generation

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

### Batch Completion

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 32 }],
  completeAllMatchUps: true,
  randomWinningSide: true,
  matchUpStatusProfile: {
    COMPLETED: 85,
    RETIRED: 10,
    DEFAULTED: 5,
  },
});
```

### Targeted Completion

Complete matchUps in a specific stage and/or round using `completeDrawMatchUps`:

```js
const {
  drawIds: [drawId],
  tournamentRecord,
} = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 16, drawType: 'FIRST_MATCH_LOSER_CONSOLATION' }],
});

const event = tournamentRecord.events[0];
const drawDefinition = event.drawDefinitions.find((d) => d.drawId === drawId);

// Complete only round 1 of the MAIN stage
mocksEngine.completeDrawMatchUps({
  tournamentRecord,
  drawDefinition,
  event,
  stage: 'MAIN',
  roundNumber: 1,
  completeAllMatchUps: '6-3 6-4',
});

// Then complete CONSOLATION separately
mocksEngine.completeDrawMatchUps({
  tournamentRecord,
  drawDefinition,
  event,
  stage: 'CONSOLATION',
  completeAllMatchUps: '6-2 6-2',
});
```

**Note:** The `drawDefinition` must be a direct reference from `tournamentRecord.events[n].drawDefinitions[n]`, not a copy from engine query methods.

See [completeDrawMatchUps](../governors/mocks-governor.md#completedrawmatchups) for all options.

### Removing Outcomes

Reset a matchUp to `TO_BE_PLAYED` using `removeMatchUpOutcome`:

```js
// Remove a completed matchUp's outcome
const result = mocksEngine.removeMatchUpOutcome({
  tournamentRecord,
  drawId,
  matchUpId,
});

expect(result.success).toBe(true);
```

This triggers the same cleanup paths as manual score removal — `removeDirectedParticipants`, consolation feed reversal, etc. — making it useful for testing score reversal scenarios.

See [removeMatchUpOutcome](../governors/mocks-governor.md#removematchupoutcome) for all options.

## Common Patterns

### Testing Score Parsing

```js
test('parses various score formats', () => {
  const testCases = ['6-4 6-3', '7-6(5) 3-6 6-4', '6-0 6-0', '4-6 6-4 7-6(3)'];

  testCases.forEach((scoreString) => {
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString,
      winningSide: 1,
    });

    expect(outcome.score).toBeDefined();
    expect(outcome.winningSide).toBe(1);
  });
});
```

### Testing Match Completion

```js
test('completes match with retirement', () => {
  const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
  });

  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const matchUp = matchUps[0];

  const { outcome } = mocksEngine.generateOutcome({
    matchUpStatusProfile: { RETIRED: 100 },
    winningSide: 1,
  });

  const result = tournamentEngine.setMatchUpStatus({
    matchUpId: matchUp.matchUpId,
    drawId: drawIds[0],
    outcome,
  });

  expect(result.success).toBe(true);

  const { matchUps: updated } = tournamentEngine.allTournamentMatchUps();
  const completed = updated.find((m) => m.matchUpId === matchUp.matchUpId);
  expect(completed.matchUpStatus).toBe('RETIRED');
});
```

### Testing Score Progression

```js
test('generates progressive match completion', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 8,
        outcomes: [
          // Quarter-finals
          { roundNumber: 1, roundPosition: 1, scoreString: '6-4 6-2', winningSide: 1 },
          { roundNumber: 1, roundPosition: 2, scoreString: '7-6(3) 6-4', winningSide: 1 },
          { roundNumber: 1, roundPosition: 3, scoreString: '6-3 6-4', winningSide: 2 },
          { roundNumber: 1, roundPosition: 4, scoreString: '6-2 6-3', winningSide: 1 },
          // Semi-finals
          { roundNumber: 2, roundPosition: 1, scoreString: '6-4 3-6 7-5', winningSide: 1 },
          { roundNumber: 2, roundPosition: 2, scoreString: '7-5 6-4', winningSide: 2 },
          // Final
          { roundNumber: 3, roundPosition: 1, scoreString: '6-4 6-4', winningSide: 1 },
        ],
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);
  const { completedMatchUps } = tournamentEngine.tournamentMatchUps();

  expect(completedMatchUps.length).toBe(7);
});
```

### Testing Edge Cases

```js
test('handles special match statuses', () => {
  const statuses = ['WALKOVER', 'DEFAULTED', 'DOUBLE_WALKOVER', 'RETIRED', 'SUSPENDED'];

  statuses.forEach((status) => {
    const { outcome } = mocksEngine.generateOutcome({
      matchUpStatusProfile: { [status]: 100 },
      winningSide: status === 'DOUBLE_WALKOVER' ? undefined : 1,
    });

    expect(outcome.matchUpStatus).toBe(status);

    if (['DOUBLE_WALKOVER', 'SUSPENDED', 'INCOMPLETE'].includes(status)) {
      expect(outcome.winningSide).toBeUndefined();
    } else {
      expect(outcome.winningSide).toBeDefined();
    }
  });
});
```

### Generating Match Scenarios

```js
test('creates specific match scenario', () => {
  // Close 3-setter with multiple tiebreaks
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '7-6(5) 6-7(3) 7-6(10)',
    winningSide: 1,
    matchUpStatus: 'COMPLETED',
  });

  expect(outcome.score.sets.length).toBe(3);
  expect(outcome.score.sets[0].side1TiebreakScore).toBe(7);
  expect(outcome.score.sets[2].side1TiebreakScore).toBe(12);
});
```

## Outcome Object Structure

### Completed Match

```js
{
  matchUpStatus: 'COMPLETED',
  winningSide: 1,
  score: {
    sets: [
      {
        setNumber: 1,
        side1Score: 6,
        side2Score: 4,
        winningSide: 1,
      },
      {
        setNumber: 2,
        side1Score: 6,
        side2Score: 3,
        winningSide: 1,
      },
    ],
    scoreStringSide1: '6-4 6-3',
    scoreStringSide2: '4-6 3-6',
  },
}
```

### With Tiebreak

```js
{
  matchUpStatus: 'COMPLETED',
  winningSide: 1,
  score: {
    sets: [
      {
        setNumber: 1,
        side1Score: 7,
        side2Score: 6,
        side1TiebreakScore: 7,
        side2TiebreakScore: 3,
        winningSide: 1,
      },
      // ... more sets
    ],
    scoreStringSide1: '7-6(3) 6-4',
    scoreStringSide2: '6-7(3) 4-6',
  },
}
```

### Retired

```js
{
  matchUpStatus: 'RETIRED',
  winningSide: 1,
  score: {
    sets: [],  // May be empty or partial
    scoreStringSide1: '',
    scoreStringSide2: '',
  },
}
```

## Validation

The generated outcomes are automatically validated against:

- **MatchUp format constraints** (set count, games per set, tiebreak rules)
- **[CODES](/docs/data-standards#codes) schema compliance**
- **Score string parsability**
- **Logical consistency** (winner matches final score)

## Tips

1. **Use matchUpFormat** when testing format-specific scoring
2. **Control status distribution** with matchUpStatusProfile for realistic scenarios
3. **Use generateOutcomeFromScoreString** when you need specific scores
4. **Test edge cases** like DOUBLE_WALKOVER and SUSPENDED
5. **Leverage outcomes in drawProfiles** for complete scenario setup
6. **Remember winningSide** is required except for no-winner statuses
7. **Score strings** are always from winner's perspective

## Next Steps

- **[Tournament Generation](./mocks-engine-tournament-generation.md)** - Apply outcomes during generation
- **[Advanced Patterns](./mocks-engine-patterns.md)** - Complex outcome scenarios
- **[Participant Generation](./mocks-engine-participants.md)** - Types and demographics
