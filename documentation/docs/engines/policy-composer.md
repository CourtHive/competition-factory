---
title: Policy Composer
---

`policyComposer(policyType?)` is a fluent, immutable merger for `PolicyDefinition` shapes. It lives next to the `policyRegistry` and is the recommended way to express a federation override of a stock policy.

```ts
import { policyComposer } from 'tods-competition-factory';

const ctsSeeding = policyComposer('seeding')
  .extend(POLICY_SEEDING_USTA_DEFAULT)
  .set('policyName', 'CTS SEEDING')
  .set('seedingProfile.positioning', 'CLUSTER')
  .build();
```

`build()` returns `{ [policyType]: definition }` — the shape every engine method expects on its `policyDefinitions:` param. Hand it in directly.

## Why this exists

Every consumer that needs a federation-specific tweak of a stock policy faces the same choice today:

1. **Copy the entire policy** and edit the changed fields by hand. The two ~25-line `POLICY_SEEDING_DEFAULT` / `POLICY_SEEDING_ITF` blocks in `TMX/src/components/drawers/addDraw/submitDrawParams.ts` are the canonical example — they differ in three fields and share twenty-two.
2. **Hand-merge with spreads**, accepting that every level of nesting that needs to be modified requires its own spread:

   ```ts
   const cts = {
     [POLICY_TYPE_SEEDING]: {
       ...POLICY_SEEDING_USTA_DEFAULT[POLICY_TYPE_SEEDING],
       policyName: 'CTS SEEDING',
       seedingProfile: {
         ...POLICY_SEEDING_USTA_DEFAULT[POLICY_TYPE_SEEDING].seedingProfile,
         positioning: 'CLUSTER',
       },
     },
   };
   ```

   Adding a fourth modified field at a new depth means re-deriving the spread chain.

The composer collapses both forms to two lines:

```ts
policyComposer('seeding')
  .extend(POLICY_SEEDING_USTA_DEFAULT)
  .set('policyName', 'CTS SEEDING')
  .set('seedingProfile.positioning', 'CLUSTER')
  .build();
```

## API

`policyComposer(policyType?)` returns a `PolicyComposer` with the methods below. Every method that modifies state returns a NEW composer; the original is never mutated.

### `extend(other)`

Deep-merges another policy onto the current accumulator. Accepts either the wrapped form (`{[policyType]: ...}`) or the raw inner shape — the composer detects which.

```ts
policyComposer('seeding').extend(POLICY_SEEDING_USTA_DEFAULT);  // wrapped
policyComposer('seeding').extend({ policyName: 'X', ... });     // raw
```

Arrays REPLACE on merge (matches `deepMerge`'s default). The later `extend()` wins on conflicting paths.

### `set(path, value)`

Replace the value at a dot-path. Walks intermediate objects, creating them as plain objects (or arrays, when the next segment parses as a non-negative integer) when missing.

```ts
.set('policyName', 'CTS SEEDING')
.set('seedingProfile.positioning', 'CLUSTER')
.set('seedingProfile.drawTypes.ROUND_ROBIN.positioning', 'WATERFALL')
.set('seedsCountThresholds.0.seedsCount', 3)  // arrays via numeric segment
```

### `merge(path, fragment)`

Deep-merge a fragment at a dot-path. Equivalent to `set(path, deepMerge(get(path), fragment))`. Useful when you want to add several keys to a deeper sub-object without re-spreading.

```ts
.merge('seedingProfile.drawTypes', {
  SINGLE_ELIMINATION: { positioning: 'CLUSTER' },
  COMPASS: { positioning: 'CLUSTER' },
})
```

### `unset(path)`

Remove the key at a dot-path. Array elements are spliced (subsequent indices shift). No-op when the path doesn't exist.

```ts
.unset('seedingProfile.positioning')
.unset('seedsCountThresholds.1')  // remove the second threshold
```

### `get(path)`

Read the current value at a dot-path. Returns `undefined` for missing paths; never throws. Useful for assertions in tests or for "modify based on current" patterns (read, transform, set back).

```ts
const composer = policyComposer('seeding').extend(POLICY_SEEDING_USTA_DEFAULT);
composer.get('policyName'); // 'USTA SEEDING'
composer.get('seedingProfile.positioning'); // 'SEPARATE'
```

### `from({ name, version? })`

Start from a named entry in the `policyRegistry`. Throws if the entry doesn't exist (a typo in the federation name surfaces immediately rather than silently giving an empty composer).

```ts
policyRegistry.register({ policyType: 'seeding', name: 'USTA_DEFAULT', definition: usta });

policyComposer('seeding').from({ name: 'USTA_DEFAULT' }).set('policyName', 'CTS SEEDING').build();
```

Requires the composer to be scoped to a `policyType`.

### `build()`

Finalize. Returns `{ [policyType]: definition }` when the composer was constructed with a `policyType`; returns the raw `definition` otherwise.

```ts
const policyDefinitions = policyComposer('seeding').extend(stock).build();
// -> { seeding: { validSeedPositions: ..., ... } }

engine.getSeedsCount({ policyDefinitions, drawSize: 32 });
```

### `register({ name, version? })`

Build AND register the result into `policyRegistry` in a single call. Returns the wrapped value (same shape as `build()`), handy for inline use.

```ts
const ctsSeeding = policyComposer('seeding')
  .extend(POLICY_SEEDING_USTA_DEFAULT)
  .set('seedingProfile.positioning', 'CLUSTER')
  .register({ name: 'CTS_SEEDING', version: '2026' });

// Later, from anywhere:
const looked = policyRegistry.lookup({ policyType: 'seeding', name: 'CTS_SEEDING', version: '2026' });
```

## Worked examples

### Federation override of a stock policy

```ts
const stock = POLICY_SEEDING_USTA_DEFAULT;

// CTS — change positioning + name
const cts = policyComposer('seeding')
  .extend(stock)
  .set('policyName', 'CTS SEEDING')
  .set('seedingProfile.positioning', 'CLUSTER')
  .build();

// CZE-junior — CTS + override one threshold
const czeJunior = policyComposer('seeding')
  .extend(cts)
  .set('policyName', 'CZE JUNIOR')
  .set('seedsCountThresholds.3.seedsCount', 12)
  .build();
```

### Compose a fragment then merge into a larger structure

The untyped composer (no `policyType`) is useful when assembling a fragment that will be merged into a deeper structure later.

```ts
const drawTypesFragment = policyComposer()
  .set('ROUND_ROBIN.positioning', 'WATERFALL')
  .set('ROUND_ROBIN_WITH_PLAYOFF.positioning', 'WATERFALL')
  .build();

const full = policyComposer('seeding')
  .extend(POLICY_SEEDING_USTA_DEFAULT)
  .merge('seedingProfile.drawTypes', drawTypesFragment)
  .build();
```

## Semantics

- **Immutability.** Every modifier returns a new composer. Safe to branch from a common base.
- **No mutation of inputs.** `extend()` does not modify the policy passed in; `set()` / `merge()` / `unset()` do not modify the composer's previous internal state.
- **Arrays replace by default.** Matches `deepMerge`. For path-targeted "merge by key" array behavior, do the read-modify-set in the consumer (`composer.get(path)` to read, then `composer.set(path, merged)` to write).
- **Dot-path with numeric segments for arrays.** `seedsCountThresholds.0.drawSize` indexes into an array.
- **`build()` re-wraps with `policyType`.** A composer scoped to `seeding` returns `{ seeding: {...} }`; a composer with no `policyType` returns the raw inner.
