import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { validateSetScore } from '@Validators/validateMatchUpScore';
import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import { keyValueScore } from '@Helpers/keyValueScore/keyValueScore';
import { addPoint } from '@Mutate/scoring/addPoint';
import { shootoutTallyRefusal } from '@Helpers/matchUpFormatCode/shootout';
import { resolveFormat, takesInput } from '@Assemblies/engines/scoring/v2/format';
import { isValidMatchUpFormat } from '@Validators/isValidMatchUpFormat';
import { stringify } from '@Helpers/matchUpFormatCode/stringify';
import { overtimeScoreVerdict } from '@Validators/overtimeScore';
import { reduce } from '@Assemblies/engines/scoring/v2/reduce';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { describe, expect, it } from 'vitest';

// constants and types
import type { TimelineEntry } from '@Assemblies/engines/scoring/v2/types';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

/**
 * `-F:SO{n}`, a shootout of n rounds (overtime activation S5, Ruling 3, CA 2026-11-04). Every `F:TB` race is wrong
 * for a shootout under point entry, so a shootout is its own final segment: entered as a tally only, never level,
 * past its n rounds sudden death (won by one), and never counted in the sporting aggregate. `F:TB1` is unchanged.
 */

const OPTIONS = { allowOvertime: true };
const OVERTIME = 'SET2XA-S:T45P-O:2X/T15P-F:SO5';
const NO_OVERTIME = 'SET2XA-S:T45P-F:SO5';
const total = (a: number, b: number): TimelineEntry => ({ type: 'set', data: { side1Score: a, side2Score: b } });
const point = (winner: 0 | 1): TimelineEntry => ({ type: 'point', data: { winner, scoreValue: 1 } });
const level = [total(1, 0), total(0, 1), total(0, 0), total(1, 1)];

describe('the code', () => {
  it.each([OVERTIME])('parses and round-trips: %s', (code) => {
    expect(parse(code)?.finalSetFormat).toEqual({ shootout: 5 });
    expect(stringify(parse(code))).toEqual(code);
  });

  it.each([
    ['as the set format', 'SET2XA-S:SO5'],
    ['as an overtime period', 'SET2XA-S:T45P-O:1/SO5'],
    ['where -F: is not a decider of a level aggregate', 'SET3-S:6/TB7-F:SO5'],
    ['in a best-of aggregate', 'SET3A-S:T10-F:SO5'],
    ['after unlimited overtime', 'SET2XA-S:T45P-O:U/T15P-F:SO5'],
    ['with no overtime (narrowed, CA 2026-11-04)', NO_OVERTIME],
    ['with no rounds', 'SET2XA-S:T45P-F:SO0'],
    ['with a modifier', 'SET2XA-S:T45P-F:SO5X'],
  ])('is not a code %s', (_, code) => {
    expect(parse(code)).toBeUndefined();
  });

  it('opens for new use with overtime (S6)', () => {
    expect(isValidMatchUpFormat({ matchUpFormat: OVERTIME })).toBe(true);
  });

  it('F:TB1 is unchanged', () => {
    expect(parse('SET3XA-S:T10-F:TB1')?.finalSetFormat).toEqual({ tiebreakSet: { tiebreakTo: 1 } });
    expect(isValidMatchUpFormat({ matchUpFormat: 'SET3XA-S:T10-F:TB1' })).toBe(true);
  });
});

describe('the tally', () => {
  it.each([
    [[3, 2], undefined],
    [[5, 4], undefined],
    [[3, 0], undefined],
    [[7, 6], undefined],
    [[0, 1], undefined],
    [[3, 3], /level/],
    [[0, 0], /level/],
    [[7, 5], /sudden death/],
    [[4, 1], undefined],
    [[5, 3], undefined],
    [[4, 0], /catch up/],
    [[0, 5], /catch up/],
    [[5, 2], /catch up/],
    [[6, 8], /sudden death/],
    [[-1, 2], /whole goals/],
    [[2.5, 1], /whole goals/],
  ])('%j in five rounds', (tally, refusal) => {
    const result = shootoutTallyRefusal(5, tally as [number, number]);
    if (refusal) expect(result).toMatch(refusal);
    else expect(result).toBeUndefined();
  });

  it('ends once one side cannot catch up: 2-0 in three rounds, never 3-0', () => {
    expect(shootoutTallyRefusal(3, [2, 0])).toBeUndefined();
    expect(shootoutTallyRefusal(3, [3, 1])).toBeUndefined();
    expect(shootoutTallyRefusal(3, [3, 0])).toMatch(/catch up/);
  });
});

