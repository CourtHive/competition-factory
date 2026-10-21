import { NEW_GAME, playRacePoint, pointScore, wonRace } from './game';
import { gameScoresAfter } from './standard';

// constants and types
import type { GameInPlay, Pair, ScoredSet, Side } from '../types';
import type { TiebreakOnlyRule } from '../format';
import type { SegmentPoint } from './segment';

/**
 * The tiebreak-only set (§ 5): one game, a race to n with the tiebreak margin of § 4.3.
 *
 * 1. in play it records no game won (`[0, 0]`); its running points are the game in play;
 * 2. won, it records a game won 1-0 and its points as tiebreak points: 11-9 is `[1, 0, [11, 9]]`;
 * 3. every point given counts (no side-out), and `@RALLY` changes service only;
 * 5. a point adds its value: its `scoreValue`, or its multiplier's value, or 1.
 */
export function tiebreakOnlyPoint(
  rule: TiebreakOnlyRule,
  set: ScoredSet,
  game: GameInPlay | undefined,
  winner: Side,
  value: number,
): SegmentPoint {
  const before = game ?? NEW_GAME;
  const played = playRacePoint(rule.race, before, winner, value);
  const gameScores = gameScoresAfter(set, game, played.game.score);
  const coordinates = { game: 0, number: before.pointsPlayed };
  const score = pointScore(played.game.score, played.won, true);
  if (!played.won) return { set: { ...set, ...gameScores }, game: played.game, coordinates, score };
  return { set: wonSet(set, winner, played.game.score, gameScores), game: undefined, coordinates, score };
}

function wonSet(set: ScoredSet, winner: Side, points: Pair | undefined, extra: Partial<ScoredSet> = {}): ScoredSet {
  return {
    ...set,
    ...extra,
    side1Score: winner === 0 ? 1 : 0,
    side2Score: winner === 1 ? 1 : 0,
    ...(points ? { side1TiebreakScore: points[0], side2TiebreakScore: points[1] } : {}),
    winningSide: (winner + 1) as 1 | 2,
  };
}

/**
 * A game given as game input is the segment won 1-0, `tiebreakScore` its points (§ 2.2, § 5). A `tiebreakScore`
 * that does not win the race to n for `winner` is refused (11-10 in a race to 11).
 */
export function tiebreakOnlyGame(
  rule: TiebreakOnlyRule,
  set: ScoredSet,
  winner: Side,
  tiebreakScore?: Pair,
): { set: ScoredSet; game?: GameInPlay } | { refused: string } {
  if (tiebreakScore && !wonRace(rule.race, tiebreakScore, winner))
    return { refused: `tiebreakScore ${tiebreakScore.join('-')} does not win the race to ${rule.race.to}` };
  return { set: wonSet(set, winner, tiebreakScore) };
}
