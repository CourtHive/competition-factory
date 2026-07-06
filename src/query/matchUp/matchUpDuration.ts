import { validTimeString } from '@Validators/regex';
import { getUTCdateString } from '@Tools/dateTime';

import { MISSING_MATCHUP, MISSING_TIME_ITEMS } from '@Constants/errorConditionConstants';
import { START_TIME, STOP_TIME, RESUME_TIME, END_TIME } from '@Constants/timeItemConstants';

function timeDate(value) {
  if (validTimeString.test(value)) {
    const dateString = getUTCdateString();
    return new Date(`${dateString}T${value}`);
  } else {
    return new Date(value);
  }
}

export function matchUpDuration({ matchUp }) {
  if (!matchUp) return { error: MISSING_MATCHUP };
  if (!matchUp.timeItems) return { error: MISSING_TIME_ITEMS };

  const relevantTimeItems = matchUp.timeItems
    .filter((timeItem) => [START_TIME, STOP_TIME, RESUME_TIME, END_TIME].includes(timeItem?.itemType))
    .sort((a, b) => timeDate(a.itemValue).getTime() - timeDate(b.itemValue).getTime());

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
            const interval = timeDate(timeItem.itemValue).getTime() - timeDate(elapsed.lastValue).getTime();
            milliseconds = elapsed.milliseconds + interval;
          } else {
            milliseconds = elapsed.milliseconds;
          }
          break;
        case STOP_TIME:
          if ([START_TIME, RESUME_TIME].includes(elapsed.lastType)) {
            const interval = timeDate(timeItem.itemValue).getTime() - timeDate(elapsed.lastValue).getTime();
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
    const interval = new Date().getTime() - timeDate(elapsed.lastValue).getTime();
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
