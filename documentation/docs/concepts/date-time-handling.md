---
title: Date and Time Handling
---

## Overview

The Competition Factory handles dates and times across several domains: tournament scheduling, match timing, embargo enforcement, and timezone conversion. All temporal data uses **ISO 8601** format, and the factory is **zero-dependency** — every date, time, and timezone operation is built on platform APIs (`Date`, `Intl.DateTimeFormat`) with no external libraries.

### Date Formats Used

| Context                                          | Format                 | Example                  |
| ------------------------------------------------ | ---------------------- | ------------------------ |
| Tournament dates, scheduled dates                | `YYYY-MM-DD`           | `'2024-06-15'`           |
| Timestamps (embargo, createdAt, start/end times) | ISO 8601 with timezone | `'2024-06-15T10:00:00Z'` |
| Time-of-day (scheduling)                         | `HH:MM`                | `'14:30'`                |
| IANA timezone identifiers                        | Region/City            | `'America/New_York'`     |

### Where Dates Appear

**Tournament Record:**

- `startDate` / `endDate` — tournament date range (`YYYY-MM-DD`)
- `localTimeZone` — IANA timezone identifier for the tournament venue
- `activeDates` — specific dates within the range when play occurs

**Time Items:**

- `itemDate` — effective date (`YYYY-MM-DD`)
- `createdAt` — creation timestamp (ISO 8601 with timezone)
- `itemValue` — often contains timestamps for scheduling events

**Publishing / Embargo:**

- `embargo` — ISO 8601 timestamp with timezone (`Z` or `±HH:MM` offset required)

**Scheduling:**

- `scheduledDate` — match date (`YYYY-MM-DD`)
- `scheduledTime` — match time (`HH:MM`)

## Date & Time Utilities

The `dateTime` object on `tools` provides functions for working with dates and times:

```js
import { tools } from 'tods-competition-factory';
```

### Core Functions

| Function                                         | Description                                  |
| ------------------------------------------------ | -------------------------------------------- |
| `dateTime.formatDate(date, separator?, order?)`  | Format a Date object to string               |
| `dateTime.extractDate(dateTimeString)`           | Extract `YYYY-MM-DD` from a datetime string  |
| `dateTime.extractTime(dateTimeString)`           | Extract `HH:MM` from a datetime string       |
| `dateTime.addDays(date, days)`                   | Add days to a date                           |
| `dateTime.addWeek(date)`                         | Add 7 days to a date                         |
| `dateTime.addMinutesToTimeString(time, minutes)` | Add minutes to an `HH:MM` string             |
| `dateTime.sameDay(date1, date2)`                 | Check if two dates are the same calendar day |
| `dateTime.isISODateString(value)`                | Validate ISO 8601 date/datetime string       |
| `dateTime.isValidEmbargoDate(value)`             | Validate ISO 8601 datetime **with timezone** |
| `dateTime.isDate(value)`                         | Check if value is a Date object              |
| `dateTime.isTimeString(value)`                   | Validate `HH:MM` format                      |
| `dateTime.timeStringMinutes(time)`               | Convert `HH:MM` to total minutes             |
| `dateTime.offsetDate(dateString)`                | Create a Date from an ISO date string        |
| `dateTime.offsetTime(isoString?)`                | Get timezone offset in milliseconds          |
| `dateTime.getUTCdateString(dateOrString)`        | Get `YYYY-MM-DD` in UTC                      |
| `dateTime.timeUTC(dateOrString?)`                | Get UTC timestamp in milliseconds            |

### Date Range Generation

```js
import { tools } from 'tods-competition-factory';

const dates = tools.generateDateRange('2024-06-10', '2024-06-15');
// ['2024-06-10', '2024-06-11', '2024-06-12', '2024-06-13', '2024-06-14', '2024-06-15']
```

### Embargo Validation

`isValidEmbargoDate` ensures a value is a valid ISO 8601 datetime string that includes timezone context. This is enforced automatically by all publishing methods, but is also available for pre-validation:

```js
tools.dateTime.isValidEmbargoDate('2024-06-15T10:00:00Z'); // true — UTC
tools.dateTime.isValidEmbargoDate('2024-06-15T10:00:00+05:30'); // true — offset
tools.dateTime.isValidEmbargoDate('2024-06-15T10:00:00'); // false — no timezone
tools.dateTime.isValidEmbargoDate('2024-06-15'); // false — date only
tools.dateTime.isValidEmbargoDate(42); // false — not a string
```

See [Embargo and Scheduled Rounds](/docs/concepts/publishing/publishing-embargo) for the full embargo documentation.

## Timezone Utilities

The `timeZone` object on `tools` provides timezone-aware operations using `Intl.DateTimeFormat`. These functions handle DST transitions correctly and work in all modern JavaScript runtimes.

