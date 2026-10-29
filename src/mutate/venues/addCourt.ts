import { courtTemplate } from '@Assemblies/generators/templates/courtTemplate';
import { validDateAvailability } from '@Validators/validateDateAvailability';
import { extractDate, extractTime, formatDate } from '@Tools/dateTime';
import { decorateResult } from '@Functions/global/decorateResult';
import { addNotice } from '@Global/state/globalState';
import { findVenue } from '@Query/venues/findVenue';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { generateRange } from '@Tools/arrays';
import { isNumeric } from '@Tools/math';
import { UUID } from '@Tools/UUID';

// constants and types
import { Availability, Court, Tournament, Venue } from '@Types/tournamentTypes';
import { MODIFY_VENUE } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import {
  MISSING_VENUE_ID,
  MISSING_COURTS_INFO,
  VENUE_NOT_FOUND,
  COURT_EXISTS,
  INVALID_VALUES,
} from '@Constants/errorConditionConstants';

type AddCourtArgs = {
  tournamentRecord: Tournament;
  disableNotice?: boolean;
  courtId?: string;
  venueId: string;
  court?: any; // courtId may not yet be present
};
export function addCourt({ tournamentRecord, disableNotice, venueId, courtId, court }: AddCourtArgs) {
  const { venue } = findVenue({ tournamentRecord, venueId });
  if (!venue) return { error: VENUE_NOT_FOUND };

  venue.courts ??= [];

  const { court: courtRecord, error } = buildCourt({ venue, venueId, courtId, court });
  if (error || !courtRecord) return { error };

  venue.courts.push(courtRecord);

  if (!disableNotice) {
    addNotice({
      payload: { venue, tournamentId: tournamentRecord.tournamentId },
      topic: MODIFY_VENUE,
      key: venue.venueId,
    });
  }

  return { ...SUCCESS, court: makeDeepCopy(courtRecord), venueId };
}

/**
 * The court a venue would store, without storing it: refused when the venue (or the courts built before it in the same
 * call, `pending`) already holds its id, or its availability is not valid.
 */
type BuildCourtArgs = {
  court?: AddCourtArgs['court'];
  pending?: Court[];
  courtId?: string;
  venueId: string;
  venue: Venue;
};
function buildCourt({ venue, venueId, courtId, court, pending = [] }: BuildCourtArgs): ResultType & { court?: Court } {
  const courtRecord: any = { ...courtTemplate(), venueId, courtId };
  if (!courtRecord.courtId) {
    courtRecord.courtId = UUID();
  }

  const courtExists = [...(venue.courts ?? []), ...pending].some(
    (candidate) => candidate.courtId === courtRecord.courtId,
  );
  if (courtExists) return { error: COURT_EXISTS };

  // build new dateAvailability object with date/time extraction
  // an entry without a date is the court's default availability: it gets no date, not `date: ''`
  const dateAvailability = (court?.dateAvailability ?? []).map((availabilty: any) => ({
    ...availabilty,
    ...(availabilty.date && { date: extractDate(availabilty.date) }),
    startTime: extractTime(availabilty.startTime),
    endTime: extractTime(availabilty.endTime),
    bookings: availabilty.bookings?.map(({ startTime, endTime, bookingType }) => ({
      startTime: extractTime(startTime),
      endTime: extractTime(endTime),
      bookingType,
    })),
  }));

  const attributes = Object.keys(courtRecord);
  for (const attribute of attributes) {
    if (court?.[attribute]) {
      if (attribute === 'dateAvailability') {
        const result: any = validDateAvailability({ dateAvailability });
        if (!result.valid && result.error) return result;
        courtRecord.dateAvailability = dateAvailability;
      } else {
        courtRecord[attribute] = court[attribute];
      }
    }
  }

  return { court: courtRecord };
}

