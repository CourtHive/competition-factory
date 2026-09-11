import { getTournamentTimeZone } from '@Query/tournaments/getTournamentTimeZone';
import { describe, expect, it } from 'vitest';

// constants
import { CONFLICTING_TIME_ZONES, INVALID_TIME_ZONE } from '@Constants/errorConditionConstants';

const venueWithZone = (timeZone?: string) => ({ addresses: timeZone ? [{ timeZone }] : [] });

describe('getTournamentTimeZone', () => {
  it('returns the tournament localTimeZone when set and valid', () => {
    const result: any = getTournamentTimeZone({ tournamentRecord: { localTimeZone: 'America/New_York' } as any });
    expect(result.timeZone).toEqual('America/New_York');
    expect(result.inferred).toBeUndefined();
  });

  it('errors when localTimeZone is set but not a valid IANA zone', () => {
    const result: any = getTournamentTimeZone({ tournamentRecord: { localTimeZone: 'Not/AZone' } as any });
    expect(result.error).toEqual(INVALID_TIME_ZONE);
  });

  it('infers a single distinct zone from venue addresses', () => {
    const tournamentRecord: any = { venues: [venueWithZone('Europe/Prague'), venueWithZone('Europe/Prague')] };
    const result: any = getTournamentTimeZone({ tournamentRecord });
    expect(result.timeZone).toEqual('Europe/Prague');
    expect(result.inferred).toEqual(true);
  });

  it('errors when venues disagree and no tournament zone is set', () => {
    const tournamentRecord: any = { venues: [venueWithZone('Europe/Prague'), venueWithZone('Europe/Vienna')] };
    const result: any = getTournamentTimeZone({ tournamentRecord });
    expect(result.error).toEqual(CONFLICTING_TIME_ZONES);
  });

  it('prefers the tournament localTimeZone over conflicting venue zones', () => {
    const tournamentRecord: any = {
      localTimeZone: 'Europe/Prague',
      venues: [venueWithZone('Europe/Prague'), venueWithZone('Europe/Vienna')],
    };
    const result: any = getTournamentTimeZone({ tournamentRecord });
    expect(result.timeZone).toEqual('Europe/Prague');
    expect(result.error).toBeUndefined();
  });

  it('returns no timeZone and no error when none can be determined', () => {
    const result: any = getTournamentTimeZone({ tournamentRecord: { venues: [venueWithZone()] } as any });
    expect(result.timeZone).toBeUndefined();
    expect(result.error).toBeUndefined();
  });
});
