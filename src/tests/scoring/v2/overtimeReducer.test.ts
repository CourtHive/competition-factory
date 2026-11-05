import { createContext, initialState, reduce, step } from '@Assemblies/engines/scoring/v2/reduce';
import { finalGoverns, resolveFormat, ruleForSet } from '@Assemblies/engines/scoring/v2/format';
import { isValidMatchUpFormat } from '@Validators/isValidMatchUpFormat';
import { describe, expect, it } from 'vitest';

import type { TimelineEntry } from '@Assemblies/engines/scoring/v2/types';

const OPTIONS = { allowOvertime: true };
const REGULATION = 'SET2XA-S:T10P';
const CAPPED = `${REGULATION}-O:3/T5P`;
const EXACT = `${REGULATION}-O:2X/T5P`;
const SUDDEN = `${REGULATION}-O:2SD/T5P`;
const UNLIMITED = `${REGULATION}-O:U/T5P`;
const FINAL = `${CAPPED}-F:TB1`;
const total = (a: number, b: number): TimelineEntry => ({ type: 'set', data: { side1Score: a, side2Score: b } });
const point = (winner: 0 | 1, scoreValue = 1): TimelineEntry => ({ type: 'point', data: { winner, scoreValue } });
const end: TimelineEntry = { type: 'endSegment', data: {} };
const tied = [total(3, 1), total(0, 2)];

function play(code: string, timeline: TimelineEntry[]) {
  const result = reduce({ matchUpFormat: code }, timeline, OPTIONS);
  expect(result.outcomes).toEqual(timeline.map(() => ({ recorded: true })));
  expect(result.legacy).toEqual([]);
  return result.state;
}

