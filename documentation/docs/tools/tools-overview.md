---
title: Tools Overview
---

The **tools** module provides utility functions for working with tournament data, JSON manipulation, data conversion, and common operations used throughout the Competition Factory. These tools are available for use in both factory engines and external applications.

## Import

```js
import { tools } from 'tods-competition-factory';
```

## Categories

### Data Transformation

**[makeDeepCopy](./make-deep-copy.md)** - Deep copy JSON objects with optional extension conversion and configurable copying behavior.

**[JSON2CSV](./json-to-csv.mdx)** - Convert arrays of JSON objects to CSV format with column mapping, transformations, and custom delimiters.

**[structureSort](./structure-sort.md)** - Sort draw structures by stage, size, and sequence for consistent ordering.

### Data Manipulation

- **chunkArray** - Split arrays into chunks of specified size
- **shuffleArray** - Randomly shuffle array elements
- **randomMember** - Select a random element from an array
- **randomPop** - Remove and return a random element from an array
- **unique** - Extract unique values from an array
- **intersection** - Find common elements between arrays
- **overlap** - Check if arrays have overlapping elements

### Object Utilities

- **extractAttributes** - Extract specific attributes from objects
- **definedAttributes** - Get only defined (non-undefined) attributes
- **hasAttributeValues** - Check if object has specified attribute values
- **instanceCount** - Count occurrences of values in collections
- **countValues** - Count occurrences with value mapping

### Validation & Checking

- **isConvertableInteger** - Check if value can convert to integer
- **isPowerOf2** - Check if number is a power of 2
- **nearestPowerOf2** - Find nearest power of 2 to a number
- **nextPowerOf2** - Find next power of 2 greater than number
- **categoryCanContain** - Validate if one category can contain another (age ranges, ball types, etc.)
- **tieFormatGenderValidityCheck** - Validate tie format against gender requirements
- **validateTieFormat** - Comprehensive tie format validation

### ID & Code Generation

- **UUID** - Generate unique identifiers
- **UUIDS** - Generate multiple unique identifiers at once
- **generateHashCode** - Generate hash codes from strings
- **generateTimeCode** - Generate time-based codes

### Date & Time

- **dateTime** - Date and time manipulation utilities (formatting, parsing, validation)
- **dateTime.isValidEmbargoDate** - Validate that an embargo string includes timezone context
- **generateDateRange** - Create arrays of dates within a range
- **getTimeItem** - Extract time items from [CODES](/docs/data-standards#codes) objects
- **generateRange** - Generate numeric ranges

### Timezone

- **timeZone.isValidIANATimeZone** - Validate IANA timezone identifiers (e.g. `'America/New_York'`)
- **timeZone.getTimeZoneOffsetMinutes** - Get DST-aware UTC offset for a timezone at a given instant
- **timeZone.wallClockToUTC** - Convert wall-clock date/time at a timezone to a UTC ISO string
- **timeZone.utcToWallClock** - Convert a UTC ISO string to wall-clock date/time at a timezone
- **timeZone.toEmbargoUTC** - Convert wall-clock time to a validated UTC embargo string

See [Date and Time Handling](/docs/concepts/date-time-handling) for usage patterns and the complete date/time/timezone story.

### Scoring & Match Data

- **generateScoreString** - Create formatted score strings
- **parseScoreString** - Parse score strings into structured data
- **checkScoreHasValue** - Verify scores contain values
- **matchUpSort** - Sort matchUps by various criteria
- **matchUpChronologicalSort** - Sort matchUps by `(scheduledDate, scheduledTime)`, no-op when either side lacks the field
- **dehydrateMatchUps** - Remove computed attributes from matchUps
- **visualizeScheduledMatchUps** - Color-coded console display of schedules

### Extensions & Metadata

- **addExtension** - Add extensions to CODES objects with validation
- **findExtension** - Locate extensions by name
- **getScaleValues** - Extract scale values (rankings, ratings) from participants

### Tournament Utilities

- **calculateWinCriteria** - Determine win requirements for structures
- **roundRobinGroups** - Generate round robin group configurations
- **createMap** - Create lookup maps from object arrays
- **isAdHoc** - Check if matchUp is ad-hoc (not in main draw)

## Complete API Reference

For a comprehensive list of all available tools with signatures, see the **[Tools API](./tools-api.md)** page.

## Usage Patterns

### Simple Utilities

```js
import { tools } from 'tods-competition-factory';

// Generate unique ID
const id = tools.UUID();

// Get unique values
const uniqueRoundNumbers = tools.unique(matchUps.map((m) => m.roundNumber));

// Check power of 2
const valid = tools.isPowerOf2(drawSize); // true for 8, 16, 32, etc.
```

### Data Conversion

```js
// Convert matchUps to CSV
const matchUpsCSV = tools.JSON2CSV(matchUps, {
  columnAccessors: ['matchUpId', 'roundNumber', 'winningSide'],
  columnMap: { matchUpId: 'Match ID', roundNumber: 'Round' },
});

// Deep copy with extension flattening
const copy = tools.makeDeepCopy(participant, true); // convertExtensions = true
```

### Validation

```js
// Check if U16 category can be in U18 event
const { valid } = tools.categoryCanContain({
  category: { ageCategoryCode: 'U18' },
  childCategory: { ageCategoryCode: 'U16' },
});
```

## Key Features

- **No Side Effects**: Tools are pure functions that don't modify inputs
- **CODES Compliance**: Built for CODES data structures but usable with any JSON
- **Flexible Configuration**: Most tools accept optional configuration objects
- **Type Safety**: Written in TypeScript with full type definitions
- **Well-Tested**: Comprehensive test coverage across all utilities

## When to Use Tools

**Use tools when you need to:**

- Convert or transform tournament data
- Validate tournament structures or configurations
- Generate test data or identifiers
- Parse or format scores and dates
- Sort or filter tournament objects

**Don't use tools for:**

- Modifying tournament state (use engines/governors instead)
- Querying tournament records (use query governor methods)
- Mutating tournaments (use mutation engines)

Tools are **read-only utilities** for data manipulation and validation. For state changes, use the appropriate engine methods.

---
