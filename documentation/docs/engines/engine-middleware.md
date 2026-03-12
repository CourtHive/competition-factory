---
title: Engine Middleware
---

Engine middleware automatically resolves tournament structures from identifiers, eliminating the need to manually pass `event`, `drawDefinition`, and `tournamentRecord` objects. This significantly simplifies API calls and reduces boilerplate code.

**Benefits:**

- Automatic resolution of tournament structures from IDs
- Cleaner, more concise method calls
- Reduced parameter verbosity
- Automatic tournament selection in multi-tournament scenarios
- Type-safe resolution with error handling

---

## Automatic Structure Resolution

Middleware resolves complex objects from simple identifiers:

### Resolving Events from Draw IDs

```js
import { tournamentEngine } from 'tods-competition-factory';

tournamentEngine.setState(tournamentRecord);

// Without middleware (manual resolution)
const { drawDefinition } = tournamentEngine.getEvent({ drawId });
const { event } = tournamentEngine.findEvent({ drawId: drawDefinition.drawId });
tournamentEngine.deleteDrawDefinitions({ event, drawIds: [drawId] });

// With middleware (automatic resolution)
tournamentEngine.getEvent({ drawId }); // ✅ Event automatically resolved
```

### Resolving Everything from Match ID

```js

**API Reference:** [getEvent](/docs/governors/query-governor#getevent)

**API Reference:** [deleteDrawDefinitions](/docs/governors/event-governor#deletedrawdefinitions)

**API Reference:** [getEvent](/docs/governors/query-governor#getevent)

// Single ID resolves entire hierarchy
const { matchUp, event, drawDefinition, structure } = tournamentEngine.getMatchUp({ matchUpId });
// All related objects automatically included
```

---

## Multi-Competition Management

When multiple tournaments are loaded, middleware requires tournament identification:

### Explicit Tournament ID

```js
import { competitionEngine } from 'tods-competition-factory';

// Load multiple tournaments
await competitionEngine.setState([tournament1, tournament2, tournament3]);

// Specify which tournament for the operation
const { participants } = competitionEngine.getParticipants({
  tournamentId: 'tournament-1',
});
```

### Setting Active Tournament

Avoid repeating `tournamentId` by setting an active tournament:

```js

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

import { tournamentEngine, globalState } from 'tods-competition-factory';

// Method 1: Via globalState
globalState.setTournamentId('tournament-1');

// Method 2: Via engine
tournamentEngine.setTournamentId('tournament-1');

// Now all operations use this tournament
const { participants } = tournamentEngine.getParticipants(); // Uses 'tournament-1'
const { events } = tournamentEngine.getEvents(); // Uses 'tournament-1'
```

### Single Tournament (No ID Required)

When only one tournament is in state, middleware automatically uses it:

```js

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

**API Reference:** [getEvents](/docs/governors/query-governor#getevents)

import { tournamentEngine } from 'tods-competition-factory';

// Load single tournament
tournamentEngine.setState(singleTournament);

// No tournamentId needed
const { participants } = tournamentEngine.getParticipants();
const { events } = tournamentEngine.getEvents();
```

---

## Resolution Examples

### Event Operations

```js

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

**API Reference:** [getEvents](/docs/governors/query-governor#getevents)

// Operation with eventId - middleware resolves event object
tournamentEngine.addEventExtension({
  eventId: 'event-1',
  extension: { name: 'metadata', value: { key: 'value' } },
});

// Middleware handles:
// 1. Find event from eventId
// 2. Add extension to event
// 3. Trigger notifications
```

### Draw Operations

```js
// Operation with drawId - middleware resolves drawDefinition
tournamentEngine.automatedPositioning({
  drawId: 'draw-1',
  seedingScaleNames: ['WTN', 'SEEDING'],
});

// Middleware handles:
// 1. Find drawDefinition from drawId
// 2. Find event containing this draw
// 3. Perform automated positioning
// 4. Trigger draw modification notices
```

### MatchUp Operations

