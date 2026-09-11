---
title: Migration 3.x to 4.x
---

Version 4.0 of the Competition Factory ships a single, focused breaking change: **federation-specific ranking-point policy fixtures no longer ship inside the published bundle**. Instead, 4.x introduces a `policyRegistry` indirection point so that policy catalogs are owned and pushed in by consumers (typically `competition-factory-server`, but any host process can hydrate it).

The 3.x line also accumulated a substantial body of additive features between 3.0 and 4.0 — format-wizard queries, derived rankings, `FactoryEngineTyped`, preset participants in `mocksEngine`, opt-in daily-limit enforcement in the pro scheduler, and more. None of those are breaking; this document lists them after the 4.0 breaking change so a consumer doing a 3.0 → 4.x lift has the surface area in one place.

## Breaking changes

### Federation ranking-point fixtures removed from the bundle

The following eight policy fixtures are **no longer exported** from `tods-competition-factory`:

- `POLICY_RANKING_POINTS_USTA_JUNIOR` (legacy re-export)
- `POLICY_RANKING_POINTS_USTA_JUNIOR_2025`
- `POLICY_RANKING_POINTS_USTA_JUNIOR_2026`
- `POLICY_RANKING_POINTS_TENNIS_EUROPE`
- `POLICY_RANKING_POINTS_TENNIS_CANADA`
- `POLICY_RANKING_POINTS_TENNIS_AUSTRALIA`
- `POLICY_RANKING_POINTS_LTA`
- `POLICY_RANKING_POINTS_CTS`

Any consumer that imported one of these names from the factory package will fail to resolve on 4.0.0.

**Templates that remain in the bundle:** `POLICY_RANKING_POINTS_BASIC`, `POLICY_RANKING_POINTS_ITF_JUNIOR`, `POLICY_RANKING_POINTS_ITF_WTT`, `POLICY_RANKING_POINTS_ATP`, `POLICY_RANKING_POINTS_WTA`.

These five generic templates stay because they are reference shapes used by the engine's own tests and by consumers building their own policies. The federation-specific bodies live with their owners now — typically CFS-served storage so they can be updated on policy change without a factory release.

### New `policyRegistry` indirection point

4.0 makes the indirection introduced in 3.7 (`policyRegistry`) the canonical place to resolve federation policies by name at query time. The registry was added as a public export in 3.7; in 4.0 it becomes the _recommended_ path for any policy that used to be bundled.

```ts
import { policyRegistry } from 'tods-competition-factory';

// Boot-time registration (typically by the host process / CFS hydrator):
policyRegistry.register({
  policyType: POLICY_TYPE_RANKING_POINTS,
  name: 'USTA_JUNIOR_2026',
  version: '2026', // optional — versions stack; latest wins on unversioned lookup
  definition: {/* … */},
});

// Query-time lookup happens inside the engine — no consumer call needed:
engine.getTournamentPoints({ policyName: 'USTA_JUNIOR_2026' });
engine.getEventRankingPoints({ eventId, policyName: 'USTA_JUNIOR_2026' });
```

`policyRegistry` API:

| Method                                                 | Purpose                                                                                             |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `register({ policyType, name, version?, definition })` | Register or replace a policy. Same `(policyType, name, version)` triple overwrites; versions stack. |
| `lookup({ policyType, name, version? })`               | Lookup by name. Without `version`, returns the most recently registered entry.                      |
| `list({ policyType? })`                                | List all entries, optionally filtered by type.                                                      |
| `clear({ policyType?, name? })`                        | Clear all, by type, by name, or by the `(type, name)` pair.                                         |

**Resolution precedence is preserved:** explicit `policyDefinitions` still wins, then tournament-attached policies (`APPLIED_POLICIES` extension), then `policyRegistry`. The registry is consulted only when nothing else is in scope.

**Scope is query-time only.** Mutation-time policies continue to flow through `APPLIED_POLICIES` extensions on the record. The registry must not enter the mutation path — client/server replay would diverge.

