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

## getEffectiveRegistrationProfile

The registration facts that actually apply to an event, merging the event's `registrationProfile` over the tournament's **field by field**.

```js
const { entriesOpen, entriesClose, withdrawalDeadline, entryFees, entryUrl, eligibilityNotes } =
  engine.getEffectiveRegistrationProfile({ event, tournamentRecord });
```

**The field-by-field cascade is the whole reason this function exists.** The obvious implementation — `event.registrationProfile ?? tournamentRecord.registrationProfile` — is wrong in a way that looks right: an event overriding only `entriesClose` would silently lose the tournament's `entryUrl`, `entryFees` and every other field, because the whole object was replaced rather than merged. The failure is invisible at the call site and shows up as a missing registration link on one division.

Every reader of a registration window should come through here rather than reaching for the fallback itself.

Only the six overridable fields are returned; the tournament's logistics, sponsors and dress code are not event-scoped concepts and are read from `tournamentRecord.registrationProfile` directly. An `undefined` value on the event does **not** override — absent means "not stated here", never "explicitly nothing" — while a `null` is preserved, so a producer can still say "this event has no entry URL" when it means it.

See [Registration Profile](../concepts/registration-profile.md#event-grain-overrides).

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

## getEntryFeeRange

The lowest and highest of a set of fees — or nothing, when they cannot honestly be compared.

```js
const range = engine.getEntryFeeRange(fees);
// { min: { amount, currencyCode, unit }, max: { ... }, indeterminate: [], incomparable: [] }
```

A displayed price range ("$30–$155") is only meaningful if every contributing fee is denominated identically. Comparing across currencies picks the smaller **number** rather than the smaller **value**: 40 EUR "beats" 45 USD on arithmetic that means nothing.

So the range is computed only over the single most common `currencyCode`/`unit` pair — the largest group, so one stray currency does not suppress an otherwise usable range — and everything else is **reported rather than folded in or dropped**:

- `indeterminate` — fees that could not be resolved at all, present so a caller can disclose rather than hide them.
- `incomparable` — the distinct `currencyCode`/`unit` pairs found beyond the one the range is denominated in.

Returns `undefined` when no fee can be resolved at all, so the caller renders nothing rather than a zero.

---

## getEventEntryFees

The entry fees that apply to an event, narrowed by each fee's own selectors.

```js
const fees = engine.getEventEntryFees({ event, tournamentRecord });
```

A tournament-grain fee list can carry entries for several events, so "the fees on this record" is not the same question as "the fees for this event". Selectors are matched **most-specific first**: `eventId` > `category` > `eventType`. A fee with **no** selector applies to every event — that is how a single tournament-wide price is stated.

Only the most specific tier that matched is returned, rather than everything that matched: a fee keyed to this exact `eventId` supersedes a blanket "all doubles" price, and returning both would leave the caller to re-derive precedence and get it wrong. Fees selecting a _different_ event are excluded rather than returned as a fallback.

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

## resolveEntryFee

Read a stored entry fee, refusing to guess its scale.

```js
const resolved = engine.resolveEntryFee(fee);
// { amount, currencyCode, unit }
// or { indeterminate: true, reason: 'no unit — scale unknown' }

if (engine.isIndeterminateFee(resolved)) renderFeeOnRequest(resolved.reason);
```

`unit` is required on `RegistrationEntryFee` by construction, but records written before it existed still arrive over the wire without one, and a stored record is not a compile-time object. This is the read-side counterpart to that requirement: **writes are strict, reads are tolerant, and the tolerance takes the shape of an explicit "cannot tell" rather than an assumption.**

**The unit is never inferred from magnitude.** "6000 is obviously minor units" is wrong on a real ¥6000 entry and on a genuine $6,000 pro-am, and both exist. A consumer receiving `indeterminate` should render "fee on request" or similar — anything but a figure that might be out by 100×. An absent `currencyCode` is likewise unknown, not the reader's own; defaulting it invents data.

`isIndeterminateFee` is the type guard that narrows the union.

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
