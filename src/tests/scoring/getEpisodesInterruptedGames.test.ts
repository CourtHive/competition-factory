/**
 * getEpisodes against the engine's own score, for interleaved addPoint / addGame / addSet.
 *
 * An addGame that interrupts a game abandons the partial game and awards it to its own winner, so the last
 * tracked point of that game did not win it. getEpisodes used to infer a game's end from where the game index
 * changed, so it credited the interrupted game to that point's side, marked every final point as ending its
 * game, and flagged every game after the first as a tiebreak.
 *
 * The oracle is the engine: a point completed its game exactly when the games of its set grew as it was added.
 */

import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { describe, expect, it } from 'vitest';

type Step = ['point' | 'game', 0 | 1] | ['set', 1 | 2, number, number];

function play(format: string, steps: Step[]) {
  const engine = new ScoringEngine({ matchUpFormat: format });
  const wonGame: boolean[] = [];
  const setGames = (state: any, setIndex: number) => {
    const set = state.score?.sets?.[setIndex];
    return (set?.side1Score ?? 0) + (set?.side2Score ?? 0);
  };
  for (const step of steps) {
    if (step[0] === 'point') {
      const prior: any = engine.getState();
      engine.addPoint({ winner: step[1] });
      const state: any = engine.getState();
      const point = state.history.points.at(-1);
      wonGame.push(setGames(state, point.set) > setGames(prior, point.set));
    } else if (step[0] === 'game') {
      engine.addGame({ winner: step[1] });
    } else {
      const [, winningSide, side1Score, side2Score] = step as ['set', 1 | 2, number, number];
      engine.addSet({ winningSide, side1Score, side2Score });
    }
  }
  return { engine, wonGame, episodes: engine.getEpisodes() };
}

const points = (winner: 0 | 1, count: number): Step[] => Array.from({ length: count }, () => ['point', winner]);
const games = (winners: Array<0 | 1>): Step[] => winners.flatMap((winner) => points(winner, 4));

const cases: Array<[string, string, Step[]]> = [
  [
    'an interrupted game',
    'SET3-S:6/TB7',
    [
      ['point', 0],
      ['game', 1],
      ['point', 0],
    ],
  ],
  ['a game won on points, then an addGame', 'SET3-S:6/TB7', [...points(0, 4), ['game', 1], ['point', 1]]],
  [
    'games first, then a partial game interrupted',
    'SET3-S:6/TB7',
    [['game', 0], ['game', 1], ...points(1, 2), ['game', 0], ['point', 0]],
  ],
  ['addSet first, then points', 'SET3-S:6/TB7', [['set', 1, 6, 3], ...points(1, 5)]],
  ['a partial set closed by addSet', 'SET3-S:6/TB7', [...points(1, 2), ['set', 1, 6, 4], ['point', 0]]],
  [
    'a set finished by addGame, then points in the next set',
    'SET3-S:6/TB7',
    [...games([0, 0]), ['game', 0], ['game', 0], ['game', 0], ['game', 0], ...points(1, 5)],
  ],
  [
    'a set won on points through a tiebreak',
    'SET3-S:6/TB7',
    [...games([0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]), ...points(1, 7), ...points(0, 3)],
  ],
  [
    'a final-set match tiebreak',
    'SET3-S:6/TB7-F:TB10',
    [['set', 1, 6, 2], ['set', 2, 3, 6], ...points(0, 9), ['point', 1], ...points(0, 1)],
  ],
  [
    'repeated interruptions in one set',
    'SET3-S:6/TB7',
    [['point', 1], ['game', 0], ['point', 1], ['point', 0], ['game', 1], ...points(0, 4), ['game', 1], ['point', 1]],
  ],
  ['a game in progress at the end', 'SET3-S:6/TB7', [...games([1]), ...points(0, 2)]],
];

describe('getEpisodes on interleaved points, games and sets', () => {
  it('credits an interrupted game to no point', () => {
    const { engine, episodes } = play('SET3-S:6/TB7', [
      ['point', 0],
      ['game', 1],
      ['point', 0],
    ]);
    const set = engine.getState().score.sets[0];
    expect([set.side1Score, set.side2Score]).toEqual([0, 1]);
    expect(episodes[0].game.complete).toBe(false);
    expect(episodes[0].game.winner).toBeUndefined();
  });

  it.each(cases)('marks a game complete exactly where a point won it: %s', (_label, format, steps) => {
    const { episodes, wonGame } = play(format, steps);
    expect(episodes.map((episode) => episode.game.complete)).toEqual(wonGame);
    for (const episode of episodes) {
      if (episode.game.complete) expect(episode.game.winner).toBe(episode.point.winner);
      else expect(episode.game.winner).toBeUndefined();
    }
  });

  it('marks the set complete on the point that won it, and not on an abandoned one', () => {
    const won = play('SET3-S:6/TB7', [...games([0, 0, 0, 0, 0, 0]), ['point', 1]]);
    expect(won.episodes.map((episode) => episode.set.complete)).toEqual([
      ...Array.from({ length: 23 }, () => false),
      true,
      false,
    ]);
    expect(won.episodes[23].set.winner).toBe(0);

    const abandoned = play('SET3-S:6/TB7', [...points(1, 2), ['set', 1, 6, 4], ['point', 0]]);
    expect(abandoned.episodes.map((episode) => episode.set.complete)).toEqual([false, false, false]);
  });

  it('flags only tiebreak games as tiebreaks', () => {
    const { episodes } = play('SET3-S:6/TB7', [
      ...games([0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]),
      ...points(1, 7),
      ...points(0, 3),
    ]);
    expect(episodes.slice(0, 48).some((episode) => episode.game.isTiebreak)).toBe(false);
    expect(episodes.slice(48, 55).every((episode) => episode.game.isTiebreak)).toBe(true);
    expect(episodes.slice(55).some((episode) => episode.game.isTiebreak)).toBe(false);

    const interrupted = play('SET3-S:6/TB7', [
      ['point', 0],
      ['game', 1],
      ['point', 0],
    ]);
    expect(interrupted.episodes.map((episode) => episode.game.isTiebreak)).toEqual([false, false]);

    const matchTiebreak = play('SET3-S:6/TB7-F:TB10', [['set', 1, 6, 2], ['set', 2, 3, 6], ...points(0, 3)]);
    expect(matchTiebreak.episodes.every((episode) => episode.game.isTiebreak)).toBe(true);

    const pickleball = play('SET3-S:TB11', points(0, 3));
    expect(pickleball.episodes.every((episode) => episode.game.isTiebreak)).toBe(true);

    const advantage = play('SET1-S:6', games([0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]).concat(points(0, 1)));
    expect(advantage.episodes.at(-1)?.game.isTiebreak).toBe(false);
  });
});
