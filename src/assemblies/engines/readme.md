# Engines

Engines manage state (any number of tournamentRecords)

- **_async_** performs mutations asynchronously (imported methods return promises) and generates notifications for subscribers
- **_sync_** performs mutations synchronously and generates notifications for subscribers
- **_ask_** is intended for queries and does not generate notifications for subscribers; it does not enforce this, and runs whatever methods are imported into it or passed to `execute`
- **_mock_** generates mock tournamentRecords and components of tournamentRecords

## Methods

Methods can be invoked in various ways using an engine:

- `engine.execute({ method: 'methodName', params: {}})` // methodName names a method registered via engine.importMethods({})
- `engine.execute({ getParticipants, params: {}})` // getParticipants is a method
- `engine.execute({ getParticipants, participantFilters })` // all params which are not functions are passed to the method

:::info
Params can contain functions — for example a per-call `random`. Pass them inside `params`: in the flat form every
function-valued argument counts as the method, and more than one is refused with `INVALID_VALUES`.
:::

## Explanation

Each engine is an instance of FactoryEngine. Engine objects provide methods for managing state, executing commands, and interacting with a tournament or set of linked tournaments.

Engine objects have the following default methods:

- setState: This method sets the state of the system. It accepts records, deepCopyOption, and deepCopyAttributes as arguments. It sets the deep copy options, sets the state, and returns the result of processResult(result).
- setTournamentRecord: adds a single tournamentRecord to state
- getState: This method retrieves the state of the system. It accepts an optional params object and passes its properties (convertExtensions and removeExtensions) to the getState function imported from stateMethods.
- getTournament: returns a specific tournament from state
- reset: resets the engine, removing all tournament records
- version(): a method returning the factory version (`factoryVersion()`).
- execute: calls the engine's invoke function (engineInvoke, askInvoke or asyncEngineInvoke) with the engine object and the arguments passed to `execute`.
- executionQueue (sync and async only): executes an array of method/params objects, deferring all notifications until all methods have been executed
- devContext: controls execution behaviors including logging
- getDevContext: This method retrieves the development context based on the contextCriteria argument.

Except for `async` the engine object is immediately invoked and exported, making it a singleton. This means that for all engines except `async` there's only one instance of engine throughout the application, ensuring data consistency across different parts of the application that use it. Separate engines do not mean separate state: `sync` and `ask` read and write the same tournament state (the installed global state provider) and share one method registry.

The `async` engine must be instantiated after a valid `asyncGlobalState` has been provided; without one, `asyncEngine()` returns `{ error }`. An example `asyncGlobalState.ts` can be found in `src/examples/asyncEngine`.

```js
globalState.setStateProvider(asyncGlobalState);
const engineAsync = asyncEngine();
```
