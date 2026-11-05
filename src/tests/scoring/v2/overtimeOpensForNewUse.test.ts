import { harvestFormats } from '@Tests/testHarness/scoringConformance/harvestFormats';
import { isValidMatchUpFormat } from '@Validators/isValidMatchUpFormat';
import { resolveFormat } from '@Assemblies/engines/scoring/v2/format';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { describe, expect, it } from 'vitest';

/**
 * Overtime opens for new use (activation S6): a tournament may assign exactly the overtime codes the scoring engine
 * scores. One predicate, so tournament validation and the engine cannot disagree about which codes are legal; before,
 * the new-use check refused every overtime code, and lifting that blanket refusal would have admitted seven shapes
 * the engine refuses.
 */

const SCORED = [
  'HAL2XA-S:T45P-O:2X/T15P-F:TB1',
  'QTR4XA-S:T12P-O:U/T5P',
  'PER3XA-S:T20P-O:USD/T20P',
  'PER3XA-S:T20P-O:1SD/T5P-F:TB1',
  'HAL2XA-S:T40P-O:1/T10P',
  'HAL2XA-S:T45P-O:2X/T15P-F:SO5',
  'PER3XA-S:T20P-O:3/T5P-F:T10P',
];

const UNSCORED = [
  ['a tiebreak-only regulation', 'SET3XA-S:TB11-O:1/T5P'],
  ['a regulation with its own tiebreak', 'HAL2XA-S:T10P/TB1-O:1/T5P'],
  ['an untimed overtime period', 'SET3XA-S:T12P-O:1/TB11'],
  ['an overtime period with its own tiebreak', 'SET3XA-S:T12P-O:1/T5P/TB1'],
  ['a standard-set decider', 'SET3XA-S:T12P-O:3/T5P-F:6'],
  ['a timed decider with a tiebreak', 'SET3XA-S:T12P-O:3/T5P-F:T10/TB3'],
  ['a match clock (CA 2026-11-04, Ruling 1)', 'SET3XA-S:T12P-O:3/T5P-M:T60'],
];

describe('overtime for new use', () => {
  it.each(SCORED)('accepts a code the scoring engine scores: %s', (matchUpFormat) => {
    expect(resolveFormat(matchUpFormat, { allowOvertime: true })).toBeDefined();
    expect(isValidMatchUpFormat({ matchUpFormat })).toBe(true);
  });

  it.each(UNSCORED)('refuses %s, which parses and the engine does not score', (_, matchUpFormat) => {
    expect(parse(matchUpFormat)?.overtimeFormat).toBeDefined();
    expect(resolveFormat(matchUpFormat, { allowOvertime: true })).toBeUndefined();
    expect(isValidMatchUpFormat({ matchUpFormat })).toBe(false);
  });

  it('a grouping suffix is not a code (Ruling 4: repeating blocks are deferred, no syntax reserved)', () => {
    for (const matchUpFormat of ['HAL2XA-S:T30P-O:2B2/T10P', 'HAL2XA-S:T30P-O:2/T10PB2']) {
      expect(parse(matchUpFormat)).toBeUndefined();
      expect(isValidMatchUpFormat({ matchUpFormat })).toBe(false);
    }
  });

  it('agrees with the scoring engine on every overtime code the factory names', () => {
    const named = [...harvestFormats().keys(), ...SCORED, ...UNSCORED.map(([, code]) => code)];
    const overtime = named.filter((code) => parse(code)?.overtimeFormat);
    expect(overtime.length).toBeGreaterThan(SCORED.length);
    for (const matchUpFormat of overtime)
      expect({ matchUpFormat, valid: isValidMatchUpFormat({ matchUpFormat }) }).toEqual({
        matchUpFormat,
        valid: !!resolveFormat(matchUpFormat, { allowOvertime: true }),
      });
  });
});
