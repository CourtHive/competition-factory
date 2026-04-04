import { modifyEventPublishStatus } from '../events/modifyEventPublishStatus';
import { getEventPublishStatus } from '@Query/event/getEventPublishStatus';
import { requireParams } from '@Helpers/parameters/requireParams';
import { definedAttributes } from '@Tools/definedAttributes';
import { addNotice } from '@Global/state/globalState';

import { PUBLISH_EVENT_SEEDING, UNPUBLISH_EVENT_SEEDING } from '@Constants/topicConstants';
import { TOURNAMENT_RECORD, EVENT } from '@Constants/attributeConstants';
import { PUBLIC } from '@Constants/timeItemConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function publishEventSeeding({
  removePriorValues = true,
  stageSeedingScaleNames,
  seedingScaleNames,
  tournamentRecord,
  status = PUBLIC,
  drawIds = [],
  event,
}) {
  const paramsCheck = requireParams({ tournamentRecord, event }, [TOURNAMENT_RECORD, EVENT]);
  if (paramsCheck.error) return paramsCheck;

  const eventPubStatus = getEventPublishStatus({ event, status });

  const updatedSeedingScaleNames = (eventPubStatus?.seeding?.seedingScaleNames || seedingScaleNames) && {
    ...eventPubStatus?.seeding?.seedingScaleNames,
    ...seedingScaleNames,
  };

  const updatedStageSeedingScaleNames = (eventPubStatus?.seeding?.stageSeedingScaleNames || stageSeedingScaleNames) && {
    ...eventPubStatus?.seeding?.stageSeedingScaleNames,
    ...stageSeedingScaleNames,
  };

  const seeding = definedAttributes({
    stageSeedingScaleNames: updatedStageSeedingScaleNames,
    seedingScaleNames: updatedSeedingScaleNames,
    published: true,
    drawIds,
  });

  modifyEventPublishStatus({
    statusObject: { seeding },
    removePriorValues,
    status,
    event,
  });

  addNotice({
    topic: PUBLISH_EVENT_SEEDING,
    payload: {
      tournamentId: tournamentRecord.tournamentId,
      eventId: event.eventId,
      drawIds,
    },
  });

  return { ...SUCCESS };
}

export function unPublishEventSeeding({
  removePriorValues = true,
  seedingScaleNames,
  tournamentRecord,
  status = PUBLIC,
  drawIds,
  stages,
  event,
}) {
  const paramsCheck = requireParams({ tournamentRecord, event }, [TOURNAMENT_RECORD, EVENT]);
  if (paramsCheck.error) return paramsCheck;

  const eventPubStatus = getEventPublishStatus({ event });

  if (eventPubStatus) {
    const seeding = eventPubStatus.seeding;

    if (Array.isArray(stages) && seeding.stageSeedingScaleNames) {
      for (const stage of stages) {
        if (seeding.stageSeedingScaleNames[stage]) {
          delete seeding.stageSeedingScaleNames[stage];
        }
      }
    }

    if (Array.isArray(seedingScaleNames) && seeding?.seedingScaleNames) {
      seeding.seedingScaleNames = seeding.seedingScaleNames.filter(
        (scaleName) => !seedingScaleNames.includes(scaleName),
      );
    }

    if (Array.isArray(drawIds) && seeding?.drawIds) {
      seeding.drawIds = seeding.drawIds.filter((drawId) => !drawIds.includes(drawId));
    }

    if (
      (!Object.values(seeding.stageSeedingScaleNames ?? {}).length &&
        !seeding.seedingScaleNames?.length &&
        !seeding.drawIds?.length) ||
      (!stages && !seedingScaleNames && !drawIds?.length)
    ) {
      delete seeding.stageSeedingScaleNames;
      delete seeding.seedingScaleNames;
      delete seeding.drawIds;
      seeding.published = false;
    }

    modifyEventPublishStatus({
      statusObject: { seeding },
      removePriorValues,
      status,
      event,
    });
  }

  addNotice({
    topic: UNPUBLISH_EVENT_SEEDING,
    payload: {
      tournamentId: tournamentRecord.tournamentId,
      eventId: event.eventId,
    },
  });

  return { ...SUCCESS };
}
