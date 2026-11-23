import { finishingOrderUpdates, getDualLines } from '@Query/matchUp/finishingOrder';

// constants and types
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import type { DrawDefinition, MatchUp } from '@Types/tournamentTypes';
import type { OutcomeOp } from './ops';

type Line = Pick<MatchUp, 'matchUpId' | 'matchUpStatus' | 'score' | 'collectionId' | 'collectionPosition'> & {
  orderOfFinish?: number;
};

/**
 * A TEAM dual's lines are numbered as they finish (`finishingOrderUpdates`), on every path that writes a line's result,
 * as v1's `modifyMatchUpScore` numbers them. Each line result in a plan is followed by the `setOrderOfFinish` ops its
 * write causes in its collection: the line's own, then the siblings it moves, so they land before the dual's tally and
 * are announced after the line. The lines are read from the draw and carried through the plan in its order, so a plan
 * writing two lines of one dual numbers the second against the first.
 */
export function withFinishingOrder(ops: OutcomeOp[], drawDefinition?: DrawDefinition): OutcomeOp[] {
  if (!drawDefinition) return ops;
  const duals = new Map<string, Line[]>(); // a written line's id → its dual's lines as the plan leaves them
  const linesOf = (matchUpId: string): Line[] | undefined => {
    if (duals.has(matchUpId)) return duals.get(matchUpId);
    const { lines } = getDualLines({ drawDefinition, matchUpId });
    if (!lines.length) return undefined;
    const copies = lines.map(snapshot);
    for (const { matchUpId: id } of copies) duals.set(id, copies);
    return copies;
  };

  return ops.flatMap((op): OutcomeOp[] => {
    if (op.op !== 'setMatchUpResult') return [op];
    const lines = linesOf(op.matchUpId);
    const line = lines?.find((candidate) => candidate.matchUpId === op.matchUpId);
    if (!lines || !line) return [op];
    const previous = { ...line };
    // the line as the result's fold leaves it (`setMatchUpResult`)
    line.matchUpStatus = op.matchUpStatus;
    if (!completedMatchUpStatuses.includes(op.matchUpStatus)) delete line.orderOfFinish;
    if (op.score) line.score = op.score;
    const updates = finishingOrderUpdates({ lines, previous });
    for (const { matchUpId, orderOfFinish } of updates) {
      const target = lines.find((candidate) => candidate.matchUpId === matchUpId);
      if (!target) continue;
      if (orderOfFinish === undefined) delete target.orderOfFinish;
      else target.orderOfFinish = orderOfFinish;
    }
    return [
      op,
      ...updates.flatMap(({ matchUpId, orderOfFinish }): OutcomeOp[] => [
        { op: 'setOrderOfFinish', matchUpId, ...(orderOfFinish === undefined ? {} : { orderOfFinish }) },
        // a sibling moved is stamped by its own notice, as v1 announces it; the line is stamped by its result
        ...(matchUpId === op.matchUpId
          ? []
          : [{ op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: matchUpId }]),
      ]),
    ];
  });
}

function snapshot({ matchUpId, matchUpStatus, score, orderOfFinish, collectionId, collectionPosition }: Line): Line {
  return { matchUpId, matchUpStatus, score, orderOfFinish, collectionId, collectionPosition };
}
