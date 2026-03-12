---
title: Mutation Engines
---

Mutation engines provide state-modifying operations with built-in change tracking, notifications, and error handling. They can operate **synchronously** or **asynchronously** depending on the execution context.

**Key Features:**

- Automatic mutation logging and audit trails
- Subscription-based notification system
- Rollback on error capabilities
- Asynchronous state management for multi-client scenarios
- Integration with middleware for automatic resolution

---

## Synchronous vs Asynchronous Engines

### Synchronous Engines

Use `syncEngine` for single-threaded, single-client applications:

```js
import { tournamentEngine } from 'tods-competition-factory';

tournamentEngine.setState(tournamentRecord);
tournamentEngine.addEvent({ event: { eventName: 'Singles', eventType: 'SINGLES' } });
```

**When to Use:**

- Single-user desktop applications
- Command-line tools
- Test suites
- Simple server endpoints with isolated state per request

### Asynchronous Engines

Use `asyncEngine` for multi-client server applications:

```js

**API Reference:** [addEvent](/docs/governors/event-governor#addevent)

import { asyncEngine, globalState } from 'tods-competition-factory';
import { asyncGlobalState } from './asyncGlobalState';

// Configure async state provider once at startup
globalState.setStateProvider(asyncGlobalState);

// Each client request gets isolated state
app.post('/api/tournament/:id/event', async (req, res) => {
  const tournamentRecord = await loadTournament(req.params.id);
  await asyncEngine.setState(tournamentRecord);
  
  const result = await asyncEngine.addEvent({ event: req.body.event });
  await saveTournament(asyncEngine.getState());
  
  res.json(result);
});
```

**When to Use:**

- Multi-user web servers
- REST APIs serving multiple clients
- WebSocket servers with concurrent connections
- Any scenario with concurrent state modifications

**State Isolation:**
Async engines use Node's `executionAsyncId()` to maintain separate state for each async execution context, preventing state collision between concurrent requests.

---

## Notifications

Mutation engines emit notifications for state changes, enabling reactive updates across your application.

### Subscribing to Notifications

```js
import { tournamentEngine, addNotification } from 'tods-competition-factory';

// Subscribe to specific notification topics
addNotification({
  topic: 'addMatchUps',
  payload: (payload) => {
    console.log('MatchUps added:', payload.matchUps);
    // Update UI, trigger webhooks, etc.
  }
});

addNotification({
  topic: 'modifyMatchUp',
  payload: (payload) => {
    console.log('MatchUp modified:', payload.matchUp);
  }
});

// Now mutations trigger notifications
tournamentEngine.generateDrawDefinition({ /* ... */ });
// Triggers 'addMatchUps' notification
```

### Common Notification Topics

- `addMatchUps` - New matchUps created
- `modifyMatchUp` - MatchUp properties changed
- `publishEvent` - Event published/unpublished
- `deletedMatchUpIds` - MatchUps removed
- `modifyDrawDefinition` - Draw structure changed
- `audit` - Any mutation for audit trail

### Real-World Example: Live Scoring Updates

```js

**API Reference:** [generateDrawDefinition](/docs/governors/generation-governor#generatedrawdefinition)

import { tournamentEngine, addNotification } from 'tods-competition-factory';
import { broadcastToWebSocketClients } from './websocket';

// Broadcast score changes to connected clients
addNotification({
  topic: 'modifyMatchUp',
  payload: (payload) => {
    if (payload.matchUp.score) {
      broadcastToWebSocketClients({
        type: 'SCORE_UPDATE',
        matchUpId: payload.matchUp.matchUpId,
        score: payload.matchUp.score,
        matchUpStatus: payload.matchUp.matchUpStatus
      });
    }
  }
});

// Recording a score triggers notification
tournamentEngine.setMatchUpStatus({
  matchUpId: 'match-1',
  outcome: {
    score: {
      sets: [
        { side1Score: 6, side2Score: 4 },
        { side1Score: 6, side2Score: 3 }
      ]
    }
  }
});
// WebSocket clients receive live update
```

See [Subscriptions](/docs/engines/subscriptions) for complete notification documentation.

---

## Rollback on Error

Protect tournament integrity by automatically reverting changes when operations fail.

### Basic Rollback

