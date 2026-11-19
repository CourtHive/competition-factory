---
title: Browser Console (dev object)
sidebar_position: 7
---

# Working with TMX in the Browser Console

TMX provides a `dev` object that exposes the Competition Factory engines directly in the browser console. It enables direct interaction with the tournament record, testing factory methods, debugging, and logging every factory method call and return while using TMX.

:::tip Developer Tool
The `dev` object is primarily intended for developers, tournament directors with technical knowledge, and anyone learning the Competition Factory API.
:::

## Overview

The browser console interface provides:

- **Direct Engine Access** - Call any factory method directly
- **Tournament Record Access** - Inspect the current tournament
- **Method Logging** - Monitor factory calls and returns
- **Mutations through TMX** - Apply factory methods the way the UI does, saved and displayed
- **Validation** - Check the loaded record against the CODES schema and the factory's integrity rules
- **Data Export/Import** - Extract, anonymize or load tournament records

## Accessing the dev Object

Open the browser console (F12 or Cmd+Option+I) while running TMX:

```js
// Everything available
console.log(Object.keys(dev));

dev.tournamentEngine; // the engine holding the loaded tournament
dev.factory; // the whole tods-competition-factory package: competitionEngine, mocksGovernor, tools, …
dev.getTournament(); // a copy of the loaded tournament record
dev.context({ params: true, result: true }); // log factory calls (see Method Logging)
dev.modifyTournament([{ method, params }]); // run mutations the way the UI does
dev.validate(); // CODES schema + integrity check of the loaded record
dev.exportAnonymized(); // download an anonymized copy for support
dev.load(tournamentRecord); // load a record into TMX
dev.generateMockTournament({ drawProfiles: [{ drawSize: 16 }] }); // create and open a mock tournament
```

## Queries and Mutations Are Different

Queries are safe to call directly on `dev.tournamentEngine`.

A mutation called directly on `dev.tournamentEngine` changes only the in-memory record. It is **not** sent to the server, **not** saved to the browser's local database, and the UI is not redrawn. Reloading the page brings back the saved record, and the change is gone.

To change the tournament the way the UI does (server first, then saved locally and redrawn), use `dev.modifyTournament`:

```js
// Same path as a UI action: server, then local engine, IndexedDB and the display
dev.modifyTournament([{ method: 'setTournamentName', params: { tournamentName: 'Spring Open' } }]);

// Or with your own callback, which runs once the mutation has completed (or been refused)
dev.mutationRequest({
  methods: [{ method: 'setTournamentName', params: { tournamentName: 'Spring Open' } }],
  callback: (result) => console.log(result),
});
```

## Core Functionality

### Accessing Engines

```js
// Tournament engine - main engine for tournament operations
dev.tournamentEngine;

// Competition engine - for multi-tournament operations
dev.factory.competitionEngine;

// Query methods
dev.tournamentEngine.getEvents();
dev.tournamentEngine.getParticipants();
dev.tournamentEngine.allTournamentMatchUps();
dev.tournamentEngine.allEventMatchUps({ eventId }); // requires an eventId
```

### Tournament Record Access

```js
// A copy of the current tournament record
const tournamentRecord = dev.getTournament();

console.log('Tournament:', tournamentRecord.tournamentName);
console.log('Events:', tournamentRecord.events?.length);
console.log('Participants:', tournamentRecord.participants?.length);

// Copy to the clipboard (copy() is a Chrome/Edge DevTools helper)
copy(dev.getTournament());

// Load a record into TMX (engine, local database and display)
dev.load(importedTournamentRecord);
```

### Method Logging

`dev.context(...)` sets the factory's dev context, which controls what is logged for each engine method call. That includes the methods TMX itself runs, because UI actions and `executionQueue` directives pass through the same path.

