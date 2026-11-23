import { getSideExitProvenance } from '@Helpers/drawTopology/sideExitProvenance';
import { tiebreakPointsWarnings } from '@Scoring/analysis/validateScore';
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { isExit } from '@Validators/isExit';
import { withdrawalChain } from './withdrawalChain';
import type { SettlementEffectArgs, SettlementProgram } from './effects';

/** The standing winner played on. Applying its score emits once; the loser keeps their first
 * assignment but sheds its exit, and the holders of that exit relinquish their own grants.
 * RelabelWithoutDirection makes no replacement placement. */
export function relabelEffects(args: SettlementEffectArgs): SettlementProgram | undefined {
  const { view, request } = args;
  const source = view.inContextDrawMatchUps?.find((m) => m.matchUpId === request.matchUpId);
  if (
    args.route !== 'apply-values' ||
    view.group ||
    view.line ||
    view.isTeam ||
    view.draw.tallied ||
    !source?.winningSide ||
    request.winningSide !== source.winningSide ||
    !isExit(source.matchUpStatus) ||
    (request.matchUpStatus && request.matchUpStatus !== COMPLETED) ||
    !request.flags.propagateExitStatus ||
    request.carries?.schedule ||
    request.carries?.notes ||
    request.matchUpFormat ||
    getSideExitProvenance({ matchUp: source })
  )
    return;
  const chain = withdrawalChain(view, args.drawDefinition, source);
  if (!chain?.length || chain[0].holder.matchUpId !== source.loserMatchUpId) return;
  const emissions: SettlementProgram['emissions'] = [{ match: source, context: 'modifyMatchUpScore', bound: true }];
  const reset = new Set<string>(),
    cleared = new Set<string>(),
    released = new Set<string>();
  for (const { holder, release } of chain) {
    if (release) emissions.push({ match: release.onward, context: 'releaseAdvancedDrawPosition', bound: true });
    emissions.push({ match: holder, context: 'withdrawProducedExits', bound: true });
  }
  for (const op of args.ops) {
    if (
      op.op === 'stampUpdatedAt' ||
      (op.op === 'setMatchUpResult' &&
        op.matchUpId === source.matchUpId &&
        op.winningSide === source.winningSide &&
        op.matchUpStatus === COMPLETED)
    )
      continue;
    if (op.op === 'clearPosition') {
      const child = chain
        .slice(1)
        .find(
          (c) =>
            c.holder.structureId === op.structureId &&
            c.position === op.drawPosition &&
            c.participantId === op.participantId,
        );
      if (!child) return;
      cleared.add(child.holder.matchUpId);
      continue;
    }
    if (op.op === 'setMatchUpDrawPositions') {
      const grant = chain.find((c) => c.release?.onward.matchUpId === op.matchUpId)?.release;
      if (
        !grant ||
        grant.position !== op.releasedDrawPosition ||
        op.placedDrawPosition ||
        op.drawPositions.includes(grant.position)
      )
        return;
      released.add(op.matchUpId);
      continue;
    }
    if (!('matchUpId' in op)) return;
    const entry = chain.find((c) => c.holder.matchUpId === op.matchUpId);
    if (!entry) return;
    if (op.op === 'setMatchUpResult' && op.matchUpStatus === TO_BE_PLAYED && !op.winningSide) {
      reset.add(op.matchUpId);
      continue;
    }
    if (op.op === 'setSideExitProvenance' && !op.provenance) continue;
    if (op.op === 'clearMatchUpScoredTime') {
      emissions.push({ match: entry.holder, context: 'reconcileScoredTimes', bound: true });
      continue;
    }
    return;
  }
  if (
    chain.some(
      ({ holder, release }, i) =>
        !reset.has(holder.matchUpId) ||
        (i > 0 && !cleared.has(holder.matchUpId)) ||
        (release && !released.has(release.onward.matchUpId)),
    )
  )
    return;
  const warnings =
    !request.flags.disableScoreValidation && tiebreakPointsWarnings(request.score?.sets, view.existing.matchUpFormat);
  return {
    emissions,
    result: {
      success: true,
      stack: ['setMatchUpStatus', 'setMatchUpStatus'],
      ...(warnings && warnings.length ? { warnings } : {}),
    },
  };
}
