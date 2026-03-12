---
title: MatchUps & Scoring
sidebar_position: 5
---

# MatchUp Management and Scoring in TMX

The MatchUps tab in TMX provides comprehensive match management including scoring, status updates, and match progression. This demonstrates the [Matchup Governor](../governors/matchup-governor.md) and [Score Governor](../governors/score-governor.md) capabilities.

:::info Screenshots Coming Soon
This page will be updated with screenshots showing the TMX matchup management and scoring interface.
:::

## Overview

MatchUp management in TMX includes:

- **Match Listing** - View all matches with filtering and sorting
- **Live Scoring** - Enter and update match scores
- **Score Validation** - Format-aware score validation
- **Match Status** - Manage match states (scheduled, in progress, completed)
- **Match Formats** - Flexible scoring formats
- **Walkover/Retirement** - Handle special match outcomes
- **Score Display** - Tournament-style score presentation
- **Match Progression** - Automatic winner advancement

## Factory Methods Used

### Retrieving MatchUps

```js
// Get all matchUps for an event
const { matchUps } = tournamentEngine.getAllEventMatchUps({ eventId });

// Get matchUps for a draw
const { matchUps } = tournamentEngine.getMatchUps({
  eventId,
  drawId,
});

// Get matchUps for a round
const { matchUps } = tournamentEngine.getRoundMatchUps({
  eventId,
  drawId,
  structureId,
  roundNumber: 1,
});

// Get specific matchUp
const { matchUp } = tournamentEngine.getMatchUp({
  eventId,
  matchUpId,
});
```

### Setting Scores

```js
// Set match outcome with score
tournamentEngine.setMatchUpStatus({
  eventId,
  drawId,
  matchUpId,
  outcome: {
    score: {
      sets: [
        { side1Score: 6, side2Score: 4 },
        { side1Score: 6, side2Score: 3 },
      ],
    },
    winningSide: 1,
  },
});

// Score from string
tournamentEngine.setMatchUpStatus({
  eventId,
  matchUpId,
  outcome: {
    scoreString: '6-4 6-3',
    winningSide: 1,
  },
});
```

### Match Status Management

```js
// Update match status
tournamentEngine.setMatchUpStatus({
  eventId,
  matchUpId,
  matchUpStatus: 'IN_PROGRESS',
});

// Complete match with walkover
tournamentEngine.setMatchUpStatus({
  eventId,
  matchUpId,
  outcome: {
    matchUpStatus: 'WALKOVER',
    winningSide: 1,
  },
});

// Mark as retired
tournamentEngine.setMatchUpStatus({
  eventId,
  matchUpId,
  outcome: {
    matchUpStatus: 'RETIRED',
    winningSide: 1,
    score: {
      sets: [
        { side1Score: 6, side2Score: 2 },
        { side1Score: 3, side2Score: 5 },
      ],
    },
  },
});
```

### Match Formats

```js
// Set default format for event
tournamentEngine.setEventMatchUpFormat({
  eventId,
  matchUpFormat: 'SET3-S:6/TB7',
});

// Set format for specific structure
tournamentEngine.setStructureMatchUpFormat({
  eventId,
  drawId,
  structureId,
  matchUpFormat: 'SET3-S:6/TB7',
});

// Set format for individual matchUp
tournamentEngine.setMatchUpFormat({
  eventId,
  matchUpId,
  matchUpFormat: 'SET1-S:8/TB7',
});
```

## Match Format Codes

TMX supports flexible match format codes:

### Standard Formats

```js
'SET3-S:6/TB7'; // Best of 3 sets to 6 games, tiebreak at 7
'SET3-S:6/TB7@6'; // Best of 3, TB at 6-6
'SET3-S:6/TB7-F:TB10'; // Best of 3, final set super tiebreak to 10
'SET1-S:8/TB7'; // 1 set to 8 games, TB at 7
'SET5-S:6/TB7'; // Best of 5 sets
```

### Timed Formats

```js
'TIMED20'; // 20 minute timed match
'TIMED25-NOAD'; // 25 minutes, no-ad scoring
```

### Pro Set

```js
'SET1-S:8/TB7'; // Pro set to 8
'SET1-S:10/TB7'; // Pro set to 10
```

### No-Ad Scoring

