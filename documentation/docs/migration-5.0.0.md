---
title: Migration 4.x to 5.0.0
---

Version 5.0.0 of the Competition Factory completes the **CODES (Competition Open Data Exchange Standards)** schema initiative — promoting a long list of canonical internal extensions and schedule-related timeItems from the `extensions[]` envelope to first-class typed attributes on `tournamentTypes.ts`.

5.0.0 ships **two** breaking changes consumers should know about:

1. **`engine.schemaWriteMode` default flips to `'native'`** (previously implicit-`'legacy'` behavior in 4.x). Consumers that read former-extension values from raw `element.extensions[]` will see `undefined` in NATIVE mode because the factory no longer writes the legacy envelope.
2. **`tournamentEngine` and `competitionEngine` exports are now typed as `FactoryEngineTyped`** (previously the open `FactoryEngine` / `{[key: string]: any}` shape). Method-name autocomplete, per-method params/returns, and the developer-JOY facades (`engine.q.*`, `engine.dryRun`, `engine.explain`, `engine.inspect`, `engine.on/once/off/waitFor`, `engine.build.*`) all surface automatically. **An opt-out is provided** for downstream consumers that can't take the typed lift yet — see "Typed engine default + opt-out" below.

This document is for **consumers** of the factory (TMX, courthive-components, the server, downstream tools). It catalogues:

1. The typed-engine default change and how to opt out.
2. Every promoted name and its first-class location.
3. The factory query method (engine method) to call for a mode-agnostic read — recommended for all new and migrated code.
4. New 5.0.0 attributes and mutations that didn't exist in 4.x.
5. Worked examples from the CourtHive ecosystem's own migration.

## Typed engine default + opt-out

In 5.0.0 the singleton engine exports change static type:

```ts
import { tournamentEngine, competitionEngine } from 'tods-competition-factory';

// tournamentEngine: FactoryEngineTyped   <-- new in 5.0.0
// In 4.x: FactoryEngine ({[key: string]: any} — open shape)
```

What you get for free:

- **Method-name autocomplete.** `tournamentEngine.getEevents()` is a compile-time red squiggle now; previously it was an `any`-shaped runtime no-op that returned `undefined` and crashed downstream.
- **Per-method params + returns.** ~89% of the 600-method engine surface has signatures lifted from the source declarations via `MethodSignatures`. The rest still type as `(...args: any[]) => any` so the surface stays complete; methods get tightened incrementally without breaking consumers.
- **Precise generics on the developer-JOY facades.** `engine.q.events()` returns `Event[]` directly. `engine.on('addMatchUps', e => …)` infers the topic payload. `engine.dryRun(directives)` returns a typed `DryRunResult` with the RFC 6902 patch + emitted notices.
- **Auto-resolved entities are optional.** Passing `drawId` is enough — the engine middleware resolves `drawDefinition` / `event` / `tournamentRecord` from state, and the typed surface no longer demands them at the call site.

### Opt-out: keep the open shape

If you're upgrading to 5.0.0 to get a non-type-related fix (CODES schema reads, new mutations, etc.) but can't take the typed lift at the same time — for example, your TypeScript build has `noImplicitAny: false` and your code accesses methods that haven't been added to `MethodSignatures` yet — import the `Untyped` variants instead:

```ts
import { tournamentEngineUntyped, competitionEngineUntyped } from 'tods-competition-factory';

// Same runtime singleton as `tournamentEngine`; typed as the pre-5.x
// open `FactoryEngine` shape.
const engine = tournamentEngineUntyped;
engine.someMethodNotYetTyped({ ...whatever });
```

Runtime is identical — they're the same engine instance under a looser type. Opt back in to the typed default at your pace.

### Adopting the typed default progressively

For an existing consumer that imports `tournamentEngine` today, switching to the typed default is automatic on package upgrade — no code change required to flip the type. What changes is what your `tsc --noEmit` reports: latent shape errors that the open `FactoryEngine` swallowed will now surface as proper compile errors.

The migration playbook (see worked examples below):

1. Upgrade `tods-competition-factory` to 5.0.0.
2. Run `pnpm check-types` / `tsc --noEmit`.
3. For each surfaced error: fix the call site (preferred), or as a temporary measure, swap that file's import to `tournamentEngineUntyped` and revisit later.
4. When all `Untyped` imports are gone, you've finished the migration.

For an end-to-end story see the TMX migration commits referenced in the **Worked examples** section.

## Reading promoted attributes — use the factory query methods

Every promoted name is internally read via `firstClassOrExtension` (or a sibling helper). This means **every factory query that returns one of these attributes already gives you the right value regardless of write mode**. Don't read raw `.extensions[]` for promoted names — call the engine method instead.

