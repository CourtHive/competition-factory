import { participantScaleItem } from '../participant/participantScaleItem';
import { intersection } from '@Tools/arrays';

// Constants
import { SCALE, SEEDING } from '@Constants/scaleConstants';

export function getEventSeedAssignments({ publishedSeeding, usePublishState, withSeeding, participant, event }) {
  const eventSeedAssignments: any = {};

  const getScaleAccessor = (scaleName) => [SCALE, SEEDING, event.eventType, scaleName].join('.');

  const seedingScales = Object.assign(
    {},
    ...(participant.timeItems ?? [])
      .filter(({ itemType }) => itemType.split('.')[1] === SEEDING)
      .map(({ itemType: seedingScaleName, itemValue: seedValue }) => ({
        [seedingScaleName]: seedValue,
      })),
  );

  const eventSeedingScaleNames = (
    (publishedSeeding?.stageSeedingScaleNames && Object.values(publishedSeeding?.stageSeedingScaleNames)) ||
    (Array.isArray(publishedSeeding?.seedingScaleNames) && publishedSeeding.seedingScaleNames) ||
    []
  ).map(getScaleAccessor);

  const publishedEventSeedingScaleNames = intersection(Object.keys(seedingScales), eventSeedingScaleNames);

  const eventSeedingPublished = !!(
    !usePublishState ||
    (!Object.keys(seedingScales).length && !publishedSeeding?.drawIds?.length) ||
    publishedEventSeedingScaleNames.length
  );

  if (eventSeedingPublished && publishedEventSeedingScaleNames.length) {
    if (publishedSeeding?.stageSeedingScaleNames) {
      const scaleValues = Object.keys(publishedSeeding.stageSeedingScaleNames)
        .map((key) => {
          const accessor = getScaleAccessor(publishedSeeding.stageSeedingScaleNames[key]);
          const scaleValue = seedingScales[accessor];
          return [key, scaleValue];
        })
        .filter((pair) => pair[1])
        .map((pair) => ({ [pair[0]]: { seedValue: pair[1] } }));
      const seedAssignments = Object.assign({}, ...scaleValues);

      eventSeedAssignments.seedAssignments = seedAssignments;
    } else if (publishedEventSeedingScaleNames) {
      const seedValues = publishedEventSeedingScaleNames.map((scaleName) => seedingScales[scaleName]);
      eventSeedAssignments.seedValue = seedValues.pop();
    }
  } else if (!usePublishState && typeof withSeeding === 'object') {
    const scaleValues = Object.keys(withSeeding)
      .map((key) => {
        const accessor = getScaleAccessor(withSeeding[key]);
        const scaleValue = seedingScales[accessor];
        return [key, scaleValue];
      })
      .filter((pair) => pair[1])
      .map((pair) => ({ [pair[0]]: { seedValue: pair[1] } }));
    const seedAssignments = Object.assign({}, ...scaleValues);

    eventSeedAssignments.seedAssignments = seedAssignments;
  } else {
    const { categoryName, ageCategoryCode } = event.category ?? {};

    const scaleNames = [ageCategoryCode, event.eventId, categoryName].filter(Boolean);

    let scaleItem;
    for (const scaleName of scaleNames) {
      const scaleAttributes = {
        eventType: event.eventType,
        scaleType: SEEDING,
        scaleName,
      };
      const result = participantScaleItem({
        scaleAttributes,
        participant,
      });

      if (result.scaleItem) {
        scaleItem = result.scaleItem;
        break;
      }
    }

    if (scaleItem) {
      const seedingPublished =
        !usePublishState ||
        (publishedSeeding?.published &&
          // if drawIds have been specified then don't attach event seeding here
          // defer to seedValue that is in seedAssignments for draw in which participant appears
          !publishedSeeding?.published?.drawIds?.length);

      if (seedingPublished) {
        const seedValue = scaleItem.scaleValue;
        eventSeedAssignments.seedValue = seedValue;
      }
    }
  }

  return eventSeedAssignments;
}
