---
title: Engine API transition at 8.0.0
---

# Engine API transition at 8.0.0

The 125 methods below come from the 2026-10-15 engine-reach catalog: none of their names appeared in its 21-repository product consumer sweep. External integrators reviewed the list on 2026-10-28: 6 are in use and are **retained**. The list was closed on 2026-11-22. On 2026-11-25, two more were retained because they back shipped TMX features, `generateStatCrew` and `getEventInconsistencies`, so 8 are **retained** and the other **117 are scheduled for removal** from the production governors and engines at 8.0.0. The 191 methods not driven through an engine by tests are a different, larger set; standalone engine reach is not grounds for removal. On 2026-11-26, ten more routes joined the manifest: removals and renames the [8.0.0 migration guide](/docs/migration-8.0.0) already recorded (the matchUpFormat governor's validators, the score governor's `isValidMatchUpFormat`, `applyDerivedRankings`, `addFinishingRounds`, `setMatchUpState`, the `query` placement of `cleanExpiredMutationLocks` and the three mocks-governor simulation aliases), so they carry `@deprecated` tags too. Five of them leave a governor while the name, and so the engine method, stays on another (`retainedOn` in the manifest); 135 entries in all, 126 scheduled. On 2026-11-27 `setMatchUpState` was removed ahead of the others: it could refuse after writing, and a call through an engine returns `METHOD_REMOVED`.

**No runtime exports change in 7.x.** Every 7.x route below still works. The scheduled routes are removed at 8.0.0; the per-method standalone package-export decision is separate. Test-only conformance-harness access is independent of product exposure.

See the [8.0.0 migration guide](/docs/migration-8.0.0) in the existing migration series.

The refreshed scan records all 21 source directories, including an unversioned tidyScore checkout; its word matches still require symbol-aware review. The disposition manifest also records **writes when invoked through an engine** and notice behavior. Unknown effects are explicitly unassessed, never inferred from a query-governor name.

## Three separate decisions

1. Production engine/governor route: scheduled for removal at 8.0.0, or retained.
2. Supported standalone package import: review each method independently.
3. Internal implementation and test-only contract: may remain without any public engine route.

No deep import or replacement API is introduced here. An existing governor namespace import also depends on the governor export and is not a standalone migration. Retained supported utilities must receive explicit package exports and remain in the supported API reference. Truly internal helpers belong in this implementation area.

## Candidate disposition

External confirmation is complete for every entry. 81 scheduled methods are stateless functions that already have a home on `tools` or the standalone `availability` export, named as their replacement (15 of them since the confirmed stateless governor queries joined `tools` on 2026-11-25, and 4 of the 2026-11-26 additions); five of the 2026-11-26 additions name the governor route that keeps the function (`setMatchUpStatus`, `tournamentGovernor.mutate` and `simulationGovernor`); `isTournamentPublished` names the `getPublishState` query, and `addGoesTo` has supported replacement routes listed on its page. The others have no replacement on the engine. The machine-readable owner is `documentation/engine-api-transition.json`: source identity, declaring governors, previous anchors, related docs and decisions. Update it when a decision changes; never infer approval from a test-only invocation.

