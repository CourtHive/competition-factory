import { getStructureRoundProfile } from '@Query/structure/getStructureRoundProfile';
import { generateRange, unique } from '@Tools/arrays';

export function getFinishingPositionSourceRoundsMap({ finishingPositions, drawDefinition, structureId }) {
  const { roundProfile } = getStructureRoundProfile({
    drawDefinition,
    structureId,
  });

  const roundNumbers = roundProfile && Object.keys(roundProfile);
  return roundNumbers?.reduce((sourceRounds, roundNumber) => {
    const rangeDefinitions = roundValues(roundProfile?.[roundNumber]);
    rangeDefinitions.forEach((rangeDefinition) => {
      finishingPositions.forEach((position) => {
        if (positionIsInRange({ position, rangeDefinition })) {
          sourceRounds[position] = { roundNumber };
        }
      });
    });
    return sourceRounds;
  }, {});
}

export function positionIsInRange({ position, rangeDefinition }) {
  if (!Array.isArray(rangeDefinition)) return false;
  if (rangeDefinition.reduce((includesNonInteger, i) => includesNonInteger || isNaN(i), false)) return false;
  const [min, max] = rangeDefinition;
  const positionsInRange = generateRange(min, (max || min) + 1);
  return positionsInRange.includes(position);
}

// extracts winner and loser rangeDefinitions
export function roundValues(values) {
  return [unique(values?.finishingPositionRange?.loser ?? []), unique(values?.finishingPositionRange?.winner ?? [])];
}

export function roundValueRanges(values) {
  return roundValues(values).map((arr) => generateRange(arr[0], (arr[1] && arr[1] + 1) || arr[0] + 1));
}
