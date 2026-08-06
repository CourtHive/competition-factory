---
title: Participant Context & Hydration
---

## Overview

**Participants** can be returned with contextual information that is not part of the core [CODES](/docs/data-standards#codes) document node. The process of adding this contextual information is called **"hydration"** or adding **"context"**.

By default, a participant in the tournament record contains only essential data. Through hydration, the Competition Factory can enrich participant objects with:

- Events and draws they're entered in
- MatchUps they've played or will play
- Statistics (wins, losses, sets won)
- Opponent information
- Ratings and rankings from timeItems
- Individual participant details (for PAIR/TEAM/GROUP)
- Custom extensions as accessible attributes

## Core vs. Hydrated Participants

### Core Participant (In Tournament Record)

```js
{
  participantId: 'player-123',
  participantType: 'INDIVIDUAL',
  participantRole: 'COMPETITOR',
  person: {
    personId: 'person-456',
    standardFamilyName: 'Nadal',
    standardGivenName: 'Rafael'
  }
}
```

### Fully Hydrated Participant

```js
{
  // Core attributes
  participantId: 'player-123',
  participantType: 'INDIVIDUAL',
  participantRole: 'COMPETITOR',
  person: {
    personId: 'person-456',
    standardFamilyName: 'Nadal',
    standardGivenName: 'Rafael',
    nationalityCode: 'ESP'
  },

  // Added by hydration
  events: [                      // Added by withEvents
    { eventId: 'event-singles', eventName: 'Men\'s Singles' }
  ],
  draws: [                       // Added by withDraws
    { drawId: 'draw-123', drawName: 'Main Draw' }
  ],
  matchUps: [                    // Added by withMatchUps
    {
      matchUpId: 'match-1',
      matchUpStatus: 'COMPLETED',
      winningSide: 1,
      score: { ... }
    }
  ],
  statistics: {                  // Added by withStatistics
    matchUpsPlayed: 5,
    matchUpsWon: 4,
    matchUpsLost: 1,
    setsWon: 9,
    setsLost: 3,
    gamesWon: 72,
    gamesLost: 48
  },
  opponents: [                   // Added by withOpponents
    { participantId: 'player-456', participantName: 'Djokovic' }
  ],
  rankings: {                    // Added by withScaleValues
    SINGLES: { rating: 1250, ranking: 2 }
  }
}
```

## Hydration Options

### withMatchUps

Add all matchUps where the participant has competed:

```js
const { participants } = tournamentEngine.getParticipants({
  withMatchUps: true,
});

participants.forEach((p) => {
  console.log(`${p.person.standardFamilyName}: ${p.matchUps.length} matches`);
  p.matchUps.forEach((matchUp) => {
    console.log(`  - ${matchUp.matchUpStatus} on ${matchUp.schedule?.scheduledDate}`);
  });
});
```

**Result includes:**

- Completed matchUps with scores
- Scheduled matchUps
- MatchUp details (opponents, dates, venues)
- Match outcome (won/lost)

### withStatistics

Add calculated win/loss statistics:

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

```js
const { participants } = tournamentEngine.getParticipants({
  withStatistics: true,
});

participants.forEach((p) => {
  const stats = p.statistics;
  const winPct = ((stats.matchUpsWon / stats.matchUpsPlayed) * 100).toFixed(1);
  console.log(`${p.person.standardFamilyName}: ${winPct}% (${stats.matchUpsWon}-${stats.matchUpsLost})`);
});
```

**Statistics included:**

- `matchUpsPlayed`, `matchUpsWon`, `matchUpsLost`
- `setsWon`, `setsLost`
- `gamesWon`, `gamesLost`
- `pointsWon`, `pointsLost` (if available)

### withOpponents

Include information about all opponents faced:

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

```js
const { participants } = tournamentEngine.getParticipants({
  withOpponents: true,
  withMatchUps: true, // Often used together
});

participants.forEach((p) => {
  console.log(`${p.person.standardFamilyName} opponents:`);
  p.opponents.forEach((opponent) => {
    console.log(`  - ${opponent.participantName || opponent.person.standardFamilyName}`);
  });
});
```

### withIndividualParticipants

For PAIR, TEAM, or GROUP participants, expand to include full individual participant details:

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

```js
const { participants } = tournamentEngine.getParticipants({
  participantFilters: { participantTypes: ['PAIR'] },
  withIndividualParticipants: true
});

// Before hydration:
{
  participantId: 'pair-123',
  participantType: 'PAIR',
  individualParticipantIds: ['player-1', 'player-2']
}

// After hydration:
{
  participantId: 'pair-123',
  participantType: 'PAIR',
  participantName: 'Bryan/Bryan',
  individualParticipantIds: ['player-1', 'player-2'],
  individualParticipants: [      // ← Added
    {
      participantId: 'player-1',
      person: { standardFamilyName: 'Bryan', standardGivenName: 'Bob' }
    },
    {
      participantId: 'player-2',
      person: { standardFamilyName: 'Bryan', standardGivenName: 'Mike' }
    }
  ]
}
```

**Critical for:**

- Displaying doubles pair names
- Team roster information
- Understanding group composition

### withScaleValues

Convert timeItems (rankings/ratings) into accessible scale values:

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

```js
const { participants } = tournamentEngine.getParticipants({
  withScaleValues: true,
});

participants.forEach((p) => {
  if (p.rankings?.SINGLES) {
    console.log(`${p.person.standardFamilyName}: Rank ${p.rankings.SINGLES.ranking}`);
  }
  if (p.ratings?.SINGLES) {
    console.log(`  Rating: ${p.ratings.SINGLES.rating}`);
  }
});
```

**Converts timeItems like:**

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

```js
// From:
timeItems: [{
  itemType: 'RANKING.SINGLES',
  itemValue: '45',
  itemDate: '2024-01-15'
}]

// To:
rankings: {
  SINGLES: {
    ranking: 45,
    rankingDate: '2024-01-15'
  }
}
```

### convertExtensions

Convert extensions to underscore-prefixed attributes for easy access:

```js
const { participants } = tournamentEngine.getParticipants({
  convertExtensions: true
});

// Extension in tournament record:
{
  extensions: [{
    name: 'membershipLevel',
    value: 'GOLD'
  }]
}

// After conversion:
{
  extensions: [...],
  _membershipLevel: 'GOLD'  // ← Easily accessible
}

// Usage:
if (participant._membershipLevel === 'GOLD') {
  // Provide benefits
}
```

### withEvents and withDraws

Add event and draw information:

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

```js
const { participants } = tournamentEngine.getParticipants({
  withEvents: true,
  withDraws: true,
});

participants.forEach((p) => {
  console.log(`${p.person.standardFamilyName}:`);
  p.events?.forEach((event) => {
    console.log(`  Event: ${event.eventName}`);
  });
  p.draws?.forEach((draw) => {
    console.log(`  Draw: ${draw.drawName}`);
  });
});
```

## Schedule Analysis

Detect participants with scheduling conflicts:

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

```js
const { participants, participantIdsWithConflicts } = tournamentEngine.getParticipants({
  withMatchUps: true,
  scheduleAnalysis: {
    scheduledMinutesDifference: 60, // Flag matches within 60 minutes
  },
});

if (participantIdsWithConflicts.length > 0) {
  console.log('Participants with scheduling conflicts:');
  participantIdsWithConflicts.forEach((participantId) => {
    const participant = participants.find((p) => p.participantId === participantId);
    console.log(`  - ${participant.person.standardFamilyName}`);

    // Conflicts available in participant.scheduleConflicts
    participant.scheduleConflicts.forEach((conflict) => {
      console.log(`    Conflict: ${conflict.matchUpId1} vs ${conflict.matchUpId2}`);
    });
  });
}
```

**See:** [Scheduling Conflicts](./scheduling-conflicts) for detailed conflict management.

## Combined Hydration Example

Retrieve fully enriched participant data for display:

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

```js
const { participants } = tournamentEngine.getParticipants({
  participantFilters: {
    participantTypes: ['INDIVIDUAL'],
    participantRoles: ['COMPETITOR'],
    eventIds: ['singles-main'],
  },
  // Hydration options
  withMatchUps: true,
  withStatistics: true,
  withOpponents: true,
  withScaleValues: true,
  withEvents: true,
  withDraws: true,
  convertExtensions: true,
  // Schedule analysis
  scheduleAnalysis: {
    scheduledMinutesDifference: 90,
  },
  // Privacy
  policyDefinitions: { participant: participantPolicy },
});

// Result: Fully hydrated participants ready for display
participants.forEach((participant) => {
  renderPlayerCard({
    name: `${participant.person.standardGivenName} ${participant.person.standardFamilyName}`,
    nationality: participant.person.nationalityCode,
    ranking: participant.rankings?.SINGLES?.ranking,
    rating: participant.ratings?.SINGLES?.rating,
    stats: participant.statistics,
    upcomingMatches: participant.matchUps.filter((m) => m.matchUpStatus === 'TO_BE_PLAYED'),
    completedMatches: participant.matchUps.filter((m) => m.matchUpStatus === 'COMPLETED'),
    membershipLevel: participant._membershipLevel,
    hasConflicts: participant.scheduleConflicts?.length > 0,
  });
});
```

## Performance Considerations

### What to Hydrate

**Always hydrate:**

- Data needed for immediate display
- Required for business logic

**Avoid hydrating:**

- Unnecessary data that slows retrieval
- Data available through other means

### Selective Hydration

```js
// Bad: Hydrate everything
const { participants } = tournamentEngine.getParticipants({
  withMatchUps: true,
  withStatistics: true,
  withOpponents: true,
  withIndividualParticipants: true,
  withScaleValues: true,
  // ... participant list takes 2 seconds to load
});

// Good: Only what's needed
const { participants } = tournamentEngine.getParticipants({
  withStatistics: true, // Only need stats for leaderboard
  withScaleValues: true, // And rankings
  // ... participant list loads in 200ms
});
```

### Participant Map

For fast lookups without full hydration:

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

```js
const {
  participantMap, // Object: { [participantId]: participant }
} = tournamentEngine.getParticipants({
  // participantMap is NOT fully hydrated (performance optimization)
});

// Fast lookup
const participant = participantMap['player-123'];
```

**Note:** `participantMap` participants are NOT fully hydrated. Use for quick ID→participant lookups only.

## Custom Context

Pass additional context to be added to all participants:

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

```js
const { participants } = tournamentEngine.getParticipants({
  context: {
    tournamentName: 'US Open 2024',
    surfaceType: 'HARD',
    customAttribute: 'value',
  },
});

// All participants now have context attributes:
participants.forEach((p) => {
  console.log(`${p.person.standardFamilyName} at ${p.context.tournamentName}`);
});
```

## Hydration for Different Participant Types

### INDIVIDUAL Hydration

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

```js
const { participants } = tournamentEngine.getParticipants({
  participantFilters: { participantTypes: ['INDIVIDUAL'] },
  withMatchUps: true,
  withStatistics: true,
});

// Individuals get their direct match history and stats
```

### PAIR Hydration

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

```js
const { participants } = tournamentEngine.getParticipants({
  participantFilters: { participantTypes: ['PAIR'] },
  withIndividualParticipants: true, // Critical for pairs
  withMatchUps: true,
  withStatistics: true,
});

// Each pair now shows:
// - Combined pair statistics
// - Full details of both individual partners
// - Pair's match history
```

### TEAM Hydration

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

```js
const { participants } = tournamentEngine.getParticipants({
  participantFilters: { participantTypes: ['TEAM'] },
  withIndividualParticipants: true, // Shows full roster
  withMatchUps: true,
  withStatistics: true,
});

// Each team now shows:
// - Complete roster with individual details
// - Team match history
// - Team statistics
```

## Related Documentation

- **[Participants Overview](./participants)** - Participant types and management
- **[Scheduling Conflicts](./scheduling-conflicts)** - Understanding schedule analysis
- **[Participant Policy](/docs/policies/participantPolicy)** - Privacy and data filtering
- **[Query Governor](/docs/governors/query-governor#getparticipants)** - Complete API reference
- **[Extensions](./extensions)** - Understanding CODES extensions system
