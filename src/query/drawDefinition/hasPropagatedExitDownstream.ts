import { exitProducedBy } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { isDoubleExit, isExit } from '@Validators/isExit';

/**
 * Whether a propagated exit downstream must BLOCK the clear of this matchUp.
 *
 * The two `isExit` calls below ask different questions and keep their status tests deliberately.
 * `isLoserMatchUpWO` asks whether the downstream matchUp is an exit at all, and
 * `hasLoserMatchUpUpstreamWOMatches` asks whether something feeding it is one. Neither is a
 * provenance question, and replacing either with one was measured and rejected.
 *
 * What IS a provenance question is the one this guard exists to answer: **will clearing this matchUp
 * leave a propagated exit standing?** It used to answer "is there a propagated exit downstream" and
 * refuse on that alone, which refused every undo of an exit the clear would itself have removed. A
 * TD who entered a retirement could not un-enter it: measured 2026-09-13 across 5 loser-linked draw
 * types × {RETIRED, WALKOVER, DEFAULTED}, the apply succeeded in 15 of 15 and the clear was refused
 * in 15 of 15 with `ERR_PROPAGATED_EXITS_DOWNSTREAM`.
 *
 * It is **not retirement-specific**, though that is how a TD reaches it — a walkover and a default
 * were refused identically. The prompt that opened this work described it as a retirement defect in
 * 4 draw types; it is all three exit statuses in 5.
 *
 * THE ORDER MATTERS, and getting it wrong was the first attempt. Suppressing the refusal on its own
 * permitted the clear in all 15 cells and left residue in all 15 — the consolation matchUp kept its
 * WALKOVER, its `winningSide` and its provenance, with `getDrawInconsistencies` reporting nothing.
 * **The refusal was load-bearing**: it stood in for an unwind the engine could not perform. So
 * `withdrawProducedExits` came first and this exemption second, and the exemption is scoped to
 * exactly what that unwind takes back — an exit EVERY side of which names this matchUp as its
 * source. A convergence resting on another upstream still blocks, because clearing this matchUp
 * would not restore it.
 *
 * `targetData.matchUp` is the matchUp whose clear is in question; `positionTargets` always returns
 * it, and both call sites — `setMatchUpState`'s `isClearScore` branch and `matchUpActions`'
 * CLEAR_SCORE affordance — build `targetData` from it. Consulting it here rather than adding a
 * parameter keeps those two callers agreeing by construction, which is the divergence that put 20
 * cells of the agreement matrix in quarantine in the first place.
 */
export function hasPropagatedExitDownstream(params) {
  // relevantLink is passed in iterative calls (see below)
  const { targetData, matchUpsMap } = params;

  const {
    targetMatchUps: { loserMatchUp },
  } = targetData;

  // an exit this matchUp produced is unwound BY the clear, so it is not a reason to refuse it
  if (exitProducedBy({ sourceMatchUpId: targetData?.matchUp?.matchUpId, matchUp: loserMatchUp })) return false;

  const isLoserMatchUpWO = isExit(loserMatchUp?.matchUpStatus);
  const hasLoserMatchUpUpstreamWOMatches = !!matchUpsMap?.drawMatchUps.find(
    (m) => m.loserMatchUpId === loserMatchUp?.matchUpId && isExit(m.matchUpStatus),
  );

  //if there is a downstream match with two propagated exits we mark it as active
  // `=== DOUBLE_WALKOVER` meant "is this a double exit"; a DOUBLE_DEFAULT reached here and took the
  // false branch 161 times over the 600-seed sweep window, against 526 DOUBLE_WALKOVERs.
  return (
    (hasLoserMatchUpUpstreamWOMatches && isDoubleExit(loserMatchUp?.matchUpStatus)) ||
    //if there is a downstream propagated exit and we are trying to clear the score we stop the user
    //by marking the downstream as active
    (hasLoserMatchUpUpstreamWOMatches && isLoserMatchUpWO)
  );
}
