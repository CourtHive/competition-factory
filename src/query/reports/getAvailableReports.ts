import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { ReportAvailability } from '@Types/reportTypes';
import { Tournament } from '@Types/tournamentTypes';

import {
  COMPETITIVENESS_REPORT,
  DRAW_REVISIONS_REPORT,
  ENTRY_STATUS_REPORT,
  MATCH_RESULTS_REPORT,
  MATCHUP_STATUS_REPORT,
  MUTATION_LOG_REPORT,
  PARTICIPANT_RESULTS_REPORT,
  PARTICIPANT_STATS_REPORT,
  POSITION_CHANGES_REPORT,
  SCHEDULING_CHURN_REPORT,
  SEEDING_PERFORMANCE_REPORT,
  STRUCTURE_REPORT,
  VENUE_UTILIZATION_REPORT,
  REPORT_CATEGORIES,
  REPORT_SOURCE,
} from '@Constants/reportConstants';

const REPORT_REGISTRY = [
  {
    reportId: ENTRY_STATUS_REPORT,
    name: 'Entry Status Report',
    description: 'Entry statuses and participant details across all events and draws',
    category: REPORT_CATEGORIES.ENTRIES,
  },
  {
    reportId: STRUCTURE_REPORT,
    name: 'Draw Structure Report',
    description: 'Draw structures with size, matchUp counts, winners, and seeding basis',
    category: REPORT_CATEGORIES.DRAWS,
  },
  {
    reportId: MATCH_RESULTS_REPORT,
    name: 'Match Results',
    description: 'All completed match results by round with scores',
    category: REPORT_CATEGORIES.MATCHUPS,
  },
  {
    reportId: MATCHUP_STATUS_REPORT,
    name: 'MatchUp Status Summary',
    description: 'Completed, walkovers, defaults, and retirements aggregated by event',
    category: REPORT_CATEGORIES.MATCHUPS,
  },
  {
    reportId: COMPETITIVENESS_REPORT,
    name: 'Match Competitiveness',
    description: 'Competitive profile of each match — decisive, routine, or competitive',
    category: REPORT_CATEGORIES.MATCHUPS,
  },
  {
    reportId: PARTICIPANT_RESULTS_REPORT,
    name: 'Participant Results',
    description: 'Per-participant wins, losses, sets, and games across all events',
    category: REPORT_CATEGORIES.PARTICIPANTS,
  },
  {
    reportId: SEEDING_PERFORMANCE_REPORT,
    name: 'Seeding Performance',
    description: 'Seeded participants — expected vs actual finishing position',
    category: REPORT_CATEGORIES.PARTICIPANTS,
  },
  {
    reportId: PARTICIPANT_STATS_REPORT,
    name: 'Team Statistics',
    description: 'Team participant win/loss statistics across matchUps, sets, games, and tiebreaks',
    category: REPORT_CATEGORIES.PARTICIPANTS,
  },
  {
    reportId: VENUE_UTILIZATION_REPORT,
    name: 'Venue Utilization',
    description: 'Court availability and scheduling utilization by venue and date',
    category: REPORT_CATEGORIES.SCHEDULING,
  },
  {
    reportId: MUTATION_LOG_REPORT,
    name: 'Mutation Log',
    description: 'Chronological log of all server mutations with user attribution',
    category: REPORT_CATEGORIES.AUDIT,
    source: REPORT_SOURCE.SERVER,
  },
  {
    reportId: DRAW_REVISIONS_REPORT,
    name: 'Draw Revision History',
    description: 'Timeline of draw changes — position assignments, seeding, generation',
    category: REPORT_CATEGORIES.AUDIT,
    source: REPORT_SOURCE.SERVER,
  },
  {
    reportId: SCHEDULING_CHURN_REPORT,
    name: 'Scheduling Churn',
    description: 'Scheduling changes — bulk schedules, reschedules, clears',
    category: REPORT_CATEGORIES.AUDIT,
    source: REPORT_SOURCE.SERVER,
  },
  {
    reportId: POSITION_CHANGES_REPORT,
    name: 'Position Changes',
    description: 'Draw position assignment changes over time',
    category: REPORT_CATEGORIES.AUDIT,
    source: REPORT_SOURCE.SERVER,
  },
];

type GetAvailableReportsArgs = {
  tournamentRecord: Tournament;
};

export function getAvailableReports({
  tournamentRecord,
}: GetAvailableReportsArgs): { availableReports: ReportAvailability[] } | { error: any } {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const hasEvents = (tournamentRecord.events?.length ?? 0) > 0;
  const hasVenues = (tournamentRecord.venues?.length ?? 0) > 0;
  const hasCompletedDraws = (tournamentRecord.events ?? []).some((e: any) =>
    (e.drawDefinitions ?? []).some((d: any) =>
      (d.structures ?? []).some((s: any) => (s.positionAssignments ?? []).length > 0),
    ),
  );
  const hasSeededParticipants = (tournamentRecord.events ?? []).some((e: any) =>
    (e.drawDefinitions ?? []).some((d: any) =>
      (d.structures ?? []).some((s: any) => (s.seedAssignments ?? []).length > 0),
    ),
  );
  const hasTeamParticipants = (tournamentRecord.participants ?? []).some(
    (p: any) => p.participantType === TEAM_PARTICIPANT,
  );

  const computableMap: Record<string, boolean> = {
    [ENTRY_STATUS_REPORT]: hasEvents,
    [STRUCTURE_REPORT]: hasEvents,
    [MATCH_RESULTS_REPORT]: hasCompletedDraws,
    [MATCHUP_STATUS_REPORT]: hasCompletedDraws,
    [COMPETITIVENESS_REPORT]: hasCompletedDraws,
    [PARTICIPANT_RESULTS_REPORT]: hasCompletedDraws,
    [SEEDING_PERFORMANCE_REPORT]: hasSeededParticipants,
    [PARTICIPANT_STATS_REPORT]: hasTeamParticipants,
    [VENUE_UTILIZATION_REPORT]: hasVenues,
    // Audit reports are always listed; TMX checks server connectivity
    [MUTATION_LOG_REPORT]: true,
    [DRAW_REVISIONS_REPORT]: true,
    [SCHEDULING_CHURN_REPORT]: true,
    [POSITION_CHANGES_REPORT]: true,
  };

  const availableReports = REPORT_REGISTRY.map((def) => ({
    ...def,
    computableNow: computableMap[def.reportId] ?? false,
  }));

  return { availableReports };
}
