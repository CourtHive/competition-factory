import { getSideExitProvenance } from '@Helpers/drawTopology/sideExitProvenance';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { isDoubleExit } from '@Validators/isExit';
import { claimEdges } from '../plan/placementClaims';
import type { SettlementEffectArgs, SettlementProgram } from './effects';

/** Replacing a decided result withdraws its old placement before the lucky draw's double-exit
 * advance returns without producing anything. Only the source score and actual held winner place
 * announce. Further holders and independent reservations require their own ordered effects. */
export function luckyReplacementEffects(args: SettlementEffectArgs): SettlementProgram | undefined {
  const { view, request } = args;
  if (
    args.route !== 'completed-to-double-exit' ||
    !view.draw.luckyBased ||
    view.group ||
    view.line ||
    view.isTeam ||
    !isDoubleExit(request.matchUpStatus) ||
    request.winningSide ||
    request.matchUpFormat ||
    request.carries?.schedule ||
    request.carries?.notes ||
    request.score?.sets?.length
  )
    return;
  const matches = view.inContextDrawMatchUps;
  const source = matches?.find((m) => m.matchUpId === request.matchUpId);
  if (
    !matches ||
    !source?.winningSide ||
    source.sides?.some((s) => s.bye || s.qualifier) ||
    getSideExitProvenance({ matchUp: source })
  )
    return;
  const edge = claimEdges({ drawDefinition: args.drawDefinition, inContextDrawMatchUps: matches }, source);
  const target = edge.targetMatchUps?.winnerMatchUp;
  const winner = source.sides?.find((s) => s.sideNumber === source.winningSide);
  if (
    !target ||
    edge.targetLinks?.winnerTargetLink ||
    edge.targetMatchUps?.loserMatchUp ||
    edge.targetMatchUps?.byeMatchUp ||
    target.structureId !== source.structureId ||
    !winner?.participantId ||
    !winner.drawPosition ||
    target.matchUpStatus !== TO_BE_PLAYED ||
    target.winningSide ||
    getSideExitProvenance({ matchUp: target }) ||
    !target.sides?.some((s) => s.drawPosition === winner.drawPosition && s.participantId === winner.participantId)
  )
    return;
  if (
    matches.some(
      (m) =>
        (m.structureId === source.structureId &&
          m.matchUpId !== target.matchUpId &&
          (m.roundNumber ?? 0) > (source.roundNumber ?? 0) &&
          m.drawPositions?.includes(winner.drawPosition)) ||
        Object.values(getSideExitProvenance({ matchUp: m }) ?? {}).some(
          (mark) => mark.sourceMatchUpId === source.matchUpId,
        ),
    )
  )
    return;
  let wroteScore = false,
    removed = false;
  for (const op of args.ops) {
    if (op.op === 'stampUpdatedAt') continue;
    if (
      op.op === 'setMatchUpResult' &&
      op.matchUpId === source.matchUpId &&
      op.matchUpStatus === request.matchUpStatus &&
      !op.winningSide
    ) {
      wroteScore = true;
      continue;
    }
    if (
      op.op === 'setMatchUpDrawPositions' &&
      op.matchUpId === target.matchUpId &&
      op.removedDrawPosition === winner.drawPosition &&
      !op.placedDrawPosition
    ) {
      removed = true;
      continue;
    }
    return;
  }
  if (!wroteScore || !removed) return;
  return {
    emissions: [
      { match: source, context: 'modifyMatchUpScore', bound: true },
      { match: target, context: `removeSubsequentDrawPosition-${winner.drawPosition}`, bound: true, eventless: true },
    ],
    result: {
      success: true,
      stack: ['doubleExitAdvancement', 'noDownStreamDependencies', 'setMatchUpStatus', 'setMatchUpStatus'],
    },
  };
}
