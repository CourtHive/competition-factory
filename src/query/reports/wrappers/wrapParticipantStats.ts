import { getParticipantStats } from '@Query/participant/getParticipantStats';

// Constants and Types
import { PARTICIPANT_STATS_REPORT } from '@Constants/reportConstants';
import { Tournament } from '@Types/tournamentTypes';
import { ReportResult } from '@Types/reportTypes';

export function wrapParticipantStats({
  tournamentRecord,
}: {
  tournamentRecord: Tournament;
}): ReportResult | { error: any } {
  const result: any = getParticipantStats({ tournamentRecord });
  if (result.error) return result;

  const columns = [
    { key: 'participantName', title: 'Participant', type: 'string' as const },
    { key: 'matchUpsWon', title: 'Wins', type: 'number' as const },
    { key: 'matchUpsLost', title: 'Losses', type: 'number' as const },
    { key: 'matchUpsRatio', title: 'Win %', type: 'number' as const },
    { key: 'setsWon', title: 'Sets Won', type: 'number' as const },
    { key: 'setsLost', title: 'Sets Lost', type: 'number' as const },
    { key: 'gamesWon', title: 'Games Won', type: 'number' as const },
    { key: 'gamesLost', title: 'Games Lost', type: 'number' as const },
    { key: 'tiebreaksWon', title: 'TBs Won', type: 'number' as const },
    { key: 'tiebreaksLost', title: 'TBs Lost', type: 'number' as const },
  ];

  const rows = (result.allParticipantStats ?? []).map((stat: any) => ({
    participantName: stat.participantName ?? '',
    matchUpsWon: stat.matchUps?.[0] ?? 0,
    matchUpsLost: stat.matchUps?.[1] ?? 0,
    matchUpsRatio: stat.matchUpsRatio ?? 0,
    setsWon: stat.sets?.[0] ?? 0,
    setsLost: stat.sets?.[1] ?? 0,
    gamesWon: stat.games?.[0] ?? 0,
    gamesLost: stat.games?.[1] ?? 0,
    tiebreaksWon: stat.tiebreaks?.[0] ?? 0,
    tiebreaksLost: stat.tiebreaks?.[1] ?? 0,
  }));

  return {
    reportId: PARTICIPANT_STATS_REPORT,
    generatedAt: new Date().toISOString(),
    columns,
    rows,
    summary: {
      participatingTeamsCount: result.participatingTeamsCount ?? 0,
    },
  };
}
