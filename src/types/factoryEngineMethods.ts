/**
 * AUTO-GENERATED — do not edit by hand.
 * Source: src/tests/engines/syncEngine + src/assemblies/governors
 * Regenerate: pnpm gen:engine-methods
 * Drift guard:  pnpm check:engine-methods
 */
export type FactoryEngineMethod =
  | 'abandonTournamentMatchUps'
  | 'acceptChallenge'
  | 'activateFromSanctioning'
  | 'addAdHocMatchUps'
  | 'addCertification'
  | 'addCertificationRequirement'
  | 'addCollectionDefinition'
  | 'addCollectionGroup'
  | 'addConflictDeclaration'
  | 'addCourt'
  | 'addCourtGridBooking'
  | 'addCourts'
  | 'addDrawDefinition'
  | 'addDrawDefinitionExtension'
  | 'addDrawDefinitionTimeItem'
  | 'addDrawEntries'
  | 'addDrawOtherId'
  | 'addDynamicRatings'
  | 'addEvaluation'
  | 'addEvaluationPolicy'
  | 'addEvent'
  | 'addEventEntries'
  | 'addEventEntryPairs'
  | 'addEventExtension'
  | 'addEventProposal'
  | 'addEventTimeItem'
  | 'addExtension'
  | 'addFinishingRounds'
  | 'addFlight'
  | 'addGoesTo'
  | 'addIndividualParticipantIds'
  | 'addLadderParticipant'
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
  | 'addParticipantOtherId'
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
  | 'addReviewNote'
  | 'addScheduleScenario'
  | 'addSchedulingProfileRound'
  | 'addSuspension'
  | 'addTimeItem'
  | 'addTournamentExtension'
  | 'addTournamentOtherId'
  | 'addTournamentTimeItem'
  | 'addVenue'
  | 'addVenueOtherId'
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
  | 'applyLadderMovement'
  | 'applyLineUps'
  | 'applyScheduleScenario'
  | 'applyTournamentRankingPoints'
  | 'approveApplication'
  | 'assignDrawPosition'
  | 'assignDrawPositionBye'
  | 'assignMatchUpCourt'
  | 'assignMatchUpScorekeeper'
  | 'assignMatchUpSideParticipant'
  | 'assignMatchUpTimekeeper'
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
  | 'cast'
  | 'categoryCanContain'
  | 'checkComplianceDeadlines'
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
  | 'closeApplication'
  | 'compareCapacityCurves'
  | 'compareTieFormats'
  | 'competitionScheduleMatchUps'
  | 'completeDrawMatchUps'
  | 'computePlanItemId'
  | 'conditionallyApprove'
  | 'confirmResult'
  | 'copyTournamentRecord'
  | 'courtDayKey'
  | 'courtGridRows'
  | 'courtKey'
  | 'createFollowByEvaluator'
  | 'createGroupParticipant'
  | 'createMatchUp'
  | 'createOfficialRecord'
  | 'createSanctioningRecord'
  | 'createTeamsFromParticipantAttributes'
  | 'createTournamentRecord'
  | 'credits'
  | 'declineChallenge'
  | 'declineEndorsement'
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
  | 'disputeResult'
  | 'drawMatchUps'
  | 'drawMatic'
  | 'dryRun'
  | 'enableCourts'
  | 'enableTieAutoCalc'
  | 'enableVenues'
  | 'endorseApplication'
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
  | 'flagComplianceIssues'
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
  | 'getAvailableTransitions'
  | 'getAwardPoints'
  | 'getAwardProfile'
  | 'getCalendarConflicts'
  | 'getCategoryAgeDetails'
  | 'getChallengeState'
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
  | 'getCompetitiveProfile'
  | 'getCompleteness'
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
  | 'getEffectiveRegistrationProfile'
  | 'getEligibleEvents'
  | 'getEligibleTiers'
  | 'getEligibleVoluntaryConsolationParticipants'
  | 'getEntriesAndSeedsCount'
  | 'getEntryFeeRange'
  | 'getEntryStatusReports'
  | 'getEpisodes'
  | 'getEvaluations'
  | 'getEvaluationSummary'
  | 'getEvaluationTemplate'
  | 'getEvent'
  | 'getEventCompleteness'
  | 'getEventData'
  | 'getEventEntryFees'
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
  | 'getLadderMovement'
  | 'getLadderOrdering'
  | 'getLadderPolicy'
  | 'getLadderStanding'
  | 'getLapses'
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
  | 'getMatchUpOfficialConflicts'
  | 'getMatchUpRatingDelta'
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
  | 'getOfficialConflicts'
  | 'getOfficialEligibility'
  | 'getPairedParticipant'
  | 'getParticipantEligibility'
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
  | 'getParticipation'
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
  | 'getResultAttestation'
  | 'getRoundMatchUps'
  | 'getRounds'
  | 'getRoundVisibilityState'
  | 'getSaveDrawDeletions'
  | 'getScaledEntries'
  | 'getScaleValues'
  | 'getScenarioScheduleProjection'
  | 'getScenarioScheduleView'
  | 'getScheduledRoundsDetails'
  | 'getScheduleProjection'
  | 'getScheduleScenario'
  | 'getScheduleScenarios'
  | 'getScheduleScenarioStatus'
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
  | 'getStatusHistory'
  | 'getStructureCompleteness'
  | 'getStructureData'
  | 'getStructureInconsistencies'
  | 'getStructureReports'
  | 'getStructureSeedAssignments'
  | 'getSwissChart'
  | 'getSwissStandings'
  | 'getTally'
  | 'getTeamLineUp'
  | 'getTiebreakComplement'
  | 'getTieFormat'
  | 'getTierMovement'
  | 'getTimeItem'
  | 'getTournament'
  | 'getTournamentActionableMatchUps'
  | 'getTournamentCalendarEntry'
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
  | 'getTournamentTimeZone'
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
  | 'isChallengeInRange'
  | 'isComplete'
  | 'isCompletedStructure'
  | 'isEmbargoed'
  | 'isIndeterminateFee'
  | 'isScheduleLocked'
  | 'issueChallenge'
  | 'isValid'
  | 'isValidForQualifying'
  | 'isValidMatchUpFormat'
  | 'isValidSeedPosition'
  | 'isVisiblyPublished'
  | 'iterateDayTicks'
  | 'keyValueScore'
  | 'linkTournaments'
  | 'luckyDrawAdvancement'
  | 'luckyLoserDrawPositionAssignment'
  | 'matchUpActions'
  | 'matchUpScheduleChange'
  | 'matchUpScheduleLocked'
  | 'mcpValidator'
  | 'meetCondition'
  | 'mergeAdjacentSegments'
  | 'mergeFacilitySchedule'
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
  | 'openProposalRegistration'
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
  | 'proposeAmendment'
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
  | 'querySanctioningRecord'
  | 'railsToDateAvailability'
  | 'rangesOverlap'
  | 'rebaseScheduleScenario'
  | 'refreshEventDrawOrder'
  | 'refreshLadderRatings'
  | 'regenerateParticipantNames'
  | 'rejectApplication'
  | 'remapDrawDefinitionMatchUpIds'
  | 'removeCertification'
  | 'removeCollectionDefinition'
  | 'removeCollectionGroup'
  | 'removeConflictDeclaration'
  | 'removeCourtGridBooking'
  | 'removeDelegatedOutcome'
  | 'removeDrawDefinitionExtension'
  | 'removeDrawEntries'
  | 'removeDrawPositionAssignment'
  | 'removeEvaluation'
  | 'removeEventEntries'
  | 'removeEventExtension'
  | 'removeEventMatchUpFormatTiming'
  | 'removeEventProposal'
  | 'removeExtension'
  | 'removeIndividualParticipantIds'
  | 'removeLadderParticipant'
  | 'removeMatchUpCourtAssignment'
  | 'removeMatchUpOutcome'
  | 'removeMatchUpScorekeeper'
  | 'removeMatchUpSideParticipant'
  | 'removeMatchUpTimekeeper'
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
  | 'removeScheduleScenario'
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
  | 'requestEndorsement'
  | 'requestModification'
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
  | 'resolveEntryFee'
  | 'resolvePointValue'
  | 'resolveStatus'
  | 'resolveVenueId'
  | 'reverseScore'
  | 'reviewAmendment'
  | 'reviewApplication'
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
  | 'setDrawOtherIds'
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
  | 'setMatchUpScheduleLock'
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
  | 'setTournamentOtherIds'
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
  | 'submitApplication'
  | 'submitComplianceItem'
  | 'submitResult'
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
  | 'transitionToPostEvent'
  | 'unlinkTournament'
  | 'unlinkTournaments'
  | 'unPublishEvent'
  | 'unPublishEventSeeding'
  | 'unPublishOrderOfPlay'
  | 'unPublishParticipants'
  | 'updateDrawIdsOrder'
  | 'updateEventProposal'
  | 'updateParticipantResults'
  | 'updatePracticeRegistration'
  | 'updateProposal'
  | 'updateScheduleScenario'
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
  | 'validateProposal'
  | 'validateScheduleScenario'
  | 'validateSchedulingProfile'
  | 'validateSchedulingProfileFormat'
  | 'validateScore'
  | 'validateSegments'
  | 'validateSet'
  | 'validateSetScore'
  | 'validateStatusTransition'
  | 'validateTieFormat'
  | 'validMatchUp'
  | 'validMatchUps'
  | 'venueDayKey'
  | 'venueKey'
  | 'verifyComplianceItem'
  | 'version'
  | 'waitFor'
  | 'waiveComplianceItem'
  | 'withdrawApplication'
  | 'withdrawParticipantAtDrawPosition';

