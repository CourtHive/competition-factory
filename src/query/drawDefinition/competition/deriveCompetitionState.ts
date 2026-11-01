// Generators
import { deriveCountables } from '@Generators/scales/competition/deriveCountables';
import { computeActualOutput } from '@Generators/scales/competition/actualOutput';
import { expectedScore } from '@Generators/scales/competition/expectedScore';

// Acquire
import { matchUpsOf } from '@Acquire/structureMembers';

// constants and types
import type { CompetitionParticipantState, CompetitionPolicy, CompetitionState } from '@Types/competitionPolicyTypes';
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import type { DrawDefinition, MatchUp } from '@Types/tournamentTypes';

/**
 * The competition state as a pure function of the draw's results (Mentat `planning/STANDINGS_ENGINE_SPEC.md` § 3,
 * D6 option C). The stored state contributes only its INPUTS: each participant's baseline rating, and, for PER_ROUND,
 * which rounds an organiser has processed. Everything results decide (wins, points, form and pressure ratings, the
 * rating history) is replayed from the results in canonical order, round by round and in structure order within a
 * round, through the same per-result rating step the stored state was built with.
 *
 * So a corrected result counts once, as corrected, and a removed result does not count at all, whatever the stored
 * copy says (C1, C2: the v1 fold added every result it was given and reversed nothing).
 */
export function deriveCompetitionState({
  competitionPolicy,
  competitionState,
  drawDefinition,
}: {
  competitionPolicy: CompetitionPolicy;
  competitionState: CompetitionState;
  drawDefinition: DrawDefinition;
}): CompetitionState {
  const participantStates: Record<string, CompetitionParticipantState> = {};
  for (const [participantId, stored] of Object.entries(competitionState.participantStates ?? {})) {
    participantStates[participantId] = baselineState(participantId, stored.baselineRating);
  }

  const perRound = competitionPolicy.processingGranularity === 'PER_ROUND';
  const processedRounds = new Set(
    Object.values(competitionState.roundStates ?? {})
      .filter((roundState) => roundState?.processed)
      .map((roundState) => roundState.roundNumber),
  );

  for (const matchUp of canonicalOrder(drawDefinition)) {
    // PER_MATCHUP counted a result as it was decided; PER_ROUND, every completed result of a round once processed
    const counted = perRound
      ? processedRounds.has(matchUp.roundNumber ?? 0) &&
        (!!matchUp.winningSide || (!!matchUp.matchUpStatus && completedMatchUpStatuses.includes(matchUp.matchUpStatus)))
      : !!matchUp.winningSide;
    if (counted) applyCompetitionResult({ participantStates, matchUp, competitionPolicy });
  }

  return { ...competitionState, participantStates, roundStates: { ...competitionState.roundStates } };
}

function baselineState(participantId: string, baselineRating: number): CompetitionParticipantState {
  return {
    participantId,
    baselineRating,
    dynamicFormRating: baselineRating,
    pressureRating: 0,
    roundsPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    totalPointsWon: 0,
    totalPointsLost: 0,
    ratingHistory: [],
  };
}

/** every structure's matchUps, by round, in structure order within a round (a stable sort) */
function canonicalOrder(drawDefinition: DrawDefinition): MatchUp[] {
  const matchUps = (drawDefinition.structures ?? []).flatMap((structure) => matchUpsOf(structure) ?? []);
  return matchUps
    .map((matchUp, index) => ({ matchUp, index }))
    .sort((a, b) => (a.matchUp.roundNumber ?? 0) - (b.matchUp.roundNumber ?? 0) || a.index - b.index)
    .map(({ matchUp }) => matchUp);
}

/**
 * One result applied to the states in place: the per-result step of the competition policy (form rating against the
 * dynamic expectation, pressure against the frozen baseline), unchanged from the v1 fold.
 */
export function applyCompetitionResult({
  participantStates,
  competitionPolicy,
  matchUp,
}: {
  participantStates: Record<string, CompetitionParticipantState>;
  competitionPolicy: CompetitionPolicy;
  matchUp: MatchUp;
}) {
  const p1Id = matchUp.sides?.[0]?.participantId;
  const p2Id = matchUp.sides?.[1]?.participantId;
  if (!p1Id || !p2Id) return;
  const s1 = participantStates[p1Id];
  const s2 = participantStates[p2Id];
  if (!s1 || !s2) return;

  const { winningSide } = matchUp;
  const { side1Count, side2Count } = deriveCountables(matchUp);
  const p1Actual = computeActualOutput({ pointsWon: side1Count, pointsLost: side2Count, competitionPolicy });
  const p2Actual = computeActualOutput({ pointsWon: side2Count, pointsLost: side1Count, competitionPolicy });

  const { logisticScale, kFactor, enabled: dynamicEnabled } = competitionPolicy.ratingPolicy.dynamicFormRating;
  const pressureEnabled = competitionPolicy.ratingPolicy.pressureRating?.enabled;
  const roundNumber = matchUp.roundNumber ?? 0;

  const apply = (state: CompetitionParticipantState, opponent: CompetitionParticipantState, side: 1 | 2) => {
    const actual = side === 1 ? p1Actual : p2Actual;
    const [won, lost] = side === 1 ? [side1Count, side2Count] : [side2Count, side1Count];
    const expectedBaseline = expectedScore(state.baselineRating, opponent.baselineRating, logisticScale);
    const expectedDynamic = expectedScore(state.dynamicFormRating, opponent.dynamicFormRating, logisticScale);
    return {
      pressureDelta: pressureEnabled ? actual - expectedBaseline : 0,
      dynamicAfter: dynamicEnabled
        ? state.dynamicFormRating + kFactor * (actual - expectedDynamic)
        : state.dynamicFormRating,
      dynamicBefore: state.dynamicFormRating,
      expectedBaseline,
      actual,
      won,
      lost,
    };
  };
  // both deltas from the ratings BEFORE the result, as the v1 fold computed them
  const deltas = [apply(s1, s2, 1), apply(s2, s1, 2)] as const;

  [s1, s2].forEach((state, index) => {
    const delta = deltas[index];
    const side = index + 1;
    state.dynamicFormRating = delta.dynamicAfter;
    state.pressureRating += delta.pressureDelta;
    state.roundsPlayed += 1;
    state.wins += winningSide === side ? 1 : 0;
    state.losses += winningSide && winningSide !== side ? 1 : 0;
    state.draws += winningSide ? 0 : 1;
    state.totalPointsWon += delta.won;
    state.totalPointsLost += delta.lost;
    state.ratingHistory.push({
      roundNumber,
      opponentParticipantId: index === 0 ? p2Id : p1Id,
      dynamicFormRatingBefore: delta.dynamicBefore,
      dynamicFormRatingAfter: delta.dynamicAfter,
      pressureDelta: delta.pressureDelta,
      actualOutput: delta.actual,
      expectedOutput: delta.expectedBaseline,
    });
  });
}
