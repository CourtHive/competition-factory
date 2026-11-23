import { isVisiblyPublished } from '@Query/publishing/isEmbargoed';

export function getDrawIsPublished({ publishStatus, drawId }) {
  if (publishStatus?.drawDetails) {
    return isVisiblyPublished(publishStatus.drawDetails?.[drawId]?.publishingDetail);
  } else if (publishStatus?.drawIds) {
    return publishStatus.drawIds.includes(drawId);
  }
  return true;
}
