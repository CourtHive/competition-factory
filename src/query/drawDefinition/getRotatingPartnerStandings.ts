import { appliedRotatingPartnerRoundsAreIntact } from '@Validators/appliedRotatingPartnerRoundsAreIntact';
import { isRotatingPartnerDraw, validateRotatingPartnerEntrants } from '@Validators/rotatingPartnerDraw';
import { analyzeCombinedPointSet } from '@Helpers/matchUpFormatCode/combinedPointFormat';
import { isRotatingPartnerTallyPolicy } from '@Validators/rotatingPartnerTallyPolicy';
import { settlementMatches } from '@Validators/rotatingPartnerSettlement';
import { validateScore } from '@Validators/validateScore';
import { matchUpsOf } from '@Acquire/structureMembers';

// constants and types
import type { DrawDefinition, Event, MatchUp, MatchUpStatusUnion, Tournament } from '@Types/tournamentTypes';
import { INVALID_VALUES, INVALID_SCORE } from '@Constants/errorConditionConstants';
import { STRUCTURE_SELECTED_STATUSES } from '@Constants/entryStatusConstants';
import type { RotatingPartnerRoundRecord } from '@Types/rotatingPartnerRound';
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import type {
  RotatingPartnerContribution,
  RotatingPartnerStanding,
  RotatingPartnerStatusTreatment,
} from '@Types/rotatingPartnerTally';

export function getRotatingPartnerStandings(params: {
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  event?: Event;
  throughRoundNumber?: number;
}): ResultType & {
  standings?: RotatingPartnerStanding[];
  contributions?: RotatingPartnerContribution[];
  unresolved?: { matchUpId: string; roundNumber: number; matchUpStatus: MatchUpStatusUnion }[];
  throughRoundNumber?: number;
  staleSettlementIds?: string[];
} {
  const { drawDefinition, tournamentRecord, event } = params;
  if (!isRotatingPartnerDraw(drawDefinition, event)) return { error: INVALID_VALUES };
  const rounds = drawDefinition.competitionRounds ?? [];
  const last = rounds.reduce((value, round) => Math.max(value, round.roundNumber), 0);
  const cutoff = params.throughRoundNumber ?? last;
  if (!Number.isSafeInteger(cutoff) || cutoff < 0 || cutoff > last)
    return { error: INVALID_VALUES, info: 'invalid standings cutoff' };
  if (!appliedRotatingPartnerRoundsAreIntact({ drawDefinition, tournamentRecord }))
    return { error: INVALID_VALUES, info: 'applied rounds are corrupt' };
  const roster =
    drawDefinition.competitionRoster ??
    (drawDefinition.entries ?? [])
      .filter((entry) => entry.entryStatus !== undefined && STRUCTURE_SELECTED_STATUSES.includes(entry.entryStatus))
      .map((entry) => entry.participantId);
  const entrants = validateRotatingPartnerEntrants({ tournamentRecord, participantIds: roster });
  if (entrants.error) return entrants;
  const rows = new Map<string, RotatingPartnerStanding>(
    roster.map((participantId) => [
      participantId,
      {
        participantId,
        rank: 0,
        pointsScored: 0,
        pointsConceded: 0,
        matchesPlayed: 0,
        matchesWon: 0,
        matchesLost: 0,
        matchesTied: 0,
      },
    ]),
  );
  const staleSettlementIds: string[] = [];
  const contributions: RotatingPartnerContribution[] = [];
  const unresolved: { matchUpId: string; roundNumber: number; matchUpStatus: MatchUpStatusUnion }[] = [];
  for (const round of rounds.filter((candidate) => candidate.roundNumber <= cutoff)) {
    if (!isRotatingPartnerTallyPolicy(round.tallyContract))
      return { error: INVALID_VALUES, info: 'missing or invalid historical tally contract' };
    const structure = drawDefinition.structures?.find((candidate) => candidate.structureId === round.structureId);
    const matches = new Map((matchUpsOf(structure) ?? []).map((matchUp) => [matchUp.matchUpId, matchUp]));
    for (const [index, matchUpId] of round.matchUpIds.entries()) {
      const matchUp = matches.get(matchUpId)!;
      const result = settledTallyMatch(drawDefinition, matchUp, round, index);
      if (result.staleSettlementId) staleSettlementIds.push(result.staleSettlementId);
      if (result.error) return { error: result.error, info: result.info };
      if (result.unresolved)
        unresolved.push({
          matchUpId,
          roundNumber: round.roundNumber,
          matchUpStatus: matchUp.matchUpStatus ?? TO_BE_PLAYED,
        });
      for (const contribution of result.contributions ?? []) {
        const row = rows.get(contribution.participantId);
        if (!row) return { error: INVALID_VALUES, info: 'round includes a player outside the competition roster' };
        if (!accumulate(row, contribution))
          return { error: INVALID_VALUES, info: 'individual points exceed safe integer totals' };
        contributions.push(contribution);
      }
    }
  }
  const standings = rankStandings([...rows.values()]);
  return { ...SUCCESS, standings, contributions, unresolved, throughRoundNumber: cutoff, staleSettlementIds };
}

