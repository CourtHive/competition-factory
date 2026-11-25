---
title: Tools Overview
---

The **tools** module provides utility functions for working with tournament data, JSON manipulation, data conversion, and common operations used throughout the Competition Factory. These tools are available for use in both factory engines and external applications.

## Import

Import a tools domain from its own subpath, so your bundle loads that domain and nothing else:

```js
import { validateMatchUpScore, getScore } from 'tods-competition-factory/tools/scoring';
import { parse, stringify } from 'tods-competition-factory/tools/formats';
import { generateRankingList } from 'tods-competition-factory/tools/rankings';
```

Each domain has one: `tools/scoring`, `tools/formats`, `tools/matchUps`, `tools/draws`, `tools/entries`,
`tools/rankings`, `tools/publishing`, `tools/seasons`, `tools/sanctioning` and `tools/officiating`. A subpath holds
the same functions as `tools.<domain>`, under ESM, CommonJS and TypeScript (including `moduleResolution: node10`).
Bundlers read the ESM build, where a subpath loads only that domain's own modules. The CommonJS subpath reads its
domain from the main bundle, so global state such as the competition clock is shared with the rest of the package.

The aggregate `tools` export stays in 7.x. It holds every domain and the general utilities below, and importing it
loads every domain:

```js
import { tools } from 'tods-competition-factory';
```

A scoring client that needs no engine pairs `scoreGovernor` with `tools/scoring`: it bundles to about the size of
`scoreGovernor` alone, where the aggregate `tools` adds every other domain.

## Domains: stateless functions by subject

Some functions read no tournament state and take positional arguments, for example
`validateMatchUpScore(sets, matchUpFormat)` and `parse(matchUpFormatCode)`. Their home is `tools`, grouped by domain,
not a governor. A governor export becomes an engine method, and an engine calls every method with one params object,
so a positional function cannot be called correctly through an engine.

- **`tools.formats`:** matchUpFormat codes: `parse`, `stringify`, `isAggregateFormat`, `finalSetGoverns`,
  `aggregateDeciderSetNumber`, and the format validators `isValidMatchUpFormat` and `validateMatchUpFormat`, which take
  `{ matchUpFormat }` and answer whether a code is valid for new use.
- **`tools.scoring`:** score validators (`validateMatchUpScore`, `validateSetScore`, `deduceMatchUpFormat`), readers of
  a scoring-engine matchUp state (`getScore`, `getScoreboard`, `isComplete`, `getWinner`, `getEpisodes`, `addPoint`, …)
  and point and statistics parsers (`parseMCPPoint`, `shotParser`, `calculateMatchStatistics`, …).
- **`tools.publishing`:** predicates over a publish detail you hold: `isEmbargoed(detail, asOf)`,
  `isVisiblyPublished(detail, asOf)`, `getRoundVisibilityState(structureDetail, matchUps, asOf)`.
- **`tools.entries`:** entry fee helpers: `resolveEntryFee`, `getEntryFeeRange`, `isIndeterminateFee`.
- **`tools.draws`:** draw-type predicates: `isAdHocType`, `isLadder`.
- **`tools.matchUps`:** matchUp shape validators: `validMatchUp`, `validMatchUps`.
- **`tools.rankings`:** the rolling award window (`computeAwardWindow`, `isAwardInWindow`, `rollingPeriodDaysFrom`)
  that `generateRankingList` applies, `deriveRankingList`, which derives a sub-list (an age or category cut) from
  ranked entries, and the points readers `getParticipantPoints` and `getQualityWinPoints`.
- **Availability:** the availability helpers (`hhmmToMinutes`, `generateCapacityCurve`, …) are exported from the
  standalone `availability` namespace, beside `AvailabilityEngine`.

### Stateless queries that take a params object

Some governor queries take one params object and read no tournament state: a test calls each through an engine with
no record, with a record loaded, and directly, and requires the same answer. They are also on `tools`, by domain, the
same functions called the same way, so a caller that holds the values needs no engine. Their engine routes are
unchanged in 7.x.

