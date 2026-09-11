import { getUTCdateString, dateStringDaysChange } from '@Tools/dateTime';
import { validTimeString } from '@Validators/regex';

import { START_TIME, STOP_TIME, RESUME_TIME, END_TIME, END_DATE, SCHEDULED_DATE } from '@Constants/timeItemConstants';
import { MISSING_MATCHUP, MISSING_TIME_ITEMS } from '@Constants/errorConditionConstants';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysBetween(fromDate, toDate) {
  return Math.round((new Date(toDate).getTime() - new Date(fromDate).getTime()) / MS_PER_DAY);
}

export function matchUpDuration({ matchUp }) {
  if (!matchUp) return { error: MISSING_MATCHUP };
  if (!matchUp.timeItems) return { error: MISSING_TIME_ITEMS };

  // scheduledDate/endDate may be stored first-class (NATIVE writeMode) or as timeItems (legacy)
  const firstClass = matchUp.schedule ?? {};
  const scheduledDate =
    firstClass.scheduledDate ?? matchUp.timeItems.find((timeItem) => timeItem?.itemType === SCHEDULED_DATE)?.itemValue;
  const endDate =
    firstClass.endDate ?? matchUp.timeItems.find((timeItem) => timeItem?.itemType === END_DATE)?.itemValue;

  // Bare HH:MM time items are anchored to a single reference day. When a sparse
  // END_DATE marks a match that crossed midnight, the END_TIME item is anchored
  // that many calendar days later so the series sorts and the duration computes
  // correctly. Absent END_DATE, all items share the reference day (unchanged).
  const refDate = getUTCdateString();
  const endOffsetDays = endDate && scheduledDate ? daysBetween(scheduledDate, endDate) : 0;
  const endRefDate = endOffsetDays ? dateStringDaysChange(refDate, endOffsetDays) : refDate;
  const timeDate = (value, itemType) => {
    if (!validTimeString.test(value)) return new Date(value);
    const dateString = itemType === END_TIME ? endRefDate : refDate;
    return new Date(`${dateString}T${value}`);
  };

  const relevantTimeItems = matchUp.timeItems
    .filter((timeItem) => [START_TIME, STOP_TIME, RESUME_TIME, END_TIME].includes(timeItem?.itemType))
    .sort((a, b) => timeDate(a.itemValue, a.itemType).getTime() - timeDate(b.itemValue, b.itemType).getTime());

  const elapsed = relevantTimeItems.reduce(
    (elapsed, timeItem) => {
      let milliseconds;
      const itemTypeComponents = timeItem?.itemType?.split('.');
      const timeType = timeItem?.itemType?.startsWith('SCHEDULE.TIME') && itemTypeComponents[2];
      const scheduleType = `SCHEDULE.TIME.${timeType}`;
      switch (scheduleType) {
        case START_TIME:
          milliseconds = 0;
          break;
        case END_TIME:
          if (elapsed.lastValue && [START_TIME, RESUME_TIME].includes(elapsed.lastType)) {
            const interval =
              timeDate(timeItem.itemValue, timeItem.itemType).getTime() -
              timeDate(elapsed.lastValue, elapsed.lastType).getTime();
            milliseconds = elapsed.milliseconds + interval;
          } else {
            milliseconds = elapsed.milliseconds;
          }
          break;
        case STOP_TIME:
          if ([START_TIME, RESUME_TIME].includes(elapsed.lastType)) {
            const interval =
              timeDate(timeItem.itemValue, timeItem.itemType).getTime() -
              timeDate(elapsed.lastValue, elapsed.lastType).getTime();
            milliseconds = elapsed.milliseconds + interval;
          } else {
            milliseconds = elapsed.milliseconds;
          }
          break;
        default:
          milliseconds = elapsed.milliseconds;
          break;
      }
      return {
        milliseconds,
        lastType: scheduleType,
        lastValue: timeItem.itemValue,
      };
    },
    { milliseconds: 0, lastType: undefined, lastValue: undefined },
  );

  if ([START_TIME, RESUME_TIME].includes(elapsed.lastType)) {
    const interval = new Date().getTime() - timeDate(elapsed.lastValue, elapsed.lastType).getTime();
    elapsed.milliseconds += interval;
  }

  return {
    milliseconds: elapsed.milliseconds,
    time: msToTime(elapsed.milliseconds),
    relevantTimeItems,
  };
}

function msToTime(s) {
  const pad = (n, z = 2) => ('00' + n).slice(-z);
  return pad((s / 3.6e6) | 0) + ':' + pad(((s % 3.6e6) / 6e4) | 0) + ':' + pad(((s % 6e4) / 1000) | 0);
}
