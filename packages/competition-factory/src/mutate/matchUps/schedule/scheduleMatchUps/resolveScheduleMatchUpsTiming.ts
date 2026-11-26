import { getScheduleTiming } from '@Query/extensions/matchUpFormatTiming/getScheduleTiming';
import { findMatchUpFormatTiming } from '@Acquire/findMatchUpFormatTiming';
import { timingCategoryType } from '@Query/event/timingCategoryType';
import { timingCategoryName } from '@Query/event/timingCategoryName';
import { findEvent } from '@Acquire/findEvent';

// constants and types
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
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
function statesTiming(tournamentRecord?: Tournament, event?: Event, drawDefinition?: DrawDefinition): boolean {
  if (!tournamentRecord) return false;
  const { scheduleTiming } = getScheduleTiming({ tournamentRecord, drawDefinition, event });
  return !!(scheduleTiming.policy || scheduleTiming.tournamentScheduling || scheduleTiming.eventScheduling);
}

/**
 * The minutes `scheduleMatchUps` schedules with. Minutes the caller states win, as they always did. When the caller
 * states none, a timing found in the tournament or the matchUp's event decides: each matchUp's recovery comes from
 * its own format and event, and the slots are
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
    const { tournamentId, eventId, drawId, matchUpFormat, matchUpId } = matchUp;
    const tournamentRecord = tournamentId ? tournamentRecords[tournamentId] : undefined;
    const found =
      tournamentRecord && (eventId || drawId) ? findEvent({ tournamentRecord, eventId, drawId }) : undefined;
    const event = found?.event;
    if (!matchUpFormat || !tournamentId || !statesTiming(tournamentRecord, event, found?.drawDefinition)) continue;
    const category = event?.category;
    const timing = findMatchUpFormatTiming({
      categoryName: timingCategoryName(event),
      categoryType: timingCategoryType(category),
      // a line is timed by its own type, never by its TEAM event's
      eventType: matchUp.matchUpType ?? event?.eventType,
      tournamentRecords,
      matchUpFormat,
      tournamentId,
      eventId,
      drawId,
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
