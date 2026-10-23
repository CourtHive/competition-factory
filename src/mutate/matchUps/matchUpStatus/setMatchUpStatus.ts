import { oweDissolvedConvergencesTheirByes } from '@Mutate/matchUps/matchUpStatus/oweDissolvedConvergencesTheirByes';
import { reconcileConsolationReservations } from '@Mutate/matchUps/matchUpStatus/reconcileConsolationReservations';
import { reconcileMissedLinkAdvancements } from '@Mutate/matchUps/matchUpStatus/reconcileMissedLinkAdvancements';
import { matchUpHoldsScheduling, matchUpWillNeverBePlayed } from '@Mutate/matchUps/schedule/byeScheduling';
import { getDeciderSnapshot, reconcileDeciders } from '@Mutate/matchUps/matchUpStatus/reconcileDecider';
import { settleRederivedDoubleExits } from '@Mutate/matchUps/matchUpStatus/settleRederivedDoubleExits';
import { settleForwardConsequences } from '@Mutate/matchUps/matchUpStatus/settleForwardConsequences';
import { reconcileStaleExitOrigins } from '@Mutate/matchUps/matchUpStatus/reconcileStaleExitOrigins';
import { reconcileLinkAdvancements } from '@Mutate/matchUps/matchUpStatus/reconcileLinkAdvancements';
import { FORWARD_SETTLE_EXHAUSTED } from '@Mutate/matchUps/matchUpStatus/settleForwardConsequences';
import { resolveRotatingPartnerOutcome } from '@Query/drawDefinition/resolveRotatingPartnerOutcome';
import { reconcileByeAdvancements } from '@Mutate/matchUps/matchUpStatus/reconcileByeAdvancements';
import { reconcileCarriesPastByes } from '@Mutate/matchUps/matchUpStatus/reconcileCarriesPastByes';
import { reconcileProvenanceSides } from '@Mutate/matchUps/matchUpStatus/reconcileProvenanceSides';
import { checkMatchUpFormatApplication } from '@Mutate/matchUps/matchUpFormat/applyMatchUpFormat';
import { settleHeldExits } from '@Mutate/drawDefinitions/positionGovernor/doubleExitAdvancement';
import { announceGoesTo, setMatchUpState } from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import { reconcileScoredTimes } from '@Mutate/matchUps/matchUpStatus/reconcileScoredTimes';
import { validateDrawTallyOptions } from '@Query/matchUps/roundRobinTally/drawnResults';
import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import type { DeciderSnapshot } from '@Mutate/matchUps/matchUpStatus/reconcileDecider';
import { progressExitStatus } from '@Mutate/matchUps/drawPositions/progressExitStatus';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { matchUpScore } from '@Assemblies/generators/matchUps/matchUpScore';
import { getDeciderFinals } from '@Query/drawDefinition/deciderStructures';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { getMatchUpFormat } from '@Query/hierarchical/getMatchUpFormat';
import { tiebreakPointsWarnings } from '@Validators/validateScore';
import { decideOutcomeV2 } from '@Mutate/matchUps/outcome/decide';
import { decorateResult } from '@Functions/global/decorateResult';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { holdGoesTo } from '@Query/matchUps/addGoesTo';
import { isDoubleExit } from '@Validators/isExit';
import { findPolicy } from '@Acquire/findPolicy';
import { findEvent } from '@Acquire/findEvent';
import { isString } from '@Tools/objects';

