---
title: Tournament Governor
---

:::warning Governor API transition at 8.0.0

Some methods on this page are candidates for removal from production engine exports at the 8.0.0 boundary. Their implementation references have moved: [`addNotes`](/docs/implementation/records/addNotes), [`getAllowedDrawTypes`](/docs/implementation/records/getAllowedDrawTypes), [`getTournamentTimeItem`](/docs/implementation/scheduling/getTournamentTimeItem). Existing 7.x routes remain available; final decisions and external-integrator confirmations are tracked in the [transition index](/docs/implementation/engine-api-transition-8).

:::

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

When the `element` passed is one stored in a loaded record, the change is announced on its topic: the tournament
record itself as `MODIFY_TOURNAMENT_DETAIL` with its `extensions`, an event as `MODIFY_EVENT`, a drawDefinition as
`MODIFY_DRAW_DEFINITION`, a structure as `MODIFY_DRAW_DEFINITION` naming it, a matchUp (a TEAM matchUp's tieMatchUps
included) as `MODIFY_MATCHUP`, a venue as `MODIFY_VENUE`, a participant as `MODIFY_PARTICIPANTS`. A copy (what `getEvent` or
`getParticipants` returns) is not in the record, so writing to it announces nothing; nor does a write that leaves the
element's extensions as they were.

---

## addMutationLock

Acquires a [mutation lock](../concepts/mutation-locks.md) on a tournament element. Automatically enables the mutation locks feature gate on the tournament record.

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

**Purpose:** Control concurrent access to scoped mutations. See [Mutation Locks](../concepts/mutation-locks.md) for details.

The lock is stored as an extension on the element it locks, and the change is announced on that element's topic
(`modifyDrawDefinition`, `modifyEvent`, `modifyVenue`). A tournament-level lock, and the feature gate on the tournament
record, are root extensions: their change is announced as `modifyTournamentDetail` with the record's `extensions`, as
`addTournamentExtension` and `removeTournamentExtension` announce theirs.

---

## addNotes

**8.0.0 engine-removal candidate.** This 7.x route remains available pending review. The full reference has moved to [`addNotes`](/docs/implementation/records/addNotes). Package-export status is a separate decision.

## addOnlineResource

Attach an online resource to specified element. When no other ids are provided, will attach to `tournamentRecord`.

```js
engine.addOnlineResource({
  onlineResource, // required { identifier, resourceType, resourceSubType, ... }
  organisationId, // optional
  participantId, // optional
  personId, // optional
  matchUpId, // optional - with drawId
  courtId, // optional
  venueId, // optional
  eventId, // optional
  drawId, // optional
});
```

A matchUp's recording, stream or stats page belongs on the matchUp: pass `matchUpId` with the `drawId` that
contains it (tieMatchUps included). The resource is merged as on every other element (one with the same `name`
or `identifier` is replaced), and a `modifyMatchUp` notice is emitted so subscribers refresh. Public projections
(`getEventData`, published or not) carry it on the matchUp.

Every other element announces the change on its own topic, and only when its resources changed (re-adding a
resource it already holds, or removing one it does not hold, announces nothing): a participant or person
`modifyParticipants`, a venue or court `modifyVenue`, the parent organisation or the tournament itself
`modifyTournamentDetail`. `removeOnlineResource` does the same.

```js
engine.addOnlineResource({
  onlineResource: {
    identifier: 'https://…/recording/rec-1',
    resourceType: 'URL',
    resourceSubType: 'VIDEO',
    name: 'matchVideo',
    provider: 'MatchTennisApp',
  },
  matchUpId,
  drawId,
});
```

---

## analyzeDraws

Analyzes all draws in a tournament to provide structural insights.

```js
const { analysis } = engine.analyzeDraws();
```

**Returns:** Analysis of draw structures, including sizes, stages, and completeness. A round robin draw is
never listed in `canBePruned` (7.7.0).

---

## analyzeTournament

Provides comprehensive analysis of tournament structure and data.

```js
const { analysis } = engine.analyzeTournament();
```

**Returns:** Tournament-level metrics including events, participants, draws, and matchUps.

### `extensionAnomalies`

