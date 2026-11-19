---
title: Engine Logging
---

Competition Factory **engines** provide facilities for logging function performance, parameters, and results.
Logging can be configured and enabled in **globalState** directly or by calling `engine.devContext(params)`.

## Custom Logging

By default factory engines will log to the console. It is possible to define a custom logging function:

```js
import { globalState } from 'tods-competition-factory';
const { setGlobalLog } = globalState;

function customLoggingFunction({ log }) {
  console.log('log:', log);
}

setGlobalLog(customLoggingFunction);
```

## Logging Configuration

```js
import { globalState } from 'tods-competition-factory';
const { setDevContext } = globalState;
setDevContext({ perf: true, params: true, result: true, errors: true });

// - or -
askEngine.devContext({ perf: true, params: true, result: true, errors: true });
```

## Logged Details

The values passed into `devContext` for the following attributes can be either boolean or an array of function names.

- **errors**: log method errors (e.g. invalid parameters)
- **result**: log results returned by function(s)
- **params**: log values passed into function(s)

```js
askEngine.devContext({ errors: true }); // log all errors reported by all methods
askEngine.devContext({ params: true }); // log param values for all functions
askEngine.devContext({ result: true }); // log results for all functions

askEngine.devContext({ params: ['getParticipants'], result: true }); // log parameters and results only for the `getParticipants` function
```

For **perf** the value can be either `true` or a milliseconds threshold.

- **perf**: log function execution time

```js
askEngine.devContext({ perf: true }); // log the execution time of every call
askEngine.devContext({ perf: 200 }); // log execution times of 200ms or more
```
