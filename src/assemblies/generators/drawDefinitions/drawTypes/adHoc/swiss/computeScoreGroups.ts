import { getParticipantId } from '@Functions/global/extractors';

// constants and types
import type { ScoreGroup, SwissParticipantRecord, UnplayedRound } from '@Types/swissTypes';
import { COMPLETED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { MatchUp } from '@Types/tournamentTypes';

/** what the pairing-allocated bye scores when the policy does not say: a win, FIDE's usual award */
export const DEFAULT_BYE_POINTS = 1;

type ComputeScoreGroupsArgs = {
  participantIds: string[];
  matchUps: MatchUp[];
  allowDraws?: boolean;
  byePoints?: number;
};

type ComputeScoreGroupsResult = {
  scoreGroups: ScoreGroup[];
  records: Map<string, SwissParticipantRecord>;
};

/**
 * Every participant's record, round by round, and the score groups it makes. `matchUps` is every matchUp of the rounds
 * in question, decided or not: an undecided one scores nothing but says its sides were paired, which is how a round's
 * bye is told from a pending result.
 */
export function computeScoreGroups({
  participantIds,
  matchUps,
  allowDraws = false,
  byePoints = DEFAULT_BYE_POINTS,
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
      rounds: [],
    });
  }

  const roundsMatchUps = new Map<number, MatchUp[]>();
  for (const matchUp of matchUps) {
    const roundNumber = matchUp.roundNumber ?? 0;
    roundsMatchUps.set(roundNumber, [...(roundsMatchUps.get(roundNumber) ?? []), matchUp]);
  }

  for (const roundNumber of [...roundsMatchUps.keys()].sort((a, b) => a - b)) {
    const paired = new Set<string>();
    for (const matchUp of roundsMatchUps.get(roundNumber) ?? []) {
      const pid1 = matchUp.sides?.[0] && getParticipantId(matchUp.sides[0]);
      const pid2 = matchUp.sides?.[1] && getParticipantId(matchUp.sides[1]);
      if (pid1) paired.add(pid1);
      if (pid2) paired.add(pid2);
      const r1 = pid1 && records.get(pid1);
      const r2 = pid2 && records.get(pid2);
      if (r1 && r2) recordMeeting({ matchUp, roundNumber, r1, r2, allowDraws });
    }

    // an entrant no matchUp of the round names sat it out; when one alone did, the pairing gave it the round's bye. The
    // factory keeps no requested byes, so when two or more sat out none can be told to have had the bye, and none scores
    const absent = participantIds.filter((pid) => !paired.has(pid));
    for (const pid of absent) {
      const record = records.get(pid);
      if (!record) continue;
      if (absent.length === 1) addRound(record, { roundNumber, points: byePoints, unplayed: 'BYE' });
      else addRound(record, { roundNumber, points: 0, unplayed: 'ABSENT' });
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

/**
 * One meeting's result on both records. A walkover is a forfeit (C.07 16.2.2, 16.2.4): it scores, but the two did not
 * play, so neither is the other's opponent; a double walkover is a forfeit loss for both. Any other decided matchUp was
 * played, a retirement or default included; an undecided one scores only as a draw, when the policy allows draws.
 */
function recordMeeting({
  matchUp,
  roundNumber,
  r1,
  r2,
  allowDraws,
}: {
  matchUp: MatchUp;
  roundNumber: number;
  r1: SwissParticipantRecord;
  r2: SwissParticipantRecord;
  allowDraws: boolean;
}) {
  const { matchUpStatus, winningSide } = matchUp;
  if (matchUpStatus === DOUBLE_WALKOVER) {
    addRound(r1, { roundNumber, points: 0, opponentId: r2.participantId, unplayed: 'FORFEIT_LOSS' });
    addRound(r2, { roundNumber, points: 0, opponentId: r1.participantId, unplayed: 'FORFEIT_LOSS' });
  } else if (winningSide === 1 || winningSide === 2) {
    const [winner, loser] = winningSide === 1 ? [r1, r2] : [r2, r1];
    const forfeit = matchUpStatus === WALKOVER;
    const unplayed = (result: UnplayedRound) => (forfeit ? { unplayed: result } : {});
    addRound(winner, { roundNumber, points: 1, opponentId: loser.participantId, ...unplayed('FORFEIT_WIN') });
    addRound(loser, { roundNumber, points: 0, opponentId: winner.participantId, ...unplayed('FORFEIT_LOSS') });
  } else if (allowDraws && matchUpStatus === COMPLETED) {
    addRound(r1, { roundNumber, points: 0.5, opponentId: r2.participantId });
    addRound(r2, { roundNumber, points: 0.5, opponentId: r1.participantId });
  }
}

/** a round's result on a record: its points, and the win, draw or loss those points correspond to (C.07 16.4) */
function addRound(
  record: SwissParticipantRecord,
  round: { roundNumber: number; points: number; opponentId?: string; unplayed?: UnplayedRound },
) {
  const outcome = (round.points > 0.5 && 'WIN') || (round.points === 0.5 && 'DRAW') || 'LOSS';
  if (outcome === 'WIN') record.wins += 1;
  else if (outcome === 'DRAW') record.draws += 1;
  else record.losses += 1;
  record.points += round.points;
  record.roundPoints.push(round.points);
  record.rounds.push(round);
  if (round.opponentId && !round.unplayed) {
    if (!record.opponentIds.includes(round.opponentId)) record.opponentIds.push(round.opponentId);
    record.opponentOutcomes.set(round.opponentId, outcome);
  }
}
