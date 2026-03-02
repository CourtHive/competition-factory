# Embargo Enforcement — Implementation Reference

## Overview

Embargo adds time-based visibility gating to the publishing system. Content marked as `published: true` with a future `embargo` timestamp is hidden from public queries until the embargo passes.

## Core Utility

**File:** `src/query/publishing/isEmbargoed.ts`

Two functions:

- `isEmbargoed(detail?: PublishingDetail): boolean` — returns `true` if `detail.embargo` is a valid future ISO timestamp
- `isVisiblyPublished(detail?: PublishingDetail): boolean` — returns `true` if `published === true` AND not embargoed

Uses `isISODateString` from `@Tools/dateTime` for validation. Compares via `new Date(embargo).getTime() > Date.now()`.

## Type

The types (defined in `src/mutate/publishing/publishEvent.ts`):

```ts
type ScheduledRoundDetail = {
  published?: boolean;
  embargo?: string; // ISO 8601 timestamp
};

type PublishingDetail = {
  scheduledRounds?: { [roundNumber: number]: ScheduledRoundDetail };
  roundLimit?: number;
  published?: boolean;
  embargo?: string; // ISO 8601 timestamp
};
```

## Enforcement Points

### Gatekeeper functions (cascade to all consumers)

| File                                         | Function               | Change                                                                                                                                                                                 |
| -------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/query/event/getDrawPublishStatus.ts`    | `getDrawPublishStatus` | Uses `isVisiblyPublished(details)` instead of `details?.published`. Added `ignoreEmbargo` param — when `true`, bypasses embargo check (used by `getPublishState` for admin reporting). |
| `src/query/publishing/getDrawIsPublished.ts` | `getDrawIsPublished`   | Uses `isVisiblyPublished(publishingDetail)` for the drawDetails path. Legacy `drawIds` path unchanged (no embargo data).                                                               |

**Cascade:** These two functions are consumed by `getEventData.drawFilter`, `getDrawData`, `getCompetitionPublishedDrawDetails`, `bulkUpdatePublishedEventIds`, and `getPublishState`. All get draw-level embargo enforcement automatically.

### Inline filters

| File                                                | Location                     | Description                                                                                                                                                                                                                                               |
| --------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/query/event/getEventData.ts`                   | `stageFilter`                | `stageDetails[stage]?.published` → `isVisiblyPublished(stageDetails[stage])`                                                                                                                                                                              |
| `src/query/event/getEventData.ts`                   | `structureFilter`            | `structureDetails[structureId]?.published` → `isVisiblyPublished(structureDetails[structureId])`                                                                                                                                                          |
| `src/query/event/getEventData.ts`                   | `roundLimitMapper`           | Now AD_HOC-only: early-returns if `drawType !== AD_HOC`. Non-AD_HOC brackets always show all rounds.                                                                                                                                                      |
| `src/query/drawDefinition/getDrawData.ts`           | line 254 filter              | `structureDetails?.published` → `isVisiblyPublished(structureDetails)`                                                                                                                                                                                    |
| `src/query/matchUps/competitionScheduleMatchUps.ts` | orderOfPlay check            | `tournamentPublishStatus?.orderOfPlay?.published` → `isVisiblyPublished(tournamentPublishStatus?.orderOfPlay)`                                                                                                                                            |
| `src/query/matchUps/competitionScheduleMatchUps.ts` | draw/stage/structure filters | All six `.published` checks → `isVisiblyPublished(...)`                                                                                                                                                                                                   |
| `src/query/matchUps/competitionScheduleMatchUps.ts` | round-level filter           | New block after stage/structure filter: enforces `roundLimit` ceiling, then `scheduledRounds` override map — unlisted rounds pass through; `published: false` hides; embargoed rounds have `schedule` stripped (set to `undefined`) but remain in results |

### Reporting (NOT filtered)

