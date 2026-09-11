---
title: makeDeepCopy
---

Makes a deep copy of a JSON object; used internally by default to ensure that objects returns by factory query methods are immutable.

```js
import { tools } from 'tods-competition-factory';

tools.makeDeepCopy(element, convertExtensions, internalUse);
```

## convertExtensions

When **convertExtensions** is **true**, [CODES](/docs/data-standards#codes) extensions objects are converted as follows:

```js
// original
element.extensions: [ { name: 'extensionName', value: { a: 1 } }]

// after conversion
element._extensionName: { a: 1 }
```

This is useful for inContext representations of elements such as participants where "accessor strings" can be used to directly access values rather than searching through arrays of extensions; a good example of this is in Avoidance Policies.

## Disabling deep copies

In server environments where it is desireable for objects originating in back end storage (such as Mongo) to be modified directly, it is possible to disable `makeDeepCopy` several ways:

```js
import { globalState } from 'tods-competition-factory';
const { setDeepCopy } = globalState;

engine.setState(tournamentRecord, false, deepCopyOptions);

setDeepCopy(false, deepCopyOptions);
```

## internalUse and deepCopyOptions

`internalUse` is a boolean parameter which is sometimes used **_within_** factory methods to specify that `makeDeepCopy` must be used regardless; it pertains to methods which return **inContext** data which should never be persisted. There are some cases where this can cause problems, so a method is provided to configure how `makeDeepCopy` behaves in scenarios where it is disabled but must be used internally.

```js
const deepCopyOptions = {
  threshold, // optional integer to limit the depth of the deep copy
  stringify: [], // any object keys in this array will be stringified (using a .toString() function if present on the object)
  toJSON: [], // any object keys in this array will be converted to JSON if there is a .toJSON() function on the object
  ignore: [], // any object keys in this array will be ignored
};

setDeepCopy(false, deepCopyOptions);
```
