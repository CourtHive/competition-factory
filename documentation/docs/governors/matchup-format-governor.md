---
title: matchUpFormat Governor
---

```js
import { matchUpFormatGovernor } from 'tods-competition-factory';
```

The **matchUpFormatGovernor** provides utilities for parsing, validating, and generating matchUp format codes. These format codes define scoring rules for matches (sets, games, tiebreaks, timed sets, etc.) across any sport.

**See also:** [matchUpFormat Codes](/docs/codes/matchup-format) for the complete format specification, grammar reference, and cross-sport format examples.

**Format Code Examples:**

- `SET3-S:6/TB7` - Best of 3 sets, first to 6 games, tiebreak to 7 at 6-6
- `SET5-S:6/TB7-F:6/TB10` - Best of 5 sets, final set tiebreak to 10
- `SET1-S:4/TB7@3` - Single set to 4 games, tiebreak to 7 at 3-3
- `T20` - 20-minute timed set (games-based)
- `T10P` - 10-minute timed set (points-based)
- `SET3-S:TB11@RALLY` - Pickleball: best of 3 to 11, rally scoring
- `HAL2A-S:T45` - Soccer: 2 halves of 45 min, aggregate
- `SET5-S:5-G:3C` - TYPTI: 5 sets to 5, 3 consecutive points per game
- `SET7XA-S:T10P` - INTENNSE: exactly 7 timed sets, aggregate, points-based
- `INN4XA-S:O3-M:T50` - BLW Wiffle Ball: 4 innings, 3 outs, aggregate, 50-min match cap

---

## parse

Parses a matchUp format code string into a structured object representation.

**Purpose:** Convert a compact format code string into a detailed object that describes all scoring rules. This enables programmatic access to scoring parameters.

**When to Use:**

- Validating match format codes
- Extracting scoring rules from format strings
- Building scoring interfaces that need to understand format details
- Converting between format representations
- Analyzing tournament format requirements

**Parameters:**

```ts
matchUpFormatCode: string; // CODES format code (e.g., "SET3-S:6/TB7")
```

**Returns:**

```ts
{
  bestOf?: number;           // Best of N sets (e.g., 3 for best of 3)
  exactly?: number;          // Exactly N sets (for formats like SET3X)
  matchRoot?: string;        // Root type, only present for non-SET roots (e.g., 'HAL', 'QTR', 'PER', 'RND', 'FRM', 'MAP')
  aggregate?: boolean;       // True when match-level A modifier is present
  matchMods?: string[];      // Unknown modifier letters for forward compatibility
  setFormat?: {
    setTo: number;           // Games to win set (e.g., 6)
    tiebreakAt?: number;     // When tiebreak starts (e.g., 6 for 6-6)
    tiebreakFormat?: {
      tiebreakTo: number;    // Points to win tiebreak (e.g., 7)
      NoAD?: boolean;        // No-advantage tiebreak
      modifier?: string;     // Custom tiebreak modifier
    };
    tiebreakSet?: {          // Mutually exclusive with setTo/tiebreakFormat
      tiebreakTo: number;    // Points to win tiebreak set
      NoAD?: boolean;
      modifier?: string;     // e.g., 'RALLY' for pickleball
    };
    noTiebreak?: boolean;    // Set has no tiebreak
    NoAD?: boolean;          // No-advantage games (no deuce)
    winBy?: number;          // Game-margin override on no-tiebreak sets (WB1); elided when 2 (default)
    timed?: boolean;         // Is this a timed set?
    minutes?: number;        // Minutes for timed set
    based?: string;          // Scoring basis: 'G' (games), 'P' (points)
    outs?: number;           // Outs per team per inning (e.g., 3 for baseball/wiffle ball)
  };
  finalSetFormat?: {         // Same structure as setFormat, for final set
    // ... (all setFormat properties)
  };
  gameFormat?: {             // Game-level format specification (-G: section)
    type: 'TRADITIONAL';     // Traditional tennis/padel game scoring (0-15-30-40)
    deuceAfter?: number;     // Deuce cap: 1=golden point, 3=Star Point, undefined=unlimited
  } | {
    type: 'CONSECUTIVE';     // Consecutive points to win a game
    count: number;           // Number of consecutive points required
    deuceAfter?: number;     // Optional deuce cap
  };
  matchUpConstraint?: {      // Match-level constraint (-M: section)
    timed: boolean;          // Whether match has a time cap
    minutes: number;         // Match time cap in minutes
  };
  simplified?: boolean;      // True for single-set formats like "T20"
} | undefined                // undefined if parsing fails
```

**Examples:**