### PositionAssignment

| 4.x extension                                      | 5.0.0 first-class             | Engine method (mode-agnostic)                                                      |
| -------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------- |
| `positionAssignment.extensions[{name:'tally'}]`    | `positionAssignment.tally`    | `engine.getTally({ positionAssignment })`                                          |
| `positionAssignment.extensions[{name:'subOrder'}]` | `positionAssignment.subOrder` | (read first-class directly; `getPositionAssignments` returns hydrated assignments) |

### Event

| 4.x extension                              | 5.0.0 first-class     | Engine method                        |
| ------------------------------------------ | --------------------- | ------------------------------------ |
| `event.extensions[{name: FLIGHT_PROFILE}]` | `event.flightProfile` | `engine.getFlightProfile({ event })` |

### DrawDefinition

| 4.x extension                                       | 5.0.0 first-class              | Engine method                                   |
| --------------------------------------------------- | ------------------------------ | ----------------------------------------------- |
| `drawDefinition.extensions[{name: LINEUPS}]`        | `drawDefinition.lineUps`       | `engine.getTeamLineUp({ drawDefinition, ... })` |
| `drawDefinition.extensions[{name:'draftState'}]`    | `drawDefinition.draftState`    | `engine.getDraftState({ drawDefinition })`      |
| `drawDefinition.extensions[{name:'flightProfile'}]` | `drawDefinition.flightProfile` | `engine.getFlightProfile({ ... })`              |

### MatchUp — schedule attributes (Phase 2)

10 schedule-related `matchUp.timeItems[]` entries promoted to `matchUp.schedule.*`. Read these as first-class on the `MatchUp` returned by `getMatchUp`, `findMatchUp`, `allTournamentMatchUps`, `competitionScheduleMatchUps`, etc.

| 4.x timeItem `itemType` | 5.0.0 first-class                    |
| ----------------------- | ------------------------------------ |
| `SCHEDULED_DATE`        | `matchUp.schedule.scheduledDate`     |
| `SCHEDULED_TIME`        | `matchUp.schedule.scheduledTime`     |
| `ASSIGN_COURT`          | `matchUp.schedule.courtId`           |
| `ASSIGN_VENUE`          | `matchUp.schedule.venueId`           |
| `COURT_ORDER`           | `matchUp.schedule.courtOrder`        |
| `COURT_ANNOTATION`      | `matchUp.schedule.courtAnnotation`   |
| `ALLOCATE_COURTS`       | `matchUp.schedule.allocatedCourts`   |
| `TIME_MODIFIERS`        | `matchUp.schedule.timeModifiers`     |
| `HOME_PARTICIPANT_ID`   | `matchUp.schedule.homeParticipantId` |
| `ASSIGN_OFFICIAL`       | `matchUp.schedule.official`          |

Lifecycle timeItems intentionally stay on `matchUp.timeItems[]`: `START_TIME`, `STOP_TIME`, `RESUME_TIME`, `END_TIME` (`matchUpDuration` requires the ordered intermediates).

### MatchUp / Entry / Structure / Venue / Court — flat scalars (Phase 4)

| 4.x extension                                                                                 | 5.0.0 first-class                             |
| --------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `matchUp.extensions[{name:'delegatedOutcome'}]`                                               | `matchUp.delegatedOutcome`                    |
| `matchUp.extensions[{name:'disableAutoCalc'}]`                                                | `matchUp.disableAutoCalc`                     |
| `matchUp.extensions[{name:'disableLinks'}]`                                                   | `matchUp.disableLinks`                        |
| `entry.extensions[{name:'roundTarget'}]` / `structure.extensions[{name:'roundTarget'}]`       | `entry.roundTarget` / `structure.roundTarget` |
| `venue.extensions[{name:'disabled'}]` / `court.extensions[{name:'disabled'}]`                 | `venue.disabled` / `court.disabled`           |
| `event.extensions[{name:'factory'}]` / `tournament.extensions[{name:'factory'}]`              | `event.factory` / `tournament.factory`        |
| `tournament.extensions[{name:'draftState'}]` (deprecated location) — see DrawDefinition above | —                                             |
| `tournament.extensions[{name:'competitionState'}]`                                            | `tournament.competitionState`                 |

### TournamentRecord — scheduling group leaf (Phase 5)

`tournamentRecord.scheduling.{ profile, dailyLimits, timing }` replaces three previously-separate tournament extensions (`SCHEDULING_PROFILE`, `SCHEDULE_LIMITS`, tournament-level `SCHEDULE_TIMING`). Note that **event-level** `SCHEDULE_TIMING` intentionally stays as an extension.

### linkedTournamentIds (Phase 7)

