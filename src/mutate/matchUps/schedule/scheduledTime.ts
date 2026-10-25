import { setMatchUpFirstClassOrTimeItem } from '@Mutate/timeItems/matchUps/setMatchUpFirstClassOrTimeItem';
import { addMatchUpScheduledDate } from './scheduleItems/addMatchUpScheduledDate';
import { scheduledMatchUpDate } from '@Query/matchUp/scheduledMatchUpDate';
import { canonicalTime, isClearingValue } from '@Tools/canonicalClock';
import { matchUpTimeModifiers } from '@Query/matchUp/timeModifiers';
import { decorateResult } from '@Functions/global/decorateResult';
import { checkPlayedOrder } from './scheduleItems/playedOrder';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { mustBeAnArray } from '@Tools/mustBeAnArray';
import { extractDate } from '@Tools/dateTime';

// constants and types
import { MUTUALLY_EXCLUSIVE_TIME_MODIFIERS, SCHEDULED_TIME, TIME_MODIFIERS } from '@Constants/timeItemConstants';
import { INVALID_TIME, INVALID_VALUES, MISSING_MATCHUP_ID } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
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
  /** set by a caller that has already asked `checkPlayedOrder` of the whole write */
  playedOrderChecked?: boolean;
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

  // a time is stored only as HH:MM (scheduling-pipeline.md § 9.9): anything that does not convert to it unambiguously is
  // refused; an absent value, null or '' clears it
  const clearing = isClearingValue(scheduledTime);
  if (!clearing && !canonicalTime(scheduledTime)) return decorateResult({ result: { error: INVALID_TIME }, stack });
  // a date-time carries its date, a real day (canonicalTime refuses a date-time whose date is not one)
  const timeDate = clearing ? undefined : extractDate(scheduledTime) || undefined;

  if (!matchUp) {
    const result = findDrawMatchUp({ drawDefinition, matchUpId });
    if (result.error) return decorateResult({ result, stack });
    matchUp = result.matchUp;
  }

  if (!params.playedOrderChecked) {
    const refusal = checkPlayedOrder({ drawDefinition, matchUpId, schedule: { scheduledTime: scheduledTime ?? '' } });
    if (refusal) return decorateResult({ result: refusal, stack });
  }

  // a matchUp with no date takes the date-time's date as its scheduledDate, and the time is stored as HH:MM: the date is
  // never kept inside the time
  if (timeDate && !scheduledMatchUpDate({ matchUp }).scheduledDate) {
    const result = addMatchUpScheduledDate({
      playedOrderChecked: true,
      scheduledDate: timeDate,
      removePriorValues,
      tournamentRecord,
      drawDefinition,
      disableNotice,
      matchUpId,
    });
    if (result.error) return decorateResult({ result, stack });
  }

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

  return setMatchUpFirstClassOrTimeItem({
    duplicateValues: false,
    attribute: 'scheduledTime',
    itemType: SCHEDULED_TIME,
    value: clearing ? undefined : canonicalTime(scheduledTime),
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
  timeModifiers: string[];
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
