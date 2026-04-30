---
title: MatchUps Overview
---

## Overview

**MatchUps** are the fundamental competitive units in [CODES](/docs/data-standards#codes), representing individual contests between participants. A matchUp can be a singles match, doubles match, or team match, and contains all information about the competition: participants, scores, schedule, officials, and outcome.

### Key Concepts

**Match Types**: SINGLES, DOUBLES, TEAM  
**Match Status**: TO_BE_PLAYED, IN_PROGRESS, COMPLETED, WALKOVER, DEFAULTED, etc.  
**Sides**: The two competing participants (side1 and side2)  
**Position Assignments**: How participants are placed in matchUps  
**Hydration**: Adding contextual information from draw/event/tournament  
**Collection MatchUps**: Individual matches within TEAM matchUps

## MatchUp Types

### SINGLES

A matchUp between two INDIVIDUAL participants:

```ts
type SinglesMatchUp = {
  matchUpId: string;
  matchUpType: 'SINGLES';
  matchUpFormat: string; // e.g., 'SET3-S:6/TB7'
  matchUpStatus: MatchUpStatus;
  sides: [
    {
      sideNumber: 1;
      participantId: string; // INDIVIDUAL participant
      participant?: Participant;
    },
    {
      sideNumber: 2;
      participantId: string;
      participant?: Participant;
    },
  ];
  score?: Score;
  winningSide?: 1 | 2;
  // ... additional attributes
};
```

### DOUBLES

A matchUp between two PAIR participants:

```ts
type DoublesMatchUp = {
  matchUpId: string;
  matchUpType: 'DOUBLES';
  matchUpFormat: string;
  matchUpStatus: MatchUpStatus;
  sides: [
    {
      sideNumber: 1;
      participantId: string; // PAIR participant
      participant?: PairParticipant;
    },
    {
      sideNumber: 2;
      participantId: string;
      participant?: PairParticipant;
    },
  ];
  score?: Score;
  winningSide?: 1 | 2;
};
```

### TEAM

A matchUp between two TEAM participants, containing multiple collection matchUps:

```ts
type TeamMatchUp = {
  matchUpId: string;
  matchUpType: 'TEAM';
  matchUpStatus: MatchUpStatus;
  tieFormat: TieFormat; // Defines structure of team match
  sides: [
    {
      sideNumber: 1;
      participantId: string; // TEAM participant
      lineUp?: IndividualParticipant[];
    },
    {
      sideNumber: 2;
      participantId: string;
      lineUp?: IndividualParticipant[];
    },
  ];
  tieMatchUps?: CollectionMatchUp[]; // Individual matches within team match
  score?: TeamScore;
  winningSide?: 1 | 2;
};
```

**See:** [Tie Format](./tieFormat) and [Tie MatchUp](./tieMatchUp) for team match details.

## MatchUp Status

MatchUps progress through various states:

### Pre-Match Statuses

- **TO_BE_PLAYED** - Match is scheduled but not started
- **BYE** - One participant received a bye
- **WALKOVER** - Opponent did not appear
- **DEFAULTED** - Participant disqualified before starting

### During Match

- **IN_PROGRESS** - Match currently being played
- **SUSPENDED** - Match temporarily halted
- **INTERRUPTED** - Match paused (rain delay, etc.)

### Post-Match

- **COMPLETED** - Match finished with score
- **RETIRED** - Participant withdrew during match
- **ABANDONED** - Match canceled/voided
- **CANCELLED** - Match will not be played
- **DEAD_RUBBER** - Match outcome irrelevant to progression

### Example Usage

```js
const { matchUps } = tournamentEngine.allTournamentMatchUps({
  matchUpFilters: {
    matchUpStatuses: ['COMPLETED', 'RETIRED', 'DEFAULTED'],
  },
});

console.log(`${matchUps.length} finished matches`);
```

## Retrieving MatchUps

### Tournament-Wide

Get all matchUps across entire tournament:

```js

**API Reference:** [allTournamentMatchUps](/docs/governors/query-governor#alltournamentmatchups)

const { matchUps } = tournamentEngine.allTournamentMatchUps({
  inContext: true,  // Add tournament/event/draw context (default)
  nextMatchUps: true  // Include winnerTo/loserTo information
});

// MatchUps are automatically returned with context
matchUps.forEach(matchUp => {
  console.log(`${matchUp.tournamentName} - ${matchUp.eventName}`);
  console.log(`  ${matchUp.drawName} - Round ${matchUp.roundNumber}`);
});
```

### Event-Specific

Get matchUps for a specific event:

```js

**API Reference:** [allTournamentMatchUps](/docs/governors/query-governor#alltournamentmatchups)

const { matchUps } = tournamentEngine.allEventMatchUps({
  eventId: 'singles-main',
  inContext: true
});
```

### Draw-Specific

Get matchUps from a specific draw:

```js

**API Reference:** [allEventMatchUps](/docs/governors/query-governor#alleventmatchups)

const { matchUps } = tournamentEngine.allDrawMatchUps({
  drawId: 'draw-123',
  inContext: true
});
```

### With Filters

Filter matchUps by various criteria:

```js

**API Reference:** [allDrawMatchUps](/docs/governors/query-governor#alldrawmatchups)

const { matchUps } = tournamentEngine.allTournamentMatchUps({
  matchUpFilters: {
    matchUpStatuses: ['COMPLETED'],
    matchUpTypes: ['SINGLES', 'DOUBLES'],
    roundNumbers: [1, 2],
    hasWinningSide: true
  },
  contextFilters: {
    scheduledDate: '2024-06-15',
    venueIds: ['venue-123'],
    courtIds: ['court-1', 'court-2']
  }
});
```

**See:** [MatchUp Filtering](./matchup-filtering) for comprehensive filtering options.

## MatchUp Sides

Each matchUp has two sides representing the competing participants:

```js

**API Reference:** [allTournamentMatchUps](/docs/governors/query-governor#alltournamentmatchups)

{
  matchUpId: 'match-123',
  sides: [
    {
      sideNumber: 1,
      participantId: 'player-1',
      participant: {  // Added when inContext: true
        participantType: 'INDIVIDUAL',
        person: { standardFamilyName: 'Federer' }
      }
    },
    {
      sideNumber: 2,
      participantId: 'player-2',
      participant: {
        participantType: 'INDIVIDUAL',
        person: { standardFamilyName: 'Nadal' }
      }
    }
  ]
}
```

### Winning Side

After completion, winningSide indicates the victor:

```js
if (matchUp.matchUpStatus === 'COMPLETED') {
  const winner = matchUp.sides.find((s) => s.sideNumber === matchUp.winningSide);
  const loser = matchUp.sides.find((s) => s.sideNumber !== matchUp.winningSide);
  console.log(`Winner: ${winner.participant.person.standardFamilyName}`);
}
```

## Scores

MatchUp scores follow CODES score structure:

```js
{
  matchUpId: 'match-123',
  score: {
    sets: [
      {
        setNumber: 1,
        side1Score: 6,
        side2Score: 4,
        winningSide: 1
      },
      {
        setNumber: 2,
        side1Score: 7,
        side2Score: 6,
        side1TiebreakScore: 7,
        side2TiebreakScore: 5,
        winningSide: 1
      }
    ],
    scoreStringSide1: '6-4 7-6(7)',
    scoreStringSide2: '4-6 6-7(5)'
  },
  winningSide: 1
}
```

### Setting Scores

```js
tournamentEngine.setMatchUpStatus({
  matchUpId: 'match-123',
  drawId: 'draw-456',
  outcome: {
    score: {
      sets: [
        { side1Score: 6, side2Score: 4, winningSide: 1 },
        { side1Score: 6, side2Score: 3, winningSide: 1 },
      ],
    },
    winningSide: 1,
  },
});
```

## Scheduling Information

MatchUps include comprehensive scheduling details:

```js

**API Reference:** [setMatchUpStatus](/docs/governors/matchup-governor#setmatchupstatus)

{
  matchUpId: 'match-123',
  schedule: {
    scheduledDate: '2024-06-15',
    scheduledTime: '14:00',
    venueId: 'venue-123',
    courtId: 'court-5',
    courtName: 'Court 5',
    startTime: '2024-06-15T14:05:00Z',
    endTime: '2024-06-15T15:45:00Z'
  },
  // Additional context when inContext: true
  venueName: 'Stadium',
  courtOrder: 2  // Order of play on this court
}
```

### Scheduling MatchUps

```js
tournamentEngine.addMatchUpScheduleItems({
  matchUpId: 'match-123',
  drawId: 'draw-456',
  schedule: {
    scheduledDate: '2024-06-15',
    scheduledTime: '14:00',
    venueId: 'venue-123',
    courtId: 'court-5',
  },
});
```

**See:** [Scheduling Overview](./scheduling-overview) for detailed scheduling workflows.

## Officials and Check-In

### Assigning Officials

```js
// Assign referee
tournamentEngine.addMatchUpOfficial({
  matchUpId: 'match-123',
  drawId: 'draw-456',
  participantId: 'official-789',
  officialType: 'REFEREE',
});
```

### Participant Check-In

Track participant availability:

```js
// Check in participants
tournamentEngine.checkInParticipant({
  matchUpId: 'match-123',
  participantId: 'player-1',
});

// Both participants checked in?
if (matchUp.sides.every((side) => side.checkInState === 'CHECKED_IN')) {
  console.log('Match ready to start');
}
```

## Next MatchUps (Winner/Loser Progression)

When `nextMatchUps: true`, each matchUp includes progression information:

```js

**API Reference:** [checkInParticipant](/docs/governors/matchup-governor#checkinparticipant)

const { matchUps } = tournamentEngine.allDrawMatchUps({
  drawId: 'draw-123',
  nextMatchUps: true
});

matchUps.forEach(matchUp => {
  if (matchUp.winnerTo) {
    console.log(`Winner advances to matchUp ${matchUp.winnerTo.matchUpId}`);
    console.log(`  Round ${matchUp.winnerTo.roundNumber}`);
  }
  if (matchUp.loserTo) {
    console.log(`Loser feeds to matchUp ${matchUp.loserTo.matchUpId}`);
    console.log(`  Consolation Round ${matchUp.loserTo.roundNumber}`);
  }
});
```

## Collection MatchUps (TEAM Matches)

TEAM matchUps contain collection matchUps (individual matches):

```js

**API Reference:** [allDrawMatchUps](/docs/governors/query-governor#alldrawmatchups)

const teamMatchUp = {
  matchUpId: 'team-match-123',
  matchUpType: 'TEAM',
  tieMatchUps: [
    {
      matchUpId: 'singles-1',
      matchUpType: 'SINGLES',
      collectionId: 'singles-collection',
      collectionPosition: 1
    },
    {
      matchUpId: 'singles-2',
      matchUpType: 'SINGLES',
      collectionId: 'singles-collection',
      collectionPosition: 2
    },
    {
      matchUpId: 'doubles-1',
      matchUpType: 'DOUBLES',
      collectionId: 'doubles-collection',
      collectionPosition: 1
    }
  ]
};

// Access individual matches
teamMatchUp.tieMatchUps.forEach(tieMatchUp => {
  console.log(`${tieMatchUp.matchUpType} Match ${tieMatchUp.collectionPosition}`);
});
```

## MatchUp Actions

Get available actions for a matchUp:

```js
const { validActions } = tournamentEngine.matchUpActions({
  matchUpId: 'match-123',
  drawId: 'draw-456',
});

validActions.forEach((action) => {
  console.log(`Available: ${action.type}`);
  // - SCORE: Can enter score
  // - SCHEDULE: Can set schedule
  // - ASSIGN_OFFICIAL: Can assign referee
  // - etc.
});
```

**See:** [Actions](./actions#matchupactions) for complete action documentation.

## Mutation Timestamps

Every matchUp carries an `updatedAt` field stamped with an ISO UTC timestamp at the end of every mutation that flows through the factory's notification hooks — score changes, status changes, schedule updates, lineup operations, structure attachment, and so on. Consumers use this for audit trails, "team was active" indicators, scheduler dashboards, and freshness checks without having to walk the drawDefinition.

```js
{
  matchUpId: 'match-123',
  updatedAt: '2026-04-16T17:25:31.142Z',
  // ...
}
```

The stamp is **monotonic**: if two mutations land in the same millisecond, the later one is bumped by 1ms so consumers always see strictly-increasing values. Both string and `Date` previous values are tolerated.

`updatedAt` flows through hydrated views (`tournamentMatchUps`, `allTournamentMatchUps`, `getAllDrawMatchUps`) automatically. Deletion does not stamp the deleted matchUp; the `inContextMatchUp` derived view also skips stamping since it's not canonical state.

## Common Use Cases

### Display Order of Play

```js

**API Reference:** [matchUpActions](/docs/governors/query-governor#matchupactions)

const { matchUps } = tournamentEngine.allTournamentMatchUps({
  contextFilters: {
    scheduledDate: '2024-06-15',
    venueIds: ['main-stadium']
  },
  matchUpFilters: {
    matchUpStatuses: ['TO_BE_PLAYED', 'IN_PROGRESS']
  }
});

// Group by court
const byCourt = matchUps.reduce((acc, matchUp) => {
  const courtId = matchUp.schedule?.courtId || 'unscheduled';
  if (!acc[courtId]) acc[courtId] = [];
  acc[courtId].push(matchUp);
  return acc;
}, {});

// Display
Object.entries(byCourt).forEach(([courtId, matches]) => {
  console.log(`\n${matches[0]?.courtName || 'Unscheduled'}:`);
  matches.forEach(m => {
    console.log(`  ${m.schedule.scheduledTime} - ${m.roundName}`);
  });
});
```

### Results Feed

```js

**API Reference:** [allTournamentMatchUps](/docs/governors/query-governor#alltournamentmatchups)

const { matchUps } = tournamentEngine.allTournamentMatchUps({
  matchUpFilters: {
    matchUpStatuses: ['COMPLETED']
  }
});

// Sort by completion time
matchUps
  .sort((a, b) =>
    new Date(b.schedule?.endTime || 0) - new Date(a.schedule?.endTime || 0)
  )
  .slice(0, 10)  // Latest 10 results
  .forEach(matchUp => {
    const winner = matchUp.sides.find(s => s.sideNumber === matchUp.winningSide);
    const loser = matchUp.sides.find(s => s.sideNumber !== matchUp.winningSide);
    console.log(`${winner.participant.person.standardFamilyName} d. ${loser.participant.person.standardFamilyName}`);
    console.log(`  ${matchUp.score.scoreStringSide1}`);
  });
```

### Live Matches

```js

**API Reference:** [allTournamentMatchUps](/docs/governors/query-governor#alltournamentmatchups)

const { matchUps } = tournamentEngine.allTournamentMatchUps({
  matchUpFilters: {
    matchUpStatuses: ['IN_PROGRESS']
  }
});

console.log(`${matchUps.length} matches in progress`);
matchUps.forEach(matchUp => {
  console.log(`${matchUp.courtName}: ${matchUp.roundName}`);
  matchUp.sides.forEach(side => {
    console.log(`  ${side.participant.person.standardFamilyName}`);
  });
});
```

## Related Documentation

- **[MatchUp Context](./matchup-context)** - Understanding hydration and contextual data
- **[MatchUp Filtering](./matchup-filtering)** - Comprehensive filtering options
- **[Actions](./actions#matchupactions)** - Available matchUp actions
- **[Tie Format](./tieFormat)** - Team match structure
- **[Scheduling Overview](./scheduling-overview)** - Match scheduling workflows
- **[Query Governor](/docs/governors/query-governor#alltournamentmatchups)** - Complete API reference