```js
'SET3-S:6/TB7-NOAD'; // Best of 3, no-ad
```

## Key Features

### Score Entry

```js
// Progressive score entry
const score = {
  sets: [],
};

// First set
score.sets.push({ side1Score: 6, side2Score: 4 });

// Second set with tiebreak
score.sets.push({
  side1Score: 7,
  side2Score: 6,
  side1TiebreakScore: 7,
  side2TiebreakScore: 5,
});

// Third set (if needed)
if (setsWon1 === 1 && setsWon2 === 1) {
  score.sets.push({ side1Score: 6, side2Score: 3 });
}

// Submit score
tournamentEngine.setMatchUpStatus({
  eventId,
  matchUpId,
  outcome: {
    score,
    winningSide: determinWinner(score),
  },
});
```

### Score Validation

```js
// Validate score matches format
const { valid, errors } = tournamentEngine.validateScore({
  matchUpFormat: 'SET3-S:6/TB7',
  score: {
    sets: [
      { side1Score: 6, side2Score: 4 },
      { side1Score: 7, side2Score: 5 },
    ],
  },
});

if (!valid) {
  console.error('Invalid score:', errors);
}
```

### Match Progression

```js
// Setting a score automatically:
// 1. Updates winner/loser
// 2. Advances winner to next round
// 3. Updates matchUp status
// 4. Triggers dependent matchUps
// 5. Updates standings (for Round Robin)

tournamentEngine.setMatchUpStatus({
  eventId,
  matchUpId,
  outcome: {
    score: {
      sets: [
        /* ... */
      ],
    },
    winningSide: 1,
  },
});

// Check what matchUps are now ready
const { matchUps } = tournamentEngine.getAllEventMatchUps({
  eventId,
  matchUpFilters: { matchUpStatuses: ['TO_BE_PLAYED'] },
});
```

### Special Outcomes

```js
// Walkover
tournamentEngine.setMatchUpStatus({
  eventId,
  matchUpId,
  outcome: {
    matchUpStatus: 'WALKOVER',
    winningSide: 1,
  },
});

// Default
tournamentEngine.setMatchUpStatus({
  eventId,
  matchUpId,
  outcome: {
    matchUpStatus: 'DEFAULTED',
    winningSide: 1,
  },
});

// Double walkover
tournamentEngine.setMatchUpStatus({
  eventId,
  matchUpId,
  outcome: {
    matchUpStatus: 'DOUBLE_WALKOVER',
  },
});

// Retired
tournamentEngine.setMatchUpStatus({
  eventId,
  matchUpId,
  outcome: {
    matchUpStatus: 'RETIRED',
    winningSide: 1,
    score: {
      sets: [
        { side1Score: 6, side2Score: 2 },
        { side1Score: 3, side2Score: 4 }, // Score when retired
      ],
    },
  },
});
```

## UI Components

