import { checkProfileKeys, ENGINE_SUPPLIED_KEYS, MODIFY_TOURNAMENT_RECORD_KEYS } from './profileKeys';
import { getStageParticipantsCount } from '@Query/drawDefinition/getStageParticipantsCount';
import { scheduleProfileRounds } from '@Mutate/matchUps/schedule/scheduleProfileRounds';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { getStageParticipants } from '@Query/drawDefinition/getStageParticipants';
import { generateFlightDrawDefinitions } from './generateFlightDrawDefinitions';
import { setSchedulingProfile } from '@Mutate/tournaments/schedulingProfile';
import { addTournamentParticipants } from './addTournamentParticipants';
import { generateEventParticipants } from './generateEventParticipants';
import { generateEventWithFlights } from './generateEventWithFlights';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import { generateEventWithDraw } from './generateEventWithDraw';
import { attachProfilePolicies } from './attachProfilePolicies';
import { publishEvent } from '@Mutate/publishing/publishEvent';
import { generateVenues } from '@Mutate/venues/generateVenues';
import { isActiveMatchUp } from '@Query/matchUp/activeMatchUp';
import { cloneState, restoreState } from '@Tools/cloneState';
import { generateFlights } from './generateFlights';
import { addEvent } from '@Mutate/events/addEvent';
import { isObject } from '@Tools/objects';

