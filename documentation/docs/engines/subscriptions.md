---
title: Subscriptions
---

Subscriptions enable external methods to be called when certain events occur while the Competition Factory engines are mutating a tournament document.

The payload for each subscription is an array of objects, with each element of the array having been produced by an `addNotice` statement within engine methods. Subscription methods are called **_after_** an engine method completes, not during execution.

:::info
All engine methods may be passed the additional parameter `{ delayNotify: true }`, in which case subscription methods are **_not_** called until a subsequent engine method is invoked.
:::

```js
const subscriptions = {
  [topicConstants.AUDIT]: (payload) => {},

  [topicConstants.ADD_MATCHUPS]: (payload) => {},
  [topicConstants.DELETED_MATCHUP_IDS]: (payload) => {},
  [topicConstants.MODIFY_MATCHUP]: (payload) => {},

  // factory will use generated or generate inContextMatchUp (for updating public site)
  // this can be used on client but may not have all participantContext options
  [topicConstants.UPDATE_INCONTEXT_MATCHUP]: (payload) => {},

  [topicConstants.PUBLISH_EVENT]: (payload) => {},
  [topicConstants.UNPUBLISH_EVENT]: (payload) => {},

  [topicConstants.PUBLISH_EVENT_SEEDING]: (payload) => {},
  [topicConstants.UNPUBLISH_EVENT_SEEDING]: (payload) => {},

  [topicConstants.PUBLISH_ORDER_OF_PLAY]: (payload) => {},
  [topicConstants.UNPUBLISH_ORDER_OF_PLAY]: (payload) => {},

  [topicConstants.ADD_VENUE]: (payload) => {},
  [topicConstants.MODIFY_VENUE]: (payload) => {},
  [topicConstants.DELETE_VENUE]: (payload) => {},

  [topicConstants.ADD_PARTICIPANTS]: (payload) => {},
  [topicConstants.MODIFY_PARTICIPANTS]: (payload) => {},
  [topicConstants.DELETE_PARTICIPANTS]: (payload) => {},

  [topicConstants.MODIFY_POSITION_ASSIGNMENTS]: (payload) => {},
  [topicConstants.MODIFY_SEED_ASSIGNMENTS]: (payload) => {},

  [topicConstants.ADD_DRAW_DEFINITION]: (payload) => {},
  [topicConstants.MODIFY_DRAW_DEFINITION]: (payload) => {},
  [topicConstants.DELETED_DRAW_IDS]: (payload) => {},

  [topicConstants.ADD_EVENT]: (payload) => {},
  [topicConstants.MODIFY_EVENT]: (payload) => {},
  [topicConstants.DELETE_EVENT]: (payload) => {},

  [topicConstants.MODIFY_EVENT_ENTRIES]: (payload) => {},
  [topicConstants.MODIFY_DRAW_ENTRIES]: (payload) => {},

  [topicConstants.MODIFY_TOURNAMENT_DETAIL]: (payload) => {},
  [topicConstants.ADD_SCALE_ITEMS]: (payload) => {},
  [topicConstants.DATA_ISSUE]: (payload) => {},

  // to notify of all mutations { methods, params }
  [topicConstants.MUTATIONS]: (payload) => {},
};
```

Subscriptions are defined once for all engines.

```js
import { globalState: { setSubcriptions } } from 'tods-competition-factory';

setSubscriptions(subscriptions);
```

## Completeness guarantee

The notice stream is a **complete, faithful change-log of the tournament record**: every mutation that changes the record dispatches at least one notice whose topic covers the changed entity. This makes it safe to keep an external cache, read-model, or reactive UI in sync from notices alone — a table driven by the notice deltas equals a direct re-query of the record.

This is a tested property. A conformance harness (`src/tests/mutations/notifications/noticeConformance`) runs each mutation, structurally diffs the record before/after, and asserts every changed entity is covered by an emitted notice — failing CI if a mutation ever goes silent. Recent topic additions extend that coverage to events and entries:

| Topic                                         | Fires when                                                                                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `ADD_EVENT` / `MODIFY_EVENT` / `DELETE_EVENT` | an event is added, its attributes change (name, dates, gender, category, `matchUpFormat`, `tieFormat`, flight profile), or it is deleted |
| `MODIFY_EVENT_ENTRIES`                        | an event's entries change — added, removed, status change, or re-ordered                                                                 |
| `MODIFY_DRAW_ENTRIES`                         | a draw's entries change                                                                                                                  |

These topics are additive; existing subscribers are unaffected.

## Typed event bus (`engine.on / once / off / waitFor`)

The forge namespace provides a multi-subscriber ergonomic surface on top of `setSubscriptions`. Handlers receive **one payload per call** (the bus iterates the underlying notice array for you), supports unsubscribe by returned closure, and a Promise-based `waitFor` for tests.

```ts
// multiple handlers per topic — both fire, each notice triggers one call per handler
const off1 = tournamentEngine.on('addMatchUps', (e) => relay.publish(e.matchUps));
const off2 = tournamentEngine.on('addMatchUps', (e) => log.info(`added ${e.matchUps.length} matchUps`));

// fire-once subscriptions
tournamentEngine.once('publishEvent', (e) => analytics.track('event_published', e.eventData));

// unsubscribe by returned closure …
off1();

// … or by handler reference, or by topic (omit handler to drop all)
tournamentEngine.off('addMatchUps', off2 as never); // by reference no longer needed
tournamentEngine.off('addMatchUps'); // clears any remaining

// promise-based, with optional predicate
const matchUp = await tournamentEngine.waitFor('modifyMatchUp', (p) => p.matchUp.matchUpId === targetId);
```

`TopicPayloadMap` (exported from the package as a type) precisely types the highest-traffic topics — `addEvent`, `addDrawDefinition`, `modifyDrawDefinition`, `deletedDrawIds`, `addMatchUps`, `modifyMatchUp`, `deletedMatchUpIds`, `addParticipants`, `modifyParticipants`, `deleteParticipants`, `publishEvent`, `modifyTournamentDetail`. Topics outside the map are still subscribable; their payload arrives as `unknown` and the caller narrows at the call site.

**Interop with `setSubscriptions`:** the bus claims the underlying single-callback slot on first `on()` for a topic. Don't mix the two APIs on the same topic — use one or the other.

See `src/forge/bus.ts` for the implementation and `src/forge/topicTypes.ts` for the payload map.