```js
// Parse standard tennis format
const parsed = matchUpFormatGovernor.parse('SET3-S:6/TB7');
// {
//   bestOf: 3,
//   setFormat: {
//     setTo: 6,
//     tiebreakAt: 6,
//     tiebreakFormat: { tiebreakTo: 7 }
//   }
// }

// Parse with final set variation
const parsed = matchUpFormatGovernor.parse('SET5-S:6/TB7-F:6/TB10');
// {
//   bestOf: 5,
//   setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
//   finalSetFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 10 } }
// }

// Parse timed set
const parsed = matchUpFormatGovernor.parse('T20');
// {
//   bestOf: 1,
//   simplified: true,
//   setFormat: { timed: true, minutes: 20 }
// }

// Parse short set with early tiebreak
const parsed = matchUpFormatGovernor.parse('SET1-S:4/TB7@3');
// {
//   bestOf: 1,
//   setFormat: { setTo: 4, tiebreakAt: 3, tiebreakFormat: { tiebreakTo: 7 } }
// }

// Parse pickleball with rally scoring
const parsed = matchUpFormatGovernor.parse('SET3-S:TB11@RALLY');
// {
//   bestOf: 3,
//   setFormat: { tiebreakSet: { tiebreakTo: 11, modifier: 'RALLY' } }
// }

// Parse non-SET root (soccer)
const parsed = matchUpFormatGovernor.parse('HAL2A-S:T45');
// {
//   matchRoot: 'HAL',
//   bestOf: 2,
//   aggregate: true,
//   setFormat: { timed: true, minutes: 45 }
// }

// Parse with game format (TYPTI)
const parsed = matchUpFormatGovernor.parse('SET5-S:5-G:3C');
// {
//   bestOf: 5,
//   setFormat: { setTo: 5, noTiebreak: true },
//   gameFormat: { type: 'CONSECUTIVE', count: 3 }
// }

// Parse INTENNSE format
const parsed = matchUpFormatGovernor.parse('SET7XA-S:T10P');
// {
//   exactly: 7,
//   aggregate: true,
//   setFormat: { timed: true, minutes: 10, based: 'P' }
// }

// Parse Padel Star Point format
const parsed = matchUpFormatGovernor.parse('SET3-S:6/TB7-G:TN3D');
// {
//   bestOf: 3,
//   setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
//   gameFormat: { type: 'TRADITIONAL', deuceAfter: 3 }
// }

// Parse explicit traditional game format
const parsed = matchUpFormatGovernor.parse('SET3-S:6/TB7-G:TN');
// {
//   bestOf: 3,
//   setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
//   gameFormat: { type: 'TRADITIONAL' }
// }

// Parse outs-based format (wiffle ball)
const parsed = matchUpFormatGovernor.parse('INN4XA-S:O3-M:T50');
// {
//   matchRoot: 'INN',
//   exactly: 4,
//   aggregate: true,
//   setFormat: { outs: 3 },
//   matchUpConstraint: { timed: true, minutes: 50 }
// }

// Parse match constraint with tennis format
const parsed = matchUpFormatGovernor.parse('SET3-S:6/TB7-M:T120');
// {
//   bestOf: 3,
//   setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
//   matchUpConstraint: { timed: true, minutes: 120 }
// }

// Invalid format returns undefined
const parsed = matchUpFormatGovernor.parse('INVALID');
// undefined
```

**Notes:**

- Returns `undefined` for invalid format codes
- Supports standard sets, timed sets, and tiebreak sets
- Handles special cases like no-advantage (NoAD) games and tiebreaks
- Timed sets can be games-based (G) or points-based (P); aggregate scoring is signaled by the match-level `A` modifier
- `matchRoot` is only included when the root is not `SET` (backward compatibility)
- `aggregate` is only included when `true`
- Sections (`-S:`, `-F:`, `-G:`, `-M:`) are dispatched by key, not by position, so order doesn't matter
- For `SET` root, `bestOf` must be < 6 (for non-timed formats); non-`SET` roots have no limit
- Format grammar: `{ROOT}{count}[X][A]-S:{setSpec}[-G:{gameSpec}][-F:{setSpec}][-M:{matchConstraint}]`
- Outs-based set format (`-S:O3`) is for innings-based sports (baseball, wiffle ball)
- Match constraint (`-M:T50`) sets a match-level time cap that applies across all segments
- Timed format: `T{minutes}[G|P][/TB{points}]`
- See [matchUpFormat Codes](/docs/codes/matchup-format) for complete format specification and cross-sport examples

---

## stringify

Converts a parsed matchUp format object back into a compact format code string.

**Purpose:** Generate a standard CODES format code from a structured format object. This is the inverse operation of `parse()` and is useful for creating format codes programmatically.

**When to Use:**