function tallyMatch(
  matchUp: MatchUp,
  round: RotatingPartnerRoundRecord,
  index: number,
  override?: RotatingPartnerStatusTreatment,
): ResultType & {
  contributions?: RotatingPartnerContribution[];
  unresolved?: boolean;
} {
  const status = matchUp.matchUpStatus ?? TO_BE_PLAYED;
  const treatment =
    override ?? (status === COMPLETED ? { kind: 'COMPLETED' as const } : round.tallyContract.statusTreatments[status]);
  if (!treatment || treatment.kind === 'UNRESOLVED') return { unresolved: true };
  if (treatment.kind === 'EXCLUDE') return {};
  const credit = treatment.kind === 'CREDIT';
  if (credit && matchUp.winningSide !== 1 && matchUp.winningSide !== 2)
    return { error: INVALID_SCORE, info: 'credited result requires a winningSide' };
  const set = matchUp.score?.sets?.[0];
  const hasPlayedScore = !!matchUp.score?.sets?.length;
  if (!credit || hasPlayedScore) {
    if (!set || matchUp.score?.sets?.length !== 1) return { error: INVALID_SCORE };
    const checked = validateScore({
      score: matchUp.score!,
      matchUpFormat: matchUp.matchUpFormat,
      winningSide: matchUp.winningSide,
      matchUpStatus: status,
    });
    const analysis = analyzeCombinedPointSet(set, round.scoringContract);
    if (checked.error || !analysis.valid || (status === COMPLETED && !analysis.complete))
      return { error: INVALID_SCORE };
  }
  const scores = hasPlayedScore ? [set!.side1Score!, set!.side2Score!] : [0, 0];
  const extended = scores[0] + scores[1] > round.scoringContract.combinedPointTotal;
  const extras = extended ? scores.map((points) => points - round.scoringContract.combinedPointTotal / 2) : [0, 0];
  const includeExtra =
    round.scoringContract.tieResolution === 'DECIDING_POINT'
      ? round.tallyContract.decidingPoints === 'INCLUDE'
      : round.tallyContract.overtimePoints === 'INCLUDE';
  const counted = credit
    ? scores.map((_, side) => (side + 1 === matchUp.winningSide ? treatment.winningPoints : treatment.losingPoints))
    : scores.map((points, side) => points - (includeExtra ? 0 : extras[side]));
  const treatmentKind: RotatingPartnerContribution['treatment'] = credit ? 'CREDIT' : treatment.kind;
  const contributions = round.pairings[index].flatMap((members, side) =>
    members.map((participantId, member) => ({
      participantId,
      partnerId: members[1 - member],
      opponentIds: [...round.pairings[index][1 - side]],
      matchUpId: matchUp.matchUpId,
      roundNumber: round.roundNumber,
      matchUpStatus: status,
      treatment: treatmentKind,
      played: hasPlayedScore,
      playedPoints: scores[side],
      extraPoints: extras[side],
      creditedPoints: credit ? counted[side] : 0,
      pointsScored: counted[side],
      pointsConceded: counted[1 - side],
      ...outcome(matchUp, side),
    })),
  );
  return { contributions };
}

function accumulate(row: RotatingPartnerStanding, contribution: RotatingPartnerContribution) {
  row.pointsScored += contribution.pointsScored;
  row.pointsConceded += contribution.pointsConceded;
  if (contribution.played) row.matchesPlayed++;
  if (contribution.outcome === 'WON') row.matchesWon++;
  if (contribution.outcome === 'LOST') row.matchesLost++;
  if (contribution.outcome === 'TIED') row.matchesTied++;
  return Number.isSafeInteger(row.pointsScored) && Number.isSafeInteger(row.pointsConceded);
}

function outcome(matchUp: MatchUp, side: number): { outcome?: 'WON' | 'LOST' | 'TIED' } {
  if (matchUp.winningSide) return { outcome: side + 1 === matchUp.winningSide ? 'WON' : 'LOST' };
  return matchUp.matchUpStatus === COMPLETED ? { outcome: 'TIED' } : {};
}

function rankStandings(rows: RotatingPartnerStanding[]): RotatingPartnerStanding[] {
  const standings = rows.toSorted((a, b) => {
    if (a.pointsScored !== b.pointsScored) return b.pointsScored - a.pointsScored;
    if (a.participantId === b.participantId) return 0;
    return a.participantId < b.participantId ? -1 : 1;
  });
  standings.forEach((row, index) => {
    row.rank = index && row.pointsScored === standings[index - 1].pointsScored ? standings[index - 1].rank : index + 1;
  });
  return standings;
}

function settledTallyMatch(draw: DrawDefinition, matchUp: MatchUp, round: RotatingPartnerRoundRecord, index: number) {
  const settlement = draw.competitionSettlements?.findLast((record) => record.matchUpId === matchUp.matchUpId);
  const stale = !!settlement && !settlementMatches(settlement, matchUp);
  let override = settlement?.treatment;
  if (stale) override = { kind: 'UNRESOLVED' };
  // A genuine completed score restores the ordinary contract; adjudication never overrides it.
  if (matchUp.matchUpStatus === COMPLETED) override = undefined;
  const result = tallyMatch(matchUp, round, index, override);
  return {
    ...result,
    staleSettlementId: stale ? settlement.requestId : undefined,
    contributions: result.contributions?.map((contribution) =>
      settlement && !stale ? { ...contribution, settlementRequestId: settlement.requestId } : contribution,
    ),
  };
}
