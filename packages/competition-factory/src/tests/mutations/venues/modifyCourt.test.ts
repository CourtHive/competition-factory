import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { CLAY, HARD, GRASS } from '@Constants/surfaceConstants';
import { INDOOR, OUTDOOR } from '@Constants/venueConstants';
import {
  COURT_NOT_FOUND,
  INVALID_OBJECT,
  MISSING_COURT_ID,
  NO_VALID_ATTRIBUTES,
} from '@Constants/errorConditionConstants';

it('can modify court attributes including indoorOutdoor', () => {
  tournamentEngine.reset();
  let result = tournamentEngine.newTournamentRecord({
    startDate: '2024-01-01',
    endDate: '2024-01-07',
  });
  expect(result.success).toEqual(true);

  // Add a venue with a court
  const myCourts = { venueName: 'Test Venue', venueAbbreviation: 'TV' };
  result = tournamentEngine.devContext({ addVenue: true }).addVenue({ venue: myCourts });
  const {
    venue: { venueId },
  } = result;
  expect(result.success).toEqual(true);

  // Add a court to the venue
  result = tournamentEngine.addCourt({
    venueId,
    court: { courtName: 'Court 1' },
  });
  expect(result.success).toEqual(true);
  const courtId = result.court.courtId;

  // Verify initial court has no indoorOutdoor or surfaceType
  let { venue } = tournamentEngine.findVenue({ venueId });
  let court = venue.courts.find((c: any) => c.courtId === courtId);
  expect(court.courtName).toEqual('Court 1');
  expect(court.indoorOutdoor).toBeUndefined();
  expect(court.surfaceType).toBeUndefined();
  expect(court.floodlit).toBeUndefined();

  // Modify court to add indoorOutdoor
  result = tournamentEngine.modifyCourt({
    courtId,
    modifications: {
      indoorOutdoor: INDOOR,
    },
  });
  expect(result.success).toEqual(true);

  // Verify indoorOutdoor was set
  ({ venue } = tournamentEngine.findVenue({ venueId }));
  court = venue.courts.find((c: any) => c.courtId === courtId);
  expect(court.indoorOutdoor).toEqual(INDOOR);

  // Modify court to change indoorOutdoor and add surfaceType
  result = tournamentEngine.modifyCourt({
    courtId,
    modifications: {
      indoorOutdoor: OUTDOOR,
      surfaceType: CLAY,
    },
  });
  expect(result.success).toEqual(true);

  // Verify both attributes were updated
  ({ venue } = tournamentEngine.findVenue({ venueId }));
  court = venue.courts.find((c: any) => c.courtId === courtId);
  expect(court.indoorOutdoor).toEqual(OUTDOOR);
  expect(court.surfaceType).toEqual(CLAY);

  // Modify court name and surfaceType
  result = tournamentEngine.modifyCourt({
    courtId,
    modifications: {
      courtName: 'Center Court',
      surfaceType: HARD,
      floodlit: true,
    },
  });
  expect(result.success).toEqual(true);

  // Verify all attributes
  ({ venue } = tournamentEngine.findVenue({ venueId }));
  court = venue.courts.find((c: any) => c.courtId === courtId);
  expect(court.courtName).toEqual('Center Court');
  expect(court.indoorOutdoor).toEqual(OUTDOOR);
  expect(court.surfaceType).toEqual(HARD);
  expect(court.floodlit).toEqual(true);

  // Test clearing indoorOutdoor by setting to undefined
  result = tournamentEngine.modifyCourt({
    courtId,
    modifications: {
      indoorOutdoor: undefined,
    },
  });
  expect(result.success).toEqual(true);

  ({ venue } = tournamentEngine.findVenue({ venueId }));
  court = venue.courts.find((c: any) => c.courtId === courtId);
  expect(court.indoorOutdoor).toBeUndefined();
  expect(court.surfaceType).toEqual(HARD); // Other attributes unchanged
  expect(court.floodlit).toEqual(true);

  // Test all surface types
  result = tournamentEngine.modifyCourt({
    courtId,
    modifications: {
      surfaceType: GRASS,
    },
  });
  expect(result.success).toEqual(true);

  ({ venue } = tournamentEngine.findVenue({ venueId }));
  court = venue.courts.find((c: any) => c.courtId === courtId);
  expect(court.surfaceType).toEqual(GRASS);
});