// constants and types
import { PolicyDefinitions, ResultType, ResultWarning, TournamentRecords } from '@Types/factoryTypes';
import { POLICY_TYPE_SCORING, POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import { INVALID_VALUES, INVALID_WINNING_SIDE } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import { DRAW_DEFINITION, MATCHUP_ID } from '@Constants/attributeConstants';
import { SCHEDULE_PRESERVED_ON_EXIT } from '@Constants/scheduleConstants';
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
function resolveDrawDefinition(params: SetMatchUpStatusArgs, tournamentRecords: TournamentRecords) {
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
 * A convergence that lost one of its origins goes where the kept origin alone puts it; then every carried
 * exit's ORIGIN is asked whether it still describes one (`reconcileStaleExitOrigins`).
 *
 * Asked of the DRAW, never of a map carried in the call's context. The reconciliation is a question about the
 * settled draw, and a map taken earlier in the call can describe an earlier draw: handed the exit-propagation
 * context's map while `decorateResult` deep-copied it, it read the draw as the direction left it and wrote to
 * detached objects, so a stale origin stood until the NEXT call repaired it (census F2, 2026-10-11).
 */
function settleExitOrigins({
  propagateExitStatus,
  doubleExitsBefore,
  matchUpId,
  params,
}: {
  params: SetMatchUpStatusArgs;
  doubleExitsBefore: Set<string>;
  propagateExitStatus?: boolean;
  matchUpId: string;
}): ResultType | undefined {
  const settled = settleRederivedDoubleExits({
    tournamentRecord: params.tournamentRecord,
    drawDefinition: params.drawDefinition,
    targetMatchUpId: matchUpId,
    propagateExitStatus,
    doubleExitsBefore,
    event: params.event,
  });
  if (settled?.error) return settled;
  const reconciled = reconcileStaleExitOrigins({
    drawDefinition: params.drawDefinition,
    tournamentRecord: params.tournamentRecord,
    event: params.event,
  });
  if (reconciled?.error) return reconciled;
  // The reconciliation can itself re-derive a convergence: a double exit whose produced exit it withdrew because the
  // origin stopped being one. Settled only before it, that matchUp was still a double exit, and the participant it now
  // awards stayed where they stood (census policy-off 20177818, CURTIS_CONSOLATION 16/11: `Consolation 1|3|2`,
  // WINNER_NOT_ADVANCED). Those matchUps, and only those, are settled again on the draw the reconciliation left.
  const rederivedNow = new Set((reconciled?.rederived ?? []).filter((id) => doubleExitsBefore.has(id)));
  if (rederivedNow.size) {
    const resettled = settleRederivedDoubleExits({
      tournamentRecord: params.tournamentRecord,
      drawDefinition: params.drawDefinition,
      doubleExitsBefore: rederivedNow,
      targetMatchUpId: matchUpId,
      propagateExitStatus,
      event: params.event,
    });
    if (resettled?.error) return resettled;
  }
  // a convergence the call dissolved is owed the BYE it took back, on the draw as it now stands
  return oweDissolvedConvergencesTheirByes({
    tournamentRecord: params.tournamentRecord,
    drawDefinition: params.drawDefinition,
    event: params.event,
    doubleExitsBefore,
  });
}

/**
 * What is decided on the draw as it STANDS once the mutation has settled, rather than on the events
 * that led there. Each returns its error; neither is allowed to fail quietly.
 */
function settleDraw({
  deciderSnapshotBefore,
  finalsBefore,
  params,
}: {
  finalsBefore: Map<string, number | undefined>;
  deciderSnapshotBefore?: DeciderSnapshot;
  params: SetMatchUpStatusArgs;
}): ResultType {
  const { tournamentRecord, drawDefinition, event } = params;

  // a FIRST_MATCHUP consolation seat holds the reservation the settled first round says it should
  const reserved = reconcileConsolationReservations({ tournamentRecord, drawDefinition, event });
  if (reserved?.error) return reserved;
  // a reservation withdrawn here is a BYE taken back after the exits relayed past it were reconciled, so they are asked
  // again: a copy beyond the seat it vacated stands no longer (`reconcileStaleExitOrigins`, `getStaleRelays`)
  if (reserved?.withdrawn) {
    const relays = reconcileStaleExitOrigins({ tournamentRecord, drawDefinition, event });
    if (relays?.error) return relays;
  }
  // and an exit a carrier holds past a BYE that arrived after them is written where they landed
  const carried = reconcileCarriesPastByes({ tournamentRecord, drawDefinition, event });
  if (carried?.error) return carried;

  // an exit held where nobody can play it is sent on, now that the draw it is decided on is settled
  const { appliedPolicies } = getAppliedPolicies({ tournamentRecord, drawDefinition, event });
  const settled = settleHeldExits({ tournamentRecord, appliedPolicies, drawDefinition, event });
  if (settled.error) return settled;
  // A convergence produced there serves its loser link, and the BYE it can place there stands in front of a carrier: the
  // carry past it was asked above, before that BYE existed, so it is asked again (census A1 wave 5, COMPASS 32:
  // `Southwest|2|1` stayed TO_BE_PLAYED under its carrier until the same outcome was entered a second time;
  // `aCarryPastAConvergencesByeIsCarriedOnTheFirstEntry`)
  if ((settled as { produced?: boolean }).produced) {
    const carriedAgain = reconcileCarriesPastByes({ tournamentRecord, drawDefinition, event });
    if (carriedAgain?.error) return carriedAgain;
  }

  // and a participant opposite a BYE whose next seat was taken when the BYE landed, and is free now, goes on
  const advanced = reconcileByeAdvancements({ tournamentRecord, drawDefinition, event });
  if (advanced?.error) return advanced;

  // a held exit sent on above can decide a round feeding another structure, so its winner is seated there now, before
  // the decider is settled: asked only before it, the crossing waited for the NEXT call (census int2 nonrt,
  // DOUBLE_ELIMINATION 8/5 21037067: a double walkover at `Main|2|1` sent the Backdraw's held exit into the final,
  // which its champion won and was not seated in the decider until the same outcome was entered again)
  reconcileMissedLinkAdvancements({ tournamentRecord, drawDefinition, event });

  // a provenance entry follows its feeder's side as the seats settle (CA ruling (1), 2026-10-20)
  reconcileProvenanceSides({ tournamentRecord, drawDefinition, event });

  // a final that feeds a decider settles whether the decider is needed — see `reconcileDecider`
  return reconcileDeciders({
    mutatedMatchUpId: params.matchUpId,
    deciderSnapshotBefore,
    tournamentRecord,
    drawDefinition,
    finalsBefore,
    event,
  });
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
  const rotating = preflightOutcome(params);
  if (rotating.error) return rotating;
  params = { ...params, ...rotating, outcome: params.outcome && { ...params.outcome, ...rotating } };
  const matchUpFormat = requestedMatchUpFormat(params);

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

  // NOTES ARE VALIDATED BEFORE THE FIRST WRITE. They are written last, onto the matchUp, after `modifyMatchUpScore` has
  // already written its score and status, and `addNotes` refused `notes: 123` there: an error over a result that had
  // landed (CA, 2026-10-22: an error leaves the record unchanged, and no mutation relies on rollback). Asked here with
  // `addNotes`' own rule, so that write cannot fail (`refusedBeforeTheFirstWrite.test.ts`).
  if (notes && !isString(notes) && !(notes as { testing?: boolean })?.testing) {
    return decorateResult({ result: { error: INVALID_VALUES }, info: 'notes must be a string', stack });
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
    const effectiveMatchUpFormat = resolveScoreFormat({
      tournamentRecord,
      drawDefinition,
      matchUpId,
      event,
      matchUpFormat,
    });

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
  // and the decider structures themselves: the cascade can re-seat a decider while the final's winner stays the same
  const deciderSnapshotBefore = getDeciderSnapshot(drawDefinition);
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
    matchUpsMap,
    event,
  });
  if (v2.refused) return decorateResult({ result: v2.refused, stack });

  // A REFUSED CALL STORES NONE OF THE MISSING EDGES (CA, 2026-10-18: "no, a refused call does not store a draw's
  // missing edges. v1 should no longer do so."). `setMatchUpState` writes them before deciding anything, and takes
  // them back on its own refusal; what it held is held here too, for a refusal met after it returned.
  const heldEdges = holdGoesTo({ drawDefinition, matchUpsMap });
  const refuse = (refusal: ResultType) => {
    heldEdges?.release();
    return decorateResult({ result: refusal, stack });
  };

  // DECISION: Delegate to setMatchUpState for core status/score setting logic
  // WHY: Separation of concerns - setMatchUpStatus handles API/validation/orchestration,
  // setMatchUpState handles actual state mutations and participant progression logic
  const result = setMatchUpState({
    matchUpStatusCodes: outcome?.matchUpStatusCodes,
    matchUpsMap,
    edgesHeld: !!heldEdges,
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
  // Exit propagation: the context a direction (or a swap) returned, then any carry it queued behind it
  for (const context of [result.context, ...(result.context?.queuedExitContexts ?? [])]) {
    if (!context?.progressExitStatus) continue;
    const propagated = propagateExitFrom({ context, params, propagateExitStatus });
    if (propagated?.error) {
      v2.compare?.(propagated);
      return refuse(propagated);
    }
  }
  // A REFUSAL CHANGES NOTHING, so nothing below it runs: no step here may repair, on a refused call, what an earlier
  // call left (census F2, 2026-10-11: the settle step ran after `setMatchUpState` refused, and its reconciliation
  // was the refused call's only write in 55 of 92 refusals after a write).
  if (result.error) {
    v2.compare?.(result);
    return refuse(result);
  }
  // Everything has settled — removals, directions and exit propagation — which is the earliest point
  // at which a carried exit's ORIGIN can be asked whether it still describes one. See
  // `reconcileStaleExitOrigins` for the two corrections that pull the timing in opposite directions.
  const settled = settleExitOrigins({ params, matchUpId, propagateExitStatus, doubleExitsBefore });
  if (settled?.error) {
    v2.compare?.(settled);
    return refuse(settled);
  }
  // and once settled, no matchUp left without a result keeps the `scoredTime` a cascade stamped on it
  reconcileScoredTimes({
    matchUps: matchUpsMap.drawMatchUps,
    drawDefinition: params.drawDefinition,
    tournamentRecord: params.tournamentRecord,
    event: params.event,
  });

  // a participant who decided a round feeding another structure is seated there, before the decider is settled
  reconcileMissedLinkAdvancements({
    drawDefinition: params.drawDefinition,
    tournamentRecord: params.tournamentRecord,
    event: params.event,
  });
  const drawSettled = settleDraw({ deciderSnapshotBefore, finalsBefore, params });
  if (drawSettled.error) return refuse(drawSettled);
  // what forward play sends on from a result is sent on from one a removal re-derived: asked of the settled draw
  const forward = settleForwardConsequences({
    tournamentRecord: params.tournamentRecord,
    drawDefinition: params.drawDefinition,
    event: params.event,
    propagateExitStatus,
  });
  if (forward?.error) return refuse(forward);
  // A direction the forward settle makes can put a BYE back in front of a carrier: a loser it directs re-forms a double
  // exit, whose loser seat takes its BYE again. The carry past a late BYE was asked in `settleDraw`, before that BYE
  // existed, so it is asked again (census A1 wave 3 R12, COMPASS 32: `Southeast|2|1` left TO_BE_PLAYED under its
  // carrier; `aCarryPastAByeTheSettleReplacesIsCarriedAgain`).
  if (forward?.settled) {
    const carried = reconcileCarriesPastByes({
      tournamentRecord: params.tournamentRecord,
      drawDefinition: params.drawDefinition,
      event: params.event,
    });
    if (carried?.error) return refuse(carried);
  }
  // and, last, nobody stands across a link out of a matchUp that has no result. After `settleDraw`, not before:
  // a held exit is decided there, and a placement made for it is not unearned (de 9301605, the Decider).
  reconcileLinkAdvancements({
    drawDefinition: params.drawDefinition,
    tournamentRecord: params.tournamentRecord,
    event: params.event,
  });
  const warnings = [
    ...(forward?.exhausted ? [{ code: FORWARD_SETTLE_EXHAUSTED, matchUpIds: [forward.exhausted] }] : []),
    ...schedulePreservedWarnings({ matchUps: matchUpsMap.drawMatchUps, neverPlayedBefore }),
    ...(disableScoreValidation || !outcome?.score?.sets?.length ? [] : recordedScoreWarnings(params)),
  ];
  if (warnings.length) Object.assign(result, { warnings: [...(result.warnings ?? []), ...warnings] });

  // nothing is refused past here: a call that wrote the draw's missing edges announces the draw, once
  announceGoesTo({ hold: heldEdges, tournamentRecord, drawDefinition, event });

  v2.compare?.(result);

  return decorateResult({ result, stack });
}

/**
 * A WARNING IN THE SUCCESS PAYLOAD: the score was recorded, and a set in it was decided by its tiebreak
 * with no tiebreak points (`7-6` alone) — accepted because results feeds record it so often (CA,
 * 2026-10-02, ruling V11). Read off the RECORDED matchUp in context, so the format is the one the score
 * was validated against — a TEAM line's comes from its collection — and a dual's tally is never asked.
 */
function recordedScoreWarnings({
  drawDefinition,
  matchUpId,
  event,
}: {
  drawDefinition: DrawDefinition;
  matchUpId: string;
  event?: Event;
}): ResultWarning[] {
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

function requestedMatchUpFormat(params: SetMatchUpStatusArgs) {
  return params.matchUpFormat || params.outcome?.matchUpFormat;
}

function resolveScoreFormat(params: SetMatchUpStatusArgs) {
  return params.matchUpFormat ?? getMatchUpFormat(params)?.matchUpFormat;
}

/** A tally failure must be discovered before the score or stored position tallies are changed. */
function preflightTallyPolicy(params: SetMatchUpStatusArgs): ResultType {
  const { tournamentRecord, drawDefinition, event, policyDefinitions } = params;
  const { appliedPolicies } = getAppliedPolicies({ tournamentRecord, drawDefinition, event });
  const inherited = validateDrawTallyOptions(appliedPolicies?.[POLICY_TYPE_ROUND_ROBIN_TALLY]);
  return inherited.error ? inherited : validateDrawTallyOptions(policyDefinitions?.[POLICY_TYPE_ROUND_ROBIN_TALLY]);
}

function preflightOutcome(params: SetMatchUpStatusArgs) {
  const tallyValidation = preflightTallyPolicy(params);
  if (tallyValidation.error) return tallyValidation;
  const { drawDefinition, event, matchUpId } = params;
  return resolveRotatingPartnerOutcome({
    drawDefinition,
    event,
    matchUpId,
    ...params.outcome,
    matchUpFormat: requestedMatchUpFormat(params),
  });
}

/**
 * DECISION: Use iterative loop instead of recursion for multi-level propagation
 * WHY: In structures like COMPASS draws, exit status may propagate through multiple levels
 * (e.g., East → West → South → Southeast). Iteration is safer than deep recursion.
 * Failsafe prevents infinite loops if there's a circular reference or bug.
 *
 * A REFUSED WRITE IS RETURNED, never dropped (F3). The loop used to read only `context`, so a
 * refusal here reported success over a draw the cascade had left half-written.
 */
function propagateExitFrom({
  propagateExitStatus,
  context,
  params,
}: {
  context: NonNullable<ResultType['context']>;
  propagateExitStatus?: boolean;
  params: SetMatchUpStatusArgs;
}): ResultType | undefined {
  let iterate = true;
  let failsafe = 0;
  while (iterate && failsafe < 10) {
    iterate = false;
    failsafe += 1;
    // set the consolation matchUp's status (e.g. WALKOVER when only one participant has arrived)
    const progressResult = progressExitStatus({
      sourceMatchUpStatusCodes: context.sourceMatchUpStatusCodes,
      sourceMatchUpStatus: context.sourceMatchUpStatus,
      sourceWinningSide: context.sourceWinningSide,
      loserParticipantId: context.loserParticipantId,
      sourceMatchUpId: context.sourceMatchUpId,
      propagateExitStatus,
      tournamentRecord: params.tournamentRecord,
      loserMatchUp: context.loserMatchUp,
      matchUpsMap: context.matchUpsMap,
      drawDefinition: params.drawDefinition,
      event: params.event,
    });
    if (progressResult.error) return progressResult;
    // the consolation matchUp itself may feed another level of consolation
    if (progressResult.context?.loserMatchUp) {
      Object.assign(context, progressResult.context);
      iterate = true;
    }
  }
  return undefined;
}
