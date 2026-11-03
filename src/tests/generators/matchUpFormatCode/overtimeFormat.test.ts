import { isValidMatchUpFormat } from '@Validators/isValidMatchUpFormat';
import { addPoint, createMatchUp } from '@Assemblies/governors/scoreGovernor';
import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { resolveFormat } from '@Assemblies/engines/scoring/v2/format';
import { stringify } from '@Helpers/matchUpFormatCode/stringify';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { describe, expect, it } from 'vitest';

const REGULATION = 'SET3XA-S:T12P';
const OVERTIME = `${REGULATION}-O:3/T5P`;

describe('overtime grammar foundation (CA 2026-11-03)', () => {
  it.each([
    [OVERTIME, { count: 3, setFormat: { timed: true, minutes: 5, based: 'P' } }],
    ['QTR4XA-S:T12P-O:3/T5P', { count: 3, setFormat: { timed: true, minutes: 5, based: 'P' } }],
    ['QTR4XA-S:T12P-O:U/T5P', { count: 'unlimited', setFormat: { timed: true, minutes: 5, based: 'P' } }],
    [`${REGULATION}-O:U/T5P`, { count: 'unlimited', setFormat: { timed: true, minutes: 5, based: 'P' } }],
    ['HAL2XA-S:T45P-O:2X/T15P', { count: 2, exactly: true, setFormat: { timed: true, minutes: 15, based: 'P' } }],
    ['PER3XA-S:T20P-O:1SD/T5P', { count: 1, suddenDeath: true, setFormat: { timed: true, minutes: 5, based: 'P' } }],
    [
      'PER3XA-S:T20P-O:USD/T5P',
      { count: 'unlimited', suddenDeath: true, setFormat: { timed: true, minutes: 5, based: 'P' } },
    ],
    ['PER3XA-S:T20P-O:3/T5P-F:TB1', { count: 3, setFormat: { timed: true, minutes: 5, based: 'P' } }],
    [
      `${REGULATION}-O:1/T5P/TB1`,
      { count: 1, setFormat: { timed: true, minutes: 5, based: 'P', tiebreakFormat: { tiebreakTo: 1 } } },
    ],
    [
      `${REGULATION}-O:1/TB11NOAD@RALLY`,
      { count: 1, setFormat: { tiebreakSet: { tiebreakTo: 11, NoAD: true, modifier: 'RALLY' } } },
    ],
    [`${REGULATION}-O:1/O3`, { count: 1, setFormat: { outs: 3 } }],
    [
      `${REGULATION}-O:9007199254740991/T5P`,
      { count: Number.MAX_SAFE_INTEGER, setFormat: { timed: true, minutes: 5, based: 'P' } },
    ],
  ])('reads and round-trips %s without losing the overtime policy', (code, overtimeFormat) => {
    const parsed = parse(code as string);
    expect(parsed).toMatchObject({ overtimeFormat });
    expect(stringify(parsed)).toBe(code);
  });

  it.each([
    '-O:0/T5P',
    '-O:03/T5P',
    '-O:9007199254740992/T5P',
    '-O:1.5/T5P',
    '-O:+3/T5P',
    '-O:/T5P',
    '-O:T5P',
    '-O:3/',
    '-O:3/TB',
    '-O:3/T05P',
    '-O:3/T5Pjunk',
    '-O:UX/T5P',
    '-O:3XSD/T5P',
    '-O:3SDX/T5P',
    '-O:3XX/T5P',
    '-O:3Z/T5P',
    '-O:u/T5P',
    '-O:U/T5P-F:TB1',
    '-O:3/P10',
    '-O:3/T5P-O:2/T5P',
    '-F:TB1-O:3/T5P',
    '-M:T60-O:3/T5P',
  ])('refuses malformed or contradictory overtime: %s', (suffix) => {
    expect(parse(`${REGULATION}${suffix}`)).toBeUndefined();
  });

  it('requires aggregate regulation', () => {
    expect(parse('SET3-S:6/TB7-O:3/T5P')).toBeUndefined();
  });

  it('keeps the final fallback even when it matches regulation', () => {
    const code = `${REGULATION}-O:3/T5P-F:T12P`;
    expect(parse(code)?.finalSetFormat).toEqual({ timed: true, minutes: 12, based: 'P' });
    expect(stringify(parse(code))).toBe(code);
  });

  it('allows a fallback after overtime on single-period aggregate regulation', () => {
    const code = 'PER1A-S:T20P-O:1/T5P-F:TB1';
    expect(parse(code)).toBeDefined();
    expect(stringify(parse(code))).toBe(code);
    expect(parse('PER1A-S:T20P-F:TB1')).toBeUndefined();
  });

  it('canonicalizes an explicit games basis inside overtime', () => {
    expect(stringify(parse(`${REGULATION}-O:3/T5G`))).toBe(`${REGULATION}-O:3/T5`);
  });

  it.each([
    ['6/TB7@6', '6/TB7'],
    ['5WB2', '5'],
    ['4NOADWB2', '4NOAD'],
  ])('reuses segment equivalences inside overtime: %s', (input, canonical) => {
    expect(stringify(parse(`${REGULATION}-O:2/${input}`))).toBe(`${REGULATION}-O:2/${canonical}`);
  });

  it('preserves a fallback with a different basis after regulation normalization', () => {
    const code = 'PER3XA-S:T20-O:1/T5P-F:T20';
    expect(stringify(parse('PER3XA-S:T20G-O:1/T5P-F:T20G'))).toBe(code);
  });

  it('rejects invalid overtime objects instead of writing partial format codes', () => {
    const regulation = parse(REGULATION);
    for (const overtimeFormat of [
      { count: 0, setFormat: { timed: true, minutes: 5 } },
      { count: 1.5, setFormat: { timed: true, minutes: 5 } },
      { count: 'unlimited', exactly: true, setFormat: { timed: true, minutes: 5 } },
      { count: 2, exactly: true, suddenDeath: true, setFormat: { timed: true, minutes: 5 } },
      { count: 2, setFormat: { combinedPointTotal: 10 } },
      { count: 2, setFormat: {} },
    ])
      expect(stringify({ ...regulation, overtimeFormat })).toBeUndefined();
  });

  it('does not activate new-use or live scoring before the runtime slice', () => {
    expect(parse(OVERTIME)).toBeDefined();
    expect(isValidMatchUpFormat({ matchUpFormat: OVERTIME })).toBe(false);
    expect(resolveFormat(OVERTIME)).toBeUndefined();
    const engine = new ScoringEngine({ matchUpFormat: OVERTIME });
    const before = engine.getState();
    for (const action of [
      () => engine.addPoint({ winner: 0 }),
      () => engine.addGame({ winner: 0 }),
      () => engine.addSet({ side1Score: 1, side2Score: 0 }),
      () => engine.endSegment(),
      () => engine.setInitialScore({ sets: [{ side1Score: 1, side2Score: 0 }] }),
      () => engine.setServer(0),
    ]) {
      expect(action).toThrow(/Invalid matchUpFormat/);
      expect(engine.getState()).toEqual(before);
    }
  });

  it('also refuses the legacy public point mutator before it can initialize history', () => {
    const matchUp = createMatchUp({ matchUpFormat: OVERTIME });
    const before = structuredClone(matchUp);
    expect(() => addPoint(matchUp, { winner: 0 })).toThrow(/Invalid matchUpFormat/);
    expect(matchUp).toEqual(before);
  });

  it('does not change legacy aggregate decider canonicalization', () => {
    expect(stringify(parse('SET3XA-S:T10-F:T10'))).toBe('SET3XA-S:T10');
    expect(stringify(parse('SET3XA-S:T10-F:TB1'))).toBe('SET3XA-S:T10-F:TB1');
    expect(isValidMatchUpFormat({ matchUpFormat: 'HAL2A-S:T45' })).toBe(true);
  });
});