```js
import { tools } from 'tods-competition-factory';
```

### Validating Timezones

Tournament records can specify a `localTimeZone` (IANA timezone identifier). The factory validates this value on creation using `isValidIANATimeZone`:

```js
tools.timeZone.isValidIANATimeZone('America/New_York'); // true
tools.timeZone.isValidIANATimeZone('Europe/London'); // true
tools.timeZone.isValidIANATimeZone('UTC'); // true
tools.timeZone.isValidIANATimeZone('EST'); // runtime-dependent
tools.timeZone.isValidIANATimeZone('Not/A/Zone'); // false
```

When creating a tournament record with an invalid `localTimeZone`, the factory returns an `INVALID_TIME_ZONE` error:

```js
const result = engine.createTournamentRecord({
  tournamentName: 'Example Open',
  localTimeZone: 'Invalid/Zone',
});
// result.error === INVALID_TIME_ZONE
```

### Getting UTC Offsets

`getTimeZoneOffsetMinutes` returns the UTC offset in minutes for a timezone at a specific instant, correctly accounting for DST:

```js
// Winter: EST is UTC-5 (-300 minutes)
tools.timeZone.getTimeZoneOffsetMinutes('America/New_York', new Date('2024-01-15T12:00:00Z'));
// -300

// Summer: EDT is UTC-4 (-240 minutes)
tools.timeZone.getTimeZoneOffsetMinutes('America/New_York', new Date('2024-06-15T12:00:00Z'));
// -240

// Fixed offset (no DST)
tools.timeZone.getTimeZoneOffsetMinutes('Asia/Kolkata'); // 330 (UTC+5:30, always)

// An unrecognised or absent zone is `undefined`, never a substituted 0
tools.timeZone.getTimeZoneOffsetMinutes('Not/A/Zone'); // undefined
```

### Converting Between Wall-Clock Time and UTC

These functions convert between "local time at a venue" and absolute UTC timestamps.

**Wall-clock to UTC:**

```js
// "3:00 AM in New York on June 20" → UTC
tools.timeZone.wallClockToUTC('2024-06-20', '03:00', 'America/New_York');
// '2024-06-20T07:00:00.000Z' (EDT = UTC-4)

// Same time in winter → different UTC
tools.timeZone.wallClockToUTC('2024-01-15', '03:00', 'America/New_York');
// '2024-01-15T08:00:00.000Z' (EST = UTC-5)
```

**UTC to wall-clock:**

```js
// UTC → "what time is it in New York?"
tools.timeZone.utcToWallClock('2024-06-20T07:00:00.000Z', 'America/New_York');
// { date: '2024-06-20', time: '03:00' }

// Day boundary: UTC June 21 03:00 → still June 20 in New York
tools.timeZone.utcToWallClock('2024-06-21T03:00:00.000Z', 'America/New_York');
// { date: '2024-06-20', time: '23:00' }
```

### Creating Embargo Strings from Local Time

`toEmbargoUTC` is a convenience function that converts wall-clock time to a validated UTC embargo string, ready to pass to any publishing method:

```js
const embargo = tools.timeZone.toEmbargoUTC('2024-06-15', '08:00', 'America/New_York');
// '2024-06-15T12:00:00.000Z'

// The result always passes isValidEmbargoDate
tools.dateTime.isValidEmbargoDate(embargo); // true

// Use directly
engine.publishOrderOfPlay({
  scheduledDates: ['2024-06-15'],
  embargo,
});
```

### Practical Pattern: Tournament-Aware Embargo

Combine `localTimeZone` from the tournament record with `toEmbargoUTC` for a complete workflow:

```js
// Get the tournament's timezone
const { tournamentInfo } = engine.getTournamentInfo();
const { localTimeZone } = tournamentInfo;
// e.g. 'America/New_York'

// Admin says "make the draw visible at 9 AM local time on June 15"
const embargo = tools.timeZone.toEmbargoUTC('2024-06-15', '09:00', localTimeZone);

engine.publishEvent({
  eventId,
  drawDetails: {
    [drawId]: {
      publishingDetail: { published: true, embargo },
    },
  },
});

// Later, display the embargo in local time for the admin
const { date, time } = tools.timeZone.utcToWallClock(embargo, localTimeZone);
console.log(`Embargo lifts at ${time} on ${date} (${localTimeZone})`);
// "Embargo lifts at 09:00 on 2024-06-15 (America/New_York)"
```

## Date Handling Across the Factory

### Tournament Dates

Tournament records track dates as `YYYY-MM-DD` strings. Validation is applied on creation and when modifying dates:

```js
// startDate, endDate, and activeDates are validated as ISO date strings
engine.createTournamentRecord({
  tournamentName: 'Summer Open',
  startDate: '2024-06-10',
  endDate: '2024-06-16',
  activeDates: ['2024-06-10', '2024-06-12', '2024-06-14', '2024-06-16'], // optional
  localTimeZone: 'America/New_York', // validated as IANA timezone
});

// Modifying dates validates and adjusts event dates accordingly
engine.setTournamentDates({
  startDate: '2024-06-11',
  endDate: '2024-06-15',
  activeDates: ['2024-06-11', '2024-06-13', '2024-06-15'], // optional
});
```

### Active Dates

`activeDates` is an optional array of `YYYY-MM-DD` date strings representing the specific dates within a tournament's (or event's) date range when play actually occurs. This is useful for tournaments that span a date range but don't play every day — for example, a week-long tournament with rest days.

- **Omitted or `undefined`**: all dates in the `startDate`–`endDate` range are implicitly active
- **Non-empty array**: only the listed dates are active play dates
- **Validation**: every date must be a valid date string and must fall within `startDate`/`endDate`; returns `INVALID_DATE` on failure
- **Derivation**: when `createTournamentRecord` is called with `activeDates` but without `startDate` and/or `endDate`, the missing boundaries are derived from the earliest and latest active dates. This ensures the tournament record always has valid `startDate`/`endDate` for scheduling, court availability, and other subsystems that depend on them.
- **Falsy filtering**: falsy values (empty strings, `null`) are automatically filtered out before validation

`activeDates` can be set at creation time via `createTournamentRecord` or later via `setTournamentDates`. Events also support `activeDates` via `setEventDates`.

```js
// Set activeDates at creation — startDate/endDate provided explicitly
engine.createTournamentRecord({
  startDate: '2024-06-10',
  endDate: '2024-06-16',
  activeDates: ['2024-06-10', '2024-06-12', '2024-06-14', '2024-06-16'],
});

// Set activeDates at creation — startDate/endDate derived automatically
// startDate becomes '2024-06-10', endDate becomes '2024-06-16'
engine.createTournamentRecord({
  activeDates: ['2024-06-10', '2024-06-12', '2024-06-14', '2024-06-16'],
});

// Update activeDates later
engine.setTournamentDates({
  activeDates: ['2024-06-10', '2024-06-11', '2024-06-14', '2024-06-16'],
});

// Set event-level activeDates
engine.setEventDates({
  eventId,
  activeDates: ['2024-06-10', '2024-06-14'],
});
```

### Scheduling

Match scheduling uses `YYYY-MM-DD` for dates and `HH:MM` for times. The scheduling system stores these as [Time Items](/docs/concepts/timeItems) with full timestamps:

```js
engine.addMatchUpScheduleItems({
  matchUpId,
  drawId,
  schedule: {
    scheduledDate: '2024-06-15',
    scheduledTime: '14:30',
    courtId: 'court-5',
  },
});
```

### Time Items

All temporal records use ISO 8601 format. `createdAt` is auto-generated with timezone context:

```js
{
  itemType: 'SCHEDULE.TIME.START',
  itemValue: '2024-06-15T14:05:00Z',      // Always includes timezone
  itemDate: '2024-06-15',                   // YYYY-MM-DD
  createdAt: '2024-06-15T14:05:00.000Z',   // Auto-generated
}
```

See [Time Items](/docs/concepts/timeItems) for the complete temporal data reference.

## Future: Temporal API

The factory's zero-dependency approach to date/time handling is built on `Date` and `Intl.DateTimeFormat` — APIs available in every JavaScript runtime. The [TC39 Temporal proposal](https://tc39.es/proposal-temporal/docs/) is expected to reach Stage 4 and ship in major runtimes by 2027, providing first-class support for timezone-aware dates, wall-clock times, and duration arithmetic directly in the language.

When Temporal becomes widely available, the factory's timezone utilities will be updated to use `Temporal.ZonedDateTime` and `Temporal.PlainDate` internally, providing:

- More precise DST transition handling at boundary cases
- Native duration and calendar arithmetic
- Cleaner API surface without the quirks of the legacy `Date` object

This transition will be **non-breaking** — the factory's public API (`wallClockToUTC`, `utcToWallClock`, `toEmbargoUTC`, etc.) will remain the same, with Temporal powering the implementation under the hood. The zero-dependency philosophy is maintained: Temporal is a language built-in, not a library.

## Related Documentation

- **[Time Items](/docs/concepts/timeItems)** — Temporal records on CODES document elements
- **[Embargo and Scheduled Rounds](/docs/concepts/publishing/publishing-embargo)** — Time-based visibility gates
- **[Scheduling Overview](/docs/concepts/scheduling-overview)** — Match scheduling concepts
- **[Tools API](/docs/tools/tools-api)** — Complete function reference for `dateTime` and `timeZone`
