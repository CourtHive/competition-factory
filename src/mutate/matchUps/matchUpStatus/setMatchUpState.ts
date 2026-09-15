import { feedEligibilityChange } from '@Mutate/matchUps/matchUpStatus/feedEligibilityGuard';
import { noDownstreamDependencies } from '@Mutate/drawDefinitions/matchUpGovernor/noDownstreamDependencies';
import { correctDecidedOutcome } from '@Mutate/matchUps/drawPositions/correctDecidedOutcome';
import { swapWinnerLoser } from '@Mutate/matchUps/drawPositions/swapWinnerLoser';
import { generateTieMatchUpScore } from '@Assemblies/generators/tieMatchUpScore/generateTieMatchUpScore';
import { isDirectingMatchUpStatus, isNonDirectingMatchUpStatus } from '@Query/matchUp/checkStatusType';
import { addMatchUpScheduleItems } from '@Mutate/matchUps/schedule/scheduleItems/scheduleItems';
import { hasPropagatedExitDownstream } from '@Query/drawDefinition/hasPropagatedExitDownstream';
import { getProjectedDualWinningSide } from '@Query/matchUp/getProjectedDualWinningSide';
import { updateTieMatchUpScore } from '@Mutate/matchUps/score/updateTieMatchUpScore';

import { getMatchUpStatusScopeViolation } from '@Query/matchUps/getMatchUpStatusScopeViolation';
import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { ensureSideLineUps } from '@Mutate/matchUps/lineUps/ensureSideLineUps';
import { modifyMatchUpScore } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { isActiveDownstream } from '@Query/drawDefinition/isActiveDownstream';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { decorateResult } from '@Functions/global/decorateResult';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { validateScore } from '@Validators/validateScore';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { findStructure } from '@Acquire/findStructure';
import { isObject } from '@Tools/objects';

