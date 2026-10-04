import { isDirectingMatchUpStatus } from '@Query/matchUp/checkStatusType';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { dualWinningSideChange } from './route';

// constants and types
import type { MatchUpWrite, OutcomeRequest, OutcomeView, Route } from './types';
import type { MatchUp, MatchUpStatusUnion } from '@Types/tournamentTypes';
import {
  ABANDONED,
  AWAITING_RESULT,
  BYE,
  CANCELLED,
  COMPLETED,
  completedMatchUpStatuses,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  IN_PROGRESS,
  INCOMPLETE,
  SUSPENDED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

/**
 * The outcome pipeline, v2: the write (§ 4 of the spec), as a plan.
 *
 * `planWrite(request, view, route)` says what the matchUp ITSELF holds once the route has written:
 * status, winner, score, format, codes, `scoredTime`. It is what every route funnels into
 * `applyScoreAndStatus` with, resolved from the spec's rules, so the differential can ask the
 * matchUp after v1 ran whether v1 wrote the same thing. What a route does to OTHER matchUps
 * (direction, exit propagation, the double-exit cascade) is S2c and is not planned here.
 *
 * `undefined` means the route's write on this matchUp is not predicted yet (swap, the cascade,
 * TEAM duals whose auto-calc rewrites the request), and the differential records it as deferred.
 */

type WriteArgs = {
  matchUpStatus?: MatchUpStatusUnion;
  winningSide?: number;
  removeWinningSide?: boolean;
  removeScore?: boolean;
  score?: OutcomeRequest['score'];
  matchUpStatusCodes?: OutcomeRequest['matchUpStatusCodes'];
};

const NON_PROGRESS = new Set<string>([AWAITING_RESULT, SUSPENDED, INCOMPLETE]);

/** § 4 rules 1, 2 and 3, then `applyInProgressStatus`, then `scoredTime` (rule 4) */
function applyScoreAndStatus(args: WriteArgs, request: OutcomeRequest, view: OutcomeView): MatchUpWrite {
  const { existing } = view;
  const blank = args.matchUpStatus === WALKOVER || args.matchUpStatus === DOUBLE_WALKOVER || !!args.removeScore;
  const score = blank
    ? { scoreStringSide1: '', scoreStringSide2: '', sets: undefined }
    : (args.score ?? existing.score);
  let matchUpStatus = args.matchUpStatus ?? (blank ? TO_BE_PLAYED : existing.matchUpStatus);
  // a write keeps the format stored on the matchUp (a clear included) and writes a new one if given
  const matchUpFormat = request.matchUpFormat ?? existing.ownMatchUpFormat;
  const matchUpStatusCodes = args.matchUpStatusCodes ?? (blank ? [] : existing.matchUpStatusCodes);
  // a call's `winningSide` is 1, 2 or absent by the time it is written (row 3 refuses anything else)
  const winningSide = args.removeWinningSide
    ? undefined
    : args.winningSide || (blank ? undefined : existing.winningSide);
  const scoreHasValue = !!checkScoreHasValue({ score });
  if (
    args.matchUpStatus &&
    !winningSide &&
    scoreHasValue &&
    !completedMatchUpStatuses.includes(args.matchUpStatus) &&
    !NON_PROGRESS.has(args.matchUpStatus)
  )
    matchUpStatus = IN_PROGRESS;
  const scored =
    !!winningSide || scoreHasValue || (!!matchUpStatus && completedMatchUpStatuses.includes(matchUpStatus));
  return {
    matchUpStatus,
    winningSide,
    scoreStringSide1: score?.scoreStringSide1,
    scoreStringSide2: score?.scoreStringSide2,
    sets: score?.sets as unknown[] | undefined,
    matchUpFormat,
    matchUpStatusCodes,
    scoredTime: scored,
  };
}

/** a status the caller did not name: a winner makes it COMPLETED, no winner leaves it INCOMPLETE */
const decidedOrIncomplete = (winningSide?: number): MatchUpStatusUnion => (winningSide ? COMPLETED : INCOMPLETE);

/** `attemptToModifyScore`: the write behind `winner` */
function winnerWrite(request: OutcomeRequest, view: OutcomeView): WriteArgs {
  const { matchUpStatus, winningSide, matchUpStatusCodes, score } = request;
  const statusValid =
    isDirectingMatchUpStatus({ matchUpStatus }) ||
    ([CANCELLED, ABANDONED].includes(matchUpStatus as string) && !!view.line) ||
    !!view.line?.autoCalcDisabled;
  return {
    matchUpStatus: statusValid ? matchUpStatus : decidedOrIncomplete(winningSide),
    matchUpStatusCodes: (statusValid && matchUpStatusCodes) || [],
    removeScore: matchUpStatus === WALKOVER,
    winningSide,
    score,
  };
}

/** `noDownstreamDependencies`' `removeScore`, read by its two removal routes */
function removalRemovesScore(request: OutcomeRequest, view: OutcomeView): boolean {
  const { matchUpStatus } = request;
  return !view.draw.timedTie && ![INCOMPLETE, ABANDONED].includes((matchUpStatus ?? INCOMPLETE) as string);
}

export function planWrite(request: OutcomeRequest, view: OutcomeView, route: Route): MatchUpWrite | undefined {
  const { matchUpStatus, winningSide, matchUpStatusCodes, score } = request;
  const asIs: WriteArgs = { matchUpStatus, winningSide, matchUpStatusCodes, score };
  switch (route) {
    case 'refused':
      return undefined;
    // a line re-scored under a decided dual whose decision it undoes: the dual's direction is taken
    // back, then the line is written with the call's score and winner, COMPLETED when the call names a
    // winner and no status (the v1 fix that came with this plan: it had ended IN_PROGRESS with a winner)
    case 'line-score':
      return applyScoreAndStatus(
        { ...asIs, matchUpStatus: matchUpStatus ?? (winningSide ? COMPLETED : undefined) },
        request,
        view,
      );
    case 'noop':
      return applyScoreAndStatus({}, request, view);
    case 'winner':
      return applyScoreAndStatus(winnerWrite(request, view), request, view);
    // the swap re-scores in place: `swapWinnerLoser` exchanges the two paths downstream, then writes
    // the call's result through the same write point as every other route
    case 'swap':
    case 'only-score':
    case 'team-round-robin':
    case 'propagating':
      return applyScoreAndStatus(asIs, request, view);
    case 'remove-directed':
      return applyScoreAndStatus(
        {
          ...asIs,
          matchUpStatus: matchUpStatus ?? TO_BE_PLAYED,
          removeWinningSide: true,
          removeScore: removalRemovesScore(request, view),
        },
        request,
        view,
      );
    case 'existing-winner-removed':
      return applyScoreAndStatus(
        { ...asIs, matchUpStatus: matchUpStatus ?? TO_BE_PLAYED, removeWinningSide: true },
        request,
        view,
      );
    case 'clear':
      return applyScoreAndStatus(
        {
          ...asIs,
          matchUpStatus: matchUpStatus ?? TO_BE_PLAYED,
          removeScore: [CANCELLED, WALKOVER].includes(matchUpStatus as string),
        },
        request,
        view,
      );
    case 'bye':
      return {
        ...applyScoreAndStatus({}, request, view),
        matchUpStatus: BYE,
        matchUpStatusCodes: [],
        scoredTime: false,
      };
    case 'double-exit':
      return applyScoreAndStatus({ ...asIs, removeScore: true }, request, view);
    // a decided matchUp turned into a double exit: what it directed is taken back (the winner goes),
    // then the double exit is written and advanced as a fresh one
    // CA, 2026-10-02: a DOUBLE_DEFAULT KEEPS the score the matchUp had, finished or not, unless the call
    // brings one: both players can be defaulted after the last ball, and the score is the record of
    // what was played. A DOUBLE_WALKOVER says the match was not played, so it blanks the score; one
    // entered over a completed result is the director's to correct.
    case 'completed-to-double-exit':
      return applyScoreAndStatus(
        { ...asIs, removeWinningSide: true, removeScore: matchUpStatus !== DOUBLE_DEFAULT },
        request,
        view,
      );
    case 'clear-score':
      return applyScoreAndStatus({ ...asIs, removeScore: true }, request, view);
    case 'apply-values': {
      const removeWinningSide =
        !!view.line && !!view.existing.winningSide && !winningSide && !checkScoreHasValue({ score });
      const lineStatus = removeWinningSide ? TO_BE_PLAYED : decidedOrIncomplete(winningSide);
      const status = matchUpStatus ?? (view.line ? lineStatus : COMPLETED);
      return applyScoreAndStatus(
        {
          ...asIs,
          matchUpStatus: status,
          removeWinningSide,
          removeScore: [CANCELLED, WALKOVER].includes(status as string),
        },
        request,
        view,
      );
    }
  }
}

/** the fields of the matchUp v1 wrote, in the plan's shape, for the comparison */
export function observeWrite(matchUp: MatchUp): MatchUpWrite {
  return {
    matchUpStatus: matchUp.matchUpStatus,
    winningSide: matchUp.winningSide,
    scoreStringSide1: matchUp.score?.scoreStringSide1,
    scoreStringSide2: matchUp.score?.scoreStringSide2,
    sets: matchUp.score?.sets,
    matchUpFormat: matchUp.matchUpFormat,
    matchUpStatusCodes: matchUp.matchUpStatusCodes,
    scoredTime: !!matchUp.schedule?.scoredTime,
  };
}

export { dualWinningSideChange };
