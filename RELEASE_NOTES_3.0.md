# tods-competition-factory v3.0 Release Notes

**Previous stable release:** v2.4.5 (February 23, 2026)
**Commits since v2.4.5:** 504 (across 37 beta releases)

---

## TODS → CODES: Competition Open Data Exchange Standards

Version 3.0 marks the formal transition from **TODS** (Tennis Open Data Standards) to **CODES** (Competition Open Data Exchange Standards). CODES builds on TODS rather than replacing it — any valid TODS document remains a valid CODES document. The transition reflects the reality that the factory's underlying data structures (participants, events, draws, matchUps, scoring) are not tennis-specific and translate naturally to any bracket-based competition sport.

### matchUpFormat Specification Expansion

The `matchUpFormatCode` parser and stringifier have been extended from a tennis-only grammar to a multi-sport format specification. This expansion was developed across late v2.4.x releases but was never formally documented or announced — v3.0 is its production debut.

#### Match Roots

Where the grammar previously assumed `SET` as the only root, v3.0 supports nine match roots:

| Root  | Domain     | Sports                                                                                       |
| ----- | ---------- | -------------------------------------------------------------------------------------------- |
| `SET` | Sets/Games | Tennis, padel, pickleball, squash, badminton, table tennis, volleyball, fencing, racquetball |
| `HAL` | Halves     | Soccer, handball, NCAA basketball                                                            |
| `QTR` | Quarters   | NBA/FIBA basketball, water polo, lacrosse                                                    |
| `PER` | Periods    | Ice hockey, wrestling                                                                        |
| `INN` | Innings    | Baseball, wiffle ball                                                                        |
| `RND` | Rounds     | Boxing, MMA                                                                                  |
| `FRM` | Frames     | Table tennis (best-of-7+), badminton                                                         |
| `MAP` | Maps       | Esports (CS2, Valorant)                                                                      |
| `MAT` | Reserved   | Multi-match formats                                                                          |

Backward compatibility: `matchRoot` is only included in the parsed object when the root is not `SET`, so existing consumers are unaffected.

#### New Section Types

The format grammar previously supported two sections: `-S:` (set/segment format, required) and `-F:` (final segment override, optional). v3.0 adds two new sections:

**`-G:` Game Format** — specifies game-level scoring rules:

| Pattern  | Meaning                                 | Use Case                      |
| -------- | --------------------------------------- | ----------------------------- |
| `G:TN`   | Traditional tennis scoring (0-15-30-40) | Tennis, padel                 |
| `G:TN3D` | Traditional with deuce cap at 3rd deuce | Padel Star Point (2026 rules) |
| `G:TN1D` | Golden point (decisive at first deuce)  | Padel no-advantage            |
| `G:3C`   | 3 consecutive points to win             | TYPTI format                  |
| `G:3C3D` | Consecutive with deuce cap              | TYPTI variant                 |

**`-M:` Match Constraint** — match-level time cap across all segments:

| Pattern | Meaning                  | Use Case                       |
| ------- | ------------------------ | ------------------------------ |
| `M:T50` | 50-minute match time cap | Wiffle ball, timed tournaments |

#### New Set Format: Outs-Based Scoring

For innings-based sports (baseball, wiffle ball), a new `O{outs}` set format:

- `S:O3` — 3 outs per team per inning
- Example full format: `INN4XA-S:O3-M:T50` (4 innings exactly, aggregate scoring, 3 outs per side, 50-minute cap)

#### Match-Level Modifiers

| Modifier | Meaning                           | Example                    |
| -------- | --------------------------------- | -------------------------- |
| `X`      | Exactly N segments (not best-of)  | `SET7X-S:T10P`             |
| `A`      | Aggregate scoring across segments | `HAL2A-S:T45`              |
| `XA`     | Both exactly and aggregate        | `SET7XA-S:T10P` (INTENNSE) |

#### Full Grammar

```text
{ROOT}{count}[X][A]-S:{setSpec}[-G:{gameSpec}][-F:{setSpec}][-M:{matchConstraint}]
```

Or simplified form for single-set timed: `T{minutes}[P|G][/TB{n}][@modifier]`

#### Cross-Sport Format Examples

| Sport                  | Format Code                      | Meaning                                       |
| ---------------------- | -------------------------------- | --------------------------------------------- |
| Tennis (Grand Slam)    | `SET5-S:6/TB7-F:6/TB10`          | Best of 5, tiebreak at 6-6, final set TB10    |
| Padel Star Point       | `SET3-S:4/TB7@3-G:TN3D`          | Best of 3, TB at 3-3, star point games        |
| Pickleball (MLP rally) | `SET3-S:TB21@RALLY-F:TB15@RALLY` | Rally scoring to 21, final to 15              |
| INTENNSE               | `SET7XA-S:T10P`                  | Exactly 7 timed sets, aggregate, points-based |
| Soccer                 | `HAL2A-S:T45`                    | 2 halves, 45 min each, aggregate              |
| NBA Basketball         | `QTR4A-S:T12`                    | 4 quarters, 12 min each, aggregate            |
| Ice Hockey             | `PER3A-S:T20`                    | 3 periods, 20 min each, aggregate             |
| Boxing                 | `RND12A-S:T3`                    | 12 rounds, 3 min each, aggregate (judged)     |
| Wiffle Ball (BLW)      | `INN4XA-S:O3-M:T50`              | 4 innings, 3 outs, 50-min cap                 |
| Esports (CS2)          | `MAP3-S:TB13`                    | Best of 3 maps, first to 13 rounds            |
| Squash (PAR-11)        | `SET5-S:TB11`                    | Best of 5 games to 11                         |
| Table Tennis (7-game)  | `FRM7-S:TB11`                    | Best of 7 frames to 11                        |

#### Parsed Format Types

The `FormatStructure` type has been expanded with:

