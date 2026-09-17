import { getModifiedMatchUpFormatTiming } from '@Query/extensions/matchUpFormatTiming/getModifiedMatchUpTiming';
import { modifyMatchUpFormatTiming } from '@Mutate/extensions/matchUps/modifyMatchUpFormatTiming';
import { isValidMatchUpFormat } from '@Validators/isValidMatchUpFormat';
import { requireParams } from '@Helpers/parameters/requireParams';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { Event, Tournament } from '@Types/tournamentTypes';
import { isNumeric } from '@Tools/math';

// constants
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
      pushGlobalLog({ method: 'modifyEventMatchUpFormatTiming', categoryType });
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

  // `isNumeric`, NOT `!isNaN(ensureInt(...))`. `ensureInt` returns **0** for anything that is neither
  // a number nor a numeric string — objects, arrays and booleans included — and `isNaN(0)` is
  // `false`, so the old guard admitted any TRUTHY non-numeric value and stored it VERBATIM. The
  // scheduler then read an object where it expects minutes. Same root cause as the hole-accepting
  // predicate in `getOrderedDrawPositions`: `!isNaN(ensureInt(x))` is not a numeric test.
  const validAverageMinutes = isNumeric(averageMinutes);
  const validRecoveryMinutes = isNumeric(recoveryMinutes);

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
    // `undefined`, not `false`, when there is nothing to write: the receiver reads these with
    // `?? []`, which only replaces null/undefined — a `false` survives and `false.filter` throws.
    // The previous guard produced `undefined` only by accident, as the short-circuit of
    // `minutes && …`; saying so explicitly removes the dependency on that accident.
    averageTimes: validAverageMinutes ? newAverageTimes : undefined,
    recoveryTimes: validRecoveryMinutes ? newRecoveryTimes : undefined,
    tournamentRecord,
    matchUpFormat,
    eventId,
    event,
  });
}
