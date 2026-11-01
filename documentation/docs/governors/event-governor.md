---
title: Event Governor
---

:::warning Governor API transition at 8.0.0

Some methods on this page are candidates for removal from production engine exports at the 8.0.0 boundary. Their implementation references have moved: [`categoryCanContain`](/docs/implementation/records/categoryCanContain), [`getEligibleEvents`](/docs/implementation/records/getEligibleEvents), [`removeScaleValues`](/docs/implementation/records/removeScaleValues), [`validateCategory`](/docs/implementation/validation/validateCategory). Existing 7.x routes remain available; final decisions and external-integrator confirmations are tracked in the [transition index](/docs/implementation/engine-api-transition-8).

:::

```js
import { eventGovernor } from 'tods-competition-factory';
```

## addDrawDefinition

Adds a drawDefinition to an event in a tournamentRecord. Called after [generateDrawDefinition](/docs/governors/generation-governor#generatedrawdefinition). See examples: [Complete Example](../concepts/events/entries.mdx#complete-example), [Creating Draws from Flight Profiles](../concepts/events/flights.mdx#creating-draws-from-flight-profiles), [Complete Example](../concepts/events/flights.mdx#complete-example).

A `drawDefinition` built outside the factory may not carry the progression links between its matchUps (`winnerMatchUpId`, `loserMatchUpId`). They are derived from its structures and links and stored with the draw, as `generateDrawDefinition` would have stored them. A draw with a malformed round link is stored as it was.

```js
const { drawDefinition, error } = engine.generateDrawDefinition(drawDefinitionValues);
if (!error) {
  const result = engine.addDrawDefinition({
    modifyEventEntries, // event.entries[{entryStatus}] are modified to match draw.entries[{entryStatus}]
    existingDrawCount, // number of draws that exist in the event, used to check that two clients don't attempt to add simultaneously
    allowReplacement, // optional - defaults to false
    checkEntryStatus, // optional - defualts to false
    drawDefinition,
    eventId,
    flight, // optional - pass flight definition object for integrity check
  });
}
```

---

## addEvent

Add an event object to a tournamentRecord. See examples in [Creating Events](../concepts/events/events-overview.mdx#creating-events), [Age Validation Examples](../concepts/events/entries.mdx#age-validation-examples), [Complete Example](../concepts/events/flights.mdx#complete-example), [Using Categories in Events](../concepts/events/categories.mdx#using-categories-in-events), [newTournamentRecord](../engines/engine-methods.md#newtournamentrecord), and 1 more.

```js
engine.addEvent({
  event, // required — event object (eventId auto-generated if absent)
  suppressNotifications, // optional boolean — suppress event/matchUp notices
});
```

The `event` object may include:

- `eventId` — optional, auto-generated UUID if not provided
- `eventName` — display name
- `eventType` — defaults to `SINGLES_EVENT`; use `TEAM_EVENT` for team competitions
- `tieFormat` — required for TEAM events (validated), or use `tieFormatName` to select a preset
- `tieFormatName` — optional — selects a built-in tieFormat by name (e.g. `'COLLEGE_DEFAULT'`)
- `startDate`, `endDate` — optional, default to tournament dates
- `category`, `gender`, `matchUpFormat` — optional event metadata

:::note
When called via the public engine API (not `internalUse`), `event.entries` and `event.drawDefinitions` must be empty or absent — they are rejected with `INVALID_VALUES`. Use `addEventEntries` and `addDrawDefinition` separately.
:::

---

## addFlight

Adds one flight to the event's flight profile, numbered after the highest existing flight, without changing the other
flights or their draws.

A participant who is already in another flight, or in a draw (every draw counts as a flight), is still added, but the
result carries a warning: `{ code: PARTICIPANT_IN_OTHER_FLIGHT, info: { participantIds } }` (`flightConstants`). From
8.0.0 such a call is refused unless `force: true` is given.

```js
engine.addFlight({
  drawEntries, // optional
  drawName,
  eventId,
  drawId, // optional -- if scenario involves client and server side tournamentEngines, provide { drawId: UUID() }
  stage,
});
```

---

## assignSeedPositions

Assign **seedNumbers** to **participantIds** within a target draw structure.

- Provides the ability to assign seeding _after_ a structure has been generated
- To be used _before_ participants are positioned

**seedNumber** is unique while **seedValue** can be any string representation, e.g `"5-8"`

```js
engine.assignSeedPositions({
  assignments, // [{ seedNumber: 1, seedValue: '1', participantId: 'pid' }];
  structureId,
  eventId,
  drawId,

  stage, // opional; defaults to { stage: MAIN }
  stageSequence, // optional; defaults to { stageSequence: 1 }
  useExistingSeedLimits, // optional; restrict ability to assign seedNumbers beyond established limit
});
```

---

## attachFlightProfile

Attaches a `flightProfile` to the `event` specified by `eventId`. A `flightProfile` is first generated with `generateFlightProfile()`.

```js
engine.attachFlightProfile({ flightProfile, eventId });
```

---

## categoryCanContain

**8.0.0 engine-removal candidate.** This 7.x route remains available pending review. The full reference has moved to [`categoryCanContain`](/docs/implementation/records/categoryCanContain). Package-export status is a separate decision.

## deleteDrawDefinitions

Remove `drawDefinitions` from an `event`. An audit timeItem is added to the tournamentRecord whenever this method is called. If `autoPublish: true` (default behavior) then if a deleted draw was published then the `event` to which it belongs will be re-published. See examples: [Resolving Events from Draw IDs](../engines/engine-middleware.md#resolving-events-from-draw-ids).

```js
engine.deleteDrawDefinitions({
  autoPublish, // optional - defaults to true.
  eventDataParams, // optional - params to pass to `getEventData` for regeneration of remaining draws
  auditData, // object with attributes to be added to drawDeletions extension
  drawIds: [drawId],
  eventId,
  force, // boolean - override error when scores present
});
```

---

## deleteEvents

```js
engine.deleteEvents({ eventIds });
```

---

## deleteFlightAndFlightDraw

Removes flight from `event` flightProfile as well as associated `drawDefinition` (if generated). See examples: [Delete Individual Flight](../concepts/events/flights.mdx#delete-individual-flight).

```js
engine.deleteFlightAndFlightDraw({
  autoPublish, // optional - defaults to true.
  auditData, // object with attributes to be added to drawDeletions extension
  eventId,
  drawId,
  force, // boolean - override error when scores present
});
```

---

## deleteFlightProfileAndFlightDraws

Removes flightProfiles and all associated drawDefinitions from a specified event. See examples: [Delete Entire Flight Profile](../concepts/events/flights.mdx#delete-entire-flight-profile).

```js
engine.deleteFlightProfileAndFlightDraws({
  auditData, // object with attributes to be added to drawDeletions extension
  eventId,
  force, // boolean - override error when scores present
});
```

---

## getCategoryAgeDetails

Parses `ageCategoryCode` to determine min/max eligible birthdates and min/max age. Category age/birthdate boundaries can be specified using other attributes.
If attributes are combined will sanity check correspondence and return an array of any encountered errors.

```js
const {
  consideredDate, // returns either supplied value or date when invoked
  combinedAge, // boolean indicating that ageMax and ageMin are combined values
  ageMaxDate,
  ageMinDate,
  ageMax,
  ageMin,
  errors,
} = engine.getCategoryAgeDetails({
  consideredDate, // optional - date string 'YYYY-MM-DD'; defaults to current date
  category: {
    ageCategoryCode, // CODES code, e.g. 'U18', '18U', '18O', 'O18', '8O-U18', 'C50-70'
    categoryName, // when no ageCategoryCode is provided, an attempt is made to find in categoryName
    ageMaxDate, // latest/most recent date acceptable for eligibilty
    ageMinDate, // earliest date acceptable for eligibility
    ageMax, // maximum age acceptable for eligibility
    ageMin, // minimum age acceptable for eligibility
  },
});
```

---

## generateEventsFromTieFormat

Generates multiple events from a tieFormat definition, typically for team competitions.

```js
const { events } = engine.generateEventsFromTieFormat({
  tieFormat, // required - tieFormat with collectionDefinitions
  category, // optional
  gender, // optional
});
```

**Purpose:** Automatically create event structure for team competitions from tieFormat.

---

## getEligibleEvents

**8.0.0 engine-removal candidate.** This 7.x route remains available pending review. The full reference has moved to [`getEligibleEvents`](/docs/implementation/records/getEligibleEvents). Package-export status is a separate decision.

## getEvent

Returns a single event object with optional context and drawDefinition.

```js
const { event, drawDefinition } = engine.getEvent({
  eventId, // required
  drawId, // optional - also return specific drawDefinition
  context, // optional - additional properties to add
});
```

---

## getEventProperties

Returns specific properties from an event object.

```js
const properties = engine.getEventProperties({
  eventId, // required
  properties, // optional array of property names
});
```

---

## getEventStructures

Returns all structures across all draws in an event.

```js
const { structures } = engine.getEventStructures({ eventId });
```

---

## getEventTimeItem

Returns time items attached to an event.

```js
const { timeItem } = engine.getEventTimeItem({
  eventId, // required
  itemType, // required - time item type
});
```

---

## getEvents

Returns all events from the tournament.

```js
const { events } = engine.getEvents({ context });
```

---

## getFlightProfile

Returns the event's flight profile (`event.flightProfile`, or the legacy extension), as a copy whose flights carry any draw already generated from them. See [getFlightProfile](/docs/governors/query-governor#getflightprofile) for the shape.

```js
const { flightProfile } = engine.getFlightProfile({ eventId });
```

**Purpose:** Access flight configuration for events split into multiple draws.

---

## getParticipantEligibility

Whether a participant may enter an event — **asked, rather than attempted**.

```js
const { eligible, indeterminate, rejectionReasons, undeterminedRestrictions } = engine.getParticipantEligibility({
  participant,
  event,
  tournamentRecord, // optional
});
```

The predicate itself is not new — `validateParticipantCategory` has evaluated age at both event ends, handled exact-DOB and calendar-year conventions, and expanded `ageCategoryCode` since it was written. It was reachable only through `addEventEntries`, so the one way to learn whether someone could enter was to try to enter them. A discovery surface evaluating one person against thousands of events cannot use a mutation.

Read-only: emits no notices and mutates nothing.

**`indeterminate` is not `eligible: false`.** The first says a rule could not be evaluated (an unknown `birthDate`, an unrecorded rating); the second says a rule was **breached**. Indeterminate applies only when nothing was actually breached — a participant both over the age limit and missing a rating is ineligible, full stop.

:::note

This does **not** change who gets entered. `addEventEntries` keeps its behaviour exactly: a participant whose `birthDate` is unknown is still filtered out of the entry list there, while here the same participant reports `indeterminate`. "We cannot tell" is correctly a refusal when writing an entry and correctly not a refusal when answering a question.

:::

`undeterminedRestrictions` carries `entryRestrictions` the record cannot settle — residency, membership, clearance — so a consumer can say "this event is closed to your section, check with the organiser" instead of a flat no or a misleading yes. See [Entry Eligibility](../concepts/events/entry-eligibility.md).

---

## getScaledEntries

Returns event entries with their scale values (rankings, ratings).

```js
const { scaledEntries } = engine.getScaledEntries({
  eventId, // required
  scaleAttributes, // optional
  stage, // optional
});
```

---

## modifyEvent

```js
event.modifyEvent({
  eventUpdates: {
    eventGender, // optional - must validate against current event entries, if any
    eventType, // optional - must validate against current event entries, if any
    eventName, // optional
    startDate, // optional - must fall within tournament dates
    category, // optional - must validate against current event entries, if any
    endDate, // optional - must fall within tournament dates
  },
  eventId,
});
```

---

## modifyEventMatchUpFormatTiming

```js
engine.modifyEventMatchUpFormatTiming({
  recoveryMinutes,
  averageMinutes,
  matchUpFormat,
  eventId,
});
```

---

## modifyPairAssignment

Modifies an individualParticipantId within a PAIR particiapnt entered into an event or draw. Will clean up (delete) any PAIR participants that are not entered into any other draws or events.

```js
engine.modifyPairAssignment({
  replacementIndividualParticipantId,
  existingIndividualParticipantId,
  participantId,
  eventId, // optional if drawId is provided
  drawId, // optional if eventId is provided; scopes change to specified draw
  uuids, // optional array of uuids for use when generating new participant
});
```

---

## modifyTieFormat

Both modifies the `tieFormat` on the target `event`, `drawDefinition`, `structure` or `matchUp` and adds/deletes `tieMatchUps` as necessary.

```js
engine.modifyTieFormat({
  considerations, // optional { collectionName?: boolean; collectionOrder?: boolean };
  modifiedTieFormat, // will be compared to existing tieFormat that is targeted and differences calculated
  structureId, // required if modifying tieFormat for a structure
  matchUpId, // required if modifying tieFormat for a matchUp
  eventId, // required if modifying tieFormat for a event
  drawId, // required if modifying tieFormat for a drawDefinition or a structure
});
```

---

## promoteAlternates

Promotes alternates to direct acceptance in the order given, each placed after the accepted entries. See
[entries governor: promoteAlternates](/docs/governors/entries-governor#promotealternates) for positions, draws and flights.

```js
engine.promoteAlternates({
  participantIds, // in order of acceptance
  // either drawId or eventId are REQUIRED
  eventId, // optional if drawId provided
  drawId, // optional if eventId provided
});
```

---

## refreshEventDrawOrder

Renumbers the event's display order (`drawOrder`) to 1..n without gaps, for example after a draw or a flight has been
deleted. Flights come first, each placed by its draw's `drawOrder`, else its own `drawOrder`, else its `flightNumber`;
draws that have no flight follow, by `drawOrder`. A flight's `flightNumber` is never changed.

```js
engine.refreshEventDrawOrder({ eventId });
```

---

## removeEventEntries

Removes `event.entries` with integrity checks.

Filters `participantIds` by specified `entryStatuses` and/or `stage`. If no `participantIds` are provided, removes all `entries` that match both `entryStatuses` and `stage`.

```js
engine.removeEventEntries({
  autoEntryPositions, // optional - keeps entries ordered by entryStage/entryStatus and auto-increments
  participantIds, // optional array of participantIds to remove
  entryStatuses, // optional array of entryStatuses to remove
  stage, // optional - remove entries for specified stage
  eventId,
});
```

---

## removeEventMatchUpFormatTiming

```js
engine.removeEventMatchUpFormatTiming({ eventId });
```

---

## removeScaleValues

**8.0.0 engine-removal candidate.** This 7.x route remains available pending review. The full reference has moved to [`removeScaleValues`](/docs/implementation/records/removeScaleValues). Package-export status is a separate decision.

## removeSeeding

```js
engine.removeSeeding({
  entryStatuses, // optional array of entryStatues to consider
  scaleName, // optional - override default scaleName, event.category.categoryName || event.category.ageCategoryCode
  drawId, // optional - to scope participants to entries in a specific draw
  stage, // optinal - scope participants to entries in a specific stage of draw
  eventId,
});
```

---

## setEventDates

Where startDate and/or endDate are strings 'YYYY-MM-DD'. Can be used to set `startDate` and `endDate` independently.

```js
engine.setEventDates({
  activeDates, // optional array of dates from startDate to endDate
  weekdays, // optional array of [MON, TUE, ...] // use { weekDayConstants }
  startDate, // optional
  endDate, // optional
  eventId, // required
});
```

---

## setEventEndDate

Sets only the end date for an event. Part of the setEventDates family of methods.

```js
engine.setEventEndDate({
  eventId, // required
  endDate, // required - 'YYYY-MM-DD'
});
```

**Purpose:** Update event end date independently of start date.

---

## setEventStartDate

Sets only the start date for an event. Part of the setEventDates family of methods.

```js
engine.setEventStartDate({
  eventId, // required
  startDate, // required - 'YYYY-MM-DD'
});
```

**Purpose:** Update event start date independently of end date.

---

## setEventDisplay

Defines publish status for attributes of `participants` and `matchUp` schedules which are returned by [getEventData](/docs/governors/query-governor#geteventdata) and [competitionScheduleMatchUps](/docs/governors/query-governor#competitionschedulematchups).

```js
const displaySettings = {
  draws: {
    default: {
      participantAttributes: { [key]: boolean },
      // an array of attribute settings to be applied to specified dates
      scheduleDetails: [
        {
          attributes: { scheduledTime: false },
          dates: [], // empty array or undefined specifies that attribute setting apply to all scheduledDates
        },
      ],
    },
    [drawId]: {},
  },
};

engine.setEventDisplay({
  displaySettings,
  eventId,
});
```

---

## updateDrawIdsOrder

Updates the display order of the event's draws: the `drawOrder` of each `drawDefinition`, and the `drawOrder` of each
flight in the event's `flightProfile`, including flights whose draw has not been generated.

A flight's `flightNumber` is not changed. It is the flight's level, fixed when the flight is made, and ranking points
are awarded by it (the `flights` values of an award profile), so reordering draws for display never changes the
points a flight earns.

```js
engine.updateDrawIdsOrder({
  eventId,
  orderedDrawIdsMap: {
    'id-Of-draw-1': 1,
    'id-of-draw-2': 2,
  },
});
```

---

## validateCategory

**8.0.0 engine-removal candidate.** This 7.x route remains available pending review. The full reference has moved to [`validateCategory`](/docs/implementation/validation/validateCategory). Package-export status is a separate decision.

## getEventData

Returns comprehensive event data including all draws, participants, and matchUps, formatted for public display. This method is documented in full on the Publishing Governor page.

See [Publishing Governor](/docs/governors/publishing-governor#geteventdata) for full documentation.

```js
const { eventData, participants } = engine.getEventData({
  eventId, // required
  usePublishState, // optional boolean
});
```

---

## addEventExtension

Adds an extension to an event. Extensions are custom metadata objects attached to tournament elements.

```js
engine.addEventExtension({
  extension, // required — { name, value } extension object
  eventId, // resolved via engine context
  creationTime, // optional boolean — stamp creation time on extension
});
```