- `matchRoot?: string` — only present when not `SET`
- `aggregate?: boolean` — true when `A` modifier present
- `exactly?: number` — when `X` modifier used (mutually exclusive with `bestOf`)
- `gameFormat?: GameFormatStructure` — from `-G:` section (`type: 'TRADITIONAL' | 'CONSECUTIVE'`, `count?`, `deuceAfter?`)
- `matchUpConstraint?: MatchUpConstraintStructure` — from `-M:` section (`timed`, `minutes`)
- `SetFormatStructure.outs?: number` — for outs-based scoring

#### Validation Rules

- `SET` root: `bestOf < 6` for non-timed (use `FRM`/`RND`/etc. for higher counts)
- Exactly (`X`) with timed bypasses the bestOf limit (e.g., `SET7XA-S:T10P` is valid)
- Each section key (`S`, `F`, `G`, `M`) may appear at most once
- `-S:` is always required
- `isValidMatchUpFormat` correctly distinguishes timed basis `G` (as in `T10G`) from section key `-G:` via lookahead regex
- Round-trip guarantee: `stringify(parse(code)) === code` for all valid codes

#### matchUpFormat Test Coverage

- `crossSportFormats.test.ts` — 67 tests covering all match roots and sport formats
- `outs-scoring-engine.test.ts` — 140+ tests for innings/outs-based scoring
- `outsGenerateOutcome.test.ts` — 132 tests for outs-based outcome generation
- `matchUpFormatCode.test.ts`, `matchUpFormatPickle.test.ts` — core parser/stringify tests
- `mcpParser.test.ts`, `mcpValidator.test.ts`, `mcpParserCoverage.test.ts`, `mcpValidatorBranches.test.ts` — validator branch coverage

#### matchUpFormat Documentation

- `matchup-format.mdx` — complete format specification with sport reference tables (397 lines)
- `matchup-format-governor.md` — API documentation
- `data-standards.md` — CODES/TODS explanation and relationship

---

## Breaking Changes

### `CUSTOM` drawType removed

The `CUSTOM` drawType has been removed from `drawDefinitionConstants`. Any code importing `CUSTOM` or using `'CUSTOM'` as a drawType value will break. The ADAPTIVE draw type serves as the flexible alternative.

### `tidyScore` / scoreParser module removed

The entire `src/helpers/scoreParser/` module (22 files, ~2,730 lines) has been extracted into a separate project. Any code calling `tidyScore()` via the scoreGovernor must migrate to that standalone package.

### `PLAY_OFF` vs `PLAYOFF` draw type clarification

`PLAY_OFF` (with underscore) is now exclusively a **stage type** constant. A new `PLAYOFF` (no underscore) constant is the correct **draw type**. Code using `PLAY_OFF` as a drawType — including checks against `MULTI_STRUCTURE_DRAWS` — must switch to `PLAYOFF`.

### tieFormat fixture `tieFormatName` values renamed

All built-in tieFormat fixtures have been renamed from SCREAMING_SNAKE_CASE to human-readable names:

| Old               | New                     |
| ----------------- | ----------------------- |
| `COLLEGE_D3`      | `College D3`            |
| `DOMINANT_DUO`    | `Dominant Duo`          |
| `LAVER_CUP`       | `Laver Cup`             |
| `USTA_BREWER_CUP` | `Brewer Cup`            |
| `USTA_COLLEGE`    | `USTA Collegiate`       |
| `USTA_TOC`        | `USTA Tennis on Campus` |
| `USTA_WTT_ITT`    | `World Team Tennis ITT` |

All other `USTA_*` and organization-prefixed formats have been similarly renamed. Any code matching on `tieFormatName` string values must be updated.

### `CountryCodeUnion` TypeScript type changed

Changed from `keyof typeof CountryCodeEnum` to `` `${CountryCodeEnum}` ``. The union members are now the enum values (e.g., `'USA'`) rather than enum keys. TypeScript consumers must update code typed against the old union shape.

### `side1PointScore` / `side2PointScore` type widened

The `Set` interface now types these as `number | string` (was `number`). TypeScript consumers may need to handle the string case.

### `EventTypeUnion` expanded

Now includes `'HYBRID'` in addition to `'SINGLES' | 'DOUBLES' | 'TEAM'`. Exhaustive switches and type guards must be updated.

### `ParticipantRoleEnum` expanded

Added: `DIRECTOR`, `HOSPITALITY`, `STRINGER`, `SUPERVISOR`, `TRANSPORT`, `VOLUNTEER`. Exhaustive checks must be updated.

### `generateVoluntaryConsolation` local attachment removed

The function no longer supports local attachment. Callers relying on this behavior must update their integration.

### `FORMAT_ATP_DOUBLES` corrected

Now correctly includes NOAD: `"SET3-S:6NOAD/TB7-F:TB10"`. The previous value was missing the NOAD modifier.

### Laver Cup fixture doubles matchUpFormat corrected

Changed from `"SET3-S:6/TB7-F:TB10"` to `"SET3-S:6NOAD/TB7-F:TB10"`.

### `entryProfile` extension removed

The `ENTRY_PROFILE` extension on draw definitions has been removed entirely. This extension previously stored per-stage capacity constraints (`drawSize`, `qualifiersCount`, `wildcardsCount`, `alternates`) and was created as a byproduct of draw generation.

**What changed:**

- `ENTRY_PROFILE` constant removed from `extensionConstants`
- `getEntryProfile()`, `modifyEntryProfile()` deleted
- `setStageDrawSize()`, `setStageAlternatesCount()`, `setStageWildcardsCount()`, `setStageQualifiersCount()` deleted
- `getStageDrawPositionsCount()` now derives draw size from structure `positionAssignments.length` instead of the entryProfile extension
- `getQualifiersCount()` derives entirely from links (no entryProfile fallback)
- `stageAlternatesCount()`, `getStageWildcardsCount()` now read from sanctioning constraints; unsanctioned draws are unconstrained
- `getStageSpace()` checks sanctioning constraints when present; returns unconstrained when no sanctioning
- `getValidStage()` checks structure existence, not entryProfile existence

**Migration:**

