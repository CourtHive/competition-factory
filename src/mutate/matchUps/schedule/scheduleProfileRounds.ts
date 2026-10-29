import { scheduleProfileVNext } from './pipeline/scheduleProfile';

// constants and types
import { TournamentRecords } from '@Types/factoryTypes';

type ScheduleProfileRoundsArgs = {
  checkPotentialRequestConflicts?: boolean;
  tournamentRecords: TournamentRecords;
  /**
   * @deprecated ignored: completed matchUps are never scheduled (CA 2026-10-23). Removed at the next major.
   */
  scheduleCompletedMatchUps?: boolean;
  excludeNoDateCompleted?: boolean;
  clearScheduleDates?: boolean | string[];
  excludePriorDates?: boolean;
  scheduleDates?: string[];
  periodLength?: number;
  /**
   * @deprecated ignored: it was read only by the `pro` scheduler, removed (CA 2026-10-28). Removed at the next major.
   */
  useGarman?: boolean;
  courtIds?: string[];
  dryRun?: boolean;
  /**
   * @deprecated ignored: the court-and-time scheduler it selected is removed (CA 2026-10-28); every call takes the
   * profile scheduler. Removed at the next major.
   */
  pro?: boolean;
};

/** The profile scheduler: the scheduling pipeline's view → plan → write (`pipeline/`, scheduling-pipeline.md § 4). */
export function scheduleProfileRounds(params: ScheduleProfileRoundsArgs) {
  return scheduleProfileVNext(params);
}
