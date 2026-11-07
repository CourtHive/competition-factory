/**
 * THE POSITIONAL GOVERNOR FUNCTIONS THAT ARE ALLOWED TO REMAIN, AND WHERE EACH IS GOING.
 *
 * A governor export becomes an engine method, and an engine calls every method with one params object. A function
 * written with positional parameters (`validateMatchUpScore(sets, matchUpFormat)`) gets that object as its first
 * argument and loses the rest, so it cannot be called correctly through an engine. Such a function is a tool: it
 * belongs in `tools` (by domain), or on the standalone `availability` export, not in a governor (CA 2026-11-07).
 *
 * This list is a RATCHET. `positionalGovernorFunctions.test.ts` fails on a positional function that is not listed
 * here (export it from `tools` instead) and on an entry that is no longer positional or no longer in a governor
 * (remove it). The list only shrinks, and at 8.0.0 it is empty. Grouped by destination:
 * Mentat `planning/FACTORY_8_0_0_REPOSITORY_AND_DELIVERY_PLAN.md` § Engine surface and method kinds.
 */
export const POSITIONAL_GOVERNOR_FUNCTIONS = {
  /** already exported from the standalone `availability` namespace; leave the engines at 8.0.0 */
  availability: [
    'buildDayRange',
    'buildEdges',
    'buildSchedulingProfileFromUISelections',
    'calculateCapacityStats',
    'calculateCourtHours',
    'clampDragToCollisions',
    'clampToDayRange',
    'compareCapacityCurves',
    'computePlanItemId',
    'courtDayKey',
    'courtKey',
    'createFollowByEvaluator',
    'deriveRailSegments',
    'diffMinutes',
    'extractDay',
    'filterCapacityCurve',
    'findBlocksContainingTime',
    'formatConflicts',
    'generateCapacityCurve',
    'getHighestSeverity',
    'groupConflictsBySeverity',
    'hhmmToMinutes',
    'intervalsOverlap',
    'iterateDayTicks',
    'mergeAdjacentSegments',
    'mergeOverlappingAvailability',
    'minutesToHhmm',
    'overlappingRange',
    'railsToDateAvailability',
    'rangesOverlap',
    'resolveCourtId',
    'resolveStatus',
    'resolveVenueId',
    'sampleCapacityCurve',
    'snapIsoToGranularity',
    'snapToGranularity',
    'sortBlocksByStart',
    'sortEdges',
    'timeInsideBlock',
    'validateDateAvailability',
    'validateSchedulingProfileFormat',
    'validateSegments',
    'venueDayKey',
    'venueKey',
  ],
  /** `tools.formats` (the `formats` package); the score governor holds copies of `parse` / `stringify` */
  formats: [
    'aggregateDeciderSetNumber',
    'finalSetGoverns',
    'isAggregateFormat',
    'parse',
    'parseMatchUpFormat',
    'stringify',
    'stringifyMatchUpFormat',
  ],
  /** `tools.scoring` (the `scoring` package) */
  scoring: [
    'addPoint',
    'analyzeSequence',
    'calculateMatchStatistics',
    'calculatePointsTo',
    'deduceMatchUpFormat',
    'enrichPointHistory',
    'exportMatchUpJSON',
    'getEpisodes',
    'getQuickStats',
    'getScore',
    'getScoreboard',
    'getSetScoreString',
    'getWinner',
    'groupByMatch',
    'inferServeSide',
    'isComplete',
    'parseCSV',
    'parseMCPPoint',
    'pointParser',
    'resolvePointValue',
    'shotParser',
    'shotSplitter',
    'toStatObjects',
    'validateMCPMatch',
    'validateMatchUpScore',
    'validateSetScore',
  ],
  /** `tools.publishing`: predicates over a publish detail the caller holds, each taking `asOf` */
  publishing: ['getRoundVisibilityState', 'isEmbargoed', 'isVisiblyPublished'],
  /** `tools.entries`: fee helpers over fee values */
  entries: ['getEntryFeeRange', 'isIndeterminateFee', 'resolveEntryFee'],
  /** `tools.draws`: draw-type predicates */
  draws: ['isAdHocType', 'isLadder'],
  /** `tools.matchUps`: matchUp shape validators (the `contracts` package at 8.0.0) */
  matchUps: ['validMatchUp', 'validMatchUps'],
  /** retired at 8.0.0: takes a whole record, so neither tool nor query; use the `getPublishState` query */
  retiring: ['isTournamentPublished'],
} as const satisfies Record<string, readonly string[]>;