From **6.32.0**, the analysis reports extensions that no reader will ever see.

An extension after the first of a given `name` is **unreachable** — every reader
resolves with `.find()` — so the attached policy, timing override or flag simply never
takes effect, with no error and no signal.

```js
const { analysis } = engine.analyzeTournament();
analysis.extensionAnomalies;
// [{ element: 'venue', elementId: 'venue-1', name: 'scheduleTiming', count: 3 }]
```

Present **only when there is something to report**, matching how
`missingParticipantIds` behaves — so its absence is the ordinary case, not a
failure to look.

Records built through the factory cannot reach this state: `addExtension` maintains
one-per-name (it replaces in place and pushes only when absent) and `attachPolicies`
guards again per `policyType`. The invariant is upheld by the writer rather than
validated on the way in, which is precisely why records assembled **outside** the API
— hand-built fixtures, importers, `classic-converter`, legacy storage — can carry
duplicates that vanish silently. This reports them rather than throwing: the condition
is rare and always upstream of the factory.

`analyzeDraws` reports the same anomalies for draw-level extensions.

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

Proactively removes expired [mutation locks](../concepts/mutation-locks.md) from all elements in the tournament.

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

**8.0.0 engine-removal candidate.** This 7.x route remains available pending review. The full reference has moved to [`getAllowedDrawTypes`](/docs/implementation/records/getAllowedDrawTypes). Package-export status is a separate decision.

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

Returns all penalties across multiple tournaments in a competition. `penaltyType` is returned as its code: a record written before 7.x stored penalty codes may still hold a display label (`'Ball Abuse'`) until it is run through [migrateTournamentRecord](/docs/engines/migrate-tournament-record) or the penalty is modified, and the query returns that label's code without changing the record. A value outside the legacy labels is returned as stored.

```js
const { penalties } = engine.getCompetitionPenalties({
  tournamentRecords, // required - array of tournament records
});
```

**Purpose:** Aggregate penalties across competition.

---

## getMutationLocks

Returns all active (non-expired) [mutation locks](../concepts/mutation-locks.md) across the entire tournament, including locks on events, draws, and venues.

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

`tournamentInfo.eventInfo` returns a lightweight summary of each event. Each entry includes an `entriesCount` (the length of `event.entries`) alongside `drawDefinitionCount` and the other event metadata, so calendar admin dashboards can render entry totals without loading the full tournament record. Pass `usePublishState: true` to limit `eventInfo` to events listed in the tournament's published event IDs.

---

## getTournamentTimeZone

Resolves the authoritative IANA time zone for a tournament.

```js
const { timeZone, inferred, error } = engine.getTournamentTimeZone();
```

**Resolution order:**

1. `tournamentRecord.localTimeZone` when set — validated as a real IANA zone (`INVALID_TIME_ZONE` if not).
2. Otherwise inferred from venue addresses — a venue is the physical location, so a single distinct `address.timeZone` across all venues is used and returned with `inferred: true`.

Returns `CONFLICTING_TIME_ZONES` when venues specify different zones and no tournament-level `localTimeZone` is set (the rare border-city case). Venue addresses that name no zone, or an invalid one, are ignored. Returns `{}` (no `timeZone`, no `error`) when no zone can be determined.

Only that last case admits a fallback. The factory's own reads, such as "today" for eligibility, use the UTC day there. A host that prefers its own zone may substitute it in that case only. An error is never replaced by a fallback zone. Zone resolution is separate from the choice of clock; see [Clocks and Competition Time](/docs/concepts/competition-clock#time-zones).

---

## getTournamentPenalties

Returns all penalties issued in the tournament. `penaltyType` is returned as its code: a record written before 7.x stored penalty codes may still hold a display label (`'Ball Abuse'`) until it is run through [migrateTournamentRecord](/docs/engines/migrate-tournament-record) or the penalty is modified, and the query returns that label's code without changing the record. A value outside the legacy labels is returned as stored.

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

**8.0.0 engine-removal candidate.** This 7.x route remains available pending review. The full reference has moved to [`getTournamentTimeItem`](/docs/implementation/scheduling/getTournamentTimeItem). Package-export status is a separate decision.

