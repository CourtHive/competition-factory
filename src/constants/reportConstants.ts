export const ENTRY_STATUS_REPORT = 'entries.entryStatus';
export const STRUCTURE_REPORT = 'structure.drawReport';
export const PARTICIPANT_STATS_REPORT = 'participant.teamStats';
export const PARTICIPANT_RESULTS_REPORT = 'participant.results';
export const VENUE_UTILIZATION_REPORT = 'venue.utilization';
export const MATCH_RESULTS_REPORT = 'matchUp.results';
export const MATCHUP_STATUS_REPORT = 'matchUp.statusSummary';
export const SEEDING_PERFORMANCE_REPORT = 'participant.seedingPerformance';
export const COMPETITIVENESS_REPORT = 'matchUp.competitiveness';
export const CALL_TIMING_VARIANCE_REPORT = 'scheduling.callTimingVariance';

// Phase 4: Audit-trail reports (server-sourced, not computable from tournament record)
export const DRAW_REVISIONS_REPORT = 'audit.drawRevisions';
export const SCHEDULING_CHURN_REPORT = 'audit.schedulingChurn';
export const MUTATION_LOG_REPORT = 'audit.mutationLog';
export const POSITION_CHANGES_REPORT = 'audit.positionChanges';

export const REPORT_CATEGORIES = {
  ENTRIES: 'Entries',
  DRAWS: 'Draws',
  MATCHUPS: 'MatchUps',
  PARTICIPANTS: 'Participants',
  SCHEDULING: 'Scheduling',
  AUDIT: 'Audit',
} as const;

export const REPORT_SOURCE = {
  FACTORY: 'factory',
  SERVER: 'server',
} as const;
