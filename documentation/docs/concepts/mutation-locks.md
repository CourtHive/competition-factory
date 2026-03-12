---
title: Mutation Locks
---

## Overview

Mutation locks provide concurrency control for scoped mutations within a tournament record. They allow a calling application to restrict who can perform certain operations — like scheduling, scoring, or draw modifications — by requiring a matching `lockToken` on mutation calls.

The factory is **agnostic to user identity**. It stores locks as [extensions](./extensions) and performs a simple string equality check on `lockToken`. The calling application (TMX, competition-factory-server) handles identity, authorization, and token issuance.

### Key Concepts

**Opt-in**: Mutation lock checking is only active when the tournament-level `mutationLocks` extension has `enabled: true`. Without this, every mutation call bypasses lock logic with zero overhead.

**Hierarchical**: Locks can be placed at the tournament, event, draw, or venue level. A lock at a higher level blocks mutations on all child elements.

**Scoped**: Each lock targets a specific mutation domain (SCHEDULING, SCORING, DRAWS, etc.). Only mutations in that domain are affected.

**Token-based**: Callers pass a `lockToken` parameter on mutation calls. If the token matches the active lock, the call is allowed. The factory never interprets the token.

**Auto-cleanup**: Locks are stored on the element they scope to. If an event or draw is deleted, its locks are automatically deleted with it.

### Use Cases

**Exclusive scheduling**: A user takes control of scheduling for offline bulk work. Other users' scheduling mutations are blocked until the lock is released.

**Scoring assignment**: An admin assigns scoring for a specific draw to a specific user. Only that user (with the matching token) can score matchUps in that draw.

**Permanent restriction**: Certain operations (e.g., deleting draws) are permanently blocked for non-admin users by setting `expiresAt: null` with a method-level lock.

---

## Enabling Mutation Locks

Mutation locks are opt-in. The feature activates automatically when `addMutationLock` is called — there is no separate setup step.

```js
// This single call enables the feature and creates the lock
engine.addMutationLock({
  scope: 'SCHEDULING',
  lockToken: 'user-session-token',
});
```

Behind the scenes, `addMutationLock` ensures a tournament-level `mutationLocks` extension exists with `enabled: true`. This is the gate that the interceptor checks on every mutation call.

For tournaments without locks (the vast majority), the interceptor performs a single fast in-memory array scan on `tournamentRecord.extensions` and returns immediately — no function calls, no hierarchy traversal.

---

## Lock Hierarchy

Locks can be placed at four levels. A lock at any level blocks mutations on that level and all child elements:

```text
tournamentRecord        ← tournament-level lock blocks everything
  ├── event             ← event-level lock blocks all draws in the event
  │   ├── drawDefinition ← draw-level lock blocks only this draw
  │   └── drawDefinition
  ├── event
  └── venue             ← venue-level lock blocks only this venue
```

### Example: Draw-Scoped Scoring Lock

```js
// Lock scoring on a specific draw
engine.addMutationLock({
  scope: 'SCORING',
  lockToken: 'scorer-abc',
  drawId: 'draw-123',
});

// This call is BLOCKED (no lockToken)
engine.setMatchUpStatus({
  matchUpId: 'match-1',
  drawId: 'draw-123',
  outcome: { matchUpStatus: 'COMPLETED', winningSide: 1 },
});
// → { error: MUTATION_LOCKED }

// This call PASSES (correct lockToken)
engine.setMatchUpStatus({
  matchUpId: 'match-1',
  drawId: 'draw-123',
  outcome: { matchUpStatus: 'COMPLETED', winningSide: 1 },
  lockToken: 'scorer-abc',
});
// → { success: true }
```

### Example: Event-Level Lock

```js
// Lock scoring for all draws in an event
engine.addMutationLock({
  scope: 'SCORING',
  lockToken: 'event-admin-token',
  eventId: 'event-456',
});

// Scoring any matchUp in any draw within this event requires the token
```

### Example: Tournament-Level Lock

```js
// Lock all scheduling across the tournament
engine.addMutationLock({
  scope: 'SCHEDULING',
  lockToken: 'scheduler-token',
});

// All scheduling mutations across all draws/events require the token
```

---

## Lock Scopes

Each lock targets a specific mutation domain. Only mutations mapped to that domain are affected — query methods are never blocked.