- Code importing `ENTRY_PROFILE` from `extensionConstants`: remove the import
- Code calling `setStageDrawSize()`: pass `drawSize` directly to `generateDrawDefinition` or `generateDrawTypeAndModifyDrawDefinition`
- Code calling `setStageQualifiersCount()`: pass `qualifiersCount` to `generateDrawDefinition`
- Code reading `entryProfile[stage].drawSize`: use `getStageDrawPositionsCount({ stage, drawDefinition })` which now derives from structures
- Code reading `entryProfile[stage].qualifiersCount`: use `getQualifiersCount({ drawDefinition, structureId, stage })`
- Draw composition enforcement (wildcards, alternates) now requires sanctioning constraints; unsanctioned draws have no composition limits

### `DrawLinkSource` type expanded

Added `qualifyingPositions?: number` to `DrawLinkSource`. When a qualifying placeholder link has `roundNumber: 0`, the `qualifyingPositions` field specifies how many qualifier positions to reserve in the target MAIN structure during automated positioning. This replaces the qualifier reservation that was previously handled by `entryProfile`.

---

## New Engines

### Sanctioning Engine

A complete lifecycle engine for governing body tournament sanctioning workflows. Manages `SanctioningRecord` state from DRAFT through SUBMITTED, IN_REVIEW, APPROVED, and ACTIVE. Policy-driven validation supports tier-based constraints, allowed formats, draw types, and categories.

- **17 mutations:** `createSanctioningRecord`, `submitApplication`, `reviewApplication`, `approveApplication`, `conditionallyApprove`, `rejectApplication`, `withdrawApplication`, `requestModification`, `addEventProposal`, `updateEventProposal`, `removeEventProposal`, `updateProposal`, `addReviewNote`, `meetCondition`, `transitionStatus`, `activateFromSanctioning`, plus amendments and compliance
- **6 queries:** `getSanctioningRecord`, `getAvailableTransitions`, `getCalendarConflicts`, `getCompleteness`, `getEligibleTiers`, `getStatusHistory`
- **2 validators:** `validateProposal`, `validateStatusTransition`
- **3 policy fixtures:** Generic, ITF, USTA
- **188 tests** across 10 test files
- Endorsement support, certification tracking, compliance monitoring
- Full documentation suite

#### Draw Composition Constraints

`SanctioningTier` now includes draw composition fields:

| Field           | Purpose                              |
| --------------- | ------------------------------------ |
| `maxWildcards`  | Maximum wildcard entries per draw    |
| `maxAlternates` | Maximum alternate entries per draw   |
| `maxQualifiers` | Maximum qualifier positions per draw |

When a sanctioned tournament is activated, these constraints are stored as a `SANCTIONING_CONSTRAINTS` extension on the tournament record. Runtime enforcement via `getStageSpace()` and `getDrawCompositionConstraints()` checks these limits when adding entries. Unsanctioned draws are unconstrained — no composition limits apply without sanctioning.

This replaces the `entryProfile` extension which previously stored draw composition data as a byproduct of draw generation rather than as a governance mechanism.

### Officiating Engine

Manages `OfficialRecord` lifecycle including certifications, evaluations, assignments, and suspensions. Policy-driven evaluation framework with configurable scoring criteria.

- **16 mutations:** `createOfficialRecord`, `addCertification`, `modifyCertification`, `removeCertification`, `transitionCertificationStatus`, `addEvaluation`, `modifyEvaluation`, `removeEvaluation`, `transitionEvaluationStatus`, `addEvaluationPolicy`, `assignOfficial`, `removeOfficialAssignment`, `transitionAssignmentStatus`, `addSuspension`, `removeSuspension`
- **7 queries:** `getOfficialRecord`, `getOfficialCertifications`, `getOfficialAssignments`, `getOfficialEligibility`, `getEvaluations`, `getEvaluationSummary`, `getEvaluationTemplate`
- **2 validators:** `validateCertification`, `validateOfficiatingStatusTransition`
- **2 evaluation policy fixtures:** Chair Umpire, Referee
- **44 tests**
- Full documentation

### Temporal Engine

A scheduling infrastructure engine providing collision detection, capacity curves, validation pipelines, rail derivation, and time granularity management. Supports embargo-aware scheduling and DST handling.

- **Modules:** `TemporalEngine` class, `temporalGovernor` (bridge, capacityCurve, collisionDetection, conflictEvaluators, planState, railDerivation, timeGranularity, validationPipeline)
- **12 test files** covering all modules
- Full documentation suite with UI integration scenarios

### Ranking / Scale Engine (major expansion)

The `scaleEngine` has been expanded into a comprehensive ranking points pipeline with policy-driven point tables, aggregation, and quality win calculations.

- **New governor:** `rankingGovernor` with mutate and query surfaces
- **New queries:** `generateRankingList`, `getEventRankingPoints`, `getParticipantPoints`, `getQualityWinPoints`, `processBucketResults`
- **New mutation:** `applyTournamentRankingPoints`
- **10 ranking point policy fixtures:** ATP, WTA, ITF Junior, ITF WTT, LTA, Tennis Australia, Tennis Canada, Tennis Europe, USTA Junior, Basic
- **JSON schema** for ranking policy validation
- **13 test files**
- Mandatory aggregation support, ELO conversion option
- Full documentation suite

### Scoring Engine

A consolidated, stateful scoring engine (`ScoringEngine`) that replaces the prior scattered history-based scoring code. The engine provides a unified API for point-by-point, game-level, set-level, and timed-segment scoring across multiple sport formats (tennis, pickleball, padel, INTENNSE, and more). Introduced in late v2.4.x but never formally released as stable — this is its debut as production-ready functionality.

The old history-based scoring files (`addGame.ts`, `addPoint.ts`, `addSet.ts`, `addShot.ts`, `calculateHistoryScore.ts`, `clearHistory.ts`, `getHistory.ts`, `redo.ts`) and the v3Adapter (1,022 lines) were removed and replaced by the unified engine.

**Constructor & State Management:**

