import { stringifyCombinedPointFormat } from '@Helpers/matchUpFormatCode/combinedPointFormat';
import { advancesMatchWinner, drawStructures } from '@Validators/tiedFormatCompatibility';
import { analyzeCombinedPointSet } from '@Helpers/matchUpFormatCode/combinedPointFormat';
import { isRotatingPartnerDraw } from '@Validators/rotatingPartnerDraw';
import { validateScore } from '@Validators/validateScore';
import { matchUpsOf } from '@Acquire/structureMembers';

// constants and types
import type { DrawDefinition, Event, Score, MatchUpStatusUnion } from '@Types/tournamentTypes';
import { INVALID_VALUES, INVALID_SCORE } from '@Constants/errorConditionConstants';
import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import type { ResultType } from '@Types/factoryTypes';

/** A round's historical contract governs even when today's inherited policy or call flags differ. */
export function resolveRotatingPartnerOutcome(params: {
  drawDefinition?: DrawDefinition;
  event?: Event;
  matchUpId: string;
  matchUpFormat?: string;
  matchUpStatus?: MatchUpStatusUnion;
  winningSide?: number;
  score?: Score;
}): ResultType & { matchUpFormat?: string; matchUpStatus?: MatchUpStatusUnion } {
  const { drawDefinition, event, matchUpId, matchUpFormat, matchUpStatus, winningSide, score } = params;
  if (drawDefinition && matchUpStatus === COMPLETED && winningSide === undefined) {
    const structure = drawStructures(drawDefinition).find((candidate) =>
      (matchUpsOf(candidate) ?? []).some((matchUp) => matchUp.matchUpId === matchUpId),
    );
    const existingWinner = (matchUpsOf(structure) ?? []).find(
      (matchUp) => matchUp.matchUpId === matchUpId,
    )?.winningSide;
    if (structure && advancesMatchWinner(drawDefinition, structure) && (score || !existingWinner))
      return { error: INVALID_SCORE, info: 'completed elimination results require a winningSide' };
  }
  if (!isRotatingPartnerDraw(drawDefinition, event)) return {};
  const round = drawDefinition?.competitionRounds?.find((candidate) => candidate.matchUpIds.includes(matchUpId));
  if (!round) return { error: INVALID_VALUES, info: 'rotating-partner scoring requires applied-round provenance' };
  const segment = stringifyCombinedPointFormat(round.scoringContract);
  if (!segment) return { error: INVALID_VALUES, info: 'invalid saved scoring contract' };
  const expectedFormat = `SET1-S:${segment}`;
  if (matchUpFormat && matchUpFormat !== expectedFormat)
    return { error: INVALID_VALUES, info: 'matchUpFormat conflicts with the saved round scoring contract' };
  const matchUp = (drawDefinition?.structures ?? [])
    .flatMap((structure) => matchUpsOf(structure) ?? [])
    .find((candidate) => candidate.matchUpId === matchUpId);
  const checkedScore = score ?? matchUp?.score;
  if (matchUpStatus === COMPLETED && !checkedScore?.sets?.length)
    return { error: INVALID_SCORE, info: 'a completed rotating-partner result requires a score' };
  if (checkedScore?.sets?.length) {
    const validation = validateScore({
      score: checkedScore,
      matchUpFormat: expectedFormat,
      winningSide: score ? winningSide : (winningSide ?? matchUp?.winningSide),
      matchUpStatus,
    });
    if (validation.error) return validation;
  }
  let inferredStatus: MatchUpStatusUnion | undefined;
  if (score?.sets?.length && !matchUpStatus)
    inferredStatus = analyzeCombinedPointSet(score.sets[0], round.scoringContract).complete ? COMPLETED : IN_PROGRESS;

  return { matchUpFormat: expectedFormat, ...(inferredStatus ? { matchUpStatus: inferredStatus } : {}) };
}
