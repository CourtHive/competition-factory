---
title: A Second Backend
---

## Overview

The test suite can run against a **second implementation** of the engine's methods: any executable that answers an
engine call as this engine does. Calls to the methods it lists are routed to it, and everything else stays on this
engine, so a test that builds a draw with `mocksEngine`, schedules it through the second implementation and asserts
with a query runs unchanged. This page is for **contributors**; consumers of the published package do not need it.

It is opt-in. Without `FACTORY_BACKEND`, the harness does nothing and the suite runs as it always does.

```sh
FACTORY_BACKEND=differential FACTORY_BACKEND_COMMAND=/path/to/executable pnpm vitest run
```

| variable                  | meaning                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `FACTORY_BACKEND`         | `external`: the second implementation's answer stands. `differential`: both run, and a test fails on any difference. |
| `FACTORY_BACKEND_COMMAND` | the executable                                                                                                       |
| `FACTORY_BACKEND_REPORT`  | optional: a file each worker appends the calls it routed to, per test file and method                                |

## What is routed, and what is not

The engine hands the second implementation the **method only** (`setFactoryBackend`, `engineInvoke`). Its own work
around the method is done either way: the captured clock, `rollbackOnError`, the factory stamp written after a mutation,
and notices. In `differential` mode the two are compared before that stamp is written.

- **Result:** success, or the error's code.
- **Records:** every tournament record, by canonical hash with the factory's version stamps left out; a difference names
  the first paths that differ, with both values.

## The protocol

`<command> --methods` prints the engine methods it answers, as a JSON array. `<command> --serve` reads one call per
line and writes one answer per line; the harness keeps one such process per worker behind a synchronous bridge
(`backendBridge.ts`: a worker thread and an `Atomics` wait), because engine calls are synchronous.

A call:

```json
{
  "method": "scheduleProfileRounds",
  "params": { "scheduleDates": ["2026-10-01"] },
  "records": [{ "tournamentId": "…" }],
  "activeTournamentId": "…",
  "clock": "2026-10-01T12:00:00.000Z",
  "seed": 1234,
  "topics": ["audit"],
  "writeMode": "native"
}
```

`params` are the caller's, without the records and active tournament the engine adds and without functions. `clock` is
the instant the call captured; `seed` is where the random stream stands; `topics` are the notice topics the engine has
subscribers for (a method announces to a subscribed topic instead of writing, as the scheduling audit does); `writeMode`
is the engine's schema write mode (`native`, `bridge` or `legacy`: whether a schedule attribute is written first-class,
as a timeItem, or both). An answer is `{ result, records, seed? }`, or
`{ declined: reason }` for a call it does not implement with these params, which this engine then runs itself; the
report counts declined calls separately.

## The scoring engine class

`ScoringEngine` is a class, not an engine method, so it is routed per instance (`scoringBackend.ts`), under
`differential` only. `<command> --scoring-methods` lists the class methods it answers. The first routed call on an
instance opens a **session** in the serving process from the instance as it stands (its options, `getState()` and
`getSupplementaryState()`); every later call on that instance goes to the same session, so the second implementation
keeps its own timeline and redo stack. After each call the two are compared on the scoring corpus's observable: what
the call returned, the score, the timeline's shape, the servers, the undo and redo depths and the players on court, or
the refusal's message. A call that replaces the instance's state (`setState`, `loadSupplementaryState`, `reset`,
`markHardBoundary`) reopens its session at the next routed call. Only the outermost call on an instance is routed.

```json
{
  "session": "scoring-1234-1",
  "create": { "options": {}, "state": {}, "supplementary": {} },
  "method": "addPoint",
  "params": { "winner": 0 }
}
```

## When a test disagrees

The error names the method, what differs and a file holding the call as sent. Pipe that file to the executable to
replay the call by hand:

```sh
/path/to/executable < /tmp/backend-call-….json
```

## Files a second backend cannot test

`src/tests/testHarness/backendExclusions.ts` lists, each with its reason, test files that only this engine can run, such
as a file that mocks one of the factory's own modules with `vi.mock`, which no other process can see. An excluded file
runs on this engine alone and the report names it. A file belongs there only for that kind of reason, never because a
second implementation answers it differently.
