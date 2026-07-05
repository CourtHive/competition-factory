/**
 * AUTO-GENERATED — do not edit by hand.
 * Source: src/tests/engines/syncEngine + src/assemblies/governors
 * Regenerate: pnpm gen:engine-methods
 * Drift guard:  pnpm check:engine-methods
 */
export type FactoryEngineMethod =
  | 'abandonTournamentMatchUps'
  | 'addAdHocMatchUps'
  | 'addCertification'
  | 'addCertificationRequirement'
  | 'addCollectionDefinition'
  | 'addCollectionGroup'
  | 'addCourt'
  | 'addCourtGridBooking'
  | 'addCourts'
  | 'addDrawDefinition'
  | 'addDrawDefinitionExtension'
  | 'addDrawDefinitionTimeItem'
  | 'addDrawEntries'
  | 'addDynamicRatings'
  | 'addEvaluation'
  | 'addEvaluationPolicy'
  | 'addEvent'
  | 'addEventEntries'
  | 'addEventEntryPairs'
  | 'addEventExtension'
  | 'addEventTimeItem'
  | 'addExtension'
  | 'addFinishingRounds'
  | 'addFlight'
  | 'addGoesTo'
  | 'addIndividualParticipantIds'
  | 'addLinkedConsolationStructure'
  | 'addMatchUpCourtOrder'
  | 'addMatchUpEndTime'
  | 'addMatchUpOfficial'
  | 'addMatchUpResumeTime'
  | 'addMatchUpScheduledDate'
  | 'addMatchUpScheduledTime'
  | 'addMatchUpScheduleItems'
  | 'addMatchUpStartTime'
  | 'addMatchUpStopTime'
  | 'addMutationLock'
  | 'addNotes'
  | 'addOnlineResource'
  | 'addParticipant'
  | 'addParticipantExtension'
  | 'addParticipants'
  | 'addParticipantTimeItem'
  | 'addPenalty'
  | 'addPersonOtherId'
  | 'addPersonRequests'
  | 'addPersons'
  | 'addPlayoffStructures'
  | 'addPoint'
  | 'addPracticeRegistration'
  | 'addQualifyingStructure'
  | 'addSchedulingProfileRound'
  | 'addSuspension'
  | 'addTimeItem'
  | 'addTournamentExtension'
  | 'addTournamentTimeItem'
  | 'addVenue'
  | 'addVoluntaryConsolationStructure'
  | 'adHocPositionSwap'
  | 'aggregateTieFormats'
  | 'allCompetitionMatchUps'
  | 'allDrawMatchUps'
  | 'allEventMatchUps'
  | 'allocateTeamMatchUpCourts'
  | 'allPlayoffPositionsFilled'
  | 'allTournamentMatchUps'
  | 'alternateDrawPositionAssignment'
  | 'analyzeDraws'
  | 'analyzeMatchUp'
  | 'analyzeScore'
  | 'analyzeSequence'
  | 'analyzeSet'
  | 'analyzeTournament'
  | 'anonymizeTournamentRecord'
  | 'applyAvailabilityToTournamentRecord'
  | 'applyDerivedRankings'
  | 'applyLineUps'
  | 'applyTournamentRankingPoints'
  | 'assignDrawPosition'
  | 'assignDrawPositionBye'
  | 'assignMatchUpCourt'
  | 'assignMatchUpSideParticipant'
  | 'assignMatchUpVenue'
  | 'assignOfficial'
  | 'assignSeedPositions'
  | 'assignTieMatchUpParticipantId'
  | 'attachConsolationStructures'
  | 'attachFlightProfile'
  | 'attachPlayoffStructures'
  | 'attachPolicies'
  | 'attachQualifyingStructure'
  | 'attachStructures'
  | 'auditAuthorityServer'
  | 'automatedPlayoffPositioning'
  | 'automatedPositioning'
  | 'autoSeeding'
  | 'buildDayRange'
  | 'buildDrawHierarchy'
  | 'buildEdges'
  | 'buildReportContext'
  | 'buildSchedulingProfileFromUISelections'
  | 'bulkMatchUpStatusUpdate'
  | 'bulkRescheduleMatchUps'
  | 'bulkScheduleMatchUps'
  | 'bulkScheduleTournamentMatchUps'
  | 'bulkUpdateCourtAssignments'
  | 'bulkUpdatePublishedEventIds'
  | 'calculateCapacityStats'
  | 'calculateCourtHours'
  | 'calculateMatchStatistics'
  | 'calculateMatchUpMargin'
  | 'calculatePointsTo'
  | 'calculateScheduleTimes'
  | 'calculateWinCriteria'
  | 'categoryCanContain'
  | 'checkInParticipant'
  | 'checkMatchUpIsComplete'
  | 'checkOutParticipant'
  | 'checkScoreHasValue'
  | 'checkSetIsComplete'
  | 'checkValidEntries'
  | 'clampDragToCollisions'
  | 'clampToDayRange'
  | 'cleanExpiredMutationLocks'
  | 'clearMatchUpSchedule'
  | 'clearScheduledMatchUps'
  | 'compareCapacityCurves'
  | 'compareTieFormats'
  | 'competitionScheduleMatchUps'
  | 'completeDrawMatchUps'
  | 'computePlanItemId'
  | 'copyTournamentRecord'
  | 'courtDayKey'
  | 'courtGridRows'
  | 'courtKey'
  | 'createFollowByEvaluator'
  | 'createGroupParticipant'
  | 'createMatchUp'
  | 'createOfficialRecord'
  | 'createTeamsFromParticipantAttributes'
  | 'createTournamentRecord'
  | 'credits'
  | 'deduceMatchUpFormat'
  | 'deleteAdHocMatchUps'
  | 'deleteCourt'
  | 'deleteCourts'
  | 'deleteDrawDefinitions'
  | 'deleteEvents'
  | 'deleteFlightAndFlightDraw'
  | 'deleteFlightProfileAndFlightDraws'
  | 'deleteParticipants'
  | 'deleteVenue'
  | 'deleteVenues'
  | 'deriveRailSegments'
  | 'destroyPairEntries'
  | 'destroyPairEntry'
  | 'devContext'
  | 'diffMinutes'
  | 'disableCourts'
  | 'disableTieAutoCalc'
  | 'disableVenues'
  | 'drawMatchUps'
  | 'drawMatic'
  | 'dryRun'
  | 'enableCourts'
  | 'enableTieAutoCalc'
  | 'enableVenues'
  | 'enrichPointHistory'
  | 'EvaluatorRegistry'
  | 'eventMatchUps'
  | 'execute'
  | 'executionQueue'
  | 'explain'
  | 'exportMatchUpJSON'
  | 'extractDay'
  | 'filterCapacityCurve'
  | 'filterMatchUps'
  | 'filterParticipants'
  | 'findBlocksContainingTime'
  | 'findDrawDefinition'
  | 'findExtension'
  | 'findMatchUp'
  | 'findMatchUpFormatTiming'
  | 'findParticipant'
  | 'findPolicy'
  | 'findVenue'
  | 'formatConflicts'
  | 'generateAdHocMatchUps'
  | 'generateAdHocRounds'
  | 'generateAndPopulatePlayoffStructures'
  | 'generateBookings'
  | 'generateCapacityCurve'
  | 'generateConsolationStructure'
  | 'generateCourts'
  | 'generateDrawDefinition'
  | 'generateDrawMaticRound'
  | 'generateDrawStructuresAndLinks'
  | 'generateDrawTypeAndModifyDrawDefinition'
  | 'generateEventsFromTieFormat'
  | 'generateEventWithDraw'
  | 'generateFlightProfile'
  | 'generateLineUps'
  | 'generateOutcome'
  | 'generateOutcomeFromScoreString'
  | 'generateParticipants'
  | 'generateQualifyingStructure'
  | 'generateRankingList'
  | 'generateReport'
  | 'generateScoreString'
  | 'generateSeedingScaleItems'
  | 'generateStatCrew'
  | 'generateSwissRound'
  | 'generateTieMatchUpScore'
  | 'generateTournamentRecord'
  | 'generateVirtualCourts'
  | 'generateVoluntaryConsolation'
  | 'getAggregateTeamResults'
  | 'getAllDrawMatchUps'
  | 'getAllEventData'
  | 'getAllowedDrawTypes'
  | 'getAllowedMatchUpFormats'
  | 'getAllStructureMatchUps'
  | 'getApplicableAwardProfileLevels'
  | 'getAppliedPolicies'
  | 'getAssignedParticipantIds'
  | 'getAuditAuthorityServer'
  | 'getAvailableMatchUpsCount'
  | 'getAvailablePlayoffProfiles'
  | 'getAvailableReports'
  | 'getAwardPoints'
  | 'getAwardProfile'
  | 'getCategoryAgeDetails'
  | 'getCheckedInParticipantIds'
  | 'getCompetitionDateRange'
  | 'getCompetitionFormat'
  | 'getCompetitionLeaderboard'
  | 'getCompetitionMatchUps'
  | 'getCompetitionParticipants'
  | 'getCompetitionParticipantState'
  | 'getCompetitionPenalties'
  | 'getCompetitionPolicy'
  | 'getCompetitionState'
  | 'getCompetitionVenues'
  | 'getCourtInfo'
  | 'getCourts'
  | 'getDevContext'
  | 'getDraftState'
  | 'getDrawCompleteness'
  | 'getDrawData'
  | 'getDrawDefinitionTimeItem'
  | 'getDrawInconsistencies'
  | 'getDrawParticipantRepresentativeIds'
  | 'getDrawStructures'
  | 'getDrawTypeCoercion'
  | 'getEligibleVoluntaryConsolationParticipants'
  | 'getEntriesAndSeedsCount'
  | 'getEntryStatusReports'
  | 'getEpisodes'
  | 'getEvaluations'
  | 'getEvaluationSummary'
  | 'getEvaluationTemplate'
  | 'getEvent'
  | 'getEventCompleteness'
  | 'getEventData'
  | 'getEventInconsistencies'
  | 'getEventMatchUpFormatTiming'
  | 'getEventProperties'
  | 'getEventPublishStatus'
  | 'getEventRankingPoints'
  | 'getEvents'
  | 'getEventStructures'
  | 'getEventTimeItem'
  | 'getFlightProfile'
  | 'getHighestSeverity'
  | 'getHomeParticipantId'
  | 'getLinkedTournamentIds'
  | 'getLuckyDrawRoundStatus'
  | 'getMatchUpCompetitiveProfile'
  | 'getMatchUpContextIds'
  | 'getMatchUpDailyLimits'
  | 'getMatchUpDailyLimitsUpdate'
  | 'getMatchUpDependencies'
  | 'getMatchUpFormat'
  | 'getMatchUpFormatTiming'
  | 'getMatchUpFormatTimingUpdate'
  | 'getMatchUpFormatVariance'
  | 'getMatchUpScheduleDetails'
  | 'getMatchUpsMap'
  | 'getMatchUpsStats'
  | 'getMatchUpsToSchedule'
  | 'getMatchUpType'
  | 'getMaxEntryPosition'
  | 'getModifiedMatchUpFormatTiming'
  | 'getMutationLocks'
  | 'getOfficialAssignments'
  | 'getOfficialCertifications'
  | 'getOfficialEligibility'
  | 'getPairedParticipant'
  | 'getParticipantEventDetails'
  | 'getParticipantIdFinishingPositions'
  | 'getParticipantMembership'
  | 'getParticipantPaymentStatus'
  | 'getParticipantPoints'
  | 'getParticipantResults'
  | 'getParticipants'
  | 'getParticipantScaleItem'
  | 'getParticipantSchedules'
  | 'getParticipantSignInStatus'
  | 'getParticipantStats'
  | 'getParticipantTimeItem'
  | 'getPersonRequests'
  | 'getPolicyDefinitions'
  | 'getPositionAssignments'
  | 'getPositionsPlayedOff'
  | 'getPracticeRegistrations'
  | 'getPredictiveAccuracy'
  | 'getProfileRounds'
  | 'getPublishState'
  | 'getQualityWinPoints'
  | 'getQuickStats'
  | 'getRandomQualifierList'
  | 'getRegistrationProfile'
  | 'getRoundMatchUps'
  | 'getRounds'
  | 'getRoundVisibilityState'
  | 'getSaveDrawDeletions'
  | 'getScaledEntries'
  | 'getScaleValues'
  | 'getScheduledRoundsDetails'
  | 'getSchedulingProfile'
  | 'getSchedulingProfileIssues'
  | 'getSchemaWriteMode'
  | 'getScore'
  | 'getScoreboard'
  | 'getSeedingThresholds'
  | 'getSeedsCount'
  | 'getSetComplement'
  | 'getSetScoreString'
  | 'getState'
  | 'getStructureCompleteness'
  | 'getStructureInconsistencies'
  | 'getStructureReports'
  | 'getStructureSeedAssignments'
  | 'getSwissChart'
  | 'getSwissStandings'
  | 'getTally'
  | 'getTeamLineUp'
  | 'getTiebreakComplement'
  | 'getTieFormat'
  | 'getTimeItem'
  | 'getTournament'
  | 'getTournamentCompleteness'
  | 'getTournamentId'
  | 'getTournamentIds'
  | 'getTournamentInconsistencies'
  | 'getTournamentInfo'
  | 'getTournamentPenalties'
  | 'getTournamentPersons'
  | 'getTournamentPointAwards'
  | 'getTournamentPoints'
  | 'getTournamentPublishStatus'
  | 'getTournamentStructures'
  | 'getTournamentTimeItem'
  | 'getValidGroupSizes'
  | 'getVenueData'
  | 'getVenuesAndCourts'
  | 'getVenuesReport'
  | 'getWinner'
  | 'groupByMatch'
  | 'groupConflictsBySeverity'
  | 'hasLuckyRounds'
  | 'hhmmToMinutes'
  | 'hydrateTournamentRecord'
  | 'importMethods'
  | 'inferServeSide'
  | 'initializeCompetitionState'
  | 'initializeDraft'
  | 'inspect'
  | 'intervalsOverlap'
  | 'isAdHoc'
  | 'isAggregateFormat'
  | 'isComplete'
  | 'isCompletedStructure'
  | 'isEmbargoed'
  | 'isValid'
  | 'isValidForQualifying'
  | 'isValidMatchUpFormat'
  | 'isVisiblyPublished'
  | 'iterateDayTicks'
  | 'keyValueScore'
  | 'linkTournaments'
  | 'luckyDrawAdvancement'
  | 'luckyLoserDrawPositionAssignment'
  | 'matchUpActions'
  | 'matchUpScheduleChange'
  | 'mcpValidator'
  | 'mergeAdjacentSegments'
  | 'mergeOverlappingAvailability'
  | 'mergeParticipants'
  | 'migrateTournamentRecord'
  | 'minutesToHhmm'
  | 'modifyCertification'
  | 'modifyCollectionDefinition'
  | 'modifyCourt'
  | 'modifyCourtAvailability'
  | 'modifyDrawDefinition'
  | 'modifyDrawName'
  | 'modifyEntriesStatus'
  | 'modifyEvaluation'
  | 'modifyEvent'
  | 'modifyEventEntries'
  | 'modifyEventMatchUpFormatTiming'
  | 'modifyIndividualParticipantIds'
  | 'modifyMatchUpFormatTiming'
  | 'modifyPairAssignment'
  | 'modifyParticipant'
  | 'modifyParticipantName'
  | 'modifyParticipantOtherName'
  | 'modifyParticipantsPaymentStatus'
  | 'modifyParticipantsSignInStatus'
  | 'modifyPenalty'
  | 'modifyPersonRequests'
  | 'modifySeedAssignment'
  | 'modifyTieFormat'
  | 'modifyTournamentRecord'
  | 'modifyVenue'
  | 'newTournamentRecord'
  | 'off'
  | 'on'
  | 'once'
  | 'orderCollectionDefinitions'
  | 'overlappingRange'
  | 'parse'
  | 'parseCSV'
  | 'parseMatchUpFormat'
  | 'parseMCPPoint'
  | 'parseScoreString'
  | 'participantScaleItem'
  | 'participantScheduledMatchUps'
  | 'pbpValidator'
  | 'pointParser'
  | 'positionActions'
  | 'predictDrawCompetitiveBands'
  | 'predictMatchUpCompetitiveBands'
  | 'proAutoSchedule'
  | 'processCompetitionMatchUp'
  | 'processCompetitionRound'
  | 'proColumnResolve'
  | 'proConflicts'
  | 'promoteAlternate'
  | 'promoteAlternates'
  | 'pruneDrawDefinition'
  | 'publicFindCourt'
  | 'publicFindVenue'
  | 'publishEvent'
  | 'publishEventSeeding'
  | 'publishOrderOfPlay'
  | 'publishParticipants'
  | 'qualifierDrawPositionAssignment'
  | 'qualifierProgression'
  | 'queryOfficialRecord'
  | 'railsToDateAvailability'
  | 'rangesOverlap'
  | 'refreshEventDrawOrder'
  | 'regenerateParticipantNames'
  | 'remapDrawDefinitionMatchUpIds'
  | 'removeCertification'
  | 'removeCollectionDefinition'
  | 'removeCollectionGroup'
  | 'removeCourtGridBooking'
  | 'removeDelegatedOutcome'
  | 'removeDrawDefinitionExtension'
  | 'removeDrawEntries'
  | 'removeDrawPositionAssignment'
  | 'removeEvaluation'
  | 'removeEventEntries'
  | 'removeEventExtension'
  | 'removeEventMatchUpFormatTiming'
  | 'removeExtension'
  | 'removeIndividualParticipantIds'
  | 'removeMatchUpCourtAssignment'
  | 'removeMatchUpOutcome'
  | 'removeMatchUpSideParticipant'
  | 'removeMutationLock'
  | 'removeNotes'
  | 'removeOfficialAssignment'
  | 'removeOnlineResource'
  | 'removeOrphanedTieFormats'
  | 'removeParticipantExtension'
  | 'removeParticipantIdsFromAllTeams'
  | 'removePenalty'
  | 'removePersonRequests'
  | 'removePolicy'
  | 'removePracticeRegistration'
  | 'removeRatings'
  | 'removeRoundMatchUps'
  | 'removeScaleValues'
  | 'removeSeededParticipant'
  | 'removeSeeding'
  | 'removeStageEntries'
  | 'removeStructure'
  | 'removeSuspension'
  | 'removeTieMatchUpParticipantId'
  | 'removeTournamentExtension'
  | 'removeTournamentRecord'
  | 'removeUnlinkedTournamentRecords'
  | 'renameStructures'
  | 'reorderUpcomingMatchUps'
  | 'replaceTieMatchUpParticipantId'
  | 'reset'
  | 'resetAdHocMatchUps'
  | 'resetCompetitionState'
  | 'resetDrawDefinition'
  | 'resetMatchUpLineUps'
  | 'resetQualifyingStructure'
  | 'resetScorecard'
  | 'resetTieFormat'
  | 'resetVoluntaryConsolationStructure'
  | 'resolveCourtId'
  | 'resolveDraftPositions'
  | 'resolvePointValue'
  | 'resolveStatus'
  | 'resolveVenueId'
  | 'reverseScore'
  | 'runValidationPipeline'
  | 'sampleCapacityCurve'
  | 'saveDrawDeletions'
  | 'scaledTeamAssignment'
  | 'scheduleMatchUps'
  | 'scheduleProfileGrid'
  | 'scheduleProfileRounds'
  | 'schemaWriteMode'
  | 'ScoringEngine'
  | 'seedWithdrawalCascade'
  | 'setDelegatedOutcome'
  | 'setDrawParticipantRepresentativeIds'
  | 'setDrawPositionPreferences'
  | 'setEntryPosition'
  | 'setEntryPositions'
  | 'setEventDates'
  | 'setEventDisplay'
  | 'setEventEndDate'
  | 'setEventStartDate'
  | 'setMatchUpCalledAt'
  | 'setMatchUpDailyLimits'
  | 'setMatchUpFormat'
  | 'setMatchUpHomeParticipantId'
  | 'setMatchUpState'
  | 'setMatchUpStatus'
  | 'setOrderOfFinish'
  | 'setParticipantScaleItem'
  | 'setParticipantScaleItems'
  | 'setPositionAssignments'
  | 'setPracticeDefaultCapacity'
  | 'setRegistrationProfile'
  | 'setSchedulingProfile'
  | 'setState'
  | 'setStructureOrder'
  | 'setSubOrder'
  | 'setTournamentCategories'
  | 'setTournamentDates'
  | 'setTournamentEndDate'
  | 'setTournamentId'
  | 'setTournamentLocalTimeZone'
  | 'setTournamentName'
  | 'setTournamentNotes'
  | 'setTournamentRecord'
  | 'setTournamentStartDate'
  | 'setTournamentStatus'
  | 'setTournamentTier'
  | 'shiftAdHocRounds'
  | 'shotParser'
  | 'shotSplitter'
  | 'snapIsoToGranularity'
  | 'snapToGranularity'
  | 'sortBlocksByStart'
  | 'sortEdges'
  | 'stringify'
  | 'stringifyMatchUpFormat'
  | 'substituteParticipant'
  | 'suggestFormatPlans'
  | 'swapAdHocRounds'
  | 'swapDrawPositionAssignments'
  | 'tallyParticipantResults'
  | 'tieFormatGenderValidityCheck'
  | 'timeInsideBlock'
  | 'todsAvailabilityToBlocks'
  | 'toggleParticipantCheckInState'
  | 'toStatObjects'
  | 'tournamentMatchUps'
  | 'transitionAssignmentStatus'
  | 'transitionCertificationStatus'
  | 'transitionEvaluationStatus'
  | 'unlinkTournament'
  | 'unlinkTournaments'
  | 'unPublishEvent'
  | 'unPublishEventSeeding'
  | 'unPublishOrderOfPlay'
  | 'unPublishParticipants'
  | 'updateDrawIdsOrder'
  | 'updateParticipantResults'
  | 'updatePracticeRegistration'
  | 'updateTeamLineUp'
  | 'updateTieMatchUpScore'
  | 'validateCategory'
  | 'validateCertification'
  | 'validateCollectionDefinition'
  | 'validateDateAvailability'
  | 'validateLineUp'
  | 'validateMatchUp'
  | 'validateMatchUpScore'
  | 'validateMCPMatch'
  | 'validateOfficiatingStatusTransition'
  | 'validatePlayoffGroups'
  | 'validateSchedulingProfile'
  | 'validateSchedulingProfileFormat'
  | 'validateScore'
  | 'validateSegments'
  | 'validateSet'
  | 'validateSetScore'
  | 'validateTieFormat'
  | 'validMatchUp'
  | 'validMatchUps'
  | 'venueDayKey'
  | 'venueKey'
  | 'version'
  | 'waitFor'
  | 'withdrawParticipantAtDrawPosition';

