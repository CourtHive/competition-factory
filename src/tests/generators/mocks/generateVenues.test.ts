import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { extractDate } from '@Tools/dateTime';
import { expect, it } from 'vitest';

it('can schedule all matchUps in first round with only drawId', () => {
  const venueId = 'venueId';
  const startTime = '08:00';
  const endTime = '20:00';
  const startDate = extractDate(new Date().toISOString());

  const venueProfiles = [
    {
      venueId,
      venueName: 'Venue',
      venueAbbreviation: 'VNU',
      courtNames: ['One', 'Two', 'Three'],
      courtIds: ['c1', 'c2', 'c3'],
      courtsCount: 8,
      startTime,
      endTime,
    },
  ];

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    venueProfiles,
    startDate,
  });

  tournamentEngine.setState(tournamentRecord);

  const { venueData } = tournamentEngine.getVenueData({ venueId });

  const { venueName, venueAbbreviation, courtsInfo } = venueData;
  expect(venueName).toEqual('Venue');
  expect(venueAbbreviation).toEqual('VNU');
  const courtNames = courtsInfo.map(({ courtName }) => courtName);
  expect(courtNames.slice(0, 3)).toEqual(venueProfiles[0].courtNames);

  const courtIds = courtsInfo.map(({ courtId }) => courtId);
  expect(courtIds.slice(0, 3).sort()).toEqual;
});
