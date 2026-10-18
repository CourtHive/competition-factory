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

These examples use factory engine methods. TMX's UI helpers are separate application code.
A generated draw is returned to the caller; attach it explicitly before issuing mutations by draw ID.

### Creating Draws

```js
const { drawDefinition, error } = tournamentEngine.generateDrawDefinition({
  eventId,
  drawSize: 32,
  drawType: 'SINGLE_ELIMINATION',
  automated: false,
  seedsCount: 8,
});
if (error) throw new Error(error.message);
if (!drawDefinition) throw new Error('Draw generation failed');
const result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
if (result.error) throw new Error(result.error.message);
const drawId = drawDefinition.drawId;
const structureId = drawDefinition.structures?.[0]?.structureId;
if (!structureId) throw new Error('Missing main structure');
```

### Seeding Participants

```js
// Set a displayed seed on an existing participant in this structure.
tournamentEngine.modifySeedAssignment({ drawId, structureId, participantId, seedValue: '1' });
// Position the seeded and unseeded entries using the chosen positioning policy.
tournamentEngine.automatedPositioning({ drawId, structureId });
```

`seedNumber` identifies an assignment; `seedValue` is its display value. For ranked automatic seeding,
see the [Seeding Policy](../policies/seedingPolicy.md). Participant scale items are not seed assignments.

### Position Assignment

```js
for (const assignment of assignments) {
  const result = tournamentEngine.assignDrawPosition({ drawId, structureId, ...assignment });
  if (result.error) throw new Error(result.error.message);
}
```

Review position actions and errors before changing a draw in play.

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

Generate with `automated: false`, attach the returned definition, then assign seeds and positions as
above. Use `getPositionAssignments({ drawId, structureId })` to inspect empty, BYE and occupied slots.
Qualifying structures belong to the same draw; see [Draw Links](../concepts/draw-links.mdx) for the
link model and [Draws Governor](../governors/draws-governor.md) for qualifying attachment parameters.

### Lucky Loser Assignment

Use [position actions](../concepts/actions.mdx) to discover which replacements are legal for a
specific position. There is no draw-wide lucky-loser availability query.

```js
const result = tournamentEngine.luckyLoserDrawPositionAssignment({
  drawId,
  structureId,
  drawPosition,
  luckyLoserParticipantId: participantId,
});
if (result.error) throw new Error(result.error.message);
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
const { event } = tournamentEngine.getEvent({ eventId });
const mainEntries = (event.entries ?? []).filter((entry) => entry.entryStage === 'MAIN');
const drawSize = Math.max(2, 2 ** Math.ceil(Math.log2(mainEntries.length || 1)));
const { drawDefinition, error } = tournamentEngine.generateDrawDefinition({
  eventId,
  drawSize,
  drawType: 'SINGLE_ELIMINATION',
  automated: true,
  seedsCount: Math.min(8, Math.floor(drawSize / 4)),
  matchUpFormat: 'SET3-S:6/TB7',
});
if (error) throw new Error(error.message);
if (!drawDefinition) throw new Error('Draw generation failed');
tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
```

The UI must select the intended entry statuses/stage and seeds before generation. Preview the returned
definition before replacing a published or already-played draw.

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
const { event } = tournamentEngine.getEvent({ eventId });
const drawDefinitions = event.drawDefinitions ?? [];

// Get specific draw details
const { drawDefinition } = tournamentEngine.getEvent({
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
const { valid, inconsistencies, error } = tournamentEngine.getDrawInconsistencies({
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
