import { NEW_GAME, playGamePoint, playRacePoint, pointScore } from './game';

// constants and types
import type { GameInPlay, Pair, ScoredSet, Side } from '../types';
import type { StandardRule } from '../format';
import type { SegmentPoint } from './segment';

/**
 * The standard set (§ 4.2). With setTo S, margin W and a declared tiebreak at T games all:
 *
 * 1. no tiebreak: the first side to S games with a lead of W;
 * 2. a tiebreak: at T all the tiebreak game decides, T + 1 to T; otherwise S games with a lead of two (6-4, 7-5),
 *    which covers an early tiebreak (T < S: `S:4/TB5@3` is 4-2 or 4-3), a late one (T > S: an advantage set until
 *    T all) and the one-game set (`S:1/TB7`: 2-0, or 2-1 by the tiebreak).
 *
 * The same predicate judges a set played game by game and a total entered with `addSet` or a baseline (§ 2.3).
 */
export function standardSetWinner(rule: StandardRule, games: Pair): Side | undefined {
  const won = (side: Side) => {
    const mine = games[side];
    const theirs = games[1 - side];
    if (rule.tiebreak && mine === rule.tiebreak.at + 1 && theirs === rule.tiebreak.at) return true;
    const margin = rule.tiebreak ? 2 : rule.winBy;
    return mine >= rule.setTo && mine - theirs >= margin;
  };
  if (won(0)) return 0;
  if (won(1)) return 1;
  return undefined;
}

/** whether the set is in its tiebreak game: a declared tiebreak at T games all (§ 4.2, § 4.3) */
export function inTiebreak(rule: StandardRule, set: ScoredSet): boolean {
  return !!rule.tiebreak && set.side1Score === rule.tiebreak.at && set.side2Score === rule.tiebreak.at;
}

/**
 * A point in a standard set (§ 4.1, § 4.3): a point of the game in play, or of the tiebreak game at T all, which
 * is scored point by point whatever the game format. A won tiebreak is one more game for its winner plus both
 * sides' tiebreak points (`[7, 6, [7, 0]]`).
 */
export function standardPoint(
  rule: StandardRule,
  set: ScoredSet,
  game: GameInPlay | undefined,
  winner: Side,
): SegmentPoint {
  const tiebreak = rule.tiebreak && inTiebreak(rule, set) ? rule.tiebreak : undefined;
  const before = game ?? NEW_GAME;
  const played = tiebreak ? playRacePoint(tiebreak.race, before, winner) : playGamePoint(rule.game, before, winner);
  const gameScores = gameScoresAfter(set, game, played.game.score);
  const numeric = !!tiebreak || rule.game.kind === 'consecutive';
  const coordinates = { game: set.side1Score + set.side2Score, number: before.played };
  const score = pointScore(played.game.score, played.won, numeric);
  if (!played.won) return { set: { ...set, ...gameScores }, game: played.game, coordinates, score };

  const games: Pair = [set.side1Score, set.side2Score];
  games[winner] += 1;
  const setWinner = standardSetWinner(rule, games);
  const next: ScoredSet = {
    ...set,
    ...gameScores,
    side1Score: games[0],
    side2Score: games[1],
    ...(tiebreak ? { side1TiebreakScore: played.game.score[0], side2TiebreakScore: played.game.score[1] } : {}),
    ...(setWinner === undefined ? {} : { winningSide: (setWinner + 1) as 1 | 2 }),
  };
  // a game won short of the set opens the next game at 0-0 in the per-game counts (decision SE2a-D3)
  if (setWinner !== undefined) return { set: next, game: undefined, coordinates, score };
  const opened = gameScoresAfter(next, undefined, [0, 0]);
  return { set: { ...next, ...opened }, game: NEW_GAME, coordinates, score };
}

/**
 * The per-game point counts of the games played point by point, the game in play included (§ 1.2): a point
 * opening a game adds a count, a later point updates the last one.
 */
export function gameScoresAfter(
  set: ScoredSet,
  game: GameInPlay | undefined,
  score: Pair,
): Pick<ScoredSet, 'side1GameScores' | 'side2GameScores'> {
  const side1 = set.side1GameScores ?? [];
  const side2 = set.side2GameScores ?? [];
  const opening = !game;
  return {
    side1GameScores: [...(opening ? side1 : side1.slice(0, -1)), score[0]],
    side2GameScores: [...(opening ? side2 : side2.slice(0, -1)), score[1]],
  };
}

/**
 * A game given as game input (§ 2.2): one game to `winner`, a game in play point by point abandoned (its points
 * stay on the history), a `tiebreakScore` stored as the set's tiebreak points, the set then judged by § 4.2.
 */
export function standardGame(
  rule: StandardRule,
  set: ScoredSet,
  winner: Side,
  tiebreakScore?: Pair,
): { set: ScoredSet; game?: GameInPlay } {
  const games: Pair = [set.side1Score, set.side2Score];
  games[winner] += 1;
  const setWinner = standardSetWinner(rule, games);
  const next: ScoredSet = {
    ...set,
    side1Score: games[0],
    side2Score: games[1],
    ...(tiebreakScore ? { side1TiebreakScore: tiebreakScore[0], side2TiebreakScore: tiebreakScore[1] } : {}),
    ...(setWinner === undefined ? {} : { winningSide: (setWinner + 1) as 1 | 2 }),
  };
  // a set already counting games point by point opens the next game at 0-0, as a game won by a point does (SE2a-D3)
  if (setWinner !== undefined || !set.side1GameScores) return { set: next };
  return { set: { ...next, ...gameScoresAfter(next, undefined, [0, 0]) }, game: NEW_GAME };
}
