import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

/**
 * Pinned courtIds are POSITIONAL: the caller's first id belongs to the first court.
 *
 * `addCourt` consumed them with `pop()`, which takes from the end, so ['c1','c2','c3','c4']
 * produced Court 1 = 'c4'. Nothing asserted the mapping, so the reversal was invisible — and it
 * only became wrong when callers started passing meaningful ids (declarative scenario profiles
 * that name a court to block for maintenance and schedule onto). A profile naming 'c1' was
 * operating on the fourth court while appearing to name the first, with no error.
 */
describe('pinned courtIds', () => {
  it('assigns ids in the order given, first id to first court', () => {
    const courtIds = ['c1', 'c2', 'c3', 'c4'];
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueId: 'v1', courtsCount: 4, courtIds: [...courtIds] }],
      drawProfiles: [{ drawSize: 4 }],
    });
    tournamentEngine.setState(tournamentRecord);

    const { courts } = tournamentEngine.getVenuesAndCourts();
    expect(courts.map((c: any) => c.courtId)).toEqual(courtIds);
    // and the pairing with generated names is forward, not mirrored
    expect(courts.find((c: any) => c.courtName === 'Court 1')?.courtId).toEqual('c1');
    expect(courts.find((c: any) => c.courtName === 'Court 4')?.courtId).toEqual('c4');
  });

  it('consumes the pool so a shared array still yields unique ids across venues', () => {
    const pool = ['a1', 'a2', 'b1', 'b2'];
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [
        { venueId: 'v1', courtsCount: 2, courtIds: pool },
        { venueId: 'v2', courtsCount: 2, courtIds: pool },
      ],
      drawProfiles: [{ drawSize: 4 }],
    });
    tournamentEngine.setState(tournamentRecord);

    const { courts } = tournamentEngine.getVenuesAndCourts();
    const ids = courts.map((c: any) => c.courtId);
    expect(new Set(ids).size).toEqual(ids.length);
  });
});