describe('overtime reducer, explicit internal opt-in (CA 2026-11-03)', () => {
  it('keeps public resolution gated; new use opens where the engine scores (S6)', () => {
    expect(resolveFormat(CAPPED)).toBeUndefined();
    expect(isValidMatchUpFormat({ matchUpFormat: CAPPED })).toBe(true);
    expect(resolveFormat(CAPPED, OPTIONS)?.overtime).toMatchObject({ count: 3, rule: { kind: 'timed' } });
  });

  it.each([
    `${REGULATION}-O:1/O3`,
    `${REGULATION}-O:1/6/TB7`,
    `${REGULATION}-O:1/TB11`,
    `${REGULATION}-O:1/T5P/TB1`,
    `${CAPPED}-M:T60`,
    'HAL2XA-S:T10P/TB1-O:1/T5P',
    'SET3XA-S:TB11-O:1/T5P',
    `${CAPPED}-F:O3`,
    `${CAPPED}-F:6/TB7`,
    `${REGULATION}-O:9007199254740991/T5P`,
  ])('refuses unresolved runtime combinations: %s', (code) => {
    expect(resolveFormat(code, OPTIONS)).toBeUndefined();
  });

  it('does not enter overtime when regulation has a winner', () => {
    const state = play(CAPPED, [total(3, 1), total(0, 1)]);
    expect(state).toMatchObject({ matchUpStatus: 'COMPLETED', winningSide: 1 });
    expect(state.sets).toHaveLength(2);
  });

  it('a tied regulation opens overtime, not a final decider or a completed draw', () => {
    const state = play(FINAL, tied);
    expect(state.matchUpStatus).toBe('IN_PROGRESS');
    expect(state.winningSide).toBeUndefined();
    const match = resolveFormat(FINAL, OPTIONS)!;
    expect(ruleForSet(match, 3, [1, 1]).kind).toBe('timed');
    expect(finalGoverns(match, 3, [1, 1])).toBe(false);
  });

  it('a lead during ordinary overtime waits until the period ends', () => {
    const timeline = [...tied, point(1)];
    const open = play(CAPPED, timeline);
    expect(open.matchUpStatus).toBe('IN_PROGRESS');
    expect(open.sets[2]).toMatchObject({ setNumber: 3, side1Score: 0, side2Score: 1 });
    expect(play(CAPPED, [...timeline, end])).toMatchObject({ matchUpStatus: 'COMPLETED', winningSide: 2 });
  });

  it('repeats tied periods, but stops at the first unequal period end', () => {
    const first = play(CAPPED, [...tied, total(2, 2)]);
    expect(first.matchUpStatus).toBe('IN_PROGRESS');
    const second = play(CAPPED, [...tied, total(2, 2), total(0, 1)]);
    expect(second).toMatchObject({ matchUpStatus: 'COMPLETED', winningSide: 2 });
    expect(second.sets).toHaveLength(4);
  });

  it('finishes level at the finite ceiling without a final decider', () => {
    const state = play(CAPPED, [...tied, total(1, 1), total(0, 0), total(2, 2)]);
    expect(state.matchUpStatus).toBe('COMPLETED');
    expect(state.winningSide).toBeUndefined();
    expect(state.sets).toHaveLength(5);
  });

  it('plays every period of an exact block and carries all scores forward', () => {
    const one = play(EXACT, [...tied, total(2, 0)]);
    expect(one.matchUpStatus).toBe('IN_PROGRESS');
    // The second overtime winner is side 2, but the 5-4 aggregate is won by side 1.
    const two = play(EXACT, [...tied, total(2, 0), total(0, 1)]);
    expect(two).toMatchObject({ matchUpStatus: 'COMPLETED', winningSide: 1 });
    expect(two.sets[3].winningSide).toBe(2);
  });

  it('an exact block can reverse an intermediate lead or finish level', () => {
    expect(play(EXACT, [...tied, total(2, 0), total(0, 3)]).winningSide).toBe(2);
    const drawn = play(EXACT, [...tied, total(2, 0), total(0, 2)]);
    expect(drawn.matchUpStatus).toBe('COMPLETED');
    expect(drawn.winningSide).toBeUndefined();
  });

  it.each([0, 1] as const)('sudden death closes on side %i scoring, before the clock ends', (side) => {
    const state = play(SUDDEN, [...tied, point(side, 2)]);
    expect(state).toMatchObject({ matchUpStatus: 'COMPLETED', winningSide: side + 1 });
    expect(state.sets[2]).toMatchObject({ segmentComplete: true, winningSide: side + 1 });
    expect(state.game).toBeUndefined();
  });

  it('zero-valued events do not decide sudden death, and scoreless periods can repeat', () => {
    const timeline = [...tied, point(0, 0), end, point(1, 0)];
    expect(play(SUDDEN, timeline).matchUpStatus).toBe('IN_PROGRESS');
    expect(play(SUDDEN, [...timeline, point(0)])).toMatchObject({ matchUpStatus: 'COMPLETED', winningSide: 1 });
    const drawn = play(SUDDEN, [...tied, total(0, 0), total(0, 0)]);
    expect(drawn.matchUpStatus).toBe('COMPLETED');
    expect(drawn.winningSide).toBeUndefined();
  });

  it('game and set-total input honor sudden death too', () => {
    expect(play(SUDDEN, [...tied, { type: 'game', data: { winner: 1 } }]).winningSide).toBe(2);
    expect(play(SUDDEN, [...tied, total(3, 0)]).winningSide).toBe(1);
    const result = reduce({ matchUpFormat: SUDDEN }, [...tied, total(2, 1)], OPTIONS);
    expect(result.outcomes.at(-1)).toMatchObject({
      recorded: false,
      refused: { message: expect.stringMatching(/sudden.death/i) },
    });
    expect(result.state.sets).toHaveLength(2);
  });

  it('unlimited overtime is lazy and can pass every finite example ceiling', () => {
    const periods = Array.from({ length: 200 }, () => total(0, 0));
    const open = play(UNLIMITED, [...tied, ...periods]);
    expect(open.matchUpStatus).toBe('IN_PROGRESS');
    expect(open.sets).toHaveLength(202);
    const done = play(UNLIMITED, [...tied, ...periods, total(0, 1)]);
    expect(done).toMatchObject({ matchUpStatus: 'COMPLETED', winningSide: 2 });
    expect(done.sets.at(-1)?.setNumber).toBe(203);
  });

  it('locates the final fallback after the overtime ceiling, excluding its score from the aggregate', () => {
    const timeline = [...tied, total(1, 1), total(0, 0), total(2, 2)];
    expect(play(FINAL, timeline).matchUpStatus).toBe('IN_PROGRESS');
    const match = resolveFormat(FINAL, OPTIONS)!;
    expect(finalGoverns(match, 6, [0, 0])).toBe(true);
    expect(ruleForSet(match, 6, [0, 0]).kind).toBe('tiebreakOnly');
    const state = play(FINAL, [...timeline, point(1)]);
    expect(state).toMatchObject({ matchUpStatus: 'COMPLETED', winningSide: 2 });
    expect(state.sets.at(-1)).toMatchObject({ setNumber: 6, isTiebreakOnly: true });
    expect(state.sets.slice(0, 5).reduce((n, s) => n + s.side1Score - s.side2Score, 0)).toBe(0);
  });

  it('does not apply the final fallback to the last regulation segment on an A-only head', () => {
    const code = 'HAL2A-S:T10P-O:1/T5P-F:TB1';
    const state = play(code, [...tied, total(0, 0), point(0)]);
    expect(state.winningSide).toBe(1);
    expect(state.sets[1].isTimed).toBe(true);
    expect(state.sets[3].isTiebreakOnly).toBe(true);
  });

  it('supports a single regulation period and a timed fallback that can finish level', () => {
    const code = 'PER1A-S:T20P-O:1/T5P-F:T2P';
    const state = play(code, [total(1, 1), total(0, 0), total(1, 1)]);
    expect(state.matchUpStatus).toBe('COMPLETED');
    expect(state.winningSide).toBeUndefined();
    expect(state.sets).toHaveLength(3);
  });

  it('ignores scoring after an overtime winner or ceiling without creating more sets', () => {
    const timeline = [...tied, total(0, 1)];
    const before = play(CAPPED, timeline);
    const result = reduce({ matchUpFormat: CAPPED }, [...timeline, point(0), total(5, 0)], OPTIONS);
    expect(result.state).toEqual(before);
    expect(result.outcomes.slice(-2)).toEqual(
      Array.from({ length: 2 }, () => ({ recorded: false, ignored: 'MATCH_COMPLETED' })),
    );
  });

  it('reduction is deterministic, preserves input, and prefix replay reopens overtime', () => {
    const timeline = [...tied, total(0, 1)];
    const before = structuredClone(timeline);
    const complete = play(CAPPED, timeline);
    expect(play(CAPPED, timeline)).toEqual(complete);
    expect(timeline).toEqual(before);
    expect(play(CAPPED, timeline.slice(0, -1)).matchUpStatus).toBe('IN_PROGRESS');
    expect(play(CAPPED, [...tied, total(1, 0)]).winningSide).toBe(1);
  });

  it('a refused action leaves the original state object unchanged', () => {
    const context = createContext({ matchUpFormat: SUDDEN }, OPTIONS);
    let state = initialState();
    for (const entry of tied) state = step(context, state, entry).state;
    const before = structuredClone(state);
    const result = step(context, state, total(1, 1));
    expect(result.outcome).toMatchObject({ recorded: false, refused: expect.anything() });
    expect(result.state).toBe(state);
    expect(state).toEqual(before);
  });

  it('accepts a reachable overtime baseline, but refuses segments past an earlier winner', () => {
    const baseline: TimelineEntry = {
      type: 'setInitialScore',
      data: {
        sets: [
          { side1Score: 3, side2Score: 1 },
          { side1Score: 0, side2Score: 2 },
          { side1Score: 0, side2Score: 0 },
        ],
      },
    };
    expect(play(CAPPED, [baseline, total(0, 1)]).winningSide).toBe(2);
    const bad: TimelineEntry = {
      type: 'setInitialScore',
      data: {
        sets: [
          { side1Score: 1, side2Score: 0 },
          { side1Score: 1, side2Score: 0 },
          { side1Score: 0, side2Score: 0 },
        ],
      },
    };
    const result = reduce({ matchUpFormat: CAPPED }, [bad], OPTIONS);
    expect(result.outcomes[0]).toMatchObject({ recorded: false, refused: expect.anything() });
    expect(result.state).toEqual(initialState());
  });

  it.each([
    { currentSetScore: { side1Score: 1, side2Score: 0 } },
    { currentGameScore: { side1Points: 0, side2Points: 1 } },
  ])('refuses an unfinished sudden-death baseline that has already scored: %j', (running) => {
    const data = {
      sets: [
        { side1Score: 3, side2Score: 1 },
        { side1Score: 0, side2Score: 2 },
      ],
      ...running,
    };
    const result = reduce({ matchUpFormat: SUDDEN }, [{ type: 'setInitialScore', data }], OPTIONS);
    expect(result.outcomes[0]).toMatchObject({
      recorded: false,
      refused: { message: expect.stringMatching(/sudden.death/i) },
    });
    expect(result.state).toEqual(initialState());
  });

  it.each([
    {
      code: CAPPED,
      periods: [
        [0, 1],
        [0, 0],
      ],
    },
    {
      code: CAPPED,
      periods: [
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
      ],
    },
    { code: SUDDEN, periods: [[1, 1]] },
  ])('refuses an unreachable overtime baseline: %j', ({ code, periods }) => {
    const sets = [[3, 1], [0, 2], ...periods].map(([side1Score, side2Score]) => ({ side1Score, side2Score }));
    const result = reduce({ matchUpFormat: code }, [{ type: 'setInitialScore', data: { sets } }], OPTIONS);
    expect(result.outcomes[0]).toMatchObject({ recorded: false, refused: expect.anything() });
    expect(result.state).toEqual(initialState());
  });
});