it('can modify multiple courts with different attributes', () => {
  tournamentEngine.reset();
  let result = tournamentEngine.newTournamentRecord({
    startDate: '2024-01-01',
    endDate: '2024-01-07',
  });
  expect(result.success).toEqual(true);

  // Add a venue
  const venue = { venueName: 'Tennis Club', venueAbbreviation: 'TC' };
  result = tournamentEngine.devContext({ addVenue: true }).addVenue({ venue });
  const {
    venue: { venueId },
  } = result;
  expect(result.success).toEqual(true);

  // Add multiple courts
  result = tournamentEngine.addCourts({
    venueId,
    courtsCount: 3,
  });
  expect(result.success).toEqual(true);

  const { venue: venueData } = tournamentEngine.findVenue({ venueId });
  expect(venueData.courts.length).toEqual(3);

  const [court1, court2, court3] = venueData.courts;

  // Modify first court as indoor clay
  result = tournamentEngine.modifyCourt({
    courtId: court1.courtId,
    modifications: {
      indoorOutdoor: INDOOR,
      surfaceType: CLAY,
      floodlit: false,
    },
  });
  expect(result.success).toEqual(true);

  // Modify second court as outdoor hard with lights
  result = tournamentEngine.modifyCourt({
    courtId: court2.courtId,
    modifications: {
      indoorOutdoor: OUTDOOR,
      surfaceType: HARD,
      floodlit: true,
    },
  });
  expect(result.success).toEqual(true);

  // Modify third court as outdoor grass without lights
  result = tournamentEngine.modifyCourt({
    courtId: court3.courtId,
    modifications: {
      indoorOutdoor: OUTDOOR,
      surfaceType: GRASS,
      floodlit: false,
    },
  });
  expect(result.success).toEqual(true);

  // Verify all courts have correct attributes
  const { venue: updatedVenue } = tournamentEngine.findVenue({ venueId });
  const [c1, c2, c3] = updatedVenue.courts;

  expect(c1.indoorOutdoor).toEqual(INDOOR);
  expect(c1.surfaceType).toEqual(CLAY);
  expect(c1.floodlit).toEqual(false);

  expect(c2.indoorOutdoor).toEqual(OUTDOOR);
  expect(c2.surfaceType).toEqual(HARD);
  expect(c2.floodlit).toEqual(true);

  expect(c3.indoorOutdoor).toEqual(OUTDOOR);
  expect(c3.surfaceType).toEqual(GRASS);
  expect(c3.floodlit).toEqual(false);
});

it('returns MISSING_COURT_ID when courtId is not provided', () => {
  tournamentEngine.reset();
  tournamentEngine.newTournamentRecord({
    startDate: '2024-01-01',
    endDate: '2024-01-07',
  });

  const result = tournamentEngine.modifyCourt({
    courtId: undefined as any,
    modifications: { courtName: 'New Name' },
  });
  expect(result.error).toEqual(MISSING_COURT_ID);
});

it('returns INVALID_OBJECT when modifications is not an object', () => {
  tournamentEngine.reset();
  tournamentEngine.newTournamentRecord({
    startDate: '2024-01-01',
    endDate: '2024-01-07',
  });

  const venue = { venueName: 'Test Venue', venueAbbreviation: 'TV' };
  let result = tournamentEngine.devContext({ addVenue: true }).addVenue({ venue });
  const {
    venue: { venueId },
  } = result;

  result = tournamentEngine.addCourt({ venueId, court: { courtName: 'Court 1' } });
  const courtId = result.court.courtId;

  // null modifications
  result = tournamentEngine.modifyCourt({ courtId, modifications: null as any });
  expect(result.error).toEqual(INVALID_OBJECT);

  // string modifications
  result = tournamentEngine.modifyCourt({ courtId, modifications: 'bad' as any });
  expect(result.error).toEqual(INVALID_OBJECT);
});

it('returns COURT_NOT_FOUND when courtId does not exist', () => {
  tournamentEngine.reset();
  tournamentEngine.newTournamentRecord({
    startDate: '2024-01-01',
    endDate: '2024-01-07',
  });

  const venue = { venueName: 'Test Venue', venueAbbreviation: 'TV' };
  tournamentEngine.devContext({ addVenue: true }).addVenue({ venue });

  const result = tournamentEngine.modifyCourt({
    courtId: 'non-existent-court-id',
    modifications: { courtName: 'New Name' },
  });
  expect(result.error).toEqual(COURT_NOT_FOUND);
});

