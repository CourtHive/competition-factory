import { isPropagatedExit } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { isDirectingMatchUpStatus } from '@Query/matchUp/checkStatusType';

// constants and types
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { HydratedMatchUp } from '@Types/hydrated';

const stack = 'correctDecidedOutcome';

/** what a director types to clear a result */
const CLEAR_SCORE = { scoreStringSide1: '', scoreStringSide2: '' };

type CapturedOutcome = {
  matchUpId: string;
  /** BFS depth from the corrected matchUp — deeper results are cleared first and restored last */
  depth: number;
  matchUpStatus?: string;
  matchUpStatusCodes?: string[];
  winningSide?: number;
  score?: any;
};

/**
 * Change the winner of an already-decided matchUp by RE-DERIVING progression, not by rewriting it.
 *
 * ## Why this replaced `swapWinnerLoser`
 *
 * The engine had two implementations of "change a winner and carry it downstream". Without
 * `allowChangePropagation` the change is refused with `CANNOT_CHANGE_WINNING_SIDE`, and a director
 * clears the downstream result, enters the correction, and re-enters what they cleared — which runs
 * `removeDirectedParticipants` -> `directParticipants` -> `directLoser`/`directWinner`. With the
 * flag, `resolveAndApplyOutcome` short-circuited to `swapWinnerLoser`, which hand-edited
 * `drawPositions` and `positionAssignments` in what it believed were the affected structures.
 *
 * Measured head-to-head on fully played draws across four draw types, the two disagreed on 36 of 189
 * flips, and `getDrawInconsistencies` flagged the hand-rolled one in 34 of them while never flagging
 * the director's sequence. Three independent gaps, all structural:
 *
 *  1. it built its structure set from `stageSequence`, so every structure fed by a DIFFERENT ROUND
 *     of the same source structure — which sits at the SAME `stageSequence` — was never visited;
 *  2. it swapped only assignments that ALREADY EXISTED, so a placement a `FIRST_MATCHUP` link had
 *     withheld was never created when the new loser became eligible;
 *  3. it edited assignments without reconciling the matchUps standing on them, leaving a BYE
 *     recorded as having won 6-1 6-1 — invisible to `getDrawInconsistencies`.
 *
 * Rather than fix three symptoms of writing progression by hand, this performs the director's
 * sequence directly, so the override converges on the state the legitimate path produces.
 *
 * ## The sequence
 *
 * 1. Walk downstream via `positionTargets` and capture every result that stands on this matchUp.
 * 2. Clear them deepest-first — a result cannot be cleared while its own downstream still stands.
 * 3. Apply the correction through the ordinary dispatch, which now sees an inert downstream and
 *    routes to `noDownstreamDependencies` -> `attemptToSetWinningSide`.
 * 4. Re-enter the captured results shallowest-first.
 *
 * Step 4 re-enters an OUTCOME, not a participant: `winningSide: 1` means "side 1 won", and after the
 * correction side 1 may hold somebody else. That is what the director's own re-entry does, and it is
 * the definition of the state this path is being asked to reach.
 *
 * `setMatchUpState` is re-entered rather than its internals called directly, because every step is a
 * full state transition with its own guards. The inner calls pass `allowChangePropagation: false`,
 * which makes re-entry into THIS function impossible and keeps the recursion one level deep.
 *
 * It arrives as `applyState` rather than as an import: `setMatchUpState` imports this module, so
 * importing it back would be the only module cycle in `src/mutate`. Injection keeps the dependency
 * one-way and makes the re-entry visible at the call site.
 */
export function correctDecidedOutcome(params, applyState: (args: any) => any): any {
  const { tournamentRecord, drawDefinition, matchUpId, event } = params;

  const captured = captureDownstreamResults({ drawDefinition, matchUpId, event });

  pushGlobalLog({
    method: stack,
    color: 'brightmagenta',
    downstreamResults: captured.length,
    matchUpId,
  });

  const restore = (outcomes: CapturedOutcome[]) => {
    for (const outcome of outcomes) {
      applyState({
        matchUpStatusCodes: outcome.matchUpStatusCodes,
        matchUpStatus: outcome.matchUpStatus,
        winningSide: outcome.winningSide,
        allowChangePropagation: false,
        matchUpId: outcome.matchUpId,
        score: outcome.score,
        tournamentRecord,
        drawDefinition,
        event,
      });
    }
  };

  // ---- 1. clear, deepest first ----------------------------------------------------------------
  const cleared: CapturedOutcome[] = [];
  for (const outcome of captured) {
    const result = applyState({
      matchUpId: outcome.matchUpId,
      allowChangePropagation: false,
      matchUpStatus: TO_BE_PLAYED,
      winningSide: undefined,
      score: CLEAR_SCORE,
      tournamentRecord,
      drawDefinition,
      event,
    });
    if (result?.error) {
      // Put back what was taken before returning the refusal, so the caller does not receive an
      // error over a half-unwound draw — the `ERROR_IMPLIES_NO_MUTATION` property.
      restore(cleared.toReversed());
      return decorateResult({
        result,
        stack,
        context: { phase: 'clearDownstream', clearedMatchUpId: outcome.matchUpId },
      });
    }
    cleared.push(outcome);
  }

  // ---- 2. apply the correction through the ordinary dispatch -----------------------------------
  const result = applyState({
    ...forwardedParams(params),
    allowChangePropagation: false,
    tournamentRecord,
    drawDefinition,
    matchUpId,
    event,
  });

  if (result?.error) {
    restore(cleared.toReversed());
    return decorateResult({ result, stack, context: { phase: 'applyCorrection' } });
  }

  // ---- 3. re-enter what was cleared, shallowest first ------------------------------------------
  restore(cleared.toReversed());

  return decorateResult({ result, stack });
}

