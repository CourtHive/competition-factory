import { openSet, pointsAreUnits, segmentGame, segmentPoint, segmentTotalWinner } from './segments/segment';
import { configuredFormat, resolveFormat, ruleForSet } from './format';
import { decideMatch, isClosed, setsWon } from './decide';
import {
  readChallenge,
  readGame,
  readPoint,
  readServer,
  readSetTotal,
  pointFacts,
  refusal,
  NEEDS_A_FORMAT,
  END_SEGMENT,
  SET_INITIAL_SCORE,
  SUBSTITUTION,
  ANNOTATION,
  CHALLENGE,
  SET_SERVER,
  POINT,
  GAME,
  SET,
  type SetTotal,
} from './actions';

// constants and types
import type { PointMultiplier } from '@Types/competitionFormat';
import type { MatchRule, SegmentRule } from './format';
import type {
  EntryData,
  GameInPlay,
  IgnoredCode,
  Pair,
  Refusal,
  ScoredSet,
  ScoringConfiguration,
  ScoringState,
  Side,
  StepOutcome,
  TimelineEntry,
} from './types';

/**
 * ScoringEngine v2 (SE2a): the pure reducer `state = reduce(configuration, timeline)` (plan § 2, spec § 12.1).
 *
 * No hidden state, and it never mutates its input: every step returns a new state and leaves the one it was given
 * as it was. One producer per rule: format resolution in `format.ts`, each segment kind's rules in `segments/`,
 * completion in `decide.ts`, the facts of each action in `actions.ts`.
 *
 * SE2a scores standard and tiebreak-only segments; timed, combined and outs segments, service and the views are
 * SE2b's, and the engine shell (undo/redo, persistence, events) is SE2c's.
 */

export type ReducerContext = { match?: MatchRule; multipliers: PointMultiplier[] };

export function createContext(config: ScoringConfiguration): ReducerContext {
  return {
    match: resolveFormat(configuredFormat(config)),
    // the option wins over the profile's (§ 1.1)
    multipliers: config.pointMultipliers ?? config.competitionFormat?.pointMultipliers ?? [],
  };
}

export function initialState(): ScoringState {
  return { matchUpStatus: 'TO_BE_PLAYED', sets: [], points: [], scoringEntries: 0 };
}

type Step = { state: ScoringState; outcome: StepOutcome };

const RECORDED: StepOutcome = { recorded: true };
const ignored = (state: ScoringState, code: IgnoredCode): Step => ({
  state,
  outcome: { recorded: false, ignored: code },
});
const refused = (state: ScoringState, reason: Refusal): Step => ({
  state,
  outcome: { recorded: false, refused: reason },
});

/** the set an input is aimed at: the open set, or the next one (§ 2.2: a closed set opens the next) */
type Target = { set: ScoredSet; rule: SegmentRule; game?: GameInPlay; index: number };

function target(match: MatchRule, state: ScoringState): Target | undefined {
  const last = state.sets.at(-1);
  if (last && !isClosed(last)) {
    const rule = ruleForSet(match, last.setNumber, setsWon(state.sets.slice(0, -1)));
    return { set: last, rule, game: state.game, index: state.sets.length - 1 };
  }
  const setNumber = state.sets.length + 1;
  const decider = match.mode === 'exactly' && match.aggregate && match.final ? 1 : 0;
  if (setNumber > match.n + decider) return undefined;
  const rule = ruleForSet(match, setNumber, setsWon(state.sets));
  return { set: openSet(rule, setNumber), rule, index: state.sets.length };
}

/** the score after a scoring input: the sets, the game in play, and the match decided by § 9 */
function scored(match: MatchRule, state: ScoringState, at: Target, set: ScoredSet, game?: GameInPlay): ScoringState {
  const sets = [...state.sets.slice(0, at.index), set];
  const decision = decideMatch(match, sets);
  const { winningSide: _previous, game: _game, ...rest } = state;
  return {
    ...rest,
    sets,
    ...(game ? { game } : {}),
    matchUpStatus: decision.complete ? 'COMPLETED' : 'IN_PROGRESS',
    ...(decision.winningSide ? { winningSide: decision.winningSide } : {}),
    scoringEntries: state.scoringEntries + 1,
  };
}

/** a point's value where points are units (§ 5 rule 5): its `scoreValue`, or its multiplier's value, or 1 */
function pointValue(context: ReducerContext, data: EntryData | undefined): number {
  // a given scoreValue was validated by readPoint: a finite, non-negative number
  if (typeof data?.scoreValue === 'number') return data.scoreValue;
  const { result, stroke } = (data ?? {}) as { result?: string; stroke?: string };
  const multiplier = context.multipliers.find(
    ({ condition }) =>
      (result !== undefined && condition?.results?.includes(result)) ||
      (stroke !== undefined && condition?.strokes?.includes(stroke)),
  );
  return multiplier?.value ?? 1;
}