| Scope          | Governor                       | Blocked Operations                                                                           |
| -------------- | ------------------------------ | -------------------------------------------------------------------------------------------- |
| `SCHEDULING`   | scheduleGovernor               | scheduleMatchUps, assignMatchUpCourt, clearScheduledMatchUps, ...                            |
| `SCORING`      | matchUpGovernor, scoreGovernor | setMatchUpStatus, setMatchUpState, resetScorecard, addPoint, ...                             |
| `DRAWS`        | drawsGovernor                  | setPositionAssignments, resetDrawDefinition, assignDrawPosition, generateDrawDefinition, ... |
| `MATCHUPS`     | matchUpGovernor                | assignMatchUpSideParticipant, substituteParticipant, setMatchUpFormat, ...                   |
| `PARTICIPANTS` | participantGovernor            | addParticipants, modifyParticipant, deleteParticipants, ...                                  |
| `ENTRIES`      | entriesGovernor                | modifyEventEntries, addEventEntries, promoteAlternate, ...                                   |
| `EVENTS`       | eventGovernor                  | addEvent, deleteEvents, deleteDrawDefinitions, modifyEvent, ...                              |
| `VENUES`       | venueGovernor                  | addVenue, deleteVenue, addCourt, modifyCourt, ...                                            |
| `PUBLISHING`   | publishingGovernor             | publishEvent, unPublishEvent, publishOrderOfPlay, ...                                        |
| `TOURNAMENT`   | tournamentGovernor             | setTournamentName, setTournamentDates, addTournamentExtension, ...                           |
| `TIE_FORMAT`   | tieFormatGovernor              | modifyTieFormat, addCollectionDefinition, ...                                                |
| `POLICY`       | policyGovernor                 | attachPolicies, removePolicy                                                                 |
| `COMPETITION`  | competitionGovernor            | linkTournaments, unlinkTournament, ...                                                       |
| `RANKING`      | rankingGovernor                | applyTournamentRankingPoints                                                                 |

Methods not in the scope map (queries, lock management methods) are **never blocked**.

---

## Method-Level Locks

For fine-grained control, a lock can specify a `methods` array to restrict only specific methods within a scope:

```js
// Block only draw deletion, not other event mutations
engine.addMutationLock({
  scope: 'EVENTS',
  lockToken: 'admin-token',
  methods: ['deleteDrawDefinitions', 'deleteEvents'],
});

// addEvent still works (not in methods list)
engine.addEvent({ event: { eventName: 'New Event', eventType: 'SINGLES' } });
// → { success: true }

// deleteEvents is blocked
engine.deleteEvents({ eventIds: ['event-1'] });
// → { error: MUTATION_LOCKED }

// deleteEvents with correct token passes
engine.deleteEvents({ eventIds: ['event-1'], lockToken: 'admin-token' });
// → passes lock check
```

---

## Lock Expiry

Locks can be permanent or time-limited:

```js
// Permanent lock (never expires)
engine.addMutationLock({
  scope: 'SCHEDULING',
  lockToken: 'token',
  expiresAt: null, // default
});

// Time-limited lock (expires at a specific UTC time)
engine.addMutationLock({
  scope: 'SCHEDULING',
  lockToken: 'token',
  expiresAt: '2026-03-01T12:00:00.000Z',
});
```

Expired locks are cleaned up lazily (removed when encountered during a lock check) and can also be proactively removed with `cleanExpiredMutationLocks`.

---

## Passing lockToken

Callers include `lockToken` as a parameter on any mutation call:

```js
// Direct engine call
engine.scheduleMatchUps({ lockToken: 'user-token', ...otherParams });

// Via executionQueue
engine.executionQueue([
  { method: 'scheduleMatchUps', params: { lockToken: 'user-token', ... } },
  { method: 'assignMatchUpCourt', params: { lockToken: 'user-token', ... } },
]);
```

---

## API Reference

### addMutationLock

Acquires a mutation lock on a tournament element. Automatically enables the mutation locks feature gate.

```js
const { success, lockId } = engine.addMutationLock({
  scope, // required - MutationLockScope (e.g. 'SCHEDULING', 'SCORING')
  lockToken, // required - opaque string token
  expiresAt, // optional - ISO 8601 UTC string or null for permanent (default: null)
  methods, // optional - string[] to restrict lock to specific methods within scope
  drawId, // optional - lock on specific draw
  eventId, // optional - lock on specific event
  venueId, // optional - lock on specific venue
  // no drawId/eventId/venueId = tournament-level lock
});
```

**Upsert behavior**: If a lock already exists on the same scope with the **same token**, the lock is updated (expiresAt, methods). If the token is **different**, `MUTATION_LOCK_EXISTS` is returned.

---

### removeMutationLock

Releases a mutation lock. Requires the matching `lockToken` unless `forceRelease: true`.

```js
const { success } = engine.removeMutationLock({
  lockId, // optional - identify lock by ID
  scope, // optional - identify lock by scope (alternative to lockId)
  lockToken, // required unless forceRelease
  forceRelease, // optional - bypass token check (for admin override)
  drawId, // optional - target element
  eventId, // optional - target element
  venueId, // optional - target element
});
```

**Errors**: `MUTATION_LOCK_NOT_FOUND` if no matching lock exists. `UNAUTHORIZED_LOCK_OPERATION` if token doesn't match.

---

### getMutationLocks

Returns all active (non-expired) locks across the entire tournament, with element context.

```js
const { mutationLocks } = engine.getMutationLocks({
  scope, // optional - filter by scope
});

// Each lock includes:
// { lockId, lockToken, scope, methods?, expiresAt, createdAt, drawId?, eventId?, venueId? }
```

