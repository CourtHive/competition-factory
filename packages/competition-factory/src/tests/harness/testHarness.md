---
title: Test Harness
---

This test harness is used in debugging factory functions or understanding the execution path for the invocation of specific functions;
it is best used with logs of method parameters produced by using `engine.devContext({ params: true })`.

The logged output can then be pasted into the `methods` array provided in `ubik.test.ts`:

- Paste snapshot of tournamentRecord into co-located `tournament.codes.json` file
- Capture logged { method, params } and paste into methods array

```js
const methods = [
  // logged output
];
tournamentEngine.executionQueue(methods);
```
