import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

/**
 * NATIVE-writeMode sibling of enableDisableVenuesCourts (which asserts the LEGACY shape
 * `venue.extensions[0].name === DISABLED`). Under NATIVE the disabled flag is first-class
 * `venue.disabled` / `court.disabled` with no extension mirror. Runs via `pnpm test:native`.
 *
 * See planning/NATIVE_WRITEMODE_COVERAGE.md.
 */

it('disable/enable venues writes first-class venue.disabled (no DISABLED extension)', () => {
  const venueProfiles = [
    { venueId: 'venueId1', courtsCount: 4 },
    { venueId: 'venueId2', courtsCount: 8 },
  ];
  mocksEngine.generateTournamentRecord({
    setState: true,
    venueProfiles,
    startDate: '2022-09-24',
    endDate: '2022-09-28',
  });

  const venue = () =>
    tournamentEngine.getTournament().tournamentRecord.venues.find((v: any) => v.venueId === 'venueId1');

  expect(tournamentEngine.disableVenues({ venueIds: ['venueId1'] }).success).toEqual(true);
  expect(venue().disabled).toEqual(true);
  expect(venue().extensions ?? []).toEqual([]);

  expect(tournamentEngine.enableVenues({ venueIds: ['venueId1'] }).success).toEqual(true);
  expect(venue().disabled).toBeUndefined();
});

it('disable/enable courts writes first-class court.disabled', () => {
  const venueProfiles = [{ venueId: 'venueId1', courtsCount: 4 }];
  mocksEngine.generateTournamentRecord({
    setState: true,
    venueProfiles,
    startDate: '2022-09-24',
    endDate: '2022-09-28',
  });

  const courtId = tournamentEngine.getVenuesAndCourts().courts[0].courtId;
  const court = () =>
    tournamentEngine.getTournament().tournamentRecord.venues[0].courts.find((c: any) => c.courtId === courtId);

  expect(tournamentEngine.disableCourts({ courtIds: [courtId] }).success).toEqual(true);
  expect(court().disabled).toEqual(true);
  expect(court().extensions ?? []).toEqual([]);

  expect(tournamentEngine.enableCourts({ courtIds: [courtId] }).success).toEqual(true);
  expect(court().disabled).toBeUndefined();
});
