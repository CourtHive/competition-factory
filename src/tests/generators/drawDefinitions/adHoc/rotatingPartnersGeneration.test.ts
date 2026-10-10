import { generateAmericanoPairings } from '@Generators/drawDefinitions/drawTypes/adHoc/rotatingPartners/generateAmericanoPairings';
import { generateMexicanoPairings } from '@Generators/drawDefinitions/drawTypes/adHoc/rotatingPartners/generateMexicanoPairings';
import { createSeededRandom, setRandomSource } from '@Tools/prng';
import { afterEach, describe, expect, it, vi } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants and types
import type { RotatingPartnerRound } from '@Generators/drawDefinitions/drawTypes/adHoc/rotatingPartners/rotatingPartnerTypes';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

const individualIds = (count: number) => Array.from({ length: count }, (_, index) => `player-${index + 1}`);

describe('Americano partnership rotation', () => {
  it.each([4, 8, 12, 16, 32, 64])('covers every partnership once for %i individuals', (count) => {
    const participantIds = individualIds(count);
    const originalIds = [...participantIds];
    let result: any = generateAmericanoPairings({ participantIds, seed: 73 });

    expect(result.error).toBeUndefined();
    expect(result.expectedRounds).toBe(count - 1);
    expect(result.completeCoverage).toBe(true);
    expect(result.rounds).toHaveLength(count - 1);
    const partnerships: string[] = [];
    for (const round of result.rounds as RotatingPartnerRound[]) {
      expect(round).toHaveLength(count / 4);
      const players = round.flat(2);
      expect(players).toHaveLength(count);
      expect(new Set(players)).toEqual(new Set(participantIds));
      for (const match of round) {
        expect(new Set(match.flat()).size).toBe(4);
        for (const side of match) partnerships.push(JSON.stringify([...side].sort((a, b) => a.localeCompare(b))));
      }
    }
    expect(partnerships).toHaveLength((count * (count - 1)) / 2);
    expect(new Set(partnerships).size).toBe(partnerships.length);
    expect(participantIds).toEqual(originalIds);
  });

  it('replays the seed and preserves the full-schedule prefix when truncated', () => {
    const participantIds = individualIds(12);
    const full = generateAmericanoPairings({ participantIds, seed: 15 });
    const replay = generateAmericanoPairings({ participantIds, seed: 15 });
    const partial = generateAmericanoPairings({ participantIds, seed: 15, roundsCount: 3 });
    expect(replay).toEqual(full);
    expect(partial.rounds).toEqual(full.rounds?.slice(0, 3));
    expect(partial.completeCoverage).toBe(false);
    expect(partial.expectedRounds).toBe(11);
    expect(generateAmericanoPairings({ participantIds, seed: 16 }).rounds).not.toEqual(full.rounds);
  });

  it.each(
    [[], individualIds(3), individualIds(6), ['a', 'b', 'c', 'a'], ['a', 'b', 'c', '']].map((participantIds) => ({
      participantIds,
    })),
  )('refuses unsupported or duplicate entrants', ({ participantIds }) => {
    expect(generateAmericanoPairings({ participantIds }).error).toBe(INVALID_VALUES);
  });

  it.each([0, -1, 1.5, 8, NaN])('refuses invalid round count %s for eight players', (roundsCount) => {
    expect(generateAmericanoPairings({ participantIds: individualIds(8), roundsCount }).error).toBe(INVALID_VALUES);
  });

  it.each([NaN, Infinity, 1.5])('refuses invalid seed %s', (seed) => {
    expect(generateAmericanoPairings({ participantIds: individualIds(8), seed }).error).toBe(INVALID_VALUES);
  });
});

describe('Mexicano standings-based round', () => {
  it('groups adjacent ranks and pairs first/fourth against second/third', () => {
    const standings = individualIds(12).map((participantId, index) => ({ participantId, pointsScored: 120 - index }));
    const before = structuredClone(standings);
    const result = generateMexicanoPairings({ standings: [...standings].reverse() });
    expect(result.error).toBeUndefined();
    expect(result.orderedParticipantIds).toEqual(individualIds(12));
    expect(result.round).toEqual([
      [
        ['player-1', 'player-4'],
        ['player-2', 'player-3'],
      ],
      [
        ['player-5', 'player-8'],
        ['player-6', 'player-7'],
      ],
      [
        ['player-9', 'player-12'],
        ['player-10', 'player-11'],
      ],
    ]);
    expect(standings).toEqual(before);
  });

  it('resolves tied scores reproducibly regardless of source array order, including zero scores', () => {
    const standings = individualIds(8).map((participantId) => ({ participantId, pointsScored: 0 }));
    const result = generateMexicanoPairings({ standings, seed: 8 });
    expect(generateMexicanoPairings({ standings: [...standings].reverse(), seed: 8 })).toEqual(result);
    expect(new Set(result.round?.flat(2))).toEqual(new Set(individualIds(8)));
    expect(generateMexicanoPairings({ standings, seed: 9 }).round).not.toEqual(result.round);
  });

  it.each([-1, 0.5, NaN, Infinity])('refuses invalid score %s instead of treating it as zero', (pointsScored) => {
    const standings = individualIds(4).map((participantId) => ({ participantId, pointsScored }));
    expect(generateMexicanoPairings({ standings }).error).toBe(INVALID_VALUES);
  });

  it('refuses duplicates, unsupported counts and invalid seeds', () => {
    const standings = individualIds(4).map((participantId) => ({ participantId, pointsScored: 0 }));
    expect(generateMexicanoPairings({ standings: [] }).error).toBe(INVALID_VALUES);
    expect(generateMexicanoPairings({ standings: standings.slice(0, 3) }).error).toBe(INVALID_VALUES);
    expect(generateMexicanoPairings({ standings: [standings[0], ...standings.slice(0, 3)] }).error).toBe(
      INVALID_VALUES,
    );
    expect(generateMexicanoPairings({ standings, seed: Infinity }).error).toBe(INVALID_VALUES);
  });
});

