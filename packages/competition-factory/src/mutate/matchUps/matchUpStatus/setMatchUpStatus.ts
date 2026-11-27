import { getDeciderSnapshot } from '@Mutate/matchUps/matchUpStatus/reconcileDecider';
import { FORWARD_SETTLE_EXHAUSTED } from '@Mutate/matchUps/matchUpStatus/settleForwardConsequences';
import { resolveRotatingPartnerOutcome } from '@Query/drawDefinition/resolveRotatingPartnerOutcome';
import { checkMatchUpFormatApplication } from '@Mutate/matchUps/matchUpFormat/applyMatchUpFormat';
import { announceGoesTo, setMatchUpState } from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import { levelDualDecisionRefusal } from '@Mutate/matchUps/matchUpStatus/levelDualDecision';
import { recordSettleEvent } from '@Mutate/matchUps/matchUpStatus/settleTelemetry';
import { settleAfterWrite } from '@Mutate/matchUps/matchUpStatus/settleAfterWrite';
import { withoutZeroZeroTiebreak } from '@Helpers/matchUpFormatCode/setRules/tiebreakSetShape';
import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { progressExitStatus } from '@Mutate/matchUps/drawPositions/progressExitStatus';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { matchUpWillNeverBePlayed } from '@Helpers/scheduling/schedulePredicates';
import { matchUpHoldsScheduling } from '@Mutate/matchUps/schedule/byeScheduling';
import { collectionChoiceOutcomeRefusal } from '@Query/matchUp/collectionChoice';
import { SETTLE_PASS_LIMITS } from '@Mutate/matchUps/matchUpStatus/settleBounds';
import { isAggregateFormat } from '@Helpers/matchUpFormatCode/isAggregateFormat';
import { validateDrawTallyOptions } from '@Validators/validateTallyPolicy';
import { getDeciderFinals } from '@Query/drawDefinition/deciderStructures';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { isPartialDualScore } from '@Scoring/analysis/isPartialDualScore';
import { tiebreakPointsWarnings } from '@Scoring/analysis/validateScore';
import { getMatchUpFormat } from '@Query/hierarchical/getMatchUpFormat';
import { decideOutcomeV2 } from '@Mutate/matchUps/outcome/decide';
import { replayedInstants } from '@Tools/replayedInstants';
import { replayedDraws } from '@Tools/replayedDraws';
import { decorateResult } from '@Functions/global/decorateResult';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { matchUpScore } from '@Scoring/views/matchUpScore';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { holdGoesTo } from '@Query/matchUps/addGoesTo';
import { isDoubleExit } from '@Validators/isExit';
import { findPolicy } from '@Acquire/findPolicy';
import { findEvent } from '@Acquire/findEvent';
import { isString } from '@Tools/objects';