- `constructor(options?)` — create with matchUpFormat, competitionFormat, event handlers
- `setState(matchUp)` — load a TODS MatchUp into the engine
- `getState()` — get the current MatchUp state
- `reset()` — clear all state and history

**Multi-Level Scoring Input:**

- `addPoint(options)` — primary point-by-point scoring entry point
- `addGame(options)` — game-level input (skipping point tracking)
- `addSet(options)` — set-level input
- `endSegment(options?)` — finalize timed segments (INTENNSE, timed formats)
- `setInitialScore(options)` — mid-match arrival setup (join scoring in progress)

**Undo/Redo:**

- `undo(count?)` / `redo(count?)` — full undo/redo with entry-based rebuild
- `canUndo()` / `canRedo()` / `getUndoDepth()` / `getRedoDepth()` — availability queries

**Score Queries:**

- `getScore()` — structured score object with sets, games, points
- `getScoreboard(options?)` — display-ready string (e.g., `"6-4 3-6 2-1 30-15"`)
- `getWinner()` — returns side 1 or 2, or undefined
- `isComplete()` — match completion check
- `getPointCount()` — total points played
- `getFormat()` — current matchUpFormat code

**Format Introspection:**

- `isNoAd()` — No-Advantage detection
- `getSetsToWin()` — sets needed to win
- `getTiebreakAt()` — game count triggering tiebreak (or null)
- `hasFinalSetTiebreak()` — final set tiebreak check
- `getFormatStructure()` — parsed format object
- `getInputMode()` — returns `'points'` | `'games'` | `'sets'` | `'mixed'` | `'none'`

**Statistics & Analysis:**

- `getStatistics(options?)` — comprehensive match statistics with optional set filtering
- `getStatObjects(options?)` — `StatObject[]` formatted for visualization consumers
- `getEpisodes()` — point history with contextual metadata (break points, set points, etc.)
- `getNextServer()` — returns 0 or 1 (which side serves next)

**Server Management:**

- `setServer(side)` — correct/set server tracking, including cross-set tracking fixes

**Substitution & Lineups:**

- `setLineUp(sideNumber, lineUp)` — set team roster
- `substitute(options)` — record player substitution mid-match
- `getActivePlayers()` — current active players per side

**Point Multipliers:**

- `setPointMultipliers(multipliers)` — configure power points, bonus points
- `getPointMultipliers()` — get current multiplier configuration

**Point Editing & Decoration:**

- `decoratePoint(index, metadata)` — attach custom metadata to history entries
- `editPoint(index, newData, options?)` — edit historical points with optional recalculation
- `markHardBoundary(options)` — prevent edit cascade past a boundary

**CompetitionFormat Profiles:**

- `getPenaltyProfile()` — penalty types and escalation rules
- `getPointProfile()` — point result types (ace, winner, fault, etc.)
- `getTimerProfile()` — timer rules for timed formats
- `getTimeoutRules()` — timeout configuration per side
- `getPenaltyBoxProfile()` — penalty box rules (INTENNSE)
- `getSubstitutionRules()` — substitution constraints
- `getPlayerRules()` — player availability rules

**Event Handlers:**

- `setEventHandlers(handlers?)` / `getEventHandlers()` — set/query callbacks for `onPoint`, `onGameComplete`, `onSetComplete`, `onMatchComplete`, `onUndo`, `onRedo`, `onReset`

**Persistence:**

- `getSupplementaryState()` — get redo stack and lineups for external storage
- `loadSupplementaryState(state)` — restore supplementary state on reload

**CompetitionFormat fixtures:** `INTENNSE_STANDARD.json`, `TENNIS_STANDARD.json`

**Test coverage:** `scoringEngineCoverage.test.ts` (1,733 lines), `engine-api-extensions.test.ts` (1,037 lines), `scoring-engine.test.ts` (295 lines), plus `undo-redo.test.ts`, `substitutions.test.ts`, `statistics.test.ts`, `addPoint.test.ts`, `mixed-game-point.test.ts`, `outs-scoring-engine.test.ts`, `pbp-validation.test.ts`, `pbpValidator.test.ts`, `pbpValidatorCoverage.test.ts`, `mcpParser.test.ts`, `mcpValidator.test.ts`

**Documentation:** `scoring-engine-overview.md` (architecture and usage guide), `scoring-engine-api.md` (complete API reference)

---

## New Functionality

### HYBRID Event Type

New `HYBRID` eventType and matchUpType for mixed-composition draws where both INDIVIDUAL and PAIR participants compete in the same draw. Scoring is uniform; participant composition is fixed throughout the draw.

### ADAPTIVE Draw Type

New `ADAPTIVE` drawType supporting flexible draw structures that can accommodate varying participant counts and progression rules. Integrates with the lucky draw advancement system.

### Lucky Draw System (major expansion)

Comprehensive overhaul of lucky draw mechanics:

- Lucky draw permutations and scenario generation
- Playoff profile support for lucky draws
- Lucky round advancement logic with display badges
- Lucky draw bye placement and round detection
- Lucky-based draw identification (`isLuckyBasedDraw`)
- `getLuckyDrawRoundStatus` query
- `luckyDrawAdvancement` mutation
- Cross-structure lucky draw link support
- AD_HOC as consolation to Lucky draw scenarios

### Draft Draws

New workflow for manual draw positioning before finalization:

- `initializeDraft` — initialize draft state with scale and entry order selection
- `resolveDraftPositions` — resolve final positions from draft preferences
- `setDrawPositionPreferences` — set position preferences during draft
- `getDraftState` — query current draft state
- New `DRAFT_STATE` extension constant and `EXISTING_DRAFT` error

### Mutation Locks

Scope-based mutation locking system to prevent concurrent modifications:

- `addMutationLock` / `removeMutationLock` / `getMutationLocks`
- Lock checking integrated into all mutations via `mutationLockScopeMap`
- Automatic lock expiry with `cleanExpiredMutationLocks`
- New error constants: `MUTATION_LOCKED`, `MUTATION_LOCK_EXISTS`, `MUTATION_LOCK_NOT_FOUND`, `UNAUTHORIZED_LOCK_OPERATION`
- New `MUTATION_LOCKS` extension constant

