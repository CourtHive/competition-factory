import { isConvertableInteger } from '@Tools/math';
import { isObject } from '@Tools/objects';

export function validMatchUp(matchUp) {
  if (!isObject(matchUp)) return false;
  const { matchUpId, drawPositions } = matchUp;
  const validMatchUpId = typeof matchUpId === 'string';
  const validDrawPositions =
    !drawPositions ||
    (Array.isArray(drawPositions) &&
      drawPositions.length <= 2 &&
      drawPositions.every((dp) => isConvertableInteger(dp) || dp === undefined || dp === null));

  return validMatchUpId && validDrawPositions;
}

export function validMatchUps(matchUps) {
  if (!Array.isArray(matchUps)) return false;
  return matchUps.every(validMatchUp);
}
