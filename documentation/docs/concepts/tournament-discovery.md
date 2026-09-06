---
title: Tournament Discovery
---

One read-model row per tournament, denormalised for **faceted discovery** — _"what can I play, near
me, that I am eligible for"_.

```js
import { readModel } from 'tods-competition-factory';

const row = readModel.tournamentDiscoveryRow(tournamentRecord);
```

It is also emitted by [`cast()`](../governors/query-governor.md#cast) as the `tournament_discovery`
table, so a consumer rebuilding a whole tournament gets it without a second call.

## The first aggregate row

Every other `ReadModel*Row` is 1:1 with a source object. This one summarises a tournament **and its
events**, because the questions it answers are asked of the tournament while the answers live on the
events — genders, age codes, category types, fee range.

That is a deliberate denormalisation, and it is the reason the consumer side needs an invalidation
rule the other tables do not: **an event changing dirties its tournament's row.**

`cast()` is a pure whole-record projection, so it produces the row correctly whether the consumer
maintains it incrementally or rebuilds it per tournament.

### `tournamentAggregate` — how a row with no owner is attributed

The notice-conformance oracle attributes every projected row to **one** source object. An aggregate
has none, and applying the 1:1 assumption to this row produced seven false violations:
`deleteEvent`, `addVenue`, `modifyVenue`, `setTournamentDates` (widening **and** shrinking),
`deleteVenue` and `setTournamentTier` each change a discovery row while emitting notices scoped to an
event or a venue — never to the tournament, which is correct for what they changed.

So the row is registered in the conformance harness under a distinct entity kind,
`tournamentAggregate`, whose coverage rule is simply **"the mutation announced something"**. That is
exactly what a consumer keys off: it rebuilds the row for every tournament its intent batch touched,
and intents are derived from notices.

The kind is the **oracle's** vocabulary, not a runtime API — nothing a consumer calls returns it. What
it buys a consumer is the guarantee it protects: that a discovery row never moves without some notice
firing.

This loosens a guard over the whole projection, so it is pinned rather than trusted — a discovery
row that moves while **no** notice fires at all is still a violation. The existing entity kinds are
untouched.

## Row shape

```ts
interface ReadModelTournamentDiscoveryRow {
  tournament_id: string;
  provider_id: string | null;

  // date range — duplicated from `tournaments` deliberately
  start_date: string | null;
  end_date: string | null;

  // geo, from the primary venue
  latitude: number | null;
  longitude: number | null;
  venue_name: string | null;
  city: string | null;
  state: string | null;
  country_code: string | null;

  tournament_level: string | null; // organisational SCOPE
  level_system: string | null; // competitive GRADE
  level_value: string | null;
  recognition: string | null;
  decision: string | null;
  ranking_eligible: boolean | null;

  entries_open: string | null;
  entries_close: string | null;

  fee_min: number | null;
  fee_max: number | null;
  fee_currency: string | null;
  fee_unit: string | null;

  event_count: number;
  category_types: string[];
  genders: string[];
  age_codes: string[];
  rating_types: string[];
  cancelled_at: string | null;
}
```

Dates are duplicated from the `tournaments` row on purpose: date range is the hottest facet, and a
discovery index that has to join in order to filter on it is not an index.

`Address.latitude` / `longitude` are typed `string | number` in CODES; both are coerced to `number`
here, because a read model storing two representations of a coordinate cannot be indexed on it.

## `tournament_level` is scope, not grade

`tournament_level` — CLUB, DISTRICT, REGIONAL, NATIONAL, INTERNATIONAL — is **how far the competition
reaches**.

`level_system` / `level_value` carry the competitive **grade** (`{ system: 'USTA', value: 'Level 5
Open' }`), read from `sanction.classification` and falling back to `tournamentTier` — the same tier
shape, one grain up.

_"Show me national events"_ and _"show me Level 5 events"_ are separate facets. A row that flattened
both into one could answer neither reliably.

`tournament_level` is **never defaulted**: an unstated level is unknown, and a discovery facet that
invented one would silently narrow every search that used it.

## What is not here, and why

### No `registration_state`

"Open" / "closing within a week" / "closed" is a function of **now**, and `cast()` is pure — no I/O,
no clock. Storing it would bake a timestamp into a row that nothing re-runs on a schedule, so it
would be wrong from the moment it was written.

The dates are emitted instead and the state is a **read-time** derivation. This mirrors the call
already made for visibility, where `published` + `embargo` are stored and gated at read time rather
than as a stale stored boolean.

`entries_open` / `entries_close` come through
[`getEffectiveRegistrationProfile`](./registration-profile.md#event-grain-overrides), so an event
overriding only one of them does not lose the tournament's other registration facts.

### A fee range that cannot be trusted is not emitted

All four fee columns are `NULL` together when **any** contributing fee cannot be placed on a scale,
or when the fees span more than one denomination.

A partial range is a wrong answer wearing a number, and a min/max computed across currencies compares
figures that are not comparable — 40 EUR "beats" 45 USD on arithmetic that means nothing.

The range is computed over every fee the tournament states, event-level fees included. See
[`getEntryFeeRange`](./registration-profile.md#entry-fees) for the resolution rules.

## Facets

`category_types`, `genders`, `age_codes` and `rating_types` are the distinct values across the
tournament's events, and `event_count` is their number. `cancelled_at` carries the tournament's own
cancellation timestamp.

## Related

- [Query Governor — `cast`](../governors/query-governor.md#cast) — the full projection
- [Query Governor — `readModel` toolkit](../governors/query-governor.md#readmodel-toolkit) — the row builders
- [Registration Profile](./registration-profile.md) — the registration and fee facts this flattens
- [Sanctioning](../codes/sanctioning.mdx) — `recognition`, `decision` and `classification`
