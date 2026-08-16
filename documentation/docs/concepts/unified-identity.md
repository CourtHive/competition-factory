---
title: Unified Identity — Other IDs
---

## The family

A CODES record frequently is not the only place a competition exists. It may have been
acquired wholesale from a federation site, sanctioned by an outside governing body, or
copied back out to one after the fact. The `Unified*ID` family records **what each element
is called in other organisations' systems**, so results stay addressable back to them.

| grain       | array                             | type                   |
| ----------- | --------------------------------- | ---------------------- |
| tournament  | `tournament.tournamentOtherIds`   | `UnifiedTournamentID`  |
| event       | `event.eventOtherIds`             | `UnifiedEventID`       |
| draw        | `drawDefinition.drawOtherIds`     | `UnifiedDrawID`        |
| participant | `participant.participantOtherIds` | `UnifiedParticipantID` |
| person      | `person.personOtherIds`           | `UnifiedPersonID`      |
| venue       | `venue.venueOtherIds`             | `UnifiedVenueID`       |

Three rules hold across every member:

1. **`organisationId` is the upsert key.** One entry per organisation.
2. **At most one entry carries `isOrigin`** — the system the element came from. Everything
   else in the array is a system the element is merely _also_ known to, typically acquired
   by copy-back.
3. **Every id belongs to `organisationId`, never to the carrying record.** Reading one for
   the other is the mistake this concept exists to prevent.

The factory is deliberately neutral about what `organisationId` denotes and never
validates a foreign id. The obligation is identity, not replication — see
[Event Origin](./events/event-origin.mdx).

## Tournament grain

`UnifiedTournamentID` answers "where did this whole record come from?" — the natural
question for an ingested record, where every event, draw and participant arrived together
from one source.

```js
tournamentRecord.tournamentOtherIds = [
  { organisationId: 'UTR', tournamentId: '306618', uniqueOrganisationName: 'Universal Tennis', isOrigin: true },
];
```

`tournamentId` is **required** here, unlike `UnifiedEventID`'s optional one. `eventId` is
optional at event grain because the origin may not hold the event yet; at tournament grain
the id is the entire payload, and an entry without one carries no identity at all.

**Independent of the event grain.** A record acquired wholesale from one organisation can
still carry events sanctioned by others, so neither flag can be inferred from the other.

### Writing

```js
// upsert — the copy-back case, where an id is acquired after the record exists
engine.addTournamentOtherId({
  organisationId: 'UTR',
  otherTournamentId: '306618', // theirs
  uniqueOrganisationName: 'Universal Tennis',
  isOrigin: true,
});

// wholesale — the reconciliation case, and the only way to RE-POINT isOrigin
engine.setTournamentOtherIds({
  tournamentOtherIds: [{ organisationId: 'ITA', tournamentId: 'ita-4471', isOrigin: true }],
});
engine.setTournamentOtherIds({ tournamentOtherIds: null }); // clear
```

`otherTournamentId` is named distinctly from the record's own `tournamentId` for the same
reason `addParticipantOtherId` names `otherParticipantId` that way: both are tournament
ids, and silently transposing them would stamp a record with its own id and still look
like it worked.

Both dispatch `MODIFY_TOURNAMENT_DETAIL`. An idempotent re-apply is a no-op and emits
nothing.

## Draw grain

`UnifiedDrawID` exists because an outside organisation's draw-grain object is frequently
the **only** grain that carries identity worth addressing.

UTR is the motivating case. A UTR "flight" is a real remote object with its own GUID, its
own `drawSize`, and its own UTR-band bounds, and it maps 1:1 to a CODES `drawDefinition`.
But UTR has **no event-grain object at all** — the CODES event above it is a synthetic
gender × matchUpType grouping with no counterpart to record.

```js
drawDefinition.drawOtherIds = [
  {
    organisationId: 'UTR',
    tournamentId: '306618', // UTR's "event"
    drawId: '77f3990b-83c8-4d2b-8bd9-8ca3c646d879', // the flight GUID
    isOrigin: true,
    // no eventId — UTR has no event grain
  },
];
```

Every id attribute is independently optional for exactly that reason: populate only the
grains the origin actually models. An origin that does model events supplies `eventId`
too.

### Writing

```js
engine.addDrawOtherId({
  drawId, // OURS — the engine resolves the drawDefinition
  organisationId: 'UTR',
  otherTournamentId: '306618',
  otherDrawId: '77f3990b-83c8-4d2b-8bd9-8ca3c646d879',
  isOrigin: true,
});

engine.setDrawOtherIds({ drawId, drawOtherIds: [...] });
engine.setDrawOtherIds({ drawId, drawOtherIds: null }); // clear
```

Requires at least one of `otherDrawId` / `otherEventId` / `otherTournamentId`. Both
dispatch `MODIFY_DRAW_DEFINITION`.

## The single-origin invariant

Setting `isOrigin` through an **upsert** is refused when a different organisation already
holds it:

```js
engine.addTournamentOtherId({ organisationId: 'UTR', otherTournamentId: '306618', isOrigin: true });
engine.addTournamentOtherId({ organisationId: 'ITA', otherTournamentId: 'ita-4471', isOrigin: true });
// → { error: INVALID_VALUES, info: "isOrigin is already held by organisationId 'UTR'; …" }
```

An upsert that quietly unflagged the other entry would change which system results are
addressed back to, invisibly. Re-pointing the origin is a deliberate act, so it belongs in
a wholesale `set*OtherIds` call — which validates that the supplied array carries at most
one `isOrigin` entry and that every entry has an `organisationId`.

Readers stay **tolerant**: `tournamentOrigin` / `eventOrigin` / `drawOrigin` `find` the
first flagged entry, so a malformed record already in storage projects deterministically
rather than throwing on a read. Write-side strict, read-side stable.

:::note
`modifyEvent`'s `eventOtherIds` handling predates this validation and still stores the
array as supplied. The readers behave identically either way; only the write-side
strictness differs.
:::

## Reading

```js
import { readModel } from 'tods-competition-factory';

readModel.tournamentOrigin(tournamentRecord); // the isOrigin entry, or undefined
readModel.eventOrigin(event);
readModel.drawOrigin(drawDefinition);
```

## In the read model

Each grain flattens its flagged entry onto its own row. The `origin_*` columns are always
independent of the carrying ids beside them.

**`tournaments`**

| column                   | source                                    |
| ------------------------ | ----------------------------------------- |
| `tournament_id`          | the record's own id                       |
| `origin_organisation_id` | `tournamentOrigin(record).organisationId` |
| `origin_tournament_id`   | `tournamentOrigin(record).tournamentId`   |

**`draws`**

| column                   | source                            |
| ------------------------ | --------------------------------- |
| `draw_id`                | the draw's own id                 |
| `origin_organisation_id` | `drawOrigin(draw).organisationId` |
| `origin_tournament_id`   | `drawOrigin(draw).tournamentId`   |
| `origin_event_id`        | `drawOrigin(draw).eventId`        |
| `origin_draw_id`         | `drawOrigin(draw).drawId`         |

Each column is independently nullable: a UTR flight populates
`origin_tournament_id` + `origin_draw_id` and leaves `origin_event_id` null.

As with the events table, `origin_tournament_id` **cannot** carry a foreign key — a
constraint satisfiable for a link into this ecosystem is impossible for an external one.
Resolution is a read-time `LEFT JOIN`, never a write-time constraint.
