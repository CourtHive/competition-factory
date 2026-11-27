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

A tieFormat describes the lines of a TEAM tie. In 7.x a `tieFormat`, `tieFormatName`, `tieFormatId` or `tieFormats`
supplied for an event or draw that is not TEAM (SINGLES, DOUBLES or HYBRID) was accepted:

- `addEvent` and the mocks profiles stored it on the event.
- `generateDrawDefinition` ignored a `tieFormatName`. A `tieFormat` object beside a `matchUpFormat` was kept and the
  `matchUpFormat` was not: the draw definition stored the `tieFormat` and its SINGLES or DOUBLES matchUps were generated
  with tie matchUps. Without a `matchUpFormat` the `tieFormat` was dropped, and the draw took the event's
  `matchUpFormat` or the standard format.

In 8.0.0 each of these returns `INVALID_TIE_FORMAT` (`context.supplied` names the inputs) and changes nothing:
`addEvent`, `generateDrawDefinition`, `addDrawDefinition` (a draw that carries a tieFormat or tie matchUps), the
generators that take a `tieFormat` (`generateDrawTypeAndModifyDrawDefinition`, `generateVoluntaryConsolation`,
`generateQualifyingStructure`, `generateDrawStructuresAndLinks`), `setMatchUpFormat`, the mocks `drawProfiles` and
`eventProfiles`, and the sanctioning event proposals (`createSanctioningRecord`, `addEventProposal`,
`updateEventProposal`, `activateFromSanctioning`). `modifyEvent` returns `INVALID_EVENT_TYPE` for a change away from
TEAM while the event holds a tieFormat. The tieFormat governor's edits return `INVALID_TIE_FORMAT` for a non-TEAM event
or draw that holds one, which only a record written by 7.x can.

**A client that sends a `tieFormat` or `tieFormatName` with every event must stop sending it for events that are not
TEAM.** 8.0.0 refuses the call: send `tieFormat` only when the event and the draw are TEAM, and `matchUpFormat`
otherwise.

**Records written by 7.x.** A record can hold a tieFormat on a non-TEAM event, draw definition or structure. It reads
unchanged, but every draw and tie generator (`generateDrawDefinition`, AD_HOC rounds included, playoff, qualifying and
consolation structures) refuses to generate over it with `INVALID_TIE_FORMAT`, before writing anything;
`context.location` is `event`, `drawDefinition` or `structure`, with the `eventId`, `drawId` and `structureId` that find
it. The tieFormat governor's edits refuse it too. Clean such a record once, before loading it or before generating on
it:

```js
import { tools } from 'competition-factory';

const { tournamentRecord: cleaned, removed } = tools.removeNonTeamTieFormats({ tournamentRecord });
engine.setState(cleaned);
```

