import { checkProfileKeys, GENERATE_ENGINE_SUPPLIED_KEYS, GENERATE_TOURNAMENT_RECORD_KEYS } from './profileKeys';
import { createTournamentRecord } from '@Generators/tournamentRecords/createTournamentRecord';
import { scheduleProfileRounds } from '@Mutate/matchUps/schedule/scheduleProfileRounds';
import { addTournamentParticipants } from './addTournamentParticipants';
import { addParticipants } from '@Mutate/participants/addParticipants';
import { generateEventWithFlights } from './generateEventWithFlights';
import { generateScheduledRounds } from './generateScheduledRounds';
import { generateEventWithDraw } from './generateEventWithDraw';
import { processLeagueProfiles } from './processLeagueProfiles';
import { cycleMutationStatus } from '@Global/state/globalState';
import { attachProfilePolicies } from './attachProfilePolicies';
import { formatDate, isValidDateString } from '@Tools/dateTime';
import { isValidExtension } from '@Validators/isValidExtension';
import { generateVenues } from '@Mutate/venues/generateVenues';
import { applyScenarioProfile } from './applyScenarioProfile';
import { definedAttributes } from '@Tools/definedAttributes';
import { addDays, extractDate } from '@Tools/plainDate';
import { randomMember } from '@Tools/arrays';
import { now } from '@Tools/clock';

