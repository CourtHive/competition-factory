---
title: Draws
sidebar_position: 4
---

# Draw Generation and Management in TMX

The Draws interface in TMX provides comprehensive tools for generating, visualizing, and managing draw structures. This demonstrates the full power of the [Draws Governor](../governors/draws-governor.md) and related draw management methods.

:::info Screenshots Coming Soon
This page will be updated with screenshots showing the TMX draw generation and management interface.
:::

## Overview

Draw management in TMX includes:

- **Draw Generation** - Multiple draw types and formats
- **Seeding** - Various seeding profiles and manual overrides
- **Position Assignment** - Manual and automatic participant placement
- **Byes Management** - Automatic and manual bye placement
- **Qualification** - Qualifying draw integration
- **Lucky Losers** - Integration of qualifying players
- **Bracket Visualization** - Interactive draw display
- **Draw Modification** - Editing positions, swapping players, adding/removing participants

## Factory Methods Used

### Creating Draws

```js
// Generate draw with automatic placement
tournamentEngine.generateDrawDefinition({
  eventId,
  drawSize: 32,
  drawType: 'SINGLE_ELIMINATION',
  seedingProfile: 'WATERFALL',
  automated: true,
  seedsCount: 8,
});

// Create empty draw for manual placement
tournamentEngine.addDrawDefinition({
  eventId,
  drawSize: 32,
  drawType: 'SINGLE_ELIMINATION',
  automated: false,
});
```

### Seeding Participants

```js
// Auto-seed from rankings
tournamentEngine.autoSeeding({
  eventId,
  drawId,
  policyDefinitions: SEEDING_POLICY
});

// Manual seeding
tournamentEngine.assignSeed({
  eventId,
  drawId,
  participantId,
  seedNumber: 1,
  seedValue: '1'
});

// Set all seeds at once
tournamentEngine.setParticipantScaleItems({
  eventId,
  participantIds: [...],
  seedAssignments: [
    { participantId: id1, seedNumber: 1, seedValue: '1' },
    { participantId: id2, seedNumber: 2, seedValue: '2' }
  ]
});
```

### Position Assignment

```js
// Assign to specific position
tournamentEngine.assignDrawPosition({
  eventId,
  drawId,
  structureId,
  drawPosition: 1,
  participantId,
});

// Assign to multiple positions
tournamentEngine.assignDrawPosition({
  eventId,
  drawId,
  structureId,
  assignments: [
    { drawPosition: 1, participantId: id1 },
    { drawPosition: 2, participantId: id2 },
  ],
});

// Automatic positioning of seeds
tournamentEngine.automatedPositioning({
  eventId,
  drawId,
  structureId,
  seedingProfile: 'WATERFALL',
});
```

## Draw Types

TMX supports all factory draw types:

### Single Elimination

```js
{
  drawType: 'SINGLE_ELIMINATION',
  drawSize: 32,
  seedingProfile: 'WATERFALL'
}
```

### Compass Draw

```js
{
  drawType: 'COMPASS',
  drawSize: 16,
  compassDirection: 'EAST' // EAST, WEST, NORTH, SOUTH, NORTHEAST, etc.
}
```

### Round Robin

```js
{
  drawType: 'ROUND_ROBIN',
  drawSize: 8,
  groupSize: 4
}
```

### Feed-In Championship

```js
{
  drawType: 'FEED_IN_CHAMPIONSHIP',
  drawSize: 32,
  feedPolicy: 'TOP_DOWN'
}
```

### Curtis Consolation

```js
{
  drawType: 'FIRST_MATCH_LOSER_CONSOLATION',
  drawSize: 16
}
```

### Modified Feed-In

```js
{
  drawType: 'MODIFIED_FEED_IN_CHAMPIONSHIP',
  drawSize: 32
}
```

## Seeding Profiles

### Waterfall (Traditional)

```js
{
  seedingProfile: 'WATERFALL',
  seedsCount: 8
}
// Seeds: 1, 2, 3-4, 5-8, 9-16, etc.
```

