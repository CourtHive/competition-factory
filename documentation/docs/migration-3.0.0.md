---
title: Migration 2.x to 3.x
---

Version 3.0 of the Competition Factory marks the formal transition from **TODS** (Tennis Open Data Standards) to **CODES** (Competition Open Data Exchange Standards). CODES is a superset of TODS — any valid TODS document remains a valid CODES document — and the rename reflects that the factory's underlying data structures (participants, events, draws, matchUps, scoring) are not tennis-specific and translate naturally to any bracket-based competition sport.

Between 2.4.5 and 3.0 the factory grew four production engines (Sanctioning, Officiating, Temporal, Scoring), a multi-sport `matchUpFormat` grammar, new draw types (PAGE_PLAYOFF, Swiss, ADAPTIVE), a HYBRID event type, draft draws, mutation locks, embargo-aware publishing, and a comprehensive ranking points pipeline on the Scale Engine. This document focuses on the **breaking changes** consumers must reckon with on upgrade and points at the new functional surface they can adopt.

## Breaking changes

### `CUSTOM` drawType removed

The `CUSTOM` drawType constant is gone from `drawDefinitionConstants`. Any code importing `CUSTOM` or using `'CUSTOM'` as a `drawType` value will break. Use `ADAPTIVE` for flexible draw structures.

### `PLAY_OFF` vs `PLAYOFF` — distinct constants

`PLAY_OFF` (with underscore) is now exclusively a **stage type**. A new `PLAYOFF` (no underscore) constant is the correct **draw type**. Code that used `PLAY_OFF` as a drawType — including checks against `MULTI_STRUCTURE_DRAWS` — must switch to `PLAYOFF`.

### `tidyScore` / scoreParser module extracted

The entire `src/helpers/scoreParser/` module (`tidyScore`, ~2,700 lines, 22 files) has been moved to a separate package. Any code calling `tidyScore()` through `scoreGovernor` must migrate to that standalone package.

### `entryProfile` extension removed

The `ENTRY_PROFILE` extension on draw definitions has been removed entirely. It previously stored per-stage capacity constraints (`drawSize`, `qualifiersCount`, `wildcardsCount`, `alternates`) as a byproduct of draw generation. Draw composition is now driven by sanctioning constraints (see Sanctioning Engine below) and structural facts.

- `ENTRY_PROFILE` removed from `extensionConstants`
- `getEntryProfile()`, `modifyEntryProfile()` deleted
- `setStageDrawSize()`, `setStageAlternatesCount()`, `setStageWildcardsCount()`, `setStageQualifiersCount()` deleted

**Migration:**

- Pass `drawSize` / `qualifiersCount` directly to `generateDrawDefinition` (or `generateDrawTypeAndModifyDrawDefinition`) instead of mutating an entryProfile first
- Read draw size via `getStageDrawPositionsCount({ stage, drawDefinition })` — it now derives from `positionAssignments.length` on the structure
- Read qualifier count via `getQualifiersCount({ drawDefinition, structureId, stage })` — derives entirely from links, no entryProfile fallback
- `stageAlternatesCount()` and `getStageWildcardsCount()` read from sanctioning constraints; **unsanctioned draws are unconstrained** — no composition limits apply without sanctioning
- `getValidStage()` checks structure existence, not entryProfile existence

### `generateVoluntaryConsolation` — local attachment removed

The function no longer supports local attachment. Update integrations that relied on this path.

### `FORMAT_ATP_DOUBLES` and Laver Cup doubles — NOAD corrected

Both fixtures previously omitted `NOAD`:

```text
FORMAT_ATP_DOUBLES:     "SET3-S:6/TB7-F:TB10"     ->  "SET3-S:6NOAD/TB7-F:TB10"
Laver Cup doubles:      "SET3-S:6/TB7-F:TB10"     ->  "SET3-S:6NOAD/TB7-F:TB10"
```

Any consumer that hard-coded comparison strings for these formats must update.

### `tieFormatName` values renamed (SCREAMING_SNAKE → human-readable)

All built-in `tieFormat` fixtures now expose human-readable names. Code matching on `tieFormatName` string values must be updated.

| 2.x               | 3.x                     |
| ----------------- | ----------------------- |
| `COLLEGE_D3`      | `College D3`            |
| `DOMINANT_DUO`    | `Dominant Duo`          |
| `LAVER_CUP`       | `Laver Cup`             |
| `USTA_BREWER_CUP` | `Brewer Cup`            |
| `USTA_COLLEGE`    | `USTA Collegiate`       |
| `USTA_TOC`        | `USTA Tennis on Campus` |
| `USTA_WTT_ITT`    | `World Team Tennis ITT` |