### Migration path for federation-policy consumers

1. **If you control the host process** (CFS, a custom Node service, a standalone tool): on startup, hydrate the registry from your storage. The `PolicyRegistryHydrator` pattern in `competition-factory-server` is the reference implementation.
2. **In factory consumers** (TMX, courthive-components, etc.): the registry is shared per-process. Once CFS has registered policies on the server engine, server-side query results are correct without any consumer change. For client-side queries, the host (TMX) must register the same catalog in its own process — typically pulled from CFS over the wire.
3. **Switch query calls** from `policyDefinitions: POLICY_RANKING_POINTS_USTA_JUNIOR_2026` to `policyName: 'USTA_JUNIOR_2026'`.
4. **Or attach to the record** — store the policy on the tournament record via the `APPLIED_POLICIES` extension. Both `getTournamentPoints` and `getEventRankingPoints` pick it up automatically without any registry involvement.

The eight TS source files for the removed fixtures still exist in `src/tests/fixtures/policies/` so the factory's own regression tests can reach them, but they are **not** part of the published API. Do not import from there.

### `setTournamentCategories` rejects orphaning replacements

`setTournamentCategories` previously replaced the array blindly. In 4.0 it walks `tournamentRecord.events[].category` (both `ageCategoryCode` and `categoryName`), and if the new list would drop a category that an event currently references, it rejects with the new error:

```ts
TOURNAMENT_CATEGORY_IN_USE;
// code: 'ERR_TOURNAMENT_CATEGORY_IN_USE'
```

The error response carries `referenced: string[]` so a UI can list the conflicting codes/names in a confirmation dialog before retrying with either the references removed or the categories preserved.

This check only kicks in when categories are deleted; pure add/edit operations are unaffected. The existing single in-tree caller (TMX `editEvent`) never deletes categories, so today's flows are unaffected.

## Additive changes accumulated across the 3.x line

The features below landed in 3.x patch and minor releases and are available on any 3.x ≥ the version listed, including 4.x. None are breaking. If you skipped over them on the way to 4.0, this is a one-stop reference.

### Ranking pipeline expansion (3.7)

- `applyDerivedRankings` — apply filtered sub-rankings (e.g. ranking points limited to a subset of events / categories)
- `scaleEngine.getTournamentPointAwards()` — top-level pipeline entry that emits all point awards for a tournament
- New types: `pointPoolModel`, `categoryAggregation`, `derivedRankings`
- `generateRankingList` interprets `categoryAggregation` directly
- `computeRatingDistributionStats` exposed as a top-level export
- Per-federation ranking policies encoded as fixtures (Phase 0 of `POLICY_DELIVERY` — these are the same fixtures that are externalized via `policyRegistry` in 4.0; the registry is the supported access path going forward)

### Ranking awards — authority and stage metadata (4.1+)

These three landed in 4.1.0 — listed here so a single 3.x → 4.x lift sees the full surface:

- `pointsAuthority` field on ranking policies, propagated to emitted awards
- Per-`AwardProfile` `pointsAuthority` override
- `stage` field on emitted awards
- A hybrid example fixture demonstrating multi-authority composition

### Format Wizard (3.4)

A new query category targeting level-based format selection. See `Format Wizard` in the engine docs.

- `suggestFormatPlans` — level-based plan suggestions
- `predictCompetitiveBands` — predicted competitiveness banding
- MatchUps enriched with `competitiveProfile` directly, without `inContext` hydration
- Format Wizard now handles integer match counts, `FEED_IN`, voluntary consolation, and flighting caps

### Scheduling improvements (3.2 → 3.6)