it('returns NO_VALID_ATTRIBUTES when only invalid attributes are provided', () => {
  tournamentEngine.reset();
  tournamentEngine.newTournamentRecord({
    startDate: '2024-01-01',
    endDate: '2024-01-07',
  });

  const venue = { venueName: 'Test Venue', venueAbbreviation: 'TV' };
  let result = tournamentEngine.devContext({ addVenue: true }).addVenue({ venue });
  const {
    venue: { venueId },
  } = result;

  result = tournamentEngine.addCourt({ venueId, court: { courtName: 'Court 1' } });
  const courtId = result.court.courtId;

  // courtId is explicitly filtered out as invalid attribute for modification
  result = tournamentEngine.modifyCourt({
    courtId,
    modifications: { courtId: 'new-id', unknownField: 'value' } as any,
  });
  expect(result.error).toEqual(NO_VALID_ATTRIBUTES);
});

it('returns NO_VALID_ATTRIBUTES when only courtId modification is attempted', () => {
  tournamentEngine.reset();
  tournamentEngine.newTournamentRecord({
    startDate: '2024-01-01',
    endDate: '2024-01-07',
  });

  const venue = { venueName: 'Test Venue', venueAbbreviation: 'TV' };
  let result = tournamentEngine.devContext({ addVenue: true }).addVenue({ venue });
  const {
    venue: { venueId },
  } = result;

  result = tournamentEngine.addCourt({ venueId, court: { courtName: 'Court 1' } });
  const courtId = result.court.courtId;

  result = tournamentEngine.modifyCourt({
    courtId,
    modifications: { courtId: 'new-id' } as any,
  });
  expect(result.error).toEqual(NO_VALID_ATTRIBUTES);
});

it('can modify court with dateAvailability', () => {
  tournamentEngine.reset();
  tournamentEngine.newTournamentRecord({
    startDate: '2024-01-01',
    endDate: '2024-01-07',
  });

  const venue = { venueName: 'Test Venue', venueAbbreviation: 'TV' };
  let result = tournamentEngine.devContext({ addVenue: true }).addVenue({ venue });
  const {
    venue: { venueId },
  } = result;

  result = tournamentEngine.addCourt({ venueId, court: { courtName: 'Court 1' } });
  const courtId = result.court.courtId;

  // Modify with dateAvailability - triggers the modifyCourtAvailability branch
  result = tournamentEngine.modifyCourt({
    courtId,
    modifications: {
      dateAvailability: [
        {
          date: '2024-01-01',
          startTime: '08:00',
          endTime: '18:00',
        },
      ],
    },
  });
  expect(result.success).toEqual(true);
});

it('can modify court with dateAvailability alongside other attributes', () => {
  tournamentEngine.reset();
  tournamentEngine.newTournamentRecord({
    startDate: '2024-01-01',
    endDate: '2024-01-07',
  });

  const venue = { venueName: 'Test Venue', venueAbbreviation: 'TV' };
  let result = tournamentEngine.devContext({ addVenue: true }).addVenue({ venue });
  const {
    venue: { venueId },
  } = result;

  result = tournamentEngine.addCourt({ venueId, court: { courtName: 'Court 1' } });
  const courtId = result.court.courtId;

  // Both replacement attributes AND dateAvailability
  result = tournamentEngine.modifyCourt({
    courtId,
    modifications: {
      courtName: 'Updated Court',
      surfaceType: CLAY,
      dateAvailability: [
        {
          date: '2024-01-02',
          startTime: '09:00',
          endTime: '17:00',
        },
      ],
    },
  });
  expect(result.success).toEqual(true);

  const { venue: updatedVenue } = tournamentEngine.findVenue({ venueId });
  const court = updatedVenue.courts.find((c: any) => c.courtId === courtId);
  expect(court.courtName).toEqual('Updated Court');
  expect(court.surfaceType).toEqual(CLAY);
});

it('suppresses notice when disableNotice is true', () => {
  tournamentEngine.reset();
  tournamentEngine.newTournamentRecord({
    startDate: '2024-01-01',
    endDate: '2024-01-07',
  });

  const venue = { venueName: 'Test Venue', venueAbbreviation: 'TV' };
  let result = tournamentEngine.devContext({ addVenue: true }).addVenue({ venue });
  const {
    venue: { venueId },
  } = result;

  result = tournamentEngine.addCourt({ venueId, court: { courtName: 'Court 1' } });
  const courtId = result.court.courtId;

  result = tournamentEngine.modifyCourt({
    courtId,
    disableNotice: true,
    modifications: { courtName: 'Silent Update' },
  });
  expect(result.success).toEqual(true);

  const { venue: updatedVenue } = tournamentEngine.findVenue({ venueId });
  const court = updatedVenue.courts.find((c: any) => c.courtId === courtId);
  expect(court.courtName).toEqual('Silent Update');
});