All other `USTA_*` and organization-prefixed formats are similarly renamed.

### TypeScript type changes

- **`CountryCodeUnion`** — changed from `keyof typeof CountryCodeEnum` to `` `${CountryCodeEnum}` ``. Union members are now enum **values** (e.g. `'USA'`) rather than enum **keys**.
- **`Set.side1PointScore` / `side2PointScore`** — widened from `number` to `number | string`. Handle the string case at consumer call sites.
- **`EventTypeUnion`** — now includes `'HYBRID'` in addition to `'SINGLES' | 'DOUBLES' | 'TEAM'`. Exhaustive switches and type guards must add a `HYBRID` arm.
- **`ParticipantRoleEnum`** — six new roles added: `DIRECTOR`, `HOSPITALITY`, `STRINGER`, `SUPERVISOR`, `TRANSPORT`, `VOLUNTEER`. Update exhaustive checks.
- **`DrawLinkSource`** — gains optional `qualifyingPositions?: number`. When a qualifying placeholder link has `roundNumber: 0`, this field specifies how many qualifier positions to reserve in the target MAIN structure during automated positioning (the slot previously held by `entryProfile`).

### TypeScript / tsconfig housekeeping

- `baseUrl` and `downlevelIteration` were removed from `tsconfig.base.json` — both were no-ops at ES2021 target and are deprecated for TypeScript 7.0. Consumers that extend `tsconfig.base.json` and depend on the inherited `baseUrl` must set their own.
- Bare `src/` imports were converted to path aliases. Downstream tooling that scans for `src/` import strings should be updated accordingly.

## matchUpFormat — multi-sport grammar

The `matchUpFormatCode` parser and stringifier have been extended from a tennis-only grammar to a multi-sport specification. The expansion landed across late v2.4.x betas; v3.0 is its production debut. The full specification lives in [`matchup-format`](./codes/matchup-format) — what follows is the breaking-or-noteworthy surface.

### Match roots

Where the grammar previously assumed `SET`, v3.0 supports nine roots: `SET`, `HAL`, `QTR`, `PER`, `INN`, `RND`, `FRM`, `MAP`, `MAT`. Backwards compatible — `matchRoot` is only present on the parsed object when the root is not `SET`.

### New sections

| Section | Purpose                                                    |
| ------- | ---------------------------------------------------------- |
| `-G:`   | Game format (`G:TN`, `G:TN3D`, `G:TN1D`, `G:3C`, `G:3C3D`) |
| `-M:`   | Match constraint — time cap across all segments (`M:T50`)  |

### New set format

`S:O3` — outs-based scoring for innings sports (baseball, wiffle ball).

### Match-level modifiers

| Modifier | Meaning                          |
| -------- | -------------------------------- |
| `X`      | Exactly N segments (not best-of) |
| `A`      | Aggregate scoring                |
| `XA`     | Both                             |

### Expanded `FormatStructure` type

- `matchRoot?: string` — only present when not `SET`
- `aggregate?: boolean`
- `exactly?: number` — mutually exclusive with `bestOf`
- `gameFormat?: GameFormatStructure`
- `matchUpConstraint?: MatchUpConstraintStructure`
- `SetFormatStructure.outs?: number`

### Validation rules

- For root `SET`: `bestOf < 6` for non-timed formats; use `FRM`/`RND`/etc. for higher counts
- `X` modifier with timed format bypasses the `bestOf` ceiling (`SET7XA-S:T10P` is valid)
- Each section key (`S`, `F`, `G`, `M`) may appear at most once
- `-S:` is always required
- Round-trip guarantee: `stringify(parse(code)) === code` for all valid codes

## New engines

### Sanctioning Engine

A complete lifecycle engine for governing-body tournament sanctioning. Manages `SanctioningRecord` state from DRAFT through SUBMITTED → IN_REVIEW → APPROVED → ACTIVE. Policy-driven validation supports tier-based constraints, allowed formats, draw types, and categories.

- 17 mutations (`createSanctioningRecord`, `submitApplication`, `approveApplication`, `activateFromSanctioning`, etc.)
- 6 queries (`getSanctioningRecord`, `getAvailableTransitions`, `getCalendarConflicts`, `getEligibleTiers`, `getStatusHistory`, …)
- 2 validators (`validateProposal`, `validateStatusTransition`)
- 3 policy fixtures: Generic, ITF, USTA