/** the input guards every scoring action shares (§ 2.1 ignored 2-3, § 9.2 rule 4, § 9.6) */
function aimed(match: MatchRule, state: ScoringState): Target | IgnoredCode {
  if (state.matchUpStatus === 'COMPLETED') return 'MATCH_COMPLETED';
  return target(match, state) ?? 'NO_SET_BEYOND_N';
}

function point(context: ReducerContext, match: MatchRule, state: ScoringState, entry: TimelineEntry): Step {
  const facts = readPoint(entry.data);
  if (facts.refused) return refused(state, facts.refused);
  if (facts.winner === undefined) return ignored(state, 'NO_WINNER');
  const at = aimed(match, state);
  if (typeof at === 'string') return ignored(state, at);
  const units = pointsAreUnits(at.rule);
  const given = entry.data?.scoreValue;
  if (!units && given !== undefined && given !== 1)
    return refused(state, refusal('a scoreValue other than 1 is refused where points build games'));

  const winner = facts.winner;
  const value = units ? pointValue(context, entry.data) : 1;
  const played = segmentPoint(at.rule, at.set, at.game, winner, value);
  const index = state.points.length;
  const materialized = {
    ...pointFacts(entry.data),
    winner,
    winningSide: (winner + 1) as 1 | 2,
    ...(entry.timestamp ? { timestamp: entry.timestamp } : {}),
    index,
    pointNumber: index + 1,
    set: at.set.setNumber - 1,
    game: played.coordinates.game,
    number: played.coordinates.number,
    score: played.score,
    ...(value === 1 ? {} : { scoreValue: value }),
  };
  const next = scored(match, state, at, played.set, played.game);
  return { state: { ...next, points: [...state.points, materialized] }, outcome: RECORDED };
}

function game(match: MatchRule, state: ScoringState, entry: TimelineEntry): Step {
  const facts = readGame(entry.data);
  if (facts.refused) return refused(state, facts.refused);
  const at = aimed(match, state);
  if (typeof at === 'string') return ignored(state, at);
  const result = segmentGame(at.rule, at.set, facts.winner as Side, facts.tiebreakScore);
  if ('refused' in result) return refused(state, refusal(result.refused));
  return { state: scored(match, state, at, result.set, result.game), outcome: RECORDED };
}

/**
 * A set total judged by its segment's rule (§ 2.3): a finished total takes the rule's winner; an explicit
 * `winningSide` that contradicts the rule, or names a side not ahead, is refused; the side ahead on an unfinished
 * total is a set-level mercy or manual end; an unfinished total with no winner is the set in play.
 */
function judgeTotal(rule: SegmentRule, total: SetTotal): { winningSide?: 1 | 2; refused?: string } {
  if (claimsAnUnwonRace(rule, total))
    return { refused: 'the tiebreak-only set given as won 1-0 is not won by its points' };
  const ruled = segmentTotalWinner(rule, total.totals, total.tiebreakPoints);
  const given = total.winningSide;
  if (ruled !== undefined) {
    if (given !== undefined && given !== ruled + 1) return { refused: 'the winningSide contradicts the set rule' };
    return { winningSide: (ruled + 1) as 1 | 2 };
  }
  if (given === undefined) return {};
  const [a, b] = total.tiebreakPoints ?? total.totals;
  const ahead = (a > b && 1) || (b > a && 2) || undefined;
  return given === ahead ? { winningSide: given } : { refused: 'the winningSide is not ahead' };
}

/** a tiebreak-only set given as a game won (1-0) is read from its points: points that do not win the race refute it */
function claimsAnUnwonRace(rule: SegmentRule, total: SetTotal): boolean {
  if (rule.kind !== 'tiebreakOnly' || !total.tiebreakPoints) return false;
  const [a, b] = total.totals;
  const claimed = (a === 1 && b === 0) || (a === 0 && b === 1);
  return claimed && segmentTotalWinner(rule, total.totals, total.tiebreakPoints) === undefined;
}

function totalSet(rule: SegmentRule, setNumber: number, total: SetTotal, winningSide?: 1 | 2): ScoredSet {
  const [side1TiebreakScore, side2TiebreakScore] = total.tiebreakPoints ?? [];
  return {
    ...openSet(rule, setNumber),
    side1Score: total.totals[0],
    side2Score: total.totals[1],
    ...(total.tiebreakPoints ? { side1TiebreakScore, side2TiebreakScore } : {}),
    ...(winningSide ? { winningSide } : {}),
  };
}