### Embargo System

Embargo capabilities for both scheduling and publishing:

- Time-based embargo of scheduling information
- Embargo enforcement in the publishing pipeline
- Round visibility state queries (`getRoundVisibilityState`)
- `isEmbargoed` / `isVisiblyPublished` queries
- Embargo-aware `getEventData` and order-of-play
- New `INVALID_EMBARGO` error constant

### Publishing Governor (expanded)

- `getRoundVisibilityState`, `isEmbargoed`, `isVisiblyPublished` exports
- `UNPUBLISH_TOURNAMENT` and `UNPUBLISH_PARTICIPANTS` topic constants
- Participant and language publishing updates
- Schedule date filtering in published data
- Multi-tournament publishing support
- Published order-of-play now includes all required attributes

### Voluntary Consolation Overhaul

- Scoped VC entries in `resetDrawDefinition` and `generateVoluntaryConsolation`
- New `removeStageEntries` export for voluntary structure removal
- Improved AD_HOC detection for voluntary consolation scenarios
- `resetDrawDefinition()` correctly handles AD_HOC VOLUNTARY_CONSOLATION

### Consolation Structure Generation

- `addLinkedConsolationStructure` for generating and attaching consolation structures to existing topologies (non-voluntary)
- Support for recursive playoff directives in `generateDrawDefinition`

### Round Robin Enhancements

- "Best Finishers" logic (`getBestFinishers`) for cross-group playoff qualification
- RR Playoff `bestOf` configuration option
- RR support in voluntary consolation stage
- AD_HOC as playoff for RR groups

### COMPASS and OLYMPIC Restructuring

COMPASS and OLYMPIC draw types now use a single MAIN stage structure with recursive playoff directives, simplifying the internal representation.

### Venue & Court Enhancements

- `deleteCourts` bulk court deletion
- `isPrimary` attribute for venues, `clearPrimaryVenue` mutation
- Court annotations in schedule items
- `activeDates` support in `createTournamentRecord`
- Schedule profile grid function (`scheduleProfileGrid`)
- Safeguard preventing `setTournamentDates` from excluding dates with scheduled items
- Court availability conflict detection

### Qualifying-First Draw Generation

`generateDrawDefinition` now supports creating qualifying structures before the main draw exists. Passing `qualifyingOnly: true` with `qualifyingProfiles` and `drawEntries` (containing `entryStage: QUALIFYING` entries) generates populated qualifying structures with a MAIN placeholder (0 matchUps). The user can later generate the main draw by calling `generateDrawDefinition` again with a `drawSize` and the existing `drawId` — the factory detects the placeholder MAIN and populates it while preserving qualifying structures and links.

- Qualifying entries are correctly added to the drawDefinition when `qualifyingOnly: true` and `drawEntries` is provided
- Automated positioning works for qualifying structures in qualifying-first mode
- MAIN placeholder has zero matchUps and empty positionAssignments until explicitly generated

### `getCompetitionFormat` Hierarchical Query

New query that resolves the `competitionFormat` through the hierarchy: structure → draw → event, returning the first defined value along with each level's individual setting.

```js
const {
  structureDefaultCompetitionFormat,
  drawDefaultCompetitionFormat,
  eventDefaultCompetitionFormat,
  competitionFormat, // resolved value (first defined in hierarchy)
} = engine.getCompetitionFormat({
  structureId, // optional
  matchUpId, // optional
  drawId, // optional
  eventId, // optional
});
```

### Draw & Structure Utilities

- `remapDrawDefinitionMatchUpIds` — remap matchUp IDs within a draw definition
- Seed withdrawal cascade (`seedWithdrawalCascade`)
- Seed avoidance in positioning
- Draw structure link validation
- `convertToELO` option for DrawMatic dynamic ratings
- TieFormat optimization for tournament records (`writeTieFormat`)
- `calculateMatchUpMargin` query
- `getValidSeedCascadeAction` position action

### Scoring Pipeline Improvements

Beyond the new ScoringEngine and matchUpFormat expansion (see their dedicated sections above):

- `setMatchUpStatus` scoring pipeline supports game points in partial scores
- IN_PROGRESS partial score persistence and round-trip support through the mutation layer
- CompetitionFormat extended with per-side timeout configuration and penalty box profile support (`PenaltyBoxProfile`, `maxPerSide`)

### Participant Improvements

- Standardized `participantName` construction
- Numeric `participantId` coercion (string conversion)
- Expanded `ParticipantRoleEnum` with 6 new roles

### New Error Constants

- `SCHEDULE_CONFLICT_COURT_UNAVAILABLE`
- `LUCKY_DRAW_BYE_LIMIT`
- `INVALID_EMBARGO`
- `EXISTING_DRAFT`
- `MUTATION_LOCKED`, `MUTATION_LOCK_EXISTS`, `MUTATION_LOCK_NOT_FOUND`, `UNAUTHORIZED_LOCK_OPERATION`

### CI/CD

- Automated npm publish workflow (`.github/workflows/npm-publish.yml`)
- Trusted publishing via OIDC (no NPM_TOKEN required)
- Lint, type-check, and server test gates in publish workflow

---

## Code Quality and Cognitive Complexity

### Systematic Complexity Reduction

A comprehensive refactoring effort reduced cognitive complexity across the entire codebase. Every function in the factory now scores below 30 on the SonarQube cognitive complexity metric — down from a starting point where 93 functions exceeded that threshold, with some reaching 184.

| Metric                        | Before | After | Reduction |
| ----------------------------- | -----: | ----: | --------- |
| Functions above complexity 50 |     36 |     0 | -100%     |
| Functions above complexity 40 |     62 |     0 | -100%     |
| Functions above complexity 30 |     93 |     0 | -100%     |
| Helper functions extracted    |      — |  ~200 | —         |
| Source files refactored       |      — |   ~60 | —         |

