---
title: Tournament Governor
---

```js
import { tournamentGovernor } from 'tods-competition-factory';
```

## addExtension

Adds an extension to a specified element in the tournament record. See examples: [Follow By Implementation](../concepts/pro-scheduling.md#follow-by-implementation), [4. Manual Override](../concepts/scheduling-conflicts.mdx#4-manual-override).

```js
engine.addExtension({
  extension, // required - extension object
  tournamentId, // optional - target tournament
  participantId, // optional - target participant
  eventId, // optional - target event
  drawId, // optional - target draw
  structureId, // optional - target structure
  matchUpId, // optional - target matchUp
});
```

**Purpose:** Attach custom metadata to tournament elements.

---

## addMutationLock

Acquires a [mutation lock](../concepts/mutation-locks) on a tournament element. Automatically enables the mutation locks feature gate on the tournament record.

```js
const { success, lockId } = engine.addMutationLock({
  scope, // required - lock scope (e.g. 'SCHEDULING', 'SCORING', 'DRAWS')
  lockToken, // required - opaque string token
  expiresAt, // optional - ISO 8601 UTC string or null for permanent (default: null)
  methods, // optional - string[] to restrict to specific methods within scope
  drawId, // optional - lock on specific draw
  eventId, // optional - lock on specific event
  venueId, // optional - lock on specific venue
});
```

**Purpose:** Control concurrent access to scoped mutations. See [Mutation Locks](../concepts/mutation-locks) for details.

---

## addNotes

Adds notes to a tournament record or specific element.

```js
engine.addNotes({
  notes, // required - string or notes object
  tournamentId, // optional - target tournament
  participantId, // optional - target participant
  eventId, // optional - target event
  drawId, // optional - target draw
});
```

**Purpose:** Add textual notes/comments to tournament entities.

---

## addOnlineResource

Attach an online resource to specified element. When no other ids are provided, will attach to `tournamentRecord`.

```js
engine.addOnlineResource({
  onlineResource, // required { identifier, resourceType, resourceSubType, ... }
  organisationId, // optional
  participantId, // optional
  personId, // optional
  courtId, // optional
  venueId, // optional
  eventId, // optional
  drawId, // optional
});
```

---

## analyzeDraws

Analyzes all draws in a tournament to provide structural insights.

```js
const { analysis } = engine.analyzeDraws();
```

**Returns:** Analysis of draw structures, including sizes, stages, and completeness.

---

## analyzeTournament

Provides comprehensive analysis of tournament structure and data.

```js
const { analysis } = engine.analyzeTournament();
```

**Returns:** Tournament-level metrics including events, participants, draws, and matchUps.

---

## copyTournamentRecord

Creates a deep copy of a tournament record.

```js
const { tournamentRecord } = engine.copyTournamentRecord({
  tournamentId, // optional - specific tournament
});
```

**Purpose:** Clone tournament data for modifications or comparisons.

---

## cleanExpiredMutationLocks

Proactively removes expired [mutation locks](../concepts/mutation-locks) from all elements in the tournament.

```js
const { success, removedCount } = engine.cleanExpiredMutationLocks();
```

**Purpose:** Housekeeping for time-limited locks. Expired locks are also cleaned lazily when encountered during lock checks.

---

## createTournamentRecord

Creates a new tournament record.

```js
const { tournamentRecord } = engine.createTournamentRecord({
  tournamentName, // optional
  startDate, // optional - 'YYYY-MM-DD'
  endDate, // optional - 'YYYY-MM-DD'
  activeDates, // optional - string[] of 'YYYY-MM-DD' dates within start/end range when play occurs
  localTimeZone, // optional - IANA timezone identifier (e.g. 'America/New_York')
  tournamentId, // optional - provide specific ID
  extensions, // optional - array of extensions (validated)
});
```

**Purpose:** Initialize a new tournament.

When `activeDates` is provided, each date is validated as a proper date string and all `activeDates` must fall within the `startDate`/`endDate` range — otherwise an `INVALID_DATE` error is returned. If `startDate` or `endDate` are not provided, they are automatically derived from the earliest and latest `activeDates` respectively, ensuring the tournament record always has valid date boundaries. Falsy values in the array are automatically filtered out. See [Date and Time Handling](../concepts/date-time-handling.md) for more on `activeDates`.

---

## getAggregateTeamResults

Returns aggregated results for team competitions across multiple tournaments.

```js
const { results } = engine.getAggregateTeamResults({
  tournamentRecords, // required - array of tournament records
});
```

**Purpose:** Compile team standings across competitions.

---

## getAllowedDrawTypes

Returns allowed draw types for a specific event based on configuration.

```js
const { drawTypes } = engine.getAllowedDrawTypes({
  eventId, // required
});
```

**Purpose:** Get valid draw types for event creation.

---

## getAllowedMatchUpFormats

Returns allowed matchUp formats based on event type and configuration.

```js
const { matchUpFormats } = engine.getAllowedMatchUpFormats({
  eventType, // optional
});
```

**Purpose:** Get valid format options for events.

---

## getAppliedPolicies

Returns all policies currently applied to the tournament.

```js
const { policies } = engine.getAppliedPolicies();
```

**Purpose:** Query active tournament policies.

---

## getCompetitionDateRange

Returns the date range spanning all tournaments in a competition.

```js
const { startDate, endDate } = engine.getCompetitionDateRange({
  tournamentRecords, // required - array of tournament records
});
```

**Purpose:** Get overall competition dates.

---

## getCompetitionPenalties

Returns all penalties across multiple tournaments in a competition.

```js
const { penalties } = engine.getCompetitionPenalties({
  tournamentRecords, // required - array of tournament records
});
```

**Purpose:** Aggregate penalties across competition.

---

## getMutationLocks

Returns all active (non-expired) [mutation locks](../concepts/mutation-locks) across the entire tournament, including locks on events, draws, and venues.

```js
const { mutationLocks } = engine.getMutationLocks({
  scope, // optional - filter by scope
});
```

**Returns:** Array of lock objects, each with `lockId`, `lockToken`, `scope`, `expiresAt`, `createdAt`, and optional `drawId`, `eventId`, `venueId` identifying where the lock is stored.

---

## getPolicyDefinitions

Returns attached policy definitions.

```js
const { policyDefinitions } = engine.getPolicyDefinitions();
```

**Purpose:** Get tournament policy configurations.

---

## getTournamentInfo

Returns basic tournament information.

```js
const { tournamentInfo } = engine.getTournamentInfo();
```

**Returns:** Tournament name, dates, location, and other metadata.

If a [primary venue](../concepts/venues-courts.md#primary-venue) is designated and has at least one address, `tournamentInfo.tournamentAddress` will contain that venue's first address. This is always included regardless of the `withVenueData` option.

---

## getTournamentPenalties

Returns all penalties issued in the tournament.

```js
const { penalties } = engine.getTournamentPenalties();
```

**Purpose:** Query tournament penalties.

---

## getTournamentPersons

Returns all persons (not just participants) associated with tournament.

```js
const { persons } = engine.getTournamentPersons();
```

**Purpose:** Get all individuals including officials, staff, etc.

---

## getTournamentPoints

Returns points/prize money configuration for tournament.

```js
const { points } = engine.getTournamentPoints();
```

**Purpose:** Get tournament points structure.

---

## getTournamentStructures

Returns all structures across all draws in tournament.

```js
const { structures } = engine.getTournamentStructures();
```

**Purpose:** Get all draw structures tournament-wide.

---

## getTournamentTimeItem

Returns time items attached to tournament.

```js
const { timeItem } = engine.getTournamentTimeItem({
  itemType, // required - time item type
});
```

**Purpose:** Query time-based tournament metadata.

---

## hydrateTournamentRecord

Currently only accepts the directive `hydrateRoundNames: true`. Use of `eventProfiles` is optional and allows granularity in application of round naming policy at the event level. If `eventProfiles` is used the top level `directives` and `policyDefinitions` are not necessary.

```js
engine.hydrateTournamentRecord({
  policyDefinitions: POLICY_ROUND_NAMING_DEFAULT,
  directives: { hydrateRoundNames: true },
  eventProfiles: [{
    directives: { hydrateRoundNames: true },
    policyDefinitions: {},
    eventId: 'eventId',
  }]
})
```

---

## orderCollectionDefinitions

Modify the array order of `tieFormat.collectionDefinitions` for an `event`, a `drawDefinition`, `structure`, or `matchUp`.

```js
engine.orderCollectionDefinitions({
  orderMap: { collectionId1: 1, collectionId2: 2 },
  structureId, // required if modifying tieFormat for a structure
  matchUpId, // required if modifying tieFormat for a matchUp
  eventId, // required if modifying tieFormat for a event
  drawId, // required if modifying tieFormat for a drawDefinition or a structure
});
```

---

## removeExtension

Removes an extension from a specified element in the tournament record.

```js
engine.removeExtension({
  name,               // required - extension name
  tournamentId,       // optional - target tournament
  participantId,      // optional - target participant
  eventId,            // optional - target event
  drawId,             // optional - target draw
  structureId,        // optional - target structure
  matchUpId,          // optional - target matchUp
});
```

**Purpose:** Remove custom metadata from tournament elements.

---

## removeMutationLock

Releases a [mutation lock](../concepts/mutation-locks). Requires the matching `lockToken` unless `forceRelease: true`.

```js
const { success } = engine.removeMutationLock({
  lockId, // optional - identify lock by ID
  scope, // optional - identify lock by scope (alternative to lockId)
  lockToken, // required unless forceRelease
  forceRelease, // optional - bypass token check (admin override)
  drawId, // optional - target element
  eventId, // optional - target element
  venueId, // optional - target element
});
```

**Purpose:** Release a mutation lock to restore normal access.

---

## removeOnlineResource

Remove an online resource from specified element. When no other ids are provided, will remove from `tournamentRecord`.

```js
engine.removeOnlineResource({
  onlineResource, // only requires { identifier, resourceType, resourceSubType }
  organisationId, // optional
  participantId, // optional
  personId, // optional
  courtId, // optional
  venueId, // optional
  eventId, // optional
  drawId, // optional
});
```

---

## setTournamentCategories

Define categories to be used in `event` creation for tournament record.

```js
const categories = [
  {
    type: eventConstants.AGE,
    categoryName: 'U18',
  },
  {
    type: eventConstants.AGE,
    categoryName: 'U16',
  },
  {
    type: eventConstants.RATING,
    categoryName: 'WTN',
  },
];
engine.setTournamentCategories({ categories });
```

---

## setTournamentName

```js
const tournamentName = 'CourtHive Challenge';
engine.setTournamentName({
  tournamentName,
});
```

---

## setTournamentNotes

```js
engine.setTournamentNotes({ notes });
```

---

## setTournamentStatus

```js
engine.setTournamentStatus({ status: CANCELLED });
```

---

## setTournamentDates

Sets the start date, end date, active dates, and/or weekdays for a tournament. Validates that dates are proper `'YYYY-MM-DD'` strings and that `activeDates` fall within the start/end range. If the date range shrinks, matchUps scheduled outside the new range are automatically unscheduled. Event dates are coerced to fit within the new tournament dates.

```js
const {
  unscheduledMatchUpIds, // matchUpIds that were unscheduled due to date range change
  datesRemoved,          // dates no longer in the tournament range
  datesAdded,            // dates newly in the tournament range
} = engine.setTournamentDates({
  startDate,    // optional — 'YYYY-MM-DD'
  endDate,      // optional — 'YYYY-MM-DD'
  activeDates,  // optional — string[] of 'YYYY-MM-DD' dates within start/end range
  weekdays,     // optional — array of weekday constants [MON, TUE, ...]
});
```

---

## addTournamentTimeItem

Adds a timeItem to the tournament record. TimeItems are used to store time-based metadata such as rankings, ratings, publish state, and scheduling data.

```js
engine.addTournamentTimeItem({
  timeItem,               // required — { itemType, itemValue, ... } time item object
  removePriorValues,      // optional boolean — remove prior timeItems of the same itemType
  duplicateValues,        // optional boolean — allow duplicate values
});
```

---

## getTournament

Returns the current tournament record from the engine state. This is an alias for accessing the tournament record via `getState()` / `getTournamentRecord()`.

```js
const { tournamentRecord } = engine.getTournament();
```

---

## newTournamentRecord

Creates and sets a new tournament record on the engine. This is an alias/convenience wrapper around [createTournamentRecord](#createtournamentrecord) that also loads the record into the engine state.

See [createTournamentRecord](#createtournamentrecord) for the full parameter signature.

```js
engine.newTournamentRecord({
  tournamentName, // optional
  startDate,      // optional — 'YYYY-MM-DD'
  endDate,        // optional — 'YYYY-MM-DD'
  tournamentId,   // optional — provide specific ID
});
```

---
