import { linkTournaments } from '@Mutate/tournaments/tournamentLinks';
import { mocksEngine } from '@Assemblies/engines/mock';
import { findVenue } from '@Query/venues/findVenue';
import { expect, it } from 'vitest';

// A venue that only a linked tournament holds: findVenue found it, copied it onto the current record, and then
// returned the OUTER `venue`, which is undefined on that path, so the caller got success and no venue.
it('findVenue returns a venue found only in a linked tournament', () => {
  const { tournamentRecord: first } = mocksEngine.generateTournamentRecord();
  const { tournamentRecord: second } = mocksEngine.generateTournamentRecord({
    venueProfiles: [{ venueName: 'Linked Venue', courtsCount: 2 }],
  });
  const tournamentRecords = { [first.tournamentId]: first, [second.tournamentId]: second };
  let result: any = linkTournaments({ tournamentRecords });
  expect(result.success).toEqual(true);

  const venueId = second.venues[0].venueId;
  expect(first.venues ?? []).toEqual([]);

  result = findVenue({ tournamentRecords, tournamentRecord: first, venueId });
  expect(result.success).toEqual(true);
  expect(result.venue?.venueId).toEqual(venueId);
  expect(result.venue?.venueName).toEqual('Linked Venue');

  // a second lookup finds it on the current record (the copy assignMatchUpVenue relies on)
  result = findVenue({ tournamentRecord: first, venueId });
  expect(result.venue?.venueId).toEqual(venueId);

  // ...as its own object: the two records must not share one venue
  expect(first.venues[0]).not.toBe(second.venues[0]);
  first.venues[0].venueName = 'Renamed In First';
  expect(second.venues[0].venueName).toEqual('Linked Venue');
});