| Method                                                                                                             | Declaring governors                      | Engine route at 8.0.0         | Standalone API  |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | ----------------------------- | --------------- |
| [`EvaluatorRegistry`](/docs/implementation/scheduling/EvaluatorRegistry)                                           | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`addFinishingRounds`](/docs/implementation/draws/addFinishingRounds)                                              | `drawsGovernor`                          | Scheduled                     | Review required |
| [`addGoesTo`](/docs/implementation/records/addGoesTo)                                                              | `drawsGovernor`, `queryGovernor`         | Scheduled                     | Review required |
| [`addNotes`](/docs/implementation/records/addNotes)                                                                | `tournamentGovernor`                     | Scheduled                     | Review required |
| [`allPlayoffPositionsFilled`](/docs/implementation/draws/allPlayoffPositionsFilled)                                | `drawsGovernor`, `queryGovernor`         | Retained                      | Review required |
| [`analyzeSequence`](/docs/implementation/scoring/analyzeSequence)                                                  | `scoreGovernor`                          | Scheduled                     | Review required |
| [`applyAvailabilityToTournamentRecord`](/docs/implementation/scheduling/applyAvailabilityToTournamentRecord)       | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`applyDerivedRankings`](/docs/implementation/records/applyDerivedRankings)                                        | `rankingGovernor`                        | Scheduled                     | Review required |
| [`buildDayRange`](/docs/implementation/scheduling/buildDayRange)                                                   | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`buildEdges`](/docs/implementation/scheduling/buildEdges)                                                         | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`buildSchedulingProfileFromUISelections`](/docs/implementation/scheduling/buildSchedulingProfileFromUISelections) | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`calculateCourtHours`](/docs/implementation/scheduling/calculateCourtHours)                                       | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`calculateMatchUpMargin`](/docs/implementation/records/calculateMatchUpMargin)                                    | `matchUpGovernor`, `queryGovernor`       | Scheduled                     | Review required |
| [`categoryCanContain`](/docs/implementation/records/categoryCanContain)                                            | `eventGovernor`, `queryGovernor`         | Retained                      | Review required |
| [`clampDragToCollisions`](/docs/implementation/scheduling/clampDragToCollisions)                                   | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`clampToDayRange`](/docs/implementation/scheduling/clampToDayRange)                                               | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`cleanExpiredMutationLocks`](/docs/implementation/records/cleanExpiredMutationLocks)                              | `tournamentGovernor`                     | Stays (governor copy removed) | Review required |
| [`compareCapacityCurves`](/docs/implementation/scheduling/compareCapacityCurves)                                   | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`completeDrawMatchUps`](/docs/implementation/records/completeDrawMatchUps)                                        | `mocksGovernor`                          | Stays (governor copy removed) | Review required |
| [`computePlanItemId`](/docs/implementation/scheduling/computePlanItemId)                                           | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`courtDayKey`](/docs/implementation/scheduling/courtDayKey)                                                       | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`createFollowByEvaluator`](/docs/implementation/scheduling/createFollowByEvaluator)                               | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`createMatchUp`](/docs/implementation/scoring/createMatchUp)                                                      | `scoreGovernor`                          | Scheduled                     | Review required |
| [`deduceMatchUpFormat`](/docs/implementation/scoring/deduceMatchUpFormat)                                          | `scoreGovernor`                          | Scheduled                     | Review required |
| [`deriveRailSegments`](/docs/implementation/scheduling/deriveRailSegments)                                         | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`diffMinutes`](/docs/implementation/scheduling/diffMinutes)                                                       | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`enrichPointHistory`](/docs/implementation/scoring/enrichPointHistory)                                            | `scoreGovernor`                          | Scheduled                     | Review required |
| [`exportMatchUpJSON`](/docs/implementation/scoring/exportMatchUpJSON)                                              | `scoreGovernor`                          | Scheduled                     | Review required |
| [`extractDay`](/docs/implementation/scheduling/extractDay)                                                         | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`filterCapacityCurve`](/docs/implementation/scheduling/filterCapacityCurve)                                       | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`findBlocksContainingTime`](/docs/implementation/scheduling/findBlocksContainingTime)                             | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`generateCapacityCurve`](/docs/implementation/scheduling/generateCapacityCurve)                                   | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`generateDrawStructuresAndLinks`](/docs/implementation/draws/generateDrawStructuresAndLinks)                      | `drawsGovernor`, `generationGovernor`    | Scheduled                     | Review required |
| [`generateOutcome`](/docs/implementation/records/generateOutcome)                                                  | `mocksGovernor`                          | Stays (governor copy removed) | Review required |
| [`generateOutcomeFromScoreString`](/docs/implementation/records/generateOutcomeFromScoreString)                    | `mocksGovernor`                          | Stays (governor copy removed) | Review required |
| [`generateStatCrew`](/docs/implementation/records/generateStatCrew)                                                | `generationGovernor`                     | Retained                      | Review required |
| [`getAllowedDrawTypes`](/docs/implementation/records/getAllowedDrawTypes)                                          | `queryGovernor`, `tournamentGovernor`    | Scheduled                     | Review required |
| [`getAwardPoints`](/docs/implementation/records/getAwardPoints)                                                    | `rankingGovernor`                        | Scheduled                     | Review required |
| [`getDrawCompleteness`](/docs/implementation/draws/getDrawCompleteness)                                            | `drawsGovernor`, `queryGovernor`         | Scheduled                     | Review required |
| [`getDrawDefinitionTimeItem`](/docs/implementation/scheduling/getDrawDefinitionTimeItem)                           | `drawsGovernor`, `queryGovernor`         | Scheduled                     | Review required |
| [`getDrawStructures`](/docs/implementation/records/getDrawStructures)                                              | `drawsGovernor`, `queryGovernor`         | Scheduled                     | Review required |
| [`getDrawTypeCoercion`](/docs/implementation/draws/getDrawTypeCoercion)                                            | `drawsGovernor`, `queryGovernor`         | Scheduled                     | Review required |
| [`getEffectiveRegistrationProfile`](/docs/implementation/records/getEffectiveRegistrationProfile)                  | `entriesGovernor`, `queryGovernor`       | Scheduled                     | Review required |
| [`getEligibleEvents`](/docs/implementation/records/getEligibleEvents)                                              | `eventGovernor`, `queryGovernor`         | Scheduled                     | Review required |
| [`getEntryFeeRange`](/docs/implementation/records/getEntryFeeRange)                                                | `entriesGovernor`, `queryGovernor`       | Scheduled                     | Review required |
| [`getEventCompleteness`](/docs/implementation/records/getEventCompleteness)                                        | `eventGovernor`, `queryGovernor`         | Scheduled                     | Review required |
| [`getEventEntryFees`](/docs/implementation/records/getEventEntryFees)                                              | `entriesGovernor`, `queryGovernor`       | Scheduled                     | Review required |
| [`getEventInconsistencies`](/docs/implementation/records/getEventInconsistencies)                                  | `eventGovernor`, `queryGovernor`         | Retained                      | Review required |
| [`getLadderMovement`](/docs/implementation/records/getLadderMovement)                                              | `ladderGovernor`                         | Scheduled                     | Review required |
| [`getMatchUpContextIds`](/docs/implementation/records/getMatchUpContextIds)                                        | `matchUpGovernor`, `queryGovernor`       | Retained                      | Review required |
| [`getMatchUpRatingDelta`](/docs/implementation/records/getMatchUpRatingDelta)                                      | `matchUpGovernor`, `queryGovernor`       | Scheduled                     | Review required |
| [`getMatchUpType`](/docs/implementation/records/getMatchUpType)                                                    | `matchUpGovernor`, `queryGovernor`       | Scheduled                     | Review required |
| [`getMatchUpsToSchedule`](/docs/implementation/scheduling/getMatchUpsToSchedule)                                   | `queryGovernor`, `scheduleGovernor`      | Retained                      | Review required |
| [`getParticipantPoints`](/docs/implementation/records/getParticipantPoints)                                        | `rankingGovernor`                        | Scheduled                     | Review required |
| [`getParticipantTimeItem`](/docs/implementation/scheduling/getParticipantTimeItem)                                 | `participantGovernor`, `queryGovernor`   | Scheduled                     | Review required |
| [`getPositionsPlayedOff`](/docs/implementation/draws/getPositionsPlayedOff)                                        | `drawsGovernor`, `queryGovernor`         | Scheduled                     | Review required |
| [`getPresenceExpectation`](/docs/implementation/records/getPresenceExpectation)                                    | `participantGovernor`, `queryGovernor`   | Scheduled                     | Review required |
| [`getPresenceRules`](/docs/implementation/records/getPresenceRules)                                                | `participantGovernor`, `queryGovernor`   | Scheduled                     | Review required |
| [`getQualityWinPoints`](/docs/implementation/records/getQualityWinPoints)                                          | `rankingGovernor`                        | Scheduled                     | Review required |
| [`getQuickStats`](/docs/implementation/scoring/getQuickStats)                                                      | `scoreGovernor`                          | Scheduled                     | Review required |
| [`getScaleValues`](/docs/implementation/records/getScaleValues)                                                    | `participantGovernor`, `queryGovernor`   | Scheduled                     | Review required |
| [`getSeedingThresholds`](/docs/implementation/draws/getSeedingThresholds)                                          | `drawsGovernor`, `queryGovernor`         | Retained                      | Review required |
| [`getSetScoreString`](/docs/implementation/scoring/getSetScoreString)                                              | `scoreGovernor`                          | Scheduled                     | Review required |
| [`getTournamentTimeItem`](/docs/implementation/scheduling/getTournamentTimeItem)                                   | `queryGovernor`, `tournamentGovernor`    | Scheduled                     | Review required |
| [`groupByMatch`](/docs/implementation/scoring/groupByMatch)                                                        | `scoreGovernor`                          | Scheduled                     | Review required |
| [`groupConflictsBySeverity`](/docs/implementation/scheduling/groupConflictsBySeverity)                             | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`hasLuckyRounds`](/docs/implementation/draws/hasLuckyRounds)                                                      | `drawsGovernor`, `queryGovernor`         | Scheduled                     | Review required |
| [`hhmmToMinutes`](/docs/implementation/scheduling/hhmmToMinutes)                                                   | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`inferServeSide`](/docs/implementation/scoring/inferServeSide)                                                    | `scoreGovernor`                          | Scheduled                     | Review required |
| [`intervalsOverlap`](/docs/implementation/scheduling/intervalsOverlap)                                             | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`isAggregateFormat`](/docs/implementation/records/isAggregateFormat)                                              | `matchUpFormatGovernor`                  | Scheduled                     | Review required |
| [`isIndeterminateFee`](/docs/implementation/records/isIndeterminateFee)                                            | `entriesGovernor`, `queryGovernor`       | Scheduled                     | Review required |
| [`isTournamentPublished`](/docs/implementation/records/isTournamentPublished)                                      | `publishingGovernor`, `queryGovernor`    | Scheduled                     | Review required |
| [`isTournamentVisible`](/docs/implementation/records/isTournamentVisible)                                          | `publishingGovernor`, `queryGovernor`    | Scheduled                     | Review required |
| [`isValid`](/docs/implementation/validation/isValid)                                                               | `matchUpFormatGovernor`                  | Scheduled                     | Review required |
| [`isValidMatchUpFormat`](/docs/implementation/validation/isValidMatchUpFormat)                                     | `matchUpFormatGovernor`, `scoreGovernor` | Stays (governor copy removed) | Review required |
| [`isVisiblyPublished`](/docs/implementation/records/isVisiblyPublished)                                            | `publishingGovernor`, `queryGovernor`    | Scheduled                     | Review required |
| [`iterateDayTicks`](/docs/implementation/scheduling/iterateDayTicks)                                               | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`mcpValidator`](/docs/implementation/scoring/mcpValidator)                                                        | `scoreGovernor`                          | Scheduled                     | Review required |
| [`mergeAdjacentSegments`](/docs/implementation/scheduling/mergeAdjacentSegments)                                   | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`mergeOverlappingAvailability`](/docs/implementation/scheduling/mergeOverlappingAvailability)                     | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`minutesToHhmm`](/docs/implementation/scheduling/minutesToHhmm)                                                   | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`overlappingRange`](/docs/implementation/scheduling/overlappingRange)                                             | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`parseCSV`](/docs/implementation/scoring/parseCSV)                                                                | `scoreGovernor`                          | Scheduled                     | Review required |
| [`parseMCPPoint`](/docs/implementation/scoring/parseMCPPoint)                                                      | `scoreGovernor`                          | Scheduled                     | Review required |
| [`participantScheduledMatchUps`](/docs/implementation/records/participantScheduledMatchUps)                        | `matchUpGovernor`, `queryGovernor`       | Scheduled                     | Review required |
| [`pbpValidator`](/docs/implementation/scoring/pbpValidator)                                                        | `scoreGovernor`                          | Scheduled                     | Review required |
| [`predictDrawCompetitiveBands`](/docs/implementation/draws/predictDrawCompetitiveBands)                            | `drawsGovernor`, `queryGovernor`         | Scheduled                     | Review required |
| [`predictMatchUpCompetitiveBands`](/docs/implementation/records/predictMatchUpCompetitiveBands)                    | `matchUpGovernor`, `queryGovernor`       | Scheduled                     | Review required |
| [`publicFindVenue`](/docs/implementation/scheduling/publicFindVenue)                                               | `queryGovernor`, `venueGovernor`         | Scheduled                     | Review required |
| [`queryOfficialRecord`](/docs/implementation/records/queryOfficialRecord)                                          | `officiatingGovernor`                    | Scheduled                     | Review required |
| [`querySanctioningRecord`](/docs/implementation/records/querySanctioningRecord)                                    | `sanctioningGovernor`                    | Scheduled                     | Review required |
| [`railsToDateAvailability`](/docs/implementation/scheduling/railsToDateAvailability)                               | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`rangesOverlap`](/docs/implementation/scheduling/rangesOverlap)                                                   | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`refreshLadderRatings`](/docs/implementation/records/refreshLadderRatings)                                        | `ladderGovernor`                         | Scheduled                     | Review required |
| [`remapDrawDefinitionMatchUpIds`](/docs/implementation/draws/remapDrawDefinitionMatchUpIds)                        | `drawsGovernor`                          | Scheduled                     | Review required |
| [`removeNotes`](/docs/implementation/records/removeNotes)                                                          | `tournamentGovernor`                     | Scheduled                     | Review required |
| [`removeOrphanedTieFormats`](/docs/implementation/validation/removeOrphanedTieFormats)                             | `tieFormatGovernor`                      | Scheduled                     | Review required |
| [`removeScaleValues`](/docs/implementation/records/removeScaleValues)                                              | `eventGovernor`                          | Scheduled                     | Review required |
| [`resolveCourtId`](/docs/implementation/scheduling/resolveCourtId)                                                 | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`resolveEntryFee`](/docs/implementation/records/resolveEntryFee)                                                  | `entriesGovernor`, `queryGovernor`       | Scheduled                     | Review required |
| [`resolvePointValue`](/docs/implementation/scoring/resolvePointValue)                                              | `scoreGovernor`                          | Scheduled                     | Review required |
| [`resolveVenueId`](/docs/implementation/scheduling/resolveVenueId)                                                 | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`runValidationPipeline`](/docs/implementation/scheduling/runValidationPipeline)                                   | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`sampleCapacityCurve`](/docs/implementation/scheduling/sampleCapacityCurve)                                       | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`setMatchUpState`](/docs/implementation/records/setMatchUpState)                                                  | `matchUpGovernor`                        | Removed                       | Review required |
| [`shotParser`](/docs/implementation/scoring/shotParser)                                                            | `scoreGovernor`                          | Scheduled                     | Review required |
| [`shotSplitter`](/docs/implementation/scoring/shotSplitter)                                                        | `scoreGovernor`                          | Scheduled                     | Review required |
| [`snapIsoToGranularity`](/docs/implementation/scheduling/snapIsoToGranularity)                                     | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`snapToGranularity`](/docs/implementation/scheduling/snapToGranularity)                                           | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`sortBlocksByStart`](/docs/implementation/scheduling/sortBlocksByStart)                                           | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`sortEdges`](/docs/implementation/scheduling/sortEdges)                                                           | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`tieFormatGenderValidityCheck`](/docs/implementation/validation/tieFormatGenderValidityCheck)                     | `queryGovernor`, `tieFormatGovernor`     | Retained                      | Review required |
| [`timeInsideBlock`](/docs/implementation/scheduling/timeInsideBlock)                                               | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`todsAvailabilityToBlocks`](/docs/implementation/scheduling/todsAvailabilityToBlocks)                             | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`updateTeamLineUp`](/docs/implementation/draws/updateTeamLineUp)                                                  | `drawsGovernor`                          | Scheduled                     | Review required |
| [`validMatchUp`](/docs/implementation/validation/validMatchUp)                                                     | `matchUpGovernor`, `queryGovernor`       | Scheduled                     | Review required |
| [`validMatchUps`](/docs/implementation/validation/validMatchUps)                                                   | `matchUpGovernor`, `queryGovernor`       | Scheduled                     | Review required |
| [`validateCategory`](/docs/implementation/validation/validateCategory)                                             | `eventGovernor`                          | Scheduled                     | Review required |
| [`validateCollectionDefinition`](/docs/implementation/validation/validateCollectionDefinition)                     | `queryGovernor`, `tieFormatGovernor`     | Scheduled                     | Review required |
| [`validateDateAvailability`](/docs/implementation/scheduling/validateDateAvailability)                             | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`validateLineUp`](/docs/implementation/validation/validateLineUp)                                                 | `participantGovernor`, `queryGovernor`   | Scheduled                     | Review required |
| [`validateMCPMatch`](/docs/implementation/scoring/validateMCPMatch)                                                | `scoreGovernor`                          | Scheduled                     | Review required |
| [`validateMatchUp`](/docs/implementation/scoring/validateMatchUp)                                                  | `scoreGovernor`                          | Scheduled                     | Review required |
| [`validateMatchUpFormat`](/docs/implementation/validation/validateMatchUpFormat)                                   | `matchUpFormatGovernor`                  | Scheduled                     | Review required |
| [`validateOfficiatingStatusTransition`](/docs/implementation/validation/validateOfficiatingStatusTransition)       | `officiatingGovernor`                    | Scheduled                     | Review required |
| [`validatePlayoffGroups`](/docs/implementation/draws/validatePlayoffGroups)                                        | `drawsGovernor`, `queryGovernor`         | Scheduled                     | Review required |
| [`validatePresenceAttribution`](/docs/implementation/records/validatePresenceAttribution)                          | `participantGovernor`, `queryGovernor`   | Scheduled                     | Review required |
| [`validateScheduleScenario`](/docs/implementation/validation/validateScheduleScenario)                             | `scheduleGovernor`                       | Scheduled                     | Review required |
| [`validateSchedulingProfileFormat`](/docs/implementation/scheduling/validateSchedulingProfileFormat)               | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`validateSegments`](/docs/implementation/scheduling/validateSegments)                                             | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`validateStatusTransition`](/docs/implementation/validation/validateStatusTransition)                             | `sanctioningGovernor`                    | Scheduled                     | Review required |
| [`validateTieFormat`](/docs/implementation/validation/validateTieFormat)                                           | `scoreGovernor`                          | Scheduled                     | Review required |
| [`venueDayKey`](/docs/implementation/scheduling/venueDayKey)                                                       | `availabilityGovernor`                   | Scheduled                     | Review required |
| [`venueKey`](/docs/implementation/scheduling/venueKey)                                                             | `availabilityGovernor`                   | Scheduled                     | Review required |

## Migration procedure

During 7.x, keep old governor anchors as migration stubs and preserve full explanations here. Confirmed removals are marked scheduled, with a real replacement named where one exists (done 2026-11-22; 117 after the 2026-11-25 retentions, 127 after the 2026-11-26 additions). At the 8.x code change, verify each built engine and package namespace, update generated method signatures, and change notices to removed. Runtime export removal is a separate breaking change.

Historical engine examples are labeled 7.x. They must not be presented as current 8.x examples. Do not globally disable example checks for this area. Source files own concise contracts; Markdown retains workflows and rationale.
