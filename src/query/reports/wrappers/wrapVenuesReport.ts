import { getVenuesReport } from '@Query/venues/venuesReport';

// Constants and Types
import { VENUE_UTILIZATION_REPORT } from '@Constants/reportConstants';
import { Tournament } from '@Types/tournamentTypes';
import { ReportResult } from '@Types/reportTypes';

export function wrapVenuesReport({
  tournamentRecord,
}: {
  tournamentRecord: Tournament;
}): ReportResult | { error: any } {
  const tournamentId = tournamentRecord?.tournamentId;
  const tournamentRecords = tournamentId ? { [tournamentId]: tournamentRecord } : {};

  const result: any = getVenuesReport({ tournamentRecords });
  if (result.error) return result;

  const columns = [
    { key: 'venueName', title: 'Venue', type: 'string' as const },
    { key: 'date', title: 'Date', type: 'date' as const },
    { key: 'availableCourts', title: 'Courts', type: 'number' as const },
    { key: 'scheduledMatchUpsCount', title: 'Scheduled MatchUps', type: 'number' as const },
    { key: 'availableMinutes', title: 'Available Minutes', type: 'number' as const },
    { key: 'scheduledMinutes', title: 'Scheduled Minutes', type: 'number' as const },
    { key: 'percentUtilization', title: 'Utilization %', type: 'number' as const },
  ];

  const rows: Record<string, any>[] = [];
  for (const venue of result.venuesReport ?? []) {
    for (const [date, data] of Object.entries(venue.venueReport ?? {})) {
      const report = data as any;
      rows.push({
        venueName: venue.venueName ?? '',
        date,
        availableCourts: report.availableCourts ?? 0,
        scheduledMatchUpsCount: report.scheduledMatchUpsCount ?? 0,
        availableMinutes: report.availableMinutes ?? 0,
        scheduledMinutes: report.scheduledMinutes ?? 0,
        percentUtilization: report.percentUtilization ?? '0',
      });
    }
  }

  return {
    reportId: VENUE_UTILIZATION_REPORT,
    generatedAt: new Date().toISOString(),
    columns,
    rows,
  };
}
