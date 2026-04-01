# Cognitive Complexity Refactoring Report

**Date:** 2026-04-01
**Codebase:** CourtHive/factory (tods-competition-factory)
**Tests:** 8,193 passing, 0 failures, 0 behavioral changes

## Overview

Systematic cognitive complexity reduction across the factory codebase. All refactoring preserved exact behavior — no API changes, no new exports (except 2 shared completion functions), no removed functionality.

### Approach

1. Assessed cognitive complexity without SonarQube using the `sonarjs/cognitive-complexity` ESLint rule (already installed but disabled)
2. Created regression test files in `src/tests/refactoring/` before each batch
3. Extracted focused helper functions from monolithic functions
4. Validated with targeted tests + full suite after each batch

### Impact Summary

| Metric                           | Before | After        | Change |
| -------------------------------- | ------ | ------------ | ------ |
| Functions with complexity > 50   | 36     | 5            | -86%   |
| Functions with complexity > 40   | 62     | 40           | -35%   |
| Functions with complexity > 30   | 93     | 74           | -20%   |
| Functions with complexity > 25   | 123    | 105          | -15%   |
| Total helper functions extracted | —      | ~130         | —      |
| Files refactored                 | —      | 43           | —      |
| Regression tests added           | —      | 54 (7 files) | —      |

Of the 5 remaining functions above 50, 3 are mock test generators (lower priority) and 2 are production code (`luckyDrawAdvancement` at 60, `generateEventWithDraw` helper at 57).

---

## Tier 1 — Highest Priority (5 files)

### 1. `query/participants/getParticipantEntries.ts`

**Was:** 718-line single function, zero direct test coverage, 5 nested responsibilities
**Extracted:**

- `computeRRFinishingPositions` — RR tally computation
- `computeStatisticsAndRankingProfile` — win/loss statistics + ranking profile
- `detectScheduleConflicts` — O(n²) schedule conflict detection

### 2. `mutate/matchUps/matchUpStatus/setMatchUpState.ts`

**Was:** 360-line god function with 10 sequential concerns
**Extracted:**

- `handleTeamAutoCalc` — TEAM disableAutoCalc/enableAutoCalc + lineUps
- `resolveQualifyingContext` — qualifying stage detection
- `resolveTieMatchUpContext` — dual/tie matchUp resolution
- **Clarified final dispatch** — replaced `||`-chained expression with explicit if/else

### 3. `query/scales/getTournamentPoints.ts`

**Was:** 420-line monolith with 5 nesting levels
**Extracted:**

- `calculateDrawPoints` — per-draw point calculation (largest extraction)
- `calculateTeamLinePoints` — team tieMatchUp per-line-position points
- `calculateBonusPoints` — bonus points from finishing position
- `calculateQualityWinPoints` — quality win points

### 4. `mutate/matchUps/schedule/schedulers/v2Scheduler/v2Scheduler.ts`

**Was:** 456-line single function, entire file
**Extracted:**

- `tryScheduleMatchUp` — per-matchUp scheduling logic (~160 lines)
- `applyScheduleResults` — post-scheduling assignment phase
- `computeRoundSchedulingStats` — stats/percentage computation

### 5. `mutate/scoring/addPoint.ts` + `assemblies/engines/scoring/ScoringEngine.ts`

**Was:** Duplicated completion logic across both files
**Extracted from addPoint.ts:**

- `handleGameCompletion` — game completion handler from handleStandardSet
- `deriveTiebreakServer` — tiebreak-only/matchTiebreak server derivation
- `deriveTimedServer` — timed set server derivation
  **Shared between files:**
- Exported `checkStandardSetWon` and `checkAndFinalizeMatch`
- ScoringEngine now delegates to shared functions (deduped ~100 lines)

---

## Tier 2 — Complex Algorithms (5 files)

### 6. `assemblies/generators/mocks/generateEventWithDraw.ts`

**Was:** 627-line monolith, 12+ phases
**Extracted:**

- `generateEventParticipants` — participant generation by event type
- `addQualifyingEntries` — qualifying profile entry management
- `processOutcomes` — matchUp completion/outcome processing
- `processIterativeAdHoc` — AD_HOC round iteration

### 7. `mutate/drawDefinitions/positionGovernor/doubleExitAdvancement.ts`

**Was:** `conditionallyAdvanceDrawPosition` at 356 lines with 30% logging noise
**Extracted:**

- `logAdvancement` — consolidated pushGlobalLog wrapper
- `inferSourceSideNumber` — 3-way side number inference
- `buildMatchUpStatusCodes` — mirrored status code construction
- `advanceFromTarget` — post-modification advancement logic
- `advanceByeAdvancedDrawPosition` — bye-advanced-bye edge case

