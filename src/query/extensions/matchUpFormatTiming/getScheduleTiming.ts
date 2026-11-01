import { firstClassGroupLeafOrExtension } from '@Mutate/extensions/setGroupLeafOrExtension';
import { timingCategoryType } from '@Query/event/timingCategoryType';
import { timingCategoryName } from '@Query/event/timingCategoryName';
import { findExtension } from '@Acquire/findExtension';
import { findPolicy } from '@Acquire/findPolicy';

// constants and types
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';
import { SCHEDULE_TIMING } from '@Constants/extensionConstants';
import { PolicyDefinitions } from '@Types/factoryTypes';

type GetScheduleTimingArgs = {
  policyDefinitions?: PolicyDefinitions;
  tournamentRecord?: Tournament;
  categoryName?: string;
  categoryType?: string;
  drawDefinition?: DrawDefinition;
  event?: Event;
};
export function getScheduleTiming({
  policyDefinitions,
  tournamentRecord,
  categoryName,
  drawDefinition,
  categoryType,
  event,
}: GetScheduleTimingArgs) {
  // the key modifyEventMatchUpFormatTiming writes an override under: an uncategorized event is keyed by its eventId
  categoryName = categoryName ?? timingCategoryName(event);

  categoryType = categoryType ?? timingCategoryType(event?.category);

  // A caller-supplied scheduling policy wins over whatever is attached to the
  // record, matching the `policyDefinitions ?? appliedPolicies` idiom used
  // throughout the generators. This is what lets a report answer "what would
  // this tournament look like under a *different* policy" without mutating it;
  // every existing caller omits it and resolves exactly as before.
  // the draw's policy, else the event's, else the tournament's (CA 2026-10-26, hydration OPEN-11)
  const { policy: attachedPolicy } = findPolicy({
    policyType: POLICY_TYPE_SCHEDULING,
    tournamentRecord,
    drawDefinition,
    event,
  });
  const policy = policyDefinitions?.[POLICY_TYPE_SCHEDULING] ?? attachedPolicy;

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
