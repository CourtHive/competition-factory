import { getModifiedMatchUpFormatTiming } from '@Query/extensions/matchUpFormatTiming/getModifiedMatchUpTiming';
import { modifyScheduling } from '@Mutate/extensions/matchUps/modifyMatchUpFormatTiming';
import { isWellFormedMatchUpFormat } from '@Validators/isValidMatchUpFormat';
import { timingCategoryName } from '@Query/event/timingCategoryName';
import { modifyEventNotice } from '@Mutate/notifications/eventNotifications';
import { planFieldWrite } from '@Mutate/planCommit';
import { findExtension } from '@Helpers/extensions/findExtension';
import { nowIso } from '@Tools/clock';
import { requireParams } from '@Helpers/parameters/requireParams';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { Event, Tournament, TournamentScheduleTiming } from '@Types/tournamentTypes';
import { isNumeric } from '@Tools/math';

import type {
  ResultType,
  SchedulingCategoryTimes,
  SchedulingFormatAverageTimes,
  SchedulingFormatRecoveryTimes,
  SchedulingMinutes,
} from '@Types/factoryTypes';

// constants
import { SCHEDULE_TIMING } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { TOURNAMENT_RECORD, EVENT } from '@Constants/attributeConstants';
import { EVENT_NOT_FOUND, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SINGLES } from '@Constants/matchUpTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';

type ModifyEventMatchUpFormatTimingArgs = {
  tournamentRecord: Tournament;
  recoveryMinutes?: number;
  averageMinutes?: number;
  matchUpFormat: string;
  categoryType?: string;
  tournamentId?: string;
  eventId: string;
  event?: Event;
};

export function modifyEventMatchUpFormatTiming(params: ModifyEventMatchUpFormatTimingArgs) {
  const plan = planEventTiming(params);
  if (!('commit' in plan)) return plan;
  plan.commit();
  modifyEventNotice({ tournamentId: params.tournamentRecord.tournamentId, event: plan.event });
  return { ...SUCCESS };
}

function planEventTiming(
  params: ModifyEventMatchUpFormatTimingArgs,
): ResultType | { event: Event; commit: () => void } {
  const { tournamentRecord, recoveryMinutes, averageMinutes, matchUpFormat, categoryType, eventId } = params;
  const paramsCheck = requireParams({ tournamentRecord }, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;
  if (!isWellFormedMatchUpFormat({ matchUpFormat })) return { error: INVALID_VALUES };

  const eventCheck = requireParams({ event: params.event }, [EVENT]);
  if (eventCheck.error) return eventCheck;
  const validAverageMinutes = isNumeric(averageMinutes);
  const validRecoveryMinutes = isNumeric(recoveryMinutes);
  if (!validAverageMinutes && !validRecoveryMinutes) return { error: INVALID_VALUES };

  const event = tournamentRecord.events?.find((item) => item.eventId === (eventId ?? params.event?.eventId));
  if (!event) return { error: EVENT_NOT_FOUND };

  const { extension } = findExtension<TournamentScheduleTiming>({ element: event, name: SCHEDULE_TIMING });
  const { averageTimes = [], recoveryTimes = [] } = getModifiedMatchUpFormatTiming({
    tournamentRecord,
    matchUpFormat,
    event,
  });
  const categoryName = timingCategoryName(event)!;
  const minutesKey = event.eventType === TEAM_EVENT ? 'default' : event.eventType || SINGLES;

  // Prepare only the format rows used to construct the new event value. In particular, the
  // effective rows may come from tournament defaults via either the first-class or legacy field.
  function prepareTable(source: SchedulingCategoryTimes[], minutes: number | undefined, supplied: boolean) {
    if (!supplied) return { rows: source, updated: undefined };
    let previousMinutes: SchedulingMinutes = {};
    const rows = source.map((row) => {
      if (categoryType && row.categoryTypes?.includes(categoryType))
        pushGlobalLog({ method: 'modifyEventMatchUpFormatTiming', categoryType });
      if (!row.categoryNames?.includes(categoryName)) return { ...row, minutes: { ...row.minutes } };
      previousMinutes = row.minutes;
      return {
        ...row,
        minutes: { ...row.minutes },
        categoryNames: row.categoryNames.filter((name) => name !== categoryName),
      };
    });
    const updated = rows.filter((row) => row.categoryNames?.length);
    updated.push({ categoryNames: [categoryName], minutes: { ...previousMinutes, [minutesKey]: minutes } });
    return { rows, updated };
  }

  const average = prepareTable(averageTimes, averageMinutes, validAverageMinutes);
  const recovery = prepareTable(recoveryTimes, recoveryMinutes, validRecoveryMinutes);

  // A stored definition may cover several formats. Keep its existing category split on the
  // other formats while installing the override, without ever editing its input rows.
  const scheduling = extension?.value;
  const value = modifyScheduling({
    matchUpAverageTimes: scheduling?.matchUpAverageTimes?.map((group: SchedulingFormatAverageTimes) =>
      group.averageTimes === averageTimes ? { ...group, averageTimes: average.rows } : group,
    ),
    matchUpRecoveryTimes: scheduling?.matchUpRecoveryTimes?.map((group: SchedulingFormatRecoveryTimes) =>
      group.recoveryTimes === recoveryTimes ? { ...group, recoveryTimes: recovery.rows } : group,
    ),
    recoveryTimes: recovery.updated,
    averageTimes: average.updated,
    matchUpFormat,
  });

  if (extension) return { event, commit: planFieldWrite(extension, 'value', value) };
  const entry = { name: SCHEDULE_TIMING, value, createdAt: nowIso() };
  const commit = event.extensions
    ? planFieldWrite(event.extensions, event.extensions.length, entry)
    : planFieldWrite(event, 'extensions', [entry]);
  return { event, commit };
}
