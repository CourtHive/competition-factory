---
title: Hosting factory on a server
---

A server handles many requests at once. Engine state lives in the installed state provider, and the default provider
holds one state for the whole process, so on a server every request would read and write the same records. Install an
async state provider, give each request its own state, run its mutations with `tournamentEngineAsync` as one
`executionQueue` with `rollbackOnError`, and save the record only when the queue succeeds.

This page covers that pattern, the methods each exported engine carries, and the bundling hazard that can leave a
shared engine without a method TypeScript says it has.

## Choose the engine

| Engine                                            | What it is                                                                                          | On a server                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `tournamentEngineAsync`, `competitionEngineAsync` | One async engine instance, exported under two names, with every governor imported by its own module | Use this for mutations                         |
| `asyncEngine`                                     | A factory function. Each call returns an async engine with core methods only                        | Use it to assemble your own method set         |
| `tournamentEngine`, `syncEngine`, `scaleEngine`   | One sync singleton under several names                                                              | Never under the default, process-wide provider |
| `askEngine`                                       | A sync singleton that dispatches without notifications                                              | The reference server uses it for queries       |

Every engine reads and writes through the installed provider. Under the default provider that is one process-wide
state, which is why a sync engine is unsafe for concurrent requests. An async provider binds a state to the current
async execution context, so two concurrent requests never touch each other's records, whichever engine they call. The
async engine also awaits each method and each subscription handler, which the sync engines do not. See
[Engine Lifetimes and Shared State](./custom-engines.md#engine-lifetimes-and-shared-state) for how the sync engines share
state.

### Install an async state provider

The provider is **not exported from the package**. Copy the reference implementation,
`src/examples/asyncEngine/asyncGlobalState.ts`, into your server. It is built on `AsyncLocalStorage`, and it keeps
records, subscriptions, notices and the method registry per context. The reference server,
[competition-factory-server](https://github.com/CourtHive/competition-factory-server), runs a copy of it; this
page cites that server's patterns.

Wrap every entry point in `asyncGlobalState.runWithInstanceState(fn)`. The state is scoped to the callback and every
async step it spawns, so it cannot outlive the request or reach a sibling. State touched outside a wrapped entry point
gets an implicit per-context state and a console warning. That is a safety net, not isolation:
`asyncGlobalState.implicitContextCreations()` counts those creations, and a non-zero count in production is an
unwrapped entry point to find. The provider contract and the rejected alternatives are in
[Asynchronous State Provider](./mutation-engines.md#asynchronous-state-provider).

### Register methods globally for `executionQueue`

`tournamentEngineAsync` attaches every governor method to itself when its module is evaluated. That happens before
your startup code installs the async provider, so the method registry those imports also write to belongs to the
default provider. Under the async provider, each fresh request state starts with an empty registry.

Direct calls (`tournamentEngineAsync.addEvent(...)`) and `execute({ method })` find the method on the engine.
`executionQueue` resolves each directive **only** from the registry: the global methods plus the current state's
methods. Without a global registration it refuses the queue with `METHOD_NOT_FOUND`. Register the governors globally
once, at startup, as the reference server does:

```js
import { globalState, governors } from 'tods-competition-factory';

globalState.setStateMethods(governors, true, 1, true); // traverse, depth 1, global
```

From the release that includes [#6564](https://github.com/CourtHive/competition-factory/pull/6564), a queue also
resolves the methods the engine itself imported, so `tournamentEngineAsync` needs no global registration. Registering
globally stays correct. An engine assembled with `asyncEngine()` inside the request already finds the
methods it imports there.

## Handle a request

Each mutation request follows the same steps, all inside one `runWithInstanceState` scope:

1. **Serialize writes per tournament.** The factory does not do this. The reference server takes a per-tournament
   lock inside the request's state scope, then fetches the record.
2. **Load the record** with `setState`. It makes a deep copy by default, so the engine works on its own copy.
3. **Run the mutation** as `executionQueue(methods, true)`. Every directive's method is resolved before any runs. With
   `rollbackOnError` set, a refusal restores the engine state as it was before the queue and returns the refusal with
   `rolledBack: true`. A queue that completes returns `{ success, results }`.
4. **Save only on success.** Read the mutated record back from the engine and persist it only when the queue returned
   `success`. The reference server saves only then.

The reference server passes through the caller's `rollbackOnError` flag. A server that persists only whole successes
should pass `true`, so a refused queue leaves nothing half-applied in the request's state.

:::caution `error` and `success` live on the shared instance
`setState` returns the engine itself, with `error` and `success` set on it. `tournamentEngineAsync` is one object for
every request, so read them from the return value at once. Do not read `tournamentEngineAsync.error` later.
:::

### Minimal example

Framework-neutral. `storage` and `withTournamentLock` stand for your record store and your per-tournament mutex.

```js
import { globalState, governors, topicConstants, tournamentEngineAsync } from 'tods-competition-factory';
import asyncGlobalState from './asyncGlobalState'; // your copy of the reference provider

// Once, at startup
globalState.setStateMethods(governors, true, 1, true); // executionQueue resolves methods by name from here
globalState.setStateProvider(asyncGlobalState);

export function runMutation({ tournamentId, methods }) {
  return asyncGlobalState.runWithInstanceState(() =>
    withTournamentLock(tournamentId, async () => {
      // subscriptions belong to this request's state
      const addedEvents = [];
      globalState.setSubscriptions({
        subscriptions: { [topicConstants.ADD_EVENT]: (payloads) => addedEvents.push(...payloads) },
      });

      const tournamentRecord = await storage.load(tournamentId);
      const { error } = tournamentEngineAsync.setState(tournamentRecord);
      if (error) return { error };

      const result = await tournamentEngineAsync.executionQueue(methods, true);
      if (result.success) {
        await storage.save(tournamentEngineAsync.getTournament().tournamentRecord);
        // fan out addedEvents here: they were delivered after the queue succeeded
      }
      return result;
    }),
  );
}
```

With Express or Nest, call `runMutation` from the route handler. The reference server instead wraps every request in
`runWithInstanceState` with a middleware, and opens a scope again for each mutation.

## Notices and fan-out

Subscriptions are delivered after a queue completes. A refused queue returns before delivery. Under the async provider
subscriptions are part of the request's state, so set them in one of two ways:

- **Per request**, with `globalState.setSubscriptions({ subscriptions })` inside the scope, as in the example.
- **Once, for every context**, with `globalState.setGlobalSubscriptions({ subscriptions })` at startup.

If you build engines with `asyncEngine()` instead, construct the engine first and set subscriptions after: constructing
an async engine binds a fresh state to the context, which drops subscriptions set before it. The reference server
registers its handlers right after construction for this reason. Topics and payloads are in
[Subscriptions](./subscriptions.md).

## Mutation locks

[Mutation locks](../concepts/mutation-locks.md) control **who** may mutate a scope. They are stored in the record and
checked by a `lockToken` match, and a call without the right token is refused with `MUTATION_LOCKED`. They do not
serialize concurrent requests. That remains your server's per-tournament lock.

## Draw-level stamps

After a mutation the engine stamps the factory `{ version, timeStamp }` on the tournament record. `stampScope('modified')`
opts in to stamping what changed instead: each modified drawDefinition, and the tournament only when something outside
its draws changed. A storage layer that keeps a tournament in parts can then write one draw for a score entry.

The setting is process-wide, not per request. It needs the provider's optional `cycleModifiedTopics` hook to identify
draw-only changes; the reference provider implements it. The default is `'tournament'`. Making `'modified'` the default
in 8.0.0 is proposed, not decided. See [stampScope](./engine-methods.md#stampscope).

## Which governors each engine carries

The package is built one module per file and declares `"sideEffects": false`. A bundler keeps only the modules your
code reaches, so a shared engine carries only the methods attached by modules that made it into **that** bundle.

The sync names are one instance. `scaleEngine` is `syncEngine` with the ranking and ratings methods attached. In a
bundle that also imports `tournamentEngine`, it carries every governor. In a bundle that imports only `scaleEngine`, it
carries core methods plus ranking and ratings, so `scaleEngine.getMutationLocks` (a `tournamentGovernor` method) is
missing. TypeScript cannot tell the two bundles apart. In Node without a bundler, loading the package evaluates every
module, so every sync name carries every governor.

The table shows what each export carries when it is **the only engine a bundle imports**:

<!-- ENGINE_GOVERNORS:START — generated by scripts/generateEngineGovernors.mjs; do not edit by hand -->

| Export                                                                                         | Defined in                          | Governors carried when imported alone                  | Methods | Not from those governors | Same instance as                                                                                              |
| ---------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------ | ------- | ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `asyncEngine`                                                                                  | `assemblies/engines/async/public`   | none: a function (factory or class), not an engine     | —       | —                        | —                                                                                                             |
| `competitionEngineAsync`, `tournamentEngineAsync`                                              | `assemblies/engines/async/public`   | all 26 governors                                       | 812     | 38                       | —                                                                                                             |
| `syncEngine`                                                                                   | `assemblies/engines/sync`           | none                                                   | 38      | 38                       | `scaleEngine`, `competitionEngine`, `tournamentEngine`, `competitionEngineUntyped`, `tournamentEngineUntyped` |
| `askEngine`                                                                                    | `assemblies/engines/ask`            | none                                                   | 37      | 37                       | —                                                                                                             |
| `matchUpEngine`                                                                                | `assemblies/engines/matchUp`        | `scoreGovernor`                                        | 60      | 9                        | —                                                                                                             |
| `mocksEngine`                                                                                  | `assemblies/engines/mock`           | `mocksGovernor`; some of `simulationGovernor` (3 of 4) | 15      | 5                        | —                                                                                                             |
| `AvailabilityEngine`                                                                           | `assemblies/engines/availability`   | none: a function (factory or class), not an engine     | —       | —                        | —                                                                                                             |
| `scaleEngine`                                                                                  | `assemblies/engines/scale`          | `rankingGovernor`                                      | 51      | 40                       | `syncEngine`, `competitionEngine`, `tournamentEngine`, `competitionEngineUntyped`, `tournamentEngineUntyped`  |
| `sanctioningEngine`                                                                            | `assemblies/engines/sanctioning`    | some of `sanctioningGovernor` (34 of 36)               | 44      | 44                       | —                                                                                                             |
| `officiatingEngine`                                                                            | `assemblies/engines/officiating`    | some of `officiatingGovernor` (26 of 29)               | 36      | 36                       | —                                                                                                             |
| `competitionEngine`, `tournamentEngine`, `competitionEngineUntyped`, `tournamentEngineUntyped` | `assemblies/engines/sync/assembled` | all 26 governors                                       | 812     | 38                       | `syncEngine`, `scaleEngine`                                                                                   |

<!-- ENGINE_GOVERNORS:END -->

How to read it:

- **Generated**, by `node scripts/generateEngineGovernors.mjs` (`--check` fails on drift). Each engine is bundled alone
  with esbuild and its function keys are matched by name against each governor's functions.
- **Methods** counts every function on the engine. **Not from those governors** counts the rest: core methods such as
  `setState` and `executionQueue`, and methods attached individually, such as the ratings methods on `scaleEngine`.
- **Same instance as** comes from a second bundle that loads every engine module together. The sync names share one
  object; the async instance shares nothing with them.
- `sanctioningEngine` and `officiatingEngine` are built from their own method lists, not by importing a governor, so
  most of their governor's methods appear under the same names and a few do not.

### What a missing method looks like

How you call a missing method decides how it fails:

```js
import { scaleEngine } from 'tods-competition-factory';

// a direct property call throws: TypeError: scaleEngine.getMutationLocks is not a function
scaleEngine.getMutationLocks();

// by name, the engine returns an error instead of throwing
scaleEngine.execute({ method: 'getMutationLocks', params: {} });
// { error: METHOD_NOT_FOUND, methodName: 'getMutationLocks' }

scaleEngine.executionQueue([{ method: 'getMutationLocks', params: {} }]);
// { error: METHOD_NOT_FOUND, methodName: 'getMutationLocks' }, and no directive has run
```

`METHOD_NOT_FOUND` is `errorConditionConstants.METHOD_NOT_FOUND` (code `ERR_NOT_FOUND_METHOD`).

### Avoiding it

- **On a server, use `tournamentEngineAsync`.** Its own module imports every governor, so it carries the full surface
  in any bundle. Register the governors globally for `executionQueue`, as above.
- **If you use a shared sync engine, import what you call, once, at startup.** Importing by name keeps the bundle
  small:

  ```js
  import { scaleEngine, tournamentGovernor } from 'tods-competition-factory';

  scaleEngine.importMethods({ getMutationLocks: tournamentGovernor.getMutationLocks });
  ```

  Imported methods accumulate for the life of the process, and on the sync names they reach every alias. Configure
  them in one module, not from each route.

- **Prefer `execute` or `executionQueue` by name** where a missing method should come back as an error result rather
  than a throw.

## Not available

- **A keep-warm engine.** Each request loads its record. Nothing in the engine keeps a record in memory between
  requests.
- **An exported state provider or a typed `StateProvider`.** You copy the reference provider. `setStateProvider`
  checks for the required method names at run time and throws `Global state provider is missing required methods`
  when one is absent.

## Related

- [Mutation Engines](./mutation-engines.md) — sync and async engines, and the asynchronous state provider contract
- [Custom Engines](./custom-engines.md) — engine lifetimes, method import patterns and bundle size
- [State Engines](./state-engines.mdx) — the engine overview
- [Global State](./global-state.md) — `setState`, deep copy and the other process-wide settings
- [Subscriptions](./subscriptions.md) — topics and payloads
- [Engine Methods](./engine-methods.md) — `stampScope`, `loadedFootprint` and the other engine methods
- [Mutation Locks](../concepts/mutation-locks.md) — token-scoped locks stored in the record
- [Competition Factory Server](../tmx/factory-server.md) — the reference server, as TMX uses it