Two things changed at once on this attribute, which is why it was deferred from Phase 4 (flat scalars) to Phase 7 (migration utility).

**Change 1 — name (typo fix).** The 4.x extension name is `linkedTournamentsIds` (with an extra "s" — typo in the original code; the constant lives as `LINKED_TOURNAMENTS = 'linkedTournamentsIds'`). The 5.0.0 first-class attribute uses the corrected spelling `linkedTournamentIds`. The extension key is not renamed because that would invalidate stored records.

**Change 2 — wrapper unwrapping.** The 4.x extension `value` was an object wrapping the array: `{ tournamentIds: ['t-1', 't-2'] }`. The 5.0.0 first-class attribute is a flat array: `['t-1', 't-2']`.

```ts
// 4.x — extension
record.extensions = [{ name: 'linkedTournamentsIds', value: { tournamentIds: ['t-1', 't-2'] } }];

// 5.0.0 — first-class
record.linkedTournamentIds = ['t-1', 't-2'];
```

The wrapper had no other fields and bought nothing, so CODES flattens it away.

**Why deferred to Phase 7.** Every other CODES promotion in Phases 0–5 was a structural shadow: extension value and first-class attribute hold the same value. A DUAL-mode writer could write the same value to both surfaces and a reader could fall back from first-class to extension transparently. `linkedTournamentIds` is different — the two surfaces hold values of different shapes, so the promotion required a one-time translator. That translator is special-cased in the `migrateTournamentRecord` utility (see `src/mutate/tournaments/migrateTournamentRecord.ts`):

```ts
{
  name: LINKED_TOURNAMENTS,
  attribute: 'linkedTournamentIds',
  // historical shape `{tournamentIds: string[]}` flattens to a plain `string[]`
  translate: (legacy) => legacy?.tournamentIds ?? legacy,
}
```

**What 5.0.0 writes.** The `competitionEngine` mutations `linkTournaments`, `unlinkTournament`, and `unlinkTournaments` are mode-aware:

- NATIVE (5.0.0 default) → writes flat array to `record.linkedTournamentIds`; clears any pre-existing legacy extension on the same record
- LEGACY → writes the legacy `{tournamentIds: []}` wrapper extension; clears any first-class field
- DUAL → writes both surfaces

