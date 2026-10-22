import { closedTotal, inTiebreakAtTime, timedEnd, timedGame, timedPoint, timedTotal } from './timed';
import { combinedClosed, combinedPoint, combinedReachable, combinedSet } from './combined';
import { standardGame, standardPoint, standardSetWinner } from './standard';
import { tiebreakOnlyGame, tiebreakOnlyPoint } from './tiebreakOnly';
import { raceWinner } from './game';

// constants and types
import type { GameInPlay, IgnoredCode, Pair, ScoredSet, Side, SideNumber } from '../types';
import type { SegmentRule } from '../format';
import type { SetTotal } from '../actions';

/** what a point did to the open set: the set and game after it, its coordinates (§ 11.1) and its game score */
export type SegmentPoint = {
  set: ScoredSet;
  game: GameInPlay | undefined;
  coordinates: { game: number; number: number };
  score: string;
};

/** what a game, a set total or a segment end did to the set it was aimed at */
export type SegmentStep = { set: ScoredSet; game?: GameInPlay };

/** whether the set in play is a timed segment playing its tiebreak at time (§ 6.4 rule 2) */
export function atTimeIn(rule: SegmentRule, set: ScoredSet): boolean {
  return rule.kind === 'timed' && !!rule.tiebreak && inTiebreakAtTime(set);
}

type Refused = { refused: string };

/** a new set of the kind its rule declares */
export function openSet(rule: SegmentRule, setNumber: number): ScoredSet {
  return {
    setNumber,
    side1Score: 0,
    side2Score: 0,
    ...(rule.kind === 'tiebreakOnly' ? { isTiebreakOnly: true } : {}),
    ...(rule.kind === 'timed' ? { isTimed: true } : {}),
  };
}

/** a point in the set in play; outs take none, and the caller refuses it before this (§ 8) */
export function segmentPoint(
  rule: SegmentRule,
  set: ScoredSet,
  game: GameInPlay | undefined,
  winner: Side,
  value: number,
  atTime = false,
): SegmentPoint {
  if (rule.kind === 'standard') return standardPoint(rule, set, game, winner);
  if (rule.kind === 'tiebreakOnly') return tiebreakOnlyPoint(rule, set, game, winner, value);
  if (rule.kind === 'timed') return timedPoint(rule, set, game, winner, value, atTime);
  if (rule.kind === 'combined') return combinedPoint(rule, set, game, winner);
  throw new Error('a segment of outs takes no point');
}

/** a game given as game input (§ 2.2); outs and combined totals take none (§ 7, § 8) */
export function segmentGame(
  rule: SegmentRule,
  set: ScoredSet,
  winner: Side,
  tiebreakScore?: Pair,
  atTime = false,
): SegmentStep | Refused {
  if (rule.kind === 'standard') return standardGame(rule, set, winner, tiebreakScore);
  if (rule.kind === 'tiebreakOnly') return tiebreakOnlyGame(rule, set, winner, tiebreakScore);
  if (rule.kind === 'timed') return timedGame(rule, set, winner, tiebreakScore, atTime);
  return { refused: `a ${rule.kind} segment takes no game` };
}

const ahead = ([a, b]: Pair): SideNumber | undefined => (a > b && 1) || (b > a && 2) || undefined;

/**
 * The side a total is won by under its segment's rule (§ 2.3): a side number, `level` for a finished total with no
 * winner (a timed segment or a combined tie), or undefined for a total the rule does not call finished.
 */
function ruledWinner(rule: SegmentRule, total: SetTotal): SideNumber | 'level' | undefined {
  const { totals, tiebreakPoints } = total;
  if (rule.kind === 'standard') {
    const won = standardSetWinner(rule, totals);
    return won === undefined ? undefined : ((won + 1) as SideNumber);
  }
  if (rule.kind === 'tiebreakOnly') {
    const won = raceWinner(rule.race, tiebreakPoints ?? totals);
    return won === undefined ? undefined : ((won + 1) as SideNumber);
  }
  if (rule.kind === 'combined' && !combinedClosed(rule, totals)) return undefined;
  if (rule.kind === 'timed' && rule.tiebreak && !ahead(totals) && !tiebreakPoints) return undefined;
  return ahead(totals) ?? 'level';
}

