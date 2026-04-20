import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { getParticipants } from '@Query/participants/getParticipants';

// Constants and Types
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { SINGLES_MATCHUP, DOUBLES_MATCHUP } from '@Constants/matchUpTypes';
import { PARTICIPANT_RESULTS_REPORT } from '@Constants/reportConstants';
import { Tournament } from '@Types/tournamentTypes';
import { ReportResult } from '@Types/reportTypes';

export function wrapParticipantResultsReport({
  tournamentRecord,
}: {
  tournamentRecord: Tournament;
}): ReportResult | { error: any } {
  const { participantMap } = getParticipants({ tournamentRecord });
  const { matchUps } = allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [SINGLES_MATCHUP, DOUBLES_MATCHUP] },
    tournamentRecord,
  });
  if (!matchUps) return { error: 'No matchUps found' };

  const completed = matchUps.filter((m: any) => completedMatchUpStatuses.includes(m.matchUpStatus));

  // Accumulate per-participant stats
  const statsMap: Record<
    string,
    { wins: number; losses: number; setsWon: number; setsLost: number; gamesWon: number; gamesLost: number }
  > = {};

  const ensureStats = (pid: string) => {
    if (!statsMap[pid]) statsMap[pid] = { wins: 0, losses: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 };
  };

  for (const m of completed) {
    const side1Ids = getSideParticipantIds(m.sides?.[0], m.matchUpType ?? '');
    const side2Ids = getSideParticipantIds(m.sides?.[1], m.matchUpType ?? '');
    const ws = m.winningSide ?? 0;
    const sideIds = [[], side1Ids, side2Ids];
    const winnerIds = sideIds[ws] ?? [];
    const loserSideIds = [[], side2Ids, side1Ids];
    const loserIds = loserSideIds[ws] ?? [];

    const sets = m.score?.sets ?? [];
    let s1SetsWon = 0,
      s2SetsWon = 0,
      s1Games = 0,
      s2Games = 0;
    for (const set of sets) {
      const g1 = set.side1Score ?? 0;
      const g2 = set.side2Score ?? 0;
      s1Games += g1;
      s2Games += g2;
      if (g1 > g2) s1SetsWon++;
      else if (g2 > g1) s2SetsWon++;
    }

    for (const pid of winnerIds) {
      ensureStats(pid);
      statsMap[pid].wins++;
    }
    for (const pid of loserIds) {
      ensureStats(pid);
      statsMap[pid].losses++;
    }

    const side1GameStats = { setsWon: s1SetsWon, setsLost: s2SetsWon, gamesWon: s1Games, gamesLost: s2Games };
    const side2GameStats = { setsWon: s2SetsWon, setsLost: s1SetsWon, gamesWon: s2Games, gamesLost: s1Games };

    for (const pid of side1Ids) {
      ensureStats(pid);
      statsMap[pid].setsWon += side1GameStats.setsWon;
      statsMap[pid].setsLost += side1GameStats.setsLost;
      statsMap[pid].gamesWon += side1GameStats.gamesWon;
      statsMap[pid].gamesLost += side1GameStats.gamesLost;
    }
    for (const pid of side2Ids) {
      ensureStats(pid);
      statsMap[pid].setsWon += side2GameStats.setsWon;
      statsMap[pid].setsLost += side2GameStats.setsLost;
      statsMap[pid].gamesWon += side2GameStats.gamesWon;
      statsMap[pid].gamesLost += side2GameStats.gamesLost;
    }
  }

  const columns = [
    { key: 'participantName', title: 'Participant', type: 'string' as const },
    { key: 'wins', title: 'Wins', type: 'number' as const },
    { key: 'losses', title: 'Losses', type: 'number' as const },
    { key: 'winPct', title: 'Win %', type: 'number' as const },
    { key: 'setsWon', title: 'Sets Won', type: 'number' as const },
    { key: 'setsLost', title: 'Sets Lost', type: 'number' as const },
    { key: 'gamesWon', title: 'Games Won', type: 'number' as const },
    { key: 'gamesLost', title: 'Games Lost', type: 'number' as const },
  ];

  const rows = Object.entries(statsMap)
    .map(([pid, stats]) => {
      const name = participantMap?.[pid]?.participant?.participantName ?? pid;
      const total = stats.wins + stats.losses;
      const winPct = total > 0 ? Math.round((stats.wins / total) * 100) : 0;
      return {
        participantId: pid,
        participantName: name,
        wins: stats.wins,
        losses: stats.losses,
        winPct,
        setsWon: stats.setsWon,
        setsLost: stats.setsLost,
        gamesWon: stats.gamesWon,
        gamesLost: stats.gamesLost,
      };
    })
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses);

  return {
    reportId: PARTICIPANT_RESULTS_REPORT,
    generatedAt: new Date().toISOString(),
    columns,
    rows,
  };
}

function getSideParticipantIds(side: any, matchUpType: string): string[] {
  if (!side) return [];
  if (matchUpType === DOUBLES_MATCHUP) {
    return side.participant?.individualParticipantIds ?? [side.participantId].filter(Boolean);
  }
  return [side.participantId ?? side.participant?.participantId].filter(Boolean);
}
