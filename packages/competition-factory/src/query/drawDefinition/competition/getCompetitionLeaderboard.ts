// Query
import { orderParticipants } from '@Query/standings/orderParticipants';
import { getCompetitionPolicy } from './getCompetitionPolicy';
import { getCompetitionState } from './getCompetitionState';

// types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';
import type { ParticipantResults, StandingsDirective, StandingsPolicy } from '@Query/standings/standingsTypes';
import type {
  CompetitionLeaderboardRow,
  CompetitionParticipantState,
  CompetitionPolicy,
  CompetitionTiebreak,
  PrimaryRanking,
} from '@Types/competitionPolicyTypes';

type GetCompetitionLeaderboardArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  event?: Event;
};

type GetCompetitionLeaderboardResult = ResultType & {
  leaderboard?: CompetitionLeaderboardRow[];
};

export function getCompetitionLeaderboard(params: GetCompetitionLeaderboardArgs): GetCompetitionLeaderboardResult {
  const { tournamentRecord, drawDefinition, event } = params;

  const { competitionPolicy } = getCompetitionPolicy({ tournamentRecord, drawDefinition, event });
  if (!competitionPolicy) return { leaderboard: [] };
  // the state the results decide (D6), never the stored copy as it stands
  const { competitionState } = getCompetitionState({ drawDefinition, competitionPolicy });
  if (!competitionState) return { leaderboard: [] };
  return rankCompetitionStates({ competitionPolicy, participantStates: competitionState.participantStates });
}

/** the leaderboard's measures, by the policy's names for them */
const PRIMARY_MEASURE: Record<PrimaryRanking, string> = {
  PRESSURE_RATING: 'pressureRating',
  DYNAMIC_FORM_RATING: 'dynamicFormRating',
  WINS: 'wins',
  POINTS: 'totalPointsWon',
};

const TIEBREAK_DIRECTIVES: Record<CompetitionTiebreak, StandingsDirective[]> = {
  // the record between a pair; with three or more tied, the wins among only them (a mini-league), so a circle of results
  // does not depend on the order a sort visits them (C3)
  HEAD_TO_HEAD: [
    { attribute: 'headToHead', mode: 'RECORD' },
    { attribute: 'wins', idsFilter: true },
  ],
  HEAD_TO_HEAD_PRESSURE: [{ attribute: 'headToHead', mode: 'PRESSURE' }],
  POINT_DIFFERENTIAL: [{ attribute: 'pointDifferential' }],
  STRENGTH_OF_OPPOSITION: [{ attribute: 'opponentStrength' }],
  DYNAMIC_FORM_RATING: [{ attribute: 'dynamicFormRating' }],
  PRESSURE_RATING: [{ attribute: 'pressureRating' }],
  // the graph measures, each opponent scored by the primary measure (C4: v1 declared these and returned 0)
  BUCHHOLZ: [{ attribute: 'buchholz' }],
  SONNEBORN_BERGER: [{ attribute: 'sonnebornBerger' }],
};

/**
 * The leaderboard over given participant states, ordered by the standings engine (spec § 3, D6-3): the policy's primary
 * ranking, then its tiebreak order as directives; participants level on all of them share a rank (C5: v1 numbered every
 * row 1, 2, 3 whatever the ties).
 */
export function rankCompetitionStates({
  competitionPolicy,
  participantStates,
}: {
  competitionPolicy: Pick<CompetitionPolicy, 'victoryPolicy'>;
  participantStates: Record<string, CompetitionParticipantState>;
}): GetCompetitionLeaderboardResult {
  const { primaryRanking, tiebreakOrder = [] } = competitionPolicy.victoryPolicy;
  const policy: StandingsPolicy = {
    primary: PRIMARY_MEASURE[primaryRanking] ?? 'wins',
    directives: tiebreakOrder.flatMap((tiebreak) => TIEBREAK_DIRECTIVES[tiebreak] ?? []),
    honourDisableHeadToHead: false,
  };
  const { groupOrder } = orderParticipants({
    recalculate: ({ participantIds }) => ({ participantResults: ledgerOf(participantStates, participantIds) }),
    participantResults: ledgerOf(participantStates),
    policy,
  });

  const leaderboard: CompetitionLeaderboardRow[] = groupOrder.map(({ participantId, rankOrder, ties }) => {
    const p = participantStates[participantId];
    return {
      participantId,
      rank: rankOrder ?? 0,
      ...(ties && { ties }),
      baselineRating: p.baselineRating,
      dynamicFormRating: p.dynamicFormRating,
      pressureRating: p.pressureRating,
      wins: p.wins,
      losses: p.losses,
      draws: p.draws,
      pointsWon: p.totalPointsWon,
      pointsLost: p.totalPointsLost,
    };
  });

  return { leaderboard };
}

/**
 * The participant states as a standings ledger. A meeting's outcome is read from the rating history as v1's
 * HEAD_TO_HEAD read it: an actual output above one half a win, below it a loss, at it a draw. Scoped to `participantIds`,
 * only the meetings among them count toward `wins` (the mini-league).
 */
function ledgerOf(participantStates: Record<string, CompetitionParticipantState>, participantIds?: string[]) {
  const scope = participantIds ? new Set(participantIds) : undefined;
  const ledger: ParticipantResults = {};
  for (const [participantId, state] of Object.entries(participantStates)) {
    if (scope && !scope.has(participantId)) continue;
    const history = state.ratingHistory.filter(
      ({ opponentParticipantId }) => !scope || scope.has(opponentParticipantId),
    );
    const opponents = (predicate: (actual: number) => boolean) =>
      history
        .filter(({ actualOutput }) => predicate(actualOutput))
        .map(({ opponentParticipantId }) => opponentParticipantId);
    const opponentRatings = state.ratingHistory.map(
      ({ opponentParticipantId }) => participantStates[opponentParticipantId]?.baselineRating ?? 0,
    );
    const pressureVs: Record<string, number> = {};
    for (const { opponentParticipantId, pressureDelta } of state.ratingHistory) {
      pressureVs[opponentParticipantId] = (pressureVs[opponentParticipantId] ?? 0) + pressureDelta;
    }
    const victories = opponents((actual) => actual > 0.5);
    ledger[participantId] = {
      victories,
      defeats: opponents((actual) => actual < 0.5),
      drawnWith: opponents((actual) => actual === 0.5),
      wins: scope ? victories.length : state.wins,
      totalPointsWon: state.totalPointsWon,
      pointDifferential: state.totalPointsWon - state.totalPointsLost,
      opponentStrength: opponentRatings.length
        ? opponentRatings.reduce((sum, rating) => sum + rating, 0) / opponentRatings.length
        : 0,
      dynamicFormRating: state.dynamicFormRating,
      pressureRating: state.pressureRating,
      pressureVs,
    };
  }
  return ledger;
}