### 8. `mutate/matchUps/drawPositions/positionClear.ts`

**Was:** `removeDrawPosition` at 190 lines VERY HIGH
**Extracted:**

- `buildPairingDetails` — pairing detail map/filter chain
- `buildRemovalTasks` — task construction from pairing details
- `handleTeamPositionRemoval` — TEAM side cleanup
- `updateMatchUpStatusAfterRemoval` — status computation
- `handleLoserMatchUpRemoval` — loser matchUp cleanup with fed/non-fed branching

### 9. `mutate/drawDefinitions/luckyDrawAdvancement.ts`

**Was:** 265-line function, 4 distinct algorithmic phases
**Extracted:**

- `cleanupStalePositionAssignments` — orphaned position cleanup
- `assignNextRoundPositions` — next-round virtual position assignment
- `createVirtualMatchUps` — virtual matchUp entry creation
- `findUnfilledPositions` — unfilled position discovery

### 10. `query/drawDefinition/positionActions/positionActions.ts`

**Was:** `positionActionsInternal` at 340 lines with ~30 local variables
**Extracted:**

- `resolvePositionContext` — ~150 lines of setup phase into context object

---

## Tier 3 — Engine Classes (2 files)

### 11. `assemblies/engines/scoring/ScoringEngine.ts`

**Extracted (private methods):**

- `prepareRebuildState` — setup phase (lineUps, fresh state, initial score)
- `replaySetServerEntry` — setServer switch case (serverFlip recomputation)

### 12. `assemblies/engines/temporal/TemporalEngine.ts`

**Was:** `loadBlocksFromTournamentRecord` at 124 lines, 4 nesting levels
**Extracted (private methods):**

- `loadVenueAvailability` — venue-level availability + bookings
- `loadCourtAvailability` — court-level availability + bookings
- `createBlockFromBooking` — shared booking→block creation (deduped from 2 paths)

---

## Tier 4 — Validators, Parsers, Helpers (4 files)

### 13. `validators/scoring/mcpValidator.ts`

**Was:** `validateMCPMatch` at 195 lines mixing 4 concerns
**Extracted:**

- `processValidationPoints` — point processing loop + stat accumulation
- `validateFinalScore` — post-processing score validation

### 14. `validators/scoring/mcpParser.ts`

**Was:** `shotParser` at 100 lines with 6-way branch tree
**Extracted:**

- `resolveServeOnlyResult` — no-rally path (ace/serve winner/fault)
- `resolveRallyResult` — rally terminator path (winner/forced/unforced)

### 15. `mutate/matchUps/schedule/scheduleItems/scheduleItems.ts`

**Was:** `addMatchUpScheduleItems` at 295 lines, 13 repetitive blocks
**Extracted:**

- `checkScheduleConflicts` — pro conflict detection
- `addChronologicalTimeItem` — shared stop/resume time pattern (deduped)

### 16. `mutate/entries/addEventEntries.ts`

**Was:** Duplicate `isValidSinglesParticipant` check in filter
**Fixed:** Restructured filter to check type validity once, then gender validity

---

## Tier 5 — Remaining High Complexity (12 files)

### 17. `query/matchUps/roundRobinTally/getParticipantResults.ts`

**Extracted:**

- `filterMatchUps` — status exclusion + participant intersection
- `computeTotals` — totalSets/totalGames calculation
- `processNoWinnerMatchUp` — matchUps with no decided winner
- `tallyTieMatchUpNoWinner` — tie matchUp tally (no winner)
- `processDecidedMatchUp` — matchUps with decided winner
- `tallyTieMatchUpWithWinner` — tie matchUp tally (with winner)
- `applyManualGamesOverride` — manual games override scoring

### 18. `mutate/publishing/publishEvent.ts`

**Extracted:**

- `validateDrawIds` — draw ID validation
- `validateEmbargoValues` — embargo date validation
- `buildExistingDrawDetails` — existing draw detail filtering
- `applyDrawIdPublishState` — publish state add/remove
- `mergeDrawDetail` — per-draw detail merging
- `applyStructureChanges` — structure publish state changes
- `applyStageChanges` — stage publish state changes

### 19. `query/publishing/getPublishState.ts`

**Extracted:**

- `buildEventPublishState` — event/draw status population
- `buildTournamentPublishState` — tournament-level status
- `collectEventEmbargoes` — event embargo collection
- `collectDrawEmbargoes` — draw/stage/structure embargo collection
- `collectScheduledRoundEmbargoes` — scheduled round embargoes

### 20. `mutate/matchUps/schedule/bulkRescheduleMatchUps.ts`

**Extracted:**