Tournament-level locks have no `drawId`/`eventId`/`venueId`. Event-level locks include `eventId`. Draw-level locks include both `eventId` and `drawId`.

---

### cleanExpiredMutationLocks

Proactively removes expired locks from all elements in the tournament.

```js
const { success, removedCount } = engine.cleanExpiredMutationLocks();
```

---

## Extension Structure

Mutation locks are stored as a `mutationLocks` extension on the scoped element. The tournament-level extension includes an `enabled` flag that acts as the feature gate.

**Tournament-level** (feature gate + tournament locks):

```js
{
  name: 'mutationLocks',
  value: {
    enabled: true,
    locks: [
      {
        lockId: 'uuid-1',
        lockToken: 'opaque-token',
        scope: 'SCHEDULING',
        expiresAt: '2026-03-01T12:00:00.000Z',
        createdAt: '2026-02-27T10:00:00.000Z',
      }
    ]
  }
}
```

**Element-level** (draw, event, or venue):

```js
{
  name: 'mutationLocks',
  value: {
    locks: [
      {
        lockId: 'uuid-2',
        lockToken: 'scorer-token',
        scope: 'SCORING',
        methods: ['setMatchUpStatus', 'setMatchUpState'],
        expiresAt: null,
        createdAt: '2026-02-27T10:00:00.000Z',
      }
    ]
  }
}
```

The `mutationLocks` extension is classified as an internal extension and is excluded during tournament anonymization.

---

## Error Constants

| Constant                      | Code                              | When                                                                            |
| ----------------------------- | --------------------------------- | ------------------------------------------------------------------------------- |
| `MUTATION_LOCKED`             | `ERR_MUTATION_LOCKED`             | Mutation blocked by an active lock (no token or wrong token)                    |
| `MUTATION_LOCK_EXISTS`        | `ERR_EXISTING_MUTATION_LOCK`      | Attempting to add a lock on a scope that already has one with a different token |
| `MUTATION_LOCK_NOT_FOUND`     | `ERR_NOT_FOUND_MUTATION_LOCK`     | Attempting to remove a lock that doesn't exist                                  |
| `UNAUTHORIZED_LOCK_OPERATION` | `ERR_UNAUTHORIZED_LOCK_OPERATION` | Attempting to remove a lock with the wrong token                                |

---

## Interception Architecture

Lock enforcement is inserted into `executeFunction` (the single chokepoint for all engine calls), between parameter middleware and method invocation:

```text
executeFunction
  ├── paramsMiddleware     (resolve tournamentRecord, event, drawDefinition)
  ├── checkMutationLock    (check lock, compare lockToken)
  └── invoke               (run the method)
```

The check follows this logic:

1. **Fast gate**: Scan `tournamentRecord.extensions` for a `mutationLocks` extension with `enabled: true`. If not found, return immediately (zero overhead for tournaments without locks).
2. **Scope lookup**: Look up `methodName` in the scope map. If unmapped, allow.
3. **Hierarchy walk**: Check each element in order — `drawDefinition` → `event` → `tournamentRecord` (and `venue` if `venueId` is in params).
4. **Lock match**: For each element, find a lock matching the scope (and method, if `methods` is set).
5. **Expiry**: If the lock has expired, remove it lazily and continue.
6. **Token check**: If `params.lockToken === lock.lockToken`, allow. Otherwise, return `MUTATION_LOCKED`.

---

## Integration Patterns

### Server-Side Token Issuance

The factory doesn't know about users. The server issues tokens and maps them to users:

```js
// Server creates a lock and gives the token to the user
const lockToken = generateSecureToken();
await engine.addMutationLock({
  scope: 'SCHEDULING',
  lockToken,
  expiresAt: addHours(new Date(), 2).toISOString(),
});

// Store mapping: userId → lockToken
await redis.set(`lock:${userId}`, lockToken, 'EX', 7200);

// When user makes a mutation, server injects the token
const userToken = await redis.get(`lock:${userId}`);
await engine.scheduleMatchUps({ ...params, lockToken: userToken });
```

### ExecutionQueue with Locks

When using `executionQueue` for batch operations, include `lockToken` in each directive's params:

```js
engine.executionQueue([
  {
    method: 'scheduleMatchUps',
    params: { lockToken: 'scheduler-token', drawId, matchUpIds, schedule },
  },
  {
    method: 'assignMatchUpCourt',
    params: { lockToken: 'scheduler-token', matchUpId, courtId, drawId },
  },
]);
```

If any directive fails the lock check, the entire queue is rolled back.

### Admin Force Release

For emergency scenarios, administrators can force-release any lock:

```js
// Get all active locks
const { mutationLocks } = engine.getMutationLocks();

// Force release without knowing the token
engine.removeMutationLock({
  lockId: mutationLocks[0].lockId,
  forceRelease: true,
});
```

---

## Related Documentation

- **[Extensions](./extensions)** - How extensions work on tournament elements
- **[Engine Middleware](../engines/engine-middleware)** - How drawId/eventId resolve to elements
- **[Tournament Governor](../governors/tournament-governor)** - API reference for lock methods
