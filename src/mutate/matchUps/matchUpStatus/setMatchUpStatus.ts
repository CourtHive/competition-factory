import { matchUpHoldsScheduling, matchUpWillNeverBePlayed } from '@Mutate/matchUps/schedule/byeScheduling';
import { settleRederivedDoubleExits } from '@Mutate/matchUps/matchUpStatus/settleRederivedDoubleExits';
import { getDeciderFinals, reconcileDeciders } from '@Mutate/matchUps/matchUpStatus/reconcileDecider';
import { reconcileStaleExitOrigins } from '@Mutate/matchUps/matchUpStatus/reconcileStaleExitOrigins';
import { checkMatchUpFormatApplication } from '@Mutate/matchUps/matchUpFormat/applyMatchUpFormat';
import { settleHeldExits } from '@Mutate/drawDefinitions/positionGovernor/doubleExitAdvancement';
import { reconcileScoredTimes } from '@Mutate/matchUps/matchUpStatus/reconcileScoredTimes';
import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { progressExitStatus } from '@Mutate/matchUps/drawPositions/progressExitStatus';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { setMatchUpState } from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import { matchUpScore } from '@Assemblies/generators/matchUps/matchUpScore';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { getMatchUpFormat } from '@Query/hierarchical/getMatchUpFormat';
import { tiebreakPointsWarnings } from '@Validators/validateScore';
import { decideOutcomeV2 } from '@Mutate/matchUps/outcome/decide';
import { decorateResult } from '@Functions/global/decorateResult';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { isDoubleExit } from '@Validators/isExit';
import { findPolicy } from '@Acquire/findPolicy';
import { findEvent } from '@Acquire/findEvent';

