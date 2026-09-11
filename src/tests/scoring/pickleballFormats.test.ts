import { competitionFormats } from '@Fixtures/scoring/competitionFormats';
import { matchUpFormats } from '@Fixtures/scoring/matchUpFormats';
import { stringify } from '@Helpers/matchUpFormatCode/stringify';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { expect, it, describe } from 'vitest';

// constants
import { PICKLEBALL } from '@Constants/disciplineConstants';
import { RALLY } from '@Constants/matchUpFormatConstants';

const PICKLEBALL_FORMATS = Object.entries(matchUpFormats).filter(([name]) => name.startsWith('FORMAT_PICKLEBALL'));

describe('pickleball matchUpFormat presets', () => {
  it('publishes presets for the recognized pickleball games', () => {
    const codes = PICKLEBALL_FORMATS.map(([, code]) => code);
    expect(codes.length).toBeGreaterThanOrEqual(9);
    expect(codes).toContain('SET3-S:TB11');
    expect(codes).toContain('SET3-S:TB11@RALLY');
    expect(codes).toContain('SET3-S:TB21@RALLY');
  });

  it.each(PICKLEBALL_FORMATS)('%s parses and round-trips unchanged', (_name, code) => {
    const parsed: any = parse(code);
    expect(parsed).toBeDefined();
    expect(stringify(parsed)).toEqual(code);
  });

  it.each(PICKLEBALL_FORMATS)('%s is a tiebreak set, not a games set', (_name, code) => {
    const parsed: any = parse(code);
    const setFormat = parsed.finalSetFormat ?? parsed.setFormat;

    // a pickleball game is a race to a target with no games beneath it
    expect(setFormat.tiebreakSet?.tiebreakTo).toBeGreaterThanOrEqual(11);
    expect(setFormat.setTo).toBeUndefined();
  });

  it('distinguishes rally scoring from side-out scoring', () => {
    expect(parse('SET3-S:TB11@RALLY')?.setFormat?.tiebreakSet?.modifier).toEqual(RALLY);
    // side-out is the default and carries no modifier
    expect(parse('SET3-S:TB11')?.setFormat?.tiebreakSet?.modifier).toBeUndefined();
  });

  it('expresses sudden death as NOAD, preserving the canonical NOAD-before-modifier order', () => {
    const parsed: any = parse('SET3-S:TB11NOAD@RALLY');
    expect(parsed.setFormat.tiebreakSet.NoAD).toEqual(true);
    expect(parsed.setFormat.tiebreakSet.modifier).toEqual(RALLY);
    expect(stringify(parsed)).toEqual('SET3-S:TB11NOAD@RALLY');

    // win-by-2 is the default: absent NOAD, the game continues past the target
    expect(parse('SET3-S:TB11')?.setFormat?.tiebreakSet?.NoAD).toBeUndefined();
  });
});

describe('pickleball competitionFormat', () => {
  it('publishes a PICKLEBALL_STANDARD profile', () => {
    const profile: any = competitionFormats.PICKLEBALL_STANDARD;

    expect(profile.sport).toEqual(PICKLEBALL);
    expect(profile.matchUpFormat).toEqual('SET3-S:TB11');
    // the server is decided by who won the rally, not by alternating games as in tennis
    expect(profile.serverRule).toEqual('WINNER_SERVES');
    expect(parse(profile.matchUpFormat)).toBeDefined();
  });

  it('carries pickleball-specific point results', () => {
    const results = (competitionFormats.PICKLEBALL_STANDARD as any).pointProfile.pointResults.map(
      ({ result }) => result,
    );
    expect(results).toContain('Kitchen Fault');
    expect(results).toContain('Service Fault');
  });

  it('leaves the tennis profile untouched', () => {
    const tennis: any = competitionFormats.TENNIS_STANDARD;
    expect(tennis.sport).toEqual('TENNIS');
    expect(tennis.matchUpFormat).toEqual('SET3-S:6/TB7');
  });
});
