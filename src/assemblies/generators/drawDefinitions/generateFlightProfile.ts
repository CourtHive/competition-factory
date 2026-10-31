import { attachFlightProfile as attachProfile } from '@Mutate/events/attachFlightProfile';
import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { chunkArray, chunkByNth, generateRange, shuffleArray } from '@Tools/arrays';
import { modifyEventNotice } from '@Mutate/notifications/eventNotifications';
import { resolveScaleValueNumber } from '@Query/scales/resolveScaleValue';
import { getEveryDrawFlight } from '@Query/event/getEveryDrawFlight';
import { decorateResult } from '@Functions/global/decorateResult';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { getScaledEntries } from '@Query/event/getScaledEntries';
import { getParticipantId } from '@Functions/global/extractors';
import { getDevContext } from '@Global/state/globalState';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { ensureInt } from '@Tools/ensureInt';
import { UUID } from '@Tools/UUID';

// constants and types
import { EXISTING_FLIGHT, EXISTING_PROFILE, ErrorType, MISSING_EVENT } from '@Constants/errorConditionConstants';
import { ENTRIES_SCOPE_UNFLIGHTED, SPLIT_SHUTTLE, SPLIT_WATERFALL } from '@Constants/flightConstants';
import { Entry, Event, StageTypeUnion, Tournament } from '@Types/tournamentTypes';
import { DIRECT_ENTRY_STATUSES } from '@Constants/entryStatusConstants';
import { FlightProfile, ScaleAttributes } from '@Types/factoryTypes';
import { FLIGHT_PROFILE } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';

type GenerateFlightProfileArgs = {
  // which entries are split: ENTRIES_SCOPE_ALL (default) or ENTRIES_SCOPE_UNFLIGHTED (only entries in no flight or draw)
  entriesScope?: string;
  participantIds?: string[]; // only these participants' entries
  excludeParticipantIds?: string[];
  // add the new flights after the event's existing flights, leaving them (and their draws) untouched; refused with
  // EXISTING_FLIGHT if a split participant is already in a flight or a draw
  appendFlights?: boolean;
  // split only entries rated within the band (inclusive), on `scaleAttributes`; unrated entries are left out
  scaleRange?: { min?: number; max?: number };
  scaleAttributes: ScaleAttributes;
  attachFlightProfile?: boolean;
  tournamentRecord: Tournament;
  deleteExisting?: boolean;
  sortDescending?: boolean;
  random?: () => number;
  drawNameRoot?: string;
  scaleSortMethod?: any;
  stage?: StageTypeUnion;
  drawNames?: string[];
  scaledEntries?: any;
  flightsCount: number;
  splitMethod: string; // anything that is not SPLIT_SHUTTLE or SPLIT_WATERFALL results in SPLIT_LEVEL
  uuids?: string[];
  event: Event;
};