```js

**API Reference:** [setMatchUpStatus](/docs/governors/matchup-governor#setmatchupstatus)

import { tournamentEngine } from 'tods-competition-factory';

tournamentEngine.setState(tournamentRecord);

try {
  const result = await tournamentEngine.automatedPositioning({
    drawId: 'draw-1',
    rollbackOnError: true  // Enable automatic rollback
  });
} catch (error) {
  // State automatically reverted to pre-operation state
  console.error('Operation failed, state rolled back:', error);
}
```

### Transaction Pattern

```js

**API Reference:** [automatedPositioning](/docs/governors/draws-governor#automatedpositioning)

// Complex operation with multiple mutations
tournamentEngine.setState(tournamentRecord);
const originalState = tournamentEngine.getState();

try {
  // Multiple operations that must all succeed
  await tournamentEngine.addEvent({ event, rollbackOnError: true });
  await tournamentEngine.generateDrawDefinition({ drawSize: 32, rollbackOnError: true });
  await tournamentEngine.attachPolicy({ policyDefinitions, rollbackOnError: true });
  
  // All succeeded, persist state
  await saveToDatabase(tournamentEngine.getState());
} catch (error) {
  // Any failure rolls back entire transaction
  console.error('Transaction failed:', error);
  tournamentEngine.setState(originalState);
}
```

### When to Use Rollback

**Use `rollbackOnError: true` when:**

- Operating on production data
- Complex multi-step operations
- User-initiated actions that must be atomic
- Data integrity is critical

**Skip rollback when:**

- In test suites (let failures be visible)
- Debugging (you want to see the failed state)
- Bulk operations where partial success is acceptable
- Performance is critical and errors are rare

---

## Global State Provider

### Synchronous State (Default)

Synchronous engines maintain state in memory without special configuration:

```js

**API Reference:** [addEvent](/docs/governors/event-governor#addevent)

**API Reference:** [generateDrawDefinition](/docs/governors/generation-governor#generatedrawdefinition)

import { tournamentEngine } from 'tods-competition-factory';

// No setup required for sync engines
tournamentEngine.setState(tournamentRecord);
tournamentEngine.addEvent({ event });
```

### Asynchronous State Provider

For multi-client scenarios, implement a custom state provider:

```js

**API Reference:** [addEvent](/docs/governors/event-governor#addevent)

// asyncGlobalState.js
import { AsyncLocalStorage } from 'async_hooks';

const asyncLocalStorage = new AsyncLocalStorage();

export const asyncGlobalState = {
  // Get state for current async context
  getState: () => asyncLocalStorage.getStore() || {},
  
  // Set state for current async context
  setState: (state) => {
    const store = asyncLocalStorage.getStore();
    if (store) {
      Object.assign(store, state);
    }
  },
  
  // Run callback in new async context
  run: (callback) => {
    asyncLocalStorage.run({}, callback);
  }
};
```

```js
// server.js
import { globalState, asyncEngine } from 'tods-competition-factory';
import { asyncGlobalState } from './asyncGlobalState';

// Configure once at app startup
globalState.setStateProvider(asyncGlobalState);

// Each request gets isolated state
app.use((req, res, next) => {
  asyncGlobalState.run(() => next());
});

app.post('/api/event', async (req, res) => {
  // State isolated to this request
  await asyncEngine.setState(req.tournament);
  const result = await asyncEngine.addEvent({ event: req.body });
  res.json(result);
});
```

**Reference Implementation:**
See `src/examples/asyncEngine` in the source code for a complete async state provider example.

---

## Debugging and Logging

Enable detailed logging for debugging and monitoring:

```js
import { tournamentEngine, globalState } from 'tods-competition-factory';

// Enable detailed logging
globalState.setDevContext({
  errors: true,    // Log errors
  params: true,    // Log method parameters  
  result: true,    // Log method results
  perf: 100        // Log methods taking >100ms
});

tournamentEngine.setState(tournamentRecord);
tournamentEngine.addEvent({ event: { eventName: 'Singles' } });
// Console: [addEvent] params: {...} result: {...} time: 5ms

tournamentEngine.generateDrawDefinition({ drawSize: 32 });
// Console: [generateDrawDefinition] params: {...} result: {...} time: 25ms
```

**Dev Context Options:**

- `errors: true` - Log all errors
- `params: true | ['methodName']` - Log parameters for all or specific methods
- `result: true | ['methodName']` - Log results for all or specific methods  
- `perf: number` - Log methods exceeding threshold (ms)
- `exclude: ['methodName']` - Exclude specific methods from logging

---
