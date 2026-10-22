import { NEW_GAME, playGamePoint, playRacePoint, pointScore } from './game';
import { gameScoresAfter } from './standard';

// constants and types
import type { GameInPlay, Pair, ScoredSet, Side } from '../types';
import type { SegmentPoint, SegmentStep } from './segment';
import type { TimedRule } from '../format';

/**
 * The timed segment (§ 6). It has no target: points and games accumulate and never close it; only `endSegment`
 * does (§ 6.1). Its points build games of the match's game format in a tennis-family timed set (§ 6.2 rule 2);
 * otherwise a point adds its value to the segment score (rules 1, 3). Level at time with a declared tiebreak, it
 * plays a race to n, and the winner takes the segment by one more unit with the tiebreak points recorded (§ 6.4).
 *
 * The tiebreak at time keeps its running points in the set's tiebreak scores from 0-0, so a set in that state says
 * so itself (decision SE2b-D19): `inTiebreakAtTime` reads it, and the reducer keeps no flag of its own.
 */

/** whether a timed set in play is playing its tiebreak at time */
export function inTiebreakAtTime(set: ScoredSet): boolean {
  return set.side1TiebreakScore !== undefined && set.winningSide === undefined && !set.segmentComplete;
}

/** level at time with a declared tiebreak: the segment stays open and the race begins at 0-0 */
function startTiebreak(set: ScoredSet): ScoredSet {
  return { ...set, side1TiebreakScore: 0, side2TiebreakScore: 0 };
}

const sideNumber = (side: Side) => (side + 1) as 1 | 2;

/** a segment closed: with the side ahead as its winner, or level with none (§ 6.4 rules 1, 3) */
function closed(set: ScoredSet, extra: Partial<ScoredSet> = {}): ScoredSet {
  const next = { ...set, ...extra };
  const [a, b] = [next.side1Score, next.side2Score];
  const winner = (a > b && 1) || (b > a && 2) || undefined;
  return { ...next, segmentComplete: true, ...(winner ? { winningSide: winner } : {}) };
}

/** the tiebreak at time won by `winner`: one more unit, and the tiebreak points kept (`[2, 1, [7, 0]]`) */
function wonAtTime(set: ScoredSet, winner: Side, points?: Pair): ScoredSet {
  const scores: Pair = [set.side1Score, set.side2Score];
  scores[winner] += 1;
  return {
    ...set,
    side1Score: scores[0],
    side2Score: scores[1],
    ...(points ? { side1TiebreakScore: points[0], side2TiebreakScore: points[1] } : {}),
    segmentComplete: true,
    winningSide: sideNumber(winner),
  };
}

export function timedPoint(
  rule: TimedRule,
  set: ScoredSet,
  game: GameInPlay | undefined,
  winner: Side,
  value: number,
  atTime: boolean,
): SegmentPoint {
  const before = game ?? NEW_GAME;
  if (atTime && rule.tiebreak) {
    const race = {
      score: [set.side1TiebreakScore ?? 0, set.side2TiebreakScore ?? 0] as Pair,
      pointsPlayed: before.pointsPlayed,
    };
    const played = playRacePoint(rule.tiebreak, race, winner);
    const score = pointScore(played.game.score, played.won, true);
    const coordinates = { game: set.side1Score + set.side2Score, number: before.pointsPlayed };
    const [side1TiebreakScore, side2TiebreakScore] = played.game.score;
    if (!played.won)
      return { set: { ...set, side1TiebreakScore, side2TiebreakScore }, game: played.game, coordinates, score };
    return { set: wonAtTime(set, winner, played.game.score), game: undefined, coordinates, score };
  }
  if (rule.buildsGames) return gamePoint(rule, set, game, winner);
  const scores: Pair = [set.side1Score, set.side2Score];
  scores[winner] += value;
  const next = { ...set, side1Score: scores[0], side2Score: scores[1] };
  const coordinates = { game: 0, number: before.pointsPlayed };
  return {
    set: next,
    game: { score: scores, pointsPlayed: before.pointsPlayed + 1 },
    coordinates,
    score: `${scores[0]}-${scores[1]}`,
  };
}

/** a point of a game in a tennis-family timed set: a won game is one more game, and the next opens at 0-0 */
function gamePoint(rule: TimedRule, set: ScoredSet, game: GameInPlay | undefined, winner: Side): SegmentPoint {
  const before = game ?? NEW_GAME;
  const played = playGamePoint(rule.game, before, winner);
  const gameScores = gameScoresAfter(set, game, played.game.score);
  const coordinates = { game: set.side1Score + set.side2Score, number: before.pointsPlayed };
  const score = pointScore(played.game.score, played.won, rule.game.kind === 'consecutive');
  if (!played.won) return { set: { ...set, ...gameScores }, game: played.game, coordinates, score };
  const games: Pair = [set.side1Score, set.side2Score];
  games[winner] += 1;
  const next = { ...set, ...gameScores, side1Score: games[0], side2Score: games[1] };
  return { set: { ...next, ...gameScoresAfter(next, undefined, [0, 0]) }, game: NEW_GAME, coordinates, score };
}

/** game input: one game, or one unit (§ 6.2); during the tiebreak at time it is the tiebreak won */
export function timedGame(
  rule: TimedRule,
  set: ScoredSet,
  winner: Side,
  tiebreakScore: Pair | undefined,
  atTime: boolean,
): SegmentStep {
  if (atTime) return { set: wonAtTime(set, winner, tiebreakScore) };
  const scores: Pair = [set.side1Score, set.side2Score];
  scores[winner] += 1;
  const next = { ...set, side1Score: scores[0], side2Score: scores[1] };
  if (!rule.buildsGames || !set.side1GameScores) return { set: next };
  return { set: { ...next, ...gameScoresAfter(next, undefined, [0, 0]) }, game: NEW_GAME };
}

/**
 * A timed total is a finished segment (§ 2.3 rule 4): the side with more wins it; level, it plays its declared
 * tiebreak (§ 6.4 rule 2), or closes with no winner.
 */
export function timedTotal(rule: TimedRule, set: ScoredSet): SegmentStep {
  if (set.side1Score === set.side2Score && rule.tiebreak && set.side1TiebreakScore === undefined)
    return { set: startTiebreak(set) };
  return { set: closed(set) };
}

/** an outs total is a finished segment too (§ 8): the side with more wins it, and a level one closes with none */
export function closedTotal(set: ScoredSet): SegmentStep {
  return { set: closed(set) };
}

/** `endSegment` on the segment in play (§ 6.4); during its tiebreak at time it is ignored */
export function timedEnd(
  rule: TimedRule,
  set: ScoredSet,
  atTime: boolean,
): SegmentStep | { ignored: 'TIEBREAK_IN_PLAY' } {
  if (atTime) return { ignored: 'TIEBREAK_IN_PLAY' };
  if (set.side1Score === set.side2Score && rule.tiebreak) return { set: startTiebreak(set) };
  return { set: closed(set) };
}
