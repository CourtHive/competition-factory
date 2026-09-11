---
title: Fluent Builders
---

`engine.build.*` exposes chainable builders that collapse the multi-call event/draw/entries composition into one sentence. Built on top of `executionQueue` — no new mutation surface, just an ergonomic facade.

## EventBuilder

```ts
const { eventId, drawIds } = tournamentEngine.build
  .event({ eventName: 'U16 Singles' })
  .singles()
  .draw(32, { seedsCount: 8 })
  .entries(participantIds)
  .create();
```

Compare to the equivalent direct calls:

```ts
const event = { eventName: 'U16 Singles', eventType: SINGLES_EVENT };
const addEventResult = tournamentEngine.addEvent({ event });
const { drawDefinition } = tournamentEngine.generateDrawDefinition({
  eventId: addEventResult.event.eventId,
  drawSize: 32,
  seedsCount: 8,
});
tournamentEngine.addDrawDefinition({ eventId: addEventResult.event.eventId, drawDefinition });
tournamentEngine.addEventEntries({
  eventId: addEventResult.event.eventId,
  participantIds,
  entryStage: MAIN,
  entryStatus: DIRECT_ACCEPTANCE,
});
```

### Chain methods

| Method                                                          | Effect                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.singles()` / `.doubles()` / `.team(tieFormat?)` / `.hybrid()` | Sets `eventType`. `.team()` optionally sets `tieFormat` or `tieFormatName`.                                                                                                                                                                                                                                 |
| `.named(name)`                                                  | Sets `eventName`.                                                                                                                                                                                                                                                                                           |
| `.gender('MALE' \| 'FEMALE' \| 'MIXED' \| 'ANY' \| 'OTHER')`    | Sets `gender`.                                                                                                                                                                                                                                                                                              |
| `.category(category)`                                           | Sets the event `category`.                                                                                                                                                                                                                                                                                  |
| `.dates(startDate, endDate)`                                    | Sets event date range.                                                                                                                                                                                                                                                                                      |
| `.tieFormat(tieFormat \| tieFormatName)`                        | Attaches a tieFormat (object) or tieFormatName (string).                                                                                                                                                                                                                                                    |
| `.draw(drawSize, opts?)`                                        | Adds a draw. **v1 limit:** call once per event. Multi-flight is a v2 addition.                                                                                                                                                                                                                              |
| `.entries(participantIds, opts?)`                               | Stages an `addEventEntries` directive. `opts.entryStage` defaults to `MAIN`, `opts.entryStatus` to `DIRECT_ACCEPTANCE`. `opts.enforceGender` / `opts.enforceCategory` pass through to the underlying entry-check (omit to keep `addEventEntries`' own defaults: enforceGender:true, enforceCategory:false). |

### Terminals

| Terminal          | Returns                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `.create(opts?)`  | Runs the assembled directives now via `engine.executionQueue`. Returns `{ success, eventId, drawIds, directives, results }`. |
| `.toRequest()`    | `{ directives, eventId, drawIds }` — server-bound payload, no execution. Send over the wire.                                 |
| `.toDirectives()` | Raw `Directives` array (for inspection or custom dispatch).                                                                  |

### Pre-assigned IDs

`builder.eventId` and `builder.drawIds` are populated _before_ a terminal runs. The builder generates UUIDs in the constructor / `.draw()` and threads them into the directives. This means the caller can reference IDs in subsequent chains or UI before `.create()` resolves:

```ts
const builder = tournamentEngine.build.event().singles().draw(8);
const previewId = builder.eventId; // already a UUID
postToDevToolsPreview(previewId, builder.toRequest());
builder.create();
```

## ParticipantBuilder

```ts
const { participantId } = tournamentEngine.build
  .participant()
  .individual({ givenName: 'Petr', familyName: 'Novák', sex: 'M', nationalityCode: 'CZE' })
  .create();
```

| Method                                                                      | Effect                                                                           |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `.individual({ givenName, familyName, sex?, nationalityCode?, personId? })` | INDIVIDUAL participant + person sub-object. `personId` defaults to a fresh UUID. |
| `.pair([individualId1, individualId2], name?)`                              | PAIR participant referencing two existing individuals.                           |
| `.team(name, individualParticipantIds?)`                                    | TEAM participant.                                                                |
| `.role(role)`                                                               | Overrides `participantRole`. Default: `COMPETITOR`.                              |
| `.create()` / `.toRequest()` / `.toDirectives()`                            | Same shape as EventBuilder.                                                      |

## What's deferred to v2

These will land as additive APIs after v1 sees usage; nothing about v1 will need to change to accommodate them:

- `engine.build.playoffs(drawId)...` — chainable `addPlayoffStructures`.
- `engine.build.tieFormat(drawId)...` — chainable composition over `modifyTieFormat` / `addCollectionDefinition` / `removeCollectionDefinition`.
- Multi-flight draws on a single `EventBuilder` (v1 throws if `.draw()` is called twice).
- A standalone person registry / dedup builder (v1 inlines person via `.individual({ person })`).

See `src/forge/builders/` for the implementation.
