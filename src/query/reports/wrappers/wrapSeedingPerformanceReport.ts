import { getParticipantIdFinishingPositions } from '@Query/drawDefinition/finishingPositions';
import { getParticipants } from '@Query/participants/getParticipants';

import { SEEDING_PERFORMANCE_REPORT } from '@Constants/reportConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { ReportResult } from '@Types/reportTypes';
import { Tournament } from '@Types/tournamentTypes';

function getPerformanceLabel(finishMin: number, seedValue: number): string {
  if (!finishMin || !seedValue) return '';
  if (finishMin < seedValue) return 'Overperformed';
  if (finishMin > seedValue) return 'Underperformed';
  return 'As expected';
}

function formatFinishRange(posData: any): string {
  const range = posData?.finishingPositionRange;
  const min = range?.[0] ?? '';
  const max = range?.[1] ?? min;
  return min === max ? `${min}` : `${min}-${max}`;
}

function buildDrawRows(event: any, drawDefinition: any, participantMap: any, tournamentRecord: Tournament): any[] {
  const finishingPositions = getParticipantIdFinishingPositions({
    drawDefinition,
    tournamentRecord,
    event,
  });
  if (!finishingPositions || (finishingPositions as any).error) return [];

  const rows: any[] = [];
  for (const [participantId, posData] of Object.entries(finishingPositions as any)) {
    const pData = participantMap?.[participantId];
    if (!pData) continue;

    const seedValue = pData.draws?.[drawDefinition.drawId]?.seedAssignments?.[MAIN];
    if (!seedValue) continue;

    const finishStr = formatFinishRange(posData);
    const finishMin = (posData as any).finishingPositionRange?.[0] ?? 0;

    rows.push({
      participantId,
      participantName: pData.participant?.participantName ?? '',
      eventName: event.eventName ?? '',
      drawName: drawDefinition.drawName ?? '',
      seedValue,
      finishingPosition: finishStr,
      expectedPosition: `${seedValue}`,
      performance: getPerformanceLabel(finishMin, seedValue),
    });
  }
  return rows;
}

export function wrapSeedingPerformanceReport({
  tournamentRecord,
}: {
  tournamentRecord: Tournament;
}): ReportResult | { error: any } {
  const { participantMap } = getParticipants({
    withSeeding: true,
    withDraws: true,
    tournamentRecord,
  });

  const columns = [
    { key: 'participantName', title: 'Participant', type: 'string' as const },
    { key: 'eventName', title: 'Event', type: 'string' as const },
    { key: 'drawName', title: 'Draw', type: 'string' as const },
    { key: 'seedValue', title: 'Seed', type: 'number' as const },
    { key: 'finishingPosition', title: 'Finish', type: 'string' as const },
    { key: 'expectedPosition', title: 'Expected', type: 'string' as const },
    { key: 'performance', title: 'Performance', type: 'string' as const },
  ];

  const rows: Record<string, any>[] = [];
  for (const event of tournamentRecord.events ?? []) {
    for (const drawDefinition of event.drawDefinitions ?? []) {
      rows.push(...buildDrawRows(event, drawDefinition, participantMap, tournamentRecord));
    }
  }

  rows.sort((a, b) => (a.seedValue ?? 99) - (b.seedValue ?? 99));

  return {
    reportId: SEEDING_PERFORMANCE_REPORT,
    generatedAt: new Date().toISOString(),
    columns,
    rows,
  };
}
