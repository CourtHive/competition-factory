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

**API Reference:** [addEvent](/docs/governors/event-governor#addevent)

```js
import { asyncEngine, globalState } from 'tods-competition-factory';
import asyncGlobalState from './asyncGlobalState';

// Configure async state provider once at startup
globalState.setStateProvider(asyncGlobalState);

// Each client request gets isolated state
app.post('/api/tournament/:id/event', async (req, res) => {
  const result = await asyncGlobalState.runWithInstanceState(async () => {
    const tournamentRecord = await loadTournament(req.params.id);
    await asyncEngine.setState(tournamentRecord);

    const outcome = await asyncEngine.addEvent({ event: req.body.event });
    await saveTournament(asyncEngine.getState());
    return outcome;
  });

  res.json(result);
});
```

**When to Use:**

- Multi-user web servers
- REST APIs serving multiple clients
- WebSocket servers with concurrent connections
- Any scenario with concurrent state modifications

**State Isolation:**
Async engines keep separate state per async execution context via `AsyncLocalStorage`,
preventing state collision between concurrent requests. Bind a fresh state to each
request with `runWithInstanceState` — see [Asynchronous State Provider](#asynchronous-state-provider)
for the provider contract and the failure modes it is designed around.

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
  },
});

addNotification({
  topic: 'modifyMatchUp',
  payload: (payload) => {
    console.log('MatchUp modified:', payload.matchUp);
  },
});

// Now mutations trigger notifications
tournamentEngine.generateDrawDefinition({/* ... */});
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

**API Reference:** [generateDrawDefinition](/docs/governors/generation-governor#generatedrawdefinition)

```js
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
        matchUpStatus: payload.matchUp.matchUpStatus,
      });
    }
  },
});

// Recording a score triggers notification
tournamentEngine.setMatchUpStatus({
  matchUpId: 'match-1',
  outcome: {
    score: {
      sets: [
        { side1Score: 6, side2Score: 4 },
        { side1Score: 6, side2Score: 3 },
      ],
    },
  },
});
// WebSocket clients receive live update
```

See [Subscriptions](/docs/engines/subscriptions) for complete notification documentation.

---

## Rollback on Error

Protect tournament integrity by automatically reverting changes when operations fail.

### Basic Rollback

**API Reference:** [setMatchUpStatus](/docs/governors/matchup-governor#setmatchupstatus)

```js
import { tournamentEngine } from 'tods-competition-factory';

tournamentEngine.setState(tournamentRecord);

try {
  const result = await tournamentEngine.automatedPositioning({
    drawId: 'draw-1',
    rollbackOnError: true, // Enable automatic rollback
  });
} catch (error) {
  // State automatically reverted to pre-operation state
  console.error('Operation failed, state rolled back:', error);
}
```

### Transaction Pattern

**API Reference:** [automatedPositioning](/docs/governors/draws-governor#automatedpositioning)

```js
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

**API Reference:** [addEvent](/docs/governors/event-governor#addevent)

```js
import { tournamentEngine } from 'tods-competition-factory';

// No setup required for sync engines
tournamentEngine.setState(tournamentRecord);
tournamentEngine.addEvent({ event });
```

A sync engine holds **one** state for the whole process. That is correct for a client,
where there is one user and one tournament in view. On a server handling concurrent
requests it is not — every request would mutate the same records.

### Asynchronous State Provider

For a server, supply a state provider that gives each request its own engine state.

A provider is **not** a `getState`/`setState` pair. It implements the full internal
state surface the engines call into — `getTournamentRecords`, `setTournamentRecord`,
`addNotice`, `callListener`, `getMethods`, and so on.

The provider is **not exported from the package** — only `dist` is published, under a
single `"."` entry. Copy the reference implementation into your own server and register
it at startup, which is exactly what competition-factory-server does:

```js
// server.js
import { globalState, asyncEngine, governors } from 'tods-competition-factory';
import asyncGlobalState from './asyncGlobalState'; // your copy of the reference implementation

// Configure once at app startup
globalState.setStateMethods(governors, /* traverse */ true, /* depth */ 1, /* global */ true);
globalState.setStateProvider(asyncGlobalState);
```

The provider is built on `AsyncLocalStorage`, which propagates deterministically across
every `await` shape. Bind a fresh state per request by wrapping the request in
`runWithInstanceState` — the store is scoped to the callback, so it cannot outlive the
request or bleed into a sibling:

```js
app.post('/api/event', async (req, res) => {
  const result = await asyncGlobalState.runWithInstanceState(async () => {
    await asyncEngine.setState(req.tournament);
    return asyncEngine.addEvent({ event: req.body });
  });
  res.json(result);
});
```

:::caution Wrap every entry point
If engine state is touched outside `runWithInstanceState`, the provider lazily binds a
new state to the current async context and logs a warning — it never falls back to a
shared default and never throws.

That is a **safety net, not isolation**. Unwrapped siblings launched from a common
parent context still share state, because the first access binds a store to that shared
parent which the sibling then inherits. `asyncGlobalState.implicitContextCreations()`
returns how many times state was created implicitly; treat a non-zero count in
production as an unwrapped entry point to find, not as noise.
:::

:::warning Patterns that do not work
Two shapes were tried against real server traffic and rejected — do not reimplement them:

- **`getStore() || {}`** — returns a throwaway object when no context is bound. Reads
  and writes silently go nowhere, and it degrades to one shared process-wide state,
  which is the defect a provider exists to fix.
- **Throwing when no context is bound** — assumes every entry point is statically
  enumerable. It is not: governors are not uniformly pure, and
  `mocksGovernor.generateTournamentRecord()` dispatches notices, so a direct governor
  call touches instance state without going near an engine. A strict throw trades a
  silent correctness bug for a loud outage.

An earlier implementation keyed state by `executionAsyncId()` with an `init` hook
copying the parent's entry. That propagation is call-shape dependent — it isolates
under one `await` shape and leaks under another. `AsyncLocalStorage` does not have
this failure mode. See [competition-factory#4564](https://github.com/CourtHive/competition-factory/issues/4564).
:::

**Reference Implementation:**
`src/examples/asyncEngine/asyncGlobalState.ts` in the source code, which re-exports the
single implementation used by competition-factory-server.

---

## Debugging and Logging

Enable detailed logging for debugging and monitoring:

```js
import { tournamentEngine, globalState } from 'tods-competition-factory';

// Enable detailed logging
globalState.setDevContext({
  errors: true, // Log errors
  params: true, // Log method parameters
  result: true, // Log method results
  perf: 100, // Log methods taking >100ms
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
