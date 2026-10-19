import { modifyTournamentRecord } from '@Generators/mocks/modifyTournamentRecord';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomSource, setRandomSource } from '@Tools/prng';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants
import { ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';
import { DOUBLES, TEAM } from '@Constants/eventConstants';

/**
 * A mocksEngine seed names its record (2026-10-17 mocks assessment, M3 and M5).
 *
 * Given the same `nonRandom`, profile, clock and factory version, a call returns the same record, BYTE
 * for byte, whatever the process's random source is and whatever was generated before it. Before,
 * `nonRandom` reached only the mocks' own generators: the tournamentId, addresses, event participants,
 * draw/venue/tieFormat ids and everything `modifyTournamentRecord` added came from the ambient source.
 * Vitest hid it, because the harness seeds `Math.random` per test (seedMathRandom.ts); so each pair
 * below runs under two DIFFERENT ambient sources with an unrelated generation between them.
 *
 * And a profile is configuration: generating from it never changes it, so reusing one object asks
 * for the same thing again.
 */

const SEED = 20261017;

beforeEach(() => {
  setClock('2026-10-17T12:00:00Z');
});
afterEach(() => {
  setClock();
  setRandomSource();
});

/** Generates under one ambient source, does unrelated work under another, generates again. */
function twice<T>(generate: () => T): [T, T] {
  setRandomSource(1);
  const first = generate();
  setRandomSource(999);
  mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8, completeAllMatchUps: true }] });
  const second = generate();
  return [first, second];
}

const PROFILES: Record<string, any> = {
  bare: {},
  addresses: {
    participantsProfile: {
      participantsCount: 8,
      addressProps: { citiesCount: 3, statesCount: 2, postalCodesCount: 2 },
    },
  },
  completed: { drawProfiles: [{ drawSize: 16, completeAllMatchUps: true }] },
  doubles: { drawProfiles: [{ drawSize: 8, eventType: DOUBLES, completeAllMatchUps: true }] },
  roundRobinWithPlayoff: {
    drawProfiles: [{ drawSize: 16, drawType: ROUND_ROBIN_WITH_PLAYOFF, completeAllMatchUps: true }],
  },
  team: { drawProfiles: [{ drawSize: 4, eventType: TEAM, completeAllMatchUps: true }] },
  uniqueEventParticipants: {
    eventProfiles: [{ eventName: 'E', drawProfiles: [{ drawSize: 8, uniqueParticipants: true }] }],
  },
  flights: { eventProfiles: [{ eventName: 'F', drawProfiles: [{ drawSize: 8 }, { drawSize: 8 }] }] },
  venues: { venueProfiles: [{ courtsCount: 4 }], drawProfiles: [{ drawSize: 8 }] },
  league: { leagueProfiles: [{ teamsCount: 4 }] },
};

describe('the same seed gives the same record', () => {
  for (const [name, profile] of Object.entries(PROFILES)) {
    it(name, () => {
      const [first, second] = twice(
        () => mocksEngine.generateTournamentRecord({ ...profile, nonRandom: SEED }).tournamentRecord,
      );
      expect(first).toBeDefined();
      expect(JSON.stringify(second)).toEqual(JSON.stringify(first));
    });
  }

  it('a different seed gives a different record (the comparison can fail)', () => {
    setRandomSource(1);
    const first = mocksEngine.generateTournamentRecord({ ...PROFILES.completed, nonRandom: SEED }).tournamentRecord;
    const second = mocksEngine.generateTournamentRecord({
      ...PROFILES.completed,
      nonRandom: SEED + 1,
    }).tournamentRecord;
    expect(JSON.stringify(second)).not.toEqual(JSON.stringify(first));
  });

  it('modifyTournamentRecord with the same seed adds the same participants, events and draws', () => {
    const base = () =>
      mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], nonRandom: 3 }).tournamentRecord;
    // modifyTournamentRecord changes the record it is given and returns counts, not the record
    const [first, second] = twice(() => {
      const tournamentRecord = base();
      const result: any = mocksEngine.modifyTournamentRecord({
        participantsProfile: { participantsCount: 8, idPrefix: 'P' },
        eventProfiles: [{ eventName: 'New', drawProfiles: [{ drawSize: 4 }] }],
        drawProfiles: [{ drawSize: 4 }],
        tournamentRecord,
        nonRandom: SEED,
      });
      expect(result.success).toEqual(true);
      return tournamentRecord;
    });
    expect(first.events.length).toEqual(3);
    expect(JSON.stringify(second)).toEqual(JSON.stringify(first));
  });

  it('a seeded call draws nothing from the process random source', () => {
    const draws = () => [0, 1, 2].map(() => randomSource()());

    setRandomSource(42);
    const untouched = draws();

    setRandomSource(42);
    mocksEngine.generateTournamentRecord({ ...PROFILES.completed, nonRandom: SEED });
    expect(draws()).toEqual(untouched);

    // control: an unseeded call does draw from it
    setRandomSource(42);
    mocksEngine.generateTournamentRecord({ ...PROFILES.completed });
    expect(draws()).not.toEqual(untouched);
  });
});

describe('a profile is not changed by generating from it', () => {
  it('rankingRange', () => {
    const rankingRange = Object.freeze([1, 2]);
    const participantsProfile = {
      participantsCount: 4,
      scaledParticipantsCount: 4,
      category: { categoryName: 'U18' },
      rankingRange,
    };
    for (const nonRandom of [1, 2]) {
      const result: any = mocksEngine.generateTournamentRecord({ participantsProfile, nonRandom });
      expect(result.success).toEqual(true);
    }
    expect(rankingRange).toEqual([1, 2]);
  });

  it('rankingRange bounds hold on reuse', () => {
    const participantsProfile: any = {
      participantsCount: 32,
      scaledParticipantsCount: 32,
      category: { categoryName: 'U18' },
      rankingRange: [1, 2],
    };
    for (const nonRandom of [1, 2, 3]) {
      const { tournamentRecord }: any = mocksEngine.generateTournamentRecord({ participantsProfile, nonRandom });
      const rankings = (tournamentRecord.participants ?? [])
        .flatMap((participant: any) => participant.timeItems ?? [])
        .filter((timeItem: any) => timeItem.itemType?.startsWith('SCALE.RANKING'))
        .map((timeItem: any) => timeItem.itemValue);
      expect(rankings.length).toBeGreaterThan(0);
      for (const ranking of rankings) expect([1, 2]).toContain(ranking);
    }
  });

  it('modifyTournamentRecord leaves participantsProfile.idPrefix and eventProfile.gender as given', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }] });
    const participantsProfile = { participantsCount: 4, idPrefix: 'P' };
    const eventProfiles = [{ eventId: tournamentRecord.events[0].eventId, drawProfiles: [{ drawSize: 4 }] }];
    const result: any = modifyTournamentRecord({ participantsProfile, eventProfiles, tournamentRecord } as any);

    expect(result.success).toEqual(true);
    expect(participantsProfile).toEqual({ participantsCount: 4, idPrefix: 'P' });
    expect(eventProfiles[0]).not.toHaveProperty('gender');

    // the prefix is still applied to what is generated, so new ids cannot collide with existing ones
    const prefixed = tournamentRecord.participants.filter((participant: any) =>
      participant.participantId.startsWith('P-8'),
    );
    expect(prefixed.length).toBeGreaterThan(0);
  });
});
