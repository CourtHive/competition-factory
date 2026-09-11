import { getStageParticipantsCount } from '@Query/drawDefinition/getStageParticipantsCount';
import { scheduleProfileRounds } from '@Mutate/matchUps/schedule/scheduleProfileRounds';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { getStageParticipants } from '@Query/drawDefinition/getStageParticipants';
import { generateFlightDrawDefinitions } from './generateFlightDrawDefinitions';
import { setSchedulingProfile } from '@Mutate/tournaments/schedulingProfile';
import { addTournamentParticipants } from './addTournamentParticipants';
import { generateEventParticipants } from './generateEventParticipants';
import { generateEventWithFlights } from './generateEventWithFlights';
import { generateEventWithDraw } from './generateEventWithDraw';
import { generateVenues } from '@Mutate/venues/generateVenues';
import { publishEvent } from '@Mutate/publishing/publishEvent';
import { addEvent } from '@Mutate/events/addEvent';
import { generateFlights } from './generateFlights';

// constants and fixtures
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { DOUBLES, SINGLES } from '@Constants/eventConstants';
import { SUCCESS } from '@Constants/resultConstants';

function processExistingEvent({ event, eventProfile, tournamentRecord, allUniqueParticipantIds, drawIds }) {
  const { gender, category, eventType } = event;
  const { drawProfiles, publish } = eventProfile;

  const eventParticipantType =
    (isMatchUpEventType(SINGLES)(eventType) && INDIVIDUAL) ||
    (isMatchUpEventType(DOUBLES)(eventType) && PAIR) ||
    eventType;

  if (drawProfiles) {
    const { stageParticipantsCount, uniqueParticipantsCount, uniqueParticipantStages } = getStageParticipantsCount({
      drawProfiles,
      category,
      gender,
    });

    const { uniqueDrawParticipants = [], uniqueParticipantIds = [] } = uniqueParticipantStages
      ? generateEventParticipants({
          event: { eventType, category, gender },
          uniqueParticipantsCount,
          participantsProfile: eventProfile.participantsProfile,
          ratingsParameters: eventProfile.ratingsParameters,
          tournamentRecord,
          eventProfile,
          uuids: eventProfile.uuids,
        })
      : {};

    allUniqueParticipantIds.push(...uniqueParticipantIds);

    const { stageParticipants } = getStageParticipants({
      targetParticipants: tournamentRecord.participants ?? [],
      allUniqueParticipantIds,
      stageParticipantsCount,
      eventParticipantType,
      gender,
    });

    let result: any = generateFlights({
      uniqueDrawParticipants,
      autoEntryPositions: eventProfile.autoEntryPositions,
      stageParticipants,
      tournamentRecord,
      drawProfiles,
      category,
      gender,
      event,
    });
    if (result.error) return result;

    result = generateFlightDrawDefinitions({
      matchUpStatusProfile: eventProfile.matchUpStatusProfile,
      completeAllMatchUps: eventProfile.completeAllMatchUps,
      randomWinningSide: eventProfile.randomWinningSide,
      tournamentRecord,
      drawProfiles,
      isMock: eventProfile.isMock,
      event,
    });
    if (result.error) return result;

    drawIds.push(...result.drawIds);
  }

  if (publish) {
    publishEvent({ tournamentRecord, event });
  }

  return SUCCESS;
}

function findEventByProfile(events, eventProfile) {
  return events?.find(
    (event, index) =>
      (eventProfile.eventIndex !== undefined && index === eventProfile.eventIndex) ||
      (eventProfile.eventName && event.eventName === eventProfile.eventName) ||
      (eventProfile.eventId && event.eventId === eventProfile.eventId),
  );
}

function handleExistingEvent({ event, eventProfile, tournamentRecord, allUniqueParticipantIds, drawIds, params }) {
  const result = processExistingEvent({
    event,
    eventProfile: { ...eventProfile, ...params },
    tournamentRecord,
    allUniqueParticipantIds,
    drawIds,
  });
  return result;
}

function handleNewEvent({
  eventProfile,
  tournamentRecord,
  allUniqueParticipantIds,
  eventIds,
  drawIds,
  params,
  eventIndex,
}) {
  const result: any = generateEventWithFlights({
    startDate: tournamentRecord.startDate,
    allUniqueParticipantIds,
    matchUpStatusProfile: params.matchUpStatusProfile,
    participantsProfile: params.participantsProfile,
    completeAllMatchUps: params.completeAllMatchUps,
    autoEntryPositions: params.autoEntryPositions,
    randomWinningSide: params.randomWinningSide,
    ratingsParameters: eventProfile.ratingsParameters,
    tournamentRecord,
    eventProfile,
    eventIndex,
    uuids: params.uuids,
  });
  if (result.error) return result;

  const { eventId, drawIds: generatedDrawIds, uniqueParticipantIds } = result;

  if (generatedDrawIds) drawIds.push(...generatedDrawIds);
  eventIds.push(eventId);

  if (uniqueParticipantIds?.length) allUniqueParticipantIds.push(...uniqueParticipantIds);

  return { eventIndexIncrement: 1 };
}