TMX uses these [courthive-components](https://courthive.github.io/courthive-components/):

- **MatchUpsList** - Filterable list of matches
- **ScoreEntry** - Format-aware score input
- **MatchUpCard** - Match display with actions
- **ScoreDisplay** - Tournament-style score formatting
- **MatchUpStatus** - Status badges and indicators
- **MatchFormatEditor** - Format configuration ([see in docs](../concepts/matchup-overview.md))

## Common Workflows

### Basic Score Entry

```js
// 1. Get matchUp
const { matchUp } = tournamentEngine.getMatchUp({
  eventId,
  matchUpId,
});

// 2. Validate participants present
if (!matchUp.sides[0].participantId || !matchUp.sides[1].participantId) {
  console.error('MatchUp not ready for scoring');
  return;
}

// 3. Enter score
const score = {
  sets: [
    { side1Score: 6, side2Score: 4 },
    { side1Score: 6, side2Score: 3 },
  ],
};

// 4. Determine winner
const winningSide = score.sets.filter((s) => s.side1Score > s.side2Score).length > 1 ? 1 : 2;

// 5. Submit
const result = tournamentEngine.setMatchUpStatus({
  eventId,
  matchUpId,
  outcome: { score, winningSide },
});

// 6. Update UI
if (result.success) {
  refreshMatchUpDisplay();
}
```

### Live Score Updates

```js
// Update score during match
let currentScore = { sets: [] };

function updateSet(setNumber, side1Score, side2Score) {
  currentScore.sets[setNumber - 1] = { side1Score, side2Score };

  // Save intermediate state
  tournamentEngine.setMatchUpStatus({
    eventId,
    matchUpId,
    matchUpStatus: 'IN_PROGRESS',
    outcome: {
      score: currentScore,
    },
  });
}

function completeMatch(winningSide) {
  tournamentEngine.setMatchUpStatus({
    eventId,
    matchUpId,
    outcome: {
      score: currentScore,
      winningSide,
      matchUpStatus: 'COMPLETED',
    },
  });
}
```

### Bulk Score Import

```js
// Import scores from external source
const scores = [
  { matchUpId: 'match1', scoreString: '6-4 6-3', winningSide: 1 },
  { matchUpId: 'match2', scoreString: '7-6(5) 4-6 10-8', winningSide: 1 },
  { matchUpId: 'match3', scoreString: 'WO', winningSide: 1, status: 'WALKOVER' },
];

scores.forEach((s) => {
  const outcome =
    s.status === 'WALKOVER'
      ? { matchUpStatus: 'WALKOVER', winningSide: s.winningSide }
      : { scoreString: s.scoreString, winningSide: s.winningSide };

  tournamentEngine.setMatchUpStatus({
    eventId,
    matchUpId: s.matchUpId,
    outcome,
  });
});
```

### Score Correction

```js
// Remove incorrect score
tournamentEngine.resetMatchUpLineUp({
  eventId,
  matchUpId,
});

// Re-enter correct score
tournamentEngine.setMatchUpStatus({
  eventId,
  matchUpId,
  outcome: {
    score: correctScore,
    winningSide: correctWinner,
  },
});
```

## Filtering and Querying

```js
// Get completed matches
const { completedMatchUps } = tournamentEngine.getAllEventMatchUps({
  eventId,
  matchUpFilters: {
    matchUpStatuses: ['COMPLETED'],
  },
});

// Get matches ready to play
const { readyMatchUps } = tournamentEngine.getAllEventMatchUps({
  eventId,
  matchUpFilters: {
    matchUpStatuses: ['TO_BE_PLAYED'],
    isMatchUpTie: false,
    readyToScore: true,
  },
});

// Get matches by round
const { matchUps } = tournamentEngine.getAllEventMatchUps({
  eventId,
  matchUpFilters: {
    roundNumbers: [1, 2],
  },
});

// Get matches for specific participant
const { matchUps } = tournamentEngine.getParticipantMatchUps({
  participantId,
  eventId,
});
```

## Statistics and Analysis

```js
// Get match statistics
const { matchUpFormat, score } = matchUp;

// Calculate total games
const totalGames = score.sets.reduce((sum, set) => sum + set.side1Score + set.side2Score, 0);

// Check for tiebreaks
const tiebreaks = score.sets.filter((set) => set.side1TiebreakScore !== undefined).length;

// Match duration
const duration =
  matchUp.schedule?.endTime && matchUp.schedule?.startTime
    ? new Date(matchUp.schedule.endTime) - new Date(matchUp.schedule.startTime)
    : null;
```

## Best Practices

### Score Entry Best Practices

- Validate format before entry
- Check for tiebreak requirements
- Verify set completion before moving to next set
- Confirm winner determination logic
- Allow score preview before submission

### Match Management

- Update status appropriately (SCHEDULED → IN_PROGRESS → COMPLETED)
- Handle special outcomes properly (WO, RET, DEF)
- Provide clear feedback on score submission
- Allow score corrections with audit trail

### Performance

- Cache matchUp lists and filter in UI
- Use matchUp filters in queries
- Batch score updates when possible
- Minimize full matchUp queries

### User Experience

- Show match format clearly
- Indicate tiebreak requirements
- Display running score during entry
- Confirm before submitting scores
- Allow easy correction of mistakes

## Related Documentation

- [Matchup Governor](../governors/matchup-governor.md) - All matchUp methods
- [Score Governor](../governors/score-governor.md) - Scoring methods
- [Match Formats](../concepts/matchup-overview.md) - Format codes and configuration
- [Match Status](../concepts/matchup-overview.md) - Status values and meanings

## Next Steps

After managing matches, proceed to [Venues & Scheduling](./venues-scheduling.md) to assign matches to courts and create schedules.
