import { isExit } from '@Validators/isExit';

// constants and types
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
  if (!matchUpId) return {};
  if (!participantId) return isExit(request.matchUpStatus) ? {} : undefined;
  return { winner: { matchUpId, participantId } };
}
