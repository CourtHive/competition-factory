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

`asyncEngine` is a factory **function**, not an engine: call it to get one. Install the async
state provider first — without one, `asyncEngine()` returns `{ error }` instead of an engine.

```js
import { asyncEngine, globalState, governors } from 'tods-competition-factory';
import asyncGlobalState from './asyncGlobalState'; // your copy of the reference implementation

// Once, at startup: install the provider BEFORE any asyncEngine() call
globalState.setStateProvider(asyncGlobalState);

// Each client request gets isolated state
app.post('/api/tournament/:id/event', async (req, res) => {
  const result = await asyncGlobalState.runWithInstanceState(async () => {
    const engine = asyncEngine(); // binds a fresh instance state to this request's context
    if (engine.error) return { error: engine.error };
    engine.importMethods(governors, true, 1);

    const tournamentRecord = await loadTournament(req.params.id);
    engine.setState(tournamentRecord);

    const outcome = await engine.addEvent({ event: req.body.event }); // imported methods return promises
    if (!outcome.error) await saveTournament(engine.getTournament().tournamentRecord);
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
import { globalState, tournamentEngine } from 'tods-competition-factory';

const { setSubscriptions } = globalState;

// One call registers a map of topic -> handler. Each handler receives the notice ARRAY for its
// topic, and runs after the engine method completes rather than during it.
setSubscriptions({
  addMatchUps: (payload) => {
    console.log('MatchUps added:', payload);
    // Update UI, trigger webhooks, etc.
  },
  modifyMatchUp: (payload) => {
    console.log('MatchUp modified:', payload);
  },
});

// Now mutations notify subscribers
tournamentEngine.generateDrawDefinition({/* ... */});
// Triggers the addMatchUps subscription
```

:::tip
For multiple handlers per topic, unsubscribe closures and a promise-based `waitFor`, use the typed
event bus — `engine.on / once / off / waitFor`. See [Subscriptions](./subscriptions.md).
:::

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
import { globalState, tournamentEngine } from 'tods-competition-factory';
import { broadcastToWebSocketClients } from './websocket';

const { setSubscriptions } = globalState;

// Broadcast score changes to connected clients
setSubscriptions({
  modifyMatchUp: (payload) => {
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

`rollbackOnError` snapshots the records before a call or a queue and restores them if it returns an
error. Its job is **multi-directive atomicity**: making several directives succeed or fail together.

It is **not** what makes a single method's error clean. A method that returns an error leaves the
record unchanged on a direct call, with or without the flag — each method is responsible for
refusing before it writes. Where a method still returns an error after writing, that is a defect: the
known cases are tracked, and the exit-propagation census property `ERROR_IMPLIES_NO_MUTATION`
(measured on direct calls) polices it. Do not pass `rollbackOnError` as the fix for one.

### Basic Rollback

**API Reference:** [automatedPositioning](/docs/governors/draws-governor#automatedpositioning)

Engine methods do not throw on failure: an error is **returned** as `result.error`. (Only a
truthy [devContext](/docs/engines/engine-methods#devcontext) lets an exception escape; with
`rollbackOnError` the state is restored before it does.) Check the result rather than wrapping the call
in `try`/`catch`.

A rollback restores more than the records: the selected tournament, the buffered notices (a refused
write's notices are never delivered; an enclosing operation's are kept) and the modification flag.
When the state cannot be snapshotted faithfully, a call with `rollbackOnError` is refused **before it
writes anything**, with `ROLLBACK_UNAVAILABLE`.

```js
import { tournamentEngine } from 'tods-competition-factory';

tournamentEngine.setState(tournamentRecord);

const result = tournamentEngine.automatedPositioning({
  drawId: 'draw-1',
  rollbackOnError: true, // accepted on any method; restores from a snapshot on { error }
});

if (result.error) {
  // the refusal is the thing to surface; the records are as they were before the call
  console.error('Operation refused:', result.error);
}
```

### Transaction Pattern

**API Reference:** [generateDrawDefinition](/docs/governors/generation-governor#generatedrawdefinition)

`rollbackOnError` on separate calls is **not** one transaction: each call restores only its own
changes, so a failure in the third call leaves the first two applied.

The same holds **inside** an `executionQueue` submitted without rollback: when a directive fails, the writes of the
directives before it stay in the records, and **no notices are delivered** for any of them, then or on any later call. The
record is stamped as modified at the queue's own instant, and the result carries `rolledBack: false` and `results`, the
directives that were applied before the refusal. A caller that persists
from notices, or that lent the engine its own objects (`setDeepCopy(false)`), must then discard the in-memory records
— for example by aborting its database transaction — because they no longer match what was announced. To make several mutations
succeed or fail together, submit them as one `executionQueue` with rollback enabled — the second
argument — and check the result:

```js
tournamentEngine.setState(tournamentRecord);

const result = tournamentEngine.executionQueue(
  [
    { method: 'addEvent', params: { event } },
    { method: 'generateDrawDefinition', params: { eventId: event.eventId, drawSize: 32 } },
    // `pipe` copies drawDefinition from the previous directive's result into these params
    { method: 'addDrawDefinition', params: { eventId: event.eventId }, pipe: { drawDefinition: true } },
    { method: 'attachPolicies', params: { policyDefinitions } },
  ],
  true, // rollbackOnError: any { error } restores the records as they were before the queue
);

if (result.error) {
  // nothing in the queue was kept; result.rolledBack is true
  console.error('Transaction failed:', result.error);
} else {
  // result is { success, results } — one entry per directive
  const { tournamentRecord: updated } = tournamentEngine.getTournament();
  await saveToDatabase(updated);
}
```

To restore by hand from a saved state, keep in mind that `getState()` returns a wrapper,
`{ tournamentId, tournamentRecords }`, not a record. Passing that wrapper back to `setState` loads it
as one malformed record. Load the records and the active tournament separately:

```js
const state = tournamentEngine.getState();
// ... later
tournamentEngine.setState(state.tournamentRecords);
tournamentEngine.setTournamentId(state.tournamentId);
```

### When to Use Rollback

**Use `rollbackOnError: true` when:**

- Several directives in one `executionQueue` must succeed or fail together
- Earlier directives in a queue must not survive a later one's refusal
- A persistence layer writes the whole record after the queue and must not store a half-applied batch

It is not a substitute for a method's own guarantee: a single method's error leaves the record
unchanged without it.

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
    // Instantiate inside the scope: construction binds a fresh instance state to the context,
    // so do it before setState or setSubscriptions, never after.
    const engine = asyncEngine();
    if (engine.error) return { error: engine.error };
    engine.setState(req.tournament);
    // methods registered globally above resolve by name in every request context
    return engine.executionQueue([{ method: 'addEvent', params: { event: req.body } }], true);
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