// constants and types
import { DrawDefinition, Event, MatchUpStatusUnion, Tournament } from '@Types/tournamentTypes';
import { POLICY_TYPE_PROGRESSION, POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { DISABLE_AUTO_CALC } from '@Constants/extensionConstants';
import { QUALIFYING } from '@Constants/drawDefinitionConstants';
import { PolicyDefinitions } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { TEAM } from '@Constants/matchUpTypes';
import {
  CANNOT_CHANGE_FEED_ELIGIBILITY,
  CANNOT_CHANGE_WINNING_SIDE,
  INCOMPATIBLE_MATCHUP_STATUS,
  INVALID_MATCHUP_STATUS,
  INVALID_VALUES,
  MATCHUP_NOT_FOUND,
  MATCHUP_STATUS_OUT_OF_SCOPE,
  MISSING_DRAW_DEFINITION,
  NO_VALID_ACTIONS,
  PROPAGATED_EXITS_DOWNSTREAM,
} from '@Constants/errorConditionConstants';
import {
  ABANDONED,
  AWAITING_RESULT,
  BYE,
  CANCELLED,
  COMPLETED,
  completedMatchUpStatuses,
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

// Reverting a validated-COMPLETED matchUp to one of these "still live / paused"
// statuses (without providing a new outcome) would silently strip its result and
// un-advance the draw — the class of bug behind stranded LIVE-with-score matches.
const REVERT_GUARDED_STATUSES = new Set([IN_PROGRESS, SUSPENDED]);

// NOTE: Internal method for setting matchUpStatus or score and winningSide, not to be confused with setMatchUpStatus

type SetMatchUpStateArgs = {
  tournamentRecords?: { [key: string]: Tournament };
  policyDefinitions?: PolicyDefinitions;
  appliedPolicies?: PolicyDefinitions;
  matchUpStatus?: MatchUpStatusUnion;
  allowChangePropagation?: boolean;
  disableScoreValidation?: boolean;
  projectedWinningSide?: number;
  propagateExitStatus?: boolean;
  /** set ONLY by `progressExitStatus` — see `checkParticipants` */
  propagatingExit?: boolean;
  propagateRetirementAsExit?: boolean;
  matchUpStatusCodes?: string[];
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  autoCalcDisabled?: boolean;
  disableAutoCalc?: boolean;
  enableAutoCalc?: boolean;
  matchUpFormat?: string;
  matchUpTieId?: string;
  tieMatchUpId?: string;
  removeScore?: boolean;
  winningSide?: number;
  matchUpId: string;
  schedule?: any;
  notes?: string;
  outcome?: any;
  event?: Event;
  score?: any;
};

export function setMatchUpState(params: SetMatchUpStateArgs): any {
  const stack = 'setMatchUpStatus';

  // always clear score if DOUBLE_WALKOVER or WALKOVER
  if (params.matchUpStatus && [WALKOVER, DOUBLE_WALKOVER].includes(params.matchUpStatus)) params.score = undefined;

  const {
    disableScoreValidation,
    propagateExitStatus,
    tournamentRecord,
    disableAutoCalc,
    enableAutoCalc,
    drawDefinition,
    matchUpStatus,
    winningSide,
    matchUpId,
    event,
    score,
  } = params;

  const validationError = validateMatchUpStateInputs({ drawDefinition, matchUpStatus, winningSide });
  if (validationError) return validationError;

  const resolved = resolveMatchUpAndContext({
    tournamentRecord,
    drawDefinition,
    matchUpId,
    event,
    matchUpStatus,
    winningSide,
  });
  if (resolved.error) return resolved;

  const {
    matchUp,
    inContextMatchUp,
    inContextDrawMatchUps,
    matchUpsMap,
    structure,
    isTeam,
    assignedDrawPositions,
    matchUpTieId,
  } = resolved;

  const revertError = checkCompletedRevertGuard({
    matchUp,
    matchUpStatus,
    winningSide,
    score,
    structure,
    drawDefinition,
    event,
  });
  if (revertError) return revertError;

  const impliedCompletionError = checkImpliedCompletionGuard({
    matchUpStatus,
    winningSide,
    score,
    isTeam,
    matchUp,
    structure,
    drawDefinition,
    event,
  });
  if (impliedCompletionError) return impliedCompletionError;

  const targetData = positionTargets({
    matchUpId: matchUpTieId || matchUpId,
    inContextDrawMatchUps,
    drawDefinition,
  });

  Object.assign(params, {
    inContextDrawMatchUps,
    inContextMatchUp,
    matchUpTieId,
    matchUpsMap,
    targetData,
    structure,
    matchUp,
  });

  const isClearScore =
    matchUpStatus === TO_BE_PLAYED && score?.scoreStringSide1 === '' && score?.scoreStringSide2 === '' && !winningSide;

  const propagatedExitDownStream = hasPropagatedExitDownstream(params);

  if (propagatedExitDownStream && isClearScore) {
    return { error: PROPAGATED_EXITS_DOWNSTREAM };
  }

  const activeDownstream = isActiveDownstream(params);

  let dualWinningSideChange;
  if (isTeam) {
    const teamResult: any = handleTeamAutoCalc({
      tournamentRecord,
      inContextMatchUp,
      activeDownstream,
      disableAutoCalc,
      enableAutoCalc,
      drawDefinition,
      winningSide,
      matchUpsMap,
      structure,
      matchUp,
      params,
      event,
    });
    if (teamResult?.error) return teamResult;
    if (teamResult?.dualWinningSideChange !== undefined) dualWinningSideChange = teamResult.dualWinningSideChange;
  }

  if (isTeam && matchUpStatus && [AWAITING_RESULT].includes(matchUpStatus)) {
    return {
      info: 'Not supported for matchUpType: TEAM',
      error: INVALID_VALUES,
    };
  }

  if (score && !isTeam && !disableScoreValidation) {
    const matchUpFormat =
      matchUp.matchUpFormat ?? structure?.matchUpFormat ?? drawDefinition?.matchUpFormat ?? event?.matchUpFormat;

    const result = validateScore({
      existingMatchUpStatus: matchUp.matchUpStatus,
      matchUpFormat,
      matchUpStatus,
      winningSide,
      score,
    });
    if (result.error) return result;
  }

  const appliedPolicies =
    getAppliedPolicies({
      policyTypes: [POLICY_TYPE_PROGRESSION, POLICY_TYPE_SCORING],
      tournamentRecord,
      drawDefinition,
      event,
    })?.appliedPolicies ?? {};

  if (isObject(params.policyDefinitions)) Object.assign(appliedPolicies, params.policyDefinitions);

  const participantCheck = checkParticipants({
    propagatingExit: params.propagatingExit,
    assignedDrawPositions,
    propagateExitStatus,
    inContextMatchUp,
    appliedPolicies,
    drawDefinition,
    matchUpStatus,
    winningSide,
    structure,
    matchUp,
  });
  if (participantCheck?.error) return participantCheck;

  const { qualifierAdvancing, qualifierChanging, removingQualifier } = resolveQualifyingContext({
    inContextMatchUp,
    winningSide,
    matchUp,
    params,
  });

  Object.assign(params, {
    qualifierAdvancing,
    qualifierChanging,
    removingQualifier,
    appliedPolicies,
  });

  if (matchUpTieId) {
    const tieContext = resolveTieMatchUpContext({
      drawDefinition,
      matchUpStatus,
      matchUpTieId,
      matchUpsMap,
      winningSide,
      structure,
      matchUp,
      event,
      score,
    });
    if (tieContext) {
      dualWinningSideChange = tieContext.dualWinningSideChange;
      Object.assign(params, tieContext);
    }
  }

  /**
   * Checked HERE, above every mutation, so the refusal cannot land on a half-changed draw — the
   * property `ERROR_IMPLIES_NO_MUTATION` asserts, and the reason this is not inside
   * `winningSideWithDownstreamDependencies` where an earlier attempt put it.
   */
  const eligibilityChange = feedEligibilityChange({
    inContextDrawMatchUps,
    drawDefinition,
    matchUpStatus,
    winningSide,
    structure,
    matchUp,
    score,
  });
  if (eligibilityChange) {
    return decorateResult({
      result: { error: CANNOT_CHANGE_FEED_ELIGIBILITY },
      info: 'the loser of the linked round has already been directed under the previous outcome',
      context: {
        currentMatchUpStatus: matchUp.matchUpStatus,
        blockingMatchUpId: eligibilityChange.sourceRoundMatchUpId,
        matchUpStatus,
      },
      stack: 'feedEligibility',
    });
  }

  const downstreamError = checkDownstreamCompatibility({
    matchUpTieId,
    activeDownstream,
    matchUpStatus,
    winningSide,
    matchUp,
  });
  if (downstreamError) return downstreamError;

  return resolveAndApplyOutcome({ params, isTeam, dualWinningSideChange, activeDownstream, stack });
}

// Refuse to revert a COMPLETED matchUp that carries a *validated* winning score
// back to a live status (IN_PROGRESS / SUSPENDED) when no new outcome is supplied.
// A new winningSide or an applied score is treated as a correction/re-score and is
// allowed. RETIRED/DEFAULTED (irregular endings whose scores do not validate as a
// completed outcome) stay reversible. To reopen a completed match, submit a new
// outcome or clear the result first (removeWinningSide / TO_BE_PLAYED).
function checkCompletedRevertGuard({ matchUp, matchUpStatus, winningSide, score, structure, drawDefinition, event }) {
  if (!matchUpStatus || !REVERT_GUARDED_STATUSES.has(matchUpStatus)) return undefined;
  if (winningSide || checkScoreHasValue({ score })) return undefined;
  if (matchUp?.matchUpStatus !== COMPLETED || !matchUp?.winningSide) return undefined;

  const matchUpFormat =
    matchUp.matchUpFormat ?? structure?.matchUpFormat ?? drawDefinition?.matchUpFormat ?? event?.matchUpFormat;
  const { validMatchUpOutcome } = analyzeMatchUp({ matchUp, matchUpFormat });
  if (!validMatchUpOutcome) return undefined;

  return decorateResult({
    result: { error: INCOMPATIBLE_MATCHUP_STATUS },
    info: 'Cannot revert a COMPLETED matchUp with a validated winning score to a live status; submit a corrected outcome or clear the result first',
    context: { matchUpStatus, currentMatchUpStatus: matchUp.matchUpStatus },
    stack: 'setMatchUpStatus',
  });
}

// Refuse a submission whose score/winner implies a completed outcome while the
// requested matchUpStatus is a live/paused status (IN_PROGRESS / SUSPENDED). A
// decisive score (one that resolves a winner under the matchUpFormat) or an
// explicit winningSide cannot coexist with "still playing". Excludes TEAM
// matchUps, whose tie score is auto-calculated. Non-decisive in-progress scores
// (e.g. a single set won in a best-of-3) remain valid with IN_PROGRESS.
function checkImpliedCompletionGuard({
  matchUpStatus,
  winningSide,
  score,
  isTeam,
  matchUp,
  structure,
  drawDefinition,
  event,
}) {
  if (isTeam || !matchUpStatus || !REVERT_GUARDED_STATUSES.has(matchUpStatus)) return undefined;
  if (!winningSide && !checkScoreHasValue({ score })) return undefined;

  if (winningSide) {
    return decorateResult({
      result: { error: INCOMPATIBLE_MATCHUP_STATUS },
      info: 'A winningSide implies completion and cannot be set with a live matchUpStatus (IN_PROGRESS / SUSPENDED)',
      context: { matchUpStatus, winningSide },
      stack: 'setMatchUpStatus',
    });
  }

  const matchUpFormat =
    matchUp?.matchUpFormat ?? structure?.matchUpFormat ?? drawDefinition?.matchUpFormat ?? event?.matchUpFormat;
  if (!matchUpFormat) return undefined;

  const { calculatedWinningSide } = analyzeMatchUp({ matchUp: { score, matchUpFormat }, matchUpFormat });
  if (!calculatedWinningSide) return undefined;

  return decorateResult({
    result: { error: INCOMPATIBLE_MATCHUP_STATUS },
    info: 'Score implies a completed outcome and cannot be set with a live matchUpStatus (IN_PROGRESS / SUSPENDED)',
    context: { matchUpStatus, calculatedWinningSide },
    stack: 'setMatchUpStatus',
  });
}

function validateMatchUpStateInputs({ drawDefinition, matchUpStatus, winningSide }) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  if (matchUpStatus && [CANCELLED, INCOMPLETE, ABANDONED, TO_BE_PLAYED].includes(matchUpStatus) && winningSide)
    return { error: INVALID_VALUES, winningSide, matchUpStatus };

  if (![undefined, ...validMatchUpStatuses].includes(matchUpStatus)) {
    return decorateResult({
      result: { error: INVALID_MATCHUP_STATUS },
      info: 'matchUpStatus does not exist',
      stack: 'setMatchUpStatus',
    });
  }

  // A status can exist and still be meaningless here. CHALLENGED describes a fixture a participant
  // created, which only a LADDER produces; setting it in an elimination draw asserts something the
  // draw cannot express. Unscoped statuses — nearly all of them — return undefined and are
  // unaffected. See `matchUpStatusScopes`.
  const scopeViolation = getMatchUpStatusScopeViolation({ drawType: drawDefinition?.drawType, matchUpStatus });
  if (scopeViolation) {
    return decorateResult({
      result: { error: MATCHUP_STATUS_OUT_OF_SCOPE },
      info: scopeViolation,
      stack: 'setMatchUpStatus',
    });
  }

  return undefined;
}

function resolveMatchUpAndContext({ tournamentRecord, drawDefinition, matchUpId, event, matchUpStatus, winningSide }) {
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  const { matchUps: inContextDrawMatchUps } = getAllDrawMatchUps({
    nextMatchUps: true,
    tournamentRecord,
    inContext: true,
    drawDefinition,
    matchUpsMap,
    event,
  });

  const matchUp = matchUpsMap.drawMatchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
  const inContextMatchUp = inContextDrawMatchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);

  if (!matchUp || !inContextDrawMatchUps) return { error: MATCHUP_NOT_FOUND };

  if ((matchUp.winningSide || winningSide) && matchUpStatus === BYE) {
    return {
      context: 'Cannot have Bye with winningSide',
      error: INCOMPATIBLE_MATCHUP_STATUS,
      matchUpStatus,
    };
  }

  const structureId = inContextMatchUp?.structureId;
  const { structure } = findStructure({ drawDefinition, structureId });
  const isTeam = isMatchUpEventType(TEAM)(matchUp.matchUpType);
  const assignedDrawPositions = inContextMatchUp?.drawPositions?.filter(Boolean);
  const matchUpTieId = inContextMatchUp?.matchUpTieId;

  return {
    inContextDrawMatchUps,
    assignedDrawPositions,
    inContextMatchUp,
    matchUpTieId,
    matchUpsMap,
    structure,
    matchUp,
    isTeam,
  };
}

