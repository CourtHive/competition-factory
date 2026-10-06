import { generateDateRange, formatDate } from '@Tools/dateTime';
import { addCourts } from './addCourt';
import { addVenue } from './addVenue';
import { UUID } from '@Tools/UUID';

// types
import { Tournament, Venue } from '@Types/tournamentTypes';

type GenerateVenuesArgs = {
  ignoreExistingVenues?: boolean;
  tournamentRecord: Tournament;
  venueProfiles: any[];
  uuids?: string[];
};

export function generateVenues({ tournamentRecord, ignoreExistingVenues, venueProfiles, uuids }: GenerateVenuesArgs) {
  const { startDate, endDate } = tournamentRecord;
  const venueIds: string[] = [];

  for (const [index, venueProfile] of venueProfiles.entries()) {
    const {
      venueAbbreviation,
      venueId = uuids?.pop() ?? UUID(),
      dateAvailability,
      venueDateAvailability,
      defaultStartTime,
      defaultEndTime,
      startTime = '07:00',
      endTime = '19:00',
      courtTimings,
      courtsCount,
      courtNames,
      venueName,
      idPrefix,
      courtIds,
    } = venueProfile;

    const newVenue: Venue = {
      venueName: venueName || `Venue ${index + 1}`,
      venueAbbreviation,
      venueId,
    };
    if (defaultStartTime) newVenue.defaultStartTime = defaultStartTime;
    if (defaultEndTime) newVenue.defaultEndTime = defaultEndTime;
    if (venueProfile.isPrimary) newVenue.isPrimary = true;
    if (venueDateAvailability) newVenue.dateAvailability = venueDateAvailability;
    const result = addVenue({ tournamentRecord, venue: newVenue });
    if (result.error) {
      if (ignoreExistingVenues) continue;
      return result;
    }

    venueIds.push(venueId);

    const dates = generateDateRange(startDate, endDate);
    const generatedDateAvailability =
      !Array.isArray(dateAvailability) &&
      [{ startTime, endTime }].concat(
        dates.map((date) => ({
          date: formatDate(date),
          startTime,
          endTime,
        })),
      );

    if (courtsCount || courtNames) {
      const addResult = addCourts({
        dateAvailability: dateAvailability || generatedDateAvailability,
        tournamentRecord,
        courtTimings,
        courtsCount,
        courtNames,
        startTime,
        idPrefix,
        courtIds,
        endTime,
        venueId,
        dates,
      });
      if (addResult.error) return addResult;
    }
  }

  return venueIds;
}
