import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe, beforeEach } from 'vitest';

describe('setTournamentTier', () => {
  beforeEach(() => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      setState: true,
    });
  });

  it('sets a tier on the tournament record', () => {
    let result: any = tournamentEngine.setTournamentTier({
      tournamentTier: { system: 'ITF_JUNIOR', value: '3', numericRank: 3 },
    });
    expect(result.success).toBe(true);

    const { tournamentRecord } = tournamentEngine.getTournament();
    expect(tournamentRecord.tournamentTier).toEqual({
      system: 'ITF_JUNIOR',
      value: '3',
      numericRank: 3,
    });
  });

  it('trims whitespace from system and value', () => {
    let result: any = tournamentEngine.setTournamentTier({
      tournamentTier: { system: '  ATP  ', value: '  1000  ' },
    });
    expect(result.success).toBe(true);

    const { tournamentRecord } = tournamentEngine.getTournament();
    expect(tournamentRecord.tournamentTier?.system).toBe('ATP');
    expect(tournamentRecord.tournamentTier?.value).toBe('1000');
  });

  it('clears tier when null is passed', () => {
    tournamentEngine.setTournamentTier({
      tournamentTier: { system: 'PPA', value: 'Gold' },
    });
    let result: any = tournamentEngine.setTournamentTier({ tournamentTier: null });
    expect(result.success).toBe(true);

    const { tournamentRecord } = tournamentEngine.getTournament();
    expect(tournamentRecord.tournamentTier).toBeUndefined();
  });

  it('clears tier when undefined is passed', () => {
    tournamentEngine.setTournamentTier({
      tournamentTier: { system: 'BWF', value: 'Super 500' },
    });
    let result: any = tournamentEngine.setTournamentTier({ tournamentTier: undefined });
    expect(result.success).toBe(true);

    const { tournamentRecord } = tournamentEngine.getTournament();
    expect(tournamentRecord.tournamentTier).toBeUndefined();
  });

  it('rejects tier without system', () => {
    let result: any = tournamentEngine.setTournamentTier({
      tournamentTier: { value: '3' },
    });
    expect(result.error).toBeDefined();
  });

  it('rejects tier without value', () => {
    let result: any = tournamentEngine.setTournamentTier({
      tournamentTier: { system: 'ITF_JUNIOR' },
    });
    expect(result.error).toBeDefined();
  });

  it('omits numericRank when not provided', () => {
    let result: any = tournamentEngine.setTournamentTier({
      tournamentTier: { system: 'PPA', value: 'Silver' },
    });
    expect(result.success).toBe(true);

    const { tournamentRecord } = tournamentEngine.getTournament();
    expect(tournamentRecord.tournamentTier).toEqual({ system: 'PPA', value: 'Silver' });
    expect(tournamentRecord.tournamentTier?.numericRank).toBeUndefined();
  });

  it('overwrites an existing tier', () => {
    tournamentEngine.setTournamentTier({
      tournamentTier: { system: 'ATP', value: '250', numericRank: 4 },
    });
    tournamentEngine.setTournamentTier({
      tournamentTier: { system: 'ATP', value: '1000', numericRank: 2 },
    });

    const { tournamentRecord } = tournamentEngine.getTournament();
    expect(tournamentRecord.tournamentTier?.value).toBe('1000');
    expect(tournamentRecord.tournamentTier?.numericRank).toBe(2);
  });

  it('returns error without tournamentRecord', () => {
    tournamentEngine.reset();
    let result: any = tournamentEngine.setTournamentTier({
      tournamentTier: { system: 'ATP', value: '500' },
    });
    expect(result.error).toBeDefined();
  });
});
