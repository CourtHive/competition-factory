import { isExit } from '@Validators/isExit';

// constants and types
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
  const loser = planLoser(view, winningSide === 1 ? 2 : 1);
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
function planLoser(view: OutcomeView, loserSide: 1 | 2): DirectionPlan['loser'] {
  const matchUpId = view.targets.loserMatchUpId;
  const participantId = view.targets.sideParticipantIds[loserSide];
  if (!matchUpId || !participantId || !view.targets.loserLink) return undefined;
  const fedFMLC = view.targets.loserLink.linkCondition === FIRST_MATCHUP && view.targets.loserMatchUpRoundNumber === 2;
  const arrives = fedFMLC ? view.targets.priorWins[loserSide] === 0 : true;
  return { matchUpId, participantId, arrives };
}
