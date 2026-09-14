import { PublishingDetail } from '@Mutate/publishing/publishEvent';
import { isISODateString } from '@Tools/dateTime';

export function isEmbargoed(detail?: PublishingDetail): boolean {
  const embargo = detail?.embargo;
  if (!embargo || !isISODateString(embargo)) return false;
  return new Date(embargo).getTime() > Date.now();
}

export function isVisiblyPublished(detail?: PublishingDetail): boolean {
  return !!detail?.published && !isEmbargoed(detail);
}
