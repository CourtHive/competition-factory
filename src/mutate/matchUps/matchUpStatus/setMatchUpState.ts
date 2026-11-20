import { missingDrawPositionsRefusal, isUndirectedDrawnOutcome } from '@Query/matchUp/missingDrawPositionsRefusal';
import { heldSeatRefusal } from '@Query/matchUp/heldSeatRefusal';
import { addMatchUpScheduleItems, scheduleRefusal } from '@Mutate/matchUps/schedule/scheduleItems/scheduleItems';
import { removalMissingDrawPositions } from '@Mutate/matchUps/drawPositions/removeDirectedParticipants';
import { isDirectingMatchUpStatus, isNonDirectingMatchUpStatus } from '@Query/matchUp/checkStatusType';
import { resolveRotatingPartnerOutcome } from '@Query/drawDefinition/resolveRotatingPartnerOutcome';
import { refreshArrivals } from '@Mutate/drawDefinitions/matchUpGovernor/attemptToSetWinningSide';
import { generateTieMatchUpScore } from '@Query/matchUp/tieMatchUpScore/generateTieMatchUpScore';
import { hasPropagatedExitDownstream } from '@Query/drawDefinition/hasPropagatedExitDownstream';
import { getMatchUpStatusScopeViolation } from '@Query/matchUps/getMatchUpStatusScopeViolation';
import { feedEligibilityChange, lineFeedEligibilityChange } from '@Mutate/matchUps/matchUpStatus/feedEligibilityGuard';
import { correctionKindChange } from '@Mutate/matchUps/matchUpStatus/correctionKindGuard';
import { relabelWithoutDirection } from '@Mutate/matchUps/drawPositions/relabelLoserExit';
import { getProjectedDualWinningSide } from '@Query/matchUp/getProjectedDualWinningSide';
import { rewritesCarriedExit } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { scoredTimeAction } from '@Mutate/matchUps/matchUpStatus/reconcileScoredTimes';
import { ensureGoesTo, holdGoesTo, type GoesToHold } from '@Query/matchUps/addGoesTo';
import { updateTieMatchUpScore } from '@Mutate/matchUps/score/updateTieMatchUpScore';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { collectionChoiceOutcomeRefusal } from '@Query/matchUp/collectionChoice';
import { swapWinnerLoser } from '@Mutate/matchUps/drawPositions/swapWinnerLoser';
import { resolveScoringFormat } from '@Query/hierarchical/resolveScoringFormat';
import { getTargetsDownstream } from '@Query/drawDefinition/isActiveDownstream';
import { ensureSideLineUps } from '@Mutate/matchUps/lineUps/ensureSideLineUps';
import { modifyMatchUpScore } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { isDeciderStructure } from '@Query/drawDefinition/deciderStructures';
import { isPropagatedExit } from '@Helpers/drawTopology/sideExitProvenance';
import { validateDrawTallyOptions } from '@Validators/validateTallyPolicy';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { checkScoreHasValue } from '@Scoring/analysis/checkScoreHasValue';
import { isPartialDualScore } from '@Scoring/analysis/isPartialDualScore';
import { getMalformedRoundLink } from '@Query/drawDefinition/linkGetter';
import { decorateResult } from '@Functions/global/decorateResult';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { validateScore } from '@Scoring/analysis/validateScore';
import { exitAwardable } from '@Helpers/outcome/exitAwardable';
import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { dualKeepsOwnDecision } from './dualKeepsOwnDecision';
import { lineTakesPlayedOnDualWinner } from './lineTakesPlayedOnDualWinner';
import { isDoubleExit, isExit } from '@Validators/isExit';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { clearsABye } from '@Query/matchUp/clearsABye';
import { findStructure } from '@Acquire/findStructure';
import { isObject } from '@Tools/objects';
import { nowIso } from '@Tools/clock';
import {
  noDownstreamDependencies,
  refusesStatusRoute,
  removesDirected,
} from '@Mutate/drawDefinitions/matchUpGovernor/noDownstreamDependencies';