Monolithic functions were decomposed into focused, testable helpers — for example, `getParticipantEntries` (718 lines, one function) was split into 8 helpers across 4 refactoring passes. The same treatment was applied to scoring, scheduling, draw positioning, publishing, ranking, tie format management, and mock generation code.

The `sonarjs/cognitive-complexity` ESLint rule is now enabled at threshold 30, enforcing the quality floor for all new code.

### Test File Linting

Test files (`*.test.ts`) are now included in the ESLint configuration. Previously ignored, 590 lint issues were identified and resolved:

- 94 unused variable/import errors eliminated
- 52 useless assignment warnings fixed
- Duplicate branches, nested ternaries, stale directives, and missing callback returns cleaned up
- Test-specific overrides for `no-duplicate-string` and `no-empty-function` (intentional patterns in test code)

### TypeScript Modernization

- Removed deprecated `baseUrl` and `downlevelIteration` tsconfig options (no-ops at ES2021 target, deprecated for TypeScript 7.0)
- Fixed bare `src/` imports to use path aliases

## Test Coverage

### Summary

| Metric        | v2.4.5 | v3.0  | Change         |
| ------------- | ------ | ----- | -------------- |
| Test files    | 659    | 843   | +184 (+28%)    |
| Tests passing | ~6,500 | 8,284 | ~+1,800 (+27%) |
| Tests skipped | —      | 5     | —              |

### New Test Suites by Area

**Sanctioning Engine** (10 files): `sanctioningEngine`, `sanctioningWorkflow`, `sanctioningValidation`, `sanctioningScenarios`, `sanctioningPolicies`, `sanctioningCompliance`, `sanctioningCalendar`, `sanctioningAmendments`, `sanctioningActivation`, `sanctioningTypes`

**Temporal Engine** (12 files): `bridge`, `capacityCurve`, `collisionDetection`, `conflictEvaluators`, `planState`, `railDerivation`, `shadowScheduling`, `temporalEngine`, `temporalEngineCoverage`, `timeGranularity`, `validationPipeline`, `venueAvailability`

**Ranking/Scales** (14 files): `aggregation`, `applyRankingPoints`, `atpPolicy`, `awardProfileSelection`, `ficExploration`, `generateRankingList.branches`, `getEventRankingPoints`, `itfWttPolicy`, `phase2Features`, `policyLevelPoints`, `qualityWinPoints`, `qualityWinPointsCoverage`, `ustaJuniorPolicy`, `wtaPolicy`

**Publishing** (11 files): `drawDetailPublishing`, `embargoEnforcement`, `embargoScheduleInteraction`, `eventPublishFiltering`, `multiTournamentPublishing`, `publishStateConsistency`, `roundVisibilityState`, `scheduleDateFiltering`, `scheduledRoundsPublishing`, `statusVariants`, `unpublishTournament`

**Scoring Engine** (13+ files): `scoringEngineCoverage` (1,733 lines), `engine-api-extensions` (1,037 lines), `scoring-engine` (295 lines), `undo-redo`, `substitutions`, `statistics`, `addPoint`, `mixed-game-point`, `outs-scoring-engine`, `pbp-validation`, `pbpValidator`, `pbpValidatorCoverage`, `mcpParser`, `mcpValidator`, `mcpParserCoverage`, `mcpValidatorBranches`, `serveSideCalculator`, `server-tracking-mixed`, `validateMatchUpCoverage`

**Lucky Draws** (5 files): `luckyDrawAdvancement`, `luckyDrawAdvancementBranches`, `luckyDrawByeRounds`, `luckyDrawCoverage`, `luckyDrawWithPlayoff`

**Voluntary Consolation / Draw Types** (7 files): `voluntaryConsolation`, `drawMaticVoluntaryConsolation`, `adaptive`, `adaptiveCompletion`, `addVoluntaryConsolationStage`, `compassViaWithPlayoffs`, `withPlayoffs`

**Draft Draws** (1 file): `draftPositioning`

**Mutation Locks** (2 files): `mutationLocks`, `removeMutationLock`

**Venues** (3 files): `courtAvailabilityConflicts`, `deleteCourts`, `primaryVenue`

**Officiating** (1 file): `officiatingEngine`

**HYBRID** (1 file): `hybridEventType`

**Refactoring Regression Tests** (14 files): Targeted tests created alongside cognitive complexity refactoring to guard against behavioral regressions — `getParticipantEntries.refactor`, `setMatchUpState.refactor`, `getTournamentPoints.refactor`, `v2Scheduler.refactor`, `addPoint.refactor`, `tier2.refactor`, `tier3-4.refactor`, plus coverage tests for `modifyMatchUpScore`, `jinnScheduler`, `analyzeSet`, `assignTieMatchUpParticipant`, `tieFormat`, `playoffStructures`, `qualifiersAction`

**League Profiles** (1 file): `processLeagueProfiles` — 13 tests covering team generation, draw configuration, multiple leagues, naming, tie format resolution, and mocksEngine integration

**Coverage Expansion** (40+ files): Extensive branch and statement coverage tests targeting existing governors and mutations — `coverageBranchBulk[1-6]`, `coverageStatementGaps[1-5]`, `coverageFinalPush[1-3]`, plus targeted coverage for scoring, scheduling, draw generation, and tournament operations.

---

## mocksEngine Improvements

### Deterministic Generation

A `nonRandom` seed parameter has been added to mocksEngine, enabling fully deterministic and reproducible tournament generation. Uses a seeded PRNG (`src/tools/prng.ts`) so that the same seed always produces identical draws, participants, and outcomes. Essential for snapshot testing and CI reproducibility.

### Exported Primitives

Internal generation primitives are now exported for end-user testing frameworks:

- `generateOutcome`
- `completeDrawMatchUps`
- `generateEventWithDraw`
- `removeMatchUpOutcome`

This allows consumers to build custom testing harnesses on top of factory's mock infrastructure without depending on internal APIs.

### Expanded Generation Capabilities

