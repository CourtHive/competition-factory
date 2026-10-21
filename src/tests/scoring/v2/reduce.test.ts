import { DEFAULT_MATCHUP_FORMAT, finalGoverns, resolveFormat } from '@Assemblies/engines/scoring/v2/format';
import { createContext, initialState, reduce, step } from '@Assemblies/engines/scoring/v2/reduce';
import { decideMatch } from '@Assemblies/engines/scoring/v2/decide';
import { describe, expect, it } from 'vitest';

// constants and types
import type { ScoredSet, TimelineEntry } from '@Assemblies/engines/scoring/v2/types';
import type { MatchRule } from '@Assemblies/engines/scoring/v2/format';

/*
 * ScoringEngine v2 (SE2a): the reducer held directly to the spec (documentation/docs/scoring-engine/
 * scoring-engine-spec.md), section by section. The conformance suite holds it to the rulebooks through the
 * differential (`SCORING_ENGINE=differential`); these cases hold the parts a ScoringEngine call cannot reach alone.
 */

/** point entries from a stream of `1`s and `2`s (spaces ignored) */
const pts = (stream: string): TimelineEntry[] =>
  [...stream.replaceAll(' ', '')].map((side) => ({ type: 'point', data: { winner: side === '1' ? 0 : 1 } }));
const love = (side: '1' | '2', games = 1) => side.repeat(4 * games);
const game = (winner: 0 | 1, tiebreakScore?: [number, number]): TimelineEntry => ({
  type: 'game',
  data: { winner, ...(tiebreakScore ? { tiebreakScore } : {}) },
});
const total = (side1Score: number, side2Score: number, extra: Record<string, unknown> = {}): TimelineEntry => ({
  type: 'set',
  data: { side1Score, side2Score, ...extra },
});

function sets(format: string, timeline: TimelineEntry[]) {
  const { state } = reduce({ matchUpFormat: format }, timeline);
  return state.sets.map((set) => {
    const games = [set.side1Score, set.side2Score];
    return set.side1TiebreakScore === undefined ? games : [...games, [set.side1TiebreakScore, set.side2TiebreakScore]];
  });
}

const outcomes = (format: string, timeline: TimelineEntry[]) => reduce({ matchUpFormat: format }, timeline).outcomes;

describe('§ 1.1, § 3 the configuration and format resolution', () => {
  it('the default format is SET3-S:6/TB7, else the competition format', () => {
    expect(DEFAULT_MATCHUP_FORMAT).toEqual('SET3-S:6/TB7');
    expect(reduce({}, pts(love('1', 6))).state.sets[0]).toMatchObject({ side1Score: 6, winningSide: 1 });
    const result: any = reduce({ competitionFormat: { matchUpFormat: 'SET1-S:TB10' } }, pts('1'.repeat(10)));
    expect(result.state.matchUpStatus).toEqual('COMPLETED');
  });

  it('a format that does not parse refuses every scoring and service action, and takes the others', () => {
    const verdicts = outcomes('SET3-S:bogus', [
      ...pts('1'),
      game(0),
      total(6, 4),
      { type: 'endSegment', data: {} },
      { type: 'setInitialScore', data: { sets: [] } },
      { type: 'setServer', data: { side: 1 } },
      { type: 'challenge', data: { sideNumber: 1 } },
      { type: 'annotation', data: { note: 'x' } },
    ]);
    expect(verdicts.map((outcome) => outcome.recorded)).toEqual([false, false, false, false, false, false, true, true]);
  });

  it('best of N needs a majority; an even N can end level (§ 9.7 rule 4; decision SE2a-D7)', () => {
    expect(resolveFormat('SET5-S:6/TB7')?.setsToWin).toEqual(3);
    const level: any = reduce({ matchUpFormat: 'SET2-S:6/TB7' }, pts(love('1', 6) + love('2', 6)));
    expect(level.state.matchUpStatus).toEqual('COMPLETED');
    expect(level.state.winningSide).toBeUndefined();
  });

  it('segment kinds SE2a does not score are SE2b’s and are not reduced', () => {
    expect(resolveFormat('SET3-S:T10')?.ordinary.kind).toEqual('timed');
    expect(resolveFormat('SET1-S:P32')?.ordinary.kind).toEqual('combined');
    expect(resolveFormat('SET1-S:O3')?.ordinary.kind).toEqual('outs');
    expect(() => reduce({ matchUpFormat: 'SET3-S:T10' }, pts('1'))).toThrow(/does not score timed/);
    expect(() => reduce({ matchUpFormat: 'SET1-S:O3' }, [game(0)])).toThrow(/does not score outs/);
    expect(() => reduce({ matchUpFormat: 'SET1-S:P32' }, [total(17, 15)])).toThrow(/does not score combined/);
  });
});

