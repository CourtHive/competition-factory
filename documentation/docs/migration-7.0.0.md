---
title: Migration 6.x to 7.0.0
---

This document is for **consumers** of the factory (TMX, courthive-components, the server, downstream
tools). It catalogues the breaking changes in 7.0.0 and the exact steps to adopt them.

## Breaking changes at a glance

| Change                                                                                   | Who is affected                        | Action required   |
| ---------------------------------------------------------------------------------------- | -------------------------------------- | ----------------- |
| `particicipantsRequiredMatchUpStatuses` renamed to `participantsRequiredMatchUpStatuses` | Anyone importing that constant by name | Rename the import |

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
