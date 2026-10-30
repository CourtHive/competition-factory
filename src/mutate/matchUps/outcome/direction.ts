import { isAnyExit, isDoubleExit, isExit } from '@Validators/isExit';

// constants and types
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
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

import type { DirectionPlan, OutcomeRequest, OutcomeView, Route, WithdrawnCarry } from './types';
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
  if (route === 'apply-values') return planRelabelled(request, view);
  if (route !== 'winner') return undefined;
  if (view.line || view.matchUpTieId || view.draw.isAdHoc || view.targets.luckyPreFeed) return undefined;
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
 * the loser has a participant; when they do not arrive, a propagated BYE takes their place on the
 * feed's lower drawPosition.
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
  // ...unless the exit standing there decided the seat awaiting the loser, over a result recorded below: the
  // arrival takes that seat and carries their exit past it (P51 group 2)
  const carriedPast = carried && view.targets.loserMatchUpDecidedForArrival ? carried : undefined;
  const meets = !carriedPast && standing.length > 0;
  const exit = carriedPast || meets ? undefined : carried;
  const converged = carried && meets ? convergence([carried, ...standing]) : undefined;
  const withdrawn = arrives && !carried ? withdrawnCarry(request, view) : undefined;
  return {
    matchUpId,
    participantId,
    arrives,
    ...(bye ? { bye } : {}),
    ...(exit ? { exit } : {}),
    ...(converged ? { converged } : {}),
    ...(carriedPast ? { carriedPast } : {}),
    ...(withdrawn ? { withdrawn } : {}),
  };
}

/**
 * F2 and the 2026-10-02 relabel ruling: an exit re-entered as a played result, the winner unchanged, withdraws the
 * exit it carried to the loser. Alone, it leaves the loser's matchUp undecided; where it CONVERGED with an exit
 * carried in on the other side, the matchUp re-derives to that exit, and the loser, no longer exiting, wins it.
 * Not planned past a BYE (the view does not read the holder's onward matchUp). v1 keeps the carry where a result
 * stands onward (a winner or loser who has played on); `checkLoser` defers those, which the view does not read.
 */
function withdrawnCarry(request: OutcomeRequest, view: OutcomeView): WithdrawnCarry | undefined {
  const { targets } = view;
  if (!request.flags.propagateExitStatus || !isRelabel(request, view) || !targets.loserMatchUpCarriesSourceExit)
    return undefined;
  if (targets.loserMatchUpStatus === BYE) return undefined;
  const [kept] = targets.loserMatchUpCarriedStatuses;
  if (isDoubleExit(targets.loserMatchUpStatus) && kept)
    return { matchUpStatus: kept as MatchUpStatusUnion, loserWins: true };
  if (isDoubleExit(targets.loserMatchUpStatus)) return undefined;
  return { matchUpStatus: TO_BE_PLAYED, loserWins: false };
}

/**
 * S2c (exit-propagation § propagateExitStatus): with propagation on, a WALKOVER or DEFAULTED, and a
 * RETIRED when the policy says a retirement propagates, follows the loser into the target, written
 * as itself (a retirement as a WALKOVER). Where an exit already stands in the target the two
 * converge (planLoser); a target already a double exit is a third arrival and is not modelled.
 */
function carriedExit(request: OutcomeRequest, view: OutcomeView) {
  const { matchUpStatus, flags } = request;
  if (!flags.propagateExitStatus || !matchUpStatus) return undefined;
  const propagating = flags.propagateRetirementAsExit ? [RETIRED, WALKOVER, DEFAULTED] : [WALKOVER, DEFAULTED];
  if (!propagating.includes(matchUpStatus as string)) return undefined;
  if (isDoubleExit(view.targets.loserMatchUpStatus)) return undefined; // a third arrival: not modelled
  // a RELABEL, the winner unchanged (a COMPLETED result re-entered as a WALKOVER): the exit is carried to the
  // loser already directed, except where their next matchUp has a result of its own (CA, 2026-10-02): but the carry
  // this matchUp made there, standing alone, which the relabel rewrites in place (`relabelsTheCarry`) or leaves as it
  // is (S6 tail, `loserMatchUpCarryHeld`). Past a BYE the loser's next matchUp is the holder's onward one, which the view
  // does not read: not planned
  if (
    isRelabel(request, view) &&
    !view.targets.loserMatchUpCarryHeld &&
    (view.targets.loserMatchUpHasResult || view.targets.loserMatchUpStatus === BYE)
  )
    return undefined;
  // a final's winner and loser both go to its decider; whether the decider is played, and so what it
  // holds, is settled after the cascade (spec § 5 effect 5, `reconcileDeciders`), not by the carry
  if (view.targets.loserMatchUpId && view.targets.loserMatchUpId === view.targets.winnerMatchUpId) return undefined;
  return isExit(matchUpStatus) && matchUpStatus !== RETIRED ? matchUpStatus : WALKOVER;
}

