import { generateOutcome } from '@Generators/mocks/generateOutcome';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';
import { setClock } from '@Tools/clock';

// constants
import { INVALID_DATE, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FEMALE, MALE } from '@Constants/genderConstants';
import { PAIR } from '@Constants/participantConstants';
import { DOUBLES } from '@Constants/eventConstants';

/**
 * A mocksEngine input is validated, and what it asks for is what it gets (phase 4b of the mocksEngine
 * hardening plan: assessment M6, M7, M8; workstream findings M13, M14, M15, M17).
 */

const personsOf = (tournamentRecord: any) =>
  tournamentRecord.participants.filter((participant: any) => participant.person).map(({ person }: any) => person);

describe('M6: address profiles use their own weights', () => {
  it('a citiesProfile alone gives those cities', () => {
    const { tournamentRecord }: any = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 6, addressProps: { citiesProfile: { Lyon: 4, Nice: 2 } } },
    });
    const cities = personsOf(tournamentRecord).map((person: any) => person.addresses?.[0]?.city);
    expect(cities.filter((city: string) => city === 'Lyon').length).toEqual(4);
    expect(cities.filter((city: string) => city === 'Nice').length).toEqual(2);
  });

  it('a citiesProfile beside a statesProfile still gives cities', () => {
    const { tournamentRecord }: any = mocksEngine.generateTournamentRecord({
      participantsProfile: {
        participantsCount: 4,
        addressProps: { citiesProfile: { Lyon: 4 }, statesProfile: { ARA: 4 } },
      },
    });
    for (const person of personsOf(tournamentRecord)) {
      expect(person.addresses?.[0]?.city).toEqual('Lyon');
      expect(person.addresses?.[0]?.state).toEqual('ARA');
    }
  });

  it('a negative or fractional weight is refused', () => {
    for (const citiesProfile of [{ Lyon: -1 }, { Lyon: 1.5 }]) {
      const result: any = mocksEngine.generateTournamentRecord({
        participantsProfile: { participantsCount: 4, addressProps: { citiesProfile } },
      });
      expect(result.error).toEqual(INVALID_VALUES);
    }
  });
});

describe('M7: given dates are kept, a missing one is derived, an inverted range is refused', () => {
  const generate = (dates: { startDate?: string; endDate?: string }) => {
    setClock('2026-10-17T12:00:00Z');
    try {
      return mocksEngine.generateTournamentRecord({ ...dates }) as any;
    } finally {
      setClock();
    }
  };
  const datesOf = (result: any) => [result.tournamentRecord.startDate, result.tournamentRecord.endDate];

  it('an endDate alone is the end, and the start is a week before it', () => {
    expect(datesOf(generate({ endDate: '2027-02-01' }))).toEqual(['2027-01-25', '2027-02-01']);
  });

  it('a startDate alone is the start, and the end is a week after it', () => {
    expect(datesOf(generate({ startDate: '2027-02-01' }))).toEqual(['2027-02-01', '2027-02-08']);
  });

  it('no dates: today and a week from today', () => {
    expect(datesOf(generate({}))).toEqual(['2026-10-17', '2026-10-24']);
  });

  it('an inverted range is refused', () => {
    expect(generate({ startDate: '2026-12-20', endDate: '2026-10-01' }).error).toEqual(INVALID_DATE);
  });
});

describe('M8: a matchUpStatusProfile and a winningSide are validated', () => {
  it('weights above 100 in all are refused', () => {
    expect((generateOutcome as any)({ matchUpStatusProfile: { [WALKOVER]: 80, [RETIRED]: 80 } }).error).toEqual(
      INVALID_VALUES,
    );
  });

  it('a negative weight is refused', () => {
    expect((generateOutcome as any)({ matchUpStatusProfile: { [WALKOVER]: -5 } }).error).toEqual(INVALID_VALUES);
  });

  it('a winningSide other than 1 or 2 is refused', () => {
    expect((generateOutcome as any)({ matchUpStatusProfile: { [WALKOVER]: 100 }, winningSide: 3 }).error).toEqual(
      INVALID_VALUES,
    );
  });

  it('control: weights within 100 and a valid winner generate', () => {
    const { outcome }: any = generateOutcome({ matchUpStatusProfile: { [WALKOVER]: 100 }, winningSide: 2 });
    expect(outcome.matchUpStatus).toEqual(WALKOVER);
    expect(outcome.winningSide).toEqual(2);
  });
});

describe('M13: court names alone say how many courts there are', () => {
  it('courtNames without courtsCount', () => {
    const result: any = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'Club', courtNames: ['Centre', 'One', 'Two'] }],
      setState: true,
    });
    expect(result.success).toEqual(true);
    const { venue } = tournamentEngine.findVenue({ venueId: result.venueIds[0] });
    expect(venue.courts.map((court: any) => court.courtName)).toEqual(['Centre', 'One', 'Two']);
  });
});

describe('M14: a league gender reaches its persons', () => {
  it('a FEMALE league fields women', () => {
    const { tournamentRecord }: any = mocksEngine.generateTournamentRecord({
      leagueProfiles: [{ teamsCount: 2, gender: FEMALE }],
    });
    const sexes = new Set(personsOf(tournamentRecord).map((person: any) => person.sex));
    expect([...sexes]).toEqual([FEMALE]);
  });

  it('a MALE league fields men', () => {
    const { tournamentRecord }: any = mocksEngine.generateTournamentRecord({
      leagueProfiles: [{ teamsCount: 2, gender: MALE }],
    });
    expect([...new Set(personsOf(tournamentRecord).map((person: any) => person.sex))]).toEqual([MALE]);
  });
});

describe('M15: a schedulingProfile is an array', () => {
  it('an object is refused, not thrown', () => {
    const result: any = mocksEngine.generateTournamentRecord({
      schedulingProfile: { scheduleDate: '2026-10-17' } as any,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });
});

describe('M17: a drawProfile named DOUBLES by matchUpType is sized for pairs', () => {
  it('matchUpType: DOUBLES generates PAIRs for the draw', () => {
    const result: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, matchUpType: DOUBLES }],
    });
    expect(result.success).toEqual(true);
    const pairs = result.tournamentRecord.participants.filter(
      (participant: any) => participant.participantType === PAIR,
    );
    expect(pairs.length).toBeGreaterThanOrEqual(8);
  });
});
