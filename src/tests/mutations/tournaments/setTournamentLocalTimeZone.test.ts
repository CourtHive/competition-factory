import tournamentEngine from '@Engines/syncEngine';
import { describe, it, expect, beforeEach } from 'vitest';

import { INVALID_TIME_ZONE } from '@Constants/errorConditionConstants';

const currentZone = () => tournamentEngine.getTournament().tournamentRecord.localTimeZone;

describe('setTournamentLocalTimeZone', () => {
  beforeEach(() => {
    tournamentEngine.newTournamentRecord({ tournamentName: 'TZ test' });
  });

  it('sets a valid IANA zone on the tournamentRecord', () => {
    const result = tournamentEngine.setTournamentLocalTimeZone({ localTimeZone: 'America/New_York' });
    expect(result.success).toBe(true);
    expect(currentZone()).toBe('America/New_York');
  });

  it('trims surrounding whitespace', () => {
    tournamentEngine.setTournamentLocalTimeZone({ localTimeZone: '  Europe/London  ' });
    expect(currentZone()).toBe('Europe/London');
  });

  it('rejects an invalid IANA zone without mutating state', () => {
    tournamentEngine.setTournamentLocalTimeZone({ localTimeZone: 'Asia/Tokyo' });
    const result = tournamentEngine.setTournamentLocalTimeZone({ localTimeZone: 'Narnia/Cair_Paravel' });
    expect(result.error).toBe(INVALID_TIME_ZONE);
    expect(currentZone()).toBe('Asia/Tokyo');
  });

  it('clears the field when passed an empty string', () => {
    tournamentEngine.setTournamentLocalTimeZone({ localTimeZone: 'America/Los_Angeles' });
    expect(currentZone()).toBe('America/Los_Angeles');
    tournamentEngine.setTournamentLocalTimeZone({ localTimeZone: '' });
    expect(currentZone()).toBeUndefined();
  });

  it('clears the field when passed undefined / null', () => {
    tournamentEngine.setTournamentLocalTimeZone({ localTimeZone: 'Europe/Berlin' });
    tournamentEngine.setTournamentLocalTimeZone({ localTimeZone: undefined });
    expect(currentZone()).toBeUndefined();

    tournamentEngine.setTournamentLocalTimeZone({ localTimeZone: 'Europe/Paris' });
    tournamentEngine.setTournamentLocalTimeZone({ localTimeZone: null });
    expect(currentZone()).toBeUndefined();
  });

  it('is a no-op when the value is unchanged', () => {
    tournamentEngine.setTournamentLocalTimeZone({ localTimeZone: 'Europe/Madrid' });
    const before = currentZone();
    const result = tournamentEngine.setTournamentLocalTimeZone({ localTimeZone: 'Europe/Madrid' });
    expect(result.success).toBe(true);
    expect(currentZone()).toBe(before);
  });

  it('clearing when already clear is a no-op', () => {
    expect(currentZone()).toBeUndefined();
    const result = tournamentEngine.setTournamentLocalTimeZone({ localTimeZone: '' });
    expect(result.success).toBe(true);
    expect(currentZone()).toBeUndefined();
  });

  it('updating from one zone to another succeeds', () => {
    tournamentEngine.setTournamentLocalTimeZone({ localTimeZone: 'America/New_York' });
    tournamentEngine.setTournamentLocalTimeZone({ localTimeZone: 'Asia/Tokyo' });
    expect(currentZone()).toBe('Asia/Tokyo');
  });
});
