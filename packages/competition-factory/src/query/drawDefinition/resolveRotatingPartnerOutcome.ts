import { getRotatingPartnerScoringContract } from '@Query/drawDefinition/getRotatingPartnerScoringContract';
import { advancesMatchWinner, drawStructures } from '@Validators/tiedFormatCompatibility';
import { analyzeCombinedPointSet } from '@Helpers/matchUpFormatCode/combinedPointFormat';
import { resolveScoringFormat } from '@Query/hierarchical/resolveScoringFormat';
import { isRotatingPartnerDraw } from '@Validators/rotatingPartnerDraw';
import { matchUpsOf } from '@Helpers/drawTopology/structureMembers';
import { validateScore } from '@Scoring/analysis/validateScore';
import { isLevelScore } from '@Scoring/analysis/levelScore';
import {
  normalizeRotatingPartnerScoreContract,
  rotatingPartnerContractFormat,
  validTimedRotatingPartnerPoints,
  sameRotatingPartnerScoreContract,
} from '@Helpers/rotatingPartners/scoringContract';

// constants and types
import { INVALID_VALUES, INVALID_SCORE, UNDECIDED_LEVEL_RESULT } from '@Constants/errorConditionConstants';
import type { DrawDefinition, Event, Score, MatchUpStatusUnion } from '@Types/tournamentTypes';
import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import type { ResultType } from '@Types/factoryTypes';
import type {
  TimedRotatingPartnerScoreContract,
  RotatingPartnerScoreContractWithTimed,
} from '@Types/rotatingPartnerScoring';

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
    const matchUp = (matchUpsOf(structure) ?? []).find((candidate) => candidate.matchUpId === matchUpId);
    if (structure && advancesMatchWinner(drawDefinition, structure) && (score || !matchUp?.winningSide)) {
      // standings phase 2 § 1.1 (CA 2026-11-04), needs a decision: a level result where a winner must advance names
      // the winner and how it was decided; there is no status for a result awaiting that decision
      const format = resolveScoringFormat({ incoming: matchUpFormat, matchUp, structure, drawDefinition, event });
      if (isLevelScore(score, format))
        return {
          error: UNDECIDED_LEVEL_RESULT,
          info: 'a level result here names its winner and how it was decided (score.overtime: decidedIn EXTERNAL, decidedBy)',
        };
      return { error: INVALID_SCORE, info: 'completed elimination results require a winningSide' };
    }
  }
  if (!isRotatingPartnerDraw(drawDefinition, event)) return {};
  const round = drawDefinition?.competitionRounds?.find((candidate) => candidate.matchUpIds.includes(matchUpId));
  if (!round) return { error: INVALID_VALUES, info: 'rotating-partner scoring requires applied-round provenance' };
  const savedProfile = getRotatingPartnerScoringContract({ drawDefinition });
  if (!sameRotatingPartnerScoreContract(round.scoringContract, savedProfile.contract))
    return { error: INVALID_VALUES, info: 'saved round scoring conflicts with the competition profile' };
  const contract = normalizeRotatingPartnerScoreContract(round.scoringContract);
  const expectedFormat = rotatingPartnerContractFormat(contract);
  if (!contract || !expectedFormat) return { error: INVALID_VALUES, info: 'invalid saved scoring contract' };
  const timed = contract.kind === 'TIMED';
  if (matchUpFormat && matchUpFormat !== expectedFormat)
    return { error: INVALID_VALUES, info: 'matchUpFormat conflicts with the saved round scoring contract' };
  const matchUp = (drawDefinition?.structures ?? [])
    .flatMap((structure) => matchUpsOf(structure) ?? [])
    .find((candidate) => candidate.matchUpId === matchUpId);
  if (matchUp?.matchUpFormat !== expectedFormat)
    return { error: INVALID_VALUES, info: 'matchUpFormat conflicts with the saved round scoring contract' };
  const checkedScore = score ?? matchUp?.score;
  const validation = validateRotatingScore({
    score: checkedScore,
    contract,
    matchUpFormat: expectedFormat,
    winningSide: score ? winningSide : (winningSide ?? matchUp?.winningSide),
    matchUpStatus,
  });
  if (validation.error) return validation;
  let inferredStatus: MatchUpStatusUnion | undefined;
  if (score?.sets?.length && !matchUpStatus)
    inferredStatus = !timed && analyzeCombinedPointSet(score.sets[0], contract).complete ? COMPLETED : IN_PROGRESS;

  return { matchUpFormat: expectedFormat, ...(inferredStatus ? { matchUpStatus: inferredStatus } : {}) };
}

function invalidTimedScore(
  score: Score,
  contract: TimedRotatingPartnerScoreContract,
  status?: MatchUpStatusUnion,
): boolean {
  const set = score.sets?.[0];
  return (
    !validTimedRotatingPartnerPoints(score) ||
    (status === COMPLETED && contract.tieResolution === 'DECIDING_POINT' && set?.side1Score === set?.side2Score)
  );
}

/** Validate the persisted round's score before either public outcome entry point writes. */
function validateRotatingScore(params: {
  score?: Score;
  contract: RotatingPartnerScoreContractWithTimed;
  matchUpFormat: string;
  winningSide?: number;
  matchUpStatus?: MatchUpStatusUnion;
}): ResultType {
  const { score, contract, matchUpStatus } = params;
  if (!score?.sets?.length)
    return matchUpStatus === COMPLETED
      ? { error: INVALID_SCORE, info: 'a completed rotating-partner result requires a score' }
      : {};
  if (contract.kind === 'TIMED' && invalidTimedScore(score, contract, matchUpStatus)) return { error: INVALID_SCORE };
  return validateScore({ score, matchUpFormat: params.matchUpFormat, winningSide: params.winningSide, matchUpStatus });
}
