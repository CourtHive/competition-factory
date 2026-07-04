import { wrapCallTimingVarianceReport } from './wrappers/wrapCallTimingVarianceReport';
import { wrapSeedingPerformanceReport } from './wrappers/wrapSeedingPerformanceReport';
import { wrapParticipantResultsReport } from './wrappers/wrapParticipantResultsReport';
import { wrapCompetitivenessReport } from './wrappers/wrapCompetitivenessReport';
import { wrapMatchUpStatusReport } from './wrappers/wrapMatchUpStatusReport';
import { wrapMatchResultsReport } from './wrappers/wrapMatchResultsReport';
import { wrapEntryStatusReport } from './wrappers/wrapEntryStatusReport';
import { wrapParticipantStats } from './wrappers/wrapParticipantStats';
import { wrapStructureReport } from './wrappers/wrapStructureReport';
import { wrapVenuesReport } from './wrappers/wrapVenuesReport';

// Constants and Types
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { Tournament } from '@Types/tournamentTypes';
import { ReportResult } from '@Types/reportTypes';

import {
  CALL_TIMING_VARIANCE_REPORT,
  COMPETITIVENESS_REPORT,
  ENTRY_STATUS_REPORT,
  MATCH_RESULTS_REPORT,
  MATCHUP_STATUS_REPORT,
  PARTICIPANT_RESULTS_REPORT,
  PARTICIPANT_STATS_REPORT,
  SEEDING_PERFORMANCE_REPORT,
  STRUCTURE_REPORT,
  VENUE_UTILIZATION_REPORT,
} from '@Constants/reportConstants';

const INVALID_REPORT_ID = { error: 'Invalid reportId' };

type GenerateReportArgs = {
  tournamentRecord: Tournament;
  reportId: string;
  parameters?: Record<string, any>;
};

type WrapperArgs = { tournamentRecord: Tournament; parameters?: Record<string, any> };

const wrapperMap: Record<string, (args: WrapperArgs) => ReportResult | { error: any }> = {
  [ENTRY_STATUS_REPORT]: wrapEntryStatusReport,
  [STRUCTURE_REPORT]: wrapStructureReport,
  [MATCH_RESULTS_REPORT]: wrapMatchResultsReport,
  [MATCHUP_STATUS_REPORT]: wrapMatchUpStatusReport,
  [COMPETITIVENESS_REPORT]: wrapCompetitivenessReport,
  [PARTICIPANT_RESULTS_REPORT]: wrapParticipantResultsReport,
  [SEEDING_PERFORMANCE_REPORT]: wrapSeedingPerformanceReport,
  [PARTICIPANT_STATS_REPORT]: wrapParticipantStats,
  [VENUE_UTILIZATION_REPORT]: wrapVenuesReport,
  [CALL_TIMING_VARIANCE_REPORT]: wrapCallTimingVarianceReport,
};

export function generateReport({
  tournamentRecord,
  reportId,
  parameters,
}: GenerateReportArgs): ReportResult | { error: any } {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const wrapper = wrapperMap[reportId];
  if (!wrapper) return INVALID_REPORT_ID;

  return wrapper({ tournamentRecord, parameters });
}
