---
title: Tools API Reference
---

Complete reference of all utility functions available in the `tools` module.

```js
import { tools } from 'tods-competition-factory';
```

---

## Array Utilities

### unique

Extract unique values from an array.

```js
const uniqueValues = tools.unique([1, 2, 2, 3, 3, 3]);
// Result: [1, 2, 3]

const uniqueRounds = tools.unique(matchUps.map((m) => m.roundNumber));
```

### intersection

Find common elements between two arrays.

```js
const common = tools.intersection([1, 2, 3], [2, 3, 4]);
// Result: [2, 3]
```

### overlap

Check if two arrays have any overlapping elements.

```js
const hasOverlap = tools.overlap([1, 2, 3], [3, 4, 5]);
// Result: true
```

### shuffleArray

Randomly shuffle array elements (non-destructive).

```js
const shuffled = tools.shuffleArray([1, 2, 3, 4, 5]);
```

### randomMember

Select a random element from an array.

```js
const randomItem = tools.randomMember(['A', 'B', 'C', 'D']);
```

### randomPop

Remove and return a random element from an array (destructive).

```js
const arr = [1, 2, 3, 4, 5];
const item = tools.randomPop(arr); // Returns random item, modifies arr
```

### chunkArray

Split an array into chunks of specified size.

```js
const chunks = tools.chunkArray([1, 2, 3, 4, 5, 6], 2);
// Result: [[1, 2], [3, 4], [5, 6]]
```

### chunkByNth

Distribute array elements into N chunks.

```js
const chunks = tools.chunkByNth([1, 2, 3, 4, 5, 6], 3);
// Result: [[1, 4], [2, 5], [3, 6]]
```

### chunkSizeProfile

Split array by varying chunk sizes.

```js
const chunks = tools.chunkSizeProfile([1, 2, 3, 4, 5, 6, 7], [2, 3, 2]);
// Result: [[1, 2], [3, 4, 5], [6, 7]]
```

### generateRange

Generate an array of numbers from start to end (inclusive).

```js
const range = tools.generateRange(1, 5);
// Result: [1, 2, 3, 4, 5]
```

### instanceCount

Count occurrences of each value in an array.

```js
const counts = tools.instanceCount(['A', 'B', 'A', 'C', 'B', 'A']);
// Result: { A: 3, B: 2, C: 1 }
```

### countValues

Group array indices by their values.

```js
const grouped = tools.countValues([10, 20, 10, 30, 20]);
// Result: { 10: [0, 2], 20: [1, 4], 30: [3] }
```

### groupValues

Group object values by keys.

```js
const grouped = tools.groupValues({ a: 1, b: 2, c: 1 });
// Result: { 1: ['a', 'c'], 2: ['b'] }
```

### allNumeric

Check if all array elements are numeric.

```js
const isAllNumeric = tools.allNumeric([1, 2, 3]); // true
const notAllNumeric = tools.allNumeric([1, 'a', 3]); // false
```

### noNumeric

Check if array contains no numeric values.

```js
const noNumbers = tools.noNumeric(['a', 'b', 'c']); // true
```

### noNulls

Remove null and undefined values from array.

```js
const clean = tools.noNulls([1, null, 2, undefined, 3]);
// Result: [1, 2, 3]
```

### occurrences

Count occurrences of a specific value in array.

```js
const count = tools.occurrences('A', ['A', 'B', 'A', 'C']);
// Result: 2
```

### subSort

Sort a portion of an array (non-destructive).

```js
const sorted = tools.subSort([5, 4, 3, 2, 1], 1, 3, (a, b) => a - b);
// Result: [5, 2, 3, 4, 1] (sorted indices 1-3)
```

---

## Object Utilities

### createMap

Create a lookup map from an array of objects.

```js
const participants = [
  { participantId: 'id1', participantName: 'Player 1' },
  { participantId: 'id2', participantName: 'Player 2' },
];
const participantsMap = tools.createMap(participants, 'participantId');
// Result: { id1: { participantId: 'id1', ... }, id2: { ... } }
```