## hydrateTournamentRecord

Currently only accepts the directive `hydrateRoundNames: true`. Use of `eventProfiles` is optional and allows granularity in application of round naming policy at the event level. If `eventProfiles` is used the top level `directives` and `policyDefinitions` are not necessary.

```js
engine.hydrateTournamentRecord({
  policyDefinitions: POLICY_ROUND_NAMING_DEFAULT,
  directives: { hydrateRoundNames: true },
  eventProfiles: [
    {
      directives: { hydrateRoundNames: true },
      policyDefinitions: {},
      eventId: 'eventId',
    },
  ],
});
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
  name, // required - extension name
  tournamentId, // optional - target tournament
  participantId, // optional - target participant
  eventId, // optional - target event
  drawId, // optional - target draw
  structureId, // optional - target structure
  matchUpId, // optional - target matchUp
});
```

**Purpose:** Remove custom metadata from tournament elements.

Announced as `addExtension` is; with `discover: true` each record whose root extensions changed is announced as
`MODIFY_TOURNAMENT_DETAIL`. Removing a name the element does not carry sends nothing.

---

## removeMutationLock

Releases a [mutation lock](../concepts/mutation-locks.md). Requires the matching `lockToken` unless `forceRelease: true`.

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
  matchUpId, // optional - with drawId; emits modifyMatchUp
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

Announced as `MODIFY_TOURNAMENT_DETAIL` with `tournamentStatus`; setting the status the record already has sends nothing.

---

## setTournamentDates

Sets the start date, end date, active dates, and/or weekdays for a tournament. Validates that dates are proper `'YYYY-MM-DD'` strings and that `activeDates` fall within the start/end range. Every refusal comes before the first write.

```js
const {
  unscheduledMatchUpIds, // matchUpIds unscheduled by a force: true date change
  eventDateChanges, // events whose dates changed: { eventId, reason, previousStartDate, previousEndDate, startDate, endDate }[]
  activeDateChanges, // active dates pruned: { eventId?, previousActiveDates, prunedActiveDates, activeDates? }[]
  trimmedSchedulingProfile, // what left the scheduling profile, in profile shape: { scheduleDate, venues }[]
  datesRemoved, // dates no longer in the tournament range
  datesAdded, // dates newly in the tournament range
} = engine.setTournamentDates({
  startDate, // optional — 'YYYY-MM-DD'
  endDate, // optional — 'YYYY-MM-DD'
  activeDates, // optional — string[] of 'YYYY-MM-DD' dates within start/end range
  weekdays, // optional — array of weekday constants [MON, TUE, ...]
  force, // optional boolean — unschedule non-completed matchUps that fall outside the new range
});
```

### Scheduling outside the new range

When the range shrinks so that scheduled matchUps fall outside the new start/end dates, the mutation does **not** silently discard their placement. Behavior depends on whether those matchUps have been played:

- **Non-completed matchUps** — rejected by default with `MATCHUPS_SCHEDULED_OUTSIDE_DATES`. The rejection carries `outOfRangeMatchUpIds` and `outOfRangeDates`. Pass `force: true` to proceed and unschedule them; the returned `unscheduledMatchUpIds` lists what was cleared.
- **Completed matchUps** — rejected with `MATCHUPS_COMPLETED_OUTSIDE_DATES` and this block **cannot** be overridden by `force`. A match played on a given date forces that date into the tournament range; unscheduling it would erase the record of when it was played. The rejection carries `completedOutOfRangeMatchUpIds` and `completedOutOfRangeDates`. To proceed, either widen the range to include those dates or reschedule/clear the completed matchUps' results first.

When both kinds are present, the completed block takes precedence (there is no partial date change).

### Event dates follow the tournament

No event range is left outside the new tournament range. Each event with dates of its own is reconciled, and
`setTournamentStartDate` / `setTournamentEndDate` behave the same way (they call `setTournamentDates`):

| Event range before the change                                        | Result                                                                                            | `reason`  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------- |
| equal to the previous tournament range (the default from `addEvent`) | takes the new tournament range: extending, shrinking or shifting the tournament carries the event | `TRACKED` |
| narrower, and overlapping the new range                              | keeps its own range, cut to the part inside the new range (unchanged when it is already inside)   | `CLAMPED` |
| narrower, and entirely outside the new range                         | reset to the new tournament range, both dates                                                     | `RESET`   |

