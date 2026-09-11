---
title: What's New in 5.0.0
---

Version 5.0.0 of the Competition Factory ships **two breaking changes** and a developer-experience pack we've been calling **JOY**. This page is the trumpet: every new capability gets a one-paragraph pitch and a link to its own page.

For upgrade mechanics (typed-engine opt-out, mode-agnostic readers, the promoted-attribute tables) see the [4.x to 5.0.0 migration guide](./migration-5.0.0).

For the full per-commit changelog see [CHANGELOG.md](https://github.com/CourtHive/competition-factory/blob/master/CHANGELOG.md).

## The headline changes

Two changes break the surface and need consumer attention:

### 1. `schemaWriteMode` default flips to `'native'`

The **CODES (Competition Open Data Exchange Standards)** initiative completes in 5.0.0. Over seven phases the factory has promoted a long list of canonical internal extensions and schedule-related timeItems out of the `extensions[]` envelope and into first-class typed attributes on the core types. In 5.0.0 the engine writes records in that **native** shape by default.

Consumers who never read the legacy envelope directly see nothing change at runtime — hydration shims and dedicated query methods continue to return values from their canonical homes. Consumers who _do_ read raw `element.extensions[]` for promoted names will find `undefined` in `native` mode. The opt-out is `engine.schemaWriteMode('legacy')` or `'dual'`; the durable fix is the mode-agnostic reader pattern documented in the [migration guide](./migration-5.0.0).

→ Helpers: [`migrateTournamentRecord`](./engines/migrate-tournament-record), [`getTally`](./engines/get-tally).

### 2. `tournamentEngine` and `competitionEngine` are typed by default

Both singleton exports are now `FactoryEngineTyped` — closed-shape, autocomplete-rich, ~89% of the method surface carrying real param + return types lifted from the source declarations via `MethodSignatures`. Typoed method names are caught at compile time. The developer-JOY facades below (`engine.q.*`, `engine.dryRun`, `engine.explain`, `engine.inspect`, `engine.on/once/off/waitFor`, `engine.build.*`) all surface automatically with precise generics.

Consumers that can't take the typed lift yet can import `tournamentEngineUntyped` / `competitionEngineUntyped` for the legacy open shape — same runtime singleton, different static type.

→ Full details: [Typed Engine Surface](./engines/typed-engine).

## The JOY pack — developer-experience initiatives

Nine numbered initiatives, each tracked under [issue #1–#12](https://github.com/CourtHive/competition-factory/issues?q=label%3Adeveloper-joy). Built additively: every facade is opt-in, none break existing call sites, and they compose — the typed engine surfaces them all with precise generics.

### #1. Per-method typed signatures

The `MethodSignatures` interface carries `typeof <source-fn>` entries for the highest-traffic engine methods. Each typed method's params and return reflect exactly what the implementation accepts and returns — no drift between docs, types, and runtime. ~89% of the 600-method surface is covered today; the remaining ~10% fall through to a `(...args: any[]) => any` fallback so the surface stays complete and additions are purely additive.

→ [Typed Engine Surface](./engines/typed-engine).

### #2. `engine.q` — silent unwrap facade

Every read method returns a result envelope (`{ events, error }`). For render paths that just want the primary value, `engine.q.*` does the unwrap for you and returns `[]` / `undefined` on error. Pure ergonomic layer, opt-in per call site:

```ts
const events = engine.q.events(); // Event[]
const event = engine.q.event({ eventId }); // Event | undefined
```

→ [Query Facade (engine.q)](./engines/query-facade).

### #2 (throwing companion). `unwrap` / `unwrapOr`

The loud counterpart. `unwrap(result)` lifts the legacy POJO envelope into a thrown `FactoryError` subclass that catch sites can pattern-match by `instanceof`. `unwrapOr(result, fallback)` is the same shape but returns a caller-chosen fallback on error instead of throwing:

```ts
const { events } = unwrap(engine.getEvents()); // throws on error
const { events = [] } = unwrapOr(engine.getEvents(), { events: [] });
```

→ [Unwrap](./engines/unwrap).

### #3 + #12. `engine.dryRun` and `engine.explain`

Preview what a mutation _would_ do without committing. `dryRun(directives)` returns the per-method results plus an RFC 6902 patch of "what would change" plus the topics that would have fired. `explain(method, params)` projects that down to `{ wouldSucceed, reason, willEmitTopics, touchesPaths }` for UI tooltips and per-button-state gates:

```ts
const { wouldSucceed, touchesPaths } = engine.explain('deleteDrawDefinition', { drawId });
const tooltip = wouldSucceed ? `Will change ${touchesPaths.length} fields` : `Cannot: …`;
```

→ [dryRun and explain](./engines/dry-run-explain).

### Supporting: RFC 6902 JSON Patch

Hand-rolled patch generator that produces the `dryRun` diff. Zero-runtime-deps. Three ops (`add` / `remove` / `replace`), RFC 6901 paths, array-by-index. Also reachable as `engine.explain(...).touchesPaths` for permission gating.

→ [RFC 6902 JSON Patch](./engines/json-patch).

### #4. `engine.inspect()` — state snapshot

One typed call returns "what's loaded right now": factory version, write-mode flags, tournament IDs in state, lightweight counts of the major collections, active subscription topics, and the current `devContext`. Built for `console.log(engine.inspect())`, paste-into-bug-report scenarios, and devtools panels.

→ [State Inspection (engine.inspect)](./engines/state-inspection).

### #5. Typed event bus — `engine.on/once/off/waitFor`

First-class subscription surface on the engine. Topics are typed; payloads infer from the topic name. `once` and `off` are the obvious complements; `waitFor` returns a Promise that resolves with the next matching emission, handy for sequential test scaffolding and "wait for the addMatchUps that resulted from my generateDrawDefinition" flows:

```ts
const off = engine.on('addMatchUps', (e) => updateUi(e.matchUps));
await engine.waitFor('modifyMatchUp', (e) => e.matchUpId === id);
```

→ [Subscriptions](./engines/subscriptions).

### #6. Fluent builders — `engine.build.event` / `engine.build.participant`

Chainable composition that collapses the addEvent → generateDrawDefinition → addDrawDefinition → addEventEntries sequence into a single sentence. IDs are pre-assigned so downstream code can reference them before the chain resolves:

```ts
const { eventId, drawIds } = engine.build
  .event({ eventName: 'U16 Singles' })
  .singles()
  .draw(32, { seedsCount: 8 })
  .entries(participantIds)
  .create();
```

→ [Fluent Builders](./engines/fluent-builders).

### #7. `FactoryError` hierarchy + suggestions registry

The legacy `{ message, code, info? }` POJO envelope gets a real Error subclass with `cause`, `methodName`, `path`, structured `context`, and lazily-resolved actionable `suggestions`. Thirteen subclasses cover the highest-fan-in codes — match by `instanceof` rather than re-parsing the code string. `toJSON()` still emits the legacy shape so existing consumers keep working:

```ts
try {
  const { event } = unwrap(engine.getEvent({ eventId: 'missing' }));
} catch (e) {
  if (e instanceof EventNotFoundError) {
    showToast(e.message, { suggestions: e.suggestions });
  }
}
```

→ [Factory Errors](./engines/factory-errors).

### Honorable mention. `policyComposer` — fluent merger over policy shapes

Kills the nested-spread hell that shows up wherever a consumer needs to express a federation override of a stock policy. Immutable, scoped to one `policyType`, dot-path access, integrates with `policyRegistry`:

```ts
policyComposer(POLICY_TYPE_SEEDING)
  .extend(POLICY_SEEDING_USTA_DEFAULT)
  .set('policyName', 'CTS SEEDING')
  .set('seedingProfile.positioning', CLUSTER)
  .register({ name: 'CTS_DEFAULT' });
```

→ [Policy Composer](./engines/policy-composer).

## Other 5.0.0 additions

- **`matchUp.schedule.calledAt` + `setMatchUpCalledAt` mutation** — first-class "the call was made" timestamp, surfaced alongside the schedule attributes.
- **`getTally` query** — mode-agnostic read of the round-robin tally. See [getTally](./engines/get-tally).
- **`migrateTournamentRecord` utility** — one-shot CODES upgrade for legacy records. See [migrateTournamentRecord](./engines/migrate-tournament-record).
- **`drawDeletions` opt-in + server-authoritative gating** — CODES Phase 6.
- **`WB<n>` win-by modifier on matchUpFormat** — encodes "win by N" for no-tiebreak sets.
- **`TemporalEngine` → `AvailabilityEngine` rename** — clearer name; frees the `Temporal` namespace for the upcoming TC39 Temporal proposal in 5.1.0.
- **Full pre-publish verification suite** — twelve-step `pnpm verify` chain wired into `prepublishOnly` so types, lint, coverage, build integrity, consumer impact, security, surface diff, and pack-install are all gated before release.

## Upgrading checklist

1. **Read [the migration guide](./migration-5.0.0)** for the typed-engine opt-out and the promoted-attribute tables.
2. **Run [`migrateTournamentRecord`](./engines/migrate-tournament-record)** on stored records once at the upgrade seam.
3. **Replace raw `extensions[]` reads** with the dedicated query methods or `firstClassOrExtension` — listed per entity in the migration guide.
4. **Opt into the JOY facades** at your own pace — every page links to its own getting-started example.

## Where to go from here

| If you want…                                    | Read                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| The full upgrade walkthrough                    | [4.x to 5.0.0 migration](./migration-5.0.0)                            |
| Why my method-name typo isn't compiling anymore | [Typed Engine Surface](./engines/typed-engine)                         |
| Loud-error patterns for dev paths               | [Unwrap](./engines/unwrap), [Factory Errors](./engines/factory-errors) |
| Render-path ergonomic reads                     | [Query Facade](./engines/query-facade)                                 |
| UI tooltips and per-button gates                | [dryRun and explain](./engines/dry-run-explain)                        |
| Subscriber wiring for live UIs                  | [Subscriptions](./engines/subscriptions)                               |
| Multi-step tournament setup as one call         | [Fluent Builders](./engines/fluent-builders)                           |
| Federation policy overrides                     | [Policy Composer](./engines/policy-composer)                           |
| Debugging "what's loaded"                       | [State Inspection](./engines/state-inspection)                         |
| Lifting a legacy record to native shape         | [migrateTournamentRecord](./engines/migrate-tournament-record)         |
