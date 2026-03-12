---
title: Browser Console (dev object)
sidebar_position: 7
---

# Working with TMX in the Browser Console

TMX provides a powerful `dev` object that exposes the Competition Factory engines directly in the browser console. This enables direct interaction with the tournament record, testing factory methods, debugging, and even logging all factory method calls and returns while using TMX.

:::tip Developer Tool
The `dev` object is primarily intended for developers, tournament directors with technical knowledge, and anyone learning the Competition Factory API.
:::

## Overview

The browser console interface provides:

- **Direct Engine Access** - Call any factory method directly
- **Tournament Record Access** - Inspect and modify the current tournament
- **Method Logging** - Monitor all factory calls and returns
- **State Inspection** - View current tournament state
- **Testing and Debugging** - Experiment with factory methods
- **Learning Tool** - See how TMX uses the factory
- **Data Export/Import** - Extract or load tournament records

## Accessing the dev Object

Open the browser console (F12 or Cmd+Option+I) while running TMX:

```js
// Access the dev object
console.log(dev);

// Available on dev object:
dev.tournamentEngine  // Tournament engine instance
dev.competitionEngine // Competition engine instance  
dev.getTournamentRecord() // Get current tournament
dev.enableLogging()   // Enable method logging
dev.disableLogging()  // Disable method logging
```

## Core Functionality

### Accessing Engines

```js
// Tournament engine - main engine for tournament operations
dev.tournamentEngine

// Competition engine - for multi-tournament operations
dev.competitionEngine

// All governor methods available
dev.tournamentEngine.getEvents()
dev.tournamentEngine.getParticipants()
dev.tournamentEngine.getAllEventMatchUps()
```

### Tournament Record Access

```js
// Get current tournament record
const tournamentRecord = dev.getTournamentRecord();
console.log(tournamentRecord);

// Inspect structure
console.log('Tournament:', tournamentRecord.tournamentName);
console.log('Events:', tournamentRecord.events?.length);
console.log('Participants:', tournamentRecord.participants?.length);

// Export tournament (copy to clipboard)
copy(dev.getTournamentRecord());

// Set tournament from external source
dev.tournamentEngine.setState(importedTournamentRecord);
```

### Method Logging

TMX can log every factory method call with parameters and return values:

```js
// Enable logging
dev.enableLogging();

// Now all factory methods are logged:
// [Factory] addEvent({ event: {...} })
// [Factory] ← { success: true, event: {...} }

// Use TMX normally, see all factory calls in console

// Disable when done
dev.disableLogging();
```

This is incredibly useful for:

- **Learning** - See exactly how TMX uses the factory
- **Debugging** - Understand what's happening under the hood
- **Documentation** - Find real-world usage examples
- **Testing** - Verify method parameters and returns

### State Inspection

```js
// Get specific data
const { events } = dev.tournamentEngine.getEvents();
const { participants } = dev.tournamentEngine.getParticipants();
const { drawDefinitions } = dev.tournamentEngine.getDrawDefinitions();

// Inspect event details
events.forEach(event => {
  console.log(`${event.eventName}: ${event.entries?.length || 0} entries`);
});

// Check draw status
drawDefinitions.forEach(draw => {
  const { matchUps } = dev.tournamentEngine.getAllDrawMatchUps({ drawId: draw.drawId });
  const completed = matchUps.filter(m => m.matchUpStatus === 'COMPLETED').length;
  console.log(`${draw.drawName}: ${completed}/${matchUps.length} matches complete`);
});
```

## Common Use Cases

### Testing Factory Methods

```js
// Try out a method before implementing in UI
const result = dev.tournamentEngine.addParticipant({
  participant: {
    participantType: 'INDIVIDUAL',
    person: {
      standardGivenName: 'Test',
      standardFamilyName: 'Player'
    }
  }
});

console.log(result);

// If successful, implement in UI code
// If error, debug before implementing
```

### Debugging Issues

```js
// Enable logging
dev.enableLogging();

// Perform problematic action in UI
// Watch console for method calls and returns

// See what went wrong
// Check parameters passed
// Verify return values

dev.disableLogging();
```