### hasAttributeValues

Create a filter function that checks for specific attribute values.

```js
const isCompleted = tools.hasAttributeValues({ matchUpStatus: 'COMPLETED' });
const completedMatchUps = matchUps.filter(isCompleted);
```

### definedAttributes

Extract only defined (non-undefined) attributes from an object.

```js
const clean = tools.definedAttributes({
  a: 1,
  b: undefined,
  c: null,
  d: 2,
});
// Result: { a: 1, c: null, d: 2 }
```

### extractAttributes

Create an extractor function for specific object attributes.

```js
const getName = tools.extractAttributes('participantName');
const names = participants.map(getName);
```

### undefinedToNull

Convert undefined values to null in an object.

```js
const converted = tools.undefinedToNull({ a: 1, b: undefined });
// Result: { a: 1, b: null }
```

### generateHashCode

Generate a hash code from an object or string.

```js
const hash = tools.generateHashCode({ key: 'value' });
const stringHash = tools.generateHashCode('text');
```

---

## Math & Validation

### isPowerOf2

Check if a number is a power of 2.

```js
tools.isPowerOf2(8); // true
tools.isPowerOf2(16); // true
tools.isPowerOf2(12); // false
```

### nearestPowerOf2

Find the nearest power of 2 to a number.

```js
tools.nearestPowerOf2(10); // 8
tools.nearestPowerOf2(20); // 16
```

### nextPowerOf2

Find the next power of 2 greater than or equal to a number.

```js
tools.nextPowerOf2(10); // 16
tools.nextPowerOf2(16); // 16
```

### isConvertableInteger

Check if a value can be converted to an integer.

```js
tools.isConvertableInteger('123'); // true
tools.isConvertableInteger('12.5'); // false
tools.isConvertableInteger('abc'); // false
```

### isNumeric

Check if a value is numeric.

```js
tools.isNumeric(123); // true
tools.isNumeric('123'); // true
tools.isNumeric('abc'); // false
```

### isOdd

Check if a number is odd.

```js
tools.isOdd(3); // true
tools.isOdd(4); // false
```

---

## Date & Time

Four different questions hide inside "a date", and answering the wrong one is the most common source
of off-by-an-hour and off-by-a-day bugs in competition data:

| Question                         | Module                                       | Example                                                    |
| -------------------------------- | -------------------------------------------- | ---------------------------------------------------------- |
| Which calendar day?              | [`tools.plainDate`](#toolsplaindate)         | `2026-09-09` — the same day in Auckland and Los Angeles    |
| What time on the clock?          | [`tools.plainTime`](#toolsplaintime)         | `14:00` — not a moment until a day and a zone are supplied |
| Which actual moment, at a venue? | [`tools.zonedDateTime`](#toolszoneddatetime) | `2026-09-09` + `14:00` + `America/New_York`                |
| Which absolute instant?          | ISO strings with `Z`                         | `2026-09-09T18:00:00.000Z`                                 |

`tools.dateTime` predates that split and spans the first two. It is fully supported and its behaviour
is unchanged — it now re-exports from the intent modules, so there is exactly one implementation of
each helper — but **new code should reach for the module that names the intent**. A reader of
`plainDate.extractDate(x)` knows no zone was involved; a reader of `dateTime.extractDate(x)` has to go
and check.

The names are the [TC39 Temporal](https://tc39.es/proposal-temporal/docs/) ones on purpose. When
`Temporal.PlainDate` and `Temporal.PlainTime` are available on every runtime the factory supports,
these become one-for-one substitutions rather than a rename.

### tools.plainDate

A calendar day: no clock, no zone. Takes and returns ISO date strings (`YYYY-MM-DD`); `Date` appears
only as internal arithmetic.

```js
import { tools } from 'tods-competition-factory';

// The calendar day, whatever the instant was wearing
tools.plainDate.extractDate('2026-09-09T14:00:00+05:30'); // '2026-09-09'
tools.plainDate.extractDate('not-a-date'); // '' — never throws

tools.plainDate.generateDateRange('2026-09-09', '2026-09-12');
// ['2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12']  (inclusive both ends)

tools.plainDate.addDays('2026-09-28', 5); // '2026-10-03'
tools.plainDate.addWeek('2026-09-09'); // '2026-09-16'
tools.plainDate.sameDay('2026-09-09T01:00', '2026-09-09T23:00'); // true
tools.plainDate.isISODateString('tomorrow'); // false
```

Also available: `formatDate`, `isValidDateString`, `dateStringDaysChange`, `getDateByWeek`,
`dateFromDay`, `subtractWeek`, `weekdays`, `isDateInPast`, `localizeDate`.

Nothing in `plainDate` resolves an offset. Anything that needs one belongs in
[`tools.zonedDateTime`](#toolszoneddatetime).

### tools.plainTime

A wall clock: no day, no zone. `14:00` is a `plainTime`; it is not a moment until a day and a zone are
supplied.

```js
tools.plainTime.extractTime('2026-09-09T14:00'); // '14:00'
tools.plainTime.extractTime('2026-09-09'); // undefined — no clock to read

tools.plainTime.timeStringMinutes('14:30'); // 870 — minutes since midnight
tools.plainTime.dayMinutesToTimeString(870); // '14:30'
tools.plainTime.dayMinutesToTimeString(1500); // '01:00' — wraps rather than overflowing

tools.plainTime.convertTime('14:00'); // '2:00 PM'
tools.plainTime.convertTime('2:00 PM', true); // '14:00'
tools.plainTime.isTimeString('24:00'); // false — no wall clock shows that
```

Also available: `tidyTime`, `validTimeValue`, `splitTime`, `militaryTime`, `regularTime`, `timeSort`,
`HHMMSS`.

`timeSort` is a comparator, so pass it to `.sort()` rather than calling it directly:

```js
['14:00', '09:30', '23:15'].sort(tools.plainTime.timeSort);
// ['09:30', '14:00', '23:15']
```

### dateTime

Object containing date/time utility functions. Spans the calendar-day and wall-clock intents; see the
table above for which module to prefer in new code.

```js
// Get ISO date string
const isoDate = tools.dateTime.getIsoDateString(scheduleObject);

// Format date
const formatted = tools.dateTime.formatDate(new Date(), '-', 'YMD');

// Add days to date
const future = tools.dateTime.addDays(new Date(), 7);

// Get date range
const dates = tools.dateTime.generateDateRange('2024-01-01', '2024-01-07');
```

### isValidEmbargoDate

Validate that a string is a valid ISO 8601 datetime **with** timezone context (`Z` or `±HH:MM`). Used internally by all publishing methods; also available for pre-validation.

```js
tools.dateTime.isValidEmbargoDate('2024-06-15T10:00:00Z'); // true
tools.dateTime.isValidEmbargoDate('2024-06-15T10:00:00+05:30'); // true
tools.dateTime.isValidEmbargoDate('2024-06-15T10:00:00'); // false — no timezone
tools.dateTime.isValidEmbargoDate('2024-06-15'); // false — date only
tools.dateTime.isValidEmbargoDate(42); // false — not a string

// Also available as a standalone import
import { tools } from 'tods-competition-factory';
const { isValidEmbargoDate } = tools;
```

### generateDateRange

Generate an array of dates between start and end dates.

```js
const dates = tools.generateDateRange('2024-01-01', '2024-01-05');
// Result: ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05']
```

---

## Timezone

Zero-dependency timezone utilities built on `Intl.DateTimeFormat`. These functions handle DST transitions correctly and require no external libraries.

```js
import { tools } from 'tods-competition-factory';
// All functions are under tools.timeZone
```

### isValidIANATimeZone

Validate that a string is a recognized IANA timezone identifier.

```js
tools.timeZone.isValidIANATimeZone('America/New_York'); // true
tools.timeZone.isValidIANATimeZone('Europe/London'); // true
tools.timeZone.isValidIANATimeZone('UTC'); // true
tools.timeZone.isValidIANATimeZone('Not/A/Zone'); // false
tools.timeZone.isValidIANATimeZone(''); // false
```

Used internally to validate `localTimeZone` when creating tournament records.

### getTimeZoneOffsetMinutes

Returns the UTC offset in minutes for a given IANA timezone at a specific instant. Positive values are east of UTC, negative values are west.

```js
// Winter (EST = UTC-5)
tools.timeZone.getTimeZoneOffsetMinutes('America/New_York', new Date('2024-01-15T12:00:00Z'));
// Result: -300

// Summer (EDT = UTC-4)
tools.timeZone.getTimeZoneOffsetMinutes('America/New_York', new Date('2024-06-15T12:00:00Z'));
// Result: -240

tools.timeZone.getTimeZoneOffsetMinutes('UTC'); // 0
tools.timeZone.getTimeZoneOffsetMinutes('Asia/Kolkata'); // 330 (UTC+5:30)

// An unrecognised or absent zone is `undefined` — never a substituted 0, and
// never the offset of whichever machine happens to be running.
tools.timeZone.getTimeZoneOffsetMinutes('Not/A/Zone'); // undefined
tools.timeZone.getTimeZoneOffsetMinutes(); // undefined
```

**Returns:** offset in minutes, or `undefined` when the zone is absent or unrecognised.

### wallClockToUTC

Convert a wall-clock date and time at a specific IANA timezone to a UTC ISO string. Handles DST transitions automatically.

```js
// 3:00 AM Eastern in summer (EDT, UTC-4)
tools.timeZone.wallClockToUTC('2024-06-20', '03:00', 'America/New_York');
// Result: '2024-06-20T07:00:00.000Z'

// 3:00 AM Eastern in winter (EST, UTC-5)
tools.timeZone.wallClockToUTC('2024-01-15', '03:00', 'America/New_York');
// Result: '2024-01-15T08:00:00.000Z'

// Invalid timezone returns error
tools.timeZone.wallClockToUTC('2024-06-20', '03:00', 'Invalid/Zone');
// Result: { error: INVALID_TIME_ZONE }

// A malformed date and a malformed time are different errors
tools.timeZone.wallClockToUTC('not-a-date', '03:00', 'America/New_York');
// Result: { error: INVALID_DATE }
tools.timeZone.wallClockToUTC('2024-06-20', 'noon', 'America/New_York');
// Result: { error: INVALID_TIME }
```

| Parameter  | Type     | Description                            |
| ---------- | -------- | -------------------------------------- |
| `date`     | `string` | Wall-clock date in `YYYY-MM-DD` format |
| `time`     | `string` | Wall-clock time in `HH:MM` format      |
| `timeZone` | `string` | IANA timezone identifier               |

**Returns:** UTC ISO string (ending in `Z`), or `{ error }` carrying `INVALID_TIME_ZONE`,
`INVALID_DATE` or `INVALID_TIME`.

### utcToWallClock

Convert a UTC ISO string to wall-clock date and time in a specific timezone.

```js
tools.timeZone.utcToWallClock('2024-06-20T07:00:00.000Z', 'America/New_York');
// Result: { date: '2024-06-20', time: '03:00' }

// Handles day boundaries
tools.timeZone.utcToWallClock('2024-06-21T03:00:00.000Z', 'America/New_York');
// Result: { date: '2024-06-20', time: '23:00' }

// Invalid timezone returns error
tools.timeZone.utcToWallClock('2024-06-20T07:00:00.000Z', 'Invalid/Zone');
// Result: { error: INVALID_TIME_ZONE }

// An unparseable instant is refused rather than throwing
tools.timeZone.utcToWallClock('garbage', 'America/New_York');
// Result: { error: INVALID_DATE }
```

| Parameter  | Type     | Description                  |
| ---------- | -------- | ---------------------------- |
| `utcIso`   | `string` | UTC ISO 8601 datetime string |
| `timeZone` | `string` | IANA timezone identifier     |

**Returns:** `{ date: string, time: string }`, or `{ error }` carrying `INVALID_TIME_ZONE`
or `INVALID_DATE`.

### toEmbargoUTC

Convenience wrapper that converts a wall-clock date/time at a timezone to a validated UTC embargo string. The result is guaranteed to pass `isValidEmbargoDate()` and can be passed directly to `publishEvent`, `publishOrderOfPlay`, or `publishParticipants`.

```js
const embargo = tools.timeZone.toEmbargoUTC('2024-06-15', '08:00', 'America/New_York');
// Result: '2024-06-15T12:00:00.000Z'

// Use directly in publishing
engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: { publishingDetail: { published: true, embargo } },
  },
});
```

| Parameter  | Type     | Description                            |
| ---------- | -------- | -------------------------------------- |
| `date`     | `string` | Wall-clock date in `YYYY-MM-DD` format |
| `time`     | `string` | Wall-clock time in `HH:MM` format      |
| `timeZone` | `string` | IANA timezone identifier               |

**Returns:** UTC ISO string (ending in `Z`), or `{ error }` carrying `INVALID_TIME_ZONE`,
`INVALID_DATE` or `INVALID_TIME`.

---

## tools.zonedDateTime

`tools.timeZone` is a thin adapter; `tools.zonedDateTime` is the implementation beneath it and the
zoned member of the calendar-intent set (`plainDate`, `plainTime`, `zonedDateTime`). Reach for it when
you need the raw epoch-millisecond form, or when you need to know **which frame** a conversion used.

```js
import { tools } from 'tods-competition-factory';

// Which frame did this conversion actually use?
tools.zonedDateTime.zonedWallClockToMs({ date: '2026-07-15', time: '09:00', timeZone: 'America/New_York' });
// { ms: 1784725200000, source: 'zone' }

// No zone: the caller's own offset frame, and it says so.
tools.zonedDateTime.zonedWallClockToMs({ date: '2026-07-15', time: '09:00', utcOffsetMinutes: -240 });
// { ms: 1784725200000, source: 'offset' }

// A zone the system cannot honour is REFUSED, not silently replaced.
tools.zonedDateTime.zonedWallClockToMs({
  date: '2026-07-15',
  time: '09:00',
  utcOffsetMinutes: -240,
  timeZone: 'Not/AZone',
});
// null

tools.zonedDateTime.zonedParts({ ms: 1784725200000, timeZone: 'America/New_York' });
// { date: '2026-07-15', time: '09:00', source: 'zone' }

tools.zonedDateTime.offsetMinutesAt(1784725200000, 'America/New_York'); // -240
tools.zonedDateTime.isZone('America/New_York'); // true — cached, so repeat checks are free
```

### The frame rule

| `timeZone`            | result                                      | `source`   |
| --------------------- | ------------------------------------------- | ---------- |
| absent                | the caller's `utcOffsetMinutes` (default 0) | `'offset'` |
| present, unrecognised | `null` — refused                            | —          |
| present, recognised   | resolved **per instant**, DST-correct       | `'zone'`   |

A caller that supplies no zone has declared its own frame, which is legitimate — most tournaments
carry no zone. A caller that supplies a zone the system cannot honour has made a config error;
substituting a different frame turns a 90-minute recovery figure into a 330-minute one that still
reads as measured. `source` is returned so the difference is visible in the value rather than assumed.

---

## ID & Code Generation

### UUID

Generate a unique identifier.

```js
const id = tools.UUID();
// Result: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

const prefixed = tools.UUID('PREFIX');
// Result: 'PREFIX-a1b2c3d4-e5f6-7890-abcd-ef1234567890'
```

### UUIDS

Generate multiple unique identifiers at once.

```js
const ids = tools.UUIDS(3);
// Result: ['uuid1', 'uuid2', 'uuid3']

const prefixedIds = tools.UUIDS(3, 'MATCHUP');
```

### generateTimeCode

Generate a time-based code.

```js
const code = tools.generateTimeCode();
const indexedCode = tools.generateTimeCode(5);
```

---

## Sorting

### numericSort

Numeric sort comparator function.

```js
const sorted = [10, 2, 5, 1].sort(tools.numericSort);
// Result: [1, 2, 5, 10]
```

### matchUpSort

Sort matchUps by schedule, round, position.

```js
const sorted = matchUps.sort(tools.matchUpSort);
```

### matchUpScheduleSort

Sort matchUps by schedule time.

```js
const sorted = matchUps.sort(tools.matchUpScheduleSort);
```

### matchUpChronologicalSort

Sort matchUps by `(scheduledDate, scheduledTime)`. The comparator returns 0
whenever either matchUp lacks the relevant field, so a stable sort preserves
input order for mixed-or-unscheduled inputs. Use this when the caller has
already pre-sorted by the canonical `matchUpSort` order and only wants
chronological refinement layered on top (e.g. Garman → Pro hand-off).

```js
const sorted = matchUps.sort(tools.matchUpChronologicalSort);
```

### structureSort

Sort draw structures by stage, size, and sequence. See [dedicated page](./structure-sort.md).

```js
const sorted = structures.sort(tools.structureSort);
```

---

## Data Transformation

### makeDeepCopy

Create a deep copy of a JSON object. See [dedicated page](./make-deep-copy.md).

```js
const copy = tools.makeDeepCopy(object);
const copyWithExtensions = tools.makeDeepCopy(object, true); // Flatten extensions
```

### JSON2CSV

Convert JSON array to CSV format. See [dedicated page](./json-to-csv.mdx).

```js
const csv = tools.JSON2CSV(arrayOfObjects, {
  columnAccessors: ['id', 'name', 'score'],
  columnMap: { id: 'ID', name: 'Name', score: 'Score' },
});
```

### flattenJSON

Flatten a nested JSON object.

```js
const flat = tools.flattenJSON(
  {
    a: { b: { c: 1 } },
  },
  '.',
);
// Result: { 'a.b.c': 1 }
```

### attributeFilter

Create a filter function for object attributes.

```js
const filter = tools.attributeFilter({ matchUpStatus: 'COMPLETED' });
const completed = matchUps.filter(filter);
```

---

## String Utilities

### constantToString

Convert a constant-case string to readable format.

```js
const readable = tools.constantToString('SINGLE_ELIMINATION');
// Result: 'Single Elimination'
```

---

## Tournament Utilities

### dehydrateMatchUps

Remove computed attributes from matchUps for storage.

```js
const dehydrated = tools.dehydrateMatchUps(matchUps);
```

### visualizeScheduledMatchUps

Generate color-coded console output of match schedule.

```js
tools.visualizeScheduledMatchUps({
  scheduledMatchUps,
  showGlobalLogs: true,
});
```

### parseScoreString

Parse a score string into structured data.

```js
const parsed = tools.parseScoreString({
  scoreString: '6-4 3-6 7-6(3)',
  matchUpFormat: 'SET3-S:6/TB7',
});
// Result: { sets: [...], winningSide: 1, ... }
```

---

## Not in tools Module

The following functions are available through **governors**, not the tools module:

### From queryGovernor

```js
import { queryGovernor } from 'tods-competition-factory';

// Find extension by name
const { extension } = queryGovernor.findExtension({ element, name });

// Get time item
const { timeItem } = queryGovernor.getTimeItem({ element, itemType });
```

### From matchUpGovernor

```js
import { matchUpGovernor } from 'tods-competition-factory';

// Calculate win criteria for tieFormats
const { valueGoal } = matchUpGovernor.calculateWinCriteria({
  collectionDefinitions,
});
```

### From scoreGovernor

```js
import { scoreGovernor } from 'tods-competition-factory';

// Check if score has value
const hasValue = scoreGovernor.checkScoreHasValue({ matchUp });
```

---

## See Also

- **[makeDeepCopy](./make-deep-copy.md)** - Detailed deep copy documentation
- **[JSON2CSV](./json-to-csv.mdx)** - CSV conversion examples
- **[structureSort](./structure-sort.md)** - Structure sorting modes
- **[Tools Overview](./tools-overview.md)** - Overview of all tools

---
