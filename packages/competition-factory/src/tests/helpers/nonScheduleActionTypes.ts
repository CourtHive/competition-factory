import {
  CHECK_IN,
  CLEAR_SCHEDULE,
  SCHEDULE_DATE,
  SCHEDULE_LOCK,
  SCHEDULE_TIME,
  SCOREKEEPER,
} from '@Constants/matchUpActionConstants';

const SCHEDULE_ACTION_TYPES = new Set<string>([
  SCHEDULE_DATE,
  SCHEDULE_TIME,
  CLEAR_SCHEDULE,
  SCHEDULE_LOCK,
  CHECK_IN,
  SCOREKEEPER,
]);

/**
 * The types of a matchUp's valid actions without its scheduling and staffing actions, which have their own suite
 * (`scheduleMatchUpActions.test.ts`): a suite about lineUps or positions asserts the actions it is about.
 */
export function nonScheduleActionTypes(validActions: { type: string }[] = []): string[] {
  return validActions.map(({ type }) => type).filter((type) => !SCHEDULE_ACTION_TYPES.has(type));
}
