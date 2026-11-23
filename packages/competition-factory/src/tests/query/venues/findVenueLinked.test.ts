import { assignMatchUpVenue } from '@Mutate/matchUps/schedule/assignMatchUpVenue';
import { linkTournaments } from '@Mutate/tournaments/tournamentLinks';
import { mocksEngine } from '@Assemblies/engines/mock';
import { findVenue } from '@Query/venues/findVenue';
import { expect, it } from 'vitest';

const linkedPair = () => {
  const { tournamentRecord: first } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
  const { tournamentRecord: second } = mocksEngine.generateTournamentRecord({
    venueProfiles: [{ venueName: 'Linked Venue', courtsCount: 2 }],
  });
  const tournamentRecords = { [first.tournamentId]: first, [second.tournamentId]: second };
  const result: any = linkTournaments({ tournamentRecords });
  expect(result.success).toEqual(true);
  return { first, second, tournamentRecords, venueId: second.venues[0].venueId };
};

const deepFreeze = (value: any) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};

// A venue that only a linked tournament holds: findVenue found it, copied it onto the current record, and then
// returned the OUTER `venue`, which is undefined on that path, so the caller got success and no venue.
it('findVenue returns a venue found only in a linked tournament', () => {
  const { first, tournamentRecords, venueId } = linkedPair();
  expect(first.venues ?? []).toEqual([]);

  const result: any = findVenue({ tournamentRecords, tournamentRecord: first, venueId });
  expect(result.success).toEqual(true);
  expect(result.venue?.venueId).toEqual(venueId);
  expect(result.venue?.venueName).toEqual('Linked Venue');
});

// P54: findVenue is a query. It used to add a copy of the linked venue to the current record (with an ADD_VENUE
// notice); now it writes nothing, to either record.
it('findVenue writes nothing to either record', () => {
  const { first, second, tournamentRecords, venueId } = linkedPair();
  deepFreeze(first);
  deepFreeze(second);
  const before = JSON.stringify(tournamentRecords);

  const result: any = findVenue({ tournamentRecords, tournamentRecord: first, venueId });
  expect(result.venue?.venueId).toEqual(venueId);
  expect(JSON.stringify(tournamentRecords)).toEqual(before);
  expect(first.venues).toBeUndefined();
});

// The copy belongs to the one caller that needs it: assigning a linked venue to a matchUp of this record puts the
// venue on this record, which later hydration reads it from, as its own object.
it('assignMatchUpVenue copies a linked venue onto the record it assigns in', () => {
  const { first, second, tournamentRecords, venueId } = linkedPair();
  const drawDefinition = first.events[0].drawDefinitions[0];
  const matchUpId = drawDefinition.structures[0].matchUps[0].matchUpId;

  let result: any = assignMatchUpVenue({
    tournamentRecords,
    tournamentRecord: first,
    drawDefinition,
    matchUpId,
    venueId,
  });
  expect(result.success).toEqual(true);

  // a second lookup finds it on the current record
  result = findVenue({ tournamentRecord: first, venueId });
  expect(result.venue?.venueId).toEqual(venueId);

  // ...as its own object: the two records must not share one venue
  expect(first.venues[0]).not.toBe(second.venues[0]);
  first.venues[0].venueName = 'Renamed In First';
  expect(second.venues[0].venueName).toEqual('Linked Venue');

  // assigning it again copies nothing more
  result = assignMatchUpVenue({ tournamentRecords, tournamentRecord: first, drawDefinition, matchUpId, venueId });
  expect(result.success).toEqual(true);
  expect(first.venues.length).toEqual(1);
});
