import { getModifiedMatchUpFormatTiming } from '@Query/extensions/matchUpFormatTiming/getModifiedMatchUpTiming';
import { modifyMatchUpFormatTiming } from '../matchUps/modifyMatchUpFormatTiming';
import { isValidMatchUpFormat } from '@Validators/isValidMatchUpFormat';
import { requireParams } from '@Helpers/parameters/requireParams';
import { Event, Tournament } from '@Types/tournamentTypes';
import { ensureInt } from '@Tools/ensureInt';

import { TOURNAMENT_RECORD, EVENT } from '@Constants/attributeConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SINGLES } from '@Constants/matchUpTypes';

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
  const { tournamentRecord, recoveryMinutes, averageMinutes, matchUpFormat, categoryType, eventId, event } = params;

  const paramsCheck = requireParams({ tournamentRecord }, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;
  if (!isValidMatchUpFormat({ matchUpFormat })) return { error: INVALID_VALUES };

  const eventCheck = requireParams({ event }, [EVENT]);
  if (eventCheck.error) return eventCheck;

  const { averageTimes = [], recoveryTimes = [] } = getModifiedMatchUpFormatTiming({
    tournamentRecord,
    matchUpFormat,
    event: event!,
  });

  const category = event!.category;
  const categoryName = category?.categoryName || category?.ageCategoryCode || event?.eventId;

  let currentAverageTime = { categoryNames: [categoryName], minutes: {} };
  const currentRecoveryTime = { categoryNames: [categoryName], minutes: {} };

  const newTiming = (timing) => {
    if (timing.categoryTypes?.includes(categoryType)) {
      console.log('encountered:', { categoryType });
    }
    if (timing.categoryNames?.includes(categoryName)) {
      timing.categoryNames = timing.categoryNames.filter((c) => c !== categoryName);
      currentAverageTime = {
        minutes: timing.minutes,
        categoryNames: [categoryName],
      };
      if (!timing.categoryNames.length) return;
    }
    return timing;
  };

  const validAverageMinutes = averageMinutes && !isNaN(ensureInt(averageMinutes));
  const validRecoveryMinutes = recoveryMinutes && !isNaN(ensureInt(recoveryMinutes));

  const newAverageTimes = averageTimes.map(newTiming).filter((f) => f?.categoryNames?.length);
  const newRecoveryTimes = recoveryTimes.map(newTiming).filter((f) => f?.categoryNames?.length);

  if (validAverageMinutes) {
    Object.assign(currentAverageTime.minutes, {
      [event?.eventType || SINGLES]: averageMinutes,
    });
    newAverageTimes.push(currentAverageTime);
  }

  if (validRecoveryMinutes) {
    Object.assign(currentRecoveryTime.minutes, {
      [event?.eventType || SINGLES]: recoveryMinutes,
    });
    newRecoveryTimes.push(currentRecoveryTime);
  }

  if (!validAverageMinutes && !validRecoveryMinutes) return { error: INVALID_VALUES };

  return modifyMatchUpFormatTiming({
    averageTimes: validAverageMinutes && newAverageTimes,
    recoveryTimes: validRecoveryMinutes && newRecoveryTimes,
    tournamentRecord,
    matchUpFormat,
    eventId,
    event,
  });
}