// constants and types
import { DrawDefinition, Event, MatchUp, MatchUpStatusUnion, Set as SetType, Tournament } from '@Types/tournamentTypes';
import type { CopyFinish, RecordCopy } from '@Mutate/matchUps/outcome/types';
import { MatchUpsMap, PolicyDefinitions, ResultType, ResultWarning, TournamentRecords } from '@Types/factoryTypes';
import { INVALID_VALUES, INVALID_WINNING_SIDE, SETTLE_BOUND_REACHED } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_SCORING, POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import { DRAW_DEFINITION, MATCHUP_ID } from '@Constants/attributeConstants';
import { SCHEDULE_PRESERVED_ON_EXIT } from '@Constants/scheduleConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
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
  /** private to the bulk writers: what to return, unwritten, for a call v2 neither refuses nor owns */
  bound?: { unowned: ResultType };
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
  // ONE map for the whole call. `setMatchUpState` builds this itself unless handed one; building it
  // here instead lets the preflight, the before-snapshot and the warning below read the same flat array
  // the cascade writes through, so none of them walks the draw again. Its matchUps are the live objects.
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  const rotating = preflightOutcome(params, matchUpsMap);
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

  // THE POLICY GOVERNS, both ways. An applied scoring policy that SPEAKS on a flag, true or false, wins
  // over anything on the call; the call decides only where the policy is silent. Under a policy that says a
  // retiree cannot continue, a tournament director cannot let that participant continue in the draw.
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
  // a winningSide is 1 or 2, or it is absent: 0 is refused, never read as absent
  if (outcome?.winningSide != null && ![1, 2].includes(outcome.winningSide)) {
    return { error: INVALID_WINNING_SIDE };
  }

  // NOTES ARE VALIDATED BEFORE THE FIRST WRITE. They are written last, onto the matchUp, after `modifyMatchUpScore` has
  // already written its score and status, and `addNotes` refused `notes: 123` there: an error over a result that had
  // landed (an error leaves the record unchanged, and no mutation relies on rollback). Asked here with
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

    // DECISION: Filter out empty sets BEFORE generating score strings
    // WHY: Prevents invalid/incomplete sets from being saved, and filtering afterwards left the
    // generated string describing a set that had just been removed from score.sets
    const sets = recordedSets(outcome, effectiveMatchUpFormat).map(withoutZeroZeroTiebreak);

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

  // once, here, so the v2 decision and v1's writes read the same score
  keepDualAggregate({ enableAutoCalc, matchUpsMap, matchUpId, outcome });
  // and refused here, before either pipeline: a winner on a level TEAM tie records how it was decided
  const levelDual = levelDualRefusal({ ...params, matchUpsMap, outcome });
  if (levelDual) return decorateResult({ result: levelDual, stack });

  // read BEFORE the mutation: `reconcileDeciders` acts only on a final whose winner has changed
  const finalsBefore = getDeciderFinals(drawDefinition);
  // and the decider structures themselves: the cascade can re-seat a decider while the final's winner stays the same
  const deciderSnapshotBefore = getDeciderSnapshot(drawDefinition);
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
  // A RECORDED CALL DRAWS ONCE. v1 run on a copy (`writeOnCopy`, the recorded cascade) takes its random draws from the
  // source, and they are kept; v1 run on the stored record after it (`differential`, or a recording refused or
  // dropped) is handed those draws first, in order. Every stream is read as v1 alone reads it, in every mode.
  // AND READS THE CLOCK ONCE. Outside an engine call there is no captured instant, and each stamp reads the source
  // where it is written: the copy's readings are kept and handed, in order, to v1's run on the stored record, so the
  // source is read as v1 alone reads it and both runs stamp the same instants (`replayedInstants.ts`).
  const draws = replayedDraws();
  // each copy this call's v1 wrote, with the readings its settle passes were handed
  const copies = new WeakMap<object, V1Target>();
  const instants = replayedInstants();
  const v2 = decideOutcomeV2({
    request: {
      matchUpStatusCodes: outcome?.matchUpStatusCodes,
      matchUpStatus: outcome?.matchUpStatus,
      winningSide: outcome?.winningSide,
      score: outcome?.score,
      matchUpFormat,
      matchUpId,
      carries: { schedule, notes },
      flags: {
        allowChangePropagation,
        propagateExitStatus,
        propagateRetirementAsExit,
        disableScoreValidation,
        disableAutoCalc,
        enableAutoCalc,
      },
    },
    writeOnCopy: (copy) => draws.record(() => instants.record(() => writeOnCopy(copy))),
    settleOnCopy,
    instantsExact: instants.exact,
    recordDraws: draws.record,
    policyDefinitions,
    tournamentRecords,
    tournamentRecord,
    drawDefinition,
    matchUpsMap,
    event,
  });
  if (v2.refused) return decorateResult({ result: v2.refused, stack });
  // refused by v1 itself, on a copy: its result has been through `runV1`, and is returned as v1 returns it
  if (v2.refusedOnCopy) return v2.refusedOnCopy;
  // S2: a call v2 owns has been written by it (`outcome/apply.ts`); v1 is not asked, and the warnings are v1's own
  // a call recorded whole returns what v1 returned for it on the copy, its warnings among them
  if (v2.owned)
    return v2.recorded || v2.finished
      ? v2.owned
      : ownedResult({ owned: v2.owned, params, matchUpsMap, neverPlayedBefore, stack });
  // ONE UNIT OF A BULK CALL: a call v2 neither refuses nor owns is handed back unwritten, and the bulk
  // writer plans it whole on a copy (`outcome/plan/recordedUnit.ts`), so v1 never writes the stored record here
  if (params.bound) return params.bound.unowned;

  const stored: V1Target = {
    deciderSnapshotBefore,
    doubleExitsBefore,
    tournamentRecords,
    finalsBefore,
    matchUpsMap,
    params,
  };
  return draws.replay(() => instants.replay(() => (v2.runV1 ? v2.runV1(() => runV1(stored)) : runV1(stored))));

  /**
   * RECORDED (`outcome/plan/recordedCall.ts`): this call's v1 write on a copy of the record, with the copy's own map
   * and the readings the settle passes are handed, taken as they are taken above. A call that names several records
   * (every record the engine holds) is handed the copy of each, the one it is made in among them. Not for a call
   * naming a record the copy does not hold.
   */
  function writeOnCopy(copy: RecordCopy) {
    const records = copiedRecords(copy);
    if (!records) return undefined;
    const copied = copy.tournamentRecord;
    const map = getMatchUpsMap({ drawDefinition: copy.drawDefinition });
    const target: V1Target = {
      params: { ...params, ...copy, tournamentRecord: copied as Tournament, tournamentRecords: records },
      doubleExitsBefore: new Set(
        map.drawMatchUps.filter((matchUp) => isDoubleExit(matchUp.matchUpStatus)).map((m) => m.matchUpId),
      ),
      deciderSnapshotBefore: getDeciderSnapshot(copy.drawDefinition),
      finalsBefore: getDeciderFinals(copy.drawDefinition),
      tournamentRecords: records,
      matchUpsMap: map,
      onCopy: true,
    };
    copies.set(copy.drawDefinition, target);
    return runV1(target);
  }

  /**
   * RECORDED, THE FIXPOINT (`outcome/plan/recordedCall.ts` `settledOnCopy`): the settle passes run once more on the copy
   * v1 has written, with this call's parameters and the readings taken of the copy as it now stands (its double exits,
   * its deciders), as the next call's settle would take them. Undefined for a copy this call did not write.
   *
   * With `finish`, a native TEAM line's detached write (`plan/teamFinalLine.ts`) completes its public return on its
   * copy instead: the warnings v1 adds, from the copy's own map. Undefined where the copy does not hold every record
   * the call names (that copy holds only the call's own), as `writeOnCopy` refuses it. It reuses this closure so the decision's arguments stay those of every call.
   */
  function settleOnCopy(copy: RecordCopy, finish?: CopyFinish) {
    if (finish) {
      if (!copiedRecords(copy)) return undefined;
      const { owned, matchUpsMap: map } = finish;
      return ownedResult({ owned, params: { ...params, ...copy }, matchUpsMap: map, neverPlayedBefore, stack });
    }
    const target = copies.get(copy.drawDefinition);
    if (!target) return undefined;
    const map = getMatchUpsMap({ drawDefinition: copy.drawDefinition });
    return settleAfterWrite({
      doubleExitsBefore: new Set(
        map.drawMatchUps.filter((matchUp) => isDoubleExit(matchUp.matchUpStatus)).map((m) => m.matchUpId),
      ),
      deciderSnapshotBefore: getDeciderSnapshot(copy.drawDefinition),
      finalsBefore: getDeciderFinals(copy.drawDefinition),
      params: { ...target.params, matchUpId },
      propagateExitStatus,
      matchUpsMap: map,
    });
  }

  /**
   * the records v1 is handed on `copy`: the copy of every record this call names, or undefined where the copy does not
   * hold them all. A call naming one record is handed its copy (or, made in none, the records as named).
   */
  function copiedRecords(copy: RecordCopy): TournamentRecords | undefined {
    const copied = copy.tournamentRecord;
    const named = Object.keys(tournamentRecords);
    if (named.length > 1) {
      const records = copy.tournamentRecords;
      const held = !!records && named.every((tournamentId) => records[tournamentId]?.tournamentId === tournamentId);
      // the call's own record is the copy's: v1 writes it through either name
      return held && (!copied || records[copied.tournamentId] === copied) ? records : undefined;
    }
    if (named.length && named[0] !== copied?.tournamentId) return undefined;
    return copied ? { [copied.tournamentId]: copied } : tournamentRecords;
  }

  function runV1(target: V1Target): ResultType {
    const { params, tournamentRecords, matchUpsMap, finalsBefore, deciderSnapshotBefore, doubleExitsBefore } = target;
    const { tournamentRecord, drawDefinition, event } = params;
    // a copy's write is compared with nothing: it is what v2 plans from
    const compare = target.onCopy ? undefined : v2.compare;
    // A REFUSED CALL STORES NONE OF THE MISSING EDGES: a refused call does not store a draw's missing edges, in v1
    // either. `setMatchUpState` writes them before deciding anything, and takes
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
        compare?.(propagated);
        return refuse(propagated);
      }
    }
    // A REFUSAL CHANGES NOTHING, so nothing below it runs: no step here may repair, on a refused call, what an earlier
    // call left (census F2, 2026-10-11: the settle step ran after `setMatchUpState` refused, and its reconciliation
    // was the refused call's only write in 55 of 92 refusals after a write).
    if (result.error) {
      compare?.(result);
      return refuse(result);
    }
    const settled = settleAfterWrite({
      params: { ...params, matchUpId },
      deciderSnapshotBefore,
      propagateExitStatus,
      doubleExitsBefore,
      finalsBefore,
      matchUpsMap,
    });
    if (settled.error) {
      compare?.(settled);
      return refuse(settled);
    }
    const warnings = [
      ...(settled.exhausted ? [{ code: FORWARD_SETTLE_EXHAUSTED, matchUpIds: [settled.exhausted] }] : []),
      ...callWarnings({ params, matchUpsMap, neverPlayedBefore, disableScoreValidation, outcome }),
    ];
    if (warnings.length) Object.assign(result, { warnings: [...(result.warnings ?? []), ...warnings] });

    // nothing is refused past here: a call that wrote the draw's missing edges announces the draw, once
    announceGoesTo({ hold: heldEdges, tournamentRecord, drawDefinition, event });

    compare?.(result);

    return decorateResult({ result: withoutPropagationContext(result), stack });
  }
}

