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

/**
 * Computed ranges, keyed by the only inputs the computation reads: each round's number, `matchUpsCount` and
 * `drawPositions` (see `shapeKey`). The same key always gives the same ranges, so a hit is exact, not approximate.
 *
 * WHY: every hydration of a structure recomputed them, and one `setMatchUpStatus` hydrates the whole draw six to eight
 * times (Mentat reports/2026-10-18-completion-cost-profile.md): ~35% of a hydration with the round profile, for a
 * draw whose shape the call does not change. A result moves one drawPosition into a later round, so a call misses
 * once and its other hydrations hit.
 *
 * Module-level because those hydrations are separate calls with nothing else in common. It holds numbers only, so
 * sharing it across requests is safe. Stored and returned as COPIES: each hydrated matchUp carries its round's
 * entry, `possibleDrawPositions` included, and a consumer mutating one must not change the next hydration.
 */
const RANGES_CACHE_LIMIT = 256;
const rangesCache = new Map<string, any>();

function shapeKey(roundProfile: RoundProfile): string {
  return Object.keys(roundProfile)
    .map((roundNumber) => {
      const { matchUpsCount, drawPositions } = roundProfile[roundNumber] ?? {};
      return `${roundNumber}:${matchUpsCount}:${(drawPositions ?? []).join(',')}`;
    })
    .join('|');
}

/** For tests: start from a cold cache. */
export function clearDrawPositionsRangesCache() {
  rangesCache.clear();
}

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

  const key = shapeKey(roundProfile);
  const cached = rangesCache.get(key);
  if (cached) return { drawPositionsRanges: structuredClone(cached) };

  const drawPositionsRanges = computeDrawPositionsRanges(roundProfile);
  if (rangesCache.size >= RANGES_CACHE_LIMIT) rangesCache.delete(rangesCache.keys().next().value as string);
  rangesCache.set(key, structuredClone(drawPositionsRanges));

  return { drawPositionsRanges };
}

function computeDrawPositionsRanges(roundProfile: RoundProfile) {
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

  return drawPositionsRanges;
}
