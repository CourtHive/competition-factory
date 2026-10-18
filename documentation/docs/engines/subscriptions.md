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

  [topicConstants.PUBLISH_PARTICIPANTS]: (payload) => {},
  [topicConstants.UNPUBLISH_PARTICIPANTS]: (payload) => {},

  [topicConstants.PUBLISH_TOURNAMENT_INFO]: (payload) => {},
  [topicConstants.UNPUBLISH_TOURNAMENT_INFO]: (payload) => {},

  // fires when the tournament stops being published: no information, event draw, order of play or participant list
  // remains published — including when the last published draw or event is deleted
  [topicConstants.UNPUBLISH_TOURNAMENT]: (payload) => {},

  [topicConstants.ADD_VENUE]: (payload) => {},
  [topicConstants.MODIFY_VENUE]: (payload) => {},
  [topicConstants.DELETE_VENUE]: (payload) => {},

  [topicConstants.ADD_PARTICIPANTS]: (payload) => {},
  [topicConstants.MODIFY_PARTICIPANTS]: (payload) => {},
  [topicConstants.DELETE_PARTICIPANTS]: (payload) => {},

  [topicConstants.MODIFY_POSITION_ASSIGNMENTS]: (payload) => {},
  [topicConstants.MODIFY_SEED_ASSIGNMENTS]: (payload) => {},
  [topicConstants.MODIFY_SCHEDULING_PROFILE]: (payload) => {},

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
import { globalState } from 'tods-competition-factory';
const { setSubscriptions } = globalState;

setSubscriptions(subscriptions);
```

## Completeness guarantee

The **goal** is a complete, faithful change-log of the tournament record: every mutation that changes the record dispatches at least one notice whose topic covers the changed entity, so an external cache, read-model or reactive UI can be kept in sync from notices alone.

**It is not yet complete.** A conformance harness (`src/tests/mutations/notifications/noticeConformance`) runs a catalog of mutation scenarios, structurally diffs the record before and after, and fails CI when a changed entity is not covered by an emitted notice. That guarantee holds for the scenarios in the catalog. Measured over **every** engine call in the whole test suite (2026-10-15), some methods still change the record without a covering notice in some calls — among them parts of exit propagation in `setMatchUpStatus`, and court and venue changes. The draw, draft, ladder and competition-state writers announce what they change since 2026-10-18 (`MODIFY_DRAW_DEFINITION`, `MODIFY_POSITION_ASSIGNMENTS` for a ladder standing, `MODIFY_MATCHUP` for a challenge). Fixes are landing method by method. Until they are complete, a consumer that must not miss a change should re-read what it caches after a mutation that may not announce itself, or persist the whole record.

To measure it yourself, see [Measuring notice coverage](/docs/testing/testing-overview#measuring-notice-coverage).

Topics that extend the coverage to events and entries:

| Topic                                         | Fires when                                                                                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `ADD_EVENT` / `MODIFY_EVENT` / `DELETE_EVENT` | an event is added, its attributes change (name, dates, gender, category, `matchUpFormat`, `tieFormat`, flight profile), or it is deleted |
| `MODIFY_EVENT_ENTRIES`                        | an event's entries change — added, removed, status change, or re-ordered                                                                 |
| `MODIFY_DRAW_ENTRIES`                         | a draw's entries change                                                                                                                  |
| `MODIFY_SCHEDULING_PROFILE`                   | the scheduling plan (`scheduling.profile`) changes — previously a silent extension mutation                                              |

These topics are additive; existing subscribers are unaffected.

Notices describe the record **as stored**: `addEvent`'s `ADD_EVENT` carries the event with its generated `eventId` and
normalised values, and the draw notices it sends carry `tournamentId` and `eventId`. Grouping changes are announced
too: `scaledTeamAssignment` sends `MODIFY_PARTICIPANTS` for the teams it fills and `MODIFY_EVENT_ENTRIES` /
`MODIFY_DRAW_ENTRIES` for the entries it moves, and `removeEventEntries` sends `MODIFY_EVENT` when it changes a flight.

`MODIFY_EVENT` covers everything stored on the event itself, not only its named attributes: its extensions
(`addEventExtension`, `removeEventExtension`, `attachPolicies` / `removePolicy` on an event,
`modifyEventMatchUpFormatTiming`, `removeEventMatchUpFormatTiming`), its timeItems (`addEventTimeItem`, `addTimeItem`
naming an event, the event context of `setParticipantScaleItems`, the record `deleteDrawDefinitions` keeps of a
deletion), its `tieFormat` and `tieFormats` (`aggregateTieFormats` and the collection definition and collection group
writers at any scope, since a fork or a centralised tieFormat lives on the event), and its flight profile
(`addDrawEntries`, `removeDrawEntries`, `modifyEntriesStatus`, `modifyPairAssignment` and
`deleteFlightProfileAndFlightDraws` when they change a flight). Each is sent only when the event changed. Entries
are announced where they change: `addDrawEntries` (and `addEventEntries` / `addEventEntryPairs` with a `drawId`),
`promoteAlternate(s)`, `seedWithdrawalCascade`, `modifyPairAssignment` and `resetVoluntaryConsolationStructure`
send `MODIFY_DRAW_ENTRIES` and `MODIFY_EVENT_ENTRIES` for the lists they change. Seeding publication is event
publish state announced by its own topics, `PUBLISH_EVENT_SEEDING` and `UNPUBLISH_EVENT_SEEDING`.

## The MODIFY_MATCHUP envelope

`tournamentId`, `eventId`, `drawId` and `structureId` ride the notice **envelope**, alongside the `matchUp` itself:

```js
[topicConstants.MODIFY_MATCHUP]: (payload) => {
  payload.forEach(({ matchUp, tournamentId, eventId, drawId, structureId }) => {
    // route or evict without resolving the matchUp first
  });
};
```

A subscriber that only needs to know _which_ event or structure changed — cache eviction, fan-out routing, a read-model projection — should not have to hydrate the matchUp to find out.

`eventId` and `structureId` are populated best-effort rather than being required of every call site. A stored matchUp carries no `structureId` (only an inContext one does), so a notice emitted from a mutation that holds only a `drawDefinition` resolves it from the draw. Likewise a caller that supplies `event` rather than `eventId` still produces a populated `eventId`. Both are also populated for **propagated** matchUps — the downstream matchUps a result advances into — so a subscriber sees the same attribution on the matchUp a winner moves to as on the one that was scored.

Notices additionally carry a flattened sanctioning origin — `originOrganisationId`, `originTournamentId`, `originEventId`, `originDrawId` — absent in the ordinary single-sanction case. The most specific grain wins: an origin declared on the draw takes precedence over one declared on the event, so a flight that models a draw but no event still carries attribution.

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
