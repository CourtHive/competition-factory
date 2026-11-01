import { countsForFinishingOrder, finishingOrderUpdates } from '@Query/matchUp/finishingOrder';
import { describe, expect, it } from 'vitest';

// constants
import {
  ABANDONED,
  COMPLETED,
  DEAD_RUBBER,
  DEFAULTED,
  DOUBLE_WALKOVER,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

const scored = { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' };
const line = (matchUpId: string, matchUpStatus: string, orderOfFinish?: number, collectionId = 'singles'): any => ({
  ...(orderOfFinish !== undefined && { orderOfFinish }),
  ...(matchUpStatus === COMPLETED && { score: scored }),
  collectionPosition: Number(matchUpId.replace(/\D/g, '')),
  collectionId,
  matchUpStatus,
  matchUpId,
});

describe('which lines count for a finishing number', () => {
  it('only lines played to a result', () => {
    expect(countsForFinishingOrder(line('s1', COMPLETED))).toEqual(true);
    expect(countsForFinishingOrder(line('s1', RETIRED))).toEqual(true);
    expect(countsForFinishingOrder({ matchUpStatus: DEFAULTED, score: scored })).toEqual(true);
    expect(countsForFinishingOrder({ matchUpStatus: DEFAULTED })).toEqual(false);
    [WALKOVER, DOUBLE_WALKOVER, DEAD_RUBBER, ABANDONED, TO_BE_PLAYED].forEach((matchUpStatus) =>
      expect(countsForFinishingOrder(line('s1', matchUpStatus))).toEqual(false),
    );
  });
});

describe('finishing-order updates', () => {
  it('a line that completes finishes after the others', () => {
    const lines = [line('s1', COMPLETED, 1), line('s2', COMPLETED, 2), line('s3', COMPLETED)];
    expect(finishingOrderUpdates({ lines, previous: line('s3', TO_BE_PLAYED) })).toEqual([
      { matchUpId: 's3', orderOfFinish: 3 },
    ]);
  });

  it('is numbered within its own collection', () => {
    const lines = [line('s1', COMPLETED, 1), line('d1', COMPLETED, undefined, 'doubles')];
    expect(finishingOrderUpdates({ lines, previous: line('d1', TO_BE_PLAYED, undefined, 'doubles') })).toEqual([
      { matchUpId: 'd1', orderOfFinish: 1 },
    ]);
  });

  it('a score edit to a counted line keeps its number', () => {
    const lines = [line('s1', COMPLETED, 1), line('s2', COMPLETED, 2)];
    expect(finishingOrderUpdates({ lines, previous: line('s2', COMPLETED, 2) })).toEqual([]);
  });

  it('a line that stops counting loses its number and the later ones move down', () => {
    const lines = [line('s1', TO_BE_PLAYED, 1), line('s2', COMPLETED, 2), line('s3', COMPLETED, 3)];
    expect(finishingOrderUpdates({ lines, previous: line('s1', COMPLETED, 1) })).toEqual([
      { matchUpId: 's1' },
      { matchUpId: 's2', orderOfFinish: 1 },
      { matchUpId: 's3', orderOfFinish: 2 },
    ]);
  });

  it('a walkover takes no number', () => {
    const lines = [line('s1', COMPLETED, 1), line('s2', WALKOVER)];
    expect(finishingOrderUpdates({ lines, previous: line('s2', TO_BE_PLAYED) })).toEqual([]);
  });

  it('never numbers past the lines that can still count; a gap is closed first', () => {
    // an older record left 1 and 3 among two counted lines; with a walkover, only three of four lines can count
    const lines = [line('s1', COMPLETED, 1), line('s2', COMPLETED, 3), line('s3', WALKOVER), line('s4', COMPLETED)];
    expect(finishingOrderUpdates({ lines, previous: line('s4', TO_BE_PLAYED) })).toEqual([
      { matchUpId: 's2', orderOfFinish: 2 },
      { matchUpId: 's4', orderOfFinish: 3 },
    ]);
  });
});
