import { isValidMatchUpFormat } from '@Validators/isValidMatchUpFormat';
import { stringify } from '@Helpers/matchUpFormatCode/stringify';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { describe, expect, it } from 'vitest';

// constants
import { RALLY } from '@Constants/matchUpFormatConstants';

/**
 * `parse` refuses what `isValidMatchUpFormat` refuses (CA, 2026-10-02).
 *
 * The parser read what it recognised and ignored the rest, while `isValid` refused the same codes — and
 * fifteen modules call `parse` without asking `isValid`, so a malformed stored format was quietly
 * reinterpreted. `isValid` in turn refused well-formed codes its regex did not anticipate. Validator
 * debate G3, G7, G8, G10.
 */
const both = (code: string) => ({ parsed: !!parse(code), valid: isValidMatchUpFormat({ matchUpFormat: code }) });

describe('junk is refused by parse and isValid alike', () => {
  it.each([
    ['trailing junk', 'SET3-S:6/TB7;DROP'],
    ['a trailing space', 'SET3-S:6/TB7 '],
    ['a fractional tiebreakAt', 'SET3-S:6/TB7@6.5'],
    ['an invalid final-set section, which was silently dropped', 'SET5-S:6/TB7-F:S:6'],
    ['a final set on a one-set match, which the analysis read as a match tiebreak', 'SET1-S:6/TB7-F:TB10'],
    ['a tiebreak with no target', 'SET3-S:6/TB7-F:6/TB'],
    // NOAD goes before a modifier; after it, the modifier read as `RALLYNOAD` and rally scoring was lost
    ['NOAD swallowed by a tiebreak modifier', 'SET3-S:TB11@RALLYNOAD'],
    ['NOAD swallowed by a timed modifier', 'SET3-S:T10@RALLYNOAD'],
    // a modifier is upper-case letters (CA 2026-10-25): `@rally` scored side-out
    ['a lower-case tiebreak modifier', 'SET3-S:TB11@rally'],
    ['a lower-case timed modifier', 'SET3-S:T10@rally'],
    ['a modifier that is not letters', 'SET3-S:TB11@R_1'],
  ])('%s: %s', (_, code) => {
    expect(both(code)).toEqual({ parsed: false, valid: false });
  });
});

describe('well-formed codes are accepted by both, including equivalent spellings', () => {
  it.each([
    ['NOAD games with a redundant @', 'SET3-S:6NOAD/TB7@6'],
    ['a two-digit redundant @', 'SET3-S:12/TB7@12'],
    ['a two-digit @ below setTo', 'SET3-S:15/TB7@14'],
    ['a three-digit tiebreak', 'SET3-S:6/TB100'],
    ['an explicit default margin', 'SET3-S:5WB2'],
    ['SET1X for SET1', 'SET1X-S:T10'],
    ['a final set identical to the others', 'SET3-S:6-F:6'],
    ['a games-based timed set with its G', 'SET1-S:T20G'],
    ['a no-deuce rally tiebreak, NOAD before the modifier', 'SET3-S:TB11NOAD@RALLY'],
    ['a timed set with a tiebreak', 'SET3-S:T20/TB7'],
    ['a timed set with a modifier', 'SET3-S:T20@RALLY'],
  ])('%s: %s', (_, code) => {
    expect(both(code)).toEqual({ parsed: true, valid: true });
  });

  it('an equivalent spelling parses to the same thing as its canonical form', () => {
    expect(parse('SET3-S:6NOAD/TB7@6')).toEqual(parse('SET3-S:6NOAD/TB7'));
    // the identical final set, the timed G and the default game are not kept (CA 2026-10-25)
    expect(parse('SET3-S:6-F:6')).toEqual(parse('SET3-S:6'));
    expect(parse('SET3-S:6/TB7-F:6/TB7@6')).toEqual(parse('SET3-S:6/TB7'));
    expect(parse('SET1-S:T20G')).toEqual(parse('SET1-S:T20'));
    expect(parse('SET3-S:6/TB7-G:TN')).toEqual(parse('SET3-S:6/TB7'));
  });
});

describe('stringify never writes a code parse refuses', () => {
  it('a game format or a modifier it cannot write gives undefined', () => {
    expect(stringify({ bestOf: 3, setFormat: { tiebreakSet: { tiebreakTo: 11, modifier: 'rally' } } })).toBeUndefined();
    expect(stringify({ bestOf: 1, setFormat: { timed: true, minutes: 10, modifier: 'R_1' } })).toBeUndefined();
    expect(stringify({ bestOf: 3, setFormat: { setTo: 6 }, gameFormat: { type: 'BOGUS' } })).toBeUndefined();
  });

  it('a match modifier parse keeps is written back', () => {
    expect(stringify(parse('SET3Z-S:6/TB7'))).toEqual('SET3Z-S:6/TB7');
  });
});

describe('the canonical rally format keeps both of its meanings', () => {
  it('TB11NOAD@RALLY is rally scoring, won by one', () => {
    const tiebreakSet: any = parse('SET3-S:TB11NOAD@RALLY')?.setFormat?.tiebreakSet;
    expect(tiebreakSet).toEqual({ tiebreakTo: 11, NoAD: true, modifier: RALLY });
  });
});