describe('§ 4.1 the game', () => {
  it('traditional: four points two clear, and the game score after each point (§ 11.1)', () => {
    const { state } = reduce({}, pts('111222 1 2 1 1'));
    expect(state.points.map((point) => point.score)).toEqual([
      '15-0',
      '30-0',
      '40-0',
      '40-15',
      '40-30',
      '40-40',
      'A-40',
      '40-40',
      'A-40',
      '0-0',
    ]);
    expect(sets('SET3-S:6/TB7', pts('111222 2'))).toEqual([[0, 0]]);
    expect(reduce({}, pts('111222 2')).state.points.at(-1)?.score).toEqual('40-A');
  });

  it('No-Ad and a deuce cap: the decisive point at the cap', () => {
    expect(sets('SET3-S:6NOAD', pts('111222 2'))).toEqual([[0, 1]]);
    expect(sets('SET3-S:6/TB7-G:TN3D', pts('111222 12 12 2'))).toEqual([[0, 1]]);
    expect(sets('SET3-S:6/TB7-G:TN3D', pts('111222 12 2'))).toEqual([[0, 0]]);
  });

  it('consecutive: a run of n wins; a broken run starts again', () => {
    const { state } = reduce({ matchUpFormat: 'SET3-S:4-G:2C' }, pts('12 12 11'));
    expect(state.sets[0].side1Score).toEqual(1);
    expect(state.points.map((point) => point.score)).toEqual(['1-0', '1-1', '2-1', '2-2', '3-2', '0-0']);
  });
});

describe('§ 4.2, § 4.3 the set and its tiebreak', () => {
  it('6-4, 7-5, a tiebreak at six all, and the tiebreak in play counts point by point', () => {
    expect(sets('SET3-S:6/TB7', pts(love('1', 5) + love('2', 4) + love('1')))).toEqual([[6, 4]]);
    const sixAll = '12'.repeat(6).replaceAll('1', love('1')).replaceAll('2', love('2'));
    expect(sets('SET3-S:6/TB7', pts(`${sixAll} 1111111`))).toEqual([[7, 6, [7, 0]]]);
    const inPlay: any = reduce({}, pts(`${sixAll} 12`)).state;
    expect([inPlay.sets[0].side1Score, inPlay.sets[0].side1TiebreakScore]).toEqual([6, undefined]);
    expect(inPlay.points.at(-1).score).toEqual('1-1');
  });

  it('an advantage set, win-by-one, the one-game set by Rule 6', () => {
    expect(sets('SET3-S:6', pts(love('1', 5) + love('2', 5) + love('1', 2)))).toEqual([[7, 5]]);
    expect(sets('SET3-S:5WB1', pts(love('1', 4) + love('2', 4) + love('1')))).toEqual([[5, 4]]);
    expect(sets('SET3-S:1/TB7', pts(love('1')))).toEqual([[1, 0]]);
    expect(sets('SET3-S:1/TB7', pts(love('1', 2)))).toEqual([[2, 0]]);
    expect(sets('SET3-S:1/TB7', pts(`${love('1')} ${love('2')} 1111111`))).toEqual([[2, 1, [7, 0]]]);
  });

  it('a tiebreak NOAD or to one is won by one; otherwise by two', () => {
    const fourAll = '12'.repeat(4).replaceAll('1', love('1')).replaceAll('2', love('2'));
    expect(sets('SET1-S:6/TB5NOAD@5', pts(`${fourAll} ${love('1')} ${love('2')} 12121212 1`))).toEqual([
      [6, 5, [5, 4]],
    ]);
  });
});

