import { chunkArray, generateRange, groupConsecutiveNumbers, unique } from '@Tools/arrays';
import { requireParams } from '@Helpers/parameters/requireParams';
import { getMappedStructureMatchUps } from './getMatchUpsMap';
import { getRoundMatchUps } from './getRoundMatchUps';
import { getRangeString } from './getRangeString';
import { numericSort } from '@Tools/sorting';

// constants and types
import { DRAW_DEFINITION, STRUCTURE_ID } from '@Constants/attributeConstants';
import { MISSING_VALUE } from '@Constants/errorConditionConstants';
import { RoundProfile, MatchUpsMap } from '@Types/factoryTypes';
import { DrawDefinition } from '@Types/tournamentTypes';

type GetDrawPositionRangesArgs = {
  drawDefinition: DrawDefinition;
  roundProfile?: RoundProfile;
  matchUpsMap: MatchUpsMap;
  structureId: string;
};
export function getDrawPositionsRanges({
  drawDefinition,
  roundProfile,
  structureId,
  matchUpsMap,
}: GetDrawPositionRangesArgs): any {
  const paramsCheck = requireParams({ drawDefinition, structureId }, [DRAW_DEFINITION, STRUCTURE_ID]);
  if (paramsCheck.error) return paramsCheck;

  if (!roundProfile) {
    const structureMatchUps = getMappedStructureMatchUps({
      matchUpsMap,
      structureId,
    });
    ({ roundProfile } = getRoundMatchUps({
      matchUps: structureMatchUps,
    }));

    if (!roundProfile) return { error: MISSING_VALUE };
  }

  const firstRoundFirstDrawPosition = Math.min(...(roundProfile?.[1]?.drawPositions ?? []));
  const firstRoundFirstDrawPositionOffset = (firstRoundFirstDrawPosition || 1) - 1;

  const roundNumbers = Object.keys(roundProfile);
  const drawPositionsRanges = Object.assign(
    {},
    ...(roundNumbers ?? []).map((roundNumber) => {
      const matchUpsCount = roundProfile?.[roundNumber]?.matchUpsCount;
      const firstRoundDrawPositions = roundProfile?.[1]?.drawPositions ?? [];
      const firstRoundDrawPositionsChunks = chunkArray(
        firstRoundDrawPositions,
        firstRoundDrawPositions.length / matchUpsCount,
      );
      const firstRoundDrawPositionsRanges = firstRoundDrawPositionsChunks.map(getRangeString);
      const firstRoundOffsetDrawPositionsRanges = firstRoundDrawPositionsChunks
        .map((drawPositions) => {
          return drawPositions.map((drawPosition) => drawPosition - firstRoundFirstDrawPositionOffset);
        })
        .map(getRangeString);

      const currentRoundDrawPositionChunks = roundNumbers
        .map((value) => {
          if (value > roundNumber) return undefined;
          const drawPositions = roundProfile?.[value]?.drawPositions ?? [];
          return chunkArray(drawPositions, drawPositions.length / matchUpsCount);
        })
        .filter(Boolean);

      const possibleDrawPositions = generateRange(0, matchUpsCount)
        .map((index) => {
          return currentRoundDrawPositionChunks
            .map((chunk) => chunk[index])
            .flat()
            .filter(Boolean)
            .sort(numericSort);
        })
        .map((possible) => unique(possible));

      const drawPositionsRanges = possibleDrawPositions.map((possible) => {
        return groupConsecutiveNumbers(possible).map(getRangeString).join(', ');
      });

      const roundPositionsMap = Object.assign(
        {},
        ...generateRange(0, matchUpsCount).map((index) => {
          const roundPosition = index + 1;
          return {
            [roundPosition]: {
              firstRoundDrawPositionsRange: firstRoundDrawPositionsRanges[index],
              firstRoundOffsetDrawPositionsRange: firstRoundOffsetDrawPositionsRanges[index],
              possibleDrawPositions: possibleDrawPositions[index],
              drawPositionsRange: drawPositionsRanges[index],
            },
          };
        }),
      );

      return { [roundNumber]: roundPositionsMap };
    }),
  );

  return { drawPositionsRanges };
}