// constants and types
import type { DerivedStatusCodes } from '@Mutate/matchUps/matchUpStatus/sideStatusCodes';
import { QUALIFYING } from '@Constants/drawDefinitionConstants';
import { MatchUpsMap, PolicyDefinitions } from '@Types/factoryTypes';
import { DISABLE_AUTO_CALC } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import { TEAM } from '@Constants/matchUpTypes';
import {
  CANNOT_CHANGE_FEED_ELIGIBILITY,
  CANNOT_CHANGE_WINNING_SIDE,
  CANNOT_CHANGE_OUTCOME,
  INCOMPATIBLE_MATCHUP_STATUS,
  INVALID_MATCHUP_STATUS,
  INVALID_VALUES,
  MATCHUP_NOT_FOUND,
  MATCHUP_STATUS_OUT_OF_SCOPE,
  MISSING_DRAW_DEFINITION,
  MISSING_DRAW_POSITIONS,
  NO_VALID_ACTIONS,
  PROPAGATED_EXITS_DOWNSTREAM,
} from '@Constants/errorConditionConstants';
import {
  ABANDONED,
  AWAITING_RESULT,
  BYE,
  CANCELLED,
  COMPLETED,
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
import {
  DrawDefinition,
  DrawLink,
  Event,
  MatchUp,
  MatchUpStatusUnion,
  Score,
  Structure,
  Tournament,
} from '@Types/tournamentTypes';
import {
  POLICY_TYPE_PROGRESSION,
  POLICY_TYPE_SCORING,
  POLICY_TYPE_ROUND_ROBIN_TALLY,
} from '@Constants/policyConstants';

// Reverting a validated-COMPLETED matchUp to one of these "still live / paused"
// statuses (without providing a new outcome) would silently strip its result and
// un-advance the draw — the class of bug behind stranded LIVE-with-score matches.
const REVERT_GUARDED_STATUSES = new Set([IN_PROGRESS, SUSPENDED]);

type SetMatchUpStateArgs = {
  tournamentRecords?: { [key: string]: Tournament };
  /** a caller that already built the draw's matchUp map hands it over rather than having it rebuilt */
  matchUpsMap?: MatchUpsMap;
  policyDefinitions?: PolicyDefinitions;
  appliedPolicies?: PolicyDefinitions;
  matchUpStatus?: MatchUpStatusUnion;
  allowChangePropagation?: boolean;
  disableScoreValidation?: boolean;
  projectedWinningSide?: number;
  /** set from the tie context (`resolveTieMatchUpContext`) for a line: the tally's own projection, its score, the dual */
  talliedWinningSide?: number;
  projectedDualScore?: Score;
  dualMatchUp?: HydratedMatchUp;
  keepsDualDecision?: boolean;
  dualLineDecided?: boolean;
  propagateExitStatus?: boolean;
  /** set ONLY by `setMatchUpStatus`, which holds the draw's missing edges and announces them itself (`announceGoesTo`) */
  edgesHeld?: boolean;
  /** set ONLY by `progressExitStatus` — see `checkParticipants` */
  propagatingExit?: boolean;
  propagateRetirementAsExit?: boolean;
  matchUpStatusCodes?: string[];
  /** set ONLY by engine writers whose `matchUpStatusCodes` are derived display — see `attributeDerivedStatusCodes` */
  derivedStatusCodes?: DerivedStatusCodes;
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

/**
 * @deprecated on the engine surface since 7.5.0; removed at the next major. This is the INTERNAL
 * state writer behind `setMatchUpStatus`: it skips the policy resolution of the three propagation
 * flags, the score-string derivation, the format validation and the exit-propagation cascade that
 * the public entry performs, so a consumer calling it directly gets a result the draw may not
 * agree with. The golden corpus found no caller outside this repository (outcome-pipeline spec
 * § 8). Internal callers (`resetAdHocMatchUps`, `removeCollectionDefinition`) keep importing it;
 * consumers call `setMatchUpStatus`.
 */
export function setMatchUpState(params: SetMatchUpStateArgs): any {
  // A REFUSED CALL STORES NONE OF THE MISSING EDGES (CA, 2026-10-18): what `ensureGoesTo` writes below is held, and
  // written back if the call returns an error. See `holdGoesTo`.
  const hold = holdGoesTo({ drawDefinition: params.drawDefinition, matchUpsMap: params.matchUpsMap });
  const result = writeMatchUpState(params);
  if (result?.error) hold?.release();
  // a call that succeeds and wrote the edges announces the draw once; a caller holding them itself announces them
  else if (!params.edgesHeld) announceGoesTo({ hold, ...params });
  return result;
}

/**
 * A CALL THAT REPAIRS A DRAW'S MISSING EDGES ANNOUNCES THE DRAW ONCE (CA, 2026-10-18: "Option 2 and document the
 * decision in tasks. Missing edges are most likely from hand assembled draws and themselves an edge case.")
 *
 * One `MODIFY_DRAW_DEFINITION`, keyed by the draw, not a `MODIFY_MATCHUP` per matchUp whose only change is an edge: a
 * subscriber told the draw changed re-projects it, edges included. Sent only by a call that succeeds and only when the
 * edges were written (`hold.written`); a refused call writes them back and announces nothing, so this is asked only
 * once the call's own refusals are behind it.
 */
export function announceGoesTo({
  tournamentRecord,
  drawDefinition,
  event,
  hold,
}: {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  hold?: GoesToHold;
  event?: Event;
}) {
  if (!drawDefinition || !hold?.written()) return;
  modifyDrawNotice({ drawDefinition, tournamentId: tournamentRecord?.tournamentId, eventId: event?.eventId });
}

function writeMatchUpState(params: SetMatchUpStateArgs) {
  const stack = 'setMatchUpStatus';

  const rotating = resolveRotatingPartnerOutcome(params);
  if (rotating.error) return rotating;
  params = { ...params, ...rotating };

  // always clear score if DOUBLE_WALKOVER or WALKOVER
  if (isWalkoverStatus(params.matchUpStatus)) params.score = undefined;

  const {
    disableScoreValidation,
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
    matchUpsMap: params.matchUpsMap,
    removeScore: params.removeScore,
    outcome: params.outcome,
    tournamentRecord,
    drawDefinition,
    matchUpStatus,
    winningSide,
    matchUpId,
    event,
    score,
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
    inContextMatchUp,
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
    incomingMatchUpFormat: params.matchUpFormat,
    inContextMatchUp,
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

  // A carried or produced exit is changed at its ORIGIN, never here (CA, 2026-10-03); the cascade's own
  // writes are not direct. See `rewritesCarriedExit`.
  const carriedExit = !params.propagatingExit && isPropagatedExit({ matchUp });
  const rewrite = rewritesCarriedExit({
    existingWinningSide: matchUp.winningSide,
    existingStatus: matchUp.matchUpStatus,
    matchUpStatus,
    carriedExit,
    winningSide,
    score,
  });
  if (rewrite) {
    return decorateResult({
      result: { error: CANNOT_CHANGE_OUTCOME },
      info: 'a carried exit is changed at its origin',
      context: { matchUpStatus: matchUp.matchUpStatus },
      stack,
    });
  }

  // the matchUp's targets and what depends on it; a malformed round link in either is the answer (CA, 2026-10-06)
  const targets = downstreamOf({
    propagatingExit: params.propagatingExit,
    matchUpId: matchUpTieId || matchUpId,
    inContextDrawMatchUps,
    drawDefinition,
    matchUpStatus,
  });
  if (targets.error) return decorateResult({ result: targets, stack });
  const { targetData, activeDownstream } = targets;

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

  let dualWinningSideChange;
  let applyTeamWrites: (() => void) | undefined;
  let unprojectedExit = false;
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
    applyTeamWrites = teamResult.apply;
    unprojectedExit = !!teamResult.unprojectedExit;
  }

  if (isTeam && matchUpStatus && [AWAITING_RESULT].includes(matchUpStatus)) {
    return {
      info: 'Not supported for matchUpType: TEAM',
      error: INVALID_VALUES,
    };
  }

  if (score && !isTeam && !disableScoreValidation) {
    // An incoming `matchUpFormat` wins: the score being validated is the one being recorded UNDER
    // that format. This used to resolve correctly only by accident — `setMatchUpStatus` wrote the
    // format onto the matchUp before delegating here, so `matchUp.matchUpFormat` was already the
    // incoming one. That write is gone (it survived a refused outcome), so the precedence that was
    // implicit has to be stated.
    // a TEAM line's format is its collection's — see `resolveScoringFormat`
    const matchUpFormat = resolveScoringFormat({
      incoming: params.matchUpFormat,
      inContextMatchUp,
      drawDefinition,
      structure,
      matchUp,
      event,
    });

    const result = validateScore({
      existingMatchUpStatus: matchUp.matchUpStatus,
      matchUpFormat,
      matchUpStatus,
      winningSide,
      score,
    });
    if (result.error) return result;
  }

  const appliedPolicies = outcomePolicies(params);
  const tallyValidation = validateDrawTallyOptions(appliedPolicies[POLICY_TYPE_ROUND_ROBIN_TALLY]);
  if (tallyValidation.error) return tallyValidation;

  const participantCheck = checkParticipants({
    propagatingExit: params.propagatingExit,
    assignedDrawPositions,
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
  // row 22 (P52), then row 12: both ask about the loser's path before anything is written
  const preWriteRefusal =
    correctionKindRefusal({
      loserTargetLink: targetData?.targetLinks?.loserTargetLink,
      inContextDrawMatchUps,
      inContextMatchUp,
      matchUp,
      params,
    }) ??
    feedEligibilityRefusal({
      inContextDrawMatchUps,
      drawDefinition,
      matchUpStatus,
      winningSide,
      structure,
      matchUp,
      score,
    }) ??
    lineFeedEligibilityRefusal({
      projectedWinningSide: params.talliedWinningSide,
      autoCalcDisabled: params.autoCalcDisabled,
      projectedScore: params.projectedDualScore,
      dualMatchUp: params.dualMatchUp,
      inContextDrawMatchUps,
      drawDefinition,
      structure,
    });
  if (preWriteRefusal) return preWriteRefusal;

  const downstreamError = checkDownstreamCompatibility({
    matchUpTieId,
    activeDownstream,
    matchUpStatus,
    winningSide,
    matchUp,
  });
  if (downstreamError) return downstreamError;

  return resolveAndApplyOutcome({
    dualWinningSideChange,
    activeDownstream,
    applyTeamWrites,
    unprojectedExit,
    params,
    isTeam,
    stack,
  });
}

// Refuse to revert a COMPLETED matchUp that carries a *validated* winning score
// back to a live status (IN_PROGRESS / SUSPENDED) when no new outcome is supplied.
// A new winningSide or an applied score is treated as a correction/re-score and is
// allowed. RETIRED/DEFAULTED (irregular endings whose scores do not validate as a
// completed outcome) stay reversible. To reopen a completed match, submit a new
// outcome or clear the result first (removeWinningSide / TO_BE_PLAYED).
function checkCompletedRevertGuard({
  inContextMatchUp,
  drawDefinition,
  matchUpStatus,
  winningSide,
  structure,
  matchUp,
  score,
  event,
}: {
  inContextMatchUp?: HydratedMatchUp;
  matchUpStatus?: MatchUpStatusUnion;
  drawDefinition: DrawDefinition;
  structure?: Structure;
  winningSide?: number;
  matchUp: MatchUp;
  score?: Score;
  event?: Event;
}) {
  if (!matchUpStatus || !REVERT_GUARDED_STATUSES.has(matchUpStatus)) return undefined;
  if (winningSide || checkScoreHasValue({ score })) return undefined;
  if (matchUp?.matchUpStatus !== COMPLETED || !matchUp?.winningSide) return undefined;

  const matchUpFormat = resolveScoringFormat({ matchUp, inContextMatchUp, structure, drawDefinition, event });
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
  incomingMatchUpFormat,
  inContextMatchUp,
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

  // The INCOMING format wins here, because what is being analyzed is the INCOMING score — "is this
  // score decisive?" is a question about the format it is being recorded under, not the one the
  // matchUp currently carries. `checkCompletedRevertGuard` deliberately does NOT do this: it
  // analyzes the EXISTING result, which must be judged under the format it was recorded under.
  const matchUpFormat = resolveScoringFormat({
    incoming: incomingMatchUpFormat,
    inContextMatchUp,
    drawDefinition,
    structure,
    matchUp,
    event,
  });
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

type ChoiceRefusalArgs = Parameters<typeof collectionChoiceOutcomeRefusal>[0];

function resolveMatchUpAndContext({
  tournamentRecord,
  drawDefinition,
  matchUpId,
  event,
  matchUpStatus,
  winningSide,
  matchUpsMap: suppliedMap,
  removeScore,
  outcome,
  score,
}: {
  tournamentRecord?: Tournament;
  removeScore?: boolean;
  outcome?: ChoiceRefusalArgs['outcome'];
  score?: ChoiceRefusalArgs['score'];
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  matchUpStatus?: MatchUpStatusUnion;
  winningSide?: number;
  matchUpId: string;
  event?: Event;
}) {
  const matchUpsMap = suppliedMap ?? getMatchUpsMap({ drawDefinition });
  const { matchUps: inContextDrawMatchUps } = getAllDrawMatchUps({
    tournamentRecord,
    inContext: true,
    drawDefinition,
    matchUpsMap,
    event,
  });

  /**
   * THE DRAW'S EDGES ARE STORED BEFORE ANYTHING IS DECIDED ON THEM.
   *
   * This view used to be taken with `nextMatchUps: true`, on the understanding that it supplied
   * `winnerMatchUpId` / `loserMatchUpId` for a draw stored without them. It supplied them to THIS
   * view only, and the cascade's decisions do not read this view for them: `hasPropagatedExitDownstream`
   * reads the stored matchUps, and `getExitWinningSide`, `getHeldExit` and `getExitArrivalSideNumber`
   * read views taken later, which carry what is stored and nothing else. Measured 2026-10-01 over a
   * hundred matrix cells played on draws with the ids stripped: 14 ended in a different draw with
   * the flag on — the draws were only ever repaired when a cascade happened to place a BYE.
   *
   * So the edges are written, once, here: 0 of the hundred differ. A draw that stores its edges —
   * every draw the factory generates — pays a walk of its structures and no write. The flag also
   * computed `winnerTo`, `loserTo` and `potentialParticipants` for every matchUp, a `positionTargets`
   * each, which nothing a `setMatchUpStatus` reaches reads: 89,071 -> 20,459 calls in the census.
   *
   * THE WRITE PRECEDES VALIDATION, and a refusal takes it back. CA, 2026-10-18: "no, a refused call
   * does not store a draw's missing edges. v1 should no longer do so." What this write touches is held
   * before it (`holdGoesTo`, in `setMatchUpState` and `setMatchUpStatus`) and written back on any error
   * the call returns, so a refused call leaves the record as it was, edges included. A call that
   * succeeds keeps them: they are derived from the draw's own links, are what it would have stored had
   * the factory generated it, and are written once.
   */
  const goesTo = inContextDrawMatchUps && ensureGoesTo({ inContextDrawMatchUps, drawDefinition, matchUpsMap });
  if (goesTo?.error) return goesTo;

  const matchUp = matchUpsMap.drawMatchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
  const inContextMatchUp = inContextDrawMatchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);

  if (!matchUp || !inContextDrawMatchUps) return { error: MATCHUP_NOT_FOUND };

  // A tie-scoped status needs the matchUp, so it is checked here rather than with the drawType scope above: DEAD_RUBBER
  // belongs to a rubber of a team tie or to a DOUBLE_ELIMINATION Decider (outcome-pipeline.md § 2 row 7).
  const tieScopeViolation = getMatchUpStatusScopeViolation({
    isDeciderMatchUp: isDeciderStructure({ drawDefinition, structureId: inContextMatchUp?.structureId }),
    isTieMatchUp: !!matchUp.collectionId,
    matchUpStatus,
  });
  if (tieScopeViolation) return { error: MATCHUP_STATUS_OUT_OF_SCOPE, info: tieScopeViolation };

  // an unresolved captain's choice refuses here, reading the call's own map rather than building another
  const choice = collectionChoiceOutcomeRefusal({
    drawDefinition,
    matchUpStatus,
    removeScore,
    winningSide,
    matchUpsMap,
    outcome,
    matchUp,
    event,
    score,
  });
  if (choice?.error) return { error: choice.error, info: choice.info, context: choice.context };

  if ((matchUp.winningSide || winningSide) && matchUpStatus === BYE) {
    return {
      info: 'Cannot have Bye with winningSide',
      error: INCOMPATIBLE_MATCHUP_STATUS,
      context: { matchUpStatus },
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

/**
 * The matchUp's targets and what depends on it. The cascade converging two exits asks only whether somebody PLAYED
 * downstream (see `getTargetsDownstream`).
 */
function downstreamOf({
  inContextDrawMatchUps,
  propagatingExit,
  drawDefinition,
  matchUpStatus,
  matchUpId,
}: {
  inContextDrawMatchUps?: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  propagatingExit?: boolean;
  matchUpStatus?: MatchUpStatusUnion;
  matchUpId: string;
}) {
  const convergence = !!propagatingExit && isDoubleExit(matchUpStatus);
  const targets = getTargetsDownstream({ convergence, matchUpId, inContextDrawMatchUps, drawDefinition });
  // A malformed link ANYWHERE in the draw is the answer, not only one this matchUp's targets or its downstream walk
  // reach: the cascade can direct a participant into any structure a link reaches, so a narrower check left the error to
  // be met after the cascade had written. With none, nothing past here can meet one (see `getMalformedRoundLink`).
  const malformed = !targets.error && getMalformedRoundLink(drawDefinition);
  return malformed ? { ...malformed, targetData: undefined, activeDownstream: undefined } : targets;
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
        info: 'winningSide must include directing matchUpStatus',
        context: { directingMatchUpStatus, matchUpStatus },
        error: INCOMPATIBLE_MATCHUP_STATUS,
      };
    }
  }

  return undefined;
}

function resolveAndApplyOutcome({
  dualWinningSideChange,
  activeDownstream,
  applyTeamWrites,
  unprojectedExit,
  params,
  isTeam,
  stack,
}: {
  /** a TEAM dual's exit entered with a winner by a call that turns auto-calc on, the lines projecting none */
  unprojectedExit?: boolean;
  dualWinningSideChange?: boolean;
  applyTeamWrites?: () => void;
  activeDownstream?: boolean;
  isTeam: boolean;
  stack: string;
  /** the call's parameters as the writers below take them (`swapWinnerLoser`, `noDownstreamDependencies`) */
  params: Parameters<typeof swapWinnerLoser>[0];
}) {
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

  // VALIDATE the schedule here; APPLY it below, once the outcome has been accepted.
  //
  // This used to apply it outright, above the dispatch that can refuse — so a rejected outcome left
  // the scheduled date, time and court order behind. Moving the apply down on its own would have
  // inverted the defect (an error over an outcome that had already landed), because the apply path
  // interleaves validate-and-write per attribute. `scheduleRefusal` runs every refusal and writes
  // nothing to this draw (the write's own refusals are met on a copy), so both orderings are safe.
  const { schedule } = params;
  if (schedule) {
    const check = scheduleRefusal({
      tournamentRecords,
      tournamentRecord,
      drawDefinition,
      matchUpId,
      schedule,
    });
    if (check?.error) return check;
  }

  const unplaceable = missingDrawPositionsRefusal({ params, activeDownstream: !!activeDownstream });
  if (unplaceable) return unplaceable;

  // a winner or a loser whose seat is held by somebody else: `directParticipants` met it after writing the result
  const held = heldSeatRefusal({ params, activeDownstream: !!activeDownstream });
  if (held) return decorateResult({ result: { error: held.error }, context: held.context, stack });

  // § 2 row 24's removal clause: `removeDirectedParticipants` refuses a score with no winner on a matchUp (a line's
  // dual) holding no drawPositions. A first entry (nothing holds a winner there) reaches it after the dual's writes
  // below, which left `sides` on an unfed dual under the error (measured 2026-11-01, TEAM SINGLE_ELIMINATION 4, the
  // final's bare score). Asked here, with what that function reads, so the error leaves the record unchanged (S7).
  if (removesDirected(params) && removalMissingDrawPositions(params))
    return decorateResult({ result: { error: MISSING_DRAW_POSITIONS }, stack });

  // § 2 row 6's fallthrough clause on a TEAM dual: a status no route accepts as named (an exit with no winner, which an
  // exit entered with one becomes when the call turns auto-calc on and the lines project none). It was refused by
  // `attemptToSetMatchUpStatus` after the dual's writes below, which left its sides and line-ups under the error
  // (item 3, CA 2026-11-17). Asked here, with what the dispatch reads, so the error leaves the record unchanged.
  if (applyTeamWrites && refusedAtTheStatusRoute(params, !!activeDownstream))
    return decorateResult({
      result: { error: INVALID_MATCHUP_STATUS },
      info: 'matchUpStatus: ' + params.matchUpStatus,
      stack,
    });

  // § 2 row 6 on a TEAM dual (CA, 2026-11-18 and 2026-11-19): a single exit entered with a winner by a call that turns
  // auto-calc on, where the lines project no winner. The call's winner is replaced by the projected one, none, and
  // the exit was written with no winner (a fresh dual, or a decided one whose exit carries: left undecided under an
  // exit status, its winner taken back out of the next dual) or beside the winner the dual already held (a decided
  // dual, no carry). Refused before anything is written. A dual scored by hand is not projected: a call that disables
  // auto-calc, or names neither flag on a dual already so flagged, keeps the winner it names. Lines that project a
  // winner decide it: the exit is written with the projected winner.
  if (applyTeamWrites && unprojectedExit)
    return decorateResult({
      result: { error: INVALID_MATCHUP_STATUS },
      info: 'matchUpStatus: ' + params.matchUpStatus,
      stack,
    });

  // § 2 rows 13, 14 and 15 on a TEAM dual: a result its played-on downstream does not allow (another winner, or no
  // action the dispatch accepts). They were refused by the dispatch below, after the dual's writes, which left the dual
  // stamped and announced under the error (measured 2026-11-18, TEAM SINGLE_ELIMINATION 4: a dual decided by its own
  // call, its winner played on, given the other winner). Asked here, as the dispatch asks, so the error leaves the
  // record unchanged.
  if (applyTeamWrites) {
    const refusal = downstreamRefusal(params, !!activeDownstream);
    if (refusal) return decorateResult({ result: refusal, stack });
  }

  // the TEAM dual's auto-calc and lineUps, now that nothing before the outcome's own writes can refuse
  applyTeamWrites?.();

  const validWinningSideSwap =
    !isTeam && !dualWinningSideChange && winningSide && matchUp.winningSide && matchUp.winningSide !== winningSide;

  if (allowChangePropagation && validWinningSideSwap && matchUp.roundPosition) {
    return swapWinnerLoser(params);
  }

  const matchUpWinner = (winningSide && !matchUpTieId) || params.projectedWinningSide;
  const directingMatchUpStatus = isDirectingMatchUpStatus({ matchUpStatus: params.matchUpStatus });

  pushGlobalLog({
    activeDownstream,
    matchUpWinner,
    method: stack,
    winningSide,
  });

  /**
   * A matchUp that has never SENT anything downstream cannot invalidate anything downstream, so a
   * FIRST entry is always permitted and must take the propagating branch.
   *
   * The dispatch was on `activeDownstream` alone, which conflated "has active downstream
   * dependencies" with "may not be decided at all": a `TO_BE_PLAYED` Main matchUp sitting above a
   * played consolation was refused `CANNOT_CHANGE_WINNING_SIDE` — naming a field it did not have.
   * Routing it to `applyMatchUpValues` instead is not the fix either; that writes the result
   * WITHOUT propagating it, which silently stops the winner advancing (27 `exitPropagationMatrix`
   * FMLC cells).
   *
   * The two shapes that propagate are a `winningSide` (the winner advances) and a double exit (the
   * produced exits are carried onward). Anything else has sent nothing.
   */
  const hasPropagated = !!matchUp.winningSide || isDoubleExit(matchUp.matchUpStatus);

  const lineRefusal = lineDualRefusal(params, !!activeDownstream, winningSide, matchUp, stack);
  if (lineRefusal) return lineRefusal;

  let result;
  // A BYE has no result to clear: the call leaves it the BYE it is, and still applies its schedule (`clearsABye`)
  if (
    clearsABye({
      storedMatchUpStatus: matchUp?.matchUpStatus,
      matchUpStatus: params.matchUpStatus,
      score: params.score,
      winningSide,
    })
  ) {
    result = { ...SUCCESS };
  } else if (isUndirectedDrawnOutcome(params, !!activeDownstream)) {
    result = applyMatchUpValues(params);
  } else if (!activeDownstream || !hasPropagated) {
    result = noDownstreamDependencies(params);
  } else if (matchUpWinner) {
    result = winningSideWithDownstreamDependencies(params);
  } else if (directingMatchUpStatus || params.autoCalcDisabled) {
    result = applyMatchUpValues(params);
  } else {
    result = { error: NO_VALID_ACTIONS };
  }

  // The schedule is applied only once the outcome has been accepted, and its refusals were already
  // raised above by `scheduleRefusal` — so this cannot be the step that errors over a draw
  // this call has just changed. Ordered before `applyScoredTime` so `scoredTime` is stamped onto
  // the schedule this call wrote rather than the one it replaced.
  if (!result?.error && schedule) {
    const scheduleResult = addMatchUpScheduleItems({
      disableNotice: true,
      tournamentRecords,
      tournamentRecord,
      drawDefinition,
      matchUpId,
      schedule,
    });
    if (scheduleResult.error) return decorateResult({ result: scheduleResult, stack });
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
/** the dispatch below takes the call to `noDownstreamDependencies`, whose status route refuses it (`refusesStatusRoute`) */
function refusedAtTheStatusRoute(params: Parameters<typeof swapWinnerLoser>[0], activeDownstream: boolean): boolean {
  const { matchUp, matchUpStatus, winningSide, score } = params;
  if (clearsABye({ storedMatchUpStatus: matchUp?.matchUpStatus, matchUpStatus, score, winningSide })) return false;
  if (isUndirectedDrawnOutcome(params, activeDownstream)) return false;
  const hasPropagated = !!matchUp.winningSide || isDoubleExit(matchUp.matchUpStatus);
  // a double exit asked to become a single one is unwound first (`removeDoubleExit`): not asked here
  if ((activeDownstream && hasPropagated) || isDoubleExit(matchUp.matchUpStatus)) return false;
  return refusesStatusRoute(params);
}

/**
 * What the dispatch in `resolveAndApplyOutcome` refuses for the matchUp's played-on downstream, read as it reads it and
 * writing nothing: a winner other than the one that stands (`winningSideWithDownstreamDependencies`: § 2 rows 13 and
 * 14), or neither a winner nor a directing status (row 15). Undefined where the dispatch writes.
 */
function downstreamRefusal(params: Parameters<typeof swapWinnerLoser>[0], activeDownstream: boolean) {
  const { matchUp, matchUpStatus, winningSide, score } = params;
  if (clearsABye({ storedMatchUpStatus: matchUp?.matchUpStatus, matchUpStatus, score, winningSide })) return undefined;
  if (isUndirectedDrawnOutcome(params, activeDownstream)) return undefined;
  const hasPropagated = !!matchUp.winningSide || isDoubleExit(matchUp.matchUpStatus);
  if (!activeDownstream || !hasPropagated) return undefined;
  const matchUpWinner = (winningSide && !params.matchUpTieId) || params.projectedWinningSide;
  if (matchUpWinner) return changedWinnerRefusal(params);
  if (isDirectingMatchUpStatus({ matchUpStatus }) || params.autoCalcDisabled) return undefined;
  return { error: NO_VALID_ACTIONS };
}

function applyScoredTime({ matchUp }) {
  const action = scoredTimeAction(matchUp);
  if (action === 'initialize') {
    if (!matchUp.schedule) matchUp.schedule = {};
    matchUp.schedule.scoredTime = nowIso({ kind: 'scoredTime', target: matchUp });
  } else if (action === 'clear') {
    delete matchUp.schedule.scoredTime;
  }
}

/**
 * A TEAM dual's auto-calc, DECIDED here and WRITTEN by the returned `apply`.
 *
 * The decision (the projected winningSide, and the refusal to change it under active downstream) reads only the draw.
 * The writes (the `disableAutoCalc` flag, the sides' lineUps) used to be made here, above every refusal that follows
 * them in `writeMatchUpState`, so a TEAM call refused there (`AWAITING_RESULT`, a participant check, a schedule) had
 * already written them (CA, 2026-10-22: an error leaves the record unchanged, and no mutation relies on rollback).
 * Nothing between reads them, so `apply` is called once every refusal before the outcome's own writes has been asked.
 */
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
  let unprojectedExit = false;
  let autoCalcValue: true | undefined;

  // A score without sets (a record of how a level tie was decided, or the strings alone) keeps the dual's aggregate
  if (!enableAutoCalc && isPartialDualScore(params.score)) {
    Object.assign(params, { score: { ...matchUp.score, ...params.score } });
  }

  if (disableAutoCalc) {
    autoCalcValue = true;
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

    // an exit entered with a winner where the lines project none: the call's winner is replaced by the projected one,
    // so the exit would be written with no winner, or beside a winner it does not name (`unprojectedExit`)
    unprojectedExit = isExit(params.matchUpStatus) && !!winningSide && !projectedWinningSide;

    // setting these parameters will enable noDownStreamDependencies to attemptToSetWinningSide
    Object.assign(params, {
      winningSide: projectedWinningSide,
      dualWinningSideChange,
      projectedWinningSide,
      score,
    });
  }

  const apply = () => {
    if (disableAutoCalc || enableAutoCalc) {
      setFirstClassOrExtension({
        element: matchUp,
        attribute: 'disableAutoCalc',
        name: DISABLE_AUTO_CALC,
        value: autoCalcValue,
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
  };

  return { dualWinningSideChange, unprojectedExit, apply };
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

  const { projectedWinningSide, projectedScore } = getProjectedDualWinningSide({
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

  // first-class (NATIVE) with fallback to the legacy `_disableAutoCalc` hydrated alias (LEGACY)
  const autoCalcDisabled = dualMatchUp.disableAutoCalc ?? dualMatchUp._disableAutoCalc;
  // a dual decided by its own exit or call keeps its winner while its lines project none: that winner is the projected
  // one, so nothing downstream reads the line as taking it away (CA, 2026-11-20, class 4)
  const { keepsDecision: keepsDualDecision, lineDecided: dualLineDecided } = dualKeepsOwnDecision({
    projectedWinningSide,
    autoCalcDisabled,
    drawDefinition,
    dualMatchUp,
    matchUpsMap,
    tieFormat,
    structure,
    event,
  });

  const existingDualMatchUpWinningSide = dualMatchUp.winningSide;
  const keptWinningSide = keepsDualDecision ? existingDualMatchUpWinningSide : projectedWinningSide;
  const dualWinningSideChange = keptWinningSide !== existingDualMatchUpWinningSide;

  return {
    projectedWinningSide: keptWinningSide,
    // the tally's own projection, as the line's feed-eligibility question reads it (row 12)
    talliedWinningSide: projectedWinningSide,
    projectedDualScore: projectedScore,
    isCollectionMatchUp: true,
    dualWinningSideChange,
    keepsDualDecision,
    dualLineDecided,
    autoCalcDisabled,
    matchUpTieId,
    dualMatchUp,
    tieFormat,
  };
}

/**
 * A LINE OF A DUAL THAT HOLDS A DOUBLE EXIT, WITH THE DUAL'S DOWNSTREAM ACTIVE, IS REFUSED — as a
 * direct re-score of that dual is.
 *
 * `hasPropagated` reads the LINE, which has sent nothing, so every line took the no-downstream
 * branch however active the dual's downstream was. Scoring it then recomputed the dual out of its
 * double exit, and the unwind that follows (`unwindDualDoubleExit`) would take back a produced
 * walkover whose winner has already PLAYED the next round — measured 2026-10-01 on a TEAM
 * SINGLE_ELIMINATION 8: the final, COMPLETED 2-0, reset to TO_BE_PLAYED with one team left in it.
 * The dual's own re-score is refused in exactly this state by `winningSideWithDownstreamDependencies`;
 * its lines get the same answer.
 */
function lineDualRefusal(params, activeDownstream: boolean, winningSide?: number, matchUp?: MatchUp, stack?: string) {
  if (params.isCollectionMatchUp && isDoubleExit(params.dualMatchUp?.matchUpStatus) && activeDownstream) {
    return decorateResult({
      result: { error: CANNOT_CHANGE_OUTCOME },
      info: 'the dual holds a double exit whose produced result has been played on',
      context: { dualMatchUpId: params.dualMatchUp.matchUpId, dualMatchUpStatus: params.dualMatchUp.matchUpStatus },
      stack,
    });
  }
  return lineTakesDualWinnerRefusal(params, activeDownstream, winningSide, matchUp);
}

/**
 * § 2 row 14 (CA, 2026-11-19; line-decided duals, 2026-11-20): a TEAM line whose tally would take away the winner its
 * lines gave the dual, sent on to a played-on downstream. Asked of the dual before anything is written, whether or not
 * the line itself has propagated
 */
function lineTakesDualWinnerRefusal(params, activeDownstream: boolean, winningSide?: number, matchUp?: MatchUp) {
  const refused = lineTakesPlayedOnDualWinner({
    dualWinningSide: params.isCollectionMatchUp ? params.dualMatchUp?.winningSide : undefined,
    autoCalcDisabled: params.autoCalcDisabled && params.disableAutoCalc !== false,
    projectedWinningSide: params.projectedWinningSide,
    isLine: params.isCollectionMatchUp,
    lineDecided: params.dualLineDecided,
    activeDownstream,
  });
  if (!refused) return undefined;
  return decorateResult({
    stack: 'winningSideWithDownstreamDependencies',
    result: { error: CANNOT_CHANGE_WINNING_SIDE },
    info: "the line would take away its dual's winner, whose downstream has been played on",
    context: { winningSide, matchUp },
  });
}

/** rows 13 and 14: a winner named beneath a played-on downstream that is not the winner standing there */
function changedWinnerRefusal(params) {
  const { matchUp, winningSide, matchUpTieId, dualWinningSideChange, autoCalcDisabled } = params;
  // A LINE WHOSE OWN WINNER STANDS CAN STILL CHANGE ITS DUAL'S: a dual decided by its own call holds a winner its lines
  // need not project, and a line entered again (its winner unchanged, a score or an exit relabelled) tallies the dual
  // afresh. Where the dual's winner has been played on that is a changed winner, refused as one; it was written, the
  // dual handed to the other side with its first winner left standing in the next dual (2026-11-19, walk seed 13). A
  // dual scored by hand is not tallied, so its lines change nothing there.
  const dualChanges = !!matchUpTieId && !!dualWinningSideChange && !autoCalcDisabled;
  if ((winningSide === matchUp.winningSide && !dualChanges) || (matchUpTieId && !dualWinningSideChange))
    return undefined;
  // A double exit has no `winningSide` to change — it is the OUTCOME being changed, and naming
  // the missing field would contradict what the TD is looking at.
  const error = matchUp.winningSide ? CANNOT_CHANGE_WINNING_SIDE : CANNOT_CHANGE_OUTCOME;
  return decorateResult({
    stack: 'winningSideWithDownstreamDependencies',
    result: { error },
    context: { winningSide, matchUp },
  });
}

function winningSideWithDownstreamDependencies(params) {
  const { matchUp, winningSide } = params;
  const refusal = changedWinnerRefusal(params);
  if (!refusal) {
    const relabel = !!winningSide && winningSide === matchUp.winningSide && !params.isCollectionMatchUp;
    const result = applyMatchUpValues(params);
    if (result.error || !relabel) return result;
    refreshArrivals(params);
    // a RELABEL with the winner already played on: nothing here directs the loser, so the exit it now
    // carries (or no longer carries) is settled on its own (CA, 2026-10-02)
    const relabelled = relabelWithoutDirection({
      matchUpId: params.matchUpId ?? matchUp.matchUpId,
      ...params,
    });
    if (relabelled.error) return relabelled;
    const { context } = relabelled;
    return context ? { ...result, context: { ...((result as any).context ?? {}), ...context } } : result;
  }
  return refusal;
}

function applyMatchUpValues(params) {
  const { tournamentRecord, matchUp, event } = params;
  const combinedPointCorrection =
    !!parse(resolveScoringFormat({ ...params, incoming: params.matchUpFormat }) ?? '')?.setFormat?.combinedPointTotal &&
    !!params.score &&
    !params.winningSide;
  const removeWinningSide =
    combinedPointCorrection ||
    (params.isCollectionMatchUp &&
      matchUp.winningSide &&
      !params.winningSide &&
      !checkScoreHasValue({ score: params.score }));
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
      keepsDecision: params.keepsDualDecision,
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

function checkParticipants({
  assignedDrawPositions,
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
        .every((assignment) => assignment.participantId) &&
      // A matchUp storing its own sides (a TEAM dual) is not read against the assignments above, and the empty list
      // held every assignment it was asked about: a dual opposite a BYE read as two participants, and a winner or an
      // exit entered on it was written, the BYE dual DEFAULTED and the BYE sent to the consolation as its loser
      // (2026-11-19, TEAM FIRST_MATCH_LOSER_CONSOLATION 8/6). A BYE the dual holds is a BYE; its lines are not asked.
      !(
        matchUp?.sides &&
        !matchUp.collectionId &&
        allAssignments?.some((assignment) => assignment.bye && assignedDrawPositions.includes(assignment.drawPosition))
      ));
  if (
    matchUpStatus &&
    // A single WALKOVER or DEFAULTED can stand with ONE participant present: carried there by the cascade,
    // or RECORDED by the director before the second opponent arrives — the present participant is ill,
    // injured or defaulted for conduct between matches, and whoever arrives takes the walkover. CA,
    // 2026-10-04: *"propagateExitStatus shouldn't have anything to do with this ability"*; this waiver
    // required the flag until then, so the same entry was refused under any policy that left it off.
    //
    // DOUBLE_DEFAULT was missing from this list while DOUBLE_WALKOVER was present, so a
    // single-participant propagated DOUBLE_DEFAULT fell through to the participants-required
    // validation and was refused. Measured: reachable, 1 occurrence over the 600-seed sweep window.
    [WALKOVER, DEFAULTED, DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(matchUpStatus) &&
    participantsCount === 1 &&
    // WHO the single exit is awarded to, and it is not a formality — this, not a request flag, is the
    // guard. The waiver once tested `propagateExitStatus` alone, so a TD entering `{ matchUpStatus:
    // WALKOVER, winningSide: <the empty side> }` on a half-filled FIRST_MATCH_LOSER_CONSOLATION matchUp
    // whose empty seat was a PHANTOM (claimed, holding nobody) recorded a walkover won by nobody
    // (measured 2026-09-13). A DIRECT entry is waived only when the side it awards the exit to is not a
    // phantom, not the participant already there, and not a BYE — see exitAwardable. The cascade
    // genuinely needs the empty side to win (`progressExitStatus` RULE 2) and identifies itself with
    // `propagatingExit`.
    (propagatingExit ||
      !winningSide ||
      exitAwardable({ positionAssignments: allAssignments, inContextMatchUp, winningSide })) &&
    // A DOUBLE exit is two exits, one per seat, so a DIRECT one needs both seats reached. CA,
    // 2026-10-04: *"How can three entities arrive in one matchUp which can only hold two
    // drawPositions?"* Entered beside an unreached seat, the arrival later meets a double exit already
    // standing, and the convergence written there was refused and dropped (F3, census 9100555). Only
    // the cascade's own write keeps the waiver, as it does with propagation off: refused.
    (propagatingExit || !isDoubleExit(matchUpStatus))
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

function isWalkoverStatus(status?: string) {
  return !!status && [WALKOVER, DOUBLE_WALKOVER].includes(status);
}

function outcomePolicies(params: SetMatchUpStateArgs): PolicyDefinitions {
  const { tournamentRecord, drawDefinition, event } = params;
  const { appliedPolicies = {} } = getAppliedPolicies({
    policyTypes: [POLICY_TYPE_PROGRESSION, POLICY_TYPE_SCORING, POLICY_TYPE_ROUND_ROBIN_TALLY],
    tournamentRecord,
    drawDefinition,
    event,
  });
  if (isObject(params.policyDefinitions)) Object.assign(appliedPolicies, params.policyDefinitions);
  return appliedPolicies;
}

/**
 * A recorded result downstream fixes the KIND of this outcome (P52; CA, 2026-10-11): a correction from an exit to a
 * played result, or the reverse, is refused above every mutation when the loser's path holds one. The cascade's own
 * writes are not corrections and are not asked.
 */
function correctionKindRefusal({
  inContextDrawMatchUps,
  inContextMatchUp,
  loserTargetLink,
  matchUp,
  params,
}: {
  inContextDrawMatchUps?: HydratedMatchUp[];
  inContextMatchUp?: HydratedMatchUp;
  loserTargetLink?: DrawLink;
  params: SetMatchUpStateArgs;
  matchUp: MatchUp;
}) {
  if (params.propagatingExit) return undefined;
  const kindChange = correctionKindChange({
    propagateRetirementAsExit: params.propagateRetirementAsExit,
    loserTargetLink,
    propagateExitStatus: params.propagateExitStatus,
    matchUpStatus: params.matchUpStatus,
    winningSide: params.winningSide,
    inContextDrawMatchUps,
    inContextMatchUp,
    drawDefinition: params.drawDefinition,
    matchUp,
  });
  if (!kindChange) return undefined;
  return decorateResult({
    result: { error: CANNOT_CHANGE_OUTCOME },
    info: 'a result recorded downstream fixes whether this outcome is an exit or a played result',
    context: {
      currentMatchUpStatus: matchUp.matchUpStatus,
      blockingMatchUpId: kindChange.blockingMatchUpId,
      matchUpStatus: params.matchUpStatus,
    },
    stack: 'correctionKind',
  });
}

/** the loser of the linked round has already been directed under the previous outcome (row 12) */
function feedEligibilityRefusal(args: Parameters<typeof feedEligibilityChange>[0]) {
  const eligibilityChange = feedEligibilityChange(args);
  if (!eligibilityChange) return undefined;
  return decorateResult({
    result: { error: CANNOT_CHANGE_FEED_ELIGIBILITY },
    info: 'the loser of the linked round has already been directed under the previous outcome',
    context: {
      currentMatchUpStatus: args.matchUp?.matchUpStatus,
      blockingMatchUpId: eligibilityChange.sourceRoundMatchUpId,
      matchUpStatus: args.matchUpStatus,
    },
    stack: 'feedEligibility',
  });
}

/** a line whose tally relabels its dual, the dual's loser already directed under the previous outcome (row 12) */
function lineFeedEligibilityRefusal(args: Parameters<typeof lineFeedEligibilityChange>[0]) {
  const eligibilityChange = lineFeedEligibilityChange(args);
  if (!eligibilityChange) return undefined;
  return decorateResult({
    result: { error: CANNOT_CHANGE_FEED_ELIGIBILITY },
    info: 'the line relabels its dual, whose loser has already been directed under the previous outcome',
    context: {
      currentMatchUpStatus: args.dualMatchUp?.matchUpStatus,
      blockingMatchUpId: eligibilityChange.sourceRoundMatchUpId,
      matchUpStatus: COMPLETED,
    },
    stack: 'feedEligibility',
  });
}

// Retain the existing internal import surface while consumers move to the query.
export {
  missingDrawPositionsRefusal,
  type MissingDrawPositionsParams,
} from '@Query/matchUp/missingDrawPositionsRefusal';