describe('§ 5 tiebreak-only sets', () => {
  it('in play a set records no game won; won, it is 1-0 with its points as tiebreak points', () => {
    expect(sets('SET3-S:TB11', pts('1'.repeat(10)))).toEqual([[0, 0]]);
    expect(sets('SET3-S:TB11', pts(`${'12'.repeat(9)} 11`))).toEqual([[1, 0, [11, 9]]]);
    expect(sets('SET3-S:TB11NOAD', pts(`${'12'.repeat(10)} 1`))).toEqual([[1, 0, [11, 10]]]);
  });

  it('a point adds its value: scoreValue, else the first matching multiplier, else 1', () => {
    const config = {
      matchUpFormat: 'SET3-S:TB11',
      competitionFormat: { pointMultipliers: [{ condition: { strokes: ['smash'] }, value: 5 }] },
      pointMultipliers: [{ condition: { results: ['Ace'] }, value: 3 }],
    };
    const { state } = reduce(config, [
      { type: 'point', data: { winner: 0, result: 'Ace' } },
      { type: 'point', data: { winner: 0, scoreValue: 2 } },
      { type: 'point', data: { winner: 1, stroke: 'smash' } },
    ]);
    expect(state.points.map((point) => [point.score, point.scoreValue])).toEqual([
      ['3-0', 3],
      ['5-0', 2],
      ['5-1', undefined],
    ]);
    const profile = reduce({ ...config, pointMultipliers: undefined }, [
      { type: 'point', data: { winner: 1, stroke: 'smash' } },
    ]);
    expect(profile.state.points[0].score).toEqual('0-5');
  });
});

describe('§ 2.1 point refusals and ignored points', () => {
  it('invalid facts are refused before anything is written', () => {
    const refusals = [
      { winner: 2 },
      { winningSide: 0 },
      { winner: 0, winningSide: 2 },
      { winner: 0, server: 3 },
      { winner: 0, server: 0, serverSideNumber: 2 },
      { winner: 0, scoreValue: -1 },
      { winner: 0, scoreValue: Number.POSITIVE_INFINITY },
      { winner: 0, observedServeSide: 'middle' },
      { winner: 0, scoreValue: 2 },
    ];
    for (const data of refusals) {
      const result: any = reduce({}, [{ type: 'point', data }]);
      expect({ data, refused: !!result.outcomes[0].refused }).toEqual({ data, refused: true });
      expect(result.state.points).toEqual([]);
    }
    expect(reduce({}, [{ type: 'point', data: { winner: 0, scoreValue: 1 } }]).outcomes[0].recorded).toEqual(true);
    expect(reduce({}, [{ type: 'point', data: { winner: 0, winningSide: 1 } }]).outcomes[0].recorded).toEqual(true);
  });

  it('a point naming no winner, and a point after completion, are ignored', () => {
    const result: any = reduce({ matchUpFormat: 'SET1-S:TB10' }, [
      { type: 'point', data: {} },
      ...pts('1'.repeat(10)),
      ...pts('2'),
    ]);
    expect(result.outcomes[0]).toEqual({ recorded: false, ignored: 'NO_WINNER' });
    expect(result.outcomes.at(-1)).toEqual({ recorded: false, ignored: 'MATCH_COMPLETED' });
    expect(result.legacy).toEqual([0, 11]);
  });

  it('R2: calculated fields passed in are overwritten and the host fields kept', () => {
    const { state } = reduce({}, [
      { type: 'point', data: { winner: 0, score: '40-0', index: 9, result: 'Ace', timestamp: 'x' }, timestamp: 't' },
    ]);
    expect(state.points[0]).toMatchObject({
      winner: 0,
      winningSide: 1,
      index: 0,
      score: '15-0',
      result: 'Ace',
      timestamp: 't',
    });
  });
});

