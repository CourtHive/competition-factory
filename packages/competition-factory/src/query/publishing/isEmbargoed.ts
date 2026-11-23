import { PublishingDetail } from '@Types/publishingTypes';
import { isISODateString } from '@Tools/dateTime';
import { asOfTime } from './asOfTime';

/** whether the detail's embargo lifts after `asOf` (a clock is an input; without it, the competition clock; `asOf` is required in 8.0.0) */
export function isEmbargoed(detail?: PublishingDetail, asOf?: Date | string): boolean {
  const embargo = detail?.embargo;
  if (!embargo || !isISODateString(embargo)) return false;
  return new Date(embargo).getTime() > asOfTime(asOf);
}

/** published, and its embargo has lifted at `asOf` (`asOf` is required in 8.0.0) */
export function isVisiblyPublished(detail?: PublishingDetail, asOf?: Date | string): boolean {
  return !!detail?.published && !isEmbargoed(detail, asOf);
}