function processEventProfiles({ eventProfiles, tournamentRecord, allUniqueParticipantIds, eventIds, drawIds, params }) {
  let eventIndex = tournamentRecord.events?.length || 0;

  for (const eventProfile of eventProfiles) {
    const event = findEventByProfile(tournamentRecord.events, eventProfile);

    if (event) {
      const result = handleExistingEvent({
        event,
        eventProfile,
        tournamentRecord,
        allUniqueParticipantIds,
        drawIds,
        params,
      });
      if (result?.error) return result;
    } else {
      const result = handleNewEvent({
        eventProfile,
        tournamentRecord,
        allUniqueParticipantIds,
        eventIds,
        drawIds,
        params,
        eventIndex,
      });
      if (result?.error) return result;
      eventIndex += result?.eventIndexIncrement || 1;
    }
  }

  return SUCCESS;
}

function processDrawProfiles({ drawProfiles, tournamentRecord, allUniqueParticipantIds, eventIds, drawIds, params }) {
  let drawIndex = (tournamentRecord.events ?? [])
    .flatMap((event) => event.drawDefinitions?.map(() => 1) ?? [])
    .reduce((a, b) => a + b, 0);

  for (const drawProfile of drawProfiles) {
    let result = generateEventWithDraw({
      startDate: tournamentRecord.startDate,
      allUniqueParticipantIds,
      matchUpStatusProfile: params.matchUpStatusProfile,
      participantsProfile: params.participantsProfile,
      completeAllMatchUps: params.completeAllMatchUps,
      autoEntryPositions: params.autoEntryPositions,
      hydrateCollections: params.hydrateCollections,
      randomWinningSide: params.randomWinningSide,
      ratingsParameters: params.ratingsParameters,
      tournamentRecord,
      drawProfile,
      drawIndex,
      uuids: params.uuids,
    });
    if (result.error) return result;

    const { drawId, eventId, event, uniqueParticipantIds } = result;

    result = addEvent({ tournamentRecord, event, internalUse: true });
    if (result.error) return result;

    if (drawId) drawIds.push(drawId);
    eventIds.push(eventId);

    if (uniqueParticipantIds?.length) allUniqueParticipantIds.push(...uniqueParticipantIds);

    drawIndex += 1;
  }

  return SUCCESS;
}

function applySchedulingProfile({ schedulingProfile, autoSchedule, periodLength, tournamentRecord }) {
  let scheduledRounds: any = [];
  let schedulerResult = {};

  if (schedulingProfile?.length) {
    const tournamentRecords = {
      [tournamentRecord.tournamentId]: tournamentRecord,
    };
    const result = setSchedulingProfile({
      tournamentRecords,
      schedulingProfile,
    });
    if (result.error) return result;

    if (autoSchedule) {
      const { tournamentId } = tournamentRecord;
      const tournamentRecords = { [tournamentId]: tournamentRecord };

      schedulerResult = scheduleProfileRounds({
        tournamentRecords,
        periodLength,
      });
    }
  }

  return { scheduledRounds, schedulerResult };
}

export function modifyTournamentRecord(params) {
  const {
    participantsProfile = {},
    schedulingProfile,
    tournamentRecord,
    autoSchedule,
    eventProfiles,
    periodLength,
    venueProfiles,
    drawProfiles,
    uuids,
  } = params;
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const allUniqueParticipantIds: string[] = [];
  const eventIds: string[] = [];
  const drawIds: string[] = [];

  eventProfiles?.forEach((eventProfile) => {
    const event = findEventByProfile(tournamentRecord.events, eventProfile);

    if (event?.gender) {
      eventProfile.gender = event.gender;
    }
  });

  const participantsCount = tournamentRecord.participants?.length || undefined;
  if (participantsCount && participantsProfile?.idPrefix) {
    participantsProfile.idPrefix = `${participantsProfile.idPrefix}-${participantsCount}`;
  }

  const result = addTournamentParticipants({
    startDate: tournamentRecord.startDate,
    participantsProfile,
    tournamentRecord,
    eventProfiles,
    drawProfiles,
    uuids,
  });
  if (!result.success) return result;

  if (eventProfiles) {
    const eventResult = processEventProfiles({
      eventProfiles,
      tournamentRecord,
      allUniqueParticipantIds,
      eventIds,
      drawIds,
      params,
    });
    if (eventResult.error) return eventResult;
  }

  if (drawProfiles) {
    const drawResult = processDrawProfiles({
      drawProfiles,
      tournamentRecord,
      allUniqueParticipantIds,
      eventIds,
      drawIds,
      params,
    });
    if (drawResult.error) return drawResult;
  }

  const venueIds = venueProfiles?.length ? generateVenues({ tournamentRecord, venueProfiles }) : [];

  const schedulingResult = applySchedulingProfile({
    tournamentRecord,
    schedulingProfile,
    autoSchedule,
    periodLength,
  });
  if (schedulingResult.error) return schedulingResult;

  const { scheduledRounds, schedulerResult } = schedulingResult;

  const totalParticipantsCount = tournamentRecord.participants.length;

  return {
    totalParticipantsCount,
    scheduledRounds,
    schedulerResult,
    ...SUCCESS,
    eventIds,
    venueIds,
    drawIds,
  };
}
