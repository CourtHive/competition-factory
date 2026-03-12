import { addEventExtension } from '../extensions/addRemoveExtensions';
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

export function attachFlightProfile({ deleteExisting, event, flightProfile }) {
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

  const extension = {
    name: FLIGHT_PROFILE,
    value: flightProfile,
  };

  addEventExtension({ event, extension });

  return {
    flightProfile: makeDeepCopy(flightProfile, false, true),
    ...SUCCESS,
  };
}
