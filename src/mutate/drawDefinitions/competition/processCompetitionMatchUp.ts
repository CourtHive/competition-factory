// Query
import { getCompetitionPolicy } from '@Query/drawDefinition/competition/getCompetitionPolicy';
import { getCompetitionState } from '@Query/drawDefinition/competition/getCompetitionState';

// Generators
import { deriveCountables } from '@Generators/scales/competition/deriveCountables';
import { computeActualOutput } from '@Generators/scales/competition/actualOutput';
import { expectedScore } from '@Generators/scales/competition/expectedScore';

// Mutate
import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';

// Constants
import { MISSING_DRAW_DEFINITION, MISSING_MATCHUP } from '@Constants/errorConditionConstants';
import { COMPETITION_STATE } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';

type ProcessCompetitionMatchUpArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUp: MatchUp;
  event?: Event;
};

export function processCompetitionMatchUp(params: ProcessCompetitionMatchUpArgs): ResultType {
  const { tournamentRecord, drawDefinition, matchUp, event } = params;
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!matchUp) return { error: MISSING_MATCHUP };

  const { competitionPolicy } = getCompetitionPolicy({ tournamentRecord, drawDefinition, event });
  if (!competitionPolicy) return { ...SUCCESS };

  const { competitionState } = getCompetitionState({ drawDefinition });
  if (!competitionState) return { ...SUCCESS };

  const sides = matchUp.sides ?? [];
  const p1Id = sides[0]?.participantId;
  const p2Id = sides[1]?.participantId;
  if (!p1Id || !p2Id) return { ...SUCCESS };

  const s1 = competitionState.participantStates[p1Id];
  const s2 = competitionState.participantStates[p2Id];
  if (!s1 || !s2) return { ...SUCCESS };

  const { winningSide } = matchUp;

  // Derive countables from the matchUp score
  const { side1Count, side2Count } = deriveCountables(matchUp);

  // Compute actual outputs
  const p1Actual = computeActualOutput({
    pointsWon: side1Count,
    pointsLost: side2Count,
    competitionPolicy,
  });
  const p2Actual = computeActualOutput({
    pointsWon: side2Count,
    pointsLost: side1Count,
    competitionPolicy,
  });

  const logisticScale = competitionPolicy.ratingPolicy.dynamicFormRating.logisticScale;
  const kFactor = competitionPolicy.ratingPolicy.dynamicFormRating.kFactor;

  // Baseline expectations (frozen) — for pressure
  const p1ExpectedBaseline = expectedScore(s1.baselineRating, s2.baselineRating, logisticScale);
  const p2ExpectedBaseline = expectedScore(s2.baselineRating, s1.baselineRating, logisticScale);

  // Dynamic expectations — for form rating update
  const p1ExpectedDynamic = expectedScore(s1.dynamicFormRating, s2.dynamicFormRating, logisticScale);
  const p2ExpectedDynamic = expectedScore(s2.dynamicFormRating, s1.dynamicFormRating, logisticScale);

  // Pressure deltas (always baseline-based)
  const pressureEnabled = competitionPolicy.ratingPolicy.pressureRating?.enabled;
  const p1PressureDelta = pressureEnabled ? p1Actual - p1ExpectedBaseline : 0;
  const p2PressureDelta = pressureEnabled ? p2Actual - p2ExpectedBaseline : 0;

  // Dynamic form rating updates
  const dynamicEnabled = competitionPolicy.ratingPolicy.dynamicFormRating.enabled;
  const p1DynamicAfter = dynamicEnabled
    ? s1.dynamicFormRating + kFactor * (p1Actual - p1ExpectedDynamic)
    : s1.dynamicFormRating;
  const p2DynamicAfter = dynamicEnabled
    ? s2.dynamicFormRating + kFactor * (p2Actual - p2ExpectedDynamic)
    : s2.dynamicFormRating;

  const roundNumber = matchUp.roundNumber ?? 0;

  // Update participant states
  s1.dynamicFormRating = p1DynamicAfter;
  s1.pressureRating += p1PressureDelta;
  s1.roundsPlayed += 1;
  s1.wins += winningSide === 1 ? 1 : 0;
  s1.losses += winningSide === 2 ? 1 : 0;
  s1.draws += winningSide ? 0 : 1;
  s1.totalPointsWon += side1Count;
  s1.totalPointsLost += side2Count;
  s1.ratingHistory.push({
    roundNumber,
    opponentParticipantId: p2Id,
    dynamicFormRatingBefore: s1.dynamicFormRating - kFactor * (p1Actual - p1ExpectedDynamic),
    dynamicFormRatingAfter: p1DynamicAfter,
    pressureDelta: p1PressureDelta,
    actualOutput: p1Actual,
    expectedOutput: p1ExpectedBaseline,
  });

  s2.dynamicFormRating = p2DynamicAfter;
  s2.pressureRating += p2PressureDelta;
  s2.roundsPlayed += 1;
  s2.wins += winningSide === 2 ? 1 : 0;
  s2.losses += winningSide === 1 ? 1 : 0;
  s2.draws += winningSide ? 0 : 1;
  s2.totalPointsWon += side2Count;
  s2.totalPointsLost += side1Count;
  s2.ratingHistory.push({
    roundNumber,
    opponentParticipantId: p1Id,
    dynamicFormRatingBefore: s2.dynamicFormRating - kFactor * (p2Actual - p2ExpectedDynamic),
    dynamicFormRatingAfter: p2DynamicAfter,
    pressureDelta: p2PressureDelta,
    actualOutput: p2Actual,
    expectedOutput: p2ExpectedBaseline,
  });

  // Persist updated state
  setFirstClassOrExtension({
    element: drawDefinition,
    attribute: 'competitionState',
    name: COMPETITION_STATE,
    value: competitionState,
  });

  return { ...SUCCESS };
}
