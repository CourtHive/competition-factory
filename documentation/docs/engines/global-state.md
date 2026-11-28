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

**Omitting `deepCopy` leaves the process-wide setting as it is**; it does not restore the default. After
`setDeepCopy(false)` (or an earlier `setState(records, false)`), `setState(records)` borrows the records as well, and
`getTournament()` returns that same object.
:::

:::caution A record is plain data
A record handed to the engine, copied (the default) or borrowed (`deepCopy: false`), must be **plain data**: objects,
arrays, strings, numbers, booleans and `null`, as `JSON.parse` would produce. A hydrated document from a mapping
library (a Mongoose document, or anything with getters, setters, casts or change tracking) is not supported: convert it
first, for example with `doc.toObject()`, and save the plain record the engine leaves. Borrowing a plain record is
supported, and is what a server that loads, mutates and saves records without copying does.
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

`ignore` applies to the engine's internal copies (copied query results), not to the copy `setState` makes, to the copies
`getState` / `getTournament` return, or to rollback and preview snapshots (see below).

`toJSON` and `stringify` reach the same internal copies and no further. With copying disabled and a record whose ids are
driver objects, the in-context participants on matchUp sides and the participants in `getEventData` carry the converted
(string) values, while the loaded record itself, `getTournament()` and `getParticipants()` keep the driver objects.

Each call merges per attribute: an attribute you leave out keeps the value an earlier call gave it.

### Why copying is configurable

Records loaded from a document database can carry driver-internal objects — identifier and decimal classes, objects with
prototypes — that cannot be walked as plain JSON. `ignore`, `toJSON`, `stringify` and `threshold` keep those values out of
the walk. As an escape hatch, a state provider may supply its own `makeDeepCopy`, which the engine then uses for every
copy in place of the built-in one.

### Rollback snapshots

A `rollbackOnError` call or queue takes a **snapshot** of the loaded
records, which is not an outward copy and does not use the configuration above:

- plain objects and arrays are always copied, including those under `ignore`, `toJSON` or `stringify` keys: a plain
  object is copyable, and the operation may change it;
- every other value (a class instance, such as a database driver's identifier or decimal type) is kept **by reference**.
  The factory never writes into a value whose shape it does not know; a `Date` is copied;
- `null` stays `null`, and no `threshold` applies.

With deep copy disabled the engine works on your own objects, so a snapshot is written back **into** them: after a
rollback your objects, including nested objects the operation replaced or deleted, are the same objects with
their original values, and the engine still holds them.

The snapshot is checked **before** the first method runs. When it could not be restored, the call is refused with
`ROLLBACK_UNAVAILABLE` and nothing is written: for example, a record whose root is a class instance (a mapping-library
document) that the factory can neither copy nor restore.

A state provider can take over both halves:

```js
const provider = {
  ...stateProviderMethods,
  // called with { purpose: 'snapshot' } for a snapshot; any other call is an outward copy
  makeDeepCopy: (source, convertExtensions, internalUse, removeExtensions, options) => {
    /* ... */
  },
  // writes a snapshot back into records the engine does not own (deep copy disabled)
  restoreSnapshot: (liveRecords, snapshot) => {
    /* ... */
  },
};
```

A snapshot must be a set of plain records keyed by `tournamentId`, distinct from the live records. With deep copy disabled,
a provider snapshot also needs `restoreSnapshot`; without it the call is refused. Values alone may not be the whole of a
restore: a mapping library that tracks changes needs its tracking put back as well, which only `restoreSnapshot` can do.
A `makeDeepCopy` hook that ignores `purpose` keeps working, but whether its snapshot is faithful is then up to the hook.

Previews use a separate provider scope and private records. See [dryRun and explain](./dry-run-explain.md#custom-state-providers).

Two more optional provider methods let a restore put back what is not in the records. `getNoticeBuffer()` /
`setNoticeBuffer(notices)` read and replace the buffered notices; without them a restore deletes every buffered notice.
`setMutationStatus(status)` sets the mutation flag back to a value `cycleMutationStatus` returned; the outcome pipeline's
`differential` mode uses it so that a divergence does not stamp an unchanged record as modified, and without it the flag
is cleared instead.

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

**Removed in 8.0.0**, with `getOutcomePipeline`: there is one outcome pipeline. Both names stay exported, and a call
returns an error result, `METHOD_REMOVED`, naming the function and linking the
[migration guide](/docs/migration-8.0.0#the-outcome-pipeline-selector-is-removed). Neither selects nor reads anything,
and neither throws. Remove the calls.

```js
import { globalState } from 'tods-competition-factory';

globalState.setOutcomePipeline('v2').error; // METHOD_REMOVED
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