/**
 * The keys a direction hands exit propagation in its `context` (`directParticipants`, `directLoser`,
 * `progressExitStatus`, `swapWinnerLoser`'s queue): the loser's next matchUp hydrated, the call's live `matchUpsMap`,
 * and the source's facts. They are plumbing, consumed by `propagateExitFrom` above.
 */
const PROPAGATION_CONTEXT_KEYS = [
  'sourceMatchUpStatusCodes',
  'sourceMatchUpStatus',
  'queuedExitContexts',
  'progressExitStatus',
  'loserParticipantId',
  'sourceWinningSide',
  'sourceMatchUpId',
  'loserMatchUp',
  'matchUpsMap',
];

/** what one run of v1's write is made on: the stored record, or a recorder's copy of it (`onCopy`) */
type V1Target = {
  deciderSnapshotBefore: ReturnType<typeof getDeciderSnapshot>;
  finalsBefore: ReturnType<typeof getDeciderFinals>;
  tournamentRecords: TournamentRecords;
  doubleExitsBefore: Set<string>;
  params: SetMatchUpStatusArgs;
  matchUpsMap: MatchUpsMap;
  onCopy?: boolean;
};

type LevelDualArgs = Pick<SetMatchUpStatusArgs, 'drawDefinition' | 'enableAutoCalc' | 'outcome' | 'event'> & {
  matchUpsMap: MatchUpsMap;
  matchUpId: string;
};

