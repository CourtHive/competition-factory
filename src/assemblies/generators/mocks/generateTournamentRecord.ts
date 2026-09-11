import { scheduleProfileRounds } from '@Mutate/matchUps/schedule/scheduleProfileRounds';
import { createTournamentRecord } from '../tournamentRecords/createTournamentRecord';
import { attachPolicies } from '@Mutate/extensions/policies/attachPolicies';
import { addTournamentParticipants } from './addTournamentParticipants';
import { generateEventWithFlights } from './generateEventWithFlights';
import { generateScheduledRounds } from './generateScheduledRounds';
import { formatDate, isValidDateString } from '@Tools/dateTime';
import { addParticipants } from '@Mutate/participants/addParticipants';
import { generateEventWithDraw } from './generateEventWithDraw';
import { cycleMutationStatus } from '@Global/state/globalState';
import { isValidExtension } from '@Validators/isValidExtension';
import { generateVenues } from '@Mutate/venues/generateVenues';
import { processLeagueProfiles } from './processLeagueProfiles';
import { definedAttributes } from '@Tools/definedAttributes';
import { Extension, Participant } from '@Types/tournamentTypes';
import { addEvent } from '@Mutate/events/addEvent';
import { randomPop } from '@Tools/arrays';

// constants and fixtures
import { INVALID_DATE, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { ParticipantsProfile, PolicyDefinitions } from '@Types/factoryTypes';
import defaultRatingsParameters from '@Fixtures/ratings/ratingsParameters';
import { SUCCESS } from '@Constants/resultConstants';

const mockTournamentNames = [
  'Generated Tournament',
  'CourtHive Challenge',
  'Replication Crisis',
  'Open Competition',
  'Factory Follies',
  'Mock Tournament',
  'Atomic Culture',
  'Racket Rally',
  'Stats Fail',
];

type GenerateTournamentRecordArgs = {
  // Pre-built participants supplied by the caller. When non-empty, factory
  // adds them directly to the tournament instead of synthesizing mocks via
  // `addTournamentParticipants` / `generateEventParticipants`. Used by
  // ingest pipelines (courthive-ingest's federation adapters) where stable
  // provider-issued IDs need to be preserved through the generated shape.
  participants?: Participant[];
  participantsProfile?: ParticipantsProfile;
  scheduleCompletedMatchUps?: boolean;
  tournamentExtensions?: Extension[];
  policyDefinitions?: PolicyDefinitions;
  completeAllMatchUps?: boolean;
  tournamentAttributes?: any;
  ratingsParameters?: any;
  tournamentName?: string;
  schedulingProfile?: any;
  random?: () => number;
  autoSchedule?: boolean;
  leagueProfiles?: any[];
  eventProfiles?: any[];
  venueProfiles?: any[];
  drawProfiles?: any[];
  startDate?: string;
  endDate?: string;
  isMock?: boolean;
  uuids?: string[];
};

export function generateTournamentRecord(params: GenerateTournamentRecordArgs) {
  let { startDate, endDate } = params ?? {};
  const {
    tournamentName = randomPop(mockTournamentNames, params?.random),
    ratingsParameters = defaultRatingsParameters,
    tournamentExtensions,
    policyDefinitions,
    schedulingProfile,
    venueProfiles,
    uuids,
  } = params ?? {};

  const isMock = params?.isMock === false ? undefined : true;

  if ((startDate && !isValidDateString(startDate)) || (endDate && !isValidDateString(endDate)))
    return { error: INVALID_DATE };

  if (!areValidProfiles(params)) return { error: INVALID_VALUES };

  ({ startDate, endDate } = resolveDates(startDate, endDate));

  const tournamentRecord = createTournamentRecord({
    ...params.tournamentAttributes,
    tournamentName,
    startDate,
    endDate,
    isMock,
  });

  const venueIds = venueProfiles?.length ? generateVenues({ tournamentRecord, venueProfiles, uuids }) : [];

  // attach any valid tournamentExtensions
  if (tournamentExtensions?.length && Array.isArray(tournamentExtensions)) {
    const extensions = tournamentExtensions.filter((extension) => isValidExtension({ extension }));

    if (extensions?.length) Object.assign(tournamentRecord, { extensions, isMock });
  }

  if (typeof policyDefinitions === 'object') {
    for (const policyType of Object.keys(policyDefinitions)) {
      attachPolicies({
        policyDefinitions: { [policyType]: policyDefinitions[policyType] },
        tournamentRecord,
      });
    }
  }

  // Caller-supplied participants are loaded directly and short-circuit the
  // synthesis path. Downstream `generateEventWithFlights` /
  // `generateEventWithDraw` / `getStageParticipantsCount` receive the same
  // flag so they skip per-event / per-draw participant generation and pull
  // entries from the existing tournament pool (still filtered by event
  // gender, eventType, participantType).
  const useExistingParticipants = Boolean(params?.participants?.length);

  if (useExistingParticipants) {
    const result = addParticipants({ tournamentRecord, participants: params.participants });
    if (result.error) return result;
  } else {
    const needsParticipants =
      !params?.leagueProfiles?.length ||
      params.eventProfiles?.length ||
      params.drawProfiles?.length ||
      params.participantsProfile;

    if (needsParticipants) {
      const result = addTournamentParticipants({ tournamentRecord, ...params });
      if (!result.success) return result;
    }
  }

  const allUniqueParticipantIds: string[] = [],
    eventIds: string[] = [],
    drawIds: string[] = [];

  const profilesResult = processAllProfiles({
    allUniqueParticipantIds,
    useExistingParticipants,
    ratingsParameters,
    tournamentRecord,
    params,
    eventIds,
    venueIds,
    drawIds,
  });
  if (profilesResult?.error) return profilesResult;

  const { scheduledRounds = undefined, schedulerResult = {} } = schedulingProfile
    ? scheduleRounds({ ...params, tournamentRecord })
    : {};

  // clear globalState modified flag;
  cycleMutationStatus();

  return definedAttributes({
    ...SUCCESS,
    tournamentRecord,
    scheduledRounds,
    schedulerResult,
    eventIds,
    venueIds,
    drawIds,
  });
}

function processDrawProfiles(params) {
  const { tournamentRecord, drawProfiles, allUniqueParticipantIds, eventIds, drawIds } = params;
  let drawIndex = 0;
  for (const drawProfile of drawProfiles) {
    let result = generateEventWithDraw({
      allUniqueParticipantIds,
      tournamentRecord,
      drawProfile,
      drawIndex,
      ...params,
    });
    if (result.error) return result;

    const { drawId, eventId, event, uniqueParticipantIds } = result;

    if (drawProfile?.addEvent !== false) {
      result = addEvent({
        suppressNotifications: false,
        internalUse: true,
        tournamentRecord,
        event,
      });
      if (result.error) return result;

      if (drawId) drawIds.push(drawId);
      eventIds.push(eventId);
    }

    if (uniqueParticipantIds?.length) allUniqueParticipantIds.push(...uniqueParticipantIds);

    drawIndex += 1;
  }
}

function processEventProfiles(params) {
  const { eventProfiles, allUniqueParticipantIds, eventIds, drawIds } = params;

  let eventIndex = 0;
  for (const eventProfile of eventProfiles) {
    const result = generateEventWithFlights({ ...params, eventIndex, eventProfile });
    if (result.error) return result;

    const { eventId, drawIds: generatedDrawIds, uniqueParticipantIds } = result;

    if (generatedDrawIds) drawIds.push(...generatedDrawIds);
    eventIds.push(eventId);

    if (uniqueParticipantIds?.length) allUniqueParticipantIds.push(...uniqueParticipantIds);

    eventIndex += 1;
  }
}

function scheduleRounds(params): { scheduledRounds?: any; schedulerResult?: any } {
  const { schedulingProfile, tournamentRecord, autoSchedule, periodLength, scheduleCompletedMatchUps } = params;
  const result = generateScheduledRounds({
    schedulingProfile,
    tournamentRecord,
  });
  if (result.error) return result;
  const scheduledRounds = result.scheduledRounds;

  if (autoSchedule) {
    const { tournamentId } = tournamentRecord;
    const tournamentRecords = { [tournamentId]: tournamentRecord };

    const schedulerResult = scheduleProfileRounds({
      scheduleCompletedMatchUps,
      tournamentRecords,
      periodLength,
    });

    return { schedulerResult, scheduledRounds };
  }

  return { scheduledRounds };
}

function areValidProfiles(params) {
  return !(
    (params.leagueProfiles && !Array.isArray(params.leagueProfiles)) ||
    (params.eventProfiles && !Array.isArray(params.eventProfiles)) ||
    (params.drawProfiles && !Array.isArray(params.drawProfiles))
  );
}

function resolveDates(startDate, endDate) {
  let resolvedStart = startDate;
  let resolvedEnd = endDate;

  if (!resolvedStart) {
    const tournamentDate = new Date();
    resolvedStart = formatDate(resolvedEnd ?? tournamentDate);
    resolvedEnd = formatDate(tournamentDate.setDate(tournamentDate.getDate() + 7));
  }
  if (!resolvedEnd) {
    const tournamentDate = new Date(resolvedStart);
    resolvedEnd = formatDate(tournamentDate.setDate(tournamentDate.getDate() + 7));
  }

  return { startDate: resolvedStart, endDate: resolvedEnd };
}

function processAllProfiles({
  allUniqueParticipantIds,
  useExistingParticipants,
  ratingsParameters,
  tournamentRecord,
  params,
  eventIds,
  venueIds,
  drawIds,
}) {
  if (params.leagueProfiles) {
    const result = processLeagueProfiles({
      allUniqueParticipantIds,
      tournamentRecord,
      ...params,
      eventIds,
      venueIds,
      drawIds,
    });
    if (result?.error) return result;
  }

  if (params.drawProfiles) {
    const result = processDrawProfiles({
      allUniqueParticipantIds,
      useExistingParticipants,
      ratingsParameters,
      tournamentRecord,
      ...params,
      eventIds,
      drawIds,
    });
    if (result?.error) return result;
  }

  if (params.eventProfiles) {
    const result = processEventProfiles({
      allUniqueParticipantIds,
      useExistingParticipants,
      ratingsParameters,
      tournamentRecord,
      ...params,
      eventIds,
      drawIds,
    });
    if (result?.error) return result;
  }

  return undefined;
}