export const FACTORY_ENGINE_METHODS: readonly FactoryEngineMethod[] = [
  'abandonTournamentMatchUps',
  'acceptChallenge',
  'activateFromSanctioning',
  'addAdHocMatchUps',
  'addCertification',
  'addCertificationRequirement',
  'addCollectionDefinition',
  'addCollectionGroup',
  'addConflictDeclaration',
  'addCourt',
  'addCourtGridBooking',
  'addCourts',
  'addDrawDefinition',
  'addDrawDefinitionExtension',
  'addDrawDefinitionTimeItem',
  'addDrawEntries',
  'addDrawOtherId',
  'addDynamicRatings',
  'addEvaluation',
  'addEvaluationPolicy',
  'addEvent',
  'addEventEntries',
  'addEventEntryPairs',
  'addEventExtension',
  'addEventProposal',
  'addEventTimeItem',
  'addExtension',
  'addFinishingRounds',
  'addFlight',
  'addGoesTo',
  'addIndividualParticipantIds',
  'addLadderParticipant',
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
  'addParticipantOtherId',
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
  'addReviewNote',
  'addScheduleScenario',
  'addSchedulingProfileRound',
  'addSuspension',
  'addTimeItem',
  'addTournamentExtension',
  'addTournamentOtherId',
  'addTournamentTimeItem',
  'addVenue',
  'addVenueOtherId',
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
  'applyLadderMovement',
  'applyLineUps',
  'applyScheduleScenario',
  'applyTournamentRankingPoints',
  'approveApplication',
  'assignDrawPosition',
  'assignDrawPositionBye',
  'assignMatchUpCourt',
  'assignMatchUpScorekeeper',
  'assignMatchUpSideParticipant',
  'assignMatchUpTimekeeper',
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
  'cast',
  'categoryCanContain',
  'checkComplianceDeadlines',
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
  'closeApplication',
  'compareCapacityCurves',
  'compareTieFormats',
  'competitionScheduleMatchUps',
  'completeDrawMatchUps',
  'computePlanItemId',
  'conditionallyApprove',
  'confirmResult',
  'copyTournamentRecord',
  'courtDayKey',
  'courtGridRows',
  'courtKey',
  'createFollowByEvaluator',
  'createGroupParticipant',
  'createMatchUp',
  'createOfficialRecord',
  'createSanctioningRecord',
  'createTeamsFromParticipantAttributes',
  'createTournamentRecord',
  'credits',
  'declineChallenge',
  'declineEndorsement',
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
  'disputeResult',
  'drawMatchUps',
  'drawMatic',
  'dryRun',
  'enableCourts',
  'enableTieAutoCalc',
  'enableVenues',
  'endorseApplication',
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
  'flagComplianceIssues',
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
  'getAvailableTransitions',
  'getAwardPoints',
  'getAwardProfile',
  'getCalendarConflicts',
  'getCategoryAgeDetails',
  'getChallengeState',
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
  'getCompetitiveProfile',
  'getCompleteness',
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
  'getEffectiveRegistrationProfile',
  'getEligibleEvents',
  'getEligibleTiers',
  'getEligibleVoluntaryConsolationParticipants',
  'getEntriesAndSeedsCount',
  'getEntryFeeRange',
  'getEntryStatusReports',
  'getEpisodes',
  'getEvaluations',
  'getEvaluationSummary',
  'getEvaluationTemplate',
  'getEvent',
  'getEventCompleteness',
  'getEventData',
  'getEventEntryFees',
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
  'getLadderMovement',
  'getLadderOrdering',
  'getLadderPolicy',
  'getLadderStanding',
  'getLapses',
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
  'getMatchUpOfficialConflicts',
  'getMatchUpRatingDelta',
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
  'getOfficialConflicts',
  'getOfficialEligibility',
  'getPairedParticipant',
  'getParticipantEligibility',
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
  'getParticipation',
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
  'getResultAttestation',
  'getRoundMatchUps',
  'getRounds',
  'getRoundVisibilityState',
  'getSaveDrawDeletions',
  'getScaledEntries',
  'getScaleValues',
  'getScenarioScheduleProjection',
  'getScenarioScheduleView',
  'getScheduledRoundsDetails',
  'getScheduleProjection',
  'getScheduleScenario',
  'getScheduleScenarios',
  'getScheduleScenarioStatus',
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
  'getStatusHistory',
  'getStructureCompleteness',
  'getStructureData',
  'getStructureInconsistencies',
  'getStructureReports',
  'getStructureSeedAssignments',
  'getSwissChart',
  'getSwissStandings',
  'getTally',
  'getTeamLineUp',
  'getTiebreakComplement',
  'getTieFormat',
  'getTierMovement',
  'getTimeItem',
  'getTournament',
  'getTournamentActionableMatchUps',
  'getTournamentCalendarEntry',
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
  'getTournamentTimeZone',
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
  'isChallengeInRange',
  'isComplete',
  'isCompletedStructure',
  'isEmbargoed',
  'isIndeterminateFee',
  'isScheduleLocked',
  'issueChallenge',
  'isValid',
  'isValidForQualifying',
  'isValidMatchUpFormat',
  'isValidSeedPosition',
  'isVisiblyPublished',
  'iterateDayTicks',
  'keyValueScore',
  'linkTournaments',
  'luckyDrawAdvancement',
  'luckyLoserDrawPositionAssignment',
  'matchUpActions',
  'matchUpScheduleChange',
  'matchUpScheduleLocked',
  'mcpValidator',
  'meetCondition',
  'mergeAdjacentSegments',
  'mergeFacilitySchedule',
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
  'openProposalRegistration',
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
  'proposeAmendment',
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
  'querySanctioningRecord',
  'railsToDateAvailability',
  'rangesOverlap',
  'rebaseScheduleScenario',
  'refreshEventDrawOrder',
  'refreshLadderRatings',
  'regenerateParticipantNames',
  'rejectApplication',
  'remapDrawDefinitionMatchUpIds',
  'removeCertification',
  'removeCollectionDefinition',
  'removeCollectionGroup',
  'removeConflictDeclaration',
  'removeCourtGridBooking',
  'removeDelegatedOutcome',
  'removeDrawDefinitionExtension',
  'removeDrawEntries',
  'removeDrawPositionAssignment',
  'removeEvaluation',
  'removeEventEntries',
  'removeEventExtension',
  'removeEventMatchUpFormatTiming',
  'removeEventProposal',
  'removeExtension',
  'removeIndividualParticipantIds',
  'removeLadderParticipant',
  'removeMatchUpCourtAssignment',
  'removeMatchUpOutcome',
  'removeMatchUpScorekeeper',
  'removeMatchUpSideParticipant',
  'removeMatchUpTimekeeper',
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
  'removeScheduleScenario',
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
  'requestEndorsement',
  'requestModification',
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
  'resolveEntryFee',
  'resolvePointValue',
  'resolveStatus',
  'resolveVenueId',
  'reverseScore',
  'reviewAmendment',
  'reviewApplication',
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
  'setDrawOtherIds',
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
  'setMatchUpScheduleLock',
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
  'setTournamentOtherIds',
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
  'submitApplication',
  'submitComplianceItem',
  'submitResult',
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
  'transitionToPostEvent',
  'unlinkTournament',
  'unlinkTournaments',
  'unPublishEvent',
  'unPublishEventSeeding',
  'unPublishOrderOfPlay',
  'unPublishParticipants',
  'updateDrawIdsOrder',
  'updateEventProposal',
  'updateParticipantResults',
  'updatePracticeRegistration',
  'updateProposal',
  'updateScheduleScenario',
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
  'validateProposal',
  'validateScheduleScenario',
  'validateSchedulingProfile',
  'validateSchedulingProfileFormat',
  'validateScore',
  'validateSegments',
  'validateSet',
  'validateSetScore',
  'validateStatusTransition',
  'validateTieFormat',
  'validMatchUp',
  'validMatchUps',
  'venueDayKey',
  'venueKey',
  'verifyComplianceItem',
  'version',
  'waitFor',
  'waiveComplianceItem',
  'withdrawApplication',
  'withdrawParticipantAtDrawPosition',
] as const;