// constants and fixtures
import { ErrorType, INVALID_DATE, INVALID_VALUES } from '@Constants/errorConditionConstants';
import defaultRatingsParameters from '@Fixtures/ratings/ratingsParameters';
import type { GenerateTournamentRecordArgs } from '@Types/mocksTypes';
import type { Tournament } from '@Types/tournamentTypes';
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
  const unknownOption = checkProfileKeys(params, GENERATE_TOURNAMENT_RECORD_KEYS, GENERATE_ENGINE_SUPPLIED_KEYS);
  if (unknownOption) return unknownOption;
  const {
    // drawn exactly when it was before tournamentAttributes.tournamentName was read, so a seed's stream is unchanged
    tournamentName: drawnName = randomMember(mockTournamentNames, params?.random),
    ratingsParameters = defaultRatingsParameters,
    tournamentExtensions,
    policyDefinitions,
    schedulingProfile,
    venueProfiles,
    uuids,
  } = params ?? {};

  const isMock = params?.isMock === false ? undefined : true;

  // the dates and the name may come at the top level or in tournamentAttributes; either is read, and a
  // disagreement is refused
  const supplied = readSuppliedHeader(params);
  if (supplied.error) return supplied;
  const tournamentName = supplied.tournamentName ?? drawnName;
  const dates = resolveDates(supplied.startDate, supplied.endDate);
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

  const policyRefusal = attachProfilePolicies({ policyDefinitions, tournamentRecord, option: 'policyDefinitions' });
  if (policyRefusal) return policyRefusal;

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

  // auto-scheduled: the draws' results are applied once the tournament is scheduled, as a real one is played, since the
  // schedulers never place a completed matchUp (CA 2026-10-23)
  const deferredOutcomes: DeferredOutcomes | undefined = schedulingProfile && params?.autoSchedule ? [] : undefined;
  const profilesResult = processAllProfiles({
    params: deferredOutcomes ? { ...params, deferredOutcomes } : params,
    allUniqueParticipantIds,
    useExistingParticipants,
    ratingsParameters,
    tournamentRecord,
    eventIds,
    venueIds,
    drawIds,
  });
  if (profilesResult?.error) return profilesResult;

  const scheduled = scheduleThenPlay({ params, tournamentRecord, schedulingProfile, deferredOutcomes });
  if (scheduled.error) return scheduled;
  const { scheduledRounds = undefined, schedulerResult = {}, scenarioResult = undefined } = scheduled;

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
    const addToRecord = drawProfile?.addEvent !== false;
    const result = generateEventWithDraw({
      allUniqueParticipantIds,
      tournamentRecord,
      drawProfile,
      drawIndex,
      ...params,
      // after the spread: a caller's params cannot switch the order back
      addToRecord,
    });
    if (result.error) return result;

    const { drawId, eventId, uniqueParticipantIds } = result;

    if (addToRecord) {
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

type DeferredOutcomes = (() => { error?: ErrorType } | undefined)[];

/**
 * The profile's rounds scheduled, the schedule anchored and courted (`scenarioProfile`), and only then the results
 * deferred until now applied, as a real tournament is played.
 *
 * Anchoring runs AFTER scheduling: it shifts the times the scheduler produced rather than replacing them, so matchUp
 * average and recovery spacing survive intact. Playing runs after anchoring and courts (7.20.0 played between them):
 * the court grid never places a completed matchUp, so results applied first left every completed matchUp without a
 * court, and a matchUp shifted after its result was judged for played order one step at a time.
 */
type ScheduleThenPlayArgs = {
  deferredOutcomes?: DeferredOutcomes;
  params: Record<string, any>;
  schedulingProfile?: unknown[];
  tournamentRecord: Tournament;
};

function scheduleThenPlay({ schedulingProfile, tournamentRecord, deferredOutcomes, params }: ScheduleThenPlayArgs): {
  scenarioResult?: ReturnType<typeof applyScenarioProfile>;
  scheduledRounds?: any;
  schedulerResult?: any;
  error?: ErrorType;
} {
  const scheduled = schedulingProfile ? scheduleRounds({ ...params, tournamentRecord }) : {};
  // a refused schedule is a refusal, not an empty schedule
  if (scheduled.error) return scheduled;
  if (scheduled.schedulerResult?.error) return scheduled.schedulerResult;

  const play = () => {
    for (const applyOutcomes of deferredOutcomes ?? []) {
      const outcomesResult = applyOutcomes();
      if (outcomesResult?.error) return outcomesResult;
    }
    return undefined;
  };

  if (!params?.scenarioProfile) {
    const played = play();
    return played?.error ? played : scheduled;
  }

  const scenarioResult = applyScenarioProfile({ tournamentRecord, scenarioProfile: params.scenarioProfile, play });
  if (scenarioResult.error) return scenarioResult;
  return { ...scheduled, scenarioResult };
}

function scheduleRounds(params): { scheduledRounds?: any; schedulerResult?: any; error?: ErrorType } {
  const { schedulingProfile, tournamentRecord, autoSchedule, periodLength } = params;
  const result = generateScheduledRounds({
    schedulingProfile,
    tournamentRecord,
  });
  if (result.error) return result;
  const scheduledRounds = result.scheduledRounds;

  if (autoSchedule) {
    const { tournamentId } = tournamentRecord;
    const tournamentRecords = { [tournamentId]: tournamentRecord };

    const schedulerResult = scheduleProfileRounds({ tournamentRecords, periodLength });

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
const HEADER_FIELDS = ['startDate', 'endDate', 'tournamentName'] as const;

/**
 * The tournament dates and name a caller supplied, from the top-level params or from `tournamentAttributes`.
 *
 * `tournamentAttributes` is spread into the record and the resolved dates and name are written over it,
 * so a value given only there used to be overwritten by the default (today, a random mock name),
 * silently. It is read instead; a value given in both places that disagrees is refused, naming both,
 * since picking one would hide the other.
 */
function readSuppliedHeader(params?: GenerateTournamentRecordArgs): {
  tournamentName?: string;
  startDate?: string;
  endDate?: string;
  error?: ErrorType;
  info?: string;
  context?: { option: string; conflictsWith: string };
} {
  const attributes: Record<string, any> = params?.tournamentAttributes ?? {};
  const supplied: { startDate?: string; endDate?: string; tournamentName?: string } = {};
  for (const field of HEADER_FIELDS) {
    const topLevel = params?.[field];
    const attribute = attributes[field];
    if (topLevel != null && attribute != null && topLevel !== attribute) {
      const option = `tournamentAttributes.${field}`;
      return {
        info: `${option} (${attribute}) disagrees with ${field} (${topLevel}); supply it once`,
        context: { option, conflictsWith: field },
        error: INVALID_VALUES,
      };
    }
    supplied[field] = topLevel ?? attribute ?? undefined;
  }
  return supplied;
}

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
