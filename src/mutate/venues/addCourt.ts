import { courtTemplate } from '@Assemblies/generators/templates/courtTemplate';
import { validDateAvailability } from '@Validators/validateDateAvailability';
import { extractDate, extractTime, formatDate } from '@Tools/dateTime';
import { decorateResult } from '@Functions/global/decorateResult';
import { addNotice } from '@Global/state/globalState';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { generateRange } from '@Tools/arrays';
import { isNumeric } from '@Tools/math';
import { findVenue } from '../../query/venues/findVenue';
import { UUID } from '@Tools/UUID';

// constants and types
import { Availability, Court, Tournament } from '@Types/tournamentTypes';
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

  const courtRecord: any = { ...courtTemplate(), venueId, courtId };
  if (!courtRecord.courtId) {
    courtRecord.courtId = UUID();
  }

  const courtExists = venue.courts.some((candidate) => candidate.courtId === courtRecord.courtId);

  if (courtExists) {
    return { error: COURT_EXISTS };
  } else {
    // build new dateAvailability object with date/time extraction
    const dateAvailability = (court?.dateAvailability ?? []).map((availabilty: any) => ({
      ...availabilty,
      date: extractDate(availabilty.date),
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

    const newCourt = courtRecord as Court;
    venue.courts.push(newCourt);

    if (!disableNotice) {
      addNotice({
        payload: { venue, tournamentId: tournamentRecord.tournamentId },
        topic: MODIFY_VENUE,
        key: venue.venueId,
      });
    }

    return { ...SUCCESS, court: makeDeepCopy(courtRecord), venueId };
  }
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

  if (!isNumeric(courtsCount) || !courtNames) return { error: MISSING_COURTS_INFO };

  courtsCount = courtsCount ?? courtNames.length;
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

  const mapResult: any[] = courts.map((court, i) => {
    const courtId = courtIds?.pop() || (idPrefix && `${idPrefix}-${i + 1}`);
    return addCourt({
      disableNotice: true,
      tournamentRecord,
      courtId,
      venueId,
      court,
    });
  });

  const courtRecords = mapResult.map((outcome) => outcome.court).filter(Boolean);
  if (courtRecords.length !== courtsCount) {
    return decorateResult({
      info: 'not all courts could be generated',
      result: { error: INVALID_VALUES },
    });
  }

  if (venue)
    addNotice({
      payload: { venue, tournamentId: tournamentRecord.tournamentId },
      topic: MODIFY_VENUE,
      key: venue.venueId,
    });

  return { ...SUCCESS, courts: makeDeepCopy(courtRecords) };
}
