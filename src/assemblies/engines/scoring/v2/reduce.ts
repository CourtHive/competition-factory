import { INITIAL_SERVICE, afterPoint, corrected, nextServer, serveSide, serviceCode } from './service';
import { configuredFormat, resolveFormat, ruleForSet, takesInput } from './format';
import { decideMatch, isClosed, setsWon } from './decide';
import {
  decidedInPlay,
  pointsAreUnits,
  segmentPoint,
  atTimeIn,
  segmentTotal,
  segmentGame,
  segmentEnd,
  openSet,
  type SegmentStep,
} from './segments/segment';
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
import { COMPLETED, IN_PROGRESS, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { PointMultiplier } from '@Types/competitionFormat';
import type { ServicePosition, ServiceRules } from './service';
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
 * Every segment kind is scored: standard, tiebreak-only, timed, combined total and outs (SE2a, SE2b), and every
 * point carries its service: server, S/R code and court half (`service.ts`, SE2b). The engine shell (undo/redo,
 * persistence, events) is SE2c's.
 */

export type ReducerContext = { match?: MatchRule; multipliers: PointMultiplier[]; rules: ServiceRules };

export function createContext(config: ScoringConfiguration): ReducerContext {
  return {
    match: resolveFormat(configuredFormat(config)),
    // the option wins over the profile's (§ 1.1)
    multipliers: config.pointMultipliers ?? config.competitionFormat?.pointMultipliers ?? [],
    // the competition's server rule (§ 10.7)
    rules: { winnerServes: config.competitionFormat?.serverRule === 'WINNER_SERVES' },
  };
}

export function initialState(): ScoringState {
  return { matchUpStatus: TO_BE_PLAYED, sets: [], points: [], service: INITIAL_SERVICE, scoringEntries: 0 };
}

/**
 * Where the next point would be played, for service (§ 10): the set in play, or the next one. A completed match, or
 * one past its N sets, answers for the set that would come next: the rotation continues (decision SE2b-D22).
 */
function positionOf(match: MatchRule, state: ScoringState): ServicePosition {
  const at = target(match, state);
  if (at) return { match, rule: at.rule, set: at.set, game: at.game };
  const rule = ruleForSet(match, state.sets.length + 1, setsWon(state.sets));
  return { match, rule, set: openSet(rule, state.sets.length + 1) };
}

/** the side due to serve the next point, and whether the engine derived it (§ 10.4): `getNextServer` and `isServerDerived` */
export function serverOf(context: ReducerContext, state: ScoringState): { side: Side; derived: boolean } {
  const position = context.match && positionOf(context.match, state);
  return nextServer(context.rules, state.service, state, position);
}

/** a server correction at this position on the timeline (§ 2.6, § 10.6) */
function correct(context: ReducerContext, state: ScoringState, side: Side): ScoringState {
  const position = context.match && positionOf(context.match, state);
  return { ...state, service: corrected(context.rules, state.service, state, position, side) };
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
type Target = { set: ScoredSet; rule: SegmentRule; game?: GameInPlay; index: number; atTime: boolean };

function target(match: MatchRule, state: ScoringState): Target | undefined {
  const last = state.sets.at(-1);
  if (last && !isClosed(last)) {
    const rule = ruleForSet(match, last.setNumber, setsWon(state.sets.slice(0, -1)));
    return { set: last, rule, game: state.game, index: state.sets.length - 1, atTime: atTimeIn(rule, last) };
  }
  const setNumber = state.sets.length + 1;
  const decider = match.mode === 'exactly' && match.aggregate && match.final ? 1 : 0;
  if (setNumber > match.n + decider) return undefined;
  const rule = ruleForSet(match, setNumber, setsWon(state.sets));
  return { set: openSet(rule, setNumber), rule, index: state.sets.length, atTime: false };
}

/**
 * The score after an input: the sets, the game in play, the tiebreak at time, and the match decided by § 9.
 * `scoring` counts the input toward the scoring entries a second baseline is refused after (§ 2.5).
 */
function scored(match: MatchRule, state: ScoringState, at: Target, result: SegmentStep, scoring = true): ScoringState {
  const sets = [...state.sets.slice(0, at.index), result.set];
  const decision = decideMatch(match, sets);
  const { winningSide: _previous, game: _game, ...rest } = state;
  return {
    ...rest,
    sets,
    ...(result.game ? { game: result.game } : {}),
    matchUpStatus: decision.complete ? COMPLETED : IN_PROGRESS,
    ...(decision.winningSide ? { winningSide: decision.winningSide } : {}),
    scoringEntries: state.scoringEntries + (scoring ? 1 : 0),
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
  if (state.matchUpStatus === COMPLETED) return 'MATCH_COMPLETED';
  return target(match, state) ?? 'NO_SET_BEYOND_N';
}

function point(context: ReducerContext, match: MatchRule, state: ScoringState, entry: TimelineEntry): Step {
  const facts = readPoint(entry.data);
  if (facts.refused) return refused(state, facts.refused);
  if (facts.winner === undefined) return ignored(state, 'NO_WINNER');
  const at = aimed(match, state);
  if (typeof at === 'string') return ignored(state, at);
  // § 2.1 refusal 6: a segment of outs takes no point input
  if (!takesInput(at.rule, 'point')) return refused(state, refusal('the set in play takes no point input'));
  const units = pointsAreUnits(at.rule, at.atTime);
  const given = entry.data?.scoreValue;
  if (!units && given !== undefined && given !== 1)
    return refused(state, refusal('a scoreValue other than 1 is refused where a point is not a unit'));

  const winner = facts.winner;
  const value = units ? pointValue(context, entry.data) : 1;
  const position: ServicePosition = { match, rule: at.rule, set: at.set, game: at.game };
  const derived = nextServer(context.rules, state.service, state, position);
  const server = facts.server ?? (derived.derived ? derived.side : undefined);
  const half = serveSide(state, position);
  // a combined total derives no S/R code, even from a supplied server (§ 10.4)
  const coded = entry.data?.code === undefined && at.rule.kind !== 'combined';
  const code = coded ? serviceCode(server, winner) : undefined;
  const played = segmentPoint(at.rule, at.set, at.game, winner, value, at.atTime);
  const index = state.points.length;
  const materialized = {
    ...pointFacts(entry.data),
    winner,
    winningSide: (winner + 1) as 1 | 2,
    ...(server === undefined ? {} : { server, serverSideNumber: (server + 1) as 1 | 2 }),
    ...(code ? { code } : {}),
    ...(half ? { serveSide: half } : {}),
    ...(entry.timestamp ? { timestamp: entry.timestamp } : {}),
    index,
    pointNumber: index + 1,
    set: at.set.setNumber - 1,
    game: played.coordinates.game,
    number: played.coordinates.number,
    score: played.score,
    ...(value === 1 ? {} : { scoreValue: value }),
  };
  const next = scored(match, state, at, played);
  const service = afterPoint(state.service, state, position, winner, facts.server);
  return { state: { ...next, service, points: [...state.points, materialized] }, outcome: RECORDED };
}

function game(match: MatchRule, state: ScoringState, entry: TimelineEntry): Step {
  const facts = readGame(entry.data);
  if (facts.refused) return refused(state, facts.refused);
  const at = aimed(match, state);
  if (typeof at === 'string') return ignored(state, at);
  if (!takesInput(at.rule, 'game')) return refused(state, refusal(`a ${at.rule.kind} segment takes no game input`));
  const result = segmentGame(at.rule, at.set, facts.winner as Side, facts.tiebreakScore, at.atTime);
  if ('refused' in result) return refused(state, refusal(result.refused));
  return { state: scored(match, state, at, result), outcome: RECORDED };
}

/** a total entered while a set is in play closes (or replaces) that set; one entered after a closed set is the next */
function set(match: MatchRule, state: ScoringState, entry: TimelineEntry): Step {
  const facts = readSetTotal(entry.data);
  if (facts.refused) return refused(state, facts.refused);
  const at = aimed(match, state);
  if (typeof at === 'string') return ignored(state, at);
  const result = segmentTotal(at.rule, at.set.setNumber, facts.total as SetTotal);
  if ('refused' in result) return refused(state, refusal(result.refused));
  return { state: scored(match, state, at, result), outcome: RECORDED };
}

/**
 * `endSegment` (§ 2.4, § 6.4): the timed segment in play, or the one `setNumber` names, which must be it. Ignored
 * after completion and during the tiebreak at time; refused on any other kind, a closed segment, or none in play.
 */
function endSegment(match: MatchRule, state: ScoringState, entry: TimelineEntry): Step {
  if (state.matchUpStatus === COMPLETED) return ignored(state, 'MATCH_COMPLETED');
  const last = state.sets.at(-1);
  const named = entry.data?.setNumber;
  if (!last || isClosed(last)) return refused(state, refusal('there is no timed segment in play to end'));
  if (named !== undefined && named !== last.setNumber)
    return refused(state, refusal(`segment ${String(named)} is not in play`));
  const at = target(match, state) as Target;
  const result = segmentEnd(at.rule, at.set, at.atTime);
  if ('refused' in result) return refused(state, refusal(result.refused));
  if ('ignored' in result) return ignored(state, result.ignored);
  return { state: scored(match, state, at, result, false), outcome: RECORDED };
}

type Baseline = { sets: ScoredSet[]; game?: GameInPlay; atTime?: boolean };

/** the baseline's sets, each judged by the rule of its set as `addSet` judges a total (§ 2.5 rules 1, 3) */
function baselineSets(match: MatchRule, given: unknown[]): { sets?: ScoredSet[]; atTime?: boolean; refused?: string } {
  const sets: ScoredSet[] = [];
  let atTime = false;
  for (const [i, data] of given.entries()) {
    const facts = readSetTotal(data as EntryData | undefined);
    if (facts.refused) return { refused: facts.refused.message };
    const rule = ruleForSet(match, i + 1, setsWon(sets));
    const judged = segmentTotal(rule, i + 1, facts.total as SetTotal);
    if ('refused' in judged) return { refused: judged.refused };
    const atTimeSet = atTimeIn(rule, judged.set);
    if ((atTimeSet || !isClosed(judged.set)) && i < given.length - 1)
      return { refused: 'only the last baseline set can be unfinished' };
    if (atTimeSet) atTime = true;
    sets.push(judged.set);
  }
  return { sets, atTime };
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
  if (given && combinedInPlay(match, sets, open)) return { refused: 'a combined total has no game score' };

  const closed = open ? sets.slice(0, -1) : sets;
  const setNumber = closed.length + 1;
  const rule = ruleForSet(match, setNumber, setsWon(closed));
  const raceInPlay = open && rule.kind === 'tiebreakOnly';
  const base: ScoredSet = open && !raceInPlay ? last : openSet(rule, setNumber);
  const inPlay: ScoredSet = { ...base, side1Score: base.side1Score + games[0], side2Score: base.side2Score + games[1] };
  if (decidedInPlay(rule, [inPlay.side1Score, inPlay.side2Score])) return { refused: 'the set in play is already won' };
  // a combined total counts rallies, not games: its set in play has no game in play (§ 7 rule 5)
  if (rule.kind === 'combined') return { sets: [...closed, inPlay] };
  const points: Pair = given ?? (raceInPlay ? [last.side1Score, last.side2Score] : [0, 0]);
  const withGame = { ...inPlay, side1GameScores: [points[0]], side2GameScores: [points[1]] };
  return { sets: [...closed, withGame], game: { score: points, pointsPlayed: points[0] + points[1] } };
}

/** whether the baseline's set in play is a combined total, which has no game score (§ 7 rule 5) */
function combinedInPlay(match: MatchRule, sets: ScoredSet[], open: boolean): boolean {
  const closed = open ? sets.slice(0, -1) : sets;
  return ruleForSet(match, closed.length + 1, setsWon(closed)).kind === 'combined';
}

/**
 * The late-start baseline (§ 2.5): it replaces the score, makes the matchUp `IN_PROGRESS` (or `COMPLETED` when it
 * decides the match), and is refused a second time once scoring entries exist. A `matchUpStatus` or `winningSide`
 * given beside the sets is checked against them; a status set outside scoring is not.
 */
function baseline(
  context: ReducerContext,
  match: MatchRule,
  state: ScoringState,
  entry: TimelineEntry,
  live: boolean,
): Step {
  if (live && state.scoringEntries > 0)
    return refused(state, refusal('a second baseline is refused once scoring entries exist'));
  const data = entry.data ?? {};
  if (data.server !== undefined && data.server !== 0 && data.server !== 1)
    return refused(state, refusal(`Invalid server: ${String(data.server)}`));
  const built = baselineSets(match, Array.isArray(data.sets) ? data.sets : []);
  if (built.refused) return refused(state, refusal(built.refused));
  const inPlay: Baseline | { refused: string } = built.atTime
    ? { sets: built.sets as ScoredSet[], atTime: true }
    : baselineInPlay(match, built.sets as ScoredSet[], data);
  if ('refused' in inPlay) return refused(state, refusal(inPlay.refused));
  const decision = decideMatch(match, inPlay.sets);
  const consistent = consistentBaseline(data, decision);
  if (consistent) return refused(state, refusal(consistent));
  const { winningSide: _w, game: _g, ...rest } = state;
  const replaced: ScoringState = {
    ...rest,
    sets: inPlay.sets,
    ...(inPlay.game ? { game: inPlay.game } : {}),
    matchUpStatus: decision.complete ? COMPLETED : IN_PROGRESS,
    ...(decision.winningSide ? { winningSide: decision.winningSide } : {}),
  };
  // § 2.5 rule 4: a supplied server is a server correction at the baseline's position
  const server = data.server as Side | undefined;
  return { state: server === undefined ? replaced : correct(context, replaced, server), outcome: RECORDED };
}

/** § 2.5 rule 6: refused only when they disagree; RETIRED, DEFAULTED and the like are not checked */
function consistentBaseline(data: EntryData, decision: { complete: boolean; winningSide?: 1 | 2 }): string | undefined {
  const status = data.matchUpStatus;
  if (status !== undefined && status !== COMPLETED && status !== IN_PROGRESS && status !== TO_BE_PLAYED)
    return undefined;
  if (data.winningSide !== undefined && data.winningSide !== decision.winningSide)
    return 'the baseline winningSide disagrees with its sets';
  if (data.matchUpStatus === COMPLETED && !decision.complete)
    return 'the baseline is COMPLETED but its sets do not decide the match';
  if (data.matchUpStatus === IN_PROGRESS && decision.complete)
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
  const result = apply(context, state, entry, live);
  // § 2.6: a correction made with `recordEntry: false` is recorded on the entry before it, and replayed with it
  const side = entry.serverCorrection;
  if (!result.outcome.recorded || (side !== 0 && side !== 1)) return result;
  return { ...result, state: correct(context, result.state, side) };
}

function apply(context: ReducerContext, state: ScoringState, entry: TimelineEntry, live: boolean): Step {
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
      return baseline(context, match, state, entry, live);
    case END_SEGMENT:
      return endSegment(match, state, entry);
    case SET_SERVER: {
      const reason = readServer(entry.data);
      return reason
        ? refused(state, reason)
        : { state: correct(context, state, entry.data?.side as Side), outcome: RECORDED };
    }
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
