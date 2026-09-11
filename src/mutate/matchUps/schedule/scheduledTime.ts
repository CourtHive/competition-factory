import { setMatchUpFirstClassOrTimeItem } from '@Mutate/timeItems/matchUps/setMatchUpFirstClassOrTimeItem';
import { convertTime, extractDate, validTimeValue } from '@Tools/dateTime';
import { scheduledMatchUpDate } from '@Query/matchUp/scheduledMatchUpDate';
import { matchUpTimeModifiers } from '@Query/matchUp/timeModifiers';
import { decorateResult } from '@Functions/global/decorateResult';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { mustBeAnArray } from '@Tools/mustBeAnArray';

// constants and types
import { MUTUALLY_EXCLUSIVE_TIME_MODIFIERS, SCHEDULED_TIME, TIME_MODIFIERS } from '@Constants/timeItemConstants';
import { INVALID_TIME, INVALID_VALUES, MISSING_MATCHUP_ID } from '@Constants/errorConditionConstants';
import { DrawDefinition, MatchUp, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

type AddScheduleAttributeArgs = {
  tournamentRecord?: Tournament;
  removePriorValues?: boolean;
  drawDefinition: DrawDefinition;
  disableNotice?: boolean;
  matchUpId: string;
  event?: Event;
};

type AddMatchUpScheduledTimeArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  removePriorValues?: boolean;
  disableNotice?: boolean;
  scheduledTime?: string;
  matchUpId?: string;
  matchUp?: MatchUp;
};

export function addMatchUpScheduledTime(params: AddMatchUpScheduledTimeArgs) {
  const stack = 'addMatchUpScheduledTime';
  let matchUp = params.matchUp;

  const { removePriorValues, tournamentRecord, drawDefinition, disableNotice, scheduledTime, matchUpId } = params;

  if (!matchUpId) return decorateResult({ result: { error: MISSING_MATCHUP_ID }, stack });

  // must support undefined as a value so that scheduledTime can be cleared
  if (!validTimeValue(scheduledTime)) return decorateResult({ result: { error: INVALID_TIME }, stack });

  if (!matchUp) {
    const result = findDrawMatchUp({ drawDefinition, matchUpId });
    if (result.error) return decorateResult({ result, stack });
    matchUp = result.matchUp;
  }

  const timeDate = extractDate(scheduledTime);

  const scheduledDate = scheduledMatchUpDate({ matchUp }).scheduledDate;
  const keepDate = timeDate && !scheduledDate;

  const existingTimeModifiers = matchUpTimeModifiers({ matchUp }).timeModifiers ?? [];

  if (existingTimeModifiers?.length) {
    const result = addMatchUpTimeModifiers({
      disableNotice: true,
      removePriorValues,
      tournamentRecord,
      timeModifiers: [],
      drawDefinition,
      matchUpId,
      matchUp,
    });
    if (result?.error) return decorateResult({ result, stack });
  }

  // All times stored as military time
  const militaryTime = convertTime(scheduledTime, true, keepDate);

  return setMatchUpFirstClassOrTimeItem({
    duplicateValues: false,
    attribute: 'scheduledTime',
    itemType: SCHEDULED_TIME,
    value: militaryTime,
    removePriorValues,
    tournamentRecord,
    drawDefinition,
    disableNotice,
    matchUpId,
  });
}

export function addMatchUpTimeModifiers({
  removePriorValues,
  tournamentRecord,
  drawDefinition,
  disableNotice,
  timeModifiers,
  matchUpId,
  matchUp,
}: AddScheduleAttributeArgs & {
  matchUp?: MatchUp;
  timeModifiers: any[];
}) {
  const stack = 'addMatchUpTimeModifiers';
  if (!matchUpId) return decorateResult({ result: { error: MISSING_MATCHUP_ID }, stack });

  if (timeModifiers !== undefined && !Array.isArray(timeModifiers))
    return decorateResult({
      info: mustBeAnArray('timeModifiers'),
      result: { error: INVALID_VALUES },
      stack,
    });

  if (!matchUp) {
    const result = findDrawMatchUp({ drawDefinition, matchUpId });
    if (result.error) return decorateResult({ result, stack });
    matchUp = result.matchUp;
  }
  let existingTimeModifiers = matchUpTimeModifiers({ matchUp }).timeModifiers ?? [];
  const toBeAdded = timeModifiers.filter((modifier) => !existingTimeModifiers.includes(modifier));
  if (timeModifiers.length && !toBeAdded.length) return { ...SUCCESS };

  // remove all existing exclusives if incoming includes exclusive
  const containsExclusive = toBeAdded.some((modifier) => MUTUALLY_EXCLUSIVE_TIME_MODIFIERS.includes(modifier));
  if (containsExclusive) {
    existingTimeModifiers = existingTimeModifiers.filter(
      (modifier) => !MUTUALLY_EXCLUSIVE_TIME_MODIFIERS.includes(modifier),
    );

    // scheduledTime should be removed for exclusive timeModifiers
    const result = addMatchUpScheduledTime({
      disableNotice: true,
      removePriorValues,
      scheduledTime: '',
      tournamentRecord,
      drawDefinition,
      matchUpId,
    });
    if (result.error) return decorateResult({ result, stack });
  }

  // undefined value when array is empty;
  const itemValue = !timeModifiers?.length ? undefined : [...toBeAdded, ...existingTimeModifiers];

  return setMatchUpFirstClassOrTimeItem({
    duplicateValues: false,
    attribute: 'timeModifiers',
    itemType: TIME_MODIFIERS,
    value: itemValue,
    removePriorValues,
    tournamentRecord,
    drawDefinition,
    disableNotice,
    matchUpId,
  });
}