### Learning the API

```js
// Enable logging
dev.enableLogging();

// Create an event in TMX UI
// Console shows:
// [Factory] addEvent({ event: { eventName: "Men's Singles", ... } })
// [Factory] ← { success: true, event: { eventId: "...", ... } }

// Generate a draw
// Console shows complete sequence:
// [Factory] addDrawDefinition({ eventId: "...", drawSize: 32, ... })
// [Factory] autoSeeding({ eventId: "...", ... })
// [Factory] automatedPositioning({ eventId: "...", ... })

// Learn the exact method calls and parameters
```

### Data Analysis

```js
// Get all matches with scores
const { matchUps } = dev.tournamentEngine.getAllEventMatchUps({ eventId });
const scored = matchUps.filter(m => m.score);

// Analyze results
const stats = scored.map(m => ({
  round: m.roundName,
  duration: m.score.sets.length,
  tiebreaks: m.score.sets.filter(s => s.side1TiebreakScore).length
}));

console.table(stats);

// Export for external analysis
copy(stats);
```

### Batch Operations

```js
// Perform bulk operations
const { participants } = dev.tournamentEngine.getParticipants();

// Add all participants to an event
participants.forEach(p => {
  dev.tournamentEngine.addEventEntries({
    eventId: 'event-id',
    participantIds: [p.participantId]
  });
});

// Or bulk add
dev.tournamentEngine.addEventEntries({
  eventId: 'event-id',
  participantIds: participants.map(p => p.participantId)
});
```

### State Recovery

```js
// Save current state
const backup = dev.getTournamentRecord();
localStorage.setItem('tournament-backup', JSON.stringify(backup));

// Experiment with changes
// ... make modifications ...

// Restore if needed
const saved = JSON.parse(localStorage.getItem('tournament-backup'));
dev.tournamentEngine.setState(saved);

// Refresh TMX UI to reflect restored state
location.reload();
```

### Query Testing

```js
// Test different query parameters
const { matchUps: all } = dev.tournamentEngine.getAllEventMatchUps({ 
  eventId 
});

const { matchUps: completed } = dev.tournamentEngine.getAllEventMatchUps({ 
  eventId,
  matchUpFilters: { matchUpStatuses: ['COMPLETED'] }
});

const { matchUps: ready } = dev.tournamentEngine.getAllEventMatchUps({ 
  eventId,
  matchUpFilters: { readyToScore: true }
});

console.log(`Total: ${all.length}, Completed: ${completed.length}, Ready: ${ready.length}`);
```

## Advanced Techniques

### Method Interception

```js
// Wrap methods to add custom logging
const original = dev.tournamentEngine.addEvent;
dev.tournamentEngine.addEvent = function(params) {
  console.log('Adding event:', params);
  const result = original.call(this, params);
  console.log('Event added:', result);
  return result;
};
```

### Performance Profiling

```js
// Time factory operations
console.time('generateDraw');
dev.tournamentEngine.generateDrawDefinition({
  eventId,
  drawSize: 128,
  automated: true
});
console.timeEnd('generateDraw');
// Output: generateDraw: 45.2ms
```

### Data Validation

```js
// Check tournament validity
const { valid, errors } = dev.tournamentEngine.validateTournament();

if (!valid) {
  console.error('Tournament validation errors:', errors);
  errors.forEach(e => console.log(`- ${e.type}: ${e.message}`));
}
```

### Export for Support

```js
// When reporting issues, export sanitized tournament
const tournament = dev.getTournamentRecord();

// Remove sensitive data
const sanitized = {
  ...tournament,
  participants: tournament.participants?.map(p => ({
    ...p,
    person: {
      standardGivenName: 'Player',
      standardFamilyName: p.participantId
    },
    contact: undefined
  }))
};

copy(sanitized);
// Now paste into GitHub issue or support request
```

### Scripting Tournaments