/**
 * The request attributes the correction itself carries. `setMatchUpState` mutates `params` heavily
 * on its way down — `matchUpsMap`, `targetData`, `inContextMatchUp` and `structure` are all written
 * onto it — and every one of those is stale the moment the downstream clears run. Only the caller's
 * own request is forwarded; the inner call re-resolves the rest.
 */
function forwardedParams(params) {
  return {
    disableScoreValidation: params.disableScoreValidation,
    propagateRetirementAsExit: params.propagateRetirementAsExit,
    matchUpStatusCodes: params.matchUpStatusCodes,
    policyDefinitions: params.policyDefinitions,
    propagateExitStatus: params.propagateExitStatus,
    // THE CASCADE MUST KEEP IDENTIFYING ITSELF. `progressExitStatus` hardcodes
    // `allowChangePropagation: true` on its own `setMatchUpState` call, so the cascade can reach
    // this function — and `propagatingExit` is what waives `checkParticipants`' two-participant
    // requirement for a one-sided exit. Dropping it here would make the inner apply refuse exactly
    // the shape the cascade exists to write.
    propagatingExit: params.propagatingExit,
    matchUpFormat: params.matchUpFormat,
    matchUpStatus: params.matchUpStatus,
    winningSide: params.winningSide,
    removeScore: params.removeScore,
    notes: params.notes,
    score: params.score,
  };
}

/**
 * Every result standing downstream of `matchUpId`, ordered DEEPEST FIRST.
 *
 * Breadth-first over `positionTargets`, which is the same winner/loser link walk `isActiveDownstream`
 * uses to decide whether this correction needed a director at all — so the set cleared here is the
 * set that made the ordinary re-score refuse.
 *
 * PROPAGATED EXITS ARE DELIBERATELY EXCLUDED. A walkover the cascade produced is derived state, not
 * a director's entry: `removeDirectedParticipants` takes it back through `withdrawProducedExits`,
 * keyed on `sideExitProvenance.sourceMatchUpId`. Capturing one would re-enter a result nobody
 * recorded, and clearing one is refused outright by the `PROPAGATED_EXITS_DOWNSTREAM` guard.
 */
function captureDownstreamResults({ drawDefinition, matchUpId, event }): CapturedOutcome[] {
  const { matchUps: inContextDrawMatchUps = [] } = getAllDrawMatchUps({
    afterRecoveryTimes: false,
    inContext: true,
    drawDefinition,
    event,
  });
  const byId = new Map<string, HydratedMatchUp>(
    inContextDrawMatchUps.map((matchUp: any) => [matchUp.matchUpId, matchUp]),
  );

  const captured: CapturedOutcome[] = [];
  const visited = new Set<string>([matchUpId]);
  let frontier = [matchUpId];
  let depth = 0;

  // `drawMatchUps.length` bounds the walk: every matchUp is visited at most once, so the frontier
  // must empty. The guard is a backstop against a malformed link graph, not an expected exit.
  while (frontier.length && depth <= inContextDrawMatchUps.length) {
    depth += 1;
    const next: string[] = [];

    for (const sourceMatchUpId of frontier) {
      const targets = positionTargets({ inContextDrawMatchUps, drawDefinition, matchUpId: sourceMatchUpId });
      const targetMatchUps = [targets?.targetMatchUps?.winnerMatchUp, targets?.targetMatchUps?.loserMatchUp];

      for (const target of targetMatchUps) {
        if (!target?.matchUpId || visited.has(target.matchUpId)) continue;
        visited.add(target.matchUpId);
        next.push(target.matchUpId);

        const matchUp: any = byId.get(target.matchUpId);
        if (!carriesDirectorEntry(matchUp)) continue;

        captured.push({
          matchUpId: target.matchUpId,
          matchUpStatusCodes: matchUp.matchUpStatusCodes,
          matchUpStatus: matchUp.matchUpStatus,
          winningSide: matchUp.winningSide,
          score: matchUp.score,
          depth,
        });
      }
    }

    frontier = next;
  }

  // deepest first — a result cannot be cleared while its own downstream still stands
  return captured.toSorted((a, b) => b.depth - a.depth);
}

/**
 * A result a director entered, as opposed to one the cascade derived or a slot nobody has played.
 *
 * Three exclusions, and each of them is a thing that is RE-DERIVED rather than re-entered:
 *
 *  - **a propagated exit** — `removeDirectedParticipants` takes it back via `withdrawProducedExits`,
 *    keyed on `sideExitProvenance.sourceMatchUpId`, and clearing one is refused outright by the
 *    `PROPAGATED_EXITS_DOWNSTREAM` guard;
 *  - **a BYE** — it is a function of `positionAssignments`, not a result. A BYE matchUp DOES carry a
 *    `winningSide`, so the `winningSide` test below captures one unless this line stops it, and
 *    re-entering `matchUpStatus: BYE` onto a position that is no longer a bye fails with
 *    `ERR_UNCHANGED_CANNOT_ASSIGN_BYE`. Measured: census seed 9100247 (COMPASS 16/14), where that
 *    single failed re-entry left the draw subtly wrong and a LATER step in the schedule then
 *    returned `ERR_EXISTING_POSITION_ASSIGNMENT` over it — the error surfacing three steps away from
 *    its cause, and the reason this predicate is worth being strict about;
 *  - **a matchUp with no result at all**, which has nothing to restore.
 */
function carriesDirectorEntry(matchUp?: any): boolean {
  if (!matchUp) return false;
  if (isPropagatedExit({ matchUp })) return false;
  if (matchUp.matchUpStatus === BYE) return false;
  if (matchUp.winningSide) return true;
  return !!matchUp.matchUpStatus && isDirectingMatchUpStatus({ matchUpStatus: matchUp.matchUpStatus });
}