### Separate

```js
{
  seedingProfile: 'SEPARATE',
  seedsCount: 8
}
// Maximizes separation of seeds
```

### Cluster

```js
{
  seedingProfile: 'CLUSTER',
  seedsCount: 8
}
// Groups seeds in same section
```

## Key Features

### Automated Draw Generation

Complete draw generation in one call:

```js
const result = tournamentEngine.generateDrawDefinition({
  eventId,
  drawSize: 32,
  drawType: 'SINGLE_ELIMINATION',
  seedingProfile: 'WATERFALL',
  automated: true,
  seedsCount: 8,
  matchUpFormat: 'SET3-S:6/TB7',
});

// Returns complete draw with:
// - Seeds positioned
// - Unseeded players positioned
// - Byes placed automatically
// - MatchUps created
```

### Manual Draw Control

Step-by-step draw construction:

```js
// 1. Create empty draw
const { drawDefinition } = tournamentEngine.addDrawDefinition({
  eventId,
  drawSize: 32,
  drawType: 'SINGLE_ELIMINATION',
});

// 2. Assign seeds
tournamentEngine.setParticipantScaleItems({
  eventId,
  participantIds,
  seedAssignments: [...seeding],
});

// 3. Position seeds
tournamentEngine.automatedPositioning({
  eventId,
  drawId: drawDefinition.drawId,
  seedingProfile: 'WATERFALL',
});

// 4. Position remaining participants
tournamentEngine.assignDrawPosition({
  eventId,
  drawId: drawDefinition.drawId,
  assignments: [...unseeded],
});
```

### Bye Management

```js
// Get available positions for byes
const { positionAssignments } = tournamentEngine.getPositionAssignments({
  eventId,
  drawId,
});

const byePositions = positionAssignments.filter((p) => p.bye);

// Place bye
tournamentEngine.assignDrawPositionBye({
  eventId,
  drawId,
  structureId,
  drawPosition: position,
});
```

### Qualifying Integration

```js
// Add qualifying structure
tournamentEngine.addDrawDefinition({
  eventId,
  drawSize: 16,
  drawType: 'SINGLE_ELIMINATION',
  drawName: 'Qualifying',
  entryStage: 'QUALIFYING',
});

// Link qualifier positions to main draw
tournamentEngine.attachQualifyingStructure({
  eventId,
  mainDrawId,
  qualifyingDrawId,
  qualifyingPositions: 4, // Number of qualifiers
});
```

### Lucky Loser Assignment

```js
// Get available lucky loser positions
const { availablePositions } = tournamentEngine.getLuckyLoserAvailability({
  eventId,
  drawId,
});

// Assign lucky loser
tournamentEngine.assignLuckyLoser({
  eventId,
  drawId,
  structureId,
  drawPosition,
  participantId, // From qualifying losers
});
```

## UI Components