When a sanctioned tournament is activated, the tier's draw composition fields (`maxWildcards`, `maxAlternates`, `maxQualifiers`) are stored as a `SANCTIONING_CONSTRAINTS` extension on the tournament record and enforced at runtime by `getStageSpace()` / `getDrawCompositionConstraints()`. **This is the replacement for the removed `entryProfile` extension.**

### Officiating Engine

Manages `OfficialRecord` lifecycle — certifications, evaluations, assignments, suspensions — with a policy-driven evaluation framework.

- 16 mutations, 7 queries, 2 validators
- Evaluation policy fixtures: Chair Umpire, Referee

### Temporal Engine

Scheduling infrastructure engine providing collision detection, capacity curves, validation pipelines, rail derivation, and time granularity management. Embargo-aware and DST-aware.

> Renamed to **AvailabilityEngine** in 5.0.0. If you are jumping straight to 5.x, see [Migration 4.x to 5.0.0](./migration-5.0.0).

### Scoring Engine

A consolidated, stateful `ScoringEngine` replaces the prior scattered history-based scoring code. Unified API for point-by-point, game-level, set-level, and timed-segment scoring across tennis, pickleball, padel, INTENNSE, and the new multi-sport formats.

**The old history-based files are removed:** `addGame.ts`, `addPoint.ts`, `addSet.ts`, `addShot.ts`, `calculateHistoryScore.ts`, `clearHistory.ts`, `getHistory.ts`, `redo.ts`, and the v3Adapter (1,022 lines). Code calling these helpers via `scoreGovernor` must migrate to `ScoringEngine`.

Headline API:

- `setState(matchUp)` / `getState()` / `reset()` — load, read, and clear engine state. `getState()` returns a deep copy
- `addPoint`, `addGame`, `addSet`, `endSegment`, `setInitialScore` — multi-level input
- `undo(count?)` / `redo(count?)` with `canUndo` / `canRedo` / `getUndoDepth` / `getRedoDepth`
- `getScore`, `getScoreboard`, `getWinner`, `isComplete`, `getPointCount`, `getFormat`
- `isNoAd`, `getSetsToWin`, `getTiebreakAt`, `hasFinalSetTiebreak`, `getFormatStructure`, `getInputMode`
- `getStatistics`, `getStatObjects`, `getEpisodes`, `getNextServer`
- `setServer(side, { recordEntry: false })` — set/correct server tracking
- `setLineUp`, `substitute`, `getActivePlayers`
- `setPointMultipliers` / `getPointMultipliers` — power points, bonus points
- `decoratePoint`, `editPoint`, `markHardBoundary` — point editing
- `getPenaltyProfile`, `getPointProfile`, `getTimerProfile`, `getTimeoutRules`, `getPenaltyBoxProfile`, `getSubstitutionRules`, `getPlayerRules`
- `setEventHandlers({ onPoint, onGameComplete, onSetComplete, onMatchComplete, onUndo, onRedo, onReset })`
- `getSupplementaryState()` / `loadSupplementaryState(state)` — persist the redo stack and lineups for external storage

New fixtures: `INTENNSE_STANDARD.json`, `TENNIS_STANDARD.json`, and the `INTENNSE_2026` tieFormat.

### Scale Engine — ranking pipeline

The existing `scaleEngine` is expanded into a full ranking-points pipeline with policy-driven point tables, aggregation, and quality-win calculations.

- New `rankingGovernor` with mutate and query surfaces
- New queries: `generateRankingList`, `getEventRankingPoints`, `getParticipantPoints`, `getQualityWinPoints`, `processBucketResults`, `getApplicableAwardProfileLevels`
- New mutation: `applyTournamentRankingPoints`
- Mandatory aggregation support and an ELO conversion option
- 10 ranking-point policy fixtures shipped in 3.0: ATP, WTA, ITF Junior, ITF WTT, LTA, Tennis Australia, Tennis Canada, Tennis Europe, USTA Junior, Basic
- JSON schema for ranking policy validation

> The federation-specific policy fixtures shipped here (`LTA`, `TENNIS_AUSTRALIA`, `TENNIS_CANADA`, `TENNIS_EUROPE`, `USTA_JUNIOR`) were **removed from the published bundle in 4.0.0** in favor of `policyRegistry`. See [Migration 3.x to 4.x](./migration-4.0.0). The five generic templates (BASIC, ITF_JUNIOR, ITF_WTT, ATP, WTA) remain in the bundle.

## New draw types and structures

### HYBRID event type

