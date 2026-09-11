import { setMatchUpFirstClassOrTimeItem } from '@Mutate/timeItems/matchUps/setMatchUpFirstClassOrTimeItem';
import { decorateResult } from '@Functions/global/decorateResult';
import { dateValidation } from '@Validators/regex';
import { extractDate } from '@Tools/dateTime';

// constants and types
import { INVALID_DATE, MISSING_MATCHUP_ID } from '@Constants/errorConditionConstants';
import { AddScheduleAttributeArgs, ResultType } from '@Types/factoryTypes';
import { SCHEDULED_DATE } from '@Constants/timeItemConstants';

export function addMatchUpScheduledDate({
  scheduledDate: dateToSchedule,
  removePriorValues,
  tournamentRecord,
  drawDefinition,
  disableNotice,
  matchUpId,
}: AddScheduleAttributeArgs & { scheduledDate?: string }): ResultType {
  const stack = 'addMatchUpScheduledDate';
  if (!matchUpId) return { error: MISSING_MATCHUP_ID };

  const validDate = dateToSchedule && dateValidation.test(dateToSchedule);
  if (dateToSchedule && !validDate) return { error: INVALID_DATE };

  const scheduledDate = extractDate(dateToSchedule);

  // validate scheduledDate falls within tournament date range
  if (scheduledDate && tournamentRecord?.startDate && tournamentRecord?.endDate) {
    const scheduleTime = new Date(scheduledDate).getTime();
    const startTime = new Date(extractDate(tournamentRecord.startDate)).getTime();
    const endTime = new Date(extractDate(tournamentRecord.endDate)).getTime();
    if (scheduleTime < startTime || scheduleTime > endTime)
      return decorateResult({
        result: { error: INVALID_DATE },
        info: 'scheduledDate must be within tournament start and end dates',
        stack,
      });
  }

  return setMatchUpFirstClassOrTimeItem({
    duplicateValues: false,
    attribute: 'scheduledDate',
    itemType: SCHEDULED_DATE,
    value: scheduledDate,
    removePriorValues,
    tournamentRecord,
    drawDefinition,
    disableNotice,
    matchUpId,
  });
}
