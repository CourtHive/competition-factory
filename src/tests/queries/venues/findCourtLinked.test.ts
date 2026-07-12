import { findCourt } from '@Query/venues/findCourt';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// Phase 0 regression: cross-tournament findCourt used to return the outer (undefined) court/venue
// bindings while silently copying the peer venue in. It must return the actually-found court/venue.
describe('findCourt across linked tournaments', () => {
  it('returns the real court found in a linked tournament and copies its venue in', () => {
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

    // A has no venues to begin with
    expect(a.venues ?? []).toHaveLength(0);

    const result = findCourt({ tournamentRecords, tournamentRecord: a, courtId });

    expect(result.success).toEqual(true);
    expect(result.court?.courtId).toEqual(courtId); // was undefined before the fix
    expect(result.venue?.venueId).toEqual('bv');
    // the peer venue is now present on A
    expect(a.venues?.some((venue) => venue.venueId === 'bv')).toEqual(true);
  });
});