```js
// Log params and result for every method
dev.context({ params: true, result: true });

// Or only for some methods
dev.context({ params: ['addEvent', 'addDrawDefinition'], result: ['addEvent'] });

// Errors only (with their params and result), skipping noisy methods
dev.context({ errors: true, exclude: ['getEvents'] });

// Methods slower than 10ms, with their timing
dev.context({ perf: 10 });

// Turn logging off
dev.context(false);
```

Each logged call prints the engine type and an object such as:

```js
// sync { method: 'addEvent', params: { event: {...} }, result: { success: true, event: {...} } }
```

:::caution Logging changes error handling
While a dev context is set, an exception thrown inside a factory method propagates instead of being returned as an `{ error }` result. That is useful for finding a bug's origin, but turn logging off (`dev.context(false)`) when you are done.
:::

TMX can also log the factory's **notices** (what changed, as the subscriptions TMX listens to see it):

```js
dev.allSubscriptions = true; // log every notice
dev.subs.modifyMatchUp = true; // or only one topic (Object.keys(dev.subs) lists them)
dev.subs.modifyMatchUp = (notices) => console.table(notices); // or handle it yourself
```

This is useful for:

- **Learning** - See exactly how TMX uses the factory
- **Debugging** - Understand what's happening under the hood
- **Documentation** - Find real-world usage examples
- **Testing** - Verify method parameters and returns

### State Inspection

```js
// Get specific data
const { events } = dev.tournamentEngine.getEvents();
const { participants } = dev.tournamentEngine.getParticipants();
const drawDefinitions = events.flatMap((event) => event.drawDefinitions ?? []);

// Inspect event details
events.forEach((event) => {
  console.log(`${event.eventName}: ${event.entries?.length || 0} entries`);
});

// Check draw status
drawDefinitions.forEach((draw) => {
  const { matchUps } = dev.tournamentEngine.getAllDrawMatchUps({ drawId: draw.drawId });
  const completed = matchUps.filter((m) => m.matchUpStatus === 'COMPLETED').length;
  console.log(`${draw.drawName}: ${completed}/${matchUps.length} matches complete`);
});
```

## Common Use Cases

### Testing Factory Methods

Try a method on a mock tournament rather than a real one:

```js
// Creates, saves and opens a new mock tournament
dev.generateMockTournament({ drawProfiles: [{ drawSize: 16 }] });

// Then try the method directly (in memory only; reload to discard)
const result = dev.tournamentEngine.addParticipant({
  participant: {
    participantType: 'INDIVIDUAL',
    person: {
      standardGivenName: 'Test',
      standardFamilyName: 'Player',
    },
  },
});

console.log(result); // { success: true, … } or { error: { message, code } }
```

### Debugging Issues

```js
// Log errors (with params) and anything slower than 50ms
dev.context({ errors: true, perf: 50 });

// Perform the problematic action in the UI and watch the console

dev.context(false);
```

### Learning the API

```js
// Log every method TMX calls, with params
dev.context({ params: true });

// Create an event or generate a draw in the TMX UI.
// The console shows each method TMX ran and the params it passed.

dev.context(false);
```

### Data Analysis

```js
// Every scored match in an event
const { matchUps } = dev.tournamentEngine.allEventMatchUps({ eventId });
const scored = matchUps.filter((m) => m.score?.sets?.length);

const stats = scored.map((m) => ({
  round: m.roundName,
  sets: m.score.sets.length,
  tiebreaks: m.score.sets.filter((s) => s.side1TiebreakScore !== undefined).length,
}));

console.table(stats);

// Export for external analysis
copy(stats);
```

### Batch Operations

```js
// Enter every participant in an event, in one mutation, the way the UI does
const { participants } = dev.tournamentEngine.getParticipants({
  participantFilters: { participantTypes: ['INDIVIDUAL'] },
});

dev.modifyTournament([
  {
    method: 'addEventEntries',
    params: { eventId, participantIds: participants.map((p) => p.participantId) },
  },
]);
```

### State Recovery

