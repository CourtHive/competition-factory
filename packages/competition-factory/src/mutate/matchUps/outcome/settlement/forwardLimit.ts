import { FORWARD_PASS_LIMIT, firstForwardDebt } from '@Mutate/matchUps/matchUpStatus/settleForwardConsequences';
import { getUpdatedDrawPositions } from '@Mutate/drawDefinitions/matchUpGovernor/getUpdatedDrawPositions';
import { getPairedPreviousMatchUp } from '@Query/matchUps/getPairedPreviousMatchup';
import { claimAssignment, claimEdges, winnerClaimEdge } from '../plan/placementClaims';
import { topLevelStructureId } from '@Mutate/notifications/drawNotifications';
import { participatesInExitCascade } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import { isDoubleExit } from '@Validators/isExit';

import type { Event, Tournament } from '@Types/tournamentTypes';
import type { WorkingView } from '../overlay';
import type { OutcomeRequest } from '../types';
import type { OutcomeOp } from '../ops';

type Args = { working: WorkingView; request: OutcomeRequest; event?: Event; tournamentRecord?: Tournament };
type Debt = NonNullable<ReturnType<typeof firstForwardDebt>>;
type ForwardPlan = { ops: OutcomeOp[]; reasons: string[]; exhausted?: string };

/** An ordinary winner joining an open sibling seat. An arrival with another consequence needs its own rule. */
export function winnerArrival(working: WorkingView, debt: Debt): OutcomeOp[] | undefined {
  const source = working.inContextDrawMatchUps.find((match) => match.matchUpId === debt.matchUpId);
  if (debt.kind !== 'winner' || !source) return undefined;
  const edge = winnerClaimEdge(working, source);
  const target = edge?.targetMatchUps.winnerMatchUp;
  if (!target || edge.targetLinks.winnerTargetLink || target.structureId !== source.structureId) return undefined;
  const stored = working.matchUpsMap.drawMatchUps.find((match) => match.matchUpId === target.matchUpId);
  if (stored?.matchUpStatus !== TO_BE_PLAYED || stored.winningSide || participatesInExitCascade({ matchUp: stored }))
    return undefined;
  const onward = claimEdges(working, target);
  if (!onward.targetMatchUps || onward.targetLinks.loserTargetLink?.linkCondition === FIRST_MATCHUP) return undefined;

  const { pairedPreviousMatchUp } = getPairedPreviousMatchUp({
    matchUpsMap: working.matchUpsMap,
    structureId: source.structureId,
    matchUp: source,
  });
  if (isDoubleExit(pairedPreviousMatchUp?.matchUpStatus)) return undefined;
  const { positionAdded, updatedDrawPositions } = getUpdatedDrawPositions({
    drawPositions: stored.drawPositions ?? [],
    drawPosition: debt.drawPosition,
  });
  const allOccupied = updatedDrawPositions.every((position) => {
    const assignment = claimAssignment(working, target, position);
    return assignment?.participantId && !assignment.bye;
  });
  if (!positionAdded || !allOccupied) return undefined;

  const structureId = topLevelStructureId(working.drawDefinition, target.matchUpId);
  if (!structureId) return undefined;
  return [
    { op: 'setMatchUpDrawPositions', matchUpId: target.matchUpId, drawPositions: updatedDrawPositions },
    { op: 'stampUpdatedAt', entity: 'drawDefinition', id: working.drawDefinition.drawId },
    { op: 'stampUpdatedAt', entity: 'structure', id: structureId },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: target.matchUpId },
  ];
}

/** Fold each answer into this clock-free working cursor exactly once. A resumed call has its own action budget. */
export function planForward({ working, request, event, tournamentRecord }: Args): ForwardPlan {
  const ops: OutcomeOp[] = [];
  const done = new Set<string>();
  for (;;) {
    const debt = firstForwardDebt({
      inContextDrawMatchUps: working.inContextDrawMatchUps,
      propagateExitStatus: request.flags.propagateExitStatus,
      drawDefinition: working.drawDefinition,
      matchUpsMap: working.matchUpsMap,
      tournamentRecord,
      event,
      done,
    });
    if (!debt) return { ops, reasons: [] };
    if (done.size === FORWARD_PASS_LIMIT) return { ops, reasons: [], exhausted: debt.matchUpId };
    const action = winnerArrival(working, debt);
    if (!action) return { ops, reasons: [`forward:${debt.kind}:${debt.matchUpId}`] };
    if (!working.temporal) return { ops, reasons: ['forward:requires clock-free working view'] };
    const { error } = working.apply(action);
    if (error) return { ops, reasons: [error] };
    done.add(debt.key);
    ops.push(...action);
  }
}