```js

**API Reference:** [automatedPositioning](/docs/governors/draws-governor#automatedpositioning)

// Operation with matchUpId - middleware resolves everything
tournamentEngine.setMatchUpStatus({
  matchUpId: 'match-1',
  outcome: { winningSide: 1 },
});

// Middleware handles:
// 1. Find structure containing matchUp
// 2. Find drawDefinition containing structure
// 3. Find event containing draw
// 4. Update matchUp status
// 5. Propagate changes through draw
// 6. Trigger notifications
```

---

## Middleware Behavior

### Resolution Priority

When multiple identifiers are provided, middleware uses the most specific:

```js

**API Reference:** [setMatchUpStatus](/docs/governors/matchup-governor#setmatchupstatus)

// Both drawId and eventId provided - drawId takes precedence
tournamentEngine.getEvent({
  drawId: 'draw-1', // More specific
  eventId: 'event-1', // Ignored
});
// Returns event containing draw-1 (may not be event-1)
```

### Resolution Chain

Middleware traverses up the tournament hierarchy:

```text

**API Reference:** [getEvent](/docs/governors/query-governor#getevent)

matchUpId → structure → drawDefinition → event → tournamentRecord
           ↓           ↓                 ↓       ↓
      structureId    drawId           eventId  tournamentId
```

Any identifier resolves all parent structures.

---

## Disabling Middleware

For debugging or special cases, middleware can be disabled:

### Per-Call Disable

```js
// Bypass middleware for this call only
tournamentEngine.getEvent({
  drawId: 'draw-1',
  _middleware: false, // Middleware disabled
});
// Error: event not provided (middleware didn't resolve it)
```

### When to Disable

**Debugging scenarios:**

- Testing function behavior without middleware
- Verifying manual object passing
- Performance profiling middleware overhead

**Direct object passing:**

```js

**API Reference:** [getEvent](/docs/governors/query-governor#getevent)

// Manually provide resolved objects
const { event } = tournamentEngine.findEvent({ drawId });
const { drawDefinition } = tournamentEngine.getDrawDefinition({ drawId });

tournamentEngine.someOperation({
  event,
  drawDefinition,
  _middleware: false,
});
```

---

## Error Handling

Middleware provides clear error messages for resolution failures:

### Invalid IDs

```js
tournamentEngine.getEvent({ drawId: 'nonexistent-draw' });
// Error: DRAW_DEFINITION_NOT_FOUND
```

### Missing Tournament

```js

**API Reference:** [getEvent](/docs/governors/query-governor#getevent)

competitionEngine.setState([tournament1, tournament2]);

// No tournamentId specified with multiple tournaments
competitionEngine.getParticipants();
// Error: MISSING_TOURNAMENT_ID (ambiguous which tournament to use)
```

### Conflicting IDs

```js

**API Reference:** [getParticipants](/docs/governors/query-governor#getparticipants)

// Providing conflicting identifiers
tournamentEngine.getEvent({
  drawId: 'draw-from-event-1',
  eventId: 'event-2', // Different event
});
// Uses drawId, ignores eventId
// Returns event containing draw-1 (not event-2)
```

---

## Performance Considerations

### Middleware Overhead

Middleware adds minimal overhead (~1ms per call):

```js

**API Reference:** [getEvent](/docs/governors/query-governor#getevent)

// Without middleware (direct object access)
const time1 = performance.now();
someOperation({ event, drawDefinition });
const time2 = performance.now();
// ~0.1ms

// With middleware (ID resolution)
const time3 = performance.now();
someOperation({ eventId, drawId });
const time4 = performance.now();
// ~1.1ms (includes resolution time)
```

### Optimization Tips

**Use specific IDs when available:**

```js
// ❌ Less efficient - more resolution steps
tournamentEngine.getMatchUp({ matchUpId }); // Resolves full hierarchy

// ✅ More efficient - direct access
tournamentEngine.getMatchUp({
  matchUpId,
  eventId,
  drawId, // Helps narrow down search
  structureId, // Even more specific
});
```

---

## Best Practices

1. **Use middleware by default** - It handles complexity automatically
2. **Set active tournament early** - Avoid repeating tournamentId
3. **Pass specific IDs** - More specific = faster resolution
4. **Cache for bulk ops** - Resolve once, reuse objects
5. **Handle errors** - Middleware errors indicate data integrity issues
6. **Disable only when needed** - For debugging, not production

---
