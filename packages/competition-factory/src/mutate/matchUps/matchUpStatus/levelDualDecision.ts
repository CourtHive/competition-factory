import { generateTieMatchUpScore } from '@Query/matchUp/tieMatchUpScore/generateTieMatchUpScore';
import { decidedResultRefusal, isDecidedOutsideScore } from '@Scoring/analysis/decidedResult';

// constants and types
import type { DrawDefinition, Event, MatchUp, MatchUpStatusUnion, Score } from '@Types/tournamentTypes';
import { INVALID_SCORE } from '@Constants/errorConditionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import type { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import type { HydratedMatchUp } from '@Types/hydrated';

type LevelDualDecisionArgs = {
  matchUpStatus?: MatchUpStatusUnion;
  drawDefinition?: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  enableAutoCalc?: boolean;
  winningSide?: number;
  score?: Score;
  event?: Event;
  dual: MatchUp;
};

/**
 * A WINNER ON A LEVEL TEAM TIE NAMES HOW IT WAS DECIDED (TEAM results item 3). A single matchUp
 * refuses a winner on a level score unless the score records how it was decided outside it (`decidedResultRefusal`):
 * `score.overtime` with `decidedIn: 'EXTERNAL'` and `decidedBy`. A TEAM dual has no `matchUpFormat` for that check to
 * read, so validation skipped it and a level tie took any winner it was given, with or without auto-calc.
 *
 * The aggregate is the dual's first set: the score this call records (laid over the dual's own when it carries no
 * `sets`, `keepDualAggregate`), else the dual's stored score. Refused, before anything is written:
 * - a winner on a level aggregate with no record, unless the lines themselves name that winner (a tie format whose
 *   `tallyDirectives` decide a level total);
 * - a record that does not describe a decided result: not COMPLETED, no winner, an unknown method, or a tie whose
 *   aggregate is not level.
 *
 * Unaffected: an exit (RETIRED, WALKOVER, DEFAULTED) naming its winner, a winner on a tie that is not level (an
 * override with `disableAutoCalc` stays an override there), and enabling auto-calc, where the lines name the winner.
 */
export function levelDualDecisionRefusal(params: LevelDualDecisionArgs): ResultType | undefined {
  const { dual, enableAutoCalc, matchUpStatus, winningSide } = params;
  if (enableAutoCalc) return undefined;
  const score = params.score ?? dual.score;
  const level = isLevelAggregate(score);

  if (isDecidedOutsideScore(score)) return decidedResultRefusal({ matchUpStatus, winningSide, score, level });

  const completes = (matchUpStatus ?? COMPLETED) === COMPLETED;
  if (!winningSide || !completes || !level) return undefined;
  if (linesProjectWinner(params) === winningSide) return undefined;

  return {
    error: INVALID_SCORE,
    info: "a winner on a level TEAM tie records how it was decided: score.overtime { decidedIn: 'EXTERNAL', decidedBy }",
  };
}

function isLevelAggregate(score?: Score): boolean {
  const set = score?.sets?.[0];
  const [side1, side2] = [set?.side1Score, set?.side2Score];
  return typeof side1 === 'number' && typeof side2 === 'number' && side1 === side2;
}

function linesProjectWinner({ dual, drawDefinition, matchUpsMap, event }: LevelDualDecisionArgs): number | undefined {
  if (!dual.tieMatchUps?.length) return undefined;
  // the stored dual carries its tieMatchUps, which is all the tally reads (`calculateSideTieValues`)
  const matchUp = dual as HydratedMatchUp;
  return generateTieMatchUpScore({ matchUp, drawDefinition, matchUpsMap, event }).winningSide;
}
