import { attachFlightProfile as attachProfile } from '@Mutate/events/attachFlightProfile';
import { chunkArray, chunkByNth, generateRange, shuffleArray } from '@Tools/arrays';
import { getScaledEntries } from '@Query/event/getScaledEntries';
import { getParticipantId } from '@Functions/global/extractors';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { getDevContext } from '@Global/state/globalState';
import { UUID } from '@Tools/UUID';

// constants and types
import { EXISTING_PROFILE, ErrorType, MISSING_EVENT } from '@Constants/errorConditionConstants';
import { Entry, Event, StageTypeUnion, Tournament } from '@Types/tournamentTypes';
import { SPLIT_SHUTTLE, SPLIT_WATERFALL } from '@Constants/flightConstants';
import { DIRECT_ENTRY_STATUSES } from '@Constants/entryStatusConstants';
import { FlightProfile, ScaleAttributes } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

type GenerateFlightProfileArgs = {
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
    attachFlightProfile,
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
  if (!event) return { error: MISSING_EVENT };
  const eventEntries = event.entries ?? [];

  const { flightProfile } = getFlightProfile({ event });
  if (flightProfile && attachFlightProfile && !deleteExisting) {
    return { error: EXISTING_PROFILE };
  }

  const scaledEntries =
    params.scaledEntries ??
    getScaledEntries({
      tournamentRecord,
      scaleAttributes,
      scaleSortMethod,
      sortDescending,
      event,
      stage,
    }).scaledEntries;

  const scaledEntryParticipantIds = new Set(scaledEntries.map(getParticipantId));
  const unscaledEntries = shuffleArray(
    eventEntries
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

  function getDrawEntries(entriesChunk) {
    return (entriesChunk ?? [])
      .map(({ participantId, scaleValue }) => {
        const entry = eventEntries.find((entry: Entry) => entry.participantId === participantId);
        if (entry?.scaleValue && scaleValue) entry.scaleValue = scaleValue;
        return entry;
      })
      .sort((a, b) => a.scaleValue - b.scaleValue)
      .map((entry, i) => {
        if (entry.scaleValue) entry.seedNumber = i + 1;
        return entry;
      });
  }

  const flights = generateRange(0, flightsCount).map((index) => {
    const flightNumber = index + 1;
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
