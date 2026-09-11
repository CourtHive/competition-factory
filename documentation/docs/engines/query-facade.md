---
title: Query Facade (engine.q)
---

`engine.q.*` is a thin ergonomic layer over the factory's read methods. Every underlying query returns a result envelope like `{ events, error }` or `{ drawDefinition, error }`; the facade unwraps that envelope and returns the primary value directly. The original engine methods stay intact — `engine.q` is purely additive, opt-in per call site.

```ts
// before — manual unwrap, every site
const events = tournamentEngine.getEvents()?.events ?? [];
const event = tournamentEngine.getEvent({ eventId })?.event;
const drawDefinition = tournamentEngine.findDrawDefinition({ drawId })?.drawDefinition;

// after — engine.q
const events = tournamentEngine.q.events();
const event = tournamentEngine.q.event({ eventId });
const drawDefinition = tournamentEngine.q.drawDefinition({ drawId });
```

The facade also returns a typed fallback when the underlying call errors, the result envelope is missing the expected key, or the method isn't present on the engine (e.g. calling a CompetitionEngine-only method on `tournamentEngine`). Array-typed facade methods fall back to `[]`; object-typed methods fall back to `undefined`. No `try/catch`, no `?.` chains, no `|| []` tail.

## Available methods

The facade currently exposes ~30 of the highest-traffic queries across the CourtHive ecosystem. The list is curated; adding a new entry is one row in the registry plus one signature on `QueryFacade`.

| Group                     | Methods                                                                                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tournament                | `tournament()`, `tournamentInfo()`, `tournamentTimeItem()`, `linkedTournamentIds()`, `policyDefinitions()`, `participants()`                                                                               |
| Event                     | `event()`, `events()`, `eventData()`, `eventRankingPoints()`, `flightProfile()`                                                                                                                            |
| Draw                      | `drawDefinition()`, `draftState()`, `publishState()`, `availablePlayoffProfiles()`, `validGroupSizes()`, `assignedParticipantIds()`, `swissChart()`, `structureSeedAssignments()`, `positionAssignments()` |
| MatchUps                  | `matchUp()`, `matchUps()`, `drawMatchUps()`, `eventMatchUps()`, `competitionMatchUps()`, `matchUpsMap()`                                                                                                   |
| Venues / Courts           | `venue()`, `venuesAndCourts()`                                                                                                                                                                             |
| Position assignment       | `tally()`                                                                                                                                                                                                  |
| Extension passthrough     | `extension()`                                                                                                                                                                                              |
| CompetitionEngine surface | `competitionVenues()`, `competitionParticipants()`                                                                                                                                                         |

Each method accepts the same arguments as the underlying engine call (e.g. `engine.q.event({ eventId })` → `engine.getEvent({ eventId })?.event`). Per-method argument types are still `any` at the facade layer; that's a follow-up tied to broader per-method signature work.

## Typed access

The facade is exposed as `q: QueryFacade` on `FactoryEngineTyped`. Consumers opting into the typed engine surface get IDE autocomplete on the facade methods:

```ts
import { tournamentEngine } from 'tods-competition-factory';
import type { FactoryEngineTyped } from 'tods-competition-factory';

const engine = tournamentEngine as FactoryEngineTyped;
const events = engine.q.events(); // Event[]
const event = engine.q.event({ eventId }); // Event | undefined
```

`QueryFacade` is also exported directly for consumers that want to type a slot or parameter:

```ts
import type { QueryFacade } from 'tods-competition-factory';

function renderEventsList(q: QueryFacade) {
  return q.events().map((e) => renderEvent(e));
}
```

## Caveats

- The facade returns the **primary** key from each envelope. Queries that return multiple useful keys (e.g. `getEvent` returns both `event` and `drawDefinition`) only surface one through the facade; reach for the underlying method when you need the others.
- The facade swallows errors and returns the fallback. If you need to surface the error to the user, call the underlying engine method directly and inspect `result.error`.
- Methods that don't exist on the current engine (e.g. `competitionVenues()` on a tournament engine that hasn't loaded the competition surface) return the fallback silently — by design, so a single facade works across engine variants.

See `src/forge/q.ts` for the implementation and registry.
