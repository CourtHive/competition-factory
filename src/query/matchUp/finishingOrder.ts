import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { matchUpsOf, structuresOf } from '@Acquire/structureMembers';

// constants and types
import { completedMatchUpStatuses, COMPLETED, DEFAULTED, RETIRED } from '@Constants/matchUpStatusConstants';
import { DrawDefinition, MatchUp } from '@Types/tournamentTypes';

type Line = Pick<MatchUp, 'matchUpId' | 'matchUpStatus' | 'score' | 'collectionId' | 'collectionPosition'> & {
  orderOfFinish?: number;
};

/**
 * A TEAM dual's lines finish in an order, numbered per collection (`orderOfFinish`). Only a line played to a result
 * takes a number: COMPLETED or RETIRED, or DEFAULTED with a score that has a value. A walkover, a scoreless default, a
 * double exit, a dead rubber, an abandoned or a cancelled line does not.
 */
export function countsForFinishingOrder(matchUp?: Partial<Line>): boolean {
  const status = matchUp?.matchUpStatus;
  if (status === COMPLETED || status === RETIRED) return true;
  return status === DEFAULTED && !!checkScoreHasValue({ score: matchUp?.score });
}

export type FinishingOrderUpdate = { matchUpId: string; orderOfFinish?: number };

type FinishingOrderArgs = {
  lines: Line[]; // the dual's lines AFTER the write, the written line in its new state
  previous: Line; // the written line BEFORE the write
};

/**
 * The finishing-order changes one line's write causes in its collection, each line whose number changes:
 * - the line starts counting: it finishes after the others, `max + 1`. No number may exceed the collection's lines less
 *   those whose outcome cannot count, so a gap left by an older record is closed first (renumbered 1..n in order);
 * - the line stops counting: its number goes and the higher numbers move down by one;
 * - otherwise (a score edit, a line still unplayed): nothing.
 */
export function finishingOrderUpdates({ lines, previous }: FinishingOrderArgs): FinishingOrderUpdate[] {
  const line = lines.find((candidate) => candidate?.matchUpId === previous?.matchUpId);
  if (!line) return [];
  const collection = lines.filter((candidate) => candidate?.collectionId === line.collectionId);
  const others = collection.filter((candidate) => candidate.matchUpId !== line.matchUpId);

  const counts = countsForFinishingOrder(line);
  const counted = countsForFinishingOrder(previous) && previous?.orderOfFinish !== undefined;

  if (counts && !counted) return appendLine({ line, others, collection });
  // read from before the write: the write itself may already have removed the line's number
  if (!counts && previous?.orderOfFinish !== undefined) return removeLine({ line: previous, others });
  return [];
}

/** The lines of the dual a line belongs to (searching group structures too); none when it is not a dual's line. */
export function getDualLines({ drawDefinition, matchUpId }: { drawDefinition?: DrawDefinition; matchUpId: string }) {
  const structures = (drawDefinition?.structures ?? []).flatMap((structure) => [
    structure,
    ...(structuresOf(structure) ?? []),
  ]);
  for (const structure of structures) {
    const dual = (matchUpsOf(structure) ?? []).find((matchUp) =>
      matchUp.tieMatchUps?.some((line) => line.matchUpId === matchUpId),
    );
    if (dual) return { dual, lines: dual.tieMatchUps ?? [] };
  }
  return { dual: undefined, lines: [] };
}

type CohortArgs = { line: Line; others: Line[]; collection: Line[] };

function appendLine({ line, others, collection }: CohortArgs): FinishingOrderUpdate[] {
  const cannotCount = collection.filter(
    (candidate) =>
      !!candidate.matchUpStatus &&
      completedMatchUpStatuses.includes(candidate.matchUpStatus) &&
      !countsForFinishingOrder(candidate),
  ).length;
  const cap = collection.length - cannotCount;
  const numbered = others.filter((candidate) => countsForFinishingOrder(candidate) && !!candidate.orderOfFinish);
  const numberOf = (candidate: Line) => candidate.orderOfFinish ?? 0;
  const next = Math.max(0, ...numbered.map(numberOf)) + 1;

  if (next <= cap) return [{ matchUpId: line.matchUpId, orderOfFinish: next }];

  // a gap (an older record): renumber the others 1..n in their order, then this line after them
  const ordered = [...numbered].sort(
    (a, b) => numberOf(a) - numberOf(b) || (a.collectionPosition ?? 0) - (b.collectionPosition ?? 0),
  );
  const updates: FinishingOrderUpdate[] = ordered
    .map(({ matchUpId, orderOfFinish }, index) => ({ matchUpId, orderOfFinish: index + 1, previous: orderOfFinish }))
    .filter(({ orderOfFinish, previous }) => orderOfFinish !== previous)
    .map(({ matchUpId, orderOfFinish }) => ({ matchUpId, orderOfFinish }));
  return [...updates, { matchUpId: line.matchUpId, orderOfFinish: ordered.length + 1 }];
}

function removeLine({ line, others }: Omit<CohortArgs, 'collection'>): FinishingOrderUpdate[] {
  const removed = line.orderOfFinish ?? 0;
  const shifted = others
    .filter((candidate) => (candidate.orderOfFinish ?? 0) > removed)
    .map(({ matchUpId, orderOfFinish = 0 }) => ({ matchUpId, orderOfFinish: orderOfFinish - 1 }));
  return [{ matchUpId: line.matchUpId }, ...shifted];
}
