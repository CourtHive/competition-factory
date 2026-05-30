---
title: RFC 6902 JSON Patch
---

The factory ships a minimal RFC 6902 JSON Patch generator used by [`dryRun`](./dry-run-explain) (and downstream by audit / time-travel tooling) to express "what would change" between two state snapshots. Zero-runtime-deps: hand-rolled to keep the factory's posture intact.

```ts
import { generatePatch, type JsonPatch } from 'tods-competition-factory';

const patch: JsonPatch = generatePatch(before, after);
// [
//   { op: 'replace', path: '/events/0/eventName', value: 'New Name' },
//   { op: 'add',     path: '/events/0/category', value: { categoryName: 'OPEN' } },
// ]
```

## What it emits

Three operations cover the forward-only diff:

| Op        | When                                                        |
| --------- | ----------------------------------------------------------- |
| `add`     | A key or array index appears in `after` but not in `before` |
| `remove`  | A key or array index appears in `before` but not in `after` |
| `replace` | A value at the same key/index differs                       |

Skipped intentionally:

- **`move` / `copy`** — would require quadratic value-equality search across the whole tree. The readability win for human consumers is small while the cost (and false-positive risk on common scalar values) is large.
- **`test`** — only meaningful for patch _application_, not generation.

## Path syntax (RFC 6901)

Paths follow RFC 6901 JSON Pointer:

- Root is the empty string `""`.
- Segments are joined by `/`.
- `~` in a key is escaped to `~0`.
- `/` in a key is escaped to `~1` (this comes first in escape order so `~` doesn't get double-escaped).

```ts
// "events" key → "/events"
// events[0].eventName → "/events/0/eventName"
// key "a/b" → "/a~1b"
```

## Array semantics

Arrays are diffed by **index**, not by content. A `push`-style mutation that appends a new entry produces one clean `add` at the tail:

```ts
generatePatch({ items: [1, 2] }, { items: [1, 2, 3] });
// [{ op: 'add', path: '/items/2', value: 3 }]
```

Inserts in the middle produce per-tail `replace`s plus a single tail `add`, which is verbose but correct — the patches are still applicable by any RFC 6902 patcher:

```ts
generatePatch({ items: [1, 3] }, { items: [1, 2, 3] });
// [
//   { op: 'replace', path: '/items/1', value: 2 },
//   { op: 'add',     path: '/items/2', value: 3 },
// ]
```

For pretty "moved entry" detection a content-keyed differ is the right tool; defer.

## Performance

Single tree walk, O(n) over the combined node count of `before` and `after`. The dominant cost in production callers is the `makeDeepCopy` snapshot they already take to capture `before`. Patches over typical state snapshots return in single-digit milliseconds.

## Where it's used

| Caller                                             | Purpose                                                                 |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| `engine.dryRun(directives).patch`                  | "Would-be" diff of a directive list, surfaced to UI preview / audit log |
| `engine.explain(method, params).touchesPaths`      | The bare path list — used for permission gates and change tooltips      |
| Future: time-travel undo, server-side audit shadow | Round-trip with `applyPatch` once shipped                               |

## Limitations

- **Forward-only.** No `applyPatch` is shipped today — patches are produced for display / shipping to a patcher that already exists in the consumer.
- **Reference equality on objects.** Two distinct objects with identical contents diff as `replace` at the parent, not no-op. This matches the dryRun caller — both inputs come from a fresh `makeDeepCopy`, so the comparison is content-driven once you've walked into the leaves.
- **`NaN === NaN` treated as equal.** Leaf comparison normalizes `NaN` so spurious `replace` ops don't appear when both before and after carry it.
