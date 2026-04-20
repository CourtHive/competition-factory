import { getStructureReports } from '@Query/structure/structureReport';

// Constants and Types
import { STRUCTURE_REPORT } from '@Constants/reportConstants';
import { Tournament } from '@Types/tournamentTypes';
import { ReportResult } from '@Types/reportTypes';

export function wrapStructureReport({
  tournamentRecord,
}: {
  tournamentRecord: Tournament;
}): ReportResult | { error: any } {
  const result: any = getStructureReports({ tournamentRecord });
  if (result.error) return result;

  // Build lookup maps for names
  const eventNameMap: Record<string, string> = {};
  const drawNameMap: Record<string, string> = {};
  const drawSizeMap: Record<string, number> = {};
  for (const event of tournamentRecord.events ?? []) {
    eventNameMap[event.eventId] = event.eventName ?? '';
    for (const draw of event.drawDefinitions ?? []) {
      drawNameMap[draw.drawId] = draw.drawName ?? '';
      const mainStructure = draw.structures?.find((s: any) => s.stage === 'MAIN' && s.stageSequence === 1);
      if (mainStructure?.positionAssignments) {
        drawSizeMap[draw.drawId] = mainStructure.positionAssignments.length;
      }
    }
  }

  // Build participant name lookup
  const participantNameMap: Record<string, string> = {};
  for (const p of tournamentRecord.participants ?? []) {
    participantNameMap[p.participantId] = p.participantName ?? '';
    if (p.person?.personId) {
      participantNameMap[p.person.personId] = p.participantName ?? '';
    }
  }

  const columns = [
    { key: 'eventName', title: 'Event', type: 'string' as const },
    { key: 'drawName', title: 'Draw', type: 'string' as const },
    { key: 'stage', title: 'Stage', type: 'string' as const },
    { key: 'drawType', title: 'Draw Type', type: 'string' as const },
    { key: 'drawSize', title: 'Draw Size', type: 'number' as const },
    { key: 'matchUpsCount', title: 'MatchUps', type: 'number' as const },
    { key: 'winner', title: 'Winner', type: 'string' as const },
    { key: 'seedingBasis', title: 'Seeding Basis', type: 'string' as const },
  ];

  const rows = (result.structureReports ?? []).map((report: any) => {
    // Resolve winner name from personId or teamId
    const winnerName = participantNameMap[report.winningPersonId] || participantNameMap[report.winningTeamId] || '';

    return {
      eventId: report.eventId ?? '',
      eventName: eventNameMap[report.eventId] || '',
      drawId: report.drawId ?? '',
      drawName: drawNameMap[report.drawId] || '',
      stage: report.stage ?? '',
      drawType: report.drawType ?? '',
      drawSize: drawSizeMap[report.drawId] ?? '',
      matchUpsCount: report.matchUpsCount ?? '',
      winner: winnerName,
      seedingBasis: report.seedingBasis ?? '',
    };
  });

  return {
    reportId: STRUCTURE_REPORT,
    generatedAt: new Date().toISOString(),
    columns,
    rows,
    summary: {
      eventStructureReports: result.eventStructureReports ?? [],
      flightReports: result.flightReports ?? [],
    },
  };
}
