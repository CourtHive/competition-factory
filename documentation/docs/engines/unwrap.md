---
title: Unwrap (engine.q's loud companion)
---

`unwrap(result)` turns a factory result envelope into either its success payload or a thrown `FactoryError` subclass. Companion to `engine.q.*`: where `q.*` does **silent** fallback (returns `[]` or `undefined` when a query errors), `unwrap()` makes errors **loud** — lifting the legacy `{ error: { code, message, info? } }` envelope into a typed exception that catch sites can pattern-match via `instanceof`.

```ts
import { unwrap } from 'tods-competition-factory';

const { events } = unwrap(tournamentEngine.getEvents());
// throws InvalidValuesError / MissingTournamentRecordError / ...
// returns the success-branch payload otherwise
```

## Why it exists

The legacy "return-an-envelope" pattern (`{ error: { code, message } }` vs. `{ events }`) keeps the engine's surface stable but pushes branching to the call site. For UI gates and dev paths that _want_ to crash on programmer error, that's noise:

```ts
// before — every call site re-implements the error check
const result = tournamentEngine.getEvent({ eventId });
if (result.error) {
  throw new Error(result.error.message); // loses code, info, suggestions
}
const event = result.event;
```

`unwrap()` collapses the same intent to one line and preserves the typed exception:

```ts
const { event } = unwrap(tournamentEngine.getEvent({ eventId }));
```

## Pattern-match the thrown error

The thrown error is a `FactoryError` subclass. Catch sites match by class for routing logic and read the rich fields (`code`, `suggestions`, `cause`, `methodName`, `context`) for UX:

```ts
import { unwrap, EventNotFoundError, InvalidValuesError } from 'tods-competition-factory';

try {
  const { drawDefinition } = unwrap(tournamentEngine.getEvent({ eventId }));
  render(drawDefinition);
} catch (e) {
  if (e instanceof EventNotFoundError) {
    showToast(e.message, { suggestions: e.suggestions });
  } else if (e instanceof InvalidValuesError) {
    showFieldErrors(e.context);
  } else {
    throw e;
  }
}
```

See [Factory errors](./factory-errors) for the full class hierarchy and the suggestions registry.

## `unwrapOr(result, fallback)`

The error-tolerant variant. Useful in render paths where a missing entity should fall back to a safe default rather than blow up:

```ts
import { unwrapOr } from 'tods-competition-factory';

const { events = [] } = unwrapOr(tournamentEngine.getEvents(), { events: [] });
// errors silently → returns `{ events: [] }`
// success → returns the result envelope unchanged
```

`unwrapOr` is the discriminated-union complement to `engine.q.*` — `engine.q.events()` returns `[]` on error; `unwrapOr` returns whatever fallback the caller chooses, including `undefined`, an empty array, or a sentinel object.

## Backwards compatibility

`unwrap()` accepts **both** shapes of `result.error`:

1. The legacy POJO (`{ code, message, info? }`).
2. A pre-thrown `FactoryError` instance (set by engine middleware that has already constructed the typed error).

Legacy POJOs are upgraded to the matching subclass via the code registry (`constructFactoryError`); already-typed errors are re-thrown unchanged so the originating class and `.cause` chain are preserved.

## When to use which

| Pattern                                  | Use when                                                              |
| ---------------------------------------- | --------------------------------------------------------------------- |
| `engine.q.events()`                      | Render path — empty data is fine; "no events" is a valid UI state     |
| `unwrap(engine.getEvents())`             | Mutation path / dev path — error is a bug, throw and surface          |
| `unwrapOr(engine.getEvents(), fallback)` | Render path where you want a _specific_ fallback shape, not `[]`      |
| Raw `engine.getEvents()`                 | Migration code interfacing with legacy callers expecting the envelope |

## Type narrowing

`unwrap`'s return type drops the error arm of the envelope, so destructuring is safe without optional chaining:

```ts
// Before unwrap — the events key might not be present on the error arm
const { events } = tournamentEngine.getEvents();
events.forEach(e => …); // TS: 'events' is possibly undefined

// After unwrap — the error arm is excluded, events is Event[]
const { events } = unwrap(tournamentEngine.getEvents());
events.forEach(e => …); // ok
```
