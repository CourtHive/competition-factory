// Query
import { getCompetitionPolicy } from './getCompetitionPolicy';
import { getCompetitionState } from './getCompetitionState';

// Types
import type {
  CompetitionLeaderboardRow,
  CompetitionParticipantState,
  PrimaryRanking,
} from '@Types/competitionPolicyTypes';
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';

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
  const { competitionState } = getCompetitionState({ drawDefinition });
  if (!competitionState || !competitionPolicy) return { leaderboard: [] };

  const primaryRanking = competitionPolicy.victoryPolicy.primaryRanking;
  const participants = Object.values(competitionState.participantStates);

  const sorted = [...participants].sort((a, b) => {
    const diff = getRankingValue(b, primaryRanking) - getRankingValue(a, primaryRanking);
    if (diff !== 0) return diff;

    // Apply tiebreak order
    for (const tiebreak of competitionPolicy.victoryPolicy.tiebreakOrder ?? []) {
      const tbDiff = applyTiebreak(a, b, tiebreak, competitionState.participantStates);
      if (tbDiff !== 0) return tbDiff;
    }

    return 0;
  });

  const leaderboard: CompetitionLeaderboardRow[] = sorted.map((p, i) => ({
    participantId: p.participantId,
    rank: i + 1,
    baselineRating: p.baselineRating,
    dynamicFormRating: p.dynamicFormRating,
    pressureRating: p.pressureRating,
    wins: p.wins,
    losses: p.losses,
    draws: p.draws,
    pointsWon: p.totalPointsWon,
    pointsLost: p.totalPointsLost,
  }));

  return { leaderboard };
}

function getRankingValue(p: CompetitionParticipantState, ranking: PrimaryRanking): number {
  switch (ranking) {
    case 'PRESSURE_RATING':
      return p.pressureRating;
    case 'DYNAMIC_FORM_RATING':
      return p.dynamicFormRating;
    case 'WINS':
      return p.wins;
    case 'POINTS':
      return p.totalPointsWon;
    default:
      return p.wins;
  }
}

function applyTiebreak(
  a: CompetitionParticipantState,
  b: CompetitionParticipantState,
  tiebreak: string,
  _participantStates: Record<string, CompetitionParticipantState>,
): number {
  // Comparator returns positive ⇒ a sorts AFTER b ⇒ b ranks higher.
  // Tiebreaks rank larger values higher (matching primary ranking direction),
  // so each branch returns (b's value − a's value).
  switch (tiebreak) {
    case 'POINT_DIFFERENTIAL':
      return b.totalPointsWon - b.totalPointsLost - (a.totalPointsWon - a.totalPointsLost);
    case 'DYNAMIC_FORM_RATING':
      return b.dynamicFormRating - a.dynamicFormRating;
    case 'PRESSURE_RATING':
      return b.pressureRating - a.pressureRating;
    case 'HEAD_TO_HEAD': {
      const aVsB = a.ratingHistory.filter((h) => h.opponentParticipantId === b.participantId);
      const bVsA = b.ratingHistory.filter((h) => h.opponentParticipantId === a.participantId);
      const aWins = aVsB.filter((h) => h.actualOutput > 0.5).length;
      const bWins = bVsA.filter((h) => h.actualOutput > 0.5).length;
      return bWins - aWins;
    }
    case 'HEAD_TO_HEAD_PRESSURE': {
      const aVsB = a.ratingHistory.filter((h) => h.opponentParticipantId === b.participantId);
      const bVsA = b.ratingHistory.filter((h) => h.opponentParticipantId === a.participantId);
      const aPressure = aVsB.reduce((sum, h) => sum + h.pressureDelta, 0);
      const bPressure = bVsA.reduce((sum, h) => sum + h.pressureDelta, 0);
      return bPressure - aPressure;
    }
    case 'STRENGTH_OF_OPPOSITION': {
      const aOpponentRatings = a.ratingHistory.map(
        (h) => _participantStates[h.opponentParticipantId]?.baselineRating ?? 0,
      );
      const bOpponentRatings = b.ratingHistory.map(
        (h) => _participantStates[h.opponentParticipantId]?.baselineRating ?? 0,
      );
      const aAvg = aOpponentRatings.length ? aOpponentRatings.reduce((s, v) => s + v, 0) / aOpponentRatings.length : 0;
      const bAvg = bOpponentRatings.length ? bOpponentRatings.reduce((s, v) => s + v, 0) / bOpponentRatings.length : 0;
      return bAvg - aAvg;
    }
    default:
      return 0;
  }
}
