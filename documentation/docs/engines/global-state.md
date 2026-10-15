---
title: Global State
---

## devContext

Setting a truthy devContext (`true` or an object) bypasses the **try {} catch (err) {}** block around method
invocation, so an exception thrown inside a method propagates to the caller; an object value also configures logging.
`setDevContext` sets the value; `getDevContext` only reads it.

```js
setDevContext(true);
getDevContext(); // true
getDevContext({ errors: true }); // the devContext object if every given key matches, otherwise false
```

---

## getState

Returns a deep copy of `tournamentRecords` which have been loaded, along with currently selected `tournamentId`.
With deep copy disabled (`setDeepCopy(false)`, or `setState(records, false)`), `tournamentRecords` holds the live loaded
objects rather than copies.

```js
const { tournamentId, tournamentRecords } = getState({
  convertExtensions, // optional - convert extensions to '_' prefixed attributes
  removeExtensions, // optional - strip all extensions out of tournamentRecord
});
```

---

## removeTournamentRecord

Removes a tournamentRecord from shared state.

```js
removeTournamentRecord(tournamentId);
```

---

## setState

Loads tournament records into [Global State](/docs/engines/global-state); supports both an array of tournamentRecords and an object with tournamentId keys.

```js
const tournamentRecords = [tournamentRecord];
// or const tournamentRecords = { [tournamentId]: tournamentRecord }

setState(tournamentRecords, deepCopy, deepCopyConfig);
```

:::info
By default a deep copy of the `tournamentRecords` is made so that mutations do not affect the source objects. An optional
boolean parameter, _deepCopy_, can be set to false to override this default behavior. The boolean is written to the
process-wide setting (`setDeepCopy`), so it also governs later copies: with deep copy disabled the engine works on the
caller's own objects, and `getState` / `getTournament` return those same objects rather than copies.
:::

`deepCopyConfig` is an optional configuration for `makeDeepCopy`, installed process-wide through `setDeepCopy`. These are
the only attributes it accepts:

```js
const deepCopyConfig = {
  threshold, // optional - depth beyond which the original (uncopied) references are kept
  ignore, // optional - an array of attribute names to leave out of the engine's internal copies
  toJSON, // optional - an array of attribute names whose values are replaced by value.toJSON(), when present
  stringify, // optional - an array of attribute names whose values are converted to strings
};
```

`ignore` applies to the engine's internal copies only (rollback snapshots, previews, copied query results), not to the
copy `setState` makes or to the copies `getState` / `getTournament` return.

### Why copying is configurable

Records loaded from a document database can carry driver-internal objects — identifier and decimal classes, objects with
prototypes — that cannot be walked as plain JSON. `ignore`, `toJSON`, `stringify` and `threshold` keep those values out of
the walk. As an escape hatch, a state provider may supply its own `makeDeepCopy`, which the engine then uses for every
copy in place of the built-in one.

---

## setTournamentRecord

Adds a tournamentRecord to shared engine state, or overwrite/replace an existing `tournamentRecord` with the same `tournamentId`.

```js
setTournamentRecord(tournamentRecord);
```

---

## setTournamentId

Sets a tournamentRecord in shared state as the 'default' tournament for invoked functions.

```js
setTournamentId(tournamentId);
```

---

## setOutcomePipeline

Sets which outcome pipeline implementation decides, process-wide: `'v1'` (the default), `'v2'` or `'differential'`. No argument restores `'v1'`; any other value is refused with `INVALID_VALUES`. Engines expose the same setting as [`engine.outcomePipeline`](/docs/engines/engine-methods#outcomepipeline), which is the usual way to reach it; `getOutcomePipeline()` returns the current mode. Added in 7.5.0.

```js
import { globalState } from 'tods-competition-factory';

globalState.setOutcomePipeline('differential');
globalState.setOutcomePipeline(); // back to 'v1'
```

---

## setInvokeObserver

Registers a process-wide observer of every engine method execution. It is called with `phase: 'before'` and the caller's `params`, then with `phase: 'after'` and the `result`, along with `methodName` and `engineType`. Nothing in production sets it: it exists for the golden corpus recorder, which uses it to harvest the test suite into scenarios. An observer that calls engine queries from its `after` phase must guard its own re-entrancy, because those calls are observed too. No argument removes the observer; a non-function is refused with `INVALID_VALUES`. Added in 7.5.0.

```js
import { globalState } from 'tods-competition-factory';

globalState.setInvokeObserver(({ phase, methodName }) => console.log(phase, methodName));
globalState.setInvokeObserver(); // remove
```

---
