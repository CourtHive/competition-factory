---
title: Engine API transition at 8.0.0
---

# Engine API transition at 8.0.0

The 125 candidates below come from the 2026-10-15 engine-reach catalog: none of their names appeared in its 21-repository product consumer sweep. This is historical candidate evidence, not a current proof of non-use or external-integrator clearance. The 191 methods not driven through an engine by tests are a different, larger set; standalone engine reach is not grounds for removal.

**No runtime exports change in this documentation preparation.** Candidates require refreshed symbol-aware consumer review and external-integrator confirmation before their production routes are removed at 8.0.0. Test-only conformance-harness access is independent of product exposure.

See the [8.0.0 migration guide](/docs/migration-8.0.0) in the existing migration series.

The refreshed scan records all 21 source directories, including an unversioned tidyScore checkout; its word matches still require symbol-aware review. The disposition manifest also records **writes when invoked through an engine** and notice behavior. Unknown effects are explicitly unassessed, never inferred from a query-governor name.

## Three separate decisions

1. Production engine/governor route: candidate for removal at 8.0.0.
2. Supported standalone package import: review each method independently.
3. Internal implementation and test-only contract: may remain without any public engine route.

No deep import or replacement API is introduced here. An existing governor namespace import also depends on the governor export and is not a standalone migration. Retained supported utilities must receive explicit package exports and remain in the supported API reference. Truly internal helpers belong in this implementation area.

## Candidate disposition

All entries are pending external confirmation. Only `addGoesTo` has supported replacement routes, listed on its page; no other replacement is promised. The machine-readable owner is `documentation/engine-api-transition.json`: source identity, declaring governors, previous anchors, related docs and decisions. Update it when a decision changes; never infer approval from a test-only invocation.

