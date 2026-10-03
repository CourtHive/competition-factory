import { PublishingDetail } from '@Mutate/publishing/publishEvent';
import { isISODateString } from '@Tools/dateTime';
import { nowMs } from '@Tools/clock';

export function isEmbargoed(detail?: PublishingDetail): boolean {
  const embargo = detail?.embargo;
  if (!embargo || !isISODateString(embargo)) return false;
  return new Date(embargo).getTime() > nowMs();
}

export function isVisiblyPublished(detail?: PublishingDetail): boolean {
  return !!detail?.published && !isEmbargoed(detail);
}
