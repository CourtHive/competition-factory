---
title: Entries Governor
---

:::warning Governor API transition at 8.0.0

Some methods on this page are candidates for removal from production engine exports at the 8.0.0 boundary. Their implementation references have moved: [`getEffectiveRegistrationProfile`](/docs/implementation/records/getEffectiveRegistrationProfile), [`getEntryFeeRange`](/docs/implementation/records/getEntryFeeRange), [`getEventEntryFees`](/docs/implementation/records/getEventEntryFees), [`resolveEntryFee`](/docs/implementation/records/resolveEntryFee). Existing 7.x routes remain available; final decisions and external-integrator confirmations are tracked in the [transition index](/docs/implementation/engine-api-transition-8).

:::

```js
import { entriesGovernor } from 'tods-competition-factory';
```

## addDrawEntries

Bulk add an array of `participantIds` to a specific **stage** of a draw with a specific **entryStatus**. Will fail if `participantIds` are not already present in `event.entries`. Use `addEventEntries` to add to both `event` and `drawDefinition` at the same time.

```js
engine.addDrawEntries({
  suppressDuplicateEntries, // do not throw error on duplicates; instead notify to DATA_ISSUE subscribers
  ignoreStageSpace, // optional boolean to disable checking available positions
  entryStageSequence, // optional - applies to qualifying
  autoEntryPositions, // optional - keeps entries ordered by entryStage/entryStatus and auto-increments
  entryStatus: ALTERNATE, // optional
  entryStage: MAIN, // optional
  participantIds,
  eventId,
  drawId,
});
```

---

## addEventEntries

