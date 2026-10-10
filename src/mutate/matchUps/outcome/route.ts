import { isDirectingMatchUpStatus, isNonDirectingMatchUpStatus } from '@Query/matchUp/checkStatusType';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { isDoubleExit, isExit } from '@Validators/isExit';

// constants and types
import type { OutcomeRequest, OutcomeView, Route } from './types';
import {
  ABANDONED,
  BYE,
  CANCELLED,
  IN_PROGRESS,
  INCOMPLETE,
  SUSPENDED,
  TO_BE_PLAYED,
} from '@Constants/matchUpStatusConstants';

/**
 * The outcome pipeline, v2: the routes (§ 3 of the spec), as one pure function.
 *
 * `chooseRoute(request, view)` names the one path an accepted call takes. The dispatch comes first,
 * on two facts: whether downstream is active and whether this matchUp has propagated (a winner or
 * a double exit); a matchUp that has sent nothing downstream cannot invalidate anything there, so
 * a first entry always takes the propagating branch. Within that branch the order is v1's measured
 * order, which the spec's table states.
 */

const APPLY_VALUES: Route = 'apply-values';
const PRESERVE_SCORE = new Set<string | undefined>([IN_PROGRESS, SUSPENDED, CANCELLED, ABANDONED, INCOMPLETE]);

export function dualWinningSideChange(request: OutcomeRequest, view: OutcomeView): boolean {
  if (view.isTeam)
    return !!request.flags.enableAutoCalc && view.dualProjection?.projectedWinningSide !== view.existing.winningSide;
  return !!view.line && view.line.projectedWinningSide !== view.line.dualWinningSide;
}

/** § 3's table: `attemptToSetMatchUpStatus` */
function statusRoute(request: OutcomeRequest, view: OutcomeView): Route {
  const { matchUpStatus } = request;
  const { existing, line, draw } = view;
  const directing = isDirectingMatchUpStatus({ matchUpStatus });
  const nonDirecting = !!matchUpStatus && isNonDirectingMatchUpStatus({ matchUpStatus });
  if (!directing && !nonDirecting) return 'refused';
  const doubleExit = isDoubleExit(matchUpStatus);
  if (doubleExit && existing.matchUpStatus === matchUpStatus && !existing.winningSide) return 'noop';
  if (line || (existing.winningSide && directing && !doubleExit)) return 'only-score';
  if (existing.winningSide && doubleExit) return 'completed-to-double-exit';
  if (existing.winningSide) return 'existing-winner-removed';
  if (nonDirecting) return 'clear';
  if (matchUpStatus === BYE) return draw.includesBye ? 'bye' : 'refused';
  if (doubleExit) return 'double-exit';
  if (draw.teamRoundRobin) return 'team-round-robin';
  if (request.flags.propagateExitStatus) return 'propagating';
  return 'refused';
}

/** `noDownstreamDependencies`: the branch a first entry, or a matchUp nothing depends on, takes */
function noDownstreamRoute(request: OutcomeRequest, view: OutcomeView): Route {
  const { matchUpStatus, winningSide, score, flags } = request;
  const { existing, line } = view;
  const scoreHasValue = !!checkScoreHasValue({ score });
  const scoreWithNoWinner =
    scoreHasValue &&
    !isDoubleExit(matchUpStatus) &&
    !PRESERVE_SCORE.has(matchUpStatus) &&
    (line ? !line.projectedWinningSide : !winningSide);
  const removeWinningSide =
    (!!line && !!line.dualWinningSide && !line.projectedWinningSide) ||
    (!!existing.winningSide && !winningSide && !scoreHasValue);
  if (removeWinningSide && winningSide && line) return 'line-score';
  const triggerDual = [CANCELLED, ABANDONED].includes(matchUpStatus as string) && dualWinningSideChange(request, view);
  if (winningSide || triggerDual || (flags.propagateExitStatus && isExit(matchUpStatus))) return 'winner';
  if (scoreWithNoWinner) return 'remove-directed';
  if (matchUpStatus && matchUpStatus !== TO_BE_PLAYED) return statusRoute(request, view);
  if (removeWinningSide) return 'remove-directed';
  return 'clear-score';
}

export function chooseRoute(request: OutcomeRequest, view: OutcomeView): Route {
  const { winningSide, matchUpStatus, flags } = request;
  const { existing, line } = view;
  if (!view.activeDownstream && !winningSide && view.draw.rotatingPartners) return APPLY_VALUES;
  const dualChange = dualWinningSideChange(request, view);
  const validSwap =
    !view.isTeam && !dualChange && !!winningSide && !!existing.winningSide && existing.winningSide !== winningSide;
  if (flags.allowChangePropagation && validSwap && existing.roundPosition) return 'swap';

  const hasPropagated = !!existing.winningSide || isDoubleExit(existing.matchUpStatus);
  if (!view.activeDownstream || !hasPropagated) return noDownstreamRoute(request, view);

  const projected = view.isTeam && flags.enableAutoCalc ? view.dualProjection?.projectedWinningSide : undefined;
  const matchUpWinner = (winningSide && !view.matchUpTieId) || line?.projectedWinningSide || projected;
  if (matchUpWinner) return APPLY_VALUES; // the refusal function has already let this through
  if (isDirectingMatchUpStatus({ matchUpStatus }) || line?.autoCalcDisabled) return APPLY_VALUES;
  return 'refused';
}
