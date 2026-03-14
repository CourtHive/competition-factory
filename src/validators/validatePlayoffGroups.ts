import { numericSort } from '@Tools/sorting';

// constants
import { INVALID_VALUES, INVALID_CONFIGURATION } from '@Constants/errorConditionConstants';
import { ResultType } from '@Types/factoryTypes';

export type PlayoffGroupConfig = {
  structureOptions?: { groupSize?: number };
  addNameBaseToAttributeName?: boolean;
  playoffStructureNameBase?: string;
  finishingPositionLimit?: number;
  finishingPositionNaming?: any;
  finishingPositions?: number[];
  playoffAttributes?: any;
  structureNameMap?: any;
  sequenceLimit?: number;
  structureName?: string;
  structureId?: string;
  remainder?: boolean;
  drawType?: string;
  bestOf?: number;
  rankBy?: string;
};

type ValidatePlayoffGroupsArgs = {
  playoffGroups: PlayoffGroupConfig[];
  groupCount: number;
  groupSize: number;
};

/**
 * Validates playoffGroups configuration, including bestOf consumption tracking.
 *
 * Rules:
 * 1. Each playoffGroup must have a non-empty finishingPositions array
 * 2. finishingPositions values must be in range [1, groupSize]
 * 3. If bestOf is specified:
 *    a. bestOf must be >= groupCount * finishingPositions.length (can't request fewer than guaranteed)
 *    b. bestOf must be <= groupCount * groupSize (can't request more than total participants)
 *    c. bestOf must be > 0
 * 4. Cross-group consumption: after accounting for all bestOf claims on partially-consumed
 *    finishing positions, no standard (non-bestOf) playoff group should end up with
 *    fewer than 2 participants
 * 5. Total participants claimed across all playoff groups cannot exceed groupCount * groupSize
 */

export function validatePlayoffGroups({
  playoffGroups,
  groupCount,
  groupSize,
}: ValidatePlayoffGroupsArgs): ResultType & {
  valid?: boolean;
  consumptionMap?: { [finishingPosition: number]: number };
  info?: string;
} {
  if (!Array.isArray(playoffGroups) || !playoffGroups.length) {
    return { error: INVALID_VALUES, valid: false, info: 'playoffGroups must be a non-empty array' };
  }
  if (!groupCount || groupCount < 1) {
    return { error: INVALID_VALUES, valid: false, info: 'groupCount must be >= 1' };
  }
  if (!groupSize || groupSize < 1) {
    return { error: INVALID_VALUES, valid: false, info: 'groupSize must be >= 1' };
  }

  // Track how many participants are consumed from each finishing position across all groups
  // Each finishing position has exactly `groupCount` participants available
  const consumptionMap: { [finishingPosition: number]: number } = {};
  for (let pos = 1; pos <= groupSize; pos++) {
    consumptionMap[pos] = 0;
  }

  const totalAvailable = groupCount * groupSize;
  let totalClaimed = 0;

  let hasBestOf = false;

  for (const playoffGroup of playoffGroups) {
    const { finishingPositions, bestOf, rankBy, remainder } = playoffGroup;

    // Handle remainder groups
    if (remainder) {
      if (!hasBestOf) {
        return {
          error: INVALID_CONFIGURATION,
          valid: false,
          info: 'A remainder group must appear after at least one bestOf group',
        };
      }
      // Remainder group claims all unclaimed participants
      const remainderCount = totalAvailable - totalClaimed;
      if (remainderCount < 2) {
        return {
          error: INVALID_CONFIGURATION,
          valid: false,
          info: `Remainder group would have insufficient participants (${remainderCount}), minimum 2 required`,
        };
      }
      totalClaimed += remainderCount;
      continue;
    }

    // Basic validation
    if (!Array.isArray(finishingPositions) || !finishingPositions.length) {
      return { error: INVALID_VALUES, valid: false, info: 'Each playoffGroup must have non-empty finishingPositions' };
    }

    // Validate positions are in range
    for (const pos of finishingPositions) {
      if (pos < 1 || pos > groupSize) {
        return {
          error: INVALID_VALUES,
          valid: false,
          info: `finishingPosition ${pos} out of range [1, ${groupSize}]`,
        };
      }
    }

    const guaranteedCount = groupCount * finishingPositions.length;

    if (bestOf === undefined) {
      // Standard playoff group: consumes all participants at specified positions
      for (const pos of finishingPositions) {
        const available = groupCount - consumptionMap[pos];
        if (available < 2) {
          return {
            error: INVALID_CONFIGURATION,
            valid: false,
            info: `finishingPosition ${pos} has insufficient remaining participants (${available}) for a standard playoff group (minimum 2 required)`,
          };
        }
        consumptionMap[pos] += available; // consumes all remaining at this position
      }

      totalClaimed += guaranteedCount;
    } else {
      // bestOf-specific validation
      if (typeof bestOf !== 'number' || bestOf < 1) {
        return { error: INVALID_VALUES, valid: false, info: 'bestOf must be a positive number' };
      }
      if (bestOf < guaranteedCount) {
        return {
          info: `bestOf (${bestOf}) cannot be less than guaranteed count (${guaranteedCount}) for finishingPositions [${finishingPositions}] with ${groupCount} groups`,
          error: INVALID_CONFIGURATION,
          valid: false,
        };
      }
      if (bestOf > totalAvailable) {
        return {
          info: `bestOf (${bestOf}) exceeds total available participants (${totalAvailable})`,
          error: INVALID_CONFIGURATION,
          valid: false,
        };
      }

      hasBestOf = true;

      // rankBy validation
      if (rankBy !== undefined && rankBy !== 'GEMscore') {
        return {
          info: `Unsupported rankBy value: '${rankBy}'. Currently only 'GEMscore' is supported.`,
          error: INVALID_VALUES,
          valid: false,
        };
      }

      // Calculate consumption: guaranteed positions are fully consumed,
      // then additional positions are partially consumed
      for (const pos of finishingPositions) {
        consumptionMap[pos] += groupCount; // fully consumed
      }

      const remainder = bestOf - guaranteedCount;
      if (remainder > 0) {
        // Fill from next finishing positions in order
        let remaining = remainder;
        const sortedPositions = [...finishingPositions].sort(numericSort);
        let nextPos = Math.max(...sortedPositions) + 1;

        while (remaining > 0 && nextPos <= groupSize) {
          const available = groupCount - consumptionMap[nextPos];
          const take = Math.min(remaining, available);
          consumptionMap[nextPos] += take;
          remaining -= take;
          nextPos++;
        }

        if (remaining > 0) {
          return {
            info: `bestOf (${bestOf}) requires more participants than available from remaining finishing positions`,
            error: INVALID_CONFIGURATION,
            valid: false,
          };
        }
      }

      totalClaimed += bestOf;
    }
  }

  if (totalClaimed > totalAvailable) {
    return {
      info: `Total claimed participants (${totalClaimed}) exceeds available (${totalAvailable})`,
      error: INVALID_CONFIGURATION,
      valid: false,
    };
  }

  return { valid: true, consumptionMap };
}