- **Team size override:** `generateParticipants` accepts an explicit team size parameter to override calculated size
- **participantRole support:** Mock participant generation now accepts `participantRole`
- **Timed format completion:** `completeDrawMatchUps` correctly handles timed match formats
- **HYBRID event generation:** Mocks can generate HYBRID events with mixed INDIVIDUAL/PAIR participants
- **Lucky draw scenarios:** Extended scenario generation and completion logic for Lucky Draw structures
- **Recursive playoff directives:** `generateDrawDefinition` / `generateEventWithDraw` support recursive playoff structure specification

### mocksEngine Documentation

Seven new documentation files covering the full mocksEngine surface:

- `mocks-engine-overview.md`
- `mocks-engine-getting-started.md`
- `mocks-engine-tournament-generation.md`
- `mocks-engine-participants.md`
- `mocks-engine-outcomes.md`
- `mocks-engine-patterns.md`
- Updated `mocks-governor.md`

---

## Bug Fixes

### Scoring

- ScoringEngine: reset point score on `addGame()`
- Round-trip support for IN_PROGRESS partial game scores
- Persist IN_PROGRESS partial scores correctly
- Fix `addPoint` when `addGame` entry is part of history
- Add missing NOAD to `FORMAT_ATP_DOUBLES`; fix key-value scorer for NOAD tiebreaks
- Cross-set server tracking fix

### Publishing / Embargo

- Correct schedule visibility bug in publishing pipeline
- Fix visibility of scheduled tieMatchUps
- Correct embargo visibility bug for `getEventData`
- Correct embargo of matchUp schedules
- Add missing attributes to published order of play object
- Add `UNPUBLISH_PARTICIPANTS` to topicConstants export

### Lucky Draws

- Correct lucky bye placement errors
- Fix lucky draw links
- Fix AD_HOC as consolation to Lucky
- Fix `resetDrawDefinition` for lucky draws

### Voluntary Consolation

- Scope VC entries in `resetDrawDefinition` and `generateVoluntaryConsolation`
- Update `isAdHoc` detection for voluntary consolation scenarios
- Additional CONTAINER structure detection for `isAdHoc`
- `resetDrawDefinition()` correctly handles AD_HOC VOLUNTARY_CONSOLATION

### Draws / Structure

- Allow double elimination loser to fill available decider position
- Update `processPlayoffGroups` to support AD_HOC as playoff for RR
- Correct `drawMatic` for targeting consolation structures
- Clear up PLAY_OFF vs PLAYOFF confusion
- Create qualifying placeholder before positioning to prevent bye/qualifier position clashes
- Filter WITHDRAWN entries in `addEntries` during draw generation
- Preserve `drawType` when adding qualifying to an existing draw
- Swiss draws now have `positionAssignments` and proper qualifier reservation
- Fix lucky draw detection for Swiss and qualifying structures
- Fix `ROUND_TARGET` extension name in `addDrawEntry` (was incorrectly `'roundEntry'`)
- Allow qualifying entries in drawDefinition when `qualifyingOnly: true` and `drawEntries` provided

### Scheduling / Dates

- Correct order-of-play `scheduledDates` handling in `competitionScheduleMatchUps`
- Correct GMT issue with `dateStringDaysChange`

### Participants

- Add coercion when `participantIds` are numeric rather than strings

### Infrastructure

- Standardize `tsconfig.base.json` case for Linux CI compatibility
- Make `addVersion` rm non-fatal when no backup files exist

---

## PAGE_PLAYOFF Draw Type

A new **Page Playoff System (PPS)** draw type — a 4-participant hybrid knockout format that gives the top two seeds double-elimination protection while maintaining single elimination for the remaining two. All four finishing positions are resolved definitively through actual matchUps.

### Structure

Four linked structures: **Qualifier 1** (seeds 1 vs 2), **Eliminator** (seeds 3 vs 4), **Qualifier 2** (Q1 loser vs Eliminator winner), **Final** (Q1 winner vs Q2 winner). Connected by 4 links (2 WINNER, 1 LOSER, 1 WINNER).

### Three Usage Paths

1. **Standalone draw type:** `drawType: PAGE_PLAYOFF, drawSize: 4` — generates structures with manual positioning
2. **Round Robin playoff group:** `playoffGroups: [{ drawType: PAGE_PLAYOFF, finishingPositions: [1] }]` — POSITION link from RR groups, fully automated
3. **Single Elimination playoff attachment:** via `generateAndPopulatePlayoffStructures` — TMX "Add Playoffs" modal has "Page Playoff (1-4)" toggle

### Advantages

Based on research by Rafique & Sanders (Syracuse University, MIT Sloan 2026) proving PPS maximizes efficacy (probability of the best team winning) and preserves fairness across 1 million simulated tournaments. Used in IPL/PSL/BPL cricket, NBA Play-In Tournament, curling, and softball.

---

## Swiss System Draw Type

A full **Swiss System** implementation for multi-round tournament pairing, built on the Ad Hoc draw infrastructure.

### Pairing Algorithm

- **Round 1:** FIDE-style pairing — sort participants by rating (descending), split into top and bottom halves, pair top vs bottom (1v5, 2v6, 3v7, 4v8 for 8 players)
- **Subsequent rounds:** Score-group pairing — group participants by W-L record, apply FIDE-style pairing within each group
- **Floating:** When a score group has an odd count, the lowest-rated participant floats down to the next group
- **Repeat avoidance:** Encounter tracking via pairing hash prevents re-matching opponents
- **Bye handling:** Odd participant count assigns bye to the lowest-rated participant in the lowest score group

### Rating Scale Support

TMX exposes a rating scale selector for Swiss draws (same dropdown as DrawMatic). The selected scale is stored as a `swissScaleName` extension on the draw definition and passed through on each `generateSwissRound` call.

### Standings and Tiebreakers

`getSwissStandings` returns ranked standings with four tiebreaker methods:

