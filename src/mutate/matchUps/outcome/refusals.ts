import { isDirectingMatchUpStatus, isNonDirectingMatchUpStatus } from '@Query/matchUp/checkStatusType';
import { getMatchUpStatusScopeViolation } from '@Query/matchUps/getMatchUpStatusScopeViolation';
import { rewritesCarriedExit } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { validateScore } from '@Validators/validateScore';
import { isDoubleExit } from '@Validators/isExit';

// constants and types
import type { OutcomeRequest, OutcomeView, Refusal } from './types';
import type { ErrorType } from '@Constants/errorConditionConstants';
import {
  CANNOT_CHANGE_FEED_ELIGIBILITY,
  CANNOT_CHANGE_OUTCOME,
  CANNOT_CHANGE_WINNING_SIDE,
  INCOMPATIBLE_MATCHUP_STATUS,
  INVALID_MATCHUP_STATUS,
  INVALID_VALUES,
  INVALID_WINNING_SIDE,
  MATCHUP_NOT_FOUND,
  MATCHUP_STATUS_OUT_OF_SCOPE,
  MISSING_DRAW_DEFINITION,
  MISSING_MATCHUP_ID,
  NO_VALID_ACTIONS,
  PROPAGATED_EXITS_DOWNSTREAM,
  UNRECOGNIZED_MATCHUP_FORMAT,
} from '@Constants/errorConditionConstants';
import {
  ABANDONED,
  AWAITING_RESULT,
  BYE,
  CANCELLED,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  IN_PROGRESS,
  INCOMPLETE,
  participantsRequiredMatchUpStatuses,
  SUSPENDED,
  TO_BE_PLAYED,
  validMatchUpStatuses,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

/**
 * The outcome pipeline, v2: the refusals (§ 2 of the spec), as one pure function.
 *
 * `refuseOutcome(request, view)` returns the first refusal or `undefined`. It writes nothing and
 * reads nothing but its two arguments, so a port can run it on the view alone. The ORDER is v1's
 * measured order, which the spec's table approximates: the TEAM clause of row 5 is asked after row
 * 10, and the participants clause of row 6 after row 11 (both corrected on the page with this
 * module). Rows 16 to 18 are raised by the writes and are not decided here.
 */

const LIVE = new Set<string>([IN_PROGRESS, SUSPENDED]);
const NON_RESULT = new Set<string>([CANCELLED, INCOMPLETE, ABANDONED, TO_BE_PLAYED]);
const EXITS = new Set<string>([WALKOVER, DEFAULTED, DOUBLE_WALKOVER, DOUBLE_DEFAULT]);

const refuse = (row: number, error: ErrorType, extra: Omit<Refusal, 'code' | 'error' | 'row'> = {}): Refusal => ({
  code: error.code,
  error,
  row,
  ...extra,
});

const isClear = (request: OutcomeRequest): boolean =>
  request.matchUpStatus === TO_BE_PLAYED &&
  request.score?.scoreStringSide1 === '' &&
  request.score?.scoreStringSide2 === '' &&
  !request.winningSide;

/** rows 1 to 4: the call itself */
function refuseCall(request: OutcomeRequest, view: OutcomeView): Refusal | undefined {
  if (!request.matchUpId) return refuse(1, MISSING_MATCHUP_ID);
  if (!view.hasDrawDefinition) return refuse(2, MISSING_DRAW_DEFINITION);
  // a winningSide is 1 or 2, or absent; 0 is refused (CA, 2026-10-01)
  if (request.winningSide != null && ![1, 2].includes(request.winningSide)) return refuse(3, INVALID_WINNING_SIDE);
  if (!view.formatRecognized) return refuse(4, UNRECOGNIZED_MATCHUP_FORMAT);
  return undefined;
}

/** rows 5 to 8: the status named, and the matchUp found */
function refuseStatus(request: OutcomeRequest, view: OutcomeView): Refusal | undefined {
  const { matchUpStatus, winningSide } = request;
  if (matchUpStatus && NON_RESULT.has(matchUpStatus) && winningSide)
    return refuse(5, INVALID_VALUES, { context: { matchUpStatus, winningSide } });
  if (matchUpStatus !== undefined && !validMatchUpStatuses.includes(matchUpStatus))
    return refuse(6, INVALID_MATCHUP_STATUS, { info: 'matchUpStatus does not exist' });
  const scope = getMatchUpStatusScopeViolation({ drawType: view.drawType, matchUpStatus });
  if (scope) return refuse(7, MATCHUP_STATUS_OUT_OF_SCOPE, { info: scope });
  if (!view.found) return refuse(8, MATCHUP_NOT_FOUND);
  return undefined;
}

/** row 9, the three conditions asked before the draw is consulted, then row 10 */
function refuseAgainstExisting(request: OutcomeRequest, view: OutcomeView): Refusal | undefined {
  const { matchUpStatus, winningSide, score } = request;
  const { existing } = view;

  if ((existing.winningSide || winningSide) && matchUpStatus === BYE)
    return refuse(9, INCOMPATIBLE_MATCHUP_STATUS, {
      info: 'Cannot have Bye with winningSide',
      context: { matchUpStatus },
    });

  const live = !!matchUpStatus && LIVE.has(matchUpStatus);
  const carriesResult = !!winningSide || checkScoreHasValue({ score });
  if (live && !carriesResult && existing.validWinningScore)
    return refuse(9, INCOMPATIBLE_MATCHUP_STATUS, {
      info: 'Cannot revert a COMPLETED matchUp with a validated winning score to a live status; submit a corrected outcome or clear the result first',
      context: { matchUpStatus, currentMatchUpStatus: existing.matchUpStatus },
    });

  if (live && carriesResult && !view.isTeam) {
    if (winningSide)
      return refuse(9, INCOMPATIBLE_MATCHUP_STATUS, {
        info: 'A winningSide implies completion and cannot be set with a live matchUpStatus (IN_PROGRESS / SUSPENDED)',
        context: { matchUpStatus, winningSide },
      });
    if (view.impliedWinningSide)
      return refuse(9, INCOMPATIBLE_MATCHUP_STATUS, {
        info: 'Score implies a completed outcome and cannot be set with a live matchUpStatus (IN_PROGRESS / SUSPENDED)',
        context: { matchUpStatus, calculatedWinningSide: view.impliedWinningSide },
      });
  }

  // row 20, checked here: a carried or produced exit is changed at its ORIGIN (CA, 2026-10-03)
  const rewrite = rewritesCarriedExit({
    existingWinningSide: existing.winningSide,
    existingStatus: existing.matchUpStatus,
    carriedExit: existing.carriedExit,
    matchUpStatus,
    winningSide,
    score,
  });
  if (rewrite)
    return refuse(20, CANNOT_CHANGE_OUTCOME, {
      info: 'a carried exit is changed at its origin',
      context: { matchUpStatus: existing.matchUpStatus },
    });

  if (view.propagatedExitStands && isClear(request)) return refuse(10, PROPAGATED_EXITS_DOWNSTREAM);
  return undefined;
}

/** the TEAM dual under auto-calc, row 5's TEAM clause, row 11 */
function refuseScore(request: OutcomeRequest, view: OutcomeView): Refusal | undefined {
  const { matchUpStatus, winningSide, score, flags } = request;

  if (view.isTeam && flags.enableAutoCalc && view.activeDownstream) {
    const projected = view.dualProjection?.projectedWinningSide;
    if (projected !== view.existing.winningSide)
      return refuse(14, CANNOT_CHANGE_WINNING_SIDE, { context: { winningSide, projectedWinningSide: projected } });
  }

  if (view.isTeam && matchUpStatus === AWAITING_RESULT)
    return refuse(5, INVALID_VALUES, { info: 'Not supported for matchUpType: TEAM' });

  if (score && !view.isTeam && !flags.disableScoreValidation) {
    const result = validateScore({
      existingMatchUpStatus: view.existing.matchUpStatus,
      matchUpFormat: request.matchUpFormat ?? view.existing.matchUpFormat,
      matchUpStatus,
      winningSide,
      score,
    });
    if (result.error) return refuse(11, result.error, { info: result.info });
  }
  return undefined;
}

/** § 2.1 (row 6's second clause), row 12, and row 9's two downstream conditions */
function refuseAgainstDraw(request: OutcomeRequest, view: OutcomeView): Refusal | undefined {
  const { matchUpStatus, winningSide, flags } = request;
  const { participants } = view;

  if (participants.requireForScoring) {
    const exitWithOne =
      !!matchUpStatus &&
      EXITS.has(matchUpStatus) &&
      participants.count === 1 &&
      (!!flags.propagatingExit || !winningSide || participants.exitAwardable) &&
      // a direct double exit needs both seats reached (CA 2026-10-04); only the cascade's own write is waived
      (!!flags.propagatingExit || !isDoubleExit(matchUpStatus));
    const directing = matchUpStatus ? participantsRequiredMatchUpStatuses.includes(matchUpStatus) : !!winningSide;
    if (!exitWithOne && directing && !participants.required)
      return refuse(6, INVALID_MATCHUP_STATUS, {
        info: 'matchUpStatus requires assigned participants',
        context: { matchUpStatus, requiredParticipants: participants.required },
      });
  }

  if (view.feedEligibilityBlockedBy)
    return refuse(12, CANNOT_CHANGE_FEED_ELIGIBILITY, {
      info: 'the loser of the linked round has already been directed under the previous outcome',
      context: {
        currentMatchUpStatus: view.existing.matchUpStatus,
        blockingMatchUpId: view.feedEligibilityBlockedBy,
        matchUpStatus,
      },
    });

  if (!view.matchUpTieId) {
    const nonDirecting = !!matchUpStatus && isNonDirectingMatchUpStatus({ matchUpStatus });
    if (view.activeDownstream && !winningSide && (nonDirecting || isDoubleExit(matchUpStatus)))
      return refuse(9, INCOMPATIBLE_MATCHUP_STATUS, { context: { activeDownstream: true, winningSide } });
    const directing = isDirectingMatchUpStatus({ matchUpStatus });
    if (winningSide && winningSide === view.existing.winningSide && matchUpStatus && !directing)
      return refuse(9, INCOMPATIBLE_MATCHUP_STATUS, {
        info: 'winningSide must include directing matchUpStatus',
        context: { directingMatchUpStatus: directing, matchUpStatus },
      });
  }
  return undefined;
}

/** § 3's dispatch: rows 13 to 15, and the swap that is accepted instead of refused */
function refuseDispatch(request: OutcomeRequest, view: OutcomeView): Refusal | undefined {
  const { winningSide, matchUpStatus, flags } = request;
  const { existing, line } = view;
  const dualWinningSideChange = view.isTeam
    ? flags.enableAutoCalc && view.dualProjection?.projectedWinningSide !== existing.winningSide
    : !!line && line.projectedWinningSide !== line.dualWinningSide;

  const validSwap = !view.isTeam && !dualWinningSideChange && !!winningSide && !!existing.winningSide;
  if (flags.allowChangePropagation && validSwap && existing.winningSide !== winningSide && existing.roundPosition)
    return undefined;

  if (line && isDoubleExit(line.dualMatchUpStatus) && view.activeDownstream)
    return refuse(13, CANNOT_CHANGE_OUTCOME, {
      info: 'the dual holds a double exit whose produced result has been played on',
      context: { dualMatchUpId: line.dualMatchUpId, dualMatchUpStatus: line.dualMatchUpStatus },
    });

  const hasPropagated = !!existing.winningSide || isDoubleExit(existing.matchUpStatus);
  if (!view.activeDownstream || !hasPropagated) return undefined;

  const projected = view.isTeam && flags.enableAutoCalc ? view.dualProjection?.projectedWinningSide : undefined;
  const matchUpWinner = (winningSide && !view.matchUpTieId) || line?.projectedWinningSide || projected;
  if (matchUpWinner) {
    const effectiveWinningSide = view.isTeam && flags.enableAutoCalc ? projected : winningSide;
    if (effectiveWinningSide === existing.winningSide || (view.matchUpTieId && !dualWinningSideChange))
      return undefined;
    return refuse(
      existing.winningSide ? 14 : 13,
      existing.winningSide ? CANNOT_CHANGE_WINNING_SIDE : CANNOT_CHANGE_OUTCOME,
      {
        context: { winningSide: effectiveWinningSide },
      },
    );
  }
  if (isDirectingMatchUpStatus({ matchUpStatus }) || line?.autoCalcDisabled) return undefined;
  return refuse(15, NO_VALID_ACTIONS);
}

export function refuseOutcome(request: OutcomeRequest, view: OutcomeView): Refusal | undefined {
  return (
    refuseCall(request, view) ??
    refuseStatus(request, view) ??
    refuseAgainstExisting(request, view) ??
    refuseScore(request, view) ??
    refuseAgainstDraw(request, view) ??
    refuseDispatch(request, view)
  );
}