export function generateFlightProfile(params: GenerateFlightProfileArgs): {
  flightProfile?: FlightProfile;
  splitEntries?: Entry[][];
  success?: boolean;
  error?: ErrorType;
} {
  const {
    drawNameRoot = 'Flight',
    excludeParticipantIds,
    attachFlightProfile,
    participantIds,
    appendFlights,
    entriesScope,
    scaleRange,
    tournamentRecord,
    scaleAttributes,
    scaleSortMethod,
    deleteExisting,
    sortDescending,
    drawNames = [],
    flightsCount,
    splitMethod,
    uuids = [],
    random,
    event,
    stage,
  } = params;
  const stack = 'generateFlightProfile';
  if (!event) return { error: MISSING_EVENT };
  const eventEntries = event.entries ?? [];

  const { flightProfile } = getFlightProfile({ event });
  if (flightProfile && attachFlightProfile && !deleteExisting && !appendFlights) {
    return { error: EXISTING_PROFILE };
  }

  // every draw is a flight: a participant in any flight, or in any draw, is placed
  const existingFlights =
    appendFlights || entriesScope === ENTRIES_SCOPE_UNFLIGHTED ? getEveryDrawFlight({ event }) : [];
  const placedParticipantIds = new Set(
    existingFlights.flatMap(({ drawEntries }) => (drawEntries ?? []).map(getParticipantId)),
  );
  const inScope = (participantId: string) =>
    (entriesScope !== ENTRIES_SCOPE_UNFLIGHTED || !placedParticipantIds.has(participantId)) &&
    (!participantIds || participantIds.includes(participantId)) &&
    !excludeParticipantIds?.includes(participantId);
  const scopedEntries = eventEntries.filter(({ participantId }) => inScope(participantId));

  // `scaledEntries` orders the split; the scope narrows it
  const scaledEntries = (
    params.scaledEntries ??
    getScaledEntries({
      entries: scopedEntries,
      tournamentRecord,
      scaleAttributes,
      scaleSortMethod,
      sortDescending,
      event,
      stage,
    }).scaledEntries
  )
    .filter(({ participantId }: { participantId: string }) => inScope(participantId))
    .filter((entry: { scaleValue?: unknown }) => !scaleRange || inScaleRange({ entry, scaleRange, scaleAttributes }));

  const scaledEntryParticipantIds = new Set(scaledEntries.map(getParticipantId));
  // a rating band leaves unrated entries out
  const unscaledEntries = shuffleArray(
    (scaleRange ? [] : scopedEntries)
      .filter(({ participantId }) => !scaledEntryParticipantIds.has(participantId))
      .filter(
        (entry: Entry) =>
          (!stage || !entry.entryStage || entry.entryStage === stage) &&
          (!entry.entryStatus || // absence of entryStatus is equivalent to DIRECT_ACCEPTANCE
            DIRECT_ENTRY_STATUSES.includes(entry.entryStatus)),
      ),
    random,
  );

  const flightEntries = scaledEntries.concat(...unscaledEntries);
  const entriesCount = flightEntries.length;

  if (
    appendFlights &&
    flightEntries.some(({ participantId }: { participantId: string }) => placedParticipantIds.has(participantId))
  ) {
    const placed = flightEntries
      .map(getParticipantId)
      .filter((participantId: string) => placedParticipantIds.has(participantId));
    return decorateResult({ result: { error: EXISTING_FLIGHT }, context: { participantIds: placed }, stack });
  }
  // appended flights are numbered after every existing flight (each draw counted as one)
  const flightNumberOffset = appendFlights
    ? Math.max(0, ...existingFlights.map(({ flightNumber }) => ensureInt(flightNumber) || 0))
    : 0;

  // default is SPLIT_LEVEL_BASED - Evenly chunk sorted entries
  const chunkSize = Math.ceil(entriesCount / flightsCount);
  let splitEntries = chunkArray(flightEntries, chunkSize);

  if (splitMethod === SPLIT_WATERFALL) {
    // e.g. 1,2,3,4,1,2,3,4,1,2,3,4,1,2,3,4
    splitEntries = chunkByNth(flightEntries, flightsCount);
  } else if (splitMethod === SPLIT_SHUTTLE) {
    // e.g. 1,2,3,4,4,3,2,1,1,2,3,4,4,3,2,1
    splitEntries = chunkByNth(flightEntries, flightsCount, true);
  }

  // A flight's entries, ordered by scale value. No `seedNumber` is written onto them: they are the event's own entry
  // objects, `Entry` has no such field (the CODES schema refuses it), nothing reads it, and seeding is the draw's
  // `seedAssignments`.
  function getDrawEntries(entriesChunk) {
    return (entriesChunk ?? [])
      .map(({ participantId, scaleValue }) => {
        const entry = eventEntries.find((entry: Entry) => entry.participantId === participantId);
        if (entry?.scaleValue && scaleValue) entry.scaleValue = scaleValue;
        return entry;
      })
      .sort((a, b) => a.scaleValue - b.scaleValue);
  }

  const flights = generateRange(0, flightsCount).map((index) => {
    const flightNumber = flightNumberOffset + index + 1;
    return {
      flightNumber,
      drawId: uuids?.pop() ?? UUID(undefined, random),
      drawEntries: getDrawEntries(splitEntries[index]),
      drawName: (drawNames?.length && drawNames[index]) || `${drawNameRoot} ${flightNumber}`,
    };
  });

  const updatedFlightProfile = {
    scaleAttributes,
    splitMethod,
    flights,
  };

  if (appendFlights) {
    const appendedProfile = { ...flightProfile, flights: [...existingFlights, ...flights] };
    if (attachFlightProfile) {
      setFirstClassOrExtension({
        element: event,
        attribute: 'flightProfile',
        name: FLIGHT_PROFILE,
        value: appendedProfile,
      });
      modifyEventNotice({ event, tournamentId: tournamentRecord?.tournamentId });
    }
    return { flightProfile: makeDeepCopy(appendedProfile, false, true), ...SUCCESS };
  }

  if (attachFlightProfile) {
    const result = attachProfile({
      flightProfile: updatedFlightProfile,
      deleteExisting,
      event,
    });
    return {
      splitEntries: (getDevContext() && splitEntries) || undefined,
      ...result,
    };
  } else {
    return { flightProfile: updatedFlightProfile, ...SUCCESS };
  }
}

type InScaleRangeArgs = {
  scaleRange: { min?: number; max?: number };
  scaleAttributes?: ScaleAttributes;
  entry: { scaleValue?: unknown };
};
function inScaleRange({ entry, scaleRange, scaleAttributes }: InScaleRangeArgs): boolean {
  const value = resolveScaleValueNumber(entry?.scaleValue, {
    accessor: scaleAttributes?.accessor,
    scaleName: scaleAttributes?.scaleName,
  });
  if (value === undefined) return false;
  const { min, max } = scaleRange;
  return (min === undefined || value >= min) && (max === undefined || value <= max);
}