New `HYBRID` `eventType` / `matchUpType` for mixed-composition draws where both INDIVIDUAL and PAIR participants compete in the same draw. Scoring is uniform; participant composition is fixed throughout the draw. Update any exhaustive switches on `EventTypeUnion`.

### ADAPTIVE draw type

Flexible structure that accommodates varying participant counts and progression rules. Integrates with the lucky draw advancement system. The intended successor to `CUSTOM`.

### PAGE_PLAYOFF draw type

A 4-participant hybrid knockout — top two seeds get double-elimination protection while the bottom two play single elimination, with all four finishing positions resolved through actual matchUps.

Three usage paths:

1. Standalone: `drawType: PAGE_PLAYOFF, drawSize: 4`
2. Round Robin playoff group: `playoffGroups: [{ drawType: PAGE_PLAYOFF, finishingPositions: [1] }]`
3. SE playoff attachment: via `generateAndPopulatePlayoffStructures`

### Swiss System draw type

Full FIDE-style Swiss pairing built on the Ad Hoc draw infrastructure.

- `generateSwissRound({ drawId })` — next round of pairings
- `addAdHocMatchUps({ matchUps, structureId, drawId })`
- `getSwissStandings({ drawId })` — ranked standings with BUCHHOLZ / MEDIAN_BUCHHOLZ / SONNEBORN_BERGER / PROGRESSIVE_SCORE tiebreakers
- `getSwissChart({ drawId })` — per-round score-group chart for visualization

Selected rating scale is stored as a `swissScaleName` extension on the draw definition.

### Lucky Draws (major expansion)

- Lucky draw permutations and scenario generation
- Playoff profile support for lucky draws
- Lucky round advancement with display badges
- `getLuckyDrawRoundStatus` query, `luckyDrawAdvancement` mutation
- `isLuckyBasedDraw` identification helper
- Cross-structure lucky draw link support
- AD_HOC as consolation to Lucky draws

### COMPASS / OLYMPIC restructuring

`COMPASS` and `OLYMPIC` draw types now use a single MAIN stage structure with recursive playoff directives, simplifying internal representation. Behavior is preserved; tooling that reflected on the structure shape may need adjustment.

## New functionality you may want to adopt

### Draft Draws

Manual draw positioning before finalization:

- `initializeDraft` — start with scale and entry-order selection
- `resolveDraftPositions` — resolve final positions from draft preferences
- `setDrawPositionPreferences`
- `getDraftState`
- New `DRAFT_STATE` extension constant and `EXISTING_DRAFT` error

### Mutation Locks

Scope-based locking to prevent concurrent modifications:

- `addMutationLock` / `removeMutationLock` / `getMutationLocks`
- Integrated into all mutations via `mutationLockScopeMap`
- Automatic expiry via `cleanExpiredMutationLocks`
- New errors: `MUTATION_LOCKED`, `MUTATION_LOCK_EXISTS`, `MUTATION_LOCK_NOT_FOUND`, `UNAUTHORIZED_LOCK_OPERATION`
- New `MUTATION_LOCKS` extension constant

### Embargo system

Time-based embargo of scheduling information with enforcement in the publishing pipeline:

- `getRoundVisibilityState`, `isEmbargoed`, `isVisiblyPublished` queries
- Embargo-aware `getEventData` and order-of-play
- New `INVALID_EMBARGO` error constant

### Publishing Governor (expanded)

- `UNPUBLISH_TOURNAMENT` and `UNPUBLISH_PARTICIPANTS` topic constants
- Participant and language publishing updates
- Schedule-date filtering in published data
- Multi-tournament publishing
- Published order-of-play now includes all required attributes

### Competition Policy — three-track rating

New `POLICY_TYPE_COMPETITION` enabling multi-round competition evaluation with three rating tracks (Baseline, Dynamic Form, Pressure). Dynamic ratings affect opportunity (pairing); the frozen baseline always drives evaluation (pressure scoring).

- New `competitionGovernor` mutations: `initializeCompetitionState`, `processCompetitionMatchUp`, `processCompetitionRound`, `resetCompetitionState`
- New queries: `getCompetitionState`, `getCompetitionPolicy`, `getCompetitionLeaderboard`, `getCompetitionParticipantState`
- Preset fixtures: `POLICY_COMPETITION_STANDARD`, `POLICY_COMPETITION_PRESSURE`, `POLICY_COMPETITION_SWISS`
- State stored as a `competitionState` extension on the draw definition

### Voluntary Consolation overhaul

- Scoped VC entries in `resetDrawDefinition` and `generateVoluntaryConsolation`
- New `removeStageEntries` export for voluntary structure removal
- Improved AD_HOC detection
- `resetDrawDefinition()` correctly handles `AD_HOC` `VOLUNTARY_CONSOLATION`

