import { getSideExitProvenance, carriedExitStatus } from '@Helpers/drawTopology/sideExitProvenance';
import { checkScoreHasValue } from '@Scoring/analysis/checkScoreHasValue';
import { claimAssignment, claimEdges } from '../plan/placementClaims';
import { releasedAward } from '../plan/carriedExit';
import { indexed } from '../plan/planShared';
import { isExit } from '@Validators/isExit';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

import type { OutcomeRequest, OutcomeView, Route } from '../types';
import type { DrawDefinition } from '@Types/tournamentTypes';
import type { OutcomeOp } from '../ops';

/** applyWithdrawnExits releases the place won by the withdrawn carry before the root winner
 * itself is removed. The released match keeps its own result fields. Both the losing carry
 * and the awardee's actual placement are proved on the pre-call draw. */
export function withdrawnAwardRelease(
  view: OutcomeView,
  request: OutcomeRequest,
  route: Route | undefined,
  drawDefinition: DrawDefinition,
) {
  const matches = view.inContextDrawMatchUps;
  const source = indexed(view, request.matchUpId);
  const clears = route === 'remove-directed' && !request.winningSide && request.matchUpStatus === TO_BE_PLAYED;
  const reverses =
    route === 'winner' &&
    !!request.winningSide &&
    request.winningSide !== source?.winningSide &&
    !isExit(request.matchUpStatus);
  const relabels =
    route === 'apply-values' &&
    request.flags.propagateExitStatus &&
    !!request.winningSide &&
    request.winningSide === source?.winningSide &&
    (!request.matchUpStatus || request.matchUpStatus === 'COMPLETED');
  if ((!clears && !reverses && !relabels) || !matches || !source?.winningSide || !isExit(source.matchUpStatus)) return;
  const frame = { inContextDrawMatchUps: matches, drawDefinition };
  const edge = claimEdges(frame, source);
  const holder = edge.targetMatchUps?.loserMatchUp;
  if (
    !holder?.winningSide ||
    !isExit(holder.matchUpStatus) ||
    source.structureId === holder.structureId ||
    !edge.targetLinks?.loserTargetLink ||
    holder.matchUpId === edge.targetMatchUps?.winnerMatchUp?.matchUpId ||
    holder.sides?.some((s) => s.bye) ||
    checkScoreHasValue({ score: holder.score })
  )
    return;
  const losing = source.sides?.find((s) => s.sideNumber === 3 - source.winningSide!);
  const carrier = holder.sides?.find((s) => s.sideNumber === 3 - holder.winningSide!);
  const awarded = holder.sides?.find((s) => s.sideNumber === holder.winningSide);
  const mark = carrier?.sideNumber && getSideExitProvenance({ matchUp: holder })?.[carrier.sideNumber];
  if (
    !carrier?.participantId ||
    carrier.participantId !== losing?.participantId ||
    !carrier.drawPosition ||
    carrier.drawPosition !== edge.targetMatchUps?.loserTargetDrawPosition ||
    claimAssignment(frame, holder, carrier.drawPosition)?.participantId !== carrier.participantId ||
    !mark ||
    mark.sourceMatchUpId !== source.matchUpId ||
    mark.previousMatchUpStatus !== source.matchUpStatus ||
    carriedExitStatus(mark) !== holder.matchUpStatus ||
    !awarded?.drawPosition ||
    !awarded.participantId ||
    awarded.participantId === carrier.participantId ||
    claimAssignment(frame, holder, awarded.drawPosition)?.participantId !== awarded.participantId ||
    carriedExitStatus(holder.sideExitProvenance?.[holder.winningSide])
  )
    return;
  const position = awarded.drawPosition;
  const participantId = awarded.participantId;
  const release = releasedAward(view, holder, position);
  const onwardEdge = claimEdges(frame, holder);
  const onward = onwardEdge.targetMatchUps?.winnerMatchUp;
  if (
    !release ||
    !onward ||
    release.matchUpId !== onward.matchUpId ||
    onwardEdge.targetLinks?.winnerTargetLink ||
    !onward.sides?.some((s) => s.drawPosition === position && s.participantId === participantId) ||
    checkScoreHasValue({ score: onward.score }) ||
    matches.some(
      (m) =>
        m.structureId === holder.structureId &&
        (m.roundNumber ?? 0) >= (onward.roundNumber ?? 0) &&
        m.matchUpId !== onward.matchUpId &&
        m.drawPositions?.includes(position),
    )
  )
    return;
  const op: Extract<OutcomeOp, { op: 'setMatchUpDrawPositions' }> = {
    op: 'setMatchUpDrawPositions',
    matchUpId: onward.matchUpId,
    drawPositions: release.drawPositions,
    releasedDrawPosition: position,
  };
  return { holder, onward, position, participantId, op };
}
