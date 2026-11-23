import { weekdayConstants } from '@Constants/weekdayConstants';
import { unique } from '@Tools/arrays';

export function isValidWeekdaysValue(value) {
  if (!Array.isArray(value)) return false;
  if (unique(value).length !== value.length) return false;

  return value.every((v) => Object.keys(weekdayConstants).includes(v));
}