- `getScheduledNotCompleted` — matchUp fetch + filter
- `groupByDrawId` — drawId grouping
- `rescheduleMatchUp` — per-matchUp rescheduling

### 21. `query/matchUp/addUpcomingMatchUps.ts`

**Extracted:**

- `addRoundRobinSidesTo` — RR sidesTo computation
- `addEliminationUpcomingInfo` — elimination bracket upcoming info
- `checkScheduleConflict` — schedule conflict check (deduped)
- `addPotentialParticipants` — potential participant computation

### 22. `mutate/drawDefinitions/draft/resolveDraftPositions.ts`

**Extracted:**

- `validateTargetTier` — tier validation
- `resolveTier` — per-tier resolution loop
- `applyResolutions` — resolution application
- `storeTierResolutions` — per-tier detail storage

### 23. `mutate/matchUps/lineUps/applyLineUps.ts`

**Extracted:**

- `validateLineUpAssignments` — lineUp validation loop
- `ensureDoublesPairParticipants` — doubles pair creation
- `determineSideNumber` — side number determination

### 24. `query/filterMatchUps.ts`

**Extracted:**

- `passesBasicFilters` — readyToScore, winningSide, tie, collection checks
- `passesMatchUpPropertyFilters` — stage, round, status, type, format checks
- `passesScheduleAndCourtFilters` — date, court, venue checks
- `passesContextFilters` — tournament, event, draw, structure, participant checks

### 25. `query/events/getEvents.ts`

**Extracted:**

- `sumValues` — array summation
- `computeRatingsStats` — median/avg/max/min stats
- `accumulateRatings` — per-participant rating accumulation
- `processParticipantScales` — participant scale processing
- `buildEventScaleValues` — scale value orchestration

### 26. `mutate/matchUps/lineUps/removeTieMatchUpParticipant.ts`

**Extracted:**

- `removeSubstitutionProcessCodes` — substitution code removal
- `handleDoublesPairModification` — PAIR modification for DOUBLES
- `modifyOrDeleteUnattachedPair` — unattached pair handling
- `createReplacementPairIfNeeded` — replacement pair creation

### 27. `mutate/participants/addParticipant.ts`

**Extracted:**

- `validateBaseParticipant` — base validation
- `validatePairParticipant` — PAIR-specific rules
- `validateTeamGroupParticipant` — TEAM/GROUP validation

### 28. `mutate/participants/scaledTeamAssignment.ts`

**Extracted:**

- `validateScaledTeamArgs` — input validation
- `resolveTeamParticipantIds` — team ID resolution
- `collectRelevantTeams` — team collection
- `ensureTeamsCount` — team creation if needed
- `buildScaledParticipants` — scaled participant list building
- `distributeParticipantsToTeams` — snake-draft assignment
- `removeAssignedFromEvents` — event entry cleanup

---

## Regression Test Files

All in `src/tests/refactoring/`:

| File                                     | Tests | Coverage                                                                                                                                     |
| ---------------------------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `getParticipantEntries.refactor.test.ts` |     7 | Event/draw entries, seeding, RR tally, schedule analysis, opponents, doubles, return shape                                                   |
| `setMatchUpState.refactor.test.ts`       |     5 | Basic scoring, walkover, FMLC consolation, score validation, status compatibility                                                            |
| `getTournamentPoints.refactor.test.ts`   |     5 | Policy requirement, position points, per-win points, return shape, draw type matching                                                        |
| `v2Scheduler.refactor.test.ts`           |     3 | Basic scheduling, auto-generated profile, return shape                                                                                       |
| `addPoint.refactor.test.ts`              |    12 | Standard sets, deuce, full set, tiebreak, match completion, TB-only, match TB, server derivation, formatGameScore, ScoringEngine consistency |
| `tier2.refactor.test.ts`                 |    13 | generateEventWithDraw (6), doubleExitAdvancement (1), positionClear (2), luckyDrawAdvancement (1), positionActions (3)                       |
| `tier3-4.refactor.test.ts`               |     9 | ScoringEngine rebuild (2), TemporalEngine (1), mcpParser (3), scheduleItems (1), addEventEntries (2)                                         |

**Total: 54 regression tests across 7 files**

---

## Tier 6 — Second-pass extractions and remaining production files (15 files)

### 29-33. Second batch (complexity 58-62)

