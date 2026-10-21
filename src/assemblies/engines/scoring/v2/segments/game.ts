import type { GameInPlay, Pair, Side } from '../types';
import type { GameRule, RaceRule } from '../format';

/** the game in play before its first point */
export const NEW_GAME: GameInPlay = { score: [0, 0], played: 0 };

/** whether `side` has won a race (§ 4.3, § 5): `to` points with the race's margin */
export function wonRace(race: RaceRule, score: Pair, side: Side): boolean {
  const mine = score[side];
  const theirs = score[1 - side];
  return mine >= race.to && mine - theirs >= race.margin;
}

/** the side a race score names the winner of, if either */
export function raceWinner(race: RaceRule, score: Pair): Side | undefined {
  if (wonRace(race, score, 0)) return 0;
  if (wonRace(race, score, 1)) return 1;
  return undefined;
}

/**
 * Whether `side` has won a traditional game (§ 4.1 rules 1-3): four points, two clear; with a deuce cap n, deuce
 * k being k + 2 points all, the point after the n-th deuce wins (n + 3 to n + 2). No-Ad is a cap of one.
 */
function wonTraditional(deuceCap: number | undefined, score: Pair, side: Side): boolean {
  const mine = score[side];
  const theirs = score[1 - side];
  if (mine >= 4 && mine - theirs >= 2) return true;
  return deuceCap !== undefined && mine === deuceCap + 3 && theirs === deuceCap + 2;
}

/** a point to `winner` in a game built from points (§ 4.1); returns the game after it and whether it was won */
export function playGamePoint(rule: GameRule, game: GameInPlay, winner: Side): { game: GameInPlay; won: boolean } {
  const score: Pair = [...game.score];
  score[winner] += 1;
  const played = game.played + 1;
  if (rule.kind === 'consecutive') {
    const length = game.run?.side === winner ? game.run.length + 1 : 1;
    return { game: { score, played, run: { side: winner, length } }, won: length >= rule.run };
  }
  return { game: { score, played }, won: wonTraditional(rule.deuceCap, score, winner) };
}

/** a point worth `value` to `winner` in a race (§ 4.3, § 5) */
export function playRacePoint(
  race: RaceRule,
  game: GameInPlay,
  winner: Side,
  value = 1,
): { game: GameInPlay; won: boolean } {
  const score: Pair = [...game.score];
  score[winner] += value;
  return { game: { score, played: game.played + 1 }, won: wonRace(race, score, winner) };
}

const CALLS = ['0', '15', '30', '40'];

/**
 * The game score after a point (§ 11.1): `15-0`, `40-40`, `A-40` in a traditional game, numeric in a race and in
 * a consecutive-points game, `0-0` when the point completed the game.
 */
export function pointScore(score: Pair, won: boolean, numeric: boolean): string {
  if (won) return '0-0';
  if (numeric) return `${score[0]}-${score[1]}`;
  const [a, b] = score;
  if (a >= 3 && b >= 3) {
    if (a === b) return '40-40';
    return a > b ? 'A-40' : '40-A';
  }
  return `${CALLS[a]}-${CALLS[b]}`;
}
