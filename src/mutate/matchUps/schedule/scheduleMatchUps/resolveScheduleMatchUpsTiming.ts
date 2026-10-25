import { getScheduleTiming } from '@Query/extensions/matchUpFormatTiming/getScheduleTiming';
import { findMatchUpFormatTiming } from '@Acquire/findMatchUpFormatTiming';
import { timingCategoryType } from '@Query/event/timingCategoryType';
import { findEvent } from '@Acquire/findEvent';

// constants and types
import { Event, Tournament } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';

const LEGACY_AVERAGE_MINUTES = 90;
const LEGACY_RECOVERY_MINUTES = 0;

type ResolveScheduleMatchUpsTimingArgs = {
  tournamentRecords: { [key: string]: Tournament };
  recoveryMinutesMap?: { [matchUpId: string]: number };
  averageMatchUpMinutes?: number;
  matchUps: HydratedMatchUp[];
  recoveryMinutes?: number;
};

/** the tournament or the event states timing: an attached scheduling policy, `scheduling.timing`, or SCHEDULE_TIMING */
function statesTiming(tournamentRecord?: Tournament, event?: Event): boolean {
  if (!tournamentRecord) return false;
  const { scheduleTiming } = getScheduleTiming({ tournamentRecord, event });
  return !!(scheduleTiming.policy || scheduleTiming.tournamentScheduling || scheduleTiming.eventScheduling);
}

/**
 * The minutes `scheduleMatchUps` schedules with. Minutes the caller states win, as they always did. When the caller
 * states none, a timing found in the tournament or the matchUp's event decides (Q1, CA 2026-10-22,
 * SCHEDULING_PIPELINE_VNEXT.md § 5): each matchUp's recovery comes from its own format and event, and the slots are
 * sized by the greatest average among them, as the profile scheduler sizes them. With neither, the legacy 90 minutes
 * and no recovery stand, so a tournament that never stated timing schedules exactly as before.
 */
export function resolveScheduleMatchUpsTiming({
  averageMatchUpMinutes,
  recoveryMinutesMap,
  tournamentRecords,
  recoveryMinutes,
  matchUps,
}: ResolveScheduleMatchUpsTimingArgs) {
  const stated = [averageMatchUpMinutes, recoveryMinutes, recoveryMinutesMap].some((value) => value !== undefined);
  const legacy = {
    averageMatchUpMinutes: averageMatchUpMinutes ?? LEGACY_AVERAGE_MINUTES,
    recoveryMinutes: recoveryMinutes ?? LEGACY_RECOVERY_MINUTES,
    recoveryMinutesMap,
  };
  if (stated) return legacy;

  const resolvedRecoveryMinutes: { [matchUpId: string]: number } = {};
  let greatestAverageMinutes = 0;
  for (const matchUp of matchUps) {
    const { tournamentId, eventId, matchUpFormat, matchUpId } = matchUp;
    const tournamentRecord = tournamentId ? tournamentRecords[tournamentId] : undefined;
    const event = tournamentRecord && eventId ? findEvent({ tournamentRecord, eventId }).event : undefined;
    if (!matchUpFormat || !tournamentId || !statesTiming(tournamentRecord, event)) continue;
    const category = event?.category;
    const timing = findMatchUpFormatTiming({
      categoryName: category?.categoryName ?? category?.ageCategoryCode,
      categoryType: timingCategoryType(category),
      eventType: event?.eventType,
      tournamentRecords,
      matchUpFormat,
      tournamentId,
      eventId,
    });
    if ('error' in timing) continue;
    resolvedRecoveryMinutes[matchUpId] = timing.recoveryMinutes ?? LEGACY_RECOVERY_MINUTES;
    greatestAverageMinutes = Math.max(greatestAverageMinutes, timing.averageMinutes ?? 0);
  }

  if (!Object.keys(resolvedRecoveryMinutes).length) return legacy;
  return {
    averageMatchUpMinutes: greatestAverageMinutes || LEGACY_AVERAGE_MINUTES,
    recoveryMinutesMap: resolvedRecoveryMinutes,
    recoveryMinutes: LEGACY_RECOVERY_MINUTES,
  };
}
