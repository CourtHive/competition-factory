import { isVisiblyPublished } from '@Query/publishing/isEmbargoed';

export function getDrawPublishStatus({ drawDetails, drawId, ignoreEmbargo = false }) {
  const details = drawDetails?.[drawId]?.publishingDetail;
  if (ignoreEmbargo) return !!details?.published;
  return isVisiblyPublished(details);
}