it('exposes both pure generators through the tournament engine', () => {
  mocksEngine.generateTournamentRecord({ setState: true });
  expect(tournamentEngine.generateAmericanoPairings({ participantIds: individualIds(8) }).rounds).toHaveLength(7);
  const standings = individualIds(8).map((participantId) => ({ participantId, pointsScored: 0 }));
  expect(tournamentEngine.generateMexicanoPairings({ standings }).round).toHaveLength(2);
});

describe('rotating partner randomness precedence and replay', () => {
  afterEach(() => {
    setRandomSource();
    vi.restoreAllMocks();
  });

  const generators = [
    { generate: generateAmericanoPairings, params: { participantIds: individualIds(8) } },
    {
      generate: generateMexicanoPairings,
      params: { standings: individualIds(8).map((participantId) => ({ participantId, pointsScored: 0 })) },
    },
  ];

  it.each(generators)('honors explicit seed, call random, configured source and fallback', ({ generate, params }) => {
    // Both typed generators share seed/random controls; invoke the matching argument shape.
    const invoke = (controls: { seed?: number; random?: () => number }) =>
      params.participantIds !== undefined
        ? generateAmericanoPairings({ ...params, ...controls })
        : generateMexicanoPairings({ ...params, ...controls });
    const random = vi.fn(() => 0.25);
    setRandomSource(() => 0.5);
    expect(invoke({ seed: 73, random }).seedUsed).toBe(73);
    expect(random).not.toHaveBeenCalled();
    expect(invoke({ random }).seedUsed).toBe(2 ** 30);
    const configured = invoke({});
    expect(configured.seedUsed).toBe(2 ** 31);
    expect(invoke({ seed: configured.seedUsed })).toEqual(configured);
    setRandomSource();
    vi.spyOn(Math, 'random').mockReturnValue(0.125);
    expect(invoke({}).seedUsed).toBe(2 ** 29);
    expect(generate).toBeDefined();
  });

  it('honors engine nonRandom and reports a seed that replays both generators', () => {
    for (const method of ['generateAmericanoPairings', 'generateMexicanoPairings'] as const) {
      const params =
        method === 'generateAmericanoPairings'
          ? { participantIds: individualIds(8) }
          : { standings: individualIds(8).map((participantId) => ({ participantId, pointsScored: 0 })) };
      let result: any = tournamentEngine[method]({ ...params, nonRandom: 17 });
      expect(tournamentEngine[method]({ ...params, nonRandom: 17 })).toEqual(result);
      expect(result.seedUsed).toBe(Math.floor(createSeededRandom(17)() * 2 ** 32));
      expect(tournamentEngine[method]({ ...params, seed: result.seedUsed })).toEqual(result);
    }
  });
});

describe('Mexicano round-specific seeds', () => {
  const standings = individualIds(16).map((participantId) => ({ participantId, pointsScored: 0 }));

  it('replays a round with a base seed and varies tied ordering across rounds', () => {
    const first = generateMexicanoPairings({ standings, seed: 42, roundNumber: 1 });
    const second = generateMexicanoPairings({ standings, seed: 42, roundNumber: 2 });
    expect(first.baseSeed).toBe(42);
    expect(first.seedUsed).not.toBe(second.seedUsed);
    expect(first.round).not.toEqual(second.round);
    expect(generateMexicanoPairings({ standings: [...standings].reverse(), seed: 42, roundNumber: 1 })).toEqual(first);
    const replay = generateMexicanoPairings({ standings, seed: first.seedUsed });
    expect(replay.round).toEqual(first.round);
    expect(replay.orderedParticipantIds).toEqual(first.orderedParticipantIds);
    expect(replay.seedUsed).toBe(first.seedUsed);
  });

  it('returns a generated base seed for profile persistence', () => {
    const result = generateMexicanoPairings({ standings, roundNumber: 3, random: () => 0.25 });
    expect(result.baseSeed).toBe(2 ** 30);
    expect(generateMexicanoPairings({ standings, seed: result.baseSeed, roundNumber: 3 })).toEqual(result);
  });

  it.each([0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])('refuses invalid roundNumber %s', (roundNumber) => {
    expect(generateMexicanoPairings({ standings, roundNumber }).error).toBe(INVALID_VALUES);
  });
});
