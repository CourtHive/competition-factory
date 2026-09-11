import { getStageParticipantsCount } from '@Query/drawDefinition/getStageParticipantsCount';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { getStageParticipants } from '@Query/drawDefinition/getStageParticipants';
import { generateFlightDrawDefinitions } from './generateFlightDrawDefinitions';
import { attachPolicies } from '@Mutate/extensions/policies/attachPolicies';
import { generateEventParticipants } from './generateEventParticipants';
import { addEventEntries } from '@Mutate/entries/addEventEntries';
import { addEventTimeItem } from '@Mutate/timeItems/addTimeItem';
import { getParticipantId } from '@Functions/global/extractors';
import { isValidExtension } from '@Validators/isValidExtension';
import { publishEvent } from '@Mutate/publishing/publishEvent';
import tieFormatDefaults from '../templates/tieFormatDefaults';
import { generateFlights } from './generateFlights';
import { addEvent } from '@Mutate/events/addEvent';
import { UUID } from '@Tools/UUID';

// constants
import { SINGLES, DOUBLES, TEAM } from '@Constants/eventConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';

export function generateEventWithFlights(params) {
  const {
    allUniqueParticipantIds,
    useExistingParticipants,
    matchUpStatusProfile,
    participantsProfile,
    completeAllMatchUps,
    autoEntryPositions,
    hydrateCollections,
    randomWinningSide,
    ratingsParameters,
    tournamentRecord,
    eventProfile,
    eventIndex,
    publish,
    random,
    isMock,
    uuids,
  } = params;
  let gender = eventProfile.gender;
  let eventName = eventProfile.eventName;

  const {
    eventType = SINGLES,
    policyDefinitions,
    drawProfiles = [],
    eventExtensions,
    surfaceCategory,
    tieFormatName,
    processCodes,
    discipline,
    eventLevel,
    timeItems,
    ballType,
    category,
  } = eventProfile;

  const eventId = eventProfile.eventId || UUID(undefined, random);
  const tieFormat =
    eventProfile.tieFormat ||
    (eventType === TEAM
      ? tieFormatDefaults({
          namedFormat: tieFormatName,
          event: { eventId, category, gender },
          hydrateCollections,
          isMock,
        })
      : undefined);

  const targetParticipants = tournamentRecord.participants;

  for (const drawProfile of drawProfiles) {
    if (!gender && drawProfile.gender) gender = drawProfile?.gender;
  }

  const { stageParticipantsCount, uniqueParticipantsCount, uniqueParticipantStages } = getStageParticipantsCount({
    drawProfiles,
    category,
    gender,
    useExistingParticipants,
  });

  const eventParticipantType =
    (isMatchUpEventType(SINGLES)(eventType) && INDIVIDUAL) ||
    (isMatchUpEventType(DOUBLES)(eventType) && PAIR) ||
    eventType;

  const { uniqueDrawParticipants = [], uniqueParticipantIds = [] } = uniqueParticipantStages
    ? generateEventParticipants({
        event: { eventType, category, gender },
        uniqueParticipantsCount,
        participantsProfile,
        ratingsParameters,
        tournamentRecord,
        eventProfile,
        eventIndex,
        uuids,
      })
    : {};

  const categoryName = category?.categoryName || category?.ageCategoryCode || category?.ratingType;
  eventName = eventName || categoryName || 'Generated Event';

  const newEvent = buildEventObject({
    eventProfile,
    surfaceCategory,
    processCodes,
    discipline,
    eventLevel,
    eventExtensions,
    policyDefinitions,
    timeItems,
    eventName,
    eventType,
    tieFormat,
    ballType,
    category,
    eventId,
    gender,
    categoryName,
  });

  let drawIds;
  const eventResult: any = addEvent({
    suppressNotifications: false,
    internalUse: true,
    tournamentRecord,
    event: newEvent,
  });
  if (eventResult.error) return eventResult;
  const event = eventResult?.event;

  // Generate Flights ---------------------------------------------------------
  const { stageParticipants } = getStageParticipants({
    allUniqueParticipantIds,
    stageParticipantsCount,
    eventParticipantType,
    targetParticipants,
    gender,
  });

  if (drawProfiles?.length) {
    const flightResult = generateFlights({
      uniqueDrawParticipants,
      useExistingParticipants,
      autoEntryPositions,
      stageParticipants,
      tournamentRecord,
      drawProfiles,
      category,
      gender,
      event,
    });
    if (flightResult.error) return flightResult;

    const drawDefinitionResult = generateFlightDrawDefinitions({
      matchUpStatusProfile,
      completeAllMatchUps,
      randomWinningSide,
      tournamentRecord,
      drawProfiles,
      random,
      isMock,
      event,
    });
    if (drawDefinitionResult.error) return drawDefinitionResult;
    drawIds = drawDefinitionResult.drawIds;
  } else if (eventProfile?.participantsProfile?.participantsCount) {
    const eventParticipantIds = uniqueDrawParticipants.map(getParticipantId);

    if (eventParticipantIds.length) {
      const result = addEventEntries({
        participantIds: eventParticipantIds,
        autoEntryPositions,
        tournamentRecord,
        entryStage: MAIN,
        event,
      });
      if (result.error) return result;
    }
  }

  if (publish) {
    publishEvent({ tournamentRecord, event });
  }

  // When pulling from a preset pool, report the participants this event consumed
  // so subsequent events (via `allUniqueParticipantIds`) don't re-select them.
  // Synthesized participants are already tracked through `uniqueParticipantIds`.
  const consumedExistingIds = useExistingParticipants
    ? [...(stageParticipants.MAIN ?? []), ...(stageParticipants.QUALIFYING ?? [])].map((p) => p.participantId)
    : [];

  return {
    drawIds,
    eventId,
    uniqueParticipantIds: [...new Set([...uniqueParticipantIds, ...consumedExistingIds])],
  };
}

function buildEventObject({
  eventProfile,
  surfaceCategory,
  processCodes,
  discipline,
  eventLevel,
  eventExtensions,
  policyDefinitions,
  timeItems,
  eventName,
  eventType,
  tieFormat,
  ballType,
  category,
  eventId,
  gender,
  categoryName,
}) {
  let { eventAttributes } = eventProfile;
  if (typeof eventAttributes !== 'object') eventAttributes = {};

  const newEvent = {
    ...eventAttributes,
    surfaceCategory,
    processCodes,
    discipline,
    eventLevel,
    eventName,
    eventType,
    tieFormat,
    ballType,
    category,
    eventId,
    gender,
  };

  if (eventExtensions?.length && Array.isArray(eventExtensions)) {
    const extensions = eventExtensions.filter(isValidExtension);
    if (extensions?.length) Object.assign(newEvent, { extensions });
  }

  if (Array.isArray(timeItems)) {
    timeItems.forEach((timeItem) => addEventTimeItem({ event: newEvent, timeItem }));
  }

  if (typeof policyDefinitions === 'object') {
    for (const policyType of Object.keys(policyDefinitions)) {
      attachPolicies({
        policyDefinitions: { [policyType]: policyDefinitions[policyType] },
        event: newEvent,
      });
    }
  }

  if (newEvent.category) newEvent.category.categoryName = categoryName;

  return newEvent;
}