describe('the scoring engine', () => {
  it('resolves the shootout as the final rule, which takes no point or game', () => {
    const match = resolveFormat(OVERTIME, OPTIONS)!;
    expect(match.final).toEqual({ kind: 'shootout', rounds: 5 });
    expect(takesInput(match.final!, 'point')).toBe(false);
    expect(takesInput(match.final!, 'game')).toBe(false);
    expect(resolveFormat(NO_OVERTIME)).toBeUndefined();
  });

  it('a level overtime goes to the shootout, which the tally decides', () => {
    const result = reduce({ matchUpFormat: OVERTIME }, [...level, total(4, 3)], OPTIONS);
    expect(result.outcomes.every((outcome) => outcome.recorded)).toBe(true);
    expect(result.state).toMatchObject({ matchUpStatus: COMPLETED, winningSide: 1 });
    expect(result.state.sets).toHaveLength(5);
  });

  it.each([
    ['a point', point(0), /tally/],
    ['a level tally', total(3, 3), /level/],
    ['a tally past the rounds by two', total(7, 5), /sudden death/],
  ])('refuses %s at the shootout', (_, entry, message) => {
    const result = reduce({ matchUpFormat: OVERTIME }, [...level, entry], OPTIONS);
    expect(result.outcomes.at(-1)).toMatchObject({
      recorded: false,
      refused: { message: expect.stringMatching(message) },
    });
    expect(result.state.sets).toHaveLength(4);
  });
});

describe('the static path', () => {
  const sets = (decider: [number, number]) => [
    { setNumber: 1, side1Score: 1, side2Score: 0, winningSide: 1 },
    { setNumber: 2, side1Score: 0, side2Score: 1, winningSide: 2 },
    { setNumber: 3, side1Score: 0, side2Score: 0 },
    { setNumber: 4, side1Score: 1, side2Score: 1 },
    { setNumber: 5, side1Score: decider[0], side2Score: decider[1], winningSide: decider[0] > decider[1] ? 1 : 2 },
  ];

  it('accepts a possible tally and refuses an impossible one', () => {
    const verdict = (decider: [number, number], winningSide: number) =>
      overtimeScoreVerdict({ matchUpFormat: OVERTIME, matchUpStatus: COMPLETED, sets: sets(decider), winningSide });
    expect(verdict([4, 3], 1)).toMatchObject({ valid: true, winningSide: 1 });
    expect(verdict([7, 5], 1)).toMatchObject({ valid: false, reason: expect.stringMatching(/sudden death/) });
  });

  it('analyzeMatchUp judges the shootout set by its tally', () => {
    const valid = (decider: [number, number]) =>
      analyzeMatchUp({
        matchUp: {
          score: { sets: sets(decider) },
          winningSide: decider[0] > decider[1] ? 1 : 2,
          matchUpFormat: OVERTIME,
        },
        matchUpFormat: OVERTIME,
      }).validMatchUpOutcome;
    expect(valid([4, 3])).toBe(true);
    expect(valid([7, 5])).toBe(false);
  });

  it('validates the shootout set by its tally', () => {
    expect(validateSetScore({ side1Score: 5, side2Score: 4 }, OVERTIME, true).isValid).toBe(true);
    expect(validateSetScore({ side1Score: 3, side2Score: 3 }, OVERTIME, true).isValid).toBe(false);
  });
});

describe('the paths that take points', () => {
  it('keyed entry refuses a shootout format: it is entered in the dialog', () => {
    const result = keyValueScore({ value: 1, sets: [], scoreString: '', matchUpFormat: OVERTIME });
    expect(result.updated).toEqual(false);
  });

  it('the legacy point path refuses a shootout format', () => {
    expect(() => addPoint({ matchUpFormat: OVERTIME } as any, { winner: 0 } as any)).toThrow(/Invalid matchUpFormat/);
  });
});

describe('the public engine', () => {
  it('takes the tally only while the shootout is in play; past the decider, regulation reads (§ 9.8 rule 7)', () => {
    const engine = new ScoringEngine({ matchUpFormat: OVERTIME });
    for (const [side1Score, side2Score] of [
      [1, 0],
      [0, 1],
      [0, 0],
      [0, 0],
    ])
      engine.addSet({ side1Score, side2Score });
    expect(engine.getInputLevels()).toEqual({ point: false, game: false, set: true });
    engine.addSet({ side1Score: 4, side2Score: 3 });
    expect(engine.isComplete()).toBe(true);
    expect(engine.getInputLevels()).toEqual({ point: true, game: true, set: true });
  });
});