describe('§ 2.2 game input', () => {
  it('a game abandons the game in play; the next point opens a new one at 0-0', () => {
    const { state } = reduce({}, [...pts('1111 12'), game(1), ...pts('1')]);
    expect([state.sets[0].side1Score, state.sets[0].side2Score]).toEqual([1, 1]);
    expect(state.sets[0].side1GameScores).toEqual([4, 1, 1]);
    expect(state.points.at(-1)).toMatchObject({ game: 2, number: 0, score: '15-0' });
  });

  it('in a tiebreak-only set a game is the set won 1-0, its tiebreakScore checked against the race', () => {
    expect(sets('SET3-S:TB11', [game(0), game(0, [11, 9])])).toEqual([
      [1, 0],
      [1, 0, [11, 9]],
    ]);
    expect(outcomes('SET3-S:TB11', [game(0, [11, 10])])[0]).toMatchObject({ recorded: false });
    expect(outcomes('SET3-S:6/TB7', [{ type: 'game', data: { winner: 2 } }])[0]).toMatchObject({ recorded: false });
    expect(outcomes('SET3-S:6/TB7', [{ type: 'game', data: { winner: 0, tiebreakScore: [7] } }])[0]).toMatchObject({
      recorded: false,
    });
    expect(
      sets('SET3-S:6/TB7', [...Array.from({ length: 12 }, (_, i) => game((i % 2) as 0 | 1)), game(1, [5, 7])]),
    ).toEqual([[6, 7, [5, 7]]]);
  });
});

describe('§ 2.3 set totals', () => {
  it('a finished total takes the rule winner; a contradiction or a side not ahead is refused', () => {
    expect(reduce({}, [total(6, 4)]).state.sets[0].winningSide).toEqual(1);
    expect(outcomes('SET3-S:6/TB7', [total(6, 4, { winningSide: 2 })])[0]).toMatchObject({ recorded: false });
    expect(outcomes('SET3-S:6/TB7', [total(3, 1, { winningSide: 2 })])[0]).toMatchObject({ recorded: false });
    expect(outcomes('SET3-S:6/TB7', [total(2, 2, { winningSide: 1 })])[0]).toMatchObject({ recorded: false });
    expect(reduce({}, [total(4, 1, { winningSide: 1 })]).state.sets[0].winningSide).toEqual(1);
  });

  it('an unfinished total with no winner is the set in play; a total closes the set in play', () => {
    expect(reduce({}, [total(6, 5), ...pts(love('1'))]).state.sets[0]).toMatchObject({ side1Score: 7, winningSide: 1 });
    const { state } = reduce({}, [...pts('11'), total(6, 3), ...pts('2')]);
    expect(state.sets.map((set) => [set.side1Score, set.side2Score, set.winningSide])).toEqual([
      [6, 3, 1],
      [0, 0, undefined],
    ]);
  });

  it('invalid totals are refused, and a tiebreak-only total is read from its points', () => {
    for (const data of [
      { side1Score: -1, side2Score: 0 },
      { side1Score: 1.5, side2Score: 0 },
      { side1Score: 6, side2Score: 4, side1TiebreakScore: -1 },
      { side1Score: 6, side2Score: 4, winningSide: 3 },
    ])
      expect(outcomes('SET3-S:6/TB7', [{ type: 'set', data }])[0]).toMatchObject({ recorded: false });
    expect(reduce({ matchUpFormat: 'SET3-S:TB11' }, [total(11, 9)]).state.sets[0].winningSide).toEqual(1);
    expect(reduce({ matchUpFormat: 'SET3-S:TB11' }, [total(11, 10)]).state.sets[0].winningSide).toBeUndefined();
    const claimed = [total(1, 0, { side1TiebreakScore: 11, side2TiebreakScore: 10 })];
    expect(outcomes('SET3-S:TB11', claimed)[0]).toMatchObject({ recorded: false });
  });
});

