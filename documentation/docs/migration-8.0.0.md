---
title: Migration to 8.0.0 (preparation)
---

# Migration to 8.0.0

This guide describes preparation for the next major release. **The engine routes described below remain available in 7.x.**

## Before you upgrade

### Release order

- **`@courthive/competition-catalogue` is on npm before factory 8.0.0, or with it.** 8.0.0 no longer bundles the named
  tie formats and organisation policies, so a consumer that uses them installs the catalogue in the same upgrade.
- **courthive-components 7.x does not work with factory 8.0.0.** Its peer range is factory 7.x, and a matching
  components release ships with 8.0.0. Upgrade the two together.
- **The package manifest is exported.** `require('competition-factory/package.json')` (or an import of it) resolves
  through the `exports` map, as it does for the catalogue, so a tool that reads the installed version needs no deep
  path.

### Reads of moved catalogue entries return `undefined`

`fixtures.tieFormats` is removed, and so are the organisation members of `fixtures.policies`. In TypeScript a plain
read of one fails to compile against the 8.0.0 declarations. A read the compiler does not check fails silently: in
JavaScript, behind a cast such as `(fixtures as any)`, through a computed key, or along an optional chain (`?.`), it
returns `undefined`, and a list built from the object's keys has fewer entries. Nothing raises an error:

```js
import { fixtures } from 'competition-factory';

// 8.0.0: undefined, no error
const scoring = fixtures.policies?.POLICY_SCORING_USTA;
const college = fixtures.tieFormats?.COLLEGE_D3;

// 8.0.0: only POLICY_SANCTIONING_GENERIC; the organisation rulebooks are not in the factory
const rulebooks = Object.keys(fixtures.policies).filter((name) => name.startsWith('POLICY_SANCTIONING_'));
```

Import a moved entry from `@courthive/competition-catalogue`, and build a list such as the one above from the
catalogue's `policies` together with the factory's own. Search a codebase for `fixtures.policies`,
`fixtures.tieFormats` and `tieFormatConstants` before upgrading; each read of a moved name needs the catalogue. See
[named catalogue inputs](#named-catalogue-inputs) for the inputs that took a name in 7.x.

### Pass `tieFormat` for TEAM draws only

`generateDrawDefinition` reads a `tieFormatName` only for a TEAM draw of a TEAM event; on any other draw the name is
ignored, in 7.x and in 8.0.0. A `tieFormat` object is not ignored the same way. On a draw that is not TEAM:

- **Beside a `matchUpFormat`, the `tieFormat` is kept and the `matchUpFormat` is not.** The draw definition stores the
  `tieFormat`, takes no `matchUpFormat`, and its SINGLES or DOUBLES matchUps are generated with tie matchUps.
- **Without a `matchUpFormat`, the `tieFormat` is dropped** and the draw takes the event's `matchUpFormat`, or the
  standard format.

A draw form that sent a scorecard name with every event relied on the name being ignored outside TEAM events. When
it moves from the name to the object, it sends `tieFormat` only when the event and the draw are TEAM, and
`matchUpFormat` otherwise.

## Governor and engine route removals

See the [engine API transition manifest and per-method guidance](/docs/implementation/engine-api-transition-8). Selected methods are removal candidates pending symbol-aware consumer review and external-integrator confirmation. Their full references have moved outside the governor API listings, with migration stubs at old anchors.

Engine-route removal, standalone package-export retention and internal implementation status are separate decisions. Test-only conformance-harness access does not require a production governor export. No unsupported deep import is recommended.

### Stateless functions move to tools

Governor functions that read no tournament state and take positional arguments leave the governors and the engines in
8.0.0. An engine calls every method with one params object, so it could never call them correctly. Import them from
their domain in `tools`, available from 7.33. From 7.49, import the domain from its own subpath
(`tods-competition-factory/tools/<domain>`), which loads that domain alone; the aggregate `tools` export, which loads
every domain, stays in 7.x:

```js
import { validateMatchUpScore } from 'tods-competition-factory/tools/scoring';
import { parse } from 'tods-competition-factory/tools/formats';
import { tools } from 'tods-competition-factory';

// 7.49 and later: the domain's subpath, recommended
validateMatchUpScore(sets, 'SET3-S:6/TB7');
parse('SET3-S:6/TB7');
// 7.33 and later: the aggregate, which loads every domain
tools.scoring.validateMatchUpScore(sets, 'SET3-S:6/TB7');
// 7.x only
scoreGovernor.validateMatchUpScore(sets, 'SET3-S:6/TB7');
```

- `tools.formats` replaces the matchUpFormat governor's `parse`, `stringify`, `isAggregateFormat`, `finalSetGoverns` and
  `aggregateDeciderSetNumber`, and the score governor's aliases `parseMatchUpFormat` / `stringifyMatchUpFormat`. It
  also holds the format validators `isValidMatchUpFormat` and `validateMatchUpFormat`; the governor's `isValid` alias
  has no `tools.formats` counterpart, so use `isValidMatchUpFormat`.
- `tools.scoring` replaces the score governor's validators, scoring-engine state readers and point and statistics
  parsers.
- The availability helpers stay on the `availability` export and leave the engines.
- `tools.publishing` replaces the publishing governor's `isEmbargoed`, `isVisiblyPublished` and
  `getRoundVisibilityState`. Each takes the instant as `asOf`, which is optional in 7.x (it falls back to the
  competition clock) and required in 8.0.0.
- `tools.entries`, `tools.draws` and `tools.matchUps` replace the entries governor's fee helpers, the draws governor's
  `isAdHocType` / `isLadder`, and the matchUp governor's `validMatchUp` / `validMatchUps`.
- `tools.rankings.deriveRankingList` replaces the ranking governor's `applyDerivedRankings` (the same function, named
  for what it does). The rolling award window is `tools.rankings.computeAwardWindow`. The ranking governor's
  `getParticipantPoints` and `getQualityWinPoints` are `tools.rankings.getParticipantPoints` and
  `tools.rankings.getQualityWinPoints`.
- `publishingGovernor.isTournamentPublished(tournamentRecord)` is retired. It takes a whole record, so it is neither a
  query nor a tool. Use the `getPublishState` query.
- **Stateless queries that take a params object** (read no tournament state; confirmed by test) are also on `tools`,
  by domain, from 7.49: the same functions, called the same way. If you call one through an engine, move the call to
  its `tools` home, for example `engine.getRoundMatchUps({ matchUps })` to
  `tools.matchUps.getRoundMatchUps({ matchUps })`, and `scaleEngine.generateRankingList({ pointAwards })` to
  `tools.rankings.generateRankingList({ pointAwards })`. The engine routes are unchanged in 7.x; the
  [transition index](/docs/implementation/engine-api-transition-8) records which leave at 8.0.0. The homes:
  `tools.scoring` (score and set readers, `keyValueScore`, `repairScore`, `mcpValidator`, `pbpValidator`),
  `tools.formats` (the tieFormat functions), `tools.matchUps` (matchUp readers, `matchUpScheduleLocked`,
  `courtGridRows`), `tools.draws`, `tools.entries`, `tools.rankings` (ranking lists, award profiles and points, scale
  readers), and three new domains, `tools.seasons`, `tools.sanctioning` and `tools.officiating`. The availability
  engine's `runValidationPipeline` is `availability.runValidationPipeline`.