- Creating format codes from UI inputs
- Normalizing format representations
- Generating format codes for storage or transmission
- Validating format consistency (parse → modify → stringify)
- Converting between format representations

**Parameters:**

```ts
matchUpFormatObject: {       // Parsed format object
  bestOf?: number;
  exactly?: number;
  matchRoot?: string;        // Non-SET root type (e.g., 'HAL', 'QTR', 'INN')
  aggregate?: boolean;       // Include A suffix in head
  setFormat?: object;        // Includes outs for -S:O{n}
  finalSetFormat?: object;
  gameFormat?: {             // Emit -G: section
    type: 'TRADITIONAL' | 'CONSECUTIVE';
    count?: number;          // Required when type is 'CONSECUTIVE'
    deuceAfter?: number;     // Optional deuce cap (e.g., 3 for Star Point)
  };
  matchUpConstraint?: {      // Emit -M: section
    timed: boolean;          // Whether match has a time cap
    minutes: number;         // Match time cap in minutes
  };
  simplified?: boolean;
};
preserveRedundant?: boolean; // Keep redundant tiebreakAt values (default: false)
```

**Returns:**

```ts
string | undefined; // Format code string, or undefined if invalid
```

**Examples:**

```js
// Stringify standard format
const formatString = matchUpFormatGovernor.stringify({
  bestOf: 3,
  setFormat: {
    setTo: 6,
    tiebreakAt: 6,
    tiebreakFormat: { tiebreakTo: 7 },
  },
});
// "SET3-S:6/TB7"

// Stringify with final set variation
const formatString = matchUpFormatGovernor.stringify({
  bestOf: 5,
  setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
  finalSetFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 10 } },
});
// "SET5-S:6/TB7-F:6/TB10"

// Stringify timed set
const formatString = matchUpFormatGovernor.stringify({
  bestOf: 1,
  simplified: true,
  setFormat: { timed: true, minutes: 20 },
});
// "T20"

// Stringify with non-SET root (soccer)
const formatString = matchUpFormatGovernor.stringify({
  matchRoot: 'HAL',
  bestOf: 2,
  aggregate: true,
  setFormat: { timed: true, minutes: 45 },
});
// "HAL2A-S:T45"

// Stringify with game format (TYPTI)
const formatString = matchUpFormatGovernor.stringify({
  bestOf: 5,
  setFormat: { setTo: 5, noTiebreak: true },
  gameFormat: { type: 'CONSECUTIVE', count: 3 },
});
// "SET5-S:5-G:3C"

// Stringify Padel Star Point format
const formatString = matchUpFormatGovernor.stringify({
  bestOf: 3,
  setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
  gameFormat: { type: 'TRADITIONAL', deuceAfter: 3 },
});
// "SET3-S:6/TB7-G:TN3D"

// Stringify INTENNSE format
const formatString = matchUpFormatGovernor.stringify({
  exactly: 7,
  aggregate: true,
  setFormat: { timed: true, minutes: 10, based: 'P' },
});
// "SET7XA-S:T10P"

// Stringify with early tiebreak (redundant tiebreakAt omitted by default)
const formatString = matchUpFormatGovernor.stringify({
  bestOf: 1,
  setFormat: { setTo: 4, tiebreakAt: 3, tiebreakFormat: { tiebreakTo: 7 } },
});
// "SET1-S:4/TB7@3"

// Preserve redundant tiebreakAt (when tiebreakAt equals setTo)
const formatString = matchUpFormatGovernor.stringify(
  {
    bestOf: 1,
    setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
  },
  true,
);
// "SET1-S:6/TB7@6" (with preserveRedundant: true)

// Without preserveRedundant, @6 is omitted
const formatString = matchUpFormatGovernor.stringify({
  bestOf: 1,
  setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
});
// "SET1-S:6/TB7" (default behavior)

// Stringify outs-based format (wiffle ball)
const formatString = matchUpFormatGovernor.stringify({
  matchRoot: 'INN',
  exactly: 4,
  aggregate: true,
  setFormat: { outs: 3 },
  matchUpConstraint: { timed: true, minutes: 50 },
});
// "INN4XA-S:O3-M:T50"

// Stringify with match constraint on tennis format
const formatString = matchUpFormatGovernor.stringify({
  bestOf: 3,
  setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
  matchUpConstraint: { timed: true, minutes: 120 },
});
// "SET3-S:6/TB7-M:T120"
```

**Notes:**