describe('§ 2.5 the late-start baseline', () => {
  const baseline = (data: Record<string, unknown>): TimelineEntry => ({ type: 'setInitialScore', data });

  it('judges its sets, completes a decided match, keeps an unfinished last set in play', () => {
    const decided: any = reduce({}, [
      baseline({
        sets: [
          { side1Score: 6, side2Score: 0 },
          { side1Score: 6, side2Score: 0 },
        ],
      }),
    ]);
    expect([decided.state.matchUpStatus, decided.state.winningSide]).toEqual(['COMPLETED', 1]);
    const unfinished = reduce({}, [baseline({ sets: [{ side1Score: 6, side2Score: 5 }] }), ...pts(love('1'))]);
    expect(unfinished.state.sets[0]).toMatchObject({ side1Score: 7, winningSide: 1 });
  });

  it('the set in play and the game in play', () => {
    const { state } = reduce({}, [
      baseline({
        sets: [{ side1Score: 6, side2Score: 3 }],
        currentSetScore: { side1Score: 2, side2Score: 1 },
        currentGameScore: { side1Points: 2, side2Points: 1 },
      }),
      ...pts('11'),
    ]);
    expect(state.sets[1]).toMatchObject({ side1Score: 3, side2Score: 1, side1GameScores: [4, 0] });
    const race = reduce({ matchUpFormat: 'SET3-S:TB11' }, [
      baseline({ sets: [{ side1Score: 9, side2Score: 4 }] }),
      ...pts('11'),
    ]);
    expect(race.state.sets[0]).toMatchObject({ side1Score: 1, side1TiebreakScore: 11, side2TiebreakScore: 4 });
  });

  it('a second baseline is refused live once scoring entries exist, and flagged on replay', () => {
    const context = createContext({});
    const scored = step(context, initialState(), pts('1')[0], true).state;
    expect(step(context, scored, baseline({ sets: [] }), true).outcome).toMatchObject({ recorded: false });
    expect(step(context, scored, baseline({ sets: [] })).outcome).toEqual({ recorded: true });
  });

  it('refuses facts that disagree; a status set outside scoring is not checked', () => {
    const won = [{ side1Score: 6, side2Score: 3 }];
    for (const data of [
      { sets: won, winningSide: 2 },
      { sets: won, matchUpStatus: 'COMPLETED' },
      { sets: [...won, ...won], matchUpStatus: 'IN_PROGRESS' },
      { sets: won, server: 2 },
      { sets: [{ side1Score: 3, side2Score: 1 }, ...won] },
      {
        sets: [
          { side1Score: 6, side2Score: 4 },
          { side1Score: 3, side2Score: 1 },
        ],
        currentSetScore: { side1Score: 1, side2Score: 0 },
      },
      { sets: [...won, ...won], currentGameScore: { side1Points: 1, side2Points: 0 } },
      { sets: won, currentSetScore: { side1Score: 6, side2Score: 0 } },
      { sets: won, currentSetScore: { side1Score: -1, side2Score: 0 } },
      { sets: [{ side1Score: 'six', side2Score: 3 }] },
      { sets: [{ side1Score: 6, side2Score: 4, winningSide: 2 }] },
    ])
      expect({ data, outcome: outcomes('SET3-S:6/TB7', [baseline(data)])[0].recorded }).toEqual({
        data,
        outcome: false,
      });
    expect(outcomes('SET3-S:6/TB7', [baseline({ sets: won, matchUpStatus: 'RETIRED', winningSide: 2 })])[0]).toEqual({
      recorded: true,
    });
  });
});

