import { removeDoubleExit } from './removeDoubleExit';
import { isDoubleExit } from '@Validators/isExit';

// constants and types
import type { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import type { MatchUp } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

type UnwindDualDoubleExitArgs = {
  isCollectionMatchUp?: boolean;
  disableAutoCalc?: boolean;
  matchUpsMap?: MatchUpsMap;
  /** hydrated: `_disableAutoCalc` is the legacy alias of the first-class flag */
  dualMatchUp?: MatchUp & { _disableAutoCalc?: boolean };
};

/**
 * A TIE SCORE THAT ENDS A DUAL'S DOUBLE EXIT UNWINDS THE DOUBLE EXIT FIRST.
 *
 * A dual holding DOUBLE_WALKOVER has propagated: its winner target carries a produced exit, and a
 * team already waiting there may have been awarded the walkover and advanced. Scoring one of the
 * dual's tieMatchUps turns the dual IN_PROGRESS and, when enough lines are decided, COMPLETED with a
 * winner — but the dual's status is written by `updateTieMatchUpScore` directly, so the unwind that a
 * direct re-score of the dual goes through (`noDownstreamDependencies`, `doubleExitCleanup`) never
 * ran, and the produced exit stood.
 *
 * Measured 2026-10-01 (assessment G2) on a TEAM SINGLE_ELIMINATION 8, DOMINANT_DUO, lineups
 * attached: dual `1|1` completed through its lines, then `1|2` DOUBLE_WALKOVER — `2|1` reads
 * `WALKOVER ws=1` with the `1|1` winner, who is advanced into the final. Then `1|2`'s lines are
 * scored and the dual completes:
 *
 *     2|1   WALKOVER ws=2   [team A, team B]     team B arrived into a walkover nobody withdrew and TOOK it
 *     3|1   TO_BE_PLAYED    [team A, team B]     both of them in the final
 *
 * With the lines scored before anyone reached `2|1` the arrival resolved benignly, which is why the
 * matrix's dual-level cells never saw it: it is the ORDER that exposes the missing unwind.
 *
 * `removeDoubleExit` writes only the targets, never the source, so it is called here for the dual
 * exactly as it is for a direct re-score; `targetData` is already the dual's — `setMatchUpState`
 * resolves targets for `matchUpTieId` when there is one. The dual's own new status is then written by
 * the tie-score path as before.
 *
 * A DUAL SCORED BY HAND KEEPS ITS DOUBLE EXIT, AND SO DOES WHAT IT PRODUCED. Under `disableAutoCalc` a line's result
 * is written with the dual left as it stands (`attemptToModifyScore`): the dual is not recomputed and stays the double
 * exit it is. The unwind still ran, and took back the exit the dual had produced while the dual went on holding it: the
 * next dual reset to TO_BE_PLAYED, a team arriving there later still carried on past it into the round after (measured
 * 2026-11-19, TEAM SINGLE_ELIMINATION 8, USTA_COLLEGE, walk seed 11). A call that turns auto-calc back on
 * (`disableAutoCalc: false`) recomputes the dual, and unwinds as before.
 */
export function unwindDualDoubleExit(params: UnwindDualDoubleExitArgs): ResultType {
  const { isCollectionMatchUp, dualMatchUp, matchUpsMap, disableAutoCalc } = params;
  if (!isCollectionMatchUp || !dualMatchUp || !isDoubleExit(dualMatchUp.matchUpStatus)) return { ...SUCCESS };
  // first-class (NATIVE) with fallback to the legacy `_disableAutoCalc` hydrated alias (LEGACY writeMode)
  const scoredByHand = (dualMatchUp.disableAutoCalc ?? dualMatchUp._disableAutoCalc) && disableAutoCalc !== false;
  if (scoredByHand) return { ...SUCCESS };

  const rawDual =
    matchUpsMap?.drawMatchUps?.find((candidate) => candidate.matchUpId === dualMatchUp.matchUpId) ?? dualMatchUp;
  return removeDoubleExit({ ...params, matchUp: rawDual });
}
