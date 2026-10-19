---
title: Status Keys
---

Every publish method takes an optional `status`, a **publish status key**. It defaults to `'PUBLIC'`. A key names
one audience's view of what is published: `PUBLIC` is what the public sees, and a deployment can keep a second view,
for example `INTERNAL` for staff screens, that it publishes on its own schedule.

## How keys are stored

Publish state lives in a `PUBLISH.STATUS` time item, on the event for event-level items and on the tournament record
for tournament-level items. Its value holds one entry per key:

```js
{
  itemType: 'PUBLISH.STATUS',
  itemValue: {
    PUBLIC: { drawDetails: { /* ... */ }, seeding: { /* ... */ } },
    INTERNAL: { drawDetails: { /* ... */ } },
  },
}
```

## Keys are independent

Publishing, embargoing, unpublishing or changing seeding under one key leaves every other key's entry exactly as it
was. An event can be published under `INTERNAL` days before it is published under `PUBLIC`, and unpublishing it under
`INTERNAL` afterwards does not touch the `PUBLIC` entry.

```js
engine.publishEvent({ eventId, status: 'INTERNAL' }); // staff see the draws
engine.publishEvent({ eventId }); // the public see them too
engine.unPublishEvent({ eventId, status: 'INTERNAL' }); // the public still see them
```

## Methods that take `status`

| Element    | Methods                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Event      | `publishEvent`, `unPublishEvent`, `publishEventSeeding`, `unPublishEventSeeding`, `setEventDisplay`                                              |
| Tournament | `publishOrderOfPlay`, `unPublishOrderOfPlay`, `publishParticipants`, `unPublishParticipants`, `publishTournamentInfo`, `unPublishTournamentInfo` |

Omitting `status` writes the `PUBLIC` entry.

## Reads that honour `status`

These answer for the key they are given (default `PUBLIC`):

- `getPublishState({ status })`: every entry it returns (events, draws, tournament items, embargoes) is read from
  that key.
- `getEventData({ eventId, usePublishState: true, status })` and `getDrawData`: which draws and structures are
  visible.
- `competitionScheduleMatchUps({ usePublishState: true, status })`: the published order of play.
- `getEventPublishStatus({ eventId, status })` and `getTournamentPublishStatus({ status })`: the raw entry.

`getParticipants` (published seeding) and `getTournamentInfo` (`usePublishState`) take no `status`, and always read
the `PUBLIC` entry.

```js
const { publishState } = engine.getPublishState({ status: 'INTERNAL' });
const internallyPublished = publishState[eventId].status.published;

const { eventData } = engine.getEventData({ eventId, usePublishState: true, status: 'INTERNAL' });
```
