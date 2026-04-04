import { participantScaleItem } from './participantScaleItem';

import { SEEDING } from '@Constants/scaleConstants';

export function getSeedValue({ participant, drawId, event }) {
  let seedValue;

  const { categoryName, ageCategoryCode } = event?.category ?? {};

  const potentialScaleNames = [drawId, categoryName || ageCategoryCode, event?.eventId].filter(Boolean);

  for (const scaleName of potentialScaleNames) {
    const result = participantScaleItem({
      scaleAttributes: {
        eventType: event?.eventType,
        scaleType: SEEDING,
        scaleName,
      },
      participant,
    });

    if (result?.scaleItem) {
      seedValue = result.scaleItem.scaleValue;
      break;
    }
  }

  return { seedValue };
}