type KeepDualAggregateArgs = Pick<SetMatchUpStatusArgs, 'enableAutoCalc' | 'outcome'> & {
  matchUpsMap: MatchUpsMap;
  matchUpId: string;
};

/**
 * A dual given a score without sets keeps its aggregate: the score is laid over the dual's own (`isPartialDualScore`).
 * Swapped for it, a level tie's aggregate was wiped when its decision was recorded.
 */
function keepDualAggregate({ enableAutoCalc, matchUpsMap, matchUpId, outcome }: KeepDualAggregateArgs) {
  // enabling auto-calc projects the dual's whole score from its lines (`handleTeamAutoCalc`)
  if (!outcome || enableAutoCalc || !isPartialDualScore(outcome.score)) return;
  const dual = matchUpsMap.drawMatchUps.find((candidate) => candidate.matchUpId === matchUpId);
  if (dual?.matchUpType === TEAM) outcome.score = { ...dual.score, ...outcome.score };
}

function levelDualRefusal({ drawDefinition, enableAutoCalc, matchUpsMap, matchUpId, outcome, event }: LevelDualArgs) {
  const dual = matchUpsMap.drawMatchUps.find((candidate) => candidate.matchUpId === matchUpId);
  if (dual?.matchUpType !== TEAM) return undefined;
  return levelDualDecisionRefusal({
    matchUpStatus: outcome?.matchUpStatus,
    winningSide: outcome?.winningSide,
    score: outcome?.score,
    drawDefinition,
    enableAutoCalc,
    matchUpsMap,
    event,
    dual,
  });
}

/**
 * A RESULT CARRIES NO PLUMBING. A call whose exit propagated returned the propagation's context to its caller: the
 * whole draw's live `matchUpsMap` and a hydrated matchUp in the result of a `setMatchUpStatus`, which an
 * `executionQueue` response then serialised, and which the outcome pipeline v2 could only have matched by hydrating
 * (executor plan § 3.1.1). Once consumed, those keys are dropped; anything else a context holds is kept.
 */