describe('§ 9 completion', () => {
  it('exactly N: a lead is not a win; a level count completes without a winner', () => {
    const lead: any = reduce({ matchUpFormat: 'HAL3X-S:TB11' }, pts('1'.repeat(22)));
    expect(lead.state.matchUpStatus).toEqual('IN_PROGRESS');
    const level: any = reduce({ matchUpFormat: 'HAL2X-S:TB11' }, pts('1'.repeat(11) + '2'.repeat(11) + '1'));
    expect([level.state.matchUpStatus, level.state.winningSide, level.outcomes.at(-1).ignored]).toEqual([
      'COMPLETED',
      undefined,
      'MATCH_COMPLETED',
    ]);
  });

  it('aggregate: the total decides, a level total with no decider is complete without a winner', () => {
    const totals: any = reduce({ matchUpFormat: 'SET3A-S:TB11' }, [total(11, 9), total(11, 9), total(0, 11)]);
    expect(totals.state.winningSide).toEqual(2);
    const level: any = reduce({ matchUpFormat: 'SET3A-S:TB11' }, [
      total(11, 9),
      total(9, 11),
      total(11, 11, { winningSide: 1 }),
    ]);
    expect([level.state.matchUpStatus, level.state.winningSide]).toEqual(['IN_PROGRESS', undefined]);
  });

  it('an exactly-N aggregate decider is set N + 1, played only when the totals are level (§ 9.4)', () => {
    // every harvested format with a decider is timed (SE2b), so the rule is held here with a match rule built by
    // hand: a format code in a test would open a matrix cell no conformance case holds
    const race = { kind: 'tiebreakOnly', race: { to: 11, margin: 2 }, rally: false } as const;
    const match: MatchRule = {
      code: '-',
      mode: 'exactly',
      n: 2,
      aggregate: true,
      setsToWin: 2,
      ordinary: race,
      final: race,
    };
    const won = (setNumber: number, a: number, b: number): ScoredSet => ({
      setNumber,
      side1Score: a > b ? 1 : 0,
      side2Score: b > a ? 1 : 0,
      side1TiebreakScore: a,
      side2TiebreakScore: b,
      winningSide: a > b ? 1 : 2,
    });
    expect(decideMatch(match, [won(1, 11, 9), won(2, 9, 11)])).toEqual({ complete: false });
    expect(decideMatch(match, [won(1, 11, 9), won(2, 9, 11), won(3, 3, 11)])).toEqual({
      complete: true,
      winningSide: 2,
    });
    expect(decideMatch(match, [won(1, 11, 9), won(2, 11, 9)])).toEqual({ complete: true, winningSide: 1 });
    expect(finalGoverns(match, 3, [1, 1])).toEqual(true);
    expect(finalGoverns(match, 2, [1, 0])).toEqual(false);
  });

  it('the final-set format governs the deciding set of a best of N', () => {
    expect(sets('SET3-S:6/TB7-F:TB10', [total(6, 3), total(3, 6), ...pts('1'.repeat(10))])).toEqual([
      [6, 3],
      [3, 6],
      [1, 0, [10, 0]],
    ]);
  });
});

describe('§ 2.4, § 2.6 - 2.8, § 12.1 the other actions', () => {
  it('endSegment is refused on these segments, and ignored after completion', () => {
    expect(outcomes('SET3-S:6/TB7', [{ type: 'endSegment', data: {} }])[0]).toMatchObject({ recorded: false });
    const done = outcomes('SET1-S:TB10', [...pts('1'.repeat(10)), { type: 'endSegment', data: {} }]);
    expect(done.at(-1)).toEqual({ recorded: false, ignored: 'MATCH_COMPLETED' });
  });

  it('setServer, challenge, substitution, annotation and unknown entries change no score', () => {
    const verdicts = outcomes('SET3-S:6/TB7', [
      { type: 'setServer', data: { side: 1 } },
      { type: 'setServer', data: { side: 2 } },
      { type: 'challenge', data: { sideNumber: 2 } },
      { type: 'challenge', data: { sideNumber: 0 } },
      { type: 'substitution', data: { sideNumber: 1 } },
      { type: 'annotation', data: {} },
      { type: 'somethingNew', data: {} },
    ]);
    expect(verdicts.map((outcome) => outcome.recorded)).toEqual([true, false, true, false, true, true, true]);
  });

  it('never mutates its input', () => {
    const timeline = [...pts('1111 12'), game(1), total(6, 3), ...pts('2')];
    const frozen = structuredClone(timeline);
    const deepFreeze = (value: any): any => {
      if (value && typeof value === 'object')
        for (const inner of Object.values(Object.freeze(value))) deepFreeze(inner);
      return value;
    };
    deepFreeze(timeline);
    const first = reduce({}, timeline);
    expect(timeline).toEqual(frozen);
    const context = createContext({});
    const before = deepFreeze(structuredClone(first.state));
    step(context, before, pts('1')[0], true);
    expect(before).toEqual(first.state);
  });
});