| Method            | Description                                                             |
| ----------------- | ----------------------------------------------------------------------- |
| BUCHHOLZ          | Sum of all opponents' scores                                            |
| MEDIAN_BUCHHOLZ   | Buchholz excluding highest and lowest opponent scores                   |
| SONNEBORN_BERGER  | Sum of defeated opponents' scores plus half the drawn opponents' scores |
| PROGRESSIVE_SCORE | Cumulative sum of round-by-round cumulative point totals                |

### Swiss Chart

`getSwissChart` returns per-round snapshots of score groups for visualization — each round contains nodes with participant lists grouped by their W-L-D record.

### Key Methods

- `generateSwissRound({ drawId })` — generates the next round of Swiss pairings
- `addAdHocMatchUps({ matchUps, structureId, drawId })` — adds generated matchUps to the draw
- `getSwissStandings({ drawId })` — returns ranked standings with tiebreaker values
- `getSwissChart({ drawId })` — returns score-group chart data for visualization

### Competition Policy Integration

Swiss draws support the new `POLICY_TYPE_COMPETITION` for three-track rating evaluation. When a competition policy is attached with `pairingPolicy.method: 'SWISS'`, the Swiss pairing algorithm uses dynamic form ratings from the competition state instead of raw scale values.

---

## Competition Policy (Three-Track Rating System)

A new `POLICY_TYPE_COMPETITION` policy type enables multi-round competition evaluation with three distinct rating tracks. This is the architecture described in the "Luck vs. Skill" specification — a system where dynamic ratings affect opportunity (pairing) but never evaluation (pressure scoring).

### Three Rating Tracks

| Track                   | Mutability          | Purpose                                                             |
| ----------------------- | ------------------- | ------------------------------------------------------------------- |
| **Baseline Rating**     | Frozen during event | Defines expected performance; source of pressure expectations       |
| **Dynamic Form Rating** | Updated each round  | Drives pairing; ensures competitive matches via Elo-like updates    |
| **Pressure Rating**     | Cumulative          | Measures overperformance vs baseline expectation; determines winner |

### Core Invariant

**Dynamic ratings affect opportunity, never evaluation.** The pressure rating always uses the frozen baseline for expectation calculation, preventing a feedback loop where early overperformance inflates expectations.

### Processing Granularity

The policy supports two processing modes:

- **PER_MATCHUP** — ratings update automatically in the scoring pipeline after each matchUp outcome is finalized
- **PER_ROUND** — ratings update in batch when `processCompetitionRound` is called (typically at round generation time)

### Rating Math

- **Expected score:** Logistic function `E = 1 / (1 + 10^((Rj - Ri) / S))` with configurable logistic scale
- **Actual output:** Format-agnostic — derives countable scoring units (games, points, sets) from any matchUp format
  - `POINT_SHARE` mode: `pointsWon / totalPoints`
  - `WEIGHTED` mode: configurable weights for point share, point differential, and context factor
- **Pressure delta:** `actualOutput - expectedOutput` (always baseline-based)
- **Dynamic form update:** `R_new = R_old + K * (actualOutput - dynamicExpected)`

### Victory Policy

Configurable primary ranking (`PRESSURE_RATING`, `DYNAMIC_FORM_RATING`, `WINS`, `POINTS`) with ordered tiebreakers including `HEAD_TO_HEAD`, `HEAD_TO_HEAD_PRESSURE`, `POINT_DIFFERENTIAL`, `STRENGTH_OF_OPPOSITION`, `BUCHHOLZ`, `SONNEBORN_BERGER`.

### Preset Fixtures

| Fixture                     | Pairing   | Primary Ranking          | Processing  |
| --------------------------- | --------- | ------------------------ | ----------- |
| POLICY_COMPETITION_STANDARD | DrawMatic | WINS                     | PER_ROUND   |
| POLICY_COMPETITION_PRESSURE | DrawMatic | PRESSURE_RATING          | PER_MATCHUP |
| POLICY_COMPETITION_SWISS    | Swiss     | WINS + BUCHHOLZ tiebreak | PER_ROUND   |

### Pairing Integration

When a competition policy is present, `generateDrawMaticRound` and `generateSwissRound` automatically use dynamic form ratings from the competition state instead of raw scale values or the legacy `dynamicRatings` system. The existing DrawMatic value function, encounter tracking, and candidate generation are fully reused.

### New competitionGovernor Methods

**Mutations:** `initializeCompetitionState`, `processCompetitionMatchUp`, `processCompetitionRound`, `resetCompetitionState`

**Queries:** `getCompetitionState`, `getCompetitionPolicy`, `getCompetitionLeaderboard`, `getCompetitionParticipantState`

### State Management

Competition state is stored as a `competitionState` extension on the draw definition. It contains per-participant states (baseline, dynamic form, pressure ratings, W/L/D records, rating history) and per-round states (processing status, lane assignments).

---

## Infrastructure

- Resolve Jest server test failures with TypeScript 6 (`jest.config.cjs` — explicit types configuration for ts-jest)

---

## Documentation

Comprehensive documentation was added across all new and existing features:

- **CODES / matchUpFormat:** 3 docs (data standards, matchup-format specification with sport reference tables, matchup-format governor API)
- **Temporal Engine:** 5 docs (overview, API, block types, event system, UI integration)
- **Sanctioning Engine:** 4 docs (engine, design document, governor, policy)
- **Officiating Engine:** 2 docs (engine, governor)
- **Scale/Ranking Engine:** 6 docs (overview, API, ranking points pipeline, aggregation, quality wins)
- **Scoring Engine:** 2 docs (overview/architecture, complete API reference)
- **Publishing:** 8 docs (overview, embargo, events, order of play, participants, seeding, workflows, data subscriptions)
- **Draw Types:** 14 new draw type documentation files (including Swiss System)
- **Competition Policy:** policy documentation, competition governor methods
- **Concepts:** draft draws, mutation locks, exit profiles, finishing positions, date/time handling, draw links, seed withdrawal cascade
- **mocksEngine:** 7 docs (overview, getting started, tournament generation, participants, outcomes, patterns, governor)
- **DrawMatic:** pressure ratings and pressure score documentation
- **TMX API surface** documentation
