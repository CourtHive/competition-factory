import { createTournamentRecord } from '@Generators/tournamentRecords/createTournamentRecord';
import { scheduleProfileRounds } from '@Mutate/matchUps/schedule/scheduleProfileRounds';
import { checkProfileKeys, GENERATE_TOURNAMENT_RECORD_KEYS } from './profileKeys';
import { attachPolicies } from '@Mutate/extensions/policies/attachPolicies';
import { addTournamentParticipants } from './addTournamentParticipants';
import { addParticipants } from '@Mutate/participants/addParticipants';
import { generateEventWithFlights } from './generateEventWithFlights';
import { generateScheduledRounds } from './generateScheduledRounds';
import { generateEventWithDraw } from './generateEventWithDraw';
import { processLeagueProfiles } from './processLeagueProfiles';
import { cycleMutationStatus } from '@Global/state/globalState';
import { formatDate, isValidDateString } from '@Tools/dateTime';
import { isValidExtension } from '@Validators/isValidExtension';
import { generateVenues } from '@Mutate/venues/generateVenues';
import { applyScenarioProfile } from './applyScenarioProfile';
import { definedAttributes } from '@Tools/definedAttributes';
import { addDays, extractDate } from '@Tools/plainDate';
import { addEvent } from '@Mutate/events/addEvent';
import { randomMember } from '@Tools/arrays';
import { now } from '@Tools/clock';

// constants and fixtures
import { ErrorType, INVALID_DATE, INVALID_VALUES } from '@Constants/errorConditionConstants';
import defaultRatingsParameters from '@Fixtures/ratings/ratingsParameters';
import type { GenerateTournamentRecordArgs } from '@Types/mocksTypes';
import { SUCCESS } from '@Constants/resultConstants';

// SELECTED WITH `randomMember`, NEVER `randomPop`. `randomPop` SPLICES, and this array is a
// module-level constant — so popping from it permanently consumed one name per call and, after the
// ninth `generateTournamentRecord` in a process, left it empty.
//
// An empty array makes `randomPop` return `undefined` WITHOUT drawing, so from the tenth call the
// shared seeded RNG was one draw out of step for the rest of the process. `nonRandom` then no longer
// determined the result: the same seed produced different participants, different BYE placement and
// a different draw depending only on how many tournaments had been generated before it.
//
// Measured before the fix: draws consumed per call 8970, 8970, … (nine times), then 8969 forever;
// the first participant changed from "Ursula Escher" to "Ursula Yates" and a BYE moved from
// drawPosition 23 to 10. In the exit-propagation sweep this made three of thirty-one failing seeds
// unreproducible in isolation, which is why per-seed attribution in that census could not be
// trusted. See `mockTournamentNameReuse.test.ts`.
const DEFAULT_SPAN_DAYS = 7;

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

export function generateTournamentRecord(params: GenerateTournamentRecordArgs) {
  // an option the generators do not read is refused, not ignored (phase 4c)
  const unknownOption = checkProfileKeys(params, GENERATE_TOURNAMENT_RECORD_KEYS);
  if (unknownOption) return unknownOption;
  const {
    tournamentName = randomMember(mockTournamentNames, params?.random),
    ratingsParameters = defaultRatingsParameters,
    tournamentExtensions,
    policyDefinitions,
    schedulingProfile,
    venueProfiles,
    uuids,
  } = params ?? {};

  const isMock = params?.isMock === false ? undefined : true;

  const dates = resolveDates(params?.startDate, params?.endDate);
  if (dates.error) return dates;
  const { startDate, endDate } = dates;

  if (!areValidProfiles(params)) return { error: INVALID_VALUES };

  const tournamentRecord = createTournamentRecord({
    ...params.tournamentAttributes,
    tournamentName,
    startDate,
    endDate,
    isMock,
  });
  // an invalid header (a bad localTimeZone, say) comes back as an error envelope; carrying on would
  // decorate that envelope with participants and events and report it as a generated tournament
  if (tournamentRecord.error) return tournamentRecord;

  const venueIds = venueProfiles?.length ? generateVenues({ tournamentRecord, venueProfiles, uuids }) : [];
  if (!Array.isArray(venueIds)) return venueIds;

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

  const scheduled = schedulingProfile ? scheduleRounds({ ...params, tournamentRecord }) : {};
  // a refused schedule is a refusal, not an empty schedule
  if (scheduled.error) return scheduled;
  if (scheduled.schedulerResult?.error) return scheduled.schedulerResult;
  const { scheduledRounds = undefined, schedulerResult = {} } = scheduled;

  // Anchoring runs AFTER scheduling: it shifts the times the scheduler produced rather than
  // replacing them, so matchUp average and recovery spacing survive intact.
  const scenarioResult = params?.scenarioProfile
    ? applyScenarioProfile({ tournamentRecord, scenarioProfile: params.scenarioProfile })
    : undefined;
  if (scenarioResult?.error) return scenarioResult;

  // clear globalState modified flag;
  cycleMutationStatus();

  return definedAttributes({
    ...SUCCESS,
    tournamentRecord,
    scheduledRounds,
    schedulerResult,
    scenarioResult,
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

function scheduleRounds(params): { scheduledRounds?: any; schedulerResult?: any; error?: ErrorType } {
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

/**
 * A bound the caller gives is kept; a missing one is derived from it by the default span of a week.
 *
 * Before (M7, 2026-10-17): an `endDate` alone became the START, and the end was overwritten with
 * today + 7, so `endDate: 2027-02-01` produced 2027-02-01 to 2026-10-24. And a `startDate` alone was
 * parsed as UTC then advanced in local time, which is start + 6 west of UTC. Calendar dates only.
 */
function resolveDates(
  startDate?: string,
  endDate?: string,
): { startDate: string; endDate: string; error?: undefined } | { error: ErrorType; info?: string } {
  if ((startDate && !isValidDateString(startDate)) || (endDate && !isValidDateString(endDate)))
    return { error: INVALID_DATE };
  const resolved = deriveMissingDate(startDate, endDate);
  // an inverted range is refused before any participant or schedule is generated for it
  if (extractDate(resolved.endDate) < extractDate(resolved.startDate))
    return { error: INVALID_DATE, info: 'endDate precedes startDate' };
  return resolved;
}

function deriveMissingDate(startDate?: string, endDate?: string) {
  if (startDate && endDate) return { startDate, endDate };
  if (startDate) return { startDate, endDate: addDays(startDate, DEFAULT_SPAN_DAYS) };
  if (endDate) return { startDate: addDays(endDate, -DEFAULT_SPAN_DAYS), endDate };
  const today = formatDate(now());
  return { startDate: today, endDate: addDays(today, DEFAULT_SPAN_DAYS) };
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
