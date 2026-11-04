import type { SwissParticipantRecord, SwissRoundResult, SwissStanding } from '@Types/swissTypes';

type ComputeTiebreakersArgs = {
  records: Map<string, SwissParticipantRecord>;
  tiebreakMethods?: string[];
  /** the rounds the tournament is scheduled for; absent, the last round any record holds */
  totalRounds?: number;
};

/** the points a draw scores, the value C.07 16.3.2 gives a late requested bye and 16.4.2 multiplies to cap a dummy */
const DRAW_POINTS = 0.5;

/**
 * The standings, with the graph measures read under FIDE C.07 Art. 16 (Unplayed Rounds Management, as revised from
 * 1 March 2026): an opponent counts at its adjusted score (16.3), and each of a participant's own unplayed rounds counts
 * against a dummy scoring the participant's own score, capped (16.4).
 */
export function computeTiebreakers({
  records,
  tiebreakMethods = ['BUCHHOLZ', 'SONNEBORN_BERGER'],
  totalRounds,
}: ComputeTiebreakersArgs): SwissStanding[] {
  const lastRound =
    totalRounds ?? Math.max(0, ...[...records.values()].flatMap(({ rounds }) => rounds.map((r) => r.roundNumber)));
  const adjusted = new Map([...records].map(([pid, record]) => [pid, adjustedScore(record, lastRound)]));
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

    const contributions = roundContributions({ record, adjusted, lastRound });
    if (tiebreakMethods.includes('BUCHHOLZ')) {
      standing.buchholz = sum(contributions.map(({ value }) => value));
    }
    if (tiebreakMethods.includes('MEDIAN_BUCHHOLZ')) {
      standing.medianBuchholz = computeMedianBuchholz(contributions);
    }
    if (tiebreakMethods.includes('SONNEBORN_BERGER')) {
      standing.sonnebornBerger = sum(contributions.map(({ value, points }) => value * points));
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

type Contribution = { value: number; points: number; voluntary: boolean };

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** a voluntary unplayed round (C.07 16.1.2): one the participant was not available for, a requested bye or a forfeit loss */
const isVoluntary = (round: SwissRoundResult) => round.unplayed === 'ABSENT' || round.unplayed === 'FORFEIT_LOSS';

/**
 * A participant's score as its opponents' tie-breaks read it (C.07 16.3): every round as awarded, except a requested bye
 * followed only by voluntary unplayed rounds, or in the last round (16.2.5), which counts as a draw. A round sat out with
 * another entrant is the factory's nearest record of a requested bye.
 */
function adjustedScore(record: SwissParticipantRecord, lastRound: number) {
  const { rounds } = record;
  return rounds.reduce((score, round, index) => {
    const late =
      round.unplayed === 'ABSENT' && (round.roundNumber === lastRound || rounds.slice(index + 1).every(isVoluntary));
    return score + (late ? DRAW_POINTS : round.points);
  }, 0);
}

/**
 * What each round adds to the graph measures: the opponent's adjusted score for a game played; for an unplayed round,
 * the dummy's (C.07 16.4), the participant's own score but no more than the scheduled opponent's adjusted score for a
 * forfeit (16.4.1) or a draw's points times the tournament's rounds for any other (16.4.2).
 */
function roundContributions({
  record,
  adjusted,
  lastRound,
}: {
  record: SwissParticipantRecord;
  adjusted: Map<string, number>;
  lastRound: number;
}): Contribution[] {
  const contributions: Contribution[] = [];
  for (const round of record.rounds) {
    const opponentScore = round.opponentId ? (adjusted.get(round.opponentId) ?? 0) : 0;
    let value = opponentScore;
    if (round.unplayed) {
      const forfeit = round.unplayed === 'FORFEIT_WIN' || round.unplayed === 'FORFEIT_LOSS';
      value = Math.min(record.points, forfeit ? opponentScore : DRAW_POINTS * lastRound);
    } else if (!round.opponentId) continue;
    contributions.push({ value, points: round.points, voluntary: isVoluntary(round) });
  }
  return contributions;
}

/**
 * Buchholz Median-1 (C.07 14.3): cut the least significant value, then the most. The least is the lowest contribution
 * of a voluntary unplayed round when there is one (16.5.1); fewer than three rounds, nothing is cut.
 */
function computeMedianBuchholz(contributions: Contribution[]): number {
  const values = contributions.map(({ value }) => value);
  if (values.length < 3) return sum(values);

  const voluntary = contributions.filter((c) => c.voluntary).map(({ value }) => value);
  const least = voluntary.length ? Math.min(...voluntary) : Math.min(...values);
  const remaining = [...values];
  remaining.splice(remaining.indexOf(least), 1);
  remaining.splice(remaining.indexOf(Math.max(...remaining)), 1);
  return sum(remaining);
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