Adds `participantIds` to `event.entries`; optionally pass drawId to add participantIds to `flightProfile.flight[].drawEntries` at the same time. See examples in [Tournament Entry Filters](../concepts/accessors.mdx#tournament-entry-filters), [Adding Entries](../concepts/events/entries.mdx#adding-entries), [Complete Example](../concepts/events/flights.mdx#complete-example).

Supports optional validation of participant eligibility against event category constraints (age ranges, rating requirements).

A call is all-or-nothing: if any of `participantIds` is refused (wrong participant type, gender, category or role),
the call returns `INVALID_PARTICIPANT_IDS` and enters **no one**; the record is unchanged. Resubmit without the refused ids.

:::note

Will **_not_** throw an error if unable to add entries into specified `flightProfile.flight[].drawEntries`,
which can occur if a `drawDefinition` has already been generated and an attempt is made to add
a participant with `entryStatus: DIRECT_ACCEPTANCE`.

:::

```js
engine.addEventEntries({
  suppressDuplicateEntries, // do not throw error on duplicates; instead notify to DATA_ISSUE subscribers
  entryStatus: ALTERNATE, // optional; defaults to DIRECT_ACCEPTANCE
  entryStage: MAIN, // optional; defaults to MAIN
  autoEntryPositions, // optional - keeps entries ordered by entryStage/entryStatus and auto-increments
  enforceCategory, // optional - validate against event category (age/rating); defaults to false
  enforceGender, // optional - validate gender; defaults to true
  participantIds,
  eventId,
  drawId, // optional - will add participantIds to specified flightProfile.flight[].drawEntries and drawDefinition.entries (if possible)
});
```

### Category Validation

When `enforceCategory: true`, validates participants against event category constraints:

**Age Validation**:

- Participant must be valid throughout entire event period (start to end date)
- Requires `person.birthDate` **or** `person.birthYear` if age restrictions exist.
  `birthDate` gives exact age; a year-precision `birthYear` falls back to the
  calendar-year convention (age-in-year = year − birthYear), the standard for
  junior eligibility when only the birth year is known. `birthDate` is
  authoritative when both are present.
- Combined age categories (e.g., `C50-70`) are automatically skipped for individuals

**Rating Validation**:

- Participant must have rating matching `category.ratingType`
- Rating value must fall within `ratingMin`/`ratingMax` range
- Uses most recent rating from participant's scale items

**Rejection Response**:

```js
const result = engine.addEventEntries({
  participantIds: ['player1', 'player2', 'player3'],
  enforceCategory: true,
  eventId,
});

if (result.error) {
  // result.context.categoryRejections contains detailed rejection information
  result.context.categoryRejections.forEach((rejection) => {
    console.log(`${rejection.participantName}:`);
    rejection.rejectionReasons.forEach((reason) => {
      console.log(`  - ${reason.reason}`);
      console.log(`    Details:`, reason.details);
    });
  });
}
```

**See:** [Entries - Category Validation](/docs/concepts/events/entries#category-validation) for comprehensive documentation and examples.

---

## addEventEntryPairs

Add **PAIR** participant to an event. Creates new `{ participantType: PAIR }` participants if the combination of `individualParticipantIds` does not already exist.

```js
engine.addEventEntryPairs({
  allowDuplicateParticipantIdPairs, // optional - boolean - allow multiple pair participants with the same individualParticipantIds
  uuids, // optional - array of UUIDs to use for newly created pairs
  entryStatus: ALTERNATE, // optional
  entryStage: QUALIFYING, // optional
  participantIdPairs,
  eventId,
});
```

---

## checkValidEntries

Validates entry participant types and event gender constraints. By default, `eventId` validates the event's
entries; supplying `drawId` validates that draw's entries instead. `consideredEntries` overrides either
source, including when it is an empty array. A supplied draw also determines which format-specific
admission rules apply: accepted individuals are eligible only in a configured rotating-partner draw.

```js
const { valid, error, invalidParticipantIds } = engine.checkValidEntries({
  eventId, // required unless drawId identifies the event
  drawId, // optional - use this draw's entries and admission rules
  consideredEntries, // optional - explicit entries to validate instead
  enforceGender, // optional - override the applicable gender-enforcement policy
});
```

---

## destroyPairEntries

Bulk version of `destroyPairEntry`. Removes multiple PAIR participants from an event and converts them back to individual entries.

```js
const result = engine.destroyPairEntries({
  participantIds, // array of PAIR participant IDs to destroy
  removeGroupParticipant, // optional boolean - also remove PAIR from tournament participants
  eventId, // required
  drawId, // optional
});

if (result.error) {
  // nothing was destroyed: result.error is the first failure; every failure is in result.context.errors
} else {
  console.log(`Destroyed ${result.destroyedCount} pair entries`);
  if (result.context?.errors) console.log('Not destroyed:', result.context.errors);
}
```

**Returns:**

```ts
// at least one pair destroyed
{
  success: true;
  destroyedCount: number;               // Number of pairs successfully destroyed
  context?: { errors: ErrorType[] };    // present only when some pairs could not be destroyed
}

// none destroyed
{
  error: ErrorType;                     // the first failure (PARTICIPANT_ENTRY_NOT_FOUND if none was recorded)
  context: { errors: ErrorType[] };     // every failure
}
```

Since 7.5.0 a refusal is a single `error` rather than an array, and an empty or missing `participantIds` is refused
with `MISSING_PARTICIPANT_IDS`.

**What it does:**

- Removes PAIR participants from event entries
- Adds individual participants back with `entryStatus: UNGROUPED`
- Optionally removes PAIR participants from tournament entirely
- Processes multiple pairs in one operation

**Use Cases:**

- Canceling doubles registrations and returning to singles pool
- Breaking up pairs due to withdrawals
- Converting doubles entries to singles entries
- Cleaning up incorrect pair formations

---

## destroyPairEntry

Removes a `{ participantType: PAIR }` entry from an event and adds the individualParticipantIds to entries as entryStatus: UNGROUPED

```js
engine.destroyPairEntry({
  participantId, // PAIR participant ID to destroy
  removeGroupParticipant, // optional boolean - also remove PAIR from tournament participants
  eventId, // required
  drawId, // optional
});
```

Refused before the first write when the event would not take the individuals back (gender, category, role, or an
unknown participant): the PAIR's entry stays, and the record is unchanged. The same holds for each pair in
`destroyPairEntries`.

**What it does:**

1. Removes PAIR participant from event.entries
2. Adds both individual participants to event.entries with `entryStatus: UNGROUPED`
3. If `drawId` provided, also updates draw entries
4. Optionally removes PAIR from `tournamentRecord.participants`

**Use Cases:**

- Player partnership dissolution
- Changing doubles teams
- Converting pair entry to individual entries for different event

**Notes:**

- Individual participants must exist in tournament
- PAIR participant must be in event entries
- Use `removeGroupParticipant: true` to clean up PAIR from entire tournament
- See `destroyPairEntries` for bulk operation

---

## getEffectiveRegistrationProfile

**8.0.0 engine-removal candidate.** This 7.x route remains available pending review. The full reference has moved to [`getEffectiveRegistrationProfile`](/docs/implementation/records/getEffectiveRegistrationProfile). Package-export status is a separate decision.

## getEntriesAndSeedsCount

Calculates the number of seeds allowed for a draw based on entries count and seeding policy.

```js
const { entries, stageEntries, seedsCount } = engine.getEntriesAndSeedsCount({
  policyDefinitions, // optional - seeding policy
  drawDefinition, // optional - draw context
  drawSize, // optional - override calculated draw size
  stage, // required - MAIN or QUALIFYING
  event, // required - event context
  drawId, // optional
});

console.log(`${stageEntries.length} entries, ${seedsCount} seeds allowed`);
```

**Returns:**

```ts
{
  entries: Entry[];        // All event entries
  stageEntries: Entry[];   // Entries for specified stage
  seedsCount: number;      // Number of seeds allowed by policy
  error?: ErrorType;
}
```

**Purpose:** Determines how many seeds are allowed based on the number of entries and seeding policy configuration.

**Seeding Policy Logic:**

- Checks policy definition for seedsCountThresholds
- Matches entries count to threshold ranges
- Returns maximum seeds allowed for that range
- Falls back to standard seeding rules if no policy

**Use Cases:**

- Calculating seeds before draw generation
- Validating seeding requests against policy
- UI display of available seed positions
- Enforcing tournament seeding rules

**Notes:**

- Uses elimination draw size calculation (next power of 2)
- Respects seeding policy limits
- Returns stage-specific entries (MAIN vs QUALIFYING)
- Used internally by `generateDrawDefinition`

---

## getEntryFeeRange

**8.0.0 engine-removal candidate.** This 7.x route remains available pending review. The full reference has moved to [`getEntryFeeRange`](/docs/implementation/records/getEntryFeeRange). Package-export status is a separate decision.

## getEventEntryFees

**8.0.0 engine-removal candidate.** This 7.x route remains available pending review. The full reference has moved to [`getEventEntryFees`](/docs/implementation/records/getEventEntryFees). Package-export status is a separate decision.

## getEventEntrySpace

How many MAIN places an event (or one of its draws) has for entries accepted directly — neither
qualifiers nor wildcards — and how many of them are still open.

```js
const { basis, drawPositions, qualifierPositions, wildcardPositions, directAcceptancePlaces, openPlaces } =
  engine.getEventEntrySpace({
    eventId, // required
    drawId, // optional - that draw's positions and entries; otherwise the event's
  });
```

**Returns:**

```ts
{
  success: true;
  basis: 'STRUCTURE' | 'TARGET_DRAW_SIZE' | 'SANCTIONING_CONSTRAINTS' | 'NONE'; // where drawPositions came from
  drawPositions: number; // MAIN draw positions
  qualifierPositions: number; // MAIN positions held for qualifiers
  qualifierPositionsBasis: 'STRUCTURE' | 'ENTRY_PROFILE' | 'NONE';
  wildcardPositions: number; // max(entryProfile.wildcardCount, wildcardsAccepted)
  wildcardsAccepted: number;
  directAcceptedCount: number; // MAIN entries in DIRECT_ENTRY_STATUSES, wildcards excluded
  acceptedCount: number; // directAcceptedCount + wildcardsAccepted
  directAcceptancePlaces?: number; // drawPositions - qualifierPositions - wildcardPositions; undefined when basis is NONE
  openPlaces?: number; // directAcceptancePlaces - directAcceptedCount, never below 0; undefined when basis is NONE
}
```

**Where the numbers come from.** Once a MAIN structure exists, its positions and the qualifier
positions its links deliver decide — the same breakdown entry into a draw uses. Before that, the event's
`entryProfile`: `targetDrawSize` for the positions (then the sanctioning constraints extension's
`drawSize`), and `qualifiersCount`, or the final stage of each of `qualifyingProfiles`, for the qualifier
positions. A `qualifyingDrawSize` alone holds no MAIN place: a qualifying draw's size does not say how
many it sends on. Without `drawId`, positions are summed over every draw that has a MAIN structure and
counted against the event's entries; entries with no `entryStage` count as MAIN.

---

## getMaxEntryPosition

Returns the highest `entryPosition` value from entries, optionally filtered by stage and/or entryStatus.

```js
const maxPosition = engine.getMaxEntryPosition({
  entries, // array of entry objects
  entryStatus, // optional filter - e.g., DIRECT_ACCEPTANCE, ALTERNATE
  stage, // optional filter - e.g., MAIN, QUALIFYING
});

// Use for assigning next entry position
const nextPosition = maxPosition + 1;
```

**Returns:** `number` - Highest entryPosition found, or 0 if no matches

**Use Cases:**

- Determining next entry position when adding entries
- Finding last position in acceptance list
- Ordering entries by position
- Managing entry position sequences

**Notes:**

- Returns 0 if no entries match filters
- Ignores entries without `entryPosition` (NaN values)
- Can filter by both `stage` and `entryStatus` simultaneously
- Used internally when `autoEntryPositions: true`

---

## modifyEntriesStatus

Modify the entryStatus of participants already in an event or flight/draw. Does not allow participants assigned positions in structures to have an entryStatus of WITHDRAWN.

```js
const result = engine.modifyEntriesStatus({
  autoEntryPositions, // optional - keeps entries ordered by entryStage/entryStatus and auto-increments
  participantIds, // ids of participants whose entryStatus will be modified
  entryStatus, // new entryStatus
  entryStage, // optional - e.g. QUALIFYING
  eventSync, // optional - if there is only a single drawDefinition in event, keep event.entries in sync
  extension, // optional - { name, value } - add if value; removes if value is undefined
  eventId, // id of event where the modification(s) will occur
  drawId, // optional - scope to a specific flight/draw
  stage, // optional - scope to a specific stage
});
```

**Draw scope.** With a `drawId` that resolves a flight or draw, every participant in `participantIds` must have an
entry in that flight's `drawEntries` or the draw's entries. Otherwise the call is refused before anything is written,
with `PARTICIPANT_ENTRY_NOT_FOUND` and `context.participantIds` naming the participants that are not in scope; if
only some are out of scope, the whole call is refused. A call that also updates the event's entries (`WITHDRAWN`, or
`eventSync` with a single draw) accepts a participant that is in the event's entries but not in the draw.

**entryPositions.** Positions are numbered within a group: the entries that share an `entryStage` (`MAIN` when
absent) and an `entryStatus`, as `refreshEntryPositions` numbers them. The same rule applies in the event's entries,
the flight's `drawEntries` and the draw's entries, with or without `autoEntryPositions`.

- **An entry that changes group goes to the end of its new group** (`max + 1` of the group's positions), and the entries
  behind it in its old group close up. An `ALTERNATE` moved to `DIRECT_ACCEPTANCE` therefore follows the accepted
  entries and never takes an accepted entry's position; an accepted entry moved to `ALTERNATE` goes after the
  alternates, and the accepted entries close up. A `WITHDRAWN` entry restored, a qualifying alternate moved to the
  main stage, or a move to `LUCKY_LOSER` follow the same rule.
- **Several moved in one call take distinct positions in the order of `participantIds`.**
- **An entry already in the requested group keeps its position.**
- **When no entry of the new group has a position**, the moved entry is left without one: a position would sort it
  ahead of them.
- Positions are counted per `entryStatus`, so a `DIRECT_ACCEPTANCE` entry and a `WILDCARD` entry can both hold
  position 1. `promoteAlternates` places entries by the same rule.

---

## modifyEventEntries

Modify the entries for an event. For DOUBLES events automatically create PAIR participants if not already present. See examples: [Update Entry Status](../concepts/events/entries.mdx#update-entry-status).

```js
engine.modifyEventEntries({
  entryStatus = DIRECT_ACCEPTANCE,
  unpairedParticipantIds = [],
  participantIdPairs = [],
  entryStage = MAIN,
  eventId,
})
```

---

## promoteAlternate

Promotes a single alternate participant to direct acceptance status.

```js
const result = engine.promoteAlternate({
  participantId, // optional - participant to promote; defaults to the stage's next alternate
  stage, // optional - defaults to MAIN
  stageSequence, // optional - for qualifying stages
  eventId, // required
  drawId, // optional - also promote in draw
});
```

**Returns:**

```ts
{
  success: boolean;
  error?: ErrorType;
  context?: { drawPromotionError, drawId }; // the draw could not promote; the event did
}
```

**Purpose:** Changes participant `entryStatus` from ALTERNATE to DIRECT_ACCEPTANCE. Without a `participantId` the
stage's alternate with the lowest `entryPosition` is promoted (with no positioned alternate, the first one entered).
See `promoteAlternates` for positions, draws and flights.

---

## promoteAlternates

Bulk version of `promoteAlternate`. Promotes multiple alternates to direct acceptance, in the order given.

```js
const result = engine.promoteAlternates({
  participantIds, // required - participant IDs to promote, in order of acceptance
  stage, // optional - defaults to MAIN
  stageSequence, // optional - for qualifying stages
  eventId, // required
  drawId, // optional - also promote in draw
});
```

**Purpose:** Efficiently promote multiple alternates at once after withdrawals.

- **Positions.** Each promoted entry takes the next position after the stage's accepted entries (`max + 1`), so
  promoting several in one call gives them distinct positions in the order of `participantIds`. The alternates behind
  each promoted entry close up. When no accepted entry in the stage has an `entryPosition`, the promoted entry is
  left without one.
- **Refused before any write.** Every id must be an alternate entry of the event in `stage` (and `stageSequence`,
  when given); otherwise nothing changes. An id that is not an event entry returns `PARTICIPANT_ENTRY_NOT_FOUND`.
- **Draws.** With `drawId`, the draw's entries are promoted too. With split draws an alternate may not be in the
  draw's entries: given `eventId`, the event is still promoted and the draw's refusal is returned as
  `context.drawPromotionError`; given only `drawId`, the call is refused. A generated draw's entries are promoted
  without placing the participant in the structure.
- **Flights.** The same alternates are promoted in the `drawEntries` of the draw's flight and of every flight whose
  draw is not yet generated, wherever they appear there as alternates.

---

## removeDrawEntries

Removes participant entries from a drawDefinition (but not from the event).

```js
const result = engine.removeDrawEntries({
  participantIds, // required - array of participant IDs to remove
  stage, // optional - target specific stage (MAIN, QUALIFYING)
  stageSequence, // optional - target specific stage sequence
  eventId, // required
  drawId, // required
});
```

**Purpose:** Removes entries from draw only, maintaining event entries.

---

## removeEventEntries

Removes participant entries from an event and optionally from associated draws.

```js
const result = engine.removeEventEntries({
  participantIds, // required - array of participant IDs to remove
  stage, // optional - target specific stage
  stageSequence, // optional - target specific stage sequence
  autoRemoveUnassigned, // optional boolean - remove if not positioned in draw
  removeFromDrawEntries, // optional boolean - also remove from draw entries
  eventId, // required
  drawId, // optional - specific draw to target
});
```

**Purpose:** Removes entries from event and optionally from draws.

---

## resolveEntryFee

**8.0.0 engine-removal candidate.** This 7.x route remains available pending review. The full reference has moved to [`resolveEntryFee`](/docs/implementation/records/resolveEntryFee). Package-export status is a separate decision.

## setEntryPosition

Set entry position a single event entry

```js
engine.setEntryPosition({
  entryPosition,
  participantId,
  eventId, // optional if drawId is provided
  drawId, // optional if eventId is provided
});
```

---

## setEntryPositions

Set entry position for multiple event entries.

```js
engine.setEntryPositions({
  entryPositions, // array of [{ entryPosition: 1, participantId: 'participantid' }]
  eventId, // optional if drawId is provided
  drawId, // optional if eventId is provided
});
```

---
