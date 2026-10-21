import { inTiebreakAtTime } from './segments/timed';
import { inTiebreak } from './segments/standard';

// constants and types
import type { GameInPlay, ScoredSet, ScoringState, Side } from './types';
import type { MatchRule, SegmentRule } from './format';

/**
 * Service (§ 10): the side due to serve the next point, derived from the score, recorded on a point as a calculated
 * snapshot unless the caller supplied one (R2, § 1.4), and corrected only when told to (`setServer`).
 */

/** what the timeline has said about service so far (§ 10.6, § 10.4, § 10.7) */
export type ServiceState = {
  /** the orientation: every format derivation is flipped (§ 10.6) */
  flip: boolean;
  /** a `setServer` has set the orientation, so a first supplied server no longer does (§ 10.6 rule 1 replaces 2) */
  oriented: boolean;
  /** under the winner-serves rules, a `setServer` names the next point's server only (§ 10.4, § 10.7) */
  next?: Side;
  /** the winner of the last point, for the winner-serves rules */
  lastWinner?: Side;
  /** the side the last `setServer` named: the placeholder where no server is derived (§ 10.4) */
  named?: Side;
};

export const INITIAL_SERVICE: ServiceState = { flip: false, oriented: false };

/** where the next point is played: the set and its rule, and the game in play there */
export type ServicePosition = { match: MatchRule; rule: SegmentRule; set: ScoredSet; game?: GameInPlay };

export type ServiceRules = { winnerServes: boolean };

/**
 * Whether the format derives a server for a point in a segment of this rule (§ 10.2, § 10.4): not in a
 * tiebreak-only format (each sport's rule is not added yet), nor in a combined total. A tennis match tiebreak, a
 * tiebreak-only final after sets of games, keeps Rule 5(b).
 */
export function derivesServer(match: MatchRule, rule: SegmentRule): boolean {
  if (rule.kind === 'combined') return false;
  if (rule.kind !== 'tiebreakOnly') return true;
  return rule.rally || (rule !== match.ordinary && match.ordinary.kind !== 'tiebreakOnly');
}

/** the units completed before the next point: every set's score, a tiebreak counting as one game (§ 10.1, § 10.3) */
function unitsCompleted(state: ScoringState, position: ServicePosition): number {
  const before = state.sets.filter((set) => set !== position.set);
  return [...before, position.set].reduce((sum, set) => sum + set.side1Score + set.side2Score, 0);
}

/** whether the next point is played in a tiebreak: a set's at T all, a match tiebreak, or a timed one at time */
function inATiebreak(position: ServicePosition): boolean {
  const { rule, set } = position;
  if (rule.kind === 'standard') return inTiebreak(rule, set);
  if (rule.kind === 'tiebreakOnly') return true;
  return rule.kind === 'timed' && !!rule.tiebreak && inTiebreakAtTime(set);
}

/**
 * The format's server for the next point before any orientation (§ 10.1 - 10.3): game by game, or unit by unit in
 * a segment scored in units, continuously across sets; in a tiebreak, Rule 5(b): the opener o is the side due to
 * serve the next game, and after k points the server is (o + ⌊(k + 1) / 2⌋) mod 2.
 */
export function baseServer(state: ScoringState, position: ServicePosition): Side {
  const units = unitsCompleted(state, position);
  if (!inATiebreak(position)) return (units % 2) as Side;
  const opener = units % 2;
  const played = position.game?.pointsPlayed ?? 0;
  return ((opener + Math.floor((played + 1) / 2)) % 2) as Side;
}

/** whether the winner-serves rule governs the next point: `@RALLY` (§ 10.4) or the competition's (§ 10.7) */
function winnerServes(rules: ServiceRules, position: ServicePosition): boolean {
  const { rule } = position;
  return rules.winnerServes || ((rule.kind === 'tiebreakOnly' || rule.kind === 'timed') && rule.rally);
}

/**
 * The side due to serve the next point, and whether the engine derived it (§ 10.4): where no server is derived the
 * answer is the placeholder, the side the last `setServer` named, else side 1.
 */
