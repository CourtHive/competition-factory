/*
 * Flights are created by splitting event entries into groups.
 * The following split methods are supported.
 * In all cases event.entries are first sorted by some scaleValue.
 * scaleValue is derived from rankings or ratings or seedings.
 */
export const SPLIT_LEVEL_BASED = 'splitLevelBased'; // Evenly chunk sorted entries
export const SPLIT_WATERFALL = 'splitWaterfall'; // 1,2,3,4,1,2,3,4,1,2,3,4,1,2,3,4
export const SPLIT_SHUTTLE = 'splitShuttle'; // 1,2,3,4,4,3,2,1,1,2,3,4,4,3,2,1

export const flightConstants = {
  SPLIT_LEVEL_BASED,
  SPLIT_WATERFALL,
  SPLIT_SHUTTLE,
} as const;
