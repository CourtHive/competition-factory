import { numericSort } from '@Tools/sorting';

/**
 * ensures that a matchUp has 2 and only 2 drawPositions
 * Checks to see whether drawPosition is already present in drawPositions
 * Does NOT allow a position to be assigned if there are already 2 drawPositions
 */
type GetUpdateDrawPositions = {
  drawPositions: number[];
  drawPosition: number;
};
export function getUpdatedDrawPositions({ drawPosition, drawPositions }: GetUpdateDrawPositions): {
  updatedDrawPositions: number[];
  positionAssigned: boolean;
  positionAdded: boolean;
} {
  let positionAdded = false;
  let positionAssigned = !!drawPositions?.includes(drawPosition);
  const updated = positionAssigned
    ? drawPositions ?? []
    : [...drawPositions, undefined, undefined]
        .slice(0, 2) // accounts for empty array, should always have length 2
        .map((position) => {
          if (!position && !positionAssigned) {
            positionAssigned = true;
            positionAdded = true;
            return drawPosition;
          } else {
            return position;
          }
        })
        .sort(numericSort)
        .filter(Boolean);
  const updatedDrawPositions = updated as number[];

  return { updatedDrawPositions, positionAdded, positionAssigned };
}
