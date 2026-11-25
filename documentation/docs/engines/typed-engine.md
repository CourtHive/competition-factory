---
title: Typed Engine Surface
---

The `FactoryEngineTyped` type lets consumers opt into a closed, autocomplete-rich view of the engine. It catches typoed method names at compile time and — for the methods listed in `MethodSignatures` — gives real param and return types lifted from the source declarations.

<!-- doc-methods:ignore — a deliberate typo the type system rejects -->

```ts
import { tournamentEngine } from 'tods-competition-factory';
import type { FactoryEngineTyped } from 'tods-competition-factory';

const engine = tournamentEngine as FactoryEngineTyped;

// typed param + return
const { events = [] } = engine.getEvents({ tournamentRecord });
// events: Event[]

// IDE flags typos at compile time
// @ts-expect-error — `getEent` is not in FactoryEngineMethod
engine.getEent({ tournamentRecord });
```

## How it's composed

```ts
type FactoryEngineTyped =
  // 1. methods with real param + return types
  MethodSignatures &
  // 2. fallback for every remaining FactoryEngineMethod
  Record<Exclude<FactoryEngineMethod, keyof MethodSignatures>, (...args: any[]) => any> &
  // 3. the ergonomic facades
  { q: QueryFacade; on: ...; once: ...; off: ...; waitFor: ...; build: BuildFacade };
```

- **`MethodSignatures`** carries the highest-traffic methods. Each entry is a `typeof <source-fn>`, so the type reflects exactly what the implementation accepts and returns — no drift.
- The fallback `Record` keeps every other registered method nameable on the typed engine. As more methods migrate into `MethodSignatures`, the fallback set shrinks. Adding a method is purely additive — it never breaks existing callers.
- The facades — `q`, `on/once/off/waitFor`, `build` — live alongside the methods so consumers reach them with the same `engine.` prefix.

## What's typed today

In the 7.48.0 inventory, 727 of 812 engine method names have entries in `MethodSignatures`. Direct mounts and facades can have their own explicit types. The remaining methods use the open call signature, including the availability methods that shipped with that signature.

The build uses the TypeScript compiler to follow governor exports and aliases and read the direct mounts in `engineStart.ts`. One generator writes the signature map, the direct mount names used by the async engine, and the method kinds used by query-purity tests.

`engine.q.*` also returns real TODS types (no more `any[]` / `any`):

```ts
const events: Event[] = engine.q.events();
const event: Event | undefined = engine.q.event({ eventId });
const matchUps: HydratedMatchUp[] = engine.q.matchUps();
const tournament: Tournament | undefined = engine.q.tournament();
```

## Extending the typed surface

`src/assemblies/engines/types/methodSignatures.ts` is generated. **Do not hand-edit it.** Coverage grows automatically as new governor exports land — no per-method maintenance burden.

To add a method:

1. Re-export it from the right governor barrel (the convention already in use across `src/assemblies/governors/`):

   ```ts
   // src/assemblies/governors/eventGovernor/query.ts
   export { getEventTimeItem } from '@Query/base/timeItems';
   ```

2. Regenerate signatures (this also runs automatically in `prebuild`):

   ```sh
   pnpm gen:engine-methods
   pnpm gen:method-signatures
   ```

That's it. `FactoryEngineTyped` picks the new method up via the regenerated `MethodSignatures`, the `Exclude<FactoryEngineMethod, keyof MethodSignatures>` step drops it from the open-shape fallback, and consumers get real types at the call site.

CI runs `pnpm check:method-signatures` to catch drift — if a generated signature would change but wasn't committed, the build fails.

### What's NOT auto-generated

A few special engine surfaces are declared explicitly on `FactoryEngineTyped` rather than via the generator:

- The forge facades and subscription helpers have explicit call shapes on the engine.
- Engine internals such as `executionQueue`, `execute` and `importMethods` use their engine-specific signatures.
- Build-time exceptions in `scripts/engineMethodExceptions.mjs` classify methods outside the standard governor namespaces and preserve the released availability fallback.

### Edge cases the generator handles automatically

- **Renamed governor exports.** `export { publicFindMatchUp as findMatchUp } from '@Acquire/findMatchUp'` produces `findMatchUp: typeof publicFindMatchUp` in the generated file, with the right `import { publicFindMatchUp } from '@Acquire/findMatchUp'`.
- **Methods with multiple parameter shapes.** `typeof` carries unions and overloads through unchanged.
- **Private inline param types.** `typeof` lifts the structural signature into the dist `.d.ts` — no need to export the param type from the source file.
- **Relative `from` paths in governor barrels.** Re-resolved against the governor's location and emitted relative to `methodSignatures.ts`.

## Why this exists

Before: `engine.getEvents` had the signature `(...args: any[]) => any`. Every consumer cast the return, every typo compiled cleanly. Today, the same call returns the real `{ events?: Event[]; … }` shape, autocompletes in the IDE, and a misspelled method name is a compile error.

See `src/assemblies/engines/types/methodSignatures.ts` (generated), `scripts/generateMethodSignatures.mjs` (generator), and `src/assemblies/engines/types/engineTypes.ts` (composition) for the implementation.
