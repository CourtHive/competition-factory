---
title: getTally
---

`getTally({ positionAssignment })` is a mode-agnostic reader for the round-robin tally stored on a `PositionAssignment`. Callers should never branch on `schemaWriteMode` — use this helper.

```ts
import { getTally } from 'tods-competition-factory';

const { tally } = getTally({ positionAssignment });
// works in both native (5.0.0 default) and legacy modes
```

## Why it exists

CODES Phase 1 promoted the round-robin tally and `subOrder` to first-class attributes on `PositionAssignment`. Old code reads `findExtension({element: positionAssignment, name: 'tally'})`; new code reads `positionAssignment.tally` directly.

If consumers branched on the mode flag, every site would have to know whether the record was written by a `native`-mode or `legacy`-mode engine. `getTally` removes the branch — it tries the first-class location, falls back to the extension envelope, and returns whichever is present.

## Where the value lives by mode

| Mode                                            | Read path                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------------- |
| `native` (5.0.0 default)                        | `positionAssignment.tally`                                                 |
| `legacy` (4.x default; opt-in for v5 consumers) | `positionAssignment.extensions[{name: 'tally'}].value`                     |
| `dual` (interim)                                | Both locations carry the same value — `getTally` reads the first-class one |

Under the hood the helper is a thin wrapper around `firstClassOrExtension({ element, attribute: 'tally', name: TALLY })`.

## Errors

```ts
type GetTallyArgs = { positionAssignment?: any };
```

| `error.code`                   | When                                                                        |
| ------------------------------ | --------------------------------------------------------------------------- |
| `MISSING_POSITION_ASSIGNMENTS` | `positionAssignment` argument was missing                                   |
| `NOT_FOUND`                    | Neither `positionAssignment.tally` nor the legacy extension carried a value |

Errors come back as the legacy `{ error: { code } }` envelope; wrap with [`unwrap()`](./unwrap) if you want them as typed exceptions.

## See also

- The [4.x to 5.0.0 migration guide](../migration-5.0.0) — the table of promoted attributes and their mode-agnostic readers.
- [`migrateTournamentRecord`](./migrate-tournament-record) — one-shot helper that lifts the legacy shape to native in place.
- [Round Robin tally policy](../policies/roundRobinTallyPolicy) — the policy that drives what the tally contains.