An event with no `startDate` or `endDate` is left alone; it already uses the tournament range. Every event whose dates
change is announced with `MODIFY_EVENT` and listed in `eventDateChanges` (absent when no event changed). The reset
rule means a director who shifts a tournament past an event's own days gets an event that plays on every tournament
day, and `eventDateChanges` says so; the alternative, collapsing the range to one edge day, would invent a
playing day nobody chose.

A record whose event range already lies outside the tournament range (written before this rule, or edited outside the
engine) is reported by `getTournamentInconsistencies` as `EVENT_DATES_OUTSIDE_TOURNAMENT` and is reconciled by the
next `setTournamentDates`.

### Active dates follow the ranges

When `startDate` or `endDate` is given, active dates outside the new ranges are pruned: the tournament's `activeDates`
against the new tournament range, and each event's `activeDates` against that event's range after the reconciliation
above (the tournament range for an event with no dates of its own). Each change is listed in `activeDateChanges`
(absent when nothing was pruned); an entry without `eventId` is the tournament's own list. Every event whose list
changes is announced with `MODIFY_EVENT`; the tournament's change is carried by `MODIFY_TOURNAMENT_DETAIL`, whose
`activeDates` is then the list that remains.

A list that would be left empty is **unset**, and its entry has no `activeDates`. An unset list means every day of the
range (its `weekdays` permitting, as `eventPlaysOnDate` reads it), so the tournament or event widens to its whole range; the entry is how a caller sees that and sets new dates.
The alternative, keeping dates the range no longer holds, would leave a list naming days on which nothing can be
played. (The MODIFY_TOURNAMENT_DETAIL payload carries `activeDates: []` for an unset tournament list.) An explicit
`activeDates` argument is still refused with `INVALID_DATE` when it lies outside the new range.

### The scheduling profile follows the range

When `startDate` or `endDate` is given, the stored scheduling profile loses the dates outside the new tournament range.
The rounds profiled on those dates simply leave the profile: their matchUps are no longer scheduled by it, and nothing
already written to a matchUp is changed here (a matchUp scheduled outside the new range is handled by the refusal or
`force` above). What left is returned in `trimmedSchedulingProfile`, in profile shape (absent when nothing was trimmed),
and the saved profile is announced with `MODIFY_SCHEDULING_PROFILE`, as `setSchedulingProfile` announces it.

In a competition whose profile carries rounds of several tournaments, only this tournament's rounds (and rounds naming
no tournament) leave a date outside its range; another tournament's rounds on that date stay, and the date stays with
them. A call that gives neither `startDate` nor `endDate` trims and prunes nothing.

---

## setTournamentLocalTimeZone

Sets the canonical IANA timezone for a tournament. Once set, scoring and audit timestamps are recorded in this zone rather than the viewing device's local zone — so a score entered in Sydney and reviewed in Berlin reads the same wall-clock time. Validation uses the JS runtime's `Intl.DateTimeFormat` IANA database; any string the constructor rejects is returned as `INVALID_TIME_ZONE` without mutating state.

```js
// Set or change the zone
engine.setTournamentLocalTimeZone({ localTimeZone: 'America/New_York' });

// Clear the zone (any of these work)
engine.setTournamentLocalTimeZone({ localTimeZone: '' });
engine.setTournamentLocalTimeZone({ localTimeZone: null });
engine.setTournamentLocalTimeZone({ localTimeZone: undefined });
```

No-op when the value is unchanged. On error returns `{ error: INVALID_TIME_ZONE }`.

---

## addTournamentTimeItem

Adds a timeItem to the tournament record. TimeItems are used to store time-based metadata such as rankings, ratings, publish state, and scheduling data.

```js
engine.addTournamentTimeItem({
  timeItem, // required — { itemType, itemValue, ... } time item object
  removePriorValues, // optional boolean — remove prior timeItems of the same itemType
  duplicateValues, // optional boolean — allow duplicate values
});
```

---