| File                                      | Function       | Change                                                                                                                                                                                                                                                     |
| ----------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/query/publishing/getPublishState.ts` | `getPubStatus` | Passes `{ ignoreEmbargo: true }` to `getDrawPublishStatus` — embargoed draws still reported as published for admin UIs.                                                                                                                                    |
| `src/query/publishing/getPublishState.ts` | main function  | Collects `embargoes` summary array from all drawDetails (publishingDetail, stageDetails, structureDetails, scheduledRounds within structureDetails) and tournament-level (orderOfPlay, participants). Attached as `publishState.embargoes` when non-empty. |

### Mutation points (accept embargo param)

| File                                          | Function     | Change                                                                                                                                |
| --------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `src/mutate/timeItems/publishOrderOfPlay.ts`  | `publishOOP` | Accepts optional `embargo` param. When provided, included in stored object: `{ published: true, scheduledDates, eventIds, embargo }`. |
| `src/mutate/timeItems/publishParticipants.ts` | `publish`    | Accepts optional `embargo` param. When provided, included: `{ published: true, embargo }`.                                            |

Draw/stage/structure embargoes are set via `publishEvent` using the existing `drawDetails` parameter — no mutation changes needed for those levels since `PublishingDetail` already included `embargo`.

## Key Design Decisions

### Why `ignoreEmbargo` in `getDrawPublishStatus`?

`getPublishState` is the admin/reporting function. If it respected embargoes, an admin who sets a future embargo would see the draw reported as "unpublished" which is incorrect. The draw IS published — it's just not publicly visible yet. Admin UIs (TMX) need to see the full publish configuration.

### Why no `isVisiblyPublished` in `getPublishState`?

Same reason. `getPublishState` reports what the publish configuration IS, not what a public visitor would see. The `embargoes` array provides admin UIs with the information to display embargo status clearly.

### Embargo expiry is query-time

There is no background process or cron job. `isEmbargoed()` compares against `Date.now()` at query time. This means visibility changes automatically when the clock passes the embargo timestamp.

## Tests

**File:** `src/tests/mutations/publishing/embargoEnforcement.test.ts`

Uses `vi.useFakeTimers()` for deterministic time control. Test cases:

1. Draw embargo (future) — hidden from `getEventData`
2. Draw embargo (past/expired) — visible
3. Draw no embargo — backward compatibility
4. Stage embargo — qualifying hidden, main visible
5. Structure embargo — specific structure hidden
6. OrderOfPlay embargo — `competitionScheduleMatchUps` returns empty `dateMatchUps`
7. Participants embargo — `getPublishState` still reports published with embargo metadata
8. `getPublishState` exposes `embargoes` array
9. Embargo expiry via fake timers — hidden then visible after time advance
10. `competitionScheduleMatchUps` stage/structure embargo filtering

## Scheduled Rounds and roundLimit Behavior Split

### roundLimit

`roundLimit` in `structureDetails` behaves differently by draw type:

- **AD_HOC draws**: filters both bracket (draw data) and schedule
- **Non-AD_HOC draws**: filters **schedule only** — bracket always shows all rounds

This split is enforced in:

- `src/query/event/getEventData.ts` — `roundLimitMapper` checks `drawType === AD_HOC` before filtering bracket rounds
- `src/query/matchUps/competitionScheduleMatchUps.ts` — `roundLimit` always filters schedule matchUps regardless of draw type

### scheduledRounds

`scheduledRounds` is a per-round **override map** within `structureDetails`:

```ts
type ScheduledRoundDetail = {
  published?: boolean;
  embargo?: string;
};

// In PublishingDetail (structureDetails values):
scheduledRounds?: { [roundNumber: number]: ScheduledRoundDetail };
```

**Semantics:** `scheduledRounds` is an override map, not an allowlist. Rounds **not listed** pass through normally. Only rounds with an explicit entry are affected:

- **Unlisted round** → passes through (included in results with full schedule)
- **`{ published: false }`** → hidden (matchUp removed from results)
- **`{ published: true }` (no embargo or expired)** → passes through normally
- **`{ published: true, embargo: FUTURE }`** → matchUp included in results but `schedule` set to `undefined` (schedule data stripped until embargo passes)

**Enforcement points:**

| File                                                | What it does                                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `src/query/matchUps/competitionScheduleMatchUps.ts` | Filters schedule matchUps by `roundLimit` ceiling + `scheduledRounds` override map; strips `schedule` on embargoed rounds |
| `src/query/publishing/getPublishState.ts`           | Collects `type: 'scheduledRound'` entries in the `embargoes` array                                                        |

**Interaction:** `roundLimit` is the ceiling. `scheduledRounds` provides overrides within the ceiling. When `scheduledRounds` is absent, all rounds up to `roundLimit` appear.

### Tests

**File:** `src/tests/mutations/publishing/scheduledRoundsPublishing.test.ts`

Uses `vi.useFakeTimers()` for deterministic time control. Test cases:

1. roundLimit on non-AD_HOC does NOT filter bracket
2. roundLimit on AD_HOC still filters bracket (regression)
3. roundLimit filters schedule for all draw types
4. scheduledRounds basic — explicitly unpublished rounds hidden, unlisted pass through
5. scheduledRounds with embargo — embargoed round returned without schedule, unlisted rounds pass through
6. scheduledRounds + roundLimit interaction — roundLimit caps, scheduledRounds overrides within
7. No scheduledRounds falls back to roundLimit
8. getPublishState exposes scheduledRound embargoes
9. Full AD_HOC workflow — progressive schedule publishing with embargo and schedule stripping
10. Embargoed round has schedule stripped but matchUp is returned

## Documentation

- **Concepts:** `documentation/docs/concepts/publishing/publishing-embargo.md` — Embargo and Scheduled Rounds
- **API Reference:** `documentation/docs/governors/publishing-governor.md` — embargo params on `publishEvent`, `publishOrderOfPlay`, `publishParticipants`, `getPublishState`; `scheduledRounds` in `publishEvent` structureDetails
- **Query Reference:** `documentation/docs/governors/query-governor.md` — embargo notes on `getEventData`, `competitionScheduleMatchUps`; round-level filtering