/** a tiebreak-only set given as a game won (1-0) is read from its points: points that do not win the race refute it */
function refutedRace(rule: SegmentRule, total: SetTotal): boolean {
  if (rule.kind !== 'tiebreakOnly' || !total.tiebreakPoints) return false;
  const [a, b] = total.totals;
  const claimed = (a === 1 && b === 0) || (a === 0 && b === 1);
  return claimed && raceWinner(rule.race, total.tiebreakPoints) === undefined;
}

/** an explicit winningSide is refused when it contradicts the rule's, or names a side not ahead (§ 2.3 rule 2) */
function givenWinner(rule: SegmentRule, total: SetTotal): { winningSide?: SideNumber; refused?: string } {
  const ruled = ruledWinner(rule, total);
  const given = total.winningSide;
  if (ruled === 'level') return given ? { refused: 'the winningSide is not ahead' } : {};
  if (ruled !== undefined)
    return given && given !== ruled ? { refused: 'the winningSide contradicts the set rule' } : { winningSide: ruled };
  if (given === undefined) return {};
  const lead = ahead(total.tiebreakPoints ?? total.totals);
  return given === lead ? { winningSide: given } : { refused: 'the winningSide is not ahead' };
}

/**
 * A set total judged by its segment's rule (§ 2.3), as the set numbered `setNumber`: a finished total takes the
 * rule's winner, a timed total is a finished segment (§ 2.3 rule 4), a combined total is validated (§ 7), and an
 * unfinished total with no winner is the set in play.
 */
export function segmentTotal(rule: SegmentRule, setNumber: number, total: SetTotal): SegmentStep | Refused {
  if (refutedRace(rule, total)) return { refused: 'the tiebreak-only set given as won 1-0 is not won by its points' };
  if (rule.kind === 'combined' && !combinedReachable(rule, total.totals))
    return { refused: 'no play reaches that combined total' };
  const judged = givenWinner(rule, total);
  if (judged.refused) return { refused: judged.refused };
  const [side1TiebreakScore, side2TiebreakScore] = total.tiebreakPoints ?? [];
  const set: ScoredSet = {
    ...openSet(rule, setNumber),
    side1Score: total.totals[0],
    side2Score: total.totals[1],
    ...(total.tiebreakPoints ? { side1TiebreakScore, side2TiebreakScore } : {}),
  };
  if (rule.kind === 'timed') return timedTotal(rule, set);
  if (rule.kind === 'outs') return closedTotal(set);
  if (rule.kind === 'combined') return { set: combinedSet(rule, set) };
  return { set: judged.winningSide ? { ...set, winningSide: judged.winningSide } : set };
}

/** whether a set in play, given as a baseline's games, is already decided by its rule (§ 2.5) */
export function decidedInPlay(rule: SegmentRule, totals: Pair): boolean {
  if (rule.kind === 'standard') return standardSetWinner(rule, totals) !== undefined;
  if (rule.kind === 'tiebreakOnly') return raceWinner(rule.race, totals) !== undefined;
  if (rule.kind === 'combined') return combinedClosed(rule, totals);
  return false;
}

/** `endSegment` (§ 2.4): timed segments only */
export function segmentEnd(
  rule: SegmentRule,
  set: ScoredSet,
  atTime: boolean,
): SegmentStep | Refused | { ignored: IgnoredCode } {
  if (rule.kind !== 'timed') return { refused: 'endSegment ends timed segments only' };
  return timedEnd(rule, set, atTime);
}

/** whether a point's value counts: only in a segment scored in units (§ 4.4, § 5 rule 5, § 6.2) */
export function pointsAreUnits(rule: SegmentRule, atTime = false): boolean {
  if (rule.kind === 'tiebreakOnly') return true;
  return rule.kind === 'timed' && !rule.buildsGames && !atTime;
}
