# DST-Safe Date Iteration in TemporalEngine

## Overview

`TemporalEngine.getTournamentDays()` generates the list of calendar days for a
tournament. It handles Daylight Saving Time (and other time-change) boundaries
correctly so that tournaments spanning a clock change never produce duplicate or
missing days.

## The Problem

JavaScript's `Date` constructor treats date-only strings as **UTC midnight**:

```js
new Date("2026-03-08")  // → 2026-03-08T00:00:00.000Z (UTC)
```

But `getDate()`, `setDate()`, and other accessors operate in **local time**.
When DST Spring Forward occurs (e.g. US clocks jump ahead on 2026-03-08), this
mismatch causes a bug:

```
Iteration step:
  internal UTC value = 2026-03-08T00:00:00Z
  local time         = 2026-03-07T19:00:00-05:00  (EST, before spring forward)

  setDate(getDate() + 1):
    getDate() returns 7 (local Mar 7)
    setDate(8) → local 2026-03-08T00:00:00-04:00 (EDT, after spring forward)
              → UTC   2026-03-08T04:00:00Z

  toISOString().slice(0,10) → "2026-03-08"  ← duplicate!
```

The result: **"2026-03-08" appears twice** and the final day of the tournament
is missing entirely. For a 15-day tournament (Mar 3–17), only 14 unique days
were generated, with Mar 8 duplicated and Mar 17 absent.

This caused visible rendering bugs in the temporal grid — the duplicated day
got double the column width, darker availability shading, and a white gap.

## The Fix

Two changes, both essential:

### 1. Parse as local midnight

```ts
// Before (UTC midnight):
const current = new Date("2026-03-08");

// After (local midnight):
const current = new Date("2026-03-08T00:00:00");
```

Appending `T00:00:00` triggers ISO 8601 date-time parsing, which JavaScript
interprets as local time (no timezone offset = local). This keeps the internal
representation aligned with the local timezone throughout iteration.

### 2. Format using local date components

```ts
// Before (UTC-based):
days.push(current.toISOString().slice(0, 10));

// After (local-based):
const y = current.getFullYear();
const m = String(current.getMonth() + 1).padStart(2, '0');
const d = String(current.getDate()).padStart(2, '0');
days.push(`${y}-${m}-${d}`);
```

`toISOString()` converts back to UTC before stringifying, reintroducing the
same offset that caused the original bug. Using local accessors
(`getFullYear`, `getMonth`, `getDate`) keeps everything in the same timezone.

## Why `setDate(getDate() + 1)` Still Works

`Date.setDate()` handles month/DST rollovers correctly when the Date object
is already in local time. On spring-forward day, setting date+1 advances by
one calendar day (the 23-hour day), and `getDate()` returns the correct local
date the next morning. The key is that both sides — parsing and formatting —
must agree on the timezone. The bug only manifested when parsing was UTC but
formatting was local (or vice versa).

## Reference

The factory's `generateDateRange()` in `src/utilities/dateTime.ts` already
used the correct pattern (`T00:00` suffix + local formatting). This fix
aligns `getTournamentDays()` with that established approach.
