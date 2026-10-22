import { decideMatch, isClosed } from './decide';
import { step } from './reduce';

// constants and types
import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import type { ScoredPoint, ScoredSet, ScoringState, SideNumber, StepOutcome, TimelineEntry } from './types';
import type { ReducerContext } from './reduce';
import type { MatchRule } from './format';

/**
 * ScoringEngine v2 (SE2c): legacy shapes (§ 12.8). A refusal or an ignore the spec adds applies when an action is
 * offered, never on replay: a stored timeline holding an entry v1 accepted replays it as v1 replayed it, flagged,
 * so a stored score never changes on load. The reducer never produces such an entry live; its presence on the
 * timeline proves v1 wrote it, so no version flag is needed.
 *
 * The shapes, each replayed as the stored records and the § 12.8 cases show v1 replayed it:
 * - input past a completed match or past N: v1 played on, with no set limit (`MatchRule.pastClose`);
 * - a point with a value where a point is not a unit: one point;
 * - a game naming a winner other than 0 or 1: side 2's, as v1 read any winner but 0;
 * - a set total whose explicit winner the rule contradicts: the winner v1 recorded;
 * - an endSegment on a set that is not timed: the set closed for the side ahead, or level.
 */

export const SCORING_PAST_LEVEL_CLOSE = 'scoringPastLevelClose';
export const LEGACY_REFUSED_INPUT = 'refusedInput';
export const LEGACY_IGNORED_INPUT = 'ignoredInput';

export type LegacyReplay = { state: ScoringState; context: ReducerContext; shape: string };

const SCORING_PAST: ReadonlySet<string> = new Set(['MATCH_COMPLETED', 'NO_SET_BEYOND_N']);

/** the match as v1 left it after one of its own decisions: the sets, and the match judged again */
function decided(match: MatchRule, state: ScoringState, sets: ScoredSet[]): ScoringState {
  const decision = decideMatch(match, sets);
  const { winningSide: _w, game: _g, ...rest } = state;
  return {
    ...rest,
    sets,
    matchUpStatus: decision.complete ? COMPLETED : IN_PROGRESS,
    ...(decision.winningSide ? { winningSide: decision.winningSide } : {}),
  };
}

/** input v1 accepted past a close: the match reopened and played on, no set limit, from here on (§ 12.8) */
function playedOn(context: ReducerContext, state: ScoringState, entry: TimelineEntry): LegacyReplay | undefined {
  const match = context.match as MatchRule;
  const levelClose = state.matchUpStatus === COMPLETED && !state.winningSide;
  const onward: ReducerContext = { ...context, match: { ...match, pastClose: true } };
  const { winningSide: _w, ...open } = state;
  const result = step(onward, { ...open, matchUpStatus: IN_PROGRESS }, entry);
  if (!result.outcome.recorded) return undefined;
  const shape = levelClose ? SCORING_PAST_LEVEL_CLOSE : LEGACY_IGNORED_INPUT;
  return { state: result.state, context: onward, shape };
}

const withData = (entry: TimelineEntry, data: Record<string, unknown>): TimelineEntry => ({ ...entry, data });

/** an entry v1 accepted with facts the spec now refuses, replayed as v1 read them (§ 12.8) */
function refusedFacts(context: ReducerContext, state: ScoringState, entry: TimelineEntry): ScoringState | undefined {
  const data = entry.data ?? {};
  const match = context.match as MatchRule;
  const replayed = (retry: TimelineEntry) => {
    const result = step(context, state, retry);
    return result.outcome.recorded ? result.state : undefined;
  };
  if (entry.type === 'point' && data.scoreValue !== undefined) {
    const { scoreValue, ...one } = data;
    const played = replayed(withData(entry, one));
    if (!played) return undefined;
    // one point, which still carries the value it recorded
    const points = [...played.points];
    points[points.length - 1] = { ...(points.at(-1) as ScoredPoint), scoreValue: scoreValue as number };
    return { ...played, points };
  }
  if (entry.type === 'game' && data.winner !== 0 && data.winner !== 1 && data.winner !== undefined)
    return replayed(withData(entry, { ...data, winner: 1 }));
  if (entry.type === 'set' && (data.winningSide === 1 || data.winningSide === 2)) {
    const { winningSide, ...total } = data;
    const judged = replayed(withData(entry, total));
    if (!judged) return undefined;
    const sets = [...judged.sets];
    sets[sets.length - 1] = { ...(sets.at(-1) as ScoredSet), winningSide: winningSide as SideNumber };
    return decided(match, judged, sets);
  }
  if (entry.type === 'endSegment') return closedAsV1Did(match, state);
  return undefined;
}

/** v1 closed the set in play on any endSegment: for the side ahead, or level with no winner */
function closedAsV1Did(match: MatchRule, state: ScoringState): ScoringState | undefined {
  const last = state.sets.at(-1);
  if (!last || isClosed(last)) return undefined;
  const level = last.side1Score === last.side2Score;
  const ahead: SideNumber = last.side1Score > last.side2Score ? 1 : 2;
  const closed: ScoredSet = { ...last, segmentComplete: true, ...(level ? {} : { winningSide: ahead }) };
  return decided(match, state, [...state.sets.slice(0, -1), closed]);
}

/**
 * The replay of an entry the rules now refuse or ignore: v1's, and the shape it is flagged as; or nothing, when v1
 * would have refused it too (kept in place, not replayed).
 */
export function replayLegacy(
  context: ReducerContext,
  state: ScoringState,
  entry: TimelineEntry,
  outcome: StepOutcome,
): LegacyReplay | undefined {
  if (!context.match || outcome.recorded) return undefined;
  if ('ignored' in outcome) return SCORING_PAST.has(outcome.ignored) ? playedOn(context, state, entry) : undefined;
  const replayed = refusedFacts(context, state, entry);
  return replayed ? { state: replayed, context, shape: LEGACY_REFUSED_INPUT } : undefined;
}