export function nextServer(
  rules: ServiceRules,
  service: ServiceState,
  state: ScoringState,
  position: ServicePosition | undefined,
): { side: Side; derived: boolean } {
  if (!position) return { side: service.named ?? 0, derived: false };
  if (winnerServes(rules, position)) {
    const side = service.next ?? service.lastWinner ?? ((service.flip ? 1 : 0) as Side);
    return { side, derived: true };
  }
  if (!derivesServer(position.match, position.rule)) return { side: service.named ?? 0, derived: false };
  const base = baseServer(state, position);
  return { side: (service.flip ? 1 - base : base) as Side, derived: true };
}

/**
 * `setServer(side)` at its position (§ 10.6 rule 1): the orientation becomes flipped exactly when `side` differs from
 * the format's derivation there; under the winner-serves rules it names the next point's server only.
 */
export function corrected(
  rules: ServiceRules,
  service: ServiceState,
  state: ScoringState,
  position: ServicePosition | undefined,
  side: Side,
): ServiceState {
  const named = { ...service, named: side, oriented: true };
  if (!position) return named;
  if (winnerServes(rules, position)) return { ...named, next: side };
  if (!derivesServer(position.match, position.rule)) return named;
  return { ...named, flip: side !== baseServer(state, position) };
}

/**
 * The service after a point (§ 10.6 rule 2, § 10.4): the first recorded point's supplied server orients every
 * derivation when no `setServer` has; the winner-serves rules remember the winner and drop a one-point correction.
 */
export function afterPoint(
  service: ServiceState,
  state: ScoringState,
  position: ServicePosition,
  winner: Side,
  supplied: Side | undefined,
): ServiceState {
  const { next: _next, ...rest } = service;
  const first = state.points.length === 0 && !service.oriented && supplied !== undefined;
  const flip =
    first && derivesServer(position.match, position.rule) ? supplied !== baseServer(state, position) : service.flip;
  return { ...rest, flip, oriented: service.oriented || first, lastWinner: winner };
}

/**
 * The aggregate total so far (§ 9.3 rule 3): a tiebreak-only segment's points, the set in play's running points
 * included; a timed segment's own score.
 */
function aggregateTotal(state: ScoringState, position: ServicePosition): number {
  const closed = state.sets.filter((set) => set !== position.set);
  const units = (set: ScoredSet) =>
    set.isTiebreakOnly
      ? (set.side1TiebreakScore ?? set.side1Score) + (set.side2TiebreakScore ?? set.side2Score)
      : set.side1Score + set.side2Score;
  const running = position.rule.kind === 'tiebreakOnly' ? (position.game?.score ?? [0, 0]) : [0, 0];
  const inPlay = position.rule.kind === 'tiebreakOnly' ? 0 : position.set.side1Score + position.set.side2Score;
  return closed.reduce((sum, set) => sum + units(set), 0) + inPlay + running[0] + running[1];
}

/**
 * The expected court half (§ 10.5), from the score before the point: `deuce` when the points played in the game (or
 * tiebreak, or tiebreak-only set) are even, `ad` when odd; in an aggregate format, the parity of the aggregate total
 * so far; none in a timed segment that is not aggregate, nor in a combined total, which is none of those.
 */
export function serveSide(state: ScoringState, position: ServicePosition): 'deuce' | 'ad' | undefined {
  const { match, rule } = position;
  if (match.aggregate) return aggregateTotal(state, position) % 2 === 0 ? 'deuce' : 'ad';
  if (rule.kind === 'timed' || rule.kind === 'combined') return undefined;
  return (position.game?.pointsPlayed ?? 0) % 2 === 0 ? 'deuce' : 'ad';
}

/** the S/R code of a point with a known server and no `code` of its own (§ 10.8) */
export function serviceCode(server: Side | undefined, winner: Side): 'S' | 'R' | undefined {
  if (server === undefined) return undefined;
  return server === winner ? 'S' : 'R';
}
