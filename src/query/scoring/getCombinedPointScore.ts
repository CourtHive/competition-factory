import { analyzeRotatingPartnerScore } from '@Query/matchUp/rotatingPartnerScore';

// constants and types
import type { RotatingPartnerScoreContract } from '@Types/rotatingPartnerScoring';
import type { MatchUp, ScoreResult } from '@Types/scoring/types';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

export function getCombinedPointScore(matchUp: MatchUp, contract: RotatingPartnerScoreContract): ScoreResult {
  const set = matchUp.score.sets[0];
  const points = [set?.side1Score ?? 0, set?.side2Score ?? 0];
  const next = [0, 1].map((side) =>
    analyzeRotatingPartnerScore({
      side1Points: points[0] + (side === 0 ? 1 : 0),
      side2Points: points[1] + (side === 1 ? 1 : 0),
      contract,
    }),
  );
  const complete = matchUp.matchUpStatus === COMPLETED;
  const isMatchPoint = next.some((result) => result.complete && result.winningSide !== undefined);
  return {
    sets: matchUp.score.sets,
    scoreString: `${points[0]}-${points[1]}`,
    games: [0, 0],
    points,
    pointDisplay: [String(points[0]), String(points[1])],
    situation: complete
      ? undefined
      : {
          isBreakPoint: false,
          isGamePoint: false,
          isSetPoint: isMatchPoint,
          isMatchPoint,
          isGoldenPoint:
            contract.tieResolution === 'DECIDING_POINT' && points[0] + points[1] === contract.combinedPointTotal,
          isTiebreak: false,
        },
  };
}
