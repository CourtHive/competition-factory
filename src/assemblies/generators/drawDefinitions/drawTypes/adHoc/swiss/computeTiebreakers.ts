import type { SwissParticipantRecord, SwissStanding } from '@Types/swissTypes';

type ComputeTiebreakersArgs = {
  records: Map<string, SwissParticipantRecord>;
  tiebreakMethods?: string[];
};

export function computeTiebreakers({
  records,
  tiebreakMethods = ['BUCHHOLZ', 'SONNEBORN_BERGER'],
}: ComputeTiebreakersArgs): SwissStanding[] {
  const standings: SwissStanding[] = [];

  for (const [pid, record] of records) {
    const standing: SwissStanding = {
      participantId: pid,
      wins: record.wins,
      losses: record.losses,
      draws: record.draws,
      points: record.points,
      opponentIds: record.opponentIds,
      rank: 0,
    };

    if (tiebreakMethods.includes('BUCHHOLZ')) {
      standing.buchholz = computeBuchholz(pid, records);
    }
    if (tiebreakMethods.includes('MEDIAN_BUCHHOLZ')) {
      standing.medianBuchholz = computeMedianBuchholz(pid, records);
    }
    if (tiebreakMethods.includes('SONNEBORN_BERGER')) {
      standing.sonnebornBerger = computeSonnebornBerger(pid, records);
    }
    if (tiebreakMethods.includes('PROGRESSIVE_SCORE')) {
      standing.progressiveScore = computeProgressiveScore(record);
    }

    standings.push(standing);
  }

  sortStandings(standings, tiebreakMethods);

  for (let i = 0; i < standings.length; i++) {
    standings[i].rank = i + 1;
  }

  return standings;
}

function computeBuchholz(participantId: string, records: Map<string, SwissParticipantRecord>): number {
  const record = records.get(participantId);
  if (!record) return 0;

  return record.opponentIds.reduce((sum, oppId) => {
    const oppRecord = records.get(oppId);
    return sum + (oppRecord?.points ?? 0);
  }, 0);
}

function computeMedianBuchholz(participantId: string, records: Map<string, SwissParticipantRecord>): number {
  const record = records.get(participantId);
  if (!record || record.opponentIds.length < 3) return computeBuchholz(participantId, records);

  const oppScores = record.opponentIds
    .map((oppId) => records.get(oppId)?.points ?? 0)
    .sort((a, b) => a - b);

  // drop highest and lowest
  const trimmed = oppScores.slice(1, -1);
  return trimmed.reduce((sum, s) => sum + s, 0);
}

function computeSonnebornBerger(participantId: string, records: Map<string, SwissParticipantRecord>): number {
  const record = records.get(participantId);
  if (!record) return 0;

  let score = 0;
  for (const oppId of record.opponentIds) {
    const oppRecord = records.get(oppId);
    if (!oppRecord) continue;

    const outcome = record.opponentOutcomes.get(oppId);
    if (outcome === 'WIN') {
      score += oppRecord.points;
    } else if (outcome === 'DRAW') {
      score += oppRecord.points * 0.5;
    }
  }

  return score;
}

function computeProgressiveScore(record: SwissParticipantRecord): number {
  let cumulative = 0;
  let progressive = 0;
  for (const roundPts of record.roundPoints) {
    cumulative += roundPts;
    progressive += cumulative;
  }
  return progressive;
}

function sortStandings(standings: SwissStanding[], tiebreakMethods: string[]): void {
  standings.sort((a, b) => {
    // primary: points descending
    if (b.points !== a.points) return b.points - a.points;

    // apply tiebreakers in order
    for (const method of tiebreakMethods) {
      const valA = getTiebreakValue(a, method);
      const valB = getTiebreakValue(b, method);
      if (valB !== valA) return valB - valA;
    }

    return 0;
  });
}

function getTiebreakValue(standing: SwissStanding, method: string): number {
  switch (method) {
    case 'BUCHHOLZ':
      return standing.buchholz ?? 0;
    case 'MEDIAN_BUCHHOLZ':
      return standing.medianBuchholz ?? 0;
    case 'SONNEBORN_BERGER':
      return standing.sonnebornBerger ?? 0;
    case 'PROGRESSIVE_SCORE':
      return standing.progressiveScore ?? 0;
    default:
      return 0;
  }
}
