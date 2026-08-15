---
title: Caller-supplied identity & timestamps
---

## Why a mutation would take an id or a time

Most mutations mint the ids they need and stamp `createdAt` from the clock. That is
correct when a mutation runs **once**. It is wrong the moment the _same_ mutation runs in
**two places** and both results are expected to agree.

That happens routinely:

- a client applies a mutation locally after the server acknowledges it,
- a site server buffers mutations offline and replays them to the cloud on reconnect,
- an event sanctioned elsewhere is activated here and later reconciled there.

If the engine mints, each execution produces a _different_ id, and every later mutation
that references it fails to resolve on one side. If the engine stamps the clock, the
record says when it was **written**, not when it **happened** — and a delayed sync records
the wrong time.

The fix in both cases is the same shape: **identity and event time are minted once, at the
origin, and travel in `params`.**

## `occurredAt` — event time, not write time

Mutations that record when something happened accept an optional `occurredAt`:

```js
engine.modifyParticipantsSignInStatus({
  participantIds,
  signInState,
  occurredAt: '2026-08-15T14:30:00.000Z', // when it happened on site
});
```

Present on `modifyParticipantsSignInStatus`, `modifyParticipantsPaymentStatus`,
`addPenalty` (defaulting to `issuedAt`), `addTimeItem` (via `createdAt`),
`addParticipantScaleItem` (via `scaleItem.createdAt`), the practice-registration
mutations, `addCourtGridBooking`, `addPersonOtherId`, `addVenueOtherId`, `createMatchUp`,
`addDrawDefinitionTimeItem` and `addExtension`.

**Every one defaults to now**, so a caller that omits it sees no change in behaviour.

Two rules govern what event time means, and both are deliberate:

| scope                       | rule                                                                                                                                                                                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Record-root `updatedAt`** | stays **write** time. Only entity-level timestamps carry event time. The storage layer derives its `updated_at` column from the record root and a staleness probe compares it against a client's last poll — event time could move it _backwards_ and silently break staleness detection. |
| **Ordering**                | event time is authoritative, **including retroactively**. A rating recorded at the venue on Saturday and synced on Sunday sorts _before_ a Saturday-evening entry and is no longer "current". That is the point: the timeline reflects what happened, not what arrived first.             |

Four sites deliberately do **not** take a stamp — `modifyParticipant`'s birthDate
validation, sanctioning `amendments` and `compliance` checks, and `scheduleItems`. Those
read "now" in order to _validate_, and a caller-supplied "now" in a validation is
spoofable.

Sanctioning and officiating record `updatedAt` also keep write-time semantics: those
records are not part of the tournamentRecord and sit behind separate engines.

## `uuids` — a pool, not an id parameter

Where a mutation creates an entity the caller never named, it accepts a **pool** to draw
from rather than a single id:

```js
engine.addFlights({ eventId, flightsCount: 3, uuids: ['f-1', 'f-2', 'f-3'] });
```

A pool rather than a named id, because the caller cannot name something it did not ask to
create — the classic case being a **copy-on-write fork**, where modifying a shared
`tieFormat` produces a new one so the other references are left untouched. The fork is
unconditional; only the _value_ of its id comes from the pool.

`tieFormat` forks draw from their own **`tieFormatUuids`** pool, kept separate from the
`uuids` pool feeding matchUp ids in the same mutation. Sharing one pool would couple
unrelated id streams and make a shortfall unattributable — you could not tell which stream
ran short:

```js
engine.removeCollectionDefinition({
  drawId,
  eventId,
  collectionId,
  tieFormatUuids: ['tf-1'], // only for tieFormat copy-on-write forks
});
```

### Strict when supplied

A pool is **not** a hint. `takeUUID` distinguishes three cases:

| pool                  | behaviour                            |
| --------------------- | ------------------------------------ |
| not supplied          | mint — existing behaviour, unchanged |
| supplied, has entries | take one                             |
| supplied, exhausted   | return `INSUFFICIENT_UUIDS`          |

Falling back to minting on an exhausted pool would defeat the purpose: the second
execution would diverge from the first at exactly the point the caller was trying to pin.
An exhausted pool is a **divergence signal**, not a licence to mint.

Because of that, **a caller that supplies a pool must check the returned error**. A
mutation that ignores it turns an exhausted pool into a silent no-op write — strictly
worse than minting.

## What this does not cover

- `addPoint`'s two `matchUp.endTime` stamps still use the clock; threading them needs a
  positional parameter through three helpers and the exported `checkAndFinalizeMatch`.
- `updateTieFormat` accepts **no** pool at all, deliberately: its nested helpers return
  errors their callers currently drop, so a pool threaded there would produce
  `INSUFFICIENT_UUIDS` errors that vanish. It always mints, which is consistent rather
  than intermittently pinned.
