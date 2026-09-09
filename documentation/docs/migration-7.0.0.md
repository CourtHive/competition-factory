---
title: Migration 6.x to 7.0.0
---

This document is for **consumers** of the factory (TMX, courthive-components, the server, downstream
tools). It catalogues the breaking changes in 7.0.0 and the exact steps to adopt them.

## Breaking changes at a glance

| Change                                                                                              | Who is affected                        | Action required        |
| --------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------- |
| `particicipantsRequiredMatchUpStatuses` renamed to `participantsRequiredMatchUpStatuses`            | Anyone importing that constant by name | Rename the import      |
| `tools.timeZone.getTimeZoneOffsetMinutes` now returns `number \| undefined`                         | Anyone reading a zone offset           | Handle `undefined`     |
| `wallClockToUTC` / `utcToWallClock` / `toEmbargoUTC` return `{ error }` where they previously threw | Anyone wrapping these in `try`/`catch` | Check the return value |

## 1. `participantsRequiredMatchUpStatuses` — a spelling fix

The exported constant was misspelled **`particicipantsRequiredMatchUpStatuses`** (an extra `ici`)
since it was introduced. It is a published top-level export, so correcting it is a breaking change
and 7.0.0 is the first opportunity to make it.

```diff
- import { particicipantsRequiredMatchUpStatuses } from 'tods-competition-factory';
+ import { participantsRequiredMatchUpStatuses } from 'tods-competition-factory';
```

### What to do

Rename the import. Nothing else changes — the value, the type and the semantics are identical. The
constant lists the `matchUpStatus` values that require participants to be present on the matchUp,
and it is consumed internally by `setMatchUpState`.

**No deprecated alias is provided.** Keeping one would preserve the misspelling in the public API
indefinitely, which is the thing this release exists to fix. A survey of the CourtHive ecosystem
found no consumer importing the old name, so the practical migration cost is zero.

## 2. `tools.timeZone` — failures are values, not throws

The zoned conversion helpers had two implementations in the factory: a public one (`tools.timeZone`)
and an internal one that carried every live conversion. They were **numerically identical** on valid
input — a sweep of 420,480 wall clocks across 12 zones and every day of 2026 found zero disagreements,
including both DST boundaries — but they disagreed entirely on how they failed. 7.0.0 consolidates them
onto one implementation, now also exported as
[`tools.zonedDateTime`](/docs/tools/tools-api#toolszoneddatetime).

Nothing changes for a call that succeeds. What changes is what a _failing_ call does.

### `getTimeZoneOffsetMinutes` returns `number | undefined`

```diff
- const offset = tools.timeZone.getTimeZoneOffsetMinutes(timeZone);
+ const offset = tools.timeZone.getTimeZoneOffsetMinutes(timeZone);
+ if (offset === undefined) return; // unrecognised or absent zone
```

Previously it **threw an uncaught `RangeError`** for an unrecognised zone, from a function typed
`number`. Worse, calling it with no zone at all returned **the host machine's UTC offset**, so the same
call answered differently on a server in New York and one in London. Neither behaviour was documented
or tested, so no correct caller can have depended on it.

### Three functions return `{ error }` instead of throwing

`wallClockToUTC`, `utcToWallClock` and `toEmbargoUTC` are typed
`string | { error: … }`, but a malformed date or time escaped as a `RangeError` rather than the error
object the signature promised. They now return one, and distinguish the cause:

```js
tools.timeZone.wallClockToUTC('2026-06-20', '03:00', 'Invalid/Zone'); // { error: INVALID_TIME_ZONE }
tools.timeZone.wallClockToUTC('not-a-date', '03:00', 'America/New_York'); // { error: INVALID_DATE }
tools.timeZone.wallClockToUTC('2026-06-20', 'noon', 'America/New_York'); // { error: INVALID_TIME }
```

### What to do about the throws

If you wrapped any of these in a `try`/`catch`, the `catch` is now dead code — check the return value
instead. If you did not wrap them, you had an unhandled crash path and now have a value to branch on.

A survey of the CourtHive ecosystem found **zero** consumers of `tools.timeZone`, so the practical
migration cost is zero. The change is released as breaking because the published types change, not
because a known consumer breaks.

### An unrecognised zone is now refused, not substituted

The internal implementation used to fall back to a caller-supplied fixed offset when it did not
recognise a zone. That silently answered in a different frame: in the recovery-time report it turned a
90-minute figure into 330 minutes, still labelled as measured. A zone the system cannot honour is now
refused everywhere.

`tools.zonedDateTime` makes the frame explicit rather than leaving it to be assumed:

| `timeZone`            | result                                      | `source`   |
| --------------------- | ------------------------------------------- | ---------- |
| absent                | the caller's `utcOffsetMinutes` (default 0) | `'offset'` |
| present, unrecognised | refused                                     | —          |
| present, recognised   | resolved per instant                        | `'zone'`   |
