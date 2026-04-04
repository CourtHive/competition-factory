import { WTN } from '@Constants/ratingConstants';

export function getDetailsWTN({ participant, eventType }) {
  const personId = participant?.person?.personId;
  const personOtherId = participant?.person?.personOtherIds?.[0];
  const tennisId = participant?.person?.tennisId;
  const scaleItem = participant?.ratings?.[eventType]?.find(({ scaleName }) => scaleName === WTN);
  const personWTN = scaleItem?.scaleValue;
  const { wtnRating, confidence } = personWTN ?? {};
  return {
    timeStamp: scaleItem?.scaleDate,
    personOtherId,
    confidence,
    wtnRating,
    personId,
    tennisId,
  };
}