type ACArgs = AddCourtsArgs & {
  tournamentRecords?: { [key: string]: Tournament };
  tournamentRecord?: Tournament;
  venueId: string;
};
export function addCourts(params: ACArgs) {
  // if tournamentRecord is not linked to other tournamentRecods, only add to tournamentRecord
  const { tournamentRecord, venueId } = params;

  if (typeof venueId !== 'string' || !venueId) return { error: MISSING_VENUE_ID };

  const tournamentRecords =
    params.tournamentRecords ??
    (tournamentRecord && {
      [tournamentRecord.tournamentId]: tournamentRecord,
    }) ??
    {};

  const courtIds: string[] = [];

  let success;
  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const { venue } = findVenue({ tournamentRecord, venueId });
    if (venue) {
      const result = courtsAdd({ ...params, tournamentRecord });
      for (const court of result?.courts ?? []) {
        courtIds.push(court?.courtId);
      }
      if (result.error) return result;
      success = true;
    }
  }

  return success ? { ...SUCCESS, courtIds } : { error: VENUE_NOT_FOUND };
}

export type AddCourtsArgs = {
  dateAvailability?: Availability[];
  venueAbbreviationRoot?: string;
  tournamentRecord: Tournament;
  courtNameRoot?: string;
  courtNames?: string[];
  courtTimings?: any[];
  courtsCount?: number;
  courtIds?: string[];
  startTime?: string;
  endTime?: string;
  idPrefix?: string;
  venueId: string;
  dates: string[];
};

export function courtsAdd({
  courtNameRoot = 'Court',
  dateAvailability = [],
  venueAbbreviationRoot,
  tournamentRecord,
  courtNames = [],
  courtTimings,
  courtsCount,
  startTime,
  courtIds,
  endTime,
  idPrefix,
  venueId,
  dates,
}: AddCourtsArgs): ResultType & { courts?: Court[] } {
  if (!venueId) return { error: MISSING_VENUE_ID };
  const result = findVenue({ tournamentRecord, venueId });
  if (result.error) return result;

  const { venue } = result;
  if (!venue) return { error: VENUE_NOT_FOUND };

  // names alone say how many courts there are: the `courtNames.length` fallback was unreachable behind
  // a guard that demanded a numeric courtsCount whatever names were given (M13, 2026-10-17)
  if (!isNumeric(courtsCount) && !courtNames?.length) return { error: MISSING_COURTS_INFO };

  // a numeric string counts as its number: compared as given, every court was written and then refused
  courtsCount = isNumeric(courtsCount) ? Number(courtsCount) : courtNames.length;
  const courts = generateRange(0, courtsCount).map((i) => {
    const courtTiming = courtTimings?.[i];
    const courtAvailability = courtTiming
      ? dates.map((date) => ({
          date: formatDate(date),
          startTime,
          endTime,
          ...courtTiming,
        }))
      : dateAvailability;

    // when courtTiming is provided, also add default availability
    if (courtTiming && startTime && endTime) courtAvailability.push({ startTime, endTime });

    return {
      courtName:
        courtNames[i] ||
        (venueAbbreviationRoot && venue?.venueAbbreviation && `${venue?.venueAbbreviation} ${i + 1}`) ||
        `${courtNameRoot} ${i + 1}`,
      dateAvailability: courtAvailability,
    };
  });

  // every court is built before any is stored: a refusal writes nothing (a court refused after the ones before it
  // were stored left them in the venue)
  const courtRecords: Court[] = [];
  for (const [i, court] of courts.entries()) {
    // shift(), not pop(): courtIds are positional — the caller's first id belongs to the first
    // court. pop() took from the END, so ['c1','c2','c3','c4'] silently produced Court 1 = 'c4'.
    // Harmless while the only such pool was `uuids` (any uuid will do); wrong once callers pass
    // meaningful ids and expect to know which court they named. Consumption (rather than indexing)
    // is kept so a pool shared across venueProfiles still yields unique ids per court.
    const courtId = courtIds?.shift() || (idPrefix && `${idPrefix}-${i + 1}`);
    const built = buildCourt({ venue, venueId, courtId, court, pending: courtRecords });
    if (built.court) courtRecords.push(built.court);
  }

  if (courtRecords.length !== courtsCount) {
    return decorateResult({
      info: 'not all courts could be generated',
      result: { error: INVALID_VALUES },
    });
  }

  venue.courts ??= [];
  venue.courts.push(...courtRecords);
  addNotice({
    payload: { venue, tournamentId: tournamentRecord.tournamentId },
    topic: MODIFY_VENUE,
    key: venue.venueId,
  });

  return { ...SUCCESS, courts: makeDeepCopy(courtRecords) };
}
