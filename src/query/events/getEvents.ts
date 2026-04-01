import { getAssignedParticipantIds } from '@Query/drawDefinition/getAssignedParticipantIds';
import { getDrawId, getParticipantId } from '@Functions/global/extractors';
import { getParticipants } from '@Query/participants/getParticipants';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { definedAttributes } from '@Tools/definedAttributes';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { intersection } from '@Tools/arrays';
import { median } from '@Tools/math';

// constants and types
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { STRUCTURE_SELECTED_STATUSES } from '@Constants/entryStatusConstants';
import { Event, Tournament, EventTypeUnion } from '@Types/tournamentTypes';
import ratingsParameters from '@Fixtures/ratings/ratingsParameters';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

export type RankingStat = {
  median: number;
  avg: number;
  max: number;
  min: number;
};

export type EventScaleValues = {
  [key: string]: {
    ratingsStats: { [key: string]: RankingStat };
    ratings: { [key: string]: number[] };
    ranking: { [key: string]: any };
    draws: {
      [key: string]: {
        ratingsStats: { [key: string]: RankingStat };
        ratings: { [key: string]: number[] };
        ranking: { [key: string]: any };
      };
    };
  };
};

type GetEventsArgs = {
  tournamentRecord: Tournament;
  withScaleValues?: boolean;
  scaleEventType?: EventTypeUnion;
  inContext?: boolean;
  eventIds?: string[];
  drawIds?: string[];
  context?: any;
};

function sumValues(values) {
  return values.reduce((total, value) => total + Number.parseFloat(value), 0);
}

function computeRatingsStats(ratings) {
  const stats = {};
  for (const scaleName of Object.keys(ratings)) {
    const scaleRating = ratings[scaleName];
    if (!scaleRating.length) continue;
    const med = median(scaleRating)?.toFixed(2);
    stats[scaleName] = {
      avg: Number.parseFloat((sumValues(scaleRating) / scaleRating.length).toFixed(2)),
      median: med ? Number.parseFloat(med) : undefined,
      max: Math.max(...scaleRating),
      min: Math.min(...scaleRating),
    };
  }
  return stats;
}

function accumulateRatings(participant, eventType, target) {
  if (participant?.ratings?.[eventType]) {
    for (const rating of participant?.ratings?.[eventType] ?? []) {
      const scaleName = rating.scaleName;
      if (!target.ratings[scaleName]) target.ratings[scaleName] = [];
      const accessor = ratingsParameters[scaleName]?.accessor;
      if (accessor) {
        const value = Number.parseFloat(rating.scaleValue?.[accessor]);
        if (value) target.ratings[scaleName].push(value);
      }
    }
  }
  if (participant?.rankings?.[eventType]) {
    for (const ranking of participant?.rankings?.[eventType] ?? []) {
      const scaleName = ranking.scaleName;
      if (!target.ranking[scaleName]) target.ranking[scaleName] = [];
      if (ranking.scaleValue) target.ranking[scaleName].push(ranking.scaleValue);
    }
  }
}

function processParticipantScales(participantIds, participantMap, eventType, target) {
  for (const participantId of participantIds.filter(Boolean)) {
    const participant = participantMap?.[participantId]?.participant;
    if (participant?.participantType === INDIVIDUAL) {
      accumulateRatings(participant, eventType, target);
    } else {
      for (const individualParticipantId of participant?.individualParticipantIds ?? []) {
        const individualParticipant = participantMap?.[individualParticipantId]?.participant;
        accumulateRatings(individualParticipant, eventType, target);
      }
    }
  }
}

function buildEventScaleValues({ eventCopies, scaleEventType, tournamentRecord, drawIds }) {
  const eventsMap = {};
  const participantMap = getParticipants({
    withScaleValues: true,
    tournamentRecord,
  }).participantMap;

  for (const event of eventCopies) {
    const eventType = scaleEventType ?? event.eventType;
    const eventId = event.eventId;

    if (!eventsMap[eventId])
      eventsMap[eventId] = {
        ratingsStats: {},
        ratings: {},
        ranking: {},
        draws: {},
      };

    const selectedEntries = (event.entries ?? []).filter(({ entryStatus }) =>
      STRUCTURE_SELECTED_STATUSES.includes(entryStatus),
    );
    const participantIds = selectedEntries.map(getParticipantId);

    processParticipantScales(participantIds, participantMap, eventType, eventsMap[eventId]);

    eventsMap[eventId].ratingsStats = computeRatingsStats(eventsMap[eventId].ratings);

    const processedDrawIds: string[] = [];
    const ignoreDrawId = (drawId) =>
      (drawIds?.length && drawIds.includes(drawId)) || processedDrawIds.includes(drawId);

    for (const drawDefinition of event.drawDefinitions ?? []) {
      const drawId: string = drawDefinition.drawId;
      if (ignoreDrawId(drawId)) continue;

      const assignedIds =
        getAssignedParticipantIds({
          drawDefinition,
        }).assignedParticipantIds ?? [];
      if (!eventsMap[eventId].draws[drawId])
        eventsMap[eventId].draws[drawId] = {
          ratingsStats: {},
          ratings: {},
          ranking: {},
        };
      processedDrawIds.push(drawId);
      processParticipantScales(assignedIds, participantMap, eventType, eventsMap[eventId].draws[drawId]);
    }

    const flightProfile = getFlightProfile({ event }).flightProfile;
    for (const flight of flightProfile?.flights ?? []) {
      const drawId = flight.drawId;
      if (ignoreDrawId(drawId)) continue;
      const flightParticipantIds = flight.drawEntries.map(getParticipantId);
      processParticipantScales(flightParticipantIds, participantMap, eventType, eventsMap[eventId].draws[drawId]);
    }

    for (const drawId of processedDrawIds) {
      eventsMap[eventId].draws[drawId].ratingsStats = computeRatingsStats(eventsMap[eventId].draws[drawId].ratings);
    }
  }

  return eventsMap;
}

export function getEvents({
  tournamentRecord,
  withScaleValues,
  scaleEventType,
  inContext, // hydrate with tournamentId
  eventIds, // only return events with these eventIds
  drawIds, // only return events with these drawIds, and only drawDefinitions with these drawIds
  context, // additional context to add to each event
}: GetEventsArgs): ResultType & {
  eventScaleValues?: EventScaleValues;
  events?: Event[];
} {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const { tournamentId } = tournamentRecord;
  const eventCopies = (tournamentRecord.events ?? [])
    .filter(({ eventId }) => !eventIds || (Array.isArray(eventIds) && eventIds.includes(eventId)))
    .map((event) => {
      const eventDrawIds = event.drawDefinitions?.map(getDrawId);
      if (drawIds?.length && !intersection(drawIds, eventDrawIds).length) return undefined;
      const eventCopy = makeDeepCopy(event);
      if (inContext) Object.assign(eventCopy, { tournamentId });
      if (context) Object.assign(eventCopy, context);
      return eventCopy;
    })
    .filter(Boolean);

  const eventsMap = withScaleValues
    ? buildEventScaleValues({ eventCopies, scaleEventType, tournamentRecord, drawIds })
    : {};

  return definedAttributes({
    eventScaleValues: eventsMap,
    events: eventCopies,
    ...SUCCESS,
  });
}
