import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';

// Constants and Types
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { MATCHUP_STATUS_REPORT } from '@Constants/reportConstants';
import { Tournament } from '@Types/tournamentTypes';
import { ReportResult } from '@Types/reportTypes';

export function wrapMatchUpStatusReport({
  tournamentRecord,
}: {
  tournamentRecord: Tournament;
}): ReportResult | { error: any } {
  const { matchUps } = allTournamentMatchUps({ tournamentRecord });
  if (!matchUps) return { error: 'No matchUps found' };

  const completed = matchUps.filter((m: any) => completedMatchUpStatuses.includes(m.matchUpStatus));

  // Build event/draw name maps
  const eventNameMap: Record<string, string> = {};
  const drawNameMap: Record<string, string> = {};
  for (const event of tournamentRecord.events ?? []) {
    eventNameMap[event.eventId] = event.eventName ?? '';
    for (const draw of event.drawDefinitions ?? []) {
      drawNameMap[draw.drawId] = draw.drawName ?? '';
    }
  }

  // Aggregate by event + status
  const aggregateMap: Record<string, Record<string, number>> = {};
  for (const m of completed) {
    const eventId = (m as any).eventId ?? 'unknown';
    const status = m.matchUpStatus ?? 'UNKNOWN';
    aggregateMap[eventId] ??= {};
    aggregateMap[eventId][status] = (aggregateMap[eventId][status] ?? 0) + 1;
  }

  const columns = [
    { key: 'eventName', title: 'Event', type: 'string' as const },
    { key: 'status', title: 'Status', type: 'string' as const },
    { key: 'count', title: 'Count', type: 'number' as const },
    { key: 'percentage', title: '% of Event', type: 'number' as const },
  ];

  const rows: Record<string, any>[] = [];
  for (const [eventId, statuses] of Object.entries(aggregateMap)) {
    const eventTotal = Object.values(statuses).reduce((sum, c) => sum + c, 0);
    for (const [status, count] of Object.entries(statuses)) {
      rows.push({
        eventId,
        eventName: eventNameMap[eventId] || eventId,
        status,
        count,
        percentage: eventTotal > 0 ? Math.round((count / eventTotal) * 100) : 0,
      });
    }
  }

  rows.sort((a, b) => a.eventName.localeCompare(b.eventName) || b.count - a.count);

  return {
    reportId: MATCHUP_STATUS_REPORT,
    generatedAt: new Date().toISOString(),
    columns,
    rows,
  };
}
