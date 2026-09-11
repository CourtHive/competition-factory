import { isObject } from '@Tools/objects';

type GetDisabledStatusArgs = {
  dates?: string[];
  // CODES: accept either the raw stored value (first-class) or the legacy
  // extension wrapper. Callers should pass `disabledValue` directly via
  // firstClassOrExtension; `extension` is retained for back-compat.
  disabledValue?: any;
  extension?: any;
};

export function getDisabledStatus({ dates = [], disabledValue, extension }: GetDisabledStatusArgs) {
  const value = disabledValue !== undefined ? disabledValue : extension?.value;
  if (value === undefined) return false;

  // boolean value true means court is entirely disabled
  if (typeof value === 'boolean' && value) return true;
  // even if a court is disabled for specific dates, if no dates are provided then it is not considered disabled
  // REFINEMENT: if disabledDates include all dates from tournament.startDate to tournament.endDate then court is disabled

  if (!dates.length) return false;

  const disabledDates = isObject(value) ? value?.dates : undefined;

  if (Array.isArray(disabledDates)) {
    if (!disabledDates?.length) return false;
    const datesToConsider = disabledDates.filter((date) => !dates.length || dates.includes(date));

    // only if all provided dates appear in disabled dates is the court considered disabled
    return !!datesToConsider.length;
  }

  return undefined;
}
