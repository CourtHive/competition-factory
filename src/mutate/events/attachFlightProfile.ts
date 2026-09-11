import { setFirstClassOrExtension } from '../extensions/setFirstClassOrExtension';
import { modifyEventNotice } from '@Mutate/notifications/eventNotifications';
import { decorateResult } from '@Functions/global/decorateResult';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants
import { FLIGHT_PROFILE } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  EXISTING_DRAW_DEFINITIONS,
  EXISTING_PROFILE,
  MISSING_EVENT,
  MISSING_VALUE,
} from '@Constants/errorConditionConstants';

export function attachFlightProfile({
  deleteExisting,
  tournamentRecord,
  disableNotice,
  event,
  flightProfile,
}: {
  deleteExisting?: boolean;
  tournamentRecord?: any;
  disableNotice?: boolean;
  event?: any;
  flightProfile?: any;
}) {
  const stack = 'attachFlightProfile';
  if (!flightProfile) return decorateResult({ result: { error: MISSING_VALUE }, stack });
  if (!event) return decorateResult({ result: { error: MISSING_EVENT }, stack });

  const { flightProfile: existingFlightProfile } = getFlightProfile({ event });
  if (existingFlightProfile && !deleteExisting) return decorateResult({ result: { error: EXISTING_PROFILE }, stack });

  if (event.drawDefinitions?.length)
    return decorateResult({
      result: { error: EXISTING_DRAW_DEFINITIONS },
      stack,
    });

  setFirstClassOrExtension({
    element: event,
    attribute: 'flightProfile',
    name: FLIGHT_PROFILE,
    value: flightProfile,
  });

  if (!disableNotice) modifyEventNotice({ event, tournamentId: tournamentRecord?.tournamentId });

  return {
    flightProfile: makeDeepCopy(flightProfile, false, true),
    ...SUCCESS,
  };
}
