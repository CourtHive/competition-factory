import { resolveCompetitiveBands, resolveDeltaBands } from '@Query/matchUp/resolveCompetitiveBands';
import { parseScoreString } from '@Tools/parseScoreString';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { POLICY_TYPE_COMPETITIVE_BANDS } from '@Constants/policyConstants';

/**
 * EDGES OF THE FORMAT PARSER, THE SCORE PARSER AND THE BAND RESOLVERS that nothing exercised.
 *
 * Each expectation was taken from running the call, not from reading the code.
 */

describe('parse — matchUpFormat codes at the edge of the grammar', () => {
  it('keeps a match-level modifier it does not itself interpret', () => {
    expect(parse('SET3Z-S:6/TB7')).toEqual({
      setFormat: { setTo: 6, tiebreakFormat: { tiebreakTo: 7 }, tiebreakAt: 6 },
      matchMods: ['Z'],
      bestOf: 3,
    });
  });

  it('refuses a root it does not know', () => {
    expect(parse('XYZ3-S:6/TB7')).toBeUndefined();
  });

  it('refuses a code that states the match constraint twice', () => {
    expect(parse('INN4XA-S:O3-M:T50-M:T40')).toBeUndefined();
    // CONTROL: stated once, the same code parses
    expect(parse('INN4XA-S:O3-M:T50')?.aggregate).toEqual(true);
  });

  it('refuses a tiebreak that names no target', () => {
    expect(parse('SET3-S:6/TBX')).toBeUndefined();
  });

  it('reads what a timed set is counted in', () => {
    expect(parse('SET1-S:T20P')?.setFormat).toEqual({ timed: true, minutes: 20, based: 'P' });
    expect(parse('SET1-S:T20G')?.setFormat).toEqual({ timed: true, minutes: 20, based: 'G' });
  });

  it('reads a named modifier on a timed set', () => {
    expect(parse('SET3-S:T20@RALLY')?.setFormat).toEqual({ timed: true, minutes: 20, modifier: 'RALLY' });
  });
});

describe('parseScoreString — a bracketed tiebreak', () => {
  it('belongs to the set it is attached to', () => {
    expect(parseScoreString({ scoreString: '7-6[10-8]' })).toEqual([
      { side1Score: 7, side2Score: 6, side1TiebreakScore: 10, side2TiebreakScore: 8, winningSide: 1, setNumber: 1 },
    ]);
  });

  it('is a set of its own when it stands alone, recorded as tiebreak points', () => {
    const sets: any = parseScoreString({ scoreString: '6-3 4-6 [10-8]' });
    expect(sets[2]).toEqual({ side1TiebreakScore: 10, side2TiebreakScore: 8, winningSide: 1, setNumber: 3 });
  });

  // Until 2026-10-02 the format moved the points into the GAME fields — the one shape hydration then
  // rewrote to 1-0 with the points gone, and the analysis refused outright. See `tiebreakSetShape`.
  it('is recorded as tiebreak points, marked a tiebreak set, when the format says the deciding set is one', () => {
    const sets: any = parseScoreString({ scoreString: '6-3 3-6 [10-8]', matchUpFormat: 'SET3-S:6/TB7-F:TB10' });
    expect(sets[2]).toEqual({
      side1TiebreakScore: 10,
      side2TiebreakScore: 8,
      tiebreakSet: true,
      winningSide: 1,
      setNumber: 3,
    });
  });
});

describe('competitive bands are resolved from the policy a tournament carries', () => {
  const bands = { profileBands: { DECISIVE: 10, ROUTINE: 30 }, deltaBands: [{ label: 'x', max: 1 }] };

  function tournamentWithBands() {
    mocksEngine.generateTournamentRecord({
      policyDefinitions: { [POLICY_TYPE_COMPETITIVE_BANDS]: bands } as any,
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });
    return (tournamentEngine.getTournament() as any).tournamentRecord;
  }

  it('reads profileBands from the applied policy', () => {
    expect(resolveCompetitiveBands({ tournamentRecord: tournamentWithBands() })).toEqual(bands.profileBands);
  });

  it('reads deltaBands from the applied policy, and from an explicit one', () => {
    expect(resolveDeltaBands({ tournamentRecord: tournamentWithBands() })).toEqual(bands.deltaBands);
    expect(resolveDeltaBands({ policyDefinitions: { [POLICY_TYPE_COMPETITIVE_BANDS]: bands } as any })).toEqual(
      bands.deltaBands,
    );
  });

  it('has NO default deltaBands: a caller that did not opt in gets none', () => {
    expect(resolveDeltaBands({})).toBeUndefined();
  });
});