// constants and types
import { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import { PolicyDefinitions, ResultType, ResultWarning } from '@Types/factoryTypes';
import { DRAW_DEFINITION, MATCHUP_ID } from '@Constants/attributeConstants';
import { INVALID_WINNING_SIDE } from '@Constants/errorConditionConstants';
import { SCHEDULE_PRESERVED_ON_EXIT } from '@Constants/scheduleConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { TEAM } from '@Constants/matchUpTypes';

/**
 * Sets either matchUpStatus or score and winningSide; values to be set are passed in outcome object.
 * Public API for setting matchUpStatus or score and winningSide.
 */

type SetMatchUpStatusArgs = {
  tournamentRecords?: { [key: string]: Tournament };
  policyDefinitions?: PolicyDefinitions;
  disableScoreValidation?: boolean;
  allowChangePropagation?: boolean;
  propagateExitStatus?: boolean;
  propagateRetirementAsExit?: boolean;
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  disableAutoCalc?: boolean;
  enableAutoCalc?: boolean;
  matchUpFormat?: string;
  tournamentId?: string;
  setTBlast?: boolean; // when true, the tiebreak score always appears last in set score string; when false, the tiebreak score is listed in parentheses after the losing set score
  matchUpId: string;
  eventId?: string;
  drawId?: string;
  schedule?: any;
  notes?: string;
  event?: Event;
  outcome?: any;
};
/**
 * Find the draw from a `drawId` when no `drawDefinition` was passed.
 *
 * A convenience for a direct caller: the engine always hands over a `drawDefinition`. It writes what
 * it finds onto `params`, which is what the rest of `setMatchUpStatus` reads.
 */
function resolveDrawDefinition(params: SetMatchUpStatusArgs, tournamentRecords: any) {
  // with nothing to find it BY there is nothing to look for, and the caller is told what is missing
  if (params.drawDefinition || (!params.drawId && !params.eventId)) return undefined;

  const tournamentRecord = params.tournamentRecord ?? (params.tournamentId && tournamentRecords[params.tournamentId]);
  params.tournamentRecord ??= tournamentRecord;

  const result = findEvent({
    eventId: params.eventId,
    drawId: params.drawId,
    tournamentRecord,
  });
  if (result.error) return result;
  if (result.drawDefinition) params.drawDefinition = result.drawDefinition;
  params.event = result.event;

  return undefined;
}

/**
 * What is decided on the draw as it STANDS once the mutation has settled, rather than on the events
 * that led there. Each returns its error; neither is allowed to fail quietly.
 */
function settleDraw({
  finalsBefore,
  params,
}: {
  finalsBefore: Map<string, number | undefined>;
  params: SetMatchUpStatusArgs;
}): ResultType {
  const { tournamentRecord, drawDefinition, event } = params;

  // an exit held where nobody can play it is sent on, now that the draw it is decided on is settled
  const { appliedPolicies } = getAppliedPolicies({ tournamentRecord, drawDefinition, event });
  const settled = settleHeldExits({ tournamentRecord, appliedPolicies, drawDefinition, event });
  if (settled.error) return settled;

  // a final that feeds a decider settles whether the decider is needed — see `reconcileDecider`
  return reconcileDeciders({ tournamentRecord, drawDefinition, finalsBefore, event });
}

export function setMatchUpStatus(params: SetMatchUpStatusArgs) {
  // DECISION: Validate required parameters before any processing
  // WHY: Fail fast if essential data is missing. `matchUpId` is asked for here; `drawDefinition` is
  // asked for BELOW, once the draw has had its chance to be found from a `drawId`. Asking for both
  // here refused every caller the resolution exists to serve.
  const paramsCheck = checkRequiredParameters(params, [{ [MATCHUP_ID]: true }]);
  if (paramsCheck.error) return paramsCheck;

  const stack = 'setMatchUpStatus';

  // DECISION: Resolve tournament records to support multi-tournament operations
  // WHY: Enables setting matchUp status across multiple tournaments in a single operation
  const tournamentRecords = resolveTournamentRecords(params);
  const resolved = resolveDrawDefinition(params, tournamentRecords);
  if (resolved?.error) return resolved;

  const drawCheck = checkRequiredParameters(params, [{ [DRAW_DEFINITION]: true }]);
  if (drawCheck.error) return drawCheck;

  const {
    disableScoreValidation,
    policyDefinitions,
    tournamentRecord,
    disableAutoCalc,
    enableAutoCalc,
    drawDefinition,
    matchUpId,
    schedule,
    event,
    notes,
  } = params;

  // DECISION: Accept matchUpFormat from either direct param or nested in outcome
  // WHY: Provides flexibility in how API is called - format can be set along with status/score
  const matchUpFormat = params.matchUpFormat || params.outcome?.matchUpFormat;

  // DECISION: Look up scoring policy for this tournament/event
  // WHY: Policies control validation rules and behavior (e.g., whether to require participants for scoring)
  const { policy } = findPolicy({
    policyType: POLICY_TYPE_SCORING,
    tournamentRecord,
    event,
  });

  // THE POLICY GOVERNS, both ways (CA, 2026-10-01). An applied scoring policy that SPEAKS on a flag,
  // true or false, wins over anything on the call; the call decides only where the policy is silent.
  // "If a governance policy is someone who retires can no longer continue playing, a tournament
  // director under that policy shouldn't be able to allow a participant to continue in the draw."
  // Before this, params won (`propagateRetirementAsExit`) or a truthy param won (`||`, the other
  // two), so a caller could override its federation's rule. The same rule for all three:
  // `policy ?? param ?? default`. `POLICY_SCORING_DEFAULT` is SILENT on all three, so a provider
  // that attaches it leaves the decision to the call; a provider that forbids sets `false`.
  const allowChangePropagation = policy?.allowChangePropagation ?? params.allowChangePropagation ?? undefined;
  const propagateExitStatus = policy?.propagateExitStatus ?? params.propagateExitStatus ?? undefined;
  // absent both, FALSE: a retiree is out of a MATCH, not out of the EVENT, unless the policy says so
  const propagateRetirementAsExit = policy?.propagateRetirementAsExit ?? params.propagateRetirementAsExit ?? false;

  const { outcome, setTBlast } = params;

  // DECISION: Validate winningSide is 1 or 2 (or undefined)
  // WHY: winningSide represents which side won - only 1 (side 1) or 2 (side 2) are valid
  // Catching invalid values here prevents downstream errors
  // a winningSide is 1 or 2, or it is absent: 0 is refused, never read as absent (CA, 2026-10-01)
  if (outcome?.winningSide != null && ![1, 2].includes(outcome.winningSide)) {
    return { error: INVALID_WINNING_SIDE };
  }

  // DECISION: VALIDATE the matchUpFormat here; do not WRITE it here.
  // WHY: this used to call `applyMatchUpFormat`, which persists the format onto the matchUp, before
  // the outcome had been validated at all — so a refused outcome left the new format behind. A call
  // that returns an error must change nothing (`ERROR_IMPLIES_NO_MUTATION`).
  // The write is not lost by moving it: every outcome path funnels through `modifyMatchUpScore`,
  // whose `applyScoreAndStatus` persists `matchUpFormat` once the outcome is accepted. Validation
  // still has to happen up here, because score validation below is resolved against this format and
  // an unrecognised one must be refused before any of it runs.
  if (matchUpFormat) {
    const check = checkMatchUpFormatApplication({ drawDefinition, matchUpFormat, matchUpId, event });
    if (check.error) return check;
  }

  // DECISION: score strings are DERIVED from score.sets — never accepted from the caller
  // WHY: validateScore only type-checks scoreStringSide1/scoreStringSide2; nothing compares them to
  // score.sets. Previously generation was skipped whenever the caller supplied a string, so an
  // integration that sent its own strings bypassed generation permanently and factory persisted
  // strings it could never emit and its own parseScoreString could not round-trip — including
  // set scores present in the string but absent from sets. Regenerating unconditionally makes
  // score.sets the single source of truth. See competition-factory#4564.
  if (outcome?.score?.sets) {
    // DECISION: Filter out empty sets BEFORE generating score strings
    // WHY: Prevents invalid/incomplete sets from being saved, and filtering afterwards left the
    // generated string describing a set that had just been removed from score.sets
    const sets = outcome.score.sets.filter(
      (set) =>
        set.side1Score ||
        set.side2Score ||
        set.side1TiebreakScore ||
        set.side2TiebreakScore ||
        set.side1PointScore ||
        set.side2PointScore,
    );

    // DECISION: resolve the matchUp's effective format rather than relying on outcome.matchUpFormat
    // WHY: generateScoreString needs the format to recognize a tiebreak-only deciding set (F:TB10) and
    // render it as [10-8]. The format usually lives on the matchUp, not on the outcome, so spreading
    // outcome alone left it undefined and the deciding set rendered as a plain game score.
    // Resolution failure yields undefined — the same format-less rendering as before, never worse.
    const formatResult: any = matchUpFormat
      ? undefined
      : getMatchUpFormat({ tournamentRecord, drawDefinition, matchUpId, event });
    const effectiveMatchUpFormat = matchUpFormat ?? formatResult?.matchUpFormat;

    const { score: scoreObject } = matchUpScore({
      ...outcome,
      matchUpFormat: effectiveMatchUpFormat,
      score: { ...outcome.score, sets },
      setTBlast,
    });
    // matchUpScore carries forward every non-derived attribute of the score it was handed
    // (score.side1PointScore and friends), so assigning its result is not lossy
    outcome.score = scoreObject;
  }

  // read BEFORE the mutation: `reconcileDeciders` acts only on a final whose winner has changed
  const finalsBefore = getDeciderFinals(drawDefinition);
  // ONE map for the whole call. `setMatchUpState` builds this itself unless handed one; building it
  // here instead lets the before-snapshot and the warning below read the same flat array the
  // cascade writes through, so neither walks the draw again. Its matchUps are the live objects.
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  // which matchUps already could never be played, so the warning names only what THIS call left so
  // the double exits standing before the call: one that re-derives to a single exit is settled at the end
  const doubleExitsBefore = new Set(
    matchUpsMap.drawMatchUps.filter((matchUp) => isDoubleExit(matchUp.matchUpStatus)).map((m) => m.matchUpId),
  );
  const neverPlayedBefore = new Set(
    matchUpsMap.drawMatchUps.filter((matchUp) => matchUpWillNeverBePlayed({ matchUp })).map((m) => m.matchUpId),
  );

  // The v2 pipeline decides the refusals (§ 2) before v1 runs. Under `v2` its refusal is the answer
  // and v1 is not asked; under `differential` v1 runs as well and the two must agree. Under `v1`,
  // the default, this is a no-op. See `src/mutate/matchUps/outcome/`.
  const v2 = decideOutcomeV2({
    request: {
      matchUpStatusCodes: outcome?.matchUpStatusCodes,
      matchUpStatus: outcome?.matchUpStatus,
      winningSide: outcome?.winningSide,
      score: outcome?.score,
      matchUpFormat,
      matchUpId,
      flags: {
        allowChangePropagation,
        propagateExitStatus,
        propagateRetirementAsExit,
        disableScoreValidation,
        disableAutoCalc,
        enableAutoCalc,
      },
    },
    policyDefinitions,
    tournamentRecord,
    drawDefinition,
    event,
  });
  if (v2.refused) return decorateResult({ result: v2.refused, stack });

  // DECISION: Delegate to setMatchUpState for core status/score setting logic
  // WHY: Separation of concerns - setMatchUpStatus handles API/validation/orchestration,
  // setMatchUpState handles actual state mutations and participant progression logic
  const result = setMatchUpState({
    matchUpStatusCodes: outcome?.matchUpStatusCodes,
    matchUpsMap,
    matchUpStatus: outcome?.matchUpStatus,
    winningSide: outcome?.winningSide,
    allowChangePropagation,
    disableScoreValidation,
    score: outcome?.score,
    propagateExitStatus,
    propagateRetirementAsExit,
    tournamentRecords,
    policyDefinitions,
    tournamentRecord,
    disableAutoCalc,
    enableAutoCalc,
    drawDefinition,
    matchUpFormat,
    matchUpId,
    schedule,
    event,
    notes,
  });
  // DECISION: Check if exit status propagation is needed
  // WHY: When a participant exits via WALKOVER/DEFAULTED/RETIRED, their opponent advances
  // and the exited participant may need to be placed in a consolation draw with the exit status
  // The progressExitStatus flag in context signals this scenario occurred
  if (result.context?.progressExitStatus) {
    // DECISION: Use iterative loop instead of recursion for multi-level propagation
    // WHY: In structures like COMPASS draws, exit status may propagate through multiple levels
    // (e.g., East → West → South → Southeast). Iteration is safer than deep recursion.
    // Failsafe prevents infinite loops if there's a circular reference or bug
    let iterate = true;
    let failsafe = 0;
    while (iterate && failsafe < 10) {
      iterate = false;
      failsafe += 1;

      // DECISION: Call progressExitStatus to set status on consolation matchUp
      // WHY: Participant has been directed to consolation matchUp by directLoser,
      // now we need to set that matchUp's status (e.g., WALKOVER if only one participant)
      const progressResult = progressExitStatus({
        sourceMatchUpStatusCodes: result.context.sourceMatchUpStatusCodes,
        sourceMatchUpStatus: result.context.sourceMatchUpStatus,
        sourceWinningSide: result.context.sourceWinningSide,
        loserParticipantId: result.context.loserParticipantId,
        sourceMatchUpId: result.context.sourceMatchUpId,
        propagateExitStatus,
        tournamentRecord: params.tournamentRecord,
        loserMatchUp: result.context.loserMatchUp,
        matchUpsMap: result.context.matchUpsMap,
        drawDefinition: params.drawDefinition,
        event: params.event,
      });

      // A REFUSED WRITE IS RETURNED, never dropped (F3). The loop used to read only `context`, so a
      // refusal here reported success over a draw the cascade had left half-written.
      if (progressResult.error) {
        v2.compare?.(progressResult);
        return decorateResult({ result: progressResult, stack });
      }

      // DECISION: Continue iterating if there's another level of consolation
      // WHY: The consolation matchUp itself might feed into another consolation level
      // If progressResult returns another loserMatchUp, we need to process that too
      if (progressResult.context?.loserMatchUp) {
        Object.assign(result.context, progressResult.context);
        iterate = true;
      }
    }
  }
  // Everything has settled — removals, directions and exit propagation — which is the earliest point
  // at which a carried exit's ORIGIN can be asked whether it still describes one. See
  // `reconcileStaleExitOrigins` for the two corrections that pull the timing in opposite directions.
  // a convergence that lost one of its origins goes where the kept origin alone puts it
  settleRederivedDoubleExits({
    tournamentRecord: params.tournamentRecord,
    drawDefinition: params.drawDefinition,
    targetMatchUpId: matchUpId,
    propagateExitStatus,
    doubleExitsBefore,
    event: params.event,
  });
  reconcileStaleExitOrigins({
    matchUpsMap: result.context?.matchUpsMap,
    drawDefinition: params.drawDefinition,
    tournamentRecord: params.tournamentRecord,
    event: params.event,
  });
  // and once settled, no matchUp left without a result keeps the `scoredTime` a cascade stamped on it
  reconcileScoredTimes({
    matchUps: matchUpsMap.drawMatchUps,
    drawDefinition: params.drawDefinition,
    tournamentRecord: params.tournamentRecord,
    event: params.event,
  });

  if (!result.error) {
    const settled = settleDraw({ finalsBefore, params });
    if (settled.error) return decorateResult({ result: settled, stack });
    const warnings = [
      ...schedulePreservedWarnings({ matchUps: matchUpsMap.drawMatchUps, neverPlayedBefore }),
      ...(disableScoreValidation || !outcome?.score?.sets?.length ? [] : recordedScoreWarnings(params)),
    ];
    if (warnings.length) Object.assign(result, { warnings: [...(result.warnings ?? []), ...warnings] });
  }

  v2.compare?.(result);

  return decorateResult({ result, stack });
}

/**
 * A WARNING IN THE SUCCESS PAYLOAD: the score was recorded, and a set in it was decided by its tiebreak
 * with no tiebreak points (`7-6` alone) — accepted because results feeds record it so often (CA,
 * 2026-10-02, ruling V11). Read off the RECORDED matchUp in context, so the format is the one the score
 * was validated against — a TEAM line's comes from its collection — and a dual's tally is never asked.
 */
function recordedScoreWarnings({ drawDefinition, matchUpId, event }: any): ResultWarning[] {
  const { matchUp } = findDrawMatchUp({ drawDefinition, matchUpId, event, inContext: true });
  if (!matchUp || matchUp.matchUpType === TEAM) return [];
  return tiebreakPointsWarnings(matchUp.score?.sets, matchUp.matchUpFormat);
}

/**
 * A WARNING IN THE SUCCESS PAYLOAD: this call left a BYE or a produced exit holding a court or a time.
 *
 * Read off the call's own `matchUpsMap` — no walk of the draw beyond the one the cascade already made.
 *
 * The draw state is right — the placement is PRESERVED, by the rule `byeScheduling.ts` states, so a
 * director mid-swap does not lose their plan — and the read side flags the slot
 * (`CONFLICT_BYE_SCHEDULED`, `CONFLICT_EXIT_SCHEDULED`). What the read side cannot do is tell the
 * client that just made the mutation, at the moment it can offer "release these slots?". This does.
 * Additive and state-free: `executionQueue` passes it through like any other result field, and
 * nothing here snapshots or restores. CA, 2026-10-01: *"for recoverability we have to keep the
 * schedules, or perhaps they should imply another notification in the success payload (warning)
 * that clients can respond to"* — both.
 *
 * Only matchUps that became unplayable IN THIS CALL are named: a BYE that held a court before the
 * call was reported when it was placed, and repeating it on every later score would be noise.
 */
function schedulePreservedWarnings({
  neverPlayedBefore,
  matchUps,
}: {
  neverPlayedBefore: Set<string>;
  matchUps: MatchUp[];
}): ResultWarning[] {
  const matchUpIds = matchUps
    .filter(
      (matchUp) =>
        !neverPlayedBefore.has(matchUp.matchUpId) &&
        matchUpWillNeverBePlayed({ matchUp }) &&
        matchUpHoldsScheduling({ matchUp }),
    )
    .map((matchUp) => matchUp.matchUpId);
  return matchUpIds.length ? [{ code: SCHEDULE_PRESERVED_ON_EXIT, matchUpIds }] : [];
}
