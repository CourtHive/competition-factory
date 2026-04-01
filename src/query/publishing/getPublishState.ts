import { getTournamentPublishStatus } from '@Query/tournaments/getTournamentPublishStatus';
import { isValidTournamentRecord } from '@Validators/isValidTournamentRecord';
import { getEventPublishStatus } from '@Query/event/getEventPublishStatus';
import { getDrawPublishStatus } from '@Query/event/getDrawPublishStatus';
import { isEmbargoed } from '@Query/publishing/isEmbargoed';
import { getDrawId } from '@Functions/global/extractors';

// constants and types
import { DRAW_DEFINITION_NOT_FOUND, EVENT_NOT_FOUND, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import { findEvent } from '@Acquire/findEvent';
import { isString } from '@Tools/objects';

type GetPublishStateArgs = {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  eventIds?: string[];
  drawIds?: string[];
  eventId?: string;
  drawId?: string;
  event?: Event;
};

export function getPublishState(params: GetPublishStateArgs): ResultType & { publishState?: any } {
  const { tournamentRecord, drawDefinition, eventIds, eventId, drawIds, drawId, event } = params ?? {};
  if (tournamentRecord && !isValidTournamentRecord(tournamentRecord)) return { error: INVALID_VALUES };

  if (eventId && !event) return { error: EVENT_NOT_FOUND };

  if (Array.isArray(eventIds) && eventIds?.length) {
    const publishState: any = {};
    for (const eventId of eventIds) {
      if (!isString(eventId)) return { error: INVALID_VALUES };
      const event: Event | undefined = findEvent({ tournamentRecord, eventId })?.event;
      if (!event) return { error: EVENT_NOT_FOUND };
      const pubStatus: any = getPubStatus({ event });
      publishState[eventId] = pubStatus;
    }
    return { ...SUCCESS, publishState };
  }

  if (event) {
    const pubStatus: any = getPubStatus({ event });
    let publishState: any = {};

    if (drawId) {
      if (!drawDefinition) return { error: DRAW_DEFINITION_NOT_FOUND };
      return {
        publishState: {
          status: {
            published: !!pubStatus.status.publishedDrawIds?.includes(drawId),
            drawDetail: pubStatus.status.drawDetails?.[drawId],
          },
          ...SUCCESS,
        },
      };
    } else if (Array.isArray(drawIds) && drawIds?.length) {
      const eventDrawIds = event.drawDefinitions?.map(getDrawId) ?? [];
      for (const drawId of drawIds) {
        if (!isString(drawId)) return { error: INVALID_VALUES };
        if (!eventDrawIds.includes(drawId)) return { error: DRAW_DEFINITION_NOT_FOUND };
        publishState[drawId] = {
          status: {
            published: !!pubStatus.status.publishedDrawIds.includes(drawId),
            drawDetail: pubStatus.status.drawDetails?.[drawId],
          },
        };
      }
    } else {
      publishState = pubStatus;
    }

    return { ...SUCCESS, publishState };
  }

  const publishState: any = {};
  const { publishedEventIds, tournamentPublished: eventsPublished } = buildEventPublishState({
    publishState,
    tournamentRecord,
  });

  const embargoes: any[] = [];

  if (tournamentRecord) {
    buildTournamentPublishState({
      tournamentPublished: eventsPublished,
      publishedEventIds,
      tournamentRecord,
      publishState,
      embargoes,
    });
  }

  collectEventEmbargoes({ tournamentRecord, embargoes });

  if (embargoes.length) publishState.embargoes = embargoes;

  return { ...SUCCESS, publishState };
}

function buildEventPublishState({ publishState, tournamentRecord }) {
  const publishedEventIds: string[] = [];
  let tournamentPublished = false;

  for (const event of tournamentRecord?.events ?? []) {
    const pubStatus: any = getPubStatus({ event });
    publishState[event.eventId] = pubStatus;
    if (pubStatus.status.published) {
      publishedEventIds.push(event.eventId);
      tournamentPublished = true;
    }
    for (const { drawId } of event.drawDefinitions ?? []) {
      const published = pubStatus.status?.publishedDrawIds?.includes(drawId);
      if (published) publishState[drawId] = { status: { published } };
    }
  }

  return { publishedEventIds, tournamentPublished };
}

function buildTournamentPublishState({ publishState, tournamentRecord, tournamentPublished, publishedEventIds, embargoes }) {
  const pubStatus: any = getTournamentPublishStatus({ tournamentRecord });
  publishState.tournament = pubStatus ?? {};
  if (pubStatus?.orderOfPlay?.published || pubStatus?.participants?.published) tournamentPublished = true;
  publishState.tournament.status = { published: tournamentPublished, publishedEventIds };

  if (pubStatus?.orderOfPlay?.embargo) {
    embargoes.push({
      type: 'orderOfPlay',
      embargo: pubStatus.orderOfPlay.embargo,
      embargoActive: isEmbargoed(pubStatus.orderOfPlay),
    });
  }
  if (pubStatus?.participants?.embargo) {
    embargoes.push({
      type: 'participants',
      embargo: pubStatus.participants.embargo,
      embargoActive: isEmbargoed(pubStatus.participants),
    });
  }

  return tournamentPublished;
}

function collectEventEmbargoes({ tournamentRecord, embargoes }) {
  for (const event of tournamentRecord?.events ?? []) {
    const eventPubStatus = getEventPublishStatus({ event });
    const drawDetails = eventPubStatus?.drawDetails ?? {};
    for (const [drawId, detail] of Object.entries(drawDetails) as [string, any][]) {
      collectDrawEmbargoes({ drawId, detail, embargoes });
    }
  }
}

function collectDrawEmbargoes({ drawId, detail, embargoes }) {
  if (detail?.publishingDetail?.embargo) {
    embargoes.push({
      type: 'draw',
      id: drawId,
      embargo: detail.publishingDetail.embargo,
      embargoActive: isEmbargoed(detail.publishingDetail),
    });
  }
  for (const [stage, stageDetail] of Object.entries(detail?.stageDetails ?? {}) as [string, any][]) {
    if (stageDetail?.embargo) {
      embargoes.push({
        type: 'stage',
        id: `${drawId}:${stage}`,
        embargo: stageDetail.embargo,
        embargoActive: isEmbargoed(stageDetail),
      });
    }
  }
  for (const [structureId, structureDetail] of Object.entries(detail?.structureDetails ?? {}) as [string, any][]) {
    if (structureDetail?.embargo) {
      embargoes.push({
        type: 'structure',
        id: structureId,
        embargo: structureDetail.embargo,
        embargoActive: isEmbargoed(structureDetail),
      });
    }
    collectScheduledRoundEmbargoes({ structureId, structureDetail, embargoes });
  }
}

function collectScheduledRoundEmbargoes({ structureId, structureDetail, embargoes }) {
  if (!structureDetail?.scheduledRounds) return;

  for (const [roundNumber, roundDetail] of Object.entries(structureDetail.scheduledRounds) as [string, any][]) {
    if (roundDetail?.embargo) {
      embargoes.push({
        type: 'scheduledRound',
        id: `${structureId}:round${roundNumber}`,
        embargo: roundDetail.embargo,
        embargoActive: isEmbargoed(roundDetail),
      });
    }
  }
}

function getPubStatus({ event }): any {
  const eventPubStatus = getEventPublishStatus({ event });
  if (!eventPubStatus) return { status: { published: false } };

  const publishedSeeding = {
    published: undefined, // seeding can be present for all entries in an event when no flights have been defined
    seedingScaleNames: [],
    drawIds: [], // seeding can be specific to drawIds
  };

  if (eventPubStatus.seeding) {
    Object.assign(publishedSeeding, eventPubStatus.seeding);
  }

  const drawDetails = eventPubStatus.drawDetails ?? {};
  for (const drawId of event.drawDefinitions?.map(getDrawId) || []) {
    if (!drawDetails[drawId]) {
      drawDetails[drawId] = {
        publishingDetail: { published: false },
      };
    }
  }

  const drawDetailPublishedIds =
    drawDetails &&
    Object.keys(drawDetails).length &&
    Object.keys(drawDetails).filter((drawId) => getDrawPublishStatus({ drawDetails, drawId, ignoreEmbargo: true }));

  const publishedDrawIds = drawDetailPublishedIds?.length ? drawDetailPublishedIds : (eventPubStatus.drawIds ?? []);

  // support legacy data where drawIds are not present in drawDetails
  if (publishedDrawIds?.length && !drawDetailPublishedIds?.length) {
    for (const drawId of publishedDrawIds) {
      drawDetails[drawId] = {
        publishingDetail: { published: true },
      };
    }
  }

  const published = publishedDrawIds?.length > 0;

  return {
    status: {
      publishedDrawIds,
      publishedSeeding,
      drawDetails,
      published,
    },
  };
}
