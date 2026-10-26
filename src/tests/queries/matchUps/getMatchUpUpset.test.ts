import { getMatchUpUpset } from '@Query/matchUp/getMatchUpUpset';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants and types
import { COMPLETED, DEFAULTED, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { INVALID_VALUES, MISSING_MATCHUP } from '@Constants/errorConditionConstants';
import { RANKING, RATING, SEEDING } from '@Constants/scaleConstants';

const FORMAT = 'SET3-S:6/TB7';
const NOT_SCORED = 'not a fully scored result';

// side 2 wins 6-3 6-4 unless told otherwise
const straightSets = (winningSide = 2) => {
  const [w, l] = [6, winningSide === 2 ? 3 : 4];
  const set = (setNumber: number, loserGames: number) => ({
    side1Score: winningSide === 1 ? w : loserGames,
    side2Score: winningSide === 2 ? w : loserGames,
    winningSide,
    setNumber,
  });
  return { sets: [set(1, l), set(2, 4)] };
};

function matchUp({
  seeds = [undefined, undefined] as (number | string | undefined)[],
  participants = [{}, {}] as any[],
  matchUpStatus = COMPLETED,
  winningSide = 2,
  score = straightSets(2) as any,
  matchUpType = 'SINGLES',
}: Record<string, any> = {}) {
  const side = (sideNumber: number) => ({
    sideNumber,
    ...(seeds[sideNumber - 1] !== undefined && { seedValue: seeds[sideNumber - 1] }),
    participant: { participantId: `p${sideNumber}`, ...participants[sideNumber - 1] },
  });
  return {
    matchUpFormat: FORMAT,
    matchUpId: 'mu',
    matchUpStatus,
    matchUpType,
    winningSide,
    score,
    sides: [side(1), side(2)],
  } as any;
}

const rated = (scaleName: string, scaleValue: unknown, scaleType = 'ratings') => ({
  [scaleType]: { SINGLES: [{ scaleName, scaleValue }] },
});

describe('getMatchUpUpset — seeding (the default basis)', () => {
  it('an unseeded winner over a seed, and a lower seed over a higher one, are upsets', () => {
    let result: any = getMatchUpUpset({ matchUp: matchUp({ seeds: [1, undefined] }) });
    expect(result).toEqual({ isUpset: true, basis: SEEDING, winningSide: 2, winnerValue: undefined, loserValue: 1 });

    result = getMatchUpUpset({ matchUp: matchUp({ seeds: [2, 7] }) });
    expect(result).toMatchObject({ isUpset: true, winnerValue: 7, loserValue: 2 });

    // a seed block reads as its first seed
    result = getMatchUpUpset({ matchUp: matchUp({ seeds: [2, '5-8'] }) });
    expect(result).toMatchObject({ isUpset: true, winnerValue: 5 });
  });

  it('the favourite winning, or an unseeded loser, is not an upset', () => {
    let result: any = getMatchUpUpset({ matchUp: matchUp({ seeds: [4, 1] }) });
    expect(result).toMatchObject({ isUpset: false, winnerValue: 1, loserValue: 4 });

    result = getMatchUpUpset({ matchUp: matchUp({ seeds: [undefined, 3] }) });
    expect(result).toMatchObject({ isUpset: false, info: 'the loser was unseeded' });

    // `~` is an unseeded placeholder, not a seed
    result = getMatchUpUpset({ matchUp: matchUp({ seeds: ['~', undefined] }) });
    expect(result.isUpset).toEqual(false);
  });
});

describe('getMatchUpUpset — only a fully scored result counts (CA, 2026-10-26)', () => {
  it.each([RETIRED, WALKOVER, DEFAULTED])('%s is never an upset', (matchUpStatus) => {
    const result: any = getMatchUpUpset({ matchUp: matchUp({ seeds: [1, undefined], matchUpStatus }) });
    expect(result).toEqual({ isUpset: false, basis: SEEDING, info: NOT_SCORED });
  });

  it('a COMPLETED result whose score is unfinished or absent is not an upset', () => {
    const unfinished = {
      sets: [
        { setNumber: 1, side1Score: 3, side2Score: 6, winningSide: 2 },
        { setNumber: 2, side1Score: 2, side2Score: 4, winningSide: 2 },
      ],
    };
    let result: any = getMatchUpUpset({ matchUp: matchUp({ seeds: [1, undefined], score: unfinished }) });
    expect(result).toMatchObject({ isUpset: false, info: NOT_SCORED });

    result = getMatchUpUpset({ matchUp: matchUp({ seeds: [1, undefined], score: { sets: [] } }) });
    expect(result).toMatchObject({ isUpset: false, info: NOT_SCORED });

    result = getMatchUpUpset({ matchUp: matchUp({ seeds: [1, undefined], winningSide: null }) });
    expect(result).toMatchObject({ isUpset: false, info: NOT_SCORED });

    // control: the same matchUp fully scored IS an upset
    expect(getMatchUpUpset({ matchUp: matchUp({ seeds: [1, undefined] }) }).isUpset).toEqual(true);
  });
});

describe('getMatchUpUpset — ratings take the scale direction from ratingsParameters', () => {
  it('WTN: lower is stronger', () => {
    // the winner (side 2) rated 20, weaker than the loser's 10
    const weakerWins = matchUp({
      participants: [rated('WTN', { wtnRating: 10 }), rated('WTN', { wtnRating: 20, confidence: 90 })],
    });
    let result: any = getMatchUpUpset({ matchUp: weakerWins, scaleType: RATING, scaleName: 'WTN' });
    expect(result).toEqual({ isUpset: true, basis: RATING, winningSide: 2, winnerValue: 20, loserValue: 10 });

    const strongerWins = matchUp({ participants: [rated('WTN', { wtnRating: 20 }), rated('WTN', { wtnRating: 10 })] });
    result = getMatchUpUpset({ matchUp: strongerWins, scaleType: RATING, scaleName: 'WTN' });
    expect(result.isUpset).toEqual(false);
  });

  it('UTR: higher is stronger, and ingested string values are read', () => {
    const weakerWins = matchUp({
      participants: [rated('UTR', { utrRating: '12.48' }), rated('UTR', { utrRating: '10.1' })],
    });
    let result: any = getMatchUpUpset({ matchUp: weakerWins, scaleType: RATING, scaleName: 'UTR' });
    expect(result).toMatchObject({ isUpset: true, winnerValue: 10.1, loserValue: 12.48 });

    const strongerWins = matchUp({
      participants: [rated('UTR', { utrRating: 10.1 }), rated('UTR', { utrRating: 12.48 })],
    });
    result = getMatchUpUpset({ matchUp: strongerWins, scaleType: RATING, scaleName: 'UTR' });
    expect(result.isUpset).toEqual(false);
  });

  it('a side without a value gives no verdict; a scale of unknown direction is an error unless told', () => {
    const halfRated = matchUp({ participants: [rated('UTR', { utrRating: 12 }), {}] });
    let result: any = getMatchUpUpset({ matchUp: halfRated, scaleType: RATING, scaleName: 'UTR' });
    expect(result).toMatchObject({ isUpset: false, info: 'a side has no UTR value' });

    const unknown = matchUp({ participants: [rated('HOUSE', 50), rated('HOUSE', 10)] });
    result = getMatchUpUpset({ matchUp: unknown, scaleType: RATING, scaleName: 'HOUSE' });
    expect(result.error).toBeDefined();
    result = getMatchUpUpset({ matchUp: unknown, scaleType: RATING, scaleName: 'HOUSE', ascending: false });
    expect(result).toMatchObject({ isUpset: true, winnerValue: 10, loserValue: 50 });
  });
});

describe('getMatchUpUpset — rankings: a lower position is stronger', () => {
  it('a winner ranked 50 over a loser ranked 10 is an upset', () => {
    const lowerRankedWins = matchUp({
      participants: [rated('ITF', 10, 'rankings'), rated('ITF', 50, 'rankings')],
    });
    let result: any = getMatchUpUpset({ matchUp: lowerRankedWins, scaleType: RANKING, scaleName: 'ITF' });
    expect(result).toMatchObject({ isUpset: true, basis: RANKING, winnerValue: 50, loserValue: 10 });

    const higherRankedWins = matchUp({ participants: [rated('ITF', 50, 'rankings'), rated('ITF', 10, 'rankings')] });
    result = getMatchUpUpset({ matchUp: higherRankedWins, scaleType: RANKING, scaleName: 'ITF' });
    expect(result.isUpset).toEqual(false);
  });
});

describe('getMatchUpUpset — parameters', () => {
  it('refuses what it cannot answer', () => {
    let result: any = getMatchUpUpset({ matchUp: undefined as any });
    expect(result.error).toEqual(MISSING_MATCHUP);
    result = getMatchUpUpset({ matchUp: matchUp(), scaleType: RATING });
    expect(result.error).toEqual(INVALID_VALUES);
    result = getMatchUpUpset({ matchUp: matchUp(), scaleType: 'ELO_ISH' as any });
    expect(result.error).toEqual(INVALID_VALUES);
  });
});

describe('getMatchUpUpset — through the engine, on hydrated matchUps', () => {
  it('answers for every completed matchUp of a generated draw, with both verdicts present', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 16, seedsCount: 8 }],
      completeAllMatchUps: true,
      randomWinningSide: true,
      setState: true,
      nonRandom: 1,
    });
    const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
    const completed = matchUps.filter((m: any) => m.matchUpStatus === COMPLETED && m.winningSide);
    expect(completed.length).toBeGreaterThan(8); // control: a real, completed draw

    const verdicts = completed.map((m: any) => tournamentEngine.getMatchUpUpset({ matchUp: m }));
    expect(verdicts.every((v: any) => !v.error && v.basis === SEEDING)).toEqual(true);
    // every seeded loss to a weaker side is flagged, and nothing else
    const expected = completed.map((m: any) => {
      const seed = (side: any) => side?.seedValue ?? side?.seedNumber;
      const winner = seed(m.sides.find((s: any) => s.sideNumber === m.winningSide));
      const loser = seed(m.sides.find((s: any) => s.sideNumber !== m.winningSide));
      return loser !== undefined && (winner === undefined || winner > loser);
    });
    expect(verdicts.map((v: any) => v.isUpset)).toEqual(expected);
    // non-degenerate: the draw holds both verdicts (the seed comparison itself is pinned above)
    expect(expected.includes(true)).toEqual(true);
    expect(expected.includes(false)).toEqual(true);
  });
});