The helper removes `tieFormat` and `tieFormatId` from every non-TEAM event, draw definition and structure, and a
non-TEAM event's `tieFormats` list. It leaves TEAM events and their tie formats as they are, does not change matchUps,
and returns a copy: the record passed in is not changed. `removed` lists where each was.

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
- **A tieFormat for an event that is not TEAM is refused** with `INVALID_TIE_FORMAT`, and so is generating over one a
  7.x record stored there; `tools.removeNonTeamTieFormats` cleans such a record. See
  [Pass `tieFormat` for TEAM draws only](#pass-tieformat-for-team-draws-only) (#6672).
- **`addFlight` refuses a participant already in another flight** with `EXISTING_FLIGHT` (and `context.participantIds`) unless `force: true`. In 7.x it returns a `PARTICIPANT_IN_OTHER_FLIGHT` warning and still adds.
- **`addPoint` no longer mutates the matchUp it is given.** Use its return value.
- **Generators no longer attach.** `generateLineUps` (`attach`), `generateFlightProfile` (`attachFlightProfile`), `drawMatic` (`updateParticipantRatings`), `generateDrawTypeAndModifyDrawDefinition` (`modifyOriginal`), `generateEventsFromTieFormat` (attaching unless `addEvents: false`) and `generateTournamentRecord` through an engine return what they generate. Call the matching attach mutation to store it.
- **Writes are native only.** The `LEGACY` and `BRIDGE` schema write modes are removed. Records written by them are still read.
- **The `appliedPolicies` extension is no longer written** (the first-class `appliedPolicies` attribute replaces it). It is still read from older records.
- **The positional `matchUpStatusCodes` array is no longer written or accepted.** Reasons are submitted and stored keyed; see [status reason codes](#status-reason-codes-keyed-input-no-positional-array) and [records written before 8.0.0](#records-written-before-800).
- **Penalties refuse the old label spellings and the two misspelled type values** (the deprecated aliases of `EQUIPMENT_VIOLATION` and `FAILURE_TO_SIGN_IN`). Store `PenaltyTypeEnum` codes.
- **Date helpers need the instant.** Exported date helpers lose their implicit "now" in 8.0.0. In 7.x, pass a Date or ISO date string as the second argument to `tools.plainDate.isDateInPast(dateString, asOf)` and `tools.generateTimeCode(index, asOf)`. When omitted, both still read the call clock.
- **`asOf` is required** on `tools.publishing` (`isEmbargoed`, `isVisiblyPublished`, `getRoundVisibilityState`).
- **A policy can require every MAIN position to be assigned before scoring; the default does not.** (#6717) `requireAllPositionsAssigned` set under `scoring.stage[stage].stageSequence[n]` was never read in 7.x and now is: under a policy that sets it `true` for MAIN stage sequence 1, as the catalogue's `POLICY_SCORING_USTA` does, a MAIN matchUp is not `readyToScore` and `matchUpActions` does not offer `SCORE`, `EXIT` or `CLEAR_SCORE` for it until every position holds a participant, a BYE or a qualifier. `POLICY_SCORING_DEFAULT` now sets that flag `false`, so a draw still being positioned can be scored by default, as in 7.x. The top-level `requireAllPositionsAssigned` is unchanged.
- **A swap or hand placement that would contradict the draw is refused** with `CONTRADICTORY_POSITION_ACTION`. `context.mustClear` names what to clear first, and `context.reservedFor` names the matchUps a seat is still owed to. See [Contradictory position swaps](#contradictory-position-swaps) and [Seats a pending result still owes](#seats-a-pending-result-still-owes).

### Contradictory position swaps

A structure records its results against drawPositions. A participant it has sent on, such as a loser directed to a
consolation or backdraw, a group finisher placed in a playoff, or a qualifier placed in the main draw, is recorded in the
target structure by who they are. Before 8.0.0, `swapDrawPositionAssignments` accepted a swap of such a seat. The
results then moved to the other participant, but the target structure still held the first one. The draw contradicted
itself, and a later valid call on either seat was refused, often with `ERR_EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT`
or `ERR_OCCUPIED_DRAW_POSITION`. For example, in a `FIRST_ROUND_LOSER_CONSOLATION` draw of 16, a director could score
Main R1P4 and R1P1, swap positions 1 and 7, and then try to reverse R1P4.

8.0.0 refuses that swap before it writes anything, with `CONTRADICTORY_POSITION_ACTION`
(`ERR_CONTRADICTORY_POSITION_ACTION`). A swap is refused when:

- a swapped seat's occupant was sent across a link by a decided result in the structure, or was placed in a link's
  target (a playoff, the main draw for a qualifier);
- a seat holding results is swapped with a seat that holds nobody, which would leave the results on an empty
  drawPosition.

The engine does not undo the downstream results itself. The refusal lists them in `context.mustClear`, in the order they
can be cleared, with each result before the result it depends on:

```ts
const result = tournamentEngine.swapDrawPositionAssignments({ drawId, structureId, drawPositions: [1, 7] });
if (result.error?.code === 'ERR_CONTRADICTORY_POSITION_ACTION') {
  for (const item of result.context.mustClear) {
    // { matchUpId, structureId, roundNumber, roundPosition, reason }: a result to clear
    // { structureId, drawPosition, participantId, reason }: a placement to remove
  }
}
```

`reason` is one of:

| `reason`             | Meaning                                                                         | How it is cleared                               |
| -------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------- |
| `LOSER_DIRECTED`     | this result sent the swapped seat's occupant to a consolation or backdraw seat  | clear the result                                |
| `WINNER_DIRECTED`    | this result sent the swapped seat's occupant on as a winner                     | clear the result                                |
| `RESULT_ON_POSITION` | a result of the swapped seat that would be left on an empty drawPosition        | clear the result                                |
| `DEPENDS_ON_RESULT`  | a later result that depends on a result above, so it is cleared first           | clear the result                                |
| `PLACED_ACROSS_LINK` | the occupant was placed in a playoff or main draw, which no result there undoes | `removeDrawPositionAssignment` on that position |

When every listed item is cleared, the swap is accepted.

**Surfacing it in a client.** Show the refusal as a list of the matchUps (by structure, round and position) and
placements to clear, in the order given, and offer to clear them, for example as one `executionQueue` with
`rollbackOnError: true`, followed by the swap. Do not clear them silently: each item is a recorded result. A client that
offers swaps from `positionActions` meets this only on positions the policy allows to move after play.

Swaps that relabel nothing outside their structure are unchanged: a swap before any result, a swap of seats whose
results stay inside the structure (for example two first-round winners in single elimination), and a swap of two
seats in a consolation or playoff structure, whose links the swap disables.

_Shipped in #6678._

### Seats a pending result still owes

A seat in a consolation, playoff or backdraw is filled by the loser (or winner) of a matchUp in the structure that feeds
it. Before 8.0.0, a director could fill such a seat by hand before that matchUp was decided: a BYE
(`assignDrawPositionBye`, `assignDrawPosition` with `bye: true`, `removeDrawPositionAssignment` with
`replaceWithBye: true`), a participant (`assignDrawPosition`), an alternate or a lucky loser. When the result was then
entered, the arriving participant had nowhere to go, and the result was refused with `ERR_OCCUPIED_DRAW_POSITION` or
`ERR_EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT`.

8.0.0 refuses the placement before it writes anything, with `CONTRADICTORY_POSITION_ACTION`, where the arrival would be
refused. An arriving participant takes any open seat of the matchUp it is sent to, so a placement is refused only when
that matchUp would be left with fewer open seats than the participants still owed to it. `context.mustClear` is empty,
because there is nothing to clear: `context.reservedFor` lists the feeding matchUps, each as
`{ matchUpId, structureId, roundNumber, roundPosition, reason }` with `reason` `LOSER_DUE` or `WINNER_DUE`. The seat can
be filled by hand once those results are entered, or once its links are disabled.

These are refused the same way:

- **a participant placed by hand in a structure linked with one where they are still playing**, whose next result
  there would send them a second time (`reason: 'PARTICIPANT_DUE'`, naming their pending matchUps);
- **a swap in a consolation or playoff of seats a pending result still owes** (`reservedFor`): the swap disables both
  seats' links, so the arrival would be sent nowhere;
- **a BYE swapped away from a seat whose opponent has played on through it** (`mustClear`, `reason:
'BYE_ADVANCEMENT_PLAYED'`): their later results would no longer follow from a BYE.

Two placements are unchanged:

- **A BYE on the round-two seat of a `FIRST_MATCH_LOSER_CONSOLATION` consolation.** The round-two loser it is owed to
  takes the lowest seat of that matchUp and replaces a BYE placed there, so the placement contradicts nothing. A
  participant placed there by hand is refused like any other.
- **A placement on a seat whose feeding matchUp is decided**, or one no result will reach (a double walkover, a BYE).

A client should present `reservedFor` as "this seat is reserved for the loser of …", and not offer to clear anything.

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
  over an exit its `sideExitProvenance` still records keeps that exit's reason. When an exit is reduced or relabelled
  because the exit opposite it was withdrawn (a `DOUBLE_WALKOVER` reduced to a `WALKOVER` when one side's position is
  removed or its source cleared, an award re-derived to the other side), it keeps only the reason of the side that
  still exited; a produced exit left pending, with no winner until its opponent arrives, keeps only the reason of the
  exit that still stands (#6679). When a decided matchUp's sides are re-sorted under its winner (a correction upstream
  changes who reaches it), the reason moves with the side that exited, as the winner and the score do. In 7.x such a
  matchUp could keep the reasons of a result it no longer held, or a reason keyed to the side that now wins (#6669).
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

- **A result's `info` and `context` are `unknown`.** `ResultType.info` was `any` and `ResultType.context`
  `{ [key: string]: any }`; they are now `unknown` and `Record<string, unknown>`, and the results that declared
  `info?: string` (`modifyCourtAvailability`, `addVenue`, the matchUp format and playoff-group validators, among
  others) declare `info?: unknown`. What a method puts there is its own: a message, a name, or an object. Check the
  value before using it (`typeof result.info === 'string'`) or assert the shape you know (#6693).
- **`HydratedMatchUp` and `HydratedSide` declare their keys.** Both lose their `[key: string]: any` index signature and declare every key hydration adds: the event, draw and structure context (`eventName`, `drawName`, `structureName`, `stage`, `roundOfPlay`, `isRoundRobin`, …), readiness and check-in (`readyToScore`, `hasContext`, `allParticipantsCheckedIn`, `checkedInParticipantIds`), `competitiveProfile`, `inferredGender`, the `nextMatchUps` targets (`winnerTo`, `loserTo`, `sidesTo`, `potentialParticipants`), and on a side `drawPosition`, `displaySideNumber`, `seedNumber`/`seedValue`, `bye`, `qualifier`, `participantFed`/`participantAdvanced`, `sourceDrawPositionRange`, `teamParticipant` and `substitutions`. Reading an undeclared key no longer type-checks, and declared keys carry their real types (`stage` is a `StageTypeUnion`, `roundOfPlay` is `number | false`, so `matchUpSort` takes a `StageTypeUnion` stage). Keys you pass through `context` still reach every matchUp but are yours, not declared: read them through a type of your own (`matchUp as HydratedMatchUp & MyContext`). An extension copied onto a matchUp or side as `_name` is typed `unknown`. Inputs that read only stored attributes, or resolve the matchUp themselves, also take a stored `MatchUp` (`checkInParticipant`, `checkOutParticipant`, `getMatchUpCheckInState`, `getDualIssues`, `resolveHomeParticipantId`, `participantScheduledMatchUps`); the others need the hydrated matchUp a query returns. (#6694)
- **`HydratedParticipant`, `HydratedCourt` and `HydratedVenue` declare their keys.** All three lose their index signature. A hydrated participant declares what the participant queries add, each present when the query asks for it: its groupings (`groupParticipantIds`, `pairParticipantIds`, `teamParticipantIds`, `groups`, `teams`), scale values (`rankings`, `ratings`, `seedings`), `signedIn`, `entryStatus`/`entryStage`/`entryPosition`/`luckyAdvancement`, the country attributes on `person` (`iocNationalityCode`, `iso2NationalityCode`, `countryName`), and the `events`, `draws`, `matchUps`, `opponents`, `potentialMatchUps`, `statistics`, `scheduleItems` and `scheduleConflicts` lists, each with its element type. A hydrated court declares its required `venueId`. `MappedParticipant.participant` is a `HydratedParticipant` whose groupings are always present, and `MappedParticipant.scheduleItems` is typed. Reading an undeclared key no longer type-checks, and the lists are optional: guard them (`participant.draws ?? []`) before reading. An extension copied onto a participant, court or venue as `_name` is typed `unknown`, which also means a stored `Participant` no longer passes where only a `HydratedParticipant` is accepted: pass the hydrated participant the query returned. Inputs that read only stored attributes take either: `filterParticipants`' `participants`, `removeEventEntries`' `tournamentParticipants`, and the `participants` of the matchUp getters (`allTournamentMatchUps`, `allEventMatchUps`, `allDrawMatchUps`, …). (#6700)
- **Record fields are typed by what the engine writes.** `Extension.value`, `TimeItem.itemValue` and `ScaleItem.scaleValue` are `unknown`: narrow a value (a type guard, or a type of your own for an extension you write) before reading its keys. `DrawDefinition.competitionState`, `draftState` and `lineUps`, `MatchUp.delegatedOutcome`, `TallyResult` (`victories` and `defeats` are participantIds) and `Tournament.factory` are typed and closed, so a key the engine does not write is a type error; `delegatedOutcome` keeps your own keys, such as `source`, as `unknown`. `MatchUpSchedule` is the stored schedule (`official`, `scorekeeper` and `timekeeper` are participantIds, `allocatedCourts` is `AllocatedCourt[]`) and has no index signature: read what hydration adds (`venueName`, `courtName`, `startTime`, `timeAfterRecovery`, `scheduleConflict`, ...) from an in-context matchUp, whose `schedule` is a `HydratedMatchUpSchedule`, and type a schedule you pass to `addMatchUpScheduleItems` or `bulkScheduleMatchUps` (or a scenario placement) as `MatchUpScheduleItems`. (#6699)
- **Engine results that were `any` are typed.** `getEvent` returns `event?` and `drawDefinition?`; `addParticipants`, `addParticipant`, `modifyParticipant`, `addPersons`, `addVenue` and `addEventEntryPairs` return what they added; `getAvailablePlayoffProfiles` returns `AvailablePlayoffProfile`s; `getCategoryAgeDetails`, `getMatchUpFormat`, `setParticipantCheckInState`, `toggleParticipantCheckInState`, `checkInParticipant`, `checkOutParticipant`, `setSchedulingProfile`, `setParticipantScaleItem(s)`, the `addMatchUp*Time` and time-item methods and the other mutations listed in the PR return the result envelope with their own keys; `validateSchedulingProfile` returns `{ valid, error?, info? }`; `isValidSeedPosition` and `getDrawTypeCoercion` return `boolean`; `publicFindVenue` and `publicFindCourt` return what `findVenue` and `findCourt` return; `mocksEngine.generateSeason` and `mocksEngine.completeDrawMatchUps` are typed. A result's payload is optional, since a refusal carries none: check `result.error` or narrow the value before reading it, and read only the keys the type declares. The mocks engine is test and development tooling, so its results are typed as succeeding: `generateTournamentRecord` and `modifyTournamentRecord` declare `tournamentRecord`, `eventIds`, `venueIds` and `drawIds`, `generateEventWithDraw` its `event`, `generateParticipants` its `participants` and `generateOutcomeFromScoreString` its `outcome` (on the engines too). A refusal still returns `{ error }` at runtime, so a caller passing options that may be refused still checks `result.error`. `mocksEngine.completeDrawMatchUps` takes the generated `drawDefinition` and `event` as they come back. (#6697)
- **Typed engine request parameters.** About 40 engine methods no longer take `any` for the keys they read: `setMatchUpStatus` takes `outcome: MatchUpOutcome` and `schedule: MatchUpScheduleRequest` (a `MatchUpSchedule` whose `courtOrder` may be a string holding an integer); each `bulkMatchUpStatusUpdate` outcome takes `score: Score` and `schedule: MatchUpScheduleRequest`; `addMatchUpScheduleItems`, `bulkScheduleMatchUps` and `bulkScheduleTournamentMatchUps` take `matchUpDependencies: MatchUpDependencies`, `matchUpDetails: MatchUpScheduleDetail[]` and `matchUpContextIds: MatchUpContextIds[]`; `addEvent` takes `event: Partial<Event>`; the match-up queries and `getDrawData` take `publishStatus: EventPublishStatus`; `getEventData` takes `participantFilters: ParticipantFilters` and `contextProfile: ContextProfile`; `generateFlightProfile` takes `scaledEntries: ScaledEntry[]` and `scaleSortMethod: ScaleSortMethod`; `getTournamentInfo` takes `policyDefinitions: PolicyDefinitions`; `findExtension` and `addExtension` take an `element` with `extensions`; and the tournament detail setters (`setTournamentName`, `setTournamentNotes`, `setTournamentStatus`, `setTournamentTier`, `setTournamentLocalTimeZone`, `setTournamentCategories`, `setRegistrationProfile`, `setTournamentStartDate`, `setTournamentEndDate`) are typed. A call that passed a wrong shape now fails the type check. An outcome built in a variable before the call widens `matchUpStatus` to `string`: annotate the variable `MatchUpOutcome`. `check:request-shapes` now holds every engine method's first parameter against bare `any`, so these stay typed (#6712).

### Packaging

- **The package is `competition-factory`.** `tods-competition-factory` 7.x stays installable and is not maintained after 8.0.0.
- **Named catalogue formats and organisation policies move to `@courthive/competition-catalogue`, as templates.** Their policy exports are renamed from `POLICY_` to `TEMPLATE_`. The factory keeps its own defaults and the provider-neutral presets. See [The resource catalogue](#the-resource-catalogue).

### The resource catalogue

The named tie formats, the organisation policies, the ratings presets and the league competition format leave the
factory, as starting templates, for a separate package, `@courthive/competition-catalogue`, which versions independently (#6663). It holds plain data
and imports nothing from the engine:

```js
import {
  TEMPLATE_SCORING_USTA,
  TEMPLATE_SEEDING_ITF,
  ratingsPresets,
  resolveTieFormat,
  tieFormatConstants,
  tieFormats,
} from '@courthive/competition-catalogue';
```

| Removed from the factory                                                                                                                                                                                                                                                                                                                                                                         | In the catalogue package                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `fixtures.tieFormats` (19 named tie formats)                                                                                                                                                                                                                                                                                                                                                     | `tieFormats`; `resolveTieFormat(name)` returns a copy without `collectionId`s                     |
| `tieFormatConstants` (the 19 names)                                                                                                                                                                                                                                                                                                                                                              | `tieFormatConstants`                                                                              |
| the organisation members of `fixtures.policies`: ranking points (ATP, WTA, ITF), ratings presets, standings presets (FIBA, FIVB, JTT, MLS, Premier League, TOC, USTA League), `POLICY_SANCTIONING_ITF`, `POLICY_SANCTIONING_USTA`, `POLICY_SCORING_USTA`, `POLICY_SEEDING_ITF`, `POLICY_PROGRESSION_USTA`, the officiating evaluation policies and `POLICY_OFFICIATING_CONFLICT_OF_INTEREST_ITF` | each as a `TEMPLATE_` name (see [Template names](#template-names)), and all of them in `policies` |
| the ratings presets by name (`POLICY_RATINGS_*`)                                                                                                                                                                                                                                                                                                                                                 | `ratingsPresets`, keyed by `TEMPLATE_RATINGS_*`, each a bare ratings policy                       |
| `INTENNSE_STANDARD` (`fixtures.competitionFormats`, `competitionFormatConstants`)                                                                                                                                                                                                                                                                                                                | `competitionFormats`, `competitionFormatConstants`                                                |

The factory keeps every policy it falls back to and the provider-neutral presets in `fixtures.policies`
(`POLICY_SEEDING_DEFAULT`, `POLICY_SCORING_DEFAULT`, `POLICY_RATINGS_DEFAULT`, `POLICY_RATINGS_COMPETITION_FORM`,
`POLICY_SANCTIONING_GENERIC`, `POLICY_RANKING_POINTS_BASIC`, `POLICY_OFFICIATING_CONFLICT_OF_INTEREST` and the others),
`PICKLEBALL_STANDARD` and `TENNIS_STANDARD`.

### Template names

Every catalogue entry is a starting template modelled on a published source: copy one and own it. CourtHive does not
maintain the templates against their sources, and the bodies they are modelled on have not reviewed or endorsed them.
Each entry says so in `provenance` (`catalogueEntries[i].provenance`, and the exported `provenance` map by name):
`{ status: 'template', modelledOn, sourceDocument, maintainer: 'CourtHive', maintained: false, endorsed: false }`.
The statement is beside the entry, not in its definition, so attaching a template does not carry it onto a record.

So that an import line tells an engine default from a template, the catalogue's policies are named `TEMPLATE_*`, and
`POLICY_*` names only the factory's own defaults in `fixtures.policies`. The `policies`, `ratingsPresets` and
`entryVersions` keys use the same names. Tie format and competition format names are unchanged. The policy
definitions are unchanged: `policyName` and `pointsAuthority` hold what they held in 7.x.

| 7.x name                                      | 8.0.0 catalogue name                            |
| --------------------------------------------- | ----------------------------------------------- |
| `POLICY_OFFICIATING_CONFLICT_OF_INTEREST_ITF` | `TEMPLATE_OFFICIATING_CONFLICT_OF_INTEREST_ITF` |
| `POLICY_OFFICIATING_EVALUATION_CHAIR_UMPIRE`  | `TEMPLATE_OFFICIATING_EVALUATION_CHAIR_UMPIRE`  |
| `POLICY_OFFICIATING_EVALUATION_REFEREE`       | `TEMPLATE_OFFICIATING_EVALUATION_REFEREE`       |
| `POLICY_PROGRESSION_USTA`                     | `TEMPLATE_PROGRESSION_USTA`                     |
| `POLICY_RANKING_POINTS_ATP`                   | `TEMPLATE_RANKING_POINTS_ATP`                   |
| `POLICY_RANKING_POINTS_ITF_JUNIOR`            | `TEMPLATE_RANKING_POINTS_ITF_JUNIOR`            |
| `POLICY_RANKING_POINTS_ITF_JUNIOR_2025`       | `TEMPLATE_RANKING_POINTS_ITF_JUNIOR_2025`       |
| `POLICY_RANKING_POINTS_ITF_WTT`               | `TEMPLATE_RANKING_POINTS_ITF_WTT`               |
| `POLICY_RANKING_POINTS_WTA`                   | `TEMPLATE_RANKING_POINTS_WTA`                   |
| `POLICY_RATINGS_ELO_538_NBA`                  | `TEMPLATE_RATINGS_ELO_538_NBA`                  |
| `POLICY_RATINGS_ELO_538_NFL`                  | `TEMPLATE_RATINGS_ELO_538_NFL`                  |
| `POLICY_RATINGS_ELO_538_NHL`                  | `TEMPLATE_RATINGS_ELO_538_NHL`                  |
| `POLICY_RATINGS_ELO_538_TENNIS`               | `TEMPLATE_RATINGS_ELO_538_TENNIS`               |
| `POLICY_RATINGS_ELO_WELO_TENNIS`              | `TEMPLATE_RATINGS_ELO_WELO_TENNIS`              |
| `POLICY_RATINGS_ELO_WORLD_FOOTBALL`           | `TEMPLATE_RATINGS_ELO_WORLD_FOOTBALL`           |
| `POLICY_RATINGS_FIFA_SUM`                     | `TEMPLATE_RATINGS_FIFA_SUM`                     |
| `POLICY_RATINGS_FIFA_WOMEN`                   | `TEMPLATE_RATINGS_FIFA_WOMEN`                   |
| `POLICY_RATINGS_FIVB`                         | `TEMPLATE_RATINGS_FIVB`                         |
| `POLICY_RATINGS_WORLD_RUGBY`                  | `TEMPLATE_RATINGS_WORLD_RUGBY`                  |
| `POLICY_ROUND_ROBIN_TALLY_FIBA`               | `TEMPLATE_ROUND_ROBIN_TALLY_FIBA`               |
| `POLICY_ROUND_ROBIN_TALLY_FIVB`               | `TEMPLATE_ROUND_ROBIN_TALLY_FIVB`               |
| `POLICY_ROUND_ROBIN_TALLY_JTT`                | `TEMPLATE_ROUND_ROBIN_TALLY_JTT`                |
| `POLICY_ROUND_ROBIN_TALLY_MLS`                | `TEMPLATE_ROUND_ROBIN_TALLY_MLS`                |
| `POLICY_ROUND_ROBIN_TALLY_PREMIER_LEAGUE`     | `TEMPLATE_ROUND_ROBIN_TALLY_PREMIER_LEAGUE`     |
| `POLICY_ROUND_ROBIN_TALLY_TOC`                | `TEMPLATE_ROUND_ROBIN_TALLY_TOC`                |
| `POLICY_ROUND_ROBIN_TALLY_USTA_LEAGUE`        | `TEMPLATE_ROUND_ROBIN_TALLY_USTA_LEAGUE`        |
| `POLICY_SANCTIONING_ITF`                      | `TEMPLATE_SANCTIONING_ITF`                      |
| `POLICY_SANCTIONING_USTA`                     | `TEMPLATE_SANCTIONING_USTA`                     |
| `POLICY_SCORING_USTA`                         | `TEMPLATE_SCORING_USTA`                         |
| `POLICY_SEEDING_ITF`                          | `TEMPLATE_SEEDING_ITF`                          |
| —                                             | `TEMPLATE_RANKING_POINTS_CTS`                   |
| —                                             | `TEMPLATE_RANKING_POINTS_LTA`                   |
| —                                             | `TEMPLATE_RANKING_POINTS_TENNIS_AUSTRALIA`      |
| —                                             | `TEMPLATE_RANKING_POINTS_TENNIS_CANADA`         |
| —                                             | `TEMPLATE_RANKING_POINTS_TENNIS_EUROPE`         |
| —                                             | `TEMPLATE_RANKING_POINTS_USTA_JUNIOR_2025`      |
| —                                             | `TEMPLATE_RANKING_POINTS_USTA_JUNIOR_2026`      |

The last seven are new in the catalogue: federation ranking-points templates that 7.x did not publish.

`packages/competition-catalogue/scripts/rename-to-template.mjs` in the factory repository makes the rename across a
checkout's tracked files. It changes only these names, and skips changelogs and the migration pages (this one included),
and lists every name it found as a whole quoted string, since a string can be a label stored on a record that should
keep its 7.x name.

A stored `ratingsPolicyName` is a label, so a record that names a 7.x preset reads unchanged (see [Named catalogue
inputs](#named-catalogue-inputs)).

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
catalogue's `policies` to the list where it should still offer them, under their `TEMPLATE_` names
(`TEMPLATE_SANCTIONING_*`).

### The outcome pipeline selector is removed

v2 is the outcome pipeline's default in 7.x, and `v1` stays selectable as a fallback through 7.x (see
[the outcome pipeline § 7.1](/docs/concepts/outcome-pipeline#71-two-implementations-s2)). The selector is
deprecated in 7.x and removed in 8.0.0: `engine.outcomePipeline` and `engine.getOutcomePipeline`, `globalState`'s
`setOutcomePipeline` and `getOutcomePipeline`, and the `outcomePipeline` option of `tools.getMutationFootprint`. Once
the `v1` and `differential` modes are removed, still within 7.x, the selector accepts only `'v2'`. Remove the calls;
nothing replaces them, because there is one pipeline.