export const FACTORY_ENGINE_METHODS: readonly FactoryEngineMethod[] = [
  'abandonTournamentMatchUps',
  'addAdHocMatchUps',
  'addCertification',
  'addCertificationRequirement',
  'addCollectionDefinition',
  'addCollectionGroup',
  'addCourt',
  'addCourtGridBooking',
  'addCourts',
  'addDrawDefinition',
  'addDrawDefinitionExtension',
  'addDrawDefinitionTimeItem',
  'addDrawEntries',
  'addDynamicRatings',
  'addEvaluation',
  'addEvaluationPolicy',
  'addEvent',
  'addEventEntries',
  'addEventEntryPairs',
  'addEventExtension',
  'addEventTimeItem',
  'addExtension',
  'addFinishingRounds',
  'addFlight',
  'addGoesTo',
  'addIndividualParticipantIds',
  'addLinkedConsolationStructure',
  'addMatchUpCourtOrder',
  'addMatchUpEndTime',
  'addMatchUpOfficial',
  'addMatchUpResumeTime',
  'addMatchUpScheduledDate',
  'addMatchUpScheduledTime',
  'addMatchUpScheduleItems',
  'addMatchUpStartTime',
  'addMatchUpStopTime',
  'addMutationLock',
  'addNotes',
  'addOnlineResource',
  'addParticipant',
  'addParticipantExtension',
  'addParticipants',
  'addParticipantTimeItem',
  'addPenalty',
  'addPersonOtherId',
  'addPersonRequests',
  'addPersons',
  'addPlayoffStructures',
  'addPoint',
  'addPracticeRegistration',
  'addQualifyingStructure',
  'addSchedulingProfileRound',
  'addSuspension',
  'addTimeItem',
  'addTournamentExtension',
  'addTournamentTimeItem',
  'addVenue',
  'addVoluntaryConsolationStructure',
  'adHocPositionSwap',
  'aggregateTieFormats',
  'allCompetitionMatchUps',
  'allDrawMatchUps',
  'allEventMatchUps',
  'allocateTeamMatchUpCourts',
  'allPlayoffPositionsFilled',
  'allTournamentMatchUps',
  'alternateDrawPositionAssignment',
  'analyzeDraws',
  'analyzeMatchUp',
  'analyzeScore',
  'analyzeSequence',
  'analyzeSet',
  'analyzeTournament',
  'anonymizeTournamentRecord',
  'applyAvailabilityToTournamentRecord',
  'applyDerivedRankings',
  'applyLineUps',
  'applyTournamentRankingPoints',
  'assignDrawPosition',
  'assignDrawPositionBye',
  'assignMatchUpCourt',
  'assignMatchUpSideParticipant',
  'assignMatchUpVenue',
  'assignOfficial',
  'assignSeedPositions',
  'assignTieMatchUpParticipantId',
  'attachConsolationStructures',
  'attachFlightProfile',
  'attachPlayoffStructures',
  'attachPolicies',
  'attachQualifyingStructure',
  'attachStructures',
  'auditAuthorityServer',
  'automatedPlayoffPositioning',
  'automatedPositioning',
  'autoSeeding',
  'buildDayRange',
  'buildDrawHierarchy',
  'buildEdges',
  'buildReportContext',
  'buildSchedulingProfileFromUISelections',
  'bulkMatchUpStatusUpdate',
  'bulkRescheduleMatchUps',
  'bulkScheduleMatchUps',
  'bulkScheduleTournamentMatchUps',
  'bulkUpdateCourtAssignments',
  'bulkUpdatePublishedEventIds',
  'calculateCapacityStats',
  'calculateCourtHours',
  'calculateMatchStatistics',
  'calculateMatchUpMargin',
  'calculatePointsTo',
  'calculateScheduleTimes',
  'calculateWinCriteria',
  'categoryCanContain',
  'checkInParticipant',
  'checkMatchUpIsComplete',
  'checkOutParticipant',
  'checkScoreHasValue',
  'checkSetIsComplete',
  'checkValidEntries',
  'clampDragToCollisions',
  'clampToDayRange',
  'cleanExpiredMutationLocks',
  'clearMatchUpSchedule',
  'clearScheduledMatchUps',
  'compareCapacityCurves',
  'compareTieFormats',
  'competitionScheduleMatchUps',
  'completeDrawMatchUps',
  'computePlanItemId',
  'copyTournamentRecord',
  'courtDayKey',
  'courtGridRows',
  'courtKey',
  'createFollowByEvaluator',
  'createGroupParticipant',
  'createMatchUp',
  'createOfficialRecord',
  'createTeamsFromParticipantAttributes',
  'createTournamentRecord',
  'credits',
  'deduceMatchUpFormat',
  'deleteAdHocMatchUps',
  'deleteCourt',
  'deleteCourts',
  'deleteDrawDefinitions',
  'deleteEvents',
  'deleteFlightAndFlightDraw',
  'deleteFlightProfileAndFlightDraws',
  'deleteParticipants',
  'deleteVenue',
  'deleteVenues',
  'deriveRailSegments',
  'destroyPairEntries',
  'destroyPairEntry',
  'devContext',
  'diffMinutes',
  'disableCourts',
  'disableTieAutoCalc',
  'disableVenues',
  'drawMatchUps',
  'drawMatic',
  'dryRun',
  'enableCourts',
  'enableTieAutoCalc',
  'enableVenues',
  'enrichPointHistory',
  'EvaluatorRegistry',
  'eventMatchUps',
  'execute',
  'executionQueue',
  'explain',
  'exportMatchUpJSON',
  'extractDay',
  'filterCapacityCurve',
  'filterMatchUps',
  'filterParticipants',
  'findBlocksContainingTime',
  'findDrawDefinition',
  'findExtension',
  'findMatchUp',
  'findMatchUpFormatTiming',
  'findParticipant',
  'findPolicy',
  'findVenue',
  'formatConflicts',
  'generateAdHocMatchUps',
  'generateAdHocRounds',
  'generateAndPopulatePlayoffStructures',
  'generateBookings',
  'generateCapacityCurve',
  'generateConsolationStructure',
  'generateCourts',
  'generateDrawDefinition',
  'generateDrawMaticRound',
  'generateDrawStructuresAndLinks',
  'generateDrawTypeAndModifyDrawDefinition',
  'generateEventsFromTieFormat',
  'generateEventWithDraw',
  'generateFlightProfile',
  'generateLineUps',
  'generateOutcome',
  'generateOutcomeFromScoreString',
  'generateParticipants',
  'generateQualifyingStructure',
  'generateRankingList',
  'generateReport',
  'generateScoreString',
  'generateSeedingScaleItems',
  'generateStatCrew',
  'generateSwissRound',
  'generateTieMatchUpScore',
  'generateTournamentRecord',
  'generateVirtualCourts',
  'generateVoluntaryConsolation',
  'getAggregateTeamResults',
  'getAllDrawMatchUps',
  'getAllEventData',
  'getAllowedDrawTypes',
  'getAllowedMatchUpFormats',
  'getAllStructureMatchUps',
  'getApplicableAwardProfileLevels',
  'getAppliedPolicies',
  'getAssignedParticipantIds',
  'getAuditAuthorityServer',
  'getAvailableMatchUpsCount',
  'getAvailablePlayoffProfiles',
  'getAvailableReports',
  'getAwardPoints',
  'getAwardProfile',
  'getCategoryAgeDetails',
  'getCheckedInParticipantIds',
  'getCompetitionDateRange',
  'getCompetitionFormat',
  'getCompetitionLeaderboard',
  'getCompetitionMatchUps',
  'getCompetitionParticipants',
  'getCompetitionParticipantState',
  'getCompetitionPenalties',
  'getCompetitionPolicy',
  'getCompetitionState',
  'getCompetitionVenues',
  'getCourtInfo',
  'getCourts',
  'getDevContext',
  'getDraftState',
  'getDrawCompleteness',
  'getDrawData',
  'getDrawDefinitionTimeItem',
  'getDrawInconsistencies',
  'getDrawParticipantRepresentativeIds',
  'getDrawStructures',
  'getDrawTypeCoercion',
  'getEligibleVoluntaryConsolationParticipants',
  'getEntriesAndSeedsCount',
  'getEntryStatusReports',
  'getEpisodes',
  'getEvaluations',
  'getEvaluationSummary',
  'getEvaluationTemplate',
  'getEvent',
  'getEventCompleteness',
  'getEventData',
  'getEventInconsistencies',
  'getEventMatchUpFormatTiming',
  'getEventProperties',
  'getEventPublishStatus',
  'getEventRankingPoints',
  'getEvents',
  'getEventStructures',
  'getEventTimeItem',
  'getFlightProfile',
  'getHighestSeverity',
  'getHomeParticipantId',
  'getLinkedTournamentIds',
  'getLuckyDrawRoundStatus',
  'getMatchUpCompetitiveProfile',
  'getMatchUpContextIds',
  'getMatchUpDailyLimits',
  'getMatchUpDailyLimitsUpdate',
  'getMatchUpDependencies',
  'getMatchUpFormat',
  'getMatchUpFormatTiming',
  'getMatchUpFormatTimingUpdate',
  'getMatchUpFormatVariance',
  'getMatchUpScheduleDetails',
  'getMatchUpsMap',
  'getMatchUpsStats',
  'getMatchUpsToSchedule',
  'getMatchUpType',
  'getMaxEntryPosition',
  'getModifiedMatchUpFormatTiming',
  'getMutationLocks',
  'getOfficialAssignments',
  'getOfficialCertifications',
  'getOfficialEligibility',
  'getPairedParticipant',
  'getParticipantEventDetails',
  'getParticipantIdFinishingPositions',
  'getParticipantMembership',
  'getParticipantPaymentStatus',
  'getParticipantPoints',
  'getParticipantResults',
  'getParticipants',
  'getParticipantScaleItem',
  'getParticipantSchedules',
  'getParticipantSignInStatus',
  'getParticipantStats',
  'getParticipantTimeItem',
  'getPersonRequests',
  'getPolicyDefinitions',
  'getPositionAssignments',
  'getPositionsPlayedOff',
  'getPracticeRegistrations',
  'getPredictiveAccuracy',
  'getProfileRounds',
  'getPublishState',
  'getQualityWinPoints',
  'getQuickStats',
  'getRandomQualifierList',
  'getRegistrationProfile',
  'getRoundMatchUps',
  'getRounds',
  'getRoundVisibilityState',
  'getSaveDrawDeletions',
  'getScaledEntries',
  'getScaleValues',
  'getScheduledRoundsDetails',
  'getSchedulingProfile',
  'getSchedulingProfileIssues',
  'getSchemaWriteMode',
  'getScore',
  'getScoreboard',
  'getSeedingThresholds',
  'getSeedsCount',
  'getSetComplement',
  'getSetScoreString',
  'getState',
  'getStructureCompleteness',
  'getStructureInconsistencies',
  'getStructureReports',
  'getStructureSeedAssignments',
  'getSwissChart',
  'getSwissStandings',
  'getTally',
  'getTeamLineUp',
  'getTiebreakComplement',
  'getTieFormat',
  'getTimeItem',
  'getTournament',
  'getTournamentCompleteness',
  'getTournamentId',
  'getTournamentIds',
  'getTournamentInconsistencies',
  'getTournamentInfo',
  'getTournamentPenalties',
  'getTournamentPersons',
  'getTournamentPointAwards',
  'getTournamentPoints',
  'getTournamentPublishStatus',
  'getTournamentStructures',
  'getTournamentTimeItem',
  'getValidGroupSizes',
  'getVenueData',
  'getVenuesAndCourts',
  'getVenuesReport',
  'getWinner',
  'groupByMatch',
  'groupConflictsBySeverity',
  'hasLuckyRounds',
  'hhmmToMinutes',
  'hydrateTournamentRecord',
  'importMethods',
  'inferServeSide',
  'initializeCompetitionState',
  'initializeDraft',
  'inspect',
  'intervalsOverlap',
  'isAdHoc',
  'isAggregateFormat',
  'isComplete',
  'isCompletedStructure',
  'isEmbargoed',
  'isValid',
  'isValidForQualifying',
  'isValidMatchUpFormat',
  'isVisiblyPublished',
  'iterateDayTicks',
  'keyValueScore',
  'linkTournaments',
  'luckyDrawAdvancement',
  'luckyLoserDrawPositionAssignment',
  'matchUpActions',
  'matchUpScheduleChange',
  'mcpValidator',
  'mergeAdjacentSegments',
  'mergeOverlappingAvailability',
  'mergeParticipants',
  'migrateTournamentRecord',
  'minutesToHhmm',
  'modifyCertification',
  'modifyCollectionDefinition',
  'modifyCourt',
  'modifyCourtAvailability',
  'modifyDrawDefinition',
  'modifyDrawName',
  'modifyEntriesStatus',
  'modifyEvaluation',
  'modifyEvent',
  'modifyEventEntries',
  'modifyEventMatchUpFormatTiming',
  'modifyIndividualParticipantIds',
  'modifyMatchUpFormatTiming',
  'modifyPairAssignment',
  'modifyParticipant',
  'modifyParticipantName',
  'modifyParticipantOtherName',
  'modifyParticipantsPaymentStatus',
  'modifyParticipantsSignInStatus',
  'modifyPenalty',
  'modifyPersonRequests',
  'modifySeedAssignment',
  'modifyTieFormat',
  'modifyTournamentRecord',
  'modifyVenue',
  'newTournamentRecord',
  'off',
  'on',
  'once',
  'orderCollectionDefinitions',
  'overlappingRange',
  'parse',
  'parseCSV',
  'parseMatchUpFormat',
  'parseMCPPoint',
  'parseScoreString',
  'participantScaleItem',
  'participantScheduledMatchUps',
  'pbpValidator',
  'pointParser',
  'positionActions',
  'predictDrawCompetitiveBands',
  'predictMatchUpCompetitiveBands',
  'proAutoSchedule',
  'processCompetitionMatchUp',
  'processCompetitionRound',
  'proColumnResolve',
  'proConflicts',
  'promoteAlternate',
  'promoteAlternates',
  'pruneDrawDefinition',
  'publicFindCourt',
  'publicFindVenue',
  'publishEvent',
  'publishEventSeeding',
  'publishOrderOfPlay',
  'publishParticipants',
  'qualifierDrawPositionAssignment',
  'qualifierProgression',
  'queryOfficialRecord',
  'railsToDateAvailability',
  'rangesOverlap',
  'refreshEventDrawOrder',
  'regenerateParticipantNames',
  'remapDrawDefinitionMatchUpIds',
  'removeCertification',
  'removeCollectionDefinition',
  'removeCollectionGroup',
  'removeCourtGridBooking',
  'removeDelegatedOutcome',
  'removeDrawDefinitionExtension',
  'removeDrawEntries',
  'removeDrawPositionAssignment',
  'removeEvaluation',
  'removeEventEntries',
  'removeEventExtension',
  'removeEventMatchUpFormatTiming',
  'removeExtension',
  'removeIndividualParticipantIds',
  'removeMatchUpCourtAssignment',
  'removeMatchUpOutcome',
  'removeMatchUpSideParticipant',
  'removeMutationLock',
  'removeNotes',
  'removeOfficialAssignment',
  'removeOnlineResource',
  'removeOrphanedTieFormats',
  'removeParticipantExtension',
  'removeParticipantIdsFromAllTeams',
  'removePenalty',
  'removePersonRequests',
  'removePolicy',
  'removePracticeRegistration',
  'removeRatings',
  'removeRoundMatchUps',
  'removeScaleValues',
  'removeSeededParticipant',
  'removeSeeding',
  'removeStageEntries',
  'removeStructure',
  'removeSuspension',
  'removeTieMatchUpParticipantId',
  'removeTournamentExtension',
  'removeTournamentRecord',
  'removeUnlinkedTournamentRecords',
  'renameStructures',
  'reorderUpcomingMatchUps',
  'replaceTieMatchUpParticipantId',
  'reset',
  'resetAdHocMatchUps',
  'resetCompetitionState',
  'resetDrawDefinition',
  'resetMatchUpLineUps',
  'resetQualifyingStructure',
  'resetScorecard',
  'resetTieFormat',
  'resetVoluntaryConsolationStructure',
  'resolveCourtId',
  'resolveDraftPositions',
  'resolvePointValue',
  'resolveStatus',
  'resolveVenueId',
  'reverseScore',
  'runValidationPipeline',
  'sampleCapacityCurve',
  'saveDrawDeletions',
  'scaledTeamAssignment',
  'scheduleMatchUps',
  'scheduleProfileGrid',
  'scheduleProfileRounds',
  'schemaWriteMode',
  'ScoringEngine',
  'seedWithdrawalCascade',
  'setDelegatedOutcome',
  'setDrawParticipantRepresentativeIds',
  'setDrawPositionPreferences',
  'setEntryPosition',
  'setEntryPositions',
  'setEventDates',
  'setEventDisplay',
  'setEventEndDate',
  'setEventStartDate',
  'setMatchUpCalledAt',
  'setMatchUpDailyLimits',
  'setMatchUpFormat',
  'setMatchUpHomeParticipantId',
  'setMatchUpState',
  'setMatchUpStatus',
  'setOrderOfFinish',
  'setParticipantScaleItem',
  'setParticipantScaleItems',
  'setPositionAssignments',
  'setPracticeDefaultCapacity',
  'setRegistrationProfile',
  'setSchedulingProfile',
  'setState',
  'setStructureOrder',
  'setSubOrder',
  'setTournamentCategories',
  'setTournamentDates',
  'setTournamentEndDate',
  'setTournamentId',
  'setTournamentLocalTimeZone',
  'setTournamentName',
  'setTournamentNotes',
  'setTournamentRecord',
  'setTournamentStartDate',
  'setTournamentStatus',
  'setTournamentTier',
  'shiftAdHocRounds',
  'shotParser',
  'shotSplitter',
  'snapIsoToGranularity',
  'snapToGranularity',
  'sortBlocksByStart',
  'sortEdges',
  'stringify',
  'stringifyMatchUpFormat',
  'substituteParticipant',
  'suggestFormatPlans',
  'swapAdHocRounds',
  'swapDrawPositionAssignments',
  'tallyParticipantResults',
  'tieFormatGenderValidityCheck',
  'timeInsideBlock',
  'todsAvailabilityToBlocks',
  'toggleParticipantCheckInState',
  'toStatObjects',
  'tournamentMatchUps',
  'transitionAssignmentStatus',
  'transitionCertificationStatus',
  'transitionEvaluationStatus',
  'unlinkTournament',
  'unlinkTournaments',
  'unPublishEvent',
  'unPublishEventSeeding',
  'unPublishOrderOfPlay',
  'unPublishParticipants',
  'updateDrawIdsOrder',
  'updateParticipantResults',
  'updatePracticeRegistration',
  'updateTeamLineUp',
  'updateTieMatchUpScore',
  'validateCategory',
  'validateCertification',
  'validateCollectionDefinition',
  'validateDateAvailability',
  'validateLineUp',
  'validateMatchUp',
  'validateMatchUpScore',
  'validateMCPMatch',
  'validateOfficiatingStatusTransition',
  'validatePlayoffGroups',
  'validateSchedulingProfile',
  'validateSchedulingProfileFormat',
  'validateScore',
  'validateSegments',
  'validateSet',
  'validateSetScore',
  'validateTieFormat',
  'validMatchUp',
  'validMatchUps',
  'venueDayKey',
  'venueKey',
  'version',
  'waitFor',
  'withdrawParticipantAtDrawPosition',
] as const;
