import { firstClassGroupLeafOrExtension } from '@Mutate/extensions/setGroupLeafOrExtension';
import { findExtension } from '@Acquire/findExtension';
import { findPolicy } from '@Acquire/findPolicy';

import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';
import { SCHEDULE_TIMING } from '@Constants/extensionConstants';
import { Event, Tournament } from '@Types/tournamentTypes';

type GetScheduleTimingArgs = {
  tournamentRecord?: Tournament;
  categoryName?: string;
  categoryType?: string;
  event?: Event;
};
export function getScheduleTiming({ tournamentRecord, categoryName, categoryType, event }: GetScheduleTimingArgs) {
  categoryName = categoryName ?? event?.category?.categoryName ?? event?.category?.ageCategoryCode;

  categoryType = categoryType ?? event?.category?.categoryType ?? event?.category?.subType;

  const { policy } = findPolicy({
    policyType: POLICY_TYPE_SCHEDULING,
    tournamentRecord,
    event,
  });

  // CODES: tournament-level scheduling timing has been promoted to
  // `tournamentRecord.scheduling.timing` (group leaf). Event-level
  // SCHEDULE_TIMING remains an extension.
  const tournamentScheduling = tournamentRecord
    ? firstClassGroupLeafOrExtension({
        element: tournamentRecord,
        groupAttribute: 'scheduling',
        leafAttribute: 'timing',
        name: SCHEDULE_TIMING,
      })
    : undefined;

  const eventExtension =
    event &&
    findExtension({
      name: SCHEDULE_TIMING,
      element: event,
    }).extension;
  const eventScheduling = eventExtension?.value;

  const scheduleTiming = {
    tournamentScheduling,
    eventScheduling,
    categoryName,
    categoryType,
    policy,
  };

  return { scheduleTiming };
}
