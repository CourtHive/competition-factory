---
title: Competition Factory Server
sidebar_position: 8
---

# Competition Factory Server

The [competition-factory-server](https://github.com/CourtHive/competition-factory-server) (CFS) is the server TMX
connects to when a tournament belongs to a provider. It is a NestJS application that runs the same Competition Factory
as the browser, stores tournament records in Postgres, and pushes changes to every connected client.

:::info
The server is optional. A tournament with no provider, or a TMX that is offline, runs **local only**: every mutation
is applied by the factory in the browser and saved to the browser's IndexedDB.
:::

## What the server provides

- **Persistence** — tournament records in Postgres, behind a storage interface
- **The same engine** — every mutation is executed by the server's own factory instance (the async engine, with
  per-request state isolation), so client and server apply identical logic
- **Serialized writes** — a per-tournament lock, so concurrent mutations to one tournament run one at a time
- **Push** — a Socket.IO `/tmx` namespace that broadcasts each applied mutation to the other clients of that tournament
- **Read endpoints** — tournament info, event and draw data, schedules and participants for public viewers, with
  response caching (Redis)
- **Authentication and authorization** — JWT sessions, provider scoping and per-tournament permissions
- **An audit log** — every applied mutation, with the authenticated actor

## How a mutation travels

TMX never sends a whole tournament record to make a change. It sends the **methods** to run, and both sides run them:

```text
User action (TMX)
  → mutationRequest({ methods })
    → POST /factory  { methods, tournamentIds, commandId }
      → per-tournament lock
      → load the records from Postgres
      → the server's factory runs the methods (executionQueue)
      → save the records; broadcast to the /tmx room; evict cached reads
    → HTTP response = the acknowledgement
  → TMX runs the methods, as the server applied them, on its local factory
```

A mutation is an ordered list of factory methods:

```js
{
  methods: [
    { method: 'addEvent', params: { event: { eventId, eventName: "Men's Singles" } } },
    { method: 'addEventEntries', params: { eventId, participantIds } },
  ],
  tournamentIds: ['tournament-id'],
  commandId: 'a-uuid', // makes a resend safe (below)
}
```

The socket carries subscriptions and server push only. Commands always go over HTTP (the socket `executionQueue` was
retired in 2026).

### Execution strategies

TMX picks one of three strategies for each mutation (`determineExecutionStrategy` in TMX):

| Strategy       | When                                                                      | Behaviour                                                                                     |
| -------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `server-first` | the tournament has a provider, TMX is online, `serverFirst` (the default) | the server executes and acknowledges; only then does TMX apply the methods the server applied |
| `local-first`  | online with a provider, `serverFirst: false`                              | TMX applies locally first, and sends the methods to the server only if that succeeded         |
| `local-only`   | no provider, or offline                                                   | applied in the browser and saved to IndexedDB; nothing is sent                                |

There is no "master" or "slave" mode: the strategy above is the whole ownership model.

### Refusals and retries

The server is authoritative. A mutation the factory refuses (invalid parameters, a draw state that does not allow it,
a permission the caller lacks) returns an error and changes nothing; TMX shows it and applies nothing locally.

A mutation can succeed on the server while its answer is lost. TMX keeps each command in a durable IndexedDB outbox
until a server receipt confirms it, and sends a stable `commandId`: the server records a receipt for it, so a resend
returns the original answer instead of applying the methods twice.

### Going back online

A tournament changed while offline is sent back as a whole record (`POST /factory/save`), conditional on the server's
copy being the one TMX went offline from (`expectedServerUpdatedAt`). If someone else changed it in the meantime, the
save is refused with `409` rather than overwriting their work.

## Queries stay local

TMX answers its own screens from the factory in the browser — `getEvents`, `getParticipants`, `allTournamentMatchUps`
and the rest — without a server round-trip. The server's read endpoints exist for clients that do not hold the record,
such as the public viewer.

## Running it

See the [competition-factory-server repository](https://github.com/CourtHive/competition-factory-server) for setup.
It uses pnpm, and needs Postgres (configured with `PG_*` variables) and Redis.

## Related Documentation

- [Engine Methods](../engines/engine-methods.md) - All factory methods
- [State Management](../engines/state-engines.mdx) - Managing state
- [Browser Console](./browser-console.md) - Client-side factory usage, including `dev.modifyTournament`
- [TMX Overview](./overview.md) - TMX architecture