The corresponding factory readers (`getLinkedTournamentIds` query, `removeUnlinkedTournamentRecords` state method, and `unlinkTournament`'s internal read) are mode-agnostic via a shared `getRecordLinkedTournamentIds` helper that prefers the first-class field and falls back to the legacy extension.

**Consumer-side read.** If you depend on the linked-tournament list (typically `findCourt` / `findVenue` in multi-tournament mode) call the engine method:

```ts
const { linkedTournamentIds } = competitionEngine.getLinkedTournamentIds();
// linkedTournamentIds: { [tournamentId]: string[] }
// returns OTHER linked ids per record (self is filtered out)
```

If you need to read the raw record directly (e.g. server-side, looking at JSON before any engine load), prefer first-class with the wrapped-extension fallback:

```ts
const linked =
  tournamentRecord.linkedTournamentIds ??
  tournamentRecord.extensions?.find((e) => e.name === 'linkedTournamentsIds')?.value?.tournamentIds ??
  [];
```

Or run the record through `engine.migrateTournamentRecord({ tournamentRecord })` once on load, after which the first-class field is always populated.

## Mode-agnostic read helper

If you genuinely need to do a manual read of an attribute that doesn't have a dedicated engine method, the factory exports the underlying helper:

```ts
import { firstClassOrExtension } from 'tods-competition-factory/acquire/firstClassOrExtension';

const value = firstClassOrExtension({
  element: event,
  attribute: 'flightProfile',
  name: 'flightProfile', // legacy extension name
});
```

This returns first-class when present, falls back to extension when not.

## Engine write mode flags

| Flag                                                     | Default in 5.0.0 | Purpose                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine.schemaWriteMode('native' \| 'dual' \| 'legacy')` | `'native'`       | Controls write-side behavior. `'native'` writes first-class only. `'dual'` writes both. `'legacy'` writes extension only. **Reads always handle all three modes via `firstClassOrExtension`** — set it only to control write surface during transition.                         |
| `engine.saveDrawDeletions(boolean)`                      | `false`          | Opt-in to persist `drawDeletions` audit on the tournament record (Phase 6). When `false` the factory suppresses the local timeItem/extension writes but still emits the `AUDIT` topic notice.                                                                                   |
| `engine.auditAuthorityServer(boolean)`                   | `false`          | Declare that an external system (e.g. `competition-factory-server`) is the canonical audit trail for `deleteDrawDefinitions`. When `true`, factory unconditionally suppresses local audit writes, regardless of `saveDrawDeletions`. Server engines should set this at startup. |

## New mutations and queries added in 5.0.0

| Method                                                               | Purpose                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine.getTally({ positionAssignment })`                            | Mode-agnostic read of `positionAssignment.tally` (returns `{ tally }` or `{ error }`).                                                                                                                                                                                                                                                                      |
| `engine.migrateTournamentRecord({ tournamentRecord, clearLegacy? })` | One-shot upgrade utility for v4 records — promotes 17 canonical legacy extensions / schedule timeItems to first-class, including the `linkedTournamentIds` shape translation. Idempotent.                                                                                                                                                                   |
| `engine.setMatchUpCalledAt({ drawId, matchUpId, calledAt })`         | Sets `matchUp.schedule.calledAt` — an ISO timestamp captured when a tournament director deliberately places a matchUp on a live "now / active strip" UI. Distinct from the existing `scheduledTime` (plan) and `START_TIME` timeItem (actual start). Pass `null` or `undefined` to clear. See [active-strip pattern](#active-strip-calledat-pattern) below. |
| `engine.saveDrawDeletions` / `engine.auditAuthorityServer`           | See "Engine write mode flags" above.                                                                                                                                                                                                                                                                                                                        |

## Active-strip `calledAt` pattern

`matchUp.schedule.calledAt` is a **new first-class attribute** introduced in 5.0.0 (no legacy mirror — the factory does not write a corresponding timeItem in DUAL or LEGACY mode either). It captures the moment a tournament director drag-drops a matchUp onto a live "now playing" strip in a client UI, signalling "this matchUp is imminent — we're telling the world it's next on this court."

Semantics:

- The attribute is **only set by deliberate drag-drop** — not by auto-population (follow-by scheduling).
- It is **additive** to `matchUp.schedule.courtId` — the same drag-drop captures both the court assignment and the call timestamp.
- It **persists past `START_TIME`** as a historical record. Use it for "when was this match called?" queries.
- It is **cleared only on explicit removal** — typically when the matchUp is unscheduled (dragged off the strip back to the unscheduled catalog). Subsequent drag-drops on a strip overwrite the prior timestamp.

Recommended client wiring (the TMX `schedule2Tab` reference implementation):

```ts
// On drag-drop onto the active strip:
methods.push({
  method: 'setMatchUpCalledAt',
  params: {
    drawId,
    matchUpId,
    calledAt: new Date().toISOString(),
  },
});

// On explicit unschedule (drag off the strip into the unscheduled catalog):
methods.push({
  method: 'setMatchUpCalledAt',
  params: { drawId, matchUpId, calledAt: null },
});
```

## Worked examples from the CourtHive ecosystem

The same migration was performed on TMX and courthive-components alongside the 5.0.0 cut. See:

- **TMX** — [`feat/tmx-5.0.0-flattening-reads`](https://github.com/CourtHive/TMX) migrated 14 read sites across 12 files (10 FLIGHT_PROFILE, 2 draftState, 2 tally) by routing through `getFlightProfile` / `getDraftState` / `getTally`. Net diff: +28 / -35 lines (the helper-method route is more concise than the inline `.extensions?.find()` pattern).
- **courthive-components** — [`feat/codes-5.0.0-draftstate-read`](https://github.com/CourtHive/courthive-components) migrated 1 read site (`mapEvent.ts` draftState). The components library is pure UI and does not call the factory engine, so the migration uses an inline `draw.draftState ?? draw.extensions?.find(...)?.value` fallback rather than the engine method.

## What did NOT change in 5.0.0

- The `appliedPolicies` extension stays as an extension (multi-entity merge semantics — not a candidate for first-class promotion).
- `drawDeletions` stays as an extension (audit trail; opt-in via `saveDrawDeletions`).
- Lifecycle matchUp timeItems (`START_TIME`, `STOP_TIME`, `RESUME_TIME`, `END_TIME`).
- Event-level `SCHEDULE_TIMING` (tournament-level is promoted; event-level intentionally stays).
- TMX-owned and consumer-owned extensions (`createdByUserId`, `swissScaleName`, `FORMAT_WIZARD_EXTENSION_NAME`, `SCHEDULE_DISPLAY_EXTENSION_NAME`, `scheduleDisplay`, etc.) — these are application extensions, not factory-managed, and read patterns against them are unaffected.

## Upgrading a v4 record

Use the `engine.migrateTournamentRecord({ tournamentRecord })` one-shot utility. It walks the record and promotes all 17 canonical legacy extensions / schedule timeItems to first-class. Idempotent — safe to call multiple times. Pass `clearLegacy: true` to also remove the legacy `extensions[]` / `timeItems[]` entries after promotion (destructive); default is to leave both surfaces populated (shadow mode).
