import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';

// Constants and Types
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { MATCH_RESULTS_REPORT } from '@Constants/reportConstants';
import { Tournament } from '@Types/tournamentTypes';
import { ReportResult } from '@Types/reportTypes';

export function wrapMatchResultsReport({
  tournamentRecord,
}: {
  tournamentRecord: Tournament;
}): ReportResult | { error: any } {
  const { matchUps } = allTournamentMatchUps({ tournamentRecord });
  if (!matchUps) return { error: 'No matchUps found' };

  const completedMatchUps = matchUps.filter((m: any) => completedMatchUpStatuses.includes(m.matchUpStatus));

  const columns = [
    { key: 'roundName', title: 'Round', type: 'string' as const },
    { key: 'side1', title: 'Side 1', type: 'string' as const },
    { key: 'side2', title: 'Side 2', type: 'string' as const },
    { key: 'score', title: 'Score', type: 'string' as const },
    { key: 'matchUpStatus', title: 'Status', type: 'string' as const },
    { key: 'winnerName', title: 'Winner', type: 'string' as const },
  ];

  const rows = completedMatchUps
    .toSorted(
      (a: any, b: any) =>
        (a.roundNumber ?? 0) - (b.roundNumber ?? 0) || (a.roundPosition ?? 0) - (b.roundPosition ?? 0),
    )
    .map((m: any) => {
      const side1Name = m.sides?.[0]?.participant?.participantName ?? '';
      const side2Name = m.sides?.[1]?.participant?.participantName ?? '';
      const winnerSide = m.winningSide ? m.sides?.[m.winningSide - 1] : undefined;
      const scoreString = m.score?.scoreStringSide1 ?? '';

      return {
        roundName: m.roundName ?? `R${m.roundNumber ?? ''}`,
        side1: side1Name,
        side2: side2Name,
        score: scoreString,
        matchUpStatus: m.matchUpStatus ?? '',
        winnerName: winnerSide?.participant?.participantName ?? '',
      };
    });

  return {
    reportId: MATCH_RESULTS_REPORT,
    generatedAt: new Date().toISOString(),
    columns,
    rows,
  };
}
