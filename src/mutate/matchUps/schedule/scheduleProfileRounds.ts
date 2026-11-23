import { scheduleProfileVNext } from './pipeline/scheduleProfile';

// constants and types
import { TournamentRecords } from '@Types/factoryTypes';

type ScheduleProfileRoundsArgs = {
  checkPotentialRequestConflicts?: boolean;
  /** schedule rounds on dates their event does not play, and warn (EVENT_DATE_INACTIVE), rather than skip them */
  allowInactiveEventDates?: boolean;
  tournamentRecords: TournamentRecords;
  /**
   * @deprecated ignored: completed matchUps are never scheduled (CA 2026-10-23). Removed in 8.0.0.
   */
  scheduleCompletedMatchUps?: boolean;
  excludeNoDateCompleted?: boolean;
  clearScheduleDates?: boolean | string[];
  excludePriorDates?: boolean;
  scheduleDates?: string[];
  periodLength?: number;
  /**
   * @deprecated ignored: it was read only by the `pro` scheduler, removed (CA 2026-10-28). Removed in 8.0.0.
   */
  useGarman?: boolean;
  courtIds?: string[];
  /** this run's daily limits in place of the records' (a what-if, never stored); `{}` enforces none */
  matchUpDailyLimits?: { [matchUpType: string]: number };
  dryRun?: boolean;
  /**
   * @deprecated ignored: the court-and-time scheduler it selected is removed (CA 2026-10-28); every call takes the
   * profile scheduler. Removed in 8.0.0.
   */
  pro?: boolean;
};

/** The profile scheduler: the scheduling pipeline's view → plan → write (`pipeline/`, scheduling-pipeline.md § 4). */
export function scheduleProfileRounds(params: ScheduleProfileRoundsArgs) {
  return scheduleProfileVNext(params);
}