### Consolation structure generation

- `addLinkedConsolationStructure` — generate and attach consolation structures to existing topologies (non-voluntary)
- Recursive playoff directive support in `generateDrawDefinition`

### Round Robin enhancements

- `getBestFinishers` — "Best Finishers" logic for cross-group playoff qualification
- RR Playoff `bestOf` configuration option
- RR support in voluntary consolation stage
- AD_HOC as playoff for RR groups

### Venue & Court

- `deleteCourts` — bulk court deletion
- `isPrimary` venue attribute and `clearPrimaryVenue` mutation
- Court annotations in schedule items
- `activeDates` on `createTournamentRecord`
- `scheduleProfileGrid` function
- `setTournamentDates` now refuses to exclude dates that have scheduled items
- Court availability conflict detection

### Qualifying-first draw generation

`generateDrawDefinition` supports creating qualifying structures before the main draw exists. Pass `qualifyingOnly: true` with `qualifyingProfiles` and `drawEntries` (containing `entryStage: QUALIFYING`) to generate populated qualifying structures with a MAIN placeholder (0 matchUps). Later, call `generateDrawDefinition` again with a `drawSize` and the existing `drawId` — the factory detects the placeholder MAIN and populates it while preserving qualifying structures and links.

### `getCompetitionFormat` hierarchical query

```js
const {
  structureDefaultCompetitionFormat,
  drawDefaultCompetitionFormat,
  eventDefaultCompetitionFormat,
  competitionFormat, // resolved value (first defined in hierarchy)
} = engine.getCompetitionFormat({ structureId, matchUpId, drawId, eventId });
```

### Other utilities

- `remapDrawDefinitionMatchUpIds` — remap matchUp IDs within a draw definition
- `seedWithdrawalCascade` and seed avoidance in positioning
- `convertToELO` option for DrawMatic dynamic ratings
- `writeTieFormat` — tieFormat optimization for tournament records
- `calculateMatchUpMargin` query
- `getValidSeedCascadeAction` position action

### New error constants

- `SCHEDULE_CONFLICT_COURT_UNAVAILABLE`
- `LUCKY_DRAW_BYE_LIMIT`
- `INVALID_EMBARGO`
- `EXISTING_DRAFT`
- `MUTATION_LOCKED`, `MUTATION_LOCK_EXISTS`, `MUTATION_LOCK_NOT_FOUND`, `UNAUTHORIZED_LOCK_OPERATION`

## mocksEngine

### Deterministic generation

`mocksEngine` accepts a `nonRandom` seed parameter for fully deterministic, reproducible tournament generation via a seeded PRNG (`src/tools/prng.ts`). The same seed always produces identical draws, participants, and outcomes — essential for snapshot testing and CI reproducibility.

### New exports for end-user testing

- `generateOutcome`
- `completeDrawMatchUps`
- `generateEventWithDraw`
- `removeMatchUpOutcome`

### Expanded capabilities

- `generateParticipants` accepts an explicit team-size override
- Mock participant generation accepts `participantRole`
- `completeDrawMatchUps` correctly handles timed match formats
- HYBRID event generation with mixed INDIVIDUAL/PAIR participants
- Extended Lucky Draw scenario generation
- Recursive playoff directives in `generateDrawDefinition` / `generateEventWithDraw`

## Code quality / cognitive complexity

Every function in the factory now scores below 30 on the SonarQube cognitive complexity metric — down from 93 functions exceeding the threshold (peak: 184). The `sonarjs/cognitive-complexity` ESLint rule is now enforced at 30 for all new code.

Test files (`*.test.ts`) are now linted (previously ignored): 590 lint issues resolved on the way in.

Test coverage: **869 test files / 9,142 passing tests** in 3.0 — up from ~659 / ~6,500 in 2.4.5.

## Backwards-compatibility notes

- `competitionEngine` continues to exist for parity with `tournamentEngine`. See [Migration 1.x to 2.x](./migration) for the original split.
- The `tools` import surface is unchanged: `import { tools } from 'tods-competition-factory'`.
- The CODES rename does not break TODS document compatibility — every 2.x record is still readable by 3.x.

## Next

If you are upgrading past 3.x as part of the same lift, continue with [Migration 3.x to 4.x](./migration-4.0.0) (federation ranking-point fixtures moved to `policyRegistry`) and [Migration 4.x to 5.0.0](./migration-5.0.0) (CODES schema promotion + typed engine default).