/**
 * S6 tail: a relabel where the winner already stands (the `apply-values` route: the same winner, downstream active). v1
 * writes the matchUp and directs nothing again (`winningSideWithDownstreamDependencies`); under `propagateExitStatus`
 * it settles the loser's carry where they stand (`relabelWithoutDirection`): carried for an exit, withdrawn for a played
 * result, rewritten for the other exit. So the plan is the loser's half alone, and no placement.
 */
function planRelabelled(request: OutcomeRequest, view: OutcomeView): DirectionPlan | undefined {
  if (!isRelabel(request, view) || view.line || view.matchUpTieId || view.isTeam) return undefined;
  const winningSide = request.winningSide;
  if (winningSide !== 1 && winningSide !== 2) return undefined;
  const loser = planLoser(request, view, winningSide === 1 ? 2 : 1);
  return loser ? { loser } : undefined;
}

/** the call keeps the winner the matchUp already has */
export function isRelabel(request: OutcomeRequest, view: OutcomeView): boolean {
  return !!view.existing.winningSide && view.existing.winningSide === request.winningSide;
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
 * round in the same structure holds half as many matchUps, so roundPosition n feeds side 1 when odd
 * and side 2 when even; or as many (a feed round), where it feeds side 2 beside the fed position. An exit standing there converges with this one. Deferred:
 * a target already a double exit (a third arrival), a decider, a dual's line.
 */
function planProducedExit(request: OutcomeRequest, view: OutcomeView): DirectionPlan | undefined {
  const { winner, source, winnerMatchUpId } = view.targets;
  if (!winner || !winnerMatchUpId || view.line || view.matchUpTieId || view.isTeam) return undefined;
  if (isDoubleExit(winner.matchUpStatus)) return undefined; // a third arrival: not modelled
  if (winnerMatchUpId === view.targets.loserMatchUpId) return undefined;
  const nextRound =
    winner.structureId === source.structureId && !!source.roundNumber && winner.roundNumber === source.roundNumber + 1;
  const plainNextRound =
    nextRound &&
    source.nextRoundMatchUpCount * 2 === source.roundMatchUpCount &&
    winner.roundPosition === Math.ceil((source.roundPosition ?? 0) / 2);
  // a FEED ROUND: as many matchUps as this round, each taking this round's winner beside a position fed from another
  // structure, and fed positions are always side 1 (v1's `recordSourceSideProvenance`), so this one feeds side 2
  const fedNextRound =
    nextRound &&
    source.nextRoundMatchUpCount === source.roundMatchUpCount &&
    winner.roundPosition === source.roundPosition &&
    !!view.inContextDrawMatchUps?.find((matchUp) => matchUp.matchUpId === winnerMatchUpId)?.feedRound;
  if (!(plainNextRound || fedNextRound) || !source.roundPosition) return undefined;
  const fedSide = fedNextRound || source.roundPosition % 2 === 0 ? 2 : 1;
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
 * A convergence or a carry past a decided seat is left out; the plain carry is kept (S6 tail).
 */
function planSwap(request: OutcomeRequest, view: OutcomeView): DirectionPlan | undefined {
  const swapped = { ...view, targets: { ...view.targets, priorWins: view.targets.priorWinsBefore } };
  const plan = planDirection(request, swapped, 'winner');
  if (!plan?.loser) return plan;
  const { exit, converged: _converged, carriedPast: _carriedPast, ...loser } = plan.loser;
  // S6 tail: the new loser's carry, onto the seat the old loser held (relabelled to them), is kept where it lands as a
  // fresh carry does (the seat's matchUp to be played, holding no exit, no BYE beside it), or rewrites this matchUp's own
  // carry standing there (`loserMatchUpCarryHeld`). An exit standing there is not met by a carry: the new loser arrives
  // at it and wins it (DOUBLE_ELIMINATION's Main final flipped over a pending walkover), which is v1's. A matchUp
  // holding a result is refused before any direction (§ 2 row 22)
  const { targets } = view;
  const clean =
    targets.loserMatchUpStatus === TO_BE_PLAYED &&
    !targets.loserMatchUpCarriesExit &&
    !targets.loserTargetSeat?.opponentBye;
  return { ...plan, loser: exit && (clean || targets.loserMatchUpCarryHeld) ? { ...loser, exit } : loser };
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
