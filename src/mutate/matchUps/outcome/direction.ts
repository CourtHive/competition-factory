import { isAnyExit, isExit } from '@Validators/isExit';

// constants and types
import { DEFAULTED, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';

import type { DirectionPlan, OutcomeRequest, OutcomeView, Route } from './types';

/**
 * The outcome pipeline, v2: direction (§ 5 rule 1), the winner's half.
 *
 * On the `winner` route a decided matchUp sends its winner to the matchUp `positionTargets` names,
 * unless it is a line of a dual (the dual directs, not the line), an AD_HOC matchUp (nothing is
 * directed), a lucky draw's pre-feed round, or an exit whose winning side is empty (nobody to
 * send). The loser's half is entangled with exit propagation and is planned with it (S2c).
 */
export function planDirection(request: OutcomeRequest, view: OutcomeView, route: Route): DirectionPlan | undefined {
  if (route !== 'winner') return undefined;
  if (view.line || view.matchUpTieId || view.draw.isAdHoc || view.targets.luckyPreFeed) return undefined;
  if (view.isTeam && request.flags.enableAutoCalc) return undefined;
  const winningSide = request.winningSide;
  if (winningSide !== 1 && winningSide !== 2) return undefined;
  const participantId = view.targets.sideParticipantIds[winningSide];
  const matchUpId = view.targets.winnerMatchUpId;
  const loser = planLoser(request, view, winningSide === 1 ? 2 : 1);
  if (!matchUpId) return loser ? { loser } : {};
  if (!participantId) return isExit(request.matchUpStatus) ? { ...(loser ? { loser } : {}) } : undefined;
  return { winner: { matchUpId, participantId }, ...(loser ? { loser } : {}) };
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
  const exit = arrives ? carriedExit(request, view) : undefined;
  return { matchUpId, participantId, arrives, ...(bye ? { bye } : {}), ...(exit ? { exit } : {}) };
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
  // an exit already there, or already carried in on the other side, makes a double exit: the cascade's
  // next piece (measured 2026-10-02: a carried WALKOVER on side 2 of a TO_BE_PLAYED target)
  if (isAnyExit(view.targets.loserMatchUpStatus) || view.targets.loserMatchUpCarriesExit) return undefined;
  // a final's winner and loser both go to its decider; whether the decider is played, and so what it
  // holds, is settled after the cascade (spec § 5 effect 5, `reconcileDeciders`), not by the carry
  if (view.targets.loserMatchUpId && view.targets.loserMatchUpId === view.targets.winnerMatchUpId) return undefined;
  return isExit(matchUpStatus) && matchUpStatus !== RETIRED ? matchUpStatus : WALKOVER;
}