function checkDownstreamCompatibility({ matchUpTieId, activeDownstream, matchUpStatus, winningSide, matchUp }) {
  const directingMatchUpStatus = isDirectingMatchUpStatus({ matchUpStatus });

  if (!matchUpTieId) {
    if (
      activeDownstream &&
      !winningSide &&
      ((matchUpStatus && isNonDirectingMatchUpStatus({ matchUpStatus })) ||
        (matchUpStatus && [DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(matchUpStatus)))
    ) {
      return {
        error: INCOMPATIBLE_MATCHUP_STATUS,
        activeDownstream,
        winningSide,
      };
    }

    if (winningSide && winningSide === matchUp.winningSide && matchUpStatus && !directingMatchUpStatus) {
      return {
        context: 'winningSide must include directing matchUpStatus',
        error: INCOMPATIBLE_MATCHUP_STATUS,
        directingMatchUpStatus,
        matchUpStatus,
      };
    }
  }

  return undefined;
}

function resolveAndApplyOutcome({ params, isTeam, dualWinningSideChange, activeDownstream, stack }) {
  const {
    allowChangePropagation,
    tournamentRecords,
    tournamentRecord,
    drawDefinition,
    winningSide,
    matchUpId,
    matchUpTieId,
    matchUp,
  } = params;

  const { schedule } = params;
  if (schedule) {
    const result = addMatchUpScheduleItems({
      disableNotice: true,
      tournamentRecords,
      tournamentRecord,
      drawDefinition,
      matchUpId,
      schedule,
    });
    if (result.error) {
      return result;
    }
  }

  const validWinningSideSwap =
    !isTeam && !dualWinningSideChange && winningSide && matchUp.winningSide && matchUp.winningSide !== winningSide;

  /**
   * The operator correction: re-derive progression rather than hand-edit it.
   *
   * TWO CALLERS REACH THIS BRANCH, and they want different things.
   *
   * **A consumer** sending `allowChangePropagation` is asking to change a decided winner and have
   * the draw follow. `swapWinnerLoser` used to answer that by rewriting `drawPositions` and
   * `positionAssignments` itself — a second implementation of "change a winner and carry it
   * downstream", wrong in three independent ways and disagreeing with the director's own sequence on
   * 36 of 189 measured flips. `correctDecidedOutcome` performs that sequence instead.
   *
   * **The cascade** reaches it because `progressExitStatus` hardcodes `allowChangePropagation: true`
   * on its internal call — to get PAST the refusal, not to request a clear-and-replay. It is already
   * re-deriving progression, and re-entering a subtree from inside its own traversal is both
   * re-entrant and measurably wrong: census seed 9100247 (COMPASS 16/14) passes on the old path and
   * fails on the new one, and it fails identically whether the cascade is given
   * `correctDecidedOutcome`, `noDownstreamDependencies`, or the ordinary dispatch. So the cascade
   * keeps the behaviour it has always had, unchanged, and `swapWinnerLoser` survives for it alone.
   *
   * That split is deliberate and is NOT the end state — see the "what this did NOT fix" section of
   * Mentat/planning/SWAP_WINNER_LOSER_TWO_ROUTES.md. Deleting the second implementation outright
   * requires understanding what the cascade depends on in it, which is its own workstream.
   */
  if (allowChangePropagation && validWinningSideSwap && matchUp.roundPosition) {
    if (params.propagatingExit) return swapWinnerLoser(params);
    return correctDecidedOutcome(params, setMatchUpState);
  }

  const matchUpWinner = (winningSide && !matchUpTieId) || params.projectedWinningSide;
  const directingMatchUpStatus = isDirectingMatchUpStatus({ matchUpStatus: params.matchUpStatus });

  pushGlobalLog({
    activeDownstream,
    matchUpWinner,
    method: stack,
    winningSide,
  });

  let result;
  if (!activeDownstream) {
    result = noDownstreamDependencies(params);
  } else if (matchUpWinner) {
    result = winningSideWithDownstreamDependencies(params);
  } else if (directingMatchUpStatus || params.autoCalcDisabled) {
    result = applyMatchUpValues(params);
  } else {
    result = { error: NO_VALID_ACTIONS };
  }

  if (!result?.error) applyScoredTime({ matchUp });

  return decorateResult({ result, stack });
}

// Auto-capture matchUp.schedule.scoredTime the first time a matchUp becomes
// "scored" (a score with value, a winningSide, or a completed status). Applied
// at the convergence point so it covers every apply sub-path. Captured once —
// later score corrections keep the original timestamp; cleared when the score
// is removed so a subsequent re-score gets a fresh stamp. A lightweight proxy
// for when the match actually finished (TD-behavior analytics) when no explicit
// END_TIME timeItem is recorded; an actual endTime supersedes it at read time.
function applyScoredTime({ matchUp }) {
  const isScored =
    !!matchUp.winningSide ||
    checkScoreHasValue({ score: matchUp.score }) ||
    (matchUp.matchUpStatus && completedMatchUpStatuses.includes(matchUp.matchUpStatus));

  if (isScored) {
    if (!matchUp.schedule) matchUp.schedule = {};
    if (!matchUp.schedule.scoredTime) matchUp.schedule.scoredTime = new Date().toISOString();
  } else if (matchUp.schedule?.scoredTime) {
    delete matchUp.schedule.scoredTime;
  }
}

function handleTeamAutoCalc({
  tournamentRecord,
  inContextMatchUp,
  activeDownstream,
  disableAutoCalc,
  enableAutoCalc,
  drawDefinition,
  winningSide,
  matchUpsMap,
  structure,
  matchUp,
  params,
  event,
}) {
  let dualWinningSideChange;

  if (disableAutoCalc) {
    setFirstClassOrExtension({
      element: matchUp,
      attribute: 'disableAutoCalc',
      name: DISABLE_AUTO_CALC,
      value: true,
    });
  } else if (enableAutoCalc) {
    const existingDualMatchUpWinningSide = matchUp.winningSide;

    const {
      winningSide: projectedWinningSide,
      scoreStringSide1,
      scoreStringSide2,
      set,
    } = generateTieMatchUpScore({
      drawDefinition,
      matchUpsMap,
      structure,
      matchUp,
      event,
    });

    const score = {
      scoreStringSide1,
      scoreStringSide2,
      sets: set ? [set] : [],
    };

    dualWinningSideChange = projectedWinningSide !== existingDualMatchUpWinningSide;

    // if activeDownStream and dualWinningSideChange then disallow removal of autoCalc
    if (activeDownstream && dualWinningSideChange) {
      return decorateResult({
        stack: 'winningSideWithDownstreamDependencies',
        result: { error: CANNOT_CHANGE_WINNING_SIDE },
        context: { winningSide, matchUp },
      });
    }

    setFirstClassOrExtension({
      element: matchUp,
      attribute: 'disableAutoCalc',
      name: DISABLE_AUTO_CALC,
      value: undefined,
    });

    // setting these parameters will enable noDownStreamDependencies to attemptToSetWinningSide
    Object.assign(params, {
      winningSide: projectedWinningSide,
      dualWinningSideChange,
      projectedWinningSide,
      score,
    });
  }

  ensureSideLineUps({
    tournamentId: tournamentRecord?.tournamentId,
    inContextDualMatchUp: inContextMatchUp,
    eventId: event?.eventId,
    dualMatchUp: matchUp,
    drawDefinition,
    event,
  });

  return { dualWinningSideChange };
}

function resolveQualifyingContext({ inContextMatchUp, winningSide, matchUp, params }) {
  const qualifyingMatch = inContextMatchUp?.stage === QUALIFYING && inContextMatchUp.finishingRound === 1;
  const qualifierAdvancing = qualifyingMatch && winningSide;
  const removingQualifier =
    qualifyingMatch && // oop
    matchUp.winningSide &&
    !winningSide && // function calls last
    (!params.matchUpStatus ||
      (params.matchUpStatus &&
        isNonDirectingMatchUpStatus({
          matchUpStatus: params.matchUpStatus,
        }))) &&
    (!params.outcome || !checkScoreHasValue({ outcome: params.outcome }));
  const qualifierChanging =
    qualifierAdvancing && // oop
    winningSide !== matchUp.winningSide &&
    matchUp.winningSide;

  return { qualifierAdvancing, qualifierChanging, removingQualifier };
}

function resolveTieMatchUpContext({
  drawDefinition,
  matchUpStatus,
  matchUpTieId,
  matchUpsMap,
  winningSide,
  structure,
  matchUp,
  event,
  score,
}) {
  const { matchUp: dualMatchUp } = findDrawMatchUp({
    matchUpId: matchUpTieId,
    inContext: true,
    drawDefinition,
    matchUpsMap,
    event,
  });
  if (!dualMatchUp) return undefined;

  const tieFormat = resolveTieFormat({
    matchUp: dualMatchUp,
    drawDefinition,
    structure,
    event,
  })?.tieFormat;

  const { projectedWinningSide } = getProjectedDualWinningSide({
    drawDefinition,
    matchUpStatus,
    dualMatchUp,
    matchUpsMap,
    winningSide,
    tieFormat,
    structure,
    matchUp,
    event,
    score,
  });

  const existingDualMatchUpWinningSide = dualMatchUp.winningSide;
  const dualWinningSideChange = projectedWinningSide !== existingDualMatchUpWinningSide;
  // first-class (NATIVE) with fallback to the legacy `_disableAutoCalc` hydrated alias (LEGACY)
  const autoCalcDisabled = dualMatchUp.disableAutoCalc ?? dualMatchUp._disableAutoCalc;

  return {
    isCollectionMatchUp: true,
    dualWinningSideChange,
    projectedWinningSide,
    autoCalcDisabled,
    matchUpTieId,
    dualMatchUp,
    tieFormat,
  };
}

function winningSideWithDownstreamDependencies(params) {
  const { matchUp, winningSide, matchUpTieId, dualWinningSideChange } = params;
  if (winningSide === matchUp.winningSide || (matchUpTieId && !dualWinningSideChange)) {
    return applyMatchUpValues(params);
  } else {
    return decorateResult({
      stack: 'winningSideWithDownstreamDependencies',
      result: { error: CANNOT_CHANGE_WINNING_SIDE },
      context: { winningSide, matchUp },
    });
  }
}

function applyMatchUpValues(params) {
  const { tournamentRecord, matchUp, event } = params;
  const removeWinningSide =
    params.isCollectionMatchUp &&
    matchUp.winningSide &&
    !params.winningSide &&
    !checkScoreHasValue({ score: params.score });
  const newMatchUpStatus = params.isCollectionMatchUp
    ? params.matchUpStatus || (removeWinningSide && TO_BE_PLAYED) || (params.winningSide && COMPLETED) || INCOMPLETE
    : params.matchUpStatus || COMPLETED;
  const removeScore =
    params.removeScore ||
    ([CANCELLED, WALKOVER].includes(newMatchUpStatus) && ![INCOMPLETE, ABANDONED].includes(newMatchUpStatus));

  const result = modifyMatchUpScore({
    ...params,
    matchUpStatus: newMatchUpStatus,
    removeWinningSide,
    context: 'sms',
    removeScore,
  });
  if (result.error) return result;

  // recalculate dualMatchUp score if isCollectionMatchUp
  if (params.isCollectionMatchUp) {
    const { matchUpTieId, drawDefinition, matchUpsMap } = params;
    const tieMatchUpResult = updateTieMatchUpScore({
      appliedPolicies: params.appliedPolicies,
      matchUpId: matchUpTieId,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      event,
    });

    if (tieMatchUpResult.error) return tieMatchUpResult;
    Object.assign(result, { tieMatchUpResult });
  }

  return result;
}

/**
 * Whether a single exit may be AWARDED to its `winningSide`.
 *
 * The waiver this serves lets a one-sided exit through, and it has to, because the cascade writes
 * exactly that shape: `progressExitStatus` RULE 2 awards a carried exit to the side WITHOUT the
 * exit, and that side is empty until the opponent arrives. An "the winner must hold a participant"
 * rule would forbid the engine's own output.
 *
 * So the question is not whether the winning side is empty. It is **which kind of empty**:
 *
 *  - an UNFILLED FEED SLOT carries no `drawPosition` at all. Nobody is there yet and nobody is
 *    claimed to be. This is the pending-exit shape, and it is legitimate — measured across the
 *    sequences `propagatedByeYieldsToArrivingLoser` pins, where a director re-scores a double exit
 *    down to a single walkover before the opposing feed has arrived.
 *  - a PHANTOM carries a `drawPosition` whose `positionAssignment` exists and holds nobody. The
 *    matchUp is claiming a seat that is empty. Measured at sweep seed 9000140 step 29: a Consolation
 *    matchUp with `drawPositions [19, 20]`, side 1 holding position 19 whose assignment was vacant,
 *    was recorded `WALKOVER winningSide: 1` and ACCEPTED — a walkover won by nobody, with
 *    `getDrawInconsistencies` reporting `valid`.
 *  - a BYE is NOT an occupant for this purpose. See below.
 *
 * The consistency argument is what settles the phantom case. At the SAME matchUp three steps
 * earlier, a bare `{ winningSide: 1 }` was already refused with ERR_INVALID_MATCHUP_STATUS, because
 * a directing outcome requires assigned participants. The waiver was letting an exit status do what
 * a plain result could not, on the same slot, in the same draw.
 *
 * ## A BYE can never be the winning side, and this is not a new rule
 *
 * #4858 allowed it, on the stated grounds that whether a player can lose a walkover to an opponent
 * who does not exist is a rules question for a governing body. **That was wrong, and the engine had
 * already answered it in two places:**
 *
 *  - `getExitWinningSide`: *"A BYE draw position can never be the winning side […] this guard exists
 *    so a future caller that forgets to filter cannot resurrect the 'advance the empty/BYE side'
 *    bug class."* It is a named invariant guarding a named bug class.
 *  - `progressExitStatus` RULE 1: when the opponent is a BYE the participant *advances through it* —
 *    "the BYE cascade has already moved them forward […] **NOT a WALKOVER**" — and the exit is
 *    re-propagated onto wherever they landed.
 *
 * CA, 2026-09-13, independently and before being shown either: *"A player that encounters a BYE gets
 * advanced; a player being advanced by a WALKOVER hits a BYE and continues advancing […] if they are
 * propagating their WALKOVER status all the way through then their WALKOVER occurs AFTER their
 * fall-through position is advanced by the BYE."* That is RULE 1 restated.
 *
 * So the propagation path never produces this state. Only a DIRECT entry could, and now cannot.
 *
 * The #4858 rationale also claimed "three committed tests construct that state on purpose". It is
 * ONE row of one test, and incidentally: `carriedExitProvenance`'s MODIFIED_FEED_IN_CHAMPIONSHIP
 * 8/6 case used `roundPosition: 1`, which in a 6-of-8 draw happens to be the BYE matchUp. Its
 * sibling row (FEED_IN_CHAMPIONSHIP 8/8, `roundPosition: 3`) has no byes at all. The row now targets
 * a contested matchUp, which is what it always meant to.
 *
 * A QUALIFIER placeholder is still accepted: it is a seat reserved for a participant who will be
 * named, not a structural absence, and nothing here measured it. Deliberately left alone.
 *
 * Only meaningful where exactly one side holds a participant; the caller establishes that.
 */
function exitAwardable({ positionAssignments, inContextMatchUp, winningSide }): boolean {
  const winnerSide = (inContextMatchUp?.sides ?? []).find((side: any) => side?.sideNumber === winningSide);
  // a BYE is deliberately NOT in this list — see the docblock
  if (winnerSide?.participantId || winnerSide?.qualifier) return true;
  if (winnerSide?.bye) return false;

  // no drawPosition claimed: an unfilled feed slot, awaiting its arrival
  if (winnerSide?.drawPosition === undefined) return true;

  const assignment = positionAssignments?.find((entry: any) => entry.drawPosition === winnerSide.drawPosition);
  // an assignment that does not exist is not a phantom either — nothing is being claimed
  if (!assignment) return true;

  // a BYE assignment is refused for the same reason a BYE side is
  if (assignment.bye) return false;

  return !!(assignment.participantId || assignment.qualifier);
}

function checkParticipants({
  assignedDrawPositions,
  propagateExitStatus,
  inContextMatchUp,
  appliedPolicies,
  propagatingExit,
  drawDefinition,
  matchUpStatus,
  winningSide,
  structure,
  matchUp,
}) {
  if (appliedPolicies?.[POLICY_TYPE_SCORING]?.requireParticipantsForScoring === false) return { ...SUCCESS };

  const participantsCount = inContextMatchUp?.sides?.map((side) => side.participantId).filter(Boolean).length;

  const positionAssignments = matchUp?.sides
    ? []
    : getPositionAssignments({
        structureId: structure?.structureId,
        drawDefinition,
      }).positionAssignments;

  // `positionAssignments` above is deliberately empty when the matchUp carries its own sides — the
  // `requiredParticipants` branch below only needs it in the other case. `exitAwardable` needs the
  // real assignments either way, to tell an unfilled feed slot from a seat that is claimed and
  // vacant, so it is read separately rather than by widening the one above and changing what
  // `requiredParticipants` sees.
  const allAssignments = getPositionAssignments({
    structureId: structure?.structureId,
    drawDefinition,
  }).positionAssignments;

  const requiredParticipants =
    (participantsCount && participantsCount === 2) ||
    // matchUp may be doubles or singles but if it is a tieMatchUp in a TEAM event and is adHoc and has a single participant
    (matchUp.collectionId && isAdHoc({ structure }) && participantsCount && participantsCount >= 1) ||
    (assignedDrawPositions?.length === 2 &&
      positionAssignments
        ?.filter((assignment) => assignedDrawPositions.includes(assignment.drawPosition))
        .every((assignment) => assignment.participantId));
  if (
    matchUpStatus &&
    //we want to allow wo, default and double walkover inn the consolation draw
    //to have only one particpiant when they are caused by an exit propagation
    //
    // DOUBLE_DEFAULT was missing from this list while DOUBLE_WALKOVER was present, so a
    // single-participant propagated DOUBLE_DEFAULT fell through to the participants-required
    // validation and was refused. Measured: reachable, 1 occurrence over the 600-seed sweep window,
    // and the probable mechanism behind an earlier experiment in which writing DOUBLE_DEFAULT at
    // progressExitStatus RULE 4 produced a single DEFAULTED *with* a winningSide. This file already
    // used the correct pair at line 454.
    [WALKOVER, DEFAULTED, DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(matchUpStatus) &&
    participantsCount === 1 &&
    propagateExitStatus &&
    // WHO the single exit is awarded to, and it is not a formality.
    //
    // The waiver above tested `propagateExitStatus` alone — a REQUEST FLAG any caller can set — even
    // though its own comment says it is for exits "caused by an exit propagation". So a TD entering
    // `{ matchUpStatus: WALKOVER, winningSide: <the empty side> }` on a half-filled consolation
    // matchUp was ACCEPTED, and the draw then recorded a walkover won by nobody. Measured
    // 2026-09-13 in FIRST_MATCH_LOSER_CONSOLATION for both WALKOVER and DEFAULTED, with
    // `getDrawInconsistencies` reporting `valid` throughout; with `propagateExitStatus` off the
    // identical call is refused with ERR_INVALID_MATCHUP_STATUS, which is the engine's own position
    // on it.
    //
    // The cascade genuinely needs the empty side to win — `progressExitStatus` RULE 2 awards the
    // matchUp to the side WITHOUT the exit, and that side is empty until the opponent arrives — so
    // it identifies itself with `propagatingExit` rather than being inferred from the flag. A
    // DIRECT entry gets the waiver only when the side it awards the exit to is not a PHANTOM — a
    // drawPosition whose assignment holds nobody. See exitAwardable.
    (propagatingExit ||
      !winningSide ||
      exitAwardable({ positionAssignments: allAssignments, inContextMatchUp, winningSide }))
  ) {
    return { ...SUCCESS };
  }
  // A bare `{ winningSide }` with no matchUpStatus requires participants just as much as an
  // explicit COMPLETED does — declaring a winner IS a directing action.
  //
  // Without this the check simply did not run for such an outcome, and the equivalent test in
  // `attemptToModifyScore` (`validToScore`) caught it instead — but that runs LATER, after
  // `noDownstreamDependencies` has already unwound an existing double exit via `removeDoubleExit`,
  // or `attemptToSetWinningSide` has already called `removeDirectedParticipants`. The result was a
  // rejected mutation that had nonetheless destroyed the previous result: measured on
  // MODIFIED_FEED_IN_CHAMPIONSHIP 8/6, a pending propagated exit (WALKOVER, winningSide 1, second
  // side an empty feed slot) was left TO_BE_PLAYED by a call that returned ERR_MISSING_ASSIGNMENTS.
  //
  // Two checks for one condition, one lenient and early, one strict and late, with mutations in
  // between. Making the early one cover the same ground is what keeps the rejection atomic.
  const directingOutcome = matchUpStatus ? participantsRequiredMatchUpStatuses.includes(matchUpStatus) : !!winningSide;

  if (directingOutcome && !requiredParticipants) {
    return decorateResult({
      info: 'matchUpStatus requires assigned participants',
      context: { matchUpStatus, requiredParticipants },
      result: { error: INVALID_MATCHUP_STATUS },
    });
  }

  return { ...SUCCESS };
}