TMX uses these [courthive-components](https://courthive.github.io/courthive-components/):

- **DrawDisplay** - Interactive bracket visualization
- **DrawGeneration** - Draw creation wizard
- **SeedingEditor** - Seeding assignment interface
- **PositionEditor** - Drag-and-drop positioning
- **QualifyingDrawManager** - Qualifying structure management

## Common Workflows

### Complete Draw Generation

```js
// Get event entries
const { eventEntries } = tournamentEngine.getEventEntries({ eventId });

// Calculate draw size
const drawSize = getDrawSize(eventEntries.length);

// Generate draw
const { drawDefinition } = tournamentEngine.generateDrawDefinition({
  eventId,
  drawSize,
  drawType: 'SINGLE_ELIMINATION',
  seedingProfile: 'WATERFALL',
  automated: true,
  seedsCount: Math.min(8, Math.floor(drawSize / 4)),
  matchUpFormat: 'SET3-S:6/TB7',
});

console.log(`Draw created: ${drawDefinition.drawId}`);
```

### Manual Seeding Workflow

```js
// 1. Get unseeded participants
const { participants } = tournamentEngine.getParticipants({
  withSeeding: true,
});

const unseeded = participants.filter((p) => !p.seedValue);

// 2. Show seeding UI to tournament director
// User assigns seed numbers

// 3. Apply seeding
const seedAssignments = unseeded.map((p, i) => ({
  participantId: p.participantId,
  seedNumber: i + 1,
  seedValue: `${i + 1}`,
}));

tournamentEngine.setParticipantScaleItems({
  eventId,
  participantIds: unseeded.map((p) => p.participantId),
  seedAssignments,
});

// 4. Generate draw with seeds
tournamentEngine.generateDrawDefinition({
  eventId,
  drawSize: 32,
  automated: true,
});
```

### Draw Modification

```js
// Swap two participants
tournamentEngine.swapDrawPositionAssignments({
  eventId,
  drawId,
  structureId,
  drawPositions: [1, 32], // Swap positions 1 and 32
});

// Remove participant and replace with bye
tournamentEngine.removeDrawPositionAssignment({
  eventId,
  drawId,
  structureId,
  drawPosition: 5,
});

tournamentEngine.assignDrawPositionBye({
  eventId,
  drawId,
  structureId,
  drawPosition: 5,
});

// Add alternate to draw
tournamentEngine.alternateDrawPositionAssignment({
  eventId,
  drawId,
  structureId,
  drawPosition: 10,
  participantId: alternateId,
});
```

### Multi-Flight Draw Generation

```js
// Get flight profile
const { flightProfile } = tournamentEngine.getFlightProfile({ eventId });

// Generate draw for each flight
flightProfile.flights.forEach((flight) => {
  // Get entries for this flight
  const flightEntries = getFlightEntries(eventId, flight.flightNumber);

  // Generate draw
  tournamentEngine.generateDrawDefinition({
    eventId,
    drawSize: flight.drawSize,
    drawType: 'SINGLE_ELIMINATION',
    seedingProfile: 'WATERFALL',
    automated: true,
    drawName: flight.flightName,
  });
});
```

## Draw Queries

```js
// Get all draws for event
const { drawDefinitions } = tournamentEngine.getEventDraws({ eventId });

// Get specific draw details
const { drawDefinition } = tournamentEngine.getDrawDefinition({
  eventId,
  drawId,
});

// Get draw structure
const { structures } = tournamentEngine.getDrawStructures({
  eventId,
  drawId,
});

// Get position assignments
const { positionAssignments } = tournamentEngine.getPositionAssignments({
  eventId,
  drawId,
  structureId,
});

// Check draw validity
const { valid, errors } = tournamentEngine.checkDrawValidity({
  eventId,
  drawId,
});
```

## Best Practices

### Draw Planning

- Calculate appropriate draw size (next power of 2)
- Consider bye placement for smaller fields
- Plan seeding before generation
- Decide on seeding profile based on competition level

### Seeding

- Use rankings/ratings when available
- Apply federation seeding rules
- Validate seed counts (typically 25-33% of draw size)
- Separate seeds appropriately

### Generation Strategy

- Use automated generation when possible
- Manual construction for special requirements
- Test draw validity before finalizing
- Provide preview before commitment

### Modification Caution

- Avoid changes after play begins
- Document all manual changes
- Validate draw after modifications
- Check matchUp integrity after swaps

### Performance

- Generate draws in batches for multiple events
- Cache draw definitions
- Use efficient queries for position data
- Minimize regeneration operations

## Related Documentation

- [Draws Governor](../governors/draws-governor.md) - All draw-related methods
- [Draw Concepts](../concepts/draws-overview.mdx) - Draw types and structures
- [Seeding Concepts](../policies/positioningSeeds.mdx) - Seeding policies and profiles
- [Position Actions](../concepts/actions.mdx) - Valid position operations

## Next Steps

Once draws are generated and finalized, proceed to [MatchUps](./matchups.md) to manage scoring and match progression.
