---
title: Factory Errors
---

`FactoryError` is the base class of a rich error hierarchy that replaces the legacy `{ message, code, info? }` POJO envelope. Errors are first-class typed exceptions that carry the `code`, a native ES2022 `.cause` chain, the engine method that surfaced them, an optional JSON-path locator, structured `context`, and lazily-resolved actionable `suggestions`.

```ts
import { FactoryError, EventNotFoundError } from 'tods-competition-factory';

try {
  const { event } = unwrap(tournamentEngine.getEvent({ eventId: 'missing' }));
} catch (e) {
  if (e instanceof EventNotFoundError) {
    console.log(e.code); // 'ERR_NOT_FOUND_EVENT'
    console.log(e.message); // 'event not found: missing'
    console.log(e.methodName); // 'getEvent'
    console.log(e.context); // { eventId: 'missing' }
    console.log(e.suggestions); // ['Pass a valid `eventId` from …', …]
    console.log(e.cause); // underlying error if wrapped
  }
}
```

## Why it exists

The legacy POJO shape was OK at the boundary (serializes cleanly across IPC, easy to spread, never throws) but lost everything once it crossed back into JavaScript:

- `instanceof` couldn't route by error kind — every catch site re-parsed `result.error.code` with string equality.
- The `.cause` chain was dropped at every layer transition.
- Nothing carried call-site context (which method, which entity, what input).
- "What do I do about this?" lived in tribal knowledge, not on the error.

`FactoryError` solves all four without breaking the legacy contract: `toJSON()` still serializes to `{ message, code, info? }`, and the engine's invoke layer still returns `{ error: <POJO> }` for callers that expect it. Code that opts into the typed surface (via [`unwrap()`](./unwrap) or by importing the subclass directly) gets the rich fields.

## Class hierarchy

Thirteen subclasses cover the highest-fan-in error codes in the engine. Each is a one-liner that fixes `code` and inherits the rest of the surface.

| Subclass                        | Code                             |
| ------------------------------- | -------------------------------- |
| `MissingTournamentRecordError`  | `ERR_MISSING_TOURNAMENT`         |
| `MissingTournamentRecordsError` | `ERR_MISSING_TOURNAMENTS`        |
| `MissingDrawDefinitionError`    | `ERR_MISSING_DRAWDEF`            |
| `MissingEventError`             | `ERR_MISSING_EVENT_ID`           |
| `MissingValueError`             | `ERR_MISSING_VALUE`              |
| `MissingSanctioningRecordError` | `ERR_MISSING_SANCTIONING_RECORD` |
| `MissingOfficialRecordError`    | `ERR_MISSING_OFFICIAL_RECORD`    |
| `InvalidValuesError`            | `ERR_INVALID_VALUES`             |
| `InvalidDateError`              | `ERR_INVALID_DATE`               |
| `ParticipantNotFoundError`      | `ERR_NOT_FOUND_PARTICIPANT`      |
| `StructureNotFoundError`        | `ERR_NOT_FOUND_STRUCTURE`        |
| `MatchUpNotFoundError`          | `ERR_NOT_FOUND_MATCHUP`          |
| `EventNotFoundError`            | `ERR_NOT_FOUND_EVENT`            |

Codes that don't have a dedicated subclass surface as `FactoryError` with the right `code` string — fully usable, but the consumer pattern-matches on `e.code` rather than `instanceof`.

## Fields

```ts
class FactoryError extends Error {
  readonly code: string; // 'ERR_MISSING_TOURNAMENT'
  readonly methodName?: string; // 'addEvent' — set by invoke layer
  readonly path?: string; // 'events[2].drawDefinitions[0]'
  readonly context?: Record<string, any>; // call-site payload
  readonly info?: string; // legacy human-readable detail
  // inherited from Error
  readonly message: string;
  readonly cause?: unknown; // ES2022 native cause chain
  get suggestions(): string[]; // resolved lazily from registry
}
```

## Suggestions registry

`error.suggestions` is a getter that resolves at read time against a small registry. The lookup is by `code` and may consult `context` for code-specific hints:

```ts
import { getSuggestions, registerSuggestions } from 'tods-competition-factory';

getSuggestions('ERR_MISSING_TOURNAMENT');
// [
//   'Call tournamentEngine.setState({ tournamentRecord }) before this method.',
//   'Or pass `tournamentRecord` directly in the method params.',
// ]

getSuggestions('ERR_MISSING_VALUE', { key: 'drawId' });
// ['A required parameter `drawId` is missing — check the method signature.']
```

Seeded entries cover the codes above plus `ERR_INVALID_VALUES`, `ERR_INVALID_DATE`, `ERR_MISSING_SANCTIONING_RECORD`, `ERR_MISSING_OFFICIAL_RECORD`, and `ENGINE_RETURNED_UNDEFINED`. Consumers can register their own with `registerSuggestions(code, factory)`. A registered factory that throws never breaks error propagation — `getSuggestions` returns `[]` and the caller continues unwinding.

Suggestions are lazy by design: production paths that never read `.suggestions` pay zero cost.

## Backwards compatibility

`toJSON()` returns the legacy shape:

```ts
const err = new EventNotFoundError({ eventId: 'x' });
JSON.stringify(err);
// '{"message":"event not found: x","code":"ERR_NOT_FOUND_EVENT"}'
```

This means any existing consumer reading `result.error.code` or `JSON.stringify(result)` keeps working whether the engine returned a POJO or a `FactoryError`. The rich fields (`cause`, `methodName`, `path`, `context`, `suggestions`) are deliberately omitted from the JSON projection — consumers that want them work with the instance directly.

## Choosing how to surface errors

| Pattern                                                             | When                                                                                                     |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Engine returns `{ error: POJO }`, caller branches on `result.error` | Long-running mutation paths that need to roll back partial work — never throw across the engine boundary |
| Caller wraps with [`unwrap()`](./unwrap) and uses `instanceof`      | Dev paths, UI gates, test code — programmer error should be loud                                         |
| Caller wraps with `unwrapOr(result, fallback)`                      | Render paths where a typed fallback is the right UX                                                      |
| Catch at the top of an action handler and route by `e.code`         | When you don't want to import 13 subclasses but still want code-keyed routing                            |