- Returns `undefined` for invalid format objects
- By default, omits `@{at}` when `tiebreakAt` equals `setTo` (standard case)
- Set `preserveRedundant: true` to include `@{at}` even when it matches `setTo`
- Automatically omits final set format if identical to standard set format
- Single-set timed formats (T20, T10P) use simplified representation
- `bestOf: 1` and `exactly: 1` both stringify to `SET1` (no X suffix)
- Games-based timed sets omit the 'G' suffix (it's the default)
- `matchRoot` defaults to `SET` when not specified
- `aggregate: true` adds the `A` suffix after the count (e.g., `HAL2A`)
- `gameFormat` emits the `-G:` section (e.g., `-G:3C`, `-G:TN3D`)
- `matchUpConstraint` emits the `-M:` section (e.g., `-M:T50`)
- `setFormat.outs` emits outs-based segment format (e.g., `-S:O3`)
- Head modifier ordering is canonical: count → X → A (e.g., `SET7XA`)
- See [matchUpFormat Codes](/docs/codes/matchup-format) for the complete format grammar

---

## isValid / isValidMatchUpFormat

Validates whether a format code string is properly formed and can be successfully parsed and round-tripped.

**Purpose:** Verify that a format code string conforms to CODES specification. This ensures the format can be used reliably throughout the system.

**When to Use:**

- Validating user input for match formats
- Checking format codes before storing
- Verifying format codes from external sources
- Form validation in tournament setup
- Catching malformed format strings early

**Parameters:**

```ts
{
  matchUpFormat: string; // Format code to validate
}
```

**Returns:**

```ts
boolean; // true if valid, false if invalid
```

**Validation Logic:**
The format is considered valid if:

1. It can be successfully parsed
2. When stringified again, it matches the original (round-trip test)
3. The 'G' suffix on timed-basis sets (e.g., `T10G`) is normalized before comparison

**Examples:**

```js
// Valid standard formats
matchUpFormatGovernor.isValidMatchUpFormat({
  matchUpFormat: 'SET3-S:6/TB7',
}); // true

matchUpFormatGovernor.isValidMatchUpFormat({
  matchUpFormat: 'SET5-S:6/TB7-F:6/TB10',
}); // true

// Valid timed formats
matchUpFormatGovernor.isValidMatchUpFormat({
  matchUpFormat: 'T20',
}); // true

matchUpFormatGovernor.isValidMatchUpFormat({
  matchUpFormat: 'T20G',
}); // true (games-based, G is optional)

// Valid multi-root formats
matchUpFormatGovernor.isValidMatchUpFormat({
  matchUpFormat: 'HAL2A-S:T45',
}); // true (soccer)

matchUpFormatGovernor.isValidMatchUpFormat({
  matchUpFormat: 'QTR4A-S:T12',
}); // true (basketball)

matchUpFormatGovernor.isValidMatchUpFormat({
  matchUpFormat: 'RND12A-S:T3',
}); // true (boxing)

// Valid game format sections
matchUpFormatGovernor.isValidMatchUpFormat({
  matchUpFormat: 'SET5-S:5-G:3C',
}); // true (TYPTI)

matchUpFormatGovernor.isValidMatchUpFormat({
  matchUpFormat: 'SET3-S:6/TB7-G:TN3D',
}); // true (Padel Star Point)

// Valid outs-based and match constraint formats
matchUpFormatGovernor.isValidMatchUpFormat({
  matchUpFormat: 'INN4XA-S:O3-M:T50',
}); // true (BLW Wiffle Ball)

matchUpFormatGovernor.isValidMatchUpFormat({
  matchUpFormat: 'SET3-S:6/TB7-M:T120',
}); // true (tennis with match time cap)

// Valid pickleball formats
matchUpFormatGovernor.isValidMatchUpFormat({
  matchUpFormat: 'SET3-S:TB11@RALLY',
}); // true

// Invalid formats
matchUpFormatGovernor.isValidMatchUpFormat({
  matchUpFormat: 'INVALID',
}); // false

matchUpFormatGovernor.isValidMatchUpFormat({
  matchUpFormat: 'SET3-S:5-G:INVALID',
}); // false (unknown game format)

matchUpFormatGovernor.isValidMatchUpFormat({
  matchUpFormat: 'SET3-S:5-G:3C-G:4C',
}); // false (duplicate -G: section)

matchUpFormatGovernor.isValidMatchUpFormat({
  matchUpFormat: '',
}); // false (empty string)
```

**Notes:**

- Performs round-trip validation (parse → stringify → compare)
- Empty strings return `false`
- Non-string values return `false`
- The 'G' suffix on timed sets is stripped during validation (games-based is default), but only the timed-basis `G` (e.g., `T10G`), not the `-G:` section key
- NoAD (no-advantage) is supported for both games and tiebreaks
- Format must follow the grammar exactly
- Both `isValid` and `isValidMatchUpFormat` are available (same function, different export names)
- All [match root types](/docs/codes/matchup-format#match-root-types) are validated
- See [matchUpFormat Codes](/docs/codes/matchup-format) for the complete format specification

---
