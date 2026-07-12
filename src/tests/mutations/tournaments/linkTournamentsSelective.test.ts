import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe, beforeEach } from 'vitest';

// constants
import { MISSING_TOURNAMENT_ID } from '@Constants/errorConditionConstants';

function loadTournaments(tournamentIds: string[]) {
  for (const tournamentId of tournamentIds) {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      tournamentAttributes: { tournamentId },
      drawProfiles: [{ drawSize: 4 }],
      nonRandom: 1,
    });
    tournamentEngine.setTournamentRecord(tournamentRecord);
  }
}

describe('selective linkTournaments', () => {
  beforeEach(() => {
    tournamentEngine.reset();
  });

  it('links only the provided subset and leaves other loaded records untouched', () => {
    loadTournaments(['A', 'B', 'C']);

    const result = tournamentEngine.linkTournaments({ tournamentIds: ['A', 'B'] });
    expect(result.success).toEqual(true);

    const { linkedTournamentIds } = tournamentEngine.getLinkedTournamentIds();
    expect(linkedTournamentIds.A).toEqual(['B']);
    expect(linkedTournamentIds.B).toEqual(['A']);
    // C was not selected and must not be linked
    expect(linkedTournamentIds.C ?? []).toEqual([]);
  });

  it('rejects a subset containing an unloaded tournamentId', () => {
    loadTournaments(['A', 'B']);
    const result = tournamentEngine.linkTournaments({ tournamentIds: ['A', 'Z'] });
    expect(result.error).toEqual(MISSING_TOURNAMENT_ID);
  });

  it('links every loaded tournament when no subset is provided (default)', () => {
    loadTournaments(['A', 'B', 'C']);

    const result = tournamentEngine.linkTournaments();
    expect(result.success).toEqual(true);

    const { linkedTournamentIds } = tournamentEngine.getLinkedTournamentIds();
    expect(linkedTournamentIds.A.sort()).toEqual(['B', 'C']);
    expect(linkedTournamentIds.B.sort()).toEqual(['A', 'C']);
    expect(linkedTournamentIds.C.sort()).toEqual(['A', 'B']);
  });
});
