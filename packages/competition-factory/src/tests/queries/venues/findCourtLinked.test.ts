import { assignMatchUpCourt } from '@Mutate/matchUps/schedule/assignMatchUpCourt';
import { findVenue } from '@Query/venues/findVenue';
import { findCourt } from '@Query/venues/findCourt';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// Phase 0 regression: cross-tournament findCourt used to return the outer (undefined) court/venue
// bindings while silently copying the peer venue in. It must return the actually-found court/venue.
const linkedPair = () => {
  const { tournamentRecord: a } = mocksEngine.generateTournamentRecord({
    tournamentAttributes: { tournamentId: 'A' },
    drawProfiles: [{ drawSize: 4 }],
    nonRandom: 1,
  });
  const { tournamentRecord: b } = mocksEngine.generateTournamentRecord({
    tournamentAttributes: { tournamentId: 'B' },
    drawProfiles: [{ drawSize: 4 }],
    venueProfiles: [
      {
        venueId: 'bv',
        venueName: 'Linked Venue',
        venueAbbreviation: 'LV',
        startTime: '08:00',
        endTime: '20:00',
        courtsCount: 2,
        idPrefix: 'bc',
      },
    ],
    nonRandom: 1,
  });

  // symmetric link; the court lives only in B
  a.linkedTournamentIds = ['B'];
  b.linkedTournamentIds = ['A'];
  const tournamentRecords = { A: a, B: b };
  const courtId = b.venues![0].courts![0].courtId;
  return { a, b, tournamentRecords, courtId };
};

const deepFreeze = (value: any) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};

describe('findCourt across linked tournaments', () => {
  it('returns the real court found in a linked tournament', () => {
    const { a, tournamentRecords, courtId } = linkedPair();
    // A has no venues to begin with
    expect(a.venues ?? []).toHaveLength(0);

    const result = findCourt({ tournamentRecords, tournamentRecord: a, courtId });

    expect(result.success).toEqual(true);
    expect(result.court?.courtId).toEqual(courtId); // was undefined before the Phase 0 fix
    expect(result.venue?.venueId).toEqual('bv');
  });

  // findCourt is a query. It used to add the linked venue to A, as B's own object, so the two records shared it
  it('writes nothing to either record', () => {
    const { a, b, tournamentRecords, courtId } = linkedPair();
    deepFreeze(a);
    deepFreeze(b);
    const before = JSON.stringify(tournamentRecords);

    const result = findCourt({ tournamentRecords, tournamentRecord: a, courtId });
    expect(result.court?.courtId).toEqual(courtId);
    expect(JSON.stringify(tournamentRecords)).toEqual(before);
    expect(a.venues ?? []).toHaveLength(0);
  });

  // the copy belongs to the caller that needs it: assigning a linked court puts its venue on A, as A's own object
  it('assignMatchUpCourt puts an owned copy of the linked venue on the record it assigns in', () => {
    const { a, b, tournamentRecords, courtId } = linkedPair();
    const drawDefinition = a.events![0].drawDefinitions![0];
    const matchUpId = drawDefinition.structures![0].matchUps![0].matchUpId;

    let result: any = assignMatchUpCourt({
      courtDayDate: a.startDate,
      tournamentRecord: a,
      tournamentRecords,
      drawDefinition,
      matchUpId,
      courtId,
    });
    expect(result.success).toEqual(true);

    result = findVenue({ tournamentRecord: a, venueId: 'bv' });
    expect(result.venue?.venueId).toEqual('bv');
    expect(a.venues).toHaveLength(1);

    // the two records must not share one venue
    expect(a.venues![0]).not.toBe(b.venues![0]);
    a.venues![0].venueName = 'Renamed In A';
    expect(b.venues![0].venueName).toEqual('Linked Venue');

    // assigning again copies nothing more
    result = assignMatchUpCourt({
      courtDayDate: a.startDate,
      tournamentRecord: a,
      tournamentRecords,
      drawDefinition,
      matchUpId,
      courtId,
    });
    expect(result.success).toEqual(true);
    expect(a.venues).toHaveLength(1);
  });
});
