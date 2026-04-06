import { getParticipantId } from '@Functions/global/extractors';

// Constants and Types
import type { ScoreGroup, SwissParticipantRecord } from '@Types/swissTypes';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import type { MatchUp } from '@Types/tournamentTypes';

type ComputeScoreGroupsArgs = {
  participantIds: string[];
  matchUps: MatchUp[];
  allowDraws?: boolean;
};

type ComputeScoreGroupsResult = {
  scoreGroups: ScoreGroup[];
  records: Map<string, SwissParticipantRecord>;
};

export function computeScoreGroups({
  participantIds,
  matchUps,
  allowDraws = false,
}: ComputeScoreGroupsArgs): ComputeScoreGroupsResult {
  const records = new Map<string, SwissParticipantRecord>();

  for (const pid of participantIds) {
    records.set(pid, {
      participantId: pid,
      wins: 0,
      losses: 0,
      draws: 0,
      points: 0,
      opponentIds: [],
      opponentOutcomes: new Map(),
      roundPoints: [],
    });
  }

  for (const matchUp of matchUps) {
    if (matchUp.matchUpStatus !== COMPLETED) continue;
    if (!matchUp.sides || matchUp.sides.length < 2) continue;

    const pid1 = getParticipantId(matchUp.sides[0]);
    const pid2 = getParticipantId(matchUp.sides[1]);
    if (!pid1 || !pid2) continue;

    const r1 = records.get(pid1);
    const r2 = records.get(pid2);
    if (!r1 || !r2) continue;

    if (!r1.opponentIds.includes(pid2)) r1.opponentIds.push(pid2);
    if (!r2.opponentIds.includes(pid1)) r2.opponentIds.push(pid1);

    if (matchUp.winningSide === 1) {
      r1.wins += 1;
      r1.points += 1;
      r2.losses += 1;
      r1.opponentOutcomes.set(pid2, 'WIN');
      r2.opponentOutcomes.set(pid1, 'LOSS');
      r1.roundPoints.push(1);
      r2.roundPoints.push(0);
    } else if (matchUp.winningSide === 2) {
      r2.wins += 1;
      r2.points += 1;
      r1.losses += 1;
      r2.opponentOutcomes.set(pid1, 'WIN');
      r1.opponentOutcomes.set(pid2, 'LOSS');
      r1.roundPoints.push(0);
      r2.roundPoints.push(1);
    } else if (allowDraws) {
      r1.draws += 1;
      r2.draws += 1;
      r1.points += 0.5;
      r2.points += 0.5;
      r1.opponentOutcomes.set(pid2, 'DRAW');
      r2.opponentOutcomes.set(pid1, 'DRAW');
      r1.roundPoints.push(0.5);
      r2.roundPoints.push(0.5);
    }
  }

  const groupMap = new Map<string, string[]>();

  for (const [pid, record] of records) {
    const key = `${record.wins}-${record.losses}-${record.draws}`;
    const group = groupMap.get(key) ?? [];
    group.push(pid);
    groupMap.set(key, group);
  }

  const scoreGroups: ScoreGroup[] = [];
  for (const [key, pids] of groupMap) {
    const [wins, losses, draws] = key.split('-').map(Number);
    scoreGroups.push({ wins, losses, draws, participantIds: pids });
  }

  scoreGroups.sort((a, b) => {
    const pointsA = a.wins + a.draws * 0.5;
    const pointsB = b.wins + b.draws * 0.5;
    if (pointsB !== pointsA) return pointsB - pointsA;
    return a.losses - b.losses;
  });

  return { scoreGroups, records };
}