```js
// Save a copy of the current state
localStorage.setItem('tournament-backup', JSON.stringify(dev.getTournament()));

// ... experiment ...

// Restore it into TMX (engine, local database and display).
// This is local only: it does not send the restored record to the server.
dev.load(JSON.parse(localStorage.getItem('tournament-backup')));
```

### Query Testing

```js
// Test different query parameters
const { matchUps: all } = dev.tournamentEngine.allEventMatchUps({
  eventId,
});

const { matchUps: completed } = dev.tournamentEngine.allEventMatchUps({
  eventId,
  matchUpFilters: { matchUpStatuses: ['COMPLETED'] },
});

const { matchUps: ready } = dev.tournamentEngine.allEventMatchUps({
  eventId,
  matchUpFilters: { readyToScore: true },
});

console.log(`Total: ${all.length}, Completed: ${completed.length}, Ready: ${ready.length}`);
```

## Advanced Techniques

### Method Interception

Wrapping an engine method sees only the calls made to that method directly, such as your own console calls. TMX's own mutations run as `executionQueue` directives and do not go through the wrapper; use `dev.context(...)` to see those.

```js
const original = dev.tournamentEngine.addEvent;
dev.tournamentEngine.addEvent = function (params) {
  console.log('Adding event:', params);
  const result = original.call(this, params);
  console.log('Event added:', result);
  return result;
};
```

### Performance Profiling

```js
// Every method call that takes 10ms or more, with its elapsed time
dev.context({ perf: 10 });

// Or time one call yourself
console.time('generateDraw');
dev.tournamentEngine.generateDrawDefinition({ eventId, drawSize: 128, automated: true });
console.timeEnd('generateDraw');

dev.context(false);
```

### Data Validation

```js
// CODES schema check plus the factory's integrity rules, logged as a structured summary
await dev.validate();

// Or only the integrity rules (not every possible tournament constraint)
const { valid, inconsistencies = [], error } = dev.tournamentEngine.getTournamentInconsistencies();
if (error) console.error(error);
if (!valid || inconsistencies.length) console.table(inconsistencies);
```

### Export for Support

When reporting an issue, send an anonymized copy of the tournament:

```js
// Downloads <tournamentId>.anonymized.codes.json; the loaded tournament is untouched
dev.exportAnonymized();
```

It runs the factory's [`anonymizeTournamentRecord`](../governors/mocks-governor.md#anonymizetournamentrecord) on a deep copy. That replaces personal data throughout the record (participant and person names, team names, contacts, venues, the tournament header), not just the fields a hand-written sanitizer would remember. Outside TMX, call it the same way on a copy, because it rewrites the record it is given:

```js
const { tournamentRecord: anonymized } = dev.factory.mocksGovernor.anonymizeTournamentRecord({
  tournamentRecord: structuredClone(dev.getTournament()),
});
```

### Scripting Tournaments

For a test tournament, let the mocks engine build it:

```js
// 32 participants, an event, entries and an automated 32 draw, saved and opened
dev.generateMockTournament({
  drawProfiles: [{ drawSize: 32, eventName: 'Test Event' }],
});
```

To build into the loaded tournament, run the steps as mutations. `generateDrawDefinition` only **returns** a draw; `addDrawDefinition` attaches it to the event:

```js
async function addTestEvent() {
  const eventId = dev.factory.tools.UUID();
  const { participants } = dev.tournamentEngine.getParticipants({
    participantFilters: { participantTypes: ['INDIVIDUAL'] },
  });

  // Wait for the callback: it is the completion signal (the returned promise can resolve before a permission
  // check or confirmation prompt finishes)
  const added = await new Promise((resolve) =>
    dev.mutationRequest({
      methods: [
        { method: 'addEvent', params: { event: { eventId, eventName: 'Test Event', eventType: 'SINGLES' } } },
        {
          method: 'addEventEntries',
          params: { eventId, participantIds: participants.slice(0, 32).map((p) => p.participantId) },
        },
      ],
      callback: resolve,
    }),
  );
  if (added?.error) return console.error(added.error);

  const { drawDefinition, error } = dev.tournamentEngine.generateDrawDefinition({
    eventId,
    drawSize: 32,
    automated: true,
  });
  if (error) return console.error(error);

  dev.modifyTournament([{ method: 'addDrawDefinition', params: { eventId, drawDefinition } }]);
}

addTestEvent();
```

