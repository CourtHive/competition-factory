import { APPLY_VALUES, bareResultRequest, indexed } from './planShared';

// constants and types
import { COMPLETED, RETIRED } from '@Constants/matchUpStatusConstants';
import type { ExitReasonArgs } from '../types';
import type { HydratedMatchUp } from '@Types/hydrated';

function holdsPosition(matchUp: HydratedMatchUp | undefined, participantId?: string, position?: number): boolean {
  return (
    !!participantId &&
    !!position &&
    !!matchUp?.sides?.some((side) => side.participantId === participantId && side.drawPosition === position)
  );
}

/** A non-carrying retirement changes only the source result when both outgoing claims still stand.
 * The winner holds their own position. The loser holds the linked position in an independently completed
 * match. Any origin of this source, even beyond the two targets, can owe a withdrawal or a label refresh. */
export function retirementClaimsStand({ request, route, view }: ExitReasonArgs): boolean {
  const { existing, targets, inContextDrawMatchUps } = view;
  const winner = request.winningSide;
  if (
    route !== APPLY_VALUES ||
    existing.matchUpStatus !== COMPLETED ||
    request.matchUpStatus !== RETIRED ||
    request.flags.propagateRetirementAsExit ||
    !request.flags.propagateExitStatus ||
    !request.score?.sets?.length ||
    !bareResultRequest({ ...request, score: undefined }) ||
    (winner !== 1 && winner !== 2) ||
    winner !== existing.winningSide ||
    !request.matchUpId ||
    view.isTeam ||
    view.line ||
    !inContextDrawMatchUps
  )
    return false;

  const winnerId = targets.sideParticipantIds[winner];
  const loserId = targets.sideParticipantIds[winner === 1 ? 2 : 1];
  const onward = indexed(view, targets.winnerMatchUpId);
  const linked = indexed(view, targets.loserMatchUpId);
  if (
    winnerId === loserId ||
    !onward ||
    !linked ||
    targets.winnerLink ||
    onward.structureId !== targets.source.structureId ||
    linked.structureId === onward.structureId ||
    linked.matchUpStatus !== COMPLETED ||
    !linked.winningSide ||
    linked.sideExitProvenance ||
    !targets.loserTargetSeat?.opponentHeld ||
    targets.loserTargetSeat.participantId !== loserId ||
    !holdsPosition(onward, winnerId, targets.sideDrawPositions[winner]) ||
    !holdsPosition(linked, loserId, targets.loserTargetDrawPosition)
  )
    return false;
  return !inContextDrawMatchUps.some((matchUp) =>
    Object.values(matchUp.sideExitProvenance ?? {}).some((entry) => entry?.sourceMatchUpId === request.matchUpId),
  );
}