- **`getStructureGroups.ts`** — `processLinks`, `enrichProfilesWithRootStageAndProgeny`, `calculateMaxQualifyingDepth`, `addMissingStructures`
- **`resetDrawDefinition.ts`** — `resetVoluntaryConsolationStructure`, `resetStructureAssignments`, `resetLuckyDrawAssignments`, `resetStructureMatchUps`, `resetMatchUpScore`, `resetMatchUpScheduling`
- **`generateDrawStructuresAndLinks.ts`** — `getQualifiersCount`, `analyzeExistingQualifying`, `isInvalidDrawSize`, `reconcileMainStructureIds`
- **`assignMatchUpDrawPosition.ts`** — `resolveMatchUpStatus`, `applyPositionToMatchUp`, `advanceDrawPosition`, `assignTeamLineUp`, `propagateConsolationBye`
- **`validatePlayoffGroups.ts`** — `validateRemainderGroup`, `validateStandardGroup`, `validateBestOfGroup`, `consumeRemainder`

### 34-38. Third batch (complexity 52-58)

- **`getParticipantStats.ts`** — `accumulateTallies`, `computeRatios`, `computeRanks`
- **`getMatchUpScheduleDetails.ts`** — `buildFullSchedule`, `computeRecoveryTimes`, `resolveVenueAndCourt`
- **`getAggregateTeamResults.ts`** — `tallyMatchUpResults`, `tallySide`, `applyBonusPoints`, `computeIndividualPointsPct`
- **`addScaleItems.ts`** — `buildScaleItemsMap`, `applyScaleItemsToParticipants`, `addContextTimeItem`
- **`addMatchUpContext.ts`** — `hydrateSides`, `hydrateSideParticipant`, `inferMatchUpGender`, `processTieMatchUps`

### 39-43. Deep extractions from already-refactored files + remaining >50

- **`keyValueScore.ts`** — `handleOutcomeKey`, `handleBackspace`, `handleScoreJoiner`, `handleMatchTiebreakJoiner`, `handleTiebreakCloser`, `handleSetTiebreakEntry`, `handleNewSet`, `finalizeUpdatedScore`
- **`keyValueUtilities.ts`** — `processMatchTiebreakRemoval`, `buildSetsForIncompleteScore`, `buildSetsForRemainingNumbers`
- **`getTournamentPoints.ts`** (2nd pass) — `processParticipation`, `resolveMaxCountable`, `resolvePositionPoints`, `accumulatePerWinPoints`, `distributeAward`
- **`getParticipantEntries.ts`** (2nd pass) — `getSeedingMap`, `addParticipantDrawEntrySeedings`, `processDrawEntries`, `processEventMatchUp`, `processPotentialParticipants`
- **`v2Scheduler.ts`** (2nd pass) — `evaluateCourt`, `findBestCourtTime`, `scheduleVenuePass`, `scheduleVenueRounds`
- **`mcpValidator.ts`** (2nd pass) — `decorateLastPoint`, `countResult`, `processSinglePoint`
- **`scheduleItems.ts`** (2nd pass) — `applyScheduleTiming`, `applyScheduleAssignments`
- **`competitionScheduleMatchUps.ts`** — `applyPublishedEventIdFilter`, `applyPublishedScheduledDatesFilter`, `applyCompletedExclusion`, `filterByPublishState`, `filterByRoundVisibility`
- **`getCalendarConflicts.ts`** — `checkBlackoutDates`, `computeGap`, `checkTemporalProximity`, `checkGeographicProximity`, `checkMaxEventsPerWeek`

---

## Remaining Violations (> 50)

5 functions still above complexity 50:

| Complexity | File                                  | Notes                           |
| ---------: | ------------------------------------- | ------------------------------- |
|         79 | `generateOutcome.ts:47`               | Mock infrastructure             |
|         79 | `generateOutcome.ts:219`              | Mock infrastructure             |
|         78 | `generateFlightDrawDefinitions.ts:19` | Mock infrastructure             |
|         60 | `luckyDrawAdvancement.ts:39`          | Main function after extractions |
|         57 | `generateEventWithDraw.ts:472`        | processOutcomes helper          |

## Recommendations

1. **Enable the rule at threshold 60 now**: `'sonarjs/cognitive-complexity': ['warn', 60]` — Only 5 violations, all mock generators or borderline. Safe to enable as a floor.

2. **Ratchet to 50 next**: After addressing the 3 mock generators, lower to `['warn', 50]` for zero violations.

3. **Target threshold 40**: Would catch 40 functions — a realistic medium-term goal for production code quality.

4. **Long-term target 25**: The SonarQube default of 15 is aggressive for this codebase. 25 would catch 105 functions — achievable over time by continuing the extraction pattern established here.

5. **Mock generators**: `generateOutcome.ts` and `generateFlightDrawDefinitions.ts` are test infrastructure. Refactoring them is lower priority but would clear the path to threshold 50.

6. **Mock generators**: `generateOutcome.ts`, `generateFlightDrawDefinitions.ts`, etc. are test infrastructure — lower priority for refactoring but should still be addressed eventually.