## Best Practices

### Safety

- Test on non-production tournaments (`dev.generateMockTournament`)
- Mutate through `dev.modifyTournament` or `dev.mutationRequest`, not the engine directly
- Make backups before experiments
- Check results for `error`

### Learning

- Log with `dev.context(...)` when learning
- Compare TMX actions to factory calls
- Try variations of methods
- Read method documentation

### Debugging

- Log errors and slow calls to trace issues
- Check method parameters carefully
- Verify return values
- Test isolated scenarios

### Performance

- Turn logging off when done (`dev.context(false)`)
- Use efficient queries
- Batch mutations into one `modifyTournament` call
- Cache repeated queries

## Console Helpers

```js
const helpers = {
  // A copy of the current state
  state: () => dev.getTournament(),

  // Count things
  count: () => ({
    participants: dev.tournamentEngine.getParticipants().participants.length,
    events: dev.tournamentEngine.getEvents().events.length,
    draws: dev.tournamentEngine
      .getEvents()
      .events.reduce((count, event) => count + (event.drawDefinitions?.length ?? 0), 0),
  }),

  // Copy the tournament to the clipboard
  export: () => copy(dev.getTournament()),

  // Log all events
  events: () => {
    const { events } = dev.tournamentEngine.getEvents();
    console.table(
      events.map((e) => ({
        name: e.eventName,
        type: e.eventType,
        entries: e.entries?.length || 0,
      })),
    );
  },

  // Log all participants (participantName covers pairs and teams, which have no person)
  participants: () => {
    const { participants } = dev.tournamentEngine.getParticipants();
    console.table(
      participants.map((p) => ({
        name: p.participantName,
        type: p.participantType,
        id: p.participantId,
      })),
    );
  },
};

helpers.count();
helpers.events();
helpers.participants();
```

## Common Patterns

### Check Before Action

```js
const { events } = dev.tournamentEngine.getEvents();
const event = events[0];

if (event?.entries?.length) {
  const { drawDefinition, error } = dev.tournamentEngine.generateDrawDefinition({
    eventId: event.eventId,
    drawSize: 32,
  });
  if (error) console.error(error);
  else dev.modifyTournament([{ method: 'addDrawDefinition', params: { eventId: event.eventId, drawDefinition } }]);
} else {
  console.error('Event has no entries');
}
```

### Error Handling

Factory methods report failure in their result rather than by throwing (unless a dev context is set; see Method Logging):

<!-- doc-methods:ignore — `someMethod` is an illustrative placeholder -->

```js
const result = dev.tournamentEngine.someMethod(params);
if (result.error) {
  console.error('Error:', result.error.message ?? result.error);
} else {
  console.log('Success:', result);
}
```

## Related Documentation

- [Engine Methods](../engines/engine-methods.md) - All available engine methods
- [Tournament Engine](../engines/engine-methods.md) - Tournament engine reference
- [State Management](../engines/state-engines.mdx) - Managing tournament state
- [Factory Server](./factory-server.md) - Server-side factory usage

## Tips

- Use `console.table()` for readable data display
- Use `copy()` to copy data to clipboard (Chrome/Edge DevTools)
- Press up arrow to repeat previous commands
- Use `$0` to reference selected DOM element
- Type `clear()` to clear console
- Use `console.dir()` for deep object inspection

The browser console with the `dev` object is one of the most useful TMX features for developers, providing direct access to the Competition Factory and enabling rapid experimentation, debugging, and learning.
