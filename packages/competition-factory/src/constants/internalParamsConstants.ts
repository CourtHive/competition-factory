// the BYE writer's own params: draw state the engine's placements hand it, the propagation declaration, and the two
// flags that tell it a check was already asked (skipping the activity check a public placement must make)
export const BYE_WRITER_PARAMS = [
  'structure',
  'matchUpsMap',
  'inContextDrawMatchUps',
  'loserMatchUp',
  'byeFromPropagation',
  'drawPositionsInactive',
  'activityAsked',
] as const;

/**
 * PUBLIC METHODS TAKE IDS, NOT RESOLVED STATE. Each entry is a param the factory's own callers hand a method to say a
 * check was already made, or to supply state the method would otherwise resolve itself: passed by a caller, it skips a
 * check the method makes before writing. An engine call (direct, queued, `invoke`, `ask`, `dryRun`) naming one is
 * refused with INVALID_VALUES, its context naming them, before anything is read or written. The factory's own callers
 * call the functions directly and are not refused.
 */
export const INTERNAL_PARAMS: Readonly<Record<string, readonly string[]>> = {
  assignDrawPositionBye: BYE_WRITER_PARAMS,
  addMatchUpScheduleItems: ['playedOrderChecked', 'recordedOrderChecked'],
  addMatchUpScheduledTime: ['playedOrderChecked'],
  addMatchUpScheduledDate: ['playedOrderChecked'],
  bulkScheduleTournamentMatchUps: ['playedOrderChecked'],
  addMatchUpStartTime: ['recordedOrderChecked'],
  addMatchUpEndTime: ['recordedOrderChecked'],
  modifyCourt: ['venueMatchUps'],
  modifyCourtAvailability: ['venueMatchUps'],
  addEvent: ['internalUse'],
  // the write step reused a caller's map and hydration the composition never saw (a foreign one refused after writing)
  automatedPositioning: ['matchUpsMap', 'inContextDrawMatchUps'],
};
