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

  // Build participant lookups, keyed by BOTH participantId and personId because
  // a structure report identifies its winner by `winningPersonId`.
  //
  // The name map alone cannot answer "which participant is this" — it points two
  // different ids at the same string. The parallel id map is what lets a consumer
  // resolve the winner and open a participant card. `winningTeamId` is already a
  // participantId (TEAM participants), so it maps to itself.
  const participantNameMap: Record<string, string> = {};
  const participantIdMap: Record<string, string> = {};
  for (const p of tournamentRecord.participants ?? []) {
    participantNameMap[p.participantId] = p.participantName ?? '';
    participantIdMap[p.participantId] = p.participantId;
    if (p.person?.personId) {
      participantNameMap[p.person.personId] = p.participantName ?? '';
      participantIdMap[p.person.personId] = p.participantId;
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
    const winningParticipantId =
      participantIdMap[report.winningPersonId] || participantIdMap[report.winningTeamId] || '';

    return {
      // Not a displayed column — consumers hide it — but it is what lets a table
      // open the winner's participant card, and it survives to CSV/JSON export.
      winningParticipantId,
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