/** a total entered while a set is in play closes (or replaces) that set; one entered after a closed set is the next */
function set(match: MatchRule, state: ScoringState, entry: TimelineEntry): Step {
  const facts = readSetTotal(entry.data);
  if (facts.refused) return refused(state, facts.refused);
  const at = aimed(match, state);
  if (typeof at === 'string') return ignored(state, at);
  const total = facts.total as SetTotal;
  const judged = judgeTotal(at.rule, total);
  if (judged.refused) return refused(state, refusal(judged.refused));
  return {
    state: scored(match, state, at, totalSet(at.rule, at.set.setNumber, total, judged.winningSide)),
    outcome: RECORDED,
  };
}

type Baseline = { sets: ScoredSet[]; game?: GameInPlay };

/** the baseline's sets, each judged by the rule of its set as `addSet` judges a total (§ 2.5 rules 1, 3) */
function baselineSets(match: MatchRule, given: unknown[]): { sets?: ScoredSet[]; refused?: string } {
  const sets: ScoredSet[] = [];
  for (const [i, data] of given.entries()) {
    const facts = readSetTotal(data as EntryData | undefined);
    if (facts.refused) return { refused: facts.refused.message };
    const rule = ruleForSet(match, i + 1, setsWon(sets));
    const judged = judgeTotal(rule, facts.total as SetTotal);
    if (judged.refused) return { refused: judged.refused };
    if (!judged.winningSide && i < given.length - 1) return { refused: 'only the last baseline set can be unfinished' };
    sets.push(totalSet(rule, i + 1, facts.total as SetTotal, judged.winningSide));
  }
  return { sets };
}

const isPair = (pair: Pair) => pair.every((value) => Number.isInteger(value) && value >= 0);

/**
 * The set in play's games and the game in play's points (§ 2.5 rule 3). An unfinished last set is the set in play;
 * otherwise `currentSetScore` and `currentGameScore` open one. The set in play counts its game in play point by
 * point from the baseline on (`[0]` when no points are given; decision SE2a-D3). An unfinished tiebreak-only set
 * records no game won: its total is the race's running points, the game in play (§ 5 rule 1).
 */
type BaselineInPlay = {
  currentSetScore?: { side1Score?: number; side2Score?: number };
  currentGameScore?: { side1Points?: number; side2Points?: number };
};

function baselineInPlay(match: MatchRule, sets: ScoredSet[], data: EntryData): Baseline | { refused: string } {
  // their values are checked to be non-negative integers below, before use
  const { currentSetScore, currentGameScore } = data as BaselineInPlay;
  const last = sets.at(-1);
  const open = !!last && !isClosed(last);
  if (!open && !currentSetScore && !currentGameScore) return { sets };
  if (currentSetScore && open) return { refused: 'the last baseline set is already the set in play' };
  if (!open && decideMatch(match, sets).complete) return { refused: 'a decided baseline has no set in play' };
  const games: Pair = [currentSetScore?.side1Score ?? 0, currentSetScore?.side2Score ?? 0];
  const given: Pair | undefined = currentGameScore && [
    currentGameScore.side1Points ?? 0,
    currentGameScore.side2Points ?? 0,
  ];
  if (!isPair(games) || (given && !isPair(given)))
    return { refused: 'baseline games and points are non-negative integers' };

  const closed = open ? sets.slice(0, -1) : sets;
  const setNumber = closed.length + 1;
  const rule = ruleForSet(match, setNumber, setsWon(closed));
  const raceInPlay = open && rule.kind === 'tiebreakOnly';
  const base: ScoredSet = open && !raceInPlay ? last : openSet(rule, setNumber);
  const inPlay: ScoredSet = { ...base, side1Score: base.side1Score + games[0], side2Score: base.side2Score + games[1] };
  if (segmentTotalWinner(rule, [inPlay.side1Score, inPlay.side2Score]) !== undefined)
    return { refused: 'the set in play is already won' };
  const points: Pair = given ?? (raceInPlay ? [last.side1Score, last.side2Score] : [0, 0]);
  const withGame = { ...inPlay, side1GameScores: [points[0]], side2GameScores: [points[1]] };
  return { sets: [...closed, withGame], game: { score: points, played: points[0] + points[1] } };
}

/**
 * The late-start baseline (§ 2.5): it replaces the score, makes the matchUp `IN_PROGRESS` (or `COMPLETED` when it
 * decides the match), and is refused a second time once scoring entries exist. A `matchUpStatus` or `winningSide`
 * given beside the sets is checked against them; a status set outside scoring is not.
 */
