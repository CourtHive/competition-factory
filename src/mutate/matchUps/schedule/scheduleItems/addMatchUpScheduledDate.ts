import { setMatchUpFirstClassOrTimeItem } from '@Mutate/timeItems/matchUps/setMatchUpFirstClassOrTimeItem';
import { decorateResult } from '@Functions/global/decorateResult';
import { eventDateWarning } from '@Query/events/eventDateWarning';
import { canonicalDate } from '@Tools/canonicalClock';
import { checkPlayedOrder } from './playedOrder';
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
  playedOrderChecked,
  disableNotice,
  matchUpId,
  event,
}: AddScheduleAttributeArgs & { scheduledDate?: string; playedOrderChecked?: boolean }): ResultType {
  const stack = 'addMatchUpScheduledDate';
  if (!matchUpId) return { error: MISSING_MATCHUP_ID };

  // a real calendar day, stored as YYYY-MM-DD (scheduling-pipeline.md § 9.9); an absent value or '' clears it
  const scheduledDate = dateToSchedule ? canonicalDate(dateToSchedule) : '';
  if (scheduledDate === undefined) return { error: INVALID_DATE };

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

  if (!playedOrderChecked && drawDefinition) {
    const refusal = checkPlayedOrder({ drawDefinition, matchUpId, schedule: { scheduledDate: scheduledDate ?? '' } });
    if (refusal) return decorateResult({ result: refusal, stack });
  }

  const result = setMatchUpFirstClassOrTimeItem({
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
  if (result.error) return result;

  // a day the matchUp's event does not play: written, and warned about, never refused (CA 2026-11-01)
  const warning = eventDateWarning({ tournamentRecord, drawDefinition, scheduledDate, matchUpId, event });
  return warning ? { ...result, warnings: [warning] } : result;
}