function withoutPropagationContext(result: ResultType): ResultType {
  if (!result.context) return result;
  const context = Object.fromEntries(
    Object.entries(result.context).filter(([key]) => !PROPAGATION_CONTEXT_KEYS.includes(key)),
  );
  return { ...result, context };
}

const setHasValue = (set: SetType) =>
  !!(
    set.side1Score ||
    set.side2Score ||
    set.side1TiebreakScore ||
    set.side2TiebreakScore ||
    set.side1PointScore ||
    set.side2PointScore
  );

/**
 * The sets an outcome records: a set with no value is a placeholder, except a period of an aggregate format that
 * finished 0-0 (a goalless half, a scoreless period or overtime), which counts toward the total and is accepted by
 * the validators. Dropping it lost a played half (`1-0, 0-0` stored as one half) and refused a hockey win with a
 * scoreless period (`1-0, 0-0, 1-0`). A 0-0 period is played when the result is complete, the period closed, or
 * play followed it; a trailing 0-0 in an unfinished match stays a placeholder.
 */
function recordedSets(
  outcome: { score: { sets: SetType[] }; matchUpStatus?: MatchUpStatusUnion; winningSide?: number },
  format?: string,
) {
  const { sets } = outcome.score;
  const aggregate = isAggregateFormat(parse(format ?? ''));
  const complete = outcome.matchUpStatus === COMPLETED || (!outcome.matchUpStatus && !!outcome.winningSide);
  const goalless = (set: SetType) => isZero(set.side1Score) && isZero(set.side2Score);
  return sets.filter(
    (set, index) =>
      setHasValue(set) ||
      (aggregate &&
        goalless(set) &&
        (complete ||
          !!(set as { segmentComplete?: boolean }).segmentComplete ||
          sets.slice(index + 1).some(setHasValue))),
  );
}

const isZero = (value: unknown) => value !== null && value !== '' && value !== undefined && Number(value) === 0;

/**
 * A WARNING IN THE SUCCESS PAYLOAD: the score was recorded, and a set in it was decided by its tiebreak
 * with no tiebreak points (`7-6` alone) — accepted because results feeds record it so often. Read off
 * the RECORDED matchUp in context, so the format is the one the score
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
 * nothing here snapshots or restores. For recoverability the schedules are kept, and the success
 * payload carries a warning that clients can respond to: both.
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

function preflightOutcome(params: SetMatchUpStatusArgs, matchUpsMap: MatchUpsMap) {
  // an unresolved captain's choice refuses before anything is written
  const choice = collectionChoiceOutcomeRefusal({ ...params, matchUpsMap });
  if (choice) return choice;
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
  while (iterate && failsafe < SETTLE_PASS_LIMITS.exitLevels) {
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
  // stopped at the bound with a level still to propagate to: refused, and recorded for the census
  if (iterate) {
    recordSettleEvent({ kind: 'bound', site: 'propagateExitFrom', detail: context.loserMatchUp?.matchUpId });
    return { error: SETTLE_BOUND_REACHED, info: 'propagateExitFrom' };
  }
  return undefined;
}

/** what a call that succeeded warns of, whichever pipeline wrote it: a schedule kept on what can no longer be played,
 * and a recorded score its format does not support */
type CallWarningsArgs = {
  outcome?: SetMatchUpStatusArgs['outcome'];
  params: SetMatchUpStatusArgs;
  disableScoreValidation?: boolean;
  neverPlayedBefore: Set<string>;
  matchUpsMap: MatchUpsMap;
};
function callWarnings({ params, matchUpsMap, neverPlayedBefore, disableScoreValidation, outcome }: CallWarningsArgs) {
  return [
    ...schedulePreservedWarnings({ matchUps: matchUpsMap.drawMatchUps, neverPlayedBefore }),
    ...(disableScoreValidation || !outcome?.score?.sets?.length ? [] : recordedScoreWarnings(params)),
  ];
}

/** a call v2 wrote: its result, with the warnings v1 would add for the same write */
type OwnedResultArgs = {
  params: SetMatchUpStatusArgs;
  neverPlayedBefore: Set<string>;
  matchUpsMap: MatchUpsMap;
  owned: ResultType;
  stack: string;
};
function ownedResult({ owned, params, matchUpsMap, neverPlayedBefore, stack }: OwnedResultArgs) {
  if (owned.error) return decorateResult({ result: owned, stack });
  const { disableScoreValidation, outcome } = params;
  const warnings = callWarnings({ params, matchUpsMap, neverPlayedBefore, disableScoreValidation, outcome });
  return decorateResult({ result: warnings.length ? { ...owned, warnings } : owned, stack });
}