// constants and types
import { EXISTING_POLICY_TYPE, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import type { MockEventProfile, ModifyTournamentRecordArgs } from '@Types/mocksTypes';
import type { Event, MatchUpStatusUnion, Tournament } from '@Types/tournamentTypes';
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { APPLIED_POLICIES } from '@Constants/extensionConstants';
import { DOUBLES, SINGLES } from '@Constants/eventConstants';
import { SUCCESS } from '@Constants/resultConstants';

type EventPolicyArgs = {
  eventProfile: MockEventProfile;
  tournamentRecord: Tournament;
  profileIndex: number;
  event: Event;
};
type ExistingEventArgs = EventPolicyArgs & { allUniqueParticipantIds: string[]; drawIds: string[] };

/**
 * An existing event's eventProfile `policyDefinitions` replace the event's own policies of those types, but only while
 * nothing has happened under them (CA 2026-10-21): replacing a policy after results would lose the record of the
 * policy the results were produced under. A type the event does not hold yet is attached; the policy it inherited
 * stays recorded where it is. Attached before any new draws, so they are generated under it.
 */
function replaceEventPolicies({ tournamentRecord, eventProfile, profileIndex, event }: EventPolicyArgs) {
  const { policyDefinitions } = eventProfile;
  const option = `eventProfiles[${profileIndex}].policyDefinitions`;
  const ownPolicies = event.extensions?.find((extension) => extension?.name === APPLIED_POLICIES)?.value ?? {};
  const given: Record<string, unknown> = isObject(policyDefinitions)
    ? (policyDefinitions as Record<string, unknown>)
    : {};
  const replaced = Object.keys(given).filter((policyType) => given[policyType] && ownPolicies[policyType]);

  if (replaced.length && eventHasResults(event)) {
    const refused = `${option}.${replaced[0]}`;
    return {
      info: `an event with results keeps its policies: ${refused}`,
      context: { option: refused },
      error: EXISTING_POLICY_TYPE,
    };
  }

  return attachProfilePolicies({ allowReplacement: true, policyDefinitions, tournamentRecord, option, event });
}

// a walkover is a result here, though isActiveMatchUp does not count it (nothing was played)
function eventHasResults(event: Event) {
  return (event.drawDefinitions ?? []).some((drawDefinition) =>
    allDrawMatchUps({ event, drawDefinition }).matchUps?.some(
      (matchUp) =>
        !!matchUp.winningSide ||
        completedMatchUpStatuses.includes(matchUp.matchUpStatus as MatchUpStatusUnion) ||
        isActiveMatchUp(matchUp),
    ),
  );
}

function processExistingEvent({
  allUniqueParticipantIds,
  tournamentRecord,
  eventProfile,
  profileIndex,
  drawIds,
  event,
}: ExistingEventArgs) {
  const { gender, category, eventType } = event;
  const { drawProfiles, publish } = eventProfile;

  const policyRefusal = replaceEventPolicies({ event, eventProfile, tournamentRecord, profileIndex });
  if (policyRefusal) return policyRefusal;

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

    const eventParticipants = uniqueParticipantStages
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
    if (eventParticipants?.error) return eventParticipants;
    const { uniqueDrawParticipants = [], uniqueParticipantIds = [] } = eventParticipants ?? {};

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

/**
 * The call's options an existing event falls back to when its eventProfile does not set them. The profile's
 * own setting wins; `{ ...eventProfile, ...params }` let every top-level key replace it, an undefined one
 * included, and handed the event the call's top-level `drawProfiles` in place of its own.
 */
const EVENT_FALLBACK_KEYS = [
  'autoEntryPositions',
  'completeAllMatchUps',
  'isMock',
  'matchUpStatusProfile',
  'participantsProfile',
  'randomWinningSide',
  'ratingsParameters',
  'uuids',
] as const;

function withFallbacks(eventProfile, params) {
  const resolved = { ...eventProfile };
  for (const key of EVENT_FALLBACK_KEYS) resolved[key] ??= params[key];
  return resolved;
}

function handleExistingEvent({
  allUniqueParticipantIds,
  tournamentRecord,
  profileIndex,
  eventProfile,
  drawIds,
  params,
  event,
}: ExistingEventArgs & { params: ModifyTournamentRecordArgs }) {
  const result = processExistingEvent({
    profileIndex,
    event,
    eventProfile: withFallbacks(eventProfile, params),
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
  profileIndex,
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
    profileIndex,
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

  for (const [profileIndex, eventProfile] of eventProfiles.entries()) {
    const event = findEventByProfile(tournamentRecord.events, eventProfile);

    if (event) {
      const result = handleExistingEvent({
        profileIndex,
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
        profileIndex,
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

/**
 * All or nothing by default: a refusal (or a throw) leaves the record exactly as it was passed, in the
 * caller's own objects, and the caller's `uuids` pool is consumed only when the call succeeds.
 *
 * Before (assessment M10, 2026-10-17): a valid draw followed by an unrecognized draw type returned
 * ERR_UNRECOGNIZED_DRAW_TYPE with 4 participants and an event already written, and the error said
 * nothing about them; a corrected retry then stacked onto the half-built record.
 *
 * `keepPartial: true` keeps what was written before the refusal and reports it as `retained` (the ids
 * the record gained, read from the record itself), for a caller who would rather inspect or keep a
 * partial build than start again.
 */
export function modifyTournamentRecord(params) {
  if (!params?.tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  // checked before anything is written: an option the generators do not read is refused, not ignored
  const unknownOption = checkProfileKeys(params, MODIFY_TOURNAMENT_RECORD_KEYS, ENGINE_SUPPLIED_KEYS);
  if (unknownOption) return unknownOption;
  const keepPartial = params.keepPartial === true;
  const before = recordIds(params.tournamentRecord);
  const snapshot = keepPartial ? undefined : cloneState(params.tournamentRecord);
  const uuids = !keepPartial && Array.isArray(params.uuids) ? [...params.uuids] : params.uuids;

  let result;
  try {
    result = applyModifications({ ...params, uuids });
  } catch (err) {
    if (snapshot) restoreState(snapshot);
    throw err;
  }

  if (result?.error) {
    if (snapshot) {
      restoreState(snapshot);
      return result;
    }
    return { ...result, retained: retainedSince(before, params.tournamentRecord) };
  }

  // the pool was drawn from a copy: commit what the successful call consumed
  if (uuids !== params.uuids && Array.isArray(params.uuids)) params.uuids.splice(0, params.uuids.length, ...uuids);
  return result;
}

type RecordIds = { participantIds: string[]; eventIds: string[]; drawIds: string[]; venueIds: string[] };

function recordIds(tournamentRecord: Tournament): RecordIds {
  const events = tournamentRecord.events ?? [];
  return {
    participantIds: (tournamentRecord.participants ?? []).map(({ participantId }) => participantId),
    drawIds: events.flatMap((event) => (event.drawDefinitions ?? []).map(({ drawId }) => drawId)),
    venueIds: (tournamentRecord.venues ?? []).map(({ venueId }) => venueId),
    eventIds: events.map(({ eventId }) => eventId),
  };
}

function retainedSince(before: RecordIds, tournamentRecord: Tournament): RecordIds {
  const after = recordIds(tournamentRecord);
  const added = (key: keyof RecordIds) => after[key].filter((id) => !before[key].includes(id));
  return {
    participantIds: added('participantIds'),
    eventIds: added('eventIds'),
    drawIds: added('drawIds'),
    venueIds: added('venueIds'),
  };
}

function applyModifications(params) {
  const { schedulingProfile, tournamentRecord, autoSchedule, periodLength, venueProfiles, drawProfiles, uuids } =
    params;

  // the caller's profiles are configuration, not scratch space: the gender and idPrefix adjustments
  // below are made on copies, so passing the same profile twice asks for the same thing twice
  const participantsProfile = { ...params.participantsProfile };
  const eventProfiles = params.eventProfiles?.map((eventProfile) => ({ ...eventProfile }));

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

  // what the nested generators read as `params`: the adjusted copies, never the caller's objects
  const generationParams = {
    ...params,
    participantsProfile: params.participantsProfile ? participantsProfile : undefined,
    eventProfiles,
  };

  if (eventProfiles) {
    const eventResult = processEventProfiles({
      eventProfiles,
      tournamentRecord,
      allUniqueParticipantIds,
      eventIds,
      drawIds,
      params: generationParams,
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
      params: generationParams,
    });
    if (drawResult.error) return drawResult;
  }

  const venueIds = venueProfiles?.length ? generateVenues({ tournamentRecord, venueProfiles }) : [];
  if (!Array.isArray(venueIds)) return venueIds;

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