```js
// Create complete tournament from console
async function setupTournament() {
  // Add participants
  const participants = [];
  for (let i = 1; i <= 32; i++) {
    const { participant } = dev.tournamentEngine.addParticipant({
      participant: {
        participantType: 'INDIVIDUAL',
        person: {
          standardGivenName: `Player`,
          standardFamilyName: `${i}`
        }
      }
    });
    participants.push(participant);
  }
  
  // Create event
  const { event } = dev.tournamentEngine.addEvent({
    event: {
      eventName: 'Test Event',
      eventType: 'SINGLES'
    }
  });
  
  // Add entries
  dev.tournamentEngine.addEventEntries({
    eventId: event.eventId,
    participantIds: participants.map(p => p.participantId)
  });
  
  // Generate draw
  dev.tournamentEngine.generateDrawDefinition({
    eventId: event.eventId,
    drawSize: 32,
    automated: true
  });
  
  console.log('Tournament setup complete!');
  location.reload(); // Refresh UI
}

setupTournament();
```

## Best Practices

### Safety

- Test on non-production tournaments
- Make backups before experiments
- Understand method effects before calling
- Use result validation

### Learning

- Enable logging when learning
- Compare TMX actions to factory calls
- Try variations of methods
- Read method documentation

### Debugging

- Enable logging to trace issues
- Check method parameters carefully
- Verify return values
- Test isolated scenarios

### Performance

- Disable logging in production
- Use efficient queries
- Batch operations when possible
- Cache repeated queries

## Console Helpers

```js
// Quick reference object
const helpers = {
  // Get current state
  state: () => dev.getTournamentRecord(),
  
  // Count things
  count: () => ({
    participants: dev.tournamentEngine.getParticipants().participants.length,
    events: dev.tournamentEngine.getEvents().events.length,
    draws: dev.tournamentEngine.getDrawDefinitions().drawDefinitions.length
  }),
  
  // Export tournament
  export: () => copy(dev.getTournamentRecord()),
  
  // Log all events
  events: () => {
    const { events } = dev.tournamentEngine.getEvents();
    console.table(events.map(e => ({
      name: e.eventName,
      type: e.eventType,
      entries: e.entries?.length || 0
    })));
  },
  
  // Log all participants
  participants: () => {
    const { participants } = dev.tournamentEngine.getParticipants();
    console.table(participants.map(p => ({
      name: `${p.person.standardGivenName} ${p.person.standardFamilyName}`,
      id: p.participantId
    })));
  }
};

// Use helpers
helpers.count();
helpers.events();
helpers.participants();
```

## Common Patterns

### Check Before Action

```js
// Verify state before operation
const { events } = dev.tournamentEngine.getEvents();
const event = events[0];

if (event && event.entries?.length > 0) {
  // Safe to generate draw
  dev.tournamentEngine.generateDrawDefinition({
    eventId: event.eventId,
    drawSize: 32
  });
} else {
  console.error('Event has no entries');
}
```

### Error Handling

```js
// Wrap calls in try-catch
try {
  const result = dev.tournamentEngine.someMethod(params);
  console.log('Success:', result);
} catch (error) {
  console.error('Error:', error.message);
}
```

### Method Chaining

```js
// Chain related operations
const { event } = dev.tournamentEngine.addEvent({ event: {...} });
dev.tournamentEngine.addEventEntries({ eventId: event.eventId, participantIds: [...] });
dev.tournamentEngine.generateDrawDefinition({ eventId: event.eventId, drawSize: 32 });
```

## Related Documentation

- [Engine Methods](../engines/engine-methods.md) - All available engine methods
- [Tournament Engine](../engines/engine-methods.md) - Tournament engine reference
- [State Management](../engines/state-engines.mdx) - Managing tournament state
- [Factory Server](./factory-server.md) - Server-side factory usage

## Tips

- Use `console.table()` for readable data display
- Use `copy()` to copy data to clipboard
- Press up arrow to repeat previous commands
- Use `$0` to reference selected DOM element
- Type `clear()` to clear console
- Use `console.dir()` for deep object inspection

The browser console with the `dev` object is one of the most powerful features of TMX for developers, providing direct access to the Competition Factory and enabling rapid experimentation, debugging, and learning.