- `scheduleProfileRounds` + `scheduleProfileGrid` accept a `courtIds` filter (3.2)
- Pro scheduler: opt-in daily-limit enforcement (3.5)
- Pro scheduler walks earlier scheduled times first; completed matchUps excluded from grid placement; historical/orphan matchUps excluded from the daily-limit budget (3.4.4 / 3.5)
- `jinnScheduler` emits explain-why payloads for over-limit and recovery-deferred refusals (3.6)
- Default scheduling policy is `POLICY_SCHEDULING_DEFAULT`; timed formats parse correctly (3.4.3)
- `jinnScheduler` persists `scheduledDate` separately (3.4)
- `COURT.ORDER` timeItem is cleared on empty-string assignment via `removePriorValues` (3.2.1)

### Typed engine (3.8) — preview of 5.0.0 default

`FactoryEngineTyped` was exposed as an optional cast for catching unregistered method calls at compile time:

:::note Obsolete since 5.0.0
The cast is no longer needed or available — `tournamentEngine` and `competitionEngine` carry this type
by default, and `FactoryEngineTyped` is not exported. The snippet below records the 3.8/4.x form for
readers migrating from that era.
:::

<!-- doc-imports:ignore — records a 3.8-era API that no longer exists -->

```ts
import { tournamentEngine, FactoryEngineTyped } from 'tods-competition-factory';

const engine = tournamentEngine as FactoryEngineTyped;
engine.getEevents(); // <-- compile error in 3.8+
```

In **5.0.0** this becomes the default static type of `tournamentEngine` and `competitionEngine`. If you adopt the typed cast in 3.x you'll have done most of the typing work ahead of the 5.0 lift. See [Migration 4.x to 5.0.0](./migration-5.0.0) for the full story.

### Print policy (3.3)

- `POLICY_TYPE_PRINT` constant
- Default fixture `POLICY_PRINT_DEFAULT`
- Print Policy reference page in the docs

### Participants (3.9 + 4.2)

- `PAYMENT_STATUS` participant timeItem (3.9)
- `mocksEngine.generateTournamentRecord` accepts preset participants (3.9) — the canonical way to seed CFS-served participant pools into mock tournaments
- Optional `Person.birthYear` with age/category fallback per CODES (4.2)

### CTS / Czech Tennis Service policies

- CTS Tabulka IV encoded as 21 categories × singles+doubles (3.9)
- CTS Article 21 qualifying-stage award profiles — Q non-advancers earn column-shifted points (4.0): `buildQualifyingProfile(level, qDrawSize)` produces profiles keyed by `(level, qDrawSize)` filtering on `stages=[QUALIFYING]`, with finishingPositionRanges for Q-final loser / Q-SF / Q-QF
- These policies are owned by their federation now — register via `policyRegistry` (see above)

### Ranking tier fallback (4.2)

When a ranking policy declares no `tierToLevel` mapping, the factory now falls back to `tier.numericRank`. Consumers attaching custom ranking policies via the registry no longer need a redundant `tierToLevel` block when their tier numeric ranks already encode the desired ordering.

### Mocks (3.9 + 4.1)

- Preset participants supported in `generateTournamentRecord` (3.9)
- `generateOutcome` gender-filters preset participants across multi-gender events (4.1.1 fix)

### Tournaments

- `getTournamentInfo` emits `registrationProfile` (3.6) — see the Registration Profile feature in TMX
- `competitiveProfile` enrichment available on matchUp queries without `inContext` (3.4)

### Reports (3.3.1)

- Walkover outcomes handled correctly in competitiveness Spread %

### Query / scoring corrections (3.4.1)

- Corrected polarity in `getPredictiveAccuracy`
- Corrected tiebreak polarity in `getCompetitionLeaderboard`

## Removed without replacement

Nothing in 4.0 removes a feature outright. The federation fixtures are externalized, not deleted — they are owned outside the bundle and reachable through `policyRegistry` or `APPLIED_POLICIES`.

## Next

Continue with [Migration 4.x to 5.0.0](./migration-5.0.0) — CODES schema promotion (former-extension values become first-class on tournament types), typed engine becomes default, and `engine.schemaWriteMode` defaults to `'native'`.