| Method                                                                                                             | Declaring governors                    | Engine route at 8.0.0 | Standalone API  |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | --------------------- | --------------- |
| [`EvaluatorRegistry`](/docs/implementation/scheduling/EvaluatorRegistry)                                           | `availabilityGovernor`                 | Candidate             | Review required |
| [`addGoesTo`](/docs/implementation/records/addGoesTo)                                                              | `drawsGovernor`, `queryGovernor`       | Candidate             | Review required |
| [`addNotes`](/docs/implementation/records/addNotes)                                                                | `tournamentGovernor`                   | Candidate             | Review required |
| [`allPlayoffPositionsFilled`](/docs/implementation/draws/allPlayoffPositionsFilled)                                | `drawsGovernor`, `queryGovernor`       | Candidate             | Review required |
| [`analyzeSequence`](/docs/implementation/scoring/analyzeSequence)                                                  | `scoreGovernor`                        | Candidate             | Review required |
| [`applyAvailabilityToTournamentRecord`](/docs/implementation/scheduling/applyAvailabilityToTournamentRecord)       | `availabilityGovernor`                 | Candidate             | Review required |
| [`buildDayRange`](/docs/implementation/scheduling/buildDayRange)                                                   | `availabilityGovernor`                 | Candidate             | Review required |
| [`buildEdges`](/docs/implementation/scheduling/buildEdges)                                                         | `availabilityGovernor`                 | Candidate             | Review required |
| [`buildSchedulingProfileFromUISelections`](/docs/implementation/scheduling/buildSchedulingProfileFromUISelections) | `availabilityGovernor`                 | Candidate             | Review required |
| [`calculateCourtHours`](/docs/implementation/scheduling/calculateCourtHours)                                       | `availabilityGovernor`                 | Candidate             | Review required |
| [`calculateMatchUpMargin`](/docs/implementation/records/calculateMatchUpMargin)                                    | `matchUpGovernor`, `queryGovernor`     | Candidate             | Review required |
| [`categoryCanContain`](/docs/implementation/records/categoryCanContain)                                            | `eventGovernor`, `queryGovernor`       | Candidate             | Review required |
| [`clampDragToCollisions`](/docs/implementation/scheduling/clampDragToCollisions)                                   | `availabilityGovernor`                 | Candidate             | Review required |
| [`clampToDayRange`](/docs/implementation/scheduling/clampToDayRange)                                               | `availabilityGovernor`                 | Candidate             | Review required |
| [`compareCapacityCurves`](/docs/implementation/scheduling/compareCapacityCurves)                                   | `availabilityGovernor`                 | Candidate             | Review required |
| [`computePlanItemId`](/docs/implementation/scheduling/computePlanItemId)                                           | `availabilityGovernor`                 | Candidate             | Review required |
| [`courtDayKey`](/docs/implementation/scheduling/courtDayKey)                                                       | `availabilityGovernor`                 | Candidate             | Review required |
| [`createFollowByEvaluator`](/docs/implementation/scheduling/createFollowByEvaluator)                               | `availabilityGovernor`                 | Candidate             | Review required |
| [`createMatchUp`](/docs/implementation/scoring/createMatchUp)                                                      | `scoreGovernor`                        | Candidate             | Review required |
| [`deduceMatchUpFormat`](/docs/implementation/scoring/deduceMatchUpFormat)                                          | `scoreGovernor`                        | Candidate             | Review required |
| [`deriveRailSegments`](/docs/implementation/scheduling/deriveRailSegments)                                         | `availabilityGovernor`                 | Candidate             | Review required |
| [`diffMinutes`](/docs/implementation/scheduling/diffMinutes)                                                       | `availabilityGovernor`                 | Candidate             | Review required |
| [`enrichPointHistory`](/docs/implementation/scoring/enrichPointHistory)                                            | `scoreGovernor`                        | Candidate             | Review required |
| [`exportMatchUpJSON`](/docs/implementation/scoring/exportMatchUpJSON)                                              | `scoreGovernor`                        | Candidate             | Review required |
| [`extractDay`](/docs/implementation/scheduling/extractDay)                                                         | `availabilityGovernor`                 | Candidate             | Review required |
| [`filterCapacityCurve`](/docs/implementation/scheduling/filterCapacityCurve)                                       | `availabilityGovernor`                 | Candidate             | Review required |
| [`findBlocksContainingTime`](/docs/implementation/scheduling/findBlocksContainingTime)                             | `availabilityGovernor`                 | Candidate             | Review required |
| [`generateCapacityCurve`](/docs/implementation/scheduling/generateCapacityCurve)                                   | `availabilityGovernor`                 | Candidate             | Review required |
| [`generateDrawStructuresAndLinks`](/docs/implementation/draws/generateDrawStructuresAndLinks)                      | `drawsGovernor`, `generationGovernor`  | Candidate             | Review required |
| [`generateStatCrew`](/docs/implementation/records/generateStatCrew)                                                | `generationGovernor`                   | Candidate             | Review required |
| [`getAllowedDrawTypes`](/docs/implementation/records/getAllowedDrawTypes)                                          | `queryGovernor`, `tournamentGovernor`  | Candidate             | Review required |
| [`getAwardPoints`](/docs/implementation/records/getAwardPoints)                                                    | `rankingGovernor`                      | Candidate             | Review required |
| [`getDrawCompleteness`](/docs/implementation/draws/getDrawCompleteness)                                            | `drawsGovernor`, `queryGovernor`       | Candidate             | Review required |
| [`getDrawDefinitionTimeItem`](/docs/implementation/scheduling/getDrawDefinitionTimeItem)                           | `drawsGovernor`, `queryGovernor`       | Candidate             | Review required |
| [`getDrawStructures`](/docs/implementation/records/getDrawStructures)                                              | `drawsGovernor`, `queryGovernor`       | Candidate             | Review required |
| [`getDrawTypeCoercion`](/docs/implementation/draws/getDrawTypeCoercion)                                            | `drawsGovernor`, `queryGovernor`       | Candidate             | Review required |
| [`getEffectiveRegistrationProfile`](/docs/implementation/records/getEffectiveRegistrationProfile)                  | `entriesGovernor`, `queryGovernor`     | Candidate             | Review required |
| [`getEligibleEvents`](/docs/implementation/records/getEligibleEvents)                                              | `eventGovernor`, `queryGovernor`       | Candidate             | Review required |
| [`getEntryFeeRange`](/docs/implementation/records/getEntryFeeRange)                                                | `entriesGovernor`, `queryGovernor`     | Candidate             | Review required |
| [`getEventCompleteness`](/docs/implementation/records/getEventCompleteness)                                        | `eventGovernor`, `queryGovernor`       | Candidate             | Review required |
| [`getEventEntryFees`](/docs/implementation/records/getEventEntryFees)                                              | `entriesGovernor`, `queryGovernor`     | Candidate             | Review required |
| [`getEventInconsistencies`](/docs/implementation/records/getEventInconsistencies)                                  | `eventGovernor`, `queryGovernor`       | Candidate             | Review required |
| [`getLadderMovement`](/docs/implementation/records/getLadderMovement)                                              | `ladderGovernor`                       | Candidate             | Review required |
| [`getMatchUpContextIds`](/docs/implementation/records/getMatchUpContextIds)                                        | `matchUpGovernor`, `queryGovernor`     | Candidate             | Review required |
| [`getMatchUpRatingDelta`](/docs/implementation/records/getMatchUpRatingDelta)                                      | `matchUpGovernor`, `queryGovernor`     | Candidate             | Review required |
| [`getMatchUpType`](/docs/implementation/records/getMatchUpType)                                                    | `matchUpGovernor`, `queryGovernor`     | Candidate             | Review required |
| [`getMatchUpsToSchedule`](/docs/implementation/scheduling/getMatchUpsToSchedule)                                   | `queryGovernor`, `scheduleGovernor`    | Candidate             | Review required |
| [`getParticipantPoints`](/docs/implementation/records/getParticipantPoints)                                        | `rankingGovernor`                      | Candidate             | Review required |
| [`getParticipantTimeItem`](/docs/implementation/scheduling/getParticipantTimeItem)                                 | `participantGovernor`, `queryGovernor` | Candidate             | Review required |
| [`getPositionsPlayedOff`](/docs/implementation/draws/getPositionsPlayedOff)                                        | `drawsGovernor`, `queryGovernor`       | Candidate             | Review required |
| [`getPresenceExpectation`](/docs/implementation/records/getPresenceExpectation)                                    | `participantGovernor`, `queryGovernor` | Candidate             | Review required |
| [`getPresenceRules`](/docs/implementation/records/getPresenceRules)                                                | `participantGovernor`, `queryGovernor` | Candidate             | Review required |
| [`getQualityWinPoints`](/docs/implementation/records/getQualityWinPoints)                                          | `rankingGovernor`                      | Candidate             | Review required |
| [`getQuickStats`](/docs/implementation/scoring/getQuickStats)                                                      | `scoreGovernor`                        | Candidate             | Review required |
| [`getScaleValues`](/docs/implementation/records/getScaleValues)                                                    | `participantGovernor`, `queryGovernor` | Candidate             | Review required |
| [`getSeedingThresholds`](/docs/implementation/draws/getSeedingThresholds)                                          | `drawsGovernor`, `queryGovernor`       | Candidate             | Review required |
| [`getSetScoreString`](/docs/implementation/scoring/getSetScoreString)                                              | `scoreGovernor`                        | Candidate             | Review required |
| [`getTournamentTimeItem`](/docs/implementation/scheduling/getTournamentTimeItem)                                   | `queryGovernor`, `tournamentGovernor`  | Candidate             | Review required |
| [`groupByMatch`](/docs/implementation/scoring/groupByMatch)                                                        | `scoreGovernor`                        | Candidate             | Review required |
| [`groupConflictsBySeverity`](/docs/implementation/scheduling/groupConflictsBySeverity)                             | `availabilityGovernor`                 | Candidate             | Review required |
| [`hasLuckyRounds`](/docs/implementation/draws/hasLuckyRounds)                                                      | `drawsGovernor`, `queryGovernor`       | Candidate             | Review required |
| [`hhmmToMinutes`](/docs/implementation/scheduling/hhmmToMinutes)                                                   | `availabilityGovernor`                 | Candidate             | Review required |
| [`inferServeSide`](/docs/implementation/scoring/inferServeSide)                                                    | `scoreGovernor`                        | Candidate             | Review required |
| [`intervalsOverlap`](/docs/implementation/scheduling/intervalsOverlap)                                             | `availabilityGovernor`                 | Candidate             | Review required |
| [`isAggregateFormat`](/docs/implementation/records/isAggregateFormat)                                              | `matchUpFormatGovernor`                | Candidate             | Review required |
| [`isIndeterminateFee`](/docs/implementation/records/isIndeterminateFee)                                            | `entriesGovernor`, `queryGovernor`     | Candidate             | Review required |
| [`isTournamentPublished`](/docs/implementation/records/isTournamentPublished)                                      | `publishingGovernor`, `queryGovernor`  | Candidate             | Review required |
| [`isTournamentVisible`](/docs/implementation/records/isTournamentVisible)                                          | `publishingGovernor`, `queryGovernor`  | Candidate             | Review required |
| [`isVisiblyPublished`](/docs/implementation/records/isVisiblyPublished)                                            | `publishingGovernor`, `queryGovernor`  | Candidate             | Review required |
| [`iterateDayTicks`](/docs/implementation/scheduling/iterateDayTicks)                                               | `availabilityGovernor`                 | Candidate             | Review required |
| [`mcpValidator`](/docs/implementation/scoring/mcpValidator)                                                        | `scoreGovernor`                        | Candidate             | Review required |
| [`mergeAdjacentSegments`](/docs/implementation/scheduling/mergeAdjacentSegments)                                   | `availabilityGovernor`                 | Candidate             | Review required |
| [`mergeOverlappingAvailability`](/docs/implementation/scheduling/mergeOverlappingAvailability)                     | `availabilityGovernor`                 | Candidate             | Review required |
| [`minutesToHhmm`](/docs/implementation/scheduling/minutesToHhmm)                                                   | `availabilityGovernor`                 | Candidate             | Review required |
| [`overlappingRange`](/docs/implementation/scheduling/overlappingRange)                                             | `availabilityGovernor`                 | Candidate             | Review required |
| [`parseCSV`](/docs/implementation/scoring/parseCSV)                                                                | `scoreGovernor`                        | Candidate             | Review required |
| [`parseMCPPoint`](/docs/implementation/scoring/parseMCPPoint)                                                      | `scoreGovernor`                        | Candidate             | Review required |
| [`participantScheduledMatchUps`](/docs/implementation/records/participantScheduledMatchUps)                        | `matchUpGovernor`, `queryGovernor`     | Candidate             | Review required |
| [`pbpValidator`](/docs/implementation/scoring/pbpValidator)                                                        | `scoreGovernor`                        | Candidate             | Review required |
| [`predictDrawCompetitiveBands`](/docs/implementation/draws/predictDrawCompetitiveBands)                            | `drawsGovernor`, `queryGovernor`       | Candidate             | Review required |
| [`predictMatchUpCompetitiveBands`](/docs/implementation/records/predictMatchUpCompetitiveBands)                    | `matchUpGovernor`, `queryGovernor`     | Candidate             | Review required |
| [`publicFindVenue`](/docs/implementation/scheduling/publicFindVenue)                                               | `queryGovernor`, `venueGovernor`       | Candidate             | Review required |
| [`queryOfficialRecord`](/docs/implementation/records/queryOfficialRecord)                                          | `officiatingGovernor`                  | Candidate             | Review required |
| [`querySanctioningRecord`](/docs/implementation/records/querySanctioningRecord)                                    | `sanctioningGovernor`                  | Candidate             | Review required |
| [`railsToDateAvailability`](/docs/implementation/scheduling/railsToDateAvailability)                               | `availabilityGovernor`                 | Candidate             | Review required |
| [`rangesOverlap`](/docs/implementation/scheduling/rangesOverlap)                                                   | `availabilityGovernor`                 | Candidate             | Review required |
| [`refreshLadderRatings`](/docs/implementation/records/refreshLadderRatings)                                        | `ladderGovernor`                       | Candidate             | Review required |
| [`remapDrawDefinitionMatchUpIds`](/docs/implementation/draws/remapDrawDefinitionMatchUpIds)                        | `drawsGovernor`                        | Candidate             | Review required |
| [`removeNotes`](/docs/implementation/records/removeNotes)                                                          | `tournamentGovernor`                   | Candidate             | Review required |
| [`removeOrphanedTieFormats`](/docs/implementation/validation/removeOrphanedTieFormats)                             | `tieFormatGovernor`                    | Candidate             | Review required |
| [`removeScaleValues`](/docs/implementation/records/removeScaleValues)                                              | `eventGovernor`                        | Candidate             | Review required |
| [`resolveCourtId`](/docs/implementation/scheduling/resolveCourtId)                                                 | `availabilityGovernor`                 | Candidate             | Review required |
| [`resolveEntryFee`](/docs/implementation/records/resolveEntryFee)                                                  | `entriesGovernor`, `queryGovernor`     | Candidate             | Review required |
| [`resolvePointValue`](/docs/implementation/scoring/resolvePointValue)                                              | `scoreGovernor`                        | Candidate             | Review required |
| [`resolveVenueId`](/docs/implementation/scheduling/resolveVenueId)                                                 | `availabilityGovernor`                 | Candidate             | Review required |
| [`runValidationPipeline`](/docs/implementation/scheduling/runValidationPipeline)                                   | `availabilityGovernor`                 | Candidate             | Review required |
| [`sampleCapacityCurve`](/docs/implementation/scheduling/sampleCapacityCurve)                                       | `availabilityGovernor`                 | Candidate             | Review required |
| [`shotParser`](/docs/implementation/scoring/shotParser)                                                            | `scoreGovernor`                        | Candidate             | Review required |
| [`shotSplitter`](/docs/implementation/scoring/shotSplitter)                                                        | `scoreGovernor`                        | Candidate             | Review required |
| [`snapIsoToGranularity`](/docs/implementation/scheduling/snapIsoToGranularity)                                     | `availabilityGovernor`                 | Candidate             | Review required |
| [`snapToGranularity`](/docs/implementation/scheduling/snapToGranularity)                                           | `availabilityGovernor`                 | Candidate             | Review required |
| [`sortBlocksByStart`](/docs/implementation/scheduling/sortBlocksByStart)                                           | `availabilityGovernor`                 | Candidate             | Review required |
| [`sortEdges`](/docs/implementation/scheduling/sortEdges)                                                           | `availabilityGovernor`                 | Candidate             | Review required |
| [`tieFormatGenderValidityCheck`](/docs/implementation/validation/tieFormatGenderValidityCheck)                     | `queryGovernor`, `tieFormatGovernor`   | Candidate             | Review required |
| [`timeInsideBlock`](/docs/implementation/scheduling/timeInsideBlock)                                               | `availabilityGovernor`                 | Candidate             | Review required |
| [`todsAvailabilityToBlocks`](/docs/implementation/scheduling/todsAvailabilityToBlocks)                             | `availabilityGovernor`                 | Candidate             | Review required |
| [`updateTeamLineUp`](/docs/implementation/draws/updateTeamLineUp)                                                  | `drawsGovernor`                        | Candidate             | Review required |
| [`validMatchUp`](/docs/implementation/validation/validMatchUp)                                                     | `matchUpGovernor`, `queryGovernor`     | Candidate             | Review required |
| [`validMatchUps`](/docs/implementation/validation/validMatchUps)                                                   | `matchUpGovernor`, `queryGovernor`     | Candidate             | Review required |
| [`validateCategory`](/docs/implementation/validation/validateCategory)                                             | `eventGovernor`                        | Candidate             | Review required |
| [`validateCollectionDefinition`](/docs/implementation/validation/validateCollectionDefinition)                     | `queryGovernor`, `tieFormatGovernor`   | Candidate             | Review required |
| [`validateDateAvailability`](/docs/implementation/scheduling/validateDateAvailability)                             | `availabilityGovernor`                 | Candidate             | Review required |
| [`validateLineUp`](/docs/implementation/validation/validateLineUp)                                                 | `participantGovernor`, `queryGovernor` | Candidate             | Review required |
| [`validateMCPMatch`](/docs/implementation/scoring/validateMCPMatch)                                                | `scoreGovernor`                        | Candidate             | Review required |
| [`validateMatchUp`](/docs/implementation/scoring/validateMatchUp)                                                  | `scoreGovernor`                        | Candidate             | Review required |
| [`validateOfficiatingStatusTransition`](/docs/implementation/validation/validateOfficiatingStatusTransition)       | `officiatingGovernor`                  | Candidate             | Review required |
| [`validatePlayoffGroups`](/docs/implementation/draws/validatePlayoffGroups)                                        | `drawsGovernor`, `queryGovernor`       | Candidate             | Review required |
| [`validatePresenceAttribution`](/docs/implementation/records/validatePresenceAttribution)                          | `participantGovernor`, `queryGovernor` | Candidate             | Review required |
| [`validateScheduleScenario`](/docs/implementation/validation/validateScheduleScenario)                             | `scheduleGovernor`                     | Candidate             | Review required |
| [`validateSchedulingProfileFormat`](/docs/implementation/scheduling/validateSchedulingProfileFormat)               | `availabilityGovernor`                 | Candidate             | Review required |
| [`validateSegments`](/docs/implementation/scheduling/validateSegments)                                             | `availabilityGovernor`                 | Candidate             | Review required |
| [`validateStatusTransition`](/docs/implementation/validation/validateStatusTransition)                             | `sanctioningGovernor`                  | Candidate             | Review required |
| [`validateTieFormat`](/docs/implementation/validation/validateTieFormat)                                           | `scoreGovernor`                        | Candidate             | Review required |
| [`venueDayKey`](/docs/implementation/scheduling/venueDayKey)                                                       | `availabilityGovernor`                 | Candidate             | Review required |
| [`venueKey`](/docs/implementation/scheduling/venueKey)                                                             | `availabilityGovernor`                 | Candidate             | Review required |

## Migration procedure

During 7.x, keep old governor anchors as migration stubs and preserve full explanations here. Once a removal is confirmed, change its candidate status to scheduled and name a real replacement when one exists. At the 8.x code change, verify each built engine and package namespace, update generated method signatures, and change notices to removed. Runtime export removal is a separate breaking change.

Historical engine examples are labeled 7.x. They must not be presented as current 8.x examples. Do not globally disable example checks for this area. Source files own concise contracts; Markdown retains workflows and rationale.
