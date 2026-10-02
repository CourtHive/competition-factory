import { isAnyExit, isDoubleExit, isExit } from '@Validators/isExit';

// constants and types
import {
  BYE,
  DEAD_RUBBER,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';

import type { DirectionPlan, OutcomeRequest, OutcomeView, Route } from './types';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';

/**
 * The outcome pipeline, v2: direction (§ 5 rule 1), the winner's half.
 *
 * On the `winner` route a decided matchUp sends its winner to the matchUp `positionTargets` names,
 * unless it is a line of a dual (the dual directs, not the line), an AD_HOC matchUp (nothing is
 * directed), a lucky draw's pre-feed round, or an exit whose winning side is empty (nobody to
 * send). The loser's half is entangled with exit propagation and is planned with it (S2c).
 */
export function planDirection(request: OutcomeRequest, view: OutcomeView, route: Route): DirectionPlan | undefined {
  if (route === 'double-exit' || route === 'completed-to-double-exit') return planProducedExit(request, view);
  if (route === 'swap') return planSwap(request, view);
  if (route !== 'winner') return undefined;
  if (view.line || view.matchUpTieId || view.draw.isAdHoc || view.targets.luckyPreFeed) return undefined;
  if (view.isTeam && request.flags.enableAutoCalc) return undefined;
  const winningSide = request.winningSide;
  if (winningSide !== 1 && winningSide !== 2) return undefined;
  const participantId = view.targets.sideParticipantIds[winningSide];
  const matchUpId = view.targets.winnerMatchUpId;
  const loser = planLoser(request, view, winningSide === 1 ? 2 : 1);
  const decider = planDecider(view, winningSide);
  const settled = decider ? { decider } : {};
  if (!matchUpId) return loser ? { loser, ...settled } : settled;
  if (!participantId) return isExit(request.matchUpStatus) ? { ...(loser ? { loser } : {}), ...settled } : undefined;
  return { winner: { matchUpId, participantId }, ...(loser ? { loser } : {}), ...settled };
}

/**
 * S2c, the loser's half (§ 5 rule 1). A first-match-loser feed (the link's condition FIRST_MATCHUP,
 * landing in the target's round 2) takes the loser only if this was their first match: no wins in
 * the source structure besides this one. Every other loser link takes the loser. Planned only when
 * the loser has a participant; what the target holds when they do not arrive (a BYE) is S2c's next.
 */
function planLoser(request: OutcomeRequest, view: OutcomeView, loserSide: 1 | 2): DirectionPlan['loser'] {
  const matchUpId = view.targets.loserMatchUpId;
  const participantId = view.targets.sideParticipantIds[loserSide];
  if (!matchUpId || !participantId || !view.targets.loserLink) return undefined;
  const fedFMLC = view.targets.loserLink.linkCondition === FIRST_MATCHUP && view.targets.loserMatchUpRoundNumber === 2;
  const arrives = fedFMLC ? view.targets.priorWins[loserSide] === 0 : true;
  // kept out of an FMLC feed, the loser's place is taken by a propagated BYE on the feed's lower position
  const positions = view.targets.loserMatchUpDrawPositions ?? [];
  const structureId = view.targets.loserStructureId;
  const bye =
    !arrives && positions.length && structureId ? { structureId, drawPosition: Math.min(...positions) } : undefined;
  const carried = arrives ? carriedExit(request, view) : undefined;
  // the carried exit meets one already there (its status, or carried in on the other side): they converge
  const standing = view.targets.loserMatchUpCarriedStatuses; // this matchUp's own product excluded
  const exit = carried && standing.length ? undefined : carried;
  const converged = carried && standing.length ? convergence([carried, ...standing]) : undefined;
  return {
    matchUpId,
    participantId,
    arrives,
    ...(bye ? { bye } : {}),
    ...(exit ? { exit } : {}),
    ...(converged ? { converged } : {}),
  };
}

/**
 * S2c (exit-propagation § propagateExitStatus): with propagation on, a WALKOVER or DEFAULTED, and a
 * RETIRED when the policy says a retirement propagates, follows the loser into the target, written
 * as itself (a retirement as a WALKOVER). Planned only where the target is not already an exit: two
 * exits make a double exit, which is the cascade's next piece.
 */
function carriedExit(request: OutcomeRequest, view: OutcomeView) {
  const { matchUpStatus, flags } = request;
  if (!flags.propagateExitStatus || !matchUpStatus) return undefined;
  const propagating = flags.propagateRetirementAsExit ? [RETIRED, WALKOVER, DEFAULTED] : [WALKOVER, DEFAULTED];
  if (!propagating.includes(matchUpStatus as string)) return undefined;
  if (isDoubleExit(view.targets.loserMatchUpStatus)) return undefined; // a third arrival: not modelled
  // a final's winner and loser both go to its decider; whether the decider is played, and so what it
  // holds, is settled after the cascade (spec § 5 effect 5, `reconcileDeciders`), not by the carry
  if (view.targets.loserMatchUpId && view.targets.loserMatchUpId === view.targets.winnerMatchUpId) return undefined;
  return isExit(matchUpStatus) && matchUpStatus !== RETIRED ? matchUpStatus : WALKOVER;
}

/** exit-propagation § convergence: both sides defaults make a DOUBLE_DEFAULT, anything else a DOUBLE_WALKOVER */
export function convergence(statuses: string[]): MatchUpStatusUnion {
  return statuses.every((status) => status === DEFAULTED || status === DOUBLE_DEFAULT)
    ? DOUBLE_DEFAULT
    : DOUBLE_WALKOVER;
}

/**
 * S2c (exit-propagation § "What a double exit produces downstream keeps its flavour"): in its own
 * structure a double exit ALWAYS produces an exit in the matchUp it feeds (CA, 2026-09-27; the
 * `doubleExitPropagateBye` policy governs only the connected structure). A DOUBLE_WALKOVER produces
 * a WALKOVER, a DOUBLE_DEFAULT a DEFAULTED, awarded to the side the double exit does not feed: at once
 * when that side is occupied, and otherwise when someone arrives there (CA, 2026-09-20 and 09-25).
 *
 * Which side it feeds is read from the structure, planned only where that is unambiguous: the next
 * round in the same structure holds half as many matchUps (no feed round), so roundPosition n feeds
 * side 1 when odd and side 2 when even. Deferred: a target already an exit or carrying one (a
 * convergence, which makes a double exit), a decider, a dual's line.
 */
function planProducedExit(request: OutcomeRequest, view: OutcomeView): DirectionPlan | undefined {
  const { winner, source, winnerMatchUpId } = view.targets;
  if (!winner || !winnerMatchUpId || view.line || view.matchUpTieId || view.isTeam) return undefined;
  if (isDoubleExit(winner.matchUpStatus)) return undefined; // a third arrival: not modelled
  if (winnerMatchUpId === view.targets.loserMatchUpId) return undefined;
  const plainNextRound =
    winner.structureId === source.structureId &&
    !!source.roundNumber &&
    winner.roundNumber === source.roundNumber + 1 &&
    source.nextRoundMatchUpCount * 2 === source.roundMatchUpCount &&
    winner.roundPosition === Math.ceil((source.roundPosition ?? 0) / 2);
  if (!plainNextRound || !source.roundPosition) return undefined;
  const fedSide = source.roundPosition % 2 === 1 ? 1 : 2;
  const flavour = request.matchUpStatus === DOUBLE_DEFAULT ? DEFAULTED : WALKOVER;
  // an exit already standing there, or carried in on the other side: the two converge
  const standing = winner.carriedStatuses; // exits standing there, this matchUp's own product excluded
  if (standing.length)
    return { converged: { matchUpId: winnerMatchUpId, matchUpStatus: convergence([flavour, ...standing]) } };
  return { produced: { matchUpId: winnerMatchUpId, matchUpStatus: flavour, winningSide: fedSide === 1 ? 2 : 1 } };
}

/**
 * S2c: the swap (spec § 3, `allowChangePropagation` with a different winner). The two participants
 * exchange paths downstream, so the new winner stands where direction sends a winner and the new
 * loser where the loser link sends one: the winner's and loser's plans, applied to the new result.
 * Exit carrying is left out: a swap that also changes an exit is not modelled.
 */
function planSwap(request: OutcomeRequest, view: OutcomeView): DirectionPlan | undefined {
  const plan = planDirection(request, view, 'winner');
  if (!plan?.loser) return plan;
  const { exit: _exit, converged: _converged, ...loser } = plan.loser;
  return { ...plan, loser };
}

/**
 * S2c, decider settlement (spec § 5 effect 5, `reconcileDeciders`). A final whose winner and loser
 * both go to one matchUp in ANOTHER structure feeds a decider. Once the final's winner changes, the
 * decider is needed only if the final's loser has lost just that once (no loss before it, the
 * decider left out): needed, it stands TO_BE_PLAYED; not needed, it is a DEAD_RUBBER; any result it
 * held is cleared either way. A decider holding no result and standing as a BYE or an exit is left.
 */
function planDecider(view: OutcomeView, winningSide: 1 | 2): DirectionPlan['decider'] {
  const { winnerMatchUpId, loserMatchUpId, winner, source, sideParticipantIds, priorLosses } = view.targets;
  if (!winnerMatchUpId || winnerMatchUpId !== loserMatchUpId || !winner) return undefined;
  if (winner.structureId === source.structureId) return undefined;
  if (winningSide === view.existing.winningSide) return undefined; // the final's winner did not change
  const loserSide = winningSide === 1 ? 2 : 1;
  if (!sideParticipantIds[winningSide] || !sideParticipantIds[loserSide]) return undefined;
  if (!winner.holdsResult && (winner.matchUpStatus === BYE || isAnyExit(winner.matchUpStatus))) return undefined;
  const needed = priorLosses[loserSide] === 0;
  return { matchUpId: winnerMatchUpId, matchUpStatus: needed ? TO_BE_PLAYED : DEAD_RUBBER };
}