- **`tools.scoring`:** `analyzeScore`, `analyzeSet`, `checkScoreHasValue`, `checkSetIsComplete`, `getMaxSetScore`,
  `getSetComplement`, `getTiebreakComplement`, `keyValueScore`, `repairScore`, `retainScoreForFormat`, `validateScore`,
  `mcpValidator`, `pbpValidator`.
- **`tools.formats`:** the tieFormat functions `validateTieFormat`, `compareTieFormats`,
  `tieFormatGenderValidityCheck` and `calculateWinCriteria`.
- **`tools.matchUps`:** `analyzeMatchUp`, `calculateMatchUpMargin`, `filterMatchUps`, `getCheckedInParticipantIds`,
  `getDualIssues`, `getHomeParticipantId`, `getMatchUpCheckInState`, `getMatchUpType`, `getMatchUpUpset`,
  `getRoundMatchUps`, `participantScheduledMatchUps`, `matchUpScheduleLocked`, `courtGridRows`.
- **`tools.draws`:** `getDrawTypeCoercion`, `getFeedInQualifyingPositions`, `getSeedingThresholds`, `getTally`,
  `getValidGroupSizes`, `validatePlayoffGroups`.
- **`tools.entries`:** `getEntryStatusOrdinals`, `getMaxEntryPosition`, `categoryCanContain`.
- **`tools.rankings`:** `generateRankingList`, `getParticipantPoints`, `getAwardProfile`, `getAwardPoints`,
  `getScaleValues`, `participantScaleItem`. Each refuses a missing required list with `MISSING_VALUE` (or
  `INVALID_VALUES` for one that is not a list) instead of throwing, as does `deriveRankingList`.
- **`tools.seasons`:** a box league's `getSeasonStandings`, `getSeasonMovement`, `getSeasonAdvancement`,
  `planNextPeriod`, `validateSeason`, and `getTierMovement` between two seasons.
- **`tools.sanctioning`:** `querySanctioningRecord`, `validateStatusTransition`, over a sanctioning record you hold.
- **`tools.officiating`:** `queryOfficialRecord`, `validateOfficiatingStatusTransition`, over an official record you
  hold.

`seasons`, `sanctioning` and `officiating` are domains of their own because no other domain holds them; sanctioning
and officiating are planned as separate packages. Two confirmed queries keep another name: the matchUpFormat governor's
`isValid` is `tools.formats.isValidMatchUpFormat`, and `applyDerivedRankings` is `tools.rankings.deriveRankingList`.
The score governor's `parseScoreString({ scoreString })` has no params-object counterpart:
`tools.scoring.parseScoreString(scoreString, options)` is the positional reader, whose default answers alike.

```js
import { tools } from 'tods-competition-factory';

const { isValid } = tools.scoring.validateMatchUpScore(sets, 'SET3-S:6/TB7');
const format = tools.formats.parse('SET3-S:6/TB7-F:TB10');
const valid = tools.formats.isValidMatchUpFormat({ matchUpFormat: 'SET3-S:6/TB7-F:TB10' });
const { roundMatchUps } = tools.matchUps.getRoundMatchUps({ matchUps });
```

**A clock is an input.** A tool that depends on time takes the instant to judge against as `asOf` (a `Date` or an ISO
string). In 7.x it falls back to the competition clock when omitted. In 8.0.0 the instant is required.

**A tool or a query?** A query assumes the tournament record is loaded in an engine's state. A tool takes values or
fragments you hold (a publish detail, a fee, a format code, a set of scores) and needs no engine.

In 7.x the same functions are still exported by their governors (`scoreGovernor`, `matchUpFormatGovernor`). In 8.0.0
the positional ones leave the governors and the engines: import them from `tools` (see
[migration to 8.0.0](/docs/migration-8.0.0)). For a params-object query, the
[transition index](/docs/implementation/engine-api-transition-8) records whether its engine route stays.

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
- **dehydrateMatchUps** - Return a record's matchUps (TEAM ties and their collections included) to their stored shape
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
- **firstClassOrExtension** - Read an attribute promoted from an extension, in any write mode

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