function baseline(match: MatchRule, state: ScoringState, entry: TimelineEntry, live: boolean): Step {
  if (live && state.scoringEntries > 0)
    return refused(state, refusal('a second baseline is refused once scoring entries exist'));
  const data = entry.data ?? {};
  if (data.server !== undefined && data.server !== 0 && data.server !== 1)
    return refused(state, refusal(`Invalid server: ${String(data.server)}`));
  const built = baselineSets(match, Array.isArray(data.sets) ? data.sets : []);
  if (built.refused) return refused(state, refusal(built.refused));
  const inPlay = baselineInPlay(match, built.sets as ScoredSet[], data);
  if ('refused' in inPlay) return refused(state, refusal(inPlay.refused));
  const decision = decideMatch(match, inPlay.sets);
  const consistent = consistentBaseline(data, decision);
  if (consistent) return refused(state, refusal(consistent));
  const { winningSide: _w, game: _g, ...rest } = state;
  return {
    state: {
      ...rest,
      sets: inPlay.sets,
      ...(inPlay.game ? { game: inPlay.game } : {}),
      matchUpStatus: decision.complete ? 'COMPLETED' : 'IN_PROGRESS',
      ...(decision.winningSide ? { winningSide: decision.winningSide } : {}),
    },
    outcome: RECORDED,
  };
}

/** § 2.5 rule 6: refused only when they disagree; RETIRED, DEFAULTED and the like are not checked */
function consistentBaseline(data: EntryData, decision: { complete: boolean; winningSide?: 1 | 2 }): string | undefined {
  const status = data.matchUpStatus;
  if (status !== undefined && status !== 'COMPLETED' && status !== 'IN_PROGRESS' && status !== 'TO_BE_PLAYED')
    return undefined;
  if (data.winningSide !== undefined && data.winningSide !== decision.winningSide)
    return 'the baseline winningSide disagrees with its sets';
  if (data.matchUpStatus === 'COMPLETED' && !decision.complete)
    return 'the baseline is COMPLETED but its sets do not decide the match';
  if (data.matchUpStatus === 'IN_PROGRESS' && decision.complete)
    return 'the baseline is IN_PROGRESS but its sets decide the match';
  return undefined;
}

/** an action that changes no score: validated, then recorded (§ 2.6-2.8) */
function scoreless(state: ScoringState, reason?: Refusal): Step {
  return reason ? refused(state, reason) : { state, outcome: RECORDED };
}

/**
 * One action applied to a state. `live` is an action offered now; otherwise it is an entry being replayed, and the
 * refusals that apply only at the action boundary (§ 2.5 rule 5) are not applied.
 *
 * Never mutates `state` or `entry`.
 */
export function step(context: ReducerContext, state: ScoringState, entry: TimelineEntry, live = false): Step {
  const { match } = context;
  if (!match)
    return NEEDS_A_FORMAT.has(entry.type)
      ? refused(state, refusal('the matchUpFormat does not parse'))
      : scoreless(state);
  switch (entry.type) {
    case POINT:
      return point(context, match, state, entry);
    case GAME:
      return game(match, state, entry);
    case SET:
      return set(match, state, entry);
    case SET_INITIAL_SCORE:
      return baseline(match, state, entry, live);
    case END_SEGMENT:
      // any input after COMPLETED is ignored (§ 9.6, the API's MATCH_COMPLETED); no segment SE2a scores is timed (§ 2.4)
      if (state.matchUpStatus === 'COMPLETED') return ignored(state, 'MATCH_COMPLETED');
      return refused(state, refusal('endSegment ends timed segments only'));
    case SET_SERVER:
      return scoreless(state, readServer(entry.data));
    case CHALLENGE:
      return scoreless(state, readChallenge(entry.data));
    case SUBSTITUTION:
    case ANNOTATION:
    default:
      // an entry of a type the engine does not know is kept in place and not replayed (§ 12.1)
      return scoreless(state);
  }
}

export type Reduction = {
  state: ScoringState;
  outcomes: StepOutcome[];
  /** entries the rules now refuse or ignore: legacy shapes a stored timeline may hold (§ 12.8; replay is SE2c's) */
  legacy: number[];
};

/** `state = reduce(configuration, timeline)` (§ 12.1): a fresh score, every entry replayed in order */
export function reduce(config: ScoringConfiguration, timeline: TimelineEntry[]): Reduction {
  const context = createContext(config);
  const outcomes: StepOutcome[] = [];
  const legacy: number[] = [];
  let state = initialState();
  for (const [index, entry] of timeline.entries()) {
    const result = step(context, state, entry);
    outcomes.push(result.outcome);
    if (!result.outcome.recorded) legacy.push(index);
    state = result.state;
  }
  return { state, outcomes, legacy };
}