[By governor](#by-governor) lists every function this moves, governor by governor.

### `utilities` is removed

`utilities` is a deprecated alias of `tools` (`export * as utilities` beside `export * as tools`). It is removed in
8.0.0, so replace `utilities.` with `tools.`. Nothing else changes.

### Progression edges: addGoesTo

Use [the supported storage, ingest, draw-addition and read-projection routes](/docs/implementation/records/addGoesTo#supported-migration-routes). The old helper mutates stored matchUps despite its query-governor placement and is not a safe read-only API.

### By governor

Every method that leaves a governor at 8.0.0, grouped by the governor that holds it in 7.x, with its replacement. A
method a governor holds is also the method of the same name on each engine that carries the governor, and it leaves
the engines with it. Each old call still works in 7.x, and its published declaration carries a `@deprecated` tag that
names the replacement. A function held by two governors (`drawsGovernor` and `queryGovernor`, for example) is listed
under both. "None" means the engine gains no replacement; the linked reference describes the function and what to use
instead. Methods that stay are not listed.

<!-- MIGRATION_BY_GOVERNOR:START — generated by scripts/generateMigrationByGovernor.mjs; do not edit by hand -->

#### availabilityGovernor

| Old call                                                      | Replacement                                           | Notes                                                                                     |
| ------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `availabilityGovernor.applyAvailabilityToTournamentRecord`    | None                                                  | See [its reference](/docs/implementation/scheduling/applyAvailabilityToTournamentRecord). |
| `availabilityGovernor.buildDayRange`                          | `availability.buildDayRange`                          | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.buildEdges`                             | `availability.buildEdges`                             | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.buildSchedulingProfileFromUISelections` | `availability.buildSchedulingProfileFromUISelections` | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.calculateCapacityStats`                 | `availability.calculateCapacityStats`                 | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.calculateCourtHours`                    | `availability.calculateCourtHours`                    | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.clampDragToCollisions`                  | `availability.clampDragToCollisions`                  | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.clampToDayRange`                        | `availability.clampToDayRange`                        | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.compareCapacityCurves`                  | `availability.compareCapacityCurves`                  | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.computePlanItemId`                      | `availability.computePlanItemId`                      | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.courtDayKey`                            | `availability.courtDayKey`                            | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.courtKey`                               | `availability.courtKey`                               | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.createFollowByEvaluator`                | `availability.createFollowByEvaluator`                | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.deriveRailSegments`                     | `availability.deriveRailSegments`                     | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.diffMinutes`                            | `availability.diffMinutes`                            | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.EvaluatorRegistry`                      | None                                                  | See [its reference](/docs/implementation/scheduling/EvaluatorRegistry).                   |
| `availabilityGovernor.extractDay`                             | `availability.extractDay`                             | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.filterCapacityCurve`                    | `availability.filterCapacityCurve`                    | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.findBlocksContainingTime`               | `availability.findBlocksContainingTime`               | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.formatConflicts`                        | `availability.formatConflicts`                        | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.generateCapacityCurve`                  | `availability.generateCapacityCurve`                  | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.getHighestSeverity`                     | `availability.getHighestSeverity`                     | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.groupConflictsBySeverity`               | `availability.groupConflictsBySeverity`               | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.hhmmToMinutes`                          | `availability.hhmmToMinutes`                          | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.intervalsOverlap`                       | `availability.intervalsOverlap`                       | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.iterateDayTicks`                        | `availability.iterateDayTicks`                        | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.mergeAdjacentSegments`                  | `availability.mergeAdjacentSegments`                  | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.mergeOverlappingAvailability`           | `availability.mergeOverlappingAvailability`           | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.minutesToHhmm`                          | `availability.minutesToHhmm`                          | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.overlappingRange`                       | `availability.overlappingRange`                       | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.railsToDateAvailability`                | `availability.railsToDateAvailability`                | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.rangesOverlap`                          | `availability.rangesOverlap`                          | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.resolveCourtId`                         | `availability.resolveCourtId`                         | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.resolveStatus`                          | `availability.resolveStatus`                          | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.resolveVenueId`                         | `availability.resolveVenueId`                         | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.runValidationPipeline`                  | `availability.runValidationPipeline`                  | The same params object.                                                                   |
| `availabilityGovernor.sampleCapacityCurve`                    | `availability.sampleCapacityCurve`                    | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.snapIsoToGranularity`                   | `availability.snapIsoToGranularity`                   | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.snapToGranularity`                      | `availability.snapToGranularity`                      | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.sortBlocksByStart`                      | `availability.sortBlocksByStart`                      | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.sortEdges`                              | `availability.sortEdges`                              | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.timeInsideBlock`                        | `availability.timeInsideBlock`                        | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.todsAvailabilityToBlocks`               | None                                                  | See [its reference](/docs/implementation/scheduling/todsAvailabilityToBlocks).            |
| `availabilityGovernor.validateDateAvailability`               | `availability.validateDateAvailability`               | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.validateSchedulingProfileFormat`        | `availability.validateSchedulingProfileFormat`        | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.validateSegments`                       | `availability.validateSegments`                       | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.venueDayKey`                            | `availability.venueDayKey`                            | Positional arguments: call it directly, not through an engine.                            |
| `availabilityGovernor.venueKey`                               | `availability.venueKey`                               | Positional arguments: call it directly, not through an engine.                            |

#### drawsGovernor

| Old call                                       | Replacement                         | Notes                                                                                          |
| ---------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| `drawsGovernor.addFinishingRounds`             | None                                | See [its reference](/docs/implementation/draws/addFinishingRounds).                            |
| `drawsGovernor.addGoesTo`                      | Several routes                      | See [the supported routes](/docs/implementation/records/addGoesTo#supported-migration-routes). |
| `drawsGovernor.generateDrawStructuresAndLinks` | None                                | See [its reference](/docs/implementation/draws/generateDrawStructuresAndLinks).                |
| `drawsGovernor.getDrawCompleteness`            | None                                | See [its reference](/docs/implementation/draws/getDrawCompleteness).                           |
| `drawsGovernor.getDrawDefinitionTimeItem`      | None                                | See [its reference](/docs/implementation/scheduling/getDrawDefinitionTimeItem).                |
| `drawsGovernor.getDrawStructures`              | None                                | See [its reference](/docs/implementation/records/getDrawStructures).                           |
| `drawsGovernor.getDrawTypeCoercion`            | `tools.draws.getDrawTypeCoercion`   | The same params object.                                                                        |
| `drawsGovernor.getPositionsPlayedOff`          | None                                | See [its reference](/docs/implementation/draws/getPositionsPlayedOff).                         |
| `drawsGovernor.hasLuckyRounds`                 | None                                | See [its reference](/docs/implementation/draws/hasLuckyRounds).                                |
| `drawsGovernor.isAdHocType`                    | `tools.draws.isAdHocType`           | Positional arguments: call it directly, not through an engine.                                 |
| `drawsGovernor.isLadder`                       | `tools.draws.isLadder`              | Positional arguments: call it directly, not through an engine.                                 |
| `drawsGovernor.predictDrawCompetitiveBands`    | None                                | See [its reference](/docs/implementation/draws/predictDrawCompetitiveBands).                   |
| `drawsGovernor.remapDrawDefinitionMatchUpIds`  | None                                | See [its reference](/docs/implementation/draws/remapDrawDefinitionMatchUpIds).                 |
| `drawsGovernor.updateTeamLineUp`               | None                                | See [its reference](/docs/implementation/draws/updateTeamLineUp).                              |
| `drawsGovernor.validatePlayoffGroups`          | `tools.draws.validatePlayoffGroups` | The same params object.                                                                        |

#### entriesGovernor

| Old call                                          | Replacement                        | Notes                                                                              |
| ------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------- |
| `entriesGovernor.getEffectiveRegistrationProfile` | None                               | See [its reference](/docs/implementation/records/getEffectiveRegistrationProfile). |
| `entriesGovernor.getEntryFeeRange`                | `tools.entries.getEntryFeeRange`   | Positional arguments: call it directly, not through an engine.                     |
| `entriesGovernor.getEventEntryFees`               | None                               | See [its reference](/docs/implementation/records/getEventEntryFees).               |
| `entriesGovernor.isIndeterminateFee`              | `tools.entries.isIndeterminateFee` | Positional arguments: call it directly, not through an engine.                     |
| `entriesGovernor.resolveEntryFee`                 | `tools.entries.resolveEntryFee`    | Positional arguments: call it directly, not through an engine.                     |

#### eventGovernor

| Old call                             | Replacement | Notes                                                                   |
| ------------------------------------ | ----------- | ----------------------------------------------------------------------- |
| `eventGovernor.getEligibleEvents`    | None        | See [its reference](/docs/implementation/records/getEligibleEvents).    |
| `eventGovernor.getEventCompleteness` | None        | See [its reference](/docs/implementation/records/getEventCompleteness). |
| `eventGovernor.removeScaleValues`    | None        | See [its reference](/docs/implementation/records/removeScaleValues).    |
| `eventGovernor.validateCategory`     | None        | See [its reference](/docs/implementation/validation/validateCategory).  |

#### generationGovernor

| Old call                                            | Replacement | Notes                                                                           |
| --------------------------------------------------- | ----------- | ------------------------------------------------------------------------------- |
| `generationGovernor.generateDrawStructuresAndLinks` | None        | See [its reference](/docs/implementation/draws/generateDrawStructuresAndLinks). |

#### ladderGovernor

| Old call                              | Replacement | Notes                                                                   |
| ------------------------------------- | ----------- | ----------------------------------------------------------------------- |
| `ladderGovernor.getLadderMovement`    | None        | See [its reference](/docs/implementation/records/getLadderMovement).    |
| `ladderGovernor.refreshLadderRatings` | None        | See [its reference](/docs/implementation/records/refreshLadderRatings). |

#### matchUpFormatGovernor

| Old call                                          | Replacement                               | Notes                                                                                                                          |
| ------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `matchUpFormatGovernor.aggregateDeciderSetNumber` | `tools.formats.aggregateDeciderSetNumber` | Positional arguments: call it directly, not through an engine. The governor is retired.                                        |
| `matchUpFormatGovernor.finalSetGoverns`           | `tools.formats.finalSetGoverns`           | Positional arguments: call it directly, not through an engine. The governor is retired.                                        |
| `matchUpFormatGovernor.isAggregateFormat`         | `tools.formats.isAggregateFormat`         | Positional arguments: call it directly, not through an engine. The governor is retired.                                        |
| `matchUpFormatGovernor.isValid`                   | `tools.formats.isValidMatchUpFormat`      | The same params object. Renamed. The governor is retired.                                                                      |
| `matchUpFormatGovernor.isValidMatchUpFormat`      | `tools.formats.isValidMatchUpFormat`      | The same params object. The engine method stays: `matchUpGovernor` and `queryGovernor` keep the name. The governor is retired. |
| `matchUpFormatGovernor.parse`                     | `tools.formats.parse`                     | Positional arguments: call it directly, not through an engine. The governor is retired.                                        |
| `matchUpFormatGovernor.stringify`                 | `tools.formats.stringify`                 | Positional arguments: call it directly, not through an engine. The governor is retired.                                        |
| `matchUpFormatGovernor.validateMatchUpFormat`     | `tools.formats.validateMatchUpFormat`     | The same params object. The governor is retired.                                                                               |

#### matchUpGovernor

| Old call                                         | Replacement                                   | Notes                                                                             |
| ------------------------------------------------ | --------------------------------------------- | --------------------------------------------------------------------------------- |
| `matchUpGovernor.calculateMatchUpMargin`         | `tools.matchUps.calculateMatchUpMargin`       | The same params object.                                                           |
| `matchUpGovernor.getMatchUpRatingDelta`          | None                                          | See [its reference](/docs/implementation/records/getMatchUpRatingDelta).          |
| `matchUpGovernor.getMatchUpType`                 | `tools.matchUps.getMatchUpType`               | The same params object.                                                           |
| `matchUpGovernor.participantScheduledMatchUps`   | `tools.matchUps.participantScheduledMatchUps` | The same params object.                                                           |
| `matchUpGovernor.predictMatchUpCompetitiveBands` | None                                          | See [its reference](/docs/implementation/records/predictMatchUpCompetitiveBands). |
| `matchUpGovernor.setMatchUpState`                | `matchUpGovernor.setMatchUpStatus`            | The same params object. Renamed.                                                  |
| `matchUpGovernor.validMatchUp`                   | `tools.matchUps.validMatchUp`                 | Positional arguments: call it directly, not through an engine.                    |
| `matchUpGovernor.validMatchUps`                  | `tools.matchUps.validMatchUps`                | Positional arguments: call it directly, not through an engine.                    |

#### mocksGovernor

| Old call                                       | Replacement                                         | Notes                                                                                 |
| ---------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `mocksGovernor.completeDrawMatchUps`           | `simulationGovernor.completeDrawMatchUps`           | The same params object. The engine method stays: `simulationGovernor` keeps the name. |
| `mocksGovernor.generateOutcome`                | `simulationGovernor.generateOutcome`                | The same params object. The engine method stays: `simulationGovernor` keeps the name. |
| `mocksGovernor.generateOutcomeFromScoreString` | `simulationGovernor.generateOutcomeFromScoreString` | The same params object. The engine method stays: `simulationGovernor` keeps the name. |

#### officiatingGovernor

| Old call                                                  | Replacement                                             | Notes                   |
| --------------------------------------------------------- | ------------------------------------------------------- | ----------------------- |
| `officiatingGovernor.queryOfficialRecord`                 | `tools.officiating.queryOfficialRecord`                 | The same params object. |
| `officiatingGovernor.validateOfficiatingStatusTransition` | `tools.officiating.validateOfficiatingStatusTransition` | The same params object. |

#### participantGovernor

| Old call                                          | Replacement                     | Notes                                                                          |
| ------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| `participantGovernor.getParticipantTimeItem`      | None                            | See [its reference](/docs/implementation/scheduling/getParticipantTimeItem).   |
| `participantGovernor.getPresenceExpectation`      | None                            | See [its reference](/docs/implementation/records/getPresenceExpectation).      |
| `participantGovernor.getPresenceRules`            | None                            | See [its reference](/docs/implementation/records/getPresenceRules).            |
| `participantGovernor.getScaleValues`              | `tools.rankings.getScaleValues` | The same params object.                                                        |
| `participantGovernor.validateLineUp`              | None                            | See [its reference](/docs/implementation/validation/validateLineUp).           |
| `participantGovernor.validatePresenceAttribution` | None                            | See [its reference](/docs/implementation/records/validatePresenceAttribution). |

#### publishingGovernor

| Old call                                     | Replacement                                | Notes                                                                                                           |
| -------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `publishingGovernor.getRoundVisibilityState` | `tools.publishing.getRoundVisibilityState` | Positional arguments: call it directly, not through an engine. Pass `asOf`: optional in 7.x, required in 8.0.0. |
| `publishingGovernor.isEmbargoed`             | `tools.publishing.isEmbargoed`             | Positional arguments: call it directly, not through an engine. Pass `asOf`: optional in 7.x, required in 8.0.0. |
| `publishingGovernor.isTournamentPublished`   | the `getPublishState` query                | It takes a whole record.                                                                                        |
| `publishingGovernor.isTournamentVisible`     | None                                       | See [its reference](/docs/implementation/records/isTournamentVisible).                                          |
| `publishingGovernor.isVisiblyPublished`      | `tools.publishing.isVisiblyPublished`      | Positional arguments: call it directly, not through an engine. Pass `asOf`: optional in 7.x, required in 8.0.0. |

#### queryGovernor

| Old call                                        | Replacement                                   | Notes                                                                                                           |
| ----------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `queryGovernor.addGoesTo`                       | Several routes                                | See [the supported routes](/docs/implementation/records/addGoesTo#supported-migration-routes).                  |
| `queryGovernor.calculateMatchUpMargin`          | `tools.matchUps.calculateMatchUpMargin`       | The same params object.                                                                                         |
| `queryGovernor.getAllowedDrawTypes`             | None                                          | See [its reference](/docs/implementation/records/getAllowedDrawTypes).                                          |
| `queryGovernor.getDrawCompleteness`             | None                                          | See [its reference](/docs/implementation/draws/getDrawCompleteness).                                            |
| `queryGovernor.getDrawDefinitionTimeItem`       | None                                          | See [its reference](/docs/implementation/scheduling/getDrawDefinitionTimeItem).                                 |
| `queryGovernor.getDrawStructures`               | None                                          | See [its reference](/docs/implementation/records/getDrawStructures).                                            |
| `queryGovernor.getDrawTypeCoercion`             | `tools.draws.getDrawTypeCoercion`             | The same params object.                                                                                         |
| `queryGovernor.getEffectiveRegistrationProfile` | None                                          | See [its reference](/docs/implementation/records/getEffectiveRegistrationProfile).                              |
| `queryGovernor.getEligibleEvents`               | None                                          | See [its reference](/docs/implementation/records/getEligibleEvents).                                            |
| `queryGovernor.getEntryFeeRange`                | `tools.entries.getEntryFeeRange`              | Positional arguments: call it directly, not through an engine.                                                  |
| `queryGovernor.getEventCompleteness`            | None                                          | See [its reference](/docs/implementation/records/getEventCompleteness).                                         |
| `queryGovernor.getEventEntryFees`               | None                                          | See [its reference](/docs/implementation/records/getEventEntryFees).                                            |
| `queryGovernor.getMatchUpRatingDelta`           | None                                          | See [its reference](/docs/implementation/records/getMatchUpRatingDelta).                                        |
| `queryGovernor.getMatchUpType`                  | `tools.matchUps.getMatchUpType`               | The same params object.                                                                                         |
| `queryGovernor.getParticipantTimeItem`          | None                                          | See [its reference](/docs/implementation/scheduling/getParticipantTimeItem).                                    |
| `queryGovernor.getPositionsPlayedOff`           | None                                          | See [its reference](/docs/implementation/draws/getPositionsPlayedOff).                                          |
| `queryGovernor.getPresenceExpectation`          | None                                          | See [its reference](/docs/implementation/records/getPresenceExpectation).                                       |
| `queryGovernor.getPresenceRules`                | None                                          | See [its reference](/docs/implementation/records/getPresenceRules).                                             |
| `queryGovernor.getRoundVisibilityState`         | `tools.publishing.getRoundVisibilityState`    | Positional arguments: call it directly, not through an engine. Pass `asOf`: optional in 7.x, required in 8.0.0. |
| `queryGovernor.getScaleValues`                  | `tools.rankings.getScaleValues`               | The same params object.                                                                                         |
| `queryGovernor.getTournamentTimeItem`           | None                                          | See [its reference](/docs/implementation/scheduling/getTournamentTimeItem).                                     |
| `queryGovernor.hasLuckyRounds`                  | None                                          | See [its reference](/docs/implementation/draws/hasLuckyRounds).                                                 |
| `queryGovernor.isAdHocType`                     | `tools.draws.isAdHocType`                     | Positional arguments: call it directly, not through an engine.                                                  |
| `queryGovernor.isEmbargoed`                     | `tools.publishing.isEmbargoed`                | Positional arguments: call it directly, not through an engine. Pass `asOf`: optional in 7.x, required in 8.0.0. |
| `queryGovernor.isIndeterminateFee`              | `tools.entries.isIndeterminateFee`            | Positional arguments: call it directly, not through an engine.                                                  |
| `queryGovernor.isLadder`                        | `tools.draws.isLadder`                        | Positional arguments: call it directly, not through an engine.                                                  |
| `queryGovernor.isTournamentPublished`           | the `getPublishState` query                   | It takes a whole record.                                                                                        |
| `queryGovernor.isTournamentVisible`             | None                                          | See [its reference](/docs/implementation/records/isTournamentVisible).                                          |
| `queryGovernor.isVisiblyPublished`              | `tools.publishing.isVisiblyPublished`         | Positional arguments: call it directly, not through an engine. Pass `asOf`: optional in 7.x, required in 8.0.0. |
| `queryGovernor.participantScheduledMatchUps`    | `tools.matchUps.participantScheduledMatchUps` | The same params object.                                                                                         |
| `queryGovernor.predictDrawCompetitiveBands`     | None                                          | See [its reference](/docs/implementation/draws/predictDrawCompetitiveBands).                                    |
| `queryGovernor.predictMatchUpCompetitiveBands`  | None                                          | See [its reference](/docs/implementation/records/predictMatchUpCompetitiveBands).                               |
| `queryGovernor.publicFindVenue`                 | None                                          | See [its reference](/docs/implementation/scheduling/publicFindVenue).                                           |
| `queryGovernor.resolveEntryFee`                 | `tools.entries.resolveEntryFee`               | Positional arguments: call it directly, not through an engine.                                                  |
| `queryGovernor.validateCollectionDefinition`    | None                                          | See [its reference](/docs/implementation/validation/validateCollectionDefinition).                              |
| `queryGovernor.validateLineUp`                  | None                                          | See [its reference](/docs/implementation/validation/validateLineUp).                                            |
| `queryGovernor.validatePlayoffGroups`           | `tools.draws.validatePlayoffGroups`           | The same params object.                                                                                         |
| `queryGovernor.validatePresenceAttribution`     | None                                          | See [its reference](/docs/implementation/records/validatePresenceAttribution).                                  |
| `queryGovernor.validMatchUp`                    | `tools.matchUps.validMatchUp`                 | Positional arguments: call it directly, not through an engine.                                                  |
| `queryGovernor.validMatchUps`                   | `tools.matchUps.validMatchUps`                | Positional arguments: call it directly, not through an engine.                                                  |

#### rankingGovernor

| Old call                               | Replacement                           | Notes                            |
| -------------------------------------- | ------------------------------------- | -------------------------------- |
| `rankingGovernor.applyDerivedRankings` | `tools.rankings.deriveRankingList`    | The same params object. Renamed. |
| `rankingGovernor.getAwardPoints`       | `tools.rankings.getAwardPoints`       | The same params object.          |
| `rankingGovernor.getParticipantPoints` | `tools.rankings.getParticipantPoints` | The same params object.          |
| `rankingGovernor.getQualityWinPoints`  | `tools.rankings.getQualityWinPoints`  | The same params object.          |

#### sanctioningGovernor

| Old call                                       | Replacement                                  | Notes                   |
| ---------------------------------------------- | -------------------------------------------- | ----------------------- |
| `sanctioningGovernor.querySanctioningRecord`   | `tools.sanctioning.querySanctioningRecord`   | The same params object. |
| `sanctioningGovernor.validateStatusTransition` | `tools.sanctioning.validateStatusTransition` | The same params object. |

#### scheduleGovernor

| Old call                                    | Replacement | Notes                                                                          |
| ------------------------------------------- | ----------- | ------------------------------------------------------------------------------ |
| `scheduleGovernor.validateScheduleScenario` | None        | See [its reference](/docs/implementation/validation/validateScheduleScenario). |

#### scoreGovernor

| Old call                                 | Replacement                              | Notes                                                                                                 |
| ---------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `scoreGovernor.addPoint`                 | `tools.scoring.addPoint`                 | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.analyzeSequence`          | `tools.scoring.analyzeSequence`          | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.calculateMatchStatistics` | `tools.scoring.calculateMatchStatistics` | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.calculatePointsTo`        | `tools.scoring.calculatePointsTo`        | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.createMatchUp`            | None                                     | See [its reference](/docs/implementation/scoring/createMatchUp).                                      |
| `scoreGovernor.deduceMatchUpFormat`      | `tools.scoring.deduceMatchUpFormat`      | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.enrichPointHistory`       | `tools.scoring.enrichPointHistory`       | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.exportMatchUpJSON`        | `tools.scoring.exportMatchUpJSON`        | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.getEpisodes`              | `tools.scoring.getEpisodes`              | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.getQuickStats`            | `tools.scoring.getQuickStats`            | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.getScore`                 | `tools.scoring.getScore`                 | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.getScoreboard`            | `tools.scoring.getScoreboard`            | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.getSetScoreString`        | `tools.scoring.getSetScoreString`        | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.getWinner`                | `tools.scoring.getWinner`                | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.groupByMatch`             | `tools.scoring.groupByMatch`             | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.inferServeSide`           | `tools.scoring.inferServeSide`           | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.isComplete`               | `tools.scoring.isComplete`               | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.isValidMatchUpFormat`     | `tools.formats.isValidMatchUpFormat`     | The same params object. The engine method stays: `matchUpGovernor` and `queryGovernor` keep the name. |
| `scoreGovernor.mcpValidator`             | `tools.scoring.mcpValidator`             | The same params object.                                                                               |
| `scoreGovernor.parseCSV`                 | `tools.scoring.parseCSV`                 | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.parseMatchUpFormat`       | `tools.formats.parse`                    | Positional arguments: call it directly, not through an engine. Renamed.                               |
| `scoreGovernor.parseMCPPoint`            | `tools.scoring.parseMCPPoint`            | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.pbpValidator`             | `tools.scoring.pbpValidator`             | The same params object.                                                                               |
| `scoreGovernor.pointParser`              | `tools.scoring.pointParser`              | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.resolvePointValue`        | `tools.scoring.resolvePointValue`        | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.shotParser`               | `tools.scoring.shotParser`               | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.shotSplitter`             | `tools.scoring.shotSplitter`             | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.stringifyMatchUpFormat`   | `tools.formats.stringify`                | Positional arguments: call it directly, not through an engine. Renamed.                               |
| `scoreGovernor.toStatObjects`            | `tools.scoring.toStatObjects`            | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.validateMatchUp`          | None                                     | See [its reference](/docs/implementation/scoring/validateMatchUp).                                    |
| `scoreGovernor.validateMatchUpScore`     | `tools.scoring.validateMatchUpScore`     | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.validateMCPMatch`         | `tools.scoring.validateMCPMatch`         | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.validateSetScore`         | `tools.scoring.validateSetScore`         | Positional arguments: call it directly, not through an engine.                                        |
| `scoreGovernor.validateTieFormat`        | `tools.formats.validateTieFormat`        | The same params object.                                                                               |

#### tieFormatGovernor

| Old call                                         | Replacement | Notes                                                                              |
| ------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------- |
| `tieFormatGovernor.removeOrphanedTieFormats`     | None        | See [its reference](/docs/implementation/validation/removeOrphanedTieFormats).     |
| `tieFormatGovernor.validateCollectionDefinition` | None        | See [its reference](/docs/implementation/validation/validateCollectionDefinition). |

#### tournamentGovernor

| Old call                                             | Replacement                                           | Notes                                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `tournamentGovernor.addNotes`                        | None                                                  | See [its reference](/docs/implementation/records/addNotes).                                                |
| `tournamentGovernor.getAllowedDrawTypes`             | None                                                  | See [its reference](/docs/implementation/records/getAllowedDrawTypes).                                     |
| `tournamentGovernor.getTournamentTimeItem`           | None                                                  | See [its reference](/docs/implementation/scheduling/getTournamentTimeItem).                                |
| `tournamentGovernor.query.cleanExpiredMutationLocks` | `tournamentGovernor.mutate.cleanExpiredMutationLocks` | The same params object. The engine method stays: `queryGovernor` keeps the name. Only this placement goes. |
| `tournamentGovernor.removeNotes`                     | None                                                  | See [its reference](/docs/implementation/records/removeNotes).                                             |

#### venueGovernor

| Old call                        | Replacement | Notes                                                                 |
| ------------------------------- | ----------- | --------------------------------------------------------------------- |
| `venueGovernor.publicFindVenue` | None        | See [its reference](/docs/implementation/scheduling/publicFindVenue). |

<!-- MIGRATION_BY_GOVERNOR:END -->

## Other 8.0.0 changes

Each change below is planned for 8.0.0 and announced in 7.x; one marked _proposed_ still awaits its final decision. The 8.0.0 release notes repeat this list with links.

From the first 7.x release after 7.48.0, the published type declarations carry a `@deprecated` tag, which an editor
shows as a strike-through with its message, on:

- each method leaving the engines and governors, and each positional governor function moving to `tools` or
  `availability`: on the governor member (`drawsGovernor.addGoesTo`, `drawsGovernor.query.addGoesTo`,
  `governors.drawsGovernor.addGoesTo` and the `tods-competition-factory/governors` subpath) and on the
  `tournamentEngine` / `competitionEngine` method where the engine types it;
- `utilities`;
- `getNotices` and the `notices` field of `CallListenerArgs`, `SCHEDULE_METHOD`, the `restrictAdHocRoundParticipants`
  option, `getTournamentInfo`'s `eventInfo` and `EntryFee`.
- from 8.0.0, `tournamentEngineUntyped`, `competitionEngineUntyped` and their `FactoryEngine` type. 8.0.0 keeps them
  (the same engines, every method untyped); the message points at the typed `tournamentEngine` / `competitionEngine`.

The message names the replacement where there is one, and otherwise links this guide. The asynchronous engines and the
untyped `syncEngine` / `askEngine` show no tag, and the other symbols below are not tagged in the declarations; 7.48.0
and earlier carry no tags at all.

### Engine and governor routes

- **127 governor routes leave the production governors, and 122 of them leave the engines too.** The other five keep their engine method because another governor still holds the name (`isValidMatchUpFormat`, `cleanExpiredMutationLocks` and the three mocks-governor simulation aliases). See the [engine API transition](/docs/implementation/engine-api-transition-8) for the list, the replacement where one exists, and the standalone-export decision for each.
- **`matchUpFormatCode` and `matchUpFormatGovernor` are retired.** `tools.formats` is the single format surface, including the format validators.
- **`addFinishingRounds`** leaves its governor, and **`applyDerivedRankings`** is available only as `tools.rankings.deriveRankingList`.
- **`setMatchUpState`** is removed from the engine surface. Use `setMatchUpStatus`.
- **`tournamentGovernor.query.cleanExpiredMutationLocks`** is removed; the function stays on `tournamentGovernor.mutate`, because it writes.
- **The mocks-governor simulation aliases** (`generateOutcome`, `generateOutcomeFromScoreString`, `completeDrawMatchUps`) are removed from `mocksGovernor`. Use `simulationGovernor`. `mocksEngine` mounts `simulationGovernor`, so `mocksEngine.generateOutcome` and the other two keep working unchanged.

### Behaviour changes

- _Proposed:_ **the default `stampScope` becomes `'modified'`.** The factory `{ version, timeStamp }` stamp goes on each drawDefinition a call modified, and on the tournament only when something outside its draws changed. A consumer that reads `tournament.factory` as "last write anywhere" must read the draw stamps. Opt in during 7.x with `engine.stampScope('modified')`. A custom state provider uses the optional `cycleModifiedTopics` hook.
- **`addFlight` refuses a participant already in another flight** with `EXISTING_FLIGHT` (and `context.participantIds`) unless `force: true`. In 7.x it returns a `PARTICIPANT_IN_OTHER_FLIGHT` warning and still adds.
- **`addPoint` no longer mutates the matchUp it is given.** Use its return value.
- **Generators no longer attach.** `generateLineUps` (`attach`), `generateFlightProfile` (`attachFlightProfile`), `drawMatic` (`updateParticipantRatings`), `generateDrawTypeAndModifyDrawDefinition` (`modifyOriginal`), `generateEventsFromTieFormat` (attaching unless `addEvents: false`) and `generateTournamentRecord` through an engine return what they generate. Call the matching attach mutation to store it.
- **Writes are native only.** The `LEGACY` and `BRIDGE` schema write modes are removed. Records written by them are still read.
- **The `appliedPolicies` extension is no longer written** (the first-class `appliedPolicies` attribute replaces it). It is still read from older records.
- **The positional `matchUpStatusCodes` array is no longer written or accepted.** Reasons are submitted and stored keyed; see [status reason codes](#status-reason-codes-keyed-input-no-positional-array) and [records written before 8.0.0](#records-written-before-800).
- **Penalties refuse the old label spellings and the two misspelled type values** (the deprecated aliases of `EQUIPMENT_VIOLATION` and `FAILURE_TO_SIGN_IN`). Store `PenaltyTypeEnum` codes.
- **Date helpers need the instant.** Exported date helpers lose their implicit "now" in 8.0.0. In 7.x, pass a Date or ISO date string as the second argument to `tools.plainDate.isDateInPast(dateString, asOf)` and `tools.generateTimeCode(index, asOf)`. When omitted, both still read the call clock.
- **`asOf` is required** on `tools.publishing` (`isEmbargoed`, `isVisiblyPublished`, `getRoundVisibilityState`).

### Records written before 8.0.0

8.0.0 reads any tournament record a 7.x or earlier release wrote: every query works on it unchanged.

Writes are stricter. 8.0.0 records a matchUp's exit and status reasons by side, under the side keys it introduces. A
matchUp whose stored shape predates those keys is not rewritten when a record loads, and 8.0.0 does not silently
convert it on write either:

- **A write to such a matchUp is refused** unless the caller passes `force: true`. The refusal changes nothing.
- **A forced write uses the new representation alone.** It stores the side-keyed form and does not keep the older shape
  beside it.

Status reasons travel side-keyed:

- **The positional `matchUpStatusCodes` array is no longer written, and no outcome or mutation decision reads it.** On
  an older record it stays where it is until a write touches the matchUp, which removes it. It never makes a matchUp
  count as one whose stored shape predates the side keys, so it alone causes no refusal.
- **A write that carries no reason keeps the stored ones** that still describe its result. Pass reasons by side to
  change them, or the explicit clear to remove them; see
  [status reason codes](#status-reason-codes-keyed-input-no-positional-array).

### Status reason codes: keyed input, no positional array

A scoring policy's reason codes (`W1`, `DM`, `RJ`, ...) are stored where they are attributed: `sideStatusCodes`,
keyed by side, for a reason a side gave (`DEFAULTED`, `WALKOVER`, `RETIRED`, and both sides of a double exit), and
`matchUpStatusCode` for a reason that belongs to the match (`ABANDONED`, `CANCELLED`, `INCOMPLETE`). Both fields exist
in 7.x. 8.0.0 removes the positional `matchUpStatusCodes` array that carried a copy of them (#6664).

**Writing a reason.** Submit it keyed, as it is stored:

```js
// 7.x: positional, side 2 at index 1
engine.setMatchUpStatus({
  drawId,
  matchUpId,
  outcome: { matchUpStatus: DEFAULTED, winningSide: 1, matchUpStatusCodes: ['', 'DM'] },
});

// 8.0.0: keyed by side
engine.setMatchUpStatus({
  drawId,
  matchUpId,
  outcome: { matchUpStatus: DEFAULTED, winningSide: 1, sideStatusCodes: { 2: 'DM' } },
});

// a reason for the match
engine.setMatchUpStatus({ drawId, matchUpId, outcome: { matchUpStatus: ABANDONED, matchUpStatusCode: 'OA' } });
```

- **An outcome that carries `matchUpStatusCodes` is refused** with `INVALID_VALUES`, before anything is written, so a
  client that has not moved to the keyed input finds out at once rather than losing its reasons.
- **Submitted reasons replace the ones the matchUp held.** A submitted reason that does not describe the result is not
  stored: a side reason for the winner of a single exit, or a side reason on a status that belongs to the match.
- **A write that submits no reason keeps the reasons the matchUp holds**, where they still describe the result it
  writes: the status still takes a reason, and the side a reason names still exited. A result corrected to a played
  win, or removed, keeps none. In 7.x an absent or empty array cleared them.
- **An engine write keeps no reason its result no longer has.** When the engine moves a matchUp off the result its
  reasons were given for, the reasons go with the result: a produced exit withdrawn because its source was corrected
  or cleared, a matchUp collapsed to a BYE, a result removed with the position it was carried to, a draw reset. A
  matchUp left `TO_BE_PLAYED`, a `BYE` or any other status that takes no reason keeps none, except that a BYE standing
  over an exit its `sideExitProvenance` still records keeps that exit's reason. When a withdrawn exit's award is
  re-derived to the other side, a reason that now names the winner is removed. When a decided matchUp's sides are
  re-sorted under its winner (a correction upstream changes who reaches it), the reason moves with the side that
  exited, as the winner and the score do. In 7.x such a matchUp could keep the reasons of a result it no longer held,
  or a reason keyed to the side that now wins (#6669).
- **Clearing a result removes its reasons.** A result cleared or removed leaves the matchUp `TO_BE_PLAYED`, a status
  that takes no reason, so the matchUp keeps none, with or without `clearStatusCodes`. The same holds for a result
  corrected to a played win or to a live score. A clear does not keep the reason for a later re-entry: enter the
  reason again with the result.
- **`clearStatusCodes` removes reasons the result would otherwise keep.** `outcome.clearStatusCodes: true` matters
  where the status written still takes a reason: a `WALKOVER` re-entered for the same winner keeps the reason it held,
  and with `clearStatusCodes: true` keeps none. With submitted reasons beside it, the clear goes first and the
  submitted reasons are stored. It must be a boolean; anything else is refused with `INVALID_VALUES`. The score-entry
  clear, `{ score: { sets: [] }, clearStatusCodes: true }`, carries it; the cleared matchUp holds no reasons either
  way.
- **A server that checks client outcomes against an allow-list of keys** replaces `matchUpStatusCodes` in that list
  with `sideStatusCodes` (an object keyed `1` or `2`, each a non-empty string), `matchUpStatusCode` (a non-empty
  string) and `clearStatusCodes` (a boolean). It rejects an outcome that still carries `matchUpStatusCodes`, as the
  engine does.
- **Mocks and simulation.** Authored outcomes (`drawProfiles[].outcomes`, `applyOutcomes`) take `sideStatusCodes` and
  `matchUpStatusCode` in place of `matchUpStatusCodes`.
- **Score entry state.** `toEngineOutcome` emits the keyed input and the explicit clear. **`positionalCodes` is removed
  from the `score-entry-state` export**, and `keyedStatusCodes` replaces it: it returns `{ sideStatusCodes }` for a
  side's exit, `{ matchUpStatusCode }` for an ending that belongs to the match, and `undefined` when there is no
  reason. A package that imports or re-exports `positionalCodes` fails to compile against 8.0.0.

**Reading a reason.** Read `sideStatusCodes[sideNumber]` and `matchUpStatusCode`. Nothing in 8.x reads the array to
decide anything. Which side exited, and where an exit came from, is `sideExitProvenance`.

**Records written before 8.0.0.** A record that holds the array is read as it is, and `matchUpStatusCodes` stays on
the `MatchUp` type and in `tournament.schema.json`, marked deprecated, so such a record still types and validates. The
array never makes a record count as unmigrated, and a write is not refused for it: any 8.x write removes the array from
the matchUps it touches. A reason held only in the array of such a record is not moved into the keyed fields by the
engine; the separate record migration does that.

### Records are plain data

A record handed to the engine must be **plain data** (objects, arrays and primitive values, as `JSON.parse`
produces), whether the engine copies it (`setState(record)`, the default) or borrows it (`setState(record, false)`) (#6665).

- **Hydrated documents are not supported.** A document from a mapping library (a Mongoose document, or anything with
  getters, setters, casts or change tracking) passed to `setState`, or installed by a state provider, is not handled
  specially in 8.0.0: the factory no longer reads a document's `_doc` field layout, preserves its `push` or `$push`
  operations, or reads back what its setters canonicalised. Convert it first, for example with `doc.toObject()`, and
  persist the plain record the call leaves.
- **Borrowed plain records stay supported**, as does the default copy. A server that loads records, mutates them in
  place without copying and saves them keeps working unchanged.
- **Submitted values are plain data too.** A participant or other value given to a mutation is stored as given; a
  hydrated value is not unwrapped.

### Removed options, constants and fields

- `scheduleCompletedMatchUps` on `scheduleProfileRounds`, `scheduleProfileGrid`, `proAutoSchedule` and mocks `generateTournamentRecord`; and the ignored `pro` and `useGarman` params on `scheduleProfileRounds`. The manual schedule-write methods keep their own correction flag.
- `availabilityConstants` (use `dayStateConstants`), `SCHEDULE_METHOD`, the `restrictAdHocRoundParticipants` option, `getTournamentInfo`'s `eventInfo`, the `EntryFee` alias, and the long-deprecated `getNotices` / `notices`.
- `POLICY_PRINT_DEFAULT` and its `fixtures.policies` export.
- `ScoringEngine.markHardBoundary`, `SetScore.hardBoundaries` and `Point.hardBoundary`.
- The competitionFormat fixtures' `label` fields.

### Types and schema

- **`Structure` and `DrawLink` become hard unions.** Narrow on `structureType` (or use `matchUpsOf`, `positionAssignmentsOf`, `structuresOf`) before reading `matchUps`, `structures` or `positionAssignments`. `tournament.schema.json` gains the matching `oneOf`/`if`.
- **Declaration corrections:** `TallyResultType.report`, `automatedPositioning`'s `conflicts`, `ApplyLineUps.lineUps` and `matchUpDailyLimits` now describe what they hold.
- **Stricter types** across the package (the `implicit-any` campaign). Some loosely typed call sites may need annotations.
- **`PointsAuthority` is open.** It was the closed union of the `pointsAuthorityConstants` names; it is now that
  union or any other string, so a policy can name a provider's own issuing authority. The closed union is exported as
  `KnownPointsAuthority`. Input sites only widen. Code that reads `pointsAuthority` from a policy or an award and
  relies on it being one of the known names (a `Record<PointsAuthority, …>` lookup, an exhaustive `switch`) narrows it
  first, for example by checking it against `POINTS_AUTHORITIES`, or types the value as `KnownPointsAuthority` itself
  (#6689).
- **Four vocabularies that name other bodies' values are open.** `CertificationFamily`, `CertificationLevel`,
  `AuthorityRoleUnion` and `ComplianceItemType` admit any string beside the values their enums name (the same
  `(string & {})` arm as `DisciplineUnion`), so a certifying or sanctioning body's own terms type-check. Inputs only
  widen; code that treats a value read back as one of the enum's members (a `Record<…>` lookup, an exhaustive `switch`)
  narrows it first (#6695).
- **The typed engines' setup methods are typed.** On `tournamentEngine` and `competitionEngine`, `getState`,
  `getTournament`, `setState`, `setTournamentRecord`, `reset`, `newTournamentRecord`, `executionQueue`, `execute` and
  the other setup and mode methods were `(...args: any[]) => any`; they now carry the signatures the asynchronous
  engine already had (`EngineSetup`, exported with `SyncEngineSetup`). `getState().tournamentRecords[id]` and
  `getTournament().tournamentRecord` may be `undefined`, the chaining methods return the engine, and
  `executionQueue(...).results` is `unknown[]`. Narrow before reading. Only the availability helpers that leave the
  engine and the outcome pipeline selectors keep the open signature (#6692).
- **Queue directives and notice payloads are typed.** A directive passed to `executionQueue` or `dryRun` on
  `tournamentEngine`, `competitionEngine` and the asynchronous engine, or to the standalone `dryRun`, is keyed by its
  method: `params` is checked against that method's parameter object, where it was `{ [key: string]: any }`. When the
  check applies:
  - an array written as a literal, or annotated `Directives`, is checked: each method name, and each method's `params`;
  - a method you registered with `importMethods` is accepted, with open `params` (`Directives<'myMethod'>` admits it
    in an annotated array);
  - an array whose `method` is widened to `string` (built from a `string[]`, say) is not checked: it falls back to open
    `params`. To keep the check, keep the method name literal (`method: 'addEvent' as const`) or annotate the array
    `Directives`. An `as const` on the whole array makes it readonly, which the queue methods do not accept.

  The `engine.on` / `once` / `waitFor` payloads carry their domain
  types (`Participant[]`, `Entry[]`, `PositionAssignment[]`, `SeedAssignment[]`, `Organisation`, `EventData`) where
  they were `any`: `publishEvent`'s `eventData` may be `undefined`, `modifySeedAssignments`' `seedAssignments` may be
  absent, and `modifyMatchUp`'s `context` is `unknown`. `QueueMethod` names the two methods `getExtensionUpdate`
  returns, `OfficiatingDirective` and `SanctioningDirective` take `params?: Record<string, unknown>`, and the
  builders' `DrawOpts.drawType` is a `DrawTypeUnion`. Correct the params a directive passes, and narrow payload fields
  before reading them (#6705).

### Packaging

- **The package is `competition-factory`.** `tods-competition-factory` 7.x stays installable and is not maintained after 8.0.0.
- **Named catalogue formats and organisation policies move to `@courthive/competition-catalogue`.** The factory keeps its own defaults and the provider-neutral presets. See [The resource catalogue](#the-resource-catalogue).

### The resource catalogue

The named tie formats, the organisation policies, the ratings presets and the league competition format leave the
factory for a separate package, `@courthive/competition-catalogue`, which versions independently (#6663). It holds plain data
and imports nothing from the engine:

```js
import {
  POLICY_SCORING_USTA,
  POLICY_SEEDING_ITF,
  ratingsPresets,
  resolveTieFormat,
  tieFormatConstants,
  tieFormats,
} from '@courthive/competition-catalogue';
```

| Removed from the factory                                                                                                                                                                                                                                                                                                                                                                         | In the catalogue package                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `fixtures.tieFormats` (19 named tie formats)                                                                                                                                                                                                                                                                                                                                                     | `tieFormats`; `resolveTieFormat(name)` returns a copy without `collectionId`s |
| `tieFormatConstants` (the 19 names)                                                                                                                                                                                                                                                                                                                                                              | `tieFormatConstants`                                                          |
| the organisation members of `fixtures.policies`: ranking points (ATP, WTA, ITF), ratings presets, standings presets (FIBA, FIVB, JTT, MLS, Premier League, TOC, USTA League), `POLICY_SANCTIONING_ITF`, `POLICY_SANCTIONING_USTA`, `POLICY_SCORING_USTA`, `POLICY_SEEDING_ITF`, `POLICY_PROGRESSION_USTA`, the officiating evaluation policies and `POLICY_OFFICIATING_CONFLICT_OF_INTEREST_ITF` | each under its own name, and all of them in `policies`                        |
| the ratings presets by name                                                                                                                                                                                                                                                                                                                                                                      | `ratingsPresets`, each a bare ratings policy                                  |
| `INTENNSE_STANDARD` (`fixtures.competitionFormats`, `competitionFormatConstants`)                                                                                                                                                                                                                                                                                                                | `competitionFormats`, `competitionFormatConstants`                            |

The factory keeps every policy it falls back to and the provider-neutral presets in `fixtures.policies`
(`POLICY_SEEDING_DEFAULT`, `POLICY_SCORING_DEFAULT`, `POLICY_RATINGS_DEFAULT`, `POLICY_RATINGS_COMPETITION_FORM`,
`POLICY_SANCTIONING_GENERIC`, `POLICY_RANKING_POINTS_BASIC`, `POLICY_OFFICIATING_CONFLICT_OF_INTEREST` and the others),
`PICKLEBALL_STANDARD` and `TENNIS_STANDARD`.

### Named catalogue inputs

The factory resolves no names: a caller passes the `tieFormat` or policy object. Each input that named a catalogue
entry in 7.x (deprecated there, with a one-time warning) is removed:

| Input                                                                                                 | 8.0.0 replacement                                           |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `addEvent` `event.tieFormatName`                                                                      | `event.tieFormat`, a `tieFormat` object                     |
| `generateDrawDefinition` `tieFormatName`, when the event holds no tieFormat of that name              | `tieFormat`                                                 |
| `generateEventsFromTieFormat` `tieFormatName`                                                         | `tieFormat`, now required                                   |
| a mocksEngine profile's `tieFormatName` (draw, event, league and season profiles)                     | the profile's `tieFormat`                                   |
| an `EventBuilder` `team(name)` or `tieFormat(name)` string                                            | `team(tieFormat)` or `tieFormat(tieFormat)` with the object |
| a `ratingsPolicy` preset name, in a `competitionFormat` or a competition policy's `dynamicFormRating` | the ratings policy object                                   |

A name passed where the object belongs is refused, not replaced by a default:

- `addEvent` refuses a TEAM event that has a `tieFormatName` and neither a `tieFormat` nor a `tieFormatId`, with
  `INVALID_VALUES`. A `tieFormatName` beside a `tieFormat` is stored as given, a label.
- `generateDrawDefinition` still selects, by `tieFormatName`, one of the tie formats the event holds (its
  `tieFormats[]`, then its `tieFormat`). A name the event does not hold is refused with `INVALID_VALUES`.
- `generateEventsFromTieFormat` without a `tieFormat` is refused with `INVALID_VALUES`.
- the mocksEngine refuses a profile carrying `tieFormatName` as an unknown key (`INVALID_VALUES`).
- a rating that reads a preset name is refused with `INVALID_VALUES`, naming it in `info` and `context.ratingsPolicy`.
  Attaching a `competitionFormat` or competition policy with a name stores it as given; nothing looks it up.

`hydrateCollections` applies to the default TEAM format, which the factory builds. A caller that passes a `tieFormat`
sets `category` and `gender` on its collections.

**Stored records read unchanged.** Every stored TEAM tie carries its full `tieFormat`, and a `tieFormatName` on a stored
record is a label: no reader consults a catalogue, so a record whose format the catalogue lacks reads, scores and
rates as before. A ratings preset that 7.x stored by value (its full policy as `ratingsPolicy`, the name beside it as
`ratingsPolicyName`) rates without the catalogue. A record stored before that with only a preset name is read
unchanged; to rate it, attach the policy object (`modifyEvent` with the `competitionFormat`, or `attachPolicies` with
`allowReplacement`), or pass `ratingsPolicy` to `generateDynamicRatings`.

**For an application that offers named formats or policies** (a draw form that lists tie formats, a policy picker,
a demo or mock mode): read the entries from the catalogue package, or from the host that serves your providers'
approved formats and policies, and pass the chosen object. An application that derives a list from
`fixtures.policies` (every `POLICY_SANCTIONING_*`, for example) finds only the factory's own entries there; add the
catalogue's `policies` to the list where it should still offer them.

### The outcome pipeline selector is removed

v2 is the outcome pipeline's default in 7.x, and `v1` stays selectable as a fallback through 7.x (see
[the outcome pipeline § 7.1](/docs/concepts/outcome-pipeline#71-two-implementations-s2)). The selector is
deprecated in 7.x and removed in 8.0.0: `engine.outcomePipeline` and `engine.getOutcomePipeline`, `globalState`'s
`setOutcomePipeline` and `getOutcomePipeline`, and the `outcomePipeline` option of `tools.getMutationFootprint`. Once
the `v1` and `differential` modes are removed, still within 7.x, the selector accepts only `'v2'`. Remove the calls;
nothing replaces them, because there is one pipeline.
