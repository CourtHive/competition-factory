---
title: Migration to 8.0.0 (preparation)
---

# Migration to 8.0.0

This guide describes preparation for the next major release. **The engine routes described below remain available in 7.x.**

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

The 8.0.0 release notes list every function this moves, by governor.

### `utilities` is removed

`utilities` is a deprecated alias of `tools` (`export * as utilities` beside `export * as tools`). It is removed in
8.0.0, so replace `utilities.` with `tools.`. Nothing else changes.

### Progression edges: addGoesTo

Use [the supported storage, ingest, draw-addition and read-projection routes](/docs/implementation/records/addGoesTo#supported-migration-routes). The old helper mutates stored matchUps despite its query-governor placement and is not a safe read-only API.

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

The message names the replacement where there is one, and otherwise links this guide. The asynchronous engines and the
untyped `syncEngine` / `askEngine` show no tag, and the other symbols below are not tagged in the declarations; 7.48.0
and earlier carry no tags at all.

### Engine and governor routes

- **117 methods leave the production governors and engines.** See the [engine API transition](/docs/implementation/engine-api-transition-8) for the list, the replacement where one exists, and the standalone-export decision for each.
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
- **The positional `matchUpStatusCodes` array is no longer written**, and the `appliedPolicies` extension is no longer written (the first-class `appliedPolicies` attribute replaces it). Both are still read from older records.
- **Penalties refuse the old label spellings and the two misspelled type values** (the deprecated aliases of `EQUIPMENT_VIOLATION` and `FAILURE_TO_SIGN_IN`). Store `PenaltyTypeEnum` codes.
- **Date helpers need the instant.** Exported date helpers lose their implicit "now" in 8.0.0. In 7.x, pass a Date or ISO date string as the second argument to `tools.plainDate.isDateInPast(dateString, asOf)` and `tools.generateTimeCode(index, asOf)`. When omitted, both still read the call clock.
- **`asOf` is required** on `tools.publishing` (`isEmbargoed`, `isVisiblyPublished`, `getRoundVisibilityState`).

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

### Packaging

- **The package is `competition-factory`.** `tods-competition-factory` 7.x stays installable and is not maintained after 8.0.0.
- **Named catalogue formats and provider policies move to a separate resource package.** Defaults the engine reads stay in the core. The resource package is named in the 8.0.0 release notes.

### Named catalogue inputs

Named catalogue entries (the named tie formats such as `COLLEGE_D3` or `USTA_GOLD_TEAM_CHALLENGE`, and the ratings
presets such as `POLICY_RATINGS_ELO_538_NHL`) move to the resource package in 8.0.0, so the core no longer resolves a
name to one. These inputs are deprecated in 7.x:

| Input                                                                                                 | 8.0.0 replacement                                           |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `addEvent` `event.tieFormatName`                                                                      | `event.tieFormat`, a `tieFormat` object                     |
| `generateDrawDefinition` `tieFormatName`, when the event holds no tieFormat of that name              | `tieFormat`                                                 |
| `generateEventsFromTieFormat` `tieFormatName`                                                         | `tieFormat`                                                 |
| a mocksEngine profile's `tieFormatName` (draw, event, league and season profiles)                     | the profile's `tieFormat`                                   |
| an `EventBuilder` `team(name)` or `tieFormat(name)` string                                            | `team(tieFormat)` or `tieFormat(tieFormat)` with the object |
| a `ratingsPolicy` preset name, in a `competitionFormat` or a competition policy's `dynamicFormRating` | the ratings policy object                                   |

In 7.x each name still resolves, and the behaviour is unchanged. The first use of each input in a process emits one
warning; later uses do not. Under Node it is a `DeprecationWarning` with the code `FACTORY_CATALOGUE_NAME`, so
`--no-deprecation`, `NODE_NO_WARNINGS` and `process.on('warning')` apply to it; elsewhere it is a `console.warn`.
A `tieFormatName` that matches a tieFormat the event already holds is a label, not a catalogue lookup, and does not
warn.

Stored records read unchanged. Every stored TEAM tie carries its full `tieFormat`, and a `tieFormatName` on a stored
record is a label. From 7.x, a `competitionFormat` attached with a preset name stores the preset's full policy as
`ratingsPolicy` (the name is kept as `ratingsPolicyName`, a label), so it rates in 8.0.0 without the preset. A record
stored earlier with only a preset name rates in 7.x; to rate it in 8.0.0, attach the policy object (`modifyEvent` with
the `competitionFormat`), or pass `ratingsPolicy` to `generateDynamicRatings`.

### The outcome pipeline selector is removed

v2 is the outcome pipeline's default in 7.x, and `v1` stays selectable as a fallback through 7.x (see
[the outcome pipeline § 7.1](/docs/concepts/outcome-pipeline#71-two-implementations-s2)). The selector is
deprecated in 7.x and removed in 8.0.0: `engine.outcomePipeline` and `engine.getOutcomePipeline`, `globalState`'s
`setOutcomePipeline` and `getOutcomePipeline`, and the `outcomePipeline` option of `tools.getMutationFootprint`. Once
the `v1` and `differential` modes are removed, still within 7.x, the selector accepts only `'v2'`. Remove the calls;
nothing replaces them, because there is one pipeline.
