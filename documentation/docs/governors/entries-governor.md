---
title: Entries Governor
---

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

```js
const { error, success } = engine.checkValidEntries({
  consideredEntries, // optional array of entries to check
  enforceGender, // optional boolean - defaults to true
  eventId, // required
});
```

---

## destroyPairEntries

Bulk version of `destroyPairEntry`. Removes multiple PAIR participants from an event and converts them back to individual entries.

```js
const { destroyedCount, errors } = engine.destroyPairEntries({
  participantIds, // array of PAIR participant IDs to destroy
  removeGroupParticipant, // optional boolean - also remove PAIR from tournament participants
  eventId, // required
  drawId, // optional
});

console.log(`Destroyed ${destroyedCount} pair entries`);
if (errors.length) {
  console.log('Errors:', errors);
}
```

**Returns:**

```ts
{
  destroyedCount: number;  // Number of pairs successfully destroyed
  errors: any[];           // Array of errors encountered
}
```

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
  participantId, // required - participant to promote
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
  entryStatusModified?: boolean;
  error?: ErrorType;
}
```

**Purpose:** Changes participant `entryStatus` from ALTERNATE to DIRECT_ACCEPTANCE.

---

## promoteAlternates

Bulk version of `promoteAlternate`. Promotes multiple alternates to direct acceptance.

```js
const result = engine.promoteAlternates({
  participantIds, // required - array of participant IDs to promote
  stage, // optional - defaults to MAIN
  stageSequence, // optional - for qualifying stages
  eventId, // required
  drawId, // optional - also promote in draw
});
```

**Purpose:** Efficiently promote multiple alternates at once after withdrawals.

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
