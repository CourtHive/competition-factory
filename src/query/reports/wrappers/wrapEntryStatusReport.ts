import { getEntryStatusReports } from '@Query/entries/entryStatusReport';

// Constants and Types
import { ENTRY_STATUS_REPORT } from '@Constants/reportConstants';
import { Tournament } from '@Types/tournamentTypes';
import { ReportResult } from '@Types/reportTypes';

export function wrapEntryStatusReport({
  tournamentRecord,
}: {
  tournamentRecord: Tournament;
}): ReportResult | { error: any } {
  const result: any = getEntryStatusReports({ tournamentRecord });
  if (result.error) return result;

  // Build lookup maps for human-readable names
  const participantNameMap: Record<string, string> = {};
  for (const p of tournamentRecord.participants ?? []) {
    participantNameMap[p.participantId] = p.participantName ?? '';
  }

  const eventNameMap: Record<string, string> = {};
  const drawNameMap: Record<string, string> = {};
  for (const event of tournamentRecord.events ?? []) {
    eventNameMap[event.eventId] = event.eventName ?? '';
    for (const draw of event.drawDefinitions ?? []) {
      drawNameMap[draw.drawId] = draw.drawName ?? '';
    }
  }

  const columns = [
    { key: 'participantName', title: 'Participant', type: 'string' as const },
    { key: 'eventName', title: 'Event', type: 'string' as const },
    { key: 'drawName', title: 'Draw', type: 'string' as const },
    { key: 'entryStatus', title: 'Entry Status', type: 'string' as const },
    { key: 'entryStage', title: 'Stage', type: 'string' as const },
    { key: 'ranking', title: 'Ranking', type: 'number' as const },
    { key: 'mainSeeding', title: 'Main Seed', type: 'number' as const },
    { key: 'qualifyingSeeding', title: 'Qualifying Seed', type: 'number' as const },
  ];

  const rows = (result.participantEntryReports ?? []).map((entry: any) => ({
    participantId: entry.participantId ?? '',
    participantName: participantNameMap[entry.participantId] || '',
    eventId: entry.eventId ?? '',
    eventName: eventNameMap[entry.eventId] || '',
    drawId: entry.drawId ?? '',
    drawName: drawNameMap[entry.drawId] || '',
    entryStatus: entry.entryStatus ?? '',
    entryStage: entry.entryStage ?? '',
    ranking: entry.ranking ?? '',
    mainSeeding: entry.mainSeeding ?? '',
    qualifyingSeeding: entry.qualifyingSeeding ?? '',
  }));

  return {
    reportId: ENTRY_STATUS_REPORT,
    generatedAt: new Date().toISOString(),
    columns,
    rows,
    summary: result.tournamentEntryReport ?? {},
  };
}
